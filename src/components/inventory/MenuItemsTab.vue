<template>
  <div class="q-pa-md">
    <!-- Toolbar -->
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-input
        :dark="$q.dark.isActive"
        outlined
        dense
        v-model="filter"
        placeholder="Search menu items..."
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
        :dark="$q.dark.isActive"
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
      :title="'Menu Master (' + filteredItems.length + ' items)'"
      :rows="filteredItems"
      :columns="columns"
      :filter="filter"
      :loading="loading"
    >
      <template #body-cell-image="props">
        <q-td :props="props">
          <q-avatar size="40px" rounded bg-color="grey-9">
            <img v-if="props.row.image_url" :src="props.row.image_url" />
            <q-icon v-else name="restaurant" color="grey-6" />
          </q-avatar>
        </q-td>
      </template>

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
                        :dark="$q.dark.isActive"
                        dense
                        outlined
                        placeholder="Enter item name"
                        @update:model-value="vErrors.name = ''"
                      />
                    </ERPFormField>
                  </div>
                  <div class="col-4 flex flex-center">
                    <div class="image-upload-area q-ma-sm" @click="triggerImageUpload">
                      <q-avatar size="70px" rounded bg-color="grey-9" class="shadow-3">
                        <img
                          v-if="form.image_url"
                          :src="form.image_url"
                          style="object-fit: cover"
                        />
                        <q-icon v-else name="add_a_photo" color="grey-6" size="28px" />
                      </q-avatar>
                      <q-badge v-if="imageUploading" floating color="primary">
                        <q-spinner size="10px" />
                      </q-badge>
                      <div
                        class="text-caption text-grey-6 text-center q-mt-xs"
                        style="font-size: 10px"
                      >
                        Click to upload
                      </div>
                    </div>
                    <input
                      ref="imageInputRef"
                      type="file"
                      accept="image/*"
                      class="hidden"
                      @change="uploadImage"
                    />
                  </div>
                </div>
                <div class="row q-col-gutter-md">
                  <div class="col-8">
                    <ERPFormField label="Base Price" required :error="vErrors.base_price">
                      <q-input
                        v-model="form.base_price"
                        type="number"
                        step="1"
                        :dark="$q.dark.isActive"
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
                      <q-input v-model="form.description" :dark="$q.dark.isActive" type="textarea" outlined autogrow />
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
                        :dark="$q.dark.isActive"
                        :options="categoryOptions"
                        emit-value
                        map-options
                        outlined
                        dense
                        placeholder="Select..."
                        @update:model-value="onCategoryChange"
                      >
                        <template v-slot:after>
                          <q-btn
                            round
                            dense
                            flat
                            icon="add"
                            color="primary"
                            @click="catDialog.show = true"
                          >
                            <q-tooltip>Add New Category</q-tooltip>
                          </q-btn>
                        </template>
                      </q-select>
                    </ERPFormField>
                  </div>
                  <div class="col-6">
                    <ERPFormField
                      label="Sub Category"
                      :helper="!form.category_id ? 'Select a category first' : ''"
                    >
                      <q-select
                        v-model="form.sub_category_id"
                        :dark="$q.dark.isActive"
                        :options="subCategoryOptions"
                        emit-value
                        map-options
                        outlined
                        dense
                        clearable
                        :disable="!form.category_id"
                        placeholder="Select..."
                        @update:model-value="onSubCategoryChange"
                      >
                        <template v-slot:after>
                          <q-btn
                            round
                            dense
                            flat
                            icon="add"
                            color="primary"
                            @click="subCatDialog.show = true"
                            :disable="!form.category_id"
                          >
                            <q-tooltip>Add New Sub Category</q-tooltip>
                          </q-btn>
                        </template>
                      </q-select>
                    </ERPFormField>
                  </div>
                  <div class="col-6">
                    <ERPFormField label="Routing Kitchen" helper="Where KOTs are dispatched">
                      <q-select
                        v-model="form.kitchen_id"
                        :dark="$q.dark.isActive"
                        :options="kitchenOptions"
                        emit-value
                        map-options
                        outlined
                        dense
                        clearable
                        placeholder="Select..."
                      >
                        <template v-slot:after>
                          <q-btn
                            round
                            dense
                            flat
                            icon="add"
                            color="primary"
                            @click="kitchenDialog.show = true"
                          >
                            <q-tooltip>Add New Kitchen</q-tooltip>
                          </q-btn>
                        </template>
                      </q-select>
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

    <!-- Inline Add Dialogs -->
    <q-dialog v-model="catDialog.show">
      <q-card :class="$q.dark.isActive ? 'bg-grey-9 text-white' : 'bg-white text-black'" style="min-width: 350px">
        <q-card-section>
          <div class="text-h6">New Category</div>
        </q-card-section>
        <q-card-section>
          <q-input
            :dark="$q.dark.isActive"
            outlined
            v-model="catDialog.name"
            label="Category Name"
            autofocus
            @keyup.enter="saveNewCategory"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            flat
            label="Save"
            color="primary"
            :loading="catDialog.loading"
            @click="saveNewCategory"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="subCatDialog.show">
      <q-card :class="$q.dark.isActive ? 'bg-grey-9 text-white' : 'bg-white text-black'" style="min-width: 350px">
        <q-card-section>
          <div class="text-h6">New Sub Category</div>
          <div v-if="form.category_id" class="text-caption text-grey-5">
            Under: {{ categoryOptions.find((c) => c.value === form.category_id)?.label }}
          </div>
        </q-card-section>
        <q-card-section>
          <q-input
            :dark="$q.dark.isActive"
            outlined
            v-model="subCatDialog.name"
            label="Sub Category Name"
            autofocus
            @keyup.enter="saveNewSubCategory"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            flat
            label="Save"
            color="primary"
            :loading="subCatDialog.loading"
            @click="saveNewSubCategory"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="kitchenDialog.show">
      <q-card :class="$q.dark.isActive ? 'bg-grey-9 text-white' : 'bg-white text-black'" style="min-width: 350px">
        <q-card-section>
          <div class="text-h6">New Kitchen Station</div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input :dark="$q.dark.isActive" outlined v-model="kitchenDialog.name" label="Kitchen Name" autofocus />
          <q-toggle
            :dark="$q.dark.isActive"
            color="green"
            v-model="kitchenDialog.is_cashier_display"
            label="Is Cashier Display"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            flat
            label="Save"
            color="primary"
            :loading="kitchenDialog.loading"
            @click="saveNewKitchen"
          />
        </q-card-actions>
      </q-card>
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
const imageInputRef = ref(null)
const imageUploading = ref(false)

const catDialog = reactive({ show: false, name: '', loading: false })
const subCatDialog = reactive({ show: false, name: '', loading: false })
const kitchenDialog = reactive({ show: false, name: '', loading: false, is_cashier_display: false })

const menuItems = ref([])
const categories = ref([])
const kitchens = ref([])
const allSubCategories = ref([])
const kitchenMappings = ref([])

const emptyForm = {
  id: null,
  name: '',
  description: '',
  base_price: 0,
  image_url: '',
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
  {
    name: 'image',
    label: '',
    field: 'image_url',
    align: 'left',
    sortable: false,
    style: 'width: 48px',
  },
  { name: 'item_code', label: 'Item ID', field: 'item_code', align: 'left', sortable: true },
  { name: 'name', label: 'Name', field: 'name', align: 'left', sortable: true },
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

    // Fetch kitchen mappings for auto-fill
    const branchId = authStore.currentBranch?.id
    let mapQuery = supabase
      .from('kitchen_subcategory_map')
      .select('subcategory_id, kitchen_id, category_id')
    if (branchId) mapQuery = mapQuery.eq('branch_id', branchId)
    const { data: mapData, error: mapError } = await mapQuery
    if (mapError) console.warn('[MenuItems] Kitchen mappings fetch error:', mapError)
    kitchenMappings.value = mapData || []
    console.log('[MenuItems] Kitchen mappings loaded:', kitchenMappings.value.length, 'maps')

    const { data: menuData, error } = await supabase
      .from('menu_items')
      .select(
        `id, company_id, category_id, sub_category_id, kitchen_id, name, description, image_url, base_price, item_code, preparation_time_minutes, is_available, sort_order, categories(name), menu_sub_categories(name), kitchens(name)`,
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
  form.kitchen_id = null // Reset kitchen too
}

function onSubCategoryChange(subCatId) {
  // Auto-select kitchen based on kitchen_subcategory_map
  console.log(
    '[MenuItems] Sub category changed to:',
    subCatId,
    '| Available mappings:',
    kitchenMappings.value.length,
  )
  if (!subCatId) {
    form.kitchen_id = null
    return
  }
  const mapping = kitchenMappings.value.find((m) => m.subcategory_id === subCatId)
  console.log('[MenuItems] Found mapping:', mapping)
  if (mapping) {
    form.kitchen_id = mapping.kitchen_id
    console.log('[MenuItems] Auto-filled kitchen_id:', mapping.kitchen_id)
  }
}

function openCreate() {
  Object.assign(form, { ...emptyForm })
  // Pre-fill from active filter if set
  if (categoryFilter.value) {
    form.category_id = categoryFilter.value
    if (subCategoryFilter.value) {
      form.sub_category_id = subCategoryFilter.value
      // Auto-fill kitchen from mapping
      const mapping = kitchenMappings.value.find(
        (m) => m.subcategory_id === subCategoryFilter.value,
      )
      if (mapping) form.kitchen_id = mapping.kitchen_id
    }
  }
  clearErrors()
  showDialog.value = true
}

function triggerImageUpload() {
  imageInputRef.value?.click()
}

async function uploadImage(event) {
  const file = event.target.files?.[0]
  if (!file) return
  imageUploading.value = true
  try {
    const ext = file.name.split('.').pop()
    const fileName = `menu_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('menu-images')
      .upload(fileName, file, { upsert: true })
    if (upErr) throw upErr
    const { data: urlData } = supabase.storage.from('menu-images').getPublicUrl(fileName)
    form.image_url = urlData.publicUrl
    $q.notify({ type: 'positive', message: 'Image uploaded!', timeout: 800 })
  } catch (err) {
    console.error('[MenuItems] Image upload error:', err)
    $q.notify({ type: 'negative', message: err.message || 'Image upload failed' })
  } finally {
    imageUploading.value = false
    // Reset file input so same file can be re-selected
    if (imageInputRef.value) imageInputRef.value.value = ''
  }
}

function openEdit(row) {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    description: row.description || '',
    base_price: row.base_price || 0,
    image_url: row.image_url || '',
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
      base_price: Math.round(parseFloat(form.base_price) || 0),
      image_url: form.image_url || null,
      category_id: form.category_id,
      sub_category_id: form.sub_category_id || null,
      kitchen_id: form.kitchen_id || null,
      is_available: form.is_available,
      is_veg: form.is_veg || false,
      is_spicy: form.is_spicy || false,
      is_best_seller: form.is_best_seller || false,
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

// Inline Creators
async function saveNewCategory() {
  if (!catDialog.name.trim()) return
  catDialog.loading = true
  try {
    const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'
    const payload = { company_id: companyId, name: catDialog.name.trim().toUpperCase() }
    const { data, error } = await supabase.from('categories').insert([payload]).select().single()
    if (error) throw error

    categories.value.push(data)
    form.category_id = data.id
    onCategoryChange()

    catDialog.show = false
    catDialog.name = ''
    $q.notify({ type: 'positive', message: 'Category created' })
  } catch (err) {
    if (err.message.includes('unique'))
      $q.notify({ type: 'negative', message: 'Category already exists' })
    else $q.notify({ type: 'negative', message: err.message || 'Error creating category' })
  } finally {
    catDialog.loading = false
  }
}

async function saveNewSubCategory() {
  if (!subCatDialog.name.trim() || !form.category_id) return
  subCatDialog.loading = true
  try {
    const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'
    const payload = {
      company_id: companyId,
      category_id: form.category_id,
      name: subCatDialog.name.trim().toUpperCase(),
    }
    const { data, error } = await supabase
      .from('menu_sub_categories')
      .insert([payload])
      .select()
      .single()
    if (error) throw error

    allSubCategories.value.push(data)
    form.sub_category_id = data.id
    onSubCategoryChange(data.id)

    subCatDialog.show = false
    subCatDialog.name = ''
    $q.notify({ type: 'positive', message: 'Sub Category created' })
  } catch (err) {
    if (err.message.includes('unique'))
      $q.notify({ type: 'negative', message: 'Sub Category already exists' })
    else $q.notify({ type: 'negative', message: err.message || 'Error creating sub category' })
  } finally {
    subCatDialog.loading = false
  }
}

async function saveNewKitchen() {
  if (!kitchenDialog.name.trim()) return
  kitchenDialog.loading = true
  try {
    const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'
    const branchId = authStore.currentBranch?.id || authStore.branches?.[0]?.branches?.id
    if (!branchId) throw new Error('Branch required')

    const payload = {
      company_id: companyId,
      branch_id: branchId,
      name: kitchenDialog.name.trim().toUpperCase(),
      is_active: true,
      is_cashier_display: kitchenDialog.is_cashier_display,
    }
    const { data, error } = await supabase.from('kitchens').insert([payload]).select().single()
    if (error) throw error

    kitchens.value.push(data)
    form.kitchen_id = data.id

    kitchenDialog.show = false
    kitchenDialog.name = ''
    kitchenDialog.is_cashier_display = false
    $q.notify({ type: 'positive', message: 'Kitchen created' })
  } catch (err) {
    if (err.message.includes('unique'))
      $q.notify({ type: 'negative', message: 'Kitchen already exists' })
    else $q.notify({ type: 'negative', message: err.message || 'Error creating kitchen' })
  } finally {
    kitchenDialog.loading = false
  }
}

defineExpose({
  columns,
  rows: filteredItems,
})
</script>

<style scoped>
.image-upload-area {
  cursor: pointer;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: opacity 0.2s;
}
.image-upload-area:hover {
  opacity: 0.75;
}
.hidden {
  display: none;
}
</style>
