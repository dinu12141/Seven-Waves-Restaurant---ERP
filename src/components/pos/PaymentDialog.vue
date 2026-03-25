<template>
  <q-dialog v-model="isOpen" persistent maximized transition-show="slide-up" transition-hide="slide-down">
    <div class="pos-billing-fullscreen">
      <!-- ═══ TOP BAR ═══ -->
      <div class="billing-top-bar">
        <div class="top-left">
          <div class="topbar-icon-wrap">
            <q-icon name="point_of_sale" size="18px" color="primary" />
          </div>
          <span class="top-title">POS Billing</span>
          <q-badge v-if="isQueueOrder" color="blue-8" class="q-ml-sm">
            Order #{{ queueOrder?.order_number }}
          </q-badge>
          <q-badge v-if="isPaid" color="green" class="q-ml-sm">PAID</q-badge>
        </div>
        <div class="top-center">
          <span class="top-order-info">{{ orderTypeLabel }}</span>
          <span class="top-sep">•</span>
          <span class="top-items">{{ effectiveItemCount }} Items</span>
          <span class="top-sep">•</span>
          <span class="top-cashier">Cashier: {{ cashierName }}</span>
        </div>
        <div class="top-right">
          <q-btn flat round dense icon="close" color="grey-5" @click="handleClose" />
        </div>
      </div>

      <!-- ═══ MAIN BODY — Split Layout ═══ -->
      <div class="billing-body">
        <!-- ═══ LEFT: Bill Preview (using BillPrintTemplate format) ═══ -->
        <div class="bill-preview-panel">
          <div class="bill-preview-scroll">
            <!-- Use real BillPrintTemplate if we have a real invoice (after payment) -->
            <BillPrintTemplate
              v-if="printInvoice"
              ref="printTemplateRef"
              :invoice="printInvoice"
              :branch-name="branchName"
            />
            <!-- Otherwise use simulated invoice from cart or queue order -->
            <BillPrintTemplate
              v-else
              ref="printTemplateRef"
              :invoice="simulatedInvoice"
              :branch-name="branchName"
            />
          </div>

          <!-- Bill Actions -->
          <div class="bill-actions">
            <button class="bill-act-btn print-btn" @click="printBill" :disabled="effectiveItemCount === 0">
              <q-icon name="print" size="20px" />
              <span>{{ isPaid ? 'PRINT RECEIPT' : 'PRINT BILL' }}</span>
            </button>
          </div>
        </div>

        <!-- ═══ RIGHT: Payment Panel ═══ -->
        <div class="payment-panel">
          <template v-if="!isPaid">
            <!-- Payment Method Selection -->
            <div class="pay-section">
              <div class="pay-section-label">PAYMENT METHOD</div>
              <div class="pay-methods">
                <button
                  v-for="m in paymentMethods"
                  :key="m.id"
                  class="pay-method-btn"
                  :class="{ active: selectedMethod === m.id }"
                  @click="selectedMethod = m.id"
                >
                  <q-icon :name="m.icon" size="28px" />
                  <span>{{ m.label }}</span>
                </button>
              </div>
            </div>

            <!-- Amount Input (for cash) -->
            <div class="pay-section" v-if="selectedMethod === 'cash'">
              <div class="pay-section-label">AMOUNT RECEIVED</div>
              <div class="amount-display">
                <span class="amount-currency">LKR</span>
                <span class="amount-value">{{ amountReceived > 0 ? fmt(amountReceived) : '0.00' }}</span>
              </div>

              <!-- Quick amount buttons -->
              <div class="quick-amounts">
                <button v-for="q in quickAmounts" :key="q" class="quick-btn" @click="setAmount(q)">
                  {{ q.toLocaleString() }}
                </button>
                <button class="quick-btn exact-btn" @click="setAmount(effectiveTotalAmount)">EXACT</button>
              </div>

              <!-- Numpad -->
              <div class="pay-numpad">
                <button v-for="k in ['7','8','9','4','5','6','1','2','3','0','.','\u232B']" :key="k"
                  class="numpad-key"
                  :class="{ 'numpad-clear': k === '\u232B' }"
                  @click="numKey(k)"
                >
                  {{ k }}
                </button>
              </div>

              <!-- Change Display -->
              <div class="change-display" v-if="amountReceived > 0">
                <div class="change-label">{{ changeAmount >= 0 ? 'CHANGE' : 'REMAINING' }}</div>
                <div class="change-value" :class="{ negative: changeAmount < 0 }">
                  LKR {{ fmt(Math.abs(changeAmount)) }}
                </div>
              </div>
            </div>

            <!-- Card/Online — no amount input needed -->
            <div class="pay-section" v-if="selectedMethod !== 'cash'">
              <div class="card-total-display">
                <div class="card-total-label">CHARGE AMOUNT</div>
                <div class="card-total-value">LKR {{ fmt(effectiveTotalAmount) }}</div>
              </div>
            </div>

            <!-- Confirm Button -->
            <div class="pay-confirm-section">
              <button
                class="confirm-pay-btn"
                :disabled="!canConfirm || isProcessing"
                @click="confirmPayment"
              >
                <q-spinner-dots v-if="isProcessing" size="24px" color="white" />
                <template v-else>
                  <q-icon name="check_circle" size="24px" />
                  <span>CONFIRM PAYMENT — LKR {{ fmt(effectiveTotalAmount) }}</span>
                </template>
              </button>
            </div>
          </template>

          <!-- Paid State -->
          <template v-else>
            <div class="paid-success">
              <q-icon name="verified" size="64px" color="green-5" />
              <div class="paid-title">PAYMENT COMPLETE</div>
              <div class="paid-amount">LKR {{ fmt(effectiveTotalAmount) }}</div>
              <div class="paid-method">Paid via {{ displayPaymentMethod }}</div>
              <div class="paid-change" v-if="changeAmount > 0">
                Change: <strong>LKR {{ fmt(changeAmount) }}</strong>
              </div>
              <div v-if="printInvoice?.invoice_number" class="paid-invoice-num">
                Invoice #{{ printInvoice.invoice_number }}
              </div>

              <div class="paid-actions">
                <button class="paid-act-btn print-receipt-btn" @click="printBill">
                  <q-icon name="print" size="20px" />
                  <span>PRINT RECEIPT</span>
                </button>
                <button class="paid-act-btn new-order-btn" @click="handleDone">
                  <q-icon :name="isQueueOrder ? 'close' : 'add_circle'" size="20px" />
                  <span>{{ isQueueOrder ? 'CLOSE' : 'NEW ORDER' }}</span>
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { Notify } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import { useCashierStore } from 'src/stores/cashierStore'
import BillPrintTemplate from 'src/components/cashier/BillPrintTemplate.vue'

const props = defineProps({
  modelValue: Boolean,
  // ── POS manual order props ──
  totalAmount: { type: Number, default: 0 },
  subtotalAmount: { type: Number, default: 0 },
  discountPercent: { type: Number, default: 0 },
  discountValue: { type: Number, default: 0 },
  taxValue: { type: Number, default: 0 },
  itemCount: { type: Number, default: 0 },
  orderType: { type: String, default: 'dine-in' },
  cartItems: { type: Array, default: () => [] },
  customerName: { type: String, default: '' },
  loading: Boolean,
  // ── Queue order prop (billing queue orders from DB) ──
  queueOrder: { type: Object, default: null },
})

const emit = defineEmits(['update:modelValue', 'confirm', 'new-order', 'paid'])

const authStore = useAuthStore()
const cashierStore = useCashierStore()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const printTemplateRef = ref(null)

// Payment state
const selectedMethod = ref('cash')
const amountBuffer = ref('')
const isPaid = ref(false)
const confirmedMethod = ref('')
const printInvoice = ref(null) // real invoice after payment
const isProcessing = ref(false)

const paymentMethods = [
  { id: 'cash', label: 'CASH', icon: 'payments' },
  { id: 'card', label: 'CARD', icon: 'credit_card' },
  { id: 'online', label: 'ONLINE', icon: 'qr_code_scanner' },
]

const cashierName = computed(() => authStore.profile?.full_name || 'Cashier')
const branchName = computed(() => authStore.currentBranch?.name || 'Restaurant')

// ── Mode detection ──
const isQueueOrder = computed(() => !!props.queueOrder)

// ── Effective values (from cart OR queue order) ──
const effectiveTotalAmount = computed(() => {
  if (isQueueOrder.value) return parseFloat(props.queueOrder.total_amount || 0)
  return props.totalAmount
})

const effectiveSubtotal = computed(() => {
  if (isQueueOrder.value) return parseFloat(props.queueOrder.subtotal || props.queueOrder.total_amount || 0)
  return props.subtotalAmount
})

const effectiveItemCount = computed(() => {
  if (isQueueOrder.value) return props.queueOrder.order_items?.length || props.queueOrder.itemCount || 0
  return props.itemCount
})

const effectiveItems = computed(() => {
  if (isQueueOrder.value) {
    return (props.queueOrder.order_items || []).map((item, idx) => ({
      id: idx,
      menu_item_name: item.name || item.menu_item_name || 'Item',
      quantity: item.quantity || item.qty || 1,
      unit_price: parseFloat(item.unit_price || item.price || 0),
      total_price: parseFloat(item.total_price || (item.unit_price * item.quantity) || 0),
    }))
  }
  return props.cartItems.map((item, idx) => ({
    id: idx,
    menu_item_name: item.name + (item.variant ? ` (${item.variant})` : ''),
    quantity: item.qty,
    unit_price: item.price,
    total_price: item.price * item.qty,
  }))
})

const effectiveCustomerName = computed(() => {
  if (isQueueOrder.value) return props.queueOrder.customer_name || ''
  return props.customerName
})

const effectiveOrderType = computed(() => {
  if (isQueueOrder.value) return props.queueOrder.order_type || 'dine_in'
  const map = { 'dine-in': 'dine_in', 'takeaway': 'takeaway', 'delivery': 'delivery' }
  return map[props.orderType] || 'dine_in'
})

const orderTypeLabel = computed(() => {
  const map = {
    'dine_in': 'TABLE ORDER', 'dine-in': 'TABLE ORDER',
    'takeaway': 'TAKE AWAY', 'take_away': 'TAKE AWAY',
    'delivery': 'DELIVERY',
  }
  if (isQueueOrder.value) return map[props.queueOrder.order_type] || 'ORDER'
  return map[props.orderType] || 'ORDER'
})

/**
 * Build a simulated invoice object matching BillPrintTemplate shape.
 * Works for both POS manual cart items and billing queue orders.
 */
const simulatedInvoice = computed(() => {
  const now = isQueueOrder.value
    ? (props.queueOrder.created_at || new Date().toISOString())
    : new Date().toISOString()

  const qo = props.queueOrder // shorthand for queue order

  return {
    invoice_number: isQueueOrder.value ? (qo.invoices?.[0]?.invoice_number || '—') : '—',
    created_at: now,
    subtotal: effectiveSubtotal.value,
    grand_total: effectiveTotalAmount.value,
    delivery_charge: isQueueOrder.value ? parseFloat(qo.delivery_charge || 0) : 0,
    customer_name: effectiveCustomerName.value,
    customer_phone: isQueueOrder.value ? (qo.customer_phone || '') : '',
    invoice_items: effectiveItems.value,
    payments: isPaid.value ? [{
      id: 'pos-pay',
      amount: amountReceived.value,
      payment_methods: { name: confirmedMethod.value },
    }] : [],
    orders: {
      order_type: effectiveOrderType.value,
      customer_name: effectiveCustomerName.value,
      customer_phone: isQueueOrder.value ? (qo.customer_phone || '') : '',
      delivery_address: isQueueOrder.value ? (qo.delivery_address || '') : '',
      pax: isQueueOrder.value ? (qo.pax || 1) : 1,
      waiter: {
        full_name: isQueueOrder.value
          ? (qo.waiterName || qo.waiter?.full_name || cashierName.value)
          : cashierName.value
      },
      kot_tickets: isQueueOrder.value ? (qo.kot_tickets || []) : [],
      restaurant_tables: isQueueOrder.value
        ? (qo.restaurant_tables || (qo.tableNumber ? { table_number: qo.tableNumber } : null))
        : null,
    },
  }
})

// Amount
const amountReceived = computed(() => {
  if (selectedMethod.value !== 'cash') return effectiveTotalAmount.value
  return parseFloat(amountBuffer.value) || 0
})

const changeAmount = computed(() => amountReceived.value - effectiveTotalAmount.value)

const canConfirm = computed(() => {
  if (effectiveItemCount.value === 0) return false
  if (selectedMethod.value === 'cash') {
    return amountReceived.value >= effectiveTotalAmount.value
  }
  return true
})

// Display payment method — from real invoice if viewing a receipt, otherwise from local state
const displayPaymentMethod = computed(() => {
  if (printInvoice.value?.payments?.length > 0) {
    const pm = printInvoice.value.payments[0]
    return pm.payment_methods?.name || pm.method || confirmedMethod.value || 'Completed'
  }
  return confirmedMethod.value || 'Completed'
})

// Quick amount buttons
const quickAmounts = computed(() => {
  const t = effectiveTotalAmount.value
  const base = [500, 1000, 2000, 5000]
  const rounded = Math.ceil(t / 100) * 100
  const extras = [rounded]
  if (rounded + 100 <= 10000) extras.push(rounded + 100)
  const all = [...new Set([...base, ...extras])].filter(v => v >= t).sort((a, b) => a - b)
  return all.slice(0, 5)
})

// Numpad
function numKey(key) {
  if (key === '\u232B') {
    amountBuffer.value = amountBuffer.value.slice(0, -1)
  } else if (key === '.') {
    if (!amountBuffer.value.includes('.')) {
      amountBuffer.value += key
    }
  } else {
    amountBuffer.value += key
  }
}

function setAmount(val) {
  amountBuffer.value = val.toFixed(2)
}

// ══════════════════════════════════════════════════
// Confirm Payment — handles BOTH manual POS and queue orders
// ══════════════════════════════════════════════════
async function confirmPayment() {
  if (!canConfirm.value) return

  const methodName = selectedMethod.value === 'cash' ? 'Cash'
    : selectedMethod.value === 'card' ? 'Card' : 'Online'
  confirmedMethod.value = methodName

  if (isQueueOrder.value) {
    // ── QUEUE ORDER: process directly via RPCs ──
    await processQueueOrderPayment(methodName)
  } else {
    // ── MANUAL POS: emit to parent (POSPage handles via orderStore) ──
    emit('confirm', {
      method: selectedMethod.value,
      amount: amountReceived.value,
      change: Math.max(0, changeAmount.value),
    })
  }
}

/**
 * Process payment for a billing queue order.
 * Calls accept → invoice → payment RPCs in sequence.
 */
async function processQueueOrderPayment(methodName) {
  isProcessing.value = true
  const orderId = props.queueOrder.id

  try {
    // Step 1: Accept order if still pending_waiter
    if (props.queueOrder.status === 'pending_waiter') {
      const { data: acceptData, error: acceptError } = await supabase.rpc(
        'process_waiter_accept',
        { p_order_id: orderId }
      )
      if (acceptError) throw new Error(`Accept failed: ${acceptError.message}`)
      if (!acceptData?.success && acceptData?.code !== 'ALREADY_ACCEPTED') {
        throw new Error(acceptData?.error || 'Accept failed')
      }
    }

    // Step 2: Generate invoice if not already invoiced
    const status = props.queueOrder.status
    if (status !== 'invoiced' && status !== 'paid') {
      const { data: invData, error: invError } = await supabase.rpc(
        'process_cashier_invoice',
        { p_order_id: orderId }
      )
      if (invError) throw new Error(`Invoice failed: ${invError.message}`)
      if (!invData?.success && invData?.message !== 'Already invoiced.') {
        throw new Error(invData?.error || 'Invoice failed')
      }
    }

    // Step 3: Record payment
    const { data: payData, error: payError } = await supabase.rpc(
      'process_cashier_payment',
      {
        p_order_id: orderId,
        p_payment_method: methodName,
        p_amount_paid: effectiveTotalAmount.value,
      }
    )
    if (payError) throw new Error(`Payment failed: ${payError.message}`)
    if (!payData?.success && payData?.message !== 'Already paid.') {
      throw new Error(payData?.error || 'Payment failed')
    }

    // Step 4: Fetch real invoice for receipt
    isPaid.value = true
    await fetchRealInvoice(orderId)

    // Notify parent
    emit('paid', orderId)

    Notify.create({
      message: 'Payment Successful!',
      caption: `Order #${props.queueOrder.order_number} paid via ${methodName}`,
      color: 'positive',
      icon: 'verified',
      position: 'top',
      timeout: 2000,
    })
  } catch (err) {
    console.error('[PaymentDialog] Queue order payment error:', err)
    Notify.create({
      message: 'Payment Failed',
      caption: err.message,
      color: 'red',
      position: 'top',
    })
  } finally {
    isProcessing.value = false
  }
}

/**
 * Fetch the real invoice from the database for receipt printing.
 */
async function fetchRealInvoice(orderId) {
  try {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (invoices?.length > 0) {
      const realInvoice = await cashierStore.fetchInvoiceDetails(invoices[0].id)
      if (realInvoice) {
        printInvoice.value = realInvoice
      }
    }
  } catch (err) {
    console.warn('[PaymentDialog] Could not fetch real invoice:', err)
  }
}

/**
 * Called from parent after successful POS manual payment.
 */
async function markAsPaid(orderId) {
  isPaid.value = true
  if (orderId) {
    await fetchRealInvoice(orderId)
  }
}

// Done / New Order
function handleDone() {
  isPaid.value = false
  amountBuffer.value = ''
  selectedMethod.value = 'cash'
  confirmedMethod.value = ''
  printInvoice.value = null
  isProcessing.value = false
  if (!isQueueOrder.value) {
    emit('new-order')
  }
  emit('update:modelValue', false)
}

function handleClose() {
  if (isPaid.value) {
    handleDone()
  } else {
    emit('update:modelValue', false)
  }
}

// Reset when dialog opens — but handle paid orders specially
watch(isOpen, async (val) => {
  if (val) {
    amountBuffer.value = ''
    selectedMethod.value = 'cash'
    confirmedMethod.value = ''
    printInvoice.value = null
    isProcessing.value = false

    // ── If opening a PAID queue order, skip to receipt view ──
    if (isQueueOrder.value && (props.queueOrder.status === 'paid' || props.queueOrder.payment_status === 'paid')) {
      isPaid.value = true
      confirmedMethod.value = 'Completed'

      // Fetch the real invoice for the receipt
      await fetchRealInvoice(props.queueOrder.id)
    } else {
      isPaid.value = false
    }
  }
})

// Print using BillPrintTemplate's printReceipt()
async function printBill() {
  await nextTick()
  await new Promise(r => setTimeout(r, 150))
  if (printTemplateRef.value?.printReceipt) {
    printTemplateRef.value.printReceipt()
  }
}

function fmt(val) {
  return parseFloat(val || 0).toFixed(2)
}

defineExpose({ markAsPaid, printBill })
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════════
   POS Billing Fullscreen
   ═══════════════════════════════════════════════════════════ */

.pos-billing-fullscreen {
  width: 100vw;
  height: 100vh;
  background: #0d0d14;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Top Bar ────────────────────────────────────────────── */
.billing-top-bar {
  height: 48px;
  background: rgba(255,255,255,0.03);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}
.top-left { display: flex; align-items: center; gap: 8px; }
.topbar-icon-wrap {
  width: 30px; height: 30px; border-radius: 8px;
  background: rgba(33,150,243,0.12);
  display: flex; align-items: center; justify-content: center;
}
.top-title { color: #fff; font-weight: 700; font-size: 15px; }
.top-center { display: flex; align-items: center; gap: 8px; color: #9ca3af; font-size: 13px; }
.top-sep { color: #4b5563; }
.top-items { color: #d1d5db; font-weight: 500; }
.top-cashier { color: #f5c542; font-weight: 600; }
.top-right { display: flex; align-items: center; }

/* ── Body — Split Layout ─────────────────────────────── */
.billing-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ── LEFT: Bill Preview ──────────────────────────────── */
.bill-preview-panel {
  width: 400px;
  min-width: 340px;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255,255,255,0.06);
  background: #0d0d14;
}

.bill-preview-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* Bill Actions */
.bill-actions {
  padding: 12px 16px;
  background: rgba(255,255,255,0.02);
  border-top: 1px solid rgba(255,255,255,0.06);
  display: flex;
  gap: 8px;
}
.bill-act-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  letter-spacing: 0.5px;
}
.print-btn {
  background: #1e40af;
  color: #fff;
}
.print-btn:hover { background: #2563eb; }
.print-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── RIGHT: Payment Panel ────────────────────────────── */
.payment-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px 24px;
  background: #0a0e17;
  overflow-y: auto;
}

.pay-section { margin-bottom: 20px; }
.pay-section-label {
  font-size: 11px;
  font-weight: 700;
  color: #9ca3af;
  letter-spacing: 1.5px;
  margin-bottom: 10px;
}

/* Payment methods */
.pay-methods { display: flex; gap: 10px; }
.pay-method-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 12px;
  border: 2px solid #374151;
  border-radius: 12px;
  background: #111827;
  color: #9ca3af;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.pay-method-btn:hover {
  border-color: #6b7280;
  background: #1f2937;
}
.pay-method-btn.active {
  border-color: #f59e0b;
  background: rgba(245,158,11,0.1);
  color: #f5c542;
}

/* Amount display */
.amount-display {
  background: #111827;
  border: 2px solid #374151;
  border-radius: 12px;
  padding: 14px 20px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
}
.amount-currency { color: #9ca3af; font-size: 16px; font-weight: 600; }
.amount-value { color: #fff; font-size: 32px; font-weight: 800; font-variant-numeric: tabular-nums; }

/* Quick amounts */
.quick-amounts { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.quick-btn {
  flex: 1;
  min-width: 70px;
  padding: 10px 8px;
  border: 1px solid #374151;
  border-radius: 8px;
  background: #1f2937;
  color: #d1d5db;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.12s ease;
}
.quick-btn:hover { background: #374151; color: #fff; }
.exact-btn { background: #0d3320; border-color: #166534; color: #4ade80; }
.exact-btn:hover { background: #166534; }

/* Numpad */
.pay-numpad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 16px;
}
.numpad-key {
  padding: 16px;
  border: 1px solid #374151;
  border-radius: 10px;
  background: #111827;
  color: #e5e7eb;
  font-size: 20px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.1s ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.numpad-key:hover { background: #1f2937; }
.numpad-key:active { background: #374151; transform: scale(0.96); }
.numpad-clear { background: #7f1d1d; border-color: #991b1b; color: #fca5a5; }
.numpad-clear:hover { background: #991b1b; }

/* Change display */
.change-display {
  background: #111827;
  border: 2px solid #374151;
  border-radius: 12px;
  padding: 14px 20px;
  text-align: center;
  margin-bottom: 16px;
}
.change-label { font-size: 11px; font-weight: 700; color: #9ca3af; letter-spacing: 1.5px; }
.change-value { font-size: 28px; font-weight: 800; color: #4ade80; margin-top: 4px; }
.change-value.negative { color: #f87171; }

/* Card total */
.card-total-display {
  background: #111827;
  border: 2px solid #374151;
  border-radius: 12px;
  padding: 24px 20px;
  text-align: center;
}
.card-total-label { font-size: 11px; font-weight: 700; color: #9ca3af; letter-spacing: 1.5px; }
.card-total-value { font-size: 36px; font-weight: 800; color: #fff; margin-top: 8px; }

/* Confirm button */
.pay-confirm-section { margin-top: auto; padding-top: 12px; }
.confirm-pay-btn {
  width: 100%;
  padding: 18px 24px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #059669, #047857);
  color: #fff;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.5px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.15s ease;
  box-shadow: 0 4px 16px rgba(5,150,105,0.3);
}
.confirm-pay-btn:hover { background: linear-gradient(135deg, #047857, #065f46); transform: translateY(-1px); }
.confirm-pay-btn:active { transform: scale(0.98); }
.confirm-pay-btn:disabled {
  background: #374151;
  color: #6b7280;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

/* ── Paid Success State ──────────────────────────────── */
.paid-success {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
}
.paid-title { font-size: 22px; font-weight: 800; color: #4ade80; letter-spacing: 2px; }
.paid-amount { font-size: 36px; font-weight: 800; color: #fff; }
.paid-method { font-size: 14px; color: #9ca3af; }
.paid-change { font-size: 16px; color: #fbbf24; margin-top: 4px; }
.paid-invoice-num { font-size: 12px; color: #6b7280; font-weight: 600; letter-spacing: 0.5px; margin-top: 2px; }
.paid-actions { display: flex; gap: 12px; margin-top: 24px; }
.paid-act-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 24px; border: none; border-radius: 10px;
  font-size: 14px; font-weight: 700; cursor: pointer;
  transition: all 0.15s ease; letter-spacing: 0.5px;
}
.print-receipt-btn { background: #1e40af; color: #fff; }
.print-receipt-btn:hover { background: #2563eb; }
.new-order-btn { background: #374151; color: #d1d5db; }
.new-order-btn:hover { background: #4b5563; }
</style>
