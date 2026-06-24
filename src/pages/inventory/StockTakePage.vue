<template>
  <q-page class="q-pa-md">
    <ErpPageHeader
      title="Stock Take"
      subtitle="Physical count sheet — compare system quantities against actual counts"
      icon="fact_check"
      :breadcrumbs="[{ label: 'Inventory' }, { label: 'Stock Take' }]"
    />

    <!-- Count Header Card -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle2 q-mb-md" style="color: var(--erp-text-secondary)">Count Session</div>
        <div class="row q-col-gutter-sm items-end">
          <div class="col-12 col-sm-6 col-md-3">
            <q-input
              v-model="countDate"
              label="Count Date *"
              outlined
              dense
              type="date"
            />
          </div>
          <div class="col-12 col-sm-6 col-md-4">
            <q-select
              v-model="selectedWarehouse"
              :options="warehouseOptions"
              label="Warehouse *"
              outlined
              dense
              emit-value
              map-options
              :loading="warehousesLoading"
              @update:model-value="loadCountSheet"
            />
          </div>
          <div class="col-12 col-md-5">
            <q-input
              v-model="notes"
              label="Notes"
              outlined
              dense
              placeholder="Optional notes for this count…"
            />
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Count Sheet Table -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="q-pb-none">
        <div class="row items-center q-mb-sm">
          <div class="text-subtitle2" style="color: var(--erp-text-secondary)">
            Count Sheet
            <q-badge
              v-if="countLines.length"
              :label="countLines.length + ' items'"
              color="primary"
              class="q-ml-sm"
            />
          </div>
          <q-space />
          <div class="text-caption text-grey-5 q-mr-md">
            Variances: &nbsp;
            <span class="text-negative q-mr-sm">{{ negativeCount }} short</span>
            <span class="text-warning q-mr-sm">{{ positiveCount }} over</span>
            <span class="text-positive">{{ zeroCount }} exact</span>
          </div>
          <q-btn
            unelevated no-caps
            icon="save"
            label="Post Count"
            color="primary"
            :loading="posting"
            :disable="!selectedWarehouse || countLines.length === 0 || variantCount === 0"
            @click="postCount"
          />
        </div>
      </q-card-section>

      <div v-if="sheetLoading" class="q-pa-xl text-center">
        <q-spinner color="primary" size="40px" />
        <div class="text-grey-5 q-mt-sm">Loading count sheet…</div>
      </div>

      <div v-else-if="!selectedWarehouse" class="q-pa-xl text-center text-grey-5">
        <q-icon name="warehouse" size="48px" class="q-mb-sm" />
        <div>Select a warehouse to load the count sheet.</div>
      </div>

      <q-table
        v-else
        flat
        :rows="countLines"
        :columns="countColumns"
        row-key="item_id"
        :pagination="{ rowsPerPage: 0 }"
        hide-bottom
        virtual-scroll
        style="max-height: 60vh"
      >
        <template #body-cell-physical_qty="props">
          <q-td :props="props" style="min-width: 130px">
            <q-input
              v-model.number="props.row.physical_qty"
              type="number"
              dense
              outlined
              min="0"
              step="0.001"
              style="width: 120px"
              @update:model-value="recalcVariance(props.row)"
            />
          </q-td>
        </template>

        <template #body-cell-system_qty="props">
          <q-td :props="props" class="text-right">
            {{ Number(props.row.system_qty).toFixed(3) }}
          </q-td>
        </template>

        <template #body-cell-variance="props">
          <q-td :props="props" class="text-right">
            <q-chip
              dense
              :color="varianceColor(props.row.variance)"
              text-color="white"
              size="sm"
            >
              {{ props.row.variance > 0 ? '+' : '' }}{{ Number(props.row.variance).toFixed(3) }}
            </q-chip>
          </q-td>
        </template>

        <template #no-data>
          <div class="full-width text-center q-pa-md text-grey-5">
            No stock records for this warehouse.
          </div>
        </template>
      </q-table>
    </q-card>

    <!-- Stocktake History -->
    <q-card flat bordered>
      <q-card-section class="row items-center">
        <div class="text-subtitle2" style="color: var(--erp-text-secondary)">Recent Stock Takes (last 10)</div>
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
        :pagination="{ rowsPerPage: 10 }"
      >
        <template #loading>
          <q-inner-loading showing color="primary" />
        </template>
        <template #body-cell-quantity="props">
          <q-td :props="props" class="text-right">
            <span :class="props.row.quantity >= 0 ? 'text-positive' : 'text-negative'">
              {{ Number(props.row.quantity) >= 0 ? '+' : '' }}{{ Number(props.row.quantity).toFixed(3) }}
            </span>
          </q-td>
        </template>
        <template #no-data>
          <div class="full-width text-center q-pa-md text-grey-5">No stocktake records yet.</div>
        </template>
      </q-table>
    </q-card>

    <q-inner-loading :showing="posting" label="Posting count…" label-class="text-primary" />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar, date } from 'quasar'
import ErpPageHeader from 'components/common/ErpPageHeader.vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

const $q        = useQuasar()
const authStore = useAuthStore()

// ── Header state ──────────────────────────────────────────────────────────────
const countDate         = ref(date.formatDate(new Date(), 'YYYY-MM-DD'))
const selectedWarehouse = ref(null)
const notes             = ref('')

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

// ── Count sheet ───────────────────────────────────────────────────────────────
const countLines  = ref([])
const sheetLoading = ref(false)
const posting      = ref(false)

const countColumns = [
  { name: 'name',         label: 'Item Name',    field: r => r.ingredients?.name ?? '–', align: 'left',   sortable: true },
  { name: 'code',         label: 'Code',         field: r => r.ingredients?.code ?? '–', align: 'left',   sortable: true },
  { name: 'uom',          label: 'UOM',          field: r => r.ingredients?.uom ?? '–',  align: 'center' },
  { name: 'system_qty',   label: 'System Qty',   field: 'system_qty',                    align: 'right',  sortable: true },
  { name: 'physical_qty', label: 'Physical Qty', field: 'physical_qty',                  align: 'left' },
  { name: 'variance',     label: 'Variance',     field: 'variance',                      align: 'right',  sortable: true },
]

// Variance stats
const negativeCount = computed(() => countLines.value.filter(l => l.variance < 0).length)
const positiveCount = computed(() => countLines.value.filter(l => l.variance > 0).length)
const zeroCount     = computed(() => countLines.value.filter(l => l.variance === 0).length)
const variantCount  = computed(() => countLines.value.filter(l => l.variance !== 0).length)

function varianceColor(v) {
  if (v === 0 || v == null) return 'positive'
  return v < 0 ? 'negative' : 'warning'
}

function recalcVariance(row) {
  const phys = Number(row.physical_qty) || 0
  const sys  = Number(row.system_qty)   || 0
  row.variance = parseFloat((phys - sys).toFixed(6))
}

async function loadCountSheet() {
  if (!selectedWarehouse.value) return
  sheetLoading.value = true
  countLines.value   = []
  try {
    const { data, error } = await supabase
      .from('stock_levels')
      .select('item_id, quantity, ingredients(id, name, code, uom)')
      .eq('warehouse_id', selectedWarehouse.value)
      .order('item_id')
    if (error) throw error

    countLines.value = (data || []).map(row => ({
      item_id:      row.item_id,
      ingredients:  row.ingredients,
      system_qty:   Number(row.quantity) || 0,
      physical_qty: Number(row.quantity) || 0,  // default = system qty (no variance)
      variance:     0,
    }))
  } catch (e) {
    console.error('[StockTakePage] loadCountSheet', e)
    $q.notify({ type: 'negative', message: 'Failed to load count sheet: ' + e.message })
  } finally {
    sheetLoading.value = false
  }
}

// ── Post count ────────────────────────────────────────────────────────────────
async function postCount() {
  const variantLines = countLines.value.filter(l => l.variance !== 0)
  if (!variantLines.length) {
    $q.notify({ type: 'info', message: 'No variances to post.' })
    return
  }

  posting.value = true
  try {
    for (const row of variantLines) {
      // Insert movement record for the variance
      const { error: mvErr } = await supabase.from('stock_movements').insert({
        item_id:       row.item_id,
        warehouse_id:  selectedWarehouse.value,
        quantity:      row.variance,          // positive = found more, negative = short
        movement_type: 'stocktake',
        reason:        'Physical stocktake',
        notes:         notes.value || null,
        created_at:    new Date(countDate.value).toISOString(),
        company_id:    authStore.companyId,
        branch_id:     authStore.branchId,
      })
      if (mvErr) throw mvErr

      // Update stock_levels to physical count
      const { error: slErr } = await supabase.from('stock_levels').upsert(
        {
          item_id:      row.item_id,
          warehouse_id: selectedWarehouse.value,
          quantity:     Number(row.physical_qty) || 0,
        },
        { onConflict: 'item_id,warehouse_id' }
      )
      if (slErr) throw slErr
    }

    $q.notify({
      type:    'positive',
      message: `Stock take posted — ${variantLines.length} adjustment(s) applied.`,
    })

    notes.value = ''
    await Promise.all([loadCountSheet(), fetchHistory()])
  } catch (e) {
    console.error('[StockTakePage] postCount', e)
    $q.notify({ type: 'negative', message: 'Posting failed: ' + e.message })
  } finally {
    posting.value = false
  }
}

// ── History ───────────────────────────────────────────────────────────────────
const history        = ref([])
const historyLoading = ref(false)

const historyColumns = [
  { name: 'created_at', label: 'Date',      field: 'created_at', align: 'left', sortable: true,
    format: v => date.formatDate(new Date(v), 'DD MMM YYYY HH:mm') },
  { name: 'item_name',  label: 'Item',      field: r => r.ingredients?.name ?? '–', align: 'left' },
  { name: 'warehouse',  label: 'Warehouse', field: r => r.warehouses?.name ?? '–',  align: 'left' },
  { name: 'quantity',   label: 'Variance',  field: 'quantity',   align: 'right', sortable: true },
  { name: 'notes',      label: 'Notes',     field: 'notes',      align: 'left' },
]

async function fetchHistory() {
  historyLoading.value = true
  try {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*, ingredients(name), warehouses(name)')
      .eq('movement_type', 'stocktake')
      .eq('company_id', authStore.companyId)
      .eq('branch_id',  authStore.branchId)
      .order('created_at', { ascending: false })
      .limit(10)
    if (error) throw error
    history.value = data || []
  } catch (e) {
    console.error('[StockTakePage] fetchHistory', e)
  } finally {
    historyLoading.value = false
  }
}

onMounted(async () => {
  await fetchWarehouses()
  if (selectedWarehouse.value) await loadCountSheet()
  await fetchHistory()
})
</script>

<style scoped lang="scss">
// Ensure virtual-scroll table fills container properly
.q-table__container {
  border-radius: 0;
}
</style>
