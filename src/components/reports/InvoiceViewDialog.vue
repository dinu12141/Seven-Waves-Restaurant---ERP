<template>
  <q-dialog v-model="show" transition-show="scale" transition-hide="fade">
    <q-card class="inv-dialog">
      <!-- ── Toolbar ──────────────────────────────── -->
      <q-toolbar class="inv-dialog__toolbar">
        <q-icon name="receipt_long" size="22px" class="q-mr-sm" />
        <q-toolbar-title class="inv-dialog__title">
          Invoice {{ invoice?.invoice_number || invoice?.invoice_no || order?.order_number || '' }}
        </q-toolbar-title>
        <q-btn flat dense round icon="print" @click="printInvoice">
          <q-tooltip>Print</q-tooltip>
        </q-btn>
        <q-btn flat dense round icon="close" @click="show = false" />
      </q-toolbar>

      <q-card-section v-if="loading" class="text-center q-pa-xl">
        <q-spinner-gears size="40px" color="primary" />
        <div class="q-mt-md text-grey">Loading invoice...</div>
      </q-card-section>

      <q-card-section v-else-if="!invoice && !order" class="text-center q-pa-xl">
        <q-icon name="error_outline" size="48px" color="negative" />
        <div class="q-mt-md">Invoice not found</div>
      </q-card-section>

      <!-- ── Invoice Content ──────────────────────── -->
      <q-card-section v-else class="inv-dialog__body q-pa-none flex flex-center" style="background-color: #e0e0e0; padding-top: 20px; padding-bottom: 20px;">
        <BillPrintTemplate
          v-if="formattedInvoiceForTemplate"
          ref="billTemplate"
          :invoice="formattedInvoiceForTemplate"
          :branch-name="invoice?.branches?.name || ''"
          :cashier-name="cashierName"
          class="shadow-2 bg-white"
        />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import BillPrintTemplate from 'src/components/cashier/BillPrintTemplate.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  invoiceId: { type: [String, null], default: null },
  orderId: { type: [String, null], default: null },
})

const emit = defineEmits(['update:modelValue'])

const show = ref(false)
const loading = ref(false)
const invoice = ref(null)
const order = ref(null)
const orderItems = ref([])
const payments = ref([])
const waiterName = ref('')
const cashierName = ref('')
const billTemplate = ref(null)

const formattedInvoiceForTemplate = computed(() => {
  if (!invoice.value && !order.value) return null;
  // Fallback to simulated invoice if exact invoice not populated
  const simulatedInvoice = invoice.value || {
      id: order.value.id,
      invoice_number: order.value.order_number,
      created_at: order.value.created_at,
      payment_status: order.value.status === 'completed' || order.value.payment_status === 'paid' ? 'paid' : 'pending',
      subtotal: order.value.subtotal,
      discount: order.value.discount_amount,
      tax: order.value.tax_amount,
      delivery_charge: order.value.delivery_charge,
      service_charge: order.value.service_charge,
      total: order.value.total_amount,
      grand_total: order.value.total_amount,
      notes: order.value.notes
  };

  const currentCashier = cashierName.value || invoice.value?.cashier?.full_name || invoice.value?.profiles?.full_name || order.value?.creator?.full_name || 'Cashier';
  const currentWaiter = waiterName.value || order.value?.waiter?.full_name || order.value?.assigned_waiter?.full_name || '—';

  return {
    ...simulatedInvoice,
    orders: order.value ? {
      ...order.value,
      waiter: { full_name: currentWaiter },
      assigned_waiter: { full_name: currentWaiter },
      kot_tickets: order.value.kot_tickets || [],
      restaurant_tables: order.value.restaurant_tables || (order.value.table_number ? { table_number: order.value.table_number } : null),
    } : null,
    invoice_items: orderItems.value.map(item => ({
      menu_item_name: item.menu_items?.name || item.name || 'Item',
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price
    })),
    cashier: { full_name: currentCashier },
    payments: payments.value
  }
})

// Close handler
watch(show, (val) => {
  emit('update:modelValue', val)
})

// ── Main trigger: load data when dialog opens ──────────────
watch(() => props.modelValue, async (val) => {
  show.value = val
  if (!val) return  // Dialog closing, do nothing

  // Reset state
  invoice.value = null
  order.value = null
  orderItems.value = []
  payments.value = []
  waiterName.value = ''
  cashierName.value = ''
  loading.value = true

  // Wait for Vue to settle ALL prop changes from parent
  await nextTick()

  const invId = props.invoiceId
  const ordId = props.orderId

  console.log('[InvoiceViewDialog] Dialog opened. invoiceId:', invId, 'orderId:', ordId)

  try {
    if (invId) {
      await loadByInvoiceId(invId)
    } else if (ordId) {
      await loadByOrderId(ordId)
    } else {
      console.warn('[InvoiceViewDialog] No invoiceId or orderId provided')
    }
  } catch (e) {
    console.error('[InvoiceViewDialog] Error:', e)
  } finally {
    loading.value = false
  }
})

async function loadByInvoiceId(id) {
  console.log('[InvoiceViewDialog] Loading invoice by ID:', id)
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      branches ( name ),
      cashier:cashier_id ( full_name ),
      profiles:cashier_id ( full_name ),
      payments ( id, amount, payment_method, created_at, payment_methods ( name ) )
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('[InvoiceViewDialog] Invoice query error:', error)
    // Fallback: try loading by order_id if we have one
    if (props.orderId) {
      await loadByOrderId(props.orderId)
    }
    return
  }

  invoice.value = data
  payments.value = data?.payments || []

  if (data?.cashier?.full_name) {
    cashierName.value = data.cashier.full_name
  } else if (data?.profiles?.full_name) {
    cashierName.value = data.profiles.full_name
  } else if (data?.cashier_id) {
    await loadCashierName(data.cashier_id)
  }

  if (data?.order_id) await loadOrder(data.order_id)
}

async function loadByOrderId(ordId) {
  console.log('[InvoiceViewDialog] Loading invoice by order ID:', ordId)

  // First try to find invoice for this order
  const { data: invArr, error: invErr } = await supabase
    .from('invoices')
    .select(`
      *,
      branches ( name ),
      cashier:cashier_id ( full_name ),
      profiles:cashier_id ( full_name ),
      payments ( id, amount, payment_method, created_at, payment_methods ( name ) )
    `)
    .eq('order_id', ordId)
    .limit(1)

  if (invErr) {
    console.error('[InvoiceViewDialog] Invoice by order query error:', invErr)
  }

  if (invArr && invArr.length > 0) {
    invoice.value = invArr[0]
    payments.value = invArr[0].payments || []
    if (invArr[0].cashier?.full_name) {
      cashierName.value = invArr[0].cashier.full_name
    } else if (invArr[0].profiles?.full_name) {
      cashierName.value = invArr[0].profiles.full_name
    } else if (invArr[0].cashier_id) {
      await loadCashierName(invArr[0].cashier_id)
    }
  }

  // Load order details (items etc.)
  await loadOrder(ordId)

  // If no invoice record found, create a virtual one from order data
  if (!invoice.value && order.value) {
    invoice.value = {
      invoice_number: order.value.order_number || 'N/A',
      created_at: order.value.created_at,
      payment_status: order.value.payment_status || (order.value.status === 'completed' ? 'paid' : order.value.status),
      subtotal: order.value.subtotal,
      discount: order.value.discount_amount,
      tax: order.value.tax_amount,
      delivery_charge: order.value.delivery_charge,
      service_charge: order.value.service_charge,
      grand_total: order.value.total_amount,
      total: order.value.total_amount,
    }
  }
}

async function loadOrder(ordId) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, order_type, table_number, table_id, status, payment_status, subtotal, tax_amount, discount_amount,
      total_amount, delivery_charge, service_charge, created_at, notes,
      waiter:profiles!orders_waiter_id_fkey ( full_name ),
      restaurant_tables ( table_number, section ),
      kot_tickets ( id, kot_number, status, kitchen_id ),
      order_items ( id, quantity, unit_price, total_price, menu_items ( name ) )
    `)
    .eq('id', ordId)
    .single()

  if (error) {
    console.error('[InvoiceViewDialog] Order query error:', error)
    return
  }

  if (data) {
    order.value = data
    orderItems.value = data.order_items || []
    waiterName.value = data.waiter?.full_name || 'Staff'
  }
}

async function loadCashierName(cashierId) {
  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', cashierId)
    .single()
  if (data?.full_name) {
    cashierName.value = data.full_name
  }
}

function printInvoice() {
  if (billTemplate.value) {
    billTemplate.value.printReceipt();
  }
}
</script>

<style scoped lang="scss">
.inv-dialog {
  display: flex;
  flex-direction: column;
  width: 400px;
  max-width: 95vw;
  margin: 0 auto;
  border-radius: 12px;
  background: #f0f0f0;
}

.inv-dialog__toolbar {
  background: #1a237e;
  color: #fff;
  min-height: 48px;
}

.inv-dialog__title {
  font-size: 16px;
  font-weight: 600;
}

.inv-dialog__body {
  overflow-y: auto;
  max-height: 80vh;
}
</style>
