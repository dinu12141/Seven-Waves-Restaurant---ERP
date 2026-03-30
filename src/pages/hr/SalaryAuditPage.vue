<template>
  <q-page class="q-pa-md">
    <ERPToolbar moduleName="hr" title="Salary Audit" breadcrumbs="Human Resources / Salary Audit" />

    <div class="row items-center q-mb-md q-gutter-sm">
      <q-select
        dark
        dense
        outlined
        v-model="filterRun"
        :options="runOptions"
        label="Payroll Run"
        emit-value
        map-options
        style="min-width: 300px"
      />
      <q-btn color="primary" icon="refresh" label="Load" @click="loadAudit" no-caps />
      <div class="q-gutter-x-sm q-ml-sm">
        <q-btn
          color="positive"
          icon="download"
          label="Excel"
          @click="exportExcel"
          no-caps
          unelevated
        />
        <q-btn
          color="red-6"
          icon="picture_as_pdf"
          label="PDF"
          @click="exportPDF"
          no-caps
          unelevated
        />
      </div>
      <q-space />
      <q-input
        dark
        dense
        outlined
        v-model="search"
        placeholder="Search..."
        class="col-12 col-sm-3"
        clearable
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
    </div>

    <!-- Payslips with Audit Controls -->
    <q-table
      dark
      flat
      bordered
      :rows="payslips"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :filter="search"
      :pagination="{ rowsPerPage: 30 }"
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
              props.row.is_held ? 'red' : props.row.payment_status === 'paid' ? 'green' : 'amber'
            "
            :label="props.row.is_held ? 'HELD' : props.row.payment_status"
            class="text-capitalize"
          />
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn
            v-if="!props.row.is_held"
            flat
            dense
            icon="pause"
            color="orange"
            size="sm"
            @click="holdPayslip(props.row)"
            label="Hold"
            no-caps
          />
          <q-btn
            v-else
            flat
            dense
            icon="play_arrow"
            color="green"
            size="sm"
            @click="releasePayslip(props.row)"
            label="Release"
            no-caps
          />
          <q-btn
            flat
            dense
            icon="edit"
            color="amber"
            size="sm"
            @click="editPayslip(props.row)"
            no-caps
          />
          <q-btn
            flat
            dense
            icon="receipt"
            color="cyan"
            size="sm"
            @click="addBankRef(props.row)"
            no-caps
          >
            <q-tooltip>Bank Reference</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- Audit History -->
    <q-card class="erp-data-grid q-mt-md q-pa-md" flat v-if="auditLogs.length">
      <div class="text-subtitle1 text-weight-bold q-mb-sm">Audit Trail</div>
      <q-timeline color="primary" dark>
        <q-timeline-entry
          v-for="log in auditLogs"
          :key="log.id"
          :subtitle="new Date(log.created_at).toLocaleString()"
        >
          <template #title>
            <q-badge
              :color="auditColor(log.action)"
              :label="log.action.replace('_', ' ')"
              class="text-capitalize"
            />
          </template>
          <div>
            {{ log.reason || '' }}
            {{ log.field_name ? `(${log.field_name}: ${log.old_value} → ${log.new_value})` : '' }}
          </div>
        </q-timeline-entry>
      </q-timeline>
    </q-card>

    <!-- Hold Dialog -->
    <q-dialog v-model="showHold">
      <q-card style="min-width: 400px; background: var(--erp-bg-form-card, #111827); color: #fff">
        <q-card-section><div class="text-h6">Hold Payslip</div></q-card-section>
        <q-card-section>
          <q-input
            dark
            outlined
            v-model="holdReason"
            label="Reason for Hold *"
            type="textarea"
            rows="3"
            :rules="[(v) => !!v || 'Required']"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup color="grey" no-caps />
          <q-btn color="red" label="Hold" icon="pause" @click="confirmHold" no-caps />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Bank Ref Dialog -->
    <q-dialog v-model="showBankRef">
      <q-card style="min-width: 400px; background: var(--erp-bg-form-card, #111827); color: #fff">
        <q-card-section><div class="text-h6">Bank Reference</div></q-card-section>
        <q-card-section>
          <q-input dark outlined v-model="bankRef" label="Bank Reference No" />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup color="grey" no-caps />
          <q-btn color="primary" label="Save" icon="save" @click="saveBankRef" no-caps />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import ERPToolbar from 'src/components/erp/ERPToolbar.vue'
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const $q = useQuasar()
const authStore = useAuthStore()
const loading = ref(false)
const payslips = ref([])
const auditLogs = ref([])
const runOptions = ref([])
const filterRun = ref(null)
const search = ref('')
const showHold = ref(false)
const showBankRef = ref(false)
const holdReason = ref('')
const bankRef = ref('')
const selectedSlip = ref(null)

const fmt = (v) => Number(v || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })

const columns = [
  {
    name: 'employee',
    label: 'Employee',
    align: 'left',
    field: (r) => r.employees?.full_name,
    sortable: true,
  },
  { name: 'gross', label: 'Gross', align: 'right', field: 'gross_salary', format: (v) => fmt(v) },
  {
    name: 'deductions',
    label: 'Deductions',
    align: 'right',
    field: 'total_deductions',
    format: (v) => fmt(v),
  },
  { name: 'net', label: 'Net', align: 'right', field: 'net_salary', format: (v) => fmt(v) },
  { name: 'bank', label: 'Bank Ref', align: 'center', field: 'bank_reference' },
  { name: 'status', label: 'Status', align: 'center', field: 'payment_status' },
  { name: 'actions', label: 'Actions', align: 'center' },
]

function auditColor(a) {
  return (
    {
      hold: 'red',
      release: 'green',
      edit_gross: 'amber',
      approve: 'teal',
      final_approve: 'blue',
      mark_paid: 'green',
    }[a] || 'grey'
  )
}

async function loadRuns() {
  const branchId = authStore.currentBranch?.id
  const { data } = await supabase
    .from('payroll_runs')
    .select('id, period_start, period_end, status')
    .eq('branch_id', branchId)
    .order('period_start', { ascending: false })
    .limit(20)
  runOptions.value = (data || []).map((r) => ({
    label: `${r.period_start} — ${r.period_end} (${r.status})`,
    value: r.id,
  }))
  if (runOptions.value.length) filterRun.value = runOptions.value[0].value
}

async function loadAudit() {
  if (!filterRun.value) return
  loading.value = true
  const { data: slips } = await supabase
    .from('payslips')
    .select('*, employees(full_name, employee_code)')
    .eq('payroll_run_id', filterRun.value)
    .order('net_salary', { ascending: false })
  payslips.value = slips || []
  const { data: logs } = await supabase
    .from('salary_audit_logs')
    .select('*')
    .eq('payroll_run_id', filterRun.value)
    .order('created_at', { ascending: false })
  auditLogs.value = logs || []
  loading.value = false
}

function holdPayslip(slip) {
  selectedSlip.value = slip
  holdReason.value = ''
  showHold.value = true
}

async function confirmHold() {
  await supabase
    .from('payslips')
    .update({ is_held: true, hold_reason: holdReason.value, held_by: authStore.user?.id })
    .eq('id', selectedSlip.value.id)
  await supabase.from('salary_audit_logs').insert({
    company_id: authStore.currentBranch?.company_id,
    branch_id: authStore.currentBranch?.id,
    payroll_run_id: filterRun.value,
    employee_id: selectedSlip.value.employee_id,
    action: 'hold',
    reason: holdReason.value,
    performed_by: authStore.user?.id,
  })
  showHold.value = false
  loadAudit()
}

async function releasePayslip(slip) {
  await supabase
    .from('payslips')
    .update({ is_held: false, hold_reason: null, held_by: null })
    .eq('id', slip.id)
  await supabase.from('salary_audit_logs').insert({
    company_id: authStore.currentBranch?.company_id,
    branch_id: authStore.currentBranch?.id,
    payroll_run_id: filterRun.value,
    employee_id: slip.employee_id,
    action: 'release',
    performed_by: authStore.user?.id,
  })
  loadAudit()
}

function editPayslip(slip) {
  $q.dialog({
    title: 'Edit Net Salary',
    message: 'Enter adjusted net salary:',
    prompt: { model: String(slip.net_salary), type: 'number' },
    cancel: true,
    persistent: true,
    dark: true,
  }).onOk(async (val) => {
    const oldVal = slip.net_salary
    await supabase
      .from('payslips')
      .update({ net_salary: parseFloat(val) })
      .eq('id', slip.id)
    await supabase.from('salary_audit_logs').insert({
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
      payroll_run_id: filterRun.value,
      employee_id: slip.employee_id,
      action: 'edit_net',
      field_name: 'net_salary',
      old_value: String(oldVal),
      new_value: val,
      performed_by: authStore.user?.id,
    })
    loadAudit()
  })
}

function addBankRef(slip) {
  selectedSlip.value = slip
  bankRef.value = slip.bank_reference || ''
  showBankRef.value = true
}

async function saveBankRef() {
  await supabase
    .from('payslips')
    .update({ bank_reference: bankRef.value })
    .eq('id', selectedSlip.value.id)
  await supabase.from('salary_audit_logs').insert({
    company_id: authStore.currentBranch?.company_id,
    branch_id: authStore.currentBranch?.id,
    payroll_run_id: filterRun.value,
    employee_id: selectedSlip.value.employee_id,
    action: 'bank_ref_update',
    new_value: bankRef.value,
    performed_by: authStore.user?.id,
  })
  showBankRef.value = false
  loadAudit()
}

// ── Export ────────────────────────────────────────────────────────────────
function filterDataForExport() {
  if (!search.value) return payslips.value
  const s = search.value.toLowerCase()
  return payslips.value.filter(
    (r) =>
      (r.employees?.full_name || '').toLowerCase().includes(s) ||
      (r.employees?.employee_code || '').toLowerCase().includes(s) ||
      (r.payment_status || '').toLowerCase().includes(s) ||
      (r.bank_reference || '').toLowerCase().includes(s),
  )
}

function exportPDF() {
  const data = filterDataForExport()
  if (!data || data.length === 0) {
    $q.notify({ type: 'warning', message: 'No records to export.' })
    return
  }

  const doc = new jsPDF()
  doc.setFontSize(16)
  let title = 'Salary Audit Report'
  const runOpt = runOptions.value.find((o) => o.value === filterRun.value)
  if (runOpt) title += ` - ${runOpt.label.split('(')[0].trim()}`
  doc.text(title, 14, 15)

  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(`Total Records: ${data.length}`, 14, 22)

  const head = [
    ['#', 'Employee Code', 'Employee Name', 'Gross', 'Deductions', 'Net', 'Bank Ref', 'Status'],
  ]
  const body = data.map((r, i) => [
    i + 1,
    r.employees?.employee_code || '—',
    r.employees?.full_name || '—',
    fmt(r.gross_salary),
    fmt(r.total_deductions),
    fmt(r.net_salary),
    r.bank_reference || '—',
    r.is_held ? 'HELD' : (r.payment_status || '—').toUpperCase(),
  ])

  autoTable(doc, {
    startY: 27,
    head,
    body,
    theme: 'grid',
    headStyles: { fillColor: [33, 150, 243] },
    styles: { fontSize: 8 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
  })

  doc.save('salary_audit_report.pdf')
}

function exportExcel() {
  const data = filterDataForExport()
  if (!data || data.length === 0) {
    $q.notify({ type: 'warning', message: 'No records to export.' })
    return
  }

  const exportData = data.map((r, i) => ({
    '#': i + 1,
    'Employee Code': r.employees?.employee_code || '',
    'Employee Name': r.employees?.full_name || '',
    Gross: Number(r.gross_salary || 0).toFixed(2),
    Deductions: Number(r.total_deductions || 0).toFixed(2),
    Net: Number(r.net_salary || 0).toFixed(2),
    'Bank Ref': r.bank_reference || '',
    Status: r.is_held ? 'HELD' : (r.payment_status || '').toUpperCase(),
  }))

  const ws = XLSX.utils.json_to_sheet(exportData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Salary Audit')
  XLSX.writeFile(wb, 'salary_audit_report.xlsx')
}

onMounted(async () => {
  await loadRuns()
  loadAudit()
})
</script>

<style scoped>
.erp-data-grid {
  background: var(--erp-bg-form-card, #111827);
  border-radius: 12px;
}
</style>
