<template>
  <div class="q-pa-md">
    <ERPToolbar
      moduleName="inventory"
      title="Wastage Management"
      breadcrumbs="Supply Chain / Wastage"
    />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg items-stretch">
      <div v-for="(stat, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-3">
        <DashboardCard v-bind="stat" />
      </div>
    </div>

    <!-- Action Bar -->
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-btn
        unelevated no-caps
        color="deep-orange"
        icon="add_circle"
        label="Record Wastage"
        @click="showNewWastage = true"
      />
      <q-space />
      <q-select
        v-model="filterWarehouse"
        :options="warehouseOptions"
        label="Warehouse"
        emit-value map-options clearable dense outlined
        :dark="$q.dark.isActive"
        style="min-width: 200px"
        @update:model-value="loadData"
      />
      <q-select
        v-model="filterCategory"
        :options="categoryOptions"
        label="Category"
        emit-value map-options clearable dense outlined
        :dark="$q.dark.isActive"
        style="min-width: 160px"
        @update:model-value="loadData"
      />
      <q-input
        v-model="filterSearch"
        label="Search items..."
        dense outlined clearable
        :dark="$q.dark.isActive"
        style="min-width: 200px"
        @update:model-value="loadData"
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
      <q-input
        v-model="filterDateFrom"
        label="From" type="date" dense outlined
        :dark="$q.dark.isActive"
        style="min-width: 150px"
        @update:model-value="loadData"
      />
      <q-input
        v-model="filterDateTo"
        label="To" type="date" dense outlined
        :dark="$q.dark.isActive"
        style="min-width: 150px"
        @update:model-value="loadData"
      />
    </div>

    <!-- Wastage Table -->
    <q-card class="bg-dark text-white" flat bordered>
      <q-table
        :rows="rows"
        :columns="columns"
        row-key="document_id"
        flat dense
        :dark="$q.dark.isActive"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100]"
        :pagination="{ rowsPerPage: 50 }"
        table-header-class="text-grey-5 text-uppercase"
        binary-state-sort
      >
        <template #body-cell-wastage_reason="props">
          <q-td :props="props">
            <q-badge
              :color="reasonColor(props.row.wastage_reason)"
              :label="reasonLabel(props.row.wastage_reason)"
            />
          </q-td>
        </template>
        <template #body-cell-quantity="props">
          <q-td :props="props" class="text-red text-weight-bold">
            −{{ Number(props.row.quantity).toFixed(2) }}
          </q-td>
        </template>
        <template #body-cell-total_cost="props">
          <q-td :props="props" class="text-red text-weight-bolder">
            {{ fmtLKR(props.row.total_cost) }}
          </q-td>
        </template>
        <template #body-cell-posted_at="props">
          <q-td :props="props">
            {{ fmtDateTime(props.row.posted_at) }}
          </q-td>
        </template>
        <template #bottom-row>
          <q-tr class="bg-grey-10 text-white text-weight-bold">
            <q-td>TOTAL</q-td>
            <q-td /><q-td />
            <q-td class="text-red text-right">
              −{{ totalQty.toFixed(2) }}
            </q-td>
            <q-td /><q-td />
            <q-td class="text-red text-right">{{ fmtLKR(totalLoss) }}</q-td>
            <q-td colspan="3" />
          </q-tr>
        </template>
        <template #no-data>
          <div class="column items-center q-pa-xl text-grey-6">
            <q-icon name="delete_sweep" size="56px" class="q-mb-md" />
            <div class="text-h6">No wastage entries found</div>
            <div class="text-caption">Click "Record Wastage" to log daily waste</div>
          </div>
        </template>
      </q-table>
    </q-card>

    <!-- ═══════ New Wastage Dialog ═══════ -->
    <q-dialog v-model="showNewWastage" persistent maximized transition-show="slide-up" transition-hide="slide-down">
      <q-card class="bg-dark text-white column no-wrap" style="max-width: 1100px; margin: auto">
        <!-- Header -->
        <div class="wastage-dialog-header">
          <div class="row items-center">
            <q-icon name="delete_sweep" size="28px" color="deep-orange" class="q-mr-sm" />
            <div>
              <div class="text-h6 text-weight-bolder">Record Daily Wastage</div>
              <div class="text-caption text-grey-5">Add items wasted from kitchen or warehouse</div>
            </div>
            <q-space />
            <q-btn flat round icon="close" color="grey-5" @click="resetAndClose" />
          </div>
        </div>

        <q-card-section class="q-pa-lg col scroll">
          <!-- Form -->
          <div class="row q-col-gutter-md q-mb-lg">
            <div class="col-12 col-md-4">
              <q-select
                v-model="form.warehouse_id"
                :options="warehouseOptions"
                label="Warehouse / Kitchen *"
                emit-value map-options outlined
                :dark="$q.dark.isActive"
                :rules="[v => !!v || 'Required']"
              />
            </div>
            <div class="col-12 col-md-4">
              <q-select
                v-model="form.wastage_category"
                :options="categoryOptions"
                label="Wastage Category *"
                emit-value map-options outlined
                :dark="$q.dark.isActive"
                :rules="[v => !!v || 'Required']"
              />
            </div>
            <div class="col-12 col-md-4">
              <q-input
                v-model="form.remarks"
                label="Remarks / Notes"
                outlined
                :dark="$q.dark.isActive"
              />
            </div>
          </div>

          <!-- Line items -->
          <div class="text-subtitle1 text-weight-bold q-mb-sm">
            <q-icon name="list_alt" class="q-mr-xs" /> Wastage Items
            <q-badge color="deep-orange" class="q-ml-sm">{{ form.items.length }}</q-badge>
          </div>

          <div
            v-for="(item, idx) in form.items"
            :key="idx"
            class="wastage-line-row"
          >
            <div class="row q-col-gutter-sm items-start">
              <div class="col-12 col-md-3">
                <q-select
                  v-model="item.item_id"
                  :options="itemOptions"
                  label="Item *"
                  emit-value map-options outlined dense
                  use-input fill-input hide-selected
                  input-debounce="150"
                  :dark="$q.dark.isActive"
                  @filter="(val, update) => { itemSearch = val; update() }"
                  @update:model-value="onItemPicked(idx, $event)"
                />
              </div>
              <div class="col-6 col-md-2">
                <q-input
                  v-model.number="item.quantity"
                  label="Qty *"
                  type="number" min="0.01" step="0.01"
                  outlined dense :dark="$q.dark.isActive"
                />
              </div>
              <div class="col-6 col-md-2">
                <q-input
                  v-model.number="item.unit_cost"
                  label="Unit Cost"
                  type="number" min="0" step="0.01"
                  outlined dense :dark="$q.dark.isActive"
                  prefix="LKR"
                />
              </div>
              <div class="col-12 col-md-2">
                <q-select
                  v-model="item.wastage_reason"
                  :options="reasonOptions"
                  label="Reason *"
                  emit-value map-options outlined dense
                  :dark="$q.dark.isActive"
                />
              </div>
              <div class="col-10 col-md-2">
                <q-input
                  v-model="item.notes"
                  label="Notes"
                  outlined dense :dark="$q.dark.isActive"
                />
              </div>
              <div class="col-2 col-md-1 self-center text-center">
                <q-btn flat round dense icon="delete" color="negative" size="sm" @click="removeLine(idx)" />
              </div>
            </div>
            <div v-if="item.quantity && item.unit_cost" class="text-caption text-red q-mt-xs q-ml-sm">
              Loss: LKR {{ (item.quantity * item.unit_cost).toFixed(2) }}
            </div>
          </div>

          <q-btn
            flat no-caps color="positive"
            icon="add_circle" label="Add Item"
            class="q-mt-sm"
            @click="addLine"
          />

          <!-- Grand Total -->
          <div class="row justify-end q-mt-lg">
            <div class="wastage-grand-total">
              <span class="text-grey-5">Total Wastage Loss:</span>
              <span class="text-h5 text-red text-weight-bolder q-ml-md">
                LKR {{ grandTotal.toFixed(2) }}
              </span>
            </div>
          </div>
        </q-card-section>

        <!-- Actions -->
        <q-card-actions class="q-pa-lg bg-grey-10" align="right">
          <q-btn flat no-caps label="Cancel" color="grey-5" @click="resetAndClose" />
          <q-btn
            unelevated no-caps
            label="Save as Draft"
            color="grey-7"
            icon="save"
            :loading="saving"
            @click="saveWastage(false)"
          />
          <q-btn
            unelevated no-caps
            label="Save & Post"
            color="deep-orange"
            icon="verified"
            :loading="saving"
            @click="saveWastage(true)"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardCard from 'components/dashboard/DashboardCard.vue'
import {
  fetchWastageEntries,
  fetchWastageStats,
  createWastageDocument,
  postDocument,
  useWarehouseList,
  useItemsList,
} from 'src/services/inventoryService'

const $q = useQuasar()
const loading = ref(false)
const saving = ref(false)
const rows = ref([])
const showNewWastage = ref(false)
const itemSearch = ref('')

// Filters
const filterWarehouse = ref(null)
const filterCategory = ref(null)
const filterSearch = ref('')
const filterDateFrom = ref('')
const filterDateTo = ref('')

// KPI
const kpis = ref([
  { title: 'Today Wastage', value: '–', icon: 'today', color: 'orange', isCurrency: true },
  { title: 'Total Entries', value: '–', icon: 'receipt_long', color: 'red', isCurrency: false },
  { title: 'Total Qty Wasted', value: '–', icon: 'trending_down', color: 'purple', isCurrency: false },
  { title: 'Total Loss', value: '–', icon: 'money_off', color: 'red', isCurrency: true },
])

// Data
const { warehouses, listWarehouses } = useWarehouseList()
const { items, listItems } = useItemsList()

const warehouseOptions = computed(() =>
  warehouses.value.map(w => ({ label: `${w.name} (${w.code})`, value: w.id }))
)

const itemOptions = computed(() => {
  const needle = itemSearch.value?.toLowerCase() || ''
  const all = items.value.map(i => ({
    label: `${i.code} — ${i.name}`,
    value: i.id,
  }))
  if (!needle) return all
  return all.filter(o => o.label.toLowerCase().includes(needle))
})

const categoryOptions = [
  { label: '🍳 Kitchen', value: 'kitchen' },
  { label: '📦 Storage', value: 'storage' },
  { label: '🔪 Preparation', value: 'preparation' },
  { label: '🍽️ Service', value: 'service' },
  { label: '📋 Other', value: 'other' },
]

const reasonOptions = [
  { label: 'Spoilage', value: 'spoilage' },
  { label: 'Expired', value: 'expired' },
  { label: 'Damaged', value: 'damaged' },
  { label: 'Overproduction', value: 'overproduction' },
  { label: 'Preparation Loss', value: 'preparation_loss' },
  { label: 'Spillage', value: 'spillage' },
  { label: 'Customer Return', value: 'customer_return' },
  { label: 'Other', value: 'other' },
]

const columns = [
  { name: 'doc_number', label: 'Doc #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'item_name', label: 'Item', field: 'item_name', align: 'left', sortable: true },
  { name: 'warehouse_name', label: 'Warehouse', field: 'warehouse_name', align: 'left', sortable: true },
  { name: 'quantity', label: 'Qty Wasted', field: 'quantity', align: 'right', sortable: true },
  { name: 'wastage_reason', label: 'Reason', field: 'wastage_reason', align: 'center' },
  { name: 'unit_cost', label: 'Unit Cost', field: r => fmtLKR(r.unit_cost), align: 'right' },
  { name: 'total_cost', label: 'Total Loss', field: 'total_cost', align: 'right', sortable: true },
  { name: 'posted_at', label: 'Date', field: 'posted_at', align: 'left', sortable: true },
  { name: 'posted_by_name', label: 'By', field: 'posted_by_name', align: 'left' },
  { name: 'line_notes', label: 'Notes', field: 'line_notes', align: 'left' },
]

const totalQty = computed(() => rows.value.reduce((s, r) => s + Number(r.quantity || 0), 0))
const totalLoss = computed(() => rows.value.reduce((s, r) => s + Number(r.total_cost || 0), 0))

// ── New Wastage Form ──
const emptyLine = () => ({
  item_id: '', quantity: 0, unit_cost: 0, uom_id: '', wastage_reason: 'spoilage', notes: '',
})

const form = ref({
  warehouse_id: '',
  wastage_category: 'kitchen',
  remarks: '',
  items: [emptyLine()],
})

const grandTotal = computed(() =>
  form.value.items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_cost) || 0), 0)
)

function addLine() {
  form.value.items.push(emptyLine())
}

function removeLine(idx) {
  if (form.value.items.length <= 1) return
  form.value.items.splice(idx, 1)
}

function onItemPicked(idx, itemId) {
  const item = items.value.find(i => i.id === itemId)
  if (item) {
    form.value.items[idx].unit_cost = item.avg_cost || item.last_purchase_price || 0
    form.value.items[idx].uom_id = item.inventory_uom_id || item.uom_id || ''
  }
}

function resetAndClose() {
  form.value = {
    warehouse_id: '',
    wastage_category: 'kitchen',
    remarks: '',
    items: [emptyLine()],
  }
  showNewWastage.value = false
}

async function saveWastage(autoPost) {
  if (!form.value.warehouse_id) {
    $q.notify({ type: 'warning', message: 'Please select a warehouse.' })
    return
  }
  const validItems = form.value.items.filter(i => i.item_id && i.quantity > 0)
  if (validItems.length === 0) {
    $q.notify({ type: 'warning', message: 'Add at least one item with qty > 0.' })
    return
  }

  saving.value = true
  try {
    const doc = await createWastageDocument(
      form.value.warehouse_id,
      form.value.wastage_category,
      validItems,
      form.value.remarks,
    )

    if (autoPost) {
      await postDocument(doc.id)
      $q.notify({ type: 'positive', message: `Wastage ${doc.doc_number} posted! Stock deducted.`, icon: 'verified' })
    } else {
      $q.notify({ type: 'positive', message: `Draft ${doc.doc_number} saved.` })
    }

    resetAndClose()
    await loadData()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'Failed to save wastage.' })
  } finally {
    saving.value = false
  }
}

// ── Helpers ──
function fmtLKR(val) {
  return 'LKR ' + Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDateTime(ts) {
  if (!ts) return '–'
  const d = new Date(ts)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function reasonColor(r) {
  const map = {
    spoilage: 'red', expired: 'deep-orange', damaged: 'orange',
    overproduction: 'amber', preparation_loss: 'blue-grey',
    spillage: 'purple', customer_return: 'indigo', other: 'grey',
  }
  return map[r] || 'grey'
}

function reasonLabel(r) {
  const map = {
    spoilage: 'Spoilage', expired: 'Expired', damaged: 'Damaged',
    overproduction: 'Overprod.', preparation_loss: 'Prep Loss',
    spillage: 'Spillage', customer_return: 'Return', other: 'Other',
  }
  return map[r] || r || '—'
}

async function loadData() {
  loading.value = true
  try {
    const [entries, stats] = await Promise.all([
      fetchWastageEntries({
        dateFrom: filterDateFrom.value || undefined,
        dateTo: filterDateTo.value || undefined,
        warehouseId: filterWarehouse.value || undefined,
        wastageCategory: filterCategory.value || undefined,
        search: filterSearch.value || undefined,
      }),
      fetchWastageStats(filterDateFrom.value || undefined, filterDateTo.value || undefined),
    ])

    rows.value = entries
    kpis.value[0].value = Number(stats.todayLoss).toLocaleString('en-LK', { minimumFractionDigits: 0 })
    kpis.value[1].value = String(stats.totalEntries)
    kpis.value[2].value = Number(stats.totalQty).toFixed(1)
    kpis.value[3].value = Number(stats.totalLoss).toLocaleString('en-LK', { minimumFractionDigits: 0 })
  } catch (e) {
    console.error('[WastageTab] loadData error:', e)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await Promise.all([listWarehouses(), listItems()])
  await loadData()
})
</script>

<style scoped lang="scss">
.wastage-dialog-header {
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  background: linear-gradient(135deg, rgba(255,87,34,0.12), rgba(244,67,54,0.06));
}

.wastage-line-row {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 8px;
  transition: border-color 0.2s;

  &:hover {
    border-color: rgba(255,87,34,0.3);
  }
}

.wastage-grand-total {
  background: rgba(244,67,54,0.08);
  border: 1px solid rgba(244,67,54,0.2);
  border-radius: 10px;
  padding: 16px 24px;
  display: flex;
  align-items: center;
}
</style>
