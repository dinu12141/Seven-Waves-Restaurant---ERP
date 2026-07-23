<template>
  <div class="menu-items-root">

    <!-- ── Section Header ── -->
    <div class="mi-header">
      <div class="mi-header__left">
        <div class="mi-header__icon-wrap">
          <q-icon name="restaurant_menu" size="20px" />
        </div>
        <div>
          <div class="mi-header__title">Menu Master</div>
          <div class="mi-header__sub">{{ filteredItems.length }} items in catalog</div>
        </div>
      </div>
      <q-btn
        unelevated
        no-caps
        color="primary"
        icon="add"
        label="Add Menu Item"
        class="mi-add-btn"
        @click="openCreate"
      />
    </div>

    <!-- ── Filter Toolbar ── -->
    <div class="mi-toolbar">
      <q-input
        :dark="$q.dark.isActive"
        outlined
        dense
        v-model="filter"
        placeholder="Search by name or category…"
        class="mi-search"
        bg-color="transparent"
      >
        <template #prepend><q-icon name="search" size="16px" color="grey-5" /></template>
        <template v-if="filter" #append>
          <q-icon name="close" size="14px" class="cursor-pointer text-grey-5" @click="filter = ''" />
        </template>
      </q-input>

      <q-select
        :dark="$q.dark.isActive"
        outlined
        dense
        v-model="categoryFilter"
        :options="categoryOptions"
        emit-value
        map-options
        clearable
        class="mi-filter-select"
        bg-color="transparent"
        @update:model-value="subCategoryFilter = null"
      >
        <template #prepend><q-icon name="category" size="14px" color="grey-5" /></template>
        <template v-if="categoryFilter" #selected>
          <span class="mi-filter-label">{{ categoryOptions.find((o) => o.value === categoryFilter)?.label }}</span>
        </template>
        <template v-else #selected>
          <span class="mi-filter-placeholder">All Categories</span>
        </template>
      </q-select>

      <q-select
        :dark="$q.dark.isActive"
        outlined
        dense
        v-model="subCategoryFilter"
        :options="filterSubCategoryOptions"
        emit-value
        map-options
        clearable
        :disable="!categoryFilter"
        class="mi-filter-select"
        bg-color="transparent"
      >
        <template #prepend><q-icon name="label" size="14px" color="grey-5" /></template>
        <template v-if="subCategoryFilter" #selected>
          <span class="mi-filter-label">{{ filterSubCategoryOptions.find((o) => o.value === subCategoryFilter)?.label }}</span>
        </template>
        <template v-else #selected>
          <span class="mi-filter-placeholder">{{ categoryFilter ? 'All Sub-cats' : 'Select Category' }}</span>
        </template>
      </q-select>

      <q-space />

      <q-btn
        v-if="categoryFilter || subCategoryFilter || filter"
        flat no-caps dense
        icon="filter_alt_off"
        label="Clear"
        color="grey-5"
        size="sm"
        @click="filter = ''; categoryFilter = null; subCategoryFilter = null"
      />
    </div>

    <!-- DataGrid -->
    <div class="mi-table-wrap">
    <DataTable
      title=""
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
          <span class="mi-status-chip" :class="props.value ? 'mi-status-chip--active' : 'mi-status-chip--inactive'">
            <span class="mi-status-dot"></span>
            {{ props.value ? 'Available' : 'Unavailable' }}
          </span>
        </q-td>
      </template>

      <template #body-cell-tags="props">
        <q-td :props="props">
          <div class="row q-gutter-xs no-wrap">
            <span v-if="props.row.is_veg" class="mi-tag mi-tag--veg">Veg</span>
            <span v-if="props.row.is_spicy" class="mi-tag mi-tag--spicy">Spicy</span>
            <span v-if="props.row.is_best_seller" class="mi-tag mi-tag--bestseller">★ Best</span>
          </div>
        </q-td>
      </template>

      <template #body-cell-actions="props">
        <q-td :props="props">
          <div class="row no-wrap q-gutter-xs items-center justify-center">
            <q-btn flat dense round icon="edit" size="sm" color="primary" @click="openEdit(props.row)">
              <q-tooltip anchor="top middle" self="bottom middle">Edit</q-tooltip>
            </q-btn>
            <q-btn flat dense round icon="delete_outline" size="sm" color="negative" @click="deleteItem(props.row)">
              <q-tooltip anchor="top middle" self="bottom middle">Delete</q-tooltip>
            </q-btn>
          </div>
        </q-td>
      </template>
    </DataTable>
    </div><!-- /mi-table-wrap -->

    <!-- Add/Edit Form Dialog using ERPFormCard -->
    <q-dialog v-model="showDialog" persistent full-height position="right">
      <div class="mi-drawer">
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
                      <q-input
                        v-model="form.description"
                        :dark="$q.dark.isActive"
                        type="textarea"
                        outlined
                        autogrow
                      />
                    </ERPFormField>
                  </div>
                </div>
              </ERPFormSection>

              <ERPFormSection title="Classification" collapsible>
                <div class="row q-col-gutter-md">
                  <div class="col-12">
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
                  <div class="col-12">
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
                  <div class="col-12">
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

    <!-- ── Quick-Add: Category ── -->
    <q-dialog v-model="catDialog.show" backdrop-filter="blur(2px)">
      <q-card class="mi-quick-dialog" flat>
        <div class="mi-quick-dialog__header">
          <div class="mi-quick-dialog__icon"><q-icon name="category" size="18px" /></div>
          <div>
            <div class="mi-quick-dialog__title">New Category</div>
            <div class="mi-quick-dialog__sub">Add to menu catalog</div>
          </div>
          <q-space />
          <q-btn flat round dense icon="close" size="sm" color="grey-5" v-close-popup />
        </div>
        <div class="mi-quick-dialog__body">
          <q-input
            :dark="$q.dark.isActive"
            outlined dense
            v-model="catDialog.name"
            label="Category Name"
            autofocus
            @keyup.enter="saveNewCategory"
          />
        </div>
        <div class="mi-quick-dialog__footer">
          <q-btn flat no-caps label="Cancel" color="grey-5" v-close-popup />
          <q-btn unelevated no-caps label="Create Category" color="primary"
            :loading="catDialog.loading" @click="saveNewCategory" />
        </div>
      </q-card>
    </q-dialog>

    <!-- ── Quick-Add: Sub Category ── -->
    <q-dialog v-model="subCatDialog.show" backdrop-filter="blur(2px)">
      <q-card class="mi-quick-dialog" flat>
        <div class="mi-quick-dialog__header">
          <div class="mi-quick-dialog__icon"><q-icon name="label" size="18px" /></div>
          <div>
            <div class="mi-quick-dialog__title">New Sub Category</div>
            <div v-if="form.category_id" class="mi-quick-dialog__sub">
              Under: {{ categoryOptions.find((c) => c.value === form.category_id)?.label }}
            </div>
          </div>
          <q-space />
          <q-btn flat round dense icon="close" size="sm" color="grey-5" v-close-popup />
        </div>
        <div class="mi-quick-dialog__body">
          <q-input
            :dark="$q.dark.isActive"
            outlined dense
            v-model="subCatDialog.name"
            label="Sub Category Name"
            autofocus
            @keyup.enter="saveNewSubCategory"
          />
        </div>
        <div class="mi-quick-dialog__footer">
          <q-btn flat no-caps label="Cancel" color="grey-5" v-close-popup />
          <q-btn unelevated no-caps label="Create Sub Category" color="primary"
            :loading="subCatDialog.loading" @click="saveNewSubCategory" />
        </div>
      </q-card>
    </q-dialog>

    <!-- ── Quick-Add: Kitchen ── -->
    <q-dialog v-model="kitchenDialog.show" backdrop-filter="blur(2px)">
      <q-card class="mi-quick-dialog" flat>
        <div class="mi-quick-dialog__header">
          <div class="mi-quick-dialog__icon"><q-icon name="soup_kitchen" size="18px" /></div>
          <div>
            <div class="mi-quick-dialog__title">New Kitchen Station</div>
            <div class="mi-quick-dialog__sub">KOT routing destination</div>
          </div>
          <q-space />
          <q-btn flat round dense icon="close" size="sm" color="grey-5" v-close-popup />
        </div>
        <div class="mi-quick-dialog__body q-gutter-sm">
          <q-input
            :dark="$q.dark.isActive"
            outlined dense
            v-model="kitchenDialog.name"
            label="Kitchen Name"
            autofocus
          />
          <div class="mi-toggle-row">
            <div>
              <div class="mi-toggle-label">Cashier Display</div>
              <div class="mi-toggle-sub">Show on cashier KDS screen</div>
            </div>
            <q-toggle
              :dark="$q.dark.isActive"
              color="primary"
              v-model="kitchenDialog.is_cashier_display"
            />
          </div>
        </div>
        <div class="mi-quick-dialog__footer">
          <q-btn flat no-caps label="Cancel" color="grey-5" v-close-popup />
          <q-btn unelevated no-caps label="Create Kitchen" color="primary"
            :loading="kitchenDialog.loading" @click="saveNewKitchen" />
        </div>
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
    // Compress to WebP before uploading to save storage & egress
    const bitmap = await createImageBitmap(file)
    const MAX_W = 800
    let { width, height } = bitmap
    if (width > MAX_W) { height = Math.round((height * MAX_W) / width); width = MAX_W }
    const canvas = new OffscreenCanvas(width, height)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 })

    const fileName = `menu_${Date.now()}.webp`
    const { error: upErr } = await supabase.storage
      .from('menu-images')
      .upload(fileName, blob, { contentType: 'image/webp', upsert: true })
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

function openEditById(id) {
  const item = menuItems.value.find((i) => i.id === id)
  if (item) openEdit(item)
}

defineExpose({
  columns,
  rows: filteredItems,
  openEdit,
  openEditById,
})
</script>

<style scoped lang="scss">
/* ── Root ───────────────────────────────────────────── */
.menu-items-root {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ── Section Header ─────────────────────────────────── */
.mi-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px 12px;
  border-bottom: 1px solid var(--erp-border);
  background: var(--erp-bg-card);

  &__left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
  }

  &__icon-wrap {
    width: 36px;
    height: 36px;
    border-radius: var(--erp-radius-lg);
    background: var(--erp-mod-inventory-subtle, rgba(34,197,94,0.12));
    color: var(--erp-mod-inventory, #22c55e);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--erp-text-primary);
    line-height: 1.2;
  }

  &__sub {
    font-size: 11px;
    color: var(--erp-text-muted);
    margin-top: 1px;
  }
}

.mi-add-btn {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

/* ── Filter Toolbar ─────────────────────────────────── */
.mi-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--erp-border);
  background: var(--erp-bg-card);
  flex-wrap: wrap;
}

.mi-search {
  min-width: 220px;
  max-width: 300px;
}

.mi-filter-select {
  min-width: 160px;
  max-width: 200px;
}

.mi-filter-label {
  font-size: 13px;
  color: var(--erp-text-primary);
}

.mi-filter-placeholder {
  font-size: 13px;
  color: var(--erp-text-muted);
}

/* ── Table Wrapper ──────────────────────────────────── */
.mi-table-wrap {
  flex: 1;
  overflow: auto;
}

/* ── Status Chip ────────────────────────────────────── */
.mi-status-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: var(--erp-radius-pill);
  letter-spacing: 0.02em;
  text-transform: uppercase;

  .mi-status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  &--active {
    background: var(--erp-success-subtle, rgba(22,163,74,0.12));
    color: var(--erp-success, #16a34a);
    .mi-status-dot { background: var(--erp-success, #16a34a); }
  }

  &--inactive {
    background: var(--erp-bg-stripe, rgba(255,255,255,0.02));
    color: var(--erp-text-muted);
    .mi-status-dot { background: var(--erp-text-muted); }
  }
}

/* ── Tags ───────────────────────────────────────────── */
.mi-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--erp-radius-pill);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;

  &--veg {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
  }

  &--spicy {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  &--bestseller {
    background: rgba(245, 158, 11, 0.18);
    color: #f59e0b;
  }
}

/* ── Right Drawer ───────────────────────────────────── */
.mi-drawer {
  width: 500px;
  max-width: 100vw;
  height: 100vh;
  background: var(--erp-bg-main);
  border-left: 1px solid var(--erp-border);
}

/* ── Quick-Add Dialogs ──────────────────────────────── */
.mi-quick-dialog {
  width: 380px;
  max-width: 95vw;
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-xl);

  &__header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 16px 12px;
    border-bottom: 1px solid var(--erp-border);
  }

  &__icon {
    width: 34px;
    height: 34px;
    border-radius: var(--erp-radius-lg);
    background: var(--erp-mod-inventory-subtle, rgba(34,197,94,0.12));
    color: var(--erp-mod-inventory, #22c55e);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--erp-text-primary);
  }

  &__sub {
    font-size: 11px;
    color: var(--erp-text-muted);
    margin-top: 1px;
  }

  &__body {
    padding: 16px;
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 16px 14px;
    border-top: 1px solid var(--erp-border);
  }
}

/* ── Kitchen toggle row ─────────────────────────────── */
.mi-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0 4px;
}

.mi-toggle-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--erp-text-primary);
}

.mi-toggle-sub {
  font-size: 11px;
  color: var(--erp-text-muted);
  margin-top: 1px;
}

/* ── Image Upload ───────────────────────────────────── */
.image-upload-area {
  cursor: pointer;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px dashed var(--erp-border-hover);
  border-radius: var(--erp-radius-lg);
  padding: 6px;
  transition: border-color 0.2s, background 0.2s;

  &:hover {
    border-color: var(--erp-primary);
    background: var(--erp-primary-subtle, rgba(37,99,235,0.06));
  }
}

.hidden { display: none; }
</style>
