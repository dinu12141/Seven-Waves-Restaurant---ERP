<template>
  <q-dialog v-model="visible" persistent>
    <q-card style="min-width: 480px; max-width: 520px;" :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white'">
      <q-card-section class="row items-center q-pb-none bg-deep-purple text-white">
        <q-icon name="security" size="24px" class="q-mr-sm" />
        <div class="text-subtitle1 text-weight-bold">Set Up Two-Factor Authentication (2FA)</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section class="q-pt-md">
        <!-- Step 1: Scan QR Code -->
        <div class="text-subtitle2 text-weight-bold q-mb-xs">1. Scan QR Code</div>
        <p class="text-caption text-grey-7 q-mb-md">
          Open <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong>, or <strong>Authy</strong> on your smartphone and scan this QR code:
        </p>

        <div class="row justify-center q-my-md" v-if="enrollmentData?.qrCodeUrl">
          <div class="bg-white q-pa-sm rounded-borders shadow-2" style="border: 1px solid #e0e0e0;">
            <img :src="enrollmentData.qrCodeUrl" alt="2FA QR Code" width="180" height="180" style="display: block;" />
          </div>
        </div>
        <div class="row justify-center q-my-md" v-else-if="loading">
          <q-spinner-dots size="40px" color="deep-purple" />
        </div>

        <!-- Secret Key Manual Entry -->
        <div class="bg-grey-2 q-pa-sm rounded-borders q-mb-lg text-center" v-if="enrollmentData?.secret">
          <div class="text-caption text-grey-8">Can't scan? Enter this secret key manually:</div>
          <div class="text-weight-bolder text-subtitle2 text-deep-purple q-mt-xs select-all">
            {{ enrollmentData.secret }}
          </div>
        </div>

        <!-- Step 2: Verification Code -->
        <div class="text-subtitle2 text-weight-bold q-mb-xs">2. Enter 6-Digit Code</div>
        <p class="text-caption text-grey-7 q-mb-sm">
          Enter the 6-digit confirmation code displayed in your authenticator app:
        </p>

        <q-form @submit.prevent="verifyAndSave" class="q-gutter-md">
          <q-input
            v-model="verificationCode"
            outlined
            dense
            mask="######"
            placeholder="000000"
            input-class="text-center text-h6 text-weight-bold tracking-widest text-deep-purple"
            :dark="$q.dark.isActive"
            :rules="[(v) => (v && v.length === 6) || 'Enter 6 digits']"
            hide-bottom-space
            autofocus
          />

          <div class="row justify-end q-gutter-sm q-mt-md">
            <q-btn flat label="Cancel" color="grey-7" v-close-popup no-caps />
            <q-btn
              type="submit"
              unelevated
              color="deep-purple"
              label="Activate 2FA"
              :loading="verifying"
              :disable="verificationCode.length !== 6"
              no-caps
              icon="verified_user"
            />
          </div>
        </q-form>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { mfaService } from '../mfaService'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue', 'enrolled'])

const $q = useQuasar()
const visible = ref(props.modelValue)
const loading = ref(false)
const verifying = ref(false)
const enrollmentData = ref(null)
const verificationCode = ref('')

watch(
  () => props.modelValue,
  async (val) => {
    visible.value = val
    if (val) {
      verificationCode.value = ''
      await startEnrollment()
    }
  }
)

watch(visible, (val) => emit('update:modelValue', val))

async function startEnrollment() {
  loading.value = true
  try {
    enrollmentData.value = await mfaService.startEnrollment()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to generate 2FA credentials' })
    visible.value = false
  } finally {
    loading.value = false
  }
}

async function verifyAndSave() {
  if (!enrollmentData.value?.id) return
  verifying.value = true
  try {
    await mfaService.verifyEnrollment(enrollmentData.value.id, verificationCode.value)
    $q.notify({ type: 'positive', message: 'Two-Factor Authentication activated successfully!' })
    emit('enrolled')
    visible.value = false
  } catch {
    $q.notify({ type: 'negative', message: 'Invalid 6-digit code. Please check your app and try again.' })
  } finally {
    verifying.value = false
  }
}
</script>

<style scoped>
.tracking-widest {
  letter-spacing: 0.25em;
}
.select-all {
  user-select: all;
}
</style>
