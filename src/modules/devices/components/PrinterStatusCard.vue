<template>
  <q-card class="printer-status-card" :class="statusClass" flat bordered>
    <q-card-section class="row items-center q-pb-none">
      <q-icon :name="typeIcon" size="28px" :color="statusColor" />
      <div class="q-ml-md">
        <div class="text-subtitle1 text-weight-bold">{{ printer.printer_name }}</div>
        <div class="text-caption text-grey">{{ printer.printer_type }} — {{ connectionLabel }}</div>
      </div>
      <q-space />
      <q-badge :color="statusColor" :label="printer.queue_status" class="text-uppercase" />
    </q-card-section>

    <q-card-section>
      <div class="row q-gutter-sm text-body2">
        <div v-if="printer.printer_ip" class="col-auto">
          <q-icon name="language" size="14px" class="q-mr-xs" />
          {{ printer.printer_ip }}:{{ printer.printer_port || 9100 }}
        </div>
        <div class="col-auto">
          <q-icon name="print" size="14px" class="q-mr-xs" />
          {{ printer.print_count || 0 }} prints
        </div>
        <div v-if="printer.last_print_at" class="col-auto">
          <q-icon name="schedule" size="14px" class="q-mr-xs" />
          Last: {{ formatDate(printer.last_print_at) }}
        </div>
      </div>
    </q-card-section>

    <q-separator />

    <q-card-actions align="right">
      <q-btn flat size="sm" label="Test Print" icon="print" color="primary"
             @click="$emit('test', printer)" :loading="testing" />
      <q-btn flat size="sm" label="Configure" icon="settings" color="grey-7"
             @click="$emit('configure', printer)" />
      <q-btn flat size="sm" icon="delete" color="negative"
             @click="$emit('delete', printer)" />
    </q-card-actions>
  </q-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  printer: { type: Object, required: true },
  testing: { type: Boolean, default: false },
})

defineEmits(['test', 'configure', 'delete'])

const typeIcon = computed(() => {
  const map = { receipt: 'receipt', kitchen: 'restaurant', label: 'label', report: 'description' }
  return map[props.printer.printer_type] || 'print'
})

const statusColor = computed(() => {
  const map = { idle: 'positive', printing: 'info', error: 'negative', paused: 'warning' }
  return map[props.printer.queue_status] || 'grey'
})

const statusClass = computed(() => ({
  'border-positive': props.printer.queue_status === 'idle',
  'border-negative': props.printer.queue_status === 'error',
}))

const connectionLabel = computed(() => {
  if (props.printer.printer_ip) return `Network (${props.printer.printer_ip})`
  return 'USB'
})

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}
</script>

<style scoped>
.printer-status-card {
  border-radius: 12px;
  transition: box-shadow 0.2s ease;
}
.printer-status-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}
.border-positive { border-left: 4px solid var(--q-positive) !important; }
.border-negative { border-left: 4px solid var(--q-negative) !important; }
</style>
