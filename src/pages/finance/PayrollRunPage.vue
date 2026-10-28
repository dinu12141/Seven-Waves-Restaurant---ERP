<template>
  <q-page class="q-pa-md finance-page">
    <FinancePageHeader
      icon="playlist_add_check"
      subtitle="Approve payroll runs and post salary, EPF and ETF to the GL"
      title="Post Payroll to GL"
      breadcrumbs="Finance / Payroll / Post to GL"
      show-refresh
      @refresh="loadRuns"
    />

    <!--
      Payroll is calculated and approved in HR (HR → Payroll: process → approve →
      release holds). Finance books approved runs to the General Ledger here via
      post_payroll_to_finance_v2 — the only posting path that writes
      finance_cashbook_entries + finance_ledgers. Nothing is calculated or
      journalised on the client.
    -->
    <q-banner dense class="fin-panel q-mb-md text-grey-6" rounded>
      <template #avatar><q-icon name="info" color="blue-4" /></template>
      Payroll is processed and approved in <b>HR → Payroll</b>. Posting a run books every released
      payslip to the GL: Dr Salaries (7000), EPF 12% (7003), ETF 3% (7004) · Cr EPF/ETF payable
      (2003/2004), staff recoveries (1004), welfare (2008), other deductions (2009) and the paying
      cash/bank account (net pay). Held payslips stay unposted until released.
    </q-banner>

    <div class="fin-filters q-mb-md">
      <q-btn-toggle
        v-model="statusFilter"
        dense
        no-caps
        toggle-color="blue-8"
        color="grey-9"
        text-color="grey-4"
        :options="[
          { label: 'To post', value: 'to_post' },
          { label: 'All runs', value: 'all' },
        ]"
      />
    </div>

    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Payroll Runs ({{ visibleRuns.length }})</span>
      </div>
      <q-table
        :rows="visibleRuns"
        :columns="runCols"
        row-key="id"
        flat
        dense
        :rows-per-page-options="[10, 25, 50, 0]"
        class="fin-table"
        :loading="loading"
        :no-data-label="
          statusFilter === 'to_post'
            ? 'No approved payroll runs are waiting to be posted'
            : 'No payroll runs'
        "
      >
        <template #body-cell-status="props">
          <q-td :props="props">
            <span :class="runStatusClass(props.row.status)">{{ props.row.status }}</span>
          </q-td>
        </template>
        <template #body-cell-gl="props">
          <q-td :props="props">
            <span :class="glStatusClass(props.row.gl_status)">{{ glStatusLabel(props.row.gl_status) }}</span>
            <div class="text-caption text-grey-6">
              {{ props.row.slip_summary.posted }} posted · {{ props.row.slip_summary.pending }} pending
              <span v-if="props.row.slip_summary.held"> · {{ props.row.slip_summary.held }} held</span>
            </div>
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              v-if="canPost && canPostRun(props.row, props.row.slip_summary)"
              unelevated
              dense
              no-caps
              size="sm"
              color="green-8"
              icon="account_balance"
              label="Post to GL"
              @click="openPostDialog(props.row)"
            />
            <q-btn
              flat
              dense
              size="sm"
              icon="people"
              color="blue-4"
              :to="{ path: '/finance/payroll/payslips', query: { cycle: props.row.id } }"
              ><q-tooltip>View payslips</q-tooltip></q-btn
            >
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- Post dialog -->
    <q-dialog v-model="showPostDialog" class="fin-dialog">
      <q-card style="width: 460px; max-width: 95vw; background: var(--erp-bg-card); border: 1px solid var(--erp-border)">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold">
            Post {{ target?.cycle_name }} to the General Ledger
          </div>
          <div class="text-caption text-grey-5">
            {{ target?.period_start }} → {{ target?.period_end }}
            <span v-if="target?.branch_name"> · {{ target.branch_name }}</span>
          </div>
        </q-card-section>
        <q-card-section v-if="target" class="q-pt-none">
          <div class="row q-col-gutter-sm text-caption">
            <div class="col-6 text-grey-5">Payslips to post</div>
            <div class="col-6 text-right">{{ target.slip_summary.pending }}</div>
            <div class="col-6 text-grey-5">Gross salaries</div>
            <div class="col-6 text-right">{{ fmt(target.slip_summary.pendingGross) }}</div>
            <div class="col-6 text-grey-5">EPF (employee 8% + employer 12%)</div>
            <div class="col-6 text-right">
              {{ fmt(target.slip_summary.pendingEpfEmployee + target.slip_summary.pendingEpfEmployer) }}
            </div>
            <div class="col-6 text-grey-5">ETF (employer 3%)</div>
            <div class="col-6 text-right">{{ fmt(target.slip_summary.pendingEtf) }}</div>
            <div class="col-6 text-grey-5 text-weight-bold">Net pay (cash/bank credit)</div>
            <div class="col-6 text-right text-green-4 text-weight-bold">
              {{ fmt(target.slip_summary.pendingNet) }}
            </div>
          </div>
          <div v-if="target.slip_summary.held" class="text-caption text-amber-5 q-mt-sm">
            {{ target.slip_summary.held }} held payslip(s) ({{ fmt(target.slip_summary.heldNet) }}) will
            not be posted. Release them in HR → Payroll and post again.
          </div>
        </q-card-section>
        <q-card-section class="fin-form q-pt-none">
          <q-select
            v-model="postForm.payment_method"
            :options="paymentMethods"
            emit-value
            map-options
            label="Payment method *"
            dense
            outlined
            class="q-mb-sm"
          />
          <q-select
            v-model="postForm.account_id"
            :options="accountOptions"
            emit-value
            map-options
            label="Paid from (Cash / Bank account) *"
            dense
            outlined
            :loading="loadingAccounts"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                  <q-item-label caption>Balance {{ fmt(scope.opt.balance) }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
          <div
            v-if="selectedAccount && target && selectedAccount.balance < target.slip_summary.pendingNet"
            class="text-caption text-amber-5 q-mt-xs"
          >
            The selected account balance ({{ fmt(selectedAccount.balance) }}) is below the net pay.
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            unelevated
            label="Post to GL"
            icon="account_balance"
            color="green-8"
            :loading="posting"
            :disable="!postForm.account_id"
            @click="confirmPost"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { Notify } from 'quasar'
import FinancePageHeader from 'src/modules/finance/components/FinancePageHeader.vue'
import { useAuthStore } from 'stores/auth'
import {
  financePayrollService,
  canPostRun,
  payingAccountOptions,
} from 'src/modules/finance/services/finance-payroll.service'

const authStore = useAuthStore()
const loading = ref(false)
const runs = ref([])
const statusFilter = ref('to_post')
const showPostDialog = ref(false)
const target = ref(null)
const posting = ref(false)
const accounts = ref([])
const loadingAccounts = ref(false)
const postForm = ref({ payment_method: 'bank_transfer', account_id: null })

const paymentMethods = [
  { label: 'Bank transfer', value: 'bank_transfer' },
  { label: 'Cash', value: 'cash' },
  { label: 'Cheque', value: 'cheque' },
]

// post_payroll_to_finance_v2 only accepts admin / hr / finance.
const canPost = computed(() =>
  ['admin', 'hr', 'finance'].some((r) => (authStore.roles || []).includes(r)),
)

const visibleRuns = computed(() =>
  statusFilter.value === 'to_post'
    ? runs.value.filter((r) => canPostRun(r, r.slip_summary))
    : runs.value,
)
const accountOptions = computed(() =>
  payingAccountOptions(accounts.value, postForm.value.payment_method),
)
const selectedAccount = computed(() =>
  accountOptions.value.find((a) => a.value === postForm.value.account_id),
)

watch(
  () => postForm.value.payment_method,
  () => {
    if (!accountOptions.value.some((a) => a.value === postForm.value.account_id))
      postForm.value.account_id = null
  },
)

const runCols = [
  { name: 'cycle_name', label: 'Run', field: 'cycle_name', align: 'left' },
  {
    name: 'period',
    label: 'Period',
    field: (r) => `${r.period_start} → ${r.period_end}`,
    align: 'left',
  },
  { name: 'branch', label: 'Branch', field: 'branch_name', align: 'left' },
  { name: 'employees', label: 'Slips', field: (r) => r.slip_summary.count, align: 'center' },
  { name: 'gross', label: 'Gross', field: 'total_gross', align: 'right', format: (v) => fmt(v) },
  { name: 'net', label: 'Net', field: 'total_net', align: 'right', format: (v) => fmt(v) },
  { name: 'status', label: 'Run Status', field: 'status', align: 'center' },
  { name: 'gl', label: 'GL Posting', field: 'gl_status', align: 'left' },
  { name: 'actions', label: '', align: 'right', style: 'width: 150px' },
]

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
function runStatusClass(s) {
  const m = {
    draft: 'fin-badge fin-badge--muted',
    processing: 'fin-badge fin-badge--warning',
    processed: 'fin-badge fin-badge--info',
    approved: 'fin-badge fin-badge--info',
    paid: 'fin-badge fin-badge--success',
    cancelled: 'fin-badge fin-badge--danger',
  }
  return m[s] || 'fin-badge fin-badge--muted'
}
function glStatusLabel(s) {
  return (
    {
      not_approved: 'Awaiting HR approval',
      nothing: 'Nothing to post',
      pending: 'Not posted',
      partial: 'Partly posted',
      posted: 'Posted',
    }[s] || s
  )
}
function glStatusClass(s) {
  return (
    {
      pending: 'fin-badge fin-badge--warning',
      partial: 'fin-badge fin-badge--warning',
      posted: 'fin-badge fin-badge--success',
    }[s] || 'fin-badge fin-badge--muted'
  )
}

async function loadRuns() {
  loading.value = true
  try {
    runs.value = await financePayrollService.listRuns()
  } catch (e) {
    Notify.create({ type: 'negative', message: `Could not load payroll runs: ${e.message || e}` })
  } finally {
    loading.value = false
  }
}

async function openPostDialog(run) {
  target.value = run
  postForm.value = { payment_method: 'bank_transfer', account_id: null }
  showPostDialog.value = true
  if (accounts.value.length) return
  loadingAccounts.value = true
  try {
    accounts.value = await financePayrollService.fetchPayingAccounts()
  } catch (e) {
    Notify.create({ type: 'negative', message: `Could not load finance accounts: ${e.message || e}` })
  } finally {
    loadingAccounts.value = false
  }
}

async function confirmPost() {
  if (!target.value) return
  posting.value = true
  try {
    const res = await financePayrollService.postRunToFinance({
      runId: target.value.id,
      accountId: postForm.value.account_id,
      paymentMethod: postForm.value.payment_method,
    })
    const remaining = Number(res?.slips_remaining || 0)
    Notify.create({
      type: 'positive',
      icon: 'account_balance',
      timeout: 5000,
      message:
        `Posted ${res?.slips_paid ?? ''} payslip(s) to the GL — net ${fmt(res?.total_net)}, ` +
        `EPF ${fmt(res?.total_epf)}, ETF ${fmt(res?.total_etf)}.` +
        (remaining > 0 ? ` ${remaining} held/unposted payslip(s) remain.` : ''),
    })
    showPostDialog.value = false
    await loadRuns()
  } catch (e) {
    Notify.create({ type: 'negative', multiLine: true, message: e.message || String(e) })
  } finally {
    posting.value = false
  }
}

onMounted(loadRuns)
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
