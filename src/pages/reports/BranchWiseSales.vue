<template>
  <ReportLayout
    title="Kitchen Wise Sales"
    subtitle="Sales comparison across all kitchens"
    :kpis="kpiData"
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
        row-key="kitchen"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50]"
        :pagination="{ rowsPerPage: 25, sortBy: 'total', descending: true }"
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
            <q-td key="kitchen" :props="props" class="text-weight-bold">{{
              props.row.kitchen
            }}</q-td>
            <q-td key="order_count" :props="props" class="report-table__td--num">{{
              props.row.order_count
            }}</q-td>
            <q-td key="subtotal" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.subtotal)
            }}</q-td>
            <q-td key="discount" :props="props" class="report-table__td--num text-red">{{
              fmtLKR(props.row.discount)
            }}</q-td>
            <q-td key="tax" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.tax)
            }}</q-td>
            <q-td
              key="total"
              :props="props"
              class="report-table__td--num text-weight-bolder text-green"
              >{{ fmtLKR(props.row.total) }}</q-td
            >
            <q-td key="avg_order" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.avg_order)
            }}</q-td>
            <q-td key="share" :props="props" class="report-table__td--num"
              ><q-badge :color="props.row.share > 30 ? 'blue' : 'grey'">{{
                fmtPercent(props.row.share)
              }}</q-badge></q-td
            >
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td class="report-table__td--bold">TOTAL</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{ totals.orders }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{
              fmtLKR(totals.subtotal)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-red">{{
              fmtLKR(totals.discount)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{
              fmtLKR(totals.tax)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-green">{{
              fmtLKR(totals.total)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{
              totals.orders > 0 ? fmtLKR(totals.total / totals.orders) : '—'
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">100%</q-td>
          </q-tr></template
        >
        <template #no-data
          ><div class="report-empty">
            <q-icon name="kitchen" size="40px" class="q-mb-sm" />
            <div>No kitchen data</div>
          </div></template
        >
      </q-table>
    </template>
  </ReportLayout>
</template>
<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, fmtPercent } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])
const columns = [
  { name: 'kitchen', label: 'Kitchen', field: 'kitchen', align: 'left', sortable: true },
  { name: 'order_count', label: 'Orders', field: 'order_count', align: 'right', sortable: true },
  { name: 'subtotal', label: 'Subtotal', field: 'subtotal', align: 'right', sortable: true },
  { name: 'discount', label: 'Discount', field: 'discount', align: 'right' },
  { name: 'tax', label: 'Tax', field: 'tax', align: 'right' },
  { name: 'total', label: 'Total', field: 'total', align: 'right', sortable: true },
  { name: 'avg_order', label: 'Avg Order', field: 'avg_order', align: 'right', sortable: true },
  { name: 'share', label: '% Share', field: 'share', align: 'right', sortable: true },
]
const totals = computed(() => {
  const t = { orders: 0, subtotal: 0, discount: 0, tax: 0, total: 0 }
  rows.value.forEach((r) => {
    t.orders += r.order_count
    t.subtotal += r.subtotal
    t.discount += r.discount
    t.tax += r.tax
    t.total += r.total
  })
  return t
})
const kpiData = computed(() => [
  { label: 'Kitchens', value: rows.value.length, icon: 'kitchen', color: 'blue' },
  { label: 'Total Revenue', value: fmtLKR(totals.value.total), icon: 'payments', color: 'green' },
  { label: 'Total Orders', value: totals.value.orders, icon: 'receipt_long', color: 'purple' },
  {
    label: 'Top Kitchen',
    value: rows.value[0]?.kitchen || '—',
    icon: 'emoji_events',
    color: 'amber',
  },
])

async function loadData(filters = {}) {
  loading.value = true
  try {
    // Fetch orders with their order_items which link to menu_items → sub_categories → kitchen mapping
    let query = supabase
      .from('orders')
      .select(
        `
      subtotal,discount_amount,tax_amount,total_amount,status,branch_id,
      order_items (
        menu_items (
          sub_category_id,
          menu_sub_categories ( kitchen_subcategory_map ( kitchens ( name ) ) )
        )
      )
    `,
      )
      .neq('status', 'cancelled')
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    const { data, error } = await query.limit(5000)
    if (error) throw error

    // Kitchens to exclude (same as filter dropdown)
    const excludeNames = [
      'CHINEESE',
      'FUNCTION MENU',
      'Main Kitchen',
      'Main Store',
      'OTHERS',
      'SRI LANKAN',
      'WESTERN',
    ]

    // Try to extract kitchen from order items
    const kMap = {}
    let gt = 0
    ;(data || []).forEach((order) => {
      // Try to find kitchen from order items path
      let kitchenName = 'Unknown'
      const items = Array.isArray(order.order_items) ? order.order_items : []
      for (const item of items) {
        const mi = item.menu_items
        if (!mi) continue
        const sc = mi.menu_sub_categories
        if (!sc) continue
        const maps = Array.isArray(sc.kitchen_subcategory_map)
          ? sc.kitchen_subcategory_map
          : sc.kitchen_subcategory_map
            ? [sc.kitchen_subcategory_map]
            : []
        for (const m of maps) {
          if (m.kitchens?.name) {
            kitchenName = m.kitchens.name
            break
          }
        }
        if (kitchenName !== 'Unknown') break
      }

      if (!kMap[kitchenName])
        kMap[kitchenName] = {
          kitchen: kitchenName,
          order_count: 0,
          subtotal: 0,
          discount: 0,
          tax: 0,
          total: 0,
        }
      kMap[kitchenName].order_count++
      kMap[kitchenName].subtotal += Number(order.subtotal || 0)
      kMap[kitchenName].discount += Number(order.discount_amount || 0)
      kMap[kitchenName].tax += Number(order.tax_amount || 0)
      kMap[kitchenName].total += Number(order.total_amount || 0)
      gt += Number(order.total_amount || 0)
    })

    rows.value = Object.values(kMap)
      .filter((k) => !excludeNames.includes(k.kitchen))
      .map((k) => ({
        ...k,
        avg_order: k.order_count > 0 ? k.total / k.order_count : 0,
        share: gt > 0 ? (k.total / gt) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
  } catch (e) {
    console.error('[KitchenWise]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'kitchen_wise_sales')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'kitchen_wise_sales')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
