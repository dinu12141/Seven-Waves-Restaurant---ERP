<template>
  <div class="q-pa-md">
    <div class="row q-col-gutter-lg">
      <!-- Left: Sub Categories List -->
      <div class="col-12 col-md-5">
        <q-card class="erp-card" flat bordered>
          <q-card-section class="row items-center q-pb-none">
            <div class="text-h6 text-primary">Sub Categories</div>
            <q-space />
            <q-btn flat round dense icon="add" color="primary" @click="openAddSubCategory">
              <q-tooltip>Add Sub Category</q-tooltip>
            </q-btn>
            <q-btn flat round dense icon="refresh" color="grey-5" @click="fetchAll" />
          </q-card-section>
          <q-card-section class="q-pa-md">
            <!-- Filter by category -->
            <q-select
              outlined dense
              v-model="selectedCategoryId"
              :options="categoryOptions"
              emit-value
              map-options
              clearable
              label="Filter by Category"
              class="q-mb-md"
            />

            <q-list separator class="subcategory-list">
              <q-item
                v-for="sub in filteredSubCategories"
                :key="sub.id"
                clickable
                v-ripple
                :active="selectedSubId === sub.id"
                active-class="bg-primary-subtle text-primary selected-sub"
                @click="selectedSubId = sub.id"
              >
                <q-item-section avatar>
                  <q-avatar size="28px" color="grey-7" text-color="white" icon="subdirectory_arrow_right" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-bold">{{ sub.name }}</q-item-label>
                  <q-item-label caption class="text-grey-5">
                    {{ sub.category_name }}
                    <span v-if="sub.kitchen_name"> · 🍳 {{ sub.kitchen_name }}</span>
                    <span v-else class="text-orange"> · No kitchen assigned</span>
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-badge
                    :color="sub.kitchen_name ? 'green' : 'orange'"
                    :label="sub.kitchen_name ? 'Mapped' : 'Unmapped'"
                  />
                </q-item-section>
              </q-item>
            </q-list>

            <div v-if="filteredSubCategories.length === 0" class="text-center q-pa-lg text-grey-5">
              No sub-categories found.
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Right: Kitchen Assignment -->
      <div class="col-12 col-md-7">
        <q-card class="erp-card" flat bordered :class="{ 'disabled-overlay': !selectedSubId }">
          <q-card-section class="row items-center q-pb-none">
            <div class="text-h6 text-secondary">
              Kitchen Assignment
              <span v-if="selectedSub" class="text-caption text-grey-5 block">
                {{ selectedSub.name }} → Kitchen Routing
              </span>
            </div>
            <q-space />
            <q-btn flat round dense icon="add" color="secondary" @click="openAddKitchen">
              <q-tooltip>Add New Kitchen Station</q-tooltip>
            </q-btn>
          </q-card-section>

          <q-card-section class="q-pa-md">
            <template v-if="selectedSubId">
              <div class="text-body2 text-grey-4 q-mb-md">
                Select which kitchen should receive KOT tickets for items in <strong class="text-primary">{{ selectedSub?.name }}</strong>:
              </div>

              <q-list separator>
                <q-item
                  v-for="kitchen in kitchens"
                  :key="kitchen.id"
                  clickable
                  v-ripple
                  :active="currentKitchenId === kitchen.id"
                  active-class="bg-green-9 text-white"
                  @click="assignKitchen(kitchen.id)"
                >
                  <q-item-section avatar>
                    <q-avatar
                      size="36px"
                      :color="currentKitchenId === kitchen.id ? 'green' : 'grey-8'"
                      text-color="white"
                    >
                      <q-icon :name="currentKitchenId === kitchen.id ? 'check_circle' : 'kitchen'" />
                    </q-avatar>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-weight-bold">{{ kitchen.name }}</q-item-label>
                    <q-item-label caption class="text-grey-5">
                      {{ kitchen.is_cashier_display ? 'Cashier Display' : 'Kitchen Station' }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side v-if="currentKitchenId === kitchen.id">
                    <q-badge color="green" label="Active" />
                  </q-item-section>
                </q-item>
              </q-list>

              <div class="q-mt-md" v-if="currentKitchenId">
                <q-btn
                  flat
                  color="orange"
                  label="Remove Kitchen Mapping"
                  icon="link_off"
                  size="sm"
                  @click="removeMapping"
                />
              </div>
            </template>

            <div v-else class="text-center q-pa-xl text-grey-5 flex flex-center flex-column">
              <q-icon name="route" size="48px" />
              <div class="q-mt-sm">Select a sub-category to assign its kitchen routing</div>
            </div>
          </q-card-section>
        </q-card>

        <!-- Summary Card -->
        <q-card flat bordered class="q-mt-md" v-if="enrichedSubs.length > 0">
          <q-card-section>
            <div class="text-subtitle2 text-primary q-mb-sm">KOT Routing Summary</div>
            <q-markup-table dense flat>
              <thead>
                <tr>
                  <th class="text-left">Category</th>
                  <th class="text-left">Sub Category</th>
                  <th class="text-left">Kitchen</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in enrichedSubs" :key="row.id">
                  <td>{{ row.category_name }}</td>
                  <td>{{ row.name }}</td>
                  <td>
                    <q-badge :color="row.kitchen_name ? 'green' : 'orange'" :label="row.kitchen_name || 'Unmapped'" />
                  </td>
                </tr>
              </tbody>
            </q-markup-table>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Add Kitchen Dialog -->
    <q-dialog v-model="kitchenDialog.show" persistent>
      <q-card style="min-width: 400px">
        <q-card-section class="row items-center">
          <div class="text-h6">Add Kitchen Station</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input
            outlined
            v-model="kitchenDialog.name"
            label="Kitchen Name"
            placeholder="e.g. PASTRY STATION"
            :rules="[v => !!v || 'Name is required']"
          />
          <q-toggle
            v-model="kitchenDialog.isCashierDisplay"
            label="Cashier Display (not a cooking station)"
            color="amber"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            color="secondary"
            icon="add"
            label="Create Kitchen"
            :loading="kitchenDialog.loading"
            @click="createKitchen"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Add Sub Category Dialog -->
    <q-dialog v-model="subCatDialog.show" persistent>
      <q-card style="min-width: 400px">
        <q-card-section class="row items-center">
          <div class="text-h6">Add Sub Category</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-select
            outlined
            v-model="subCatDialog.categoryId"
            :options="categories.map(c => ({ label: c.name, value: c.id }))"
            emit-value
            map-options
            label="Parent Category"
            :rules="[v => !!v || 'Category is required']"
          />
          <q-input
            outlined
            v-model="subCatDialog.name"
            label="Sub Category Name"
            placeholder="e.g. PASTA"
            :rules="[v => !!v || 'Name is required']"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            color="primary"
            icon="add"
            label="Create Sub Category"
            :loading="subCatDialog.loading"
            @click="createSubCategory"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { supabase } from 'boot/supabase'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()

const categories = ref([])
const rawSubCategories = ref([])
const kitchens = ref([])
const mappings = ref([])
const selectedCategoryId = ref(null)
const selectedSubId = ref(null)

// Add Kitchen dialog
const kitchenDialog = reactive({
  show: false,
  name: '',
  isCashierDisplay: false,
  loading: false,
})

// Add Sub Category dialog
const subCatDialog = reactive({
  show: false,
  name: '',
  categoryId: null,
  loading: false,
})

const categoryOptions = computed(() => [
  { label: 'All Categories', value: null },
  ...categories.value.map(c => ({ label: c.name, value: c.id })),
])

// Enriched sub-categories with kitchen info from mappings
const enrichedSubs = computed(() => {
  return rawSubCategories.value.map(s => {
    // Find mapping: prefer subcategory_id match, fallback to category_id match
    const mapping = mappings.value.find(m => m.subcategory_id === s.id)
      || mappings.value.find(m => !m.subcategory_id && m.category_id === s.category_id)
    const kitchen = mapping ? kitchens.value.find(k => k.id === mapping.kitchen_id) : null
    return {
      ...s,
      category_name: s.categories?.name || 'Unknown',
      kitchen_name: kitchen?.name || null,
      mapping_id: mapping?.id || null,
      mapped_kitchen_id: mapping?.kitchen_id || null,
    }
  })
})

const filteredSubCategories = computed(() => {
  if (selectedCategoryId.value) {
    return enrichedSubs.value.filter(s => s.category_id === selectedCategoryId.value)
  }
  return enrichedSubs.value
})

const selectedSub = computed(() => enrichedSubs.value.find(s => s.id === selectedSubId.value))

const currentKitchenId = computed(() => {
  if (!selectedSub.value) return null
  return selectedSub.value.mapped_kitchen_id
})

onMounted(() => {
  fetchAll()
})

async function fetchAll() {
  // Fetch all data in parallel, then mappings are available for enrichment
  await Promise.all([fetchCategories(), fetchKitchens(), fetchMappings(), fetchSubCategories()])
}

async function fetchCategories() {
  const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'
  const { data } = await supabase.from('categories').select('id, name').eq('company_id', companyId).order('sort_order')
  categories.value = data || []
}

async function fetchSubCategories() {
  const { data } = await supabase
    .from('menu_sub_categories')
    .select('id, name, category_id, categories(name)')
    .order('sort_order')
  rawSubCategories.value = data || []
}

async function fetchKitchens() {
  const branchId = authStore.currentBranch?.id
  const query = supabase.from('kitchens').select('id, name, is_active, is_cashier_display').eq('is_active', true)
  if (branchId) query.eq('branch_id', branchId)
  const { data } = await query.order('name')
  kitchens.value = data || []
}

async function fetchMappings() {
  const branchId = authStore.currentBranch?.id
  const query = supabase.from('kitchen_subcategory_map').select('*')
  if (branchId) query.eq('branch_id', branchId)
  const { data } = await query
  mappings.value = data || []
}

function resolveBranchId() {
  // Try multiple sources for branchId
  return authStore.currentBranch?.id
    || authStore.branches?.[0]?.branches?.id
    || mappings.value?.[0]?.branch_id
    || null
}

async function assignKitchen(kitchenId) {
  const sub = selectedSub.value
  if (!sub) return

  const branchId = resolveBranchId()
  if (!branchId) {
    $q.notify({ type: 'negative', message: 'No branch found. Please log out and log in again.' })
    return
  }

  try {
    // Check if there's an existing mapping for this subcategory
    const existingMapping = mappings.value.find(m => m.subcategory_id === sub.id)

    if (existingMapping) {
      // Update existing
      const { error } = await supabase
        .from('kitchen_subcategory_map')
        .update({ kitchen_id: kitchenId })
        .eq('id', existingMapping.id)
      if (error) throw error
    } else {
      // Insert new mapping with both category_id and subcategory_id
      const { error } = await supabase.from('kitchen_subcategory_map').insert({
        branch_id: branchId,
        category_id: sub.category_id,
        subcategory_id: sub.id,
        kitchen_id: kitchenId,
      })
      if (error) throw error
    }

    // Refresh mappings to update UI
    await fetchMappings()
    $q.notify({ type: 'positive', message: `Kitchen assigned to ${sub.name}`, timeout: 800 })
  } catch (err) {
    console.error('[KitchenMapping] Error assigning kitchen:', err)
    $q.notify({ type: 'negative', message: err.message || 'Failed to assign kitchen' })
  }
}

async function removeMapping() {
  const sub = selectedSub.value
  if (!sub || !sub.mapping_id) return

  try {
    const { error } = await supabase.from('kitchen_subcategory_map').delete().eq('id', sub.mapping_id)
    if (error) throw error
    await fetchMappings()
    $q.notify({ type: 'info', message: 'Kitchen mapping removed' })
  } catch (err) {
    console.error('[KitchenMapping] Error removing mapping:', err)
    $q.notify({ type: 'negative', message: err.message || 'Failed to remove mapping' })
  }
}

function openAddKitchen() {
  kitchenDialog.name = ''
  kitchenDialog.isCashierDisplay = false
  kitchenDialog.show = true
}

async function createKitchen() {
  if (!kitchenDialog.name.trim()) {
    $q.notify({ type: 'warning', message: 'Kitchen name is required' })
    return
  }
  kitchenDialog.loading = true
  try {
    const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'
    const branchId = resolveBranchId()
    if (!branchId) {
      $q.notify({ type: 'negative', message: 'No branch selected. Please log out and log in again.' })
      return
    }

    const { error } = await supabase.from('kitchens').insert({
      company_id: companyId,
      branch_id: branchId,
      name: kitchenDialog.name.trim().toUpperCase(),
      is_active: true,
      is_cashier_display: kitchenDialog.isCashierDisplay,
    })
    if (error) throw error

    kitchenDialog.show = false
    await fetchKitchens()
    $q.notify({ type: 'positive', message: `Kitchen "${kitchenDialog.name.trim().toUpperCase()}" created!` })
  } catch (err) {
    console.error('[KitchenMapping] Error creating kitchen:', err)
    $q.notify({ type: 'negative', message: err.message || 'Failed to create kitchen' })
  } finally {
    kitchenDialog.loading = false
  }
}

function openAddSubCategory() {
  subCatDialog.name = ''
  subCatDialog.categoryId = selectedCategoryId.value || null
  subCatDialog.show = true
}

async function createSubCategory() {
  if (!subCatDialog.name.trim() || !subCatDialog.categoryId) {
    $q.notify({ type: 'warning', message: 'Category and Name are required' })
    return
  }
  subCatDialog.loading = true
  try {
    const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'

    const { error } = await supabase.from('menu_sub_categories').insert([{
      company_id: companyId,
      category_id: subCatDialog.categoryId,
      name: subCatDialog.name.trim().toUpperCase(),
      sort_order: rawSubCategories.value.length + 1,
    }])
    if (error) throw error

    subCatDialog.show = false
    await fetchSubCategories()
    $q.notify({ type: 'positive', message: `Sub category "${subCatDialog.name.trim().toUpperCase()}" created!` })
  } catch (err) {
    console.error('[KitchenMapping] Error creating sub category:', err)
    $q.notify({ type: 'negative', message: err.message || 'Failed to create sub category' })
  } finally {
    subCatDialog.loading = false
  }
}
</script>

<style scoped>
.erp-card {
  min-height: 500px;
  display: flex;
  flex-direction: column;
}
.subcategory-list {
  max-height: 450px;
  overflow-y: auto;
}
.border-subtle {
  border: 1px solid var(--erp-border);
}
.selected-sub {
  border-left: 3px solid var(--q-primary);
}
</style>
