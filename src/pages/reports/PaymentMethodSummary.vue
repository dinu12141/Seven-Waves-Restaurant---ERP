<template>
  <ReportLayout
    title="Payment Method Summary"
    subtitle="Revenue breakdown by payment method — cash, card, online, etc."
    :kpis="kpiData"
    :export-columns="activeExportColumns"
    :export-rows="activeExportRows"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <!-- ── Filter Slot: Payment Method Dropdown ────────────────────────────── -->
    <template #extra-filters>
      <div class="report-filter-group">
        <label class="report-filter-label">Payment Method</label>
        <q-select
          v-model="selectedMethod"
          :options="methodFilterOptions"
          dense
          outlined
          emit-value
          map-options
          class="report-filter-input method-select-input"
          @update:model-value="onMethodChange"
        >
          <template #option="scope">
            <q-item v-bind="scope.itemProps" dense class="method-option-item">
              <q-item-section avatar style="min-width: 28px">
                <q-icon
                  :name="scope.opt.icon || 'payments'"
                  size="18px"
                  :color="scope.opt.color || 'primary'"
                />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-medium">{{ scope.opt.label }}</q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
      </div>
    </template>

    <!-- ── Report Main Content ────────────────────────────────────────────── -->
    <template #default>
      <!-- Sub-toolbar: View Switcher (Breakdown vs Transactions) & Active Filter Indicator -->
      <div class="row items-center justify-between q-mb-md filter-subbar">
        <div class="row items-center q-gutter-x-sm">
          <q-btn-toggle
            v-model="activeView"
            dense
            no-caps
            rounded
            toggle-color="primary"
            toggle-text-color="white"
            :color="$q.dark.isActive ? 'grey-9' : 'grey-2'"
            :text-color="$q.dark.isActive ? 'grey-4' : 'grey-8'"
            :options="[
              { label: 'Method Breakdown', value: 'summary', icon: 'pie_chart' },
              { label: 'Transactions Log', value: 'transactions', icon: 'receipt_long' },
            ]"
            class="view-toggle"
          />

          <!-- Active Method Filter Badge -->
          <q-badge
            v-if="selectedMethod !== 'all'"
            color="primary"
            outline
            class="q-px-sm q-py-xs filter-badge"
          >
            <span>Filtered: <strong>{{ selectedMethodLabel }}</strong></span>
            <q-icon
              name="close"
              size="13px"
              class="q-ml-xs cursor-pointer filter-clear-icon"
              @click="clearMethodFilter"
            />
          </q-badge>
        </div>

        <div class="text-caption text-grey-6 text-weight-medium">
          {{
            activeView === 'summary'
              ? `${rows.length} payment method${rows.length === 1 ? '' : 's'}`
              : `${filteredTransactions.length} transaction${filteredTransactions.length === 1 ? '' : 's'}`
          }}
        </div>
      </div>

      <!-- ═══ VIEW 1: METHOD BREAKDOWN TABLE ═══ -->
      <div v-if="activeView === 'summary'">
        <q-table
          :rows="rows"
          :columns="columns"
          row-key="method"
          flat
          class="report-table"
          :loading="loading"
          :rows-per-page-options="[25]"
          :pagination="{ rowsPerPage: 25 }"
          hide-pagination
        >
          <template #header="props">
            <q-tr :props="props" class="report-table__header-row">
              <q-th
                v-for="col in props.cols"
                :key="col.name"
                :props="props"
                class="report-table__th"
              >
                {{ col.label }}
              </q-th>
            </q-tr>
          </template>

          <template #body="props">
            <q-tr :props="props" class="report-table__row">
              <q-td key="method" :props="props">
                <span
                  class="report-badge"
                  :class="`report-badge--${props.row.key || props.row.method?.toLowerCase()}`"
                >
                  <q-icon
                    :name="getMethodIcon(props.row.method)"
                    size="13px"
                    class="q-mr-xs"
                  />
                  {{ props.row.method }}
                </span>
              </q-td>

              <q-td key="count" :props="props" class="report-table__td--num">
                {{ props.row.count }}
              </q-td>

              <q-td
                key="total"
                :props="props"
                class="report-table__td--num text-weight-bolder text-green"
              >
                {{ fmtLKR(props.row.total) }}
              </q-td>

              <q-td key="avg" :props="props" class="report-table__td--num">
                {{ fmtLKR(props.row.avg) }}
              </q-td>

              <q-td key="share" :props="props" class="report-table__td--num">
                <div style="display: flex; align-items: center; gap: 8px; justify-content: flex-end">
                  <div
                    class="payment-bar"
                    :style="{
                      width: Math.min(props.row.share, 100) + '%',
                      background: getMethodColor(props.row.method),
                    }"
                  />
                  <span>{{ fmtPercent(props.row.share) }}</span>
                </div>
              </q-td>
            </q-tr>
          </template>

          <template #bottom-row>
            <q-tr class="report-table__total-row">
              <q-td class="report-table__td--bold">TOTAL</q-td>
              <q-td class="report-table__td--bold report-table__td--num">{{ totals.count }}</q-td>
              <q-td class="report-table__td--bold report-table__td--num text-green">
                {{ fmtLKR(totals.total) }}
              </q-td>
              <q-td class="report-table__td--bold report-table__td--num">
                {{ totals.count > 0 ? fmtLKR(totals.total / totals.count) : '—' }}
              </q-td>
              <q-td class="report-table__td--bold report-table__td--num">100%</q-td>
            </q-tr>
          </template>

          <template #no-data>
            <div class="report-empty">
              <q-icon name="payments" size="40px" class="q-mb-sm" />
              <div>No payment data for selected criteria</div>
            </div>
          </template>
        </q-table>
      </div>

      <!-- ═══ VIEW 2: DETAILED TRANSACTIONS LOG ═══ -->
      <div v-else>
        <q-table
          :rows="filteredTransactions"
          :columns="transactionColumns"
          row-key="order_id"
          flat
          class="report-table"
          :loading="loading"
          :rows-per-page-options="[20, 50, 100]"
          :pagination="{ rowsPerPage: 20 }"
        >
          <template #header="props">
            <q-tr :props="props" class="report-table__header-row">
              <q-th
                v-for="col in props.cols"
                :key="col.name"
                :props="props"
                class="report-table__th"
              >
                {{ col.label }}
              </q-th>
            </q-tr>
          </template>

          <template #body="props">
            <q-tr :props="props" class="report-table__row">
              <q-td key="order_number" :props="props" class="text-weight-bold">
                #{{ props.row.order_number }}
              </q-td>

              <q-td key="created_at" :props="props" class="report-table__td--muted">
                {{ fmtDateTime(props.row.created_at) }}
              </q-td>

              <q-td key="customer" :props="props">
                {{ props.row.customer_name || 'Walk-in' }}
                <span v-if="props.row.table_number" class="text-caption text-grey-6 q-ml-xs">
                  (T-{{ props.row.table_number }})
                </span>
              </q-td>

              <q-td key="order_type" :props="props">
                <span class="text-capitalize">{{ (props.row.order_type || 'dine_in').replace('_', ' ') }}</span>
              </q-td>

              <q-td key="method" :props="props">
                <span
                  class="report-badge"
                  :class="`report-badge--${props.row.key || props.row.method?.toLowerCase()}`"
                >
                  <q-icon
                    :name="getMethodIcon(props.row.method)"
                    size="13px"
                    class="q-mr-xs"
                  />
                  {{ props.row.method }}
                </span>
              </q-td>

              <q-td key="amount" :props="props" class="report-table__td--num text-weight-bold text-green">
                {{ fmtLKR(props.row.amount) }}
              </q-td>

              <q-td key="status" :props="props" class="text-center">
                <q-badge
                  :color="props.row.status === 'Paid' ? 'positive' : 'grey-7'"
                  dense
                  rounded
                  class="q-px-sm"
                >
                  {{ props.row.status }}
                </q-badge>
              </q-td>
            </q-tr>
          </template>

          <template #bottom-row>
            <q-tr class="report-table__total-row">
              <q-td class="report-table__td--bold">TOTAL</q-td>
              <q-td class="report-table__td--bold">{{ totals.count }} Orders</q-td>
              <q-td colspan="3"></q-td>
              <q-td class="report-table__td--bold report-table__td--num text-green">
                {{ fmtLKR(totals.total) }}
              </q-td>
              <q-td></q-td>
            </q-tr>
          </template>

          <template #no-data>
            <div class="report-empty">
              <q-icon name="receipt_long" size="40px" class="q-mb-sm" />
              <div>No transactions found for {{ selectedMethodLabel }}</div>
            </div>
          </template>
        </q-table>
      </div>
    </template>
  </ReportLayout>
</template>

<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { dayEndExclusiveISO, dayStartISO, fetchAllRows } from 'src/services/reportFilters'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, fmtPercent, fmtDateTime, applyBranchSecurity } from 'src/services/reportService'

const loading = ref(false)
const activeView = ref('summary')
const selectedMethod = ref('all')
const rawTransactions = ref([])

// ── Filter Options ────────────────────────────────────────────────────────────
const methodFilterOptions = [
  { label: 'All Payment Methods', value: 'all', icon: 'all_inclusive', color: 'primary' },
  { label: '💵 Cash', value: 'cash', icon: 'attach_money', color: 'positive' },
  { label: '💳 All Cards (Visa & Mastercard)', value: 'card', icon: 'credit_card', color: 'primary' },
  { label: '💳 Visa Card', value: 'visa', icon: 'payment', color: 'blue-8' },
  { label: '💳 Mastercard', value: 'mastercard', icon: 'payment', color: 'orange-8' },
  { label: '📑 Customer Credit (AR)', value: 'credit', icon: 'receipt_long', color: 'amber-8' },
  { label: '🏦 Bank Transfer', value: 'transfer', icon: 'account_balance', color: 'cyan-8' },
  { label: '🛵 Delivery (Uber Eats & PickMe)', value: 'delivery', icon: 'delivery_dining', color: 'teal' },
  { label: '🛵 Uber Eats', value: 'uber_eats', icon: 'delivery_dining', color: 'green-7' },
  { label: '🛵 PickMe Food', value: 'pickme', icon: 'delivery_dining', color: 'red-7' },
  { label: '🌐 Online / Website', value: 'website', icon: 'language', color: 'purple' },
]

const selectedMethodLabel = computed(() => {
  const found = methodFilterOptions.find((m) => m.value === selectedMethod.value)
  return found ? found.label.replace(/^[^\w\s]+\s*/, '') : 'All Methods'
})

function onMethodChange() {
  // Recomputation happens reactively via computed properties
}

function clearMethodFilter() {
  selectedMethod.value = 'all'
}

// ── Columns ───────────────────────────────────────────────────────────────────
const columns = [
  { name: 'method', label: 'Payment Method', field: 'method', align: 'left', sortable: true },
  { name: 'count', label: 'Transactions', field: 'count', align: 'right', sortable: true },
  { name: 'total', label: 'Total Amount', field: 'total', align: 'right', sortable: true },
  { name: 'avg', label: 'Avg Transaction', field: 'avg', align: 'right', sortable: true },
  { name: 'share', label: '% Share', field: 'share', align: 'right', sortable: true },
]

const transactionColumns = [
  { name: 'order_number', label: 'Order #', field: 'order_number', align: 'left', sortable: true },
  { name: 'created_at', label: 'Date & Time', field: 'created_at', align: 'left', sortable: true },
  { name: 'customer', label: 'Customer / Table', field: 'customer_name', align: 'left' },
  { name: 'order_type', label: 'Type', field: 'order_type', align: 'left' },
  { name: 'method', label: 'Payment Method', field: 'method', align: 'left', sortable: true },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
]

// ── Method Normalization ──────────────────────────────────────────────────────
function normalizeMethod(raw) {
  const m = String(raw || '').toLowerCase().trim()
  if (m === 'visa') return { name: 'Visa', category: 'card', key: 'visa' }
  if (m === 'mastercard' || m === 'master' || m === 'mc')
    return { name: 'Mastercard', category: 'card', key: 'mastercard' }
  if (m === 'card' || m.includes('credit card') || m.includes('debit card'))
    return { name: 'Card (General)', category: 'card', key: 'card' }
  if (m === 'cash') return { name: 'Cash', category: 'cash', key: 'cash' }
  if (m === 'credit' || m === 'on_account' || m.includes('ar'))
    return { name: 'Credit', category: 'credit', key: 'credit' }
  if (m === 'transfer' || m.includes('bank'))
    return { name: 'Bank Transfer', category: 'transfer', key: 'transfer' }
  if (m === 'uber_eats' || m.includes('uber'))
    return { name: 'Uber Eats', category: 'delivery', key: 'uber_eats' }
  if (m === 'pickme' || m.includes('pick'))
    return { name: 'PickMe Food', category: 'delivery', key: 'pickme' }
  if (m === 'website') return { name: 'Website', category: 'online', key: 'website' }
  if (m === 'online') return { name: 'Online', category: 'online', key: 'online' }
  if (m === 'unpaid' || !m) return { name: 'Unpaid', category: 'unpaid', key: 'unpaid' }
  return { name: raw.charAt(0).toUpperCase() + raw.slice(1), category: 'other', key: m }
}

function matchesFilter(item, filter) {
  if (!filter || filter === 'all') return true
  if (filter === 'card') {
    return item.category === 'card' || item.key === 'visa' || item.key === 'mastercard' || item.key === 'card'
  }
  if (filter === 'delivery') {
    return item.category === 'delivery' || item.key === 'uber_eats' || item.key === 'pickme'
  }
  if (filter === 'website') {
    return item.category === 'online' || item.key === 'website' || item.key === 'online'
  }
  return item.key === filter
}

// ── Filtered Transactions ─────────────────────────────────────────────────────
const filteredTransactions = computed(() => {
  return rawTransactions.value.filter((txn) => matchesFilter(txn, selectedMethod.value))
})

// ── Summary Rows ──────────────────────────────────────────────────────────────
const rows = computed(() => {
  const pMap = {}
  let grandTotal = 0

  filteredTransactions.value.forEach((txn) => {
    const methodName = txn.method
    const key = txn.key
    if (!pMap[methodName]) {
      pMap[methodName] = { method: methodName, key, count: 0, total: 0 }
    }
    pMap[methodName].count++
    pMap[methodName].total += Number(txn.amount || 0)
    grandTotal += Number(txn.amount || 0)
  })

  return Object.values(pMap)
    .map((p) => ({
      ...p,
      avg: p.count > 0 ? p.total / p.count : 0,
      share: grandTotal > 0 ? (p.total / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)
})

const totals = computed(() => ({
  count: filteredTransactions.value.length,
  total: filteredTransactions.value.reduce((s, r) => s + Number(r.amount || 0), 0),
}))

// ── KPIs ──────────────────────────────────────────────────────────────────────
const kpiData = computed(() => {
  if (selectedMethod.value === 'all') {
    const topMethod = rows.value[0]
    return [
      { label: 'Payment Methods', value: rows.value.length, icon: 'payments', color: 'blue' },
      {
        label: 'Total Revenue',
        value: fmtLKR(totals.value.total),
        icon: 'account_balance',
        color: 'green',
      },
      { label: 'Top Method', value: topMethod?.method || '—', icon: 'emoji_events', color: 'amber' },
      {
        label: 'Total Transactions',
        value: totals.value.count,
        icon: 'receipt_long',
        color: 'purple',
      },
    ]
  }

  // When a specific method/category is filtered
  return [
    { label: 'Selected Filter', value: selectedMethodLabel.value, icon: 'filter_alt', color: 'blue' },
    {
      label: 'Filtered Revenue',
      value: fmtLKR(totals.value.total),
      icon: 'account_balance',
      color: 'green',
    },
    {
      label: 'Avg Transaction',
      value: totals.value.count > 0 ? fmtLKR(totals.value.total / totals.value.count) : 'LKR 0.00',
      icon: 'calculate',
      color: 'amber',
    },
    {
      label: 'Transactions',
      value: totals.value.count,
      icon: 'receipt_long',
      color: 'purple',
    },
  ]
})

// ── Icons & Colors ────────────────────────────────────────────────────────────
function getMethodIcon(m) {
  const lm = m?.toLowerCase() || ''
  if (lm.includes('cash')) return 'attach_money'
  if (lm === 'visa') return 'payment'
  if (lm.includes('master')) return 'payment'
  if (lm.includes('card')) return 'credit_card'
  if (lm.includes('credit')) return 'receipt_long'
  if (lm.includes('transfer') || lm.includes('bank')) return 'account_balance'
  if (lm.includes('uber') || lm.includes('pickme') || lm.includes('delivery')) return 'delivery_dining'
  if (lm.includes('website') || lm.includes('online')) return 'language'
  return 'payments'
}

function getMethodColor(m) {
  const lm = m?.toLowerCase() || ''
  if (lm.includes('cash')) return '#16a34a'
  if (lm === 'visa') return '#1565c0'
  if (lm === 'mastercard' || lm.includes('master')) return '#ea580c'
  if (lm.includes('card')) return '#2563eb'
  if (lm.includes('credit')) return '#d97706'
  if (lm.includes('transfer') || lm.includes('bank')) return '#0891b2'
  if (lm === 'uber_eats' || lm.includes('uber')) return '#06c167'
  if (lm === 'pickme' || lm.includes('pick')) return '#dc2626'
  if (lm === 'website' || lm.includes('web')) return '#0ea5e9'
  if (lm.includes('online')) return '#7c3aed'
  return '#64748b'
}

// ── Data Fetching ─────────────────────────────────────────────────────────────
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('orders')
      .select(`
        id,
        order_number,
        total_amount,
        status,
        payment_status,
        payment_method,
        order_type,
        customer_name,
        table_number,
        created_at,
        paid_at
      `)
      .neq('status', 'cancelled')
      .neq('status', 'void')

    if (filters.dateFrom) query = query.gte('created_at', dayStartISO(filters.dateFrom))
    if (filters.dateTo) query = query.lt('created_at', dayEndExclusiveISO(filters.dateTo))
    if (filters.branch) query = query.eq('branch_id', filters.branch)
    query = applyBranchSecurity(query)

    const { data: orders, error } = await fetchAllRows(query.order('created_at', { ascending: false }))
    if (error) throw error

    const orderList = orders || []
    const orderIds = orderList.map((o) => o.id)

    // Parallel fetch for split tenders & payments to accurately support Visa/Mastercard/Cash
    let tendersByOrder = {}
    let paymentsByOrder = {}

    if (orderIds.length > 0) {
      const [tendersRes, paymentsRes] = await Promise.all([
        supabase.from('pos_order_tenders').select('order_id, method, amount').in('order_id', orderIds),
        supabase
          .from('payments')
          .select('order_id, amount, payment_method, payment_methods(name), voided')
          .in('order_id', orderIds),
      ])

      ;(tendersRes.data || []).forEach((t) => {
        tendersByOrder[t.order_id] = tendersByOrder[t.order_id] || []
        tendersByOrder[t.order_id].push(t)
      })

      ;(paymentsRes.data || []).forEach((p) => {
        if (!p.voided) {
          paymentsByOrder[p.order_id] = paymentsByOrder[p.order_id] || []
          paymentsByOrder[p.order_id].push(p)
        }
      })
    }

    const txns = []

    orderList.forEach((order) => {
      const total = Number(order.total_amount || 0)
      const baseInfo = {
        order_id: order.id,
        order_number: order.order_number,
        customer_name: order.customer_name || 'Walk-in',
        order_type: order.order_type || 'dine_in',
        table_number: order.table_number || null,
        created_at: order.paid_at || order.created_at,
        status: order.payment_status === 'paid' ? 'Paid' : order.status || 'Active',
      }

      // 1. Tenders (for split payments)
      const tenders = tendersByOrder[order.id] || []
      if (tenders.length > 0) {
        tenders.forEach((t) => {
          const norm = normalizeMethod(t.method)
          txns.push({
            ...baseInfo,
            amount: Number(t.amount || 0),
            method: norm.name,
            category: norm.category,
            key: norm.key,
          })
        })
        return
      }

      // 2. Direct payments table rows
      const directPayments = paymentsByOrder[order.id] || []
      if (directPayments.length > 0) {
        directPayments.forEach((p) => {
          let rawMethod = p.payment_methods?.name || p.payment_method
          const oMethod = String(order.payment_method || '').toLowerCase()
          // Preserve specific card brand (Visa / Mastercard) if recorded
          if (oMethod === 'visa' || oMethod === 'mastercard') {
            rawMethod = oMethod
          }
          const norm = normalizeMethod(rawMethod || 'Cash')
          txns.push({
            ...baseInfo,
            amount: Number(p.amount || total),
            method: norm.name,
            category: norm.category,
            key: norm.key,
          })
        })
        return
      }

      // 3. Order level payment_method
      if (order.payment_method) {
        const norm = normalizeMethod(order.payment_method)
        txns.push({
          ...baseInfo,
          amount: total,
          method: norm.name,
          category: norm.category,
          key: norm.key,
        })
        return
      }

      // 4. Default: If marked paid, assume Cash; else Unpaid
      const defaultMethod = order.payment_status === 'paid' ? 'Cash' : 'Unpaid'
      const norm = normalizeMethod(defaultMethod)
      txns.push({
        ...baseInfo,
        amount: total,
        method: norm.name,
        category: norm.category,
        key: norm.key,
      })
    })

    rawTransactions.value = txns
  } catch (e) {
    console.error('[PaymentMethodSummary] Load error:', e)
  } finally {
    loading.value = false
  }
}

// ── Exporting ─────────────────────────────────────────────────────────────────
const activeExportColumns = computed(() => (activeView.value === 'summary' ? columns : transactionColumns))
const activeExportRows = computed(() => (activeView.value === 'summary' ? rows.value : filteredTransactions.value))

function exportCSV() {
  const filename = `payment_methods_${selectedMethod.value}_${activeView.value}`
  exportTableToCSV(activeExportColumns.value, activeExportRows.value, filename)
}

function exportExcel() {
  const filename = `payment_methods_${selectedMethod.value}_${activeView.value}`
  exportTableToExcel(activeExportColumns.value, activeExportRows.value, filename)
}
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';

.method-select-input {
  min-width: 240px;
}

.payment-bar {
  height: 6px;
  min-width: 2px;
  max-width: 80px;
  border-radius: 3px;
}

.filter-subbar {
  border-bottom: 1px dashed var(--erp-border, rgba(255, 255, 255, 0.08));
  padding-bottom: 12px;
}

.filter-badge {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  border-radius: 6px;
}

.filter-clear-icon {
  opacity: 0.7;
  transition: opacity 0.2s;
  &:hover {
    opacity: 1;
  }
}

.view-toggle {
  :deep(.q-btn) {
    font-size: 0.75rem;
    padding: 6px 14px;
  }
}

/* ── Distinct Payment Badges ── */
.report-badge--visa {
  background: rgba(21, 101, 192, 0.12);
  color: #1976d2;
  border-color: rgba(21, 101, 192, 0.25);
}

.report-badge--mastercard {
  background: rgba(234, 88, 12, 0.12);
  color: #ea580c;
  border-color: rgba(234, 88, 12, 0.25);
}

.report-badge--credit {
  background: rgba(217, 119, 6, 0.12);
  color: #d97706;
  border-color: rgba(217, 119, 6, 0.25);
}

.report-badge--transfer {
  background: rgba(8, 145, 178, 0.12);
  color: #0891b2;
  border-color: rgba(8, 145, 178, 0.25);
}

.report-badge--uber_eats {
  background: rgba(6, 193, 103, 0.12);
  color: #059669;
  border-color: rgba(6, 193, 103, 0.25);
}

.report-badge--pickme {
  background: rgba(220, 38, 38, 0.12);
  color: #dc2626;
  border-color: rgba(220, 38, 38, 0.25);
}

.report-badge--website,
.report-badge--online {
  background: rgba(124, 58, 237, 0.12);
  color: #7c3aed;
  border-color: rgba(124, 58, 237, 0.25);
}

.report-badge--unpaid {
  background: rgba(148, 163, 184, 0.12);
  color: #64748b;
  border-color: rgba(148, 163, 184, 0.25);
}
</style>
