<template>
  <q-page class="wb-dash q-pa-lg">
    <ERPToolbar moduleName="website" title="Website Dashboard" breadcrumbs="Website / Overview" />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg q-mt-sm">
      <div v-for="(stat, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-3">
        <DashboardCard v-bind="stat" />
      </div>
    </div>

    <!-- Main Content -->
    <div class="row q-col-gutter-md">
      <!-- Quick Actions -->
      <div class="col-12 col-md-6">
        <div class="wb-panel">
          <div class="wb-panel__header">
            <div class="wb-panel__header-icon">
              <q-icon name="bolt" size="18px" />
            </div>
            <span class="wb-panel__title">Quick Actions</span>
          </div>
          <div class="wb-panel__body">
            <div class="wb-action-card" @click="$router.push('/website-orders')">
              <div class="wb-action-card__icon wb-action-card__icon--blue">
                <q-icon name="language" size="20px" />
              </div>
              <div class="wb-action-card__content">
                <div class="wb-action-card__label">Website Orders</div>
                <div class="wb-action-card__desc">Process incoming website orders</div>
              </div>
              <q-icon name="chevron_right" size="18px" class="wb-action-card__arrow" />
            </div>

            <div class="wb-action-card" @click="$router.push('/website-messages')">
              <div class="wb-action-card__icon wb-action-card__icon--orange">
                <q-icon name="mail" size="20px" />
              </div>
              <div class="wb-action-card__content">
                <div class="wb-action-card__label">Contact Messages</div>
                <div class="wb-action-card__desc">Reply to online customer inquiries</div>
              </div>
              <q-icon name="chevron_right" size="18px" class="wb-action-card__arrow" />
            </div>

            <div class="wb-action-card" @click="$router.push('/website-reservations')">
              <div class="wb-action-card__icon wb-action-card__icon--cyan">
                <q-icon name="event_seat" size="20px" />
              </div>
              <div class="wb-action-card__content">
                <div class="wb-action-card__label">Reservations</div>
                <div class="wb-action-card__desc">Manage table reservations from website</div>
              </div>
              <q-icon name="chevron_right" size="18px" class="wb-action-card__arrow" />
            </div>

            <div class="wb-action-card" @click="$router.push('/website-menu-qr')">
              <div class="wb-action-card__icon wb-action-card__icon--purple">
                <q-icon name="qr_code_2" size="20px" />
              </div>
              <div class="wb-action-card__content">
                <div class="wb-action-card__label">Menu Book QR Standee</div>
                <div class="wb-action-card__desc">Generate & print table QR standees</div>
              </div>
              <q-icon name="chevron_right" size="18px" class="wb-action-card__arrow" />
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Orders Feed -->
      <div class="col-12 col-md-6">
        <div class="wb-panel">
          <div class="wb-panel__header">
            <div class="wb-panel__header-icon">
              <q-icon name="receipt_long" size="18px" />
            </div>
            <span class="wb-panel__title">Recent Orders</span>
            <q-btn flat round dense icon="refresh" @click="fetchStats" :loading="loading" class="wb-refresh-btn" />
          </div>
          <div class="wb-panel__body">
            <template v-if="loading">
              <div class="wb-empty">
                <q-spinner color="primary" size="2em" />
              </div>
            </template>
            <template v-else-if="recentOrders.length === 0">
              <div class="wb-empty">
                <q-icon name="receipt_long" size="36px" />
                <span>No recent orders found.</span>
              </div>
            </template>
            <template v-else>
              <div
                class="wb-order-row"
                v-for="order in recentOrders"
                :key="order.id"
              >
                <div class="wb-order-row__icon">
                  <q-icon name="shopping_bag" size="16px" />
                </div>
                <div class="wb-order-row__info">
                  <div class="wb-order-row__number">#{{ order.order_number }}</div>
                  <div class="wb-order-row__meta">{{ order.customer_name || 'Guest' }} · {{ formatCurrency(order.total_amount) }}</div>
                </div>
                <q-chip dense class="wb-status-chip" :class="`wb-status-chip--${statusClass(order.status)}`">
                  {{ order.status.replace(/_/g, ' ').toUpperCase() }}
                </q-chip>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Menu Book QR Modal -->
    <q-dialog v-model="menuBookQrDialog">
      <q-card style="min-width: 360px; max-width: 440px; border-radius: 16px;">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6 text-weight-bold">
            <q-icon name="menu_book" color="primary" class="q-mr-xs" />
            Menu Book Table QR
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="text-center q-pt-sm">
          <div class="text-caption text-grey-6 q-mb-md">
            Permanent QR Code for dine-in tables. Whenever you update the menu PDF, this same QR code will continue to work!
          </div>

          <!-- Live QR Canvas -->
          <div class="q-pa-md bg-white rounded-borders shadow-1 inline-block" style="border: 2px dashed #cbd5e1;">
            <canvas ref="qrCanvasRef" style="display: block; max-width: 100%;"></canvas>
          </div>

          <!-- Configurable Target URL -->
          <div class="q-mt-md text-left">
            <q-input
              v-model="menuBookUrl"
              outlined
              dense
              label="Menu Book URL"
              @update:model-value="generateQr"
            >
              <template #append>
                <q-btn flat round dense icon="content_copy" @click="copyQrUrl">
                  <q-tooltip>Copy Link</q-tooltip>
                </q-btn>
              </template>
            </q-input>
          </div>
        </q-card-section>

        <q-separator />

        <q-card-actions align="between" class="q-pa-md">
          <q-btn
            flat
            no-caps
            color="secondary"
            icon="open_in_new"
            label="Open Book"
            :href="menuBookUrl"
            target="_blank"
          />
          <div class="row q-gutter-sm">
            <q-btn
              color="primary"
              no-caps
              icon="download"
              label="Download PNG"
              @click="downloadQrPng"
            />
            <q-btn
              color="amber-9"
              no-caps
              icon="print"
              label="Print Standee"
              @click="printStandee"
            />
          </div>
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import { useRouter } from 'vue-router'
import QRCode from 'qrcode'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardCard from 'components/dashboard/DashboardCard.vue'

const $q = useQuasar()

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
      let allOrders = []
      let from = 0
      const limit = 1000
      let hasMore = true

      while (hasMore) {
        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select('id, total_amount, status, order_number, customer_name, created_at')
          .eq('branch_id', branchId)
          .eq('order_source', 'website')
          .order('created_at', { ascending: false })
          .range(from, from + limit - 1)

        if (ordersError) throw ordersError

        if (orders && orders.length > 0) {
          allOrders = [...allOrders, ...orders]
          from += limit
          if (orders.length < limit) {
            hasMore = false
          }
        } else {
          hasMore = false
        }
      }

      kpis.value[0].value = String(allOrders.length)

      const validOrders = allOrders.filter((o) => ['completed', 'paid', 'delivered', 'served'].includes(o.status))
      const revenue = validOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)

      kpis.value[3].value = revenue > 0 ? formatCurrency(revenue) : 'Rs. 0.00'

      recentOrders.value = allOrders.slice(0, 5) // Top 5 recent orders
    }
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
  } finally {
    loading.value = false
  }
}



const statusClass = (status) => {
  if (['paid', 'completed', 'served', 'delivered', 'ready'].includes(status)) return 'success'
  if (['pending_waiter', 'preparing', 'pending_payment'].includes(status)) return 'warning'
  if (['cancelled', 'refunded'].includes(status)) return 'danger'
  if (['accepted', 'invoiced'].includes(status)) return 'info'
  return 'neutral'
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
// ─── Menu Book QR Standee Generator ──────────────────────────────────────
const menuBookQrDialog = ref(false)
const menuBookUrl = ref('https://sevenwaves.lk/menu-book')
const qrCanvasRef = ref(null)

const openMenuBookQrModal = async () => {
  menuBookQrDialog.value = true
  await nextTick()
  generateQr()
}

const generateQr = async () => {
  const canvas = qrCanvasRef.value
  if (!canvas) return
  try {
    await QRCode.toCanvas(canvas, menuBookUrl.value, {
      width: 250,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
  } catch (err) {
    console.error('[MenuBookQR] Error generating QR:', err)
  }
}

const copyQrUrl = async () => {
  try {
    await navigator.clipboard.writeText(menuBookUrl.value)
    $q.notify({ type: 'positive', message: 'URL copied to clipboard!' })
  } catch {
    $q.notify({ type: 'negative', message: 'Failed to copy URL' })
  }
}

const downloadQrPng = () => {
  const canvas = qrCanvasRef.value
  if (!canvas) return
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = 'SevenWaves-MenuBook-QR.png'
  a.click()
  $q.notify({ type: 'positive', message: 'QR Code downloaded!' })
}

const printStandee = () => {
  const canvas = qrCanvasRef.value
  if (!canvas) return
  const imgData = canvas.toDataURL('image/png')
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Seven Waves - Table Menu Standee</title>
        <style>
          @page { size: A5 portrait; margin: 15mm; }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            text-align: center;
            background: #fff;
            color: #1e293b;
            margin: 0;
            padding: 20px;
          }
          .standee-card {
            border: 3px solid #b45309;
            border-radius: 20px;
            padding: 30px 20px;
            max-width: 380px;
            margin: 0 auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          }
          .logo-text {
            font-size: 24px;
            font-weight: 800;
            letter-spacing: 2px;
            color: #b45309;
            margin-bottom: 4px;
          }
          .sub-text {
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #64748b;
            margin-bottom: 24px;
          }
          .qr-img {
            width: 220px;
            height: 220px;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            padding: 10px;
            margin: 0 auto 20px;
          }
          .scan-badge {
            display: inline-block;
            background: #fef3c7;
            color: #92400e;
            font-weight: 700;
            font-size: 14px;
            padding: 6px 16px;
            border-radius: 999px;
            margin-bottom: 12px;
          }
          .prompt {
            font-size: 16px;
            font-weight: 600;
            color: #0f172a;
            margin-bottom: 6px;
          }
          .url-hint {
            font-size: 11px;
            color: #94a3b8;
            word-break: break-all;
          }
        </style>
      </head>
      <body>
        <div class="standee-card">
          <div class="logo-text">SEVEN WAVES</div>
          <div class="sub-text">Restaurant & Lounge</div>
          <div class="scan-badge">📱 DINE-IN DIGITAL MENU</div>
          <div><img src="${imgData}" class="qr-img" /></div>
          <div class="prompt">Scan with Camera to View Menu Book</div>
          <div class="url-hint">${menuBookUrl.value}</div>
        </div>
      </body>
    </html>
  `)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
  }, 350)
}
</script>

<style scoped lang="scss">
.wb-dash {
  background: var(--erp-bg-page);
  min-height: 100vh;
}



// Panels
.wb-panel {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-lg);
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.wb-panel__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--erp-border);
  flex-shrink: 0;
}

.wb-panel__header-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--erp-mod-website-subtle);
  color: var(--erp-mod-website);
  display: flex;
  align-items: center;
  justify-content: center;
}

.wb-panel__title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--erp-text-primary);
  flex: 1;
}

.wb-panel__body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.wb-refresh-btn {
  color: var(--erp-text-muted) !important;
}

// Action cards
.wb-action-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--erp-border);
  background: var(--erp-bg-page);
  cursor: pointer;
  transition: all 0.18s ease;
  &:hover {
    border-color: var(--erp-mod-website);
    background: var(--erp-mod-website-subtle);
    .wb-action-card__arrow {
      opacity: 1;
      transform: translateX(2px);
    }
  }
  &:active {
    transform: scale(0.985);
  }
}

.wb-action-card__icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  &--blue {
    background: rgba(59, 130, 246, 0.12);
    color: #3b82f6;
  }
  &--orange {
    background: rgba(249, 115, 22, 0.12);
    color: #f97316;
  }
  &--purple {
    background: rgba(168, 85, 247, 0.12);
    color: #a855f7;
  }
  &--cyan {
    background: var(--erp-mod-website-subtle);
    color: var(--erp-mod-website);
  }
}

.wb-action-card__content {
  flex: 1;
  min-width: 0;
}

.wb-action-card__label {
  font-size: 0.93rem;
  font-weight: 700;
  color: var(--erp-text-primary);
}

.wb-action-card__desc {
  font-size: 0.8rem;
  color: var(--erp-text-muted);
  margin-top: 2px;
}

.wb-action-card__arrow {
  color: var(--erp-text-muted);
  opacity: 0.4;
  transition: all 0.18s;
}

// Order rows
.wb-order-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--erp-border);
  &:last-child {
    border-bottom: none;
  }
}

.wb-order-row__icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  flex-shrink: 0;
  background: var(--erp-mod-website-subtle);
  color: var(--erp-mod-website);
  display: flex;
  align-items: center;
  justify-content: center;
}

.wb-order-row__info {
  flex: 1;
  min-width: 0;
}

.wb-order-row__number {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--erp-text-primary);
}

.wb-order-row__meta {
  font-size: 0.78rem;
  color: var(--erp-text-muted);
  margin-top: 1px;
}

// Status chips
.wb-status-chip {
  font-size: 0.7rem !important;
  font-weight: 700 !important;
  border-radius: 6px !important;
  &--success {
    background: var(--erp-success-subtle) !important;
    color: var(--erp-success) !important;
  }
  &--warning {
    background: var(--erp-warning-subtle) !important;
    color: var(--erp-warning) !important;
  }
  &--danger {
    background: var(--erp-danger-subtle) !important;
    color: var(--erp-danger) !important;
  }
  &--info {
    background: var(--erp-mod-website-subtle) !important;
    color: var(--erp-mod-website) !important;
  }
  &--neutral {
    background: var(--erp-bg-page) !important;
    color: var(--erp-text-muted) !important;
    border: 1px solid var(--erp-border) !important;
  }
}

// Empty / loading states
.wb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  color: var(--erp-text-muted);
  font-size: 0.88rem;
  gap: 8px;
}
</style>
