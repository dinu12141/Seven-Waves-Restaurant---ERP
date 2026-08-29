<template>
  <q-page class="q-pa-md">
    <PageHeader
      title="System Backup & Disaster Recovery"
      subtitle="Full & modular database snapshots, SQL dumps, and automated disaster recovery"
      show-back
      back-route="/admin"
    />

    <!-- Header Stats Banner -->
    <div class="row q-col-gutter-md q-mb-lg q-mt-xs">
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="stat-card">
          <q-card-section class="row items-center no-wrap">
            <q-avatar size="42px" color="primary" text-color="white" icon="cloud_sync" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Cloud Sync Status</div>
              <div class="text-h6 text-weight-bold text-positive">Continuous PITR</div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="stat-card">
          <q-card-section class="row items-center no-wrap">
            <q-avatar size="42px" color="positive" text-color="white" icon="schedule" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Auto-Backup Frequency</div>
              <div class="text-h6 text-weight-bold">Daily (Midnight)</div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="stat-card">
          <q-card-section class="row items-center no-wrap">
            <q-avatar size="42px" color="info" text-color="white" icon="history" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Total Local Archives</div>
              <div class="text-h6 text-weight-bold">{{ backupHistory.length }} Snapshots</div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="stat-card">
          <q-card-section class="row items-center no-wrap">
            <q-avatar size="42px" color="warning" text-color="white" icon="security" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Database Engine</div>
              <div class="text-h6 text-weight-bold">PostgreSQL 15+</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Main Tabs -->
    <q-card flat bordered>
      <q-tabs
        v-model="activeTab"
        dense
        align="left"
        active-color="primary"
        indicator-color="primary"
        class="text-grey-7 bg-grey-1 border-bottom"
      >
        <q-tab name="create" icon="download" label="1-Click Backup Export" />
        <q-tab name="restore" icon="restore" label="Restore & Recovery" />
        <q-tab name="history" icon="history" label="Backup Audit History" />
        <q-tab name="schedules" icon="settings" label="Automated Schedules" />
      </q-tabs>

      <q-tab-panels v-model="activeTab" animated>
        <!-- ── TAB 1: CREATE BACKUP ──────────────────────────────────── -->
        <q-tab-panel name="create" class="q-pa-lg">
          <div class="text-subtitle1 text-weight-bold q-mb-md">Select Backup Scope & Format</div>

          <div class="row q-col-gutter-md q-mb-lg">
            <!-- Full Database -->
            <div class="col-12 col-md-4">
              <q-card
                flat
                bordered
                class="cursor-pointer scope-card full-height"
                :class="{ 'scope-card--active': selectedScope === 'full' }"
                @click="selectedScope = 'full'"
              >
                <q-card-section>
                  <div class="row items-center justify-between no-wrap">
                    <div class="text-subtitle2 text-weight-bold">Full Database Snapshot</div>
                    <q-icon name="all_inclusive" size="24px" color="primary" />
                  </div>
                  <div class="text-caption text-grey-5 q-mt-xs">
                    Complete dump of all operational tables, transactions, master data, and system logs.
                  </div>
                </q-card-section>
              </q-card>
            </div>

            <!-- Finance -->
            <div class="col-12 col-md-4">
              <q-card
                flat
                bordered
                class="cursor-pointer scope-card full-height"
                :class="{ 'scope-card--active': selectedScope === 'finance' }"
                @click="selectedScope = 'finance'"
              >
                <q-card-section>
                  <div class="row items-center justify-between no-wrap">
                    <div class="text-subtitle2 text-weight-bold">Financials & Ledgers</div>
                    <q-icon name="account_balance" size="24px" color="green" />
                  </div>
                  <div class="text-caption text-grey-5 q-mt-xs">
                    General Ledgers, Pay/Received Vouchers, Cashbook, AP Invoices, Customer Receivables.
                  </div>
                </q-card-section>
              </q-card>
            </div>

            <!-- POS & Kitchen -->
            <div class="col-12 col-md-4">
              <q-card
                flat
                bordered
                class="cursor-pointer scope-card full-height"
                :class="{ 'scope-card--active': selectedScope === 'pos' }"
                @click="selectedScope = 'pos'"
              >
                <q-card-section>
                  <div class="row items-center justify-between no-wrap">
                    <div class="text-subtitle2 text-weight-bold">POS & Dining Orders</div>
                    <q-icon name="point_of_sale" size="24px" color="blue" />
                  </div>
                  <div class="text-caption text-grey-5 q-mt-xs">
                    Customer orders, order items, KOT tickets, and cashier shift reconciliation records.
                  </div>
                </q-card-section>
              </q-card>
            </div>

            <!-- Inventory -->
            <div class="col-12 col-md-6">
              <q-card
                flat
                bordered
                class="cursor-pointer scope-card full-height"
                :class="{ 'scope-card--active': selectedScope === 'inventory' }"
                @click="selectedScope = 'inventory'"
              >
                <q-card-section>
                  <div class="row items-center justify-between no-wrap">
                    <div class="text-subtitle2 text-weight-bold">Inventory & Recipes</div>
                    <q-icon name="inventory_2" size="24px" color="orange" />
                  </div>
                  <div class="text-caption text-grey-5 q-mt-xs">
                    Ingredients, Stock Ledger, BOM Recipes, Purchase Orders, Suppliers, and Wastage records.
                  </div>
                </q-card-section>
              </q-card>
            </div>

            <!-- HR & Payroll -->
            <div class="col-12 col-md-6">
              <q-card
                flat
                bordered
                class="cursor-pointer scope-card full-height"
                :class="{ 'scope-card--active': selectedScope === 'hr' }"
                @click="selectedScope = 'hr'"
              >
                <q-card-section>
                  <div class="row items-center justify-between no-wrap">
                    <div class="text-subtitle2 text-weight-bold">HR & Biometric Attendance</div>
                    <q-icon name="badge" size="24px" color="purple" />
                  </div>
                  <div class="text-caption text-grey-5 q-mt-xs">
                    Employees, Biometric Fingerprint Logs, Shift Rosters, Monthly Payroll Runs, and Loans.
                  </div>
                </q-card-section>
              </q-card>
            </div>
          </div>

          <!-- Format Selection & Action Button -->
          <div class="row items-center q-col-gutter-md">
            <div class="col-12 col-sm-auto">
              <div class="text-caption text-grey-5 q-mb-xs">Export Format</div>
              <q-btn-toggle
                v-model="selectedFormat"
                dense
                unelevated
                toggle-color="primary"
                color="grey-9"
                :options="[
                  { label: 'JSON Archive (.json)', value: 'json', icon: 'data_object' },
                  { label: 'PostgreSQL SQL Script (.sql)', value: 'sql', icon: 'code' },
                ]"
              />
            </div>

            <div class="col-12 col-sm-auto q-mt-md q-mt-sm-none">
              <q-btn
                color="primary"
                icon="cloud_download"
                size="md"
                label="Download Backup Now"
                :loading="generating"
                @click="runBackup"
              />
            </div>
          </div>

          <!-- Result banner -->
          <q-banner v-if="lastResult" rounded class="bg-grey-9 text-white q-mt-lg">
            <template v-slot:avatar>
              <q-icon name="check_circle" color="positive" size="28px" />
            </template>
            <div class="text-weight-bold">Backup Generated Successfully!</div>
            <div class="text-caption text-grey-4 q-mt-xs">
              Filename: <code>{{ lastResult.filename }}</code> | Tables: {{ lastResult.tableCount }} | Records: {{ lastResult.recordCount }} | Size: {{ formatBytes(lastResult.sizeBytes) }}
            </div>
          </q-banner>
        </q-tab-panel>

        <!-- ── TAB 2: RESTORE & RECOVERY ─────────────────────────────── -->
        <q-tab-panel name="restore" class="q-pa-lg">
          <div class="text-subtitle1 text-weight-bold text-negative q-mb-xs">
            <q-icon name="warning" class="q-mr-sm" />
            Disaster Recovery & System Restore
          </div>
          <p class="text-grey-7">
            Upload a previously downloaded <code>.json</code> backup file to restore database tables.
            <strong class="text-negative">CAUTION: Restoring will overwrite existing data.</strong>
          </p>

          <q-file
            v-model="restoreFile"
            label="Select Backup File (.json)"
            accept=".json"
            outlined
            dense
            class="q-mt-md"
            clearable
            style="max-width: 450px"
            @update:model-value="onFileSelected"
          >
            <template v-slot:prepend>
              <q-icon name="attach_file" />
            </template>
          </q-file>

          <!-- Pre-validation Card -->
          <div v-if="validationInfo" class="q-mt-md" style="max-width: 600px">
            <q-card flat bordered class="bg-grey-9">
              <q-card-section>
                <div class="row items-center justify-between">
                  <div class="text-subtitle2 text-weight-bold text-positive">
                    <q-icon name="verified" class="q-mr-xs" /> Backup File Verified
                  </div>
                  <q-badge color="primary">{{ validationInfo.scope?.toUpperCase() }}</q-badge>
                </div>
                <div class="text-caption text-grey-4 q-mt-sm">
                  📅 <strong>Created:</strong> {{ validationInfo.generatedAt }}<br />
                  📊 <strong>Total Tables:</strong> {{ validationInfo.tableCount }}<br />
                  🧾 <strong>Total Records:</strong> {{ validationInfo.recordCount }}
                </div>
              </q-card-section>
            </q-card>
          </div>

          <q-btn
            class="q-mt-lg"
            color="negative"
            icon="restore"
            label="Execute System Restore"
            :loading="restoring"
            :disable="!restoreFile || (validationInfo && !validationInfo.isValid)"
            @click="confirmRestore"
          />
        </q-tab-panel>

        <!-- ── TAB 3: BACKUP HISTORY ─────────────────────────────────── -->
        <q-tab-panel name="history" class="q-pa-md">
          <div class="row items-center justify-between q-mb-md">
            <div class="text-subtitle1 text-weight-bold">Local Backup Audit Trail</div>
            <q-btn flat dense icon="refresh" label="Refresh History" @click="refreshHistory" />
          </div>

          <q-table
            flat
            bordered
            :rows="backupHistory"
            :columns="historyColumns"
            row-key="id"
            dense
            no-data-label="No past backups recorded in this browser session"
          >
            <template v-slot:body-cell-scope="props">
              <q-td :props="props">
                <q-badge :color="getScopeColor(props.value)">{{ props.value?.toUpperCase() }}</q-badge>
              </q-td>
            </template>

            <template v-slot:body-cell-format="props">
              <q-td :props="props">
                <q-chip dense size="sm" :color="props.value === 'sql' ? 'purple-9' : 'teal-9'" text-color="white">
                  .{{ props.value }}
                </q-chip>
              </q-td>
            </template>

            <template v-slot:body-cell-fileSizeBytes="props">
              <q-td :props="props">
                {{ formatBytes(props.value) }}
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ── TAB 4: AUTOMATED SCHEDULES ────────────────────────────── -->
        <q-tab-panel name="schedules" class="q-pa-lg">
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Automated Backup Settings (ERPNext Standard)</div>
          <div class="text-caption text-grey-5 q-mb-lg">
            Configure automated backup triggers, retention windows, and offsite storage sync.
          </div>

          <div class="q-gutter-md" style="max-width: 600px">
            <q-toggle
              v-model="autoDailyBackup"
              label="Auto-download daily database snapshot on Admin Login"
              color="positive"
            />
            <q-separator />
            <q-toggle
              v-model="cloudSyncEnabled"
              label="Supabase Continuous Point-in-Time-Recovery (PITR) Enabled"
              color="positive"
              disable
            />
            <q-separator />
            <div class="text-caption text-grey-5">
              <q-icon name="info" color="primary" class="q-mr-xs" />
              Database tables are continuously replicated with Write-Ahead Logging (WAL) in AWS S3 storage for full Point-in-Time disaster recovery.
            </div>
          </div>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import PageHeader from 'components/common/PageHeader.vue'
import { supabase } from 'src/boot/supabase'
import {
  generateBackup,
  getBackupHistory,
  validateBackupFile,
} from 'src/services/backupService'

const $q = useQuasar()

const activeTab = ref('create')
const selectedScope = ref('full')
const selectedFormat = ref('json')
const generating = ref(false)
const lastResult = ref(null)

const restoreFile = ref(null)
const validationInfo = ref(null)
const restoring = ref(false)

const autoDailyBackup = ref(true)
const cloudSyncEnabled = ref(true)
const backupHistory = ref([])

const historyColumns = [
  { name: 'timestamp', label: 'Generated At', field: 'timestamp', align: 'left', format: (v) => new Date(v).toLocaleString() },
  { name: 'filename', label: 'Filename', field: 'filename', align: 'left' },
  { name: 'scope', label: 'Scope', field: 'scope', align: 'center' },
  { name: 'format', label: 'Format', field: 'format', align: 'center' },
  { name: 'recordCount', label: 'Records', field: 'recordCount', align: 'right' },
  { name: 'tableCount', label: 'Tables', field: 'tableCount', align: 'right' },
  { name: 'fileSizeBytes', label: 'File Size', field: 'fileSizeBytes', align: 'right' },
]

function getScopeColor(s) {
  const map = { full: 'primary', finance: 'green', pos: 'blue', inventory: 'orange', hr: 'purple' }
  return map[s] || 'grey'
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function refreshHistory() {
  backupHistory.value = getBackupHistory()
}

async function runBackup() {
  generating.value = true
  lastResult.value = null
  try {
    const result = await generateBackup({
      scope: selectedScope.value,
      format: selectedFormat.value,
    })

    // Trigger browser file download
    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)

    lastResult.value = result
    refreshHistory()
    $q.notify({ type: 'positive', message: `Backup downloaded: ${result.filename}` })
  } catch (err) {
    console.error('Backup failed:', err)
    $q.notify({ type: 'negative', message: 'Backup failed: ' + (err.message || err) })
  } finally {
    generating.value = false
  }
}

async function onFileSelected(file) {
  if (!file) {
    validationInfo.value = null
    return
  }
  validationInfo.value = await validateBackupFile(file)
  if (!validationInfo.value.isValid) {
    $q.notify({ type: 'warning', message: validationInfo.value.error })
  }
}

function confirmRestore() {
  if (!restoreFile.value) return

  $q.dialog({
    title: 'CRITICAL SYSTEM RESTORE',
    message: `Are you absolutely sure you want to restore the system from "${restoreFile.value.name}"? This action will overwrite existing database records and cannot be undone.`,
    color: 'negative',
    cancel: true,
    persistent: true,
    ok: {
      label: 'Execute Restore Now',
      color: 'negative',
    },
  }).onOk(() => {
    executeRestore()
  })
}

async function executeRestore() {
  if (!restoreFile.value) return

  restoring.value = true
  $q.loading.show({ message: 'Restoring database snapshots. Please wait...' })

  try {
    const text = await restoreFile.value.text()
    const parsed = JSON.parse(text)
    const dump = parsed.data || parsed

    const { error } = await supabase.rpc('restore_database', { dump_data: dump })
    if (error) throw error

    $q.notify({ type: 'positive', message: 'System restored successfully!' })

    setTimeout(() => {
      window.location.reload()
    }, 1500)
  } catch (err) {
    console.error('Restore failed:', err)
    $q.notify({ type: 'negative', message: 'Restore failed: ' + (err.message || err) })
  } finally {
    restoring.value = false
    $q.loading.hide()
  }
}

onMounted(() => {
  refreshHistory()
})
</script>

<style scoped>
.stat-card {
  background: var(--erp-bg-card, #1e1e2e);
  border-color: rgba(255, 255, 255, 0.08);
}
.scope-card {
  background: var(--erp-bg-card, #1e1e2e);
  border-color: rgba(255, 255, 255, 0.1);
  transition: all 0.2s ease;
}
.scope-card:hover {
  border-color: var(--q-primary);
  transform: translateY(-2px);
}
.scope-card--active {
  border-color: var(--q-primary);
  border-width: 2px;
  background: rgba(var(--q-primary-rgb), 0.05);
}
</style>
