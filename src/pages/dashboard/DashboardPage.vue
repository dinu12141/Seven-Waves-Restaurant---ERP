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
import { ref, onMounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import PageHeader from 'components/common/PageHeader.vue'
import StatCard from 'components/common/StatCard.vue'
import DataTable from 'components/common/DataTable.vue'
import StatusChip from 'components/common/StatusChip.vue'
import { mockProducts } from 'src/data/mock'

const loading = ref(false)

const stats = ref([
  {
    title: 'Today Sales',
    value: '$0.00',
    icon: 'payments',
    color: 'green',
    trend: '',
  },
  {
    title: 'Active Orders',
    value: '0',
    icon: 'receipt_long',
    color: 'orange',
    trend: '',
  },
  {
    title: 'Kitchen Pending',
    value: '0',
    icon: 'kitchen',
    color: 'red',
    trend: '',
  },
  {
    title: 'Low Stock Items',
    value: '0',
    icon: 'inventory_2',
    color: 'warning',
    trend: '',
  },
])

const orders = ref([])

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

async function fetchDashboardData() {
  loading.value = true
  try {
    const todayStr = new Date().toISOString().split('T')[0]

    const results = await Promise.allSettled([
      // 1. Today Sales
      supabase
        .from('orders')
        .select('total_amount')
        .gte('created_at', todayStr + 'T00:00:00')
        .neq('status', 'cancelled'),

      // 2. Active Orders
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .not('status', 'in', '("completed","cancelled")'),

      // 3. Kitchen Pending
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['accepted', 'preparing', 'cooking']),

      // 4. Low Stock
      supabase.from('inventory_items').select('quantity, reorder_level'),

      // 5. Recent Orders
      supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(5),
    ])

    // Process Sales
    if (results[0].status === 'fulfilled' && results[0].value.data) {
      const totalSales = results[0].value.data.reduce((sum, o) => sum + (o.total_amount || 0), 0)
      stats.value[0].value = `$${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }

    // Process Active Orders
    if (results[1].status === 'fulfilled') {
      stats.value[1].value = results[1].value.count || 0
    }

    // Process Kitchen Pending
    if (results[2].status === 'fulfilled') {
      stats.value[2].value = results[2].value.count || 0
    }

    // Process Low Stock
    if (results[3].status === 'fulfilled' && results[3].value.data) {
      const lowStockCount = results[3].value.data.filter(
        (i) => (i.quantity ?? 0) <= (i.reorder_level ?? 0),
      ).length
      stats.value[3].value = lowStockCount
    } else {
      // Fallback for demo
      stats.value[3].value = 0
    }

    // Process Recent Orders
    if (results[4].status === 'fulfilled' && results[4].value.data) {
      orders.value = results[4].value.data.map((o) => ({
        id: o.order_number || `#${o.id.slice(0, 8)}`,
        customer: o.customer_name || 'Walk-in',
        total: `$${(o.total_amount || 0).toFixed(2)}`,
        status: o.status,
        type: o.order_type === 'dine_in' ? 'Dine-in' : 'Takeaway',
      }))
    }
  } catch (err) {
    console.error('Failed to fetch dashboard data:', err)
  } finally {
    loading.value = false
  }
}

function refreshData() {
  fetchDashboardData()
}

onMounted(() => {
  fetchDashboardData()
})
</script>
