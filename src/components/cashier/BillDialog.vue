<template>
  <q-dialog
    v-model="isOpen"
    persistent
    maximized
    transition-show="slide-up"
    transition-hide="slide-down"
  >
    <div class="bill-dialog-root">
      <!-- ── Top Bar ── -->
      <div class="bill-topbar">
        <div class="row items-center q-gutter-x-sm">
          <div class="topbar-icon-wrap">
            <q-icon name="point_of_sale" size="18px" color="primary" />
          </div>
          <span class="text-subtitle1 text-weight-bold text-white">Billing</span>
          <q-badge v-if="order" color="blue-8" class="text-caption">
            Order #{{ order.order_number }}
          </q-badge>
          <q-badge
            v-if="order?.kot_tickets?.length"
            color="amber-8"
            text-color="dark"
            class="text-caption text-weight-bold"
          >
            KOT #{{ order.kot_tickets[0].kot_number }}
          </q-badge>
          <q-badge :color="statusColor" class="text-caption text-capitalize">
            {{ order?.status }}
          </q-badge>
        </div>
        <q-btn flat round dense icon="close" color="grey-5" @click="close" />
      </div>

      <!-- ── Main Content: two-pane layout ── -->
      <div class="bill-body">
        <!-- ══ LEFT PANE — Order Summary ══ -->
        <div class="bill-left-pane">
          <!-- Order meta card -->
          <div class="order-meta-card">
            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <div class="meta-chip">
                  <q-icon name="table_restaurant" size="14px" class="q-mr-xs text-primary" />
                  <div>
                    <div class="meta-chip-label">Table</div>
                    <div class="meta-chip-value">{{ order?.tableNumber || '—' }}</div>
                  </div>
                </div>
              </div>
              <div class="col-6">
                <div class="meta-chip">
                  <q-icon name="person" size="14px" class="q-mr-xs text-teal" />
                  <div>
                    <div class="meta-chip-label">Waiter</div>
                    <div class="meta-chip-value">
                      {{ order?.waiterName || printInvoice?.orders?.waiter?.full_name || '—' }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-6">
                <div class="meta-chip">
                  <q-icon name="account_circle" size="14px" class="q-mr-xs text-amber" />
                  <div>
                    <div class="meta-chip-label">Customer</div>
                    <div class="meta-chip-value">
                      {{
                        order?.customer_name ||
                        printInvoice?.customer_name ||
                        printInvoice?.orders?.customer_name ||
                        '—'
                      }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-6">
                <div class="meta-chip">
                  <q-icon name="category" size="14px" class="q-mr-xs text-orange" />
                  <div>
                    <div class="meta-chip-label">Type</div>
                    <div class="meta-chip-value text-capitalize">
                      {{ (order?.order_type || '—').replace('_', '-') }}
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-6">
                <div class="meta-chip">
                  <q-icon name="schedule" size="14px" class="q-mr-xs text-grey-5" />
                  <div>
                    <div class="meta-chip-label">Placed</div>
                    <div class="meta-chip-value">{{ timeAgo }}</div>
                  </div>
                </div>
              </div>
              <div v-if="order?.customer_phone" class="col-6">
                <div class="meta-chip">
                  <q-icon name="phone" size="14px" class="q-mr-xs text-light-blue" />
                  <div>
                    <div class="meta-chip-label">Phone</div>
                    <div class="meta-chip-value">{{ order.customer_phone }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Items list -->
          <div class="items-section-label">ORDER ITEMS</div>
          <div class="items-list">
            <div
              v-for="item in order?.order_items"
              :key="item.id"
              class="item-row"
              :class="{ cancelled: item.status === 'cancelled' }"
            >
              <div class="item-qty">{{ item.quantity }}×</div>
              <div class="item-name">
                {{ item.name }}
                <span v-if="item.notes" class="item-notes">· {{ item.notes }}</span>
              </div>
              <div class="item-price">{{ fmtCurrency(item.total_price) }}</div>
            </div>
          </div>

          <!-- Totals -->
          <div class="totals-card">
            <div class="totals-row">
              <span class="totals-label">Subtotal</span>
              <span class="totals-value">{{ fmtCurrency(order?.subtotal || 0) }}</span>
            </div>
            <div v-if="(order?.discount_amount || 0) > 0" class="totals-row discount">
              <span class="totals-label">Discount</span>
              <span class="totals-value">-{{ fmtCurrency(order?.discount_amount || 0) }}</span>
            </div>
            <div v-if="(order?.tax_amount || 0) > 0" class="totals-row">
              <span class="totals-label">Tax</span>
              <span class="totals-value">{{ fmtCurrency(order?.tax_amount || 0) }}</span>
            </div>
            <div v-if="orderDeliveryCharge > 0" class="totals-row delivery">
              <span class="totals-label">🚴 Delivery Charge</span>
              <span class="totals-value">{{ fmtCurrency(orderDeliveryCharge) }}</span>
            </div>
            <div class="totals-divider" />
            <div class="totals-row grand">
              <span class="totals-label">Total Due</span>
              <span class="totals-value grand-value">{{
                fmtCurrency(order?.total_amount || 0)
              }}</span>
            </div>
          </div>
        </div>

        <!-- ══ RIGHT PANE — Payment ══ -->
        <div class="bill-right-pane">
          <!-- Step indicator -->
          <div class="step-indicator">
            <div class="step" :class="{ active: step >= 1, done: step > 1 }">
              <div class="step-circle">
                <q-icon v-if="step > 1" name="check" size="14px" />
                <span v-else>1</span>
              </div>
              <div class="step-label">Invoice</div>
            </div>
            <div class="step-connector" :class="{ active: step >= 2 }" />
            <div class="step" :class="{ active: step >= 2, done: step > 2 }">
              <div class="step-circle">
                <q-icon v-if="step > 2" name="check" size="14px" />
                <span v-else>2</span>
              </div>
              <div class="step-label">Payment</div>
            </div>
            <div class="step-connector" :class="{ active: step >= 3 }" />
            <div class="step" :class="{ active: step >= 3 }">
              <div class="step-circle">3</div>
              <div class="step-label">Print</div>
            </div>
          </div>

          <!-- ── STEP 1: Generate Invoice ── -->
          <div v-if="step === 1" class="step-panel">
            <div class="step-title">
              <q-icon name="receipt" size="20px" color="primary" class="q-mr-sm" />
              Generate Invoice
            </div>
            <div class="step-desc">
              Create an official invoice for Order #{{ order?.order_number }}. This will lock the
              order items and prepare it for payment.
            </div>

            <!-- Invoice preview box -->
            <div class="invoice-preview-box">
              <div class="preview-row">
                <span>Items</span>
                <span>{{ order?.itemCount }} item(s)</span>
              </div>
              <div class="preview-row">
                <span>Subtotal</span>
                <span>{{ fmtCurrency(order?.subtotal || 0) }}</span>
              </div>
              <div v-if="(order?.discount_amount || 0) > 0" class="preview-row discount">
                <span>Discount</span>
                <span>-{{ fmtCurrency(order?.discount_amount || 0) }}</span>
              </div>
              <div v-if="(order?.tax_amount || 0) > 0" class="preview-row">
                <span>Tax</span>
                <span>{{ fmtCurrency(order?.tax_amount || 0) }}</span>
              </div>
              <div v-if="orderDeliveryCharge > 0" class="preview-row delivery">
                <span>🚴 Delivery Charge</span>
                <span>{{ fmtCurrency(orderDeliveryCharge) }}</span>
              </div>
              <div class="preview-divider" />
              <div class="preview-row total">
                <span>Grand Total</span>
                <span>{{ fmtCurrency(order?.total_amount || 0) }}</span>
              </div>
            </div>

            <q-btn
              unelevated
              no-caps
              color="primary"
              icon="receipt_long"
              label="Generate Invoice"
              class="full-width q-mt-auto action-btn"
              size="lg"
              :loading="store.processing"
              @click="doGenerateInvoice"
            />
          </div>

          <!-- ── STEP 2: Payment ── -->
          <div v-if="step === 2" class="step-panel">
            <div class="step-title">
              <q-icon name="payments" size="20px" color="green-5" class="q-mr-sm" />
              Collect Payment
            </div>

            <!-- Invoice number badge -->
            <div class="invoice-badge">
              <q-icon name="receipt" size="14px" class="q-mr-xs" />
              Invoice #{{ currentInvoice?.invoice_number }}
            </div>

            <!-- Total due highlight -->
            <div class="amount-due-card">
              <div class="amount-label">Amount Due</div>
              <div class="amount-value">
                {{ fmtCurrency(currentInvoice?.grand_total || order?.total_amount || 0) }}
              </div>
            </div>

            <!-- Payment method selector -->
            <div class="pm-label">PAYMENT METHOD</div>
            <div class="pm-grid">
              <button
                v-for="pm in store.paymentMethods"
                :key="pm.id"
                class="pm-btn"
                :class="{ active: selectedMethodId === pm.id }"
                @click="selectMethod(pm)"
              >
                <q-icon :name="getMethodIcon(pm.name)" size="22px" class="q-mb-xs" />
                <div class="pm-name">{{ pm.name }}</div>
              </button>
            </div>

            <!-- Cash-specific: received & change -->
            <div v-if="selectedMethodName === 'Cash'" class="cash-section">
              <q-input
                v-model.number="cashReceived"
                label="Cash Received"
                type="number"
                prefix="LKR "
                dense
                outlined
                dark
                color="primary"
                class="q-mb-sm"
                :rules="[
                  (v) =>
                    v >= (currentInvoice?.grand_total || order?.total_amount || 0) ||
                    'Amount too low',
                ]"
              />
              <div class="change-display" :class="{ positive: changeAmount > 0 }">
                <span>Change</span>
                <span class="change-amount">{{ fmtCurrency(Math.max(0, changeAmount)) }}</span>
              </div>
            </div>

            <!-- Transaction ref for card/online -->
            <q-input
              v-if="selectedMethodName !== 'Cash'"
              v-model="transactionRef"
              label="Transaction / Reference ID (optional)"
              dense
              outlined
              dark
              color="primary"
              class="q-mt-sm"
            />

            <q-btn
              unelevated
              no-caps
              color="green-6"
              icon="check_circle"
              label="Confirm Payment"
              class="full-width q-mt-auto action-btn"
              size="lg"
              :loading="store.processing"
              :disable="
                !selectedMethodId ||
                (selectedMethodName === 'Cash' &&
                  cashReceived < (currentInvoice?.grand_total || order?.total_amount || 0))
              "
              @click="doRecordPayment"
            />
            <q-btn
              outline
              no-caps
              color="primary"
              icon="print"
              label="Print Bill (Before Payment)"
              class="full-width q-mt-sm"
              size="md"
              @click="printBill"
            />
          </div>

          <!-- ── STEP 3: Bill View / Payment Complete ── -->
          <div v-if="step === 3" class="step-panel step-success">
            <div class="bill-view-header">
              <q-icon name="check_circle" size="20px" color="green-4" class="q-mr-sm" />
              <span class="success-title-inline">Payment Complete</span>
              <q-badge color="green" class="q-ml-sm">PAID</q-badge>
            </div>

            <!-- Inline bill receipt view -->
            <div class="bill-view-container">
              <div v-if="!printInvoice" class="bill-loading">
                <q-spinner-dots color="primary" size="30px" />
                <div class="text-grey-5 text-caption q-mt-sm">Loading receipt...</div>
              </div>
              <BillPrintTemplate
                v-if="printInvoice"
                :invoice="printInvoice"
                :branch-name="branchName"
              />
            </div>

            <div class="success-actions">
              <q-btn
                unelevated
                no-caps
                color="primary"
                icon="print"
                label="Print Receipt"
                class="full-width action-btn"
                size="md"
                @click="printBill"
              />
              <q-btn
                flat
                no-caps
                color="grey-5"
                label="Close"
                class="full-width q-mt-sm"
                size="md"
                @click="close"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- ── Print frame (hidden, used by popup print window) ── -->
      <div class="print-frame" id="print-frame-container" style="display: none">
        <BillPrintTemplate
          ref="printTemplateRef"
          v-if="printInvoice"
          :invoice="printInvoice"
          :branch-name="branchName"
        />
      </div>
    </div>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useQuasar } from 'quasar'
import { useCashierStore } from 'src/stores/cashierStore'
import { useAuthStore } from 'src/stores/auth'
import BillPrintTemplate from 'src/components/cashier/BillPrintTemplate.vue'

const store = useCashierStore()
const authStore = useAuthStore()
const $q = useQuasar()

// ── Props / Model ──────────────────────────────────────────
const props = defineProps({
  modelValue: Boolean,
  order: {
    type: Object,
    default: null,
  },
})
const emit = defineEmits(['update:modelValue', 'paid'])

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

// ── State ──────────────────────────────────────────────────
const step = ref(1)
const currentInvoice = ref(null)
const selectedMethodId = ref(null)
const selectedMethodName = ref('')
const cashReceived = ref(0)
const transactionRef = ref('')
const printInvoice = ref(null)
const printTemplateRef = ref(null)

const branchName = computed(() => authStore.currentBranch?.name || 'Restaurant')

// Delivery charge: read from order column, or derive from total - subtotal for delivery orders
const orderDeliveryCharge = computed(() => {
  const o = props.order
  if (!o) return 0
  // If explicitly stored
  if (o.delivery_charge && parseFloat(o.delivery_charge) > 0) {
    return parseFloat(o.delivery_charge)
  }
  // For delivery orders, calculate difference
  if (o.order_type === 'delivery') {
    const sub = parseFloat(o.subtotal || 0)
    const tax = parseFloat(o.tax_amount || 0)
    const disc = parseFloat(o.discount_amount || 0)
    const total = parseFloat(o.total_amount || 0)
    const diff = total - sub - tax + disc
    return diff > 0 ? diff : 0
  }
  return 0
})

// ── Computed ───────────────────────────────────────────────
const timeAgo = computed(() => {
  if (!props.order?.created_at) return ''
  return store.getTimeAgo(props.order.created_at)
})

const statusColor = computed(() => {
  const map = {
    ready: 'green',
    served: 'teal',
    invoiced: 'blue',
  }
  return map[props.order?.status] || 'grey'
})

const changeAmount = computed(() => {
  const received = parseFloat(cashReceived.value) || 0
  const due = parseFloat(currentInvoice.value?.grand_total || props.order?.total_amount || 0)
  return received - due
})

// Watch: if order already has invoice, skip to step 2; if paid, skip to step 3 (bill view)
watch(
  () => props.order,
  (newOrder) => {
    if (!newOrder) return
    step.value = 1
    currentInvoice.value = null
    selectedMethodId.value = null
    selectedMethodName.value = ''
    cashReceived.value = Math.ceil(newOrder.total_amount || 0)
    transactionRef.value = ''
    printInvoice.value = null

    // If invoice already exists on this order
    if (newOrder.invoices?.length > 0) {
      currentInvoice.value = newOrder.invoices[0]
      cashReceived.value = Math.ceil(currentInvoice.value.grand_total || 0)

      // If order is already paid, skip directly to bill view (step 3)
      if (
        newOrder.payment_status === 'paid' ||
        newOrder.status === 'paid' ||
        newOrder.status === 'completed'
      ) {
        step.value = 3
        store.fetchInvoiceDetails(currentInvoice.value.id).then((inv) => {
          printInvoice.value = inv
        })
      } else {
        step.value = 2
        // Pre-fetch print invoice so 'Print Bill' works immediately
        store.fetchInvoiceDetails(currentInvoice.value.id).then((inv) => {
          printInvoice.value = inv
        })
      }
    }
  },
  { immediate: true },
)

// ── Actions ────────────────────────────────────────────────
async function doGenerateInvoice() {
  if (!props.order) return
  try {
    const { invoice } = await store.generateInvoice(props.order.id, {
      deliveryCharge: orderDeliveryCharge.value,
    })
    currentInvoice.value = invoice
    cashReceived.value = Math.ceil(invoice.grand_total || props.order.total_amount || 0)
    printInvoice.value = await store.fetchInvoiceDetails(invoice.id)
    step.value = 2
    $q.notify({
      type: 'positive',
      message: `Invoice #${invoice.invoice_number} created`,
      icon: 'receipt_long',
    })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to generate invoice' })
  }
}

function selectMethod(pm) {
  selectedMethodId.value = pm.id
  selectedMethodName.value = pm.name
  if (pm.name === 'Cash') {
    cashReceived.value = Math.ceil(
      parseFloat(currentInvoice.value?.grand_total || props.order?.total_amount || 0),
    )
  }
}

async function doRecordPayment() {
  if (!currentInvoice.value?.id || !selectedMethodId.value) return

  const amount = parseFloat(currentInvoice.value?.grand_total || props.order?.total_amount || 0)

  try {
    await store.recordPayment(
      currentInvoice.value.id,
      [
        {
          methodId: selectedMethodId.value,
          amount,
          transactionRef: transactionRef.value || null,
        },
      ],
      props.order?.id,
    )

    // Fetch full invoice for print
    printInvoice.value = await store.fetchInvoiceDetails(currentInvoice.value.id)

    step.value = 3
    emit('paid', props.order?.id)

    $q.notify({
      type: 'positive',
      message: 'Payment recorded successfully!',
      icon: 'check_circle',
      timeout: 3000,
    })

    // Auto-print the receipt after payment — wait for Vue to render the template
    await nextTick()
    await new Promise((r) => setTimeout(r, 300))
    if (printTemplateRef.value) {
      printTemplateRef.value.printReceipt()
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Payment failed' })
  }
}

async function printBill() {
  if (!currentInvoice.value?.id) return
  try {
    // Ensure latest invoice data
    if (!printInvoice.value) {
      printInvoice.value = await store.fetchInvoiceDetails(currentInvoice.value.id)
    }
    // Give Vue one tick to render the template
    await new Promise((r) => setTimeout(r, 100))
    if (printTemplateRef.value) {
      printTemplateRef.value.printReceipt()
    } else {
      window.print()
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Print failed: ' + err.message })
  }
}

function close() {
  isOpen.value = false
  step.value = 1
  currentInvoice.value = null
  printInvoice.value = null
}

// ── Helpers ────────────────────────────────────────────────
function fmtCurrency(val) {
  return `LKR ${parseFloat(val || 0).toFixed(2)}`
}

function getMethodIcon(name) {
  const icons = {
    Cash: 'payments',
    Card: 'credit_card',
    Online: 'qr_code_scanner',
    Transfer: 'account_balance',
  }
  return icons[name] || 'attach_money'
}
</script>

<style scoped>
/* ── Root ── */
.bill-dialog-root {
  width: 100vw;
  max-width: 100vw;
  height: 100vh;
  background: #0d0d14;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Top Bar ── */
.bill-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
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

/* ── Body ── */
.bill-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ══ LEFT PANE ══ */
.bill-left-pane {
  width: 400px;
  min-width: 340px;
  max-width: 420px;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
  overflow-y: auto;
}

.order-meta-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 12px;
}

.meta-chip {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.meta-chip-label {
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.meta-chip-value {
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
}

.customer-row {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
}

.items-section-label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.2);
  padding: 0 2px;
}

.items-list {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.item-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background 0.15s;
}

.item-row:last-child {
  border-bottom: none;
}

.item-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.item-row.cancelled {
  opacity: 0.35;
  text-decoration: line-through;
}

.item-qty {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.4);
  min-width: 24px;
  flex-shrink: 0;
}

.item-name {
  flex: 1;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.8);
}

.item-notes {
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.3);
  font-style: italic;
}

.item-price {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.totals-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 12px;
  margin-top: auto;
}

.totals-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  padding: 3px 0;
  color: rgba(255, 255, 255, 0.5);
}

.totals-value {
  font-variant-numeric: tabular-nums;
}

.totals-row.discount {
  color: #ef9a9a;
}

.totals-row.delivery {
  color: #4dd0e1;
}

.preview-row.delivery {
  color: #4dd0e1;
}

.totals-row.grand {
  color: #fff;
  font-weight: 700;
  font-size: 0.9rem;
  margin-top: 4px;
}

.grand-value {
  color: #42a5f5;
  font-size: 1rem;
}

.totals-divider {
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  margin: 6px 0;
}

/* ══ RIGHT PANE ══ */
.bill-right-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px 24px;
  gap: 16px;
  overflow-y: auto;
}

/* ── Step indicator ── */
.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 0 20px;
  flex-shrink: 0;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.step-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
}

.step.active .step-circle {
  background: rgba(33, 150, 243, 0.2);
  color: #42a5f5;
  border-color: rgba(33, 150, 243, 0.4);
}

.step.done .step-circle {
  background: rgba(76, 175, 80, 0.2);
  color: #66bb6a;
  border-color: rgba(76, 175, 80, 0.4);
}

.step-label {
  font-size: 0.62rem;
  color: rgba(255, 255, 255, 0.25);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.step.active .step-label {
  color: #42a5f5;
}

.step.done .step-label {
  color: #66bb6a;
}

.step-connector {
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin-bottom: 14px;
  transition: background 0.3s ease;
}

.step-connector.active {
  background: rgba(33, 150, 243, 0.4);
}

/* ── Step panels ── */
.step-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 14px;
  max-width: 440px;
  margin: 0 auto;
  width: 100%;
}

.step-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #fff;
  display: flex;
  align-items: center;
}

.step-desc {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.5;
}

.invoice-preview-box {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 14px;
}

.preview-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  padding: 4px 0;
  color: rgba(255, 255, 255, 0.55);
}

.preview-row.discount {
  color: #ef9a9a;
}
.preview-row.total {
  color: #fff;
  font-weight: 700;
  font-size: 0.9rem;
  margin-top: 4px;
}

.preview-divider {
  border-top: 1px dashed rgba(255, 255, 255, 0.08);
  margin: 8px 0;
}

.invoice-badge {
  display: inline-flex;
  align-items: center;
  background: rgba(33, 150, 243, 0.12);
  color: #42a5f5;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 20px;
  border: 1px solid rgba(33, 150, 243, 0.2);
}

.amount-due-card {
  background: linear-gradient(135deg, rgba(33, 150, 243, 0.1), rgba(33, 150, 243, 0.05));
  border: 1px solid rgba(33, 150, 243, 0.2);
  border-radius: 14px;
  padding: 18px 20px;
  text-align: center;
}

.amount-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.35);
  margin-bottom: 4px;
}

.amount-value {
  font-size: 2rem;
  font-weight: 800;
  color: #fff;
  font-variant-numeric: tabular-nums;
}

.pm-label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.2);
}

.pm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 8px;
}

.pm-btn {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  padding: 14px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.5);
  transition: all 0.2s ease;
  font-size: 0;
}

.pm-btn:hover {
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.8);
}

.pm-btn.active {
  background: rgba(33, 150, 243, 0.12);
  border-color: rgba(33, 150, 243, 0.4);
  color: #42a5f5;
}

.pm-name {
  font-size: 0.7rem;
  font-weight: 600;
  margin-top: 4px;
}

.cash-section {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 12px;
}

.change-display {
  display: flex;
  justify-content: space-between;
  padding: 6px 0 0;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.4);
}

.change-display.positive {
  color: #66bb6a;
}

.change-amount {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.action-btn {
  border-radius: 12px !important;
  font-weight: 700;
  letter-spacing: 0.3px;
}

/* ── Step 3: Success ── */
.step-success {
  align-items: center;
  justify-content: center;
  text-align: center;
}

.success-icon-wrap {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgba(76, 175, 80, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: success-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes success-pop {
  from {
    transform: scale(0);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.success-title {
  font-size: 1.4rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.3px;
}

.success-sub {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.35);
}

.success-summary-box {
  width: 100%;
  max-width: 300px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 16px;
}

.success-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  padding: 4px 0;
  color: rgba(255, 255, 255, 0.55);
}

.success-row.change {
  color: #66bb6a;
  font-weight: 700;
}

.success-actions {
  width: 100%;
  max-width: 300px;
}

/* ── Bill View (Step 3 - Paid order receipt preview) ── */
.bill-view-header {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  flex-shrink: 0;
}

.success-title-inline {
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
}

.bill-view-container {
  flex: 1;
  overflow-y: auto;
  background: #fff;
  border-radius: 12px;
  margin: 8px 0;
  max-width: 320px;
  width: 100%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.bill-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

/* ── Print Frame (hidden on screen, visible on print) ── */
.print-frame {
  display: none;
}

@media print {
  .bill-dialog-root > *:not(.print-frame) {
    display: none !important;
  }
  .print-frame {
    display: block !important;
  }
}
</style>
