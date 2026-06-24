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
      </q-tabs>
      <q-separator />

      <q-tab-panels v-model="activeTab" animated style="background: transparent">

        <!-- ══ TAB 1: SUPPLIER STATEMENT ══════════════════════════════════ -->
        <q-tab-panel name="statement" class="q-pa-md">
          <div class="row q-col-gutter-md q-mb-md items-end">
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
            <div class="col-12 col-md-2 row q-gutter-sm">
              <q-btn
                unelevated
                color="amber-8"
                text-color="dark"
                icon="search"
                label="Generate"
                no-caps
                :loading="loadingStatement"
                :disable="!statementSupplier"
                @click="loadStatement"
              />
              <q-btn
                v-if="statementRows.length > 0"
                outline
                color="positive"
                icon="download"
                label="CSV"
                no-caps
                @click="exportCSV(statementRows, statementCsvFields, 'supplier_statement')"
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
              <q-btn
                v-if="agingRows.length > 0"
                outline
                color="positive"
                icon="download"
                label="CSV"
                no-caps
                @click="exportCSV(agingRows, agingCsvFields, 'ap_aging')"
              />
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
            <div class="col-12 col-md-4 row q-gutter-sm">
              <q-btn
                unelevated
                color="amber-8"
                text-color="dark"
                icon="search"
                label="Load"
                no-caps
                :loading="loadingPoGrn"
                @click="loadPoGrn"
              />
              <q-btn
                v-if="poGrnRows.length > 0"
                outline
                color="positive"
                icon="download"
                label="CSV"
                no-caps
                @click="exportCSV(poGrnRows, poGrnCsvFields, 'po_vs_grn')"
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
            <template #no-data>
              <div class="full-width row justify-center text-grey q-pa-md">
                No purchase orders found for this period
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

const $q = useQuasar()

const activeTab = ref('statement')

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCur(val) {
  return Number(val || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function exportCSV(rows, fields, filename) {
  const header = fields.map((f) => f.label).join(',')
  const body = rows
    .map((r) =>
      fields
        .map((f) => {
          const v = typeof f.field === 'function' ? f.field(r) : r[f.field]
          return `"${String(v ?? '').replace(/"/g, '""')}"`
        })
        .join(','),
    )
    .join('\n')
  const csv = header + '\n' + body
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Supplier list ─────────────────────────────────────────────────────────────
const allSuppliers = ref([])
const supplierOptions = ref([])

onMounted(async () => {
  const { data } = await supabase.from('suppliers').select('id, name').eq('is_active', true).order('name')
  allSuppliers.value = data || []
  supplierOptions.value = allSuppliers.value
  loadAging()
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
const todayStr = today.toISOString().split('T')[0]
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

const statementCsvFields = [
  { label: 'Invoice #', field: 'doc_number' },
  { label: 'Invoice Date', field: 'doc_date' },
  { label: 'Amount', field: (r) => fmtCur(r.total_amount) },
  { label: 'Paid', field: (r) => fmtCur(r.paid_amount) },
  { label: 'Balance', field: (r) => fmtCur(r.balance_due) },
  { label: 'Status', field: 'status' },
]

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
  { name: 'balance_due', label: 'Balance Due', align: 'right', field: 'balance_due' },
  { name: 'days_overdue', label: 'Days', field: 'days_overdue', align: 'center', sortable: true },
  { name: 'bucket', label: 'Age Bucket', field: 'days_overdue', align: 'center' },
]

const agingCsvFields = [
  { label: 'Supplier', field: (r) => r.suppliers?.name || '' },
  { label: 'Invoice #', field: 'doc_number' },
  { label: 'Date', field: 'doc_date' },
  { label: 'Total', field: (r) => fmtCur(r.total_amount) },
  { label: 'Paid', field: (r) => fmtCur(r.paid_amount) },
  { label: 'Balance Due', field: (r) => fmtCur(r.balance_due) },
  { label: 'Days Overdue', field: 'days_overdue' },
  { label: 'Bucket', field: (r) => agingBucketLabel(r.days_overdue) },
]

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
  { name: 'variance', label: 'Variance', field: 'variance', align: 'right' },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
]

const poGrnCsvFields = [
  { label: 'PO #', field: 'doc_number' },
  { label: 'PO Date', field: 'doc_date' },
  { label: 'Supplier', field: (r) => r.suppliers?.name || '' },
  { label: 'PO Amount', field: (r) => fmtCur(r.total_amount) },
  { label: 'Received', field: (r) => fmtCur(r.received_amount) },
  { label: 'Variance', field: (r) => fmtCur(r.variance) },
  { label: 'Status', field: 'status' },
]

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
</script>
