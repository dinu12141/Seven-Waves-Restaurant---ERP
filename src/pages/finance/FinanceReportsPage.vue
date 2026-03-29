<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="Financial Reports"
      breadcrumbs="Finance / Reports"
      showRefresh
      @refresh="loadCurrentReport"
    />

    <div class="fin-filters q-mb-md">
      <q-input
        v-model="dateFrom"
        label="From"
        type="date"
        dense
        dark
        outlined
        style="min-width: 150px"
      />
      <q-input
        v-model="dateTo"
        label="To"
        type="date"
        dense
        dark
        outlined
        style="min-width: 150px"
      />
      <q-select
        v-if="activeTab === 'monthly'"
        v-model="selectedYear"
        :options="yearOptions"
        label="Year"
        dense
        dark
        outlined
        style="min-width: 100px"
      />
      <q-btn
        unelevated
        dense
        label="Generate"
        color="blue-8"
        icon="play_arrow"
        @click="loadCurrentReport"
        class="q-px-md"
        style="height: 40px"
      />
      <q-separator vertical dark class="q-mx-sm" />
      <q-btn flat dense icon="picture_as_pdf" color="red-4" @click="exportPDF" title="Download PDF"
        ><q-tooltip>Export PDF</q-tooltip></q-btn
      >
      <q-btn flat dense icon="grid_on" color="green-4" @click="exportExcel" title="Download Excel"
        ><q-tooltip>Export Excel</q-tooltip></q-btn
      >
      <q-btn flat dense icon="description" color="amber-4" @click="exportCSV" title="Download CSV"
        ><q-tooltip>Export CSV</q-tooltip></q-btn
      >
      <q-btn flat dense icon="print" color="grey-5" @click="printReport" title="Print"
        ><q-tooltip>Print</q-tooltip></q-btn
      >
    </div>

    <q-tabs
      v-model="activeTab"
      dense
      dark
      active-color="blue-4"
      indicator-color="blue-4"
      class="q-mb-md text-grey-5 fin-report-tabs"
      align="left"
      narrow-indicator
      @update:model-value="loadCurrentReport"
    >
      <q-tab name="monthly" label="MONTHLY SUMMARY" icon="calendar_month" />
      <q-tab name="pnl" label="P&L" icon="trending_up" />
      <q-tab name="bs" label="BALANCE SHEET" icon="account_balance" />
      <q-tab name="cogs" label="COGS" icon="inventory_2" />
      <q-tab name="cashflow" label="CASH FLOW" icon="swap_vert" />
    </q-tabs>


    <q-tab-panels v-model="activeTab" animated dark class="bg-transparent" id="report-print-area">
      <!-- ═══════ MONTHLY P&L SUMMARY ═══════ -->
      <q-tab-panel name="monthly" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header">
            <span class="fin-panel__title"
              >Monthly Profit, Loss, Expenses & Wages Summary — {{ selectedYear }}</span
            >
          </div>
          <div class="fin-panel__body q-pa-md" v-if="monthlyData">
            <div class="row q-col-gutter-md q-mb-md">
              <div class="col-6 col-sm-3">
                <div class="fin-kpi-card">
                  <div class="fin-kpi-card__icon" style="background: rgba(16, 185, 129, 0.12)">
                    <q-icon name="trending_up" color="green" />
                  </div>
                  <div>
                    <div class="fin-kpi-card__label">Year Revenue</div>
                    <div class="fin-kpi-card__value text-green-4">
                      {{ fmt(monthlyData.yearRevenue) }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-6 col-sm-3">
                <div class="fin-kpi-card">
                  <div class="fin-kpi-card__icon" style="background: rgba(239, 68, 68, 0.12)">
                    <q-icon name="trending_down" color="red" />
                  </div>
                  <div>
                    <div class="fin-kpi-card__label">Year Expenses</div>
                    <div class="fin-kpi-card__value text-red-4">
                      {{ fmt(monthlyData.yearExpenses) }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-6 col-sm-3">
                <div class="fin-kpi-card">
                  <div class="fin-kpi-card__icon" style="background: rgba(245, 158, 11, 0.12)">
                    <q-icon name="groups" color="amber" />
                  </div>
                  <div>
                    <div class="fin-kpi-card__label">Year Wages</div>
                    <div class="fin-kpi-card__value text-amber-4">
                      {{ fmt(monthlyData.yearWages) }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-6 col-sm-3">
                <div class="fin-kpi-card">
                  <div class="fin-kpi-card__icon" style="background: rgba(59, 130, 246, 0.12)">
                    <q-icon name="balance" color="blue" />
                  </div>
                  <div>
                    <div class="fin-kpi-card__label">Year Net Profit</div>
                    <div
                      class="fin-kpi-card__value"
                      :class="monthlyData.yearProfit >= 0 ? 'text-green-4' : 'text-red-4'"
                    >
                      {{ fmt(monthlyData.yearProfit) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <q-table
              :rows="monthlyData.monthly"
              :columns="monthlyCols"
              row-key="month"
              flat
              dark
              dense
              hide-bottom
              :rows-per-page-options="[0]"
              class="fin-table"
            >
              <template #body-cell-profit="props"
                ><q-td :props="props"
                  ><span
                    :class="props.row.profit >= 0 ? 'text-green-4' : 'text-red-4'"
                    class="text-weight-bold"
                    >{{ fmt(props.row.profit) }}</span
                  ></q-td
                ></template
              >
              <template #body-cell-month="props"
                ><q-td :props="props"
                  ><span class="text-weight-bold">{{ monthName(props.row.month) }}</span></q-td
                ></template
              >
            </q-table>
          </div>
          <div v-else class="text-grey-6 text-center q-pa-xl">
            <q-icon name="calendar_month" size="48px" class="q-mb-sm" /><br />Click Generate to view
            monthly summary
          </div>
        </div>
      </q-tab-panel>

      <!-- ═══════ P&L ═══════ -->
      <q-tab-panel name="pnl" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header">
            <span class="fin-panel__title">Profit & Loss Statement</span
            ><span class="fin-panel__subtitle">{{ dateFrom }} to {{ dateTo }}</span>
          </div>
          <div class="fin-panel__body q-pa-md" v-if="pnlData">
            <div class="text-subtitle2 text-green-4 q-mb-xs">Revenue (4xxx)</div>
            <q-table
              :rows="pnlData.revenue"
              :columns="pnlCols"
              row-key="code"
              flat
              dark
              dense
              hide-bottom
              :rows-per-page-options="[0]"
              class="fin-table q-mb-md"
              no-data-label="No revenue entries"
            />
            <div class="fin-summary-row q-mb-md" style="border-radius: 6px">
              <span class="fin-summary-row__label">Total Revenue</span
              ><span class="fin-summary-row__value text-green-4">{{
                fmt(pnlData.totalRevenue)
              }}</span>
            </div>
            <div class="text-subtitle2 text-red-4 q-mb-xs">Expenses (5xxx)</div>
            <q-table
              :rows="pnlData.expenses"
              :columns="pnlCols"
              row-key="code"
              flat
              dark
              dense
              hide-bottom
              :rows-per-page-options="[0]"
              class="fin-table q-mb-md"
              no-data-label="No expense entries"
            />
            <div class="fin-summary-row q-mb-md" style="border-radius: 6px">
              <span class="fin-summary-row__label">Total Expenses</span
              ><span class="fin-summary-row__value text-red-4">{{
                fmt(pnlData.totalExpenses)
              }}</span>
            </div>
            <div class="fin-summary-row" style="border-radius: 6px; border: 1px solid #388bfd">
              <span class="fin-summary-row__label text-h6">Net Profit / (Loss)</span
              ><span
                :class="[
                  'fin-summary-row__value text-h6',
                  pnlData.netProfit >= 0 ? 'text-green-4' : 'text-red-4',
                ]"
                >{{ fmt(pnlData.netProfit) }}</span
              >
            </div>
          </div>
          <div v-else class="text-grey-6 text-center q-pa-xl">
            <q-icon name="trending_up" size="48px" class="q-mb-sm" /><br />Click Generate
          </div>
        </div>
      </q-tab-panel>

      <!-- ═══════ BALANCE SHEET ═══════ -->
      <q-tab-panel name="bs" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header">
            <span class="fin-panel__title">Balance Sheet</span
            ><span class="fin-panel__subtitle">As at {{ dateTo }}</span>
          </div>
          <div class="fin-panel__body q-pa-md" v-if="bsData">
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-4">
                <div class="text-subtitle2 text-blue-4 q-mb-xs">Assets</div>
                <q-table
                  :rows="bsData.assets"
                  :columns="bsCols"
                  row-key="code"
                  flat
                  dark
                  dense
                  hide-bottom
                  :rows-per-page-options="[0]"
                  class="fin-table"
                />
                <div class="fin-summary-row" style="border-radius: 6px">
                  <span class="fin-summary-row__label">Total Assets</span
                  ><span class="fin-summary-row__value text-blue-4">{{
                    fmt(bsData.totalAssets)
                  }}</span>
                </div>
              </div>
              <div class="col-12 col-md-4">
                <div class="text-subtitle2 text-red-4 q-mb-xs">Liabilities</div>
                <q-table
                  :rows="bsData.liabilities"
                  :columns="bsCols"
                  row-key="code"
                  flat
                  dark
                  dense
                  hide-bottom
                  :rows-per-page-options="[0]"
                  class="fin-table"
                />
                <div class="fin-summary-row" style="border-radius: 6px">
                  <span class="fin-summary-row__label">Total Liabilities</span
                  ><span class="fin-summary-row__value text-red-4">{{
                    fmt(bsData.totalLiabilities)
                  }}</span>
                </div>
              </div>
              <div class="col-12 col-md-4">
                <div class="text-subtitle2 text-green-4 q-mb-xs">Equity</div>
                <q-table
                  :rows="bsData.equity"
                  :columns="bsCols"
                  row-key="code"
                  flat
                  dark
                  dense
                  hide-bottom
                  :rows-per-page-options="[0]"
                  class="fin-table"
                />
                <div class="fin-summary-row" style="border-radius: 6px">
                  <span class="fin-summary-row__label">Total Equity</span
                  ><span class="fin-summary-row__value text-green-4">{{
                    fmt(bsData.totalEquity)
                  }}</span>
                </div>
              </div>
            </div>
            <div
              class="fin-summary-row q-mt-md"
              style="border-radius: 6px; border: 1px solid #388bfd"
            >
              <span class="fin-summary-row__label text-h6">Balance Check (A = L + E)</span
              ><span
                :class="[
                  'fin-summary-row__value',
                  Math.abs(bsData.totalAssets - bsData.totalLiabilities - bsData.totalEquity) < 0.01
                    ? 'text-green-4'
                    : 'text-red-4',
                ]"
                >{{
                  Math.abs(bsData.totalAssets - bsData.totalLiabilities - bsData.totalEquity) < 0.01
                    ? '✓ Balanced'
                    : '✗ Imbalanced'
                }}</span
              >
            </div>
          </div>
          <div v-else class="text-grey-6 text-center q-pa-xl">
            <q-icon name="account_balance" size="48px" class="q-mb-sm" /><br />Click Generate
          </div>
        </div>
      </q-tab-panel>
      <!-- ═══════ COGS & INVENTORY ═══════ -->
      <q-tab-panel name="cogs" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header row items-center justify-between">
            <span class="fin-panel__title">Cost of Goods Sold (COGS)</span>
            <div class="row q-gutter-x-sm items-center">
              <q-radio v-model="cogsGroupBy" val="item" label="Item-wise" dark dense color="blue-4" />
              <q-radio v-model="cogsGroupBy" val="kitchen" label="Kitchen-wise" dark dense color="blue-4" />
              <q-radio v-model="cogsGroupBy" val="table" label="Table-wise" dark dense color="blue-4" />
              <q-space class="q-ml-md" />
              <q-select
                v-model="cogsFilterId"
                :options="cogsFilterOptions"
                :label="cogsFilterLabel"
                dense
                dark
                outlined
                clearable
                emit-value
                map-options
                style="min-width: 200px"
              />
            </div>
          </div>
          <div class="fin-panel__body q-pa-md" v-if="cogsGrouped.length">
            <q-table
              :rows="cogsGrouped"
              :columns="cogsCols"
              row-key="name"
              flat
              dark
              dense
              :pagination="{ rowsPerPage: 50 }"
              class="fin-table"
            >
              <template #body-cell-gross_profit="props">
                <q-td :props="props">
                  <span :class="props.row.gross_profit >= 0 ? 'text-green-4 text-weight-bold' : 'text-red-4 text-weight-bold'">
                    {{ fmt(props.row.gross_profit) }}
                  </span>
                </q-td>
              </template>
              <template #body-cell-gp_percent="props">
                <q-td :props="props">
                  <q-badge :color="props.row.gp_percent >= 60 ? 'green-8' : (props.row.gp_percent >= 30 ? 'orange-8' : 'red-8')">
                    {{ props.row.gp_percent.toFixed(1) }}%
                  </q-badge>
                </q-td>
              </template>
            </q-table>
          </div>
          <div v-else class="text-grey-6 text-center q-pa-xl">
            <q-icon name="inventory_2" size="48px" class="q-mb-sm" /><br />Click Generate to view Cost Operations
          </div>
        </div>
      </q-tab-panel>

      <!-- ═══════ CASH FLOW STATEMENT ═══════ -->
      <q-tab-panel name="cashflow" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header">
            <span class="fin-panel__title">Cash Flow Statement</span>
            <span class="fin-panel__subtitle">{{ dateFrom }} to {{ dateTo }}</span>
          </div>
          <div class="fin-panel__body q-pa-md" v-if="cashFlowData">
            
            <div class="fin-summary-row q-mb-md" style="border-radius: 6px; border: 1px solid #388bfd">
              <span class="fin-summary-row__label text-h6">Opening Cash Balance</span>
              <span class="fin-summary-row__value text-h6 text-blue-4">{{ fmt(cashFlowData.opening_balance) }}</span>
            </div>

            <!-- Operating -->
            <div class="text-subtitle2 text-blue-4 q-mb-xs">Operating Activities</div>
            <q-table
              :rows="cashFlowData.operating_activities"
              :columns="cfCols"
              row-key="category"
              flat dark dense hide-bottom
              :rows-per-page-options="[0]"
              class="fin-table q-mb-md"
              no-data-label="No operating cash flows"
            />
            <div class="fin-summary-row q-mb-md" style="border-radius: 6px">
              <span class="fin-summary-row__label">Net Cash from Operating Activities</span>
              <span :class="['fin-summary-row__value', cashFlowData.net_operating >= 0 ? 'text-green-4' : 'text-red-4']">
                {{ fmt(cashFlowData.net_operating) }}
              </span>
            </div>

            <!-- Investing -->
            <div class="text-subtitle2 text-blue-4 q-mb-xs">Investing Activities</div>
            <q-table
              :rows="cashFlowData.investing_activities"
              :columns="cfCols"
              row-key="category"
              flat dark dense hide-bottom
              :rows-per-page-options="[0]"
              class="fin-table q-mb-md"
              no-data-label="No investing cash flows"
            />
            <div class="fin-summary-row q-mb-md" style="border-radius: 6px">
              <span class="fin-summary-row__label">Net Cash from Investing Activities</span>
              <span :class="['fin-summary-row__value', cashFlowData.net_investing >= 0 ? 'text-green-4' : 'text-red-4']">
                {{ fmt(cashFlowData.net_investing) }}
              </span>
            </div>

            <!-- Financing -->
            <div class="text-subtitle2 text-blue-4 q-mb-xs">Financing Activities</div>
            <q-table
              :rows="cashFlowData.financing_activities"
              :columns="cfCols"
              row-key="category"
              flat dark dense hide-bottom
              :rows-per-page-options="[0]"
              class="fin-table q-mb-md"
              no-data-label="No financing cash flows"
            />
            <div class="fin-summary-row q-mb-md" style="border-radius: 6px">
              <span class="fin-summary-row__label">Net Cash from Financing Activities</span>
              <span :class="['fin-summary-row__value', cashFlowData.net_financing >= 0 ? 'text-green-4' : 'text-red-4']">
                {{ fmt(cashFlowData.net_financing) }}
              </span>
            </div>

            <!-- Net Flow & Closing Balance -->
            <div class="fin-summary-row q-mt-lg" style="border-radius: 6px; border: 1px solid #388bfd">
              <span class="fin-summary-row__label text-h6">Net Change in Cash</span>
              <span :class="['fin-summary-row__value text-h6', cashFlowData.net_cash_flow >= 0 ? 'text-green-4' : 'text-red-4']">
                {{ fmt(cashFlowData.net_cash_flow) }}
              </span>
            </div>
            
            <div class="fin-summary-row q-mt-md" style="border-radius: 6px; border: 1px solid #388bfd; background: rgba(56, 139, 253, 0.1);">
              <span class="fin-summary-row__label text-h6">Closing Cash Balance</span>
              <span class="fin-summary-row__value text-h6 text-green-4">{{ fmt(cashFlowData.closing_balance) }}</span>
            </div>

          </div>
          <div v-else class="text-grey-6 text-center q-pa-xl">
            <q-icon name="swap_vert" size="48px" class="q-mb-sm" /><br />Click Generate to view Cash Flow
          </div>
        </div>
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  fetchProfitAndLoss,
  fetchBalanceSheet,
  fetchMonthlyPnlSummary,
  fetchCogsReport,
  fetchCashFlowStatement,
} from 'src/services/financeService'

const route = useRoute()
const validTabs = [
  'monthly',
  'pnl',
  'bs',
  'cogs',
  'cashflow'
]
const loading = ref(false)
const activeTab = ref(validTabs.includes(route.query.tab) ? route.query.tab : 'monthly')
const now = new Date()
const dateFrom = ref(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0])
const dateTo = ref(now.toISOString().split('T')[0])
const selectedYear = ref(now.getFullYear())
const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

const pnlData = ref(null)
const bsData = ref(null)
const monthlyData = ref(null)
const cashFlowData = ref(null)

// COGS references
const cogsRaw = ref([])
const cogsGroupBy = ref('item') // item | kitchen | table
const cogsFilterId = ref(null)

const cogsFilterLabel = computed(() => {
  if (cogsGroupBy.value === 'item') return 'Select Item'
  if (cogsGroupBy.value === 'kitchen') return 'Select Kitchen'
  return 'Select Table'
})

watch(cogsGroupBy, () => {
  cogsFilterId.value = null
})

const cogsFilterOptions = computed(() => {
  if (!cogsRaw.value || !cogsRaw.value.length) return []
  const opts = []
  const seen = new Set()

  cogsRaw.value.forEach((row) => {
    let val, lbl
    if (cogsGroupBy.value === 'item') {
      val = row.menu_item_id
      lbl = row.item_name
    } else if (cogsGroupBy.value === 'kitchen') {
      val = row.kitchen_id
      lbl = row.kitchen_name
    } else {
      val = row.table_id
      lbl = row.table_name
    }

    if (val && !seen.has(val)) {
      seen.add(val)
      opts.push({ label: lbl, value: val })
    }
  })
  return opts.sort((a, b) => a.label.localeCompare(b.label))
})

const cogsGrouped = computed(() => {
  if (!cogsRaw.value || !cogsRaw.value.length) return []
  const groupMap = new Map()

  let dataToProcess = cogsRaw.value
  
  if (cogsFilterId.value) {
    dataToProcess = dataToProcess.filter((row) => {
      if (cogsGroupBy.value === 'item') return row.menu_item_id === cogsFilterId.value
      if (cogsGroupBy.value === 'kitchen') return row.kitchen_id === cogsFilterId.value
      return row.table_id === cogsFilterId.value
    })
  }

  dataToProcess.forEach((row) => {
    let key, label
    if (cogsGroupBy.value === 'item') {
      key = row.menu_item_id
      label = row.item_name
    } else if (cogsGroupBy.value === 'kitchen') {
      key = row.kitchen_id
      label = row.kitchen_name
    } else {
      key = row.table_id
      label = row.table_name
    }

    if (!groupMap.has(key)) {
      groupMap.set(key, { name: label, quantity_sold: 0, gross_sales: 0, net_sales: 0, total_cogs: 0 })
    }
    const g = groupMap.get(key)
    g.quantity_sold += Number(row.quantity_sold) || 0
    g.gross_sales += Number(row.gross_sales) || 0
    g.net_sales += Number(row.net_sales) || 0
    g.total_cogs += Number(row.total_cogs) || 0
  })

  return Array.from(groupMap.values())
    .map((g) => {
      g.gross_profit = g.net_sales - g.total_cogs
      g.gp_percent = g.net_sales > 0 ? (g.gross_profit / g.net_sales) * 100 : 0
      return g
    })
    .sort((a, b) => b.net_sales - a.net_sales)
})

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
}
function monthName(m) {
  const [y, mo] = m.split('-')
  return new Date(y, mo - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
function printReport() {
  window.print()
}

// ── Export Helpers ──
function getExportData() {
  const tab = activeTab.value
  if (tab === 'monthly' && monthlyData.value)
    return {
      rows: monthlyData.value.monthly.map((m) => ({ ...m, month: monthName(m.month) })),
      cols: monthlyCols,
      title: `Monthly_Summary_${selectedYear.value}`,
    }
  if (tab === 'pnl' && pnlData.value)
    return {
      rows: [...pnlData.value.revenue, ...pnlData.value.expenses],
      cols: pnlCols,
      title: `PnL_${dateFrom.value}_${dateTo.value}`,
    }
  if (tab === 'bs' && bsData.value)
    return {
      rows: [...bsData.value.assets, ...bsData.value.liabilities, ...bsData.value.equity],
      cols: bsCols,
      title: `Balance_Sheet`,
    }
  if (tab === 'cogs' && cogsGrouped.value.length)
    return {
      rows: cogsGrouped.value,
      cols: cogsCols.value,
      title: `COGS_Report_${cogsGroupBy.value}_${dateFrom.value}_${dateTo.value}`,
    }
  if (tab === 'cashflow' && cashFlowData.value) {
    const cfRows = [
      { category: 'OPENING CASH BALANCE', amount: cashFlowData.value.opening_balance },
      { category: '', amount: null },
      { category: '*** OPERATING ACTIVITIES ***', amount: null },
      ...cashFlowData.value.operating_activities,
      { category: 'Net Cash from Operating Activities', amount: cashFlowData.value.net_operating },
      { category: '', amount: null },
      { category: '*** INVESTING ACTIVITIES ***', amount: null },
      ...cashFlowData.value.investing_activities,
      { category: 'Net Cash from Investing Activities', amount: cashFlowData.value.net_investing },
      { category: '', amount: null },
      { category: '*** FINANCING ACTIVITIES ***', amount: null },
      ...cashFlowData.value.financing_activities,
      { category: 'Net Cash from Financing Activities', amount: cashFlowData.value.net_financing },
      { category: '', amount: null },
      { category: '*** SUMMARY ***', amount: null },
      { category: 'Net Change in Cash', amount: cashFlowData.value.net_cash_flow },
      { category: 'CLOSING CASH BALANCE', amount: cashFlowData.value.closing_balance }
    ]
    return {
      rows: cfRows,
      cols: cfCols,
      title: `Cash_Flow_Statement_${dateFrom.value}_${dateTo.value}`
    }
  }
  return null
}

function exportCSV() {
  const d = getExportData()
  if (!d) return
  exportTableToCSV(d.cols, d.rows, d.title)
}
function exportExcel() {
  const d = getExportData()
  if (!d) return
  exportTableToExcel(d.cols, d.rows, d.title)
}
function exportPDF() {
  const d = getExportData()
  if (!d) return
  const doc = new jsPDF({ orientation: d.cols.length > 6 ? 'landscape' : 'portrait' })
  doc.setFontSize(18)
  doc.setTextColor(25, 118, 210)
  doc.text('SEVEN WAVES RESTAURANT (PVT) LTD', 14, 18)
  doc.setFontSize(12)
  doc.setTextColor(0)
  doc.text(d.title.replace(/_/g, ' '), 14, 26)
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(
    `Generated: ${new Date().toLocaleString()}   |   Period: ${dateFrom.value} to ${dateTo.value}`,
    14,
    33,
  )
  const heads = d.cols.map((c) => c.label)
  const body = d.rows.map((r) =>
    d.cols.map((c) => {
      const val = typeof c.field === 'function' ? c.field(r) : r[c.field]
      return c.format ? c.format(val) : (val ?? '-')
    }),
  )
  autoTable(doc, {
    startY: 38,
    head: [heads],
    body,
    theme: 'grid',
    headStyles: { fillColor: [25, 118, 210], halign: 'center', fontSize: 8 },
    styles: { fontSize: 7 },
    columnStyles: Object.fromEntries(d.cols.map((c, i) => [i, { halign: c.align || 'left' }])),
  })
  doc.save(`${d.title}_${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ── Column Definitions ──
const pnlCols = [
  { name: 'code', label: 'Code', field: 'code', align: 'left', style: 'width:80px' },
  { name: 'name', label: 'Account', field: 'name', align: 'left' },
  {
    name: 'amount',
    label: 'Amount',
    field: (row) => (row.code?.startsWith('4') ? row.credit - row.debit : row.debit - row.credit),
    align: 'right',
    format: (v) => fmt(v),
  },
]
const bsCols = [
  { name: 'code', label: 'Code', field: 'code', align: 'left', style: 'width:80px' },
  { name: 'name', label: 'Account', field: 'name', align: 'left' },
  { name: 'balance', label: 'Balance', field: 'balance', align: 'right', format: (v) => fmt(v) },
]

const monthlyCols = [
  { name: 'month', label: 'Month', field: 'month', align: 'left' },
  { name: 'revenue', label: 'Revenue', field: 'revenue', align: 'right', format: (v) => fmt(v) },
  { name: 'expenses', label: 'Expenses', field: 'expenses', align: 'right', format: (v) => fmt(v) },
  { name: 'wages', label: 'Wages/Payroll', field: 'wages', align: 'right', format: (v) => fmt(v) },
  { name: 'profit', label: 'Net Profit', field: 'profit', align: 'right', style: 'width:140px' },
]

const cfCols = [
  { name: 'category', label: 'Category', field: 'category', align: 'left' },
  { name: 'amount', label: 'Net Amount', field: 'amount', align: 'right', format: v => (v === null || v === undefined) ? '' : fmt(v) }
]

const cogsCols = computed(() => {
  const lbl = cogsGroupBy.value === 'item' ? 'Menu Item' : cogsGroupBy.value === 'kitchen' ? 'Kitchen' : 'Table'
  return [
    { name: 'name', label: lbl, field: 'name', align: 'left' },
    { name: 'quantity_sold', label: 'Qty Sold', field: 'quantity_sold', align: 'right' },
    { name: 'gross_sales', label: 'Gross Sales', field: 'gross_sales', align: 'right', format: (v) => fmt(v) },
    { name: 'net_sales', label: 'Net Sales', field: 'net_sales', align: 'right', format: (v) => fmt(v) },
    { name: 'total_cogs', label: 'Total COGS', field: 'total_cogs', align: 'right', format: (v) => fmt(v), classes: 'text-red-3' },
    { name: 'gross_profit', label: 'Gross Profit', field: 'gross_profit', align: 'right' },
    { name: 'gp_percent', label: 'GP %', field: 'gp_percent', align: 'right' },
  ]
})


// ── Data Loading ──
async function loadCurrentReport() {
  loading.value = true
  const tab = activeTab.value,
    df = dateFrom.value,
    dt = dateTo.value
  try {
    if (tab === 'monthly') {
      const r = await fetchMonthlyPnlSummary(selectedYear.value)
      monthlyData.value = r.data
    } else if (tab === 'pnl') {
      const r = await fetchProfitAndLoss(df, dt)
      pnlData.value = r.data
    } else if (tab === 'bs') {
      const r = await fetchBalanceSheet()
      bsData.value = r.data
    } else if (tab === 'cogs') {
      const r = await fetchCogsReport(df, dt)
      cogsRaw.value = r.data || []
      cogsFilterId.value = null
    } else if (tab === 'cashflow') {
      const r = await fetchCashFlowStatement(df, dt)
      cashFlowData.value = r.data
    }
  } catch (e) {
    console.error('[FinanceReports]', e)
  }
  loading.value = false
}



onMounted(loadCurrentReport)
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
.fin-report-tabs {
  background: var(--erp-fin-bg-page);
  border-bottom: 1px solid var(--erp-fin-border);
  border-radius: 6px 6px 0 0;
  .q-tab {
    font-size: 11px;
    min-height: 36px;
    padding: 0 10px;
  }
}
@media print {
  .fin-filters,
  .fin-report-tabs,
  .q-toolbar,
  .q-drawer {
    display: none !important;
  }
  .finance-page {
    background: #fff !important;
    color: #000 !important;
  }
  .fin-panel {
    border: 1px solid #ccc;
  }
  .fin-table tbody td {
    color: #000 !important;
  }
}
</style>
