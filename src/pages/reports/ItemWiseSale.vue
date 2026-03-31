<template>
  <ReportLayout
    title="Item Wise Sale Report"
    subtitle="POS Sales Report By Item — Quantity sold per item, grouped by subgroup"
    :kpis="kpiData"
    :export-columns="columns"
    :export-rows="displayRows"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <!-- Extra Filters -->
    <template #extra-filters>
      <div class="report-filter-group" style="min-width: 200px">
        <label class="report-filter-label">Category</label>
        <q-select
          v-model="extraFilters.category"
          :options="categoryOptions"
          dense
          outlined
          emit-value
          map-options
          clearable
          placeholder="All Categories"
          class="report-filter-input"
        />
      </div>

      <div class="report-filter-group" style="min-width: 200px">
        <label class="report-filter-label">Item</label>
        <q-select
          v-model="extraFilters.item"
          :options="filteredItemOptions"
          dense
          outlined
          emit-value
          map-options
          clearable
          placeholder="All Items"
          class="report-filter-input"
        />
      </div>
    </template>

    <template #default>
      <!-- ── Data Table ───────────────────────────── -->
      <q-table
        :rows="displayRows"
        :columns="columns"
        row-key="__rowKey"
        flat
        dense
        class="sap-table"
        :loading="loading"
        :rows-per-page-options="[0]"
        hide-pagination
        separator="none"
      >
        <!-- Header -->
        <template #header="props">
          <q-tr :props="props" class="sap-table__header">
            <q-th v-for="col in props.cols" :key="col.name" :props="props" class="sap-table__th">
              {{ col.label }}
            </q-th>
          </q-tr>
        </template>

        <!-- Body -->
        <template #body="props">
          <!-- Subgroup header row -->
          <q-tr v-if="props.row.__type === 'group-header'" class="sap-table__group-header">
            <q-td :colspan="columns.length" class="sap-table__group-name">
              <q-icon name="folder_open" size="14px" class="q-mr-xs" />
              {{ props.row.group_name }}
            </q-td>
          </q-tr>

          <!-- Subgroup subtotal row -->
          <q-tr v-else-if="props.row.__type === 'group-total'" class="sap-table__subtotal">
            <q-td class="text-weight-bold">Sub Group Total:</q-td>
            <q-td />
            <q-td class="sap-table__td--num text-weight-bold">{{ props.row.quantity }}</q-td>
            <q-td />
            <q-td />
            <q-td class="sap-table__td--num text-weight-bold">{{ fmtN(props.row.gross_amt) }}</q-td>
            <q-td class="sap-table__td--num text-weight-bold text-red">{{
              fmtN(props.row.disc_amt)
            }}</q-td>
            <q-td class="sap-table__td--num text-weight-bold">{{ fmtN(props.row.amount) }}</q-td>
            <q-td class="sap-table__td--num text-weight-bold">{{ fmtN(props.row.tax_amt) }}</q-td>
            <q-td class="sap-table__td--num text-weight-bold text-green">{{
              fmtN(props.row.amt_with_tax)
            }}</q-td>
            <q-td />
            <q-td class="sap-table__td--num text-weight-bold">{{ fmtN(props.row.cost) }}</q-td>
            <q-td class="sap-table__td--num text-weight-bold">{{ props.row.gp_pct }}%</q-td>
          </q-tr>

          <!-- Grand total row -->
          <q-tr v-else-if="props.row.__type === 'grand-total'" class="sap-table__grand-total">
            <q-td class="text-weight-bolder">GRAND TOTAL</q-td>
            <q-td />
            <q-td class="sap-table__td--num text-weight-bolder">{{ props.row.quantity }}</q-td>
            <q-td />
            <q-td />
            <q-td class="sap-table__td--num text-weight-bolder">{{
              fmtN(props.row.gross_amt)
            }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder text-red">{{
              fmtN(props.row.disc_amt)
            }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">{{ fmtN(props.row.amount) }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">{{ fmtN(props.row.tax_amt) }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder text-green">{{
              fmtN(props.row.amt_with_tax)
            }}</q-td>
            <q-td />
            <q-td class="sap-table__td--num text-weight-bolder">{{ fmtN(props.row.cost) }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">{{ props.row.gp_pct }}%</q-td>
          </q-tr>

          <!-- Normal item row -->
          <q-tr v-else :props="props" class="sap-table__row">
            <q-td key="description" :props="props">{{ props.row.description }}</q-td>
            <q-td key="item_code" :props="props" class="sap-table__td--mono">{{
              props.row.item_code
            }}</q-td>
            <q-td key="quantity" :props="props" class="sap-table__td--num">{{
              props.row.quantity
            }}</q-td>
            <q-td key="net_price" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.net_price)
            }}</q-td>
            <q-td key="cur_price" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.cur_price)
            }}</q-td>
            <q-td key="gross_amt" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.gross_amt)
            }}</q-td>
            <q-td key="disc_amt" :props="props" class="sap-table__td--num text-red">{{
              fmtN(props.row.disc_amt)
            }}</q-td>
            <q-td key="amount" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.amount)
            }}</q-td>
            <q-td key="tax_amt" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.tax_amt)
            }}</q-td>
            <q-td
              key="amt_with_tax"
              :props="props"
              class="sap-table__td--num text-weight-bold text-green"
              >{{ fmtN(props.row.amt_with_tax) }}</q-td
            >
            <q-td key="del_cost" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.del_cost)
            }}</q-td>
            <q-td key="cost" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.cost)
            }}</q-td>
            <q-td key="gp_pct" :props="props" class="sap-table__td--num">
              <q-badge
                :color="props.row.gp_pct > 30 ? 'green' : props.row.gp_pct > 15 ? 'orange' : 'red'"
                class="sap-gp-badge"
                >{{ props.row.gp_pct }}%</q-badge
              >
            </q-td>
            <q-td key="invoice_no" :props="props">
              <a v-if="props.row.invoice_no" href="#" class="inv-link" @click.prevent="openInvoice(props.row)">
                {{ props.row.invoice_no }}
              </a>
            </q-td>
          </q-tr>
        </template>

        <!-- Loading -->
        <template #loading>
          <q-inner-loading showing>
            <q-spinner-gears size="36px" color="primary" />
          </q-inner-loading>
        </template>

        <!-- Empty -->
        <template #no-data>
          <div class="report-empty">
            <q-icon name="inventory_2" size="40px" class="q-mb-sm" />
            <div>No item sales data for selected period</div>
          </div>
        </template>
      </q-table>
    </template>
  </ReportLayout>

  <InvoiceViewDialog v-model="showInvoiceDialog" :invoice-id="selectedInvoiceId" :order-id="selectedOrderId" />
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import InvoiceViewDialog from 'src/components/reports/InvoiceViewDialog.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'

const authStore = useAuthStore()
const loading = ref(false)
const rawItems = ref([])
const currentFilters = ref({})

const showInvoiceDialog = ref(false)
const selectedInvoiceId = ref(null)
const selectedOrderId = ref(null)

function openInvoice(row) {
  selectedInvoiceId.value = row.__invoiceId || null
  selectedOrderId.value = row.__orderId || null
  showInvoiceDialog.value = true
}

const extraFilters = ref({
  category: null,
  item: null,
})

const rawCategories = ref([])
const rawMenuItems = ref([])

const categoryOptions = computed(() => {
  return [
    { label: 'All Categories', value: null },
    ...rawCategories.value.map(c => ({ label: c.name, value: c.id }))
  ]
})

const filteredItemOptions = computed(() => {
  let items = rawMenuItems.value
  if (extraFilters.value.category) {
    items = items.filter(i => i.category_id === extraFilters.value.category)
  }
  return [
    { label: 'All Items', value: null },
    ...items.map(i => ({ label: i.name, value: i.id }))
  ]
})

watch(() => extraFilters.value.category, () => {
  extraFilters.value.item = null
})

async function loadFilterOptions() {
  const companyId = authStore.currentBranch?.company_id
  if (!companyId) return

  try {
    const { data: cats } = await supabase.from('categories').select('id, name').eq('company_id', companyId).order('name')
    if (cats) rawCategories.value = cats

    const { data: items } = await supabase.from('menu_items').select('id, name, category_id').eq('company_id', companyId).order('name')
    if (items) rawMenuItems.value = items
  } catch (err) {
    console.error('[ItemWiseSale] Error loading filter options', err)
  }
}

onMounted(() => {
  loadFilterOptions()
})

// ── Column Definitions (SAP B1 format) ────────────────────
const columns = [
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'item_code', label: 'Code', field: 'item_code', align: 'left', style: 'width:60px' },
  {
    name: 'quantity',
    label: 'Quantity',
    field: 'quantity',
    align: 'right',
    style: 'width:60px',
    sortable: true,
  },
  {
    name: 'net_price',
    label: 'Net Price',
    field: 'net_price',
    align: 'right',
    style: 'width:80px',
  },
  {
    name: 'cur_price',
    label: 'Cur Price',
    field: 'cur_price',
    align: 'right',
    style: 'width:80px',
  },
  {
    name: 'gross_amt',
    label: 'Gross Amt',
    field: 'gross_amt',
    align: 'right',
    style: 'width:90px',
    sortable: true,
  },
  { name: 'disc_amt', label: 'Disc Amt', field: 'disc_amt', align: 'right', style: 'width:80px' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', style: 'width:90px' },
  { name: 'tax_amt', label: 'TAS Amt', field: 'tax_amt', align: 'right', style: 'width:80px' },
  {
    name: 'amt_with_tax',
    label: 'Amt with TAS',
    field: 'amt_with_tax',
    align: 'right',
    style: 'width:100px',
    sortable: true,
  },
  { name: 'del_cost', label: 'Del.Cost', field: 'del_cost', align: 'right', style: 'width:70px' },
  { name: 'cost', label: 'Cost', field: 'cost', align: 'right', style: 'width:80px' },
  {
    name: 'gp_pct',
    label: 'GP %',
    field: 'gp_pct',
    align: 'right',
    style: 'width:55px',
    sortable: true,
  },
  { name: 'invoice_no', label: 'Invoice No', field: 'invoice_no', align: 'left', style: 'width:130px' },
]

// ── Helpers ────────────────────────────────────────────────
function fmtN(val) {
  const n = Number(val || 0)
  return n.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

// ── Process raw data → grouped display rows ───────────────
const displayRows = computed(() => {
  if (rawItems.value.length === 0) return []

  // Group items by category (subgroup)
  const groups = {}
  for (const item of rawItems.value) {
    const group = item.subgroup || 'UNCATEGORIZED'
    if (!groups[group]) groups[group] = []
    groups[group].push(item)
  }

  const result = []
  let grandQty = 0,
    grandGross = 0,
    grandDisc = 0,
    grandAmt = 0
  let grandTax = 0,
    grandAmtTax = 0,
    grandCost = 0

  const sortedGroups = Object.keys(groups).sort()

  for (const groupName of sortedGroups) {
    const items = groups[groupName]

    // Group header row
    result.push({
      __type: 'group-header',
      __rowKey: `gh-${groupName}`,
      group_name: groupName,
    })

    // Item rows
    let grpQty = 0,
      grpGross = 0,
      grpDisc = 0,
      grpAmt = 0
    let grpTax = 0,
      grpAmtTax = 0,
      grpCost = 0

    for (const item of items) {
      const qty = Number(item.quantity || 0)
      const netPrice = Number(item.net_price || 0)
      const curPrice = Number(item.cur_price || 0)
      const grossAmt = Number(item.gross_amt || 0)
      const discAmt = Number(item.disc_amt || 0)
      const amount = Number(item.amount || 0)
      const taxAmt = Number(item.tax_amt || 0)
      const amtWithTax = Number(item.amt_with_tax || 0)
      const cost = Number(item.cost || 0)
      const delCost = Number(item.del_cost || 0)
      const gpPct = amtWithTax > 0 ? (((amtWithTax - cost) / amtWithTax) * 100).toFixed(0) : 0

      grpQty += qty
      grpGross += grossAmt
      grpDisc += discAmt
      grpAmt += amount
      grpTax += taxAmt
      grpAmtTax += amtWithTax
      grpCost += cost

      result.push({
        __type: 'item',
        __rowKey: `item-${item.menu_item_id}-${item.subgroup}`,
        description: item.description,
        item_code: item.item_code,
        quantity: qty,
        net_price: netPrice,
        cur_price: curPrice,
        gross_amt: grossAmt,
        disc_amt: discAmt,
        amount,
        tax_amt: taxAmt,
        amt_with_tax: amtWithTax,
        del_cost: delCost,
        cost,
        gp_pct: gpPct,
      })
    }

    // Group subtotal row
    const grpGP = grpAmtTax > 0 ? (((grpAmtTax - grpCost) / grpAmtTax) * 100).toFixed(0) : 0
    result.push({
      __type: 'group-total',
      __rowKey: `gt-${groupName}`,
      quantity: grpQty,
      gross_amt: grpGross,
      disc_amt: grpDisc,
      amount: grpAmt,
      tax_amt: grpTax,
      amt_with_tax: grpAmtTax,
      cost: grpCost,
      gp_pct: grpGP,
    })

    grandQty += grpQty
    grandGross += grpGross
    grandDisc += grpDisc
    grandAmt += grpAmt
    grandTax += grpTax
    grandAmtTax += grpAmtTax
    grandCost += grpCost
  }

  // Grand total row
  const grandGP = grandAmtTax > 0 ? (((grandAmtTax - grandCost) / grandAmtTax) * 100).toFixed(0) : 0
  result.push({
    __type: 'grand-total',
    __rowKey: 'grand-total',
    quantity: grandQty,
    gross_amt: grandGross,
    disc_amt: grandDisc,
    amount: grandAmt,
    tax_amt: grandTax,
    amt_with_tax: grandAmtTax,
    cost: grandCost,
    gp_pct: grandGP,
  })

  return result
})

// ── KPIs ──────────────────────────────────────────────────
const kpiData = computed(() => {
  const gt = displayRows.value.find((r) => r.__type === 'grand-total')
  if (!gt) return []
  return [
    { label: 'Total Items Sold', value: gt.quantity, icon: 'shopping_cart', color: 'blue' },
    { label: 'Gross Sales', value: `LKR ${fmtN(gt.gross_amt)}`, icon: 'payments', color: 'green' },
    {
      label: 'Total Discounts',
      value: `LKR ${fmtN(gt.disc_amt)}`,
      icon: 'local_offer',
      color: 'amber',
    },
    {
      label: 'Net Revenue',
      value: `LKR ${fmtN(gt.amt_with_tax)}`,
      icon: 'trending_up',
      color: 'teal',
    },
    { label: 'GP %', value: `${gt.gp_pct}%`, icon: 'pie_chart', color: 'purple' },
  ]
})

// ── Data Loading ──────────────────────────────────────────
async function loadData(filters = {}) {
  loading.value = true
  currentFilters.value = filters
  try {
    // Query order_items with menu_items and item_categories
    let query = supabase.from('order_items').select(`
        id,
        menu_item_id,
        quantity,
        unit_price,
        total_price,
        status,
        orders!inner (
          id,
          order_type,
          status,
          payment_status,
          subtotal,
          tax_amount,
          discount_amount,
          total_amount,
          delivery_charge,
          branch_id,
          created_at,
          invoices ( id, invoice_no )
        ),
        menu_items (
          id,
          name,
          base_price,
          categories ( id, name )
        )
      `)

    // Date filters on orders.created_at
    if (filters.dateFrom) query = query.gte('orders.created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('orders.created_at', filters.dateTo + 'T23:59:59')

    // Branch filter
    if (filters.branch) {
      query = query.eq('orders.branch_id', filters.branch)
    } else if (!authStore.isAdmin) {
      const branchId = authStore.currentBranch?.id
      if (branchId) query = query.eq('orders.branch_id', branchId)
    }

    // Exclude cancelled order items
    query = query.not('status', 'eq', 'cancelled')

    const { data, error } = await query.limit(5000)
    if (error) throw error

    // Aggregate by menu item + category
    const itemMap = {}
    for (const oi of data || []) {
      const order = oi.orders
      if (!order || order.status === 'cancelled') continue

      const menuItem = oi.menu_items || {}
      const category = menuItem.categories || {}

      if (extraFilters.value.category && category.id !== extraFilters.value.category) continue
      if (extraFilters.value.item && menuItem.id !== extraFilters.value.item) continue

      const key = `${oi.menu_item_id}__${category.name || 'UNCATEGORIZED'}`
      const qty = Number(oi.quantity || 0)
      const itemTotal = Number(oi.total_price || oi.quantity * oi.unit_price || 0)
      const unitPrice = Number(oi.unit_price || menuItem.base_price || 0)

      // Prorate order-level discount and tax to this item
      const orderItemsTotal = Number(order.subtotal || order.total_amount || 1)
      const ratio = orderItemsTotal > 0 ? itemTotal / orderItemsTotal : 0
      const discShare = Number(order.discount_amount || 0) * ratio
      const taxShare = Number(order.tax_amount || 0) * ratio
      const deliveryShare = Number(order.delivery_charge || 0) * ratio

      if (!itemMap[key]) {
        const orderInvs = Array.isArray(order.invoices) ? order.invoices : order.invoices ? [order.invoices] : []
        const firstInv = orderInvs[0] || null
        itemMap[key] = {
          menu_item_id: oi.menu_item_id,
          description: menuItem.name || 'Unknown Item',
          item_code: (oi.menu_item_id || '').toString().slice(0, 6).toUpperCase(),
          subgroup: (category.name || 'UNCATEGORIZED').toUpperCase(),
          quantity: 0,
          net_price: unitPrice,
          cur_price: unitPrice,
          gross_amt: 0,
          disc_amt: 0,
          amount: 0,
          tax_amt: 0,
          amt_with_tax: 0,
          del_cost: 0,
          cost: 0,
          invoice_no: firstInv?.invoice_no || '',
          __invoiceId: firstInv?.id || null,
          __orderId: order.id || null,
        }
      }

      itemMap[key].quantity += qty
      itemMap[key].gross_amt += itemTotal
      itemMap[key].disc_amt += discShare
      itemMap[key].amount += itemTotal - discShare
      itemMap[key].tax_amt += taxShare
      itemMap[key].amt_with_tax += itemTotal - discShare + taxShare
      itemMap[key].del_cost += deliveryShare
      // Cost would come from inventory/recipe costing — for now use 0
      // itemMap[key].cost += ...
    }

    rawItems.value = Object.values(itemMap).sort((a, b) => {
      if (a.subgroup !== b.subgroup) return a.subgroup.localeCompare(b.subgroup)
      return a.description.localeCompare(b.description)
    })
  } catch (err) {
    console.error('[ItemWiseSale] Error:', err)
  } finally {
    loading.value = false
  }
}

// ── Export ─────────────────────────────────────────────────
function exportCSV() {
  const exportRows = displayRows.value.filter((r) => r.__type === 'item')
  exportTableToCSV(columns, exportRows, 'item_wise_sales')
}
function exportExcel() {
  const exportRows = displayRows.value.filter((r) => r.__type === 'item')
  exportTableToExcel(columns, exportRows, 'item_wise_sales')
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
