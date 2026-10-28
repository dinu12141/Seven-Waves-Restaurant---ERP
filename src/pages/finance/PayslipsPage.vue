<template>
  <q-page class="q-pa-md finance-page">
    <FinancePageHeader
      icon="receipt_long"
      subtitle="Employee payslips, payment status and references"
      title="Payslips"
      breadcrumbs="Finance / Payroll / Payslips"
      show-refresh
      @refresh="loadData"
    />

    <div class="fin-filters q-mb-md">
      <q-select
        v-model="selectedCycle"
        :options="cycleOptions"
        label="Payroll Run"
        dense
        outlined
        style="min-width: 320px"
        emit-value
        map-options
        option-value="id"
        option-label="label"
        @update:model-value="loadRecords"
        clearable
      />
      <q-btn
        v-if="selectedCycleData"
        flat
        dense
        no-caps
        icon="account_balance"
        color="green-5"
        label="Post run to GL"
        to="/finance/payroll/run"
      />
    </div>

    <!-- KPIs -->
    <div v-if="selectedCycle && records.length" class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-3">
        <div class="fin-kpi-card fin-kpi-card--green">
          <div class="fin-kpi-card__icon">
            <q-icon name="payments" size="20px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Total Net</div>
            <div class="fin-kpi-card__value">{{ fmt(summary.net) }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-3">
        <div class="fin-kpi-card fin-kpi-card--blue">
          <div class="fin-kpi-card__icon">
            <q-icon name="check_circle" size="20px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Posted to GL (paid)</div>
            <div class="fin-kpi-card__value">{{ summary.posted }} / {{ records.length }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-3">
        <div class="fin-kpi-card fin-kpi-card--amber">
          <div class="fin-kpi-card__icon">
            <q-icon name="pending" size="20px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Pending GL posting</div>
            <div class="fin-kpi-card__value">{{ fmt(summary.pendingNet) }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-3">
        <div class="fin-kpi-card fin-kpi-card--red">
          <div class="fin-kpi-card__icon">
            <q-icon name="pause_circle" size="20px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">On hold ({{ summary.held }})</div>
            <div class="fin-kpi-card__value">{{ fmt(summary.heldNet) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Payslips ({{ records.length }})</span>
      </div>
      <q-table
        :rows="records"
        :columns="columns"
        row-key="id"
        flat
        dense
        :rows-per-page-options="[20, 50, 0]"
        class="fin-table"
        :loading="loading"
        no-data-label="Select a payroll run to view payslips"
      >
        <template #body-cell-payment_status="props">
          <q-td :props="props">
            <span :class="slipStatus(props.row).cls">{{ slipStatus(props.row).label }}</span>
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
              v-if="isSlipPosted(props.row)"
              flat
              dense
              icon="receipt_long"
              size="sm"
              color="green-5"
              @click="openPaymentDialog(props.row)"
              ><q-tooltip>Record bank / cash reference</q-tooltip></q-btn
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
      <q-card style="background: var(--erp-bg-card)">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">Payslip — {{ empName(sel) }}</div>
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
          <div class="payslip-print-area">
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
                  <strong class="text-grey-6">Employee:</strong>
                  <span class="">{{ empName(sel) }}</span>
                </div>
                <div>
                  <strong class="text-grey-6">Code:</strong>
                  <span class="">{{ sel?.employees?.employee_code }}</span>
                </div>
                <div>
                  <strong class="text-grey-6">Designation:</strong>
                  <span class="">{{ sel?.employees?.designations?.title || '-' }}</span>
                </div>
              </div>
              <div class="col-6">
                <div>
                  <strong class="text-grey-6">Payment Status:</strong>
                  <span :class="isSlipPosted(sel) ? 'text-green-4' : 'text-orange'">{{
                    slipStatus(sel).label.toUpperCase()
                  }}</span>
                </div>
                <div>
                  <strong class="text-grey-6">Payment Date:</strong>
                  <span class="">{{
                    sel?.payment_date || (sel?.paid_at || '').slice(0, 10) || '-'
                  }}</span>
                </div>
                <div>
                  <strong class="text-grey-6">Reference:</strong>
                  <span class="">{{ sel?.payment_reference || '-' }}</span>
                </div>
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="row q-col-gutter-md">
              <!-- Earnings -->
              <div class="col-6">
                <div class="text-subtitle2 text-blue-4 q-mb-xs">EARNINGS</div>
                <div v-for="item in selLines.earnings" :key="'e' + item.label" class="payslip-line">
                  <span>{{ item.label }}</span><span>{{ fmt(item.amount) }}</span>
                </div>
                <div class="payslip-total">
                  <span>Gross Pay</span
                  ><span class="text-weight-bold">{{ fmt(sel?.gross_salary) }}</span>
                </div>
              </div>

              <!-- Deductions -->
              <div class="col-6">
                <div class="text-subtitle2 text-red-4 q-mb-xs">DEDUCTIONS</div>
                <div v-for="item in selLines.deductions" :key="'d' + item.label" class="payslip-line">
                  <span>{{ item.label }}</span
                  ><span class="text-red-4">{{ fmt(item.amount) }}</span>
                </div>
                <div v-if="!selLines.deductions.length" class="payslip-line">
                  <span class="text-grey-5">No deductions</span><span>0.00</span>
                </div>
                <div class="payslip-total">
                  <span>Total Deductions</span
                  ><span class="text-red-4 text-weight-bold">{{ fmt(sel?.total_deductions) }}</span>
                </div>
              </div>
            </div>

            <q-separator class="q-my-md" />
            <div class="payslip-net">
              <span>NET SALARY</span>
              <span class="text-green-4">{{ fmt(sel?.net_salary) }}</span>
            </div>
            <div class="payslip-line q-mt-sm">
              <span class="text-grey-5">Employer EPF (12%) / ETF (3%)</span>
              <span class="text-grey-5"
                >{{ fmt(sel?.epf_employer) }} / {{ fmt(sel?.etf_employer) }}</span
              >
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Payment reference dialog (GL already booked by the run posting) -->
    <q-dialog v-model="showPaymentDialog" class="fin-dialog">
      <q-card style="width: 400px; max-width: 95vw; background: var(--erp-bg-card); border: 1px solid var(--erp-border)">
        <q-card-section
          ><div class="text-subtitle1">Payment reference — {{ empName(paymentTarget) }}</div>
          <div class="text-caption text-grey-5">
            Booked to the GL on {{ (paymentTarget?.finance_posted_at || '').slice(0, 10) }}. This only
            records the bank / cash reference — it does not post anything again.
          </div></q-card-section
        >
        <q-card-section class="fin-form">
          <div class="text-h6 text-green-4 q-mb-md text-center">
            {{ fmt(paymentTarget?.net_salary) }}
          </div>
          <q-select
            v-model="paymentForm.payment_method"
            :options="['bank_transfer', 'cash', 'cheque']"
            label="Payment Method *"
            dense
            outlined
            class="q-mb-sm"
          />
          <q-input
            v-model="paymentForm.payment_reference"
            label="Bank Reference / Txn ID / Cheque No"
            dense
            outlined
            class="q-mb-sm"
          />
          <q-input
            v-model="paymentForm.payment_date"
            label="Payment Date"
            type="date"
            dense
            outlined
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            unelevated
            label="Save reference"
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
import { todayLK } from 'src/modules/finance/utils/finance-dates'
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Notify } from 'quasar'
import FinancePageHeader from 'src/modules/finance/components/FinancePageHeader.vue'
import { useAuthStore } from 'stores/auth'
import {
  financePayrollService,
  summarizeRunSlips,
  payslipLines,
  isSlipPosted,
  isSlipHeld,
} from 'src/modules/finance/services/finance-payroll.service'

const route = useRoute()
const authStore = useAuthStore()
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
  payment_reference: '',
  payment_date: todayLK(),
})

const summary = computed(() => summarizeRunSlips(records.value))
const selLines = computed(() => payslipLines(sel.value))

const columns = [
  {
    name: 'code',
    label: 'Code',
    field: (row) => row.employees?.employee_code || '-',
    align: 'left',
    style: 'width: 80px',
  },
  { name: 'name', label: 'Employee', field: (row) => empName(row), align: 'left' },
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
    style: 'width: 120px',
  },
  { name: 'actions', label: '', align: 'center', style: 'width: 120px' },
]

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
function empName(row) {
  const e = row?.employees
  if (!e) return ''
  return e.full_name || `${e.first_name || ''} ${e.last_name || ''}`.trim()
}
function slipStatus(row) {
  if (!row) return { label: '', cls: '' }
  if (row.payment_status === 'cancelled')
    return { label: 'cancelled', cls: 'fin-badge fin-badge--muted' }
  if (isSlipPosted(row)) return { label: 'paid · in GL', cls: 'fin-badge fin-badge--success' }
  if (isSlipHeld(row)) return { label: 'held', cls: 'fin-badge fin-badge--danger' }
  // Marked paid in HR but not yet booked: the run posting will book it.
  if (row.payment_status === 'paid')
    return { label: 'paid · not in GL', cls: 'fin-badge fin-badge--warning' }
  return { label: 'pending GL', cls: 'fin-badge fin-badge--warning' }
}
function viewPayslip(row) {
  sel.value = row
  showPayslip.value = true
}
function openPaymentDialog(row) {
  paymentTarget.value = row
  paymentForm.value = {
    payment_method: row.payment_method || 'bank_transfer',
    payment_reference: row.payment_reference || '',
    payment_date:
      row.payment_date ||
      (row.finance_posted_at || '').slice(0, 10) ||
      todayLK(),
  }
  showPaymentDialog.value = true
}

function printPayslip(row) {
  sel.value = row
  showPayslip.value = true
  setTimeout(() => {
    const printContent = document.querySelector('.payslip-print-area')
    if (!printContent) return
    const w = window.open('', '_blank', 'width=800,height=600')
    if (!w) return
    w.document.write(`<html><head><title>Payslip - ${empName(row)}</title>
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
    await financePayrollService.recordSlipPaymentReference(
      paymentTarget.value,
      paymentForm.value,
      authStore.user?.id || null,
    )
    Notify.create({ type: 'positive', message: 'Payment reference saved' })
    showPaymentDialog.value = false
    await loadRecords()
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || 'Could not save the reference' })
  } finally {
    paymentLoading.value = false
  }
}

async function loadRecords() {
  if (!selectedCycle.value) {
    records.value = []
    selectedCycleData.value = null
    return
  }
  loading.value = true
  selectedCycleData.value = cycles.value.find((c) => c.id === selectedCycle.value) || null
  try {
    records.value = await financePayrollService.fetchRunPayslips(selectedCycle.value)
  } catch (e) {
    records.value = []
    Notify.create({ type: 'negative', message: `Could not load payslips: ${e.message || e}` })
  } finally {
    loading.value = false
  }
}

async function loadData() {
  loading.value = true
  try {
    cycles.value = await financePayrollService.listRuns()
    cycleOptions.value = cycles.value.map((c) => ({
      id: c.id,
      label: `${c.cycle_name}${c.branch_name ? ' · ' + c.branch_name : ''} (${c.period_start} → ${c.period_end}) · ${c.status}`,
    }))
  } catch (e) {
    Notify.create({ type: 'negative', message: `Could not load payroll runs: ${e.message || e}` })
  } finally {
    loading.value = false
  }
  if (route.query.cycle) selectedCycle.value = route.query.cycle
  if (selectedCycle.value) await loadRecords()
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
