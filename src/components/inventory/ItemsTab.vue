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
        label="Category"
        emit-value
        map-options
        clearable
        style="min-width: 180px"
      />
      <q-space />
      <q-btn color="primary" icon="add" label="Add Item" @click="openCreate" />
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
    <q-dialog v-model="showDialog" persistent>
      <q-card class="bg-grey-9 text-white" style="min-width: 550px">
        <q-card-section class="row items-center">
          <div class="text-h6">{{ editingItem ? 'Edit Item' : 'Add Item' }}</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-separator dark />
        <q-card-section class="q-gutter-md">
          <div class="row q-col-gutter-md">
            <div class="col-4">
              <q-input
                dark
                outlined
                v-model="form.code"
                label="Code"
                :rules="[(v) => !!v || 'Required']"
              />
            </div>
            <div class="col-8">
              <q-input
                dark
                outlined
                v-model="form.name"
                label="Item Name"
                :rules="[(v) => !!v || 'Required']"
              />
            </div>
          </div>
          <div class="row q-col-gutter-md">
            <div class="col-6">
              <q-select
                dark
                outlined
                v-model="form.category_id"
                :options="categories.map((c) => ({ label: c.name, value: c.id }))"
                label="Category"
                emit-value
                map-options
                clearable
              />
            </div>
            <div class="col-6">
              <q-select
                dark
                outlined
                v-model="form.inventory_uom_id"
                :options="uoms.map((u) => ({ label: `${u.code} — ${u.name}`, value: u.id }))"
                label="UOM"
                emit-value
                map-options
                :rules="[(v) => !!v || 'Required']"
              />
            </div>
          </div>
          <div class="row q-col-gutter-md">
            <div class="col-4">
              <q-input
                dark
                outlined
                v-model.number="form.avg_cost"
                label="Avg Cost"
                type="number"
              />
            </div>
            <div class="col-4">
              <q-input
                dark
                outlined
                v-model.number="form.reorder_level"
                label="Reorder Lvl"
                type="number"
              />
            </div>
            <div class="col-4">
              <q-input
                dark
                outlined
                v-model.number="form.last_purchase_price"
                label="Last Price"
                type="number"
              />
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn
            color="primary"
            :label="editingItem ? 'Update' : 'Save'"
            icon="save"
            :loading="saving"
            @click="saveItem"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import DataTable from 'components/common/DataTable.vue'
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
  name: '',
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
  { name: 'name', label: 'Item Name', field: 'name', align: 'left', sortable: true },
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
    name: row.name,
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
</script>
