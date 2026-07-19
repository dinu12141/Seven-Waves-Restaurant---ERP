<template>
  <q-page class="q-pa-md">
    <ErpPageHeader
      title="Item Master"
      subtitle="Manage ingredients and inventory items"
      icon="inventory_2"
      :breadcrumbs="[{ label: 'Inventory' }, { label: 'Item Master' }]"
    >
      <template #actions>
        <q-btn
          unelevated
          no-caps
          icon="add"
          label="Add Item"
          color="primary"
          @click="openAddDialog"
        />
      </template>
    </ErpPageHeader>

    <!-- Filters row -->
    <div class="row q-col-gutter-sm q-mb-md">
      <div class="col-12 col-sm-6 col-md-4">
        <q-input
          v-model="search"
          dense
          outlined
          clearable
          placeholder="Search by name or code…"
          debounce="300"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-select
          v-model="categoryFilter"
          :options="categorySelectOpts"
          dense
          outlined
          clearable
          label="Category"
          emit-value
          map-options
        />
      </div>
    </div>

    <!-- Data table -->
    <q-table
      flat
      bordered
      class="erp-table"
      :rows="filteredItems"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :pagination="{ rowsPerPage: 20 }"
      binary-state-sort
    >
      <template #loading>
        <q-inner-loading showing color="primary" />
      </template>

      <template #body-cell-is_active="props">
        <q-td :props="props">
          <q-toggle
            :model-value="props.row.is_active"
            color="positive"
            dense
            @update:model-value="toggleActive(props.row)"
          />
        </q-td>
      </template>

      <template #body-cell-actions="props">
        <q-td :props="props" auto-width>
          <q-btn
            flat dense round icon="edit" color="primary" size="sm"
            aria-label="Edit item"
            @click="openEditDialog(props.row)"
          >
            <q-tooltip>Edit</q-tooltip>
          </q-btn>
          <q-btn
            flat dense round icon="delete" color="negative" size="sm"
            aria-label="Delete item"
            @click="confirmDelete(props.row)"
          >
            <q-tooltip>Delete</q-tooltip>
          </q-btn>
        </q-td>
      </template>

      <template #no-data>
        <div class="full-width text-center q-pa-lg text-grey-5">
          <q-icon name="inventory_2" size="48px" class="q-mb-sm" />
          <div>No items found</div>
        </div>
      </template>
    </q-table>

    <!-- Add / Edit Dialog -->
    <q-dialog v-model="dialogOpen" persistent transition-show="scale" transition-hide="fade">
      <q-card style="min-width: 480px; max-width: 560px">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">{{ isEdit ? 'Edit Item' : 'Add Item' }}</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pt-md">
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-input
                v-model="form.code"
                label="Item Code *"
                outlined
                dense
                :rules="[v => !!v || 'Required']"
              />
            </div>
            <div class="col-6">
              <q-select
                v-model="form.category_id"
                :options="categorySelectOpts"
                label="Category *"
                outlined
                dense
                emit-value
                map-options
                :loading="categoriesLoading"
                :rules="[v => !!v || 'Required']"
              />
            </div>
            <div class="col-12">
              <q-input
                v-model="form.name"
                label="Item Name *"
                outlined
                dense
                :rules="[v => !!v || 'Required']"
              />
            </div>
            <div class="col-6">
              <q-select
                v-model="form.inventory_uom_id"
                :options="uomSelectOpts"
                label="Unit of Measure *"
                outlined
                dense
                emit-value
                map-options
                :loading="uomsLoading"
                :rules="[v => !!v || 'Required']"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model.number="form.reorder_level"
                label="Reorder Level"
                type="number"
                outlined
                dense
                min="0"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model.number="form.avg_cost"
                label="Avg Cost / Unit"
                type="number"
                outlined
                dense
                min="0"
                step="0.01"
              />
            </div>
            <div class="col-6 flex items-center">
              <q-toggle v-model="form.is_active" label="Active" color="positive" />
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat no-caps label="Cancel" v-close-popup />
          <q-btn
            unelevated no-caps
            :label="isEdit ? 'Save Changes' : 'Add Item'"
            color="primary"
            :loading="saving"
            @click="saveItem"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import ErpPageHeader from 'components/common/ErpPageHeader.vue'
import {
  useItemsList,
  useCategoryList,
  useUomList,
} from 'src/services/inventoryService'

const $q = useQuasar()

// ── Service composables ───────────────────────────────────────────────────────
const { items, loading, listItems, createItem, updateItem, deleteItem } = useItemsList()
const { categories, loading: categoriesLoading, listCategories } = useCategoryList()
const { uoms, loading: uomsLoading, listUoms } = useUomList()

// ── State ─────────────────────────────────────────────────────────────────────
const search         = ref('')
const categoryFilter = ref(null)
const dialogOpen     = ref(false)
const isEdit         = ref(false)
const saving         = ref(false)

const emptyForm = () => ({
  id:               null,
  code:             '',
  name:             '',
  category_id:      null,
  inventory_uom_id: null,
  reorder_level:    0,
  avg_cost:         0,
  is_active:        true,
})
const form = ref(emptyForm())

// ── Derived options ───────────────────────────────────────────────────────────
const categorySelectOpts = computed(() =>
  categories.value.map(c => ({ label: c.name, value: c.id }))
)

const uomSelectOpts = computed(() =>
  uoms.value.map(u => ({
    label: u.name && u.name !== u.code ? `${u.code} — ${u.name}` : u.code,
    value: u.id,
  }))
)

// ── Table columns ─────────────────────────────────────────────────────────────
const columns = [
  { name: 'code',          label: 'Code',            field: 'code',          align: 'left',   sortable: true },
  { name: 'name',          label: 'Name',            field: 'name',          align: 'left',   sortable: true },
  { name: 'category_name', label: 'Category',        field: 'category_name', align: 'left',   sortable: true },
  { name: 'uom_code',      label: 'UOM',             field: 'uom_code',      align: 'center', sortable: true },
  { name: 'reorder_level', label: 'Reorder Level',   field: 'reorder_level', align: 'right',  sortable: true,
    format: v => Number(v || 0).toFixed(2) },
  { name: 'avg_cost',      label: 'Avg Cost / Unit', field: 'avg_cost',      align: 'right',  sortable: true,
    format: v => `LKR ${Number(v || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}` },
  { name: 'is_active',     label: 'Active',          field: 'is_active',     align: 'center' },
  { name: 'actions',       label: '',                field: 'actions',       align: 'center' },
]

// ── Computed ──────────────────────────────────────────────────────────────────
const filteredItems = computed(() => {
  let list = items.value
  if (categoryFilter.value) {
    list = list.filter(i => i.category_id === categoryFilter.value)
  }
  if (search.value?.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(i =>
      i.name?.toLowerCase().includes(q) ||
      i.code?.toLowerCase().includes(q)
    )
  }
  return list
})

// ── Dialog helpers ────────────────────────────────────────────────────────────
function openAddDialog() {
  isEdit.value     = false
  form.value       = emptyForm()
  dialogOpen.value = true
}

function openEditDialog(row) {
  isEdit.value = true
  form.value = {
    id:               row.id,
    code:             row.code,
    name:             row.name,
    category_id:      row.category_id,
    inventory_uom_id: row.inventory_uom_id,
    reorder_level:    row.reorder_level || 0,
    avg_cost:         row.avg_cost || 0,
    is_active:        row.is_active,
  }
  dialogOpen.value = true
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function saveItem() {
  if (!form.value.code || !form.value.name || !form.value.category_id || !form.value.inventory_uom_id) {
    $q.notify({ type: 'warning', message: 'Please fill in all required fields.' })
    return
  }

  saving.value = true
  try {
    const payload = {
      code:             form.value.code.trim(),
      name:             form.value.name.trim(),
      category_id:      form.value.category_id,
      inventory_uom_id: form.value.inventory_uom_id,
      reorder_level:    Number(form.value.reorder_level) || 0,
      avg_cost:         Number(form.value.avg_cost) || 0,
      is_active:        form.value.is_active,
    }

    if (isEdit.value) {
      await updateItem(form.value.id, payload)
      $q.notify({ type: 'positive', message: 'Item updated successfully.' })
    } else {
      await createItem(payload)
      $q.notify({ type: 'positive', message: 'Item added successfully.' })
    }

    dialogOpen.value = false
    await listItems()
  } catch (e) {
    console.error('[ItemsPage] saveItem', e)
    $q.notify({ type: 'negative', message: 'Save failed: ' + e.message })
  } finally {
    saving.value = false
  }
}

// ── Toggle active ─────────────────────────────────────────────────────────────
async function toggleActive(row) {
  try {
    await updateItem(row.id, { is_active: !row.is_active })
    row.is_active = !row.is_active
    $q.notify({ type: 'positive', message: `Item ${row.is_active ? 'activated' : 'deactivated'}.` })
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Update failed: ' + e.message })
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
function confirmDelete(row) {
  $q.dialog({
    title:   'Confirm Delete',
    message: `Delete item "${row.name}"? This cannot be undone.`,
    cancel:  true,
    ok:      { color: 'negative', label: 'Delete', unelevated: true },
  }).onOk(async () => {
    try {
      await deleteItem(row.id)
      $q.notify({ type: 'positive', message: 'Item deleted.' })
    } catch (e) {
      $q.notify({ type: 'negative', message: 'Delete failed: ' + e.message })
    }
  })
}

onMounted(async () => {
  await Promise.all([listItems(), listCategories(), listUoms()])
})
</script>
