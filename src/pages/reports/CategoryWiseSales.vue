<template>
  <ReportLayout
    :title="reportTitle"
    subtitle="Sales breakdown by category with revenue, margin, and item movement analysis"
    :kpis="kpiData"
    :export-columns="exportCols"
    :export-rows="displayedItems"
    :show-kitchen-filter="true"
    @filter-change="loadData"
    @refresh="loadData"
  >
    <template #filter-chips>
      <span
        class="report-filter-chip bg-purple-1 text-purple q-ml-sm"
        v-if="categoryFilter !== 'All Categories'"
      >
        Category: {{ categoryFilter }}
      </span>
      <span class="report-filter-chip bg-blue-1 text-primary q-ml-sm" v-if="moveFilter !== 'All'">
        Movement: {{ moveFilter.split(' (')[0] }}
      </span>
      <span class="report-filter-chip bg-amber-1 text-orange q-ml-sm" v-if="marginFilter !== 'All'">
        Margin: {{ marginFilter.split(' (')[0] }}
      </span>
    </template>

    <template #default>
      <!-- Analysis Filters -->
      <div class="row q-col-gutter-sm q-mb-md items-center print-hide">
        <div class="col-12 text-subtitle2 text-weight-bold q-pb-xs">Item Analysis Filters</div>
        <div class="col-12 col-md-3">
          <q-select
            v-model="categoryFilter"
            :options="categoryOptions"
            label="Category"
            outlined
            dense
            bg-color="white"
          />
        </div>
        <div class="col-12 col-md-3">
          <q-select
            v-model="moveFilter"
            :options="moveOptions"
            label="Sales Movement"
            outlined
            dense
            bg-color="white"
          />
        </div>
        <div class="col-12 col-md-3">
          <q-select
            v-model="marginFilter"
            :options="marginOptions"
            label="Profit Margin"
            outlined
            dense
            bg-color="white"
          />
        </div>
        <div class="col-12 col-md-3">
          <q-btn
            color="primary"
            icon="refresh"
            label="Reset"
            outline
            class="q-mr-sm"
            @click="resetFilters"
          />
          <q-btn
            color="secondary"
            :icon="isExpanded ? 'unfold_less' : 'unfold_more'"
            :label="isExpanded ? 'Collapse' : 'Expand All'"
            outline
            @click="toggleExpandAll"
          />
        </div>
      </div>

      <q-table
        v-model:expanded="expandedRows"
        :rows="rows"
        :columns="columns"
        row-key="category"
        flat
        dense
        class="sap-table"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100]"
        :pagination="{ rowsPerPage: 50, sortBy: 'net_amount', descending: true }"
      >
        <template #header="props">
          <q-tr :props="props" class="sap-table__header">
            <q-th auto-width />
            <q-th v-for="col in props.cols" :key="col.name" :props="props" class="sap-table__th">
              {{ col.label }}
            </q-th>
          </q-tr>
        </template>

        <template #body="props">
          <q-tr :props="props" class="sap-table__row" :class="props.expand ? 'bg-grey-2' : ''">
            <q-td auto-width>
              <q-btn
                size="sm"
                color="primary"
                round
                dense
                @click="props.expand = !props.expand"
                :icon="props.expand ? 'remove' : 'add'"
              />
            </q-td>
            <q-td key="category" :props="props" class="text-weight-bold">{{
              props.row.category
            }}</q-td>
            <q-td key="item_count" :props="props" class="sap-table__td--num">{{
              props.row.item_count
            }}</q-td>
            <q-td key="total_qty" :props="props" class="sap-table__td--num text-weight-bold">{{
              props.row.total_qty
            }}</q-td>
            <q-td key="total_amount" :props="props" class="sap-table__td--num">{{
              fmtLKR(props.row.total_amount)
            }}</q-td>
            <q-td key="total_discount" :props="props" class="sap-table__td--num text-red">{{
              fmtLKR(props.row.total_discount)
            }}</q-td>
            <q-td
              key="net_amount"
              :props="props"
              class="sap-table__td--num text-weight-bolder text-green"
              >{{ fmtLKR(props.row.net_amount) }}</q-td
            >
            <q-td
              key="profit"
              :props="props"
              class="sap-table__td--num text-primary text-weight-bold"
              >{{ fmtLKR(props.row.profit) }}</q-td
            >
            <q-td key="margin_pct" :props="props" class="sap-table__td--num">
              <q-badge
                :color="
                  props.row.margin_pct >= 60
                    ? 'green'
                    : props.row.margin_pct >= 30
                      ? 'orange'
                      : 'red'
                "
              >
                {{ fmtPercent(props.row.margin_pct) }}
              </q-badge>
            </q-td>
            <q-td key="share" :props="props" class="sap-table__td--num text-weight-bold">{{
              fmtPercent(props.row.share)
            }}</q-td>
          </q-tr>

          <q-tr v-show="props.expand" :props="props">
            <q-td colspan="100%" class="q-pa-md bg-white">
              <table class="sap-native-table" style="width: 100%">
                <thead>
                  <tr>
                    <th class="sap-native-table__th">Menu Item</th>
                    <th class="sap-native-table__th sap-native-table__th--num">Qty Sold</th>
                    <th class="sap-native-table__th sap-native-table__th--num">Est. Cost</th>
                    <th class="sap-native-table__th sap-native-table__th--num">Net Revenue</th>
                    <th class="sap-native-table__th sap-native-table__th--num">Est. Profit</th>
                    <th class="sap-native-table__th sap-native-table__th--num">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in props.row.items"
                    :key="item.item_name"
                    class="sap-native-table__row"
                  >
                    <td class="sap-native-table__td">
                      {{ item.item_name }}
                      <q-chip
                        v-if="item.qty >= 20"
                        size="sm"
                        color="green"
                        text-color="white"
                        class="q-ml-sm"
                        dense
                        >Fast</q-chip
                      >
                      <q-chip
                        v-else-if="item.qty <= 5"
                        size="sm"
                        color="red"
                        text-color="white"
                        class="q-ml-sm"
                        dense
                        >Slow</q-chip
                      >
                    </td>
                    <td class="sap-native-table__td sap-native-table__td--num text-weight-bold">
                      {{ item.qty }}
                    </td>
                    <td class="sap-native-table__td sap-native-table__td--num">
                      {{ fmtLKR(item.cost) }}
                    </td>
                    <td class="sap-native-table__td sap-native-table__td--num text-weight-bold">
                      {{ fmtLKR(item.net_amt) }}
                    </td>
                    <td
                      class="sap-native-table__td sap-native-table__td--num text-primary text-weight-bold"
                    >
                      {{ fmtLKR(item.profit) }}
                    </td>
                    <td class="sap-native-table__td sap-native-table__td--num">
                      <span
                        :class="
                          item.margin_pct >= 60
                            ? 'text-green text-weight-bold'
                            : item.margin_pct >= 30
                              ? 'text-orange text-weight-bold'
                              : 'text-red text-weight-bold'
                        "
                      >
                        {{ fmtPercent(item.margin_pct) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </q-td>
          </q-tr>
        </template>

        <template #bottom-row>
          <q-tr class="sap-table__grand-total">
            <q-td colspan="2" class="text-weight-bolder">GRAND TOTAL</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">{{ totals.items }} Items</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">{{ totals.qty }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">{{ fmtLKR(totals.amount) }}</q-td>
            <q-td class="sap-table__td--num text-red text-weight-bolder">{{
              fmtLKR(totals.discount)
            }}</q-td>
            <q-td class="sap-table__td--num text-green text-weight-bolder">{{
              fmtLKR(totals.net)
            }}</q-td>
            <q-td class="sap-table__td--num text-primary text-weight-bolder">{{
              fmtLKR(totals.profit)
            }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">{{
              fmtPercent(totals.margin_pct)
            }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">100%</q-td>
          </q-tr>
        </template>

        <template #no-data>
          <div class="report-empty">
            <q-icon name="donut_small" size="40px" class="q-mb-sm" />
            <div>No category sales data found for the given criteria.</div>
          </div>
        </template>
      </q-table>
    </template>
  </ReportLayout>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Notify } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { dayEndExclusiveISO, dayStartISO, fetchAllRows } from 'src/services/reportFilters'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { fmtLKR, fmtPercent, applyBranchSecurity } from 'src/services/reportService'

const loading = ref(false)
const rawItems = ref([])

// Expand All functionality for Print/View
const expandedRows = ref([])
const isExpanded = computed({
  get: () => expandedRows.value.length === rows.value.length && rows.value.length > 0,
  set: (val) => {
    if (val) expandedRows.value = rows.value.map((r) => r.category)
    else expandedRows.value = []
  },
})

function toggleExpandAll() {
  isExpanded.value = !isExpanded.value
}

// Ensure items expand during printing
function onBeforePrint() {
  isExpanded.value = true
}
onMounted(() => {
  window.addEventListener('beforeprint', onBeforePrint)
})
onUnmounted(() => {
  window.removeEventListener('beforeprint', onBeforePrint)
})

const reportTitle = computed(() => {
  let title = 'Category Wise Sales'
  
  const movePart = moveFilter.value !== 'All' ? moveFilter.value.split(' (')[0] : ''
  const marginPart = marginFilter.value !== 'All' ? marginFilter.value.split(' (')[0] : ''
  
  if (movePart && marginPart) {
    title = `${movePart} & ${marginPart} Items Sales Report`
  } else if (movePart) {
    title = `${movePart} Items Sales Report`
  } else if (marginPart) {
    title = `${marginPart} Items Sales Report`
  }
  
  if (categoryFilter.value !== 'All Categories') {
    title += ` - ${categoryFilter.value}`
  }
  
  return title
})

// Filtering Data
const moveOptions = [
  'All',
  'Fast Moving (Qty >= 20)',
  'Medium Moving (5 - 19)',
  'Slow Moving (Qty < 5)',
]
const marginOptions = [
  'All',
  'High Margin (>= 60%)',
  'Mid Margin (30% - 59%)',
  'Low Margin (< 30%)',
]

const categoryFilter = ref('All Categories')
const moveFilter = ref('All')
const marginFilter = ref('All')

const categoryOptions = computed(() => {
  const cats = new Set(rawItems.value.map((i) => i.category))
  return ['All Categories', ...Array.from(cats).sort()]
})

function resetFilters() {
  categoryFilter.value = 'All Categories'
  moveFilter.value = 'All'
  marginFilter.value = 'All'
}

const columns = [
  { name: 'category', label: 'Category', field: 'category', align: 'left', sortable: true },
  {
    name: 'item_count',
    label: 'Unique Items',
    field: 'item_count',
    align: 'right',
    sortable: true,
  },
  { name: 'total_qty', label: 'Total Qty', field: 'total_qty', align: 'right', sortable: true },
  {
    name: 'total_amount',
    label: 'Gross Amount',
    field: 'total_amount',
    align: 'right',
    sortable: true,
  },
  {
    name: 'total_discount',
    label: 'Discount',
    field: 'total_discount',
    align: 'right',
    sortable: true,
  },
  { name: 'net_amount', label: 'Net Revenue', field: 'net_amount', align: 'right', sortable: true },
  { name: 'profit', label: 'Est. Profit', field: 'profit', align: 'right', sortable: true },
  { name: 'margin_pct', label: 'Margin %', field: 'margin_pct', align: 'right', sortable: true },
  { name: 'share', label: '% Share', field: 'share', align: 'right', sortable: true },
]

// Export columns for items mapping
const exportCols = [
  { name: 'category', label: 'Category', field: 'category', align: 'left' },
  { name: 'item_name', label: 'Menu Item', field: 'item_name', align: 'left' },
  {
    name: 'qty',
    label: 'Qty Sold',
    field: 'qty',
    align: 'right',
    format: (val) => Number(val) || 0,
  },
  {
    name: 'cost',
    label: 'Est. Cost',
    field: 'cost',
    align: 'right',
    format: (val) => Number(val) || 0,
  },
  {
    name: 'net_amt',
    label: 'Net Revenue',
    field: 'net_amt',
    align: 'right',
    format: (val) => Number(val) || 0,
  },
  {
    name: 'profit',
    label: 'Est. Profit',
    field: 'profit',
    align: 'right',
    format: (val) => Number(val) || 0,
  },
  {
    name: 'margin_pct',
    label: 'Margin %',
    field: 'margin_pct',
    align: 'right',
    format: (val) => `${Number(val || 0).toFixed(1)}%`,
  },
]

// Computed layer to apply item filters
const displayedItems = computed(() => {
  return rawItems.value.filter((item) => {
    // Category Evaluation
    if (categoryFilter.value !== 'All Categories' && item.category !== categoryFilter.value) {
      return false
    }

    // Movement Evaluation
    if (moveFilter.value.includes('Fast') && item.qty < 20) return false
    if (moveFilter.value.includes('Medium') && (item.qty < 5 || item.qty >= 20)) return false
    if (moveFilter.value.includes('Slow') && item.qty >= 5) return false

    // Margin Evaluation
    if (marginFilter.value.includes('High') && item.margin_pct < 60) return false
    if (marginFilter.value.includes('Mid') && (item.margin_pct < 30 || item.margin_pct >= 60))
      return false
    if (marginFilter.value.includes('Low') && item.margin_pct >= 30) return false

    return true
  })
})

const rows = computed(() => {
  const catMap = {}
  let grandNet = 0

  displayedItems.value.forEach((item) => {
    if (!catMap[item.category]) {
      catMap[item.category] = {
        category: item.category,
        total_qty: 0,
        total_amount: 0,
        total_discount: 0,
        net_amount: 0,
        profit: 0,
        items: [],
      }
    }
    catMap[item.category].total_qty += item.qty
    catMap[item.category].total_amount += item.gross_amt
    catMap[item.category].total_discount += item.disc_amt
    catMap[item.category].net_amount += item.net_amt
    catMap[item.category].profit += item.profit
    catMap[item.category].items.push(item)
    grandNet += item.net_amt
  })

  return Object.values(catMap)
    .map((c) => {
      c.item_count = c.items.length
      c.share = grandNet > 0 ? (c.net_amount / grandNet) * 100 : 0
      c.margin_pct = c.net_amount > 0 ? (c.profit / c.net_amount) * 100 : 0
      c.items.sort((a, b) => b.qty - a.qty) // Sort highest qty first
      return c
    })
    .sort((a, b) => b.net_amount - a.net_amount)
})

const totals = computed(() => {
  const t = { items: 0, qty: 0, amount: 0, discount: 0, net: 0, profit: 0 }
  rows.value.forEach((r) => {
    t.items += r.item_count
    t.qty += r.total_qty
    t.amount += r.total_amount
    t.discount += r.total_discount
    t.net += r.net_amount
    t.profit += r.profit
  })
  t.margin_pct = t.net > 0 ? (t.profit / t.net) * 100 : 0
  return t
})

const kpiData = computed(() => [
  { label: 'Active Categories', value: rows.value.length, icon: 'category', color: 'blue' },
  { label: 'Filtered Net Rev', value: fmtLKR(totals.value.net), icon: 'payments', color: 'green' },
  {
    label: 'Total Est. Profit',
    value: fmtLKR(totals.value.profit),
    icon: 'trending_up',
    color: 'purple',
  },
  {
    label: 'Avg Margin',
    value: `${fmtPercent(totals.value.margin_pct)}`,
    icon: 'pie_chart',
    color: 'amber',
  },
])

async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('order_items')
      .select(
        `
        quantity,
        unit_price,
        total_price,
        menu_items!inner ( name, base_price, categories ( name ) ),
        orders!inner ( created_at, branch_id, status, subtotal, total_amount, discount_amount )
      `,
      )
      .not('orders.status', 'in', '(cancelled,void,voided)')
      // Cancelled / voided lines are not sales
      .neq('status', 'cancelled')
      .is('void_reason', null)

    if (filters.kitchen) query = query.eq('kitchen_id', filters.kitchen)
    if (filters.dateFrom) query = query.gte('orders.created_at', dayStartISO(filters.dateFrom))
    if (filters.dateTo) query = query.lt('orders.created_at', dayEndExclusiveISO(filters.dateTo))
    if (filters.branch) query = query.eq('orders.branch_id', filters.branch)
    query = applyBranchSecurity(query, 'orders.branch_id')

    const { data, error } = await fetchAllRows(query.order('id'))
    if (error) throw error

    const itemMap = {}

    ;(data || []).forEach((oi) => {
      const order = oi.orders
      if (!order || order.status === 'cancelled') return

      const menuItem = oi.menu_items || {}
      const category = menuItem.categories?.name || 'Uncategorized'
      const itemName = menuItem.name || 'Unknown Item'
      const key = `${itemName}__${category}`

      const qty = Number(oi.quantity || 0)
      const basePrice = Number(menuItem.base_price || oi.unit_price || 0)
      // Standard 35% food cost estimate
      const estCostUnit = basePrice * 0.35
      const totalCost = estCostUnit * qty
      const grossAmt = Number(oi.total_price || qty * basePrice)

      const orderTotal = Number(order.subtotal || order.total_amount || 1)
      const ratio = orderTotal > 0 ? grossAmt / orderTotal : 0
      const discAmt = Number(order.discount_amount || 0) * ratio

      const netAmt = grossAmt - discAmt
      const profit = netAmt - totalCost

      if (!itemMap[key]) {
        itemMap[key] = {
          category,
          item_name: itemName,
          qty: 0,
          gross_amt: 0,
          disc_amt: 0,
          net_amt: 0,
          cost: 0,
          profit: 0,
        }
      }
      itemMap[key].qty += qty
      itemMap[key].gross_amt += grossAmt
      itemMap[key].disc_amt += discAmt
      itemMap[key].net_amt += netAmt
      itemMap[key].cost += totalCost
      itemMap[key].profit += profit
    })

    rawItems.value = Object.values(itemMap).map((i) => {
      i.margin_pct = i.net_amt > 0 ? (i.profit / i.net_amt) * 100 : 0
      return i
    })
  } catch (err) {
    console.error('[CategoryWiseSales]', err)
    rawItems.value = []
    Notify.create({ type: 'negative', message: 'Failed to load Category Wise Sales: ' + (err?.message || err) })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
