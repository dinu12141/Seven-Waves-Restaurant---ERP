<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar moduleName="finance" title="Expense Management" breadcrumbs="Finance / Expenses & Tax / Expenses" showRefresh @refresh="loadData" :primaryAction="{ label: 'New Expense', icon: 'add' }" @primary-action="showDialog = true" />

    <div class="fin-filters q-mb-md">
      <q-select v-model="filterCategory" :options="categoryOptions" label="Category" dense dark outlined style="min-width: 180px" clearable emit-value map-options />
      <q-select v-model="filterStatus" :options="['All','pending','approved','rejected','posted']" label="Status" dense dark outlined style="min-width: 140px" clearable />
      <q-input v-model="dateFrom" label="From" type="date" dense dark outlined style="min-width: 150px" />
      <q-input v-model="dateTo" label="To" type="date" dense dark outlined style="min-width: 150px" />
      <q-btn flat dense icon="filter_list_off" color="grey-5" @click="resetFilters" />
    </div>

    <!-- Summary -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-4">
        <div class="fin-kpi-card">
          <div class="fin-kpi-card__icon" style="background: rgba(239,68,68,0.12)"><q-icon name="money_off" size="20px" color="red" /></div>
          <div class="fin-kpi-card__body"><div class="fin-kpi-card__label">Total Expenses</div><div class="fin-kpi-card__value">{{ fmt(totalExpenses) }}</div></div>
        </div>
      </div>
      <div class="col-12 col-sm-4">
        <div class="fin-kpi-card">
          <div class="fin-kpi-card__icon" style="background: rgba(245,158,11,0.12)"><q-icon name="pending" size="20px" color="orange" /></div>
          <div class="fin-kpi-card__body"><div class="fin-kpi-card__label">Pending Approval</div><div class="fin-kpi-card__value">{{ pendingCount }}</div></div>
        </div>
      </div>
      <div class="col-12 col-sm-4">
        <div class="fin-kpi-card">
          <div class="fin-kpi-card__icon" style="background: rgba(16,185,129,0.12)"><q-icon name="check_circle" size="20px" color="green" /></div>
          <div class="fin-kpi-card__body"><div class="fin-kpi-card__label">Approved</div><div class="fin-kpi-card__value">{{ approvedCount }}</div></div>
        </div>
      </div>
    </div>

    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Expense Entries ({{ expenses.length }})</span>
      </div>
      <q-table :rows="expenses" :columns="columns" row-key="id" flat dark dense :rows-per-page-options="[20, 50]" class="fin-table" :loading="loading" no-data-label="No expense entries">
        <template #body-cell-status="props">
          <q-td :props="props">
            <span :class="statusBadge(props.row.status)">{{ props.row.status }}</span>
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn v-if="props.row.status === 'pending'" flat dense icon="check" size="sm" color="green-5" @click="approve(props.row.id)"><q-tooltip>Approve</q-tooltip></q-btn>
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- New Expense Dialog -->
    <q-dialog v-model="showDialog" class="fin-dialog">
      <q-card dark style="min-width: 480px; background: #161b22; border: 1px solid #30363d;">
        <q-card-section><div class="text-subtitle1 text-weight-bold text-white">New Expense Entry</div></q-card-section>
        <q-card-section class="q-gutter-sm fin-form">
          <q-select v-model="form.category_id" :options="categoryOptions" label="Category *" dense dark outlined emit-value map-options option-value="id" option-label="name" />
          <q-input v-model.number="form.amount" label="Amount *" type="number" dense dark outlined />
          <q-input v-model="form.expense_date" label="Date" type="date" dense dark outlined />
          <q-input v-model="form.description" label="Description" dense dark outlined />
          <q-input v-model="form.reference" label="Reference" dense dark outlined />
          <q-select v-model="form.payment_method" :options="['cash','card','bank_transfer','cheque']" label="Payment Method" dense dark outlined emit-value />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn unelevated label="Submit" color="blue-8" @click="saveExpense" :loading="saving" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Notify } from 'quasar'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { fetchExpenses, fetchExpenseCategories, createExpense, approveExpense } from 'src/services/financeService'

const loading = ref(false); const saving = ref(false)
const expenses = ref([]); const categories = ref([])
const showDialog = ref(false)
const filterCategory = ref(null); const filterStatus = ref(null); const dateFrom = ref(''); const dateTo = ref('')
const form = ref({ category_id: '', amount: 0, expense_date: new Date().toISOString().split('T')[0], description: '', reference: '', payment_method: 'cash' })

const categoryOptions = computed(() => categories.value.map(c => ({ id: c.id, name: c.name, label: c.name, value: c.id })))
const totalExpenses = computed(() => expenses.value.reduce((s, e) => s + Number(e.amount || 0), 0))
const pendingCount = computed(() => expenses.value.filter(e => e.status === 'pending').length)
const approvedCount = computed(() => expenses.value.filter(e => e.status === 'approved').length)

const columns = [
  { name: 'date', label: 'Date', field: 'expense_date', align: 'left', sortable: true, style: 'width: 100px' },
  { name: 'category', label: 'Category', field: row => row.expense_categories?.name || '-', align: 'left' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'payment_method', label: 'Payment', field: 'payment_method', align: 'center', style: 'width: 100px' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', format: v => fmt(v), style: 'width: 120px' },
  { name: 'status', label: 'Status', field: 'status', align: 'center', style: 'width: 100px' },
  { name: 'actions', label: '', align: 'center', style: 'width: 50px' },
]

function fmt(v) { return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) }
function statusBadge(s) { const m = { pending: 'fin-badge fin-badge--warning', approved: 'fin-badge fin-badge--success', rejected: 'fin-badge fin-badge--danger', posted: 'fin-badge fin-badge--info' }; return m[s] || 'fin-badge fin-badge--muted' }

function resetFilters() { filterCategory.value = null; filterStatus.value = null; dateFrom.value = ''; dateTo.value = ''; loadData() }

async function approve(id) {
  const { error } = await approveExpense(id, null)
  if (error) Notify.create({ type: 'negative', message: error.message })
  else { Notify.create({ type: 'positive', message: 'Expense approved' }); loadData() }
}

async function saveExpense() {
  if (!form.value.category_id || !form.value.amount) { Notify.create({ type: 'warning', message: 'Category and Amount required' }); return }
  saving.value = true
  const { error } = await createExpense(form.value)
  if (error) Notify.create({ type: 'negative', message: error.message })
  else { Notify.create({ type: 'positive', message: 'Expense submitted' }); showDialog.value = false; loadData() }
  saving.value = false
}

async function loadData() {
  loading.value = true
  const [expRes, catRes] = await Promise.all([
    fetchExpenses({
      categoryId: filterCategory.value, status: filterStatus.value !== 'All' ? filterStatus.value : undefined,
      dateFrom: dateFrom.value || undefined, dateTo: dateTo.value || undefined
    }),
    fetchExpenseCategories()
  ])
  expenses.value = expRes.data || []; categories.value = catRes.data || []
  loading.value = false
}
onMounted(loadData)
</script>

<style scoped lang="scss">@import 'src/css/finance-common.scss';</style>
