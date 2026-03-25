<template>
  <ReportLayout
    title="Sales Statement"
    subtitle="Comprehensive breakdown of total sales, settlements, and collections"
    :kpis="kpiData"
    :hide-sap-header="true"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #default>
      <div v-if="loading" class="row justify-center q-pa-lg">
        <q-spinner-gears size="40px" color="primary" />
      </div>

      <div v-else>
        <!-- ── SAP Header ───────────────────────────────── -->
        <div class="sap-header" style="flex-direction: column; text-align: center">
          <div class="sap-header__company">SEVEN WAVES RESTAURANT (PVT) LTD</div>
          <div class="sap-header__meta" style="text-align: left; margin-top: 4px">
            <span
              >Location : <strong>{{ branchName }}</strong></span
            >
            <span class="q-ml-lg"
              >Date From:<strong>{{ reportDateRange }}</strong></span
            >
          </div>
          <div class="sap-header__title sap-header__title--underline" style="margin-top: 6px">
            Sales Statement
          </div>
        </div>

        <!-- ════════════════════════════════════════════════ -->
        <!--  SECTION 1: Two-column Statement Layout        -->
        <!-- ════════════════════════════════════════════════ -->
        <div class="sap-columns">
          <!-- LEFT: Revenue & Deductions (CREDIT side) -->
          <div class="sap-col">
            <table class="sap-native-table">
              <thead>
                <tr>
                  <th class="sap-native-table__th">Description</th>
                  <th class="sap-native-table__th sap-native-table__th--num">Amount</th>
                  <th class="sap-native-table__th sap-native-table__th--num">TAX</th>
                  <th class="sap-native-table__th sap-native-table__th--num">Amt. with TAX</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in creditItems" :key="item.label" class="sap-native-table__row">
                  <td class="sap-native-table__td">{{ item.label }}</td>
                  <td class="sap-native-table__td sap-native-table__td--num">
                    {{ fmtN(item.amount) }}
                  </td>
                  <td class="sap-native-table__td sap-native-table__td--num">
                    {{ fmtN(item.tax) }}
                  </td>
                  <td class="sap-native-table__td sap-native-table__td--num">
                    {{ fmtN(item.amtWithTax) }}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="sap-native-table__total">
                  <td class="sap-native-table__td text-weight-bolder">TOTAL CREDIT</td>
                  <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder">
                    {{ fmtN(totalCredit) }}
                  </td>
                  <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder">
                    {{ fmtN(totalCreditTax) }}
                  </td>
                  <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder">
                    {{ fmtN(totalCreditWithTax) }}
                  </td>
                </tr>
                <tr class="sap-native-table__extra">
                  <td class="sap-native-table__td">Others :</td>
                  <td class="sap-native-table__td sap-native-table__td--num">Wastage : .000</td>
                  <td colspan="2" />
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- RIGHT: Collections / Settlements (DEBIT side) -->
          <div class="sap-col">
            <table class="sap-native-table">
              <thead>
                <tr>
                  <th class="sap-native-table__th">Description</th>
                  <th class="sap-native-table__th sap-native-table__th--num">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in debitItems" :key="item.label" class="sap-native-table__row">
                  <td class="sap-native-table__td">{{ item.label }}</td>
                  <td class="sap-native-table__td sap-native-table__td--num">
                    {{ fmtN(item.amount) }}
                  </td>
                </tr>
                <tr class="sap-native-table__subtotal">
                  <td class="sap-native-table__td text-weight-bold">Total Collection</td>
                  <td
                    class="sap-native-table__td sap-native-table__td--num text-weight-bold text-green"
                  >
                    {{ fmtN(totalCollection) }}
                  </td>
                </tr>
                <tr class="sap-native-table__row">
                  <td class="sap-native-table__td">Loyalty Redemption</td>
                  <td class="sap-native-table__td sap-native-table__td--num">.000</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="sap-native-table__total">
                  <td class="sap-native-table__td text-weight-bolder">TOTAL DEBIT</td>
                  <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder">
                    {{ fmtN(totalCollection) }}
                  </td>
                </tr>
                <tr class="sap-native-table__extra">
                  <td class="sap-native-table__td" colspan="2">Bang Invoice : .000</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- ════════════════════════════════════════════════ -->
        <!--  SECTION 2: Sales Analysis By Type              -->
        <!-- ════════════════════════════════════════════════ -->
        <div class="sap-analysis">
          <div class="sap-analysis__title">Sales Analysis By Type</div>
          <table class="sap-native-table" style="margin-top: 4px">
            <thead>
              <tr>
                <th class="sap-native-table__th">Order Type</th>
                <th class="sap-native-table__th sap-native-table__th--num">Gross Sales</th>
                <th class="sap-native-table__th sap-native-table__th--num">% of Ttl</th>
                <th class="sap-native-table__th sap-native-table__th--num">Guests</th>
                <th class="sap-native-table__th sap-native-table__th--num">% of Ttl</th>
                <th class="sap-native-table__th sap-native-table__th--num">Checks</th>
                <th class="sap-native-table__th sap-native-table__th--num">% of Ttl</th>
                <th class="sap-native-table__th sap-native-table__th--num">Tables</th>
                <th class="sap-native-table__th sap-native-table__th--num">% of Ttl</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in analysisRows" :key="row.type" class="sap-native-table__row">
                <td class="sap-native-table__td">{{ row.type }}</td>
                <td class="sap-native-table__td sap-native-table__td--num">
                  {{ fmtN(row.gross) }}
                </td>
                <td class="sap-native-table__td sap-native-table__td--num">{{ row.grossPct }}</td>
                <td class="sap-native-table__td sap-native-table__td--num">{{ row.guests }}</td>
                <td class="sap-native-table__td sap-native-table__td--num">{{ row.guestPct }}</td>
                <td class="sap-native-table__td sap-native-table__td--num">{{ row.checks }}</td>
                <td class="sap-native-table__td sap-native-table__td--num">{{ row.checkPct }}</td>
                <td class="sap-native-table__td sap-native-table__td--num">{{ row.tables }}</td>
                <td class="sap-native-table__td sap-native-table__td--num">{{ row.tablePct }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="sap-native-table__total">
                <td class="sap-native-table__td text-weight-bolder">Total</td>
                <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder">
                  {{ fmtN(analysisTotals.gross) }}
                </td>
                <td class="sap-native-table__td" />
                <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder">
                  {{ analysisTotals.guests }}
                </td>
                <td class="sap-native-table__td" />
                <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder">
                  {{ analysisTotals.checks }}
                </td>
                <td class="sap-native-table__td" />
                <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder">
                  {{ analysisTotals.tables }}
                </td>
                <td class="sap-native-table__td" />
              </tr>
              <tr class="sap-native-table__total">
                <td class="sap-native-table__td text-weight-bolder">Total w/o Refund</td>
                <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder">
                  {{ fmtN(analysisTotals.gross) }}
                </td>
                <td colspan="7" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </template>
  </ReportLayout>
</template>

<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV } from 'src/services/exportService'

const authStore = useAuthStore()
const loading = ref(false)
const rawOrders = ref([])
const paymentBreakdown = ref({ cash: 0, card: 0, other: 0 })
const currentFilters = ref({})

// ── Helpers ────────────────────────────────────────────────
const branchName = computed(() => authStore.currentBranch?.name || 'SEVEN WAVES RESTAURANT')
const reportDateRange = computed(() => {
  const f = currentFilters.value
  if (f.dateFrom && f.dateTo) return `${fmtDate(f.dateFrom)}  To: ${fmtDate(f.dateTo)}`
  return fmtDate(new Date().toISOString().slice(0, 10))
})

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function fmtN(val) {
  const n = Number(val || 0)
  return n.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

// ── Compute statement values from raw orders ──────────────
const grossSales = computed(() =>
  rawOrders.value.reduce((s, o) => s + Number(o.subtotal || o.total_amount || 0), 0),
)
const totalDiscount = computed(() =>
  rawOrders.value.reduce((s, o) => s + Number(o.discount_amount || 0), 0),
)
const totalTax = computed(() => rawOrders.value.reduce((s, o) => s + Number(o.tax_amount || 0), 0))
const totalDelivery = computed(() =>
  rawOrders.value.reduce((s, o) => s + Number(o.delivery_charge || 0), 0),
)
const totalAmount = computed(() =>
  rawOrders.value.reduce((s, o) => s + Number(o.total_amount || 0), 0),
)

const voidRefundAmount = computed(() =>
  rawOrders.value
    .filter((o) => o.status === 'cancelled' || o.status === 'void')
    .reduce((s, o) => s + Number(o.total_amount || 0), 0),
)

const serviceCharge = computed(() => {
  return rawOrders.value.reduce((s, o) => {
    const sc =
      Number(o.total_amount || 0) -
      Number(o.subtotal || 0) -
      Number(o.tax_amount || 0) +
      Number(o.discount_amount || 0) -
      Number(o.delivery_charge || 0)
    return s + Math.max(0, sc)
  }, 0)
})

// LEFT side: Credit items
const creditItems = computed(() => [
  { label: 'Gross Sales', amount: grossSales.value, tax: 0, amtWithTax: grossSales.value },
  { label: 'Less Discount', amount: totalDiscount.value, tax: 0, amtWithTax: totalDiscount.value },
  { label: 'Staff Meal', amount: 0, tax: 0, amtWithTax: 0 },
  { label: 'Complimentary', amount: 0, tax: 0, amtWithTax: 0 },
  { label: 'Paid In Advance', amount: 0, tax: 0, amtWithTax: 0 },
  {
    label: 'Void / Refund',
    amount: voidRefundAmount.value,
    tax: 0,
    amtWithTax: voidRefundAmount.value,
  },
  { label: 'Other Amount', amount: 0, tax: 0, amtWithTax: 0 },
  { label: 'Manual Plus', amount: 0, tax: 0, amtWithTax: 0 },
  { label: 'Service Charge', amount: serviceCharge.value, tax: 0, amtWithTax: serviceCharge.value },
  { label: 'Tips', amount: 0, tax: 0, amtWithTax: 0 },
  { label: 'Customer Pay', amount: 0, tax: 0, amtWithTax: 0 },
  { label: 'Customer Advance', amount: 0, tax: 0, amtWithTax: 0 },
  {
    label: 'Delivery Charges',
    amount: totalDelivery.value,
    tax: 0,
    amtWithTax: totalDelivery.value,
  },
  { label: 'Bank Advance', amount: 0, tax: 0, amtWithTax: 0 },
])

const totalCredit = computed(() => totalAmount.value)
const totalCreditTax = computed(() => totalTax.value)
const totalCreditWithTax = computed(() => totalAmount.value)

// RIGHT side: Debit / Collection items
const debitItems = computed(() => [
  { label: 'Cash', amount: paymentBreakdown.value.cash },
  { label: 'Credit Cards', amount: paymentBreakdown.value.card },
  { label: 'Credit Payment', amount: 0 },
  { label: 'Credit Customer', amount: 0 },
  { label: 'Fx Currency', amount: 0 },
  { label: 'Coupon', amount: paymentBreakdown.value.other },
])

const totalCollection = computed(
  () => paymentBreakdown.value.cash + paymentBreakdown.value.card + paymentBreakdown.value.other,
)

// ── Sales Analysis By Type ────────────────────────────────
const ORDER_TYPES = [
  { key: 'dine_in', label: 'TABLE ORDER' },
  { key: 'delivery', label: 'DELIVERY' },
  { key: 'takeaway', label: 'TAKE AWAY' },
  { key: 'complimentary', label: 'COMPLEMENT' },
  { key: 'wastage', label: 'WASTAGE' },
  { key: 'banquet', label: 'BANQUET' },
  { key: 'quick_service', label: 'QUICK SERVICE' },
  { key: 'room_conference', label: 'ROOM / CONFERENCE' },
  { key: 'drive_thru', label: 'DRIVE THRU' },
  { key: 'online', label: 'ONLINE' },
]

const analysisTotals = computed(() => {
  const validOrders = rawOrders.value.filter((o) => o.status !== 'cancelled' && o.status !== 'void')
  return {
    gross: validOrders.reduce((s, o) => s + Number(o.subtotal || o.total_amount || 0), 0),
    guests: validOrders.length,
    checks: validOrders.length,
    tables: new Set(validOrders.map((o) => o.table_id).filter(Boolean)).size,
  }
})

const analysisRows = computed(() => {
  const validOrders = rawOrders.value.filter((o) => o.status !== 'cancelled' && o.status !== 'void')
  const totals = analysisTotals.value

  return ORDER_TYPES.map((ot) => {
    const typeOrders = validOrders.filter((o) => (o.order_type || '').toLowerCase() === ot.key)
    const gross = typeOrders.reduce((s, o) => s + Number(o.subtotal || o.total_amount || 0), 0)
    const guests = typeOrders.length
    const checks = typeOrders.length
    const tables = new Set(typeOrders.map((o) => o.table_id).filter(Boolean)).size

    return {
      type: ot.label,
      gross,
      grossPct: totals.gross > 0 ? ((gross / totals.gross) * 100).toFixed(2) : '.00',
      guests,
      guestPct: totals.guests > 0 ? ((guests / totals.guests) * 100).toFixed(2) : '.00',
      checks,
      checkPct: totals.checks > 0 ? ((checks / totals.checks) * 100).toFixed(2) : '.00',
      tables,
      tablePct: totals.tables > 0 ? ((tables / totals.tables) * 100).toFixed(2) : '.00',
    }
  })
})

// ── KPIs ──────────────────────────────────────────────────
const kpiData = computed(() => [
  {
    label: 'Gross Sales',
    value: `LKR ${fmtN(grossSales.value)}`,
    icon: 'payments',
    color: 'green',
  },
  {
    label: 'Total Discount',
    value: `LKR ${fmtN(totalDiscount.value)}`,
    icon: 'local_offer',
    color: 'red',
  },
  {
    label: 'Total Collected',
    value: `LKR ${fmtN(totalCollection.value)}`,
    icon: 'account_balance_wallet',
    color: 'blue',
  },
  { label: 'Total Orders', value: rawOrders.value.length, icon: 'receipt_long', color: 'cyan' },
])

// ── Data Loading ──────────────────────────────────────────
async function loadData(filters = {}) {
  loading.value = true
  currentFilters.value = filters
  try {
    // Fetch orders
    let query = supabase
      .from('orders')
      .select(
        `
        id, order_number, order_type, status, payment_status,
        subtotal, tax_amount, discount_amount, total_amount, delivery_charge,
        created_at, branch_id, table_id,
        invoices (
          id, total, payment_status,
          payments ( amount, payment_methods ( name ) )
        )
      `,
      )
      .order('created_at', { ascending: true })

    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')

    if (filters.branch) {
      query = query.eq('branch_id', filters.branch)
    } else if (!authStore.isAdmin) {
      const branchId = authStore.currentBranch?.id
      if (branchId) query = query.eq('branch_id', branchId)
    }

    const { data, error } = await query.limit(5000)
    if (error) throw error

    rawOrders.value = data || []

    // Calculate payment breakdown from invoices → payments
    let cash = 0,
      card = 0,
      other = 0
    for (const order of rawOrders.value) {
      const invoices = Array.isArray(order.invoices)
        ? order.invoices
        : order.invoices
          ? [order.invoices]
          : []
      for (const inv of invoices) {
        const payments = Array.isArray(inv.payments)
          ? inv.payments
          : inv.payments
            ? [inv.payments]
            : []
        for (const p of payments) {
          const method = (p.payment_methods?.name || '').toLowerCase()
          const amt = Number(p.amount || 0)
          if (method.includes('cash')) cash += amt
          else if (method.includes('card') || method.includes('visa') || method.includes('master'))
            card += amt
          else other += amt
        }
      }
    }
    paymentBreakdown.value = { cash, card, other }
  } catch (err) {
    console.error('[SalesStatement] Error:', err)
  } finally {
    loading.value = false
  }
}

// ── Export ─────────────────────────────────────────────────
function exportCSV() {
  const cols = [
    { name: 'type', label: 'Order Type', field: 'type' },
    { name: 'gross', label: 'Gross Sales', field: 'gross' },
    { name: 'grossPct', label: '% of Total', field: 'grossPct' },
    { name: 'guests', label: 'Guests', field: 'guests' },
    { name: 'checks', label: 'Checks', field: 'checks' },
    { name: 'tables', label: 'Tables', field: 'tables' },
  ]
  exportTableToCSV(cols, analysisRows.value, 'sales_statement')
}
function exportExcel() {
  exportCSV()
}
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
