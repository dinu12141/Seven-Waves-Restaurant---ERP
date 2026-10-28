<template>
  <div class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h6">Employee Loans</div>
      <q-space />
      <q-btn outline color="primary" icon="add" label="New Loan" @click="showAddLoan = true" />
    </div>

    <!-- Loans Table -->
    <q-table
      dark
      flat
      bordered
      :rows="loans"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :pagination="{ rowsPerPage: 15 }"
      class="bg-grey-9"
    >
      <template v-slot:body-cell-employee="props">
        <q-td :props="props">
          <div class="text-weight-bold">{{ props.row.employees?.full_name || '—' }}</div>
        </q-td>
      </template>

      <template v-slot:body-cell-status="props">
        <q-td :props="props">
          <q-badge
            :color="loanStatusColor(props.row.status)"
            :label="props.row.status"
            class="text-capitalize"
          />
        </q-td>
      </template>

      <template v-slot:body-cell-progress="props">
        <q-td :props="props">
          <div class="row items-center no-wrap q-gutter-sm">
            <q-linear-progress
              :value="props.row.loan_amount > 0 ? props.row.total_paid / props.row.loan_amount : 0"
              color="green"
              track-color="grey-8"
              class="col"
              rounded
              size="8px"
            />
            <span class="text-caption text-grey-5">
              {{ Math.round((props.row.total_paid / (props.row.loan_amount || 1)) * 100) }}%
            </span>
          </div>
        </q-td>
      </template>

      <template v-slot:body-cell-amount="props">
        <q-td :props="props">
          <div class="text-weight-bold">{{ formatCurrency(props.row.loan_amount) }}</div>
          <div class="text-caption text-grey-5">
            {{ formatCurrency(props.row.monthly_installment) }} / month
          </div>
        </q-td>
      </template>

      <template v-slot:body-cell-remaining="props">
        <q-td :props="props">
          <span class="text-weight-bold text-amber">
            {{ formatCurrency(props.row.remaining_balance) }}
          </span>
        </q-td>
      </template>

      <template v-slot:body-cell-actions="props">
        <q-td :props="props">
          <q-btn
            v-if="props.row.status === 'pending'"
            flat
            round
            dense
            size="sm"
            icon="payments"
            color="positive"
            @click="disburseLoan(props.row)"
          >
            <q-tooltip>Disburse (pay out) this loan</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- New Loan Dialog -->
    <q-dialog v-model="showAddLoan" persistent>
      <q-card class="bg-grey-9 text-white" style="min-width: 450px">
        <q-card-section>
          <div class="text-h6">Issue New Loan</div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-select
            dark
            outlined
            v-model="newLoan.employee_id"
            :options="employeeOptions"
            label="Employee"
            emit-value
            map-options
          />
          <q-input
            dark
            outlined
            v-model.number="newLoan.loan_amount"
            label="Loan Amount"
            type="number"
            prefix="LKR "
            @update:model-value="suggestInstallment"
          />
          <q-input
            dark
            outlined
            v-model.number="newLoan.total_installments"
            label="Number of Installments"
            type="number"
            @update:model-value="suggestInstallment"
          />
          <q-input
            dark
            outlined
            v-model.number="newLoan.installment_amount"
            label="Monthly Installment"
            type="number"
            prefix="LKR "
          />
          <q-input dark outlined v-model="newLoan.start_date" label="Loan Date" type="date" />
          <q-select
            dark
            outlined
            v-model="newLoan.cash_account_id"
            :options="accountOptions"
            label="Paid from Cash/Bank Account *"
            emit-value
            map-options
            hint="The loan is disbursed (Dr Staff Receivable / Cr this account) before payroll can recover it"
          />
          <q-input dark outlined v-model="newLoan.reason" label="Reason" type="textarea" autogrow />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" label="Issue Loan" @click="saveLoan" :loading="saving" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import {
  disburseStaffReceivable,
  FINANCE_POSTING_UNAVAILABLE,
} from 'src/services/hr/staffReceivableService'
import { buildLoanInsert } from 'src/services/hr/loanPayload'

const $q = useQuasar()
const authStore = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const showAddLoan = ref(false)
const loans = ref([])
const employeeOptions = ref([])
const accounts = ref([])
const accountOptions = computed(() =>
  accounts.value.map((a) => ({
    label: `${a.registered_name}${a.account_type ? ' (' + a.account_type + ')' : ''} — ${formatCurrency(a.current_balance)}`,
    value: a.id,
  })),
)

const newLoan = reactive({
  employee_id: null,
  loan_amount: 0,
  total_installments: 12,
  installment_amount: 0,
  start_date: new Date().toISOString().split('T')[0],
  reason: '',
  cash_account_id: null,
})

const columns = [
  {
    name: 'employee',
    label: 'Employee',
    align: 'left',
    field: (row) => row.employees?.full_name,
    sortable: true,
  },
  { name: 'amount', label: 'Loan Amount', align: 'left', field: 'loan_amount' },
  {
    name: 'progress',
    label: 'Repayment',
    align: 'left',
    field: 'total_paid',
    style: 'min-width: 180px',
  },
  { name: 'remaining', label: 'Remaining', align: 'right', field: 'remaining_balance' },
  { name: 'status', label: 'Status', align: 'center', field: 'status', sortable: true },
  { name: 'loan_date', label: 'Loan Date', align: 'center', field: 'loan_date' },
  { name: 'actions', label: '', align: 'center', field: 'id' },
]

function loanStatusColor(status) {
  const map = {
    pending: 'amber',
    active: 'blue',
    completed: 'green',
    cancelled: 'grey',
    defaulted: 'red',
  }
  return map[status] || 'grey'
}

function formatCurrency(val) {
  return (
    'LKR ' +
    Number(val || 0).toLocaleString('en-LK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

async function loadLoans() {
  loading.value = true
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const { data, error } = await supabase
      .from('employee_loans')
      .select('*, employees(full_name)')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })

    if (error) throw error
    loans.value = data || []
  } catch (err) {
    console.error('Failed to load loans:', err)
  } finally {
    loading.value = false
  }
}

async function loadEmployees() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return

  const { data } = await supabase
    .from('employees')
    .select('id, full_name')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('first_name')

  employeeOptions.value = (data || []).map((e) => ({ label: e.full_name, value: e.id }))
}

function suggestInstallment() {
  const n = Number(newLoan.total_installments)
  const amt = Number(newLoan.loan_amount)
  if (n >= 1 && amt > 0) newLoan.installment_amount = Math.ceil((amt / n) * 100) / 100
}

async function loadAccounts() {
  try {
    const { data, error } = await supabase
      .from('finance_accounts')
      .select('id, registered_name, account_type, current_balance')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('registered_name')
    if (error) throw error
    accounts.value = data || []
    if (!newLoan.cash_account_id) {
      const def = accounts.value.find((a) => a.account_type === 'cash')
      if (def) newLoan.cash_account_id = def.id
    }
  } catch (err) {
    console.error('Failed to load finance accounts:', err)
    accounts.value = []
  }
}

watch(showAddLoan, (open) => {
  if (open) loadAccounts()
})

async function saveLoan() {
  if (!newLoan.employee_id) {
    $q.notify({ type: 'warning', message: 'Select an employee' })
    return
  }
  if (!newLoan.cash_account_id) {
    $q.notify({ type: 'warning', message: 'Select the cash/bank account the loan is paid from' })
    return
  }
  let payload
  try {
    payload = buildLoanInsert(newLoan, authStore.currentBranch)
  } catch (err) {
    $q.notify({ type: 'warning', message: err.message })
    return
  }
  saving.value = true
  try {
    // Insert as 'pending' (allowed by chk_loan_status); disbursement (#134b)
    // makes it 'active' so payroll starts recovering it.
    const { data: inserted, error } = await supabase
      .from('employee_loans')
      .insert(payload)
      .select('id')
      .single()
    if (error) throw error

    const res = await disburseStaffReceivable(
      supabase,
      'employee_loan',
      inserted.id,
      newLoan.cash_account_id,
    )
    if (res.ok) {
      $q.notify({ type: 'positive', message: 'Loan issued and disbursed' })
    } else if (res.missing) {
      $q.notify({
        type: 'info',
        message: `Loan recorded as PENDING — approve it in the Approvals Center. ${FINANCE_POSTING_UNAVAILABLE}`,
        multiLine: true,
        timeout: 7000,
      })
    } else {
      $q.notify({
        type: 'warning',
        message: `Loan saved as PENDING but not disbursed: ${res.error}. Use the Disburse action to retry.`,
        multiLine: true,
        timeout: 8000,
      })
    }
    showAddLoan.value = false
    loadLoans()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

async function disburseLoan(loan) {
  await loadAccounts()
  if (!accounts.value.length) {
    $q.notify({ type: 'warning', message: 'No active finance cash/bank accounts found' })
    return
  }
  $q.dialog({
    title: 'Disburse Loan',
    message: `Pay out ${formatCurrency(loan.loan_amount)} from:`,
    options: {
      type: 'radio',
      model: newLoan.cash_account_id || accounts.value[0].id,
      items: accountOptions.value,
    },
    cancel: true,
    persistent: true,
    dark: true,
  }).onOk(async (accountId) => {
    const res = await disburseStaffReceivable(supabase, 'employee_loan', loan.id, accountId)
    if (res.ok) {
      $q.notify({ type: 'positive', message: 'Loan disbursed — payroll will now recover it' })
    } else {
      $q.notify({
        type: 'negative',
        message: res.missing
          ? `${FINANCE_POSTING_UNAVAILABLE} Approve the loan in the Approvals Center instead.`
          : res.error,
        multiLine: true,
      })
    }
    loadLoans()
  })
}

onMounted(() => {
  loadLoans()
  loadEmployees()
})
</script>
