<template>
  <div ref="reportRef" class="shift-close-report">
    <div class="report-header">
      <div class="report-title">SHIFT CLOSE REPORT</div>
      <div class="report-subtitle">Seven Waves Restaurant</div>
      <div class="report-line"></div>
    </div>

    <div class="report-info">
      <div class="info-pair">
        <span>Terminal:</span>
        <span>{{ report.terminal_id }}</span>
      </div>
      <div class="info-pair">
        <span>Cashier:</span>
        <span>{{ cashierName }}</span>
      </div>
      <div class="info-pair">
        <span>Opened:</span>
        <span>{{ formatDate(report.opened_at) }}</span>
      </div>
      <div class="info-pair">
        <span>Closed:</span>
        <span>{{ formatDate(report.closed_at) }}</span>
      </div>
    </div>

    <div class="report-divider">================================</div>

    <div class="report-section">
      <div class="section-title">SALES SUMMARY</div>
      <div class="item-row">
        <span>Cash Sales</span>
        <span>{{ fmtNum(report.cash_sales_total) }}</span>
      </div>
      <div class="item-row">
        <span>Card Sales</span>
        <span>{{ fmtNum(report.card_sales_total) }}</span>
      </div>
      <div class="item-row">
        <span>QR Sales</span>
        <span>{{ fmtNum(report.qr_sales_total) }}</span>
      </div>
      <div class="item-row">
        <span>Bank Transfer</span>
        <span>{{ fmtNum(report.bank_sales_total) }}</span>
      </div>
      <div class="item-row">
        <span>Credit Sales</span>
        <span>{{ fmtNum(report.credit_sales_total) }}</span>
      </div>
      <div class="report-divider">--------------------------------</div>
      <div class="item-row total-row">
        <span>TOTAL SALES</span>
        <span>{{ fmtNum(totalSales) }}</span>
      </div>
    </div>

    <div class="report-divider">================================</div>

    <div class="report-section">
      <div class="section-title">CASH RECONCILIATION</div>
      <div class="item-row">
        <span>Opening Float</span>
        <span>{{ fmtNum(report.opening_cash_float) }}</span>
      </div>
      <div class="item-row">
        <span>(+) Cash Sales</span>
        <span>{{ fmtNum(report.cash_sales_total) }}</span>
      </div>
      <div class="item-row">
        <span>(-) Cash Drops</span>
        <span>{{ fmtNum(report.cash_drops_total) }}</span>
      </div>
      <div class="item-row">
        <span>(+) Cash In</span>
        <span>{{ fmtNum(report.cash_in_total) }}</span>
      </div>
      <div class="item-row">
        <span>(-) Cash Out</span>
        <span>{{ fmtNum(report.cash_out_total) }}</span>
      </div>
      <div class="report-divider">--------------------------------</div>
      <div class="item-row total-row">
        <span>EXPECTED CASH</span>
        <span>{{ fmtNum(report.expected_cash) }}</span>
      </div>
      <div class="item-row total-row">
        <span>COUNTED CASH</span>
        <span>{{ fmtNum(report.counted_cash) }}</span>
      </div>
      <div class="report-divider">--------------------------------</div>
      <div class="item-row variance-row" :class="varianceClass">
        <span>VARIANCE</span>
        <span>{{ variancePrefix }}{{ fmtNum(Math.abs(report.variance || 0)) }}</span>
      </div>
    </div>

    <div v-if="report.approved_by" class="report-section q-mt-sm">
      <div class="report-divider">================================</div>
      <div class="section-title">MANAGER APPROVAL</div>
      <div class="item-row">
        <span>Approved At:</span>
        <span>{{ formatDate(report.approved_at) }}</span>
      </div>
      <div v-if="report.approval_note" class="item-row">
        <span>Note:</span>
        <span>{{ report.approval_note }}</span>
      </div>
    </div>

    <div v-if="report.closing_note" class="report-section q-mt-sm">
      <div class="report-divider">--------------------------------</div>
      <div class="item-row">
        <span>Note:</span>
        <span>{{ report.closing_note }}</span>
      </div>
    </div>

    <div class="report-divider">================================</div>
    <div class="report-footer">
      <div>*** END OF SHIFT REPORT ***</div>
      <div>{{ formatDate(new Date()) }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  report: {
    type: Object,
    required: true,
  },
  cashierName: {
    type: String,
    default: 'Cashier',
  },
})

const reportRef = ref(null)

const totalSales = computed(() => {
  const r = props.report
  return (r.cash_sales_total || 0)
    + (r.card_sales_total || 0)
    + (r.qr_sales_total || 0)
    + (r.bank_sales_total || 0)
    + (r.credit_sales_total || 0)
})

const varianceClass = computed(() => {
  const v = props.report.variance || 0
  if (v === 0) return 'var-balanced'
  if (v < 0) return 'var-shortage'
  return 'var-overage'
})

const variancePrefix = computed(() => {
  const v = props.report.variance || 0
  if (v > 0) return '+'
  if (v < 0) return '-'
  return ''
})

function printReport() {
  if (!reportRef.value) return
  const printWindow = window.open('', '_blank', 'width=300,height=600')
  if (!printWindow) return

  printWindow.document.write(`
    <html>
      <head>
        <title>Shift Close Report</title>
        <style>
          body { font-family: 'Courier New', monospace; font-size: 12px; padding: 8px; margin: 0; }
          .shift-close-report { width: 280px; }
          .report-header { text-align: center; margin-bottom: 8px; }
          .report-title { font-size: 14px; font-weight: bold; }
          .report-subtitle { font-size: 11px; }
          .report-line { border-top: 1px dashed #000; margin: 4px 0; }
          .info-pair { display: flex; justify-content: space-between; font-size: 11px; }
          .report-divider { text-align: center; font-size: 11px; margin: 4px 0; }
          .section-title { font-weight: bold; text-align: center; margin: 4px 0; }
          .item-row { display: flex; justify-content: space-between; font-size: 11px; padding: 1px 0; }
          .total-row { font-weight: bold; font-size: 12px; }
          .variance-row { font-weight: bold; font-size: 13px; }
          .var-shortage { color: red; }
          .var-overage { color: orange; }
          .report-footer { text-align: center; font-size: 10px; margin-top: 8px; }
        </style>
      </head>
      <body>${reportRef.value.innerHTML}</body>
    </html>
  `)
  printWindow.document.close()
  printWindow.print()
}

defineExpose({ printReport })

function fmtNum(val) {
  return parseFloat(val || 0).toFixed(2)
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
</script>

<style scoped>
.shift-close-report {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #000;
  background: #fff;
  width: 280px;
  padding: 8px;
  /* Hidden on screen; used for print */
  position: absolute;
  left: -9999px;
}

.report-header {
  text-align: center;
  margin-bottom: 8px;
}

.report-title {
  font-size: 14px;
  font-weight: bold;
}

.report-subtitle {
  font-size: 11px;
}

.report-line {
  border-top: 1px dashed #000;
  margin: 4px 0;
}

.report-info {
  margin-bottom: 4px;
}

.info-pair {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
}

.report-divider {
  text-align: center;
  font-size: 11px;
  margin: 4px 0;
}

.report-section {
  margin-bottom: 4px;
}

.section-title {
  font-weight: bold;
  text-align: center;
  margin: 4px 0;
}

.item-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  padding: 1px 0;
}

.total-row {
  font-weight: bold;
  font-size: 12px;
}

.variance-row {
  font-weight: bold;
  font-size: 13px;
}

.var-shortage {
  color: red;
}

.var-overage {
  color: orange;
}

.var-balanced {
  color: green;
}

.report-footer {
  text-align: center;
  font-size: 10px;
  margin-top: 8px;
}
</style>
