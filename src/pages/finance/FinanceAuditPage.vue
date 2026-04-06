<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="Finance Audit Log"
      breadcrumbs="Finance / Reports & Audit / Audit Log"
      showRefresh
      @refresh="loadData"
    />

    <div class="fin-filters q-mb-md">
      <q-select
        v-model="filterEntity"
        :options="entityTypes"
        label="Entity Type"
        dense
        dark
        outlined
        style="min-width: 180px"
        clearable
      />
      <q-input
        v-model="dateFrom"
        label="From"
        type="date"
        dense
        dark
        outlined
        style="min-width: 150px"
      />
      <q-input
        v-model="dateTo"
        label="To"
        type="date"
        dense
        dark
        outlined
        style="min-width: 150px"
      />
      <q-btn flat dense icon="filter_list_off" color="grey-5" @click="resetFilters" />
    </div>

    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Audit Trail ({{ logs.length }})</span>
      </div>
      <q-table
        :rows="logs"
        :columns="columns"
        row-key="id"
        flat
        dark
        dense
        :rows-per-page-options="[25, 50]"
        class="fin-table"
        :loading="loading"
        no-data-label="No audit entries"
      >
        <template #body-cell-action="props">
          <q-td :props="props">
            <span :class="actionClass(props.row.action)">{{ props.row.action }}</span>
          </q-td>
        </template>
        <template #body-cell-details="props">
          <q-td :props="props">
            <q-btn
              v-if="props.row.old_values || props.row.new_values"
              flat
              dense
              icon="info"
              size="sm"
              color="grey-5"
              @click="showDetail(props.row)"
              ><q-tooltip>View Changes</q-tooltip></q-btn
            >
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- Detail Dialog -->
    <q-dialog v-model="showDialog" class="fin-dialog">
      <q-card dark style="min-width: 500px; background: #161b22; border: 1px solid #30363d">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold text-white">Audit Detail</div>
          <div class="text-caption text-grey-5 q-mt-xs">{{ selectedLog?.description }}</div>
        </q-card-section>
        <q-card-section>
          <div class="row q-col-gutter-md">
            <div class="col" v-if="selectedLog?.old_values">
              <div class="text-caption text-red-4 q-mb-xs">Old Values</div>
              <q-markup-table dense dark flat bordered class="bg-transparent" separator="horizontal">
                <tbody>
                  <tr v-for="(val, key) in selectedLog.old_values" :key="key">
                    <td class="text-grey-5" style="width: 40%; font-size: 11px">{{ formatAuditKey(key) }}</td>
                    <td class="text-white text-right" style="font-size: 11px; white-space: normal; word-break: break-all;">{{ formatAuditValue(val) }}</td>
                  </tr>
                </tbody>
              </q-markup-table>
            </div>
            <div class="col" v-if="selectedLog?.new_values">
              <div class="text-caption text-green-4 q-mb-xs">New Values</div>
              <q-markup-table dense dark flat bordered class="bg-transparent" separator="horizontal">
                <tbody>
                  <tr v-for="(val, key) in selectedLog.new_values" :key="key">
                    <td class="text-grey-5" style="width: 40%; font-size: 11px">{{ formatAuditKey(key) }}</td>
                    <td class="text-white text-right" style="font-size: 11px; white-space: normal; word-break: break-all;">{{ formatAuditValue(val) }}</td>
                  </tr>
                </tbody>
              </q-markup-table>
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right"
          ><q-btn flat label="Close" color="grey-5" v-close-popup
        /></q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { fetchFinanceAuditLogs } from 'src/services/financeService'

const loading = ref(false)
const logs = ref([])
const filterEntity = ref(null)
const dateFrom = ref('')
const dateTo = ref('')
const showDialog = ref(false)
const selectedLog = ref(null)
const entityTypes = [
  'journal_entry',
  'expense',
  'payment',
  'payroll',
  'bank_account',
  'tax',
  'account',
  'invoice',
]

const columns = [
  {
    name: 'timestamp',
    label: 'Timestamp',
    field: 'created_at',
    align: 'left',
    sortable: true,
    style: 'width: 180px',
    format: (v) => (v ? new Date(v).toLocaleString() : '-'),
  },
  {
    name: 'user',
    label: 'User',
    field: (row) => row.profiles?.full_name || row.profiles?.email || '-',
    align: 'left',
  },
  { name: 'action', label: 'Action', field: 'action', align: 'center', style: 'width: 100px' },
  {
    name: 'entity_type',
    label: 'Entity',
    field: 'entity_type',
    align: 'left',
    style: 'width: 120px',
  },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'details', label: '', align: 'center', style: 'width: 50px' },
]

function actionClass(a) {
  const m = {
    create: 'fin-badge fin-badge--success',
    update: 'fin-badge fin-badge--info',
    delete: 'fin-badge fin-badge--danger',
    reverse: 'fin-badge fin-badge--warning',
    approve: 'fin-badge fin-badge--success',
    post: 'fin-badge fin-badge--info',
  }
  return m[a] || 'fin-badge fin-badge--muted'
}

function resetFilters() {
  filterEntity.value = null
  dateFrom.value = ''
  dateTo.value = ''
  loadData()
}
function showDetail(row) {
  selectedLog.value = row
  showDialog.value = true
}

function formatAuditValue(val) {
  if (val === null || val === undefined) return '-'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  if (typeof val === 'object') return JSON.stringify(val)
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
    return new Date(val).toLocaleString()
  }
  return String(val)
}

function formatAuditKey(key) {
  if (!key) return ''
  return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

async function loadData() {
  loading.value = true
  const { data } = await fetchFinanceAuditLogs({
    entityType: filterEntity.value || undefined,
    dateFrom: dateFrom.value || undefined,
    dateTo: dateTo.value || undefined,
  })
  logs.value = data || []
  loading.value = false
}
onMounted(loadData)
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
