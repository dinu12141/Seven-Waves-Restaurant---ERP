<template>
  <q-dialog
    :model-value="modelValue"
    :maximized="$q.screen.lt.md"
    transition-show="slide-up"
    transition-hide="slide-down"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @show="load"
  >
    <q-card class="ledger-statement-card column no-wrap">
      <!-- Header -->
      <q-card-section class="row items-start no-wrap q-pb-sm">
        <q-icon :name="accountId ? 'account_balance' : 'menu_book'" size="md" color="primary" class="q-mr-sm q-mt-xs" />
        <div class="col">
          <div class="text-overline text-grey-7">{{ accountId ? 'Account statement' : 'Ledger statement' }}</div>
          <div class="text-h6 text-weight-bold ellipsis-2-lines">
            <span v-if="subject.code" class="text-grey-7 q-mr-xs">{{ subject.code }}</span>{{ subject.name || title || '…' }}
          </div>
          <div v-if="subject.group" class="text-caption text-grey-7">{{ subject.group }}</div>
          <q-badge v-if="subject.is_deleted" color="grey-6" class="q-mt-xs">deleted</q-badge>
        </div>
        <q-btn flat round dense icon="close" @click="emit('update:modelValue', false)" />
      </q-card-section>

      <!-- Filters -->
      <q-card-section class="q-py-sm">
        <div class="row q-col-gutter-sm items-center">
          <div class="col-6 col-sm-3">
            <q-input v-model="dateFrom" type="date" label="From" outlined dense stack-label :disable="allTime" />
          </div>
          <div class="col-6 col-sm-3">
            <q-input v-model="dateTo" type="date" label="To" outlined dense stack-label :disable="allTime" />
          </div>
          <div class="col-12 col-sm-6 row items-center q-gutter-xs">
            <q-toggle v-model="allTime" label="All time" dense />
            <q-btn flat dense no-caps icon="refresh" label="Apply" color="primary" :loading="loading" @click="load" />
            <q-space />
            <q-btn flat dense no-caps icon="table_view" label="Excel" color="positive" :disable="!statement" @click="exportExcel" />
            <q-btn flat dense no-caps icon="print" label="Print" color="grey-8" :disable="!statement" @click="printStatement" />
          </div>
        </div>
      </q-card-section>

      <q-banner v-if="error" class="bg-red-1 text-red-9 q-mx-md" rounded dense>
        <template #avatar><q-icon name="error" color="negative" /></template>
        {{ error }}
      </q-banner>

      <q-banner v-if="statement && statement.has_drift" class="bg-orange-1 text-orange-10 q-mx-md q-mb-sm" rounded dense>
        <template #avatar><q-icon name="warning" color="orange-8" /></template>
        Stored balance <b>LKR {{ formatDrCr(statement.stored_current_balance) }}</b> differs from the balance recomputed
        from the posted entries <b>LKR {{ formatDrCr(statement.recomputed_balance) }}</b>
        (difference {{ formatDrCr(statement.drift) }}). The entries below are the source of truth.
      </q-banner>

      <!-- Body -->
      <q-card-section class="col q-pt-none statement-scroll">
        <div v-if="loading && !statement" class="flex flex-center q-pa-xl">
          <q-spinner size="lg" color="primary" />
        </div>
        <template v-else-if="statement">
          <!-- Desktop / tablet table -->
          <table v-if="$q.screen.gt.xs" class="ls-table">
            <thead>
              <tr>
                <th class="text-left">Date</th>
                <th class="text-left">Source</th>
                <th class="text-left">Reference</th>
                <th class="text-left">Description</th>
                <th class="text-right">Debit</th>
                <th class="text-right">Credit</th>
                <th class="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr class="ls-bf">
                <td>{{ statement.date_from || '' }}</td>
                <td colspan="3" class="text-weight-medium">Balance b/f{{ statement.date_from ? '' : ' (opening balance)' }}</td>
                <td></td>
                <td></td>
                <td class="text-right num">{{ formatDrCr(statement.opening) }}</td>
              </tr>
              <tr v-for="r in statement.rows" :key="r.id" :class="{ 'ls-reversal': r.is_reversal }">
                <td class="nowrap">{{ r.date }}</td>
                <td class="nowrap">{{ r.source_label }}</td>
                <td class="nowrap mono">{{ r.doc_ref }}</td>
                <td>{{ r.description }}</td>
                <td class="text-right num">{{ r.debit ? money(r.debit) : '' }}</td>
                <td class="text-right num">{{ r.credit ? money(r.credit) : '' }}</td>
                <td class="text-right num nowrap">{{ formatDrCr(r.running_balance) }}</td>
              </tr>
              <tr v-if="!statement.rows.length">
                <td colspan="7" class="text-center text-grey-6 text-italic q-pa-md">No entries in this period</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="ls-total">
                <td colspan="4" class="text-right">Totals</td>
                <td class="text-right num">{{ money(statement.totals.debit) }}</td>
                <td class="text-right num">{{ money(statement.totals.credit) }}</td>
                <td></td>
              </tr>
              <tr class="ls-closing">
                <td colspan="6" class="text-right">Closing balance c/f{{ statement.date_to ? ` (${statement.date_to})` : '' }}</td>
                <td class="text-right num nowrap">{{ formatDrCr(statement.closing) }}</td>
              </tr>
            </tfoot>
          </table>

          <!-- Phone: card list -->
          <q-list v-else separator dense>
            <q-item class="bg-grey-2">
              <q-item-section>Balance b/f</q-item-section>
              <q-item-section side class="text-weight-bold">{{ formatDrCr(statement.opening) }}</q-item-section>
            </q-item>
            <q-item v-for="r in statement.rows" :key="r.id" :class="{ 'ls-reversal': r.is_reversal }">
              <q-item-section>
                <q-item-label caption>{{ r.date }} · {{ r.source_label }} <span class="mono">{{ r.doc_ref }}</span></q-item-label>
                <q-item-label lines="2">{{ r.description }}</q-item-label>
              </q-item-section>
              <q-item-section side top>
                <q-item-label :class="r.debit ? 'text-blue-9' : 'text-green-9'">
                  {{ r.debit ? `Dr ${money(r.debit)}` : `Cr ${money(r.credit)}` }}
                </q-item-label>
                <q-item-label caption>{{ formatDrCr(r.running_balance) }}</q-item-label>
              </q-item-section>
            </q-item>
            <q-item v-if="!statement.rows.length">
              <q-item-section class="text-grey-6 text-italic">No entries in this period</q-item-section>
            </q-item>
            <q-item class="bg-grey-2">
              <q-item-section>Totals</q-item-section>
              <q-item-section side>Dr {{ money(statement.totals.debit) }} / Cr {{ money(statement.totals.credit) }}</q-item-section>
            </q-item>
            <q-item class="bg-grey-3">
              <q-item-section class="text-weight-bold">Closing balance c/f</q-item-section>
              <q-item-section side class="text-weight-bold">{{ formatDrCr(statement.closing) }}</q-item-section>
            </q-item>
          </q-list>
        </template>
      </q-card-section>

      <q-card-section v-if="statement" class="q-pt-none text-caption text-grey-6">
        {{ statement.rows.length }} entr{{ statement.rows.length === 1 ? 'y' : 'ies' }} · Positive balance = Dr, negative = Cr
        <span v-if="branchId"> · filtered to one branch</span>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useQuasar } from 'quasar'
import { financeLedgerStatementService } from '../services/finance-ledger-statement.service'
import { formatDrCr, statementToAoa } from '../services/finance-ledger-statement.builder'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  ledgerId: { type: String, default: null },
  accountId: { type: String, default: null },
  branchId: { type: String, default: null },
  title: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const $q = useQuasar()

function isoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function monthStart() {
  const d = new Date()
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1))
}

const dateFrom = ref(monthStart())
const dateTo = ref(isoDate(new Date()))
const allTime = ref(false)
const loading = ref(false)
const error = ref('')
const statement = ref(null)

const subject = computed(() => statement.value?.subject || {})

let seq = 0
async function load() {
  if (!props.ledgerId && !props.accountId) return
  const mySeq = ++seq
  loading.value = true
  error.value = ''
  try {
    const args = {
      dateFrom: allTime.value ? null : dateFrom.value || null,
      dateTo: allTime.value ? null : dateTo.value || null,
      branchId: props.branchId || null,
    }
    const res = props.accountId
      ? await financeLedgerStatementService.getAccountStatement({ accountId: props.accountId, ...args })
      : await financeLedgerStatementService.getLedgerStatement({ ledgerId: props.ledgerId, ...args })
    if (mySeq === seq) statement.value = res
  } catch (e) {
    if (mySeq === seq) {
      const msg = e?.message || String(e)
      error.value =
        e?.code === '42501' || /row-level security|permission denied/i.test(msg)
          ? 'You need finance or admin permission to view these entries.'
          : msg
      statement.value = null
    }
  } finally {
    if (mySeq === seq) loading.value = false
  }
}

// A new subject clears the old figures; the dialog's @show loads the new ones.
watch(
  () => [props.ledgerId, props.accountId],
  () => {
    statement.value = null
  },
)
watch(allTime, () => {
  if (props.modelValue) load()
})

function money(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fileBase() {
  const s = subject.value
  const name = `${s.code || ''}_${s.name || 'statement'}`.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '')
  return `${props.accountId ? 'Account' : 'Ledger'}_Statement_${name}`
}

async function exportExcel() {
  if (!statement.value) return
  try {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet(statementToAoa(statement.value))
    ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 48 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 6 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Statement')
    XLSX.writeFile(wb, `${fileBase()}_${isoDate(new Date())}.xlsx`)
  } catch (e) {
    $q.notify({ type: 'negative', message: `Export failed: ${e?.message || e}` })
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function printStatement() {
  const st = statement.value
  if (!st) return
  const s = st.subject || {}
  const period = st.date_from || st.date_to ? `${st.date_from || 'Beginning'} to ${st.date_to || 'Today'}` : 'All time'
  const rows = st.rows
    .map(
      (r) => `<tr${r.is_reversal ? ' class="rev"' : ''}><td>${esc(r.date)}</td><td>${esc(r.source_label)}</td><td>${esc(r.doc_ref)}</td>
      <td>${esc(r.description)}</td><td class="n">${r.debit ? money(r.debit) : ''}</td><td class="n">${r.credit ? money(r.credit) : ''}</td>
      <td class="n">${esc(formatDrCr(r.running_balance))}</td></tr>`,
    )
    .join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(fileBase())}</title>
<style>body{font-family:Arial,sans-serif;font-size:11px;margin:16px;color:#222}h1{font-size:16px;margin:0}h2{font-size:13px;margin:2px 0}
.meta{color:#555;margin-bottom:10px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:4px 6px;vertical-align:top}
th{background:#f2f4f7;text-align:left}.n{text-align:right;white-space:nowrap}.b td{font-weight:bold;background:#fafafa}
.rev td{color:#b71c1c}tfoot td{font-weight:bold;border-top:2px solid #333}@page{size:A4 landscape;margin:12mm}</style></head><body>
<h1>SEVEN WAVES RESTAURANT (PVT) LTD</h1><h2>${props.accountId ? 'Account' : 'Ledger'} Statement — ${esc(s.code || '')} ${esc(s.name || '')}</h2>
<div class="meta">${s.group ? `${esc(s.group)} · ` : ''}Period: ${esc(period)}${props.branchId ? ' · single branch' : ''} · Printed ${esc(new Date().toLocaleString())}</div>
<table><thead><tr><th>Date</th><th>Source</th><th>Reference</th><th>Description</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Balance</th></tr></thead>
<tbody><tr class="b"><td>${esc(st.date_from || '')}</td><td colspan="5">Balance b/f</td><td class="n">${esc(formatDrCr(st.opening))}</td></tr>${rows}</tbody>
<tfoot><tr><td colspan="4" class="n">Totals</td><td class="n">${money(st.totals.debit)}</td><td class="n">${money(st.totals.credit)}</td><td></td></tr>
<tr><td colspan="6" class="n">Closing balance c/f</td><td class="n">${esc(formatDrCr(st.closing))}</td></tr></tfoot></table>
<script>window.onload=function(){window.print()}</scr` + `ipt></body></html>`
  const w = window.open('', '_blank')
  if (!w) {
    $q.notify({ type: 'warning', message: 'Allow pop-ups to print the statement' })
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
}
</script>

<style scoped>
.ledger-statement-card {
  width: 1100px;
  max-width: 96vw;
  max-height: 92vh;
}
.q-dialog__inner--maximized .ledger-statement-card {
  max-width: 100vw;
  max-height: 100vh;
}
.statement-scroll {
  overflow: auto;
  min-height: 200px;
}
.ls-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.ls-table th {
  position: sticky;
  top: 0;
  background: #f2f4f7;
  padding: 6px 8px;
  font-weight: 600;
  z-index: 1;
}
.ls-table td {
  padding: 5px 8px;
  border-bottom: 1px solid #eceff1;
  vertical-align: top;
}
.ls-bf td {
  background: #fafbfc;
}
.ls-total td,
.ls-closing td {
  font-weight: 700;
  border-top: 1px solid #90a4ae;
}
.ls-closing td {
  border-bottom: 3px double #1a237e;
}
.ls-reversal {
  color: #b71c1c;
}
.num {
  font-variant-numeric: tabular-nums;
}
.nowrap {
  white-space: nowrap;
}
.mono {
  font-family: monospace;
  font-size: 0.8rem;
}
body.body--dark .ls-table th {
  background: #263238;
}
body.body--dark .ls-bf td {
  background: transparent;
}
</style>
