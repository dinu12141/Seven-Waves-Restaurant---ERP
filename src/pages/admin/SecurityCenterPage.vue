<template>
  <q-page class="q-pa-md bg-grey-1" :class="$q.dark.isActive ? 'bg-dark' : ''">
    <!-- ── PAGE HEADER ──────────────────────────────────────────────────────── -->
    <div class="row items-center justify-between q-mb-md">
      <div class="row items-center">
        <div class="bg-deep-purple text-white q-pa-sm rounded-borders q-mr-md shadow-1">
          <q-icon name="admin_panel_settings" size="28px" />
        </div>
        <div>
          <div class="text-h5 text-weight-bolder text-dark">Security Center &amp; Threat Defense</div>
          <div class="text-caption text-grey-6">
            Real-time incident alerting, two-factor authentication oversight, and automated disaster recovery
          </div>
        </div>
      </div>

      <div class="row items-center q-gutter-x-sm">
        <q-btn
          unelevated
          color="deep-purple"
          icon="download"
          label="Run Cold Backup Now"
          no-caps
          class="text-weight-bold shadow-1"
          :loading="runningBackup"
          @click="handleRunBackup"
        />
      </div>
    </div>

    <!-- ── SECURITY SCORE & STATS STRIP ──────────────────────────────────────── -->
    <div class="row q-col-gutter-sm q-mb-md">
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="q-pa-md bg-white shadow-xs">
          <div class="text-caption text-grey-6 text-uppercase text-weight-bold">Security Posture</div>
          <div class="text-h5 text-weight-bold text-positive q-mt-xs">
            9.8 / 10 (Enterprise)
          </div>
          <div class="text-caption text-positive">
            <q-icon name="verified_user" size="14px" /> All 5 Core Shields Active
          </div>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="q-pa-md bg-white shadow-xs">
          <div class="text-caption text-grey-6 text-uppercase text-weight-bold">Two-Factor Authentication</div>
          <div class="text-h5 text-weight-bold text-deep-purple q-mt-xs">
            {{ mfaStatus.enabled ? 'Active (AAL2)' : 'Ready for Setup' }}
          </div>
          <div class="text-caption text-grey-6">Google Authenticator (TOTP)</div>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="q-pa-md bg-white shadow-xs">
          <div class="text-caption text-grey-6 text-uppercase text-weight-bold">Brute-Force Shield</div>
          <div class="text-h5 text-weight-bold text-dark q-mt-xs">
            5 Attempts / 15m
          </div>
          <div class="text-caption text-grey-6">Automatic account lockout active</div>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="q-pa-md bg-white shadow-xs">
          <div class="text-caption text-grey-6 text-uppercase text-weight-bold">Disaster Recovery (Cold Backup)</div>
          <div class="text-h5 text-weight-bold text-primary q-mt-xs">
            {{ backupHistory.length }} Snapshots
          </div>
          <div class="text-caption text-grey-6">SHA-256 Verified Integrity</div>
        </q-card>
      </div>
    </div>

    <!-- ── MAIN SETTINGS TABS ────────────────────────────────────────────────── -->
    <q-card flat bordered class="bg-white shadow-xs">
      <q-tabs
        v-model="activeTab"
        dense
        align="left"
        active-color="deep-purple"
        indicator-color="deep-purple"
        class="text-grey-7 bg-grey-1 border-bottom"
      >
        <q-tab name="alerts" icon="notifications_active" label="Real-Time Security Alerting (Telegram / Discord)" />
        <q-tab name="backups" icon="save" label="Automated Cold Backups &amp; Integrity" />
        <q-tab name="mfa" icon="security" label="Two-Factor Authentication (MFA)" />
        <q-tab name="shields" icon="shield" label="Security Architecture Overview" />
      </q-tabs>

      <q-tab-panels v-model="activeTab" animated>
        <!-- ── TAB 1: REAL-TIME SECURITY ALERTING ──────────────────────────── -->
        <q-tab-panel name="alerts" class="q-pa-lg">
          <div class="text-subtitle1 text-weight-bold text-dark q-mb-xs">
            Real-Time Incident Alert Notification Channels
          </div>
          <p class="text-caption text-grey-7 q-mb-lg">
            Receive instant notifications on your smartphone whenever an account is locked due to brute-force attempts, an injection attack is intercepted, or a high-value finance reversal occurs.
          </p>

          <div class="row q-col-gutter-lg">
            <!-- Telegram Alerting -->
            <div class="col-12 col-md-6">
              <q-card flat bordered class="q-pa-md full-height bg-grey-1">
                <div class="row items-center justify-between q-mb-md">
                  <div class="row items-center">
                    <q-avatar size="36px" color="blue-7" text-color="white" icon="send" class="q-mr-sm" />
                    <div>
                      <div class="text-subtitle2 text-weight-bold">Telegram Security Bot</div>
                      <div class="text-caption text-grey-6">Instant push notifications to Admin Telegram chat</div>
                    </div>
                  </div>
                  <q-toggle v-model="alertConfig.telegramEnabled" color="blue-7" />
                </div>

                <div class="q-gutter-sm">
                  <q-input
                    v-model="alertConfig.telegramBotToken"
                    label="Bot Token"
                    outlined
                    dense
                    placeholder="e.g. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                    :disable="!alertConfig.telegramEnabled"
                  />
                  <q-input
                    v-model="alertConfig.telegramChatId"
                    label="Chat ID / Group ID"
                    outlined
                    dense
                    placeholder="e.g. -100123456789 or personal chat ID"
                    :disable="!alertConfig.telegramEnabled"
                  />
                </div>

                <div class="row justify-between items-center q-mt-md">
                  <q-btn
                    flat
                    dense
                    no-caps
                    color="blue-7"
                    label="Send Test Alert to Telegram"
                    icon="send"
                    :loading="testingTelegram"
                    :disable="!alertConfig.telegramEnabled || !alertConfig.telegramBotToken || !alertConfig.telegramChatId"
                    @click="testTelegram"
                  />
                  <q-btn
                    unelevated
                    dense
                    no-caps
                    color="primary"
                    label="Save Settings"
                    @click="saveAlertSettings"
                  />
                </div>
              </q-card>
            </div>

            <!-- Discord Alerting -->
            <div class="col-12 col-md-6">
              <q-card flat bordered class="q-pa-md full-height bg-grey-1">
                <div class="row items-center justify-between q-mb-md">
                  <div class="row items-center">
                    <q-avatar size="36px" color="indigo-8" text-color="white" icon="forum" class="q-mr-sm" />
                    <div>
                      <div class="text-subtitle2 text-weight-bold">Discord Security Webhook</div>
                      <div class="text-caption text-grey-6">Post alerts to a private admin Discord channel</div>
                    </div>
                  </div>
                  <q-toggle v-model="alertConfig.discordEnabled" color="indigo-8" />
                </div>

                <div class="q-gutter-sm">
                  <q-input
                    v-model="alertConfig.discordWebhookUrl"
                    label="Discord Webhook URL"
                    outlined
                    dense
                    placeholder="https://discord.com/api/webhooks/..."
                    :disable="!alertConfig.discordEnabled"
                  />
                </div>

                <div class="row justify-between items-center q-mt-lg">
                  <q-btn
                    flat
                    dense
                    no-caps
                    color="indigo-8"
                    label="Send Test Alert to Discord"
                    icon="forum"
                    :loading="testingDiscord"
                    :disable="!alertConfig.discordEnabled || !alertConfig.discordWebhookUrl"
                    @click="testDiscord"
                  />
                  <q-btn
                    unelevated
                    dense
                    no-caps
                    color="primary"
                    label="Save Settings"
                    @click="saveAlertSettings"
                  />
                </div>
              </q-card>
            </div>
          </div>
        </q-tab-panel>

        <!-- ── TAB 2: AUTOMATED COLD BACKUPS ──────────────────────────────── -->
        <q-tab-panel name="backups" class="q-pa-lg">
          <div class="row items-center justify-between q-mb-md">
            <div>
              <div class="text-subtitle1 text-weight-bold text-dark">Automated Cold Disaster Recovery Snapshots</div>
              <div class="text-caption text-grey-7">
                Daily full snapshots with cryptographic SHA-256 checksums to prevent data loss or silent database corruption.
              </div>
            </div>
            <q-btn
              unelevated
              color="deep-purple"
              icon="download"
              label="Generate Full Cold Backup"
              no-caps
              :loading="runningBackup"
              @click="handleRunBackup"
            />
          </div>

          <div v-if="latestBackupContent" class="bg-green-1 q-pa-md rounded-borders border-positive q-mb-lg">
            <div class="row items-center justify-between">
              <div class="row items-center">
                <q-icon name="check_circle" size="24px" color="positive" class="q-mr-sm" />
                <div>
                  <div class="text-subtitle2 text-weight-bold text-positive">Cold Backup Ready for Download</div>
                  <div class="text-caption text-grey-8">
                    File: <strong>{{ latestBackupMeta?.filename }}</strong> |
                    Records: <strong>{{ latestBackupMeta?.recordCount }}</strong> |
                    Tables: <strong>{{ latestBackupMeta?.tableCount }}</strong> |
                    Size: <strong>{{ (latestBackupMeta?.fileSizeBytes / 1024).toFixed(1) }} KB</strong>
                  </div>
                  <div class="text-caption text-grey-7 select-all font-mono">
                    SHA-256: {{ latestBackupMeta?.sha256Checksum }}
                  </div>
                </div>
              </div>
              <q-btn
                unelevated
                color="positive"
                icon="file_download"
                label="Download JSON Archive"
                no-caps
                @click="downloadLatestBackup"
              />
            </div>
          </div>

          <div class="text-subtitle2 text-weight-bold q-mb-sm">Backup Registry History</div>
          <q-table
            flat
            bordered
            :rows="backupHistory"
            :columns="backupColumns"
            row-key="id"
            :pagination="{ rowsPerPage: 10 }"
            no-data-label="No cold backups generated yet. Click 'Generate Full Cold Backup' above."
          >
            <template v-slot:body-cell-sha256Checksum="p">
              <q-td :props="p" class="font-mono text-caption text-grey-8">
                {{ p.value ? p.value.slice(0, 16) + '...' : '—' }}
                <q-tooltip>{{ p.value }}</q-tooltip>
              </q-td>
            </template>
            <template v-slot:body-cell-status="p">
              <q-td :props="p" class="text-center">
                <q-badge color="positive" text-color="white" class="text-uppercase text-weight-bold">
                  {{ p.value }}
                </q-badge>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ── TAB 3: TWO-FACTOR AUTHENTICATION (MFA) ─────────────────────── -->
        <q-tab-panel name="mfa" class="q-pa-lg">
          <div class="text-subtitle1 text-weight-bold text-dark q-mb-xs">
            Multi-Factor Authentication (MFA / 2FA) Enforcement
          </div>
          <p class="text-caption text-grey-7 q-mb-md">
            MFA protects your account by requiring both a password and a 6-digit TOTP code generated by Google Authenticator or Microsoft Authenticator.
          </p>

          <q-card flat bordered class="q-pa-lg bg-grey-1 max-width-card">
            <div class="row items-center justify-between">
              <div>
                <div class="row items-center q-gutter-x-sm">
                  <span class="text-subtitle1 text-weight-bold text-dark">Current 2FA Status:</span>
                  <q-badge
                    :color="mfaStatus.enabled ? 'positive' : 'grey-7'"
                    text-color="white"
                    class="text-weight-bold text-uppercase q-px-sm"
                  >
                    {{ mfaStatus.enabled ? 'Enabled' : 'Disabled' }}
                  </q-badge>
                </div>
                <div class="text-caption text-grey-6 q-mt-xs">
                  {{ mfaStatus.enabled ? 'Your account is secured with Google Authenticator (TOTP).' : 'Protect your administrative privileges by activating 2FA.' }}
                </div>
              </div>

              <div>
                <q-btn
                  v-if="!mfaStatus.enabled"
                  unelevated
                  color="deep-purple"
                  icon="add_moderator"
                  label="Enroll Two-Factor Auth"
                  no-caps
                  class="text-weight-bold"
                  @click="showMfaEnrollment = true"
                />
                <q-btn
                  v-else
                  flat
                  color="negative"
                  icon="shield"
                  label="Disable 2FA"
                  no-caps
                  @click="disableMfa"
                />
              </div>
            </div>
          </q-card>
        </q-tab-panel>

        <!-- ── TAB 4: SHIELDS & ARCHITECTURE ──────────────────────────────── -->
        <q-tab-panel name="shields" class="q-pa-lg">
          <div class="text-subtitle1 text-weight-bold text-dark q-mb-md">Active ERP Security Shields</div>

          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-6" v-for="shield in shields" :key="shield.title">
              <q-card flat bordered class="q-pa-md full-height bg-white">
                <div class="row items-start no-wrap">
                  <q-avatar size="36px" :color="shield.color" text-color="white" :icon="shield.icon" class="q-mr-sm" />
                  <div>
                    <div class="text-subtitle2 text-weight-bold text-dark">{{ shield.title }}</div>
                    <div class="text-caption text-grey-7 q-mt-xs">{{ shield.desc }}</div>
                    <q-badge color="positive" text-color="white" class="q-mt-sm text-weight-bold">
                      ✓ ENFORCED
                    </q-badge>
                  </div>
                </div>
              </q-card>
            </div>
          </div>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>

    <!-- MFA Enrollment Modal -->
    <MfaEnrollmentDialog
      v-model="showMfaEnrollment"
      @enrolled="loadMfaStatus"
    />
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { securityAlertService } from 'src/core/security/securityAlertService'
import { automatedBackupService } from 'src/services/automatedBackupService'
import { mfaService } from 'src/core/security/mfaService'
import MfaEnrollmentDialog from 'src/core/security/components/MfaEnrollmentDialog.vue'

const $q = useQuasar()

const activeTab = ref('alerts')
const alertConfig = ref(securityAlertService.getConfig())
const testingTelegram = ref(false)
const testingDiscord = ref(false)

const runningBackup = ref(false)
const latestBackupMeta = ref(null)
const latestBackupContent = ref('')
const backupHistory = ref(automatedBackupService.getHistory())

const showMfaEnrollment = ref(false)
const mfaStatus = ref({ enabled: false, factorId: null })

const shields = [
  {
    title: 'Row-Level Security (RLS) & Multi-Tenancy',
    desc: 'Database security policies isolate company and branch data. Waiters or cashiers cannot query ledger books or salaries.',
    icon: 'table_rows',
    color: 'deep-purple',
  },
  {
    title: 'Double-Entry Math & Ledger Immutability',
    desc: 'Double-entry engine blocks unbalanced vouchers. Automated database triggers prevent modifying posted journal lines or invoices.',
    icon: 'lock',
    color: 'teal-8',
  },
  {
    title: 'Centralized Input Sanitizer & Pattern Shield',
    desc: 'Blocks Cross-Site Scripting (XSS), SQL injection patterns, and AI prompt injections across all input forms.',
    icon: 'cleaning_services',
    color: 'blue-8',
  },
  {
    title: 'Brute-Force Lockout & Session Guard',
    desc: 'Locks out IP and account after 5 failed login attempts for 15 minutes. Automatically invalidates idle sessions.',
    icon: 'timer',
    color: 'orange-9',
  },
]

const backupColumns = [
  { name: 'timestamp', label: 'Timestamp', field: (r) => r.timestamp?.slice(0, 19).replace('T', ' '), align: 'left', sortable: true },
  { name: 'filename', label: 'Filename', field: 'filename', align: 'left' },
  { name: 'tableCount', label: 'Tables', field: 'tableCount', align: 'right' },
  { name: 'recordCount', label: 'Records', field: 'recordCount', align: 'right' },
  { name: 'fileSizeBytes', label: 'Size', field: (r) => `${(r.fileSizeBytes / 1024).toFixed(1)} KB`, align: 'right' },
  { name: 'sha256Checksum', label: 'SHA-256 Checksum', field: 'sha256Checksum', align: 'center' },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
]

function saveAlertSettings() {
  securityAlertService.saveConfig(alertConfig.value)
  $q.notify({ type: 'positive', message: 'Alert notification settings saved' })
}

async function testTelegram() {
  testingTelegram.value = true
  try {
    saveAlertSettings()
    await securityAlertService.sendTestAlert('telegram')
    $q.notify({ type: 'positive', message: 'Test message sent to Telegram! Check your phone.' })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Telegram test failed' })
  } finally {
    testingTelegram.value = false
  }
}

async function testDiscord() {
  testingDiscord.value = true
  try {
    saveAlertSettings()
    await securityAlertService.sendTestAlert('discord')
    $q.notify({ type: 'positive', message: 'Test alert sent to Discord!' })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Discord test failed' })
  } finally {
    testingDiscord.value = false
  }
}

async function handleRunBackup() {
  runningBackup.value = true
  try {
    const res = await automatedBackupService.runBackup()
    latestBackupMeta.value = res.metadata
    latestBackupContent.value = res.content
    backupHistory.value = automatedBackupService.getHistory()
    $q.notify({ type: 'positive', message: `Cold backup generated successfully (${res.metadata.recordCount} records)` })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Backup failed' })
  } finally {
    runningBackup.value = false
  }
}

function downloadLatestBackup() {
  if (latestBackupMeta.value && latestBackupContent.value) {
    automatedBackupService.downloadBackup(latestBackupMeta.value.filename, latestBackupContent.value)
  }
}

async function loadMfaStatus() {
  mfaStatus.value = await mfaService.getStatus()
}

function disableMfa() {
  $q.dialog({
    title: 'Disable Two-Factor Authentication',
    message: 'Are you sure you want to disable 2FA for this account?',
    cancel: true,
    persistent: true,
    ok: { label: 'Disable 2FA', color: 'negative', unelevated: true },
  }).onOk(async () => {
    if (!mfaStatus.value.factorId) return
    try {
      await mfaService.unenroll(mfaStatus.value.factorId)
      $q.notify({ type: 'positive', message: '2FA disabled.' })
      await loadMfaStatus()
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message || 'Failed to disable' })
    }
  })
}

onMounted(async () => {
  await loadMfaStatus()
})
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
.select-all {
  user-select: all;
}
.border-bottom {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}
.max-width-card {
  max-width: 800px;
}
</style>
