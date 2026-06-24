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
          :options="categoryOptions"
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
                v-model="form.category"
                :options="categoryOptions"
                label="Category *"
                outlined
                dense
                emit-value
                map-options
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
              <q-input
                v-model="form.uom"
                label="Unit of Measure *"
                outlined
                dense
                hint="e.g. kg, litre, pcs"
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
                v-model.number="form.cost_per_unit"
                label="Cost / Unit"
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
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()

// ── State ─────────────────────────────────────────────────────────────────────
const loading = ref(false)
const saving  = ref(false)
const items   = ref([])

const search         = ref('')
const categoryFilter = ref(null)
const dialogOpen     = ref(false)
const isEdit         = ref(false)

const emptyForm = () => ({
  id:            null,
  code:          '',
  name:          '',
  category:      '',
  uom:           '',
  reorder_level: 0,
  cost_per_unit: 0,
  is_active:     true,
})
const form = ref(emptyForm())

// ── Constants ─────────────────────────────────────────────────────────────────
const categoryOptions = [
  { label: 'Raw Material',    value: 'Raw Material' },
  { label: 'Finished Goods',  value: 'Finished Goods' },
  { label: 'Consumable',      value: 'Consumable' },
  { label: 'Asset',           value: 'Asset' },
]

const columns = [
  { name: 'code',          label: 'Code',          field: 'code',          align: 'left',  sortable: true },
  { name: 'name',          label: 'Name',          field: 'name',          align: 'left',  sortable: true },
  { name: 'category',      label: 'Category',      field: 'category',      align: 'left',  sortable: true },
  { name: 'uom',           label: 'UOM',           field: 'uom',           align: 'center', sortable: true },
  { name: 'reorder_level', label: 'Reorder Level', field: 'reorder_level', align: 'right',  sortable: true,
    format: v => Number(v || 0).toFixed(2) },
  { name: 'cost_per_unit', label: 'Cost / Unit',   field: 'cost_per_unit', align: 'right',  sortable: true,
    format: v => `LKR ${Number(v || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}` },
  { name: 'is_active',     label: 'Active',        field: 'is_active',     align: 'center' },
  { name: 'actions',       label: '',              field: 'actions',       align: 'center' },
]

// ── Computed ──────────────────────────────────────────────────────────────────
const filteredItems = computed(() => {
  let list = items.value
  if (categoryFilter.value) {
    list = list.filter(i => i.category === categoryFilter.value)
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

// ── Data loading ──────────────────────────────────────────────────────────────
async function fetchItems() {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .eq('company_id', authStore.companyId)
      .eq('branch_id',  authStore.branchId)
      .order('name')

    if (error) throw error
    items.value = data || []
  } catch (e) {
    console.error('[ItemsPage] fetchItems', e)
    $q.notify({ type: 'negative', message: 'Failed to load items: ' + e.message })
  } finally {
    loading.value = false
  }
}

// ── Dialog helpers ────────────────────────────────────────────────────────────
function openAddDialog() {
  isEdit.value    = false
  form.value      = emptyForm()
  dialogOpen.value = true
}

function openEditDialog(row) {
  isEdit.value   = true
  form.value     = { ...row }
  dialogOpen.value = true
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function saveItem() {
  if (!form.value.code || !form.value.name || !form.value.category || !form.value.uom) {
    $q.notify({ type: 'warning', message: 'Please fill in all required fields.' })
    return
  }

  saving.value = true
  try {
    const payload = {
      code:          form.value.code.trim(),
      name:          form.value.name.trim(),
      category:      form.value.category,
      uom:           form.value.uom.trim(),
      reorder_level: Number(form.value.reorder_level) || 0,
      cost_per_unit: Number(form.value.cost_per_unit) || 0,
      is_active:     form.value.is_active,
      company_id:    authStore.companyId,
      branch_id:     authStore.branchId,
    }

    if (isEdit.value) {
      const { error } = await supabase
        .from('ingredients')
        .update(payload)
        .eq('id', form.value.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Item updated successfully.' })
    } else {
      const { error } = await supabase
        .from('ingredients')
        .insert(payload)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Item added successfully.' })
    }

    dialogOpen.value = false
    await fetchItems()
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
    const { error } = await supabase
      .from('ingredients')
      .update({ is_active: !row.is_active })
      .eq('id', row.id)
    if (error) throw error
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
      const { error } = await supabase
        .from('ingredients')
        .delete()
        .eq('id', row.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Item deleted.' })
      await fetchItems()
    } catch (e) {
      $q.notify({ type: 'negative', message: 'Delete failed: ' + e.message })
    }
  })
}

onMounted(fetchItems)
</script>
