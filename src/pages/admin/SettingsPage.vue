<template>
  <q-page class="q-pa-md">
    <PageHeader
      title="System Settings"
      subtitle="Configure modules, features, and application preferences"
      show-back
      back-route="/admin"
    />

    <!-- Module Configuration Section -->
    <div class="q-mt-lg">
      <div class="row items-center q-mb-md">
        <q-icon name="extension" size="28px" color="primary" class="q-mr-sm" />
        <div class="text-h6">Module Configuration</div>
        <q-space />
        <q-badge v-if="hasUnsavedChanges" color="warning" label="Unsaved changes" class="q-mr-md" />
        <q-btn
          color="primary"
          label="Save Changes"
          icon="save"
          :loading="saving"
          :disable="!hasUnsavedChanges"
          @click="saveModules"
        />
      </div>

      <div v-if="modulesStore.loading" class="text-center q-pa-xl">
        <q-spinner-dots size="40px" color="primary" />
        <div class="text-grey-5 q-mt-sm">Loading modules...</div>
      </div>

      <div v-else class="row q-col-gutter-md">
        <div v-for="mod in localModules" :key="mod.id" class="col-12 col-sm-6 col-md-4">
          <q-card
            flat
            bordered
            class="module-card full-height"
            :class="{ 'module-enabled': mod.is_enabled, 'module-disabled': !mod.is_enabled }"
          >
            <q-card-section class="row items-start no-wrap">
              <q-avatar
                size="48px"
                :color="mod.is_enabled ? getModuleColor(mod.code) : 'grey-8'"
                text-color="white"
                :icon="mod.icon || 'settings'"
                class="q-mr-md"
              />
              <div class="col">
                <div class="text-subtitle1 text-weight-bold">{{ mod.name }}</div>
                <div class="text-caption text-grey-5 q-mt-xs">{{ mod.description }}</div>
              </div>
            </q-card-section>

            <q-separator color="grey-8" />

            <q-card-section class="row items-center justify-between">
              <q-chip
                dense
                :color="mod.is_enabled ? 'green-9' : 'red-9'"
                text-color="white"
                :icon="mod.is_enabled ? 'check_circle' : 'cancel'"
                :label="mod.is_enabled ? 'Enabled' : 'Disabled'"
                size="sm"
              />
              <q-toggle
                :model-value="mod.is_enabled"
                :color="getModuleColor(mod.code)"
                @update:model-value="(val) => toggleLocal(mod.code, val)"
              />
            </q-card-section>
          </q-card>
        </div>
      </div>
    </div>

    <!-- General Settings Section -->
    <div class="q-mt-xl">
      <div class="row items-center q-mb-md">
        <q-icon name="tune" size="28px" color="orange" class="q-mr-sm" />
        <div class="text-h6">General Settings</div>
      </div>

      <div v-if="loadingSettings" class="text-center q-pa-lg">
        <q-spinner-dots size="32px" color="primary" />
        <div class="text-grey-5 q-mt-sm">Loading settings...</div>
      </div>

      <div v-else class="row q-col-gutter-md">
        <!-- Left column: core settings -->
        <div class="col-12 col-md-6">
          <q-card flat bordered>
            <q-card-section class="q-gutter-sm">
              <q-input v-model="settings.appName" label="Application Name" outlined dense />
              <q-input v-model="settings.companyName" label="Company Name" outlined dense />
              <q-input
                v-model="settings.companyAddress"
                label="Company Address"
                type="textarea"
                outlined
                dense
                rows="3"
              />
              <q-input
                v-model="settings.taxRegNumber"
                label="Tax Registration Number"
                outlined
                dense
              />
              <q-input
                v-model="settings.vatRate"
                label="VAT Rate %"
                type="number"
                outlined
                dense
                :rules="[(v) => (v >= 0 && v <= 30) || 'Must be between 0 and 30']"
              />
              <q-input
                v-model="settings.serviceChargeRate"
                label="Service Charge Rate %"
                type="number"
                outlined
                dense
                hint="Applied to dine-in orders. E.g. enter 10 for 10%."
                :rules="[(v) => (v >= 0 && v <= 50) || 'Must be between 0 and 50']"
              />
            </q-card-section>
          </q-card>
        </div>

        <!-- Right column: display & operational -->
        <div class="col-12 col-md-6">
          <q-card flat bordered>
            <q-card-section class="q-gutter-sm">
              <q-select
                v-model="settings.timezone"
                label="Timezone"
                :options="['UTC', 'EST', 'PST', 'IST', 'Asia/Colombo']"
                outlined
                dense
              />
              <q-select
                v-model="settings.currency"
                label="Currency"
                :options="['USD', 'EUR', 'INR', 'GBP', 'LKR']"
                outlined
                dense
              />
              <q-input
                v-model="settings.receiptFooter"
                label="Receipt Footer Text"
                type="textarea"
                outlined
                dense
                rows="3"
              />
              <q-toggle
                v-model="settings.maintenanceMode"
                label="Maintenance Mode"
                color="red"
              />
            </q-card-section>
          </q-card>
        </div>

        <!-- Logo upload — full width row -->
        <div class="col-12">
          <q-card flat bordered>
            <q-card-section>
              <div class="text-subtitle2 q-mb-sm">Company Logo</div>
              <div class="row items-center q-col-gutter-md">
                <div class="col-12 col-sm-auto">
                  <q-img
                    v-if="settings.logoBase64"
                    :src="settings.logoBase64"
                    style="width: 120px; height: 80px; object-fit: contain;"
                    class="rounded-borders bg-grey-9"
                  />
                  <div
                    v-else
                    class="flex flex-center bg-grey-9 rounded-borders text-grey-5"
                    style="width: 120px; height: 80px;"
                  >
                    No logo
                  </div>
                </div>
                <div class="col">
                  <q-file
                    v-model="logoFile"
                    label="Upload Logo (PNG / JPG / SVG)"
                    outlined
                    dense
                    accept="image/*"
                    @update:model-value="onLogoSelected"
                  >
                    <template v-slot:prepend>
                      <q-icon name="attach_file" />
                    </template>
                  </q-file>
                  <div class="text-caption text-grey-5 q-mt-xs">
                    Image is stored as base64. Max recommended size: 200 KB.
                  </div>
                </div>
              </div>
            </q-card-section>

            <q-separator color="grey-8" />

            <q-card-actions class="q-pa-md">
              <q-btn
                color="primary"
                label="Save General Settings"
                icon="save"
                class="full-width"
                :loading="savingSettings"
                @click="saveGeneralSettings"
              />
            </q-card-actions>
          </q-card>
        </div>
      </div>
    </div>

    <!-- ══ NOTIFICATION GATEWAYS SECTION (WHATSAPP & EMAIL) ═════════ -->
    <div class="q-mt-xl">
      <div class="row items-center q-mb-md">
        <q-icon name="campaign" size="28px" color="positive" class="q-mr-sm" />
        <div class="text-h6">Notification Gateways (WhatsApp & Email APIs)</div>
        <q-space />
        <q-btn
          color="positive"
          label="Save Gateway Settings"
          icon="save"
          :loading="savingGateways"
          @click="saveGateways"
        />
      </div>

      <q-card flat bordered class="q-pa-none">
        <q-tabs
          v-model="gatewayTab"
          dense
          align="left"
          active-color="primary"
          indicator-color="primary"
          class="text-grey-8 bg-grey-1 border-bottom"
        >
          <q-tab name="whatsapp" icon="chat" label="WhatsApp Gateway (Meta & Twilio)" />
          <q-tab name="email" icon="email" label="Email Gateway (Resend & SMTP)" />
          <q-tab name="automation" icon="schedule" label="Automated Alert Triggers" />
        </q-tabs>

        <q-tab-panels v-model="gatewayTab" animated>
          <!-- WhatsApp Panel -->
          <q-tab-panel name="whatsapp" class="q-pa-md">
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <div class="text-subtitle2 q-mb-sm text-weight-bold">WhatsApp Provider</div>
                <q-select
                  v-model="gatewayConfig.whatsapp_provider"
                  :options="[
                    { label: 'Meta Official WhatsApp Cloud API (Free 1000/mo)', value: 'meta' },
                    { label: 'Twilio WhatsApp & SMS API', value: 'twilio' },
                    { label: 'Direct Click-to-Chat (Zero-Cost / No API Key)', value: 'direct' },
                  ]"
                  emit-value
                  map-options
                  outlined
                  dense
                  class="q-mb-md"
                />

                <div v-if="gatewayConfig.whatsapp_provider === 'meta'" class="q-gutter-sm">
                  <q-input v-model="gatewayConfig.meta_phone_number_id" label="Meta Phone Number ID" outlined dense hint="From Meta for Developers > WhatsApp > API Setup" />
                  <q-input v-model="gatewayConfig.meta_access_token" label="Meta Permanent Access Token" type="password" outlined dense />
                  <q-input v-model="gatewayConfig.meta_business_account_id" label="WhatsApp Business Account ID" outlined dense />
                </div>

                <div v-if="gatewayConfig.whatsapp_provider === 'twilio'" class="q-gutter-sm">
                  <q-input v-model="gatewayConfig.twilio_account_sid" label="Twilio Account SID" outlined dense />
                  <q-input v-model="gatewayConfig.twilio_auth_token" label="Twilio Auth Token" type="password" outlined dense />
                  <q-input v-model="gatewayConfig.twilio_from_phone" label="Twilio Sender Phone / WhatsApp Number" outlined dense hint="e.g. +14155238886" />
                </div>

                <div v-if="gatewayConfig.whatsapp_provider === 'direct'" class="text-caption text-grey-7 q-pa-sm bg-grey-2 rounded-borders">
                  <q-icon name="info" color="primary" size="18px" class="q-mr-xs" />
                  Direct Click-to-Chat generates WhatsApp Web/App URLs directly without requiring API tokens.
                </div>
              </div>

              <div class="col-12 col-md-6">
                <div class="text-subtitle2 q-mb-sm text-weight-bold">Test WhatsApp Dispatch</div>
                <q-input v-model="gatewayConfig.owner_phone_number" label="Owner / Test Mobile Number" outlined dense hint="e.g. +94771234567" class="q-mb-sm" />
                <q-input v-model="testWhatsAppText" label="Test Message Text" type="textarea" rows="3" outlined dense class="q-mb-md" />
                <q-btn
                  color="positive"
                  icon="send"
                  label="Send Test WhatsApp Message"
                  :loading="testingWhatsApp"
                  @click="runTestWhatsApp"
                />
              </div>
            </div>
          </q-tab-panel>

          <!-- Email Panel -->
          <q-tab-panel name="email" class="q-pa-md">
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <div class="text-subtitle2 q-mb-sm text-weight-bold">Email Provider</div>
                <q-select
                  v-model="gatewayConfig.email_provider"
                  :options="[
                    { label: 'Resend REST API (Recommended — Free 3000/mo)', value: 'resend' },
                    { label: 'Standard SMTP (Gmail / Outlook / Zoho)', value: 'smtp' },
                  ]"
                  emit-value
                  map-options
                  outlined
                  dense
                  class="q-mb-md"
                />

                <div v-if="gatewayConfig.email_provider === 'resend'" class="q-gutter-sm">
                  <q-input v-model="gatewayConfig.resend_api_key" label="Resend API Key" type="password" outlined dense hint="Starts with re_..." />
                  <q-input v-model="gatewayConfig.email_from_address" label="From Email Address" outlined dense hint="e.g. billing@sevenwaves.lk" />
                  <q-input v-model="gatewayConfig.email_from_name" label="From Name" outlined dense hint="e.g. Seven Waves Restaurant" />
                </div>

                <div v-if="gatewayConfig.email_provider === 'smtp'" class="q-gutter-sm">
                  <q-input v-model="gatewayConfig.smtp_host" label="SMTP Host" outlined dense hint="e.g. smtp.gmail.com" />
                  <q-input v-model.number="gatewayConfig.smtp_port" label="SMTP Port" type="number" outlined dense hint="587 for TLS, 465 for SSL" />
                  <q-input v-model="gatewayConfig.smtp_user" label="SMTP Username / Email" outlined dense />
                </div>
              </div>

              <div class="col-12 col-md-6">
                <div class="text-subtitle2 q-mb-sm text-weight-bold">Test Email Dispatch</div>
                <q-input v-model="testEmailTo" label="Recipient Email Address" outlined dense class="q-mb-sm" />
                <q-input v-model="testEmailSubject" label="Email Subject" outlined dense class="q-mb-sm" />
                <q-btn
                  color="primary"
                  icon="send"
                  label="Send Test Email"
                  :loading="testingEmail"
                  @click="runTestEmail"
                />
              </div>
            </div>
          </q-tab-panel>

          <!-- Automation Panel -->
          <q-tab-panel name="automation" class="q-pa-md">
            <div class="text-subtitle1 text-weight-bold q-mb-sm">Automated Event Triggers (ERPNext Standard)</div>
            <div class="q-gutter-sm">
              <q-toggle
                v-model="gatewayConfig.auto_midnight_sales_whatsapp"
                label="Send Daily Midnight Sales Summary to Owner via WhatsApp (00:00)"
                color="positive"
              />
              <q-separator />
              <q-toggle
                v-model="gatewayConfig.auto_low_stock_whatsapp"
                label="Send Low Stock Reorder Alerts to Store Manager"
                color="positive"
              />
              <q-separator />
              <q-toggle
                v-model="gatewayConfig.auto_reservation_whatsapp"
                label="Send Table Reservation Confirmations to Customers via WhatsApp"
                color="positive"
              />
              <q-separator />
              <q-toggle
                v-model="gatewayConfig.auto_payslip_email"
                label="Auto-Email PDF Payslips to Staff upon Monthly Payroll Run"
                color="positive"
              />
            </div>
          </q-tab-panel>
        </q-tab-panels>
      </q-card>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, reactive, watch } from 'vue'
import PageHeader from 'components/common/PageHeader.vue'
import { useQuasar } from 'quasar'
import { useModulesStore } from 'src/stores/modules'
import { useAuthStore } from 'src/stores/auth'
import { supabase } from 'src/boot/supabase'
import {
  getGatewayConfig,
  saveGatewayConfig,
  sendWhatsAppMessage,
  sendEmail,
} from 'src/services/notifications/notificationGatewayService'

const $q = useQuasar()
const modulesStore = useModulesStore()
const authStore = useAuthStore()

// --- Notification Gateway State ---
const gatewayTab = ref('whatsapp')
const savingGateways = ref(false)
const testingWhatsApp = ref(false)
const testingEmail = ref(false)
const testWhatsAppText = ref('Hello from Seven Waves ERP! Notification gateway is active.')
const testEmailTo = ref('')
const testEmailSubject = ref('Seven Waves ERP — Gateway Test Email')
const gatewayConfig = reactive({
  whatsapp_provider: 'direct',
  meta_phone_number_id: '',
  meta_access_token: '',
  meta_business_account_id: '',
  twilio_account_sid: '',
  twilio_auth_token: '',
  twilio_from_phone: '',
  owner_phone_number: '+94770000000',
  email_provider: 'resend',
  resend_api_key: '',
  email_from_address: 'notifications@sevenwaves.lk',
  email_from_name: 'Seven Waves Restaurant',
  smtp_host: 'smtp.gmail.com',
  smtp_port: 587,
  smtp_user: '',
  auto_midnight_sales_whatsapp: true,
  auto_low_stock_whatsapp: true,
  auto_reservation_whatsapp: true,
  auto_payslip_email: true,
})

// --- Module Toggles ---
const localModules = ref([])
const saving = ref(false)

const companyId = computed(
  () => authStore.currentBranch?.company_id || authStore.profile?.company_id || null,
)

// Deep copy modules for local editing
watch(
  () => modulesStore.modules,
  (mods) => {
    localModules.value = mods.map((m) => ({ ...m }))
  },
  { immediate: true, deep: true },
)

const hasUnsavedChanges = computed(() => {
  return localModules.value.some((local) => {
    const orig = modulesStore.modules.find((m) => m.id === local.id)
    return orig && orig.is_enabled !== local.is_enabled
  })
})

function toggleLocal(code, val) {
  const mod = localModules.value.find((m) => m.code === code)
  if (mod) mod.is_enabled = val
}

function getModuleColor(code) {
  const colors = {
    GRN: 'green-8',
    GIN: 'red-8',
    TRANSFER: 'blue-8',
    AUTO_DEDUCT: 'purple-8',
    NEGATIVE_STOCK: 'orange-8',
    BATCH_TRACKING: 'teal-8',
    FINANCE: 'amber-9',
    HR: 'pink-8',
  }
  return colors[code] || 'primary'
}

async function saveModules() {
  saving.value = true
  try {
    const changes = localModules.value
      .filter((local) => {
        const orig = modulesStore.modules.find((m) => m.id === local.id)
        return orig && orig.is_enabled !== local.is_enabled
      })
      .map((m) => ({ id: m.id, is_enabled: m.is_enabled }))

    if (changes.length === 0) return

    await modulesStore.batchUpdate(changes)
    $q.notify({ type: 'positive', message: `${changes.length} module(s) updated successfully` })
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to save: ' + (err.message || err) })
  } finally {
    saving.value = false
  }
}

// --- General Settings ---
const loadingSettings = ref(false)
const savingSettings = ref(false)
const logoFile = ref(null)

const settings = reactive({
  appName: 'Restaurant ERP',
  companyName: '',
  companyAddress: '',
  taxRegNumber: '',
  vatRate: 0,
  serviceChargeRate: 10,
  receiptFooter: '',
  timezone: 'Asia/Colombo',
  currency: 'LKR',
  maintenanceMode: false,
  logoBase64: '',
})

// Map between reactive keys and DB keys
const SETTING_KEYS = [
  'appName',
  'companyName',
  'companyAddress',
  'taxRegNumber',
  'vatRate',
  'serviceChargeRate',
  'receiptFooter',
  'timezone',
  'currency',
  'maintenanceMode',
  'logoBase64',
]

async function loadSettings() {
  if (!companyId.value) return
  loadingSettings.value = true
  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('key, value')
      .eq('company_id', companyId.value)

    if (error) throw error

    if (data && data.length > 0) {
      data.forEach(({ key, value }) => {
        if (key === 'maintenanceMode') {
          settings[key] = value === 'true'
        } else if (key === 'vatRate' || key === 'serviceChargeRate') {
          settings[key] = Number(value) || 0
        } else if (key in settings) {
          settings[key] = value || ''
        }
      })
    }
  } catch (err) {
    $q.notify({ type: 'warning', message: 'Could not load settings: ' + (err.message || err) })
  } finally {
    loadingSettings.value = false
  }
}

async function saveGeneralSettings() {
  if (!companyId.value) {
    $q.notify({ type: 'negative', message: 'Company not identified. Please refresh and try again.' })
    return
  }

  savingSettings.value = true
  try {
    const userId = authStore.user?.id

    const rows = SETTING_KEYS.map((key) => ({
      company_id: companyId.value,
      key,
      value: String(settings[key]),
      updated_at: new Date().toISOString(),
      updated_by: userId || null,
    }))

    const { error } = await supabase
      .from('company_settings')
      .upsert(rows, { onConflict: 'company_id,key' })

    if (error) throw error

    $q.notify({ type: 'positive', message: 'General settings saved successfully' })
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to save settings: ' + (err.message || err) })
  } finally {
    savingSettings.value = false
  }
}

async function onLogoSelected(file) {
  if (!file) {
    settings.logoBase64 = ''
    return
  }
  try {
    const bitmap = await createImageBitmap(file)
    const MAX_WIDTH = 400
    let { width, height } = bitmap
    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width)
      width = MAX_WIDTH
    }
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.80 })
    const reader = new FileReader()
    reader.onload = (e) => {
      settings.logoBase64 = e.target.result
    }
    reader.readAsDataURL(blob)
  } catch (err) {
    console.error('Logo compression failed', err)
    $q.notify({ type: 'negative', message: 'Failed to compress logo' })
  }
}

async function loadGateways() {
  const cfg = await getGatewayConfig()
  Object.assign(gatewayConfig, cfg)
}

async function saveGateways() {
  savingGateways.value = true
  try {
    const result = await saveGatewayConfig(gatewayConfig)
    if (!result.success) throw new Error(result.error)
    $q.notify({ type: 'positive', message: 'Notification gateway settings saved successfully' })
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to save gateway settings: ' + err.message })
  } finally {
    savingGateways.value = false
  }
}

async function runTestWhatsApp() {
  if (!gatewayConfig.owner_phone_number) {
    $q.notify({ type: 'warning', message: 'Please enter a test mobile number' })
    return
  }
  testingWhatsApp.value = true
  try {
    // 1. Save settings first
    await saveGatewayConfig(gatewayConfig)

    // 2. Dispatch message with active form config
    const res = await sendWhatsAppMessage(
      {
        to: gatewayConfig.owner_phone_number,
        text: testWhatsAppText.value,
      },
      gatewayConfig
    )

    if (res.success && res.messageId) {
      $q.notify({
        type: 'positive',
        icon: 'check_circle',
        message: `WhatsApp message sent via Meta API! (ID: ${res.messageId})`,
      })
    } else if (res.directUrl) {
      window.open(res.directUrl, '_blank')
      $q.notify({
        type: 'info',
        icon: 'chat',
        message: res.error
          ? `API note: ${res.error}. Opening WhatsApp Web...`
          : 'Direct WhatsApp Web opened with test message',
      })
    } else {
      throw new Error(res.error || 'Failed to send WhatsApp message')
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    testingWhatsApp.value = false
  }
}

async function runTestEmail() {
  if (!testEmailTo.value) {
    $q.notify({ type: 'warning', message: 'Please enter a recipient email address' })
    return
  }
  testingEmail.value = true
  try {
    const res = await sendEmail({
      to: testEmailTo.value,
      subject: testEmailSubject.value,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #0284c7;">🌊 Seven Waves Restaurant ERP</h2>
          <p><strong>Notification Gateway Test Successful!</strong></p>
          <p>Your transactional email gateway is configured and operating correctly.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <small style="color: #888;">Generated automatically by Seven Waves ERP.</small>
        </div>
      `,
    })

    if (res.success) {
      $q.notify({ type: 'positive', icon: 'email', message: 'Test email dispatched successfully via Resend API!' })
    } else {
      throw new Error(res.error || 'Failed to send test email')
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    testingEmail.value = false
  }
}

// Load modules and settings on mount
onMounted(async () => {
  if (!modulesStore.loaded) {
    await modulesStore.fetchModules(companyId.value)
  }
  await Promise.all([loadSettings(), loadGateways()])
})
</script>

<style scoped>
.module-card {
  background: var(--erp-bg-card, #1e1e2e);
  border-color: rgba(255, 255, 255, 0.08);
  transition: all 0.25s ease;
}
.module-card:hover {
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}
.module-enabled {
  border-left: 3px solid #4caf50;
}
.module-disabled {
  border-left: 3px solid #666;
  opacity: 0.75;
}
</style>
