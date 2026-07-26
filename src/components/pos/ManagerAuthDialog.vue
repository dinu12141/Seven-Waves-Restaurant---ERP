<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide" persistent>
    <q-card class="manager-auth-dialog">
      <q-card-section class="row items-center dialog-header">
        <q-icon name="admin_panel_settings" size="28px" color="warning" class="q-mr-sm" />
        <div class="text-h6 text-weight-bolder text-white">Manager Authorization</div>
        <q-space />
        <q-btn icon="close" flat round dense @click="onDialogCancel" color="grey-4" />
      </q-card-section>

      <q-card-section class="q-pt-md dialog-body">
        <div class="text-subtitle2 text-grey-4 q-mb-lg text-center" style="font-size: 14px;">
          Authorize this <strong>{{ actionName }}</strong> action
        </div>

        <q-form @submit.prevent="verifyManager" class="q-gutter-y-md">
          <q-input
            v-model="username"
            label="Email or Manager Code"
            type="text"
            outlined
            dark
            autofocus
            class="auth-input"
            color="warning"
            :rules="[val => !!val || 'Email or Code is required']"
          >
            <template v-slot:prepend>
              <q-icon name="badge" color="warning" />
            </template>
          </q-input>

          <q-input
            v-model="password"
            label="Password"
            type="password"
            outlined
            dark
            class="auth-input"
            color="warning"
            :rules="[val => !!val || 'Password is required']"
          >
            <template v-slot:prepend>
              <q-icon name="lock" color="warning" />
            </template>
          </q-input>

          <div class="row justify-end q-mt-xl q-gutter-sm">
            <q-btn label="Cancel" color="grey-8" flat @click="onDialogCancel" style="border-radius: 8px; padding: 8px 16px;" />
            <q-btn 
              label="Authorize" 
              color="warning" 
              text-color="dark" 
              type="submit" 
              unelevated 
              class="text-weight-bold"
              style="border-radius: 8px; padding: 8px 24px;"
              :loading="loading" 
            />
          </div>
        </q-form>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { useDialogPluginComponent, useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'

const props = defineProps({
  actionName: {
    type: String,
    required: true,
    default: 'Action'
  },
  // Optional privileged callback. When supplied, it runs WHILE the manager is
  // signed in (after the role check, before the cashier session is restored) so
  // any RPC it calls sees auth.uid() === the verified manager. Receives
  // { managerId, cashierId }; its resolved value is returned via onDialogOK as
  // `actionResult`. A throw aborts the dialog but the cashier session is still
  // restored (see the finally-block in verifyManager). [#97 / #76]
  elevatedAction: {
    type: Function,
    default: null
  }
})

const $q = useQuasar()
defineEmits([...useDialogPluginComponent.emits])
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent()

const username = ref('')
const password = ref('')
const loading = ref(false)

async function verifyManager() {
  loading.value = true

  // Session captured BEFORE elevation so we can (a) identify the initiating
  // cashier server-side and (b) always restore their session afterwards.
  let originalSession = null
  let elevated = false

  // Restore the cashier session. Idempotent (guarded by `elevated`) so it can be
  // called on the success path AND again in finally without double-swapping.
  const restoreCashierSession = async () => {
    if (elevated && originalSession) {
      const { error: restoreErr } = await supabase.auth.setSession({
        access_token: originalSession.access_token,
        refresh_token: originalSession.refresh_token
      })
      if (restoreErr) console.warn('Failed to restore cashier session:', restoreErr)
      elevated = false
    }
  }

  try {
    // Save current cashier session to restore later + capture initiator uid.
    const { data: originalSessionRes, error: sessErr } = await supabase.auth.getSession()
    if (sessErr) throw sessErr
    originalSession = originalSessionRes?.session || null
    const cashierId = originalSession?.user?.id || null

    let loginEmail = username.value.trim()

    // If it doesn't look like an email, assume it's an employee code
    if (!loginEmail.includes('@')) {
      const { data: resolvedEmail, error: rpcErr } = await supabase.rpc('get_email_by_employee_code', { p_code: loginEmail })
      if (rpcErr || !resolvedEmail) {
        throw new Error('Invalid Manager Code')
      }
      loginEmail = resolvedEmail
    }

    // 1. Sign in as manager (this REPLACES the cashier session on the client).
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: password.value
    })

    if (authError) {
      throw new Error('Invalid Username/Code or Password')
    }
    elevated = true

    const userId = authData.user.id

    // 2. Verify Role (admin or manager)
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)

    if (rolesError) throw rolesError

    const hasManagerRole = roles?.some(r => r.role === 'manager' || r.role === 'admin')
    if (!hasManagerRole) {
      throw new Error('User does not have Manager privileges')
    }

    // 3. Run the privileged action (if any) WHILE the manager session is live,
    //    so the RPC it calls sees auth.uid() === this verified manager. If it
    //    throws, we fall through to catch — but the cashier session is still
    //    restored by the finally-block, never stranding an elevated session.
    let actionResult = null
    if (typeof props.elevatedAction === 'function') {
      actionResult = await props.elevatedAction({ managerId: userId, cashierId })
    }

    // Restore the cashier session BEFORE resolving the dialog so the caller's
    // onOk handler always runs as the cashier again.
    await restoreCashierSession()

    // Success! Pass back the manager's user ID + the action's result.
    onDialogOK({ managerId: userId, actionResult })

  } catch (err) {
    console.error('Manager Auth Error:', err)
    $q.notify({
      message: 'Authorization Failed',
      caption: err.message,
      color: 'negative',
      icon: 'error',
      position: 'top'
    })
  } finally {
    // Safety net: guarantee the cashier session is restored on every path
    // (e.g. an elevatedAction throw) so the terminal is never left as manager.
    await restoreCashierSession()
    loading.value = false
  }
}
</script>

<style scoped>
.manager-auth-dialog {
  min-width: 450px;
  border-radius: 16px;
  background: #1a1d24;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 20px 40px rgba(0,0,0,0.5);
}

.dialog-header {
  background: rgba(0,0,0,0.2);
  border-bottom: 1px solid rgba(255,255,255,0.05);
  padding: 16px 24px;
}

.dialog-body {
  padding: 24px;
}

.auth-input :deep(.q-field__control) {
  border-radius: 8px;
  background: rgba(0,0,0,0.3) !important;
}

.auth-input :deep(.q-field__label) {
  color: #9aa0a6;
}
</style>
