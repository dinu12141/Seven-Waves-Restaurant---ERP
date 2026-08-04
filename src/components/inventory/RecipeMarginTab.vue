<template>
  <div>
    <!-- Header & Filters -->
    <div class="row items-center justify-between q-mb-md">
      <div>
        <div class="text-h6 text-primary text-weight-bold">BOM Margin Analysis</div>
        <div class="text-caption text-grey-6">
          Real cost and margins calculated dynamically based on Goods Receipt Notes (GRN).
        </div>
      </div>
      <div class="row q-gutter-sm">
        <q-input outlined dense v-model="filters.startDate" type="date" label="Start Date (Optional)" />
        <q-input outlined dense v-model="filters.endDate" type="date" label="End Date (Optional)" />
        <q-btn color="primary" icon="search" label="Calculate" @click="fetchData" :loading="loading" />
      </div>
    </div>

    <!-- Data Table -->
    <q-table
      :rows="rows"
      :columns="columns"
      row-key="recipe_id"
      :loading="loading"
      flat
      bordered
      :pagination="{ rowsPerPage: 50 }"
      separator="cell"
    >
      <template #body-cell-margin_pct="props">
        <q-td :props="props">
          <q-badge
            :color="
              Number(props.value) < 30
                ? 'negative'
                : Number(props.value) < 60
                  ? 'warning'
                  : 'positive'
            "
            class="text-caption"
          >
            {{ Number(props.value || 0).toFixed(1) }}%
          </q-badge>
        </q-td>
      </template>

      <!-- Bottom Row for Totals -->
      <template #bottom-row v-if="rows.length > 0">
        <q-tr class="bg-grey-9 text-white text-weight-bold">
          <q-td colspan="3" class="text-right">TOTALS:</q-td>
          <q-td class="text-right">{{ formatCurrency(totalMenuPrice) }}</q-td>
          <q-td class="text-right">{{ formatCurrency(totalCost) }}</q-td>
          <q-td class="text-right">{{ formatCurrency(totalMargin) }}</q-td>
          <q-td class="text-right">
             {{ totalMenuPrice > 0 ? ((totalMargin / totalMenuPrice) * 100).toFixed(1) + '%' : '0%' }}
          </q-td>
        </q-tr>
      </template>
    </q-table>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { getRecipeMarginReport } from '../../services/inventoryService'

const loading = ref(false)
const rows = ref([])

const filters = ref({
  startDate: '',
  endDate: '',
})

const formatCurrency = (val) => {
  return 'Rs. ' + Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const columns = [
  { name: 'menu_item_name', label: 'Menu Item', field: 'menu_item_name', align: 'left', sortable: true },
  { name: 'category_name', label: 'Category', field: 'category_name', align: 'left', sortable: true },
  { name: 'kitchen_name', label: 'Kitchen', field: 'kitchen_name', align: 'left', sortable: true },
  { name: 'real_menu_price', label: 'Real Price', field: 'real_menu_price', align: 'right', format: formatCurrency, sortable: true },
  { name: 'real_cost', label: 'Real Cost (GRN)', field: 'real_cost', align: 'right', format: formatCurrency, sortable: true },
  { name: 'margin', label: 'Margin', field: 'margin', align: 'right', format: formatCurrency, sortable: true },
  { name: 'margin_pct', label: 'Margin %', field: 'margin_pct', align: 'right', sortable: true },
]

const totalMenuPrice = computed(() => rows.value.reduce((s, r) => s + Number(r.real_menu_price || 0), 0))
const totalCost = computed(() => rows.value.reduce((s, r) => s + Number(r.real_cost || 0), 0))
const totalMargin = computed(() => rows.value.reduce((s, r) => s + Number(r.margin || 0), 0))

async function fetchData() {
  loading.value = true
  try {
    const data = await getRecipeMarginReport(
      filters.value.startDate || undefined,
      filters.value.endDate || undefined
    )
    rows.value = data
  } catch (error) {
    console.error('Error fetching margin report:', error)
  } finally {
    loading.value = false
  }
}

defineExpose({ columns, rows, exportTitle: 'BOM_Margin_Analysis' })
</script>
