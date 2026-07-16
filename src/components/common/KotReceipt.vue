<template>
  <q-card
    class="bg-white text-dark q-pa-md kot-receipt-card"
    style="width: 100%; max-width: 350px; border-radius: 8px"
  >
    <!-- KOT Header -->
    <div class="text-center q-mb-md" style="font-family: monospace">
      <div class="text-h6 text-weight-bolder">*** KOT ***</div>
      <div v-if="kitchenName" class="text-subtitle2 text-weight-bold text-uppercase">
        {{ kitchenName }}
      </div>
      <div class="text-subtitle1 text-weight-bold">
        ORDER #{{ kot?.order?.order_number || kot?.order_number || 'N/A' }}
      </div>
      <div class="text-subtitle2 text-weight-medium text-grey-7" style="margin-top: -4px">
        KOT #{{ kot?.kot_number || 'N/A' }}
      </div>
      <div class="text-caption text-grey-8">
        {{ new Date(kot?.created_at || Date.now()).toLocaleString() }}
      </div>
    </div>

    <q-separator color="grey-4" class="q-my-sm border-dashed" style="border-top: 2px dashed #ccc" />

    <div
      class="row justify-between q-mb-sm text-body2 text-weight-bold"
      style="font-family: monospace"
    >
      <div>TABLE: {{ tableNumber }}</div>
      <div v-if="waiterName">WAITER: {{ waiterName }}</div>
      <div v-if="customerName">CUSTOMER: {{ customerName }}</div>
    </div>
    <div class="text-body2 text-weight-bold q-mb-sm" style="font-family: monospace">
      TYPE: {{ orderType?.replace('_', ' ')?.toUpperCase() || 'DINE IN' }}
      <span v-if="deliverySource" class="q-ml-sm text-red text-weight-bolder">
        ({{ deliverySource.toUpperCase() }})
      </span>
    </div>

    <q-separator color="grey-4" class="q-my-sm border-dashed" style="border-top: 2px dashed #ccc" />

    <!-- Order Items -->
    <div class="q-mt-md" style="font-family: monospace; font-size: 14px">
      <div class="row justify-between text-weight-bolder q-mb-xs">
        <div class="col-2">QTY</div>
        <div class="col-10">ITEM</div>
      </div>

      <div v-for="item in kotItems" :key="item.id" class="q-mb-xs">
        <div class="row">
          <div class="col-2 text-weight-bold">{{ item.quantity || item.qty }}x</div>
          <div class="col-10 text-weight-medium">{{ item.name }}</div>
        </div>
        <div v-if="item.notes" class="row">
          <div class="col-2"></div>
          <div class="col-10 text-italic text-grey-8" style="font-size: 12px">
            * {{ item.notes }}
          </div>
        </div>
      </div>
    </div>

    <q-separator color="grey-4" class="q-my-md border-dashed" style="border-top: 2px dashed #ccc" />

    <div v-if="orderNotes" class="q-mb-md" style="font-family: monospace; font-size: 13px">
      <div class="text-weight-bold">ORDER NOTES:</div>
      <div>{{ orderNotes }}</div>
    </div>

    <div class="text-center text-weight-bolder q-mt-md" style="font-family: monospace">
      *** END KOT ***
    </div>

    <!-- Actions (only shown if not printing) -->
    <div v-if="showActions" class="q-mt-lg row q-col-gutter-sm items-center no-print">
      <div class="col-6">
        <q-btn
          unelevated
          color="grey-3"
          text-color="dark"
          label="Close"
          v-close-popup
          class="full-width"
        />
      </div>
      <div class="col-6">
        <q-btn
          unelevated
          color="primary"
          icon="print"
          label="Print"
          @click="printReceipt"
          class="full-width"
          :loading="printing"
        />
      </div>
    </div>
  </q-card>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  kot: { type: Object, required: true },
  tableNumber: { type: String, default: '—' },
  waiterName: { type: String, default: '' },
  customerName: { type: String, default: '' },
  orderType: { type: String, default: 'Dine-In' },
  deliverySource: { type: String, default: null },
  orderNotes: { type: String, default: '' },
  kitchenName: { type: String, default: '' },
  // Map of items from the order to enrich KOT items
  orderItems: { type: Array, default: () => [] },
  showActions: { type: Boolean, default: true },
})

const emit = defineEmits(['printed'])
const printing = ref(false)

// Function to get enriched items
const kotItems = computed(() => {
  if (!props.kot || (!props.kot.items && !props.kot.kot_items)) return []

  const items = props.kot.items || props.kot.kot_items

  return items.map((ki) => {
    // If we have orderItems, try to find the full item details
    const oi = props.orderItems.find((i) => i.id === (ki.order_item_id || ki.id))
    return {
      ...ki,
      name: ki.name || oi?.name || 'Unknown Item',
      notes: ki.notes || oi?.notes || '',
    }
  })
})

function printReceipt() {
  printing.value = true

  let itemsHtml = ''
  for (const item of kotItems.value) {
    itemsHtml += `
      <div style="display: flex; margin-bottom: 8px;">
        <div style="width: 20%; font-weight: bold; font-size: 15px;">${item.quantity || item.qty}x</div>
        <div style="width: 80%; font-weight: 600; font-size: 15px;">
          <div>${item.name}</div>
          ${item.notes ? `<div style="font-size: 12px; font-style: italic; color: #555; margin-top: 2px;">* ${item.notes}</div>` : ''}
        </div>
      </div>
    `
  }

  const printContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>KOT #${props.kot.kot_number || 'N/A'}</title>
        <style>
          @page {
            margin: 0;
            size: auto;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 14px;
            width: 100%;
            max-width: 300px; /* ~80mm */
            margin: 0;
            padding: 0;
            color: #000;
            background: #fff;
          }
          .pos-container {
            padding: 4mm;
            width: 100%;
            box-sizing: border-box;
          }
          .text-center { text-align: center; }
          .text-h6 { font-size: 22px; font-weight: 900; margin-bottom: 5px; }
          .text-subtitle2 { font-size: 16px; font-weight: bold; text-transform: uppercase; margin-bottom: 5px; }
          .text-subtitle1 { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
          .text-caption { font-size: 13px; color: #444; margin-bottom: 10px; }

          .divider { border-top: 2px dashed #000; margin: 10px 0; }

          .flex-between { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-bottom: 6px; }
          .meta { font-weight: bold; font-size: 14px; margin-bottom: 6px; }

          .table-header { display: flex; justify-content: space-between; font-weight: 900; font-size: 14px; margin-bottom: 6px; margin-top: 10px; }

          .order-notes { font-size: 14px; margin-bottom: 15px; font-weight: bold; }
          .footer { text-align: center; font-weight: 900; margin-top: 15px; font-size: 16px; }
        </style>
      </head>
      <body>
        <div class="pos-container">
          <div class="text-center">
            <div class="text-h6">*** KOT ***</div>
            ${props.kitchenName ? `<div class="text-subtitle2">${props.kitchenName}</div>` : ''}
            <div class="text-subtitle1" style="font-size: 24px; font-weight: 900; margin-bottom: 2px;">ORDER #${props.kot.order?.order_number || props.kot.order_number || 'N/A'}</div>
            <div class="text-subtitle2" style="font-size: 15px; font-weight: bold; margin-bottom: 5px; color: #555;">KOT #${props.kot.kot_number || 'N/A'}</div>
            <div class="text-caption">${new Date(props.kot.created_at || Date.now()).toLocaleString()}</div>
          </div>

          <div class="divider"></div>

          <div class="flex-between">
            <div>TABLE: ${props.tableNumber}</div>
            ${props.waiterName ? `<div>WAITER: ${props.waiterName}</div>` : ''}
          </div>
          ${props.customerName ? `<div>CUSTOMER: ${props.customerName}</div>` : ''}
          <div class="meta">
            TYPE: ${props.orderType?.replace('_', ' ')?.toUpperCase() || 'DINE IN'}
            ${props.deliverySource ? `<span style="color: #d32f2f; margin-left: 8px;">(${props.deliverySource.toUpperCase()})</span>` : ''}
          </div>

          <div class="divider"></div>

          <div class="table-header">
            <div style="width: 20%">QTY</div>
            <div style="width: 80%">ITEM</div>
          </div>

          ${itemsHtml}

          ${
            props.orderNotes
              ? `
            <div class="divider"></div>
            <div class="order-notes">
              <div>ORDER NOTES:</div>
              <div style="font-weight: normal; margin-top: 2px; font-style: italic;">${props.orderNotes}</div>
            </div>
          `
              : ''
          }

          <div class="divider"></div>
          <div class="footer">*** END KOT ***</div>
        </div>
      </body>
    </html>
  `

  const iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow.document
  doc.open()
  doc.write(printContent)
  doc.close()

  iframe.contentWindow.focus()
  setTimeout(() => {
    iframe.contentWindow.print()
    setTimeout(() => {
      document.body.removeChild(iframe)
      printing.value = false
      emit('printed')
    }, 500)
  }, 200)
}

// Expose the print function so parent can trigger it
defineExpose({ printReceipt })
</script>

<style scoped>
.kot-receipt-card {
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}
.border-dashed {
  background: transparent;
}
@media print {
  .no-print {
    display: none !important;
  }
}
</style>
