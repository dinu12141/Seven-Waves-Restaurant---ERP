<template>
  <div class="q-pa-md">
    <!-- Toolbar -->
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-input
        dark
        outlined
        dense
        v-model="filter"
        placeholder="Search recipes..."
        style="min-width: 250px"
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
      <q-space />
      <BaseButton label="Create Recipe" icon="add" variant="primary" @click="openRecipeDialog" />
    </div>

    <!-- DataGrid for existing recipes -->
    <DataTable
      title="Recipes / BOM"
      :rows="filteredRecipes"
      :columns="columns"
      :filter="filter"
      :loading="loading"
    >
      <template #body-cell-ingredient_count="props">
        <q-td :props="props">
          <q-btn
            flat
            dense
            no-caps
            class="bg-blue-9 text-white q-px-sm rounded-borders hover-premium"
            @click="openViewIngredients(props.row)"
          >
            <q-icon name="restaurant_menu" size="xs" class="q-mr-xs" />
            {{ props.value }} items
          </q-btn>
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
            @click="editRecipe(props.row)"
          >
            <q-tooltip>Edit Recipe</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </DataTable>

    <!-- Dialogs -->
    <BaseDialog
      v-model="dialogOpen"
      :title="form.recipe_id ? 'Edit Recipe / BOM' : 'Create Recipe / BOM'"
      size="lg"
    >
      <div class="row q-col-gutter-xl">
        <!-- Left: Menu Item Selection -->
        <div class="col-12 col-md-5">
          <BaseFormSection title="1. Recipe Details" description="Link to a generic menu item">
            <BaseSelect
              label="Menu Item"
              v-model="form.menu_item"
              :options="filteredMenuItemsList"
              option-label="name"
              option-value="id"
              use-input
              input-debounce="0"
              @filter="filterMenuItemsList"
              @update:model-value="loadExistingRecipeForMenuItem"
              required
            />

            <BaseInput label="Recipe Name (Optional)" v-model="form.name" />

            <BaseInput
              label="Yield Quantity (Portions)"
              v-model.number="form.yield_qty"
              type="number"
              required
            />
          </BaseFormSection>
        </div>

        <!-- Right: Ingredients List -->
        <div class="col-12 col-md-7">
          <div class="row items-center justify-between q-mb-md">
            <div>
              <div class="text-subtitle1 text-weight-bold text-primary">2. Ingredients (BOM)</div>
              <div class="text-caption text-grey-5">Inventory items consumed per yield</div>
            </div>
            <BaseButton
              variant="secondary"
              icon="add"
              label="Add Component"
              size="sm"
              @click="addIngredient"
            />
          </div>

          <q-list bordered class="rounded-borders bg-dark">
            <!-- Header Row -->
            <div
              class="row q-pa-sm bg-grey-10 text-weight-bold text-grey-4 text-caption items-center"
            >
              <div class="col-5">Item (Inventory)</div>
              <div class="col-3">Qty</div>
              <div class="col-3">UOM</div>
              <div class="col-1 text-center"></div>
            </div>

            <!-- Existing Ingredients -->
            <div
              v-for="(ing, index) in form.ingredients"
              :key="index"
              class="row q-pa-sm q-col-gutter-sm items-center"
              style="border-top: 1px solid var(--border)"
            >
              <div class="col-5">
                <q-select
                  v-model="ing.item"
                  :options="inventoryItems"
                  option-label="name"
                  option-value="id"
                  dense
                  outlined
                  dark
                  use-input
                  input-debounce="0"
                  @filter="filterItems"
                  hide-bottom-space
                  placeholder="Select item"
                />
              </div>
              <div class="col-3">
                <q-input
                  v-model.number="ing.qty_per_serving"
                  type="number"
                  dense
                  outlined
                  dark
                  hide-bottom-space
                  placeholder="0.0"
                />
              </div>
              <div class="col-3">
                <q-select
                  v-model="ing.uom_id"
                  :options="uoms"
                  option-label="name"
                  option-value="id"
                  emit-value
                  map-options
                  dense
                  outlined
                  dark
                  hide-bottom-space
                  placeholder="UOM"
                />
              </div>
              <div class="col-1 text-center">
                <q-btn
                  flat
                  round
                  dense
                  icon="delete"
                  size="sm"
                  color="negative"
                  @click="removeIngredient(index)"
                >
                  <q-tooltip>Remove</q-tooltip>
                </q-btn>
              </div>
            </div>

            <div
              v-if="form.ingredients.length === 0"
              class="text-grey-5 q-pa-lg row justify-center text-italic"
            >
              No ingredients added. Start by clicking 'Add Component'.
            </div>
          </q-list>
        </div>
      </div>

      <template #actions>
        <BaseButton
          label="Cancel"
          variant="secondary"
          @click="dialogOpen = false"
          class="q-mr-sm"
        />
        <BaseButton
          :label="form.recipe_id ? 'Update Recipe' : 'Save Recipe'"
          icon="save"
          variant="primary"
          :loading="saving"
          @click="saveRecipe"
        />
      </template>
    </BaseDialog>

    <!-- Premium Ingredients View Popup -->
    <q-dialog v-model="viewIngredientsOpen">
      <q-card
        class="bg-grey-10 text-white shadow-24"
        style="min-width: 500px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1)"
      >
        <q-card-section
          class="row items-center q-pb-md bg-primary text-white"
          style="border-radius: 12px 12px 0 0"
        >
          <q-icon name="list_alt" size="md" class="q-mr-md" />
          <div>
            <div class="text-h6 text-weight-bolder">{{ selectedRecipe?.menu_item_name }}</div>
            <div class="text-caption text-grey-3">Bill of Materials / Ingredients List</div>
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-none">
          <div v-if="fetchingIngredients" class="flex flex-center q-pa-xl">
            <q-spinner-dots color="primary" size="40px" />
          </div>
          <div v-else-if="viewItems.length === 0" class="q-pa-xl text-center text-grey">
            No ingredients added yet.
          </div>
          <q-list v-else bordered separator class="bg-dark">
            <q-item v-for="(item, idx) in viewItems" :key="idx" class="q-py-md">
              <q-item-section avatar>
                <q-avatar color="grey-9" text-color="primary" icon="layers" size="md" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-bold text-h6 text-primary">{{
                  item.item_name
                }}</q-item-label>
                <q-item-label caption v-if="item.notes" class="text-grey-5">{{
                  item.notes
                }}</q-item-label>
              </q-item-section>
              <q-item-section side class="text-right">
                <div class="text-h6 text-white text-weight-bolder">{{ item.qty_per_serving }}</div>
                <div class="text-caption text-grey-5 uppercase letter-spacing">
                  {{ item.uom_name }}
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>

        <q-card-section class="q-pa-md bg-grey-9 text-right" style="border-radius: 0 0 12px 12px">
          <div class="row items-center justify-between">
            <div class="text-subtitle2 text-grey-4 italic">
              Yield: {{ selectedRecipe?.yield_qty }} Portions
            </div>
            <q-btn flat label="Close" color="primary" v-close-popup class="q-px-lg" />
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from 'boot/supabase'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/auth'
import DataTable from 'components/common/DataTable.vue'
import BaseButton from 'components/common/erp/BaseButton.vue'
import BaseDialog from 'components/common/erp/BaseDialog.vue'
import BaseFormSection from 'components/common/erp/BaseFormSection.vue'
import BaseInput from 'components/common/erp/BaseInput.vue'
import BaseSelect from 'components/common/erp/BaseSelect.vue'
const $q = useQuasar()
const authStore = useAuthStore()

const loading = ref(false)
const dialogOpen = ref(false)
const viewIngredientsOpen = ref(false)
const fetchingIngredients = ref(false)
const saving = ref(false)
const filter = ref('')

const selectedRecipe = ref(null)
const viewItems = ref([])

const recipes = ref([])
const menuItems = ref([])
const allMenuItemsList = ref([])
const inventoryItems = ref([])
const allInventoryItems = ref([])
const uoms = ref([])

const columns = [
  {
    name: 'menu_item_name',
    label: 'Menu Item',
    field: 'menu_item_name',
    align: 'left',
    sortable: true,
  },
  { name: 'name', label: 'Recipe Name', field: 'name', align: 'left' },
  { name: 'yield_qty', label: 'Yield', field: 'yield_qty', align: 'right' },
  { name: 'ingredient_count', label: 'Ingredients', field: 'ingredient_count', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' },
]

const form = ref({
  recipe_id: null,
  menu_item: null,
  name: '',
  yield_qty: 1,
  ingredients: [],
})

const filteredRecipes = computed(() => {
  if (!filter.value) return recipes.value
  const f = filter.value.toLowerCase()
  return recipes.value.filter(
    (r) =>
      (r.menu_item_name && r.menu_item_name.toLowerCase().includes(f)) ||
      (r.name && r.name.toLowerCase().includes(f)),
  )
})

const filteredMenuItemsList = ref([])

function filterMenuItemsList(val, update) {
  if (val === '') {
    update(() => {
      filteredMenuItemsList.value = allMenuItemsList.value
    })
    return
  }
  update(() => {
    const needle = val.toLowerCase()
    filteredMenuItemsList.value = allMenuItemsList.value.filter(
      (v) => v.name.toLowerCase().indexOf(needle) > -1,
    )
  })
}

onMounted(() => {
  fetchData()
})

async function fetchData() {
  loading.value = true
  try {
    const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'

    // Fetch Recipes with Menu Item Names
    const { data: recData } = await supabase
      .from('recipes')
      .select('id, name, yield_qty, menu_item_id, menu_items(name), recipe_items(count)')
      .eq('company_id', companyId)

    recipes.value =
      recData?.map((r) => ({
        ...r,
        menu_item_name: r.menu_items?.name,
        ingredient_count: r.recipe_items?.[0]?.count || 0,
      })) || []

    // Fetch Menu Items
    const { data: miData } = await supabase.from('menu_items').select('id, name').order('name')
    allMenuItemsList.value = miData || []
    filteredMenuItemsList.value = miData || []
    menuItems.value = miData || []

    // Fetch Inventory Items
    const { data: invData } = await supabase
      .from('items')
      .select('id, name, inventory_uom_id')
      .eq('is_active', true)
      .order('name')
    allInventoryItems.value = invData || []
    inventoryItems.value = invData || []

    // Fetch UOMs
    const { data: uomData } = await supabase.from('uom').select('id, name')
    uoms.value = uomData || []
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

function filterItems(val, update) {
  if (val === '') {
    update(() => {
      inventoryItems.value = allInventoryItems.value
    })
    return
  }
  update(() => {
    const needle = val.toLowerCase()
    inventoryItems.value = allInventoryItems.value.filter(
      (v) => v.name.toLowerCase().indexOf(needle) > -1,
    )
  })
}

function openRecipeDialog() {
  form.value = {
    recipe_id: null,
    menu_item: null,
    name: '',
    yield_qty: 1,
    ingredients: [{ item: null, qty_per_serving: 0, uom_id: null }],
  }
  dialogOpen.value = true
}

function addIngredient() {
  form.value.ingredients.push({ item: null, qty_per_serving: 0, uom_id: null })
}

function removeIngredient(index) {
  form.value.ingredients.splice(index, 1)
}

async function openViewIngredients(row) {
  selectedRecipe.value = row
  viewIngredientsOpen.value = true
  fetchingIngredients.value = true
  viewItems.value = []

  try {
    const { data, error } = await supabase
      .from('recipe_items')
      .select(
        `
        qty_per_serving,
        notes,
        items(name),
        uom(name)
      `,
      )
      .eq('recipe_id', row.id)

    if (error) throw error

    viewItems.value = (data || []).map((i) => ({
      item_name: i.items?.name || 'Unknown Item',
      qty_per_serving: i.qty_per_serving,
      uom_name: i.uom?.name || 'Unit',
      notes: i.notes,
    }))
  } catch (err) {
    console.error(err)
    $q.notify({ type: 'negative', message: 'Error fetching ingredients' })
  } finally {
    fetchingIngredients.value = false
  }
}

async function loadExistingRecipeForMenuItem(menuItem) {
  if (!menuItem) return

  try {
    const { data } = await supabase
      .from('recipes')
      .select('id, name, yield_qty, recipe_items(item_id, qty_per_serving, uom_id)')
      .eq('menu_item_id', menuItem.id)
      .limit(1)
      .maybeSingle()

    if (data) {
      form.value.recipe_id = data.id
      form.value.name = data.name || ''
      form.value.yield_qty = data.yield_qty || 1

      // Map recipe_items back to form structure
      if (data.recipe_items && data.recipe_items.length > 0) {
        form.value.ingredients = data.recipe_items.map((ri) => {
          const matchedItem = allInventoryItems.value.find((i) => i.id === ri.item_id)
          return {
            item: matchedItem,
            qty_per_serving: ri.qty_per_serving,
            uom_id: ri.uom_id,
          }
        })
      } else {
        form.value.ingredients = [{ item: null, qty_per_serving: 0, uom_id: null }]
      }
    } else {
      // New Recipe
      form.value.recipe_id = null
      form.value.name = ''
      form.value.yield_qty = 1
      form.value.ingredients = [{ item: null, qty_per_serving: 0, uom_id: null }]
    }
  } catch (err) {
    console.error(err)
  }
}

async function editRecipe(row) {
  const matchedMenuIndex = menuItems.value.findIndex((m) => m.id === row.menu_item_id)
  if (matchedMenuIndex > -1) {
    form.value.menu_item = menuItems.value[matchedMenuIndex]
    await loadExistingRecipeForMenuItem(form.value.menu_item)
  } else {
    // Edge case if menu item is inactive but recipe exists
    form.value.menu_item = { id: row.menu_item_id, name: row.menu_item_name || 'Unknown' }
    await loadExistingRecipeForMenuItem(form.value.menu_item)
  }
  dialogOpen.value = true
}

async function saveRecipe() {
  if (!form.value.menu_item) {
    $q.notify({ type: 'warning', message: 'Please select a Menu Item' })
    return
  }

  saving.value = true
  const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'

  // Map ingredients to expected JSONB structure for RPC
  const payloadIngredients = form.value.ingredients
    .filter((ing) => ing.item && ing.qty_per_serving > 0)
    .map((ing) => ({
      item_id: ing.item.id,
      qty_per_serving: ing.qty_per_serving,
      uom_id: ing.uom_id || ing.item.inventory_uom_id,
      notes: null,
    }))

  try {
    const { data, error } = await supabase.rpc('save_recipe', {
      p_company_id: companyId,
      p_menu_item_id: form.value.menu_item.id,
      p_variant_id: null,
      p_name: form.value.name || '',
      p_yield_qty: Number(form.value.yield_qty || 1),
      p_ingredients: payloadIngredients,
    })

    if (error) throw error

    if (data?.success) {
      $q.notify({ type: 'positive', message: 'Recipe saved successfully' })
      dialogOpen.value = false
      fetchData()
    } else {
      throw new Error(data?.error || 'Unknown error occurred')
    }
  } catch (err) {
    console.error(err)
    $q.notify({ type: 'negative', message: err.message || 'Failed to save recipe' })
  } finally {
    saving.value = false
  }
}
defineExpose({
  columns,
  rows: filteredRecipes,
})
</script>
