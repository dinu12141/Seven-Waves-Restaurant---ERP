<template>
  <ReportLayout
    title="Void / Cancel / FOC Report"
    subtitle="All voided, cancelled, and FOC transactions with reasons"
    :kpis="kpiData"
    :export-columns="columns"
    :export-rows="rows"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #extra-filters>
      <div class="report-filter-group" style="min-width: 200px">
        <label class="report-filter-label">Status</label>
        <q-select
          v-model="extraFilters.status"
          :options="statusOptions"
          dense
          outlined
          emit-value
          map-options
          clearable
          placeholder="All"
          class="report-filter-input"
        />
      </div>
    </template>

    <template #default>
      <q-table
        :rows="rows"
        :columns="columns"
        row-key="id"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100]"
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
        <template #body="props"
          ><q-tr :props="props" class="report-table__row">
            <q-td key="bill_number" :props="props" class="report-table__td--mono">{{
              props.row.bill_number
            }}</q-td>
            <q-td key="invoice_no" :props="props">
              <a v-if="props.row.invoice_no" href="#" class="inv-link" @click.prevent="openInvoice(props.row)">
                {{ props.row.invoice_no }}
              </a>
              <span v-else class="text-grey">—</span>
            </q-td>
            <q-td key="date" :props="props">{{ fmtDateTime(props.row.date) }}</q-td>
            <q-td key="branch" :props="props">{{ props.row.branch }}</q-td>
            <q-td
              key="total"
              :props="props"
              class="report-table__td--num text-red text-weight-bold"
              >{{ fmtLKR(props.row.total) }}</q-td
            >
            <q-td key="status" :props="props">
              <span 
                class="report-badge" 
                :class="props.row.is_foc ? 'report-badge--served' : 'report-badge--cancelled'"
              >
                {{ props.row.is_foc ? 'FOC' : props.row.status }}
              </span>
            </q-td>
            <q-td key="cashier" :props="props">{{ props.row.cashier }}</q-td>
            <q-td key="payment_method" :props="props">{{ props.row.payment_method || '—' }}</q-td>
            <q-td key="reason" :props="props">{{ props.row.reason || '—' }}</q-td>
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td colspan="3" class="report-table__td--bold">TOTAL ({{ rows.length }} bills)</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-red">{{
              fmtLKR(totals.total)
            }}</q-td>
            <q-td colspan="3" /> </q-tr
        ></template>
        <template #no-data
          ><div class="report-empty">
            <q-icon name="cancel" size="40px" class="q-mb-sm" />
            <div>No void/cancelled bills</div>
          </div></template
        >
      </q-table>
    </template>
  </ReportLayout>

  <InvoiceViewDialog v-model="showInvoiceDialog" :invoice-id="selectedInvoiceId" :order-id="selectedOrderId" />
</template>
<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { dayEndExclusiveISO, dayStartISO, fetchAllRows } from 'src/services/reportFilters'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import InvoiceViewDialog from 'src/components/reports/InvoiceViewDialog.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, fmtDateTime, applyBranchSecurity } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])
const showInvoiceDialog = ref(false)
const selectedInvoiceId = ref(null)
const selectedOrderId = ref(null)

function openInvoice(row) {
  selectedInvoiceId.value = row.invoice_id || null
  selectedOrderId.value = row.id || null
  showInvoiceDialog.value = true
}
const extraFilters = ref({ status: null })
const statusOptions = [
  { label: 'All', value: null },
  { label: 'Void', value: 'void' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'FOC', value: 'foc' }
]
const columns = [
  { name: 'bill_number', label: 'Bill #', field: 'bill_number', align: 'left', sortable: true },
  { name: 'invoice_no', label: 'Invoice No', field: 'invoice_no', align: 'left', sortable: true },
  { name: 'date', label: 'Date & Time', field: 'date', align: 'left', sortable: true },
  { name: 'branch', label: 'Branch', field: 'branch', align: 'left', sortable: true },
  { name: 'total', label: 'Amount', field: 'total', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'left', sortable: true },
  { name: 'cashier', label: 'Cashier', field: 'cashier', align: 'left', sortable: true },
  { name: 'payment_method', label: 'Order Type', field: 'payment_method', align: 'left' },
  { name: 'reason', label: 'Reason', field: 'reason', align: 'left' },
]
const totals = computed(() => ({ total: rows.value.reduce((s, r) => s + r.total, 0) }))
const kpiData = computed(() => [
  { label: 'Total Void/Cancel/FOC', value: rows.value.length, icon: 'receipt_long', color: 'blue' },
  { label: 'Lost/Complimentary', value: fmtLKR(totals.value.total), icon: 'money_off', color: 'red' },
  {
    label: 'Void Bills',
    value: rows.value.filter((r) => r.status === 'void').length,
    icon: 'block',
    color: 'amber',
  },
  {
    label: 'FOC Bills',
    value: rows.value.filter((r) => r.is_foc).length,
    icon: 'card_giftcard',
    color: 'green',
  },
])
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('orders')
      .select(
        'id,order_number,created_at,total_amount,status,foc_reason,payment_method,order_type,branches(name),waiter:profiles!orders_waiter_id_fkey(full_name),invoices(id,invoice_no)',
      )
      
    if (extraFilters.value.status) {
      if (extraFilters.value.status === 'foc') {
        query = query.not('foc_reason', 'is', null)
      } else {
        query = query.eq('status', extraFilters.value.status)
      }
    } else {
      query = query.or('status.in.(cancelled,void),foc_reason.not.is.null')
    }
    
    if (filters.dateFrom) query = query.gte('created_at', dayStartISO(filters.dateFrom))
    if (filters.dateTo) query = query.lt('created_at', dayEndExclusiveISO(filters.dateTo))
    if (filters.branch) query = query.eq('branch_id', filters.branch)
    query = applyBranchSecurity(query)
    const { data, error } = await fetchAllRows(query.order('created_at', { ascending: false }).order('id'))
    if (error) throw error
    rows.value = (data || []).map((r) => {
      const invs = Array.isArray(r.invoices) ? r.invoices : r.invoices ? [r.invoices] : []
      const firstInv = invs[0] || null
      const isFoc = !!r.foc_reason || r.payment_method === 'foc'
      return {
        id: r.id,
        bill_number: r.order_number || `#${r.id?.slice(0, 8)}`,
        invoice_no: firstInv?.invoice_no || '',
        invoice_id: firstInv?.id || null,
        date: r.created_at,
        branch: r.branches?.name || '—',
        total: Number(r.total_amount || 0),
        status: r.status,
        is_foc: isFoc,
        cashier: r.waiter?.full_name || '—',
        payment_method: r.order_type || '—',
        reason: r.foc_reason || (r.status === 'void' ? 'Order Voided' : (r.status === 'cancelled' ? 'Order Cancelled' : '')),
      }
    })
  } catch (e) {
    console.error('[VoidCancelled]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'void_cancelled_bills')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'void_cancelled_bills')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';

.inv-link {
  color: #1565c0;
  text-decoration: none;
  font-weight: 600;
  cursor: pointer;
  &:hover { text-decoration: underline; color: #0d47a1; }
}
</style>
