<template>
  <ReportLayout
    title="Item Availability Report"
    subtitle="Current availability status of all menu items — unavailable items marked during KOT"
    :kpis="kpiData"
    :export-columns="columns"
    :export-rows="filteredRows"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <!-- Status Filter -->
    <template #extra-filters>
      <div class="report-filter-group" style="min-width: 180px">
        <label class="report-filter-label">Availability</label>
        <q-select
          v-model="availFilter"
          :options="availOptions"
          emit-value
          map-options
          dense
          outlined
          class="report-filter-input"
          @update:model-value="() => {}"
        />
      </div>
      <div class="report-filter-group" style="min-width: 200px">
        <label class="report-filter-label">Category</label>
        <q-select
          v-model="categoryFilter"
          :options="categoryOptions"
          emit-value
          map-options
          dense
          outlined
          clearable
          placeholder="All Categories"
          class="report-filter-input"
        />
      </div>
    </template>

    <template #default>
      <q-table
        :rows="filteredRows"
        :columns="columns"
        row-key="id"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100, 0]"
        :pagination="{ rowsPerPage: 25 }"
        binary-state-sort
      >
        <template #header="props">
          <q-tr :props="props" class="report-table__header-row">
            <q-th
              v-for="col in props.cols"
              :key="col.name"
              :props="props"
              class="report-table__th"
            >{{ col.label }}</q-th>
          </q-tr>
        </template>

        <template #body="props">
          <q-tr :props="props" class="report-table__row" :class="{ 'avail-row--unavail': !props.row.is_available }">
            <q-td key="item_code" :props="props" class="report-table__td--mono text-weight-bold">
              {{ props.row.item_code || '—' }}
            </q-td>
            <q-td key="name" :props="props" class="text-weight-medium">
              {{ props.row.name }}
            </q-td>
            <q-td key="category" :props="props">
              <span class="avail-cat-badge">{{ props.row.category }}</span>
            </q-td>
            <q-td key="sub_category" :props="props" class="text-grey-7">
              {{ props.row.sub_category || '—' }}
            </q-td>
            <q-td key="is_available" :props="props">
              <span
                class="report-badge"
                :class="props.row.is_available ? 'report-badge--paid' : 'report-badge--cancelled'"
              >
                <q-icon
                  :name="props.row.is_available ? 'check_circle' : 'cancel'"
                  size="14px"
                  class="q-mr-xs"
                />
                {{ props.row.is_available ? 'Available' : 'Unavailable' }}
              </span>
            </q-td>
            <q-td key="last_updated" :props="props" class="report-table__td--muted">
              {{ fmtDateTime(props.row.last_updated) }}
            </q-td>
          </q-tr>
        </template>

        <template #no-data>
          <div class="report-empty">
            <q-icon name="inventory_2" size="40px" class="q-mb-sm" />
            <div>No items found</div>
          </div>
        </template>
      </q-table>
    </template>
  </ReportLayout>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtDateTime } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])
const availFilter = ref('all')
const categoryFilter = ref(null)
const categoryOptions = ref([{ label: 'All Categories', value: null }])

const availOptions = [
  { label: 'All Items', value: 'all' },
  { label: '🔴 Unavailable Only', value: 'unavailable' },
  { label: '🟢 Available Only', value: 'available' },
]

const columns = [
  { name: 'item_code', label: 'Item Code', field: 'item_code', align: 'left', sortable: true },
  { name: 'name', label: 'Item Name', field: 'name', align: 'left', sortable: true },
  { name: 'category', label: 'Category', field: 'category', align: 'left', sortable: true },
  { name: 'sub_category', label: 'Sub Category', field: 'sub_category', align: 'left', sortable: true },
  { name: 'is_available', label: 'Status', field: 'is_available', align: 'left', sortable: true },
  { name: 'last_updated', label: 'Last Updated', field: 'last_updated', align: 'left', sortable: true },
]

const filteredRows = computed(() => {
  let r = rows.value
  if (availFilter.value === 'unavailable') r = r.filter((x) => !x.is_available)
  if (availFilter.value === 'available') r = r.filter((x) => x.is_available)
  if (categoryFilter.value) r = r.filter((x) => x.category === categoryFilter.value)
  return r
})

const kpiData = computed(() => {
  const all = rows.value.length
  const unavailable = rows.value.filter((x) => !x.is_available).length
  const available = all - unavailable
  const pct = all > 0 ? Math.round((unavailable / all) * 100) : 0
  return [
    { label: 'Total Items', value: all.toString(), icon: 'inventory_2', color: 'blue' },
    { label: 'Available', value: available.toString(), icon: 'check_circle', color: 'green' },
    { label: 'Unavailable', value: unavailable.toString(), icon: 'cancel', color: 'red' },
    { label: 'Unavailable %', value: `${pct}%`, icon: 'pie_chart', color: pct > 20 ? 'red' : 'amber' },
  ]
})

async function loadData() {
  loading.value = true
  try {
    // Step 1 — load menu items + their sub-category (single join, always reliable)
    const { data: items, error: itemErr } = await supabase
      .from('menu_items')
      .select('id, name, item_code, is_available, updated_at, sub_category_id')
      .order('is_available', { ascending: true })
      .order('name',        { ascending: true })

    if (itemErr) throw itemErr

    // Step 2 — load all sub-categories with their parent category id
    const { data: subCats, error: scErr } = await supabase
      .from('menu_sub_categories')
      .select('id, name, category_id')

    if (scErr) throw scErr

    // Step 3 — load all main categories (from 'categories' table, not item_categories)
    const { data: mainCats, error: mcErr } = await supabase
      .from('categories')
      .select('id, name')

    if (mcErr) throw mcErr

    // Build fast lookup maps
    const mainCatMap = Object.fromEntries((mainCats || []).map((c) => [c.id, c.name]))
    const subCatMap  = Object.fromEntries(
      (subCats || []).map((sc) => [sc.id, { name: sc.name, catName: mainCatMap[sc.category_id] || '—' }])
    )

    const catSet = new Set()

    rows.value = (items || []).map((mi) => {
      const sc      = mi.sub_category_id ? subCatMap[mi.sub_category_id] : null
      const catName = sc?.catName || '—'
      catSet.add(catName)

      return {
        id:           mi.id,
        name:         mi.name,
        item_code:    mi.item_code,
        category:     catName,
        sub_category: sc?.name || '—',
        is_available: mi.is_available ?? true,
        last_updated: mi.updated_at,
      }
    })

    // Build category filter dropdown
    categoryOptions.value = [
      { label: 'All Categories', value: null },
      ...[...catSet]
        .filter((c) => c !== '—')
        .sort()
        .map((c) => ({ label: c, value: c })),
    ]
  } catch (e) {
    console.error('[ItemAvailability] loadData error:', e)
  } finally {
    loading.value = false
  }
}

function exportCSV() {
  exportTableToCSV(columns, filteredRows.value, 'item_availability')
}
function exportExcel() {
  exportTableToExcel(columns, filteredRows.value, 'item_availability')
}

// ── Realtime subscription ──────────────────────────────────────────────────────
let realtimeChannel = null

onMounted(() => {
  loadData()

  // Subscribe to menu_items changes — when a waiter marks unavailable in KOT
  // the DB trigger updates menu_items.is_available, and we reflect it here instantly
  realtimeChannel = supabase
    .channel('item-availability-realtime')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'menu_items' },
      (payload) => {
        const updated = payload.new
        if (!updated?.id) return
        // Patch only the changed row — no full reload needed
        const idx = rows.value.findIndex((r) => r.id === updated.id)
        if (idx !== -1) {
          rows.value[idx].is_available = updated.is_available ?? true
          rows.value[idx].last_updated = updated.updated_at
        }
      }
    )
    .subscribe()
})

onUnmounted(() => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
})
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';

.avail-row--unavail {
  background: rgba(220, 38, 38, 0.035) !important;
}

.avail-cat-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
}
</style>
