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
            {{ formatCurrency(props.row.installment_amount) }} x {{ props.row.total_installments }}
          </div>
        </q-td>
      </template>

      <template v-slot:body-cell-remaining="props">
        <q-td :props="props">
          <span class="text-weight-bold text-amber">
            {{ formatCurrency(props.row.remaining_amount) }}
          </span>
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
          />
          <q-input
            dark
            outlined
            v-model.number="newLoan.total_installments"
            label="Number of Installments"
            type="number"
          />
          <q-input
            dark
            outlined
            v-model.number="newLoan.installment_amount"
            label="Installment Amount"
            type="number"
            prefix="LKR "
          />
          <q-input dark outlined v-model="newLoan.start_date" label="Start Date" type="date" />
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
import { ref, reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const showAddLoan = ref(false)
const loans = ref([])
const employeeOptions = ref([])

const newLoan = reactive({
  employee_id: null,
  loan_amount: 0,
  total_installments: 12,
  installment_amount: 0,
  start_date: new Date().toISOString().split('T')[0],
  reason: '',
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
  { name: 'remaining', label: 'Remaining', align: 'right', field: 'remaining_amount' },
  { name: 'status', label: 'Status', align: 'center', field: 'status', sortable: true },
  { name: 'start_date', label: 'Start Date', align: 'center', field: 'start_date' },
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
    Number(val || 0).toLocaleString('en-US', {
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

async function saveLoan() {
  saving.value = true
  try {
    const { error } = await supabase.from('employee_loans').insert({
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
      ...newLoan,
      remaining_amount: newLoan.loan_amount,
      total_paid: 0,
      installments_paid: 0,
      status: 'pending',
    })
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Loan issued successfully' })
    showAddLoan.value = false
    loadLoans()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadLoans()
  loadEmployees()
})
</script>
