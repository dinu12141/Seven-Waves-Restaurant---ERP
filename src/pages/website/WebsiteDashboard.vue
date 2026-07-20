<template>
  <q-page class="q-pa-md">
    <ERPToolbar moduleName="website" title="Website Dashboard" breadcrumbs="Website / Overview" />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div v-for="(stat, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-3">
        <DashboardCard v-bind="stat" />
      </div>
    </div>

    <!-- Main Content -->
    <div class="row q-col-gutter-md">
      <!-- Quick Actions -->
      <div class="col-12 col-md-6">
        <q-card class="erp-dashboard-panel shadow-1 column full-height" :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-darker'">
          <q-card-section class="row items-center justify-between q-pb-none">
            <div class="text-h6 text-subtitle1 text-weight-bold">Quick Actions</div>
          </q-card-section>
 
          <q-card-section class="col q-pt-md">
            <div class="row q-col-gutter-sm">
              <div class="col-12">
                <q-btn
                  push
                  color="primary"
                  class="full-width q-py-sm action-btn"
                  align="left"
                  icon="language"
                  label="Manage Website Orders"
                  @click="$router.push('/website-orders')"
                >
                  <div class="text-caption q-ml-md action-desc" style="text-transform: none">
                    Process incoming website orders
                  </div>
                </q-btn>
              </div>
              <div class="col-12 q-mt-sm">
                <q-btn
                  push
                  color="orange-9"
                  class="full-width q-py-sm action-btn"
                  align="left"
                  icon="mail"
                  label="View Contact Messages"
                  @click="$router.push('/website-messages')"
                >
                  <div class="text-caption q-ml-md action-desc" style="text-transform: none">
                    Reply to online customer inquiries
                  </div>
                </q-btn>
              </div>
              <div class="col-12 q-mt-sm">
                <q-btn
                  push
                  color="teal-9"
                  class="full-width q-py-sm action-btn"
                  align="left"
                  icon="event_seat"
                  label="View Reservations"
                  @click="$router.push('/website-reservations')"
                >
                  <div class="text-caption q-ml-md action-desc" style="text-transform: none">
                    Manage table reservations from website
                  </div>
                </q-btn>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>
 
      <!-- Recent Orders Feed -->
      <div class="col-12 col-md-6">
        <q-card class="erp-dashboard-panel shadow-1 column full-height" :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-darker'">
          <q-card-section class="row items-center justify-between q-pb-none">
            <div class="text-h6 text-subtitle1 text-weight-bold">Recent Orders</div>
            <q-btn
              flat
              round
              dense
              icon="refresh"
              :color="$q.dark.isActive ? 'grey-5' : 'grey-7'"
              @click="fetchStats"
              :loading="loading"
            />
          </q-card-section>
          <q-card-section class="col q-pt-sm">
            <q-list class="erp-activity-list" padding>
              <q-item
                v-for="order in recentOrders"
                :key="order.id"
                class="q-pa-sm erp-activity-item"
              >
                <q-item-section avatar top>
                  <q-avatar size="32px" color="blue-2" text-color="blue-10" icon="shopping_bag" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2 text-weight-bold"
                    >Order #{{ order.order_number }}</q-item-label
                  >
                  <q-item-label caption class="desc-text"
                    >{{ order.customer_name || 'Guest' }} ·
                    {{ formatCurrency(order.total_amount) }}</q-item-label
                  >
                </q-item-section>
                <q-item-section side>
                  <q-chip dense :color="getStatusColor(order.status)" text-color="white" size="xs">
                    {{ order.status.replace(/_/g, ' ').toUpperCase() }}
                  </q-chip>
                </q-item-section>
              </q-item>
              <div
                v-if="recentOrders.length === 0 && !loading"
                class="text-grey-6 text-center q-pa-md"
              >
                No recent orders found.
              </div>
              <div v-if="loading" class="text-center q-pa-md">
                <q-spinner color="primary" size="2em" />
              </div>
            </q-list>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>
 
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import { useRouter } from 'vue-router'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardCard from 'components/dashboard/DashboardCard.vue'
 
const loading = ref(false)
const $router = useRouter()
const authStore = useAuthStore()
let timer = null
 
const kpis = ref([
  {
    title: 'Total Orders',
    value: '0',
    icon: 'shopping_cart',
    color: 'blue',
    trend: 'Lifetime',
    meta: 'Website orders',
  },
  {
    title: 'Unread Messages',
    value: '0',
    icon: 'mark_email_unread',
    color: 'orange',
    trend: 'Action Needed',
    meta: 'Contact form',
  },
  {
    title: 'Pending Reservations',
    value: '0',
    icon: 'event_seat',
    color: 'cyan',
    trend: 'Action Needed',
    meta: 'Table bookings',
  },
  {
    title: 'Total Revenue',
    value: '0.00',
    icon: 'payments',
    color: 'green',
    isCurrency: true,
    trend: 'Lifetime',
    meta: 'Completed sales',
  },
])
 
const recentOrders = ref([])
 
const fetchStats = async () => {
  try {
    loading.value = true
    const branchId = authStore.currentBranch?.id
 
    // Fetch unread messages
    const { count: unreadCount, error: msgError } = await supabase
      .from('website_messages')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'unread')
 
    if (msgError) throw msgError
 
    kpis.value[1].value = String(unreadCount || 0)
 
    // Fetch pending reservations
    const { count: pendingResCount, error: resError } = await supabase
      .from('website_reservations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
 
    if (resError) throw resError
    kpis.value[2].value = String(pendingResCount || 0)
 
    // Fetch orders stats
    if (branchId) {
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_number, total_amount, status, customer_name, created_at')
        .eq('branch_id', branchId)
        .eq('order_source', 'website')
        .order('created_at', { ascending: false })
 
      if (ordersError) throw ordersError
 
      kpis.value[0].value = String(orders ? orders.length : 0)
 
      const validOrders =
        orders?.filter((o) => ['completed', 'paid', 'delivered', 'served'].includes(o.status)) || []
      const revenue = validOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
 
      kpis.value[3].value = revenue > 0 ? formatCurrency(revenue) : 'Rs. 0.00'
 
      recentOrders.value = (orders || []).slice(0, 5) // Top 5 recent orders
    }
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
  } finally {
    loading.value = false
  }
}
 
const getStatusColor = (status) => {
  const map = {
    pending_waiter: 'orange-8',
    pending_payment: 'deep-orange-7',
    accepted: 'blue-8',
    preparing: 'cyan-8',
    ready: 'green-8',
    served: 'teal-8',
    invoiced: 'purple-8',
    paid: 'green-9',
    completed: 'green-9',
    cancelled: 'red-8',
    refunded: 'orange-8',
  }
  return map[status] || 'grey-7'
}
 
const formatCurrency = (val) => {
  return 'LKR ' + Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
 
onMounted(() => {
  fetchStats()
  // Polling removed — fetch once on mount to reduce egress
  // timer = setInterval(fetchStats, 60000)
})
 
onUnmounted(() => {
  clearInterval(timer)
})
</script>
 
<style scoped lang="scss">
.erp-dashboard-panel {
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: all 0.3s ease;
  overflow: hidden;
}
 
.body--light .erp-dashboard-panel {
  border-color: #e2e8f0;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03) !important;
}
 
.text-darker {
  color: #1e293b;
}
 
.action-btn {
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
 
.action-desc {
  opacity: 0.8;
}
.body--light .action-desc {
  color: rgba(255,255,255,0.9);
}
 
.erp-activity-list {
  max-width: 100%;
}
 
.erp-activity-item {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  transition: background 0.2s ease;
  &:last-child {
    border-bottom: none;
  }
  &:hover {
    background: rgba(255,255,255,0.02);
  }
}
.body--light .erp-activity-item {
  border-bottom-color: #f1f5f9;
  &:hover {
    background: #f8fafc;
  }
}
 
.desc-text {
  color: #94a3b8;
}
.body--light .desc-text {
  color: #64748b;
}
</style>

