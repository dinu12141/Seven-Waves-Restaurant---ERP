<template>
  <div class="q-pa-md">
    <!-- Toolbar -->
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-input
        :dark="$q.dark.isActive"
        outlined
        dense
        v-model="filter"
        placeholder="Search items..."
        style="min-width: 250px"
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
      <q-select
        :dark="$q.dark.isActive"
        outlined
        dense
        v-model="categoryFilter"
        :options="categoryOptions"
        display-value="Category"
        emit-value
        map-options
        clearable
        style="min-width: 180px"
      >
        <template v-if="categoryFilter" #selected>
          {{ categoryOptions.find((o) => o.value === categoryFilter)?.label || 'Category' }}
        </template>
        <template v-else #selected>
          <div class="text-grey-5">Category</div>
        </template>
      </q-select>
      <q-space />
      <BaseButton variant="primary" icon="add" label="Add Item" @click="openCreate" />
    </div>

    <!-- Items Table -->
    <DataTable
      title="Stock Items"
      :rows="filteredItems"
      :columns="columns"
      :filter="filter"
      :loading="loading"
    >
      <template #body-cell-last_purchase_price="props">
        <q-td :props="props">{{ formatCurrency(props.value) }}</q-td>
      </template>

      <template #body-cell-is_active="props">
        <q-td :props="props">
          <q-badge
            :color="props.value ? 'green' : 'grey'"
            :label="props.value ? 'Active' : 'Inactive'"
          />
        </q-td>
      </template>

      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <!-- Edit item -->
          <q-btn
            flat
            dense
            round
            icon="edit"
            size="sm"
            color="primary"
            @click="openEdit(props.row)"
          >
            <q-tooltip>Edit item</q-tooltip>
          </q-btn>
          <!-- Add stock via GRN -->
          <q-btn
            flat
            dense
            round
            icon="add_circle"
            size="sm"
            color="positive"
            @click="goToGRN(props.row)"
          >
            <q-tooltip>Add stock via GRN</q-tooltip>
          </q-btn>
          <!-- Delete -->
          <q-btn
            flat
            dense
            round
            icon="delete"
            size="sm"
            color="negative"
            @click="confirmDelete(props.row)"
          >
            <q-tooltip>Delete item permanently</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </DataTable>

    <!-- Add/Edit Dialog -->
    <BaseDialog v-model="showDialog" :title="editingItem ? 'Edit Item' : 'Add Item'" size="md">
      <BaseFormSection title="General" description="Basic identification and categorization">
        <div class="row q-col-gutter-md">
          <div class="col-3">
            <BaseInput
              label="Code"
              required
              v-model="form.code"
              :rules="[(v) => !!v || 'Required']"
            />
          </div>
          <div class="col-3">
            <BaseInput label="Barcode" v-model="form.barcode" />
          </div>
          <div class="col-6">
            <BaseInput
              label="Item Name"
              required
              v-model="form.name"
              :rules="[(v) => !!v || 'Required']"
            />
          </div>
        </div>
        <div class="row q-col-gutter-md">
          <div class="col-4">
            <BaseSelect
              label="Item Type"
              v-model="form.item_type"
              :options="itemTypesList"
              required
            >
              <template #after>
                <q-btn
                  flat
                  round
                  dense
                  icon="add"
                  color="primary"
                  @click="showItemTypeDialog = true"
                />
              </template>
            </BaseSelect>
          </div>
          <div class="col-4">
            <BaseSelect
              label="Category"
              v-model="form.category_id"
              :options="categories.map((c) => ({ label: c.name, value: c.id }))"
              emit-value
              map-options
              clearable
            >
              <template #after>
                <q-btn
                  flat
                  round
                  dense
                  icon="add"
                  color="primary"
                  @click="showCategoryDialog = true"
                />
              </template>
            </BaseSelect>
          </div>
          <div class="col-4">
            <BaseSelect
              label="UOM"
              v-model="form.inventory_uom_id"
              :options="uoms.map((u) => ({ label: `${u.code} — ${u.name}`, value: u.id }))"
              required
              emit-value
              map-options
              :rules="[(v) => !!v || 'Required']"
            >
              <template #after>
                <q-btn flat round dense icon="add" color="primary" @click="showUomDialog = true" />
              </template>
            </BaseSelect>
          </div>
        </div>
      </BaseFormSection>

      <BaseFormSection
        title="Procurement & Reordering"
        description="Supplier pricing and minimum stock level. Stock quantity is managed automatically via GRN receipts."
      >
        <div class="row q-col-gutter-md">
          <div class="col-6">
            <BaseInput
              label="Last Purchase Price (LKR)"
              v-model.number="form.last_purchase_price"
              type="number"
              hint="Reference only — cost auto-updates on GRN post"
            />
          </div>
          <div class="col-6">
            <BaseInput
              label="Reorder Level (Min Stock)"
              v-model.number="form.reorder_level"
              type="number"
              hint="Low-stock alert fires below this quantity"
            />
          </div>
        </div>
      </BaseFormSection>

      <template #actions>
        <BaseButton
          label="Cancel"
          variant="secondary"
          @click="showDialog = false"
          class="q-mr-sm"
        />
        <q-btn
          v-if="editingItem"
          flat
          icon="add_circle"
          label="Add Stock (GRN)"
          color="positive"
          class="q-mr-sm"
          @click="
            () => {
              goToGRN(editingItem)
              showDialog = false
            }
          "
        />
        <BaseButton
          :label="editingItem ? 'Update' : 'Save'"
          icon="save"
          variant="primary"
          :loading="saving"
          @click="saveItem"
        />
      </template>
    </BaseDialog>
    <!-- Option Managers -->
    <OptionManagerDialog
      v-model="showItemTypeDialog"
      title="Item Types"
      :items="itemTypesObjects"
      @add="handleAddItemType"
      @delete="handleDeleteItemType"
    />
    <OptionManagerDialog
      v-model="showCategoryDialog"
      title="Categories"
      :items="categories"
      @add="handleCreateCategory"
      @delete="handleDeleteCategory"
    />
    <OptionManagerDialog
      v-model="showUomDialog"
      title="UOMs"
      :items="uoms"
      @add="handleCreateUom"
      @delete="handleDeleteUom"
    />
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useRouter } from 'vue-router'
import DataTable from 'components/common/DataTable.vue'
import BaseDialog from 'components/common/erp/BaseDialog.vue'
import BaseFormSection from 'components/common/erp/BaseFormSection.vue'
import BaseInput from 'components/common/erp/BaseInput.vue'
import BaseSelect from 'components/common/erp/BaseSelect.vue'
import BaseButton from 'components/common/erp/BaseButton.vue'
import OptionManagerDialog from './OptionManagerDialog.vue'
import { useItemsList, useCategoryList, useUomList } from 'src/services/inventoryService'

const $q = useQuasar()
const router = useRouter()
const { items, loading, listItems, createItem, updateItem, deleteItem, generateNextItemCode } =
  useItemsList()
const { categories, listCategories, createCategory, deleteCategory } = useCategoryList()
const { uoms, listUoms, createUom, deleteUom } = useUomList()

const filter = ref('')
const categoryFilter = ref('')
const showDialog = ref(false)
const editingItem = ref(null)
const saving = ref(false)

const defaultItemTypes = ['Finish Good', 'Raw Material', 'Packing Set', 'Servable', 'Non Servable']
const storedTypes = JSON.parse(localStorage.getItem('erp_item_types') || 'null')
const itemTypesList = ref(storedTypes || defaultItemTypes)
const itemTypesObjects = computed(() => itemTypesList.value.map((t) => ({ id: t, name: t })))

const showItemTypeDialog = ref(false)
const showCategoryDialog = ref(false)
const showUomDialog = ref(false)

function handleAddItemType(name) {
  if (!itemTypesList.value.includes(name)) {
    itemTypesList.value.push(name)
    localStorage.setItem('erp_item_types', JSON.stringify(itemTypesList.value))
  }
}
function handleDeleteItemType(item) {
  itemTypesList.value = itemTypesList.value.filter((t) => t !== item.id)
  localStorage.setItem('erp_item_types', JSON.stringify(itemTypesList.value))
}

// handleAddItemType and handleDeleteItemType don't have try-catch blocks
// For categories and UOMs we do

async function handleCreateCategory(name) {
  try {
    const data = await createCategory(name)
    // auto-select if adding from the add item form
    if (form.category_id === null) form.category_id = data.id
  } catch (e) {
    $q.notify({ type: 'negative', message: e?.message || 'Failed to add category' })
  }
}
async function handleDeleteCategory(item) {
  try {
    await deleteCategory(item.id)
    if (form.category_id === item.id) form.category_id = null
    $q.notify({ type: 'positive', message: 'Category deleted' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e?.message || 'Cannot delete category in use.' })
  }
}

async function handleCreateUom(name) {
  try {
    const data = await createUom(name)
    if (form.inventory_uom_id === null) form.inventory_uom_id = data.id
  } catch (e) {
    $q.notify({ type: 'negative', message: e?.message || 'Failed to add UOM' })
  }
}
async function handleDeleteUom(item) {
  try {
    await deleteUom(item.id)
    if (form.inventory_uom_id === item.id) form.inventory_uom_id = null
    $q.notify({ type: 'positive', message: 'UOM deleted' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e?.message || 'Cannot delete UOM in use.' })
  }
}

const emptyForm = {
  code: '',
  barcode: '',
  name: '',
  item_type: 'Raw Material',
  category_id: null,
  inventory_uom_id: null,
  last_purchase_price: 0,
  reorder_level: 0,
}

const form = reactive({ ...emptyForm })

onMounted(() => {
  Promise.all([listItems(), listCategories(), listUoms()])
})

const categoryOptions = computed(() =>
  categories.value.map((c) => ({ label: c.name, value: c.id })),
)

const filteredItems = computed(() => {
  let result = items.value
  if (categoryFilter.value) result = result.filter((i) => i.category_id === categoryFilter.value)
  return result
})

const columns = [
  {
    name: 'code',
    label: 'Code',
    field: 'code',
    align: 'left',
    sortable: true,
    style: 'width: 100px',
  },
  { name: 'name', label: 'Item Name', field: 'name', align: 'left', sortable: true },
  { name: 'item_type', label: 'Type', field: 'item_type', align: 'left', sortable: true },
  {
    name: 'category_name',
    label: 'Category',
    field: 'category_name',
    align: 'left',
    sortable: true,
  },
  { name: 'uom_code', label: 'UOM', field: 'uom_code', align: 'center', style: 'width: 70px' },

  {
    name: 'last_purchase_price',
    label: 'Last Price',
    field: 'last_purchase_price',
    align: 'right',
    sortable: true,
  },
  { name: 'reorder_level', label: 'Min Stock', field: 'reorder_level', align: 'center' },
  { name: 'is_active', label: 'Status', field: 'is_active', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center', style: 'width: 130px' },
]

async function openCreate() {
  editingItem.value = null
  Object.assign(form, emptyForm)
  showDialog.value = true
  try {
    const nextCode = await generateNextItemCode()
    if (nextCode) form.code = nextCode
  } catch (e) {
    console.error('Auto-gen code error:', e)
  }
}

function openEdit(row) {
  editingItem.value = row
  Object.assign(form, {
    code: row.code,
    barcode: row.barcode,
    name: row.name,
    item_type: row.item_type || 'Raw Material',
    category_id: row.category_id,
    inventory_uom_id: row.inventory_uom_id,
    last_purchase_price: row.last_purchase_price,
    reorder_level: row.reorder_level,
  })
  showDialog.value = true
}

/**
 * Navigate to a new GRN document pre-filled with this item.
 * Uses query params: ?newDoc=GRN&item_id=UUID
 */
function goToGRN(row) {
  router.push({
    path: '/inventory',
    query: {
      tab: 'documents',
      newDoc: 'GRN',
      item_id: row.id,
    },
  })
}

async function saveItem() {
  if (!form.code || !form.name || !form.inventory_uom_id) {
    $q.notify({ type: 'warning', message: 'Code, Name, and UOM are required.' })
    return
  }
  saving.value = true
  try {
    // Build payload without avg_cost (it's managed by the GRN trigger)
    const payload = {
      code: form.code,
      barcode: form.barcode,
      name: form.name,
      item_type: form.item_type,
      category_id: form.category_id,
      inventory_uom_id: form.inventory_uom_id,
      last_purchase_price: form.last_purchase_price || 0,
      reorder_level: form.reorder_level || 0,
    }
    if (editingItem.value) {
      await updateItem(editingItem.value.id, payload)
      $q.notify({ type: 'positive', message: 'Item updated!' })
    } else {
      await createItem({ ...payload, is_active: true })
      $q.notify({ type: 'positive', message: 'Item created!' })
    }
    showDialog.value = false
    // Refresh to get full joined data (category_name, uom_code, etc.)
    await listItems()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'Failed to save item.' })
  } finally {
    saving.value = false
  }
}

function confirmDelete(row) {
  $q.dialog({
    title: 'Delete Item Permanently',
    message: `Are you sure you want to permanently delete "${row.name}"? This will remove all stock records, ledger entries, and related data. This action cannot be undone.`,
    cancel: { label: 'Cancel', flat: true },
    persistent: true,
    dark: true,
    color: 'negative',
    ok: { label: 'Delete', color: 'negative', flat: true },
  }).onOk(async () => {
    try {
      await deleteItem(row.id)
      $q.notify({ type: 'positive', message: `"${row.name}" deleted successfully.` })
    } catch (e) {
      $q.notify({
        type: 'negative',
        message: e.message || 'Failed to delete item. It may be linked to historical data.',
        timeout: 5000,
      })
    }
  })
}

function formatCurrency(val) {
  return 'LKR ' + Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })
}
defineExpose({
  columns,
  rows: filteredItems,
})
</script>
