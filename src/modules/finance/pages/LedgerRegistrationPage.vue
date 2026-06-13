<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <q-icon name="book" size="md" color="primary" class="q-mr-sm" />
      <div class="text-h5 text-weight-bold">Ledger Registration</div>
      <q-space />
      <q-btn color="primary" icon="add" label="Register Ledger" unelevated @click="showForm = true" />
    </div>

    <div class="row q-col-gutter-sm q-mb-md">
      <div class="col-12 col-md-3">
        <q-select v-model="filters.ledger_type" label="Type" outlined dense clearable emit-value map-options
          :options="[{label:'Asset',value:'asset'},{label:'Liability',value:'liability'},{label:'Equity',value:'equity'},{label:'Income',value:'income'},{label:'Expense',value:'expense'}]"
          @update:model-value="loadLedgers" />
      </div>
      <div class="col-12 col-md-3">
        <q-input v-model="search" label="Search" outlined dense clearable>
          <template v-slot:prepend><q-icon name="search" /></template>
        </q-input>
      </div>
    </div>

    <q-table flat bordered :rows="filteredLedgers" :columns="columns" row-key="id" :loading="ledgerStore.loading"
      :pagination="{ rowsPerPage: 20 }">
      <template v-slot:body-cell-ledger_type="props">
        <q-td :props="props"><q-badge :color="typeColor(props.value)">{{ props.value }}</q-badge></q-td>
      </template>
      <template v-slot:body-cell-ledger_nature="props">
        <q-td :props="props"><q-badge :color="props.value === 'debit' ? 'red' : props.value === 'credit' ? 'green' : 'blue'">{{ props.value }}</q-badge></q-td>
      </template>
      <template v-slot:body-cell-current_balance="props">
        <q-td :props="props" class="text-weight-bold">LKR {{ Number(props.value).toLocaleString() }}</q-td>
      </template>
      <template v-slot:body-cell-is_active="props">
        <q-td :props="props"><q-badge :color="props.value ? 'green' : 'grey'">{{ props.value ? 'Active' : 'Inactive' }}</q-badge></q-td>
      </template>
      <template v-slot:body-cell-actions="props">
        <q-td :props="props">
          <q-btn flat round size="sm" icon="edit" @click="editLedger(props.row)" />
          <q-btn flat round size="sm" icon="visibility_off" color="red" @click="deactivate(props.row)" v-if="props.row.is_active && !props.row.is_system_ledger" />
        </q-td>
      </template>
    </q-table>

    <LedgerForm v-model="showForm" :ledger="editingLedger" @saved="handleSave" />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceLedgerStore } from '../stores/finance-ledger.store'
import LedgerForm from '../components/LedgerForm.vue'

const $q = useQuasar()
const ledgerStore = useFinanceLedgerStore()
const showForm = ref(false)
const editingLedger = ref(null)
const search = ref('')
const filters = ref({ ledger_type: null })

const filteredLedgers = computed(() => {
  let list = ledgerStore.ledgers
  if (search.value) {
    const s = search.value.toLowerCase()
    list = list.filter(l => l.ledger_name.toLowerCase().includes(s) || l.ledger_code.toLowerCase().includes(s))
  }
  return list
})

const columns = [
  { name: 'ledger_code', label: 'Code', field: 'ledger_code', align: 'left', sortable: true },
  { name: 'ledger_name', label: 'Name', field: 'ledger_name', align: 'left', sortable: true },
  { name: 'ledger_type', label: 'Type', field: 'ledger_type', align: 'left', sortable: true },
  { name: 'ledger_nature', label: 'Nature', field: 'ledger_nature', align: 'left' },
  { name: 'account_group', label: 'Group', field: 'account_group', align: 'left' },
  { name: 'current_balance', label: 'Balance', field: 'current_balance', align: 'right', sortable: true },
  { name: 'is_active', label: 'Status', field: 'is_active', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' },
]

function typeColor(t) { return { asset: 'blue', liability: 'orange', equity: 'purple', income: 'green', expense: 'red' }[t] || 'grey' }
function editLedger(l) { editingLedger.value = l; showForm.value = true }

async function handleSave(form) {
  try {
    if (form._isEdit) await ledgerStore.updateLedger(form._id, form)
    else await ledgerStore.createLedger(form)
    $q.notify({ type: 'positive', message: `Ledger ${form._isEdit ? 'updated' : 'created'}` })
    editingLedger.value = null
  } catch (e) { $q.notify({ type: 'negative', message: e.message }) }
}

async function deactivate(l) {
  $q.dialog({ title: 'Deactivate Ledger?', message: `Deactivate "${l.ledger_name}"?`, cancel: true }).onOk(async () => {
    await ledgerStore.deactivateLedger(l.id)
    $q.notify({ type: 'warning', message: 'Ledger deactivated' })
  })
}

async function loadLedgers() { await ledgerStore.fetchLedgers(filters.value) }
onMounted(loadLedgers)
</script>
