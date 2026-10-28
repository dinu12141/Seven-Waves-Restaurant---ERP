<template>
  <q-page class="flex flex-center q-pa-md">
    <q-card flat bordered class="reset-card">
      <q-card-section class="text-center q-pb-none">
        <q-icon name="lock_reset" size="40px" color="primary" />
        <div class="text-h6 q-mt-sm">Set a new password</div>
        <div class="text-caption text-grey-7">Seven Waves ERP</div>
      </q-card-section>

      <q-card-section v-if="checking" class="text-center q-py-xl">
        <q-spinner size="32px" color="primary" />
        <div class="text-caption text-grey-7 q-mt-sm">Verifying reset link…</div>
      </q-card-section>

      <q-card-section v-else-if="!hasRecoverySession">
        <q-banner rounded class="bg-orange-1 text-orange-10">
          <template #avatar><q-icon name="link_off" /></template>
          This reset link is invalid or has expired. Request a new one from the login page
          (open it in the same browser you requested it from).
        </q-banner>
        <div class="row justify-end q-mt-md">
          <q-btn color="primary" unelevated no-caps label="Back to login" to="/auth/login" />
        </div>
      </q-card-section>

      <q-card-section v-else-if="done">
        <q-banner rounded class="bg-green-1 text-green-10">
          <template #avatar><q-icon name="check_circle" /></template>
          Password updated. Please sign in with your new password.
        </q-banner>
        <div class="row justify-end q-mt-md">
          <q-btn color="primary" unelevated no-caps label="Go to login" to="/auth/login" />
        </div>
      </q-card-section>

      <q-card-section v-else>
        <q-form class="q-gutter-md" @submit.prevent="submit">
          <q-input
            v-model="password"
            label="New password"
            :type="showPw ? 'text' : 'password'"
            outlined
            dense
            autocomplete="new-password"
            :hint="`At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number`"
          >
            <template #append>
              <q-icon
                :name="showPw ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                :aria-label="showPw ? 'Hide password' : 'Show password'"
                @click="showPw = !showPw"
              />
            </template>
          </q-input>
          <q-input
            v-model="confirm"
            label="Confirm new password"
            :type="showPw ? 'text' : 'password'"
            outlined
            dense
            autocomplete="new-password"
          />
          <div v-if="error" class="text-negative text-caption" role="alert">{{ error }}</div>
          <div class="row justify-end">
            <q-btn type="submit" color="primary" unelevated no-caps label="Update password" :loading="saving" />
          </div>
        </q-form>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import { validateNewPassword, PASSWORD_MIN_LENGTH } from 'src/core/security/passwordPolicy'

const authStore = useAuthStore()
const checking = ref(true)
const hasRecoverySession = ref(false)
const password = ref('')
const confirm = ref('')
const showPw = ref(false)
const saving = ref(false)
const error = ref('')
const done = ref(false)
let sub = null
let timer = null

onMounted(async () => {
  // With PKCE + detectSessionInUrl the client exchanges ?code= for a session
  // on load; PASSWORD_RECOVERY fires when that completes.
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
      hasRecoverySession.value = true
      checking.value = false
    }
  })
  sub = data?.subscription
  const { data: s } = await supabase.auth.getSession()
  if (s?.session) {
    hasRecoverySession.value = true
    checking.value = false
  } else {
    timer = setTimeout(() => {
      checking.value = false
    }, 4000)
  }
})

onBeforeUnmount(() => {
  sub?.unsubscribe()
  if (timer) clearTimeout(timer)
})

async function submit() {
  error.value = validateNewPassword(password.value, confirm.value) || ''
  if (error.value) return
  saving.value = true
  try {
    const { error: err } = await supabase.auth.updateUser({ password: password.value })
    if (err) throw err
    password.value = ''
    confirm.value = ''
    done.value = true
    // Force a fresh sign-in with the new credentials (shared terminals).
    await authStore.signOut()
  } catch (e) {
    error.value = e?.message || 'Failed to update password'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.reset-card {
  width: 100%;
  max-width: 420px;
  border-radius: 12px;
}
</style>
