<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    transition-show="scale"
    transition-hide="scale"
  >
    <q-card dark class="pos-shift-summary-card">
      <q-card-section class="header-section">
        <div class="row items-center no-wrap">
          <q-icon name="summarize" size="24px" color="teal" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold text-white">Shift Summary</div>
          <q-space />
          <q-btn flat round dense icon="refresh" color="teal" @click="loadData" :loading="loading" />
          <q-btn flat round dense icon="close" color="grey-5" v-close-popup />
        </div>
      </q-card-section>

      <q-separator color="grey-8" />

      <q-card-section v-if="shift" class="summary-section">
        <!-- Shift Info -->
        <div class="info-block q-mb-md">
          <div class="info-title">Shift Details</div>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-lbl">Terminal</span>
              <span class="info-val">{{ shift.terminal_id }}</span>
            </div>
            <div class="info-item">
              <span class="info-lbl">Opened</span>
              <span class="info-val">{{ formatDate(shift.opened_at) }}</span>
            </div>
            <div class="info-item">
              <span class="info-lbl">Duration</span>
              <span class="info-val">{{ duration }}</span>
            </div>
            <div class="info-item">
              <span class="info-lbl">Opening Float</span>
              <span class="info-val text-green">LKR {{ fmtNum(shift.opening_cash_float) }}</span>
            </div>
          </div>
        </div>

        <!-- Sales Breakdown -->
        <div class="info-block q-mb-md">
          <div class="info-title">Sales Breakdown</div>
          <table class="summary-table">
            <tbody>
              <tr>
                <td>Cash Sales</td>
                <td class="text-right">{{ fmtNum(shift.cash_sales_total) }}</td>
              </tr>
              <tr>
                <td>Card Sales</td>
                <td class="text-right">{{ fmtNum(shift.card_sales_total) }}</td>
              </tr>
              <tr>
                <td>QR Sales</td>
                <td class="text-right">{{ fmtNum(shift.qr_sales_total) }}</td>
              </tr>
              <tr>
                <td>Bank Transfer</td>
                <td class="text-right">{{ fmtNum(shift.bank_sales_total) }}</td>
              </tr>
              <tr>
                <td>Credit Sales</td>
                <td class="text-right">{{ fmtNum(shift.credit_sales_total) }}</td>
              </tr>
              <tr class="total-row">
                <td>TOTAL SALES</td>
                <td class="text-right text-green">{{ fmtNum(totalSales) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Cash Movements -->
        <div class="info-block q-mb-md">
          <div class="info-title">Cash Movements</div>
          <table class="summary-table">
            <tbody>
              <tr>
                <td>Cash Drops</td>
                <td class="text-right text-red">-{{ fmtNum(shift.cash_drops_total) }}</td>
              </tr>
              <tr>
                <td>Cash In</td>
                <td class="text-right text-green">+{{ fmtNum(shift.cash_in_total) }}</td>
              </tr>
              <tr>
                <td>Cash Out</td>
                <td class="text-right text-red">-{{ fmtNum(shift.cash_out_total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Expected Cash -->
        <div class="info-block">
          <div class="info-title">Expected Cash in Drawer</div>
          <div class="expected-amount">
            LKR {{ fmtNum(expectedCash) }}
          </div>
          <div class="expected-formula">
            = {{ fmtNum(shift.opening_cash_float) }} (float)
            + {{ fmtNum(shift.cash_sales_total) }} (cash sales)
            - {{ fmtNum(shift.cash_drops_total) }} (drops)
            + {{ fmtNum(shift.cash_in_total) }} (in)
            - {{ fmtNum(shift.cash_out_total) }} (out)
          </div>
        </div>

        <!-- Recent Movements List -->
        <div v-if="movements.length > 0" class="info-block q-mt-md">
          <div class="info-title">Recent Cash Movements</div>
          <div v-for="m in movements" :key="m.id" class="movement-row">
            <q-icon
              :name="m.type === 'cash_in' ? 'add_circle' : 'remove_circle'"
              :color="m.type === 'cash_in' ? 'green' : 'orange'"
              size="16px"
            />
            <span class="movement-type">{{ m.type.replace('_', ' ') }}</span>
            <span class="movement-amount" :class="m.type === 'cash_in' ? 'text-green' : 'text-orange'">
              {{ m.type === 'cash_in' ? '+' : '-' }}{{ fmtNum(m.amount) }}
            </span>
            <span class="movement-reason">{{ m.reason || '' }}</span>
            <span class="movement-time">{{ formatTime(m.created_at) }}</span>
          </div>
        </div>
      </q-card-section>

      <q-card-section v-else class="text-center q-pa-xl">
        <q-spinner color="teal" size="40px" />
        <div class="text-grey-5 q-mt-md">Loading shift data...</div>
      </q-card-section>

      <q-separator color="grey-8" />

      <q-card-actions align="right" class="q-pa-md">
        <q-btn
          unelevated
          label="Print Summary"
          color="teal"
          icon="print"
          no-caps
          class="q-mr-sm"
          @click="handlePrint"
        />
        <q-btn flat label="Close" color="grey-5" no-caps v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useShiftStore } from 'src/stores/shiftStore'
import { useAuthStore } from 'src/stores/auth'
import { printService } from 'src/services/printService'

const props = defineProps({
  modelValue: Boolean,
})

defineEmits(['update:modelValue'])

const shiftStore = useShiftStore()
const authStore = useAuthStore()
const shift = ref(null)
const movements = ref([])
const loading = ref(false)

function handlePrint() {
  if (!shift.value) return
  
  const cashierName = authStore.profile?.full_name || authStore.user?.email || 'Cashier'
  const printPayload = {
    ...shift.value,
    cashier_name: cashierName,
  }
  printService.printShiftSummary(printPayload)
}


const totalSales = computed(() => {
  if (!shift.value) return 0
  return (shift.value.cash_sales_total || 0)
    + (shift.value.card_sales_total || 0)
    + (shift.value.qr_sales_total || 0)
    + (shift.value.bank_sales_total || 0)
    + (shift.value.credit_sales_total || 0)
})

const expectedCash = computed(() => {
  if (!shift.value) return 0
  return (shift.value.opening_cash_float || 0)
    + (shift.value.cash_sales_total || 0)
    - (shift.value.cash_drops_total || 0)
    + (shift.value.cash_in_total || 0)
    - (shift.value.cash_out_total || 0)
})

const duration = computed(() => {
  if (!shift.value?.opened_at) return ''
  const ms = Date.now() - new Date(shift.value.opened_at).getTime()
  const hrs = Math.floor(ms / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  return `${hrs}h ${mins}m`
})

watch(() => props.modelValue, (open) => {
  if (open) loadData()
})

async function loadData() {
  loading.value = true
  try {
    await shiftStore.refreshShiftTotals()
    shift.value = shiftStore.activeShift
    movements.value = await shiftStore.fetchCashMovements()
  } finally {
    loading.value = false
  }
}

function fmtNum(val) {
  return parseFloat(val || 0).toFixed(2)
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.pos-shift-summary-card {
  background: #1a1a1a;
  min-width: 420px;
  max-width: 520px;
  border: 1px solid #333;
}

.header-section {
  background: #222;
  padding: 12px 20px;
}

.summary-section {
  padding: 16px 20px;
  max-height: 60vh;
  overflow-y: auto;
}

.info-block {
  padding: 12px;
  background: #222;
  border: 1px solid #333;
}

.info-title {
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 700;
  margin-bottom: 10px;
  border-bottom: 1px solid #333;
  padding-bottom: 6px;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.info-item {
  display: flex;
  flex-direction: column;
}

.info-lbl {
  font-size: 10px;
  color: #666;
  text-transform: uppercase;
}

.info-val {
  font-size: 13px;
  color: #fff;
  font-weight: 600;
}

.summary-table {
  width: 100%;
  border-collapse: collapse;
}

.summary-table td {
  padding: 6px 4px;
  font-size: 13px;
  color: #ccc;
  border-bottom: 1px solid #2a2a2a;
}

.summary-table .text-right {
  text-align: right;
  font-weight: 600;
  font-family: 'Courier New', monospace;
}

.total-row td {
  font-weight: 800;
  font-size: 14px;
  border-top: 2px solid #444;
  color: #fff;
}

.text-green { color: #4caf50; }
.text-red { color: #ef5350; }
.text-orange { color: #ff9800; }

.expected-amount {
  font-size: 28px;
  font-weight: 800;
  color: #4fc3f7;
  font-family: 'Courier New', monospace;
  text-align: center;
  padding: 8px 0;
}

.expected-formula {
  font-size: 10px;
  color: #666;
  text-align: center;
  font-family: 'Courier New', monospace;
}

.movement-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 12px;
}

.movement-type {
  text-transform: uppercase;
  font-weight: 600;
  color: #aaa;
  width: 80px;
  font-size: 10px;
}

.movement-amount {
  font-weight: 700;
  font-family: 'Courier New', monospace;
  width: 80px;
  text-align: right;
}

.movement-reason {
  color: #777;
  flex: 1;
  font-size: 11px;
}

.movement-time {
  color: #555;
  font-size: 10px;
}
</style>
