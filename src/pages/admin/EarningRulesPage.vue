<template>
  <q-page class="q-pa-md earning-rules-page">
    <PageHeader
      title="Earning Rules"
      subtitle="Configure how loyalty coins are earned on purchases"
      show-back
      back-route="/admin/loyalty"
    >
      <template #actions>
        <q-btn
          flat
          no-caps
          icon="help_outline"
          label="How it works"
          color="grey-5"
          @click="showHelp = true"
        />
      </template>
    </PageHeader>

    <div class="rules-layout q-col-gutter-md row">
      <!-- ── Left column ────────────────────────────────────────────── -->
      <div class="col-12 col-md-5">
        <!-- Base Rate Card -->
        <q-card flat bordered class="rule-card q-mb-md">
          <q-card-section class="section-header">
            <div class="row items-center no-wrap" style="gap: 10px">
              <q-icon name="toll" color="amber" size="22px" />
              <div>
                <div class="text-weight-bold">Base Earning Rate</div>
                <div class="text-caption text-grey-5">Applied to every purchase</div>
              </div>
              <q-space />
              <q-chip
                :color="baseRule.is_active ? 'positive' : 'grey'"
                text-color="white"
                dense
                size="sm"
              >
                {{ baseRule.is_active ? 'Active' : 'Inactive' }}
              </q-chip>
            </div>
          </q-card-section>

          <q-separator color="white" opacity="0.06" />

          <q-card-section>
            <div class="earn-formula-row q-mb-lg">
              <div class="formula-label">Earn</div>
              <q-input
                v-model.number="baseRule.coins_per_lkr_display"
                type="number"
                dense
                outlined
                min="0.0001"
                step="0.0001"
                class="formula-input"
                style="max-width: 90px"
                aria-label="Coins earned"
              />
              <div class="formula-label">coin(s) per LKR</div>
              <q-input
                v-model.number="baseRule.lkr_per_coin"
                type="number"
                dense
                outlined
                min="1"
                step="1"
                class="formula-input"
                style="max-width: 90px"
                aria-label="LKR per coin"
              />
              <div class="formula-label">spent</div>
            </div>

            <div class="row items-center q-mb-md" style="gap: 12px">
              <q-input
                v-model.number="baseRule.min_spend"
                type="number"
                dense
                outlined
                label="Min. spend (LKR)"
                min="0"
                step="100"
                class="col"
                aria-label="Minimum spend"
              />
              <q-toggle
                v-model="baseRule.is_active"
                label="Enabled"
                color="positive"
                dense
              />
            </div>

            <div class="formula-preview text-caption q-mb-md">
              <q-icon name="info" size="14px" color="blue-4" class="q-mr-xs" />
              A customer spending LKR {{ (baseRule.lkr_per_coin || 5000).toLocaleString() }} earns
              <strong>{{ baseRule.coins_per_lkr_display || 1 }} coin(s)</strong>.
              <span v-if="baseRule.min_spend > 0">
                Minimum spend: LKR {{ Number(baseRule.min_spend).toLocaleString() }}.
              </span>
            </div>
          </q-card-section>

          <q-card-actions align="right" class="q-px-md q-pb-md">
            <q-btn
              unelevated
              no-caps
              color="primary"
              label="Save Base Rate"
              :loading="savingBase"
              @click="saveBaseRate"
            />
          </q-card-actions>
        </q-card>
      </div>

      <!-- ── Right column ───────────────────────────────────────────── -->
      <div class="col-12 col-md-7">
        <!-- Category Multipliers Card -->
        <q-card flat bordered class="rule-card q-mb-md">
          <q-card-section class="section-header">
            <div class="row items-center no-wrap" style="gap: 10px">
              <q-icon name="category" color="purple-4" size="22px" />
              <div>
                <div class="text-weight-bold">Category Multipliers</div>
                <div class="text-caption text-grey-5">
                  Boost coins for specific menu categories
                </div>
              </div>
              <q-space />
              <q-btn
                flat
                round
                dense
                icon="add"
                color="primary"
                aria-label="Add category multiplier"
                @click="addCategoryRow"
              />
            </div>
          </q-card-section>

          <q-separator color="white" opacity="0.06" />

          <q-card-section class="q-pa-none">
            <q-list separator>
              <q-item v-if="categoryRules.length === 0" class="text-grey-5 text-caption q-pa-md">
                <q-item-section>
                  No category multipliers yet. Click + to add one.
                </q-item-section>
              </q-item>

              <q-item v-for="(rule, idx) in categoryRules" :key="rule._key" class="q-py-sm">
                <q-item-section>
                  <div class="row items-center q-col-gutter-sm">
                    <div class="col">
                      <q-select
                        v-model="rule.category_id"
                        :options="categoryOptions"
                        option-value="id"
                        option-label="name"
                        emit-value
                        map-options
                        dense
                        outlined
                        label="Category"
                        aria-label="Select category"
                        :loading="categoriesLoading"
                      />
                    </div>
                    <div class="col-auto" style="min-width: 110px">
                      <q-input
                        v-model.number="rule.multiplier"
                        type="number"
                        dense
                        outlined
                        label="Multiplier"
                        min="0.1"
                        step="0.5"
                        suffix="x"
                        aria-label="Multiplier"
                      />
                    </div>
                    <div class="col-auto">
                      <q-toggle
                        v-model="rule.is_active"
                        dense
                        color="positive"
                        aria-label="Active"
                      />
                    </div>
                    <div class="col-auto">
                      <q-btn
                        flat
                        round
                        dense
                        icon="delete_outline"
                        color="negative"
                        size="sm"
                        aria-label="Remove rule"
                        @click="removeCategoryRule(idx)"
                      />
                    </div>
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
          </q-card-section>

          <q-card-actions v-if="categoryRules.length > 0" align="right" class="q-px-md q-pb-md">
            <q-btn
              unelevated
              no-caps
              color="purple"
              label="Save Category Rules"
              :loading="savingCategories"
              @click="saveCategoryRules"
            />
          </q-card-actions>
        </q-card>

        <!-- Item Overrides Card -->
        <q-card flat bordered class="rule-card">
          <q-card-section class="section-header">
            <div class="row items-center no-wrap" style="gap: 10px">
              <q-icon name="restaurant_menu" color="cyan-4" size="22px" />
              <div>
                <div class="text-weight-bold">Item-Specific Overrides</div>
                <div class="text-caption text-grey-5">
                  Fixed coin override for individual items
                </div>
              </div>
              <q-space />
              <q-btn
                flat
                round
                dense
                icon="add"
                color="primary"
                aria-label="Add item override"
                @click="addItemRow"
              />
            </div>
          </q-card-section>

          <q-separator color="white" opacity="0.06" />

          <q-card-section class="q-pa-none">
            <q-list separator>
              <q-item v-if="itemRules.length === 0" class="text-grey-5 text-caption q-pa-md">
                <q-item-section>
                  No item overrides yet. Click + to add one.
                </q-item-section>
              </q-item>

              <q-item v-for="(rule, idx) in itemRules" :key="rule._key" class="q-py-sm">
                <q-item-section>
                  <div class="row items-center q-col-gutter-sm">
                    <div class="col">
                      <q-select
                        v-model="rule.menu_item_id"
                        :options="filteredMenuItems(rule._itemSearch)"
                        option-value="id"
                        option-label="name"
                        emit-value
                        map-options
                        dense
                        outlined
                        label="Menu Item"
                        use-input
                        input-debounce="300"
                        aria-label="Select menu item"
                        :loading="itemsLoading"
                        @filter="(val, done) => filterItems(val, done, rule)"
                      />
                    </div>
                    <div class="col-auto" style="min-width: 120px">
                      <q-input
                        v-model.number="rule.multiplier"
                        type="number"
                        dense
                        outlined
                        label="Coins override"
                        min="1"
                        step="1"
                        aria-label="Coins override"
                      />
                    </div>
                    <div class="col-auto">
                      <q-toggle
                        v-model="rule.is_active"
                        dense
                        color="positive"
                        aria-label="Active"
                      />
                    </div>
                    <div class="col-auto">
                      <q-btn
                        flat
                        round
                        dense
                        icon="delete_outline"
                        color="negative"
                        size="sm"
                        aria-label="Remove override"
                        @click="removeItemRule(idx)"
                      />
                    </div>
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
          </q-card-section>

          <q-card-actions v-if="itemRules.length > 0" align="right" class="q-px-md q-pb-md">
            <q-btn
              unelevated
              no-caps
              color="cyan-8"
              label="Save Item Overrides"
              :loading="savingItems"
              @click="saveItemRules"
            />
          </q-card-actions>
        </q-card>
      </div>
    </div>

    <!-- Help Dialog -->
    <q-dialog v-model="showHelp">
      <q-card style="min-width: 360px; border-radius: 16px">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6 text-weight-bold">How Earning Rules Work</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-card-section class="text-body2 text-grey-3" style="line-height: 1.7">
          <p>
            <strong>Base Rate</strong> — the default coins earned on any purchase.
            E.g. "1 coin per LKR 5000" means a LKR 10,000 bill earns 2 coins.
          </p>
          <p>
            <strong>Category Multipliers</strong> — categories can multiply the base rate.
            E.g. a 2x multiplier on Beverages means drinks earn 2× the base coins.
          </p>
          <p>
            <strong>Item Overrides</strong> — individual items can have a fixed coin grant
            that replaces the calculated amount entirely.
          </p>
          <p class="text-caption text-grey-5">
            Rules are applied per order line: item override &gt; category multiplier &gt; base rate.
          </p>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat no-caps label="Got it" color="primary" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import PageHeader from 'components/common/PageHeader.vue'

const $q = useQuasar()

// ── State ─────────────────────────────────────────────────────────────────────
const showHelp = ref(false)
const categoriesLoading = ref(false)
const itemsLoading = ref(false)
const savingBase = ref(false)
const savingCategories = ref(false)
const savingItems = ref(false)

const categoryOptions = ref([])
const allMenuItems = ref([])

// Base rate rule
const baseRule = ref({
  id: null,
  coins_per_lkr: 0.0002, // 1 coin per 5000 LKR
  coins_per_lkr_display: 1, // human-readable "X coins"
  lkr_per_coin: 5000, // per how many LKR
  min_spend: 0,
  is_active: true,
})

// Category multiplier rows
const categoryRules = ref([])
let _catKeyCounter = 0

// Item override rows
const itemRules = ref([])
let _itemKeyCounter = 0

// ── Helpers ───────────────────────────────────────────────────────────────────
function getCompanyId() {
  return supabase.auth
    .getUser()
    .then(({ data }) => data.user?.user_metadata?.company_id || null)
    .catch(() => null)
}

// ── Load data ─────────────────────────────────────────────────────────────────
async function loadCategories() {
  categoriesLoading.value = true
  try {
    const { data } = await supabase.from('categories').select('id, name').order('name')
    categoryOptions.value = data || []
  } finally {
    categoriesLoading.value = false
  }
}

async function loadMenuItems() {
  itemsLoading.value = true
  try {
    const { data } = await supabase
      .from('menu_items')
      .select('id, name, category_id')
      .eq('is_available', true)
      .order('name')
    allMenuItems.value = data || []
  } finally {
    itemsLoading.value = false
  }
}

function filteredMenuItems(searchTerm) {
  if (!searchTerm) return allMenuItems.value
  const lower = searchTerm.toLowerCase()
  return allMenuItems.value.filter((item) => item.name?.toLowerCase().includes(lower))
}

function filterItems(val, done, rule) {
  rule._itemSearch = val
  done(() => {})
}

async function loadRules() {
  const companyId = await getCompanyId()
  if (!companyId) return

  const { data, error } = await supabase
    .from('loyalty_rules')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)

  if (error) {
    $q.notify({ type: 'negative', message: 'Failed to load earning rules' })
    return
  }

  const rows = data || []

  // Base rate
  const baseRow = rows.find((r) => r.rule_type === 'base_rate')
  if (baseRow) {
    const coinsPerLkr = baseRow.coins_per_lkr || 0.0002
    // Express as "X coins per Y LKR"
    // coins_per_lkr = coins_display / lkr_display  => lkr_display = 1 / coins_per_lkr (if coins_display = 1)
    baseRule.value = {
      id: baseRow.id,
      coins_per_lkr: coinsPerLkr,
      coins_per_lkr_display: 1,
      lkr_per_coin: Math.round(1 / coinsPerLkr),
      min_spend: baseRow.min_spend || 0,
      is_active: baseRow.is_active,
    }
  }

  // Category multipliers
  categoryRules.value = rows
    .filter((r) => r.rule_type === 'category_multiplier')
    .map((r) => ({
      ...r,
      _key: ++_catKeyCounter,
    }))

  // Item overrides
  itemRules.value = rows
    .filter((r) => r.rule_type === 'item_multiplier')
    .map((r) => ({
      ...r,
      _key: ++_itemKeyCounter,
      _itemSearch: '',
    }))
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function saveBaseRate() {
  savingBase.value = true
  try {
    const companyId = await getCompanyId()
    if (!companyId) {
      $q.notify({ type: 'negative', message: 'Could not determine company' })
      return
    }

    // Derive coins_per_lkr from the human-readable display values
    const coins = baseRule.value.coins_per_lkr_display || 1
    const lkr = baseRule.value.lkr_per_coin || 5000
    const coinsPerLkr = coins / lkr

    const payload = {
      company_id: companyId,
      rule_type: 'base_rate',
      coins_per_lkr: coinsPerLkr,
      min_spend: baseRule.value.min_spend || 0,
      is_active: baseRule.value.is_active,
      category_id: null,
      menu_item_id: null,
    }

    let error
    if (baseRule.value.id) {
      ;({ error } = await supabase
        .from('loyalty_rules')
        .update(payload)
        .eq('id', baseRule.value.id))
    } else {
      const res = await supabase.from('loyalty_rules').insert([payload]).select().single()
      error = res.error
      if (!error) baseRule.value.id = res.data.id
    }

    if (error) throw error

    $q.notify({ type: 'positive', message: 'Base earning rate saved', icon: 'toll' })
  } catch (err) {
    $q.notify({ type: 'negative', message: err?.message || 'Save failed' })
  } finally {
    savingBase.value = false
  }
}

async function saveCategoryRules() {
  savingCategories.value = true
  try {
    const companyId = await getCompanyId()
    if (!companyId) return

    const rows = categoryRules.value.filter((r) => r.category_id)

    for (const rule of rows) {
      const payload = {
        company_id: companyId,
        rule_type: 'category_multiplier',
        category_id: rule.category_id,
        multiplier: rule.multiplier || 1,
        is_active: rule.is_active,
        coins_per_lkr: null,
        menu_item_id: null,
      }
      if (rule.id) {
        await supabase.from('loyalty_rules').update(payload).eq('id', rule.id)
      } else {
        const { data } = await supabase
          .from('loyalty_rules')
          .insert([payload])
          .select()
          .single()
        if (data) rule.id = data.id
      }
    }

    $q.notify({ type: 'positive', message: 'Category multipliers saved', icon: 'category' })
  } catch (err) {
    $q.notify({ type: 'negative', message: err?.message || 'Save failed' })
  } finally {
    savingCategories.value = false
  }
}

async function saveItemRules() {
  savingItems.value = true
  try {
    const companyId = await getCompanyId()
    if (!companyId) return

    const rows = itemRules.value.filter((r) => r.menu_item_id)

    for (const rule of rows) {
      const payload = {
        company_id: companyId,
        rule_type: 'item_multiplier',
        menu_item_id: rule.menu_item_id,
        multiplier: rule.multiplier || 1,
        is_active: rule.is_active,
        coins_per_lkr: null,
        category_id: null,
      }
      if (rule.id) {
        await supabase.from('loyalty_rules').update(payload).eq('id', rule.id)
      } else {
        const { data } = await supabase
          .from('loyalty_rules')
          .insert([payload])
          .select()
          .single()
        if (data) rule.id = data.id
      }
    }

    $q.notify({ type: 'positive', message: 'Item overrides saved', icon: 'restaurant_menu' })
  } catch (err) {
    $q.notify({ type: 'negative', message: err?.message || 'Save failed' })
  } finally {
    savingItems.value = false
  }
}

// ── Add / Remove rows ─────────────────────────────────────────────────────────
function addCategoryRow() {
  categoryRules.value.push({
    _key: ++_catKeyCounter,
    id: null,
    category_id: null,
    multiplier: 2,
    is_active: true,
  })
}

function removeCategoryRule(idx) {
  const rule = categoryRules.value[idx]
  if (rule?.id) {
    supabase.from('loyalty_rules').delete().eq('id', rule.id)
  }
  categoryRules.value.splice(idx, 1)
}

function addItemRow() {
  itemRules.value.push({
    _key: ++_itemKeyCounter,
    id: null,
    menu_item_id: null,
    multiplier: 5,
    is_active: true,
    _itemSearch: '',
  })
}

function removeItemRule(idx) {
  const rule = itemRules.value[idx]
  if (rule?.id) {
    supabase.from('loyalty_rules').delete().eq('id', rule.id)
  }
  itemRules.value.splice(idx, 1)
}

// ── Init ──────────────────────────────────────────────────────────────────────
onMounted(() => {
  loadCategories()
  loadMenuItems()
  loadRules()
})
</script>

<style lang="scss" scoped>
.earning-rules-page {
  max-width: 1200px;
  margin: 0 auto;
}

.rule-card {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.section-header {
  padding: 16px 20px;
}

.earn-formula-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 16px;
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.15);
  border-radius: 10px;
}

.formula-label {
  font-size: 0.9rem;
  color: #9ca3af;
  white-space: nowrap;
}

.formula-input {
  :deep(.q-field__control) {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    color: #f5f5f5;
  }
  :deep(.q-field__native) {
    color: #f5f5f5;
    font-weight: 700;
    text-align: center;
  }
}

.formula-preview {
  color: #9ca3af;
  padding: 8px 12px;
  background: rgba(59, 130, 246, 0.06);
  border-radius: 8px;
  border: 1px solid rgba(59, 130, 246, 0.1);
}
</style>
