<template>
  <q-page class="q-pa-md finance-page">
    <FinancePageHeader
      icon="assessment"
      subtitle="Monthly summary, P&L, balance sheet, COGS and cash flow from the GL"
      title="Financial Reports"
      breadcrumbs="Finance / Reports"
      show-refresh
      @refresh="loadCurrentReport"
    />

    <div class="fin-filters q-mb-md">
      <q-input
        v-model="dateFrom"
        label="From"
        type="date"
        dense
        outlined
        style="min-width: 150px"
      />
      <q-input
        v-model="dateTo"
        label="To"
        type="date"
        dense
        outlined
        style="min-width: 150px"
      />
      <q-select
        v-if="activeTab === 'monthly'"
        v-model="selectedYear"
        :options="yearOptions"
        label="Year"
        dense
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
      <q-separator vertical class="q-mx-sm" />
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

    <q-tab-panels v-model="activeTab" animated class="bg-transparent" id="report-print-area">
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
                <div class="fin-kpi-card fin-kpi-card--green">
                  <div class="fin-kpi-card__icon" style="background: rgba(255, 255, 255, 0.2)">
                    <q-icon name="trending_up" color="white" />
                  </div>
                  <div class="fin-kpi-card__body">
                    <div class="fin-kpi-card__label">Year Revenue</div>
                    <div class="fin-kpi-card__value">
                      {{ fmt(monthlyData.yearRevenue) }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-6 col-sm-3">
                <div class="fin-kpi-card fin-kpi-card--red">
                  <div class="fin-kpi-card__icon" style="background: rgba(255, 255, 255, 0.2)">
                    <q-icon name="trending_down" color="white" />
                  </div>
                  <div class="fin-kpi-card__body">
                    <div class="fin-kpi-card__label">Year Expenses</div>
                    <div class="fin-kpi-card__value">
                      {{ fmt(monthlyData.yearExpenses) }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-6 col-sm-3">
                <div class="fin-kpi-card fin-kpi-card--amber">
                  <div class="fin-kpi-card__icon" style="background: rgba(255, 255, 255, 0.2)">
                    <q-icon name="groups" color="white" />
                  </div>
                  <div class="fin-kpi-card__body">
                    <div class="fin-kpi-card__label">Year Wages</div>
                    <div class="fin-kpi-card__value">
                      {{ fmt(monthlyData.yearWages) }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-6 col-sm-3">
                <div class="fin-kpi-card" :class="monthlyData.yearProfit >= 0 ? 'fin-kpi-card--green' : 'fin-kpi-card--red'">
                  <div class="fin-kpi-card__icon" style="background: rgba(255, 255, 255, 0.2)">
                    <q-icon name="balance" color="white" />
                  </div>
                  <div class="fin-kpi-card__body">
                    <div class="fin-kpi-card__label">Year Net Profit</div>
                    <div class="fin-kpi-card__value">
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
      <!-- Same engine + viewer as Finance > Financial Statements (finance_ledgers
           grouped by account_group, LKAS 1 order), so both menus always agree. -->
      <q-tab-panel name="pnl" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header">
            <span class="fin-panel__title">Profit & Loss Statement</span
            ><span class="fin-panel__subtitle">{{ dateFrom }} to {{ dateTo }}</span>
          </div>
          <div class="fin-panel__body q-pa-md" v-if="pnlData">
            <FinancialStatementViewer
              :report="pnlData"
              @download-excel="(o) => financeExportService.exportProfitLossToExcel(pnlData, o)"
              @download-pdf="(o) => financeExportService.exportProfitLossToPdf(pnlData, o)"
            />
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
            <FinancialStatementViewer
              :report="bsData"
              @download-excel="(o) => financeExportService.exportBalanceSheetToExcel(bsData, o)"
              @download-pdf="(o) => financeExportService.exportBalanceSheetToPdf(bsData, o)"
            />
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
              <q-radio
                v-model="cogsGroupBy"
                val="item"
                label="Item-wise"
                dense
                color="blue-4"
              />
              <q-radio
                v-model="cogsGroupBy"
                val="kitchen"
                label="Kitchen-wise"
                dense
                color="blue-4"
              />
              <q-radio
                v-model="cogsGroupBy"
                val="table"
                label="Table-wise"
                dense
                color="blue-4"
              />
              <q-space class="q-ml-md" />
              <q-select
                v-model="cogsFilterId"
                :options="cogsFilterOptions"
                :label="cogsFilterLabel"
                dense
                outlined
                clearable
                emit-value
                map-options
                style="min-width: 200px"
              />
            </div>
          </div>
          <div class="fin-panel__body q-pa-md" v-if="glCogs">
            <div class="text-subtitle2 text-blue-4 q-mb-xs">
              Cost of Sales per General Ledger ({{ dateFrom }} to {{ dateTo }})
            </div>
            <q-markup-table dense flat class="fin-table q-mb-md">
              <thead>
                <tr><th class="text-left">Ledger</th><th class="text-right">Amount</th><th class="text-right">% of Revenue</th></tr>
              </thead>
              <tbody>
                <tr v-for="r in glCogs.rows" :key="r.code">
                  <td>{{ r.code }} {{ r.name }}</td>
                  <td class="text-right">{{ fmt(r.amount) }}</td>
                  <td class="text-right">{{ r.pct_of_revenue.toFixed(1) }}%</td>
                </tr>
                <tr class="text-weight-bold">
                  <td>Total Cost of Sales</td><td class="text-right">{{ fmt(glCogs.total_cogs) }}</td><td></td>
                </tr>
                <tr><td>Revenue</td><td class="text-right">{{ fmt(glCogs.revenue) }}</td><td></td></tr>
                <tr class="text-weight-bold">
                  <td>Gross Profit</td>
                  <td class="text-right" :class="glCogs.gross_profit >= 0 ? 'text-green-4' : 'text-red-4'">
                    {{ fmt(glCogs.gross_profit) }}
                  </td>
                  <td class="text-right">{{ glCogs.gp_percent.toFixed(1) }}%</td>
                </tr>
              </tbody>
            </q-markup-table>
            <div class="text-caption text-grey-6 q-mb-sm" v-if="cogsGrouped.length">
              Breakdown below is recipe-based (theoretical) cost of non-cancelled orders — an
              operational analysis, not the GL figure above.
            </div>
          </div>
          <div class="fin-panel__body q-pa-md" v-if="cogsGrouped.length">
            <q-table
              :rows="cogsGrouped"
              :columns="cogsCols"
              row-key="name"
              flat
              dense
              :pagination="{ rowsPerPage: 50 }"
              class="fin-table"
            >
              <template #body-cell-gross_profit="props">
                <q-td :props="props">
                  <span
                    :class="
                      props.row.gross_profit >= 0
                        ? 'text-green-4 text-weight-bold'
                        : 'text-red-4 text-weight-bold'
                    "
                  >
                    {{ fmt(props.row.gross_profit) }}
                  </span>
                </q-td>
              </template>
              <template #body-cell-gp_percent="props">
                <q-td :props="props">
                  <q-badge
                    :color="
                      props.row.gp_percent >= 60
                        ? 'green-8'
                        : props.row.gp_percent >= 30
                          ? 'orange-8'
                          : 'red-8'
                    "
                  >
                    {{ props.row.gp_percent.toFixed(1) }}%
                  </q-badge>
                </q-td>
              </template>
            </q-table>
          </div>
          <div v-else-if="!glCogs" class="text-grey-6 text-center q-pa-xl">
            <q-icon name="inventory_2" size="48px" class="q-mb-sm" /><br />Click Generate to view
            Cost Operations
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
            <div
              class="fin-summary-row q-mb-md"
              style="border-radius: 6px; border: 1px solid #388bfd"
            >
              <span class="fin-summary-row__label text-h6">Opening Cash Balance</span>
              <span class="fin-summary-row__value text-h6 text-blue-4">{{
                fmt(cashFlowData.opening_balance)
              }}</span>
            </div>

            <!-- Operating -->
            <div class="text-subtitle2 text-blue-4 q-mb-xs">Operating Activities</div>
            <q-table
              :rows="cashFlowData.operating_activities"
              :columns="cfCols"
              row-key="category"
              flat
              dense
              hide-bottom
              :rows-per-page-options="[0]"
              class="fin-table q-mb-md"
              no-data-label="No operating cash flows"
            />
            <div class="fin-summary-row q-mb-md" style="border-radius: 6px">
              <span class="fin-summary-row__label">Net Cash from Operating Activities</span>
              <span
                :class="[
                  'fin-summary-row__value',
                  cashFlowData.net_operating >= 0 ? 'text-green-4' : 'text-red-4',
                ]"
              >
                {{ fmt(cashFlowData.net_operating) }}
              </span>
            </div>

            <!-- Investing -->
            <div class="text-subtitle2 text-blue-4 q-mb-xs">Investing Activities</div>
            <q-table
              :rows="cashFlowData.investing_activities"
              :columns="cfCols"
              row-key="category"
              flat
              dense
              hide-bottom
              :rows-per-page-options="[0]"
              class="fin-table q-mb-md"
              no-data-label="No investing cash flows"
            />
            <div class="fin-summary-row q-mb-md" style="border-radius: 6px">
              <span class="fin-summary-row__label">Net Cash from Investing Activities</span>
              <span
                :class="[
                  'fin-summary-row__value',
                  cashFlowData.net_investing >= 0 ? 'text-green-4' : 'text-red-4',
                ]"
              >
                {{ fmt(cashFlowData.net_investing) }}
              </span>
            </div>

            <!-- Financing -->
            <div class="text-subtitle2 text-blue-4 q-mb-xs">Financing Activities</div>
            <q-table
              :rows="cashFlowData.financing_activities"
              :columns="cfCols"
              row-key="category"
              flat
              dense
              hide-bottom
              :rows-per-page-options="[0]"
              class="fin-table q-mb-md"
              no-data-label="No financing cash flows"
            />
            <div class="fin-summary-row q-mb-md" style="border-radius: 6px">
              <span class="fin-summary-row__label">Net Cash from Financing Activities</span>
              <span
                :class="[
                  'fin-summary-row__value',
                  cashFlowData.net_financing >= 0 ? 'text-green-4' : 'text-red-4',
                ]"
              >
                {{ fmt(cashFlowData.net_financing) }}
              </span>
            </div>

            <!-- Net Flow & Closing Balance -->
            <div
              class="fin-summary-row q-mt-lg"
              style="border-radius: 6px; border: 1px solid #388bfd"
            >
              <span class="fin-summary-row__label text-h6">Net Change in Cash</span>
              <span
                :class="[
                  'fin-summary-row__value text-h6',
                  cashFlowData.net_cash_flow >= 0 ? 'text-green-4' : 'text-red-4',
                ]"
              >
                {{ fmt(cashFlowData.net_cash_flow) }}
              </span>
            </div>

            <div
              v-if="Math.abs(cashFlowData.reconciliation_difference || 0) >= 0.01"
              class="text-caption text-amber-5 q-mt-sm"
            >
              Allocation rounding difference: {{ fmt(cashFlowData.reconciliation_difference) }}
            </div>
            <div
              class="fin-summary-row q-mt-md"
              style="
                border-radius: 6px;
                border: 1px solid #388bfd;
                background: rgba(56, 139, 253, 0.1);
              "
            >
              <span class="fin-summary-row__label text-h6">Closing Cash Balance</span>
              <span class="fin-summary-row__value text-h6 text-green-4">{{
                fmt(cashFlowData.closing_balance)
              }}</span>
            </div>
          </div>
          <div v-else class="text-grey-6 text-center q-pa-xl">
            <q-icon name="swap_vert" size="48px" class="q-mb-sm" /><br />Click Generate to view Cash
            Flow
          </div>
        </div>
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup>
import { todayLK, monthStart } from 'src/modules/finance/utils/finance-dates'
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import FinancePageHeader from 'src/modules/finance/components/FinancePageHeader.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import FinancialStatementViewer from 'src/modules/finance/components/FinancialStatementViewer.vue'
import { financeStatementsService } from 'src/modules/finance/services/finance-statements.service'
import { financeExportService, statementLines } from 'src/modules/finance/services/finance-export.service'
import { Notify } from 'quasar'
import {
  financeReportsService,
  fetchRecipeCogs,
} from 'src/modules/finance/services/finance-reports.service'

const route = useRoute()
const validTabs = ['monthly', 'pnl', 'bs', 'cogs', 'cashflow']
const loading = ref(false)
const activeTab = ref(validTabs.includes(route.query.tab) ? route.query.tab : 'monthly')
const now = new Date()
const dateFrom = ref(monthStart(todayLK()))
const dateTo = ref(todayLK())
const selectedYear = ref(now.getFullYear())
const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

const pnlData = ref(null)
const bsData = ref(null)
const monthlyData = ref(null)
const cashFlowData = ref(null)
const glCogs = ref(null)

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
      groupMap.set(key, {
        name: label,
        quantity_sold: 0,
        gross_sales: 0,
        net_sales: 0,
        total_cogs: 0,
      })
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
      rows: statementRows(pnlData.value),
      cols: stmtCols,
      title: `PnL_${dateFrom.value}_${dateTo.value}`,
    }
  if (tab === 'bs' && bsData.value)
    return {
      rows: statementRows(bsData.value),
      cols: stmtCols,
      title: `Balance_Sheet_${dateTo.value}`,
    }
  if (tab === 'cogs' && cogsGrouped.value.length)
    return {
      rows: cogsGrouped.value,
      cols: cogsCols.value,
      title: `COGS_Report_${cogsGroupBy.value}_${dateFrom.value}_${dateTo.value}`,
    }
  if (tab === 'cogs' && glCogs.value)
    return {
      rows: [
        ...glCogs.value.rows.map((r) => ({ category: `${r.code} ${r.name}`, amount: r.amount })),
        { category: 'Total Cost of Sales', amount: glCogs.value.total_cogs },
        { category: 'Revenue', amount: glCogs.value.revenue },
        { category: 'Gross Profit', amount: glCogs.value.gross_profit },
      ],
      cols: cfCols,
      title: `COGS_GL_${dateFrom.value}_${dateTo.value}`,
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
      { category: 'CLOSING CASH BALANCE', amount: cashFlowData.value.closing_balance },
    ]
    return {
      rows: cfRows,
      cols: cfCols,
      title: `Cash_Flow_Statement_${dateFrom.value}_${dateTo.value}`,
    }
  }
  return null
}

function exportCSV() {
  const d = getExportData()
  if (!d) return
  exportTableToCSV(d.cols, d.rows, d.title)
}
// P&L / Balance Sheet use the formatted statement exports (same layout as screen).
function exportStatement(kind) {
  const tab = activeTab.value
  if (tab === 'pnl' && pnlData.value) {
    if (kind === 'pdf') financeExportService.exportProfitLossToPdf(pnlData.value)
    else financeExportService.exportProfitLossToExcel(pnlData.value)
    return true
  }
  if (tab === 'bs' && bsData.value) {
    if (kind === 'pdf') financeExportService.exportBalanceSheetToPdf(bsData.value)
    else financeExportService.exportBalanceSheetToExcel(bsData.value)
    return true
  }
  return false
}
function exportExcel() {
  if (exportStatement('excel')) return
  const d = getExportData()
  if (!d) return
  exportTableToExcel(d.cols, d.rows, d.title)
}
function exportPDF() {
  if (exportStatement('pdf')) return
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
  doc.save(`${d.title}_${todayLK()}.pdf`)
}

// ── Column Definitions ──
// CSV rows for P&L / Balance Sheet: the statement flattened line by line.
const fmtBlank = (v) => (v === null || v === '' ? '' : fmt(v))
const stmtCols = [
  { name: 'code', label: 'Code', field: 'code', align: 'left', style: 'width:80px' },
  { name: 'name', label: 'Account', field: 'name', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', format: fmtBlank },
  { name: 'total', label: 'Total', field: 'total', align: 'right', format: fmtBlank },
]
function statementRows(report) {
  return statementLines(report)
    .filter((l) => l.kind !== 'spacer')
    .map((l) => {
      if (l.kind === 'title') return { code: '', name: l.label, amount: '', total: '' }
      if (l.kind === 'item')
        return { code: l.code, name: '  '.repeat(l.depth + 1) + l.name, amount: l.amount ?? '', total: '' }
      return l.level === 'group'
        ? { code: '', name: l.label, amount: l.amount, total: '' }
        : { code: '', name: l.label, amount: '', total: l.amount }
    })
}

const monthlyCols = [
  { name: 'month', label: 'Month', field: 'month', align: 'left' },
  { name: 'revenue', label: 'Income', field: 'revenue', align: 'right', format: (v) => fmt(v) },
  {
    name: 'cost_of_sales',
    label: 'Cost of Sales',
    field: 'cost_of_sales',
    align: 'right',
    format: (v) => fmt(v),
  },
  { name: 'expenses', label: 'Other Expenses', field: 'expenses', align: 'right', format: (v) => fmt(v) },
  { name: 'wages', label: 'Wages/Payroll', field: 'wages', align: 'right', format: (v) => fmt(v) },
  { name: 'profit', label: 'Net Profit', field: 'profit', align: 'right', style: 'width:140px' },
]

const cfCols = [
  { name: 'category', label: 'Category', field: 'category', align: 'left' },
  {
    name: 'amount',
    label: 'Net Amount',
    field: 'amount',
    align: 'right',
    format: (v) => (v === null || v === undefined ? '' : fmt(v)),
  },
]

const cogsCols = computed(() => {
  const lbl =
    cogsGroupBy.value === 'item'
      ? 'Menu Item'
      : cogsGroupBy.value === 'kitchen'
        ? 'Kitchen'
        : 'Table'
  return [
    { name: 'name', label: lbl, field: 'name', align: 'left' },
    { name: 'quantity_sold', label: 'Qty Sold', field: 'quantity_sold', align: 'right' },
    {
      name: 'gross_sales',
      label: 'Gross Sales',
      field: 'gross_sales',
      align: 'right',
      format: (v) => fmt(v),
    },
    {
      name: 'net_sales',
      label: 'Net Sales',
      field: 'net_sales',
      align: 'right',
      format: (v) => fmt(v),
    },
    {
      name: 'total_cogs',
      label: 'Total COGS',
      field: 'total_cogs',
      align: 'right',
      format: (v) => fmt(v),
      classes: 'text-red-3',
    },
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
      monthlyData.value = await financeReportsService.monthlySummary(selectedYear.value)
    } else if (tab === 'pnl') {
      const r = await financeStatementsService.generateProfitLoss({ date_from: df, date_to: dt })
      pnlData.value = { ...r, type: 'pl' }
    } else if (tab === 'bs') {
      // Cumulative as at "To"; "From" only splits Retained Earnings b/f from the period profit.
      const r = await financeStatementsService.generateBalanceSheet({ date_from: df, date_to: dt })
      bsData.value = { ...r, type: 'bs' }
    } else if (tab === 'cogs') {
      // GL figure of record (Cost of Sales ledgers) + recipe-based breakdown.
      glCogs.value = await financeReportsService.glCogs(df, dt)
      try {
        cogsRaw.value = await fetchRecipeCogs(df, dt)
      } catch (e) {
        cogsRaw.value = []
        console.warn('[FinanceReports] recipe COGS', e)
      }
      cogsFilterId.value = null
    } else if (tab === 'cashflow') {
      cashFlowData.value = await financeReportsService.cashFlow(df, dt)
    }
  } catch (e) {
    console.error('[FinanceReports]', e)
    Notify.create({ type: 'negative', message: `Report failed: ${e?.message || e}` })
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
