<template>
  <div class="q-pa-md">
    <div class="row q-col-gutter-lg">
      <!-- Left Column: Primary Categories -->
      <div class="col-12 col-md-5">
        <q-card class="bg-dark text-white border-subtle erp-card">
          <q-card-section class="row items-center q-pb-none">
            <div class="text-h6 text-primary">Primary Categories</div>
            <q-space />
            <q-btn flat round dense icon="add" color="primary" @click="openCreateCategory">
              <q-tooltip>Add Category</q-tooltip>
            </q-btn>
            <q-btn flat round dense icon="refresh" color="grey-5" @click="fetchCategories" />
          </q-card-section>
          <q-card-section class="q-pa-md">
            <q-list dark separator class="category-list">
              <q-item
                v-for="cat in categories"
                :key="cat.id"
                clickable
                v-ripple
                :active="selectedCategoryId === cat.id"
                active-class="bg-primary-subtle text-primary selected-cat"
                @click="selectedCategoryId = cat.id"
              >
                <q-item-section avatar>
                  <q-avatar
                    size="28px"
                    :color="cat.warehouse_id ? 'primary' : 'grey-7'"
                    text-color="white"
                    :icon="cat.warehouse_id ? 'warehouse' : 'folder'"
                  />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-bold">
                    {{ cat.name }}
                    <q-badge
                      v-if="cat.sub_count > 0"
                      color="primary"
                      text-color="white"
                      class="q-ml-sm"
                    >
                      {{ cat.sub_count }}
                    </q-badge>
                  </q-item-label>
                  <q-item-label caption class="text-grey-5" v-if="cat.warehouse_name">
                    Link: {{ cat.warehouse_name }}
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <div class="row items-center q-gutter-xs">
                    <q-btn
                      flat
                      round
                      dense
                      icon="edit"
                      size="sm"
                      color="grey-3"
                      @click.stop="openEditCategory(cat)"
                    />
                    <q-btn
                      flat
                      round
                      dense
                      icon="delete"
                      size="sm"
                      color="negative"
                      @click.stop="deleteCategory(cat)"
                    />
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
            <div v-if="categories.length === 0" class="text-center q-pa-lg text-grey-5">
              No categories found. Click + to add.
            </div>
          </q-card-section>
          <q-card-actions align="center" class="border-top-subtle q-py-sm">
            <q-btn
              flat
              size="sm"
              color="secondary"
              label="Sync with Warehouses"
              icon="sync"
              @click="syncWithWarehouses"
            />
          </q-card-actions>
        </q-card>
      </div>

      <!-- Right Column: Sub Categories -->
      <div class="col-12 col-md-7">
        <q-card
          class="bg-dark text-white border-subtle erp-card"
          :class="{ 'disabled-overlay': !selectedCategoryId }"
        >
          <q-card-section class="row items-center q-pb-none">
            <div class="text-h6 text-secondary">
              Sub Categories
              <span v-if="selectedCategory" class="text-caption text-grey-5 block">
                Under {{ selectedCategory.name }}
              </span>
            </div>
            <q-space />
            <q-btn
              v-if="selectedCategoryId"
              flat
              round
              dense
              icon="add"
              color="secondary"
              @click="openCreateSubCategory"
            >
              <q-tooltip>Add Sub-category</q-tooltip>
            </q-btn>
            <q-btn flat round dense icon="refresh" color="grey-5" @click="fetchSubCategories" />
          </q-card-section>
          <q-card-section class="q-pa-md">
            <DataTable
              v-if="selectedCategoryId"
              title=""
              :rows="subCategories"
              :columns="subColumns"
              :loading="loadingSub"
              dense
              flat
              hide-bottom
            >
              <template #body-cell-actions="props">
                <q-td :props="props" class="q-gutter-xs">
                  <q-btn
                    flat
                    dense
                    round
                    icon="edit"
                    size="sm"
                    color="grey-3"
                    @click="openEditSub(props.row)"
                  />
                  <q-btn
                    flat
                    dense
                    round
                    icon="delete"
                    size="sm"
                    color="negative"
                    @click="deleteSub(props.row)"
                  />
                </q-td>
              </template>
            </DataTable>
            <div v-else class="text-center q-pa-xl text-grey-5 flex flex-center flex-column">
              <q-icon name="subdirectory_arrow_left" size="48px" />
              <div class="q-mt-sm">Select a Primary Category to manage sub-categories</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Category Dialog -->
    <q-dialog v-model="catDialog.show" persistent>
      <q-card dark class="bg-dark border-subtle" style="min-width: 400px">
        <q-card-section class="row items-center">
          <div class="text-h6">{{ catDialog.isEdit ? 'Edit Category' : 'New Category' }}</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input
            dark
            outlined
            v-model="catDialog.form.name"
            label="Category Name"
            :rules="[(v) => !!v || 'Required']"
          />
          <q-select
            dark
            outlined
            v-model="catDialog.form.warehouse_id"
            :options="warehouseOptions"
            label="Link to Warehouse (Optional)"
            emit-value
            map-options
            clearable
            placeholder="Select a warehouse..."
          />
          <q-input
            dark
            outlined
            v-model.number="catDialog.form.sort_order"
            type="number"
            label="Sort Order"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            color="primary"
            icon="save"
            label="Save Category"
            :loading="catDialog.loading"
            @click="saveCategory"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Sub-Category Dialog -->
    <q-dialog v-model="subDialog.show" persistent>
      <q-card dark class="bg-dark border-subtle" style="min-width: 400px">
        <q-card-section class="row items-center">
          <div class="text-h6">
            {{ subDialog.isEdit ? 'Edit Sub Category' : 'New Sub Category' }}
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-card-section class="q-pa-md text-caption text-grey-5 bg-black-03">
          Primary Parent: {{ selectedCategory?.name }}
        </q-card-section>
        <q-card-section class="q-gutter-md q-pt-md">
          <q-input
            dark
            outlined
            v-model="subDialog.form.name"
            label="Sub Category Name"
            :rules="[(v) => !!v || 'Required']"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            color="secondary"
            icon="save"
            label="Save Sub Category"
            :loading="subDialog.loading"
            @click="saveSubCategory"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { supabase } from 'boot/supabase'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/auth'
import DataTable from 'components/common/DataTable.vue'

const $q = useQuasar()
const authStore = useAuthStore()

const categories = ref([])
const warehouses = ref([])
const subCategories = ref([])
const selectedCategoryId = ref(null)
const loadingSub = ref(false)

const catDialog = reactive({
  show: false,
  loading: false,
  isEdit: false,
  form: { id: null, name: '', warehouse_id: null, sort_order: 0 },
})

const subDialog = reactive({
  show: false,
  loading: false,
  isEdit: false,
  form: { id: null, name: '', description: '', sort_order: 0 },
})

const subColumns = [
  { name: 'name', label: 'Name', field: 'name', align: 'left', sortable: true },
  { name: 'actions', label: 'Actions', align: 'right' },
]

const selectedCategory = computed(() => {
  return categories.value.find((c) => c.id === selectedCategoryId.value)
})

const warehouseOptions = computed(() => {
  return warehouses.value.map((w) => ({ label: w.name, value: w.id }))
})

onMounted(() => {
  fetchCategories()
  fetchWarehouses()
})

watch(selectedCategoryId, () => {
  if (selectedCategoryId.value) {
    fetchSubCategories()
  } else {
    subCategories.value = []
  }
})

async function fetchWarehouses() {
  const { data } = await supabase.from('warehouses').select('id, name').eq('is_active', true)
  warehouses.value = data || []
}

async function fetchCategories() {
  try {
    const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'

    // Fetch categories and their warehouse names
    const { data: catData } = await supabase
      .from('categories')
      .select('*, warehouses(name)')
      .eq('company_id', companyId)
      .order('sort_order')

    // Fetch all sub-categories to count them client-side for the badges
    const { data: allSubs } = await supabase.from('menu_sub_categories').select('category_id')

    categories.value = (catData || []).map((c) => ({
      ...c,
      warehouse_name: c.warehouses?.name || '',
      sub_count: (allSubs || []).filter((s) => s.category_id === c.id).length,
    }))

    if (categories.value.length > 0 && !selectedCategoryId.value) {
      selectedCategoryId.value = categories.value[0].id
    }
  } catch {
    // Error handled silently or logged
  }
}

async function fetchSubCategories() {
  if (!selectedCategoryId.value) return
  loadingSub.value = true
  try {
    const { data, error } = await supabase
      .from('menu_sub_categories')
      .select('*')
      .eq('category_id', selectedCategoryId.value)
      .order('sort_order')

    if (error) throw error
    subCategories.value = data || []
  } catch {
    // Error handled silently or logged
  } finally {
    loadingSub.value = false
  }
}

// Category Management
function openCreateCategory() {
  catDialog.isEdit = false
  catDialog.form = {
    id: null,
    name: '',
    warehouse_id: null,
    sort_order: categories.value.length + 1,
  }
  catDialog.show = true
}

function openEditCategory(cat) {
  catDialog.isEdit = true
  catDialog.form = { ...cat }
  catDialog.show = true
}

async function saveCategory() {
  catDialog.loading = true
  try {
    const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'
    const payload = {
      name: catDialog.form.name,
      warehouse_id: catDialog.form.warehouse_id || null,
      sort_order: catDialog.form.sort_order,
      company_id: companyId,
    }

    if (catDialog.isEdit) {
      await supabase.from('categories').update(payload).eq('id', catDialog.form.id)
    } else {
      await supabase.from('categories').insert([payload])
    }
    catDialog.show = false
    fetchCategories()
    $q.notify({ type: 'positive', message: 'Category saved successfully' })
  } catch {
    $q.notify({ type: 'negative', message: 'Failed to save category' })
  } finally {
    catDialog.loading = false
  }
}

async function deleteCategory(cat) {
  $q.dialog({
    title: 'Delete Category',
    message: `Are you sure you want to delete "${cat.name}"? This might break links in menu items!`,
    cancel: true,
    persistent: true,
    dark: true,
  }).onOk(async () => {
    await supabase.from('categories').delete().eq('id', cat.id)
    fetchCategories()
    if (selectedCategoryId.value === cat.id) selectedCategoryId.value = null
  })
}

// Sub Category Management
function openCreateSubCategory() {
  subDialog.isEdit = false
  subDialog.form = {
    id: null,
    name: '',
    description: '',
    sort_order: subCategories.value.length + 1,
  }
  subDialog.show = true
}

function openEditSub(row) {
  subDialog.isEdit = true
  subDialog.form = { ...row }
  subDialog.show = true
}

async function saveSubCategory() {
  if (!selectedCategoryId.value) return
  subDialog.loading = true
  try {
    const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'
    const payload = {
      category_id: selectedCategoryId.value,
      name: subDialog.form.name,
      description: subDialog.form.description,
      sort_order: subDialog.form.sort_order,
      company_id: companyId,
    }

    if (subDialog.isEdit) {
      await supabase.from('menu_sub_categories').update(payload).eq('id', subDialog.form.id)
    } else {
      await supabase.from('menu_sub_categories').insert([payload])
    }
    subDialog.show = false
    fetchSubCategories()
    $q.notify({ type: 'positive', message: 'Sub-category saved successfully' })
  } catch {
    $q.notify({ type: 'negative', message: 'Failed to save sub-category' })
  } finally {
    subDialog.loading = false
  }
}

async function deleteSub(row) {
  $q.dialog({
    title: 'Delete Sub Category',
    message: `Delete "${row.name}"?`,
    cancel: true,
    dark: true,
  }).onOk(async () => {
    await supabase.from('menu_sub_categories').delete().eq('id', row.id)
    fetchSubCategories()
  })
}

async function syncWithWarehouses() {
  $q.dialog({
    title: 'Sync Categories',
    message:
      'This will automatically create primary categories for all your active warehouses if they do not exist. Continue?',
    cancel: true,
    dark: true,
  }).onOk(async () => {
    const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'

    // Find warehouses not already linked
    const existingWhIds = categories.value.map((c) => c.warehouse_id).filter(Boolean)
    const missingWh = warehouses.value.filter((w) => !existingWhIds.includes(w.id))

    if (missingWh.length === 0) {
      $q.notify({ message: 'All warehouses are already linked to categories.' })
      return
    }

    const payload = missingWh.map((w, idx) => ({
      company_id: companyId,
      name: w.name,
      warehouse_id: w.id,
      sort_order: categories.value.length + idx + 1,
    }))

    await supabase.from('categories').insert(payload)
    fetchCategories()
    $q.notify({
      type: 'positive',
      message: `Created ${missingWh.length} categories from warehouses.`,
    })
  })
}
</script>

<style scoped>
.erp-card {
  height: 650px;
  display: flex;
  flex-direction: column;
}
.category-list {
  max-height: 500px;
  overflow-y: auto;
}
.border-subtle {
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.border-top-subtle {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.selected-cat {
  border-left: 3px solid var(--q-primary);
}
</style>
