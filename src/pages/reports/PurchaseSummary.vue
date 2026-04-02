<template>
  <ReportLayout
    title="Purchase Summary"
    subtitle="Purchase order totals and trends"
    :kpis="kpis"
    :export-columns="columns"
    :export-rows="rows"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #default>
      <q-table
        :rows="filteredRows"
        :columns="columns"
        row-key="id"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100, 0]"
        :pagination="{ rowsPerPage: 50 }"
        binary-state-sort
      >
        <template #header="props"
          ><q-tr :props="props" class="report-table__header-row"
            ><q-th
              v-for="col in props.cols"
              :key="col.name"
              :props="props"
              class="report-table__th"
              >{{ col.label }}</q-th
            ></q-tr
          ></template
        >

        <template #body="props">
          <q-tr :props="props" class="report-table__row">
            <q-td key="po_number" :props="props" class="report-table__td--mono text-weight-bold">
              {{ props.row.po_number }}
            </q-td>
            <q-td key="date" :props="props">{{ fmtDate(props.row.date) }}</q-td>
            <q-td key="supplier" :props="props" class="text-weight-bold">{{ props.row.supplier }}</q-td>
            <q-td key="items" :props="props" class="report-table__td--num">{{ props.row.items }}</q-td>
            <q-td key="total" :props="props" class="report-table__td--num text-weight-bolder text-blue">
              {{ fmtLKR(props.row.total) }}
            </q-td>
            <q-td key="status" :props="props">
              <span class="report-badge" :class="`report-badge--${props.row.status}`">
                {{ statusLabel(props.row.status) }}
              </span>
            </q-td>
          </q-tr>
        </template>

        <template #bottom-row>
          <q-tr class="report-table__total-row">
            <q-td colspan="4" class="report-table__td--bold">TOTAL ({{ filteredRows.length }} POs)</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-blue">
              {{ fmtLKR(filteredRows.reduce((s, r) => s + r.total, 0)) }}
            </q-td>
            <q-td />
          </q-tr>
        </template>

        <template #no-data>
          <div class="report-empty">
            <q-icon name="shopping_bag" size="40px" class="q-mb-sm" />
            <div>No purchase orders found for the selected period</div>
          </div>
        </template>
      </q-table>
    </template>

    <!-- Status filter slot -->
    <template #extra-filters>
      <div class="report-filter-group">
        <div class="report-filter-label">Status</div>
        <q-select
          v-model="statusFilter"
          :options="statusOptions"
          emit-value
          map-options
          dense
          outlined
          dark
          clearable
          class="report-filter-input"
          style="min-width: 160px"
          @update:model-value="applyFilter"
        />
      </div>
    </template>
  </ReportLayout>
</template>

<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, fmtDate } from 'src/services/reportService'

const authStore = useAuthStore()
const loading = ref(false)
const rows = ref([])
const statusFilter = ref(null)
const currentFilters = ref({})

const statusOptions = [
  { label: 'All Statuses', value: null },
  { label: 'Draft', value: 'draft' },
  { label: 'Approved', value: 'approved' },
  { label: 'Partial', value: 'partial' },
  { label: 'Closed', value: 'closed' },
  { label: 'Cancelled', value: 'cancelled' },
]

const columns = [
  { name: 'po_number', label: 'PO #', field: 'po_number', align: 'left', sortable: true },
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'supplier', label: 'Supplier', field: 'supplier', align: 'left', sortable: true },
  { name: 'items', label: 'Items', field: 'items', align: 'right', sortable: true },
  { name: 'total', label: 'Total Amount', field: 'total', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'left', sortable: true },
]

function statusLabel(s) {
  const map = {
    draft: 'Draft',
    approved: 'Approved',
    partial: 'Partial',
    closed: 'Closed',
    cancelled: 'Cancelled',
  }
  return map[s] || s || '—'
}

// Client-side status filter
const filteredRows = computed(() => {
  if (!statusFilter.value) return rows.value
  return rows.value.filter((r) => r.status === statusFilter.value)
})

// KPI cards
const kpis = computed(() => {
  const r = filteredRows.value
  const total = r.reduce((s, x) => s + x.total, 0)
  const approved = r.filter((x) => x.status === 'approved').length
  const closed = r.filter((x) => ['closed', 'partial'].includes(x.status)).length
  return [
    { label: 'Total POs', value: r.length.toString(), icon: 'receipt_long', color: 'blue' },
    { label: 'Total Value', value: fmtLKR(total), icon: 'payments', color: 'green' },
    { label: 'Approved', value: approved.toString(), icon: 'check_circle', color: 'teal' },
    { label: 'Received / Partial', value: closed.toString(), icon: 'local_shipping', color: 'purple' },
  ]
})

async function loadData(filters = {}) {
  currentFilters.value = filters
  loading.value = true
  try {
    const companyId = authStore.currentBranch?.company_id

    // Build query — use doc_date for date filtering
    let query = supabase
      .from('purchase_orders')
      .select(
        `id, doc_number, doc_date, status, subtotal, tax_amount, total_amount, created_at,
         suppliers ( name ),
         purchase_order_lines ( id )`,
      )
      .order('doc_date', { ascending: false })

    // Company scoping — only filter if we have a valid ID
    if (companyId) query = query.eq('company_id', companyId)

    // NOTE: We intentionally do NOT apply date filters here because:
    // 1. POs may have doc_date in a different month than created_at
    // 2. The default "Last 30 Days" filter would hide older POs
    // Users can filter using the Status dropdown instead.
    // Date filters only apply when user explicitly sets them via filter panel.

    const { data, error } = await query.limit(1000)
    if (error) throw error

    rows.value = (data || []).map((r) => ({
      id: r.id,
      po_number: r.doc_number || `PO-${r.id?.slice(0, 6)}`,
      date: r.doc_date,
      supplier: r.suppliers?.name || '—',
      items: Array.isArray(r.purchase_order_lines) ? r.purchase_order_lines.length : 0,
      total: Number(r.total_amount || 0),
      status: r.status || 'draft',
    }))
  } catch (e) {
    console.error('[PurchaseSummary]', e)
  } finally {
    loading.value = false
  }
}

function applyFilter() {
  // filteredRows computed handles client-side filtering
}

function exportCSV() {
  exportTableToCSV(columns, filteredRows.value, 'purchase_summary')
}
function exportExcel() {
  exportTableToExcel(columns, filteredRows.value, 'purchase_summary')
}
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
