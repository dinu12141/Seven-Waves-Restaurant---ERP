<template>
  <div class="q-pa-md">
    <!-- Toolbar -->
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-input
        dark
        outlined
        dense
        v-model="filter"
        placeholder="Search menu items..."
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
        @update:model-value="subCategoryFilter = null"
      >
        <template v-if="categoryFilter" #selected>
          {{ categoryOptions.find((o) => o.value === categoryFilter)?.label || 'Category' }}
        </template>
        <template v-else #selected>
          <div class="text-grey-5">Category</div>
        </template>
      </q-select>

      <q-select
        dark
        outlined
        dense
        v-model="subCategoryFilter"
        :options="filterSubCategoryOptions"
        display-value="Sub Category"
        emit-value
        map-options
        clearable
        :disable="!categoryFilter"
        style="min-width: 180px"
      >
        <template v-if="subCategoryFilter" #selected>
          {{
            filterSubCategoryOptions.find((o) => o.value === subCategoryFilter)?.label ||
            'Sub Category'
          }}
        </template>
        <template v-else-if="!categoryFilter" #selected>
          <div class="text-grey-7">Select Category</div>
        </template>
        <template v-else #selected>
          <div class="text-grey-5">Sub Category</div>
        </template>
      </q-select>
      <q-space />
      <q-btn
        color="primary"
        class="erp-btn-primary"
        icon="add"
        label="Add Menu Item"
        @click="openCreate"
      />
    </div>

    <!-- DataGrid -->
    <DataTable
      title="Menu Master"
      :rows="filteredItems"
      :columns="columns"
      :filter="filter"
      :loading="loading"
    >
      <template #body-cell-base_price="props">
        <q-td :props="props">
          <span class="text-weight-bold">{{ formatCurrency(props.value) }}</span>
        </q-td>
      </template>

      <template #body-cell-is_available="props">
        <q-td :props="props">
          <q-badge
            :color="props.value ? 'green' : 'grey'"
            :label="props.value ? 'Available' : 'Unavailable'"
          />
        </q-td>
      </template>

      <template #body-cell-tags="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-badge v-if="props.row.is_veg" color="green" label="Veg" />
          <q-badge v-if="props.row.is_spicy" color="red" label="Spicy" />
          <q-badge
            v-if="props.row.is_best_seller"
            color="amber"
            text-color="black"
            label="Best Seller"
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
            <q-tooltip>Edit Menu Item</q-tooltip>
          </q-btn>
          <q-btn
            flat
            dense
            round
            icon="delete"
            size="sm"
            color="negative"
            @click="deleteItem(props.row)"
          >
            <q-tooltip>Delete Menu Item</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </DataTable>

    <!-- Add/Edit Form Dialog using ERPFormCard -->
    <q-dialog v-model="showDialog" persistent full-height position="right">
      <div
        style="width: 500px; max-width: 100vw; height: 100vh; background-color: var(--erp-bg-main)"
      >
        <q-scroll-area class="fit">
          <div class="q-pa-lg">
            <ERPFormCard
              :title="form.id ? 'Edit Menu Item' : 'Add Menu Item'"
              :subtitle="
                form.id
                  ? `Editing Item #${form.id.slice(0, 8)}`
                  : 'Create a new menu item in the catalog'
              "
              :loading="saving"
              submit-label="Save Item"
              @submit="saveItem"
              @cancel="showDialog = false"
              ref="erpForm"
            >
              <ERPFormSection title="General Information" collapsible>
                <div class="row q-col-gutter-md">
                  <div class="col-8">
                    <ERPFormField label="Item Name" required :error="vErrors.name">
                      <q-input
                        v-model="form.name"
                        dark
                        dense
                        outlined
                        placeholder="Enter item name"
                        @update:model-value="vErrors.name = ''"
                      />
                    </ERPFormField>
                  </div>
                  <div class="col-4">
                    <ERPFormField label="Base Price" required :error="vErrors.base_price">
                      <q-input
                        v-model.number="form.base_price"
                        type="number"
                        dark
                        dense
                        outlined
                        placeholder="0.00"
                        prefix="LKR"
                        @update:model-value="vErrors.base_price = ''"
                      />
                    </ERPFormField>
                  </div>
                </div>
                <div class="row q-col-gutter-md">
                  <div class="col-12">
                    <ERPFormField
                      label="Description"
                      helper="Displayed to customers ordering online"
                    >
                      <q-input v-model="form.description" dark type="textarea" outlined autogrow />
                    </ERPFormField>
                  </div>
                </div>
              </ERPFormSection>

              <ERPFormSection title="Classification" collapsible>
                <div class="row q-col-gutter-md">
                  <div class="col-6">
                    <ERPFormField label="Category" required :error="vErrors.category_id">
                      <q-select
                        v-model="form.category_id"
                        dark
                        :options="categoryOptions"
                        emit-value
                        map-options
                        outlined
                        dense
                        placeholder="Select..."
                        @update:model-value="onCategoryChange"
                      />
                    </ERPFormField>
                  </div>
                  <div class="col-6">
                    <ERPFormField
                      label="Sub Category"
                      :helper="!form.category_id ? 'Select a category first' : ''"
                    >
                      <q-select
                        v-model="form.sub_category_id"
                        dark
                        :options="subCategoryOptions"
                        emit-value
                        map-options
                        outlined
                        dense
                        clearable
                        :disable="!form.category_id"
                        placeholder="Select..."
                      />
                    </ERPFormField>
                  </div>
                  <div class="col-6">
                    <ERPFormField label="Routing Kitchen" helper="Where KOTs are dispatched">
                      <q-select
                        v-model="form.kitchen_id"
                        dark
                        :options="kitchenOptions"
                        emit-value
                        map-options
                        outlined
                        dense
                        clearable
                        placeholder="Select..."
                      />
                    </ERPFormField>
                  </div>
                </div>
              </ERPFormSection>

              <ERPFormSection title="Attributes & Flags" collapsible>
                <ERPStyledToggle label="Available for Sale" v-model="form.is_available" />
                <ERPStyledToggle label="Vegetarian" v-model="form.is_veg" />
                <ERPStyledToggle label="Spicy" v-model="form.is_spicy" />
                <ERPStyledToggle label="Best Seller" v-model="form.is_best_seller" />
              </ERPFormSection>
            </ERPFormCard>
          </div>
        </q-scroll-area>
      </div>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'boot/supabase'
import { useAuthStore } from 'stores/auth'
import DataTable from 'components/common/DataTable.vue'
import ERPFormCard from 'components/erp/ERPFormCard.vue'
import ERPFormSection from 'components/erp/ERPFormSection.vue'
import ERPFormField from 'components/erp/ERPFormField.vue'
import ERPStyledToggle from 'components/erp/ERPStyledToggle.vue'

const $q = useQuasar()
const authStore = useAuthStore()

const loading = ref(false)
const showDialog = ref(false)
const saving = ref(false)
const filter = ref('')
const categoryFilter = ref(null)
const subCategoryFilter = ref(null)

const erpForm = ref(null)

const menuItems = ref([])
const categories = ref([])
const kitchens = ref([])
const allSubCategories = ref([])

const emptyForm = {
  id: null,
  name: '',
  description: '',
  base_price: 0,
  category_id: null,
  sub_category_id: null,
  kitchen_id: null,
  is_available: true,
  is_veg: false,
  is_spicy: false,
  is_best_seller: false,
}

const form = reactive({ ...emptyForm })
const vErrors = reactive({ name: '', base_price: '', category_id: '' })

const columns = [
  { name: 'name', label: 'Item Name', field: 'name', align: 'left', sortable: true },
  {
    name: 'category_name',
    label: 'Category',
    field: 'category_name',
    align: 'left',
    sortable: true,
  },
  {
    name: 'sub_category_name',
    label: 'Sub Category',
    field: 'sub_category_name',
    align: 'left',
    sortable: true,
  },
  { name: 'kitchen_name', label: 'Kitchen', field: 'kitchen_name', align: 'left', sortable: true },
  { name: 'base_price', label: 'Price', field: 'base_price', align: 'right', sortable: true },
  { name: 'tags', label: 'Tags', field: 'tags', align: 'center' },
  { name: 'is_available', label: 'Status', field: 'is_available', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' },
]

onMounted(() => {
  fetchData()
})

const categoryOptions = computed(() =>
  categories.value.map((c) => ({ label: c.name, value: c.id })),
)

const subCategoryOptions = computed(() => {
  if (!form.category_id) return []
  return allSubCategories.value
    .filter((s) => String(s.category_id) === String(form.category_id))
    .map((s) => ({ label: s.name, value: s.id }))
})

const filterSubCategoryOptions = computed(() => {
  if (!categoryFilter.value) return []
  return allSubCategories.value
    .filter((s) => String(s.category_id) === String(categoryFilter.value))
    .map((s) => ({ label: s.name, value: s.id }))
})

const kitchenOptions = computed(() => kitchens.value.map((k) => ({ label: k.name, value: k.id })))

const filteredItems = computed(() => {
  let result = menuItems.value
  if (categoryFilter.value) {
    result = result.filter((i) => String(i.category_id) === String(categoryFilter.value))
  }
  if (subCategoryFilter.value) {
    result = result.filter((i) => String(i.sub_category_id) === String(subCategoryFilter.value))
  }
  return result
})

async function fetchData() {
  loading.value = true
  try {
    const { data: catData } = await supabase
      .from('categories')
      .select('id, name')
      .order('sort_order')
    categories.value = catData || []

    const { data: subData, error: subError } = await supabase
      .from('menu_sub_categories')
      .select('id, name, category_id')
      .order('sort_order')
    if (subError) throw subError
    allSubCategories.value = subData || []

    const { data: kitData } = await supabase.from('kitchens').select('id, name').order('name')
    kitchens.value = kitData || []

    const { data: menuData, error } = await supabase
      .from('menu_items')
      .select(
        `id, company_id, category_id, sub_category_id, kitchen_id, name, description, image_url, base_price, preparation_time_minutes, is_available, sort_order, categories(name), menu_sub_categories(name), kitchens(name)`,
      )
      .order('name')

    if (error) throw error

    menuItems.value = (menuData || []).map((item) => ({
      ...item,
      category_name: item.categories?.name || 'Uncategorized',
      sub_category_name: item.menu_sub_categories?.name || '-',
      kitchen_name: item.kitchens?.name || 'Unassigned',
    }))
  } catch (err) {
    console.error(err)
    $q.notify({ type: 'negative', message: 'Failed to load data' })
  } finally {
    loading.value = false
  }
}

function clearErrors() {
  vErrors.name = ''
  vErrors.base_price = ''
  vErrors.category_id = ''
}

function onCategoryChange() {
  vErrors.category_id = ''
  form.sub_category_id = null // Reset sub-category when parent category changes
}

function openCreate() {
  Object.assign(form, emptyForm)
  clearErrors()
  showDialog.value = true
}

function openEdit(row) {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    description: row.description || '',
    base_price: row.base_price || 0,
    category_id: row.category_id,
    sub_category_id: row.sub_category_id,
    kitchen_id: row.kitchen_id,
    is_available: row.is_available,
    is_veg: row.is_veg,
    is_spicy: row.is_spicy,
    is_best_seller: row.is_best_seller,
  })
  clearErrors()
  showDialog.value = true
}

function validateForm() {
  let isValid = true
  clearErrors()

  if (!form.name || form.name.trim() === '') {
    vErrors.name = 'Item Name is required'
    isValid = false
  }

  if (form.base_price === null || form.base_price < 0) {
    vErrors.base_price = 'Invalid price'
    isValid = false
  }

  if (!form.category_id) {
    vErrors.category_id = 'Category is required'
    isValid = false
  }

  return isValid
}

async function saveItem() {
  if (!validateForm()) {
    erpForm.value?.validationError()
    return
  }

  saving.value = true
  try {
    const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'
    const payload = {
      company_id: companyId,
      name: form.name.trim(),
      description: form.description,
      base_price: form.base_price,
      category_id: form.category_id,
      sub_category_id: form.sub_category_id || null,
      kitchen_id: form.kitchen_id || null,
      is_available: form.is_available,
    }

    if (form.id) {
      const { error } = await supabase.from('menu_items').update(payload).eq('id', form.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Menu Item updated!' })
    } else {
      const { error } = await supabase.from('menu_items').insert([payload])
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Menu Item created!' })
    }

    showDialog.value = false
    await fetchData()
  } catch (err) {
    console.error(err)
    $q.notify({ type: 'negative', message: err.message || 'Error saving menu item' })
  } finally {
    saving.value = false
  }
}

async function deleteItem(row) {
  $q.dialog({
    title: 'Confirm Deletion',
    message: `Are you sure you want to delete "${row.name}"? This action cannot be undone.`,
    cancel: true,
    persistent: true,
    dark: true,
    color: 'negative',
  }).onOk(async () => {
    try {
      const { error } = await supabase.from('menu_items').delete().eq('id', row.id)
      if (error) throw error

      $q.notify({ type: 'positive', message: 'Menu item deleted' })
      fetchData()
    } catch {
      $q.notify({
        type: 'negative',
        message: 'Cannot delete item. It may be linked to existing order history or recipes.',
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
