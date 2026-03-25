<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="website"
      title="Website Dashboard"
      breadcrumbs="Website / Overview"
    />

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
        <q-card class="erp-dashboard-panel bg-dark text-white shadow-1 column full-height">
          <q-card-section class="row items-center justify-between q-pb-none">
            <div class="text-h6 text-subtitle1 text-weight-bold">Quick Actions</div>
          </q-card-section>
          
          <q-card-section class="col q-pt-md">
            <div class="row q-col-gutter-sm">
              <div class="col-12">
                <q-btn
                  push
                  color="primary"
                  class="full-width q-py-sm"
                  align="left"
                  icon="language"
                  label="Manage Website Orders"
                  @click="$router.push('/website-orders')"
                >
                  <div class="text-caption text-grey-4 q-ml-md" style="text-transform: none">Process incoming website orders</div>
                </q-btn>
              </div>
              <div class="col-12 q-mt-sm">
                <q-btn
                  push
                  color="orange"
                  class="full-width q-py-sm"
                  align="left"
                  icon="mail"
                  label="View Contact Messages"
                  @click="$router.push('/website-messages')"
                >
                  <div class="text-caption text-grey-3 q-ml-md" style="text-transform: none">Reply to online customer inquiries</div>
                </q-btn>
              </div>
              <div class="col-12 q-mt-sm">
                <q-btn
                  push
                  color="teal"
                  class="full-width q-py-sm"
                  align="left"
                  icon="event_seat"
                  label="View Reservations"
                  @click="$router.push('/website-reservations')"
                >
                  <div class="text-caption text-grey-3 q-ml-md" style="text-transform: none">Manage table reservations from website</div>
                </q-btn>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Recent Orders Feed -->
      <div class="col-12 col-md-6">
        <q-card class="erp-dashboard-panel bg-dark text-white shadow-1 column full-height">
          <q-card-section class="row items-center justify-between q-pb-none">
            <div class="text-h6 text-subtitle1 text-weight-bold">Recent Output</div>
            <q-btn flat round dense icon="refresh" color="grey-5" @click="fetchStats" :loading="loading" />
          </q-card-section>
          <q-card-section class="col q-pt-sm">
            <q-list class="erp-activity-list" padding>
              <q-item v-for="order in recentOrders" :key="order.id" class="q-pa-sm erp-activity-item">
                <q-item-section avatar top>
                  <q-avatar size="32px" color="blue" text-color="white" icon="shopping_bag" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2 text-weight-medium">Order #{{ order.order_number }}</q-item-label>
                  <q-item-label caption class="text-grey-5">{{ order.customer_name || 'Guest' }} · {{ formatCurrency(order.total_amount) }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                   <q-chip dense :color="getStatusColor(order.status)" text-color="white" size="xs">
                     {{ order.status.replace(/_/g, ' ').toUpperCase() }}
                   </q-chip>
                </q-item-section>
              </q-item>
              <div v-if="recentOrders.length === 0 && !loading" class="text-grey-6 text-center q-pa-md">
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
  { title: 'Total Orders', value: '0', icon: 'shopping_cart', color: 'blue', trend: 'Lifetime', meta: 'Website orders' },
  { title: 'Unread Messages', value: '0', icon: 'mark_email_unread', color: 'orange', trend: 'Action Needed', meta: 'Contact form' },
  { title: 'Pending Reservations', value: '0', icon: 'event_seat', color: 'cyan', trend: 'Action Needed', meta: 'Table bookings' },
  { title: 'Total Revenue', value: '0.00', icon: 'payments', color: 'green', isCurrency: true, trend: 'Lifetime', meta: 'Completed sales' },
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
      
      const validOrders = orders?.filter(o => ['completed', 'paid', 'delivered'].includes(o.status)) || []
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
    pending_waiter: 'orange-8', pending_payment: 'deep-orange-7',
    accepted: 'blue-8', preparing: 'cyan-8', ready: 'green-8',
    served: 'teal-8', invoiced: 'purple-8', paid: 'green-9',
    completed: 'green-9', cancelled: 'red-8', refunded: 'orange-8',
  }
  return map[status] || 'grey-7'
}

const formatCurrency = (val) => {
  return 'Rs. ' + Number(val || 0).toFixed(2)
}

onMounted(() => {
  fetchStats()
  timer = setInterval(fetchStats, 60000)
})

onUnmounted(() => {
  clearInterval(timer)
})
</script>

<style scoped lang="scss">
.erp-dashboard-panel {
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.erp-activity-list {
  max-width: 100%;
}

.erp-activity-item {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  &:last-child {
    border-bottom: none;
  }
}
</style>
