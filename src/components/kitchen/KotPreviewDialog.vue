<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    maximized
    transition-show="slide-up"
    transition-hide="slide-down"
  >
    <div class="kot-preview-shell column no-wrap">
      <!-- Toolbar -->
      <div class="preview-toolbar row items-center no-print">
        <div class="row items-center q-gutter-x-sm">
          <q-icon name="receipt_long" size="22px" color="primary" />
          <div>
            <div class="text-subtitle1 text-white text-weight-bold">
              KOT #{{ ticket?.kot_number ?? '—' }}
              <q-chip
                v-if="isReprint"
                dense
                size="sm"
                color="amber-8"
                text-color="white"
                icon="replay"
                class="q-ml-xs"
                >REPRINT</q-chip
              >
            </div>
            <div class="text-caption text-grey-5">
              {{ ticket?.kitchen?.name ?? 'Kitchen' }}
              &nbsp;·&nbsp;Order #{{ ticket?.order?.order_number ?? '—' }}
            </div>
          </div>
        </div>

        <q-space />

        <!-- Printer selector (optional) -->
        <q-select
          v-if="availablePrinters.length > 1"
          v-model="selectedPrinter"
          :options="printerOptions"
          emit-value
          map-options
          dense
          outlined
          dark
          options-dense
          bg-color="grey-9"
          style="min-width: 180px"
          class="q-mr-sm"
        >
          <template v-slot:prepend>
            <q-icon name="print" size="16px" color="grey-5" />
          </template>
        </q-select>

        <q-btn
          unelevated
          color="primary"
          icon="print"
          label="Print"
          :loading="printing"
          class="q-mr-sm"
          @click="doPrint"
        />
        <q-btn flat round dense icon="close" color="grey-5" v-close-popup />
      </div>

      <!-- Preview area -->
      <div class="preview-body col row justify-center items-start q-pa-lg overflow-auto">
        <!-- Loading state -->
        <div v-if="loading" class="column items-center q-pa-xl">
          <q-spinner-orbit size="40px" color="primary" />
          <div class="text-grey-5 q-mt-sm">Loading ticket…</div>
        </div>

        <!-- Error state -->
        <div v-else-if="loadError" class="column items-center q-pa-xl text-center">
          <q-icon name="error_outline" size="48px" color="negative" />
          <div class="text-negative q-mt-sm">Failed to load ticket</div>
          <div class="text-grey-6 text-caption">{{ loadError }}</div>
        </div>

        <!-- KOT Preview Card -->
        <div v-else-if="ticket" class="kot-paper">
          <!-- Paper strip top -->
          <div class="paper-strip"></div>

          <!-- Header -->
          <div class="kot-header text-center">
            <div class="kitchen-title">{{ ticket.kitchen?.name ?? 'Kitchen' }}</div>
            <div v-if="ticket.branch?.name" class="branch-name">{{ ticket.branch.name }}</div>
          </div>

          <!-- Reprint badge -->
          <div v-if="isReprint" class="reprint-badge">★ REPRINT ★</div>

          <!-- KOT Number -->
          <div class="kot-number-block">
            <div class="kot-label-sm">KOT</div>
            <div class="kot-number">#{{ ticket.kot_number ?? '—' }}</div>
          </div>

          <div class="divider-thick"></div>

          <!-- Meta Grid -->
          <div class="meta-grid">
            <div class="meta-cell">
              <div class="meta-label">Order</div>
              <div class="meta-value">#{{ ticket.order?.order_number ?? '—' }}</div>
            </div>
            <div class="meta-cell">
              <div class="meta-label">Type</div>
              <div class="meta-value">{{ formatOrderType(ticket.order?.order_type) }}</div>
            </div>
            <div class="meta-cell">
              <div class="meta-label">Table</div>
              <div class="meta-value">{{ tableLabel }}</div>
            </div>
            <div class="meta-cell">
              <div class="meta-label">Time</div>
              <div class="meta-value">{{ formatTime(ticket.created_at) }}</div>
            </div>
          </div>

          <div class="divider-thick"></div>

          <!-- Items -->
          <div class="items-label">Items</div>
          <div class="items-list">
            <div v-for="(item, idx) in ticket.items" :key="idx" class="item-row">
              <div class="item-row-inner">
                <span class="item-qty">{{ item.qty }}×</span>
                <div class="item-info">
                  <div class="item-name">{{ item.name }}</div>
                  <div v-if="item.notes" class="item-note">⚑ {{ item.notes }}</div>
                </div>
              </div>
              <div v-if="idx < ticket.items.length - 1" class="item-separator"></div>
            </div>
          </div>

          <!-- Order Notes -->
          <div v-if="ticket.order?.notes" class="order-notes">
            <div class="order-notes-label">Order Notes</div>
            {{ ticket.order.notes }}
          </div>

          <div class="divider-dashed q-mt-md"></div>

          <!-- Footer -->
          <div class="kot-footer">Printed: {{ formatDateTime(new Date().toISOString()) }}</div>

          <!-- Tear edge -->
          <div class="tear-edge"></div>
        </div>
      </div>
    </div>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useQuasar } from 'quasar'
import { printService } from 'src/services/printService'

const $q = useQuasar()

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  kotId: { type: String, default: null },
})

const emit = defineEmits(['update:modelValue', 'printed'])

// ── State ──────────────────────────────────────────────────────────────────────
const ticket = ref(null)
const loading = ref(false)
const loadError = ref(null)
const printing = ref(false)
const availablePrinters = ref([])
const selectedPrinter = ref(null)

const isReprint = computed(() => !!ticket.value?.printed_at)

const tableLabel = computed(() => {
  const t = ticket.value?.order?.table?.table_number
  return t != null ? `Table ${t}` : 'Takeaway'
})

const printerOptions = computed(() =>
  availablePrinters.value.map((p) => ({
    label: p.name,
    value: p.id,
  })),
)

// ── Watchers ───────────────────────────────────────────────────────────────────
watch(
  () => [props.modelValue, props.kotId],
  async ([visible, kotId]) => {
    if (visible && kotId) {
      await loadTicket(kotId)
    } else if (!visible) {
      ticket.value = null
      loadError.value = null
    }
  },
  { immediate: true },
)

// ── Loaders ────────────────────────────────────────────────────────────────────
async function loadTicket(kotId) {
  loading.value = true
  loadError.value = null
  try {
    const { supabase } = await import('src/boot/supabase')
    const { data, error } = await supabase
      .from('kot_tickets')
      .select(
        `
        id, kot_number, status, printed_at, created_at,
        order:orders (
          order_number, order_type, notes,
          table:restaurant_tables ( table_number )
        ),
        kitchen:kitchens (
          name,
          branch:branches ( name, address, phone )
        ),
        kot_items (
          quantity, notes,
          order_item:order_items (
            menu_item:menu_items ( name )
          )
        )
      `,
      )
      .eq('id', kotId)
      .single()

    if (error) throw error

    ticket.value = {
      id: data.id,
      kot_number: data.kot_number,
      status: data.status,
      printed_at: data.printed_at,
      created_at: data.created_at,
      order: data.order,
      kitchen: data.kitchen,
      branch: data.kitchen?.branch ?? null,
      items: (data.kot_items ?? []).map((ki) => ({
        name: ki.order_item?.menu_item?.name ?? 'Unknown Item',
        qty: ki.quantity,
        notes: ki.notes ?? '',
      })),
    }
  } catch (e) {
    loadError.value = e?.message ?? 'Unknown error'
  } finally {
    loading.value = false
  }
}

// ── Actions ────────────────────────────────────────────────────────────────────
async function doPrint() {
  if (!ticket.value) return
  printing.value = true
  try {
    const result = await printService.printKotFromData(ticket.value, {
      printerId: selectedPrinter.value ?? undefined,
    })
    if (result.success) {
      emit('printed', ticket.value.id)
      $q.notify({
        type: 'positive',
        message: result.isReprint ? 'KOT Reprinted' : 'KOT Sent to Print',
        icon: 'print',
        position: 'top-right',
        timeout: 2000,
      })
    } else {
      $q.notify({ type: 'negative', message: result.error ?? 'Print failed', icon: 'error' })
    }
  } finally {
    printing.value = false
  }
}

// ── Formatters ─────────────────────────────────────────────────────────────────
function formatOrderType(type) {
  if (!type) return 'Dine-in'
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-')
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString('en-LK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}
</script>

<style scoped>
/* ── Shell ── */
.kot-preview-shell {
  background: #0d0d14;
  height: 100%;
  min-height: 100vh;
}

.preview-toolbar {
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  padding: 12px 20px;
  position: sticky;
  top: 0;
  z-index: 10;
}

.preview-body {
  background: #111118;
}

/* ── KOT Paper ── */
.kot-paper {
  background: #fff;
  color: #111;
  width: 300px;
  border-radius: 4px 4px 0 0;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
  font-family: 'Courier New', Courier, monospace;
  overflow: hidden;
  position: relative;
}

.paper-strip {
  height: 6px;
  background: repeating-linear-gradient(90deg, #222 0px, #222 6px, #fff 6px, #fff 12px);
}

/* ── Header ── */
.kot-header {
  padding: 12px 16px 8px;
  text-align: center;
}
.kitchen-title {
  font-size: 18px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 2px;
  border-bottom: 3px solid #000;
  padding-bottom: 6px;
}
.branch-name {
  font-size: 11px;
  color: #666;
  margin-top: 4px;
}

/* ── Reprint ── */
.reprint-badge {
  background: #000;
  color: #fff;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  padding: 4px;
  letter-spacing: 2px;
}

/* ── KOT Number ── */
.kot-number-block {
  text-align: center;
  border: 2px solid #000;
  border-radius: 4px;
  padding: 6px;
  margin: 10px 16px;
}
.kot-label-sm {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #888;
}
.kot-number {
  font-size: 36px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -1px;
}

/* ── Dividers ── */
.divider-thick {
  border: none;
  border-top: 2px solid #000;
  margin: 4px 16px 8px;
}
.divider-dashed {
  border: none;
  border-top: 1px dashed #aaa;
  margin: 0 16px;
}

/* ── Meta Grid ── */
.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 0 16px 8px;
  font-size: 12px;
}
.meta-label {
  font-size: 9px;
  text-transform: uppercase;
  color: #888;
  letter-spacing: 0.5px;
}
.meta-value {
  font-weight: 700;
  font-size: 13px;
}

/* ── Items ── */
.items-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #888;
  padding: 0 16px 4px;
}
.items-list {
  padding: 0 16px;
}
.item-row-inner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
}
.item-qty {
  font-size: 16px;
  font-weight: 900;
  min-width: 28px;
  color: #000;
  flex-shrink: 0;
}
.item-name {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
}
.item-note {
  font-size: 11px;
  font-style: italic;
  color: #666;
  margin-top: 2px;
}
.item-separator {
  border-top: 1px dotted #ddd;
  margin: 0;
}

/* ── Order Notes ── */
.order-notes {
  margin: 8px 16px;
  padding: 6px 8px;
  background: #f5f5f5;
  border-left: 3px solid #000;
  font-size: 11px;
}
.order-notes-label {
  font-weight: 700;
  font-size: 9px;
  text-transform: uppercase;
  margin-bottom: 2px;
}

/* ── Footer ── */
.kot-footer {
  text-align: center;
  font-size: 10px;
  color: #aaa;
  padding: 6px 16px 4px;
}

/* ── Tear edge ── */
.tear-edge {
  height: 14px;
  background: repeating-linear-gradient(90deg, #fff 0px, #fff 6px, #e0e0e0 6px, #e0e0e0 7px);
  margin-top: 4px;
}

/* ── Print media ── */
@media print {
  .no-print,
  .preview-toolbar {
    display: none !important;
  }
  .kot-paper {
    box-shadow: none;
  }
}
</style>
