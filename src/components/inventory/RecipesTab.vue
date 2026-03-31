<template>
  <div class="q-pa-md">
    <!-- Toolbar -->
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-input
        :dark="$q.dark.isActive"
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
      <template #body-cell-menu_item_name="props">
        <q-td :props="props">
          <div class="text-weight-bold">{{ props.value }}</div>
          <div v-if="props.row.name" class="text-caption text-grey-5">{{ props.row.name }}</div>
        </q-td>
      </template>

      <template #body-cell-food_cost_pct="props">
        <q-td :props="props">
          <q-badge
            :color="
              Number(props.value) > 35
                ? 'negative'
                : Number(props.value) > 25
                  ? 'warning'
                  : 'positive'
            "
            class="text-caption"
          >
            {{ props.value }}%
          </q-badge>
        </q-td>
      </template>

      <template #body-cell-yield="props">
        <q-td :props="props">
          <span class="text-weight-bold">{{ props.row.yield_qty }}</span>
          <span v-if="props.row.yield_unit" class="text-caption text-grey-5 q-ml-xs">{{
            props.row.yield_unit
          }}</span>
          <span v-else class="text-caption text-grey-6 q-ml-xs">portions</span>
        </q-td>
      </template>

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

      <template #body-cell-total_cost="props">
        <q-td :props="props">
          <div class="text-weight-bold" :class="props.value > 0 ? 'text-amber-4' : 'text-grey-6'">
            {{ props.value > 0 ? formatCurrency(props.value) : '—' }}
          </div>
          <div v-if="props.row.yield_qty > 0 && props.value > 0" class="text-caption text-grey-5">
            {{ formatCurrency(props.value / props.row.yield_qty) }} / portion
          </div>
        </q-td>
      </template>

      <template #body-cell-version_no="props">
        <q-td :props="props">
          <q-badge color="grey-8" class="text-caption">v{{ props.value }}</q-badge>
        </q-td>
      </template>

      <template #body-cell-is_active="props">
        <q-td :props="props">
          <q-badge :color="props.value ? 'positive' : 'grey-7'" class="text-caption">
            {{ props.value ? 'Active' : 'Inactive' }}
          </q-badge>
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
          <q-btn
            flat
            dense
            round
            :icon="props.row.is_active ? 'pause' : 'play_arrow'"
            size="sm"
            :color="props.row.is_active ? 'warning' : 'positive'"
            @click="toggleActive(props.row)"
          >
            <q-tooltip>{{ props.row.is_active ? 'Deactivate' : 'Activate' }}</q-tooltip>
          </q-btn>
          <q-btn
            flat
            dense
            round
            icon="delete"
            size="sm"
            color="negative"
            @click="confirmDeleteRecipe(props.row)"
          >
            <q-tooltip>Delete Recipe</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </DataTable>

    <!-- Create / Edit Recipe Dialog -->
    <BaseDialog
      v-model="dialogOpen"
      :title="form.recipe_id ? 'Edit Recipe / BOM' : 'Create Recipe / BOM'"
      size="lg"
    >
      <div class="row q-col-gutter-xl">
        <!-- Left: Recipe Details -->
        <div class="col-12 col-md-5">
          <BaseFormSection title="1. Recipe Details" description="Link to a sellable menu item">
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

            <div class="row q-col-gutter-sm">
              <div class="col-7">
                <BaseInput
                  label="Yield Quantity"
                  v-model.number="form.yield_qty"
                  type="number"
                  required
                />
              </div>
              <div class="col-5">
                <BaseInput label="Yield Unit" v-model="form.yield_unit" placeholder="portions" />
              </div>
            </div>

            <q-input
              v-model="form.notes"
              label="Notes"
              type="textarea"
              rows="3"
              outlined
              :dark="$q.dark.isActive"
              dense
              class="q-mt-sm"
            />
          </BaseFormSection>

          <!-- Estimated Cost Summary -->
          <q-card
            v-if="form.ingredients.length > 0"
            flat
            bordered
            class="bg-grey-9 q-mt-md q-pa-md"
            style="border-radius: 8px; border-color: rgba(255, 255, 255, 0.1)"
          >
            <div class="text-caption text-grey-5 q-mb-sm">ESTIMATED FOOD COST</div>
            <div class="row justify-between items-center">
              <div>
                <div class="text-h5 text-amber-4 text-weight-bold">
                  {{ formatCurrency(estimatedCost) }}
                </div>
                <div class="text-caption text-grey-5">Total recipe cost</div>
              </div>
              <div class="text-right" v-if="form.yield_qty > 0">
                <div class="text-h6 text-white text-weight-bold">
                  {{ formatCurrency(costPerPortion) }}
                </div>
                <div class="text-caption text-grey-5">Per {{ form.yield_unit || 'portion' }}</div>
              </div>
            </div>
            <div v-if="form.menu_item?.base_price" class="q-mt-sm">
              <div class="text-caption text-grey-5">
                Food Cost %:
                <span
                  :class="
                    foodCostPct > 35
                      ? 'text-negative'
                      : foodCostPct > 25
                        ? 'text-warning'
                        : 'text-positive'
                  "
                  class="text-weight-bold"
                >
                  {{ foodCostPct.toFixed(1) }}%
                </span>
                of {{ formatCurrency(form.menu_item.base_price) }} selling price
              </div>
            </div>
          </q-card>
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

          <!-- Ingredient Table -->
          <div style="overflow-x: auto; -webkit-overflow-scrolling: touch">
            <div style="min-width: 560px">
              <!-- Header -->
              <div
                class="row no-wrap items-center rounded-borders q-px-xs q-py-xs"
                style="gap: 4px"
                :style="{
                  background: $q.dark.isActive ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
                }"
              >
                <div style="width: 16px; flex-shrink: 0"></div>
                <div
                  class="col"
                  style="
                    min-width: 100px;
                    font-size: 9px;
                    font-weight: 700;
                    letter-spacing: 0.7px;
                    color: #9e9e9e;
                  "
                >
                  ITEM
                </div>
                <div
                  style="
                    width: 80px;
                    flex-shrink: 0;
                    font-size: 9px;
                    font-weight: 700;
                    letter-spacing: 0.7px;
                    color: #9e9e9e;
                  "
                >
                  CODE
                </div>
                <div
                  style="
                    width: 76px;
                    flex-shrink: 0;
                    font-size: 9px;
                    font-weight: 700;
                    letter-spacing: 0.7px;
                    color: #9e9e9e;
                  "
                >
                  QTY
                </div>
                <div
                  style="
                    width: 72px;
                    flex-shrink: 0;
                    font-size: 9px;
                    font-weight: 700;
                    letter-spacing: 0.7px;
                    color: #9e9e9e;
                  "
                >
                  UOM
                </div>
                <div
                  style="
                    width: 80px;
                    flex-shrink: 0;
                    font-size: 9px;
                    font-weight: 700;
                    letter-spacing: 0.7px;
                    color: #9e9e9e;
                    text-align: right;
                  "
                >
                  COST
                </div>
                <div style="width: 22px; flex-shrink: 0"></div>
              </div>

              <!-- Ingredient Rows -->
              <div class="q-gutter-y-xs q-mt-xs">
                <div
                  v-for="(ing, index) in form.ingredients"
                  :key="index"
                  class="row no-wrap items-center rounded-borders"
                  style="gap: 4px; padding: 3px 4px; min-width: 480px"
                  :style="{
                    border: '1px solid',
                    borderColor: $q.dark.isActive ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)',
                    background:
                      index % 2 === 0
                        ? $q.dark.isActive
                          ? 'rgba(255,255,255,0.02)'
                          : 'rgba(0,0,0,0.01)'
                        : $q.dark.isActive
                          ? 'rgba(0,0,0,0.18)'
                          : 'rgba(0,0,0,0.03)',
                  }"
                >
                  <!-- # -->
                  <div style="width: 16px; flex-shrink: 0; text-align: center">
                    <span style="font-size: 10px; font-weight: 600; color: #bdbdbd">{{
                      index + 1
                    }}</span>
                  </div>

                  <!-- ITEM -->
                  <div class="col" style="min-width: 90px">
                    <q-select
                      v-model="ing.item"
                      :options="inventoryItems"
                      option-label="name"
                      option-value="id"
                      dense
                      outlined
                      :dark="$q.dark.isActive"
                      use-input
                      fill-input
                      hide-selected
                      input-debounce="0"
                      @filter="filterItems"
                      hide-bottom-space
                      placeholder="Search item..."
                      @update:model-value="(item) => onIngItemChange(ing, item)"
                      :input-style="{ fontSize: '11px', padding: '0 4px', fontWeight: '500' }"
                    >
                      <template #option="scope">
                        <q-item v-bind="scope.itemProps" dense style="min-height: 36px">
                          <q-item-section>
                            <q-item-label style="font-size: 12px; font-weight: 500">{{
                              scope.opt.name
                            }}</q-item-label>
                            <q-item-label caption style="font-size: 10px">{{
                              scope.opt.code
                            }}</q-item-label>
                          </q-item-section>
                        </q-item>
                      </template>
                    </q-select>
                  </div>

                  <!-- CODE -->
                  <div style="width: 80px; flex-shrink: 0">
                    <div
                      class="rounded-borders"
                      style="
                        height: 32px;
                        display: flex;
                        align-items: center;
                        padding: 0 6px;
                        font-size: 11px;
                        font-weight: 600;
                        border: 1px solid;
                        overflow: hidden;
                        white-space: nowrap;
                        font-family: monospace;
                        letter-spacing: 0.2px;
                      "
                      :style="{
                        borderColor: $q.dark.isActive
                          ? 'rgba(255,255,255,0.12)'
                          : 'rgba(0,0,0,0.12)',
                        color: $q.dark.isActive ? '#78909c' : '#546e7a',
                        background: $q.dark.isActive ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
                      }"
                      :title="ing.item?.code"
                    >
                      {{ ing.item?.code || '—' }}
                    </div>
                  </div>

                  <!-- QTY -->
                  <div style="width: 76px; flex-shrink: 0">
                    <q-input
                      v-model.number="ing.qty_per_serving"
                      type="number"
                      dense
                      outlined
                      :dark="$q.dark.isActive"
                      hide-bottom-space
                      placeholder="0"
                      :input-style="{
                        fontSize: '12px',
                        padding: '0 4px',
                        textAlign: 'right',
                        fontWeight: '500',
                      }"
                    />
                  </div>

                  <!-- UOM -->
                  <div style="width: 72px; flex-shrink: 0">
                    <q-select
                      v-model="ing.uom_id"
                      :options="uoms"
                      option-label="code"
                      option-value="id"
                      emit-value
                      map-options
                      dense
                      outlined
                      :dark="$q.dark.isActive"
                      hide-bottom-space
                      placeholder="—"
                      @update:model-value="(uomId) => onIngUomChange(ing, uomId)"
                    >
                      <template #option="scope">
                        <q-item v-bind="scope.itemProps" dense style="min-height: 36px">
                          <q-item-section>
                            <q-item-label style="font-size: 12px; font-weight: 600">{{
                              scope.opt.code
                            }}</q-item-label>
                            <q-item-label caption style="font-size: 10px">{{
                              scope.opt.name
                            }}</q-item-label>
                          </q-item-section>
                        </q-item>
                      </template>
                    </q-select>
                  </div>

                  <!-- COST -->
                  <div style="width: 80px; flex-shrink: 0">
                    <div
                      class="rounded-borders text-weight-bold"
                      style="
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: flex-end;
                        padding: 0 8px;
                        font-size: 11px;
                        border: 1px solid;
                      "
                      :style="{
                        borderColor: ing.item
                          ? 'rgba(255,152,0,0.4)'
                          : $q.dark.isActive
                            ? 'rgba(255,255,255,0.1)'
                            : 'rgba(0,0,0,0.1)',
                        background: ing.item
                          ? $q.dark.isActive
                            ? 'rgba(255,152,0,0.12)'
                            : 'rgba(255,152,0,0.08)'
                          : 'transparent',
                        color: ing.item ? '#e65100' : $q.dark.isActive ? '#616161' : '#bdbdbd',
                      }"
                    >
                      {{ ing.item ? formatCurrency(getLineCost(ing)) : '—' }}
                    </div>
                  </div>

                  <!-- DELETE -->
                  <div
                    style="
                      width: 22px;
                      flex-shrink: 0;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                    "
                  >
                    <q-btn
                      flat
                      round
                      dense
                      icon="close"
                      size="xs"
                      color="negative"
                      @click="removeIngredient(index)"
                    >
                      <q-tooltip>Remove</q-tooltip>
                    </q-btn>
                  </div>
                </div>

                <div
                  v-if="form.ingredients.length === 0"
                  class="text-grey-5 q-pa-md row justify-center text-italic"
                  style="font-size: 12px"
                >
                  No ingredients added yet.
                </div>
              </div>
            </div>
            <!-- /min-width -->
          </div>
          <!-- /overflow-x -->
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
        style="min-width: 600px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1)"
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
          <div v-if="!selectedRecipe?.recipe_items?.length" class="q-pa-xl text-center text-grey">
            No ingredients added yet.
          </div>
          <q-list v-else bordered separator :class="$q.dark.isActive ? 'bg-grey-9' : 'bg-grey-2'">
            <q-item v-for="(item, idx) in selectedRecipe.recipe_items" :key="idx" class="q-py-md">
              <q-item-section avatar>
                <q-avatar color="grey-9" text-color="primary" icon="layers" size="md" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-bold text-h6 text-primary">
                  {{ item.item?.name || 'Unknown Item' }}
                </q-item-label>
                <q-item-label caption class="text-grey-5">
                  <span class="text-grey-4">{{ item.item?.code }}</span>
                  <span v-if="item.wastage_percent > 0" class="q-ml-sm">
                    · Wastage: {{ item.wastage_percent }}%
                  </span>
                  <span v-if="item.notes" class="q-ml-sm">· {{ item.notes }}</span>
                </q-item-label>
              </q-item-section>
              <q-item-section side class="text-right">
                <div class="text-h6 text-white text-weight-bolder">{{ item.qty_per_serving }}</div>
                <div class="text-caption text-grey-5 uppercase letter-spacing">
                  {{ item.uom?.name || item.uom?.code || 'Unit' }}
                </div>
                <div v-if="item.item?.avg_cost" class="text-caption text-amber-4">
                  {{
                    formatCurrency(
                      ((item.qty_per_serving *
                        (1 + (item.wastage_percent || 0) / 100) *
                        (Number(item.uom?.conversion_factor) || 1)) /
                        (Number(item.item?.inv_uom?.conversion_factor) || 1)) *
                        item.item.avg_cost,
                    )
                  }}
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>

        <q-card-section class="q-pa-md bg-grey-9" style="border-radius: 0 0 12px 12px">
          <div class="row items-center justify-between">
            <div>
              <div class="text-subtitle2 text-grey-4 italic">
                Yield: {{ selectedRecipe?.yield_qty }}
                {{ selectedRecipe?.yield_unit || 'Portions' }}
              </div>
              <div
                v-if="selectedRecipe?.total_cost > 0"
                class="text-caption text-amber-4 text-weight-bold"
              >
                Total Cost: {{ formatCurrency(selectedRecipe.total_cost) }} · Per portion:
                {{ formatCurrency(selectedRecipe.total_cost / (selectedRecipe?.yield_qty || 1)) }}
                <span class="q-ml-sm text-grey-5">
                  | Food Cost: {{ selectedRecipe.food_cost_pct }}%
                </span>
              </div>
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
import { useQuasar } from 'quasar'
import { supabase } from 'boot/supabase'
import { useRecipeList, useItemsList, useUomList } from 'src/services/inventoryService'
import DataTable from 'components/common/DataTable.vue'
import BaseButton from 'components/common/erp/BaseButton.vue'
import BaseDialog from 'components/common/erp/BaseDialog.vue'
import BaseFormSection from 'components/common/erp/BaseFormSection.vue'
import BaseInput from 'components/common/erp/BaseInput.vue'
import BaseSelect from 'components/common/erp/BaseSelect.vue'

const $q = useQuasar()

// ── Service composables ─────────────────────────────────
const {
  recipes,
  loading,
  listRecipes,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  toggleRecipeActive,
} = useRecipeList()
const { items: inventoryItemsRaw, listItems } = useItemsList()
const { uoms, listUoms } = useUomList()

const dialogOpen = ref(false)
const viewIngredientsOpen = ref(false)
const saving = ref(false)
const filter = ref('')
const selectedRecipe = ref(null)

// ── Menu items for select ─────────────────────────────
const allMenuItemsList = ref([])
const filteredMenuItemsList = ref([])
const inventoryItems = ref([])
const allInventoryItems = ref([])

function formatCurrency(val) {
  return 'Rs. ' + Number(val || 0).toFixed(2)
}

const columns = [
  {
    name: 'menu_item_name',
    label: 'Menu Item',
    field: 'menu_item_name',
    align: 'left',
    sortable: true,
  },
  {
    name: 'category_name',
    label: 'Category',
    field: 'category_name',
    align: 'left',
    sortable: true,
  },
  { name: 'kitchen_name', label: 'Kitchen', field: 'kitchen_name', align: 'left' },
  { name: 'yield', label: 'Yield', field: 'yield_qty', align: 'left' },
  { name: 'ingredient_count', label: 'Ingredients', field: 'ingredient_count', align: 'center' },
  { name: 'total_cost', label: 'Est. Cost', field: 'total_cost', align: 'right', sortable: true },
  {
    name: 'food_cost_pct',
    label: 'Food Cost %',
    field: 'food_cost_pct',
    align: 'center',
    sortable: true,
  },
  { name: 'version_no', label: 'Ver', field: 'version_no', align: 'center' },
  { name: 'is_active', label: 'Status', field: 'is_active', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' },
]

const form = ref({
  recipe_id: null,
  menu_item: null,
  name: '',
  yield_qty: 1,
  yield_unit: '',
  notes: '',
  ingredients: [],
})

const filteredRecipes = computed(() => {
  if (!filter.value) return recipes.value
  const f = filter.value.toLowerCase()
  return recipes.value.filter(
    (r) =>
      (r.menu_item_name && r.menu_item_name.toLowerCase().includes(f)) ||
      (r.name && r.name.toLowerCase().includes(f)) ||
      (r.category_name && r.category_name.toLowerCase().includes(f)),
  )
})

const estimatedCost = computed(() => {
  return form.value.ingredients.reduce((sum, ing) => sum + getLineCost(ing), 0)
})

const costPerPortion = computed(() => {
  const yieldQty = form.value.yield_qty || 1
  return yieldQty > 0 ? estimatedCost.value / yieldQty : 0
})

const foodCostPct = computed(() => {
  const price = form.value.menu_item?.base_price || 0
  return price > 0 ? (estimatedCost.value / price) * 100 : 0
})

/**
 * Get the UOM conversion factor for a given uom_id.
 * e.g. G → 0.001 (relative to KG), ML → 0.001 (relative to L), KG → 1, L → 1
 */
function getUomConversionFactor(uomId) {
  if (!uomId) return 1
  const uom = uoms.value.find((u) => u.id === uomId)
  return uom ? Number(uom.conversion_factor) || 1 : 1
}

/**
 * Get the stock/inventory UOM conversion factor for an item.
 * The item's avg_cost is expressed per stock UOM unit.
 */
function getItemStockUomFactor(item) {
  const stockUomId = item.inventory_uom_id || item.uom_id || null
  return getUomConversionFactor(stockUomId)
}

/**
 * Calculate cost for one BOM ingredient line.
 *
 * Uses ing.bom_factor — auto-computed on item/UOM selection.
 * bom_factor = how many stock-UOM units equal 1 BOM-UOM unit.
 *
 * Formula: qty × bom_factor × (1 + wastage/100) × avg_cost_per_stock_uom
 *
 * Example: Orange GRNed in KG (avg_cost = Rs.300/kg), BOM in G (bom_factor=0.001)
 *   cost = 250 × 0.001 × 1.0 × 300 = Rs.75  ✓
 * Example: Milk GRNed in L (avg_cost = Rs.280/L), BOM in ML (bom_factor=0.001)
 *   cost = 500 × 0.001 × 1.0 × 280 = Rs.140  ✓
 * Example: Eggs GRNed in PCS (avg_cost = Rs.50/pcs), BOM in PCS (bom_factor=1)
 *   cost = 2 × 1 × 1.0 × 50 = Rs.100  ✓
 */
function getLineCost(ing) {
  if (!ing.item) return 0
  const qty = Number(ing.qty_per_serving) || 0
  const wastage = Number(ing.wastage_percent) || 0
  const avgCost = Number(ing.item.avg_cost) || 0

  // Use stored bom_factor (set on item/UOM change), fallback to computed
  const factor =
    Number(ing.bom_factor) > 0 ? Number(ing.bom_factor) : computeBomFactor(ing.item, ing.uom_id)

  return qty * factor * (1 + wastage / 100) * avgCost
}

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
      (v) =>
        v.name.toLowerCase().indexOf(needle) > -1 ||
        (v.code && v.code.toLowerCase().indexOf(needle) > -1),
    )
  })
}

// ── Lifecycle ─────────────────────────────────────────
onMounted(async () => {
  // Load all data in parallel
  await Promise.all([listRecipes(), listItems(), listUoms(), fetchMenuItems()])
  // Populate inventory items lists after items load
  allInventoryItems.value = inventoryItemsRaw.value
  inventoryItems.value = inventoryItemsRaw.value
})

async function fetchMenuItems() {
  const { data } = await supabase
    .from('menu_items')
    .select('id, name, base_price, kitchen_id')
    .order('name')
  allMenuItemsList.value = data || []
  filteredMenuItemsList.value = data || []
}

// ── Dialog actions ─────────────────────────────────────────
function emptyIngredient() {
  return { item: null, qty_per_serving: 0, uom_id: null, wastage_percent: 0, bom_factor: 1 }
}

function openRecipeDialog() {
  form.value = {
    recipe_id: null,
    menu_item: null,
    name: '',
    yield_qty: 1,
    yield_unit: '',
    notes: '',
    ingredients: [emptyIngredient()],
  }
  dialogOpen.value = true
}

function addIngredient() {
  form.value.ingredients.push(emptyIngredient())
}

/**
 * Compute bom_factor: how many stock-UOM units = 1 BOM-UOM unit.
 * e.g. BOM=G, stock=KG → G.conversion_factor(0.001) / KG.conversion_factor(1) = 0.001
 * e.g. BOM=KG, stock=KG → 1/1 = 1
 * e.g. BOM=ML, stock=L  → 0.001/1 = 0.001
 * e.g. BOM=BTL, stock=BTL → 1/1 = 1
 * Works for ANY UOM pair — as long as conversions are in the same measurement family.
 */
function computeBomFactor(item, uomId) {
  if (!item || !uomId) return 1
  const bomUomConv = getUomConversionFactor(uomId)
  const stockUomConv = getItemStockUomFactor(item)
  return stockUomConv > 0 ? bomUomConv / stockUomConv : bomUomConv
}

function onIngItemChange(ing, item) {
  ing.item = item
  ing.bom_factor = computeBomFactor(item, ing.uom_id)
}

function onIngUomChange(ing, uomId) {
  ing.uom_id = uomId
  ing.bom_factor = computeBomFactor(ing.item, uomId)
}

function removeIngredient(index) {
  form.value.ingredients.splice(index, 1)
}

function openViewIngredients(row) {
  selectedRecipe.value = row
  viewIngredientsOpen.value = true
}

async function loadExistingRecipeForMenuItem(menuItem) {
  if (!menuItem) return

  // Check if a recipe already exists for this menu item
  const existing = recipes.value.find((r) => r.menu_item_id === menuItem.id)
  if (existing) {
    form.value.recipe_id = existing.id
    form.value.name = existing.name || ''
    form.value.yield_qty = existing.yield_qty || 1
    form.value.yield_unit = existing.yield_unit || ''
    form.value.notes = existing.notes || ''

    // Map recipe_items
    if (existing.recipe_items?.length) {
      form.value.ingredients = existing.recipe_items.map((ri) => {
        const item = ri.item || allInventoryItems.value.find((i) => i.id === ri.item_id) || null
        return {
          item,
          qty_per_serving: ri.qty_per_serving,
          uom_id: ri.uom_id,
          wastage_percent: ri.wastage_percent || 0,
          bom_factor: computeBomFactor(item, ri.uom_id),
        }
      })
    } else {
      form.value.ingredients = [emptyIngredient()]
    }
  } else {
    form.value.recipe_id = null
    form.value.name = ''
    form.value.yield_qty = 1
    form.value.yield_unit = ''
    form.value.notes = ''
    form.value.ingredients = [{ item: null, qty_per_serving: 0, uom_id: null, wastage_percent: 0 }]
  }
}

async function editRecipe(row) {
  const matchedMenu = allMenuItemsList.value.find((m) => m.id === row.menu_item_id)
  form.value.menu_item = matchedMenu || {
    id: row.menu_item_id,
    name: row.menu_item_name || 'Unknown',
  }
  form.value.recipe_id = row.id
  form.value.name = row.name || ''
  form.value.yield_qty = row.yield_qty || 1
  form.value.yield_unit = row.yield_unit || ''
  form.value.notes = row.notes || ''

  // Map recipe_items
  if (row.recipe_items?.length) {
    form.value.ingredients = row.recipe_items.map((ri) => {
      const item = ri.item || allInventoryItems.value.find((i) => i.id === ri.item_id) || null
      return {
        item,
        qty_per_serving: ri.qty_per_serving,
        uom_id: ri.uom_id,
        wastage_percent: ri.wastage_percent || 0,
        bom_factor: computeBomFactor(item, ri.uom_id),
      }
    })
  } else {
    form.value.ingredients = [emptyIngredient()]
  }
  dialogOpen.value = true
}

async function toggleActive(row) {
  try {
    await toggleRecipeActive(row.id, !row.is_active)
    $q.notify({
      type: 'positive',
      message: row.is_active ? 'Recipe deactivated' : 'Recipe activated',
    })
  } catch (err) {
    console.error(err)
    $q.notify({ type: 'negative', message: err.message || 'Failed to toggle recipe status' })
  }
}

async function confirmDeleteRecipe(row) {
  $q.dialog({
    title: 'Delete Recipe',
    message: `Are you sure you want to delete the recipe for "${row.menu_item_name}"? This will remove all ingredient lines.`,
    cancel: true,
    dark: true,
    persistent: true,
    color: 'negative',
  }).onOk(async () => {
    try {
      await deleteRecipe(row.id)
      $q.notify({ type: 'positive', message: 'Recipe deleted successfully' })
    } catch (err) {
      console.error(err)
      $q.notify({ type: 'negative', message: err.message || 'Error deleting recipe' })
    }
  })
}

async function saveRecipe() {
  if (!form.value.menu_item) {
    $q.notify({ type: 'warning', message: 'Please select a Menu Item' })
    return
  }

  const validIngredients = form.value.ingredients.filter(
    (ing) => ing.item && ing.qty_per_serving > 0,
  )
  if (validIngredients.length === 0) {
    $q.notify({
      type: 'warning',
      message: 'Please add at least one ingredient with a valid quantity',
    })
    return
  }

  // Check for duplicate items
  const itemIds = validIngredients.map((ing) => ing.item.id)
  if (new Set(itemIds).size !== itemIds.length) {
    $q.notify({
      type: 'negative',
      message:
        'Duplicate ingredient detected. Each inventory item can only appear once per recipe.',
    })
    return
  }

  saving.value = true

  const payload = {
    menu_item_id: form.value.menu_item.id,
    name: form.value.name || undefined,
    yield_qty: Number(form.value.yield_qty) || 1,
    yield_unit: form.value.yield_unit || undefined,
    notes: form.value.notes || undefined,
    items: validIngredients.map((ing) => ({
      item_id: ing.item.id,
      qty_per_serving: ing.qty_per_serving,
      uom_id: ing.uom_id || ing.item.uom_id || ing.item.inventory_uom_id,
      wastage_percent: Number(ing.wastage_percent) || 0,
    })),
  }

  try {
    if (form.value.recipe_id) {
      await updateRecipe(form.value.recipe_id, payload)
    } else {
      await createRecipe(payload)
    }
    $q.notify({ type: 'positive', message: 'Recipe saved successfully' })
    dialogOpen.value = false
    // Refresh inventory items after potential avg_cost changes
    allInventoryItems.value = inventoryItemsRaw.value
    inventoryItems.value = inventoryItemsRaw.value
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
