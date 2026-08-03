<template>
  <q-page class="q-pa-md">
    <PageHeader
      title="System Backup"
      subtitle="View database backup status and download information"
      show-back
      back-route="/admin"
    />

    <!-- Backup Now / Schedule Section -->
    <q-card flat bordered class="q-mt-md">
      <q-card-section>
        <div class="text-h6 q-mb-xs">
          <q-icon name="schedule" class="q-mr-sm" />
          {{ onDemandSupported ? 'Backup Now' : 'Backup Schedule' }}
        </div>

        <div v-if="onDemandSupported">
          <p class="text-grey-7">Trigger an on-demand database backup.</p>
          <q-btn
            color="primary"
            icon="backup"
            label="Backup Now"
            :loading="triggering"
            @click="triggerBackup"
          />
        </div>

        <div v-else>
          <q-banner class="bg-blue-1 text-grey-9" rounded>
            <template v-slot:avatar>
              <q-icon name="info" color="primary" />
            </template>
            On-demand backup triggering is not available on the Supabase Management API at this
            project's tier. Daily physical backups run automatically on a fixed server-side
            schedule.
          </q-banner>

          <div class="q-mt-md">
            <div class="text-caption text-grey-6">Most recent backup</div>
            <div class="text-subtitle1">{{ latestBackupLabel }}</div>
          </div>

          <q-btn
            class="q-mt-md"
            flat
            color="primary"
            icon="refresh"
            label="Check Schedule"
            :loading="triggering"
            @click="triggerBackup"
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- Available Backups Section -->
    <q-card flat bordered class="q-mt-md">
      <q-card-section>
        <div class="row items-center justify-between">
          <div class="text-h6">
            <q-icon name="folder_zip" class="q-mr-sm" />
            Available Backups
          </div>
          <q-btn flat round icon="refresh" :loading="loadingList" @click="loadBackups" />
        </div>

        <q-banner v-if="listError" class="bg-red-1 text-negative q-mt-sm" rounded dense>
          {{ listError }}
        </q-banner>

        <div v-if="projectMeta" class="row q-col-gutter-md q-mt-sm">
          <div class="col-12 col-sm-4">
            <div class="text-caption text-grey-6">Region</div>
            <div class="text-body2">{{ projectMeta.region || 'N/A' }}</div>
          </div>
          <div class="col-12 col-sm-4">
            <div class="text-caption text-grey-6">PITR Enabled</div>
            <q-chip
              dense
              :color="projectMeta.pitr_enabled ? 'positive' : 'grey-5'"
              text-color="white"
            >
              {{ projectMeta.pitr_enabled ? 'YES' : 'NO' }}
            </q-chip>
          </div>
          <div class="col-12 col-sm-4">
            <div class="text-caption text-grey-6">Physical Backups</div>
            <q-chip
              dense
              :color="projectMeta.walg_enabled ? 'positive' : 'grey-5'"
              text-color="white"
            >
              {{ projectMeta.walg_enabled ? 'YES' : 'NO' }}
            </q-chip>
          </div>
        </div>

        <q-table
          class="q-mt-md"
          :rows="backups"
          :columns="columns"
          row-key="inserted_at"
          :loading="loadingList"
          flat
          bordered
          no-data-label="No backups found"
        >
          <template v-slot:body-cell-status="props">
            <q-td :props="props">
              <q-chip
                dense
                :color="props.row.status === 'COMPLETED' ? 'positive' : 'warning'"
                text-color="white"
              >
                {{ props.row.status }}
              </q-chip>
            </q-td>
          </template>
          <template v-slot:body-cell-type="props">
            <q-td :props="props">
              {{ props.row.is_physical_backup ? 'Physical' : 'Logical' }}
            </q-td>
          </template>
          <template v-slot:body-cell-actions="props">
            <q-td :props="props">
              <q-btn
                flat
                dense
                icon="download"
                label="Download"
                color="primary"
                @click="downloadBackup()"
              />
            </q-td>
          </template>
        </q-table>
      </q-card-section>
    </q-card>

    <!-- Restore note -->
    <q-banner class="bg-grey-2 text-grey-8 q-mt-md" rounded dense>
      <template v-slot:avatar>
        <q-icon name="info" color="grey-7" />
      </template>
      To restore from a backup, contact Supabase support or use the Supabase dashboard directly.
    </q-banner>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import PageHeader from 'components/common/PageHeader.vue'
import { supabase } from 'src/boot/supabase'
import { checkRateLimit } from 'src/core/security/rateLimiter'

const $q = useQuasar()

const loadingList = ref(false)
const triggering = ref(false)
const listError = ref('')
const backups = ref([])
const projectMeta = ref(null)
const onDemandSupported = ref(false)
const latestBackupUnix = ref(null)

const columns = [
  { name: 'inserted_at', label: 'Date', align: 'left', field: (r) => formatDate(r.inserted_at), sortable: true },
  { name: 'type', label: 'Type', align: 'left', field: 'is_physical_backup' },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
  { name: 'actions', label: 'Actions', align: 'right', field: 'actions' },
]

const latestBackupLabel = computed(() => {
  if (!latestBackupUnix.value) return 'Unknown'
  return new Date(latestBackupUnix.value * 1000).toLocaleString()
})

function formatDate(value) {
  if (!value) return 'N/A'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

async function callBackupFn(action) {
  const { data, error } = await supabase.functions.invoke('system-backup', {
    body: { action },
  })
  if (error) throw error
  return data
}

async function loadBackups() {
  loadingList.value = true
  listError.value = ''
  try {
    const data = await callBackupFn('list')
    if (!data?.success) {
      listError.value = data?.error || 'Failed to load backups'
      backups.value = []
      return
    }
    backups.value = data.backups || []
    projectMeta.value = {
      region: data.region,
      pitr_enabled: data.pitr_enabled,
      walg_enabled: data.walg_enabled,
    }
    if (data.physical_backup_window?.latest_unix) {
      latestBackupUnix.value = data.physical_backup_window.latest_unix
    }
  } catch (err) {
    listError.value = err.message || 'Failed to load backups'
  } finally {
    loadingList.value = false
  }
}

async function triggerBackup() {
  const rl = checkRateLimit('system_backup', 'system-backup-page')
  if (!rl.allowed) {
    $q.notify({
      type: 'warning',
      message: `Please wait before trying again (${Math.ceil((rl.retryAfterMs || 0) / 1000)}s).`,
    })
    return
  }

  triggering.value = true
  try {
    const data = await callBackupFn('trigger')
    onDemandSupported.value = !!data?.on_demand_supported
    if (data?.latest_backup_unix) {
      latestBackupUnix.value = data.latest_backup_unix
    }
    $q.notify({
      type: 'info',
      message: data?.message || 'Backup schedule checked.',
      timeout: 6000,
    })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to check backup status' })
  } finally {
    triggering.value = false
  }
}

async function downloadBackup() {
  try {
    const data = await callBackupFn('download')
    if (data?.success && data?.url) {
      window.open(data.url, '_blank')
      return
    }
    $q.notify({
      type: 'warning',
      message:
        data?.error ||
        'Backup file download is not available via the Supabase Management API. Contact Supabase support or use the Supabase dashboard directly.',
      timeout: 8000,
    })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Download failed' })
  }
}

onMounted(() => {
  loadBackups()
})
</script>
