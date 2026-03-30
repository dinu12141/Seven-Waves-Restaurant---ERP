<template>
  <q-table
    dark
    flat
    bordered
    :rows="records"
    :columns="columns"
    row-key="id"
    :loading="loading"
    :pagination="{ rowsPerPage: 15 }"
    class="bg-grey-9"
  >
    <template v-slot:body-cell-employee="props">
      <q-td :props="props">
        <div class="text-weight-bold">{{ props.row.employees?.full_name || '—' }}</div>
      </q-td>
    </template>
    <template v-slot:body-cell-status="props">
      <q-td :props="props">
        <q-badge
          :color="attendanceColor(props.row.status)"
          :label="props.row.status"
          class="text-capitalize"
        />
      </q-td>
    </template>
    <template v-slot:body-cell-hours="props">
      <q-td :props="props">
        <span class="text-weight-bold">{{ props.row.regular_hours || 0 }}h</span>
        <span v-if="props.row.overtime_hours > 0" class="text-amber q-ml-xs">
          +{{ props.row.overtime_hours }}h OT
        </span>
      </q-td>
    </template>
    <template v-slot:body-cell-late="props">
      <q-td :props="props">
        <span v-if="props.row.late_minutes > 0" class="text-orange">
          {{ props.row.late_minutes }} min
        </span>
        <span v-else class="text-green">On time</span>
      </q-td>
    </template>
    <template v-slot:body-cell-holiday="props">
      <q-td :props="props" class="text-center">
        <q-toggle
          :model-value="props.row.is_public_holiday || false"
          color="amber"
          size="sm"
          :label="props.row.is_public_holiday ? '2×' : '1.5×'"
          @update:model-value="emit('toggle-holiday', { id: props.row.id, value: $event })"
        >
          <q-tooltip>Mark as Public Holiday OT (2×) for payroll</q-tooltip>
        </q-toggle>
      </q-td>
    </template>
  </q-table>
</template>

<script setup>
defineProps({
  records: {
    type: Array,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle-holiday'])

const columns = [
  {
    name: 'employee',
    label: 'Employee',
    align: 'left',
    field: (row) => row.employees?.full_name,
    sortable: true,
  },
  { name: 'status', label: 'Status', align: 'center', field: 'status', sortable: true },
  {
    name: 'check_in',
    label: 'Check In',
    align: 'center',
    field: 'clock_in',
    format: (v) => (v ? new Date(v).toLocaleTimeString([], { timeStyle: 'short' }) : '—'),
  },
  {
    name: 'check_out',
    label: 'Check Out',
    align: 'center',
    field: 'clock_out',
    format: (v) => (v ? new Date(v).toLocaleTimeString([], { timeStyle: 'short' }) : '—'),
  },
  { name: 'hours', label: 'Hours', align: 'center', field: 'regular_hours' },
  { name: 'late', label: 'Late', align: 'center', field: 'late_minutes' },
  { name: 'holiday', label: 'Holiday OT', align: 'center', field: 'is_public_holiday' },
]

function attendanceColor(status) {
  const map = {
    present: 'green',
    absent: 'red',
    late: 'orange',
    half_day: 'amber',
    on_leave: 'blue',
  }
  return map[status] || 'grey'
}
</script>
