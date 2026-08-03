<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5">Suppliers</div>
      <PermissionGate permission="procurement.suppliers.create">
        <q-btn class="erp-btn-primary" icon="add" label="Add Supplier" @click="openDialog" />
      </PermissionGate>
    </div>

    <!-- Search & Filter -->
    <div class="row q-mb-md">
      <q-input
        dense
        outlined
        v-model="filter"
        placeholder="Search suppliers..."
        class="col-12 col-md-4"
      >
        <template v-slot:append>
          <q-icon name="search" />
        </template>
      </q-input>
    </div>

    <!-- Suppliers Table -->
    <q-table
      :rows="suppliers"
      :columns="columns"
      row-key="id"
      :filter="filter"
      :loading="loading"
      flat
      bordered
    >
      <template v-slot:body-cell-credit_limit="props">
        <q-td :props="props" align="right">
          {{ formatCurrency(props.row.credit_limit) }}
        </q-td>
      </template>

      <template v-slot:body-cell-balance="props">
        <q-td
          :props="props"
          align="right"
          class="text-weight-bold"
          :class="props.row.balance > 0 ? 'text-negative' : 'text-green'"
        >
          {{ formatCurrency(props.row.balance) }}
        </q-td>
      </template>

      <template v-slot:body-cell-payment_terms_days="props">
        <q-td :props="props" align="right"> {{ props.row.payment_terms_days }} Days </q-td>
      </template>

      <template v-slot:body-cell-actions="props">
        <q-td :props="props" align="right">
          <PermissionGate permission="procurement.suppliers.edit">
            <q-btn flat round color="primary" icon="edit" size="sm" @click="editSupplier(props.row)">
              <q-tooltip>Edit</q-tooltip>
            </q-btn>
          </PermissionGate>
          <PermissionGate permission="procurement.suppliers.delete">
            <q-btn
              flat
              round
              color="negative"
              icon="delete"
              size="sm"
              @click="deleteSupplierAction(props.row)"
              class="q-ml-sm"
            >
              <q-tooltip>Delete</q-tooltip>
            </q-btn>
          </PermissionGate>
        </q-td>
      </template>

      <template v-slot:body-cell-is_active="props">
        <q-td :props="props">
          <q-chip
            :color="props.row.is_active ? 'green' : 'grey'"
            text-color="white"
            dense
            size="sm"
          >
            {{ props.row.is_active ? 'Active' : 'Inactive' }}
          </q-chip>
        </q-td>
      </template>
    </q-table>

    <!-- Add/Edit Dialog using ERPFormCard -->
    <q-dialog v-model="dialogVisible" persistent full-height position="right">
      <div
        style="width: 500px; max-width: 100vw; height: 100vh; background-color: var(--erp-bg-main)"
      >
        <q-scroll-area class="fit">
          <div class="q-pa-lg">
            <ERPFormCard
              :title="isEditing ? 'Edit Supplier' : 'New Supplier'"
              :subtitle="
                isEditing ? `Editing ${form.name}` : 'Register a new supplier for procurement'
              "
              :loading="saving"
              submit-label="Save Supplier"
              @submit="saveSupplier"
              @cancel="dialogVisible = false"
              ref="erpForm"
            >
              <ERPFormSection title="General Information" collapsible>
                <div class="row q-col-gutter-md">
                  <div class="col-12">
                    <ERPFormField label="Code" helper="Leave empty to auto-generate">
                      <q-input v-model="form.code" dense outlined placeholder="SUP-XXXX" readonly />
                    </ERPFormField>
                  </div>
                </div>
                <div class="row q-col-gutter-md">
                  <div class="col-12">
                    <ERPFormField label="Supplier Name" required :error="vErrors.name">
                      <q-input
                        v-model="form.name"
                        dense
                        outlined
                        placeholder="Enter business name"
                        @update:model-value="vErrors.name = ''"
                      />
                    </ERPFormField>
                  </div>
                </div>
              </ERPFormSection>

              <ERPFormSection title="Contact Details" collapsible>
                <div class="row q-col-gutter-md">
                  <div class="col-12">
                    <ERPFormField label="Contact Person">
                      <q-input
                        v-model="form.contact_person"
                        dense
                        outlined
                        placeholder="e.g. John Doe"
                      />
                    </ERPFormField>
                  </div>
                </div>
                <div class="row q-col-gutter-md">
                  <div class="col-6">
                    <ERPFormField label="Phone">
                      <q-input
                        v-model="form.phone"
                        type="tel"
                        dense
                        outlined
                        placeholder="+1 234 567 8900"
                      />
                    </ERPFormField>
                  </div>
                  <div class="col-6">
                    <ERPFormField label="Email" :error="vErrors.email">
                      <q-input
                        v-model="form.email"
                        type="email"
                        dense
                        outlined
                        placeholder="email@example.com"
                        @update:model-value="vErrors.email = ''"
                      />
                    </ERPFormField>
                  </div>
                </div>
                <div class="row q-col-gutter-md">
                  <div class="col-12">
                    <ERPFormField label="Address">
                      <q-input v-model="form.address" type="textarea" dense outlined autogrow />
                    </ERPFormField>
                  </div>
                </div>
              </ERPFormSection>

              <ERPFormSection title="Finance & Terms" collapsible>
                <div class="row q-col-gutter-md">
                  <div class="col-6">
                    <ERPFormField label="Tax ID / VAT No">
                      <q-input v-model="form.tax_id" dense outlined placeholder="TAX-12345" />
                    </ERPFormField>
                  </div>
                  <div class="col-6">
                    <ERPFormField label="Payment Terms">
                      <q-input
                        v-model.number="form.payment_terms_days"
                        type="number"
                        dense
                        outlined
                        placeholder="30"
                      >
                        <template #append><span style="font-size: 11px">Days</span></template>
                      </q-input>
                    </ERPFormField>
                  </div>
                </div>
                <div class="row q-col-gutter-md q-mt-sm">
                  <div class="col-12">
                    <ERPStyledToggle label="Active Supplier" v-model="form.is_active" />
                  </div>
                </div>
              </ERPFormSection>

              <ERPFormSection title="Banking Details" collapsible>
                <div class="row q-col-gutter-md">
                  <div class="col-12 col-sm-6">
                    <ERPFormField label="Bank Name">
                      <q-input
                        v-model="form.bank_name"
                        dense
                        outlined
                        placeholder="e.g. Bank of Ceylon"
                      />
                    </ERPFormField>
                  </div>
                  <div class="col-12 col-sm-6">
                    <ERPFormField label="Branch / Routing Code">
                      <q-input
                        v-model="form.bank_branch_code"
                        dense
                        outlined
                        placeholder="e.g. 001"
                      />
                    </ERPFormField>
                  </div>
                </div>
                <div class="row q-col-gutter-md">
                  <div class="col-12 col-sm-6">
                    <ERPFormField label="Account Name">
                      <q-input
                        v-model="form.bank_account_name"
                        dense
                        outlined
                        placeholder="Account holder name"
                      />
                    </ERPFormField>
                  </div>
                  <div class="col-12 col-sm-6">
                    <ERPFormField label="Account Number">
                      <q-input
                        v-model="form.bank_account_number"
                        dense
                        outlined
                        placeholder="e.g. 0123456789"
                      />
                    </ERPFormField>
                  </div>
                </div>
              </ERPFormSection>

              <ERPFormSection v-if="isEditing && form.id" title="Items Supplied" collapsible>
                <q-table
                  :rows="supplierItems"
                  :columns="supplierItemColumns"
                  row-key="id"
                  :loading="loadingSupplierItems"
                  flat
                  bordered
                  dense
                  hide-pagination
                  :rows-per-page-options="[0]"
                  no-data-label="No items linked to this supplier yet"
                  class="q-mb-md"
                >
                  <template v-slot:body-cell-is_active="props">
                    <q-td :props="props">
                      <q-toggle
                        :model-value="props.row.is_active"
                        dense
                        color="green"
                        @update:model-value="(val) => toggleSupplierItemActive(props.row, val)"
                      />
                    </q-td>
                  </template>
                  <template v-slot:body-cell-actions="props">
                    <q-td :props="props" align="right">
                      <q-btn
                        flat
                        round
                        dense
                        size="sm"
                        color="negative"
                        icon="delete"
                        @click="removeSupplierItem(props.row)"
                      >
                        <q-tooltip>Remove</q-tooltip>
                      </q-btn>
                    </q-td>
                  </template>
                </q-table>

                <div class="text-caption text-weight-medium q-mb-xs">Add Item</div>
                <div class="row q-col-gutter-sm items-end">
                  <div class="col-12 col-sm-4">
                    <q-select
                      v-model="newSupplierItem.item_id"
                      :options="itemOptions"
                      option-label="label"
                      option-value="id"
                      emit-value
                      map-options
                      dense
                      outlined
                      use-input
                      input-debounce="0"
                      clearable
                      placeholder="Search item..."
                      @filter="filterItemOptions"
                      @update:model-value="onSupplierItemPicked"
                    >
                      <template v-slot:append>
                        <q-btn
                          v-if="canEditSupplierItems"
                          flat
                          dense
                          round
                          size="sm"
                          icon="add"
                          color="primary"
                          @click.stop="openNewItemDialog"
                        >
                          <q-tooltip>+ New Item</q-tooltip>
                        </q-btn>
                      </template>
                    </q-select>
                  </div>
                  <div class="col-6 col-sm-2">
                    <q-select
                      v-model="newSupplierItem.uom_id"
                      :options="uomSelectOptions"
                      option-label="label"
                      option-value="id"
                      emit-value
                      map-options
                      dense
                      outlined
                      label="UOM"
                    />
                  </div>
                  <div class="col-6 col-sm-2">
                    <q-input
                      v-model.number="newSupplierItem.last_price"
                      type="number"
                      dense
                      outlined
                      label="Price"
                      min="0"
                    />
                  </div>
                  <div class="col-6 col-sm-2">
                    <q-input
                      v-model.number="newSupplierItem.min_order_qty"
                      type="number"
                      dense
                      outlined
                      label="Min Qty"
                      min="0"
                    />
                  </div>
                  <div class="col-6 col-sm-1">
                    <q-input
                      v-model.number="newSupplierItem.lead_time_days"
                      type="number"
                      dense
                      outlined
                      label="Lead (d)"
                      min="0"
                    />
                  </div>
                  <div class="col-12 col-sm-1">
                    <q-btn
                      class="full-width"
                      color="primary"
                      unelevated
                      dense
                      icon="add"
                      :loading="savingSupplierItem"
                      :disable="!newSupplierItem.item_id || !newSupplierItem.uom_id"
                      @click="addSupplierItem"
                    />
                  </div>
                </div>
              </ERPFormSection>
            </ERPFormCard>
          </div>
        </q-scroll-area>
      </div>
    </q-dialog>

    <!-- + New Item inline dialog -->
    <q-dialog v-model="newItemDialogVisible" persistent>
      <q-card style="min-width: 380px; max-width: 95vw">
        <q-card-section class="row items-center justify-between">
          <div class="text-h6">New Item</div>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-separator />
        <q-card-section class="q-gutter-sm">
          <q-input v-model="newItemForm.name" label="Item Name *" dense outlined />
          <q-select
            v-model="newItemForm.category_id"
            :options="categorySelectOptions"
            option-label="label"
            option-value="id"
            emit-value
            map-options
            label="Category *"
            dense
            outlined
          />
          <q-select
            v-model="newItemForm.inventory_uom_id"
            :options="uomSelectOptions"
            option-label="label"
            option-value="id"
            emit-value
            map-options
            label="Unit of Measure *"
            dense
            outlined
          />
          <q-input
            v-model.number="newItemForm.reorder_level"
            type="number"
            label="Reorder Level"
            dense
            outlined
            min="0"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat no-caps label="Cancel" v-close-popup />
          <q-btn
            unelevated
            no-caps
            label="Create Item"
            color="primary"
            :loading="savingNewItem"
            @click="saveNewItem"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import {
  listSuppliers,
  upsertSupplier,
  deleteSupplier,
  listSupplierItems,
  upsertSupplierItem,
  deleteSupplierItem,
} from 'src/services/procurementService'
import { useItemsList, useCategoryList, useUomList } from 'src/services/inventoryService'
import { usePermission } from 'src/core/rbac/usePermission'
import PermissionGate from 'components/common/PermissionGate.vue'
import ERPFormCard from 'components/erp/ERPFormCard.vue'
import ERPFormSection from 'components/erp/ERPFormSection.vue'
import ERPFormField from 'components/erp/ERPFormField.vue'
import ERPStyledToggle from 'components/erp/ERPStyledToggle.vue'

const $q = useQuasar()
const { can } = usePermission()
const canEditSupplierItems = computed(() => can('procurement.suppliers.edit'))

const suppliers = ref([])
const loading = ref(false)
const filter = ref('')
const dialogVisible = ref(false)
const saving = ref(false)
const isEditing = ref(false)
const erpForm = ref(null)

// Form State
const defaultForm = {
  id: undefined,
  code: '',
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  tax_id: '',
  payment_terms_days: 30,
  is_active: true,
  bank_name: '',
  bank_account_number: '',
  bank_account_name: '',
  bank_branch_code: '',
}

const form = ref({ ...defaultForm })
const vErrors = reactive({ name: '', email: '' })

const columns = [
  { name: 'code', label: 'Code', field: 'code', sortable: true, align: 'left' },
  { name: 'name', label: 'Name', field: 'name', sortable: true, align: 'left' },
  { name: 'contact_person', label: 'Contact', field: 'contact_person', align: 'left' },
  { name: 'phone', label: 'Phone', field: 'phone', align: 'left' },
  {
    name: 'credit_limit',
    label: 'Credit Limit',
    field: 'credit_limit',
    align: 'right',
    sortable: true,
  },
  { name: 'balance', label: 'Balance', field: 'balance', align: 'right', sortable: true },
  { name: 'is_active', label: 'Status', field: 'is_active', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' },
]

onMounted(() => {
  fetchSuppliers()
})

async function fetchSuppliers() {
  loading.value = true
  try {
    suppliers.value = await listSuppliers()
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'Failed to fetch suppliers',
      caption: err.message,
    })
  } finally {
    loading.value = false
  }
}

function formatCurrency(val) {
  return (val || 0).toLocaleString('en-LK', { style: 'currency', currency: 'LKR' })
}

function clearErrors() {
  vErrors.name = ''
  vErrors.email = ''
}

function openDialog() {
  isEditing.value = false
  form.value = { ...defaultForm }
  clearErrors()
  supplierItems.value = []
  resetNewSupplierItem()
  dialogVisible.value = true
}

function editSupplier(row) {
  isEditing.value = true
  form.value = { ...row }
  clearErrors()
  dialogVisible.value = true
  fetchSupplierItems(row.id)
}

function validateForm() {
  let isValid = true
  clearErrors()

  if (!form.value.name || form.value.name.trim() === '') {
    vErrors.name = 'Name is required'
    isValid = false
  }

  if (form.value.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(form.value.email)) {
      vErrors.email = 'Invalid email format'
      isValid = false
    }
  }

  return isValid
}

async function saveSupplier() {
  if (!validateForm()) {
    erpForm.value?.validationError()
    return
  }

  saving.value = true
  try {
    if (isEditing.value && form.value.id) {
      await upsertSupplier({ ...form.value, name: form.value.name.trim(), code: form.value.code })
      $q.notify({ type: 'positive', message: 'Supplier updated' })
      dialogVisible.value = false
    } else {
      const created = await upsertSupplier({
        ...form.value,
        name: form.value.name.trim(),
        code: form.value.code,
      })
      $q.notify({ type: 'positive', message: 'Supplier created' })
      // Switch into edit mode in the same dialog (instead of closing it) so
      // "Items Supplied" becomes visible right away — the user can add the
      // items this supplier sells without having to reopen the dialog.
      form.value = { ...created }
      isEditing.value = true
      fetchSupplierItems(created.id)
    }
    fetchSuppliers()
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'Failed to save supplier',
      caption: err.message,
    })
  } finally {
    saving.value = false
  }
}

function deleteSupplierAction(row) {
  $q.dialog({
    title: 'Confirm Delete',
    message: `Are you sure you want to delete supplier "${row.name}"?`,
    cancel: true,
    persistent: true,
    color: 'negative',
  }).onOk(async () => {
    try {
      await deleteSupplier(row.id)
      $q.notify({ type: 'positive', message: 'Supplier deleted successfully' })
      fetchSuppliers()
    } catch (err) {
      $q.notify({
        type: 'negative',
        message: 'Failed to delete supplier',
        caption: err.message,
      })
    }
  })
}

// ─────────────────────────────────────────────
// Items Supplied catalogue
// ─────────────────────────────────────────────
const { items: allItems, listItems, createItem } = useItemsList()
const { categories, listCategories } = useCategoryList()
const { uoms, listUoms } = useUomList()

const supplierItems = ref([])
const loadingSupplierItems = ref(false)
const savingSupplierItem = ref(false)

const supplierItemColumns = [
  { name: 'item_name', label: 'Item', field: 'item_name', align: 'left' },
  { name: 'uom_code', label: 'UOM', field: 'uom_code', align: 'center' },
  {
    name: 'last_price',
    label: 'Last Price',
    field: 'last_price',
    align: 'right',
    format: (v) => formatCurrency(v),
  },
  { name: 'min_order_qty', label: 'Min Qty', field: 'min_order_qty', align: 'right' },
  { name: 'lead_time_days', label: 'Lead Time (d)', field: 'lead_time_days', align: 'right' },
  { name: 'is_active', label: 'Active', field: 'is_active', align: 'center' },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

const itemOptions = ref([])

function resetNewSupplierItem() {
  newSupplierItem.value = {
    item_id: null,
    uom_id: null,
    last_price: 0,
    min_order_qty: 0,
    lead_time_days: 0,
  }
}

const newSupplierItem = ref({
  item_id: null,
  uom_id: null,
  last_price: 0,
  min_order_qty: 0,
  lead_time_days: 0,
})

const uomSelectOptions = computed(() =>
  uoms.value.map((u) => ({
    label: u.name && u.name !== u.code ? `${u.code} — ${u.name}` : u.code,
    id: u.id,
  })),
)

const categorySelectOptions = computed(() =>
  categories.value.map((c) => ({ label: c.name, id: c.id })),
)

async function fetchSupplierItems(supplierId) {
  loadingSupplierItems.value = true
  try {
    supplierItems.value = await listSupplierItems(supplierId)
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to load items supplied', caption: err.message })
  } finally {
    loadingSupplierItems.value = false
  }
}

async function ensureItemsLoaded() {
  if (!allItems.value.length) await listItems()
  if (!categories.value.length) await listCategories()
  if (!uoms.value.length) await listUoms()
  itemOptions.value = allItems.value.map((i) => ({
    label: `${i.name} (${i.code})`,
    id: i.id,
    inventory_uom_id: i.inventory_uom_id || i.uom_id,
  }))
}

function filterItemOptions(val, update) {
  update(() => {
    if (!val) {
      itemOptions.value = allItems.value.map((i) => ({
        label: `${i.name} (${i.code})`,
        id: i.id,
        inventory_uom_id: i.inventory_uom_id || i.uom_id,
      }))
      return
    }
    const q = val.toLowerCase()
    itemOptions.value = allItems.value
      .filter((i) => i.name?.toLowerCase().includes(q) || i.code?.toLowerCase().includes(q))
      .map((i) => ({
        label: `${i.name} (${i.code})`,
        id: i.id,
        inventory_uom_id: i.inventory_uom_id || i.uom_id,
      }))
  })
}

function onSupplierItemPicked(itemId) {
  if (!itemId) return
  const picked = allItems.value.find((i) => i.id === itemId)
  if (picked) {
    newSupplierItem.value.uom_id = picked.inventory_uom_id || picked.uom_id || null
  }
}

watch(
  () => isEditing.value && dialogVisible.value,
  (open) => {
    if (open) ensureItemsLoaded()
  },
)

async function addSupplierItem() {
  if (!form.value.id) return
  if (!newSupplierItem.value.item_id || !newSupplierItem.value.uom_id) {
    $q.notify({ type: 'warning', message: 'Select an item and UOM first' })
    return
  }
  if (newSupplierItem.value.last_price < 0 || newSupplierItem.value.min_order_qty < 0 || newSupplierItem.value.lead_time_days < 0) {
    $q.notify({ type: 'negative', message: 'Price, min qty and lead time cannot be negative' })
    return
  }
  savingSupplierItem.value = true
  try {
    await upsertSupplierItem({
      supplier_id: form.value.id,
      item_id: newSupplierItem.value.item_id,
      uom_id: newSupplierItem.value.uom_id,
      last_price: Number(newSupplierItem.value.last_price) || 0,
      min_order_qty: Number(newSupplierItem.value.min_order_qty) || 0,
      lead_time_days: Number(newSupplierItem.value.lead_time_days) || 0,
    })
    $q.notify({ type: 'positive', message: 'Item added to supplier catalogue' })
    resetNewSupplierItem()
    await fetchSupplierItems(form.value.id)
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to add item', caption: err.message })
  } finally {
    savingSupplierItem.value = false
  }
}

async function toggleSupplierItemActive(row, val) {
  try {
    await upsertSupplierItem({ ...row, is_active: val })
    row.is_active = val
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to update item', caption: err.message })
  }
}

function removeSupplierItem(row) {
  $q.dialog({
    title: 'Remove Item',
    message: `Remove "${row.item_name}" from this supplier's catalogue?`,
    cancel: true,
    persistent: true,
    color: 'negative',
  }).onOk(async () => {
    try {
      await deleteSupplierItem(row.id)
      $q.notify({ type: 'positive', message: 'Item removed' })
      await fetchSupplierItems(form.value.id)
    } catch (err) {
      $q.notify({ type: 'negative', message: 'Failed to remove item', caption: err.message })
    }
  })
}

// ── + New Item inline dialog ──────────────────────────────────────────────────
const newItemDialogVisible = ref(false)
const savingNewItem = ref(false)
const newItemForm = ref({
  name: '',
  category_id: null,
  inventory_uom_id: null,
  reorder_level: 0,
})

function openNewItemDialog() {
  newItemForm.value = { name: '', category_id: null, inventory_uom_id: null, reorder_level: 0 }
  newItemDialogVisible.value = true
}

async function saveNewItem() {
  if (!newItemForm.value.name?.trim() || !newItemForm.value.category_id || !newItemForm.value.inventory_uom_id) {
    $q.notify({ type: 'warning', message: 'Name, category and UOM are required' })
    return
  }
  if (Number(newItemForm.value.reorder_level) < 0) {
    $q.notify({ type: 'negative', message: 'Reorder level cannot be negative' })
    return
  }
  savingNewItem.value = true
  try {
    const created = await createItem({
      name: newItemForm.value.name.trim(),
      category_id: newItemForm.value.category_id,
      inventory_uom_id: newItemForm.value.inventory_uom_id,
      reorder_level: Number(newItemForm.value.reorder_level) || 0,
      is_active: true,
    })
    $q.notify({ type: 'positive', message: 'Item created' })
    newItemDialogVisible.value = false
    await listItems()
    itemOptions.value = allItems.value.map((i) => ({
      label: `${i.name} (${i.code})`,
      id: i.id,
      inventory_uom_id: i.inventory_uom_id || i.uom_id,
    }))
    if (created?.id) {
      newSupplierItem.value.item_id = created.id
      onSupplierItemPicked(created.id)
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to create item', caption: err.message })
  } finally {
    savingNewItem.value = false
  }
}
</script>
