<template>
  <q-page class="delivery-history-page">
    <!-- ── Header ──────────────────────────────────── -->
    <div class="page-header">
      <h2 class="page-title">Delivery History</h2>
      <q-btn
        flat
        round
        dense
        icon="refresh"
        color="grey-4"
        :loading="refreshing"
        @click="refresh"
      />
    </div>

    <!-- ── Today's Summary ─────────────────────────── -->
    <div class="summary-row">
      <div class="summary-item">
        <div class="summary-value">{{ todayCount }}</div>
        <div class="summary-label">Today</div>
      </div>
      <div class="summary-divider" />
      <div class="summary-item">
        <div class="summary-value summary-value--green">{{ todayEarnings }}</div>
        <div class="summary-label">Earnings</div>
      </div>
      <div class="summary-divider" />
      <div class="summary-item">
        <div class="summary-value summary-value--blue">{{ avgDeliveryTime }}</div>
        <div class="summary-label">Avg Time</div>
      </div>
    </div>

    <!-- ── Loading ─────────────────────────────────── -->
    <div v-if="store.loading && !store.history.length" class="loading-wrap">
      <q-spinner-orbit size="48px" color="purple-4" />
    </div>

    <!-- ── Empty ───────────────────────────────────── -->
    <div v-else-if="!store.history.length" class="empty-state">
      <q-icon name="history" size="56px" color="grey-7" />
      <div class="empty-title">No deliveries yet</div>
      <div class="empty-sub">Your completed deliveries will appear here.</div>
    </div>

    <!-- ── History List ────────────────────────────── -->
    <div v-else class="history-list">
      <div v-for="item in store.history" :key="item.id" class="history-card">
        <div class="card-top">
          <div class="order-number">#{{ item.orderNumber }}</div>
          <q-chip dense color="green-9" text-color="white" size="sm" class="done-chip">
            Delivered
          </q-chip>
        </div>

        <div class="card-details">
          <div class="detail-row" v-if="item.customer_name">
            <q-icon name="person" size="14px" color="grey-6" />
            <span>{{ item.customer_name }}</span>
          </div>
          <div class="detail-row" v-if="item.delivery_address">
            <q-icon name="location_on" size="14px" color="grey-6" />
            <span class="address-text">{{ item.delivery_address }}</span>
          </div>
          <div class="detail-row">
            <q-icon name="payments" size="14px" color="grey-6" />
            <span class="total-amount">Rs. {{ Number(item.orderTotal || 0).toFixed(2) }}</span>
          </div>
        </div>

        <div class="card-timing">
          <div class="timing-pill" v-if="item.delivered_at">
            <q-icon name="check_circle" size="12px" color="green-6" />
            {{ formatDate(item.delivered_at) }}
          </div>
          <div class="timing-pill" v-if="deliveryDuration(item)">
            <q-icon name="timer" size="12px" color="grey-5" />
            {{ deliveryDuration(item) }}
          </div>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useDeliveryStore } from 'src/stores/deliveryStore'

const store = useDeliveryStore()
const refreshing = ref(false)

const todayStart = new Date()
todayStart.setHours(0, 0, 0, 0)

const todayItems = computed(() =>
  store.history.filter((h) => h.delivered_at && new Date(h.delivered_at) >= todayStart),
)

const todayCount = computed(() => todayItems.value.length)

const todayEarnings = computed(() => {
  const total = todayItems.value.reduce((s, h) => s + Number(h.orderTotal || 0), 0)
  return total === 0 ? 'Rs. 0' : `Rs. ${total.toLocaleString()}`
})

const avgDeliveryTime = computed(() => {
  const valid = todayItems.value.filter((h) => h.assigned_at)
  if (!valid.length) return '—'
  const totalMins = valid.reduce((s, h) => {
    return (
      s +
      Math.round((new Date(h.delivered_at).getTime() - new Date(h.assigned_at).getTime()) / 60000)
    )
  }, 0)
  return `${Math.round(totalMins / valid.length)}m`
})

async function refresh() {
  refreshing.value = true
  try {
    await store.loadHistory()
  } finally {
    refreshing.value = false
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  return isToday
    ? `Today ${time}`
    : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`
}

function deliveryDuration(item) {
  if (!item.assigned_at || !item.delivered_at) return null
  const minutes = Math.round(
    (new Date(item.delivered_at).getTime() - new Date(item.assigned_at).getTime()) / 60000,
  )
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
</script>

<style lang="scss" scoped>
.delivery-history-page {
  padding: 16px;
  min-height: 100vh;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.page-title {
  font-size: 20px;
  font-weight: 800;
  color: #e8eaf0;
  margin: 0;
}

// ── Summary Row ─────────────────────────
.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 14px 8px;
  margin-bottom: 16px;
}
.summary-item {
  text-align: center;
  flex: 1;
}
.summary-value {
  font-size: 18px;
  font-weight: 800;
  color: #e8eaf0;
  &--green {
    color: #a5d6a7;
  }
  &--blue {
    color: #64b5f6;
  }
}
.summary-label {
  font-size: 10px;
  color: #757575;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-top: 2px;
}
.summary-divider {
  width: 1px;
  height: 32px;
  background: rgba(255, 255, 255, 0.08);
}

.loading-wrap {
  display: flex;
  justify-content: center;
  padding: 60px 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 20px;
  text-align: center;
}
.empty-title {
  font-size: 16px;
  font-weight: 700;
  color: #bdbdbd;
}
.empty-sub {
  font-size: 12px;
  color: #757575;
}

// ── History Card ────────────────────────
.history-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 10px;
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.order-number {
  font-size: 15px;
  font-weight: 800;
  color: #e0e0e0;
}
.done-chip {
  font-size: 10px !important;
  height: 20px !important;
}

.card-details {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: #9e9e9e;
}
.address-text {
  color: #bdbdbd;
}
.total-amount {
  font-weight: 600;
  color: #a5d6a7;
}

.card-timing {
  display: flex;
  gap: 12px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}
.timing-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #757575;
}
</style>

<style lang="scss">
body.body--light {
  .delivery-history-page {
    background: #f8fafc;
  }

  .page-title {
    color: #0f172a;
  }

  // Summary row
  .summary-row {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }
  .summary-value {
    color: #0f172a;
    &--green {
      color: #16a34a;
    }
    &--blue {
      color: #2563eb;
    }
  }
  .summary-label {
    color: #94a3b8;
  }
  .summary-divider {
    background: #e2e8f0;
  }

  // Empty
  .empty-title {
    color: #64748b;
  }
  .empty-sub {
    color: #94a3b8;
  }

  // History cards
  .history-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }
  .order-number {
    color: #0f172a;
  }
  .detail-row {
    color: #475569;
  }
  .address-text {
    color: #334155;
  }
  .total-amount {
    color: #16a34a;
  }
  .card-timing {
    border-top-color: #f1f5f9;
  }
  .timing-pill {
    color: #94a3b8;
  }
}
</style>
