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
        <div class="text-h6 text-dark">Module Configuration</div>
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
                <div class="text-subtitle1 text-weight-bold text-dark">{{ mod.name }}</div>
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
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, reactive, watch } from 'vue'
import PageHeader from 'components/common/PageHeader.vue'
import { useQuasar } from 'quasar'
import { useModulesStore } from 'src/stores/modules'
import { useAuthStore } from 'src/stores/auth'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()
const modulesStore = useModulesStore()
const authStore = useAuthStore()

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
        } else if (key === 'vatRate') {
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

function onLogoSelected(file) {
  if (!file) {
    settings.logoBase64 = ''
    return
  }
  const reader = new FileReader()
  reader.onload = (e) => {
    settings.logoBase64 = e.target.result
  }
  reader.readAsDataURL(file)
}

// Load modules and settings on mount
onMounted(async () => {
  if (!modulesStore.loaded) {
    await modulesStore.fetchModules(companyId.value)
  }
  await loadSettings()
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
