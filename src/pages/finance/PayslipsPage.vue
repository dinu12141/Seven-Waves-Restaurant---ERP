<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="Payslips"
      breadcrumbs="Finance / Payroll / Payslips"
      showRefresh
      @refresh="loadData"
    />

    <div class="fin-filters q-mb-md">
      <q-select
        v-model="selectedCycle"
        :options="cycleOptions"
        label="Payroll Cycle"
        dense
        dark
        outlined
        style="min-width: 280px"
        emit-value
        map-options
        option-value="id"
        option-label="label"
        @update:model-value="loadRecords"
        clearable
      />
    </div>

    <!-- KPIs -->
    <div v-if="selectedCycle && records.length" class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-4">
        <div class="fin-kpi-card">
          <div class="fin-kpi-card__icon" style="background: rgba(16, 185, 129, 0.12)">
            <q-icon name="payments" size="20px" color="green" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Total Net</div>
            <div class="fin-kpi-card__value">{{ fmt(totalNet) }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-4">
        <div class="fin-kpi-card">
          <div class="fin-kpi-card__icon" style="background: rgba(59, 130, 246, 0.12)">
            <q-icon name="check_circle" size="20px" color="blue" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Paid</div>
            <div class="fin-kpi-card__value">{{ paidCount }} / {{ records.length }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-4">
        <div class="fin-kpi-card">
          <div class="fin-kpi-card__icon" style="background: rgba(245, 158, 11, 0.12)">
            <q-icon name="pending" size="20px" color="orange" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Pending</div>
            <div class="fin-kpi-card__value">{{ fmt(pendingAmount) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Payslips ({{ records.length }})</span>
        <q-btn
          v-if="records.length"
          flat
          dense
          size="sm"
          label="Mark All Paid"
          icon="done_all"
          color="green-5"
          @click="markAllPaid"
          :disable="paidCount === records.length"
        />
      </div>
      <q-table
        :rows="records"
        :columns="columns"
        row-key="id"
        flat
        dark
        dense
        :rows-per-page-options="[20, 50]"
        class="fin-table"
        :loading="loading"
        no-data-label="Select a cycle to view payslips"
      >
        <template #body-cell-payment_status="props">
          <q-td :props="props">
            <span
              :class="
                props.row.payment_status === 'paid'
                  ? 'fin-badge fin-badge--success'
                  : 'fin-badge fin-badge--warning'
              "
              >{{ props.row.payment_status }}</span
            >
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              flat
              dense
              icon="visibility"
              size="sm"
              color="grey-5"
              @click="viewPayslip(props.row)"
              ><q-tooltip>View Payslip</q-tooltip></q-btn
            >
            <q-btn
              v-if="props.row.payment_status !== 'paid'"
              flat
              dense
              icon="payment"
              size="sm"
              color="green-5"
              @click="openPaymentDialog(props.row)"
              ><q-tooltip>Mark Paid</q-tooltip></q-btn
            >
            <q-btn flat dense icon="print" size="sm" color="blue-4" @click="printPayslip(props.row)"
              ><q-tooltip>Print</q-tooltip></q-btn
            >
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- Payslip Detail Dialog -->
    <q-dialog v-model="showPayslip" class="fin-dialog" maximized>
      <q-card dark style="background: #161b22">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6 text-white">
            Payslip — {{ sel?.employees?.first_name }} {{ sel?.employees?.last_name }}
          </div>
          <q-space />
          <q-btn
            flat
            dense
            icon="print"
            color="blue-4"
            @click="printPayslip(sel)"
            class="q-mr-sm"
          />
          <q-btn flat dense icon="close" color="grey-5" v-close-popup />
        </q-card-section>
        <q-card-section>
          <div ref="payslipPrintArea" class="payslip-print-area">
            <div class="payslip-header">
              <div class="payslip-company">SEVEN WAVES RESTAURANT</div>
              <div class="payslip-title">PAYSLIP</div>
              <div class="payslip-period">
                Period: {{ selectedCycleData?.period_start }} to {{ selectedCycleData?.period_end }}
              </div>
            </div>
            <div class="payslip-info row q-col-gutter-md q-mt-sm">
              <div class="col-6">
                <div>
                  <strong class="text-grey-4">Employee:</strong>
                  <span class="text-white"
                    >{{ sel?.employees?.first_name }} {{ sel?.employees?.last_name }}</span
                  >
                </div>
                <div>
                  <strong class="text-grey-4">Code:</strong>
                  <span class="text-white">{{ sel?.employees?.employee_code }}</span>
                </div>
                <div>
                  <strong class="text-grey-4">Designation:</strong>
                  <span class="text-white">{{ sel?.employees?.designations?.title || '-' }}</span>
                </div>
              </div>
              <div class="col-6">
                <div>
                  <strong class="text-grey-4">Payment Status:</strong>
                  <span :class="sel?.payment_status === 'paid' ? 'text-green-4' : 'text-orange'">{{
                    sel?.payment_status?.toUpperCase()
                  }}</span>
                </div>
                <div>
                  <strong class="text-grey-4">Payment Date:</strong>
                  <span class="text-white">{{ sel?.payment_date || '-' }}</span>
                </div>
                <div>
                  <strong class="text-grey-4">Reference:</strong>
                  <span class="text-white">{{ sel?.payment_reference || '-' }}</span>
                </div>
              </div>
            </div>

            <q-separator dark class="q-my-md" />

            <div class="row q-col-gutter-md">
              <!-- Earnings -->
              <div class="col-6">
                <div class="text-subtitle2 text-blue-4 q-mb-xs">EARNINGS</div>
                <div class="payslip-line">
                  <span>Basic Salary</span><span>{{ fmt(sel?.basic_salary) }}</span>
                </div>
                <div class="payslip-line">
                  <span>Total Allowances</span><span>{{ fmt(sel?.total_allowances) }}</span>
                </div>
                <div class="payslip-line" v-if="sel?.overtime_amount > 0">
                  <span>Overtime</span><span>{{ fmt(sel?.overtime_amount) }}</span>
                </div>
                <div class="payslip-line" v-if="sel?.commission > 0">
                  <span>Commission</span><span>{{ fmt(sel?.commission) }}</span>
                </div>
                <div v-for="item in earningsLineItems" :key="item.id" class="payslip-line">
                  <span>{{ item.description }}</span
                  ><span class="text-green-4">{{ fmt(item.amount) }}</span>
                </div>
                <div class="payslip-total">
                  <span>Gross Pay</span
                  ><span class="text-weight-bold">{{ fmt(sel?.gross_salary) }}</span>
                </div>
              </div>

              <!-- Deductions -->
              <div class="col-6">
                <div class="text-subtitle2 text-red-4 q-mb-xs">DEDUCTIONS</div>
                <div v-for="item in deductionLineItems" :key="item.id" class="payslip-line">
                  <span>{{ item.description }}</span
                  ><span class="text-red-4">{{ fmt(item.amount) }}</span>
                </div>
                <div v-if="!deductionLineItems.length" class="payslip-line">
                  <span class="text-grey-5">No deductions</span><span>0.00</span>
                </div>
                <div class="payslip-total">
                  <span>Total Deductions</span
                  ><span class="text-red-4 text-weight-bold">{{ fmt(sel?.total_deductions) }}</span>
                </div>
              </div>
            </div>

            <q-separator dark class="q-my-md" />
            <div class="payslip-net">
              <span>NET SALARY</span>
              <span class="text-green-4">{{ fmt(sel?.net_salary) }}</span>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Payment Dialog -->
    <q-dialog v-model="showPaymentDialog" class="fin-dialog">
      <q-card dark style="min-width: 400px; background: #161b22; border: 1px solid #30363d">
        <q-card-section
          ><div class="text-subtitle1 text-white">
            Record Payment — {{ paymentTarget?.employees?.first_name }}
            {{ paymentTarget?.employees?.last_name }}
          </div></q-card-section
        >
        <q-card-section class="fin-form">
          <div class="text-h6 text-green-4 q-mb-md text-center">
            {{ fmt(paymentTarget?.net_salary) }}
          </div>
          <q-select
            v-model="paymentForm.payment_method"
            :options="['bank_transfer', 'cash', 'cheque', 'mobile_wallet']"
            label="Payment Method *"
            dense
            dark
            outlined
            class="q-mb-sm"
          />
          <q-input
            v-model="paymentForm.bank_reference"
            label="Bank Reference / Txn ID"
            dense
            dark
            outlined
            class="q-mb-sm"
          />
          <q-input
            v-model="paymentForm.payment_date"
            label="Payment Date"
            type="date"
            dense
            dark
            outlined
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            unelevated
            label="Mark as Paid"
            color="green-8"
            icon="check"
            @click="recordPayment"
            :loading="paymentLoading"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Notify } from 'quasar'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import {
  fetchPayrollCycles,
  fetchPayrollRecords,
  markPayrollRecordPaid,
  createPayrollPayment,
} from 'src/services/financeService'

const route = useRoute()
const loading = ref(false)
const paymentLoading = ref(false)
const cycles = ref([])
const records = ref([])
const selectedCycle = ref(null)
const selectedCycleData = ref(null)
const showPayslip = ref(false)
const sel = ref(null)
const showPaymentDialog = ref(false)
const paymentTarget = ref(null)
const cycleOptions = ref([])

const paymentForm = ref({
  payment_method: 'bank_transfer',
  bank_reference: '',
  payment_date: new Date().toISOString().split('T')[0],
})

const totalNet = computed(() => records.value.reduce((s, r) => s + Number(r.net_salary || 0), 0))
const paidCount = computed(() => records.value.filter((r) => r.payment_status === 'paid').length)
const pendingAmount = computed(() =>
  records.value
    .filter((r) => r.payment_status !== 'paid')
    .reduce((s, r) => s + Number(r.net_salary || 0), 0),
)
const earningsLineItems = computed(() =>
  (sel.value?.payroll_line_items || []).filter((i) => i.line_type !== 'deduction'),
)
const deductionLineItems = computed(() =>
  (sel.value?.payroll_line_items || []).filter((i) => i.line_type === 'deduction'),
)

const columns = [
  {
    name: 'code',
    label: 'Code',
    field: (row) => row.employees?.employee_code || '-',
    align: 'left',
    style: 'width: 80px',
  },
  {
    name: 'name',
    label: 'Employee',
    field: (row) => `${row.employees?.first_name || ''} ${row.employees?.last_name || ''}`.trim(),
    align: 'left',
  },
  {
    name: 'designation',
    label: 'Designation',
    field: (row) => row.employees?.designations?.title || '-',
    align: 'left',
  },
  { name: 'basic', label: 'Basic', field: 'basic_salary', align: 'right', format: (v) => fmt(v) },
  { name: 'gross', label: 'Gross', field: 'gross_salary', align: 'right', format: (v) => fmt(v) },
  {
    name: 'deductions',
    label: 'Deductions',
    field: 'total_deductions',
    align: 'right',
    format: (v) => fmt(v),
  },
  { name: 'net', label: 'Net', field: 'net_salary', align: 'right', format: (v) => fmt(v) },
  {
    name: 'payment_status',
    label: 'Status',
    field: 'payment_status',
    align: 'center',
    style: 'width: 90px',
  },
  { name: 'actions', label: '', align: 'center', style: 'width: 120px' },
]

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
}
function viewPayslip(row) {
  sel.value = row
  showPayslip.value = true
}
function openPaymentDialog(row) {
  paymentTarget.value = row
  showPaymentDialog.value = true
}

function printPayslip(row) {
  sel.value = row
  showPayslip.value = true
  setTimeout(() => {
    const printContent = document.querySelector('.payslip-print-area')
    if (!printContent) return
    const w = window.open('', '_blank', 'width=800,height=600')
    w.document
      .write(`<html><head><title>Payslip - ${row.employees?.first_name} ${row.employees?.last_name}</title>
      <style>body{font-family:'Segoe UI',sans-serif;padding:24px;background:#fff;color:#111}
      .payslip-header{text-align:center;margin-bottom:16px}.payslip-company{font-size:20px;font-weight:700}
      .payslip-title{font-size:16px;color:#666}.payslip-period{font-size:12px;color:#888}
      .payslip-line{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dotted #ddd;font-size:13px}
      .payslip-total{display:flex;justify-content:space-between;padding:8px 0;font-weight:700;border-top:2px solid #333;margin-top:8px}
      .payslip-net{display:flex;justify-content:space-between;padding:12px;font-size:18px;font-weight:700;background:#f0fdf4;border:2px solid #16a34a;border-radius:8px}
      .row{display:flex;gap:24px}.col-6{flex:1}strong{color:#555}
      .text-red-4{color:#c71c1c}.text-green-4{color:#16a34a}
      </style></head><body>${printContent.innerHTML}</body></html>`)
    w.document.close()
    w.print()
  }, 300)
}

async function recordPayment() {
  if (!paymentTarget.value) return
  paymentLoading.value = true
  try {
    // Mark record as paid
    const { error } = await markPayrollRecordPaid(paymentTarget.value.id, paymentForm.value)
    if (error) throw error

    // Create payment record
    await createPayrollPayment({
      cycle_id: selectedCycle.value,
      record_id: paymentTarget.value.id,
      employee_id: paymentTarget.value.employee_id,
      amount: paymentTarget.value.net_salary,
      payment_method: paymentForm.value.payment_method,
      bank_reference: paymentForm.value.bank_reference,
      payment_date: paymentForm.value.payment_date,
      status: 'completed',
    })

    Notify.create({ type: 'positive', message: 'Payment recorded' })
    showPaymentDialog.value = false
    await loadRecords()
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || 'Payment failed' })
  } finally {
    paymentLoading.value = false
  }
}

async function markAllPaid() {
  const pending = records.value.filter((r) => r.payment_status !== 'paid')
  for (const r of pending) {
    await markPayrollRecordPaid(r.id, {
      payment_method: 'bank_transfer',
      payment_date: new Date().toISOString().split('T')[0],
    })
  }
  Notify.create({ type: 'positive', message: `${pending.length} records marked as paid` })
  await loadRecords()
}

async function loadRecords() {
  if (!selectedCycle.value) {
    records.value = []
    return
  }
  loading.value = true
  selectedCycleData.value = cycles.value.find((c) => c.id === selectedCycle.value)
  const { data } = await fetchPayrollRecords(selectedCycle.value)
  records.value = data || []
  loading.value = false
}

async function loadData() {
  loading.value = true
  const { data } = await fetchPayrollCycles()
  cycles.value = data || []
  cycleOptions.value = cycles.value.map((c) => ({
    id: c.id,
    label: `${c.cycle_name} (${c.period_start} → ${c.period_end})`,
  }))
  if (route.query.cycle) {
    selectedCycle.value = route.query.cycle
    await loadRecords()
  }
  loading.value = false
}
onMounted(loadData)
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';

.payslip-print-area {
  max-width: 700px;
  margin: 0 auto;
}
.payslip-header {
  text-align: center;
}
.payslip-company {
  font-size: 22px;
  font-weight: 700;
  color: #60a5fa;
  letter-spacing: 1px;
}
.payslip-title {
  font-size: 15px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 3px;
}
.payslip-period {
  font-size: 12px;
  color: #6b7280;
}
.payslip-line {
  display: flex;
  justify-content: space-between;
  padding: 5px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 13px;
  color: #d1d5db;
}
.payslip-total {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-weight: 700;
  border-top: 2px solid #374151;
  margin-top: 8px;
  color: #f3f4f6;
}
.payslip-net {
  display: flex;
  justify-content: space-between;
  padding: 16px;
  font-size: 20px;
  font-weight: 700;
  background: rgba(16, 185, 129, 0.08);
  border: 2px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px;
  color: #f3f4f6;
}
</style>
