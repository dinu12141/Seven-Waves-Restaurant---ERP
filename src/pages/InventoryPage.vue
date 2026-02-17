<template>
  <q-page class="q-pa-md">
    <PageHeader title="Inventory Dashboard" subtitle="Track stock levels and value">
      <template #actions>
        <q-btn outline color="primary" icon="add" label="Add Item" />
        <q-btn color="primary" icon="shopping_cart" label="Create PO" />
      </template>
    </PageHeader>

    <q-card class="bg-dark text-white q-mt-md">
      <q-tabs
        v-model="tab"
        dense
        class="text-grey"
        active-color="primary"
        indicator-color="primary"
        align="justify"
        narrow-indicator
      >
        <q-tab name="overview" label="Stock Overview" />
        <q-tab name="ingredients" label="Ingredients List" />
        <q-tab name="movements" label="Stock Movements" />
        <q-tab name="low-stock" label="Low Stock Alerts" />
      </q-tabs>

      <q-separator dark />

      <q-tab-panels v-model="tab" animated class="bg-dark text-white">
        <!-- Tab: Stock Overview -->
        <q-tab-panel name="overview">
          <!-- Inventory Stats -->
          <div class="row q-col-gutter-md q-mb-lg">
            <div class="col-12 col-sm-6 col-md-3">
              <StatCard title="Total Items" :value="totalItems" icon="category" color="blue" />
            </div>
            <div class="col-12 col-sm-6 col-md-3">
              <StatCard
                title="Low Stock"
                :value="lowStockCount"
                icon="warning"
                color="orange"
                trend="+2"
                trendIcon="arrow_upward"
                trendColor="red"
              />
            </div>
            <div class="col-12 col-sm-6 col-md-3">
              <StatCard title="Total Value" value="$12,500" icon="monetization_on" color="green" />
            </div>
            <div class="col-12 col-sm-6 col-md-3">
              <StatCard title="Suppliers" value="8" icon="local_shipping" color="purple" />
            </div>
          </div>

          <!-- Mock Usage Trend Chart -->
          <div class="row q-col-gutter-md">
            <div class="col-12">
              <q-card class="bg-grey-9 q-pa-md">
                <div class="text-h6 q-mb-md">Usage Trend (Last 7 Days)</div>
                <div class="row items-end justify-between q-gutter-x-sm" style="height: 200px">
                  <div
                    v-for="(day, index) in mockTrendData"
                    :key="index"
                    class="column items-center flex-grow-1"
                  >
                    <div
                      class="bg-primary rounded-borders"
                      :style="{ width: '40px', height: day.value + '%' }"
                    ></div>
                    <div class="q-mt-sm text-caption">{{ day.label }}</div>
                  </div>
                </div>
              </q-card>
            </div>
          </div>
        </q-tab-panel>

        <!-- Tab: Ingredients List -->
        <q-tab-panel name="ingredients">
          <DataTable
            title="Stock Items"
            :rows="inventory"
            :columns="columns"
            :loading="loading"
            :filter="filter"
          >
            <template #top-right>
              <q-input dense outlined v-model="filter" placeholder="Search items..." dark>
                <template v-slot:append>
                  <q-icon name="search" />
                </template>
              </q-input>
            </template>

            <template #body-cell-status="props">
              <q-td :props="props">
                <StatusChip :status="props.value" />
              </q-td>
            </template>

            <template #body-cell-stock="props">
              <q-td :props="props">
                <StockLevelBar
                  :current="props.value"
                  :min="props.row.reorderLevel"
                  :max="props.row.maxLevel || 100"
                  :unit="props.row.unit"
                  :label="''"
                />
              </q-td>
            </template>
          </DataTable>
        </q-tab-panel>

        <!-- Tab: Stock Movements -->
        <q-tab-panel name="movements">
          <MovementHistoryTable />
        </q-tab-panel>

        <!-- Tab: Low Stock Alerts -->
        <q-tab-panel name="low-stock">
          <div class="text-h6 q-mb-md text-warning flex items-center">
            <q-icon name="warning" class="q-mr-sm" />
            Items Below Reorder Level
          </div>
          <q-list bordered separator class="rounded-borders">
            <q-item v-for="item in lowStockItems" :key="item.id" class="q-py-md">
              <q-item-section avatar>
                <q-avatar color="red-10" text-color="white" icon="priority_high" />
              </q-item-section>

              <q-item-section>
                <q-item-label class="text-h6">{{ item.item }}</q-item-label>
                <q-item-label caption class="text-grey-4"
                  >Category: {{ item.category }}</q-item-label
                >
              </q-item-section>

              <q-item-section class="col-4">
                <StockLevelBar
                  :current="item.stock"
                  :min="item.reorderLevel"
                  :max="item.maxLevel || 100"
                  :unit="item.unit"
                />
              </q-item-section>

              <q-item-section side>
                <q-btn flat color="primary" label="Reorder" icon="shopping_cart" />
              </q-item-section>
            </q-item>

            <div v-if="lowStockItems.length === 0" class="q-pa-lg text-center text-grey">
              No items are currently low on stock.
            </div>
          </q-list>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import PageHeader from 'components/common/PageHeader.vue'
import StatCard from 'components/common/StatCard.vue'
import DataTable from 'components/common/DataTable.vue'
import StatusChip from 'components/common/StatusChip.vue'
import StockLevelBar from 'components/inventory/StockLevelBar.vue'
import MovementHistoryTable from 'components/inventory/MovementHistoryTable.vue'
import { mockInventory } from 'src/data/mock'

const tab = ref('overview')
const loading = ref(false)
const filter = ref('')
const inventory = ref(mockInventory)

const totalItems = computed(() => inventory.value.length)
const lowStockCount = computed(
  () => inventory.value.filter((i) => i.stock <= i.reorderLevel).length,
)
const lowStockItems = computed(() => inventory.value.filter((i) => i.stock <= i.reorderLevel))

const mockTrendData = [
  { label: 'Mon', value: 40 },
  { label: 'Tue', value: 65 },
  { label: 'Wed', value: 30 },
  { label: 'Thu', value: 85 },
  { label: 'Fri', value: 50 },
  { label: 'Sat', value: 90 },
  { label: 'Sun', value: 75 },
]

const columns = [
  {
    name: 'item',
    required: true,
    label: 'Item Name',
    align: 'left',
    field: 'item',
    sortable: true,
  },
  { name: 'category', align: 'left', label: 'Category', field: 'category', sortable: true },
  {
    name: 'stock',
    align: 'left',
    label: 'Stock Level',
    field: 'stock',
    sortable: true,
    style: 'min-width: 200px',
  },
  { name: 'reorderLevel', align: 'center', label: 'Reorder Level', field: 'reorderLevel' },
  { name: 'status', align: 'center', label: 'Status', field: 'status', sortable: true },
]
</script>
