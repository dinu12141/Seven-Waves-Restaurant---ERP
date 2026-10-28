<template>
  <q-dialog v-model="visible" persistent maximized transition-show="slide-up" transition-hide="slide-down">
    <q-card class="column full-height" :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-grey-1'">
      <!-- ── TOP BAR ────────────────────────────────────────────────────────── -->
      <div class="recon-header q-px-lg q-py-sm row items-center justify-between shadow-1">
        <div class="row items-center q-gutter-x-md">
          <q-btn flat round dense icon="arrow_back" color="white" @click="close">
            <q-tooltip>Back to list</q-tooltip>
          </q-btn>
          <div>
            <div class="row items-center q-gutter-x-sm">
              <span class="text-h6 text-weight-bolder text-white">
                {{ recon?.bank_account?.bank_name || 'Bank' }} — {{ recon?.bank_account?.registered_name || 'Account' }}
              </span>
              <q-badge :color="statusColor(recon?.status)" text-color="white" class="text-uppercase text-weight-bold q-px-sm">
                {{ recon?.status }}
              </q-badge>
            </div>
            <div class="text-caption text-purple-2">
              Period: {{ recon?.statement_start_date }} to {{ recon?.statement_end_date }} ({{ recon?.reconciliation_month }}) | Acc: {{ recon?.bank_account?.account_number || 'N/A' }}
            </div>
          </div>
        </div>

        <!-- Header Actions -->
        <div class="row items-center q-gutter-x-sm">
          <q-btn
            outline
            color="white"
            icon="sync"
            label="Pull Latest Transactions"
            no-caps
            dense
            class="q-px-sm"
            :loading="reconStore.saving"
            @click="handleSyncTransactions"
            v-if="recon?.status === 'draft'"
          >
            <q-tooltip>Scan for newly created vouchers or cheques in this date range</q-tooltip>
          </q-btn>

          <q-btn
            outline
            color="white"
            icon="note_add"
            label="Add Adjustment"
            no-caps
            dense
            class="q-px-sm"
            @click="showAdjustmentDialog = true"
            v-if="recon?.status === 'draft'"
          >
            <q-tooltip>Record bank charge, fee, or interest from statement</q-tooltip>
          </q-btn>

          <q-btn
            outline
            color="white"
            icon="print"
            label="BRS Report"
            no-caps
            dense
            class="q-px-sm"
            @click="showBrsModal = true"
          />

          <!-- Approve Button -->
          <q-btn
            unelevated
            color="positive"
            icon="check_circle"
            label="Approve Reconciliation"
            no-caps
            dense
            class="q-px-md text-weight-bold"
            :disable="!isBalanced"
            :loading="reconStore.saving"
            @click="handleApprove"
            v-if="recon?.status === 'reconciled'"
          />

          <!-- Lock Button -->
          <q-btn
            unelevated
            color="blue-grey-9"
            icon="lock"
            label="Lock"
            no-caps
            dense
            class="q-px-sm"
            :loading="reconStore.saving"
            @click="handleLock"
            v-if="recon?.status === 'approved'"
          />

          <!-- Reopen Button -->
          <q-btn
            flat
            color="amber-4"
            icon="lock_open"
            label="Reopen to Draft"
            no-caps
            dense
            class="q-px-sm"
            :loading="reconStore.saving"
            @click="promptReopen"
            v-if="recon?.status === 'reconciled' || recon?.status === 'approved'"
          />

          <q-btn flat round dense icon="close" color="white" @click="close" />
        </div>
      </div>

      <!-- ── KPI METRICS CARDS STRIP ────────────────────────────────────────── -->
      <div class="q-px-lg q-pt-md q-pb-sm">
        <div class="row q-col-gutter-sm">
          <!-- 1. Statement Opening -->
          <div class="col-12 col-sm-6 col-md-2">
            <q-card flat bordered class="recon-kpi">
              <div class="text-caption text-grey-6 text-uppercase text-weight-bold">Statement Opening</div>
              <div class="text-h6 text-weight-bold text-dark q-mt-xs">
                LKR {{ fmt(recon?.opening_bank_balance) }}
              </div>
              <div class="text-caption text-grey-5">Bank starting balance</div>
            </q-card>
          </div>

          <!-- 2. Cleared Deposits -->
          <div class="col-12 col-sm-6 col-md-2">
            <q-card flat bordered class="recon-kpi">
              <div class="text-caption text-positive text-uppercase text-weight-bold">
                <q-icon name="arrow_downward" size="14px" /> Cleared Deposits (+)
              </div>
              <div class="text-h6 text-weight-bold text-positive q-mt-xs">
                LKR {{ fmt(reconStore.matchedCreditsTotal) }}
              </div>
              <div class="text-caption text-grey-5">{{ matchedCreditCount }} item(s) cleared</div>
            </q-card>
          </div>

          <!-- 3. Cleared Payments / Cheques -->
          <div class="col-12 col-sm-6 col-md-2">
            <q-card flat bordered class="recon-kpi">
              <div class="text-caption text-orange-9 text-uppercase text-weight-bold">
                <q-icon name="arrow_upward" size="14px" /> Cleared Payments (-)
              </div>
              <div class="text-h6 text-weight-bold text-orange-9 q-mt-xs">
                LKR {{ fmt(reconStore.matchedDebitsTotal) }}
              </div>
              <div class="text-caption text-grey-5">{{ matchedDebitCount }} item(s) cleared</div>
            </q-card>
          </div>

          <!-- 4. Calculated System Cleared Balance -->
          <div class="col-12 col-sm-6 col-md-2">
            <q-card flat bordered class="recon-kpi bg-purple-1 text-purple-10">
              <div class="text-caption text-deep-purple text-uppercase text-weight-bold">Calculated Balance</div>
              <div class="text-h6 text-weight-bold text-deep-purple q-mt-xs">
                LKR {{ fmt(recon?.system_balance) }}
              </div>
              <div class="text-caption text-grey-6">Opening + Dep - Pmt</div>
            </q-card>
          </div>

          <!-- 5. Statement Closing -->
          <div class="col-12 col-sm-6 col-md-2">
            <q-card flat bordered class="recon-kpi">
              <div class="text-caption text-grey-6 text-uppercase text-weight-bold">Statement Closing</div>
              <div class="text-h6 text-weight-bold text-dark q-mt-xs">
                LKR {{ fmt(recon?.closing_bank_balance) }}
              </div>
              <div class="text-caption text-grey-5">As per bank document</div>
            </q-card>
          </div>

          <!-- 6. Difference Box -->
          <div class="col-12 col-sm-6 col-md-2">
            <q-card
              flat
              bordered
              class="recon-kpi"
              :class="isBalanced ? 'bg-green-1 text-positive border-positive' : 'bg-red-1 text-negative border-negative'"
            >
              <div class="text-caption text-uppercase text-weight-bold">
                {{ isBalanced ? '✓ RECONCILED' : 'VARIANCE / DIFFERENCE' }}
              </div>
              <div class="text-h6 text-weight-bolder q-mt-xs">
                {{ isBalanced ? 'LKR 0.00' : 'LKR ' + fmt(recon?.difference_amount) }}
              </div>
              <div class="text-caption">
                {{ isBalanced ? 'Books match bank statement!' : 'Unresolved difference' }}
              </div>
            </q-card>
          </div>
        </div>

        <!-- Outstanding summary banner -->
        <div class="row items-center justify-between q-mt-sm bg-blue-grey-1 q-px-md q-py-xs rounded-borders text-caption text-blue-grey-9">
          <div class="row items-center q-gutter-x-md">
            <span>
              <strong>Unpresented Cheques / Uncleared Payments:</strong>
              {{ reconStore.unpresentedChequesCount }} item(s) = LKR {{ fmt(reconStore.unpresentedChequesTotal) }}
            </span>
            <span>|</span>
            <span>
              <strong>Deposits in Transit / Uncleared Inflow:</strong>
              {{ reconStore.unclearedDepositsCount }} item(s) = LKR {{ fmt(reconStore.unclearedDepositsTotal) }}
            </span>
          </div>
          <div class="row items-center q-gutter-x-sm">
            <q-btn
              v-if="recon?.status === 'draft'"
              flat
              dense
              no-caps
              size="sm"
              color="deep-purple"
              label="Clear All"
              icon="done_all"
              @click="reconStore.matchAll(recon.id, true)"
            />
            <q-btn
              v-if="recon?.status === 'draft'"
              flat
              dense
              no-caps
              size="sm"
              color="grey-7"
              label="Unclear All"
              icon="remove_done"
              @click="reconStore.matchAll(recon.id, false)"
            />
          </div>
        </div>
      </div>

      <!-- ── FILTER BAR & SEARCH ────────────────────────────────────────────── -->
      <div class="q-px-lg q-pt-sm q-pb-xs row items-center justify-between">
        <!-- Tabs -->
        <q-btn-toggle
          v-model="reconStore.activeLineFilter"
          no-caps
          rounded
          unelevated
          toggle-color="deep-purple"
          toggle-text-color="white"
          color="white"
          text-color="grey-8"
          :options="[
            { label: `All (${reconStore.currentLines.length})`, value: 'all' },
            { label: `Payments / Cheques (${debitsCount})`, value: 'debit' },
            { label: `Deposits (${creditsCount})`, value: 'credit' },
            { label: `Cleared (${matchedCount})`, value: 'matched' },
            { label: `Outstanding (${unmatchedCount})`, value: 'unmatched' },
          ]"
        />

        <!-- Search -->
        <div class="row items-center q-gutter-x-sm" style="min-width: 300px;">
          <q-input
            v-model="reconStore.searchQuery"
            outlined
            dense
            placeholder="Search by reference, payee, amount..."
            clearable
            :dark="$q.dark.isActive"
            class="col"
          >
            <template v-slot:prepend>
              <q-icon name="search" size="18px" />
            </template>
          </q-input>
        </div>
      </div>

      <!-- ── LINES DATA TABLE ───────────────────────────────────────────────── -->
      <div class="col q-px-lg q-pb-md" style="min-height: 0;">
        <q-table
          flat
          bordered
          class="full-height recon-table shadow-sm"
          :rows="reconStore.filteredLines"
          :columns="columns"
          row-key="id"
          :loading="reconStore.loading"
          :pagination="{ rowsPerPage: 50 }"
          virtual-scroll
        >
          <!-- Cleared Toggle / Checkbox Column -->
          <template v-slot:body-cell-is_matched="p">
            <q-td :props="p" class="text-center">
              <q-toggle
                v-model="p.row.is_matched"
                color="positive"
                :disable="recon?.status !== 'draft'"
                @update:model-value="(val) => onToggleLine(p.row.id, val)"
              >
                <q-tooltip>{{ p.row.is_matched ? 'Mark as Outstanding' : 'Mark as Cleared' }}</q-tooltip>
              </q-toggle>
            </q-td>
          </template>

          <!-- Source Type Badge -->
          <template v-slot:body-cell-source_type="p">
            <q-td :props="p">
              <q-badge :color="typeBadgeColor(p.value)" text-color="white" class="text-capitalize q-px-sm">
                <q-icon :name="typeIcon(p.value)" size="12px" class="q-mr-xs" />
                {{ formatSourceType(p.value) }}
              </q-badge>
            </q-td>
          </template>

          <!-- Debit / Payment Out Column -->
          <template v-slot:body-cell-debit_amount="p">
            <q-td :props="p" class="text-right">
              <span v-if="Number(p.value) > 0" class="text-weight-bold text-orange-9">
                LKR {{ fmt(p.value) }}
              </span>
              <span v-else class="text-grey-4">—</span>
            </q-td>
          </template>

          <!-- Credit / Deposit In Column -->
          <template v-slot:body-cell-credit_amount="p">
            <q-td :props="p" class="text-right">
              <span v-if="Number(p.value) > 0" class="text-weight-bold text-positive">
                LKR {{ fmt(p.value) }}
              </span>
              <span v-else class="text-grey-4">—</span>
            </q-td>
          </template>

          <!-- Actions / Delete -->
          <template v-slot:body-cell-actions="p">
            <q-td :props="p" class="text-center">
              <q-btn
                v-if="!p.row.source_id && recon?.status === 'draft'"
                flat
                round
                dense
                size="sm"
                icon="delete"
                color="negative"
                @click="onDeleteLine(p.row.id)"
              >
                <q-tooltip>Delete manual adjustment</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>
      </div>

      <!-- ── ADJUSTMENT DIALOG ──────────────────────────────────────────────── -->
      <BankReconciliationAdjustmentDialog
        v-model="showAdjustmentDialog"
        :saving="reconStore.saving"
        :default-date="recon?.statement_end_date"
        :bank-ledger-id="recon?.bank_account?.ledger_id || null"
        @save="onAddAdjustment"
      />

      <!-- ── BRS STATEMENT REPORT MODAL ─────────────────────────────────────── -->
      <q-dialog v-model="showBrsModal">
        <q-card style="min-width: 600px; max-width: 700px;" class="q-pa-md">
          <div class="row items-center justify-between q-mb-md">
            <div class="text-h6 text-weight-bolder text-deep-purple">Bank Reconciliation Statement (BRS)</div>
            <q-btn flat round dense icon="close" v-close-popup />
          </div>

          <div class="q-mb-md text-caption text-grey-7">
            <strong>Bank:</strong> {{ recon?.bank_account?.bank_name }} — {{ recon?.bank_account?.registered_name }} ({{ recon?.bank_account?.account_number }})<br />
            <strong>As at:</strong> {{ recon?.statement_end_date }} (Period: {{ recon?.statement_start_date }} to {{ recon?.statement_end_date }})
          </div>

          <q-separator class="q-mb-md" />

          <!-- Formal BRS Structure -->
          <div class="q-gutter-y-sm text-body2">
            <div class="row justify-between">
              <span><strong>Balance as per Bank Statement</strong></span>
              <span class="text-weight-bold">LKR {{ fmt(recon?.closing_bank_balance) }}</span>
            </div>

            <div class="q-pl-md text-caption text-grey-8">
              <div class="row justify-between text-positive">
                <span>Add: Deposits in Transit / Uncleared Credits ({{ reconStore.unclearedDepositsCount }} items)</span>
                <span>+ LKR {{ fmt(reconStore.unclearedDepositsTotal) }}</span>
              </div>
              <div class="row justify-between text-orange-9">
                <span>Less: Unpresented Cheques / Uncleared Debits ({{ reconStore.unpresentedChequesCount }} items)</span>
                <span>- LKR {{ fmt(reconStore.unpresentedChequesTotal) }}</span>
              </div>
            </div>

            <q-separator />

            <div class="row justify-between text-weight-bold text-subtitle1">
              <span>Adjusted Bank Balance</span>
              <span>LKR {{ fmt(Number(recon?.closing_bank_balance || 0) + Number(reconStore.unclearedDepositsTotal || 0) - Number(reconStore.unpresentedChequesTotal || 0)) }}</span>
            </div>

            <div class="row justify-between text-weight-bold text-subtitle1 text-deep-purple">
              <span>Balance as per Company Cashbook</span>
              <span>LKR {{ fmt(recon?.system_balance) }}</span>
            </div>

            <div class="row justify-between text-weight-bolder text-h6" :class="isBalanced ? 'text-positive' : 'text-negative'">
              <span>Reconciliation Variance</span>
              <span>LKR {{ isBalanced ? '0.00' : fmt(recon?.difference_amount) }}</span>
            </div>
          </div>

          <div class="q-mt-lg row justify-end q-gutter-x-sm">
            <q-btn flat label="Close" color="grey-7" v-close-popup no-caps />
            <q-btn unelevated color="deep-purple" icon="print" label="Print Statement" no-caps @click="printBrs" />
          </div>
        </q-card>
      </q-dialog>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceBankReconciliationStore } from '../stores/finance-bank-reconciliation.store'
import BankReconciliationAdjustmentDialog from './BankReconciliationAdjustmentDialog.vue'

const props = defineProps({
  modelValue: Boolean,
  reconId: String,
})

const emit = defineEmits(['update:modelValue', 'closed'])

const $q = useQuasar()
const reconStore = useFinanceBankReconciliationStore()

const visible = ref(props.modelValue)
const showAdjustmentDialog = ref(false)
const showBrsModal = ref(false)

watch(
  () => props.modelValue,
  async (val) => {
    visible.value = val
    if (val && props.reconId) {
      await reconStore.fetchReconciliationById(props.reconId)
    }
  }
)

watch(visible, (val) => emit('update:modelValue', val))

const recon = computed(() => reconStore.currentRecon)
const isBalanced = computed(() => reconStore.isCurrentBalanced)

const debitsCount = computed(() => (recon.value?.lines || []).filter((l) => Number(l.debit_amount) > 0).length)
const creditsCount = computed(() => (recon.value?.lines || []).filter((l) => Number(l.credit_amount) > 0).length)
const matchedCount = computed(() => (recon.value?.lines || []).filter((l) => l.is_matched).length)
const unmatchedCount = computed(() => (recon.value?.lines || []).filter((l) => !l.is_matched).length)
const matchedDebitCount = computed(() => (recon.value?.lines || []).filter((l) => l.is_matched && Number(l.debit_amount) > 0).length)
const matchedCreditCount = computed(() => (recon.value?.lines || []).filter((l) => l.is_matched && Number(l.credit_amount) > 0).length)

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function statusColor(s) {
  return { draft: 'grey-7', reconciled: 'blue-8', approved: 'positive', locked: 'dark' }[s] || 'grey'
}

function typeBadgeColor(t) {
  return {
    cheque: 'teal-8',
    voucher: 'blue-8',
    deposit: 'positive',
    bank_charge: 'orange-8',
    interest: 'purple-8',
    manual_bank_entry: 'blue-grey-8',
  }[t] || 'grey-7'
}

function typeIcon(t) {
  return {
    cheque: 'credit_score',
    voucher: 'receipt_long',
    deposit: 'savings',
    bank_charge: 'trending_down',
    interest: 'trending_up',
    manual_bank_entry: 'edit_note',
  }[t] || 'receipt'
}

function formatSourceType(t) {
  return (
    {
      cheque: 'Cheque',
      voucher: 'Pay Voucher',
      deposit: 'Deposit / Receipt',
      bank_charge: 'Bank Charge',
      interest: 'Interest',
      manual_bank_entry: 'Adjustment',
    }[t] || t
  )
}

const columns = [
  { name: 'is_matched', label: 'Cleared', field: 'is_matched', align: 'center', sortable: true },
  { name: 'transaction_date', label: 'Date', field: 'transaction_date', align: 'left', sortable: true },
  { name: 'source_type', label: 'Type', field: 'source_type', align: 'left', sortable: true },
  { name: 'description', label: 'Description / Narration', field: 'description', align: 'left', sortable: true },
  { name: 'debit_amount', label: 'Payment Out (Debit)', field: 'debit_amount', align: 'right', sortable: true },
  { name: 'credit_amount', label: 'Deposit In (Credit)', field: 'credit_amount', align: 'right', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'center' },
]

async function onToggleLine(lineId, isMatched) {
  try {
    await reconStore.toggleMatch(lineId, isMatched)
  } catch (err) {
    // q-toggle already flipped the row locally — put it back.
    const row = (recon.value?.lines || []).find((l) => l.id === lineId)
    if (row) row.is_matched = !isMatched
    $q.notify({ type: 'negative', message: err.message || 'Failed to update line status' })
  }
}

async function handleSyncTransactions() {
  if (!recon.value?.id) return
  try {
    await reconStore.syncTransactions(recon.value.id)
    $q.notify({ type: 'positive', message: 'Transactions synchronized with latest system entries' })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Sync failed' })
  }
}

async function onAddAdjustment(adj) {
  if (!recon.value?.id) return
  try {
    await reconStore.addAdjustment(recon.value.id, adj)
    $q.notify({ type: 'positive', message: 'Adjustment posted to the General Ledger and added as a cleared line' })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to add adjustment' })
  }
}

async function onDeleteLine(lineId) {
  $q.dialog({
    title: 'Delete Adjustment',
    message: 'Are you sure you want to remove this adjustment line?',
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      await reconStore.deleteLine(lineId)
      $q.notify({ type: 'positive', message: 'Adjustment removed' })
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message || 'Failed to delete' })
    }
  })
}

async function handleApprove() {
  if (!recon.value?.id) return
  $q.dialog({
    title: 'Approve Bank Reconciliation',
    message: `Confirm approval of reconciliation for ${recon.value.bank_account?.bank_name} (${recon.value.reconciliation_month})? This will sign off this period.`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      await reconStore.approveReconciliation(recon.value.id)
      $q.notify({ type: 'positive', message: 'Reconciliation approved successfully!' })
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message || 'Approval failed' })
    }
  })
}

async function handleLock() {
  if (!recon.value?.id) return
  try {
    await reconStore.lockReconciliation(recon.value.id)
    $q.notify({ type: 'positive', message: 'Reconciliation locked.' })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Lock failed' })
  }
}

function promptReopen() {
  $q.dialog({
    title: 'Reopen Reconciliation',
    message: 'Please provide a reason to reopen this reconciliation back to draft:',
    prompt: {
      model: '',
      type: 'text',
      isValid: (v) => v.trim().length > 3,
    },
    cancel: true,
    persistent: true,
  }).onOk(async (reason) => {
    try {
      await reconStore.reopenReconciliation(recon.value.id, reason)
      $q.notify({ type: 'positive', message: 'Reopened to draft.' })
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message || 'Reopen failed' })
    }
  })
}

function printBrs() {
  window.print()
}

function close() {
  visible.value = false
  emit('closed')
}
</script>

<style scoped>
.recon-header {
  background: linear-gradient(135deg, #4a148c 0%, #6a1b9a 100%);
}

.recon-kpi {
  padding: 12px 14px;
  border-radius: 8px;
  background: white;
  transition: all 0.2s ease;
}

.recon-table {
  border-radius: 8px;
}
</style>
