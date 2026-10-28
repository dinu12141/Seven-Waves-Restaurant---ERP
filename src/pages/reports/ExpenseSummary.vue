<template>
  <ReportLayout
    title="Expense Summary"
    subtitle="Posted pay vouchers by expense ledger"
    :export-columns="columns"
    :export-rows="rows"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
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
            <q-td key="date" :props="props">{{ fmtDate(props.row.date) }}</q-td>
            <q-td key="category" :props="props" class="text-weight-bold">{{
              props.row.category
            }}</q-td>
            <q-td key="description" :props="props">{{ props.row.description }}</q-td>
            <q-td
              key="amount"
              :props="props"
              class="report-table__td--num text-weight-bolder text-red"
              >{{ fmtLKR(props.row.amount) }}</q-td
            >
            <q-td key="approved_by" :props="props">{{ props.row.approved_by || '—' }}</q-td>
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td colspan="3" class="report-table__td--bold">TOTAL EXPENSES</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-red">{{
              fmtLKR(rows.reduce((s, r) => s + r.amount, 0))
            }}</q-td>
            <q-td /> </q-tr
        ></template>
        <template #no-data
          ><div class="report-empty">
            <q-icon name="trending_down" size="40px" class="q-mb-sm" />
            <div>No expense data</div>
          </div></template
        >
      </q-table>
    </template>
  </ReportLayout>
</template>
<script setup>
import { ref } from 'vue'
import { Notify } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { businessDateOf, fetchAllRows } from 'src/services/reportFilters'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, fmtDate, applyBranchSecurity } from 'src/services/reportService'
const loading = ref(false),
  rows = ref([])
const columns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'category', label: 'Category', field: 'category', align: 'left', sortable: true },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', sortable: true },
  { name: 'approved_by', label: 'Approved By', field: 'approved_by', align: 'left' },
]

async function loadData(filters = {}) {
  loading.value = true
  try {
    // Expenses = POSTED pay vouchers only (drafts/submitted/approved-but-unposted and
    // cancelled vouchers are not in the GL). Category = the voucher's expense ledger.
    let query = supabase
      .from('finance_vouchers')
      .select(
        'id, voucher_no, voucher_date, amount, pay_to, remark, narration, status, ledger_id, posted_by, approved_by, created_at, branch_id',
      )
      .eq('voucher_type', 'pay')
      .eq('status', 'posted')
      .is('deleted_at', null)

    if (filters.dateFrom) query = query.gte('voucher_date', filters.dateFrom)
    if (filters.dateTo) query = query.lte('voucher_date', filters.dateTo)
    if (filters.branch) query = query.eq('branch_id', filters.branch)
    query = applyBranchSecurity(query)

    const { data, error } = await fetchAllRows(
      query.order('voucher_date', { ascending: false }).order('id'),
    )
    if (error) throw error

    const ledgerIds = [...new Set((data || []).map((r) => r.ledger_id).filter(Boolean))]
    const userIds = [
      ...new Set((data || []).map((r) => r.approved_by || r.posted_by).filter(Boolean)),
    ]
    const [ledgersRes, usersRes] = await Promise.all([
      ledgerIds.length
        ? supabase.from('finance_ledgers').select('id, ledger_name').in('id', ledgerIds)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? supabase.from('profiles').select('id, full_name').in('id', userIds)
        : Promise.resolve({ data: [] }),
    ])
    const ledgerName = Object.fromEntries((ledgersRes.data || []).map((l) => [l.id, l.ledger_name]))
    const userName = Object.fromEntries((usersRes.data || []).map((u) => [u.id, u.full_name]))

    rows.value = (data || []).map((r) => ({
      id: r.id,
      date: r.voucher_date || (r.created_at ? businessDateOf(r.created_at) : null),
      category: ledgerName[r.ledger_id] || r.pay_to || 'General Expense',
      description:
        [r.voucher_no, r.pay_to, r.remark || r.narration].filter(Boolean).join(' — ') || '—',
      amount: Number(r.amount || 0),
      approved_by: userName[r.approved_by || r.posted_by] || 'Posted',
    }))
  } catch (e) {
    console.error('[Expenses]', e)
    rows.value = []
    Notify.create({ type: 'negative', message: 'Failed to load expenses: ' + (e?.message || e) })
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'expense_summary')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'expense_summary')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
