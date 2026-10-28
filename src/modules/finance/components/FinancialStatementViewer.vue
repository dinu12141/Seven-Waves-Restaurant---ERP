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
        @click="$emit('download-excel', { hideZero })"
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
        @click="$emit('download-pdf', { hideZero })"
      >
        <q-tooltip>Download formatted corporate PDF document (.pdf)</q-tooltip>
      </q-btn>
    </div>

    <q-separator class="q-mb-md" />

    <!-- STATEMENT BODY — rendered generically from report.layout so every
         account_group gets its own heading, ledger lines and subtotal -->
    <div v-if="report.layout" class="statement-body">
      <div class="row items-center justify-between q-mb-sm print-hide">
        <q-toggle v-model="hideZero" dense size="sm" label="Hide zero-balance ledgers" />
        <q-badge
          v-if="report.type === 'bs'"
          :color="report.is_balanced ? 'positive' : 'negative'"
          class="q-pa-sm text-weight-bold"
        >
          <q-icon :name="report.is_balanced ? 'check_circle' : 'error'" size="xs" class="q-mr-xs" />
          {{ report.is_balanced ? 'BALANCED' : `UNBALANCED — difference LKR ${formatMoney(report.difference)}` }}
        </q-badge>
      </div>

      <template v-for="(block, bi) in report.layout" :key="`${block.kind}-${bi}`">
        <div v-if="block.kind === 'heading'" class="category-header">{{ block.label }}</div>

        <template v-else-if="block.kind === 'section'">
          <div class="section-title q-mt-md">{{ block.section.label }}</div>
          <table class="statement-table">
            <tbody>
              <template v-for="group in block.section.groups" :key="group.key">
                <tr v-if="showGroupHeading(block.section, group)" class="group-row">
                  <td class="col-code"></td>
                  <td class="col-name group-title" colspan="3">
                    {{ group.label }}
                    <q-badge v-if="group.status === 'unknown'" color="orange-8" class="q-ml-sm print-hide">new category</q-badge>
                    <q-badge v-else-if="group.status === 'unclassified'" color="negative" class="q-ml-sm print-hide">needs a category</q-badge>
                  </td>
                </tr>
                <tr
                  v-for="item in visibleItems(group)"
                  :key="item.id"
                  :class="[rowClass(item), { 'drillable-row': isDrillable(item) }]"
                  @click="openLedger(item)"
                >
                  <td class="col-code">{{ item.code }}</td>
                  <td class="col-name" :class="indentClass(block.section, group, item)">
                    <span v-if="item.is_contra && item.kind === 'ledger'" class="text-grey-7">Less: </span>{{ item.name }}
                    <q-badge v-if="item.is_inactive" color="grey-6" class="q-ml-xs print-hide">inactive</q-badge>
                  </td>
                  <td class="col-amount" :class="{ 'text-weight-bold': item.kind === 'header_total' }">
                    {{ item.kind === 'header' ? '' : formatMoney(item.amount) }}
                  </td>
                  <td class="col-subtotal"></td>
                </tr>
                <tr v-if="!group.items.length" class="empty-row">
                  <td></td>
                  <td class="col-name indent-2 text-grey-5 text-italic">No ledgers in this category</td>
                  <td class="col-amount">-</td>
                  <td></td>
                </tr>
                <tr v-if="showGroupHeading(block.section, group)" class="group-subtotal-row">
                  <td></td>
                  <td class="col-name indent">Total {{ group.label }}</td>
                  <td class="col-amount text-weight-bold">{{ formatMoney(group.total) }}</td>
                  <td></td>
                </tr>
              </template>
              <tr class="subtotal-row">
                <td></td>
                <td class="text-weight-bold">{{ block.section.total_label }}</td>
                <td></td>
                <td class="col-subtotal text-weight-bold">{{ formatMoney(block.section.total) }}</td>
              </tr>
            </tbody>
          </table>
        </template>

        <table v-else-if="block.kind === 'subtotal'" class="statement-table">
          <tbody>
            <tr :class="block.level === 'grand' ? 'grand-total-row' : 'major-total-row'">
              <td class="col-code"></td>
              <td class="text-weight-bolder" :class="block.level === 'grand' ? 'text-h6 text-primary' : ''">
                {{ block.label }}
              </td>
              <td class="col-amount"></td>
              <td
                class="col-subtotal text-weight-bolder"
                :class="[block.level === 'grand' ? 'text-h6' : '', block.amount < 0 ? 'text-red-8' : 'text-green-8']"
              >
                LKR {{ formatMoney(block.amount) }}
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- Balance check + diagnostics -->
      <div class="q-mt-md">
        <template v-if="report.type === 'bs'">
          <q-banner v-if="report.is_balanced" rounded class="bg-green-1 text-green-9 text-weight-medium">
            <q-icon name="check_circle" color="positive" size="sm" class="q-mr-xs" />
            Statement of Financial Position is balanced (Assets = Equity + Liabilities)
          </q-banner>
          <q-banner v-else rounded class="bg-red-1 text-red-9 text-weight-medium">
            <q-icon name="error" color="negative" size="sm" class="q-mr-xs" />
            NOT balanced — Total Assets LKR {{ formatMoney(report.total_assets) }} vs Total Equity and Liabilities
            LKR {{ formatMoney(report.total_equity_liabilities) }} (difference LKR {{ formatMoney(report.difference) }}).
            See the statement checks below.
          </q-banner>
        </template>

        <q-expansion-item
          v-if="report.warnings && report.warnings.length"
          dense
          class="q-mt-sm print-hide warnings-panel"
          icon="rule"
          :label="`Statement checks (${report.warnings.length})`"
          :default-opened="report.warnings.some((w) => w.level === 'error')"
        >
          <q-list dense separator>
            <q-item v-for="(w, wi) in report.warnings" :key="wi">
              <q-item-section avatar>
                <q-icon :name="warningIcon(w.level)" :color="warningColor(w.level)" size="xs" />
              </q-item-section>
              <q-item-section class="text-caption">{{ w.message }}</q-item-section>
            </q-item>
          </q-list>
        </q-expansion-item>
      </div>
    </div>

    <LedgerStatementDialog v-model="showStatement" :ledger-id="statementLedgerId" />

    <!-- Timestamp footer -->
    <div class="text-caption text-grey-5 q-mt-lg text-right">
      Generated: {{ new Date(report.generated_at).toLocaleString() }} | Seven Waves ERP
    </div>
  </q-card>
</template>

<script setup>
import { ref } from 'vue'
import { visibleStatementItems, showStatementGroupHeading } from '../services/finance-statements.builder'
import LedgerStatementDialog from './LedgerStatementDialog.vue'

defineProps({
  report: {
    type: Object,
    default: () => ({}),
  },
})

defineEmits(['download-excel', 'download-pdf'])

// Hides ledger lines with a zero balance; category headings and totals stay.
const hideZero = ref(false)

// Ledger lines carry the finance_ledgers id — click one to see its entries.
// Synthetic lines (retained earnings b/f, profit for the period) have no ledger.
const showStatement = ref(false)
const statementLedgerId = ref(null)

function isDrillable(item) {
  return (item.kind === 'ledger' || item.kind === 'header') && !item.synthetic && !!item.id
}

function openLedger(item) {
  if (!isDrillable(item)) return
  statementLedgerId.value = item.id
  showStatement.value = true
}

function visibleItems(group) {
  return visibleStatementItems(group, hideZero.value)
}

function showGroupHeading(section, group) {
  return showStatementGroupHeading(section, group)
}

function indentClass(section, group, item) {
  const depth = (showGroupHeading(section, group) ? 1 : 0) + (item.depth || 0)
  return depth >= 2 ? 'indent-3' : depth === 1 ? 'indent-2' : 'indent'
}

function rowClass(item) {
  if (item.kind === 'header') return 'header-ledger-row'
  if (item.kind === 'header_total') return 'header-total-row'
  return item.synthetic ? 'synthetic-row' : ''
}

function warningIcon(level) {
  return level === 'error' ? 'error' : level === 'warning' ? 'warning' : 'info'
}

function warningColor(level) {
  return level === 'error' ? 'negative' : level === 'warning' ? 'orange-8' : 'blue-grey-6'
}

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
  padding-left: 34px !important;
}

.indent-3 {
  padding-left: 50px !important;
}

.group-title {
  font-weight: 700;
  color: #37474f;
  padding-left: 18px !important;
  padding-top: 8px !important;
}

.group-subtotal-row td {
  border-top: 1px dashed #cfd8dc;
  font-weight: 600;
  color: #37474f;
}

.header-ledger-row td {
  font-weight: 600;
  color: #37474f;
}

.header-total-row td {
  color: #546e7a;
  font-style: italic;
}

.synthetic-row td {
  font-style: italic;
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

.drillable-row {
  cursor: pointer;
}

.drillable-row:hover td {
  background: #f1f5fb;
}

@media print {
  .print-hide {
    display: none !important;
  }
}
</style>
