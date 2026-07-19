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

defineProps({
  actionName: {
    type: String,
    required: true,
    default: 'Action'
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
  try {
    // Save current cashier session to restore later
    const { data: originalSessionRes, error: sessErr } = await supabase.auth.getSession()
    if (sessErr) throw sessErr

    let loginEmail = username.value.trim()

    // If it doesn't look like an email, assume it's an employee code
    if (!loginEmail.includes('@')) {
      const { data: resolvedEmail, error: rpcErr } = await supabase.rpc('get_email_by_employee_code', { p_code: loginEmail })
      if (rpcErr || !resolvedEmail) {
        throw new Error('Invalid Manager Code')
      }
      loginEmail = resolvedEmail
    }

    // 1. Sign in as manager
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: password.value
    })
    
    if (authError) {
      throw new Error('Invalid Username/Code or Password')
    }

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

    // Restore original cashier session
    if (originalSessionRes?.session) {
      const { error: restoreErr } = await supabase.auth.setSession({
        access_token: originalSessionRes.session.access_token,
        refresh_token: originalSessionRes.session.refresh_token
      })
      if (restoreErr) console.warn('Failed to restore cashier session:', restoreErr)
    }

    // Success! Pass back the manager's user ID
    onDialogOK({ managerId: userId })

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
