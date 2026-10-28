<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5 text-weight-bold">Procurement Reports</div>
    </div>

    <q-card flat bordered :style="{ borderTop: '3px solid #f9a825' }">
      <q-tabs
        v-model="activeTab"
        dense
        align="left"
        active-color="amber-9"
        indicator-color="amber-9"
        narrow-indicator
        no-caps
        class="text-weight-medium"
      >
        <q-tab name="statement" label="Supplier Statement" icon="description" />
        <q-tab name="aging" label="AP Aging" icon="access_time" />
        <q-tab name="po_grn" label="PO vs GRN" icon="compare_arrows" />
        <q-tab name="summary" label="Supplier Summary" icon="summarize" />
      </q-tabs>
      <q-separator />

      <q-tab-panels v-model="activeTab" animated style="background: transparent">

        <!-- ══ TAB 1: SUPPLIER STATEMENT ══════════════════════════════════ -->
        <q-tab-panel name="statement" class="q-pa-md">
          <div class="row items-center justify-between q-mb-md">
            <div class="row q-col-gutter-md items-end col-grow">
              <div class="col-12 col-md-4">
                <div class="text-caption q-mb-xs text-weight-medium">Supplier</div>
                <q-select
                  v-model="statementSupplier"
                  :options="supplierOptions"
                  option-label="name"
                  option-value="id"
                  emit-value
                  map-options
                  outlined
                  dense
                  clearable
                  placeholder="Select supplier"
                  use-input
                  input-debounce="0"
                  @filter="filterSuppliers"
                />
              </div>
              <div class="col-6 col-md-3">
                <div class="text-caption q-mb-xs text-weight-medium">From</div>
                <q-input v-model="statementFrom" type="date" outlined dense />
              </div>
              <div class="col-6 col-md-3">
                <div class="text-caption q-mb-xs text-weight-medium">To</div>
                <q-input v-model="statementTo" type="date" outlined dense />
              </div>
              <div class="col-12 col-md-2">
                <q-btn
                  unelevated
                  color="amber-8"
                  text-color="dark"
                  icon="search"
                  label="Generate"
                  no-caps
                  class="full-width"
                  :loading="loadingStatement"
                  :disable="!statementSupplier"
                  @click="loadStatement"
                />
              </div>
            </div>
            <div class="row q-gutter-sm q-ml-sm" v-if="statementRows.length > 0">
              <q-btn
                flat dense icon="print" label="Print" color="grey-8" no-caps
                @click="printReport(statementCols, statementRows, 'Supplier Statement', statementSubtitle)"
              />
              <q-btn
                flat dense icon="picture_as_pdf" label="Export PDF" color="negative" no-caps
                @click="exportPDF(statementCols, statementRows, 'Supplier_Statement', statementSubtitle)"
              />
              <q-btn
                flat dense icon="table_view" label="Export Excel" color="positive" no-caps
                @click="exportExcel(statementCols, statementRows, 'Supplier_Statement')"
              />
            </div>
          </div>

          <!-- Summary chips -->
          <div v-if="statementRows.length > 0" class="row q-col-gutter-sm q-mb-md">
            <div class="col-auto">
              <q-chip color="blue-grey-7" text-color="white" dense>
                Total Invoiced: {{ fmtCur(statementTotals.amount) }}
              </q-chip>
            </div>
            <div class="col-auto">
              <q-chip color="green-7" text-color="white" dense>
                Total Paid: {{ fmtCur(statementTotals.paid) }}
              </q-chip>
            </div>
            <div class="col-auto">
              <q-chip :color="statementTotals.balance > 0 ? 'red-7' : 'green-7'" text-color="white" dense>
                Balance: {{ fmtCur(statementTotals.balance) }}
              </q-chip>
            </div>
          </div>

          <q-table
            :rows="statementRows"
            :columns="statementCols"
            row-key="id"
            flat
            bordered
            dense
            :loading="loadingStatement"
            :rows-per-page-options="[20, 50, 0]"
          >
            <template #body-cell-status="props">
              <q-td :props="props">
                <q-chip
                  dense
                  size="sm"
                  :color="
                    props.row.status === 'paid'
                      ? 'green'
                      : props.row.status === 'partial'
                        ? 'orange'
                        : 'red-5'
                  "
                  text-color="white"
                >
                  {{ props.row.status }}
                </q-chip>
              </q-td>
            </template>
            <template #bottom-row>
              <q-tr class="bg-grey-2 text-weight-bold">
                <q-td>TOTAL</q-td>
                <q-td />
                <q-td class="text-right">{{ fmtCur(statementTotals.amount) }}</q-td>
                <q-td class="text-right">{{ fmtCur(statementTotals.paid) }}</q-td>
                <q-td class="text-right">{{ fmtCur(statementTotals.balance) }}</q-td>
                <q-td />
              </q-tr>
            </template>
            <template #no-data>
              <div class="full-width row justify-center text-grey q-pa-md">
                {{ statementSupplier ? 'No invoices found for this period' : 'Select a supplier to view statement' }}
              </div>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ TAB 2: AP AGING ══════════════════════════════════════════════ -->
        <q-tab-panel name="aging" class="q-pa-md">
          <div class="row items-center justify-between q-mb-md">
            <div class="text-subtitle1 text-weight-bold">Accounts Payable Aging</div>
            <div class="row q-gutter-sm">
              <q-btn
                unelevated
                color="amber-8"
                text-color="dark"
                icon="refresh"
                label="Refresh"
                no-caps
                :loading="loadingAging"
                @click="loadAging"
              />
              <template v-if="agingRows.length > 0">
                <q-btn
                  flat dense icon="print" label="Print" color="grey-8" no-caps
                  @click="printReport(agingCols, agingRows, 'AP Aging', agingSubtitle)"
                />
                <q-btn
                  flat dense icon="picture_as_pdf" label="Export PDF" color="negative" no-caps
                  @click="exportPDF(agingCols, agingRows, 'AP_Aging', agingSubtitle)"
                />
                <q-btn
                  flat dense icon="table_view" label="Export Excel" color="positive" no-caps
                  @click="exportExcel(agingCols, agingRows, 'AP_Aging')"
                />
              </template>
            </div>
          </div>

          <!-- Aging buckets summary -->
          <div class="row q-col-gutter-md q-mb-lg">
            <div v-for="bucket in agingBuckets" :key="bucket.label" class="col-6 col-md-3">
              <q-card flat bordered>
                <q-card-section class="text-center q-pa-sm">
                  <div class="text-caption text-weight-bold q-mb-xs" :class="`text-${bucket.color}`">
                    {{ bucket.label }}
                  </div>
                  <div class="text-h6 text-weight-bold" :class="`text-${bucket.color}`">
                    {{ fmtCur(bucket.total) }}
                  </div>
                  <div class="text-caption text-grey">{{ bucket.count }} invoice(s)</div>
                </q-card-section>
              </q-card>
            </div>
          </div>

          <q-table
            :rows="agingRows"
            :columns="agingCols"
            row-key="id"
            flat
            bordered
            dense
            :loading="loadingAging"
            :rows-per-page-options="[20, 50, 0]"
          >
            <template #body-cell-bucket="props">
              <q-td :props="props">
                <q-chip
                  dense
                  size="sm"
                  :color="agingBucketColor(props.row.days_overdue)"
                  text-color="white"
                >
                  {{ agingBucketLabel(props.row.days_overdue) }}
                </q-chip>
              </q-td>
            </template>
            <template #body-cell-balance_due="props">
              <q-td :props="props" class="text-right text-weight-bold text-red-6">
                {{ fmtCur(props.row.balance_due) }}
              </q-td>
            </template>
            <template #bottom-row>
              <q-tr class="bg-grey-2 text-weight-bold">
                <q-td>TOTAL</q-td>
                <q-td />
                <q-td />
                <q-td class="text-right">{{ fmtCur(agingTotals.total) }}</q-td>
                <q-td class="text-right">{{ fmtCur(agingTotals.paid) }}</q-td>
                <q-td class="text-right text-red-6">{{ fmtCur(agingTotals.balance) }}</q-td>
                <q-td />
                <q-td />
              </q-tr>
            </template>
            <template #no-data>
              <div class="full-width row justify-center text-grey q-pa-md">
                No outstanding AP invoices
              </div>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ TAB 3: PO vs GRN SUMMARY ════════════════════════════════════ -->
        <q-tab-panel name="po_grn" class="q-pa-md">
          <div class="row q-col-gutter-md q-mb-md items-end">
            <div class="col-6 col-md-3">
              <div class="text-caption q-mb-xs text-weight-medium">From</div>
              <q-input v-model="poGrnFrom" type="date" outlined dense />
            </div>
            <div class="col-6 col-md-3">
              <div class="text-caption q-mb-xs text-weight-medium">To</div>
              <q-input v-model="poGrnTo" type="date" outlined dense />
            </div>
            <div class="col-12 col-md-2">
              <q-btn
                unelevated
                color="amber-8"
                text-color="dark"
                icon="search"
                label="Load"
                no-caps
                class="full-width"
                :loading="loadingPoGrn"
                @click="loadPoGrn"
              />
            </div>
            <div class="col-12 col-md-3 row q-gutter-sm" v-if="poGrnRows.length > 0">
              <q-btn
                flat dense icon="print" label="Print" color="grey-8" no-caps
                @click="printReport(poGrnCols, poGrnRows, 'PO vs GRN', poGrnSubtitle)"
              />
              <q-btn
                flat dense icon="picture_as_pdf" label="Export PDF" color="negative" no-caps
                @click="exportPDF(poGrnCols, poGrnRows, 'PO_vs_GRN', poGrnSubtitle)"
              />
              <q-btn
                flat dense icon="table_view" label="Export Excel" color="positive" no-caps
                @click="exportExcel(poGrnCols, poGrnRows, 'PO_vs_GRN')"
              />
            </div>
          </div>

          <q-table
            :rows="poGrnRows"
            :columns="poGrnCols"
            row-key="id"
            flat
            bordered
            dense
            :loading="loadingPoGrn"
            :rows-per-page-options="[20, 50, 0]"
          >
            <template #body-cell-variance="props">
              <q-td
                :props="props"
                class="text-right text-weight-bold"
                :class="props.row.variance < 0 ? 'text-red-6' : props.row.variance > 0 ? 'text-orange-7' : 'text-green-6'"
              >
                {{ fmtCur(props.row.variance) }}
              </q-td>
            </template>
            <template #bottom-row>
              <q-tr class="bg-grey-2 text-weight-bold">
                <q-td>TOTAL</q-td>
                <q-td />
                <q-td />
                <q-td class="text-right">{{ fmtCur(poGrnTotals.poAmount) }}</q-td>
                <q-td class="text-right">{{ fmtCur(poGrnTotals.received) }}</q-td>
                <q-td class="text-right">{{ fmtCur(poGrnTotals.variance) }}</q-td>
                <q-td />
              </q-tr>
            </template>
            <template #no-data>
              <div class="full-width row justify-center text-grey q-pa-md">
                No purchase orders found for this period
              </div>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ TAB 4: SUPPLIER SUMMARY ═══════════════════════════════════════ -->
        <q-tab-panel name="summary" class="q-pa-md">
          <div class="row items-center justify-between q-mb-md">
            <div class="row q-col-gutter-md items-end col-grow">
              <div class="col-6 col-md-3">
                <div class="text-caption q-mb-xs text-weight-medium">From</div>
                <q-input v-model="summaryFrom" type="date" outlined dense />
              </div>
              <div class="col-6 col-md-3">
                <div class="text-caption q-mb-xs text-weight-medium">To</div>
                <q-input v-model="summaryTo" type="date" outlined dense />
              </div>
              <div class="col-12 col-md-2">
                <q-btn
                  unelevated
                  color="amber-8"
                  text-color="dark"
                  icon="search"
                  label="Load"
                  no-caps
                  class="full-width"
                  :loading="loadingSummary"
                  @click="loadSummary"
                />
              </div>
            </div>
            <div class="row q-gutter-sm q-ml-sm" v-if="summaryRows.length > 0">
              <q-btn
                flat dense icon="print" label="Print" color="grey-8" no-caps
                @click="printReport(summaryCols, summaryRows, 'Supplier Summary', summarySubtitle)"
              />
              <q-btn
                flat dense icon="picture_as_pdf" label="Export PDF" color="negative" no-caps
                @click="exportPDF(summaryCols, summaryRows, 'Supplier_Summary', summarySubtitle)"
              />
              <q-btn
                flat dense icon="table_view" label="Export Excel" color="positive" no-caps
                @click="exportExcel(summaryCols, summaryRows, 'Supplier_Summary')"
              />
            </div>
          </div>

          <!-- Grand totals chips -->
          <div v-if="summaryRows.length > 0" class="row q-col-gutter-sm q-mb-md">
            <div class="col-auto">
              <q-chip color="blue-grey-7" text-color="white" dense>
                Total Invoiced: {{ fmtCur(summaryTotals.total_invoiced) }}
              </q-chip>
            </div>
            <div class="col-auto">
              <q-chip color="green-7" text-color="white" dense>
                Total Paid: {{ fmtCur(summaryTotals.total_paid) }}
              </q-chip>
            </div>
            <div class="col-auto">
              <q-chip :color="summaryTotals.total_due > 0 ? 'red-7' : 'green-7'" text-color="white" dense>
                Total Due: {{ fmtCur(summaryTotals.total_due) }}
              </q-chip>
            </div>
            <div class="col-auto">
              <q-chip color="deep-orange-7" text-color="white" dense>
                Overdue Invoices: {{ summaryTotals.overdue_count }}
              </q-chip>
            </div>
          </div>

          <q-table
            :rows="summaryRows"
            :columns="summaryCols"
            row-key="supplier_id"
            flat
            bordered
            dense
            :loading="loadingSummary"
            :rows-per-page-options="[20, 50, 0]"
          >
            <template #body-cell-total_due="props">
              <q-td :props="props" class="text-right text-weight-bold" :class="props.row.total_due > 0 ? 'text-red-6' : 'text-green-6'">
                {{ fmtCur(props.row.total_due) }}
              </q-td>
            </template>
            <template #body-cell-overdue_count="props">
              <q-td :props="props" class="text-center">
                <q-chip v-if="props.row.overdue_count > 0" dense size="sm" color="red-5" text-color="white">
                  {{ props.row.overdue_count }}
                </q-chip>
                <span v-else>0</span>
              </q-td>
            </template>
            <template #bottom-row>
              <q-tr class="bg-grey-2 text-weight-bold">
                <q-td>TOTAL</q-td>
                <q-td class="text-right">{{ fmtCur(summaryTotals.total_invoiced) }}</q-td>
                <q-td class="text-right">{{ fmtCur(summaryTotals.total_paid) }}</q-td>
                <q-td class="text-right">{{ fmtCur(summaryTotals.total_due) }}</q-td>
                <q-td class="text-center">{{ summaryTotals.invoice_count }}</q-td>
                <q-td class="text-center">{{ summaryTotals.overdue_count }}</q-td>
              </q-tr>
            </template>
            <template #no-data>
              <div class="full-width row justify-center text-grey q-pa-md">
                No supplier invoices found for this period
              </div>
            </template>
          </q-table>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { getSupplierSummaryReport, localDateKey } from 'src/services/procurementService'
import { exportTableToExcel, exportTableToPDF, printTableAsPDF } from 'src/services/exportService'

const $q = useQuasar()

const activeTab = ref('statement')
const exporting = ref(false)

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCur(val) {
  return Number(val || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Shared Print / Export PDF / Export Excel handlers (matches SupplierPaymentReport.vue UX)
async function printReport(columns, rows, title, subtitle) {
  exporting.value = true
  try {
    await printTableAsPDF(columns, rows, title, subtitle)
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Print failed' })
  } finally {
    exporting.value = false
  }
}

async function exportPDF(columns, rows, title, subtitle) {
  exporting.value = true
  try {
    await exportTableToPDF(columns, rows, title, subtitle)
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'PDF export failed' })
  } finally {
    exporting.value = false
  }
}

function exportExcel(columns, rows, filename) {
  try {
    exportTableToExcel(columns, rows, filename)
    $q.notify({ type: 'positive', message: 'Excel exported successfully' })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Excel export failed' })
  }
}

// ── Supplier list ─────────────────────────────────────────────────────────────
const allSuppliers = ref([])
const supplierOptions = ref([])

onMounted(async () => {
  const { data } = await supabase.from('suppliers').select('id, name').eq('is_active', true).order('name')
  allSuppliers.value = data || []
  supplierOptions.value = allSuppliers.value
  loadAging()
  loadSummary()
})

function filterSuppliers(val, update) {
  update(() => {
    const q = val.toLowerCase()
    supplierOptions.value = q
      ? allSuppliers.value.filter((s) => s.name.toLowerCase().includes(q))
      : allSuppliers.value
  })
}

// ── TAB 1: Supplier Statement ─────────────────────────────────────────────────
const statementSupplier = ref(null)
const today = new Date()
const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
const todayStr = localDateKey(today) // local date (UTC+5:30 safe)
const statementFrom = ref(firstOfMonth)
const statementTo = ref(todayStr)
const loadingStatement = ref(false)
const statementRows = ref([])

const statementCols = [
  { name: 'doc_number', label: 'Invoice #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'doc_date', label: 'Invoice Date', field: 'doc_date', align: 'left', sortable: true },
  {
    name: 'total_amount',
    label: 'Amount',
    field: 'total_amount',
    align: 'right',
    format: (v) => fmtCur(v),
    sortable: true,
  },
  {
    name: 'paid_amount',
    label: 'Paid',
    field: 'paid_amount',
    align: 'right',
    format: (v) => fmtCur(v),
  },
  {
    name: 'balance_due',
    label: 'Balance',
    field: 'balance_due',
    align: 'right',
    format: (v) => fmtCur(v),
  },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
]

const statementSubtitle = computed(() => {
  const supplierName = allSuppliers.value.find((s) => s.id === statementSupplier.value)?.name
  return `Period: ${statementFrom.value} to ${statementTo.value}${supplierName ? ' | Supplier: ' + supplierName : ''}`
})

const statementTotals = computed(() => ({
  amount: statementRows.value.reduce((s, r) => s + Number(r.total_amount || 0), 0),
  paid: statementRows.value.reduce((s, r) => s + Number(r.paid_amount || 0), 0),
  balance: statementRows.value.reduce((s, r) => s + Number(r.balance_due || 0), 0),
}))

async function loadStatement() {
  if (!statementSupplier.value) return
  loadingStatement.value = true
  try {
    const { data, error } = await supabase
      .from('ap_invoices')
      .select('id, doc_number, doc_date, total_amount, paid_amount, balance_due, status')
      .eq('supplier_id', statementSupplier.value)
      .gte('doc_date', statementFrom.value)
      .lte('doc_date', statementTo.value)
      .order('doc_date')
    if (error) throw error
    statementRows.value = data || []
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to load supplier statement' })
  } finally {
    loadingStatement.value = false
  }
}

// ── TAB 2: AP Aging ───────────────────────────────────────────────────────────
const loadingAging = ref(false)
const agingRows = ref([])

const agingCols = [
  { name: 'supplier', label: 'Supplier', field: (r) => r.suppliers?.name || '—', align: 'left', sortable: true },
  { name: 'doc_number', label: 'Invoice #', field: 'doc_number', align: 'left' },
  { name: 'doc_date', label: 'Date', field: 'doc_date', align: 'left', sortable: true },
  {
    name: 'total_amount',
    label: 'Total',
    align: 'right',
    field: 'total_amount',
    format: (v) => fmtCur(v),
  },
  {
    name: 'paid_amount',
    label: 'Paid',
    align: 'right',
    field: 'paid_amount',
    format: (v) => fmtCur(v),
  },
  {
    name: 'balance_due',
    label: 'Balance Due',
    align: 'right',
    field: 'balance_due',
    format: (v) => fmtCur(v),
  },
  { name: 'days_overdue', label: 'Days', field: 'days_overdue', align: 'center', sortable: true },
  {
    name: 'bucket',
    label: 'Age Bucket',
    field: 'days_overdue',
    align: 'center',
    format: (v) => agingBucketLabel(v),
  },
]

const agingSubtitle = computed(() => `As of ${todayStr}`)

const agingTotals = computed(() => ({
  total: agingRows.value.reduce((s, r) => s + Number(r.total_amount || 0), 0),
  paid: agingRows.value.reduce((s, r) => s + Number(r.paid_amount || 0), 0),
  balance: agingRows.value.reduce((s, r) => s + Number(r.balance_due || 0), 0),
}))

function agingBucketLabel(days) {
  if (days <= 0) return 'Current'
  if (days <= 30) return '1-30 Days'
  if (days <= 60) return '31-60 Days'
  if (days <= 90) return '61-90 Days'
  return '90+ Days'
}

function agingBucketColor(days) {
  if (days <= 0) return 'green'
  if (days <= 30) return 'yellow-8'
  if (days <= 60) return 'orange'
  if (days <= 90) return 'deep-orange'
  return 'red'
}

const agingBuckets = computed(() => {
  const buckets = [
    { label: 'Current', color: 'green', key: (d) => d <= 0, total: 0, count: 0 },
    { label: '1-30 Days', color: 'yellow-8', key: (d) => d > 0 && d <= 30, total: 0, count: 0 },
    { label: '31-60 Days', color: 'orange', key: (d) => d > 30 && d <= 60, total: 0, count: 0 },
    { label: '61-90 Days', color: 'deep-orange', key: (d) => d > 60 && d <= 90, total: 0, count: 0 },
    { label: '90+ Days', color: 'red', key: (d) => d > 90, total: 0, count: 0 },
  ]
  agingRows.value.forEach((r) => {
    const d = Number(r.days_overdue || 0)
    buckets.forEach((b) => {
      if (b.key(d)) {
        b.total += Number(r.balance_due || 0)
        b.count++
      }
    })
  })
  return buckets
})

async function loadAging() {
  loadingAging.value = true
  try {
    const { data, error } = await supabase
      .from('ap_invoices')
      .select('id, doc_number, doc_date, total_amount, paid_amount, balance_due, status, suppliers(name)')
      .in('status', ['pending', 'partial', 'overdue'])
      .order('doc_date')
    if (error) throw error

    const today = new Date()
    agingRows.value = (data || []).map((r) => {
      const docDate = new Date(r.doc_date)
      const days = Math.floor((today - docDate) / (1000 * 60 * 60 * 24))
      return { ...r, days_overdue: days }
    })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to load AP aging' })
  } finally {
    loadingAging.value = false
  }
}

// ── TAB 3: PO vs GRN Summary ──────────────────────────────────────────────────
const poGrnFrom = ref(firstOfMonth)
const poGrnTo = ref(todayStr)
const loadingPoGrn = ref(false)
const poGrnRows = ref([])

const poGrnCols = [
  { name: 'doc_number', label: 'PO #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'doc_date', label: 'PO Date', field: 'doc_date', align: 'left', sortable: true },
  { name: 'supplier', label: 'Supplier', field: (r) => r.suppliers?.name || '—', align: 'left' },
  {
    name: 'total_amount',
    label: 'PO Amount',
    field: 'total_amount',
    align: 'right',
    format: (v) => fmtCur(v),
    sortable: true,
  },
  {
    name: 'received_amount',
    label: 'Received',
    field: 'received_amount',
    align: 'right',
    format: (v) => fmtCur(v),
  },
  {
    name: 'variance',
    label: 'Variance',
    field: 'variance',
    align: 'right',
    format: (v) => fmtCur(v),
  },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
]

const poGrnSubtitle = computed(() => `Period: ${poGrnFrom.value} to ${poGrnTo.value}`)

const poGrnTotals = computed(() => ({
  poAmount: poGrnRows.value.reduce((s, r) => s + Number(r.total_amount || 0), 0),
  received: poGrnRows.value.reduce((s, r) => s + Number(r.received_amount || 0), 0),
  variance: poGrnRows.value.reduce((s, r) => s + Number(r.variance || 0), 0),
}))

async function loadPoGrn() {
  loadingPoGrn.value = true
  try {
    // Load POs in date range
    const { data: poData, error: poErr } = await supabase
      .from('purchase_orders')
      .select('id, doc_number, doc_date, total_amount, status, suppliers(name)')
      .gte('doc_date', poGrnFrom.value)
      .lte('doc_date', poGrnTo.value)
      .order('doc_date')
    if (poErr) throw poErr

    // Load GRN totals per PO
    const poIds = (poData || []).map((p) => p.id)
    let grnByPo = {}
    if (poIds.length > 0) {
      const { data: grnData } = await supabase
        .from('goods_receipts')
        .select('po_id, total_amount')
        .in('po_id', poIds)
      ;(grnData || []).forEach((g) => {
        grnByPo[g.po_id] = (grnByPo[g.po_id] || 0) + Number(g.total_amount || 0)
      })
    }

    poGrnRows.value = (poData || []).map((po) => {
      const received = grnByPo[po.id] || 0
      return {
        ...po,
        received_amount: received,
        variance: Number(po.total_amount || 0) - received,
      }
    })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to load PO vs GRN data' })
  } finally {
    loadingPoGrn.value = false
  }
}

// ── TAB 4: Supplier Summary ────────────────────────────────────────────────────
const summaryFrom = ref(firstOfMonth)
const summaryTo = ref(todayStr)
const loadingSummary = ref(false)
const summaryRows = ref([])
const summaryTotals = ref({
  total_invoiced: 0,
  total_paid: 0,
  total_due: 0,
  invoice_count: 0,
  overdue_count: 0,
})

const summaryCols = [
  { name: 'supplier_name', label: 'Supplier', field: 'supplier_name', align: 'left', sortable: true },
  {
    name: 'total_invoiced',
    label: 'Total Invoiced',
    field: 'total_invoiced',
    align: 'right',
    format: (v) => fmtCur(v),
    sortable: true,
  },
  {
    name: 'total_paid',
    label: 'Total Paid',
    field: 'total_paid',
    align: 'right',
    format: (v) => fmtCur(v),
    sortable: true,
  },
  {
    name: 'total_due',
    label: 'Total Due',
    field: 'total_due',
    align: 'right',
    format: (v) => fmtCur(v),
    sortable: true,
  },
  { name: 'invoice_count', label: '# Invoices', field: 'invoice_count', align: 'center', sortable: true },
  { name: 'overdue_count', label: '# Overdue', field: 'overdue_count', align: 'center', sortable: true },
]

const summarySubtitle = computed(() => `Period: ${summaryFrom.value} to ${summaryTo.value}`)

async function loadSummary() {
  loadingSummary.value = true
  try {
    const { rows, totals } = await getSupplierSummaryReport({
      from_date: summaryFrom.value,
      to_date: summaryTo.value,
    })
    summaryRows.value = rows
    summaryTotals.value = totals
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to load supplier summary' })
  } finally {
    loadingSummary.value = false
  }
}
</script>
