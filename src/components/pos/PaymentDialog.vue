<template>
  <q-dialog
    v-model="isOpen"
    persistent
    maximized
    transition-show="slide-up"
    transition-hide="slide-down"
  >
    <div class="pos-billing-fullscreen">
      <!-- ═══ TOP BAR ═══ -->
      <div class="billing-top-bar">
        <div class="top-left">
          <div class="topbar-icon-wrap">
            <q-icon name="point_of_sale" size="18px" color="primary" />
          </div>
          <span class="top-title">POS Billing</span>
          <!-- Merged table badge -->
          <q-badge v-if="isMergeMode" color="orange-8" class="q-ml-sm">
            <q-icon name="merge_type" size="12px" class="q-mr-xs" />
            {{ mergedOrders.length }} Orders Merged — Table {{ mergedTableNumber }}
          </q-badge>
          <q-badge v-else-if="isQueueOrder" color="blue-8" class="q-ml-sm">
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
              :cashier-name="cashierName"
            />
            <!-- Otherwise use simulated invoice from cart or queue order -->
            <BillPrintTemplate
              v-else
              ref="printTemplateRef"
              :invoice="simulatedInvoice"
              :branch-name="branchName"
              :cashier-name="cashierName"
            />
          </div>

          <!-- Bill Actions -->
          <div class="bill-actions">
            <button
              class="bill-act-btn print-btn"
              @click="printBill"
              :disabled="effectiveItemCount === 0"
            >
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
                  @click="selectMethod(m.id)"
                >
                  <q-icon :name="m.icon" size="28px" />
                  <span>{{ m.label }}</span>
                </button>
              </div>

              <!-- Sub-options for Card -->
              <div class="pay-methods q-mt-xs" v-if="selectedMethod === 'card'">
                <button
                  v-for="sub in cardSubMethods"
                  :key="sub.id"
                  class="pay-method-btn sub-method-btn"
                  :class="{ active: selectedSubMethod === sub.id }"
                  @click="selectedSubMethod = sub.id"
                >
                  <span>{{ sub.label }}</span>
                </button>
              </div>

              <!-- Sub-options for Other -->
              <div class="pay-methods q-mt-xs" v-if="selectedMethod === 'other'">
                <button
                  v-for="sub in otherSubMethods"
                  :key="sub.id"
                  class="pay-method-btn sub-method-btn"
                  :class="{ active: selectedSubMethod === sub.id }"
                  @click="selectedSubMethod = sub.id"
                >
                  <span>{{ sub.label }}</span>
                </button>
              </div>

              <!-- Credit: a registered customer (account) is REQUIRED -->
              <div v-if="needsCreditCustomer" class="credit-cust-box q-mt-sm">
                <div class="pay-section-label">
                  CUSTOMER (ACCOUNT) <span class="credit-required">*</span>
                </div>

                <div v-if="creditCustomer" class="credit-cust-selected">
                  <div class="row items-center no-wrap">
                    <q-icon name="account_circle" size="26px" color="amber-5" class="q-mr-sm" />
                    <div class="col">
                      <div class="credit-cust-name">{{ customerDisplayName(creditCustomer) }}</div>
                      <div class="credit-cust-meta">
                        {{ [creditCustomer.customer_code, creditCustomer.phone].filter(Boolean).join(' • ') }}
                      </div>
                    </div>
                    <q-btn
                      flat
                      dense
                      round
                      icon="close"
                      color="grey-5"
                      :disable="isProcessing"
                      @click="clearCreditCustomer"
                    />
                  </div>
                  <div class="credit-cust-figures">
                    <div>
                      <span>Credit limit</span>
                      <strong>{{ creditCheck.hasLimit ? 'LKR ' + fmt(creditCheck.limit) : 'No limit' }}</strong>
                    </div>
                    <div>
                      <span>Open balance</span>
                      <strong>
                        <q-spinner v-if="creditBalanceLoading" size="12px" />
                        <template v-else>{{ creditOpenBalance === null ? '—' : 'LKR ' + fmt(creditOpenBalance) }}</template>
                      </strong>
                    </div>
                    <div>
                      <span>After this sale</span>
                      <strong>LKR {{ fmt(creditCheck.projected) }}</strong>
                    </div>
                  </div>
                  <div v-if="creditCheck.exceeds" class="credit-limit-warn">
                    <q-icon name="warning" size="16px" class="q-mr-xs" />
                    Over credit limit by LKR {{ fmt(creditCheck.overBy) }} — continue only if approved.
                  </div>
                </div>

                <template v-else>
                  <q-input
                    v-model="creditSearch"
                    dark
                    dense
                    outlined
                    clearable
                    placeholder="Search registered customer by name / phone…"
                    @update:model-value="onCreditSearchInput"
                  >
                    <template #prepend><q-icon name="search" /></template>
                    <template #append>
                      <q-spinner v-if="creditSearching" size="18px" color="amber-5" />
                    </template>
                  </q-input>
                  <div v-if="creditResults.length" class="credit-cust-results">
                    <button
                      v-for="c in creditResults"
                      :key="c.id"
                      class="credit-cust-row"
                      @click="pickCreditCustomer(c)"
                    >
                      <span class="credit-cust-row-name">{{ customerDisplayName(c) }}</span>
                      <span class="credit-cust-row-meta">
                        {{ c.phone || '' }}
                        <template v-if="Number(c.credit_limit) > 0"> • Limit LKR {{ fmt(c.credit_limit) }}</template>
                      </span>
                    </button>
                  </div>
                  <div
                    v-else-if="(creditSearch || '').trim().length >= 2 && !creditSearching"
                    class="credit-cust-empty"
                  >
                    {{ creditSearchError || 'No registered customer found — register the customer first.' }}
                  </div>
                  <div class="credit-cust-hint">
                    <q-icon name="info" size="14px" class="q-mr-xs" />
                    Credit sales can only be charged to a registered customer.
                  </div>
                </template>
              </div>
            </div>

            <!-- Split Payment Section -->
            <div class="pay-section" v-if="selectedMethod === 'split'">
              <div class="pay-section-label">SPLIT PAYMENT BREAKDOWN</div>
              <div class="split-pay-grid">
                <div class="split-row">
                  <div class="split-label"><q-icon name="payments" size="18px" class="q-mr-xs" color="positive" /> Cash</div>
                  <input
                    v-model.number="splitCashAmount"
                    type="number"
                    min="0"
                    step="10"
                    class="split-input"
                    placeholder="0.00"
                  />
                </div>
                <div class="split-row">
                  <div class="split-label"><q-icon name="credit_card" size="18px" class="q-mr-xs" color="primary" /> Card</div>
                  <input
                    v-model.number="splitCardAmount"
                    type="number"
                    min="0"
                    step="10"
                    class="split-input"
                    placeholder="0.00"
                  />
                </div>
                <div class="split-row">
                  <div class="split-label"><q-icon name="qr_code" size="18px" class="q-mr-xs" color="warning" /> QR / Online</div>
                  <input
                    v-model.number="splitQrAmount"
                    type="number"
                    min="0"
                    step="10"
                    class="split-input"
                    placeholder="0.00"
                  />
                </div>
                <div class="split-row">
                  <div class="split-label"><q-icon name="account_balance" size="18px" class="q-mr-xs" color="info" /> Bank Transfer</div>
                  <input
                    v-model.number="splitBankAmount"
                    type="number"
                    min="0"
                    step="10"
                    class="split-input"
                    placeholder="0.00"
                  />
                </div>
                <!-- CREDIT part → registered customer required (pos_split_pay, #145 §9).
                     Merged table bills still pay via merge_table_orders_and_pay (single method). -->
                <div v-if="!isMergeMode" class="split-row">
                  <div class="split-label"><q-icon name="person" size="18px" class="q-mr-xs" color="amber" /> Credit (Account)</div>
                  <input
                    v-model.number="splitCreditAmount"
                    type="number"
                    min="0"
                    step="10"
                    class="split-input"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <!-- Split Status -->
              <div class="split-status-box q-mt-sm" :class="{ balanced: isSplitBalanced, shortage: !isSplitBalanced }">
                <div class="row justify-between text-weight-bold">
                  <span>Total Split: LKR {{ fmt(splitTotalSum) }}</span>
                  <span v-if="isSplitBalanced" class="text-green"><q-icon name="check_circle" /> Balanced</span>
                  <span v-else class="text-orange">Remaining: LKR {{ fmt(Math.max(0, effectiveTotalAmount - splitTotalSum)) }}</span>
                </div>
                <button
                  v-if="!isSplitBalanced && effectiveTotalAmount - splitTotalSum > 0"
                  class="btn-fill-remaining q-mt-xs"
                  @click="fillRemainingToCard"
                >
                  Fill Balance to Card (+LKR {{ fmt(effectiveTotalAmount - splitTotalSum) }})
                </button>
              </div>
            </div>

            <!-- Amount Input (for cash) -->
            <div class="pay-section" v-if="selectedMethod === 'cash'">
              <div class="pay-section-label">AMOUNT RECEIVED</div>
              <div class="amount-display">
                <span class="amount-currency">LKR</span>
                <span class="amount-value">{{
                  amountReceived > 0 ? fmt(amountReceived) : '0.00'
                }}</span>
              </div>

              <!-- Quick amount buttons -->
              <div class="quick-amounts">
                <button v-for="q in quickAmounts" :key="q" class="quick-btn" @click="setAmount(q)">
                  {{ q.toLocaleString() }}
                </button>
                <button class="quick-btn exact-btn" @click="setAmount(effectiveTotalAmount)">
                  EXACT
                </button>
              </div>

              <!-- Numpad -->
              <div class="pay-numpad">
                <button
                  v-for="k in ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '\u232B']"
                  :key="k"
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
            <div class="pay-section" v-if="selectedMethod !== 'cash' && selectedMethod !== 'split'">
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
import { useShiftStore } from 'src/stores/shiftStore'
import { escposPrintService } from 'src/services/escposPrintService'
import BillPrintTemplate from 'src/components/cashier/BillPrintTemplate.vue'
import {
  requiresCreditCustomer,
  creditAmountFor,
  canConfirmCredit,
  checkCreditLimit,
  sumOpenBalance,
  customerDisplayName,
  normalizeCustomerSearch,
  attachCustomerToOrders,
  probeSetCustomerRpc,
  OPEN_RECEIVABLE_STATUSES,
} from 'src/modules/pos/creditCustomer'
import {
  normalizeTenders,
  tendersTotal,
  splitDetailsToLines,
  paySplit,
} from 'src/modules/pos/splitTenders'

const props = defineProps({
  modelValue: Boolean,
  // ── POS manual order props ──
  totalAmount: { type: Number, default: 0 },
  subtotalAmount: { type: Number, default: 0 },
  discountPercent: { type: Number, default: 0 },
  discountValue: { type: Number, default: 0 },
  taxValue: { type: Number, default: 0 },
  serviceCharge: { type: Number, default: 0 },
  itemCount: { type: Number, default: 0 },
  orderType: { type: String, default: 'dine-in' },
  cartItems: { type: Array, default: () => [] },
  customerName: { type: String, default: '' },
  orderNumber: { type: String, default: '—' },
  loading: Boolean,
  // ── Queue order prop (billing queue orders from DB) ──
  queueOrder: { type: Object, default: null },
  // ── MERGED table orders (multiple orders, 1 combined bill) ──
  mergedOrders: { type: Array, default: () => [] },
  // ── Customer already picked on the POS screen (prefills the CREDIT picker) ──
  customer: { type: Object, default: null },
})

const emit = defineEmits(['update:modelValue', 'confirm', 'new-order', 'paid'])

const authStore = useAuthStore()
const cashierStore = useCashierStore()
const shiftStore = useShiftStore()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const printTemplateRef = ref(null)

// Payment state
const selectedMethod = ref('cash')
const selectedSubMethod = ref('')
const amountBuffer = ref('')
const isPaid = ref(false)
const confirmedMethod = ref('')
const printInvoice = ref(null) // real invoice after payment
const isProcessing = ref(false)

// Split payment breakdown
const splitCashAmount = ref(0)
const splitCardAmount = ref(0)
const splitQrAmount = ref(0)
const splitBankAmount = ref(0)
const splitCreditAmount = ref(0)

// {cash, card, qr, bank, credit} — tender breakdown sent to pos_split_pay
const splitDetails = computed(() => ({
  cash: Number(splitCashAmount.value) || 0,
  card: Number(splitCardAmount.value) || 0,
  qr: Number(splitQrAmount.value) || 0,
  bank: Number(splitBankAmount.value) || 0,
  credit: isMergeMode.value ? 0 : Number(splitCreditAmount.value) || 0,
}))

const splitTotalSum = computed(() => tendersTotal(splitDetailsToLines(splitDetails.value)))

const isSplitBalanced = computed(() => {
  return Math.abs(splitTotalSum.value - effectiveTotalAmount.value) < 0.01
})

function fillRemainingToCard() {
  const d = splitDetails.value
  const remaining = Math.max(0, effectiveTotalAmount.value - d.cash - d.qr - d.bank - d.credit)
  splitCardAmount.value = parseFloat(remaining.toFixed(2))
}

const paymentMethods = [
  { id: 'cash', label: 'CASH', icon: 'payments' },
  { id: 'card', label: 'CARD', icon: 'credit_card' },
  { id: 'split', label: 'SPLIT', icon: 'call_split' },
  { id: 'other', label: 'OTHER', icon: 'more_horiz' },
]

const cardSubMethods = [
  { id: 'visa', label: 'VISA' },
  { id: 'master', label: 'MASTER' },
]

const otherSubMethods = [
  { id: 'qr', label: 'QR PAY' },
  { id: 'bank', label: 'BANK TX' },
  { id: 'credit', label: 'CREDIT' },
]

function selectMethod(id) {
  selectedMethod.value = id
  if (id === 'card') selectedSubMethod.value = 'visa'
  else if (id === 'other') selectedSubMethod.value = 'qr'
  else selectedSubMethod.value = ''
}

const cashierName = computed(() => authStore.profile?.full_name || 'Cashier')
const branchName = computed(() => authStore.currentBranch?.name || 'Restaurant')

// ── Mode detection ──
const isQueueOrder = computed(() => !!props.queueOrder)
const isMergeMode = computed(() => props.mergedOrders && props.mergedOrders.length >= 2)
const mergedTableNumber = computed(() => {
  if (!isMergeMode.value) return ''
  return props.mergedOrders[0]?.tableNumber || props.mergedOrders[0]?.table_number || '—'
})

// ── Effective values (from cart OR queue order OR merged orders) ──
const effectiveTotalAmount = computed(() => {
  if (isMergeMode.value) {
    return props.mergedOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0)
  }
  if (isQueueOrder.value) return parseFloat(props.queueOrder.total_amount || 0)
  return props.totalAmount
})

const effectiveSubtotal = computed(() => {
  if (isMergeMode.value) {
    return props.mergedOrders.reduce(
      (sum, o) => sum + parseFloat(o.subtotal || o.total_amount || 0),
      0,
    )
  }
  if (isQueueOrder.value)
    return parseFloat(props.queueOrder.subtotal || props.queueOrder.total_amount || 0)
  return props.subtotalAmount
})

const effectiveServiceCharge = computed(() => {
  if (isMergeMode.value) {
    return props.mergedOrders.reduce((sum, o) => sum + parseFloat(o.service_charge || 0), 0)
  }
  if (isQueueOrder.value) return parseFloat(props.queueOrder.service_charge || 0)
  return props.serviceCharge // Display simulated service charge for POS direct billing
})

const effectiveItemCount = computed(() => {
  if (isMergeMode.value) {
    return props.mergedOrders.reduce(
      (sum, o) => sum + (o.order_items?.length || o.itemCount || 0),
      0,
    )
  }
  if (isQueueOrder.value)
    return props.queueOrder.order_items?.length || props.queueOrder.itemCount || 0
  return props.itemCount
})

const effectiveItems = computed(() => {
  if (isMergeMode.value) {
    // Combine items from all merged orders, with order_number prefix
    const allItems = []
    for (const o of props.mergedOrders) {
      for (const item of o.order_items || []) {
        allItems.push({
          id: item.id || allItems.length,
          menu_item_name: (item.name || item.menu_item_name || 'Item') + ` (#${o.order_number})`,
          quantity: item.quantity || item.qty || 1,
          unit_price: parseFloat(item.unit_price || item.price || 0),
          total_price: parseFloat(item.total_price || item.unit_price * item.quantity || 0),
        })
      }
    }
    return allItems
  }
  if (isQueueOrder.value) {
    return (props.queueOrder.order_items || []).map((item, idx) => ({
      id: idx,
      menu_item_name: item.name || item.menu_item_name || 'Item',
      quantity: item.quantity || item.qty || 1,
      unit_price: parseFloat(item.unit_price || item.price || 0),
      total_price: parseFloat(item.total_price || item.unit_price * item.quantity || 0),
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
  if (isMergeMode.value) {
    // Use the first order's customer name
    return props.mergedOrders[0]?.customer_name || ''
  }
  if (isQueueOrder.value) return props.queueOrder.customer_name || ''
  return props.customerName
})

const effectiveOrderType = computed(() => {
  if (isMergeMode.value) return 'dine_in' // merged orders are always dine-in
  if (isQueueOrder.value) return props.queueOrder.order_type || 'dine_in'
  const map = { 'dine-in': 'dine_in', takeaway: 'takeaway', delivery: 'delivery' }
  return map[props.orderType] || 'dine_in'
})

const orderTypeLabel = computed(() => {
  if (isMergeMode.value) {
    return `TABLE ${mergedTableNumber.value} — MERGED`
  }
  const map = {
    dine_in: 'TABLE ORDER',
    'dine-in': 'TABLE ORDER',
    takeaway: 'TAKE AWAY',
    take_away: 'TAKE AWAY',
    delivery: 'DELIVERY',
  }
  if (isQueueOrder.value) return map[props.queueOrder.order_type] || 'ORDER'
  return map[props.orderType] || 'ORDER'
})

/**
 * Build a simulated invoice object matching BillPrintTemplate shape.
 * Works for both POS manual cart items and billing queue orders.
 */
const simulatedInvoice = computed(() => {
  const now = isMergeMode.value
    ? props.mergedOrders[0]?.created_at || new Date().toISOString()
    : isQueueOrder.value
      ? props.queueOrder.created_at || new Date().toISOString()
      : new Date().toISOString()

  if (isMergeMode.value) {
    const allKots = props.mergedOrders.flatMap((o) => o.kot_tickets || [])
    const orderNums = props.mergedOrders.map((o) => '#' + o.order_number).join(', ')
    return {
      invoice_number: '—',
      created_at: now,
      subtotal: effectiveSubtotal.value,
      grand_total: effectiveTotalAmount.value,
      delivery_charge: 0,
      service_charge: effectiveServiceCharge.value,
      customer_name: effectiveCustomerName.value,
      customer_phone: props.mergedOrders[0]?.customer_phone || '',
      invoice_items: effectiveItems.value,
      payments: isPaid.value
        ? [
            {
              id: 'merged-pay',
              amount: amountReceived.value,
              payment_methods: { name: confirmedMethod.value },
            },
          ]
        : [],
      orders: {
        order_type: 'dine_in',
        customer_name: effectiveCustomerName.value,
        customer_phone: props.mergedOrders[0]?.customer_phone || '',
        delivery_address: '',
        pax: 1,
        waiter: {
          full_name:
            props.mergedOrders[0]?.waiterName ||
            props.mergedOrders[0]?.waiter?.full_name ||
            cashierName.value,
        },
        kot_tickets: allKots,
        order_number: props.mergedOrders.map((o) => o.order_number).join(', '),
        restaurant_tables:
          props.mergedOrders[0]?.restaurant_tables ||
          (props.mergedOrders[0]?.tableNumber
            ? { table_number: props.mergedOrders[0].tableNumber }
            : null),
      },
      _mergedNote: `Consolidated Bill: ${orderNums}`,
    }
  }

  const qo = props.queueOrder // shorthand for queue order

  return {
    invoice_number: isQueueOrder.value
      ? qo.invoices?.[0]?.invoice_number || props.orderNumber
      : 'PENDING',
    created_at: now,
    subtotal: effectiveSubtotal.value,
    grand_total: effectiveTotalAmount.value,
    delivery_charge: isQueueOrder.value ? parseFloat(qo.delivery_charge || 0) : 0,
    service_charge: effectiveServiceCharge.value,
    customer_name: effectiveCustomerName.value,
    customer_phone: isQueueOrder.value ? qo.customer_phone || '' : '',
    invoice_items: effectiveItems.value,
    payments: isPaid.value
      ? [
          {
            id: 'pos-pay',
            amount: amountReceived.value,
            payment_methods: { name: confirmedMethod.value },
          },
        ]
      : [],
    orders: {
      order_type: effectiveOrderType.value,
      customer_name: effectiveCustomerName.value,
      customer_phone: isQueueOrder.value ? qo.customer_phone || '' : '',
      delivery_address: isQueueOrder.value ? qo.delivery_address || '' : '',
      pax: isQueueOrder.value ? qo.pax || 1 : 1,
      waiter: {
        full_name: isQueueOrder.value
          ? qo.waiterName || qo.waiter?.full_name || cashierName.value
          : cashierName.value,
      },
      kot_tickets: isQueueOrder.value ? qo.kot_tickets || [] : [],
      order_number: isQueueOrder.value ? qo.order_number : props.orderNumber,
      restaurant_tables: isQueueOrder.value
        ? qo.restaurant_tables || (qo.tableNumber ? { table_number: qo.tableNumber } : null)
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

// ══════════════════════════════════════════════════
// CREDIT sale — registered customer (account) required
// ══════════════════════════════════════════════════
const creditCustomer = ref(null)
const creditSearch = ref('')
const creditResults = ref([])
const creditSearching = ref(false)
const creditSearchError = ref('')
const creditOpenBalance = ref(null) // null = unknown
const creditBalanceLoading = ref(false)
let creditSearchTimer = null
let creditSearchSeq = 0

const needsCreditCustomer = computed(() =>
  requiresCreditCustomer(selectedMethod.value, selectedSubMethod.value, effectiveTotalAmount.value, splitDetails.value),
)
const creditAmount = computed(() =>
  creditAmountFor(selectedMethod.value, selectedSubMethod.value, effectiveTotalAmount.value, splitDetails.value),
)
const creditCheck = computed(() =>
  checkCreditLimit(creditCustomer.value?.credit_limit, creditOpenBalance.value ?? 0, creditAmount.value),
)

function onCreditSearchInput(val) {
  clearTimeout(creditSearchTimer)
  const q = (val || '').trim()
  creditSearchError.value = ''
  if (q.length < 2) {
    creditResults.value = []
    creditSearching.value = false
    return
  }
  creditSearching.value = true
  creditSearchTimer = setTimeout(() => runCreditSearch(q), 300)
}

async function runCreditSearch(q) {
  const seq = ++creditSearchSeq
  try {
    const { data, error } = await supabase.rpc('pos_search_customers', { p_search: q, p_limit: 10 })
    if (seq !== creditSearchSeq) return
    if (error || data?.success === false) {
      creditResults.value = []
      creditSearchError.value = 'Customer search failed: ' + (error?.message || data?.error || 'unknown error')
      return
    }
    creditResults.value = normalizeCustomerSearch(data).filter((c) => c.is_active !== false)
  } catch (err) {
    if (seq !== creditSearchSeq) return
    creditResults.value = []
    creditSearchError.value = 'Customer search failed: ' + (err?.message || err)
  } finally {
    if (seq === creditSearchSeq) creditSearching.value = false
  }
}

// Open balance = Σ(total − paid) of the customer's open receivables
// (same formula fn_pos_set_order_customer returns; cashiers have SELECT via cr_cashier).
async function loadCreditOpenBalance(customerId) {
  creditOpenBalance.value = null
  if (!customerId) return
  creditBalanceLoading.value = true
  try {
    const { data, error } = await supabase
      .from('customer_receivables')
      .select('total_amount, paid_amount, status')
      .eq('customer_id', customerId)
      .in('status', [...OPEN_RECEIVABLE_STATUSES])
    if (!error && creditCustomer.value?.id === customerId) {
      creditOpenBalance.value = sumOpenBalance(data)
    }
  } catch (err) {
    console.warn('[PaymentDialog] Could not load open balance:', err)
  } finally {
    creditBalanceLoading.value = false
  }
}

function pickCreditCustomer(c) {
  if (!c?.id) return
  creditCustomer.value = c
  creditResults.value = []
  creditSearch.value = ''
  loadCreditOpenBalance(c.id)
}

function clearCreditCustomer() {
  creditCustomer.value = null
  creditOpenBalance.value = null
}

function resetCreditState() {
  clearTimeout(creditSearchTimer)
  creditSearchSeq++
  creditCustomer.value = null
  creditSearch.value = ''
  creditResults.value = []
  creditSearching.value = false
  creditSearchError.value = ''
  creditOpenBalance.value = null
}

// Prefill from the POS-screen customer, or the order(s) already linked to one.
async function prefillCreditCustomer() {
  let customerId = null
  if (isMergeMode.value) {
    const ids = [...new Set(props.mergedOrders.map((o) => o.customer_id).filter(Boolean))]
    if (ids.length === 1 && props.mergedOrders.every((o) => o.customer_id)) customerId = ids[0]
  } else if (isQueueOrder.value) {
    customerId = props.queueOrder.customer_id || null
  } else {
    const c = props.customer
    const id = c?.id || c?.customer_id
    if (id) {
      pickCreditCustomer({ ...c, id })
      return
    }
  }
  if (!customerId) return
  try {
    const { data } = await supabase
      .from('customers')
      .select('id, first_name, last_name, phone, customer_code, credit_limit, is_active')
      .eq('id', customerId)
      .maybeSingle()
    if (data && data.is_active !== false && isOpen.value && !creditCustomer.value) pickCreditCustomer(data)
  } catch (err) {
    console.warn('[PaymentDialog] Could not prefill customer:', err)
  }
}

/**
 * CREDIT: attach the registered customer to every order being paid BEFORE the
 * payment RPC (the receivable is created from orders.customer_id on payment).
 * Manual POS orders do not exist yet — only check the server function is
 * available; orderStore.processPayment attaches after creating the order.
 */
async function prepareCreditSale(cust) {
  isProcessing.value = true
  try {
    let res
    if (isMergeMode.value) {
      res = await attachCustomerToOrders(supabase, props.mergedOrders.map((o) => o.id), cust.id)
    } else if (isQueueOrder.value) {
      res = await attachCustomerToOrders(supabase, [props.queueOrder.id], cust.id)
    } else {
      res = await probeSetCustomerRpc(supabase)
    }
    if (!res.success) {
      Notify.create({
        message: res.missingRpc ? 'Apply supabase/finance_pos_sales_gl_145.sql' : 'Credit sale blocked',
        caption: res.missingRpc ? 'Credit sales need the server update (fn_pos_set_order_customer).' : res.error,
        color: 'red',
        icon: 'block',
        position: 'top',
        timeout: 6000,
      })
      return false
    }
    if (res.openBalance !== undefined) {
      creditOpenBalance.value = res.openBalance
      const chk = checkCreditLimit(res.creditLimit, res.openBalance, creditAmount.value)
      if (chk.exceeds) {
        Notify.create({
          message: `${customerDisplayName(cust)} is over the credit limit`,
          caption: `Limit LKR ${fmt(chk.limit)} — balance after this sale LKR ${fmt(chk.projected)}`,
          color: 'orange-9',
          icon: 'warning',
          position: 'top',
          timeout: 5000,
        })
      }
    }
    return true
  } catch (err) {
    Notify.create({ message: 'Credit sale blocked', caption: err?.message || String(err), color: 'red', position: 'top' })
    return false
  } finally {
    isProcessing.value = false
  }
}

const canConfirm = computed(() => {
  if (effectiveItemCount.value === 0) return false
  if (
    !canConfirmCredit(
      selectedMethod.value,
      selectedSubMethod.value,
      effectiveTotalAmount.value,
      creditCustomer.value,
      splitDetails.value,
    )
  ) {
    return false
  }
  if (selectedMethod.value === 'cash') {
    return amountReceived.value >= effectiveTotalAmount.value
  }
  if (selectedMethod.value === 'split') {
    return isSplitBalanced.value
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
  const all = [...new Set([...base, ...extras])].filter((v) => v >= t).sort((a, b) => a - b)
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
  if (!canConfirm.value || isProcessing.value) return

  // CREDIT: attach the registered customer to the order(s) first — abort on failure
  const creditCust = needsCreditCustomer.value ? creditCustomer.value : null
  if (needsCreditCustomer.value) {
    if (!creditCust?.id) return
    const ok = await prepareCreditSale(creditCust)
    if (!ok) return
  }

  // Trigger cash drawer pulse if cash was received
  if (selectedMethod.value === 'cash' || (selectedMethod.value === 'split' && splitCashAmount.value > 0)) {
    escposPrintService.openCashDrawer()
  }

  let methodName = 'Cash'
  if (selectedMethod.value === 'card') {
    methodName = 'Card'
  } else if (selectedMethod.value === 'split') {
    methodName = 'Split Payment'
  } else if (selectedMethod.value === 'other') {
    methodName = selectedSubMethod.value === 'qr' ? 'QR Pay' : selectedSubMethod.value === 'bank' ? 'Bank Transfer' : 'Credit'
  }

  confirmedMethod.value = methodName

  if (isMergeMode.value) {
    // ── MERGED TABLE: process via merge RPC ──
    await processMergedPayment(methodName)
  } else if (isQueueOrder.value) {
    // ── QUEUE ORDER: process directly via RPCs ──
    await processQueueOrderPayment(methodName)
  } else {
    // ── MANUAL POS: emit to parent (POSPage handles via orderStore) ──
    emit('confirm', {
      method: selectedMethod.value,
      amount: selectedMethod.value === 'split' ? effectiveTotalAmount.value : amountReceived.value,
      change: selectedMethod.value === 'split' ? 0 : Math.max(0, changeAmount.value),
      // SPLIT: POSPage pays via orderStore.processSplitPayment → pos_split_pay
      splitDetails: selectedMethod.value === 'split' ? { ...splitDetails.value } : null,
      subMethod: selectedSubMethod.value,
      // CREDIT (full or split part): orderStore attaches this customer after
      // creating the order and BEFORE pos_quick_pay / pos_split_pay.
      creditCustomerId: creditCust?.id || null,
    })
  }
}

/**
 * Process merged payment for all orders in the table group.
 * Calls merge_table_orders_and_pay RPC — now creates a consolidated invoice.
 */
async function processMergedPayment(methodName) {
  isProcessing.value = true
  const orderIds = props.mergedOrders.map((o) => o.id)
  const orderNums = props.mergedOrders.map((o) => '#' + o.order_number).join(', ')

  try {
    const { data, error } = await supabase.rpc('merge_table_orders_and_pay', {
      p_order_ids: orderIds,
      p_payment_method: methodName,
      p_amount_paid: effectiveTotalAmount.value,
    })

    if (error) throw new Error(error.message)
    if (!data?.success) throw new Error(data?.error || 'Merge payment failed')

    // Record payment in the active shift
    if (shiftStore.hasActiveShift) {
      shiftStore.recordPayment(orderIds[0], methodName.toLowerCase(), effectiveTotalAmount.value)
    }

    isPaid.value = true

    // Fetch the consolidated invoice for receipt printing
    if (data.invoice_id) {
      try {
        const realInvoice = await cashierStore.fetchInvoiceDetails(data.invoice_id)
        if (realInvoice) {
          // Enrich with ALL KOT tickets from ALL merged orders (invoice only links to anchor order)
          if (realInvoice.orders) {
            const allKots = props.mergedOrders.flatMap((o) => o.kot_tickets || [])
            // De-duplicate by id
            const kotMap = new Map()
            for (const k of allKots) {
              kotMap.set(k.id, k)
            }
            // Also include any from the fetched invoice (anchor order)
            for (const k of realInvoice.orders.kot_tickets || []) {
              kotMap.set(k.id, k)
            }
            realInvoice.orders.kot_tickets = Array.from(kotMap.values())
          }
          printInvoice.value = realInvoice
        }
      } catch (invErr) {
        console.warn('[PaymentDialog] Could not fetch consolidated invoice:', invErr)
      }
    }

    // Notify parent
    emit('paid', orderIds)

    Notify.create({
      message: 'Table Payment Successful!',
      caption: `${data.order_count} orders merged (${orderNums}) — Invoice #${data.invoice_number || '—'} — ${methodName}`,
      color: 'positive',
      icon: 'verified',
      position: 'top',
      timeout: 3000,
    })

    // Auto-print receipt after payment
    printBill()
  } catch (err) {
    console.error('[PaymentDialog] Merged payment error:', err)
    Notify.create({
      message: 'Merged Payment Failed',
      caption: err.message,
      color: 'red',
      position: 'top',
    })
  } finally {
    isProcessing.value = false
  }
}

/**
 * Process payment for a billing queue order.
 * Calls the atomic pos_quick_pay RPC (accept + invoice + payment in one txn).
 */
async function processQueueOrderPayment(methodName) {
  isProcessing.value = true
  const orderId = props.queueOrder.id

  try {
    // Accept (if pending) + invoice + payment in ONE atomic txn (Security #74).
    // pos_quick_pay wraps process_waiter_accept → process_cashier_invoice →
    // process_cashier_payment server-side; any failure rolls the whole thing back
    // (no cooked/invoiced-but-unpaid window). It is idempotent for pre-existing
    // queue orders (already-accepted/invoiced/paid sub-RPCs all return success:true)
    // and charges the server-side LOCKED order.total_amount — p_amount_paid is the
    // cash tendered, used only for change_due.
    let payData
    if (selectedMethod.value === 'split') {
      // SPLIT (#145 §9): pos_split_pay stores each tender, books it to its own
      // account and records the shift payment per tender (p_shift_id) — so no
      // separate shiftStore.recordPayment here.
      const { tenders, errors } = normalizeTenders(splitDetailsToLines(splitDetails.value))
      if (errors.length) throw new Error(errors.join('; '))
      const sp = await paySplit(supabase, orderId, tenders, shiftStore.shiftId)
      if (!sp.success) throw new Error(sp.error || 'Split payment failed')
      payData = sp.data?.payment || {}
      await shiftStore.refreshShiftTotals()
    } else {
      const { data: qp, error: payError } = await supabase.rpc('pos_quick_pay', {
        p_order_id: orderId,
        p_payment_method: methodName,
        p_amount_paid: effectiveTotalAmount.value,
      })
      if (payError) throw new Error(`Payment failed: ${payError.message}`)
      if (!qp?.success) {
        throw new Error(qp?.error || 'Payment failed')
      }
      payData = qp

      // Confirm with POS terminal integration if needed
      // For now, record locally
      const actualMethod = selectedMethod.value === 'cash' ? 'cash' : selectedSubMethod.value
      const ok = await shiftStore.recordPayment(orderId, actualMethod, effectiveTotalAmount.value)

      if (!ok) {
        Notify.create({ type: 'negative', message: 'Failed to record payment on shift' })
        isProcessing.value = false
        return
      }
    }
    
    // Step 4: Fetch real invoice for receipt
    isPaid.value = true
    if (payData?.invoice_id) {
      const realInvoice = await cashierStore.fetchInvoiceDetails(payData.invoice_id)
      if (realInvoice) {
        printInvoice.value = realInvoice
      }
    } else {
      await fetchRealInvoice(orderId)
    }

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

    // Auto-print receipt after payment
    printBill()
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
  resetCreditState()
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
    resetCreditState()

    // ── If opening a PAID queue order, skip to receipt view ──
    if (
      isQueueOrder.value &&
      (props.queueOrder.status === 'paid' || props.queueOrder.payment_status === 'paid')
    ) {
      isPaid.value = true
      confirmedMethod.value = 'Completed'

      // Fetch the real invoice for the receipt
      await fetchRealInvoice(props.queueOrder.id)
    } else {
      isPaid.value = false
    }
  }
})

// Prefill the account customer the first time CREDIT is chosen
watch(needsCreditCustomer, (need) => {
  if (need && !creditCustomer.value && !isPaid.value) prefillCreditCustomer()
})

// Print using BillPrintTemplate's printReceipt()
async function printBill() {
  await nextTick()
  await new Promise((r) => setTimeout(r, 150))
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
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}
.top-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.topbar-icon-wrap {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(33, 150, 243, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}
.top-title {
  color: #fff;
  font-weight: 700;
  font-size: 15px;
}
.top-center {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #9ca3af;
  font-size: 13px;
}
.top-sep {
  color: #4b5563;
}
.top-items {
  color: #d1d5db;
  font-weight: 500;
}
.top-cashier {
  color: #f5c542;
  font-weight: 600;
}
.top-right {
  display: flex;
  align-items: center;
}

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
  border-right: 1px solid rgba(255, 255, 255, 0.06);
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
  background: rgba(255, 255, 255, 0.02);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
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
.print-btn:hover {
  background: #2563eb;
}
.print-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── RIGHT: Payment Panel ────────────────────────────── */
.payment-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px 24px;
  background: #0a0e17;
  overflow-y: auto;
}

.pay-section {
  margin-bottom: 20px;
}
.pay-section-label {
  font-size: 11px;
  font-weight: 700;
  color: #9ca3af;
  letter-spacing: 1.5px;
  margin-bottom: 10px;
}

/* Payment methods */
.pay-methods {
  display: flex;
  gap: 10px;
}
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
.sub-method-btn {
  padding: 8px 12px;
  min-height: 48px;
  flex-direction: row;
  justify-content: center;
}
.pay-method-btn:hover {
  border-color: #6b7280;
  background: #1f2937;
}
.pay-method-btn.active {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
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
.amount-currency {
  color: #9ca3af;
  font-size: 16px;
  font-weight: 600;
}
.amount-value {
  color: #fff;
  font-size: 32px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

/* Quick amounts */
.quick-amounts {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
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
.quick-btn:hover {
  background: #374151;
  color: #fff;
}
.exact-btn {
  background: #0d3320;
  border-color: #166534;
  color: #4ade80;
}
.exact-btn:hover {
  background: #166534;
}

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
.numpad-key:hover {
  background: #1f2937;
}
.numpad-key:active {
  background: #374151;
  transform: scale(0.96);
}
.numpad-clear {
  background: #7f1d1d;
  border-color: #991b1b;
  color: #fca5a5;
}
.numpad-clear:hover {
  background: #991b1b;
}

/* Change display */
.change-display {
  background: #111827;
  border: 2px solid #374151;
  border-radius: 12px;
  padding: 14px 20px;
  text-align: center;
  margin-bottom: 16px;
}
.change-label {
  font-size: 11px;
  font-weight: 700;
  color: #9ca3af;
  letter-spacing: 1.5px;
}
.change-value {
  font-size: 28px;
  font-weight: 800;
  color: #4ade80;
  margin-top: 4px;
}
.change-value.negative {
  color: #f87171;
}

/* Card total */
.card-total-display {
  background: #111827;
  border: 2px solid #374151;
  border-radius: 12px;
  padding: 24px 20px;
  text-align: center;
}
.card-total-label {
  font-size: 11px;
  font-weight: 700;
  color: #9ca3af;
  letter-spacing: 1.5px;
}
.card-total-value {
  font-size: 36px;
  font-weight: 800;
  color: #fff;
  margin-top: 8px;
}

/* Split Payment */
.split-pay-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.split-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 8px 12px;
}
.split-label {
  font-size: 13px;
  font-weight: 700;
  color: #d1d5db;
  display: flex;
  align-items: center;
}
.split-input {
  background: #1f2937;
  border: 1px solid #4b5563;
  color: #fff;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 15px;
  font-weight: 700;
  text-align: right;
  width: 140px;
  outline: none;
}
.split-input:focus {
  border-color: #2563eb;
}
.split-status-box {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
}
.split-status-box.balanced {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid #10b981;
}
.split-status-box.shortage {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid #f59e0b;
}
.btn-fill-remaining {
  width: 100%;
  padding: 6px 10px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-fill-remaining:hover {
  background: #1d4ed8;
}

/* Confirm button */
.pay-confirm-section {
  margin-top: auto;
  padding-top: 12px;
}
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
  box-shadow: 0 4px 16px rgba(5, 150, 105, 0.3);
}
.confirm-pay-btn:hover {
  background: linear-gradient(135deg, #047857, #065f46);
  transform: translateY(-1px);
}
.confirm-pay-btn:active {
  transform: scale(0.98);
}
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
.paid-title {
  font-size: 22px;
  font-weight: 800;
  color: #4ade80;
  letter-spacing: 2px;
}
.paid-amount {
  font-size: 36px;
  font-weight: 800;
  color: #fff;
}
.paid-method {
  font-size: 14px;
  color: #9ca3af;
}
.paid-change {
  font-size: 16px;
  color: #fbbf24;
  margin-top: 4px;
}
.paid-invoice-num {
  font-size: 12px;
  color: #6b7280;
  font-weight: 600;
  letter-spacing: 0.5px;
  margin-top: 2px;
}
.paid-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}
.paid-act-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 24px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  letter-spacing: 0.5px;
}
.print-receipt-btn {
  background: #1e40af;
  color: #fff;
}
.print-receipt-btn:hover {
  background: #2563eb;
}
.new-order-btn {
  background: #374151;
  color: #d1d5db;
}
.new-order-btn:hover {
  background: #4b5563;
}

/* ── Credit: registered customer (account) ─────────────── */
.credit-cust-box {
  padding: 12px;
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.05);
}
.credit-required {
  color: #f87171;
}
.credit-cust-selected {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 10px 12px;
}
.credit-cust-name {
  color: #fff;
  font-weight: 700;
  font-size: 14px;
}
.credit-cust-meta {
  color: #9ca3af;
  font-size: 12px;
}
.credit-cust-figures {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.credit-cust-figures > div {
  display: flex;
  flex-direction: column;
  font-size: 11px;
  color: #9ca3af;
  letter-spacing: 0.5px;
}
.credit-cust-figures strong {
  color: #f3f4f6;
  font-size: 14px;
}
.credit-limit-warn {
  margin-top: 10px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(234, 88, 12, 0.15);
  border: 1px solid rgba(234, 88, 12, 0.5);
  color: #fdba74;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
}
.credit-cust-results {
  margin-top: 6px;
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid #374151;
  border-radius: 8px;
  background: #111827;
}
.credit-cust-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-bottom: 1px solid #1f2937;
  background: transparent;
  color: #e5e7eb;
  cursor: pointer;
  text-align: left;
}
.credit-cust-row:hover {
  background: rgba(245, 158, 11, 0.1);
}
.credit-cust-row-name {
  font-weight: 700;
  font-size: 13px;
}
.credit-cust-row-meta {
  font-size: 11px;
  color: #9ca3af;
}
.credit-cust-empty {
  margin-top: 6px;
  font-size: 12px;
  color: #fca5a5;
}
.credit-cust-hint {
  margin-top: 6px;
  font-size: 11px;
  color: #9ca3af;
  display: flex;
  align-items: center;
}
</style>
