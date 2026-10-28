<template>
  <div>
    <!-- Per-ledger summary: b/f, receipts, payments, c/f (+ drift vs stored balance) -->
    <q-table v-if="summary.length" flat bordered dense :rows="summary" :columns="summaryColumns" row-key="ledger_id"
      :pagination="{ rowsPerPage: 0 }" hide-pagination class="q-mb-md">
      <template v-slot:top>
        <div class="text-subtitle1 text-weight-bold"><q-icon name="account_balance_wallet" class="q-mr-sm" />{{ title }} — ledger balances</div>
      </template>
      <template v-slot:body-cell-closing="p">
        <q-td :props="p" class="text-weight-bold">
          {{ fmtDrCr(p.value) }}
          <q-icon v-if="p.row.has_drift" name="warning" color="orange" size="16px" class="q-ml-xs">
            <q-tooltip>GL entries give {{ fmtDrCr(p.row.recomputed_balance) }} but the stored ledger balance is {{ fmtDrCr(p.row.stored_current_balance) }} (drift {{ fmt(p.row.drift) }}).</q-tooltip>
          </q-icon>
        </q-td>
      </template>
      <template v-slot:bottom-row>
        <q-tr class="text-weight-bold">
          <q-td>Total</q-td>
          <q-td class="text-right">{{ fmtDrCr(totals.opening) }}</q-td>
          <q-td class="text-right text-green-8">{{ fmt(totals.debit) }}</q-td>
          <q-td class="text-right text-red-8">{{ fmt(totals.credit) }}</q-td>
          <q-td class="text-right">{{ fmtDrCr(totals.closing) }}</q-td>
        </q-tr>
      </template>
    </q-table>

    <q-table flat bordered dense :rows="rows" :columns="columns" row-key="key" :loading="loading"
      v-model:pagination="pagination" :rows-per-page-options="[25, 50, 100, 250, 0]" class="finance-cashbook-table"
      no-data-label="No cash / bank movements for the selected filters">
      <template v-slot:top>
        <div class="text-h6 q-mr-md"><q-icon name="book" class="q-mr-sm" />{{ title }}</div>
        <q-space />
        <div class="text-subtitle2 q-mr-md">
          <span class="text-green-8">Receipts (Dr): LKR {{ fmt(totals.shown_debit) }}</span> |
          <span class="text-red-8">Payments (Cr): LKR {{ fmt(totals.shown_credit) }}</span> |
          <strong>Closing: LKR {{ fmtDrCr(totals.closing) }}</strong>
        </div>
      </template>
      <template v-slot:body="p">
        <q-tr :props="p" :class="p.row.kind === 'opening' ? 'bg-blue-grey-1 text-blue-grey-10 text-weight-bold' : ''">
          <q-td key="date" :props="p">{{ p.row.date }}</q-td>
          <q-td key="ledger" :props="p">{{ p.row.ledger_code }} — {{ p.row.ledger_name }}</q-td>
          <q-td key="source" :props="p">
            <q-badge v-if="p.row.kind === 'entry'" :color="sourceColor(p.row.source_type)">{{ p.row.source_label }}</q-badge>
          </q-td>
          <q-td key="doc_ref" :props="p">{{ p.row.doc_ref }}</q-td>
          <q-td key="description" :props="p" style="white-space: normal">
            {{ p.row.description }}
            <q-badge v-if="p.row.is_reversal" color="grey" class="q-ml-xs">reversal</q-badge>
          </q-td>
          <q-td key="debit" :props="p" class="text-green-8 text-weight-bold">{{ p.row.debit > 0 ? fmt(p.row.debit) : '' }}</q-td>
          <q-td key="credit" :props="p" class="text-red-8 text-weight-bold">{{ p.row.credit > 0 ? fmt(p.row.credit) : '' }}</q-td>
          <q-td key="running_balance" :props="p" class="text-weight-bold">{{ fmtDrCr(p.row.running_balance) }}</q-td>
        </q-tr>
      </template>
    </q-table>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { formatDrCr } from '../services/finance-ledger-statement.builder'

const props = defineProps({
  report: { type: Object, default: null },
  loading: Boolean,
  title: { type: String, default: 'Cashbook' },
})

const pagination = ref({ rowsPerPage: 50 })

const rows = computed(() => props.report?.rows || [])
const summary = computed(() => props.report?.ledgers || [])
const totals = computed(() => props.report?.totals || { opening: 0, debit: 0, credit: 0, closing: 0, shown_debit: 0, shown_credit: 0 })

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDrCr = (v) => formatDrCr(v)

const summaryColumns = [
  { name: 'ledger', label: 'Ledger', field: (r) => `${r.ledger_code} — ${r.ledger_name}`, align: 'left' },
  { name: 'opening', label: 'Balance b/f', field: 'opening', align: 'right', format: fmtDrCr },
  { name: 'debit', label: 'Receipts (Dr)', field: 'debit', align: 'right', format: fmt },
  { name: 'credit', label: 'Payments (Cr)', field: 'credit', align: 'right', format: fmt },
  { name: 'closing', label: 'Balance c/f', field: 'closing', align: 'right' },
]

// Rows are already ordered ledger → date with a b/f row per ledger, and each
// running balance is that ledger's own — so column sorting is disabled.
const columns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left' },
  { name: 'ledger', label: 'Ledger', field: (r) => `${r.ledger_code} — ${r.ledger_name}`, align: 'left' },
  { name: 'source', label: 'Source', field: 'source_label', align: 'left' },
  { name: 'doc_ref', label: 'Reference', field: 'doc_ref', align: 'left' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'debit', label: 'Receipts (Dr)', field: 'debit', align: 'right' },
  { name: 'credit', label: 'Payments (Cr)', field: 'credit', align: 'right' },
  { name: 'running_balance', label: 'Balance', field: 'running_balance', align: 'right' },
]

function sourceColor(type) {
  const map = {
    pos_sale: 'green', pos_refund: 'deep-orange', pos_payout: 'orange', pos_shift: 'amber-9',
    pay_voucher: 'red', received_voucher: 'blue', ar_receipt: 'indigo', supplier_payment: 'purple',
    payroll: 'teal', salary_advance: 'cyan-8', purchase_return: 'brown', cheque_bounced: 'negative',
    manual_adjustment: 'grey-8',
  }
  return map[type] || 'grey'
}
</script>
