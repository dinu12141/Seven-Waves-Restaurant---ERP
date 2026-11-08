<template>
  <ReportLayout
    title="Monthly Inventory Cost (COGS) & Valuation"
    subtitle="Monthly inventory movements, moving weighted average valuation, and COGS reconciliation"
    :kpis="kpiData"
    :export-columns="exportColumns"
    :export-rows="filteredRows"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #extra-filters>
      <div class="report-filter-group">
        <label class="report-filter-label">Month</label>
        <q-input
          v-model="selectedMonth"
          type="month"
          dense
          outlined
          class="report-filter-input"
          style="min-width: 140px"
          @update:model-value="loadData"
        />
      </div>

      <div class="report-filter-group">
        <label class="report-filter-label">Search Item</label>
        <q-input
          v-model="search"
          dense
          outlined
          clearable
          placeholder="Item name or code…"
          class="report-filter-input"
        >
          <template #prepend><q-icon name="search" size="16px" /></template>
        </q-input>
      </div>

      <div class="report-filter-group">
        <label class="report-filter-label">Category</label>
        <q-select
          v-model="categoryFilter"
          :options="['All Categories', ...categoryNames]"
          dense
          outlined
          class="report-filter-input"
          style="min-width: 160px"
        />
      </div>
    </template>

    <template #default>
      <!-- Reconciliation & Method A vs Method B Variance Card -->
      <div class="q-pa-md q-mb-md rounded-borders shadow-1 bg-grey-1" style="border-left: 4px solid var(--q-primary)">
        <div class="row items-center justify-between q-mb-sm">
          <div class="row items-center">
            <q-icon name="balance" size="20px" color="primary" class="q-mr-xs" />
            <span class="text-subtitle1 text-weight-bold">COGS Reconciliation & Shrinkage Variance</span>
            <q-badge color="primary" class="q-ml-sm" label="LKAS 2 / IAS 2 Standard" />
          </div>
          <div>
            <q-badge
              :color="reportData.variance === 0 ? 'positive' : Math.abs(reportData.variance) <= 500 ? 'blue-8' : 'amber-9'"
              class="text-weight-bold q-pa-xs"
              style="font-size: 12px"
            >
              {{ reportData.variance === 0 ? '✓ 100% Balanced' : `Variance: LKR ${fmt(reportData.variance)}` }}
            </q-badge>
          </div>
        </div>

        <div class="row q-col-gutter-md">
          <!-- Method A: Perpetual -->
          <div class="col-12 col-md-5">
            <div class="q-pa-sm bg-white rounded-borders border">
              <div class="text-caption text-weight-bold text-grey-8 row items-center">
                <q-icon name="receipt_long" size="16px" class="q-mr-xs text-primary" />
                Method A: Booked GIN Consumption (Perpetual)
              </div>
              <div class="row justify-between text-caption q-mt-xs text-grey-7">
                <span>Kitchen Food Cost (COGS 6000):</span>
                <span class="text-weight-bold text-dark">LKR {{ fmt(reportData.totalKitchenFoodCost) }}</span>
              </div>
              <div class="row justify-between text-caption text-grey-7">
                <span>Operating Supplies (Cleaning / Fuel):</span>
                <span class="text-weight-bold text-dark">LKR {{ fmt(reportData.totalOperatingSupplies) }}</span>
              </div>
              <div class="row justify-between text-caption text-grey-7">
                <span>Recorded Wastage (6003):</span>
                <span class="text-weight-bold text-dark">LKR {{ fmt(reportData.totalWastage) }}</span>
              </div>
              <q-separator class="q-my-xs" />
              <div class="row justify-between text-subtitle2 text-weight-bold text-primary">
                <span>Total Booked Cost:</span>
                <span>LKR {{ fmt(reportData.bookedCOGS) }}</span>
              </div>
            </div>
          </div>

          <!-- Method B: Periodic Stock Formula -->
          <div class="col-12 col-md-5">
            <div class="q-pa-sm bg-white rounded-borders border">
              <div class="text-caption text-weight-bold text-grey-8 row items-center">
                <q-icon name="calculate" size="16px" class="q-mr-xs text-teal" />
                Method B: Periodic Stock Valuation Formula
              </div>
              <div class="row justify-between text-caption q-mt-xs text-grey-7">
                <span>Opening Stock Value (1st of month):</span>
                <span class="text-weight-bold text-dark">LKR {{ fmt(reportData.openingValuation) }}</span>
              </div>
              <div class="row justify-between text-caption text-grey-7">
                <span>Add: Total Purchases (GRN):</span>
                <span class="text-weight-bold text-positive">+ LKR {{ fmt(reportData.totalPurchases) }}</span>
              </div>
              <div class="row justify-between text-caption text-grey-7">
                <span>Less: Closing Physical / Book Stock:</span>
                <span class="text-weight-bold text-negative">- LKR {{ fmt(reportData.closingValuation) }}</span>
              </div>
              <q-separator class="q-my-xs" />
              <div class="row justify-between text-subtitle2 text-weight-bold text-teal-9">
                <span>Periodic Consumed:</span>
                <span>LKR {{ fmt(reportData.periodicCOGS) }}</span>
              </div>
            </div>
          </div>

          <!-- Variance Interpretation -->
          <div class="col-12 col-md-2 flex flex-center">
            <div class="text-center">
              <div class="text-caption text-grey-7">Consumption Variance:</div>
              <div
                class="text-h6 text-weight-bolder"
                :class="reportData.variance === 0 ? 'text-positive' : reportData.variance > 0 ? 'text-negative' : 'text-primary'"
              >
                LKR {{ fmt(reportData.variance) }}
              </div>
              <div class="text-caption" style="font-size: 11px">
                {{ reportData.variance > 0 ? '⚠️ Unrecorded Waste / Leakage' : reportData.variance < 0 ? 'ℹ️ Stock Gain / Excess' : '✓ Zero Leakage' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Item Breakdown Table -->
      <q-table
        :rows="filteredRows"
        :columns="columns"
        row-key="itemId"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100]"
        :pagination="{ rowsPerPage: 50 }"
        binary-state-sort
      >
        <template #header="props">
          <q-tr :props="props" class="report-table__header-row">
            <q-th v-for="col in props.cols" :key="col.name" :props="props" class="report-table__th">
              {{ col.label }}
            </q-th>
          </q-tr>
        </template>

        <template #body="props">
          <q-tr :props="props" class="report-table__row">
            <q-td key="itemName" :props="props" class="text-weight-bold">
              {{ props.row.itemName }}
            </q-td>
            <q-td key="itemCode" :props="props" class="report-table__td--mono report-table__td--muted">
              {{ props.row.itemCode }}
            </q-td>
            <q-td key="categoryName" :props="props">
              <q-badge color="grey-8" text-color="white" :label="props.row.categoryName" />
            </q-td>
            <q-td key="uom" :props="props" class="text-center">
              {{ props.row.uom }}
            </q-td>
            <q-td key="unitCost" :props="props" class="report-table__td--num text-weight-bold text-primary">
              LKR {{ fmt(props.row.unitCost) }}
            </q-td>

            <!-- Opening -->
            <q-td key="openingQty" :props="props" class="report-table__td--num">
              {{ props.row.openingQty.toLocaleString() }}
            </q-td>
            <q-td key="openingValue" :props="props" class="report-table__td--num text-grey-8">
              LKR {{ fmt(props.row.openingValue) }}
            </q-td>

            <!-- Purchases -->
            <q-td key="purchasesQty" :props="props" class="report-table__td--num text-positive text-weight-bold">
              {{ props.row.purchasesQty > 0 ? '+' + props.row.purchasesQty.toLocaleString() : '—' }}
            </q-td>
            <q-td key="purchasesValue" :props="props" class="report-table__td--num text-positive">
              {{ props.row.purchasesValue > 0 ? 'LKR ' + fmt(props.row.purchasesValue) : '—' }}
            </q-td>

            <!-- Kitchen Issues -->
            <q-td key="kitchenIssuesQty" :props="props" class="report-table__td--num text-weight-bold">
              {{ props.row.kitchenIssuesQty > 0 ? props.row.kitchenIssuesQty.toLocaleString() : '—' }}
            </q-td>
            <q-td key="kitchenIssuesValue" :props="props" class="report-table__td--num text-weight-medium">
              {{ props.row.kitchenIssuesValue > 0 ? 'LKR ' + fmt(props.row.kitchenIssuesValue) : '—' }}
            </q-td>

            <!-- Closing -->
            <q-td key="closingQty" :props="props" class="report-table__td--num text-weight-bold text-teal-9">
              {{ props.row.closingQty.toLocaleString() }}
            </q-td>
            <q-td key="closingValue" :props="props" class="report-table__td--num text-weight-bold text-teal-9">
              LKR {{ fmt(props.row.closingValue) }}
            </q-td>

            <!-- Action: Compare Supplier Prices -->
            <q-td key="actions" :props="props" auto-width>
              <q-btn
                flat
                dense
                round
                icon="compare_arrows"
                color="primary"
                size="sm"
                @click="openPriceComparison(props.row)"
              >
                <q-tooltip>Compare Supplier Prices & History</q-tooltip>
              </q-btn>
            </q-td>
          </q-tr>
        </template>

        <template #bottom-row>
          <q-tr class="report-table__total-row">
            <q-td colspan="5" class="report-table__td--bold">TOTALS</q-td>
            <q-td colspan="2" class="report-table__td--bold text-right">LKR {{ fmt(reportData.openingValuation) }}</q-td>
            <q-td colspan="2" class="report-table__td--bold text-right text-positive">LKR {{ fmt(reportData.totalPurchases) }}</q-td>
            <q-td colspan="2" class="report-table__td--bold text-right text-primary">LKR {{ fmt(reportData.totalKitchenFoodCost) }}</q-td>
            <q-td colspan="2" class="report-table__td--bold text-right text-teal-9">LKR {{ fmt(reportData.closingValuation) }}</q-td>
            <q-td />
          </q-tr>
        </template>

        <template #no-data>
          <div class="report-empty">
            <q-icon name="assessment" size="40px" class="q-mb-sm text-grey-5" />
            <div>No inventory costing records found for this month</div>
          </div>
        </template>
      </q-table>

      <!-- Supplier Price Comparison Dialog -->
      <SupplierPriceComparisonDialog
        v-model="showPriceComparison"
        :item-id="selectedItemIdForPrice"
      />
    </template>
  </ReportLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import SupplierPriceComparisonDialog from 'src/components/inventory/SupplierPriceComparisonDialog.vue'
import { inventoryCostingService } from 'src/services/inventory/inventoryCostingService'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR } from 'src/services/reportService'

const loading = ref(false)
const selectedMonth = ref(new Date().toISOString().slice(0, 7))
const search = ref('')
const categoryFilter = ref('All Categories')

const showPriceComparison = ref(false)
const selectedItemIdForPrice = ref('')

const reportData = ref({
  yearMonth: '',
  dateFrom: '',
  dateTo: '',
  openingValuation: 0,
  totalPurchases: 0,
  totalKitchenFoodCost: 0,
  totalOperatingSupplies: 0,
  totalWastage: 0,
  closingValuation: 0,
  posRevenue: 0,
  foodCostPct: 0,
  bookedCOGS: 0,
  periodicCOGS: 0,
  variance: 0,
  items: [],
  categories: [],
})

const categoryNames = computed(() => [
  ...new Set(reportData.value.items.map((r) => r.categoryName).filter(Boolean)),
])

const filteredRows = computed(() => {
  let list = reportData.value.items
  if (categoryFilter.value && categoryFilter.value !== 'All Categories') {
    list = list.filter((r) => r.categoryName === categoryFilter.value)
  }
  if (search.value?.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(
      (r) => r.itemName?.toLowerCase().includes(q) || r.itemCode?.toLowerCase().includes(q),
    )
  }
  return list
})

const kpiData = computed(() => [
  {
    label: 'Opening Valuation',
    value: fmtLKR(reportData.value.openingValuation),
    icon: 'store',
    color: 'blue',
  },
  {
    label: 'Total Purchases (GRN)',
    value: fmtLKR(reportData.value.totalPurchases),
    icon: 'local_shipping',
    color: 'green',
  },
  {
    label: 'Kitchen Food Cost',
    value: fmtLKR(reportData.value.totalKitchenFoodCost),
    icon: 'restaurant',
    color: 'amber',
  },
  {
    label: 'Closing Stock Valuation',
    value: fmtLKR(reportData.value.closingValuation),
    icon: 'shelves',
    color: 'teal',
  },
  {
    label: 'Food Cost % of Sales',
    value: `${reportData.value.foodCostPct}%`,
    icon: 'pie_chart',
    color: reportData.value.foodCostPct <= 35 ? 'positive' : 'negative',
  },
])

const columns = [
  { name: 'itemName', label: 'Item Name', field: 'itemName', align: 'left', sortable: true },
  { name: 'itemCode', label: 'Code', field: 'itemCode', align: 'left', sortable: true },
  { name: 'categoryName', label: 'Category', field: 'categoryName', align: 'left', sortable: true },
  { name: 'uom', label: 'UOM', field: 'uom', align: 'center', sortable: true },
  { name: 'unitCost', label: 'Avg Cost (MAC)', field: 'unitCost', align: 'right', sortable: true },
  { name: 'openingQty', label: 'Opening Qty', field: 'openingQty', align: 'right', sortable: true },
  { name: 'openingValue', label: 'Opening Value', field: 'openingValue', align: 'right', sortable: true },
  { name: 'purchasesQty', label: 'Purchases Qty', field: 'purchasesQty', align: 'right', sortable: true },
  { name: 'purchasesValue', label: 'Purchases Value', field: 'purchasesValue', align: 'right', sortable: true },
  { name: 'kitchenIssuesQty', label: 'Issues Qty', field: 'kitchenIssuesQty', align: 'right', sortable: true },
  { name: 'kitchenIssuesValue', label: 'Food Cost (LKR)', field: 'kitchenIssuesValue', align: 'right', sortable: true },
  { name: 'closingQty', label: 'Closing Qty', field: 'closingQty', align: 'right', sortable: true },
  { name: 'closingValue', label: 'Closing Value', field: 'closingValue', align: 'right', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'center' },
]

const exportColumns = columns.filter((c) => c.name !== 'actions')

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function openPriceComparison(row) {
  selectedItemIdForPrice.value = row.itemId
  showPriceComparison.value = true
}

async function loadData() {
  loading.value = true
  try {
    const data = await inventoryCostingService.fetchMonthlyCostingReport(selectedMonth.value)
    reportData.value = data
  } catch (err) {
    console.error('[MonthlyInventoryCostReport] load error:', err)
  } finally {
    loading.value = false
  }
}

function exportCSV() {
  exportTableToCSV(filteredRows.value, exportColumns, `monthly_cogs_${selectedMonth.value}`)
}

function exportExcel() {
  exportTableToExcel(filteredRows.value, exportColumns, `monthly_cogs_${selectedMonth.value}`)
}

onMounted(loadData)
</script>

