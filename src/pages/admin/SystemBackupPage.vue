<template>
  <q-page class="q-pa-md">
    <PageHeader
      title="System Backup"
      subtitle="Full-database backups — generate and restore from local files"
      show-back
      back-route="/admin"
    />

    <!-- Backup Now Section -->
    <q-card flat bordered class="q-mt-md">
      <q-card-section>
        <div class="text-h6 q-mb-xs">
          <q-icon name="download" class="q-mr-sm" />
          Download System Backup
        </div>
        <p class="text-grey-7">
          Generates a full dump of every table in the database and downloads it as a `.json` file.
        </p>
        <q-btn
          color="primary"
          icon="download"
          label="Download Backup Now"
          :loading="triggering"
          @click="triggerBackup"
        />
        <div v-if="lastTriggerMessage" class="text-caption text-grey-7 q-mt-sm">
          {{ lastTriggerMessage }}
        </div>
      </q-card-section>
    </q-card>

    <!-- Restore Section -->
    <q-card flat bordered class="q-mt-md">
      <q-card-section>
        <div class="text-h6 q-mb-xs text-negative">
          <q-icon name="warning" class="q-mr-sm" />
          Restore System from Backup
        </div>
        <p class="text-grey-7">
          Upload a previously downloaded `.json` backup file to restore the entire system.
          <strong class="text-negative">WARNING: This will overwrite all current data in the system.</strong>
        </p>

        <q-file
          v-model="restoreFile"
          label="Select Backup File (.json)"
          accept=".json"
          outlined
          dense
          class="q-mt-md"
          clearable
          style="max-width: 400px"
        >
          <template v-slot:prepend>
            <q-icon name="attach_file" />
          </template>
        </q-file>

        <q-btn
          class="q-mt-md"
          color="negative"
          icon="restore"
          label="Restore System"
          :loading="restoring"
          :disable="!restoreFile"
          @click="confirmRestore"
        />
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref } from 'vue'
import { useQuasar } from 'quasar'
import PageHeader from 'components/common/PageHeader.vue'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()

const triggering = ref(false)
const lastTriggerMessage = ref('')
const restoreFile = ref(null)
const restoring = ref(false)

async function triggerBackup() {
  triggering.value = true
  lastTriggerMessage.value = 'Generating backup...'
  try {
    const { data, error } = await supabase.rpc('export_database')
    if (error) throw error

    // Create a Blob from the JSON data
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    // Create download link
    const a = document.createElement('a')
    a.href = url
    
    // Format date for filename: YYYY-MM-DD_HH-mm-ss
    const now = new Date()
    const pad = (n) => n.toString().padStart(2, '0')
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
    a.download = `erp_backup_${dateStr}.json`
    
    document.body.appendChild(a)
    a.click()
    
    // Cleanup
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)

    lastTriggerMessage.value = `Backup downloaded successfully at ${now.toLocaleString()}`
    $q.notify({ type: 'positive', message: 'Backup downloaded successfully!' })
  } catch (err) {
    console.error('Backup failed:', err)
    $q.notify({ type: 'negative', message: err.message || 'Backup failed' })
    lastTriggerMessage.value = 'Backup failed.'
  } finally {
    triggering.value = false
  }
}

function confirmRestore() {
  if (!restoreFile.value) return

  $q.dialog({
    title: 'CRITICAL WARNING',
    message: `Are you absolutely sure you want to restore the system from "${restoreFile.value.name}"? This will delete ALL current data and replace it with the data from the backup file. This action CANNOT be undone.`,
    color: 'negative',
    cancel: true,
    persistent: true,
    ok: {
      label: 'Yes, Restore Now',
      color: 'negative',
    }
  }).onOk(() => {
    restoreBackup()
  })
}

async function restoreBackup() {
  if (!restoreFile.value) return
  
  restoring.value = true
  $q.loading.show({ message: 'Restoring database. Please wait, this may take a few minutes...' })
  
  try {
    const text = await restoreFile.value.text()
    const dump = JSON.parse(text)
    
    const { error } = await supabase.rpc('restore_database', { dump_data: dump })
    if (error) throw error

    $q.notify({ type: 'positive', message: 'Restore completed successfully' })
    
    // Reload the app to reflect new data
    setTimeout(() => {
      window.location.reload()
    }, 1500)
    
  } catch (err) {
    console.error('Restore failed:', err)
    $q.notify({ type: 'negative', message: err.message || 'Restore failed' })
  } finally {
    restoring.value = false
    restoreFile.value = null
    $q.loading.hide()
  }
}
</script>
