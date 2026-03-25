<template>
  <q-page class="q-pa-md">
    <ERPToolbar moduleName="hr" title="Payroll" breadcrumbs="Human Resources / Payroll" />

    <div class="row items-center q-mb-md q-gutter-sm">
      <q-btn
        color="primary"
        icon="play_arrow"
        label="Run Payroll"
        @click="showRunDialog = true"
        no-caps
      />
      <q-space />
      <q-select
        dark
        dense
        outlined
        v-model="statusFilter"
        :options="['All', 'Draft', 'Processing', 'Processed', 'Approved', 'Paid']"
        label="Status"
        style="width: 160px"
      />
    </div>

    <q-table
      dark
      flat
      bordered
      :rows="runs"
      :columns="runColumns"
      row-key="id"
      :loading="loading"
      :pagination="{ rowsPerPage: 10 }"
      class="erp-data-grid"
    >
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge
            :color="runStatusColor(props.row.status)"
            :label="props.row.status"
            class="text-capitalize"
          />
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn
            flat
            dense
            icon="visibility"
            color="primary"
            size="sm"
            @click="viewRun(props.row)"
            label="View"
            no-caps
          />
          <q-btn
            v-if="props.row.status === 'processed'"
            flat
            dense
            icon="check"
            color="green"
            size="sm"
            @click="finalApprove(props.row)"
            label="Approve"
            no-caps
          />
        </q-td>
      </template>
    </q-table>

    <!-- Run Payroll Dialog -->
    <q-dialog v-model="showRunDialog" persistent>
      <q-card style="min-width: 450px; background: var(--erp-bg-form-card, #111827); color: #fff">
        <q-card-section><div class="text-h6">Run Monthly Payroll</div></q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input
            dark
            outlined
            v-model="payrollMonth"
            label="Payroll Month"
            type="month"
            hint="e.g. 2026-03"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup color="grey" no-caps />
          <q-btn
            color="primary"
            label="Process"
            icon="play_arrow"
            @click="runPayroll"
            :loading="processing"
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Payslips Dialog -->
    <q-dialog v-model="showPayslips" maximized>
      <q-card style="background: var(--erp-bg-page, #0b0f19); color: #fff">
        <q-bar class="bg-grey-10">
          <q-icon name="payments" />
          <div class="q-ml-sm text-weight-bold">
            Payroll: {{ selectedRun?.period_start }} — {{ selectedRun?.period_end }}
          </div>
          <q-space /><q-btn dense flat icon="close" @click="showPayslips = false" />
        </q-bar>
        <q-card-section>
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-3">
              <q-card flat class="erp-stat-card q-pa-md">
                <div class="text-caption text-grey-5">Total Gross</div>
                <div class="text-h5 text-weight-bold text-green">
                  LKR {{ fmt(selectedRun?.total_gross) }}
                </div>
              </q-card>
            </div>
            <div class="col-3">
              <q-card flat class="erp-stat-card q-pa-md">
                <div class="text-caption text-grey-5">Total Deductions</div>
                <div class="text-h5 text-weight-bold text-red">
                  LKR {{ fmt(selectedRun?.total_deductions) }}
                </div>
              </q-card>
            </div>
            <div class="col-3">
              <q-card flat class="erp-stat-card q-pa-md">
                <div class="text-caption text-grey-5">Total Net</div>
                <div class="text-h5 text-weight-bold text-blue">
                  LKR {{ fmt(selectedRun?.total_net) }}
                </div>
              </q-card>
            </div>
            <div class="col-3">
              <q-card flat class="erp-stat-card q-pa-md">
                <div class="text-caption text-grey-5">Employees</div>
                <div class="text-h5 text-weight-bold">{{ selectedRun?.employee_count }}</div>
              </q-card>
            </div>
          </div>
          <q-table
            dark
            flat
            bordered
            :rows="payslips"
            :columns="payslipColumns"
            row-key="id"
            :pagination="{ rowsPerPage: 50 }"
            class="erp-data-grid"
          >
            <template #body-cell-employee="props">
              <q-td :props="props">
                <div class="text-weight-bold">{{ props.row.employees?.full_name }}</div>
                <div class="text-caption text-grey-5">{{ props.row.employees?.employee_code }}</div>
              </q-td>
            </template>
            <template #body-cell-status="props">
              <q-td :props="props">
                <q-badge
                  :color="
                    props.row.is_held
                      ? 'red'
                      : props.row.payment_status === 'paid'
                        ? 'green'
                        : 'amber'
                  "
                  :label="props.row.is_held ? 'HELD' : props.row.payment_status"
                  class="text-capitalize"
                />
              </q-td>
            </template>
            <template #body-cell-details="props">
              <q-td :props="props" class="q-gutter-xs">
                <q-btn
                  flat
                  dense
                  icon="receipt_long"
                  color="cyan"
                  size="xs"
                  no-caps
                  @click="viewBreakdown(props.row)"
                >
                  <q-tooltip>View Breakdown</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  dense
                  icon="picture_as_pdf"
                  color="red-4"
                  size="xs"
                  no-caps
                  @click="downloadPayslipPDF(props.row)"
                >
                  <q-tooltip>Download PDF</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  dense
                  icon="email"
                  color="blue-4"
                  size="xs"
                  no-caps
                  @click="sendPayslipEmail(props.row)"
                  :loading="sendingEmail === props.row.id"
                >
                  <q-tooltip>Send to Email</q-tooltip>
                </q-btn>
              </q-td>
            </template>
          </q-table>
        </q-card-section>
      </q-card>
    </q-dialog>
    <!-- Payslip Breakdown Dialog -->
    <q-dialog v-model="showBreakdown">
      <q-card
        style="width: 680px; max-width: 95vw; background: var(--erp-bg-page, #0b0f19); color: #fff"
      >
        <q-bar class="bg-grey-10">
          <q-icon name="receipt_long" color="cyan" />
          <div class="q-ml-sm text-weight-bold">
            Payslip Breakdown — {{ selectedPayslip?.employees?.full_name }}
          </div>
          <q-space />
          <q-btn dense flat icon="close" @click="showBreakdown = false" />
        </q-bar>

        <q-card-section v-if="loadingBreakdown" class="text-center q-pa-xl">
          <q-spinner size="40px" color="amber" />
          <div class="q-mt-sm text-grey-5">Loading breakdown…</div>
        </q-card-section>

        <q-card-section v-else-if="breakdown" class="q-gutter-md">
          <!-- Earnings -->
          <div>
            <div class="text-subtitle2 text-weight-bold text-green row items-center q-mb-sm">
              <q-icon name="trending_up" class="q-mr-xs" /> Earnings
            </div>
            <q-markup-table
              dark
              flat
              bordered
              dense
              separator="cell"
              style="background: rgba(255, 255, 255, 0.02)"
            >
              <tbody>
                <tr v-for="item in breakdown.earnings" :key="item.label">
                  <td class="text-grey-4 text-caption">{{ item.label }}</td>
                  <td class="text-right text-white text-weight-medium text-caption">
                    LKR {{ fmt(item.amount) }}
                  </td>
                </tr>
                <tr style="border-top: 2px solid rgba(34, 197, 94, 0.4)">
                  <td class="text-green text-weight-bold text-caption">Gross Salary</td>
                  <td class="text-right text-green text-weight-bold text-caption">
                    LKR {{ fmt(breakdown.gross) }}
                  </td>
                </tr>
              </tbody>
            </q-markup-table>
          </div>

          <!-- Deductions -->
          <div>
            <div class="text-subtitle2 text-weight-bold text-red row items-center q-mb-sm">
              <q-icon name="trending_down" class="q-mr-xs" /> Deductions
            </div>
            <q-markup-table
              dark
              flat
              bordered
              dense
              separator="cell"
              style="background: rgba(255, 255, 255, 0.02)"
            >
              <tbody>
                <tr v-for="item in breakdown.deductions" :key="item.label">
                  <td class="text-grey-4 text-caption">{{ item.label }}</td>
                  <td class="text-right text-red-3 text-caption">LKR {{ fmt(item.amount) }}</td>
                </tr>
                <tr style="border-top: 2px solid rgba(59, 130, 246, 0.5)">
                  <td class="text-white text-weight-bold text-caption">Net Salary</td>
                  <td class="text-right text-blue text-weight-bold text-caption">
                    LKR {{ fmt(breakdown.net) }}
                  </td>
                </tr>
              </tbody>
            </q-markup-table>
          </div>

          <!-- Employer Contributions (informational) -->
          <div v-if="breakdown.employer_contributions && breakdown.employer_contributions.length">
            <div class="text-subtitle2 text-weight-bold text-grey-5 row items-center q-mb-sm">
              <q-icon name="business" class="q-mr-xs" /> Employer Contributions
              <q-badge
                color="grey-7"
                label="informational"
                class="q-ml-sm"
                style="font-size: 10px"
              />
            </div>
            <q-markup-table
              dark
              flat
              bordered
              dense
              separator="cell"
              style="background: rgba(255, 255, 255, 0.02)"
            >
              <tbody>
                <tr v-for="item in breakdown.employer_contributions" :key="item.label">
                  <td class="text-grey-5 text-caption">{{ item.label }}</td>
                  <td class="text-right text-grey-4 text-caption">LKR {{ fmt(item.amount) }}</td>
                </tr>
              </tbody>
            </q-markup-table>
          </div>
        </q-card-section>

        <q-card-section v-else class="text-center text-grey-5 q-pa-xl">
          No breakdown data available for this payslip.
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import ERPToolbar from 'src/components/erp/ERPToolbar.vue'
import { ref, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const $q = useQuasar()
const authStore = useAuthStore()
const loading = ref(false)
const processing = ref(false)
const runs = ref([])
const payslips = ref([])
const statusFilter = ref('All')
const showRunDialog = ref(false)
const showPayslips = ref(false)
const selectedRun = ref(null)
const payrollMonth = ref('')
const showBreakdown = ref(false)
const selectedPayslip = ref(null)
const breakdown = ref(null)
const loadingBreakdown = ref(false)
const sendingEmail = ref(null)

const fmt = (v) => Number(v || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })

const runColumns = [
  {
    name: 'period',
    label: 'Period',
    align: 'left',
    field: (r) => `${r.period_start} — ${r.period_end}`,
  },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
  { name: 'employees', label: 'Employees', align: 'center', field: 'employee_count' },
  {
    name: 'gross',
    label: 'Gross (LKR)',
    align: 'right',
    field: 'total_gross',
    format: (v) => fmt(v),
  },
  { name: 'net', label: 'Net (LKR)', align: 'right', field: 'total_net', format: (v) => fmt(v) },
  { name: 'actions', label: '', align: 'center' },
]

const payslipColumns = [
  { name: 'employee', label: 'Employee', align: 'left', field: (r) => r.employees?.full_name },
  { name: 'basic', label: 'Basic', align: 'right', field: 'basic_salary', format: (v) => fmt(v) },
  {
    name: 'allowances',
    label: 'Allowances',
    align: 'right',
    field: 'total_allowances',
    format: (v) => fmt(v),
  },
  { name: 'ot', label: 'OT', align: 'right', field: 'overtime_amount', format: (v) => fmt(v) },
  {
    name: 'commission',
    label: 'Commission',
    align: 'right',
    field: 'commission_amount',
    format: (v) => fmt(v),
  },
  { name: 'gross', label: 'Gross', align: 'right', field: 'gross_salary', format: (v) => fmt(v) },
  {
    name: 'deductions',
    label: 'Deductions',
    align: 'right',
    field: 'total_deductions',
    format: (v) => fmt(v),
  },
  { name: 'net', label: 'Net Salary', align: 'right', field: 'net_salary', format: (v) => fmt(v) },
  { name: 'status', label: 'Status', align: 'center', field: 'payment_status' },
  { name: 'details', label: 'Actions', align: 'center', field: 'id' },
]

function runStatusColor(s) {
  return (
    {
      draft: 'grey',
      processing: 'amber',
      processed: 'blue',
      approved: 'teal',
      paid: 'green',
      cancelled: 'red',
    }[s] || 'grey'
  )
}

async function loadRuns() {
  loading.value = true
  const branchId = authStore.currentBranch?.id
  let q = supabase
    .from('payroll_runs')
    .select('*')
    .eq('branch_id', branchId)
    .order('period_start', { ascending: false })
  if (statusFilter.value !== 'All') q = q.eq('status', statusFilter.value.toLowerCase())
  const { data } = await q
  runs.value = data || []
  loading.value = false
}

async function runPayroll() {
  if (!payrollMonth.value) {
    $q.notify({ type: 'warning', message: 'Select a month' })
    return
  }
  processing.value = true
  try {
    const { data, error } = await supabase.rpc('process_monthly_payroll', {
      p_branch_id: authStore.currentBranch?.id,
      p_period_month: payrollMonth.value + '-01',
    })
    if (error) throw error
    if (data?.success === false) throw new Error(data.error)
    $q.notify({ type: 'positive', message: `Payroll processed: ${data.employee_count} employees` })
    showRunDialog.value = false
    loadRuns()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    processing.value = false
  }
}

async function viewRun(run) {
  selectedRun.value = run
  const { data } = await supabase
    .from('payslips')
    .select('*, employees(full_name, employee_code, email)')
    .eq('payroll_run_id', run.id)
    .order('net_salary', { ascending: false })
  payslips.value = data || []
  showPayslips.value = true
}

async function finalApprove(run) {
  $q.dialog({
    title: 'Final Approval',
    message: 'Approve and mark all payslips as PAID?',
    cancel: true,
    persistent: true,
    dark: true,
  }).onOk(async () => {
    try {
      const { data, error } = await supabase.rpc('approve_salary_final', {
        p_payroll_run_id: run.id,
      })
      if (error) throw error
      if (data?.success === false) throw new Error(data.error)
      $q.notify({ type: 'positive', message: 'Payroll approved and paid' })
      loadRuns()
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message })
    }
  })
}

async function viewBreakdown(payslip) {
  selectedPayslip.value = payslip
  breakdown.value = null
  showBreakdown.value = true
  loadingBreakdown.value = true
  try {
    const { data, error } = await supabase.rpc('get_payslip_breakdown', {
      p_payslip_id: payslip.id,
    })
    if (error) throw error
    breakdown.value = data
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to load breakdown: ' + err.message })
  } finally {
    loadingBreakdown.value = false
  }
}

async function downloadPayslipPDF(payslip) {
  // Fetch full breakdown for PDF content
  let bd = null
  try {
    const { data, error } = await supabase.rpc('get_payslip_breakdown', {
      p_payslip_id: payslip.id,
    })
    if (error) throw error
    bd = data
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Could not load payslip data: ' + err.message })
    return
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = margin

  // ── Header ─────────────────────────────────────────────────────────────
  doc.setFillColor(17, 24, 39)
  doc.rect(0, 0, pageW, 30, 'F')
  doc.setFontSize(16)
  doc.setTextColor(249, 168, 37)
  doc.setFont('helvetica', 'bold')
  doc.text('PAYSLIP', pageW / 2, 13, { align: 'center' })
  doc.setFontSize(9)
  doc.setTextColor(156, 163, 175)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `${selectedRun.value?.period_start || ''} — ${selectedRun.value?.period_end || ''}`,
    pageW / 2,
    21,
    { align: 'center' },
  )
  y = 38

  // ── Employee Info ────────────────────────────────────────────────────────
  doc.setFontSize(10)
  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'bold')
  doc.text('Employee Details', margin, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  const empName = bd.employee || payslip.employees?.full_name || '—'
  const empCode = bd.code || payslip.employees?.employee_code || '—'
  const empDesig = bd.designation || '—'
  const daysWorked = bd.days_worked ?? '—'
  const daysAbsent = bd.days_absent ?? '—'
  const lateMin = bd.late_minutes ?? '—'

  const infoRows = [
    ['Employee Name', empName, 'Employee Code', empCode],
    ['Designation', empDesig, 'Days Worked', daysWorked],
    ['Days Absent', daysAbsent, 'Late (min)', lateMin],
  ]
  autoTable(doc, {
    startY: y,
    head: [],
    body: infoRows,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [80, 80, 80], cellWidth: 40 },
      1: { cellWidth: 55 },
      2: { fontStyle: 'bold', textColor: [80, 80, 80], cellWidth: 40 },
      3: { cellWidth: 45 },
    },
    margin: { left: margin, right: margin },
  })
  y = doc.lastAutoTable.finalY + 6

  // ── Earnings & Deductions side-by-side ─────────────────────────────────
  const earnings = (bd.earnings || []).filter((e) => Number(e.amount) !== 0)
  const deductions = (bd.deductions || []).filter((d) => Number(d.amount) !== 0)

  const earningRows = earnings.map((e) => [e.label, fmt(e.amount)])
  const deductionRows = deductions.map((d) => [d.label, fmt(d.amount)])

  earningRows.push(['', ''])
  earningRows.push(['GROSS SALARY', fmt(bd.gross)])
  deductionRows.push(['', ''])
  deductionRows.push(['TOTAL DEDUCTIONS', fmt(bd.total_deductions ?? bd.gross - bd.net)])

  // Left table – Earnings
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(34, 197, 94)
  doc.text('EARNINGS', margin, y)
  doc.setTextColor(239, 68, 68)
  doc.text('DEDUCTIONS', pageW / 2 + 2, y)
  y += 3

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Amount (LKR)']],
    body: earningRows,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: margin, right: pageW / 2 + 1 },
    didDrawCell: (data) => {
      if (data.row.index === earningRows.length - 1) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
      }
    },
  })

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Amount (LKR)']],
    body: deductionRows,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: pageW / 2 + 2, right: margin },
  })

  y = Math.max(doc.lastAutoTable.finalY, doc.lastAutoTable.finalY) + 4

  // ── Net Salary Banner ───────────────────────────────────────────────────
  doc.setFillColor(17, 24, 39)
  doc.rect(margin, y, pageW - margin * 2, 12, 'F')
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('NET SALARY:', margin + 4, y + 8)
  doc.setTextColor(96, 165, 250)
  doc.text('LKR ' + fmt(bd.net), pageW - margin - 4, y + 8, { align: 'right' })
  y += 18

  // ── Employer Contributions ──────────────────────────────────────────────
  const empContribs = (bd.employer_contributions || []).filter((c) => Number(c.amount) !== 0)
  if (empContribs.length) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 100, 100)
    doc.text('EMPLOYER CONTRIBUTIONS (Informational):', margin, y)
    y += 3
    autoTable(doc, {
      startY: y,
      body: empContribs.map((c) => [c.label, fmt(c.amount)]),
      theme: 'plain',
      styles: { fontSize: 8, textColor: [120, 120, 120] },
      columnStyles: { 1: { halign: 'right' } },
      margin: { left: margin, right: margin },
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ── Signature Line ──────────────────────────────────────────────────────
  y = Math.max(y, 240)
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, margin + 60, y)
  doc.line(pageW - margin - 60, y, pageW - margin, y)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text('Employee Signature', margin, y + 5)
  doc.text('Authorized Signatory', pageW - margin - 60, y + 5)

  // ── Footer ──────────────────────────────────────────────────────────────
  doc.setFontSize(7)
  doc.setTextColor(160, 160, 160)
  doc.text('Generated by Restaurant ERP • Confidential', pageW / 2, 290, { align: 'center' })

  // Save
  const filename = `Payslip_${empCode}_${selectedRun.value?.period_start || 'period'}.pdf`
  doc.save(filename)
  $q.notify({ type: 'positive', message: `Payslip downloaded: ${filename}` })
}

async function sendPayslipEmail(payslip) {
  const empName = payslip.employees?.full_name || 'Employee'
  const empEmail = payslip.employees?.email

  if (!empEmail) {
    $q.notify({ type: 'warning', message: `No email address on file for ${empName}` })
    return
  }

  sendingEmail.value = payslip.id
  try {
    const { error } = await supabase.functions.invoke('send-payslip', {
      body: {
        payslip_id: payslip.id,
        period_start: selectedRun.value?.period_start,
        period_end: selectedRun.value?.period_end,
      },
    })
    if (error) throw error
    $q.notify({ type: 'positive', message: `Payslip sent to ${empEmail}` })
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Email failed: ' + (err.message || 'Unknown error') })
  } finally {
    sendingEmail.value = null
  }
}

watch(statusFilter, () => loadRuns())
onMounted(() => loadRuns())
</script>

<style scoped>
.erp-data-grid {
  background: var(--erp-bg-form-card, #111827);
  border-radius: 12px;
}
.erp-stat-card {
  background: var(--erp-bg-form-card, #111827);
  border: 1px solid var(--erp-input-border, #374151);
  border-radius: 12px;
}
</style>
