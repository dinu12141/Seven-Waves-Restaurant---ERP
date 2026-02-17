<template>
  <q-page class="flex flex-center bg-gradient">
    <q-card class="q-pa-md shadow-2 my-card" style="width: 350px; border-radius: 12px">
      <q-card-section class="text-center">
        <div class="text-h5 text-weight-bold text-primary">Sign In</div>
        <div class="text-caption text-grey">Enter your credentials to access the ERP</div>
      </q-card-section>

      <q-card-section>
        <q-form @submit.prevent="handleLogin" class="q-gutter-md">
          <q-input
            filled
            v-model="email"
            label="Email"
            type="email"
            lazy-rules
            :rules="[(val) => (val && val.length > 0) || 'Please type your email']"
          >
            <template v-slot:prepend>
              <q-icon name="email" />
            </template>
          </q-input>

          <q-input
            filled
            v-model="password"
            label="Password"
            type="password"
            lazy-rules
            :rules="[(val) => (val && val.length > 0) || 'Please type your password']"
          >
            <template v-slot:prepend>
              <q-icon name="lock" />
            </template>
          </q-input>

          <div>
            <q-btn
              label="Login"
              type="submit"
              color="primary"
              class="full-width"
              unelevated
              :loading="loading"
            />
          </div>
        </q-form>
      </q-card-section>

      <q-card-section class="text-center q-pt-none">
        <div class="text-grey-7 text-caption">
          Forgot Password? <span class="text-primary cursor-pointer">Click here</span>
        </div>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'src/stores/auth'

const router = useRouter()
const $q = useQuasar()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const loading = ref(false)

const handleLogin = async () => {
  loading.value = true
  try {
    const { error } = await authStore.signIn(email.value, password.value)

    if (error) {
      $q.notify({
        color: 'negative',
        message: error.message || 'Login failed',
        icon: 'report_problem',
      })
    } else {
      $q.notify({
        color: 'positive',
        message: 'Logged in successfully',
        icon: 'check_circle',
      })
      const redirect = router.currentRoute.value.query.redirect || authStore.defaultLandingPage
      router.push(redirect)
    }
  } catch (err) {
    console.error(err)
    $q.notify({
      color: 'negative',
      message: 'Unexpected error occurred',
      icon: 'report_problem',
    })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.bg-gradient {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.my-card {
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.9);
}
</style>
