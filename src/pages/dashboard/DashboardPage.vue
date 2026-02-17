<template>
  <q-page class="q-pa-md">
    <PageHeader title="Dashboard" subtitle="Overview of your restaurant performance">
      <template #actions>
        <q-btn flat dense icon="refresh" @click="refreshData" />
        <q-btn outline color="primary" label="Download Report" icon="download" />
      </template>
    </PageHeader>

    <!-- Stats Grid -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div v-for="(stat, index) in stats" :key="index" class="col-12 col-sm-6 col-md-3">
        <StatCard v-bind="stat" />
      </div>
    </div>

    <div class="row q-col-gutter-md">
      <!-- Recent Orders Table -->
      <div class="col-12 col-md-8">
        <DataTable title="Recent Orders" :rows="orders" :columns="orderColumns" :loading="loading">
          <template #top-right>
            <q-btn flat dense color="primary" label="View All" to="/orders" />
          </template>
          <template #body-cell-status="props">
            <q-td :props="props">
              <StatusChip :status="props.value" />
            </q-td>
          </template>
        </DataTable>
      </div>

      <!-- Top Items (Simplified) -->
      <div class="col-12 col-md-4">
        <q-card class="bg-grey-9 text-white fit" flat bordered>
          <q-card-section>
            <div class="text-h6">Top Selling Items</div>
          </q-card-section>

          <q-list separator class="q-px-none">
            <q-item v-for="(item, index) in topItems" :key="index" class="q-py-md">
              <q-item-section avatar>
                <q-avatar size="40px" rounded>
                  <img :src="item.image" loading="lazy" />
                </q-avatar>
              </q-item-section>

              <q-item-section>
                <q-item-label class="text-weight-bold">{{ item.name }}</q-item-label>
                <q-item-label caption class="text-grey-5">{{ item.category }}</q-item-label>
              </q-item-section>

              <q-item-section side>
                <div class="text-white text-weight-bold">{{ item.price }}</div>
                <div class="text-green-5 text-caption">{{ item.sales }} sold</div>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref } from 'vue'
import PageHeader from 'components/common/PageHeader.vue'
import StatCard from 'components/common/StatCard.vue'
import DataTable from 'components/common/DataTable.vue'
import StatusChip from 'components/common/StatusChip.vue'
import { mockStats, mockOrders, mockProducts } from 'src/data/mock'

const loading = ref(false)
const stats = ref(mockStats)
const orders = ref(mockOrders)

const orderColumns = [
  { name: 'id', label: 'Order ID', field: 'id', align: 'left', sortable: true },
  { name: 'customer', label: 'Customer', field: 'customer', align: 'left' },
  { name: 'total', label: 'Total', field: 'total', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'type', label: 'Type', field: 'type', align: 'left' },
]

// Simulate top selling items by taking first 5 products and adding sales count
const topItems = ref(
  mockProducts.slice(0, 5).map((p) => ({
    ...p,
    price: `$${p.price.toFixed(2)}`,
    sales: Math.floor(Math.random() * 50) + 10,
  })),
)

function refreshData() {
  loading.value = true
  setTimeout(() => {
    loading.value = false
  }, 1000)
}
</script>
