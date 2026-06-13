<template>
  <q-table
    :rows="logs"
    :columns="columns"
    row-key="id"
    flat bordered
    :loading="loading"
    :filter="filter"
    :pagination="{ rowsPerPage: 20 }"
    class="biometric-table"
  >
    <template #top>
      <div class="text-h6">Biometric Sync Log</div>
      <q-space />
      <q-input v-model="filter" dense outlined placeholder="Search..." style="width: 200px">
        <template #prepend><q-icon name="search" /></template>
      </q-input>
    </template>

    <template #body-cell-sync_status="props">
      <q-td :props="props">
        <q-badge :color="statusColor(props.row.sync_status)" :label="props.row.sync_status" />
      </q-td>
    </template>

    <template #body-cell-punch_type="props">
      <q-td :props="props">
        <q-chip :color="punchColor(props.row.punch_type)" text-color="white" dense size="sm"
                :icon="punchIcon(props.row.punch_type)">
          {{ props.row.punch_type.replace(/_/g, ' ') }}
        </q-chip>
      </q-td>
    </template>
  </q-table>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  logs: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

const filter = ref('')

const columns = [
  { name: 'employee_id', label: 'Employee ID', field: 'employee_id', align: 'left', sortable: true },
  { name: 'punch_type', label: 'Punch Type', field: 'punch_type', align: 'left' },
  { name: 'punch_time', label: 'Punch Time', field: 'punch_time', format: v => new Date(v).toLocaleString(), sortable: true, align: 'left' },
  { name: 'device', label: 'Device', field: r => r.devices?.device_name || '—', align: 'left' },
  { name: 'sync_status', label: 'Sync Status', field: 'sync_status', sortable: true, align: 'center' },
  { name: 'error_message', label: 'Error', field: 'error_message', align: 'left' },
]

function statusColor(s) {
  return { pending: 'warning', synced: 'positive', failed: 'negative', duplicate: 'grey' }[s] || 'grey'
}
function punchColor(t) {
  return { clock_in: 'positive', clock_out: 'negative', break_start: 'orange', break_end: 'info' }[t] || 'grey'
}
function punchIcon(t) {
  return { clock_in: 'login', clock_out: 'logout', break_start: 'free_breakfast', break_end: 'play_arrow' }[t] || 'schedule'
}
</script>

<style scoped>
.biometric-table { border-radius: 12px; }
</style>
