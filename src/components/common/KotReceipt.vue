<template>
  <q-card class="bg-white text-dark q-pa-md kot-receipt-card" style="width: 100%; max-width: 350px; border-radius: 8px">
    <!-- KOT Header -->
    <div class="text-center q-mb-md" style="font-family: monospace">
      <div class="text-h6 text-weight-bolder">*** KOT ***</div>
      <div v-if="kitchenName" class="text-subtitle2 text-weight-bold text-uppercase">
          {{ kitchenName }}
      </div>
      <div class="text-subtitle1 text-weight-bold">
        KOT #{{ kot?.kot_number || 'N/A' }}
      </div>
      <div class="text-caption text-grey-8">
        {{ new Date(kot?.created_at || Date.now()).toLocaleString() }}
      </div>
    </div>

    <q-separator color="grey-4" class="q-my-sm border-dashed" style="border-top: 2px dashed #ccc" />

    <div class="row justify-between q-mb-sm text-body2 text-weight-bold" style="font-family: monospace">
      <div>TABLE: {{ tableNumber }}</div>
      <div v-if="waiterName">WAITER: {{ waiterName }}</div>
    </div>
    <div class="text-body2 text-weight-bold q-mb-sm" style="font-family: monospace">
      TYPE: {{ orderType?.replace('_', ' ')?.toUpperCase() || 'DINE IN' }}
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
          <q-btn unelevated color="grey-3" text-color="dark" label="Close" v-close-popup class="full-width" />
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
  orderType: { type: String, default: 'Dine-In' },
  orderNotes: { type: String, default: '' },
  kitchenName: { type: String, default: '' },
  // Map of items from the order to enrich KOT items
  orderItems: { type: Array, default: () => [] },
  showActions: { type: Boolean, default: true }
})

const emit = defineEmits(['printed'])
const printing = ref(false)

// Function to get enriched items
const kotItems = computed(() => {
    if (!props.kot || !props.kot.items && !props.kot.kot_items) return []
    
    const items = props.kot.items || props.kot.kot_items
    
    return items.map(ki => {
        // If we have orderItems, try to find the full item details
        const oi = props.orderItems.find(i => i.id === (ki.order_item_id || ki.id))
        return {
            ...ki,
            name: ki.name || oi?.name || 'Unknown Item',
            notes: ki.notes || oi?.notes || ''
        }
    })
})

function printReceipt() {
  printing.value = true
  
  let itemsHtml = ''
  for (const item of kotItems.value) {
    itemsHtml += `
      <tr>
        <td style="padding-right: 10px; font-weight: bold; vertical-align: top;">${item.quantity || item.qty}x</td>
        <td>
          <div style="font-weight: 500;">${item.name}</div>
          ${item.notes ? `<div style="font-size: 12px; font-style: italic;">* ${item.notes}</div>` : ''}
        </td>
      </tr>
    `
  }

  const printContent = `
    <html>
      <head>
        <title>KOT #${props.kot.kot_number || 'N/A'}</title>
        <style>
          body { font-family: monospace; font-size: 14px; width: 80mm; margin: 0; padding: 10px; color: #000; }
          h2 { text-align: center; margin: 0 0 5px 0; font-size: 18px; }
          .sub-h { text-align: center; margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; font-weight: bold; }
          .meta { font-size: 14px; margin-bottom: 3px; font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          table { width: 100%; text-align: left; border-collapse: collapse; }
          th, td { vertical-align: top; padding: 2px 0; }
          .footer { text-align: center; font-weight: bold; margin-top: 15px; }
        </style>
      </head>
      <body>
        <h2>*** KOT ***</h2>
        ${props.kitchenName ? `<div class="sub-h">${props.kitchenName}</div>` : ''}
        <div class="meta">KOT: #${props.kot.kot_number || 'N/A'}</div>
        <div class="meta">TIME: ${new Date(props.kot.created_at || Date.now()).toLocaleString()}</div>
        <div class="divider"></div>
        <div class="meta">TABLE: ${props.tableNumber}</div>
        <div class="meta">TYPE: ${props.orderType?.replace('_', ' ')?.toUpperCase() || 'DINE IN'}</div>
        ${props.waiterName ? `<div class="meta">WAITER: ${props.waiterName}</div>` : ''}
        <div class="divider"></div>
        <table>
          <thead>
              <tr>
                  <th style="width: 20%">QTY</th>
                  <th style="width: 80%">ITEM</th>
              </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        ${props.orderNotes ? `
          <div class="divider"></div>
          <div style="font-size: 13px;">
            <strong>NOTES:</strong><br>${props.orderNotes}
          </div>
        ` : ''}
        <div class="divider"></div>
        <div class="footer">*** END KOT ***</div>
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
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
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
