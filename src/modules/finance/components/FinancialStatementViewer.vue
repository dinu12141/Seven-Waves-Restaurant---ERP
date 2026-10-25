<template>
  <q-card flat bordered class="q-pa-lg statement-card">
    <!-- Corporate Header -->
    <div class="text-center q-mb-lg statement-header">
      <div class="text-h5 text-weight-bold text-primary">{{ report.company_name || 'SEVEN WAVES RESTAURANT (PVT) LTD' }}</div>
      <div class="text-h6 text-weight-bold text-grey-9 q-mt-xs">{{ report.title || 'FINANCIAL STATEMENT' }}</div>
      <div class="text-subtitle2 text-grey-6 q-mt-xs">{{ report.period || report.as_of_date || '' }}</div>
    </div>

    <!-- Top Action Bar (Download Excel & PDF) -->
    <div class="row items-center justify-end q-mb-md q-gutter-sm print-hide">
      <q-btn
        unelevated
        color="positive"
        icon="table_view"
        label="Download Excel"
        no-caps
        dense
        padding="xs md"
        @click="$emit('download-excel')"
      >
        <q-tooltip>Download professional Excel spreadsheet (.xlsx)</q-tooltip>
      </q-btn>
      <q-btn
        unelevated
        color="negative"
        icon="picture_as_pdf"
        label="Download PDF"
        no-caps
        dense
        padding="xs md"
        @click="$emit('download-pdf')"
      >
        <q-tooltip>Download formatted corporate PDF document (.pdf)</q-tooltip>
      </q-btn>
    </div>

    <q-separator class="q-mb-md" />

    <!-- PROFIT & LOSS VIEW -->
    <div v-if="report.type === 'pl'" class="statement-body">
      <!-- 1. REVENUE -->
      <div class="section-title">REVENUE</div>
      <table class="statement-table">
        <tbody>
          <tr v-for="item in report.revenue?.items" :key="item.code">
            <td class="col-code">{{ item.code }}</td>
            <td class="col-name indent">{{ item.name }}</td>
            <td class="col-amount">{{ formatMoney(item.amount) }}</td>
            <td class="col-subtotal"></td>
          </tr>
          <tr class="subtotal-row">
            <td></td>
            <td class="text-weight-bold">TOTAL REVENUE</td>
            <td></td>
            <td class="col-subtotal text-weight-bold">{{ formatMoney(report.revenue?.total) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- 2. OTHER INCOME -->
      <div class="section-title q-mt-md">OTHER INCOME</div>
      <table class="statement-table">
        <tbody>
          <tr v-for="item in report.other_income?.items" :key="item.code">
            <td class="col-code">{{ item.code }}</td>
            <td class="col-name indent">{{ item.name }}</td>
            <td class="col-amount">{{ formatMoney(item.amount) }}</td>
            <td class="col-subtotal"></td>
          </tr>
          <tr class="subtotal-row">
            <td></td>
            <td class="text-weight-bold">TOTAL OTHER INCOME</td>
            <td></td>
            <td class="col-subtotal text-weight-bold">{{ formatMoney(report.other_income?.total) }}</td>
          </tr>
          <tr class="major-total-row">
            <td></td>
            <td class="text-weight-bolder">TOTAL INCOME</td>
            <td></td>
            <td class="col-subtotal text-weight-bolder text-green-8">LKR {{ formatMoney(report.total_income) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- 3. COST OF GOODS SOLD (COGS) -->
      <div class="section-title q-mt-md">COST OF GOODS SOLD (COGS)</div>
      <table class="statement-table">
        <tbody>
          <tr v-for="item in report.cost_of_sales?.items" :key="item.code">
            <td class="col-code">{{ item.code }}</td>
            <td class="col-name indent">{{ item.name }}</td>
            <td class="col-amount">{{ formatMoney(item.amount) }}</td>
            <td class="col-subtotal"></td>
          </tr>
          <tr class="subtotal-row">
            <td></td>
            <td class="text-weight-bold">TOTAL COST OF SALES</td>
            <td></td>
            <td class="col-subtotal text-weight-bold">{{ formatMoney(report.cost_of_sales?.total) }}</td>
          </tr>
          <tr class="major-total-row">
            <td></td>
            <td class="text-weight-bolder">GROSS PROFIT</td>
            <td></td>
            <td class="col-subtotal text-weight-bolder" :class="report.gross_profit >= 0 ? 'text-green-8' : 'text-red-8'">
              LKR {{ formatMoney(report.gross_profit) }}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 4. EXPENSES -->
      <div class="section-title q-mt-md">EXPENSES</div>

      <!-- 4a. Admin & Operations -->
      <div class="sub-section-title">ADMIN AND OPERATION EXPENSES</div>
      <table class="statement-table">
        <tbody>
          <tr v-for="item in report.expenses?.admin_and_operation?.items" :key="item.code">
            <td class="col-code">{{ item.code }}</td>
            <td class="col-name indent-2">{{ item.name }}</td>
            <td class="col-amount">{{ formatMoney(item.amount) }}</td>
            <td class="col-subtotal"></td>
          </tr>
          <tr class="subtotal-row">
            <td></td>
            <td class="text-weight-bold">TOTAL ADMIN AND OPERATION EXPENSES</td>
            <td></td>
            <td class="col-subtotal text-weight-bold">{{ formatMoney(report.expenses?.admin_and_operation?.total) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- 4b. Selling & Distribution -->
      <div class="sub-section-title q-mt-sm">SELLING AND DISTRIBUTION EXPENSES</div>
      <table class="statement-table">
        <tbody>
          <tr v-for="item in report.expenses?.selling_and_distribution?.items" :key="item.code">
            <td class="col-code">{{ item.code }}</td>
            <td class="col-name indent-2">{{ item.name }}</td>
            <td class="col-amount">{{ formatMoney(item.amount) }}</td>
            <td class="col-subtotal"></td>
          </tr>
          <tr class="subtotal-row">
            <td></td>
            <td class="text-weight-bold">TOTAL SELLING AND DISTRIBUTION</td>
            <td></td>
            <td class="col-subtotal text-weight-bold">{{ formatMoney(report.expenses?.selling_and_distribution?.total) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- 4c. Finance & Other -->
      <div class="sub-section-title q-mt-sm">FINANCE AND OTHER EXPENSES</div>
      <table class="statement-table">
        <tbody>
          <tr v-for="item in report.expenses?.finance_and_other?.items" :key="item.code">
            <td class="col-code">{{ item.code }}</td>
            <td class="col-name indent-2">{{ item.name }}</td>
            <td class="col-amount">{{ formatMoney(item.amount) }}</td>
            <td class="col-subtotal"></td>
          </tr>
          <tr class="subtotal-row">
            <td></td>
            <td class="text-weight-bold">TOTAL FINANCE AND OTHER EXPENSES</td>
            <td></td>
            <td class="col-subtotal text-weight-bold">{{ formatMoney(report.expenses?.finance_and_other?.total) }}</td>
          </tr>
          <tr class="major-total-row">
            <td></td>
            <td class="text-weight-bolder">TOTAL EXPENSES</td>
            <td></td>
            <td class="col-subtotal text-weight-bolder text-red-8">LKR {{ formatMoney(report.expenses?.total_expenses) }}</td>
          </tr>
          <tr class="major-total-row">
            <td></td>
            <td class="text-weight-bolder">NET PROFIT BEFORE TAX</td>
            <td></td>
            <td class="col-subtotal text-weight-bolder">LKR {{ formatMoney(report.net_profit_before_tax) }}</td>
          </tr>
          <tr v-if="report.tax?.amount" class="tax-row">
            <td>7043</td>
            <td class="indent">TAX (Corporate Income Tax)</td>
            <td></td>
            <td class="col-subtotal text-red-7">({{ formatMoney(report.tax?.amount) }})</td>
          </tr>
          <tr class="grand-total-row">
            <td></td>
            <td class="text-weight-bolder text-h6" :class="report.net_profit >= 0 ? 'text-primary' : 'text-negative'">
              {{ report.net_profit >= 0 ? 'NET PROFIT' : 'NET LOSS' }}
            </td>
            <td></td>
            <td class="col-subtotal text-weight-bolder text-h6" :class="report.net_profit >= 0 ? 'text-green-8' : 'text-red-8'">
              LKR {{ formatMoney(report.net_profit) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- BALANCE SHEET VIEW -->
    <div v-else-if="report.type === 'bs'" class="statement-body">
      <!-- ── ASSETS ── -->
      <div class="category-header">ASSETS</div>

      <!-- Non-Current Assets -->
      <div class="sub-section-title">NON-CURRENT ASSETS</div>
      <table class="statement-table">
        <tbody>
          <tr v-for="item in report.assets?.non_current?.items" :key="item.code">
            <td class="col-code">{{ item.code }}</td>
            <td class="col-name indent">{{ item.name }}</td>
            <td class="col-amount">{{ formatMoney(item.amount) }}</td>
            <td class="col-subtotal"></td>
          </tr>
          <tr class="subtotal-row">
            <td></td>
            <td class="text-weight-bold">TOTAL NON-CURRENT ASSETS</td>
            <td></td>
            <td class="col-subtotal text-weight-bold">{{ formatMoney(report.assets?.non_current?.total) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Current Assets -->
      <div class="sub-section-title q-mt-md">CURRENT ASSETS</div>
      <table class="statement-table">
        <tbody>
          <tr v-for="item in report.assets?.current?.items" :key="item.code">
            <td class="col-code">{{ item.code }}</td>
            <td class="col-name indent">{{ item.name }}</td>
            <td class="col-amount">{{ formatMoney(item.amount) }}</td>
            <td class="col-subtotal"></td>
          </tr>
          <tr class="subtotal-row">
            <td></td>
            <td class="text-weight-bold">TOTAL CURRENT ASSETS</td>
            <td></td>
            <td class="col-subtotal text-weight-bold">{{ formatMoney(report.assets?.current?.total) }}</td>
          </tr>
          <tr class="grand-total-row">
            <td></td>
            <td class="text-weight-bolder text-h6 text-primary">TOTAL ASSETS</td>
            <td></td>
            <td class="col-subtotal text-weight-bolder text-h6 text-primary">
              LKR {{ formatMoney(report.assets?.total_assets) }}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- ── EQUITY AND LIABILITIES ── -->
      <div class="category-header q-mt-lg">EQUITY AND LIABILITIES</div>

      <!-- Equity -->
      <div class="sub-section-title">EQUITY</div>
      <table class="statement-table">
        <tbody>
          <tr v-for="item in report.equity_and_liabilities?.equity?.items" :key="item.name">
            <td class="col-code">{{ item.code }}</td>
            <td class="col-name indent">{{ item.name }}</td>
            <td class="col-amount">{{ formatMoney(item.amount) }}</td>
            <td class="col-subtotal"></td>
          </tr>
          <tr class="subtotal-row">
            <td></td>
            <td class="text-weight-bold">TOTAL EQUITY</td>
            <td></td>
            <td class="col-subtotal text-weight-bold">{{ formatMoney(report.equity_and_liabilities?.equity?.total) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Non-Current Liabilities -->
      <div class="sub-section-title q-mt-md">NON CURRENT LIABILITIES</div>
      <table class="statement-table">
        <tbody>
          <tr v-for="item in report.equity_and_liabilities?.non_current_liabilities?.items" :key="item.code">
            <td class="col-code">{{ item.code }}</td>
            <td class="col-name indent">{{ item.name }}</td>
            <td class="col-amount">{{ formatMoney(item.amount) }}</td>
            <td class="col-subtotal"></td>
          </tr>
          <tr class="subtotal-row">
            <td></td>
            <td class="text-weight-bold">TOTAL NON CURRENT LIABILITIES</td>
            <td></td>
            <td class="col-subtotal text-weight-bold">{{ formatMoney(report.equity_and_liabilities?.non_current_liabilities?.total) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Current Liabilities -->
      <div class="sub-section-title q-mt-md">CURRENT LIABILITIES</div>
      <table class="statement-table">
        <tbody>
          <tr v-for="item in report.equity_and_liabilities?.current_liabilities?.items" :key="item.code">
            <td class="col-code">{{ item.code }}</td>
            <td class="col-name indent">{{ item.name }}</td>
            <td class="col-amount">{{ formatMoney(item.amount) }}</td>
            <td class="col-subtotal"></td>
          </tr>
          <tr class="subtotal-row">
            <td></td>
            <td class="text-weight-bold">TOTAL CURRENT LIABILITIES</td>
            <td></td>
            <td class="col-subtotal text-weight-bold">{{ formatMoney(report.equity_and_liabilities?.current_liabilities?.total) }}</td>
          </tr>
          <tr class="grand-total-row">
            <td></td>
            <td class="text-weight-bolder text-h6 text-primary">TOTAL EQUITY AND LIABILITIES</td>
            <td></td>
            <td class="col-subtotal text-weight-bolder text-h6 text-primary">
              LKR {{ formatMoney(report.equity_and_liabilities?.total_liabilities_equity) }}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Balance Sheet check banner -->
      <div class="q-mt-md">
        <q-banner v-if="report.is_balanced" rounded class="bg-green-1 text-green-9 text-weight-medium">
          <q-icon name="check_circle" color="positive" size="sm" class="q-mr-xs" />
          Statement of Financial Position is balanced ✓ (Assets = Liabilities + Equity)
        </q-banner>
        <q-banner v-else rounded class="bg-amber-1 text-amber-10 text-weight-medium">
          <q-icon name="info" color="warning" size="sm" class="q-mr-xs" />
          Balance difference: LKR {{ formatMoney(Math.abs((report.assets?.total_assets || 0) - (report.equity_and_liabilities?.total_liabilities_equity || 0))) }} (Pending posted transaction adjustments)
        </q-banner>
      </div>
    </div>

    <!-- Timestamp footer -->
    <div class="text-caption text-grey-5 q-mt-lg text-right">
      Generated: {{ new Date(report.generated_at).toLocaleString() }} | Seven Waves ERP
    </div>
  </q-card>
</template>

<script setup>
defineProps({
  report: {
    type: Object,
    default: () => ({}),
  },
})

defineEmits(['download-excel', 'download-pdf'])

function formatMoney(num) {
  if (num === null || num === undefined || isNaN(num)) return '-'
  if (Number(num) === 0) return '-'
  const val = Number(num)
  if (val < 0) {
    return `(${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
  }
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>

<style scoped>
.statement-card {
  max-width: 900px;
  margin: 0 auto;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.category-header {
  font-size: 1.15rem;
  font-weight: 800;
  color: #1a237e;
  padding: 6px 0;
  border-bottom: 2px solid #1a237e;
  margin-top: 16px;
  margin-bottom: 8px;
}

.section-title {
  font-size: 1rem;
  font-weight: 700;
  color: #2c3e50;
  background: #f8fafc;
  padding: 6px 12px;
  border-left: 4px solid #1a237e;
  border-radius: 4px;
}

.sub-section-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #546e7a;
  padding: 4px 8px;
  margin-top: 6px;
}

.statement-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

.statement-table td {
  padding: 5px 8px;
}

.col-code {
  width: 90px;
  font-family: monospace;
  font-size: 0.8rem;
  color: #78909c;
}

.col-name {
  color: #263238;
}

.indent {
  padding-left: 18px !important;
}

.indent-2 {
  padding-left: 28px !important;
}

.col-amount {
  width: 140px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: #455a64;
}

.col-subtotal {
  width: 160px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.subtotal-row {
  border-top: 1px solid #e0e0e0;
  border-bottom: 1px solid #f0f0f0;
}

.major-total-row {
  border-top: 1px solid #90a4ae;
  border-bottom: 1px solid #90a4ae;
  background: #fcfdfe;
}

.grand-total-row {
  border-top: 1px solid #1a237e;
  border-bottom: 3px double #1a237e;
  background: #f5f7fa;
}

.tax-row {
  color: #d32f2f;
}

@media print {
  .print-hide {
    display: none !important;
  }
}
</style>
