<template>
  <q-page class="q-pa-md max-width-page">
    <PageHeader
      title="My Profile"
      subtitle="Manage your personal information and security settings"
      show-back
      :back-route="authStore.defaultLandingPage"
    />

    <div class="row q-col-gutter-lg q-mt-md">
      <!-- Left Column: Profile Info -->
      <div class="col-12 col-md-5">
        <q-card flat bordered class="q-pa-md bg-white text-center">
          <q-avatar size="100px" color="primary" text-color="white" class="q-mb-md shadow-2">
            <span>{{ userInitials }}</span>
          </q-avatar>

          <div class="text-h5 text-weight-bold">{{ authStore.userDisplayName }}</div>
          <div class="text-subtitle1 text-grey-7 q-mb-md">{{ authStore.user?.email }}</div>

          <div class="row justify-center q-gutter-sm q-mb-lg">
            <q-chip
              v-for="role in authStore.roles"
              :key="role"
              dense
              color="indigo-1"
              text-color="indigo-8"
              class="text-weight-medium uppercase"
            >
              {{ role }}
            </q-chip>
          </div>

          <q-list bordered separator class="rounded-borders text-left">
            <q-item>
              <q-item-section avatar>
                <q-icon color="primary" name="phone" />
              </q-item-section>
              <q-item-section>
                <q-item-label caption>Phone Number</q-item-label>
                <q-item-label>{{ authStore.profile?.phone || 'Not Set' }}</q-item-label>
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section avatar>
                <q-icon color="primary" name="store" />
              </q-item-section>
              <q-item-section>
                <q-item-label caption>Home Branch</q-item-label>
                <q-item-label>{{ authStore.currentBranch?.name || 'All Branches' }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card>
      </div>

      <!-- Right Column: Settings -->
      <div class="col-12 col-md-7">
        <q-card flat bordered class="bg-white">
          <q-card-section class="bg-grey-1 border-bottom">
            <div class="text-h6 flex items-center">
              <q-icon name="lock" class="q-mr-sm text-primary" />
              Security Settings
            </div>
            <div class="text-caption text-grey-7">Update your account password.</div>
          </q-card-section>

          <q-card-section class="q-pa-lg">
            <q-form @submit="updatePassword" class="q-gutter-md">
              <q-input
                v-model="passwordForm.newPassword"
                label="New Password"
                type="password"
                outlined
                dense
                :rules="[
                  (val) => !!val || 'Password is required',
                  (val) => val.length >= 6 || 'Minimum 6 characters required',
                ]"
              />

              <q-input
                v-model="passwordForm.confirmPassword"
                label="Confirm New Password"
                type="password"
                outlined
                dense
                :rules="[
                  (val) => !!val || 'Please confirm your password',
                  (val) => val === passwordForm.newPassword || 'Passwords do not match',
                ]"
              />

              <div class="row justify-end q-mt-lg">
                <q-btn
                  label="Update Password"
                  type="submit"
                  color="primary"
                  icon="save_as"
                  unelevated
                  :loading="saving"
                />
              </div>
            </q-form>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { reactive, ref, computed } from 'vue'
import PageHeader from 'components/common/PageHeader.vue'
import { useAuthStore } from 'src/stores/auth'
import { supabase } from 'src/boot/supabase'
import { useQuasar } from 'quasar'

const authStore = useAuthStore()
const $q = useQuasar()

const saving = ref(false)
const passwordForm = reactive({
  newPassword: '',
  confirmPassword: '',
})

const userInitials = computed(() => {
  const name = authStore.userDisplayName || authStore.user?.email || 'U'
  return name
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
})

const updatePassword = async () => {
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    $q.notify({ type: 'warning', message: 'Passwords do not match' })
    return
  }

  saving.value = true
  try {
    const { error } = await supabase.auth.updateUser({
      password: passwordForm.newPassword,
    })

    if (error) throw error

    $q.notify({
      type: 'positive',
      message: 'Password updated successfully. Please use the new password for future logins.',
    })
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''

    // Slight quirk with Supabase sometimes invalidating sessions
    // Typically it maintains the session for the currently logged in device.
  } catch (err) {
    console.error('Password update error:', err)
    $q.notify({ type: 'negative', message: err.message || 'Failed to update password' })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.max-width-page {
  max-width: 1000px;
  margin: 0 auto;
}
.border-bottom {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}
.uppercase {
  text-transform: uppercase;
  font-size: 11px;
}
</style>
