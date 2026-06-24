<template>
  <q-page class="q-pa-md">
    <ErpPageHeader
      title="Stock Adjustment"
      subtitle="Record stock reductions for damage, wastage, theft, or stocktake corrections"
      icon="tune"
      :breadcrumbs="[{ label: 'Inventory' }, { label: 'Stock Adjustment' }]"
    />

    <!-- Adjustment Header Card -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle2 q-mb-md" style="color: var(--erp-text-secondary)">Adjustment Details</div>
        <div class="row q-col-gutter-sm">
          <div class="col-12 col-sm-6 col-md-3">
            <q-input
              v-model="adjustmentDate"
              label="Date *"
              outlined
              dense
              type="date"
            />
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-input
              v-model="referenceNo"
              label="Reference #"
              outlined
              dense
              placeholder="e.g. ADJ-001"
            />
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-select
              v-model="adjustmentReason"
              :options="reasonOptions"
              label="Reason *"
              outlined
              dense
              emit-value
              map-options
            />
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-select
              v-model="selectedWarehouse"
              :options="warehouseOptions"
              label="Warehouse *"
              outlined
              dense
              emit-value
              map-options
              :loading="warehousesLoading"
            />
          </div>
          <div class="col-12">
            <q-input
              v-model="notes"
              label="Notes"
              outlined
              dense
              type="textarea"
              rows="2"
              autogrow
            />
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Line Items Table -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="q-pb-none">
        <div class="row items-center q-mb-sm">
          <div class="text-subtitle2" style="color: var(--erp-text-secondary)">Adjustment Lines</div>
          <q-space />
          <q-btn
            flat no-caps dense
            icon="add"
            label="Add Line"
            color="primary"
            @click="addLine"
          />
        </div>
      </q-card-section>

      <q-table
        flat
        :rows="lines"
        :columns="lineColumns"
        row-key="_key"
        hide-bottom
        :pagination="{ rowsPerPage: 0 }"
      >
        <template #body-cell-item_id="props">
          <q-td :props="props" style="min-width: 220px">
            <q-select
              v-model="props.row.item_id"
              :options="itemOptions"
              dense
              outlined
              emit-value
              map-options
              use-input
              input-debounce="300"
              placeholder="Select item…"
              @filter="filterItems"
              @update:model-value="val => onItemSelected(props.row, val)"
            >
              <template #no-option>
                <q-item>
                  <q-item-section class="text-grey">No items found</q-item-section>
                </q-item>
              </template>
            </q-select>
          </q-td>
        </template>

        <template #body-cell-current_stock="props">
          <q-td :props="props" class="text-right">
            <span class="text-grey-5">{{ props.row.current_stock ?? '–' }}</span>
          </q-td>
        </template>

        <template #body-cell-qty="props">
          <q-td :props="props" style="min-width: 120px">
            <q-input
              v-model.number="props.row.qty"
              type="number"
              dense
              outlined
              min="0.001"
              step="0.001"
              style="width: 110px"
            />
          </q-td>
        </template>

        <template #body-cell-remove="props">
          <q-td :props="props" auto-width>
            <q-btn
              flat round dense
              icon="remove_circle_outline"
              color="negative"
              size="sm"
              aria-label="Remove line"
              @click="removeLine(props.rowIndex)"
            />
          </q-td>
        </template>

        <template #no-data>
          <div class="full-width text-center q-pa-lg text-grey-5">
            <q-icon name="playlist_add" size="36px" class="q-mb-sm" />
            <div>Click "Add Line" to add items</div>
          </div>
        </template>
      </q-table>

      <!-- Footer totals + submit -->
      <q-card-section class="row items-center q-pt-sm">
        <div class="text-body2 text-grey-5">
          Total lines: <strong class="text-white">{{ lines.length }}</strong>
          &nbsp;·&nbsp;
          Total qty: <strong class="text-white">{{ totalQty.toFixed(3) }}</strong>
        </div>
        <q-space />
        <q-btn
          unelevated no-caps
          icon="check_circle"
          label="Post Adjustment"
          color="primary"
          :loading="posting"
          :disable="lines.length === 0"
          @click="postAdjustment"
        />
      </q-card-section>
    </q-card>

    <!-- Posted Adjustments History -->
    <q-card flat bordered>
      <q-card-section class="row items-center">
        <div class="text-subtitle2" style="color: var(--erp-text-secondary)">Recent Adjustments (last 30 days)</div>
        <q-space />
        <q-btn flat round dense icon="refresh" size="sm" :loading="historyLoading" @click="fetchHistory">
          <q-tooltip>Refresh</q-tooltip>
        </q-btn>
      </q-card-section>

      <q-table
        flat
        :rows="history"
        :columns="historyColumns"
        row-key="id"
        :loading="historyLoading"
        :pagination="{ rowsPerPage: 15 }"
      >
        <template #loading>
          <q-inner-loading showing color="primary" />
        </template>
        <template #body-cell-quantity="props">
          <q-td :props="props" class="text-right">
            <span :class="props.row.quantity < 0 ? 'text-negative' : 'text-positive'">
              {{ Number(props.row.quantity).toFixed(3) }}
            </span>
          </q-td>
        </template>
        <template #no-data>
          <div class="full-width text-center q-pa-md text-grey-5">No adjustments in the last 30 days.</div>
        </template>
      </q-table>
    </q-card>

    <q-inner-loading :showing="posting" label="Posting adjustment…" label-class="text-primary" />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar, date } from 'quasar'
import ErpPageHeader from 'components/common/ErpPageHeader.vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

const $q         = useQuasar()
const authStore  = useAuthStore()

// ── Header state ──────────────────────────────────────────────────────────────
const adjustmentDate   = ref(date.formatDate(new Date(), 'YYYY-MM-DD'))
const referenceNo      = ref('')
const adjustmentReason = ref('Wastage')
const selectedWarehouse = ref(null)
const notes            = ref('')

const reasonOptions = [
  { label: 'Damage',                value: 'Damage' },
  { label: 'Wastage',               value: 'Wastage' },
  { label: 'Theft',                 value: 'Theft' },
  { label: 'Stocktake Correction',  value: 'Stocktake Correction' },
  { label: 'Other',                 value: 'Other' },
]

// ── Warehouses ────────────────────────────────────────────────────────────────
const warehousesLoading = ref(false)
const warehouseOptions  = ref([])

async function fetchWarehouses() {
  warehousesLoading.value = true
  try {
    const { data, error } = await supabase
      .from('warehouses')
      .select('id, name')
      .eq('company_id', authStore.companyId)
      .eq('branch_id',  authStore.branchId)
      .order('name')
    if (error) throw error
    warehouseOptions.value = (data || []).map(w => ({ label: w.name, value: w.id }))
    if (warehouseOptions.value.length) {
      selectedWarehouse.value = warehouseOptions.value[0].value
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Failed to load warehouses: ' + e.message })
  } finally {
    warehousesLoading.value = false
  }
}

// ── Items for select ──────────────────────────────────────────────────────────
const allItems    = ref([])
const itemOptions = ref([])

async function fetchAllItems() {
  const { data } = await supabase
    .from('ingredients')
    .select('id, name, code, uom')
    .eq('company_id', authStore.companyId)
    .eq('branch_id',  authStore.branchId)
    .eq('is_active', true)
    .order('name')
  allItems.value = data || []
  itemOptions.value = allItems.value.map(i => ({
    label: `${i.code} — ${i.name}`,
    value: i.id,
    item:  i,
  }))
}

function filterItems(val, update) {
  update(() => {
    const q = val.toLowerCase()
    itemOptions.value = allItems.value
      .filter(i => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q))
      .map(i => ({ label: `${i.code} — ${i.name}`, value: i.id, item: i }))
  })
}

// ── Lines ─────────────────────────────────────────────────────────────────────
let _keyCounter = 0
const lines = ref([])
const posting = ref(false)

function addLine() {
  lines.value.push({ _key: ++_keyCounter, item_id: null, uom: '', qty: 1, current_stock: null })
}

function removeLine(idx) {
  lines.value.splice(idx, 1)
}

async function onItemSelected(row, itemId) {
  const found = allItems.value.find(i => i.id === itemId)
  if (found) row.uom = found.uom

  if (itemId && selectedWarehouse.value) {
    const { data } = await supabase
      .from('stock_levels')
      .select('quantity')
      .eq('item_id', itemId)
      .eq('warehouse_id', selectedWarehouse.value)
      .maybeSingle()
    row.current_stock = data ? Number(data.quantity) : 0
  }
}

const totalQty = computed(() => lines.value.reduce((s, l) => s + (Number(l.qty) || 0), 0))

const lineColumns = [
  { name: 'item_id',       label: 'Item',          field: 'item_id',       align: 'left' },
  { name: 'uom',           label: 'UOM',           field: 'uom',           align: 'center' },
  { name: 'current_stock', label: 'Current Stock', field: 'current_stock', align: 'right' },
  { name: 'qty',           label: 'Adj. Qty',      field: 'qty',           align: 'left' },
  { name: 'remove',        label: '',              field: 'remove',        align: 'center' },
]

// ── Post ──────────────────────────────────────────────────────────────────────
async function postAdjustment() {
  if (!selectedWarehouse.value) {
    $q.notify({ type: 'warning', message: 'Please select a warehouse.' })
    return
  }
  if (!adjustmentReason.value) {
    $q.notify({ type: 'warning', message: 'Please select a reason.' })
    return
  }
  const validLines = lines.value.filter(l => l.item_id && Number(l.qty) > 0)
  if (!validLines.length) {
    $q.notify({ type: 'warning', message: 'Add at least one valid line.' })
    return
  }

  posting.value = true
  try {
    for (const row of validLines) {
      // Insert movement
      const { error: mvErr } = await supabase.from('stock_movements').insert({
        item_id:       row.item_id,
        warehouse_id:  selectedWarehouse.value,
        quantity:      -Math.abs(Number(row.qty)),
        movement_type: 'adjustment',
        reason:        adjustmentReason.value,
        notes:         notes.value || null,
        created_at:    new Date(adjustmentDate.value).toISOString(),
        company_id:    authStore.companyId,
        branch_id:     authStore.branchId,
      })
      if (mvErr) throw mvErr

      // Update stock level
      const currentQty = row.current_stock ?? 0
      const newQty     = Math.max(0, currentQty - Math.abs(Number(row.qty)))

      const { error: slErr } = await supabase.from('stock_levels').upsert(
        {
          item_id:      row.item_id,
          warehouse_id: selectedWarehouse.value,
          quantity:     newQty,
        },
        { onConflict: 'item_id,warehouse_id' }
      )
      if (slErr) throw slErr
    }

    $q.notify({ type: 'positive', message: `Adjustment posted — ${validLines.length} line(s).` })

    // Reset form
    lines.value      = []
    referenceNo.value = ''
    notes.value       = ''
    adjustmentDate.value = date.formatDate(new Date(), 'YYYY-MM-DD')

    await fetchHistory()
  } catch (e) {
    console.error('[StockAdjustmentPage] postAdjustment', e)
    $q.notify({ type: 'negative', message: 'Posting failed: ' + e.message })
  } finally {
    posting.value = false
  }
}

// ── History ───────────────────────────────────────────────────────────────────
const history        = ref([])
const historyLoading = ref(false)

const historyColumns = [
  { name: 'created_at',    label: 'Date',      field: 'created_at',    align: 'left', sortable: true,
    format: v => date.formatDate(new Date(v), 'DD MMM YYYY HH:mm') },
  { name: 'item_name',     label: 'Item',      field: r => r.ingredients?.name ?? '–', align: 'left' },
  { name: 'warehouse',     label: 'Warehouse', field: r => r.warehouses?.name ?? '–',  align: 'left' },
  { name: 'quantity',      label: 'Qty',       field: 'quantity',      align: 'right', sortable: true },
  { name: 'reason',        label: 'Reason',    field: 'reason',        align: 'left' },
  { name: 'notes',         label: 'Notes',     field: 'notes',         align: 'left' },
]

async function fetchHistory() {
  historyLoading.value = true
  try {
    const since = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*, ingredients(name), warehouses(name)')
      .eq('movement_type', 'adjustment')
      .eq('company_id', authStore.companyId)
      .eq('branch_id',  authStore.branchId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    history.value = data || []
  } catch (e) {
    console.error('[StockAdjustmentPage] fetchHistory', e)
  } finally {
    historyLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([fetchWarehouses(), fetchAllItems(), fetchHistory()])
})
</script>
