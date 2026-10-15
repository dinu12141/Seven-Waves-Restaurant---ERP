<template>
  <q-page class="q-pa-md">
    <PageHeader
      title="System Backup & Disaster Recovery"
      subtitle="Full & modular database snapshots, SQL dumps, and Google Drive cloud synchronization"
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
              <div class="text-caption text-grey-5">Google Drive Sync</div>
              <div class="text-h6 text-weight-bold" :class="driveConfig.is_enabled ? 'text-positive' : 'text-grey-5'">
                {{ driveConfig.is_enabled ? 'Active / Connected' : 'Disabled' }}
              </div>
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
              <div class="text-h6 text-weight-bold">Enterprise Cloud DB</div>
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
        <q-tab name="cloud" icon="cloud" label="Cloud Snapshots" />
        <q-tab name="gdrive" icon="add_to_drive" label="Google Drive Cloud Sync" />
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

          <!-- Format Selection & Action Buttons -->
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
                  { label: 'Standard SQL Script (.sql)', value: 'sql', icon: 'code' },
                ]"
              />
            </div>

            <div class="col-12 col-sm-auto q-gutter-x-sm q-mt-md q-mt-sm-none">
              <q-btn
                color="primary"
                icon="cloud_download"
                size="md"
                label="Download Backup"
                :loading="generating"
                @click="runBackup('download')"
              />

              <q-btn
                color="teal-8"
                icon="cloud_upload"
                size="md"
                label="Save to Cloud Storage"
                :loading="uploadingCloud"
                @click="runBackup('cloud')"
              />

              <q-btn
                color="positive"
                icon="add_to_drive"
                size="md"
                label="Sync to Google Drive"
                :loading="uploadingDrive"
                @click="runBackup('drive')"
              />
            </div>
          </div>

          <!-- Result banner -->
          <q-banner v-if="lastResult" rounded class="bg-grey-9 text-white q-mt-lg">
            <template v-slot:avatar>
              <q-icon name="check_circle" color="positive" size="28px" />
            </template>
            <div class="text-weight-bold">{{ lastResult.message || 'Backup Completed Successfully!' }}</div>
            <div class="text-caption text-grey-4 q-mt-xs">
              Filename: <code>{{ lastResult.filename }}</code> | Tables: {{ lastResult.tableCount }} | Records: {{ lastResult.recordCount }} | Size: {{ formatBytes(lastResult.sizeBytes) }}
              <span v-if="lastResult.driveLink"> | <a :href="lastResult.driveLink" target="_blank" class="text-primary">Open in Google Drive ↗</a></span>
            </div>
          </q-banner>
        </q-tab-panel>

        <!-- ── TAB: SUPABASE CLOUD SNAPSHOTS ──────────────────────────── -->
        <q-tab-panel name="cloud" class="q-pa-md">
          <div class="row items-center justify-between q-mb-md">
            <div>
              <div class="text-subtitle1 text-weight-bold">Cloud Snapshots (Encrypted Storage)</div>
              <div class="text-caption text-grey-5">Daily automated snapshots and manual archives stored in private encrypted cloud storage.</div>
            </div>
            <div class="q-gutter-x-sm">
              <q-btn flat dense icon="refresh" label="Refresh List" :loading="loadingCloud" @click="refreshCloudBackups" />
            </div>
          </div>

          <q-table
            flat
            bordered
            :rows="cloudBackups"
            :columns="cloudColumns"
            row-key="path"
            dense
            :loading="loadingCloud"
            no-data-label="No snapshots found in cloud storage"
          >
            <template v-slot:body-cell-source="props">
              <q-td :props="props">
                <q-badge :color="props.value === 'automated' ? 'green-8' : 'blue-8'">
                  {{ props.value?.toUpperCase() }}
                </q-badge>
              </q-td>
            </template>

            <template v-slot:body-cell-actions="props">
              <q-td :props="props" align="right">
                <q-btn
                  size="sm"
                  color="primary"
                  icon="download"
                  label="Download"
                  dense
                  class="q-px-sm"
                  @click="downloadCloudFile(props.row.path, props.row.name)"
                />
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ── TAB 2: GOOGLE DRIVE CLOUD SYNC ────────────────────────── -->
        <q-tab-panel name="gdrive" class="q-pa-lg">
          <div class="row items-center justify-between q-mb-md">
            <div>
              <div class="text-subtitle1 text-weight-bold row items-center">
                <q-icon name="add_to_drive" color="positive" size="24px" class="q-mr-sm" />
                Google Drive Cloud Backup Settings (ERPNext Standard)
              </div>
              <div class="text-caption text-grey-5">
                Automatically push scheduled database snapshots and SQL dumps to your restaurant's Google Drive.
              </div>
            </div>
            <q-btn
              color="positive"
              icon="save"
              label="Save Drive Settings"
              :loading="savingDrive"
              @click="saveDriveSettings"
            />
          </div>

          <div class="row q-col-gutter-lg">
            <!-- Left: Settings Form -->
            <div class="col-12 col-md-7">
              <q-card flat bordered class="q-pa-md bg-grey-10">
                <q-toggle
                  v-model="driveConfig.is_enabled"
                  label="Enable Google Drive Automated Cloud Backup"
                  color="positive"
                  class="q-mb-md"
                />

                <div class="text-subtitle2 q-mb-xs">Authentication Method</div>
                <q-select
                  v-model="driveConfig.auth_type"
                  :options="[
                    { label: 'Google Drive REST API (OAuth2 / Access Token)', value: 'oauth_token' },
                    { label: 'Google Apps Script Webhook Relay (Zero-Expiry)', value: 'webhook_relay' },
                  ]"
                  emit-value
                  map-options
                  outlined
                  dense
                  class="q-mb-md"
                />

                <!-- OAuth Token Mode -->
                <div v-if="driveConfig.auth_type === 'oauth_token'" class="q-gutter-sm">
                  <q-input
                    v-model="driveConfig.access_token"
                    label="Google OAuth / Access Token"
                    type="password"
                    outlined
                    dense
                    hint="From Google Cloud Console / OAuth Playground"
                  />
                  <q-input
                    v-model="driveConfig.folder_id"
                    label="Google Drive Target Folder ID"
                    outlined
                    dense
                    hint="e.g. 1AbCdEfGhIjKlMnOpQrStUvWxYz from your Drive folder URL"
                  />
                  <q-input
                    v-model="driveConfig.folder_name"
                    label="Target Folder Display Name"
                    outlined
                    dense
                  />
                </div>

                <!-- Webhook Relay Mode -->
                <div v-if="driveConfig.auth_type === 'webhook_relay'" class="q-gutter-sm">
                  <q-input
                    v-model="driveConfig.webhook_relay_url"
                    label="Google Apps Script Webhook URL"
                    outlined
                    dense
                    hint="https://script.google.com/macros/s/.../exec"
                  />
                  <q-input
                    v-model="driveConfig.folder_id"
                    label="Target Folder ID (Optional)"
                    outlined
                    dense
                  />
                </div>

                <div class="row items-center q-mt-lg q-gutter-x-sm">
                  <q-btn
                    color="info"
                    outline
                    icon="network_check"
                    label="Test Google Drive Connection"
                    :loading="testingDrive"
                    @click="runTestDrive"
                  />
                </div>
              </q-card>
            </div>

            <!-- Right: Setup Instructions -->
            <div class="col-12 col-md-5">
              <q-card flat bordered class="q-pa-md bg-grey-10">
                <div class="text-subtitle2 text-weight-bold q-mb-sm text-primary">
                  <q-icon name="help_outline" class="q-mr-xs" /> Quick Setup Guide
                </div>
                <ol class="text-caption text-grey-4 q-pl-md q-gutter-y-xs">
                  <li>Open your <strong>Google Drive</strong> and create a folder named <code>Seven Waves ERP Backups</code>.</li>
                  <li>Open the folder and copy the <strong>Folder ID</strong> from the browser URL (the characters after <code>folders/</code>).</li>
                  <li>Paste the <strong>Folder ID</strong> into the Target Folder ID field.</li>
                  <li>Provide your <strong>Access Token</strong> or deploy the provided 1-minute <strong>Google Apps Script Webhook</strong>.</li>
                  <li>Click <strong>"Test Google Drive Connection"</strong> to verify!</li>
                </ol>
              </q-card>
            </div>
          </div>
        </q-tab-panel>

        <!-- ── TAB 3: RESTORE & RECOVERY ─────────────────────────────── -->
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

        <!-- ── TAB 4: BACKUP HISTORY ─────────────────────────────────── -->
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

        <!-- ── TAB 5: AUTOMATED SCHEDULES ────────────────────────────── -->
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
              v-model="driveConfig.auto_upload_daily"
              label="Auto-upload daily backup to Google Drive"
              color="positive"
            />
            <q-separator />
            <q-toggle
              v-model="cloudSyncEnabled"
              label="Continuous Point-in-Time-Recovery (PITR) Enabled"
              color="positive"
              disable
            />
            <q-separator />
            <div class="text-caption text-grey-5">
              <q-icon name="info" color="primary" class="q-mr-xs" />
              Database tables are continuously replicated with Write-Ahead Logging (WAL) in encrypted cloud storage for full Point-in-Time disaster recovery.
            </div>
          </div>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import PageHeader from 'components/common/PageHeader.vue'
import { supabase } from 'src/boot/supabase'
import {
  generateBackup,
  getBackupHistory,
  validateBackupFile,
  uploadBackupToCloudStorage,
  listCloudBackups,
  getCloudBackupDownloadUrl,
} from 'src/services/backupService'
import {
  getGoogleDriveConfig,
  saveGoogleDriveConfig,
  uploadToGoogleDrive,
  testGoogleDriveConnection,
} from 'src/services/googleDriveService'

const $q = useQuasar()

const activeTab = ref('create')
const selectedScope = ref('full')
const selectedFormat = ref('json')
const generating = ref(false)
const uploadingDrive = ref(false)
const uploadingCloud = ref(false)
const savingDrive = ref(false)
const testingDrive = ref(false)
const lastResult = ref(null)

const cloudBackups = ref([])
const loadingCloud = ref(false)

const restoreFile = ref(null)
const validationInfo = ref(null)
const restoring = ref(false)

const autoDailyBackup = ref(true)
const cloudSyncEnabled = ref(true)
const backupHistory = ref([])

const driveConfig = reactive({
  is_enabled: false,
  auth_type: 'oauth_token',
  access_token: '',
  folder_id: '',
  folder_name: 'Seven Waves ERP Backups',
  webhook_relay_url: '',
  auto_upload_daily: true,
  retention_count: 14,
})

const historyColumns = [
  { name: 'timestamp', label: 'Generated At', field: 'timestamp', align: 'left', format: (v) => new Date(v).toLocaleString() },
  { name: 'filename', label: 'Filename', field: 'filename', align: 'left' },
  { name: 'scope', label: 'Scope', field: 'scope', align: 'center' },
  { name: 'format', label: 'Format', field: 'format', align: 'center' },
  { name: 'recordCount', label: 'Records', field: 'recordCount', align: 'right' },
  { name: 'tableCount', label: 'Tables', field: 'tableCount', align: 'right' },
  { name: 'fileSizeBytes', label: 'File Size', field: 'fileSizeBytes', align: 'right' },
]

const cloudColumns = [
  { name: 'name', label: 'Snapshot Filename', field: 'name', align: 'left' },
  { name: 'source', label: 'Type', field: 'source', align: 'center' },
  { name: 'created_at', label: 'Created At', field: 'created_at', align: 'left', format: (v) => v ? new Date(v).toLocaleString() : '—' },
  { name: 'actions', label: 'Download', field: 'actions', align: 'right' },
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

async function refreshCloudBackups() {
  loadingCloud.value = true
  try {
    cloudBackups.value = await listCloudBackups()
  } catch (err) {
    console.error('Failed to load cloud backups:', err)
  } finally {
    loadingCloud.value = false
  }
}

async function downloadCloudFile(path, filename) {
  try {
    const url = await getCloudBackupDownloadUrl(path)
    if (!url) throw new Error('Could not generate download link')
    const a = document.createElement('a')
    a.href = url
    a.download = filename || 'backup.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    $q.notify({ type: 'positive', message: `Downloading ${filename}...` })
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Download failed: ' + err.message })
  }
}

async function loadDriveSettings() {
  const cfg = await getGoogleDriveConfig()
  Object.assign(driveConfig, cfg)
}

async function saveDriveSettings() {
  savingDrive.value = true
  try {
    const res = await saveGoogleDriveConfig(driveConfig)
    if (!res.success) throw new Error(res.error)
    $q.notify({ type: 'positive', message: 'Google Drive settings saved successfully!' })
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to save Drive settings: ' + err.message })
  } finally {
    savingDrive.value = false
  }
}

async function runTestDrive() {
  testingDrive.value = true
  try {
    const res = await testGoogleDriveConnection()
    if (!res.success) throw new Error(res.message)
    $q.notify({ type: 'positive', icon: 'check_circle', message: res.message })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    testingDrive.value = false
  }
}

async function runBackup(target = 'download') {
  if (target === 'drive') uploadingDrive.value = true
  else if (target === 'cloud') uploadingCloud.value = true
  else generating.value = true
  lastResult.value = null

  try {
    const result = await generateBackup({
      scope: selectedScope.value,
      format: selectedFormat.value,
    })

    if (target === 'download') {
      // Trigger browser file download
      const url = URL.createObjectURL(result.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      lastResult.value = { ...result, message: 'Backup downloaded successfully!' }
      $q.notify({ type: 'positive', message: `Backup downloaded: ${result.filename}` })
    } else if (target === 'cloud') {
      const cloudUpload = await uploadBackupToCloudStorage({
        blob: result.blob,
        filename: result.filename,
        folder: 'manual',
      })

      if (!cloudUpload.success) {
        throw new Error(cloudUpload.error || 'Failed to upload to Cloud Storage')
      }

      lastResult.value = {
        ...result,
        message: 'Backup securely archived to Cloud Storage!',
      }
      $q.notify({ type: 'positive', icon: 'cloud_done', message: 'Saved to Cloud Storage!' })
      refreshCloudBackups()
    } else {
      // Upload directly to Google Drive
      const driveUpload = await uploadToGoogleDrive({
        blob: result.blob,
        filename: result.filename,
      })

      if (!driveUpload.success) {
        throw new Error(driveUpload.error || 'Failed to upload to Google Drive')
      }

      lastResult.value = {
        ...result,
        message: 'Backup uploaded to Google Drive successfully!',
        driveLink: driveUpload.webViewLink,
      }
      $q.notify({ type: 'positive', icon: 'cloud_done', message: 'Uploaded to Google Drive successfully!' })
    }

    refreshHistory()
  } catch (err) {
    console.error('Backup failed:', err)
    $q.notify({ type: 'negative', message: 'Backup failed: ' + (err.message || err) })
  } finally {
    generating.value = false
    uploadingDrive.value = false
    uploadingCloud.value = false
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
    const dump = parsed.tables || parsed.data || parsed

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
  refreshCloudBackups()
  loadDriveSettings()
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
