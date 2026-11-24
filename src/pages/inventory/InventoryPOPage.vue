<template>
  <q-page class="q-pa-md">
    <ErpPageHeader
      title="Purchase Orders"
      icon="shopping_cart"
      :breadcrumbs="[{ label: 'Inventory' }, { label: 'Purchase Orders' }]"
    >
      <template #actions>
        <q-btn
          unelevated
          no-caps
          icon="add"
          label="New Purchase Order"
          color="primary"
          class="text-weight-bold"
          @click="openNewPODialog"
        />
      </template>
    </ErpPageHeader>

    <!-- Status Tabs -->
    <div class="erp-tab-bar q-mb-md">
      <button
        v-for="t in tabOptions"
        :key="t.value"
        class="erp-tab"
        :class="{ 'erp-tab--active': activeTab === t.value }"
        @click="activeTab = t.value"
      >
        {{ t.label }}
        <span class="erp-tab__count">{{ tabCount(t.value) }}</span>
      </button>
    </div>

    <!-- Search & Filter Row -->
    <div class="row q-col-gutter-sm q-mb-md items-center">
      <div class="col-12 col-sm-6 col-md-4">
        <q-input
          v-model="searchQuery"
          dense
          outlined
          clearable
          placeholder="Search by PO#, supplier, or remarks…"
          debounce="300"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-select
          v-model="supplierFilter"
          :options="supplierSelectOptions"
          dense
          outlined
          clearable
          emit-value
          map-options
          label="Filter by Supplier"
        />
      </div>
      <q-space />
      <div class="col-auto">
        <q-btn flat round dense icon="refresh" :loading="loading" @click="fetchPOs">
          <q-tooltip>Refresh List</q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- Data Table -->
    <q-table
      flat
      bordered
      class="erp-table shadow-1"
      :rows="filteredPOs"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :pagination="{ rowsPerPage: 15 }"
      no-data-label="No purchase orders found"
    >
      <!-- Doc Number slot -->
      <template #body-cell-doc_number="cellProps">
        <q-td :props="cellProps">
          <span class="text-weight-bold text-primary cursor-pointer" @click="viewPO(cellProps.row)">
            {{ cellProps.value }}
          </span>
        </q-td>
      </template>

      <!-- Status slot -->
      <template #body-cell-status="cellProps">
        <q-td :props="cellProps">
          <q-chip
            dense
            size="sm"
            :color="getStatusColor(cellProps.value)"
            :text-color="getStatusTextColor(cellProps.value)"
            :icon="getStatusIcon(cellProps.value)"
            class="text-weight-medium text-capitalize q-px-sm"
          >
            {{ formatStatus(cellProps.value) }}
          </q-chip>
          <div v-if="cellProps.row.status === 'rejected' && cellProps.row.reject_reason" class="text-caption text-negative q-mt-xs text-italic">
            Reason: {{ cellProps.row.reject_reason }}
          </div>
        </q-td>
      </template>

      <!-- Amount slot -->
      <template #body-cell-total_amount="cellProps">
        <q-td :props="cellProps" class="text-right text-weight-bold">
          {{ formatCurrency(cellProps.value) }}
        </q-td>
      </template>

      <!-- Actions slot -->
      <template #body-cell-actions="cellProps">
        <q-td :props="cellProps" class="text-right">
          <div class="row q-gutter-xs justify-end no-wrap">
            <q-btn
              flat
              dense
              round
              size="sm"
              icon="visibility"
              color="primary"
              @click="viewPO(cellProps.row)"
            >
              <q-tooltip>View Full PO</q-tooltip>
            </q-btn>
            <q-btn
              v-if="cellProps.row.status === 'draft'"
              flat
              dense
              round
              size="sm"
              icon="send"
              color="amber-9"
              @click="submitDraft(cellProps.row)"
            >
              <q-tooltip>Submit to Procurement</q-tooltip>
            </q-btn>
          </div>
        </q-td>
      </template>
    </q-table>

    <!-- ── Full PO Create Dialog (Stores Input Form) ────────────────────────── -->
    <q-dialog v-model="createDialogVisible" persistent maximized-mobile>
      <q-card style="width: 1000px; max-width: 96vw; max-height: 90vh; display: flex; flex-direction: column" class="erp-dialog-card shadow-5">
        <q-card-section class="row items-center justify-between bg-primary text-white q-py-sm">
          <div class="row items-center q-gutter-sm">
            <q-icon name="shopping_cart" size="24px" />
            <div class="text-h6 text-weight-bold">Create Store Purchase Order</div>
          </div>
          <q-btn icon="close" flat round dense v-close-popup text-color="white" />
        </q-card-section>

        <q-separator />

        <q-card-section class="col scroll q-pa-md">
          <!-- Header Information -->
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-4">
              <q-select
                v-model="form.supplier"
                :options="supplierOptions"
                option-label="displayName"
                dense
                outlined
                use-input
                fill-input
                hide-selected
                label="Supplier *"
                placeholder="Type to search supplier…"
                :rules="[val => !!val || 'Supplier is required']"
                @filter="filterSuppliers"
              >
                <template #no-option>
                  <q-item>
                    <q-item-section class="text-grey">No matching suppliers</q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>

            <div class="col-12 col-sm-6 col-md-3">
              <q-select
                v-model="form.warehouse_id"
                :options="warehouseOptions"
                dense
                outlined
                emit-value
                map-options
                label="Destination Warehouse"
              />
            </div>

            <div class="col-12 col-sm-6 col-md-2">
              <q-input
                v-model="form.doc_date"
                type="date"
                dense
                outlined
                label="Order Date *"
                :rules="[val => !!val || 'Order date is required']"
              />
            </div>

            <div class="col-12 col-sm-6 col-md-3">
              <q-input
                v-model="form.expected_date"
                type="date"
                dense
                outlined
                label="Expected Delivery Date"
              />
            </div>

            <div class="col-12">
              <q-input
                v-model="form.remarks"
                dense
                outlined
                autogrow
                label="Remarks / Store Justification"
                placeholder="Add instructions, required brands, or store notes for procurement…"
              />
            </div>
          </div>

          <q-separator class="q-my-md" />

          <!-- Line Items Table -->
          <div class="row items-center justify-between q-mb-sm">
            <div class="text-subtitle1 text-weight-bold">
              Line Items ({{ form.lines.length }})
            </div>
            <q-btn
              unelevated
              no-caps
              size="sm"
              color="primary"
              icon="add"
              label="Add Item Line"
              @click="addLine"
            />
          </div>

          <div class="q-table__container erp-table erp-border-radius overflow-hidden shadow-1 q-mb-md">
            <table class="q-table q-table--horizontal-separator" style="width: 100%">
              <thead>
                <tr class="bg-grey-2 text-dark">
                  <th style="width: 40px" class="text-center">#</th>
                  <th style="width: 320px" class="text-left">Item *</th>
                  <th class="text-left">Description</th>
                  <th style="width: 120px" class="text-left">UOM *</th>
                  <th style="width: 100px" class="text-right">Qty *</th>
                  <th style="width: 130px" class="text-right">Unit Cost (LKR)</th>
                  <th style="width: 140px" class="text-right">Total (LKR)</th>
                  <th style="width: 50px" class="text-center"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(line, idx) in form.lines" :key="idx">
                  <td class="text-center text-grey-7">{{ idx + 1 }}</td>
                  <td>
                    <q-select
                      v-model="line._item"
                      :options="lineItemFilterOptions"
                      option-label="displayName"
                      dense
                      outlined
                      use-input
                      fill-input
                      hide-selected
                      placeholder="Select item…"
                      @filter="(val, update) => filterItems(val, update)"
                      @update:model-value="val => onItemSelect(line, val)"
                    />
                  </td>
                  <td>
                    <q-input v-model="line.description" dense outlined placeholder="Optional line note" />
                  </td>
                  <td>
                    <q-select
                      v-model="line.uom_id"
                      :options="uomOptions"
                      dense
                      outlined
                      emit-value
                      map-options
                    />
                  </td>
                  <td>
                    <q-input
                      v-model.number="line.quantity"
                      type="number"
                      min="0.01"
                      step="any"
                      dense
                      outlined
                      class="text-right"
                    />
                  </td>
                  <td>
                    <q-input
                      v-model.number="line.unit_price"
                      type="number"
                      min="0"
                      step="any"
                      dense
                      outlined
                      class="text-right"
                    />
                  </td>
                  <td class="text-right text-weight-bold">
                    {{ formatCurrency((Number(line.quantity) || 0) * (Number(line.unit_price) || 0)) }}
                  </td>
                  <td class="text-center">
                    <q-btn
                      flat
                      round
                      dense
                      size="sm"
                      icon="delete"
                      color="negative"
                      :disable="form.lines.length <= 1"
                      @click="removeLine(idx)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Totals Bar -->
          <div class="row justify-end q-mt-md">
            <div class="col-12 col-md-5">
              <q-card flat bordered class="q-pa-md bg-grey-1">
                <div class="row justify-between items-center q-mb-xs">
                  <span class="text-grey-7">Total Items:</span>
                  <span class="text-weight-bold">{{ form.lines.length }}</span>
                </div>
                <div class="row justify-between items-center text-h6 text-weight-bold text-primary">
                  <span>Grand Total:</span>
                  <span>{{ formatCurrency(computedTotalAmount) }}</span>
                </div>
              </q-card>
            </div>
          </div>
        </q-card-section>

        <q-separator />

        <q-card-actions align="right" class="q-pa-md bg-grey-1">
          <q-btn flat no-caps label="Cancel" color="grey-7" v-close-popup />
          <q-btn
            outline
            no-caps
            label="Save as Draft"
            color="secondary"
            icon="save"
            :loading="saving"
            @click="savePO(false)"
          />
          <q-btn
            unelevated
            no-caps
            label="Submit to Procurement"
            color="primary"
            icon="send"
            class="text-weight-bold q-px-md"
            :loading="saving"
            @click="savePO(true)"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── View PO Dialog (Read-Only) ──────────────────────────────────────── -->
    <q-dialog v-model="viewDialogVisible" maximized-mobile>
      <q-card style="width: 900px; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column" class="erp-dialog-card shadow-5">
        <q-card-section class="row items-center justify-between bg-primary text-white q-py-sm">
          <div class="row items-center q-gutter-sm">
            <q-icon name="description" size="24px" />
            <div class="text-h6 text-weight-bold">Purchase Order Details: {{ selectedPO?.doc_number }}</div>
          </div>
          <q-btn icon="close" flat round dense v-close-popup text-color="white" />
        </q-card-section>

        <q-separator />

        <q-card-section class="col scroll q-pa-md" v-if="selectedPO">
          <!-- Status Banner -->
          <q-banner
            rounded
            class="q-mb-md"
            :class="{
              'bg-amber-1 text-amber-10': selectedPO.status === 'pending_approval',
              'bg-positive text-white': selectedPO.status === 'approved',
              'bg-negative text-white': selectedPO.status === 'rejected',
              'bg-grey-3 text-dark': selectedPO.status === 'draft',
            }"
          >
            <template #avatar>
              <q-icon :name="getStatusIcon(selectedPO.status)" size="28px" />
            </template>
            <div class="text-subtitle1 text-weight-bold">
              Status: {{ formatStatus(selectedPO.status) }}
            </div>
            <div v-if="selectedPO.status === 'pending_approval'" class="text-caption">
              This Purchase Order is waiting for Procurement approval.
            </div>
            <div v-else-if="selectedPO.status === 'approved'" class="text-caption">
              This Purchase Order has been approved by Procurement.
            </div>
            <div v-else-if="selectedPO.status === 'rejected'" class="text-caption">
              Rejection Reason: {{ selectedPO.reject_reason || 'No specific reason provided' }}
            </div>
          </q-banner>

          <!-- PO Information Summary -->
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-sm-6 col-md-3">
              <div class="text-caption text-grey-7">PO Number</div>
              <div class="text-weight-bold text-subtitle2">{{ selectedPO.doc_number }}</div>
            </div>
            <div class="col-12 col-sm-6 col-md-3">
              <div class="text-caption text-grey-7">Supplier</div>
              <div class="text-weight-bold text-subtitle2">{{ selectedPO.suppliers?.name || 'N/A' }}</div>
            </div>
            <div class="col-12 col-sm-6 col-md-3">
              <div class="text-caption text-grey-7">Order Date</div>
              <div class="text-weight-bold text-subtitle2">{{ selectedPO.doc_date }}</div>
            </div>
            <div class="col-12 col-sm-6 col-md-3">
              <div class="text-caption text-grey-7">Expected Date</div>
              <div class="text-weight-bold text-subtitle2">{{ selectedPO.expected_date || 'Not specified' }}</div>
            </div>
            <div class="col-12" v-if="selectedPO.remarks">
              <div class="text-caption text-grey-7">Remarks</div>
              <div class="text-body2">{{ selectedPO.remarks }}</div>
            </div>
          </div>

          <q-separator class="q-my-md" />

          <!-- Lines Table -->
          <div class="text-subtitle2 text-weight-bold q-mb-sm">Order Items</div>
          <q-inner-loading :showing="loadingLines">
            <q-spinner color="primary" size="30px" />
          </q-inner-loading>

          <div class="q-table__container erp-table erp-border-radius overflow-hidden shadow-1">
            <table class="q-table q-table--horizontal-separator" style="width: 100%">
              <thead>
                <tr class="bg-grey-2 text-dark">
                  <th style="width: 40px" class="text-center">#</th>
                  <th class="text-left">Item Name</th>
                  <th class="text-left">Description</th>
                  <th style="width: 120px" class="text-left">UOM</th>
                  <th style="width: 100px" class="text-right">Qty</th>
                  <th style="width: 130px" class="text-right">Unit Price</th>
                  <th style="width: 140px" class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(l, idx) in selectedPOLines" :key="l.id || idx">
                  <td class="text-center">{{ idx + 1 }}</td>
                  <td class="text-weight-medium">{{ l.items?.name || l.item_name || l.description }}</td>
                  <td class="text-grey-8">{{ l.description || '—' }}</td>
                  <td>{{ l.uom?.name || l.uom?.code || l.uom_name || '—' }}</td>
                  <td class="text-right text-weight-bold">{{ Number(l.quantity).toLocaleString() }}</td>
                  <td class="text-right">{{ formatCurrency(l.unit_price) }}</td>
                  <td class="text-right text-weight-bold">
                    {{ formatCurrency((Number(l.quantity) || 0) * (Number(l.unit_price) || 0)) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="row justify-end q-mt-md">
            <div class="col-12 col-md-4">
              <div class="row justify-between text-h6 text-weight-bold text-primary">
                <span>Total Amount:</span>
                <span>{{ formatCurrency(selectedPO.total_amount) }}</span>
              </div>
            </div>
          </div>
        </q-card-section>

        <q-separator />

        <q-card-actions align="right" class="q-pa-md bg-grey-1">
          <q-btn flat no-caps label="Close" color="primary" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useQuasar, date } from 'quasar'
import { supabase } from 'src/boot/supabase'
import ErpPageHeader from 'components/common/ErpPageHeader.vue'
import {
  listStoresPOs,
  createStoresPO,
  listSuppliers,
  listItems,
  listUoms,
  getPODetails,
} from 'src/services/procurementService'
import { useWarehouseList } from 'src/services/inventoryService'

const $q = useQuasar()
const route = useRoute()

const loading = ref(false)
const saving = ref(false)
const loadingLines = ref(false)
const pos = ref([])
const activeTab = ref('all')
const searchQuery = ref('')
const supplierFilter = ref(null)

const suppliers = ref([])
const items = ref([])
const uoms = ref([])
const { warehouses, listWarehouses } = useWarehouseList()

// Create Form Dialog
const createDialogVisible = ref(false)
const lineItemFilterOptions = ref([])
const supplierOptions = ref([])

const defaultLine = () => ({
  _item: null,
  item_id: '',
  description: '',
  uom_id: '',
  quantity: 1,
  unit_price: 0,
})

const form = ref({
  supplier: null,
  warehouse_id: null,
  doc_date: date.formatDate(new Date(), 'YYYY-MM-DD'),
  expected_date: date.formatDate(date.addToDate(new Date(), { days: 7 }), 'YYYY-MM-DD'),
  remarks: '',
  lines: [defaultLine()],
})

// View Dialog
const viewDialogVisible = ref(false)
const selectedPO = ref(null)
const selectedPOLines = ref([])

const tabOptions = [
  { label: 'All POs', value: 'all' },
  { label: 'Pending Approval', value: 'pending_approval' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Draft', value: 'draft' },
]

const columns = [
  { name: 'doc_number', label: 'PO #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'doc_date', label: 'Date', field: 'doc_date', align: 'left', sortable: true },
  { name: 'expected_date', label: 'Expected Date', field: 'expected_date', align: 'left', sortable: true },
  { name: 'supplier_name', label: 'Supplier', field: row => row.suppliers?.name || '—', align: 'left', sortable: true },
  { name: 'total_amount', label: 'Total Amount', field: 'total_amount', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center', sortable: true },
  { name: 'created_at', label: 'Created At', field: row => row.created_at ? row.created_at.slice(0, 10) : '—', align: 'left', sortable: true },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' },
]

function tabCount(val) {
  if (val === 'all') return pos.value.length
  return pos.value.filter(p => p.status === val).length
}

const filteredPOs = computed(() => {
  return pos.value.filter(p => {
    if (activeTab.value !== 'all' && p.status !== activeTab.value) return false
    if (supplierFilter.value && p.supplier_id !== supplierFilter.value) return false
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase().trim()
      const matchDoc = p.doc_number?.toLowerCase().includes(q)
      const matchSupplier = p.suppliers?.name?.toLowerCase().includes(q)
      const matchRemarks = p.remarks?.toLowerCase().includes(q)
      if (!matchDoc && !matchSupplier && !matchRemarks) return false
    }
    return true
  })
})

const supplierSelectOptions = computed(() => {
  return suppliers.value.map(s => ({
    label: s.name,
    value: s.id,
  }))
})

const warehouseOptions = computed(() => {
  return (warehouses.value || []).map(w => ({
    label: w.name,
    value: w.id,
  }))
})

const uomOptions = computed(() => {
  return uoms.value.map(u => ({
    label: `${u.name || u.code} (${u.code})`,
    value: u.id,
  }))
})

const computedTotalAmount = computed(() => {
  return form.value.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0)
})

function formatCurrency(val) {
  return (
    'LKR ' +
    Number(val || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

function getStatusColor(st) {
  switch (st) {
    case 'approved': return 'positive'
    case 'pending_approval': return 'amber-9'
    case 'rejected': return 'negative'
    case 'draft': return 'grey-6'
    default: return 'primary'
  }
}

function getStatusTextColor(st) {
  if (st === 'pending_approval') return 'dark'
  return 'white'
}

function getStatusIcon(st) {
  switch (st) {
    case 'approved': return 'check_circle'
    case 'pending_approval': return 'hourglass_empty'
    case 'rejected': return 'cancel'
    default: return 'edit_note'
  }
}

function formatStatus(st) {
  switch (st) {
    case 'pending_approval': return 'Pending Approval'
    case 'approved': return 'Approved'
    case 'rejected': return 'Rejected'
    case 'draft': return 'Draft'
    default: return st || 'Draft'
  }
}

async function fetchPOs() {
  loading.value = true
  try {
    pos.value = await listStoresPOs()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to load purchase orders: ' + (err.message || err) })
  } finally {
    loading.value = false
  }
}

async function fetchLookups() {
  try {
    const [sup, itm, uomList] = await Promise.all([
      listSuppliers(),
      listItems(),
      listUoms(),
      listWarehouses(),
    ])
    suppliers.value = sup || []
    supplierOptions.value = suppliers.value.map(s => ({
      ...s,
      displayName: `${s.name} ${s.code ? '(' + s.code + ')' : ''}`,
    }))

    items.value = (itm || []).map(i => ({
      ...i,
      displayName: `${i.name} [${i.code || 'NO-CODE'}]`,
    }))
    lineItemFilterOptions.value = [...items.value]

    uoms.value = uomList || []
  } catch (err) {
    console.error('Error fetching lookups:', err)
  }
}

function filterSuppliers(val, update) {
  update(() => {
    if (!val) {
      supplierOptions.value = suppliers.value.map(s => ({
        ...s,
        displayName: `${s.name} ${s.code ? '(' + s.code + ')' : ''}`,
      }))
    } else {
      const q = val.toLowerCase()
      supplierOptions.value = suppliers.value
        .filter(s => s.name?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q))
        .map(s => ({
          ...s,
          displayName: `${s.name} ${s.code ? '(' + s.code + ')' : ''}`,
        }))
    }
  })
}

function filterItems(val, update) {
  update(() => {
    if (!val) {
      lineItemFilterOptions.value = [...items.value]
    } else {
      const q = val.toLowerCase()
      lineItemFilterOptions.value = items.value.filter(
        i => i.name?.toLowerCase().includes(q) || i.code?.toLowerCase().includes(q)
      )
    }
  })
}

function onItemSelect(line, selectedItem) {
  if (!selectedItem) {
    line.item_id = ''
    line.description = ''
    return
  }
  line.item_id = selectedItem.id
  line.description = selectedItem.name
  if (selectedItem.purchase_uom_id) {
    line.uom_id = selectedItem.purchase_uom_id
  } else if (uoms.value.length > 0 && !line.uom_id) {
    line.uom_id = uoms.value[0].id
  }
  if (selectedItem.last_purchase_price) {
    line.unit_price = Number(selectedItem.last_purchase_price)
  }
}

function addLine() {
  const fallbackUom = uoms.value.length > 0 ? uoms.value[0].id : ''
  form.value.lines.push({
    ...defaultLine(),
    uom_id: fallbackUom,
  })
}

function removeLine(idx) {
  if (form.value.lines.length > 1) {
    form.value.lines.splice(idx, 1)
  }
}

function openNewPODialog() {
  const defaultWarehouse = warehouses.value && warehouses.value.length > 0 ? warehouses.value[0].id : null
  const defaultUom = uoms.value && uoms.value.length > 0 ? uoms.value[0].id : ''

  form.value = {
    supplier: null,
    warehouse_id: defaultWarehouse,
    doc_date: date.formatDate(new Date(), 'YYYY-MM-DD'),
    expected_date: date.formatDate(date.addToDate(new Date(), { days: 7 }), 'YYYY-MM-DD'),
    remarks: '',
    lines: [{ ...defaultLine(), uom_id: defaultUom }],
  }
  createDialogVisible.value = true
}

async function savePO(submitForApproval = true) {
  if (!form.value.supplier || !form.value.supplier.id) {
    $q.notify({ type: 'warning', message: 'Please select a supplier.' })
    return
  }
  if (!form.value.doc_date) {
    $q.notify({ type: 'warning', message: 'Please select an order date.' })
    return
  }

  const validLines = form.value.lines.filter(l => l && l.item_id)
  if (validLines.length === 0) {
    $q.notify({ type: 'warning', message: 'Please select at least one item line.' })
    return
  }

  for (let i = 0; i < validLines.length; i++) {
    const l = validLines[i]
    if (!l.quantity || Number(l.quantity) <= 0) {
      $q.notify({ type: 'warning', message: `Please enter a valid quantity (> 0) for line #${i + 1}.` })
      return
    }
  }

  saving.value = true
  try {
    const header = {
      doc_date: form.value.doc_date,
      expected_date: form.value.expected_date,
      supplier_id: form.value.supplier.id,
      warehouse_id: form.value.warehouse_id || undefined,
      remarks: form.value.remarks,
    }

    const created = await createStoresPO(header, validLines, submitForApproval)

    $q.notify({
      type: 'positive',
      message: submitForApproval
        ? `Purchase Order ${created.doc_number || ''} submitted to Procurement for approval.`
        : `Purchase Order ${created.doc_number || ''} saved as draft.`,
    })

    createDialogVisible.value = false
    await fetchPOs()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to create PO: ' + (err.message || err) })
  } finally {
    saving.value = false
  }
}

async function viewPO(po) {
  selectedPO.value = po
  selectedPOLines.value = []
  viewDialogVisible.value = true
  loadingLines.value = true

  try {
    const details = await getPODetails(po.id)
    if (details && details.lines) {
      selectedPOLines.value = details.lines
    }
  } catch (err) {
    console.error('Error fetching PO details:', err)
  } finally {
    loadingLines.value = false
  }
}

async function submitDraft(po) {
  $q.dialog({
    title: 'Submit to Procurement',
    message: `Are you sure you want to submit PO ${po.doc_number} for procurement approval?`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: 'pending_approval' })
        .eq('id', po.id)
        .eq('status', 'draft')

      if (error) throw error

      $q.notify({ type: 'positive', message: `PO ${po.doc_number} submitted for approval.` })
      await fetchPOs()
    } catch (err) {
      $q.notify({ type: 'negative', message: 'Failed to submit PO: ' + (err.message || err) })
    }
  })
}

onMounted(async () => {
  await Promise.all([fetchPOs(), fetchLookups()])
  if (route.query.action === 'new') {
    openNewPODialog()
  }
})
</script>

<style scoped>
.erp-tab-bar {
  display: flex;
  gap: 8px;
  border-bottom: 2px solid var(--erp-border, #e2e8f0);
  padding-bottom: 2px;
}

.erp-tab {
  background: transparent;
  border: none;
  outline: none;
  cursor: pointer;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--erp-text-secondary, #64748b);
  border-radius: 6px 6px 0 0;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.erp-tab:hover {
  background: var(--erp-bg-hover, #f1f5f9);
  color: var(--erp-text-primary, #0f172a);
}

.erp-tab--active {
  color: var(--q-primary, #1976d2);
  border-bottom: 2px solid var(--q-primary, #1976d2);
  font-weight: 600;
}

.erp-tab__count {
  background: var(--erp-badge-bg, var(--erp-bg-hover));
  color: var(--erp-badge-text, var(--erp-text-secondary));
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
}
</style>
