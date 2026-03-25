<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="Chart of Accounts"
      breadcrumbs="Finance / General Ledger / Chart of Accounts"
      showRefresh
      @refresh="loadData"
      :primaryAction="{ label: 'New Account', icon: 'add' }"
      @primary-action="showCreateDialog = true"
    />

    <!-- Filters -->
    <div class="fin-filters q-mb-md">
      <q-select
        v-model="filterType"
        :options="['All', 'Asset', 'Liability', 'Equity', 'Revenue', 'Expense']"
        label="Account Type"
        dense
        dark
        outlined
        style="min-width: 160px"
        emit-value
        map-options
        clearable
      />
      <q-input
        v-model="search"
        label="Search accounts..."
        dense
        dark
        outlined
        style="min-width: 220px"
        clearable
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
    </div>

    <!-- Accounts Table -->
    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Accounts ({{ filteredAccounts.length }})</span>
      </div>
      <q-table
        :rows="filteredAccounts"
        :columns="columns"
        row-key="id"
        flat
        dark
        dense
        :rows-per-page-options="[0]"
        hide-bottom
        class="fin-table"
        :loading="loading"
        no-data-label="No accounts found"
      >
        <template #body-cell-account_type="props">
          <q-td :props="props">
            <span :class="typeClass(props.row.account_type)">{{ props.row.account_type }}</span>
          </q-td>
        </template>
        <template #body-cell-is_active="props">
          <q-td :props="props">
            <span
              :class="
                props.row.is_active ? 'fin-badge fin-badge--success' : 'fin-badge fin-badge--muted'
              "
              >{{ props.row.is_active ? 'Active' : 'Inactive' }}</span
            >
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              flat
              dense
              icon="edit"
              size="sm"
              color="grey-5"
              @click="editAccount(props.row)"
            />
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- Create/Edit Dialog -->
    <q-dialog v-model="showCreateDialog" class="fin-dialog">
      <q-card dark style="min-width: 480px; background: #161b22; border: 1px solid #30363d">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-subtitle1 text-weight-bold text-white">
            {{ editingAccount ? 'Edit Account' : 'New Account' }}
          </div>
          <q-space /><q-btn flat dense icon="close" color="grey-5" v-close-popup />
        </q-card-section>
        <q-card-section class="q-gutter-sm fin-form">
          <q-input v-model="form.code" label="Account Code *" dense dark outlined />
          <q-input v-model="form.name" label="Account Name *" dense dark outlined />
          <q-select
            v-model="form.account_type"
            :options="['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']"
            label="Type *"
            dense
            dark
            outlined
            emit-value
            map-options
          />
          <q-input
            v-model="form.description"
            label="Description"
            dense
            dark
            outlined
            type="textarea"
            rows="2"
          />
          <q-toggle v-model="form.is_active" label="Active" dark color="blue" />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            unelevated
            :label="editingAccount ? 'Update' : 'Create'"
            color="blue-8"
            @click="saveAccount"
            :loading="saving"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Notify } from 'quasar'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { fetchChartOfAccounts, createAccount, updateAccount } from 'src/services/financeService'

const loading = ref(false)
const saving = ref(false)
const accounts = ref([])
const search = ref('')
const filterType = ref(null)
const showCreateDialog = ref(false)
const editingAccount = ref(null)

const form = ref({ code: '', name: '', account_type: 'Expense', description: '', is_active: true })

const columns = [
  {
    name: 'code',
    label: 'Code',
    field: 'code',
    align: 'left',
    sortable: true,
    style: 'width: 100px',
  },
  { name: 'name', label: 'Account Name', field: 'name', align: 'left', sortable: true },
  {
    name: 'account_type',
    label: 'Type',
    field: 'account_type',
    align: 'left',
    sortable: true,
    style: 'width: 100px',
  },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'is_active', label: 'Status', field: 'is_active', align: 'center', style: 'width: 80px' },
  { name: 'actions', label: '', field: 'actions', align: 'center', style: 'width: 50px' },
]

const filteredAccounts = computed(() => {
  let list = accounts.value
  if (filterType.value && filterType.value !== 'All')
    list = list.filter((a) => a.account_type === filterType.value)
  if (search.value) {
    const s = search.value.toLowerCase()
    list = list.filter((a) => a.code.toLowerCase().includes(s) || a.name.toLowerCase().includes(s))
  }
  return list
})

function typeClass(type) {
  const map = {
    Asset: 'fin-badge fin-badge--info',
    Liability: 'fin-badge fin-badge--danger',
    Equity: 'fin-badge fin-badge--success',
    Revenue: 'fin-badge fin-badge--success',
    Expense: 'fin-badge fin-badge--warning',
  }
  return map[type] || 'fin-badge fin-badge--muted'
}

function editAccount(row) {
  editingAccount.value = row
  form.value = {
    code: row.code,
    name: row.name,
    account_type: row.account_type,
    description: row.description,
    is_active: row.is_active,
  }
  showCreateDialog.value = true
}

async function saveAccount() {
  if (!form.value.code || !form.value.name || !form.value.account_type) {
    Notify.create({ type: 'warning', message: 'Code, Name and Type are required' })
    return
  }
  saving.value = true
  try {
    if (editingAccount.value) {
      const { error } = await updateAccount(editingAccount.value.id, form.value)
      if (error) throw error
      Notify.create({ type: 'positive', message: 'Account updated' })
    } else {
      const { error } = await createAccount(form.value)
      if (error) throw error
      Notify.create({ type: 'positive', message: 'Account created' })
    }
    showCreateDialog.value = false
    editingAccount.value = null
    form.value = { code: '', name: '', account_type: 'Expense', description: '', is_active: true }
    loadData()
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || 'Failed to save' })
  } finally {
    saving.value = false
  }
}

async function loadData() {
  loading.value = true
  const { data } = await fetchChartOfAccounts()
  accounts.value = data || []
  loading.value = false
}

onMounted(loadData)
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
