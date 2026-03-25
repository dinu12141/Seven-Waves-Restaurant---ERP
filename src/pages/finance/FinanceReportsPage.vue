<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar moduleName="finance" title="Financial Reports" breadcrumbs="Finance / Reports" showRefresh @refresh="loadCurrentReport" />

    <div class="fin-filters q-mb-md">
      <q-input v-model="dateFrom" label="From" type="date" dense dark outlined style="min-width: 150px" />
      <q-input v-model="dateTo" label="To" type="date" dense dark outlined style="min-width: 150px" />
      <q-select v-if="activeTab === 'monthly'" v-model="selectedYear" :options="yearOptions" label="Year" dense dark outlined style="min-width: 100px" />
      <q-btn unelevated dense label="Generate" color="blue-8" icon="play_arrow" @click="loadCurrentReport" class="q-px-md" style="height: 40px" />
      <q-separator vertical dark class="q-mx-sm" />
      <q-btn flat dense icon="picture_as_pdf" color="red-4" @click="exportPDF" title="Download PDF"><q-tooltip>Export PDF</q-tooltip></q-btn>
      <q-btn flat dense icon="grid_on" color="green-4" @click="exportExcel" title="Download Excel"><q-tooltip>Export Excel</q-tooltip></q-btn>
      <q-btn flat dense icon="description" color="amber-4" @click="exportCSV" title="Download CSV"><q-tooltip>Export CSV</q-tooltip></q-btn>
      <q-btn flat dense icon="print" color="grey-5" @click="printReport" title="Print"><q-tooltip>Print</q-tooltip></q-btn>
    </div>

    <q-tabs v-model="activeTab" dense dark active-color="blue-4" indicator-color="blue-4" class="q-mb-md text-grey-5 fin-report-tabs" align="left" narrow-indicator @update:model-value="loadCurrentReport">
      <q-tab name="monthly" label="Monthly Summary" icon="calendar_month" />
      <q-tab name="pnl" label="P&L" icon="trending_up" />
      <q-tab name="bs" label="Balance Sheet" icon="account_balance" />
      <q-tab name="tb" label="Trial Balance" icon="compare_arrows" />
      <q-tab name="gl" label="General Ledger" icon="menu_book" />
      <q-tab name="expense" label="Expenses" icon="money_off" />
      <q-tab name="revenue" label="Revenue" icon="attach_money" />
      <q-tab name="aging" label="AR/AP Aging" icon="hourglass_empty" />
      <q-tab name="hr" label="HR & Payroll" icon="badge" />
      <q-tab name="payroll" label="Payroll Cycles" icon="payments" />
      <q-tab name="tax" label="Tax" icon="gavel" />
      <q-tab name="cash" label="Daily Cash" icon="account_balance_wallet" />
      <q-tab name="audit" label="Audit Trail" icon="policy" />
    </q-tabs>

    <q-tab-panels v-model="activeTab" animated dark class="bg-transparent" id="report-print-area">

      <!-- ═══════ MONTHLY P&L SUMMARY ═══════ -->
      <q-tab-panel name="monthly" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header"><span class="fin-panel__title">Monthly Profit, Loss, Expenses & Wages Summary — {{ selectedYear }}</span></div>
          <div class="fin-panel__body q-pa-md" v-if="monthlyData">
            <div class="row q-col-gutter-md q-mb-md">
              <div class="col-6 col-sm-3"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(16,185,129,0.12)"><q-icon name="trending_up" color="green" /></div><div><div class="fin-kpi-card__label">Year Revenue</div><div class="fin-kpi-card__value text-green-4">{{ fmt(monthlyData.yearRevenue) }}</div></div></div></div>
              <div class="col-6 col-sm-3"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(239,68,68,0.12)"><q-icon name="trending_down" color="red" /></div><div><div class="fin-kpi-card__label">Year Expenses</div><div class="fin-kpi-card__value text-red-4">{{ fmt(monthlyData.yearExpenses) }}</div></div></div></div>
              <div class="col-6 col-sm-3"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(245,158,11,0.12)"><q-icon name="groups" color="amber" /></div><div><div class="fin-kpi-card__label">Year Wages</div><div class="fin-kpi-card__value text-amber-4">{{ fmt(monthlyData.yearWages) }}</div></div></div></div>
              <div class="col-6 col-sm-3"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(59,130,246,0.12)"><q-icon name="balance" color="blue" /></div><div><div class="fin-kpi-card__label">Year Net Profit</div><div class="fin-kpi-card__value" :class="monthlyData.yearProfit >= 0 ? 'text-green-4' : 'text-red-4'">{{ fmt(monthlyData.yearProfit) }}</div></div></div></div>
            </div>
            <q-table :rows="monthlyData.monthly" :columns="monthlyCols" row-key="month" flat dark dense hide-bottom :rows-per-page-options="[0]" class="fin-table">
              <template #body-cell-profit="props"><q-td :props="props"><span :class="props.row.profit >= 0 ? 'text-green-4' : 'text-red-4'" class="text-weight-bold">{{ fmt(props.row.profit) }}</span></q-td></template>
              <template #body-cell-month="props"><q-td :props="props"><span class="text-weight-bold">{{ monthName(props.row.month) }}</span></q-td></template>
            </q-table>
          </div>
          <div v-else class="text-grey-6 text-center q-pa-xl"><q-icon name="calendar_month" size="48px" class="q-mb-sm" /><br/>Click Generate to view monthly summary</div>
        </div>
      </q-tab-panel>

      <!-- ═══════ P&L ═══════ -->
      <q-tab-panel name="pnl" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header"><span class="fin-panel__title">Profit & Loss Statement</span><span class="fin-panel__subtitle">{{ dateFrom }} to {{ dateTo }}</span></div>
          <div class="fin-panel__body q-pa-md" v-if="pnlData">
            <div class="text-subtitle2 text-green-4 q-mb-xs">Revenue (4xxx)</div>
            <q-table :rows="pnlData.revenue" :columns="pnlCols" row-key="code" flat dark dense hide-bottom :rows-per-page-options="[0]" class="fin-table q-mb-md" no-data-label="No revenue entries" />
            <div class="fin-summary-row q-mb-md" style="border-radius:6px"><span class="fin-summary-row__label">Total Revenue</span><span class="fin-summary-row__value text-green-4">{{ fmt(pnlData.totalRevenue) }}</span></div>
            <div class="text-subtitle2 text-red-4 q-mb-xs">Expenses (5xxx)</div>
            <q-table :rows="pnlData.expenses" :columns="pnlCols" row-key="code" flat dark dense hide-bottom :rows-per-page-options="[0]" class="fin-table q-mb-md" no-data-label="No expense entries" />
            <div class="fin-summary-row q-mb-md" style="border-radius:6px"><span class="fin-summary-row__label">Total Expenses</span><span class="fin-summary-row__value text-red-4">{{ fmt(pnlData.totalExpenses) }}</span></div>
            <div class="fin-summary-row" style="border-radius:6px;border:1px solid #388bfd"><span class="fin-summary-row__label text-h6">Net Profit / (Loss)</span><span :class="['fin-summary-row__value text-h6', pnlData.netProfit >= 0 ? 'text-green-4' : 'text-red-4']">{{ fmt(pnlData.netProfit) }}</span></div>
          </div>
          <div v-else class="text-grey-6 text-center q-pa-xl"><q-icon name="trending_up" size="48px" class="q-mb-sm" /><br/>Click Generate</div>
        </div>
      </q-tab-panel>

      <!-- ═══════ BALANCE SHEET ═══════ -->
      <q-tab-panel name="bs" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header"><span class="fin-panel__title">Balance Sheet</span><span class="fin-panel__subtitle">As at {{ dateTo }}</span></div>
          <div class="fin-panel__body q-pa-md" v-if="bsData">
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-4"><div class="text-subtitle2 text-blue-4 q-mb-xs">Assets</div><q-table :rows="bsData.assets" :columns="bsCols" row-key="code" flat dark dense hide-bottom :rows-per-page-options="[0]" class="fin-table" /><div class="fin-summary-row" style="border-radius:6px"><span class="fin-summary-row__label">Total Assets</span><span class="fin-summary-row__value text-blue-4">{{ fmt(bsData.totalAssets) }}</span></div></div>
              <div class="col-12 col-md-4"><div class="text-subtitle2 text-red-4 q-mb-xs">Liabilities</div><q-table :rows="bsData.liabilities" :columns="bsCols" row-key="code" flat dark dense hide-bottom :rows-per-page-options="[0]" class="fin-table" /><div class="fin-summary-row" style="border-radius:6px"><span class="fin-summary-row__label">Total Liabilities</span><span class="fin-summary-row__value text-red-4">{{ fmt(bsData.totalLiabilities) }}</span></div></div>
              <div class="col-12 col-md-4"><div class="text-subtitle2 text-green-4 q-mb-xs">Equity</div><q-table :rows="bsData.equity" :columns="bsCols" row-key="code" flat dark dense hide-bottom :rows-per-page-options="[0]" class="fin-table" /><div class="fin-summary-row" style="border-radius:6px"><span class="fin-summary-row__label">Total Equity</span><span class="fin-summary-row__value text-green-4">{{ fmt(bsData.totalEquity) }}</span></div></div>
            </div>
            <div class="fin-summary-row q-mt-md" style="border-radius:6px;border:1px solid #388bfd"><span class="fin-summary-row__label text-h6">Balance Check (A = L + E)</span><span :class="['fin-summary-row__value', Math.abs(bsData.totalAssets - bsData.totalLiabilities - bsData.totalEquity) < 0.01 ? 'text-green-4' : 'text-red-4']">{{ Math.abs(bsData.totalAssets - bsData.totalLiabilities - bsData.totalEquity) < 0.01 ? '✓ Balanced' : '✗ Imbalanced' }}</span></div>
          </div>
          <div v-else class="text-grey-6 text-center q-pa-xl"><q-icon name="account_balance" size="48px" class="q-mb-sm" /><br/>Click Generate</div>
        </div>
      </q-tab-panel>

      <!-- ═══════ TRIAL BALANCE ═══════ -->
      <q-tab-panel name="tb" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header"><span class="fin-panel__title">Trial Balance</span></div>
          <q-table :rows="tbRows" :columns="tbCols" row-key="code" flat dark dense hide-bottom :rows-per-page-options="[0]" class="fin-table" :loading="loading" />
          <div class="fin-summary-row"><div><span class="fin-summary-row__label">Total Debit: </span><span class="fin-summary-row__value text-blue-4">{{ fmt(tbTotalDr) }}</span></div><div><span class="fin-summary-row__label">Total Credit: </span><span class="fin-summary-row__value text-blue-4">{{ fmt(tbTotalCr) }}</span></div><div><span class="fin-summary-row__label">Difference: </span><span :class="['fin-summary-row__value', Math.abs(tbTotalDr - tbTotalCr) < 0.01 ? 'text-green-4' : 'text-red-4']">{{ fmt(tbTotalDr - tbTotalCr) }}</span></div></div>
        </div>
      </q-tab-panel>

      <!-- ═══════ GENERAL LEDGER ═══════ -->
      <q-tab-panel name="gl" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header"><span class="fin-panel__title">General Ledger</span></div>
          <div class="q-pa-sm q-mb-sm"><q-select v-model="glAccount" :options="accountOptions" label="Select Account" dense dark outlined style="max-width:400px" clearable emit-value map-options option-value="code" option-label="label" @update:model-value="loadGLData" /></div>
          <q-table :rows="glRows" :columns="glCols" row-key="id" flat dark dense :rows-per-page-options="[25,50,0]" class="fin-table" :loading="loading" no-data-label="Select an account">
            <template #body-cell-balance="props"><q-td :props="props"><span :class="props.row._runBal >= 0 ? 'text-green-4' : 'text-red-4'">{{ fmt(props.row._runBal) }}</span></q-td></template>
          </q-table>
        </div>
      </q-tab-panel>

      <!-- ═══════ EXPENSE SUMMARY ═══════ -->
      <q-tab-panel name="expense" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header"><span class="fin-panel__title">Expense Summary</span><span class="fin-panel__subtitle">{{ dateFrom }} to {{ dateTo }}</span></div>
          <div class="fin-panel__body q-pa-md" v-if="expenseData">
            <div class="row q-col-gutter-md q-mb-md">
              <div class="col-12 col-sm-4"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(239,68,68,0.12)"><q-icon name="money_off" color="red" /></div><div><div class="fin-kpi-card__label">Total Expenses</div><div class="fin-kpi-card__value">{{ fmt(expenseData.grandTotal) }}</div></div></div></div>
              <div class="col-12 col-sm-4"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(59,130,246,0.12)"><q-icon name="category" color="blue" /></div><div><div class="fin-kpi-card__label">Categories</div><div class="fin-kpi-card__value">{{ expenseData.categories.length }}</div></div></div></div>
              <div class="col-12 col-sm-4"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(245,158,11,0.12)"><q-icon name="receipt" color="amber" /></div><div><div class="fin-kpi-card__label">Avg/Category</div><div class="fin-kpi-card__value">{{ fmt(expenseData.categories.length ? expenseData.grandTotal / expenseData.categories.length : 0) }}</div></div></div></div>
            </div>
            <q-table :rows="expenseData.categories" :columns="expCatCols" row-key="category" flat dark dense hide-bottom :rows-per-page-options="[0]" class="fin-table" />
            <div class="fin-summary-row"><span class="fin-summary-row__label">Grand Total</span><span class="fin-summary-row__value text-red-4">{{ fmt(expenseData.grandTotal) }}</span></div>
          </div>
          <div v-else class="text-grey-6 text-center q-pa-xl"><q-icon name="money_off" size="48px" class="q-mb-sm" /><br/>Click Generate</div>
        </div>
      </q-tab-panel>

      <!-- ═══════ REVENUE SUMMARY ═══════ -->
      <q-tab-panel name="revenue" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header"><span class="fin-panel__title">Revenue Summary</span><span class="fin-panel__subtitle">{{ dateFrom }} to {{ dateTo }}</span></div>
          <div class="fin-panel__body q-pa-md" v-if="revenueData">
            <div class="row q-col-gutter-md q-mb-md">
              <div class="col-12 col-sm-3"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(16,185,129,0.12)"><q-icon name="payments" color="green" /></div><div><div class="fin-kpi-card__label">Total Revenue</div><div class="fin-kpi-card__value">{{ fmt(revenueData.grandTotal) }}</div></div></div></div>
              <div class="col-12 col-sm-3"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(59,130,246,0.12)"><q-icon name="receipt" color="blue" /></div><div><div class="fin-kpi-card__label">Transactions</div><div class="fin-kpi-card__value">{{ revenueData.totalTransactions }}</div></div></div></div>
              <div class="col-12 col-sm-3" v-for="(val, method) in revenueData.byMethod" :key="method"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(139,92,246,0.12)"><q-icon name="credit_card" color="purple" /></div><div><div class="fin-kpi-card__label">{{ method }}</div><div class="fin-kpi-card__value">{{ fmt(val) }}</div></div></div></div>
            </div>
            <q-table :rows="revenueData.daily" :columns="revDailyCols" row-key="date" flat dark dense hide-bottom :rows-per-page-options="[0]" class="fin-table" />
            <div class="fin-summary-row"><span class="fin-summary-row__label">Grand Total</span><span class="fin-summary-row__value text-green-4">{{ fmt(revenueData.grandTotal) }}</span></div>
          </div>
          <div v-else class="text-grey-6 text-center q-pa-xl"><q-icon name="attach_money" size="48px" class="q-mb-sm" /><br/>Click Generate</div>
        </div>
      </q-tab-panel>

      <!-- ═══════ AR/AP AGING ═══════ -->
      <q-tab-panel name="aging" class="q-pa-none">
        <div class="row q-col-gutter-md">
          <div class="col-12 col-md-6"><div class="fin-panel"><div class="fin-panel__header"><span class="fin-panel__title">Accounts Receivable Aging</span></div><q-table :rows="arAgingRows" :columns="agingCols" row-key="id" flat dark dense hide-bottom :rows-per-page-options="[0]" class="fin-table" no-data-label="No outstanding receivables" /><div class="fin-summary-row"><span class="fin-summary-row__label">Total Outstanding AR</span><span class="fin-summary-row__value text-blue-4">{{ fmt(arAgingTotal) }}</span></div></div></div>
          <div class="col-12 col-md-6"><div class="fin-panel"><div class="fin-panel__header"><span class="fin-panel__title">Accounts Payable Aging</span></div><q-table :rows="apAgingRows" :columns="agingCols" row-key="id" flat dark dense hide-bottom :rows-per-page-options="[0]" class="fin-table" no-data-label="No outstanding payables" /><div class="fin-summary-row"><span class="fin-summary-row__label">Total Outstanding AP</span><span class="fin-summary-row__value text-red-4">{{ fmt(apAgingTotal) }}</span></div></div></div>
        </div>
      </q-tab-panel>

      <!-- ═══════ HR & PAYROLL REPORT ═══════ -->
      <q-tab-panel name="hr" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header"><span class="fin-panel__title">HR & Payroll — Workforce Report</span></div>
          <div class="fin-panel__body q-pa-md" v-if="hrData">
            <div class="row q-col-gutter-md q-mb-md">
              <div class="col-6 col-sm-3"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(59,130,246,0.12)"><q-icon name="groups" color="blue" /></div><div><div class="fin-kpi-card__label">Total Employees</div><div class="fin-kpi-card__value">{{ hrData.headcount }}</div></div></div></div>
              <div class="col-6 col-sm-3"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(16,185,129,0.12)"><q-icon name="payments" color="green" /></div><div><div class="fin-kpi-card__label">Total Basic Salary</div><div class="fin-kpi-card__value">{{ fmt(hrData.totalBasic) }}</div></div></div></div>
              <div class="col-6 col-sm-3"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(139,92,246,0.12)"><q-icon name="card_giftcard" color="purple" /></div><div><div class="fin-kpi-card__label">Total Allowances</div><div class="fin-kpi-card__value">{{ fmt(hrData.totalAllowances) }}</div></div></div></div>
              <div class="col-6 col-sm-3"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(245,158,11,0.12)"><q-icon name="account_balance_wallet" color="amber" /></div><div><div class="fin-kpi-card__label">Total Monthly Payroll</div><div class="fin-kpi-card__value text-amber-4">{{ fmt(hrData.totalPayroll) }}</div></div></div></div>
            </div>
            <!-- Department Breakdown -->
            <div class="text-subtitle2 text-blue-4 q-mb-xs q-mt-md">Department-wise Cost</div>
            <q-table :rows="hrData.byDepartment" :columns="hrDeptCols" row-key="dept" flat dark dense hide-bottom :rows-per-page-options="[0]" class="fin-table q-mb-md" />
            <!-- Employee Salary List -->
            <div class="text-subtitle2 text-green-4 q-mb-xs">Employee Salary Details</div>
            <q-table :rows="hrData.employees" :columns="hrEmpCols" row-key="id" flat dark dense :rows-per-page-options="[25,50,0]" class="fin-table">
              <template #body-cell-status="props"><q-td :props="props"><span :class="props.row.status === 'active' ? 'fin-badge fin-badge--success' : 'fin-badge fin-badge--muted'">{{ props.row.status }}</span></q-td></template>
            </q-table>
          </div>
          <div v-else class="text-grey-6 text-center q-pa-xl"><q-icon name="badge" size="48px" class="q-mb-sm" /><br/>Click Generate</div>
        </div>
      </q-tab-panel>

      <!-- ═══════ PAYROLL CYCLES ═══════ -->
      <q-tab-panel name="payroll" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header"><span class="fin-panel__title">Payroll Cycles Report</span><span class="fin-panel__subtitle">{{ dateFrom }} to {{ dateTo }}</span></div>
          <div class="fin-panel__body q-pa-md" v-if="payrollData">
            <div class="row q-col-gutter-md q-mb-md">
              <div class="col-6 col-sm-3"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(59,130,246,0.12)"><q-icon name="event_repeat" color="blue" /></div><div><div class="fin-kpi-card__label">Cycles</div><div class="fin-kpi-card__value">{{ payrollData.cycleCount }}</div></div></div></div>
              <div class="col-6 col-sm-3"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(16,185,129,0.12)"><q-icon name="payments" color="green" /></div><div><div class="fin-kpi-card__label">Total Gross</div><div class="fin-kpi-card__value">{{ fmt(payrollData.totalGross) }}</div></div></div></div>
              <div class="col-6 col-sm-3"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(239,68,68,0.12)"><q-icon name="remove_circle" color="red" /></div><div><div class="fin-kpi-card__label">Deductions</div><div class="fin-kpi-card__value">{{ fmt(payrollData.totalDeductions) }}</div></div></div></div>
              <div class="col-6 col-sm-3"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(245,158,11,0.12)"><q-icon name="account_balance_wallet" color="amber" /></div><div><div class="fin-kpi-card__label">Total Net</div><div class="fin-kpi-card__value">{{ fmt(payrollData.totalNet) }}</div></div></div></div>
            </div>
            <q-table :rows="payrollData.cycles" :columns="payrollCycleCols" row-key="id" flat dark dense hide-bottom :rows-per-page-options="[0]" class="fin-table">
              <template #body-cell-status="props"><q-td :props="props"><span :class="props.row.status === 'posted' ? 'fin-badge fin-badge--success' : 'fin-badge fin-badge--warning'">{{ props.row.status }}</span></q-td></template>
            </q-table>
          </div>
          <div v-else class="text-grey-6 text-center q-pa-xl"><q-icon name="payments" size="48px" class="q-mb-sm" /><br/>Click Generate</div>
        </div>
      </q-tab-panel>

      <!-- ═══════ TAX ═══════ -->
      <q-tab-panel name="tax" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header"><span class="fin-panel__title">Tax Summary</span><span class="fin-panel__subtitle">{{ dateFrom }} to {{ dateTo }}</span></div>
          <div class="fin-panel__body q-pa-md" v-if="taxData">
            <div class="row q-col-gutter-md q-mb-md">
              <div class="col-12 col-sm-4"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(16,185,129,0.12)"><q-icon name="arrow_downward" color="green" /></div><div><div class="fin-kpi-card__label">Tax Collected</div><div class="fin-kpi-card__value">{{ fmt(taxData.totalCollected) }}</div></div></div></div>
              <div class="col-12 col-sm-4"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(239,68,68,0.12)"><q-icon name="arrow_upward" color="red" /></div><div><div class="fin-kpi-card__label">Tax Liability</div><div class="fin-kpi-card__value">{{ fmt(taxData.totalLiability) }}</div></div></div></div>
              <div class="col-12 col-sm-4"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(59,130,246,0.12)"><q-icon name="balance" color="blue" /></div><div><div class="fin-kpi-card__label">Net Tax Position</div><div class="fin-kpi-card__value" :class="taxData.netTax >= 0 ? 'text-green-4' : 'text-red-4'">{{ fmt(taxData.netTax) }}</div></div></div></div>
            </div>
            <q-table :rows="taxData.byTaxCode" :columns="taxCodeCols" row-key="code" flat dark dense hide-bottom :rows-per-page-options="[0]" class="fin-table" />
          </div>
          <div v-else class="text-grey-6 text-center q-pa-xl"><q-icon name="gavel" size="48px" class="q-mb-sm" /><br/>Click Generate</div>
        </div>
      </q-tab-panel>

      <!-- ═══════ DAILY CASH ═══════ -->
      <q-tab-panel name="cash" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header"><span class="fin-panel__title">Daily Cash Summary</span><span class="fin-panel__subtitle">{{ dateFrom }} to {{ dateTo }}</span></div>
          <div class="fin-panel__body q-pa-md" v-if="cashData">
            <div class="row q-col-gutter-md q-mb-md">
              <div class="col-12 col-sm-4"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(16,185,129,0.12)"><q-icon name="arrow_downward" color="green" /></div><div><div class="fin-kpi-card__label">Total Cash In</div><div class="fin-kpi-card__value text-green-4">{{ fmt(cashData.totalIn) }}</div></div></div></div>
              <div class="col-12 col-sm-4"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(239,68,68,0.12)"><q-icon name="arrow_upward" color="red" /></div><div><div class="fin-kpi-card__label">Total Cash Out</div><div class="fin-kpi-card__value text-red-4">{{ fmt(cashData.totalOut) }}</div></div></div></div>
              <div class="col-12 col-sm-4"><div class="fin-kpi-card"><div class="fin-kpi-card__icon" style="background:rgba(59,130,246,0.12)"><q-icon name="balance" color="blue" /></div><div><div class="fin-kpi-card__label">Net Cash Flow</div><div class="fin-kpi-card__value" :class="cashData.netCash >= 0 ? 'text-green-4' : 'text-red-4'">{{ fmt(cashData.netCash) }}</div></div></div></div>
            </div>
            <q-table :rows="cashData.daily" :columns="cashDailyCols" row-key="date" flat dark dense hide-bottom :rows-per-page-options="[0]" class="fin-table" />
          </div>
          <div v-else class="text-grey-6 text-center q-pa-xl"><q-icon name="account_balance_wallet" size="48px" class="q-mb-sm" /><br/>Click Generate</div>
        </div>
      </q-tab-panel>

      <!-- ═══════ AUDIT TRAIL ═══════ -->
      <q-tab-panel name="audit" class="q-pa-none">
        <div class="fin-panel">
          <div class="fin-panel__header"><span class="fin-panel__title">Finance Audit Trail ({{ auditLogs.length }})</span><q-select v-model="auditEntity" :options="auditEntityTypes" label="Entity" dense dark outlined style="min-width:160px" clearable @update:model-value="loadAuditData" /></div>
          <q-table :rows="auditLogs" :columns="auditCols" row-key="id" flat dark dense :rows-per-page-options="[25,50]" class="fin-table" :loading="loading" no-data-label="No audit entries">
            <template #body-cell-action="props"><q-td :props="props"><span :class="auditActionClass(props.row.action)">{{ props.row.action }}</span></q-td></template>
            <template #body-cell-details="props"><q-td :props="props"><q-btn v-if="props.row.old_values || props.row.new_values" flat dense icon="info" size="sm" color="grey-5" @click="showAuditDetail(props.row)" /></q-td></template>
          </q-table>
        </div>
        <q-dialog v-model="showAuditDialog"><q-card style="min-width:500px;background:var(--erp-fin-bg-panel);border:1px solid var(--erp-fin-border);color:var(--erp-text-primary)"><q-card-section><div class="text-subtitle1 text-weight-bold">Audit Detail</div><div class="text-caption" style="color:var(--erp-text-muted)">{{ selectedAuditLog?.description }}</div></q-card-section><q-card-section><div class="row q-col-gutter-md"><div class="col-6" v-if="selectedAuditLog?.old_values"><div class="text-caption text-red-4 q-mb-xs">Old Values</div><pre style="font-size:11px;white-space:pre-wrap;color:var(--erp-text-secondary)">{{ JSON.stringify(selectedAuditLog.old_values,null,2) }}</pre></div><div class="col-6" v-if="selectedAuditLog?.new_values"><div class="text-caption text-green-4 q-mb-xs">New Values</div><pre style="font-size:11px;white-space:pre-wrap;color:var(--erp-text-secondary)">{{ JSON.stringify(selectedAuditLog.new_values,null,2) }}</pre></div></div></q-card-section><q-card-actions align="right"><q-btn flat label="Close" color="grey-5" v-close-popup /></q-card-actions></q-card></q-dialog>
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  fetchProfitAndLoss, fetchBalanceSheet, fetchTrialBalance,
  fetchGeneralLedger, fetchChartOfAccounts,
  fetchExpenseSummary, fetchRevenueSummary, fetchDailyCashSummary,
  fetchPayrollSummaryReport, fetchTaxSummaryReport,
  fetchReceivableAging, fetchPayableAging,
  fetchFinanceAuditLogs, fetchHRWorkforceReport, fetchMonthlyPnlSummary,
} from 'src/services/financeService'

const route = useRoute()
const validTabs = ['monthly','pnl','bs','tb','gl','expense','revenue','aging','hr','payroll','tax','cash','audit']
const loading = ref(false)
const activeTab = ref(validTabs.includes(route.query.tab) ? route.query.tab : 'monthly')
const now = new Date()
const dateFrom = ref(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0])
const dateTo = ref(now.toISOString().split('T')[0])
const selectedYear = ref(now.getFullYear())
const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

const pnlData = ref(null); const bsData = ref(null)
const tbRows = ref([]); const glRows = ref([]); const glAccount = ref(null); const accountOptions = ref([])
const expenseData = ref(null); const revenueData = ref(null); const cashData = ref(null)
const payrollData = ref(null); const taxData = ref(null); const hrData = ref(null); const monthlyData = ref(null)
const arAgingRows = ref([]); const apAgingRows = ref([])
const auditLogs = ref([]); const auditEntity = ref(null)
const showAuditDialog = ref(false); const selectedAuditLog = ref(null)
const auditEntityTypes = ['journal_entry','expense','payment','payroll','bank_account','tax','account','invoice']

function fmt(v) { return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) }
function monthName(m) { const [y, mo] = m.split('-'); return new Date(y, mo - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }
function printReport() { window.print() }

// ── Export Helpers ──
function getExportData() {
  const tab = activeTab.value
  if (tab === 'monthly' && monthlyData.value) return { rows: monthlyData.value.monthly.map(m => ({ ...m, month: monthName(m.month) })), cols: monthlyCols, title: `Monthly_Summary_${selectedYear.value}` }
  if (tab === 'pnl' && pnlData.value) return { rows: [...pnlData.value.revenue, ...pnlData.value.expenses], cols: pnlCols, title: `PnL_${dateFrom.value}_${dateTo.value}` }
  if (tab === 'bs' && bsData.value) return { rows: [...bsData.value.assets, ...bsData.value.liabilities, ...bsData.value.equity], cols: bsCols, title: `Balance_Sheet` }
  if (tab === 'tb' && tbRows.value.length) return { rows: tbRows.value, cols: tbCols, title: `Trial_Balance` }
  if (tab === 'gl' && glRows.value.length) return { rows: glRows.value, cols: glCols, title: `General_Ledger_${glAccount.value || ''}` }
  if (tab === 'expense' && expenseData.value) return { rows: expenseData.value.categories, cols: expCatCols, title: `Expense_Summary_${dateFrom.value}_${dateTo.value}` }
  if (tab === 'revenue' && revenueData.value) return { rows: revenueData.value.daily, cols: revDailyCols, title: `Revenue_Summary_${dateFrom.value}_${dateTo.value}` }
  if (tab === 'aging') return { rows: [...arAgingRows.value, ...apAgingRows.value], cols: agingCols, title: `AR_AP_Aging` }
  if (tab === 'hr' && hrData.value) return { rows: hrData.value.employees, cols: hrEmpCols, title: `HR_Workforce_Report` }
  if (tab === 'payroll' && payrollData.value) return { rows: payrollData.value.cycles, cols: payrollCycleCols, title: `Payroll_Cycles_${dateFrom.value}_${dateTo.value}` }
  if (tab === 'tax' && taxData.value) return { rows: taxData.value.byTaxCode, cols: taxCodeCols, title: `Tax_Summary_${dateFrom.value}_${dateTo.value}` }
  if (tab === 'cash' && cashData.value) return { rows: cashData.value.daily, cols: cashDailyCols, title: `Daily_Cash_${dateFrom.value}_${dateTo.value}` }
  if (tab === 'audit' && auditLogs.value.length) return { rows: auditLogs.value, cols: auditCols, title: `Audit_Trail` }
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
  doc.setFontSize(18); doc.setTextColor(25, 118, 210)
  doc.text('SEVEN WAVES RESTAURANT (PVT) LTD', 14, 18)
  doc.setFontSize(12); doc.setTextColor(0)
  doc.text(d.title.replace(/_/g, ' '), 14, 26)
  doc.setFontSize(9); doc.setTextColor(100)
  doc.text(`Generated: ${new Date().toLocaleString()}   |   Period: ${dateFrom.value} to ${dateTo.value}`, 14, 33)
  const heads = d.cols.map(c => c.label)
  const body = d.rows.map(r => d.cols.map(c => {
    const val = typeof c.field === 'function' ? c.field(r) : r[c.field]
    return c.format ? c.format(val) : (val ?? '-')
  }))
  autoTable(doc, { startY: 38, head: [heads], body, theme: 'grid', headStyles: { fillColor: [25, 118, 210], halign: 'center', fontSize: 8 }, styles: { fontSize: 7 }, columnStyles: Object.fromEntries(d.cols.map((c, i) => [i, { halign: c.align || 'left' }])) })
  doc.save(`${d.title}_${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ── Column Definitions ──
const pnlCols = [
  { name: 'code', label: 'Code', field: 'code', align: 'left', style: 'width:80px' },
  { name: 'name', label: 'Account', field: 'name', align: 'left' },
  { name: 'amount', label: 'Amount', field: row => row.code?.startsWith('4') ? (row.credit - row.debit) : (row.debit - row.credit), align: 'right', format: v => fmt(v) },
]
const bsCols = [
  { name: 'code', label: 'Code', field: 'code', align: 'left', style: 'width:80px' },
  { name: 'name', label: 'Account', field: 'name', align: 'left' },
  { name: 'balance', label: 'Balance', field: 'balance', align: 'right', format: v => fmt(v) },
]
const tbCols = [
  { name: 'code', label: 'Code', field: 'code', align: 'left', sortable: true, style: 'width:100px' },
  { name: 'name', label: 'Account', field: 'name', align: 'left', sortable: true },
  { name: 'account_type', label: 'Type', field: 'account_type', align: 'left', style: 'width:100px' },
  { name: 'debit_total', label: 'Debit', field: 'debit_total', align: 'right', format: v => fmt(v), style: 'width:140px' },
  { name: 'credit_total', label: 'Credit', field: 'credit_total', align: 'right', format: v => fmt(v), style: 'width:140px' },
]
const glCols = [
  { name: 'date', label: 'Date', field: row => row.journal_entries?.doc_date || '-', align: 'left', style: 'width:100px' },
  { name: 'desc', label: 'Description', field: row => row.journal_entries?.description || '-', align: 'left' },
  { name: 'ref', label: 'Ref', field: row => row.journal_entries?.reference_type || '-', align: 'left', style: 'width:90px' },
  { name: 'debit', label: 'Debit', field: 'dr_amount', align: 'right', format: v => fmt(v), style: 'width:120px' },
  { name: 'credit', label: 'Credit', field: 'cr_amount', align: 'right', format: v => fmt(v), style: 'width:120px' },
  { name: 'balance', label: 'Running', field: '_runBal', align: 'right', style: 'width:130px' },
]
const expCatCols = [
  { name: 'category', label: 'Category', field: 'category', align: 'left' },
  { name: 'count', label: 'Entries', field: 'count', align: 'center', style: 'width:80px' },
  { name: 'total', label: 'Total', field: 'total', align: 'right', format: v => fmt(v), style: 'width:150px' },
]
const revDailyCols = [
  { name: 'date', label: 'Date', field: 'date', align: 'left', style: 'width:120px' },
  { name: 'count', label: 'Txns', field: 'count', align: 'center', style: 'width:80px' },
  { name: 'total', label: 'Revenue', field: 'total', align: 'right', format: v => fmt(v), style: 'width:150px' },
]
const agingCols = [
  { name: 'name', label: 'Name', field: 'customer_name', align: 'left' },
  { name: 'current', label: 'Current', field: 'current_amount', align: 'right', format: v => fmt(v) },
  { name: '30', label: '1-30d', field: 'days_1_30', align: 'right', format: v => fmt(v) },
  { name: '60', label: '31-60d', field: 'days_31_60', align: 'right', format: v => fmt(v) },
  { name: '90', label: '61-90d', field: 'days_61_90', align: 'right', format: v => fmt(v) },
  { name: 'over90', label: '90+', field: 'days_over_90', align: 'right', format: v => fmt(v) },
  { name: 'total', label: 'Total', field: 'total_outstanding', align: 'right', format: v => fmt(v), style: 'font-weight:700' },
]
const hrDeptCols = [
  { name: 'dept', label: 'Department', field: 'dept', align: 'left' },
  { name: 'count', label: 'Employees', field: 'count', align: 'center', style: 'width:100px' },
  { name: 'totalSalary', label: 'Monthly Cost', field: 'totalSalary', align: 'right', format: v => fmt(v), style: 'width:150px' },
]
const hrEmpCols = [
  { name: 'code', label: 'Code', field: 'code', align: 'left', style: 'width:80px' },
  { name: 'name', label: 'Employee', field: 'name', align: 'left' },
  { name: 'department', label: 'Department', field: 'department', align: 'left' },
  { name: 'designation', label: 'Designation', field: 'designation', align: 'left' },
  { name: 'basic', label: 'Basic', field: 'basic', align: 'right', format: v => fmt(v), style: 'width:110px' },
  { name: 'allowances', label: 'Allowances', field: 'allowances', align: 'right', format: v => fmt(v), style: 'width:110px' },
  { name: 'totalPay', label: 'Total Pay', field: 'totalPay', align: 'right', format: v => fmt(v), style: 'width:120px;font-weight:700' },
  { name: 'status', label: 'Status', field: 'status', align: 'center', style: 'width:80px' },
]
const payrollCycleCols = [
  { name: 'cycle', label: 'Cycle', field: 'cycle_name', align: 'left' },
  { name: 'period', label: 'Period', field: row => `${row.period_start} → ${row.period_end}`, align: 'left' },
  { name: 'employees', label: 'Employees', field: 'total_employees', align: 'center' },
  { name: 'gross', label: 'Gross', field: 'total_gross', align: 'right', format: v => fmt(v) },
  { name: 'deductions', label: 'Deductions', field: 'total_deductions', align: 'right', format: v => fmt(v) },
  { name: 'net', label: 'Net', field: 'total_net', align: 'right', format: v => fmt(v) },
  { name: 'status', label: 'Status', field: 'status', align: 'center', style: 'width:100px' },
]
const taxCodeCols = [
  { name: 'code', label: 'Code', field: 'code', align: 'left', style: 'width:100px' },
  { name: 'name', label: 'Name', field: 'name', align: 'left' },
  { name: 'rate', label: 'Rate', field: 'rate', align: 'center', format: v => `${v}%`, style: 'width:80px' },
  { name: 'collected', label: 'Collected', field: 'collected', align: 'right', format: v => fmt(v) },
  { name: 'liability', label: 'Liability', field: 'liability', align: 'right', format: v => fmt(v) },
  { name: 'net', label: 'Net', field: 'net', align: 'right', format: v => fmt(v) },
]
const cashDailyCols = [
  { name: 'date', label: 'Date', field: 'date', align: 'left', style: 'width:120px' },
  { name: 'in', label: 'Cash In', field: 'cashIn', align: 'right', format: v => fmt(v) },
  { name: 'out', label: 'Cash Out', field: 'cashOut', align: 'right', format: v => fmt(v) },
  { name: 'net', label: 'Net', field: 'net', align: 'right', format: v => fmt(v) },
]
const monthlyCols = [
  { name: 'month', label: 'Month', field: 'month', align: 'left' },
  { name: 'revenue', label: 'Revenue', field: 'revenue', align: 'right', format: v => fmt(v) },
  { name: 'expenses', label: 'Expenses', field: 'expenses', align: 'right', format: v => fmt(v) },
  { name: 'wages', label: 'Wages/Payroll', field: 'wages', align: 'right', format: v => fmt(v) },
  { name: 'profit', label: 'Net Profit', field: 'profit', align: 'right', style: 'width:140px' },
]
const auditCols = [
  { name: 'timestamp', label: 'Timestamp', field: 'created_at', align: 'left', sortable: true, style: 'width:170px', format: v => v ? new Date(v).toLocaleString() : '-' },
  { name: 'user', label: 'User', field: row => row.profiles?.full_name || row.profiles?.email || '-', align: 'left' },
  { name: 'action', label: 'Action', field: 'action', align: 'center', style: 'width:90px' },
  { name: 'entity_type', label: 'Entity', field: 'entity_type', align: 'left', style: 'width:110px' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'details', label: '', align: 'center', style: 'width:40px' },
]

// ── Computed ──
const tbTotalDr = computed(() => tbRows.value.reduce((s, r) => s + Number(r.debit_total || 0), 0))
const tbTotalCr = computed(() => tbRows.value.reduce((s, r) => s + Number(r.credit_total || 0), 0))
const arAgingTotal = computed(() => arAgingRows.value.reduce((s, r) => s + Number(r.total_outstanding || 0), 0))
const apAgingTotal = computed(() => apAgingRows.value.reduce((s, r) => s + Number(r.total_outstanding || 0), 0))

function auditActionClass(a) {
  const m = { create:'fin-badge fin-badge--success', update:'fin-badge fin-badge--info', delete:'fin-badge fin-badge--danger', reverse:'fin-badge fin-badge--warning', approve:'fin-badge fin-badge--success', post:'fin-badge fin-badge--info' }
  return m[a] || 'fin-badge fin-badge--muted'
}
function showAuditDetail(row) { selectedAuditLog.value = row; showAuditDialog.value = true }

// ── Data Loading ──
async function loadCurrentReport() {
  loading.value = true
  const tab = activeTab.value, df = dateFrom.value, dt = dateTo.value
  try {
    if (tab === 'monthly') { const r = await fetchMonthlyPnlSummary(selectedYear.value); monthlyData.value = r.data }
    else if (tab === 'pnl') { const r = await fetchProfitAndLoss(df, dt); pnlData.value = r.data }
    else if (tab === 'bs') { const r = await fetchBalanceSheet(); bsData.value = r.data }
    else if (tab === 'tb') { const r = await fetchTrialBalance(); tbRows.value = r.data || [] }
    else if (tab === 'gl') { await loadAccounts() }
    else if (tab === 'expense') { const r = await fetchExpenseSummary(df, dt); expenseData.value = r.data }
    else if (tab === 'revenue') { const r = await fetchRevenueSummary(df, dt); revenueData.value = r.data }
    else if (tab === 'aging') { await loadAgingData() }
    else if (tab === 'hr') { const r = await fetchHRWorkforceReport(); hrData.value = r.data }
    else if (tab === 'payroll') { const r = await fetchPayrollSummaryReport(df, dt); payrollData.value = r.data }
    else if (tab === 'tax') { const r = await fetchTaxSummaryReport(df, dt); taxData.value = r.data }
    else if (tab === 'cash') { const r = await fetchDailyCashSummary(df, dt); cashData.value = r.data }
    else if (tab === 'audit') { await loadAuditData() }
  } catch (e) { console.error('[FinanceReports]', e) }
  loading.value = false
}

async function loadAccounts() {
  const { data } = await fetchChartOfAccounts()
  accountOptions.value = (data || []).map(a => ({ code: a.code, label: `${a.code} — ${a.name}` }))
}
async function loadGLData() {
  if (!glAccount.value) { glRows.value = []; return }
  loading.value = true
  const { data } = await fetchGeneralLedger({ accountCode: glAccount.value, dateFrom: dateFrom.value, dateTo: dateTo.value })
  let balance = 0
  const sorted = (data || []).sort((a, b) => new Date(a.journal_entries?.doc_date || 0) - new Date(b.journal_entries?.doc_date || 0))
  sorted.forEach(row => { balance += Number(row.dr_amount || 0) - Number(row.cr_amount || 0); row._runBal = balance })
  glRows.value = sorted
  loading.value = false
}
async function loadAgingData() {
  const [arRes, apRes] = await Promise.all([fetchReceivableAging(), fetchPayableAging()])
  arAgingRows.value = arRes.data || []; apAgingRows.value = apRes.data || []
}
async function loadAuditData() {
  const { data } = await fetchFinanceAuditLogs({ entityType: auditEntity.value || undefined, dateFrom: dateFrom.value || undefined, dateTo: dateTo.value || undefined })
  auditLogs.value = data || []
}

onMounted(loadCurrentReport)
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
.fin-report-tabs {
  background: var(--erp-fin-bg-page); border-bottom: 1px solid var(--erp-fin-border); border-radius: 6px 6px 0 0;
  .q-tab { font-size: 11px; min-height: 36px; padding: 0 10px; }
}
@media print {
  .fin-filters, .fin-report-tabs, .q-toolbar, .q-drawer { display: none !important; }
  .finance-page { background: #fff !important; color: #000 !important; }
  .fin-panel { border: 1px solid #ccc; }
  .fin-table tbody td { color: #000 !important; }
}
</style>
