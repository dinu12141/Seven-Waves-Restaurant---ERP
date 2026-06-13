<template>
  <q-table
    :rows="devices"
    :columns="columns"
    row-key="id"
    flat
    bordered
    :loading="loading"
    :filter="filter"
    :pagination="{ rowsPerPage: 15 }"
    class="device-health-table"
  >
    <template #top>
      <div class="text-h6 text-weight-bold">Device Health Monitor</div>
      <q-space />
      <q-input v-model="filter" dense outlined placeholder="Search devices..." class="q-mr-md" style="width: 250px">
        <template #prepend><q-icon name="search" /></template>
      </q-input>
      <q-btn icon="refresh" flat round color="primary" @click="$emit('refresh')" />
    </template>

    <template #body-cell-status="props">
      <q-td :props="props">
        <q-badge :color="statusColor(props.row.status)" :label="props.row.status" class="text-uppercase" />
      </q-td>
    </template>

    <template #body-cell-last_seen_at="props">
      <q-td :props="props">
        <span :class="isStale(props.row.last_seen_at) ? 'text-negative text-weight-bold' : ''">
          {{ formatDate(props.row.last_seen_at) }}
        </span>
      </q-td>
    </template>

    <template #body-cell-actions="props">
      <q-td :props="props" class="text-right">
        <q-btn flat dense icon="edit" size="sm" color="primary" @click="$emit('edit', props.row)" />
        <q-btn flat dense icon="favorite" size="sm" color="positive" @click="$emit('heartbeat', props.row)"
               :title="'Send heartbeat'" />
        <q-btn flat dense icon="delete" size="sm" color="negative" @click="$emit('delete', props.row)" />
      </q-td>
    </template>
  </q-table>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  devices: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

defineEmits(['refresh', 'edit', 'heartbeat', 'delete'])

const filter = ref('')

const columns = [
  { name: 'device_name', label: 'Device', field: 'device_name', sortable: true, align: 'left' },
  { name: 'device_type', label: 'Type', field: 'device_type', sortable: true, align: 'left' },
  { name: 'connection', label: 'Connection', field: 'connection', sortable: true, align: 'left' },
  { name: 'status', label: 'Status', field: 'status', sortable: true, align: 'center' },
  { name: 'ip_address', label: 'IP Address', field: 'ip_address', align: 'left' },
  { name: 'serial_number', label: 'Serial #', field: 'serial_number', align: 'left' },
  { name: 'last_seen_at', label: 'Last Seen', field: 'last_seen_at', sortable: true, align: 'left' },
  { name: 'actions', label: '', field: 'id', align: 'right' },
]

function statusColor(status) {
  return { online: 'positive', offline: 'grey', error: 'negative', maintenance: 'warning' }[status] || 'grey'
}

function isStale(lastSeen) {
  if (!lastSeen) return true
  return Date.now() - new Date(lastSeen).getTime() > 5 * 60 * 1000 // 5 min
}

function formatDate(d) {
  if (!d) return 'Never'
  return new Date(d).toLocaleString()
}
</script>

<style scoped>
.device-health-table {
  border-radius: 12px;
}
</style>
