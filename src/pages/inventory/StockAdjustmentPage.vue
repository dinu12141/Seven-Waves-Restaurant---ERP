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
              v-model="adjustmentDirection"
              :options="directionOptions"
              label="Direction *"
              outlined
              dense
              emit-value
              map-options
            >
              <template #prepend>
                <q-icon
                  :name="adjustmentDirection === 'increase' ? 'add_circle' : 'remove_circle'"
                  :color="adjustmentDirection === 'increase' ? 'positive' : 'negative'"
                />
              </template>
            </q-select>
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
        bordered
        class="erp-table"
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
        bordered
        class="erp-table"
        :rows="historyEntries"
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
            <span :class="props.row.direction === 'OUT' ? 'text-negative' : 'text-positive'">
              {{ props.row.direction === 'OUT' ? '-' : '+' }}{{ Number(props.row.quantity).toFixed(3) }}
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
import { ref, computed, onMounted, watch } from 'vue'
import { invBusinessDate, invAddDays } from 'src/services/inventory/inventoryHelpers'
import { useQuasar, date } from 'quasar'
import ErpPageHeader from 'components/common/ErpPageHeader.vue'
import {
  useItemsList,
  useWarehouseList,
  fetchStockByWarehouse,
  createDocument,
  postDocument,
  useStockLedger,
} from 'src/services/inventoryService'

const $q = useQuasar()

// ── Service composables ───────────────────────────────────────────────────────
const { items: allItemsRaw, listItems } = useItemsList()
const { warehouses, loading: warehousesLoading, listWarehouses } = useWarehouseList()
const { entries: historyEntries, loading: historyLoading, fetchLedger } = useStockLedger()

// ── Header state ──────────────────────────────────────────────────────────────
const adjustmentDate    = ref(date.formatDate(new Date(), 'YYYY-MM-DD'))
const referenceNo       = ref('')
const adjustmentReason  = ref('Wastage')
const selectedWarehouse = ref(null)
const notes             = ref('')

const reasonOptions = [
  { label: 'Damage',               value: 'Damage' },
  { label: 'Wastage',              value: 'Wastage' },
  { label: 'Theft',                value: 'Theft' },
  { label: 'Stocktake Correction', value: 'Stocktake Correction' },
  { label: 'Other',                value: 'Other' },
]

const adjustmentDirection = ref('decrease')
const directionOptions = [
  { label: 'Decrease (remove stock)', value: 'decrease' },
  { label: 'Increase (add stock)',    value: 'increase' },
]

// ── Warehouse options ─────────────────────────────────────────────────────────
const warehouseOptions = computed(() =>
  warehouses.value.map(w => ({ label: w.name, value: w.id }))
)

// ── Items for select ──────────────────────────────────────────────────────────
const itemOptions = ref([])

function buildItemOptions() {
  itemOptions.value = allItemsRaw.value
    .filter(i => i.is_active)
    .map(i => ({ label: `${i.code} — ${i.name}`, value: i.id, item: i }))
}

function filterItems(val, update) {
  update(() => {
    const q = val.toLowerCase()
    itemOptions.value = allItemsRaw.value
      .filter(i => i.is_active && (
        i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)
      ))
      .map(i => ({ label: `${i.code} — ${i.name}`, value: i.id, item: i }))
  })
}

// ── Lines ─────────────────────────────────────────────────────────────────────
let _keyCounter = 0
const lines   = ref([])
const posting = ref(false)

function addLine() {
  lines.value.push({
    _key:          ++_keyCounter,
    item_id:       null,
    uom_id:        null,
    unit_cost:     0,
    qty:           1,
    current_stock: null,
  })
}

function removeLine(idx) {
  lines.value.splice(idx, 1)
}

async function onItemSelected(row, itemId) {
  const found = allItemsRaw.value.find(i => i.id === itemId)
  if (found) {
    row.uom_id    = found.uom_id || found.inventory_uom_id
    row.unit_cost = found.avg_cost || 0
  }
  if (itemId && selectedWarehouse.value) {
    const stockMap = await fetchStockByWarehouse(selectedWarehouse.value)
    row.current_stock = stockMap[itemId] ?? 0
  }
}

// Changing the warehouse after picking items left "Current Stock" showing the
// previous warehouse's figures — refresh every line.
watch(selectedWarehouse, async (wh) => {
  if (!wh || !lines.value.length) return
  const stockMap = await fetchStockByWarehouse(wh)
  for (const l of lines.value) {
    l.current_stock = l.item_id ? (stockMap[l.item_id] ?? 0) : null
  }
})

function confirmDialog(opts) {
  return new Promise((resolve) => {
    $q.dialog({ cancel: true, persistent: true, ...opts })
      .onOk(() => resolve(true))
      .onCancel(() => resolve(false))
      .onDismiss(() => resolve(false))
  })
}

const totalQty = computed(() => lines.value.reduce((s, l) => s + (Number(l.qty) || 0), 0))

const lineColumns = [
  { name: 'item_id',       label: 'Item',          field: 'item_id',       align: 'left' },
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

  const isDecrease = adjustmentDirection.value !== 'increase'
  const short = isDecrease
    ? validLines.filter((l) => l.current_stock != null && Number(l.qty) > Number(l.current_stock))
    : []
  const ok = await confirmDialog({
    title: 'Post stock adjustment?',
    message:
      `${isDecrease ? 'Remove' : 'Add'} stock on ${validLines.length} line(s) — reason: ${adjustmentReason.value}. ` +
      'Posting updates the stock ledger immediately.' +
      (short.length
        ? ` WARNING: ${short.length} line(s) exceed the current stock and may be rejected or drive stock negative.`
        : ''),
    ok: { label: 'Post', color: isDecrease ? 'negative' : 'positive', unelevated: true },
  })
  if (!ok) return

  posting.value = true
  let createdDoc = null
  try {
    const isIncrease = adjustmentDirection.value === 'increase'
    const docLines = validLines.map(row => ({
      item_id:   row.item_id,
      uom_id:    row.uom_id,
      quantity:  isIncrease ? Math.abs(Number(row.qty)) : -Math.abs(Number(row.qty)),
      unit_cost: row.unit_cost || 0,
    }))

    const header = {
      doc_type:     'ADJUSTMENT',
      doc_date:     adjustmentDate.value,
      warehouse_id: selectedWarehouse.value,
      reference_no: referenceNo.value || null,
      remarks:      [adjustmentReason.value, notes.value].filter(Boolean).join(' — ') || null,
    }

    const doc = await createDocument(header, docLines)
    createdDoc = doc
    await postDocument(doc.id)

    $q.notify({ type: 'positive', message: `Adjustment posted — ${validLines.length} line(s).` })

    lines.value               = []
    referenceNo.value         = ''
    notes.value               = ''
    adjustmentDate.value      = date.formatDate(new Date(), 'YYYY-MM-DD')
    adjustmentDirection.value = 'decrease'

    await fetchHistory()
  } catch (e) {
    console.error('[StockAdjustmentPage] postAdjustment', e)
    $q.notify({
      type: 'negative',
      message: 'Posting failed: ' + e.message,
      // createDocument succeeded but posting did not — a draft now exists;
      // say so, otherwise a retry creates a duplicate document.
      caption: createdDoc
        ? `Draft ${createdDoc.doc_number} was saved — post or delete it in Inventory → Documents.`
        : undefined,
      timeout: createdDoc ? 8000 : 5000,
    })
  } finally {
    posting.value = false
  }
}

// ── History ───────────────────────────────────────────────────────────────────
const historyColumns = [
  { name: 'posted_at',      label: 'Date',      field: 'posted_at',      align: 'left', sortable: true,
    format: v => date.formatDate(new Date(v), 'DD MMM YYYY HH:mm') },
  { name: 'item_name',      label: 'Item',      field: 'item_name',      align: 'left' },
  { name: 'warehouse_name', label: 'Warehouse', field: 'warehouse_name', align: 'left' },
  // Ledger quantity is unsigned; show the direction so +/- adjustments differ.
  { name: 'quantity',       label: 'Qty',       field: r => (r.direction === 'OUT' ? -1 : 1) * Number(r.quantity || 0),
    align: 'right', sortable: true, format: v => (v > 0 ? `+${v}` : String(v)) },
  { name: 'doc_number',     label: 'Doc #',     field: 'doc_number',     align: 'left' },
]

async function fetchHistory() {
  // Last 30 Colombo business days (toISOString() was UTC-based).
  const since = invAddDays(invBusinessDate(), -30)
  await fetchLedger({ docType: 'ADJUSTMENT', dateFrom: since })
}

onMounted(async () => {
  await Promise.all([listItems(), listWarehouses()])
  buildItemOptions()
  if (warehouseOptions.value.length) {
    selectedWarehouse.value = warehouseOptions.value[0].value
  }
  await fetchHistory()
})
</script>
