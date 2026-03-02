<template>
  <div class="q-pa-md">
    <!-- Toolbar -->
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-input
        dark
        outlined
        dense
        v-model="filter"
        placeholder="Search items..."
        style="min-width: 250px"
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
      <q-select
        dark
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
      <template #body-cell-avg_cost="props">
        <q-td :props="props">
          <span class="text-weight-bold">{{ formatCurrency(props.value) }}</span>
        </q-td>
      </template>

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
          <q-btn
            flat
            dense
            round
            icon="delete"
            size="sm"
            color="negative"
            @click="deactivate(props.row)"
          >
            <q-tooltip>Deactivate item</q-tooltip>
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
              :options="['Finish Good', 'Raw Material', 'Packing Set', 'Servable', 'Non Servable']"
              required
            />
          </div>
          <div class="col-6">
            <BaseSelect
              label="Category"
              v-model="form.category_id"
              :options="categories.map((c) => ({ label: c.name, value: c.id }))"
              emit-value
              map-options
              clearable
            />
          </div>
          <div class="col-6">
            <BaseSelect
              label="UOM"
              v-model="form.inventory_uom_id"
              :options="uoms.map((u) => ({ label: `${u.code} — ${u.name}`, value: u.id }))"
              required
              emit-value
              map-options
              :rules="[(v) => !!v || 'Required']"
            />
          </div>
        </div>
      </BaseFormSection>

      <BaseFormSection
        title="Pricing & Reordering"
        description="Costing and stock management parameters"
      >
        <div class="row q-col-gutter-md">
          <div class="col-4">
            <BaseInput label="Avg Cost" v-model.number="form.avg_cost" type="number" />
          </div>
          <div class="col-4">
            <BaseInput label="Reorder Level" v-model.number="form.reorder_level" type="number" />
          </div>
          <div class="col-4">
            <BaseInput label="Last Price" v-model.number="form.last_purchase_price" type="number" />
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
        <BaseButton
          :label="editingItem ? 'Update' : 'Save'"
          icon="save"
          variant="primary"
          :loading="saving"
          @click="saveItem"
        />
      </template>
    </BaseDialog>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import DataTable from 'components/common/DataTable.vue'
import BaseDialog from 'components/common/erp/BaseDialog.vue'
import BaseFormSection from 'components/common/erp/BaseFormSection.vue'
import BaseInput from 'components/common/erp/BaseInput.vue'
import BaseSelect from 'components/common/erp/BaseSelect.vue'
import BaseButton from 'components/common/erp/BaseButton.vue'
import { useItemsList, useCategoryList, useUomList } from 'src/services/inventoryService'

const $q = useQuasar()
const { items, loading, listItems, createItem, updateItem, deactivateItem, generateNextItemCode } =
  useItemsList()
const { categories, listCategories } = useCategoryList()
const { uoms, listUoms } = useUomList()

const filter = ref('')
const categoryFilter = ref('')
const showDialog = ref(false)
const editingItem = ref(null)
const saving = ref(false)

const emptyForm = {
  code: '',
  barcode: '',
  name: '',
  item_type: 'Raw Material',
  category_id: null,
  inventory_uom_id: null,
  avg_cost: 0,
  reorder_level: 0,
  last_purchase_price: 0,
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
  { name: 'barcode', label: 'Barcode', field: 'barcode', align: 'left', sortable: true },
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
  { name: 'avg_cost', label: 'Avg Cost', field: 'avg_cost', align: 'right', sortable: true },
  {
    name: 'last_purchase_price',
    label: 'Last Price',
    field: 'last_purchase_price',
    align: 'right',
    sortable: true,
  },
  { name: 'reorder_level', label: 'Reorder Lvl', field: 'reorder_level', align: 'center' },
  { name: 'is_active', label: 'Status', field: 'is_active', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' },
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
    avg_cost: row.avg_cost,
    reorder_level: row.reorder_level,
    last_purchase_price: row.last_purchase_price,
  })
  showDialog.value = true
}

async function saveItem() {
  if (!form.code || !form.name || !form.inventory_uom_id) {
    $q.notify({ type: 'warning', message: 'Code, Name, and UOM are required.' })
    return
  }
  saving.value = true
  try {
    if (editingItem.value) {
      await updateItem(editingItem.value.id, { ...form })
      $q.notify({ type: 'positive', message: 'Item updated!' })
    } else {
      await createItem({ ...form, is_active: true })
      $q.notify({ type: 'positive', message: 'Item created!' })
    }
    showDialog.value = false
    // Refresh to get full joined data
    await listItems()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'Failed to save item.' })
  } finally {
    saving.value = false
  }
}

async function deactivate(row) {
  try {
    await deactivateItem(row.id)
    $q.notify({ type: 'info', message: `${row.name} deactivated.` })
    await listItems()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'Failed to deactivate.' })
  }
}

function formatCurrency(val) {
  return 'LKR ' + Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })
}
defineExpose({
  columns,
  rows: filteredItems,
})
</script>
