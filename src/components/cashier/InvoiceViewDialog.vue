<template>
  <q-dialog v-model="isOpen" transition-show="scale" transition-hide="fade">
    <q-card class="inv-view-card">

      <!-- Header -->
      <div class="inv-header" :class="order?.invoices?.length > 0 ? 'inv-header--blue' : 'inv-header--grey'">
        <div class="inv-header__left">
          <div class="inv-header__icon">
            <q-icon name="receipt_long" size="22px" color="white" />
          </div>
          <div>
            <div class="inv-header__title">
              Order #{{ order?.order_number }}
            </div>
            <div class="inv-header__sub" v-if="order?.invoices?.length > 0">
              Invoice #{{ order.invoices[0].invoice_number }}
            </div>
            <div class="inv-header__sub" v-else>
              No invoice generated yet
            </div>
          </div>
        </div>
        <q-btn flat round dense icon="close" color="white" v-close-popup />
      </div>

      <!-- Body -->
      <div class="inv-body">

        <!-- Meta row -->
        <div class="inv-meta-row">
          <div class="inv-meta-chip">
            <q-icon name="table_restaurant" size="13px" />
            <span>{{ order?.tableNumber || '—' }}</span>
          </div>
          <div class="inv-meta-chip">
            <q-icon name="category" size="13px" />
            <span class="text-capitalize">{{ (order?.order_type || '').replace('_', '-') }}</span>
          </div>
          <div class="inv-meta-chip">
            <q-icon name="person" size="13px" />
            <span>{{ order?.waiterName || '—' }}</span>
          </div>
          <div class="inv-meta-chip" v-if="order?.customer_name">
            <q-icon name="account_circle" size="13px" />
            <span>{{ order.customer_name }}</span>
          </div>
        </div>

        <div class="inv-divider" />

        <!-- Items list -->
        <div class="inv-section-label">ORDER ITEMS</div>
        <div class="inv-items">
          <div
            v-for="item in order?.order_items"
            :key="item.id"
            class="inv-item"
            :class="{ cancelled: item.status === 'cancelled' }"
          >
            <span class="inv-item__qty">{{ item.quantity }}×</span>
            <span class="inv-item__name">{{ item.name }}</span>
            <span class="inv-item__price">LKR {{ parseFloat(item.total_price || 0).toFixed(2) }}</span>
          </div>
        </div>

        <div class="inv-divider" />

        <!-- Totals -->
        <div class="inv-totals">
          <div class="inv-totals__row">
            <span>Subtotal</span>
            <span>LKR {{ parseFloat(order?.subtotal || order?.total_amount || 0).toFixed(2) }}</span>
          </div>
          <div class="inv-totals__row" v-if="(order?.discount_amount || 0) > 0">
            <span class="text-red-4">Discount</span>
            <span class="text-red-4">−LKR {{ parseFloat(order?.discount_amount || 0).toFixed(2) }}</span>
          </div>
          <div class="inv-totals__row" v-if="(order?.tax_amount || 0) > 0">
            <span>Tax</span>
            <span>LKR {{ parseFloat(order?.tax_amount || 0).toFixed(2) }}</span>
          </div>
          <div class="inv-totals__divider" />
          <div class="inv-totals__row inv-totals__row--grand">
            <span>Total Due</span>
            <span>LKR {{ parseFloat(order?.total_amount || 0).toFixed(2) }}</span>
          </div>
        </div>

        <!-- Payment status (only if invoice exists) -->
        <div v-if="order?.invoices?.length > 0" class="inv-payment-status" :class="paymentStatusClass">
          <q-icon :name="paymentStatusIcon" size="16px" />
          <span>{{ paymentStatusLabel }}</span>
        </div>

      </div>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  order: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const paymentStatus = computed(() => props.order?.invoices?.[0]?.payment_status || '')

const paymentStatusClass = computed(() => ({
  'inv-payment-status--paid': paymentStatus.value === 'paid',
  'inv-payment-status--pending': paymentStatus.value !== 'paid',
}))

const paymentStatusIcon = computed(() =>
  paymentStatus.value === 'paid' ? 'check_circle' : 'pending'
)

const paymentStatusLabel = computed(() =>
  paymentStatus.value === 'paid' ? 'Payment Completed' : 'Awaiting Payment'
)
</script>

<style scoped lang="scss">
.inv-view-card {
  width: 420px;
  max-width: 96vw;
  border-radius: 16px !important;
  overflow: hidden;
  background: var(--erp-bg-card) !important;
  color: var(--erp-text-primary) !important;
  border: 1px solid var(--erp-border);
}

.inv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.12);

  &--blue { background: linear-gradient(135deg, #1e3a8a, #2563eb); }
  &--grey { background: linear-gradient(135deg, #374151, #6b7280); }

  &__left  { display: flex; align-items: center; gap: 12px; }
  &__icon  {
    width: 44px; height: 44px; border-radius: 11px;
    background: rgba(255,255,255,0.22);
    display: flex; align-items: center; justify-content: center;
    color: #ffffff !important;
  }
  &__title { font-size: 16px; font-weight: 800; color: #ffffff !important; }
  &__sub   { font-size: 11px; color: rgba(255,255,255,0.85); margin-top: 2px; }
}

.inv-body {
  padding: 16px;
}

.inv-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}

.inv-meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--erp-bg-input);
  border: 1px solid var(--erp-border);
  border-radius: 20px;
  padding: 3px 10px;
  font-size: 11px;
  color: var(--erp-text-secondary);
}

.inv-divider {
  height: 1px;
  background: var(--erp-border);
  margin: 12px 0;
}

.inv-section-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--erp-text-muted);
  text-transform: uppercase;
  margin-bottom: 8px;
}

.inv-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.inv-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 7px;
  transition: background 0.15s;
  &:hover { background: var(--erp-bg-card-hover); }
  &.cancelled { opacity: 0.35; text-decoration: line-through; }

  &__qty   { font-size: 11px; color: var(--erp-text-secondary); min-width: 20px; }
  &__name  { flex: 1; font-size: 13px; color: var(--erp-text-primary); }
  &__price { font-size: 12px; color: var(--erp-text-primary); font-variant-numeric: tabular-nums; }
}

.inv-totals {
  background: var(--erp-bg-input);
  border: 1px solid var(--erp-border);
  border-radius: 10px;
  padding: 12px;

  &__row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--erp-text-secondary);
    padding: 3px 0;
  }
  &__divider {
    height: 1px;
    background: var(--erp-border);
    margin: 8px 0;
  }
  &__row--grand {
    font-size: 16px;
    font-weight: 800;
    color: var(--erp-text-primary);
    padding-top: 4px;
  }
}

.inv-payment-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 14px;
  padding: 8px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;

  &--paid    { background: var(--erp-success-subtle); color: var(--erp-success); border: 1px solid var(--erp-success-subtle); }
  &--pending { background: var(--erp-warning-subtle); color: var(--erp-warning); border: 1px solid var(--erp-warning-subtle); }
}
</style>
