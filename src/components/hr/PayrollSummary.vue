<template>
  <q-card class="bg-grey-9 text-white q-mb-md" flat bordered>
    <q-card-section>
      <div class="row items-center justify-between">
        <div class="text-h6">
          <q-icon name="payments" class="q-mr-sm" color="green" />Payroll Summary
          <span v-if="run" class="text-subtitle1 text-grey-5 q-ml-sm">
            ({{ run.period_start }} - {{ run.period_end }})
          </span>
        </div>
        <q-badge
          v-if="run"
          :color="statusColor(run.status)"
          :label="run.status"
          class="text-capitalize q-px-sm q-py-xs text-subtitle2"
        />
        <div v-else class="text-grey-5">No active payroll run selected</div>
      </div>
    </q-card-section>

    <q-separator dark inset />

    <q-card-section v-if="run">
      <div class="row q-col-gutter-md">
        <div class="col-6 col-sm-3 text-center">
          <div class="text-caption text-grey-5">Total Net Pay</div>
          <div class="text-h5 text-weight-bold text-green">
            {{ formatCurrency(run.total_net) }}
          </div>
        </div>
        <div class="col-6 col-sm-3 text-center">
          <div class="text-caption text-grey-5">Employees</div>
          <div class="text-h5 text-weight-bold">{{ run.employee_count }}</div>
        </div>
        <div class="col-6 col-sm-3 text-center">
          <div class="text-caption text-grey-5">Total Deductions</div>
          <div class="text-h6 text-weight-bold text-red">
            {{ formatCurrency(run.total_deductions) }}
          </div>
        </div>
        <div class="col-6 col-sm-3 text-center">
          <div class="text-caption text-grey-5">EPF/ETF (Employer)</div>
          <div class="text-h6 text-weight-bold text-amber">
            {{ formatCurrency((run.total_epf_employer || 0) + (run.total_etf_employer || 0)) }}
          </div>
        </div>
      </div>
    </q-card-section>

    <q-card-section v-else class="text-center text-grey-5 q-py-lg">
      <q-icon name="info" size="32px" class="q-mb-sm" />
      <div>Select a payroll run to view summary</div>
    </q-card-section>
  </q-card>
</template>

<script setup>
defineProps({
  run: {
    type: Object,
    default: null,
  },
})

function statusColor(status) {
  const map = {
    draft: 'grey',
    processing: 'blue',
    processed: 'indigo',
    approved: 'teal',
    paid: 'green',
    cancelled: 'red',
  }
  return map[status] || 'grey'
}

function formatCurrency(val) {
  return (
    'LKR ' +
    Number(val || 0).toLocaleString('en-LK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}
</script>
