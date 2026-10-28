<template>
  <q-page class="q-pa-md finance-page">
    <FinancePageHeader
      icon="fact_check"
      subtitle="Who changed what in Finance — vouchers, journals, ledgers and periods"
      title="Finance Audit Log"
      breadcrumbs="Finance / Reports & Audit / Audit Log"
      show-refresh
      @refresh="loadData"
    />

    <FinanceFilterBar
      v-model:from="dateFrom"
      v-model:to="dateTo"
      v-model:search="search"
      show-search
      search-placeholder="Search user, action, description"
      :presets="['today', 'last_30', 'this_month', 'last_month', 'this_fy']"
      default-preset="last_30"
      persist-key="finance-audit"
      @change="onFilterChange"
      @reset="resetFilters"
    >
      <q-select
        v-model="filterEntity"
        :options="entityOptions"
        label="Entity type"
        dense
        outlined
        style="min-width: 200px"
        clearable
        emit-value
        map-options
        @update:model-value="loadData"
      />
      <template #actions>
        <FinanceExportMenu
          :columns="exportColumns"
          :rows="filteredLogs"
          title="Finance Audit Log"
          :subtitle="rangeLabel(dateFrom, dateTo)"
          filename="finance_audit_log"
        />
      </template>
    </FinanceFilterBar>

    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Audit Trail ({{ filteredLogs.length }})</span>
      </div>
      <q-table
        :rows="filteredLogs"
        :columns="columns"
        row-key="id"
        flat
        dense
        :rows-per-page-options="[25, 50, 100, 0]"
        class="fin-table"
        :loading="loading"
        no-data-label="No audit entries"
      >
        <template #body-cell-action="props">
          <q-td :props="props">
            <span :class="actionClass(props.row.action)">{{ humanize(props.row.action) }}</span>
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
      <q-card style="width: 500px; max-width: 95vw; background: var(--erp-bg-card); border: 1px solid var(--erp-border)">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold">Audit Detail</div>
          <div class="text-caption text-grey-5 q-mt-xs">{{ selectedLog?.description }}</div>
        </q-card-section>
        <q-card-section>
          <div class="row q-col-gutter-md">
            <div class="col" v-if="selectedLog?.old_values">
              <div class="text-caption text-red-4 q-mb-xs">Old Values</div>
              <q-markup-table dense flat bordered class="bg-transparent" separator="horizontal">
                <tbody>
                  <tr v-for="(val, key) in selectedLog.old_values" :key="key">
                    <td class="text-grey-5" style="width: 40%; font-size: 11px">{{ formatAuditKey(key) }}</td>
                    <td class=" text-right" style="font-size: 11px; white-space: normal; word-break: break-all;">{{ formatAuditValue(val) }}</td>
                  </tr>
                </tbody>
              </q-markup-table>
            </div>
            <div class="col" v-if="selectedLog?.new_values">
              <div class="text-caption text-green-4 q-mb-xs">New Values</div>
              <q-markup-table dense flat bordered class="bg-transparent" separator="horizontal">
                <tbody>
                  <tr v-for="(val, key) in selectedLog.new_values" :key="key">
                    <td class="text-grey-5" style="width: 40%; font-size: 11px">{{ formatAuditKey(key) }}</td>
                    <td class=" text-right" style="font-size: 11px; white-space: normal; word-break: break-all;">{{ formatAuditValue(val) }}</td>
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
import { ref, computed, onMounted } from 'vue'
import FinancePageHeader from 'src/modules/finance/components/FinancePageHeader.vue'
import FinanceFilterBar from 'src/modules/finance/components/FinanceFilterBar.vue'
import FinanceExportMenu from 'src/modules/finance/components/FinanceExportMenu.vue'
import { presetRange, rangeLabel } from 'src/modules/finance/utils/finance-dates'
import { Notify } from 'quasar'
import {
  financeAuditService,
  actionKind,
} from 'src/modules/finance/services/finance-audit.service'

const loading = ref(false)
const logs = ref([])
const filterEntity = ref(null)
// Bounded by default (last 30 days, Sri Lanka time) so the log never loads unbounded history.
const defaultRange = () => presetRange('last_30')
const dateFrom = ref(defaultRange().from)
const dateTo = ref(defaultRange().to)
const search = ref('')
const showDialog = ref(false)
const selectedLog = ref(null)
// entity_type values actually written by logFinanceAudit + payroll postings
const entityTypes = [
  'finance_voucher',
  'finance_ledger',
  'finance_account',
  'finance_cheque',
  'bank_reconciliation',
  'journal_entry',
  'payroll_run',
]
const humanize = (v) => (v ? String(v).replace(/_/g, ' ').replace(/\bw/g, (c) => c.toUpperCase()) : '-')
const entityOptions = entityTypes.map((v) => ({ value: v, label: humanize(v) }))

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
    field: 'user_name',
    align: 'left',
  },
  { name: 'action', label: 'Action', field: 'action', align: 'center', style: 'width: 140px' },
  { name: 'source', label: 'Source', field: 'source', align: 'center', style: 'width: 80px' },
  {
    name: 'entity_type',
    label: 'Entity',
    field: 'entity_type',
    format: (v) => humanize(v),
    align: 'left',
    style: 'width: 120px',
  },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'details', label: '', align: 'center', style: 'width: 50px' },
]

function actionClass(a) {
  return `fin-badge fin-badge--${actionKind(a)}`
}

// Client-side search over the loaded window (dates/entity are server-side).
const filteredLogs = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return logs.value
  return logs.value.filter((r) =>
    [r.user_name, r.action, r.entity_type, r.description, r.source]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})
const exportColumns = computed(() => columns.filter((c) => c.name !== 'details'))

let lastRange = ''
// Search is local; only re-query when the date range changed.
function onFilterChange({ from, to }) {
  const key = `${from}|${to}`
  if (key !== lastRange) loadData()
}

// Dates/search are reset by FinanceFilterBar (it then emits change).
function resetFilters() {
  filterEntity.value = null
  lastRange = '' // force the reload that follows the bar's change event
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
  lastRange = `${dateFrom.value}|${dateTo.value}`
  try {
    const { rows, warnings } = await financeAuditService.fetchLogs({
      entityType: filterEntity.value || undefined,
      dateFrom: dateFrom.value || undefined,
      dateTo: dateTo.value || undefined,
    })
    logs.value = rows
    if (warnings.length) console.warn('[FinanceAudit]', warnings)
  } catch (e) {
    logs.value = []
    Notify.create({ type: 'negative', message: `Could not load audit log: ${e?.message || e}` })
  } finally {
    loading.value = false
  }
}
onMounted(loadData)
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
