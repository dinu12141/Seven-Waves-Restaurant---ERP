<template>
  <div>
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-btn color="primary" icon="add" label="Add Commission Package" @click="openPkg()" no-caps />
      <q-space />
      <q-input
        dark
        dense
        outlined
        v-model="search"
        placeholder="Search packages..."
        class="col-12 col-sm-4"
        clearable
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
    </div>

    <q-table
      dark
      flat
      bordered
      :rows="packages"
      :columns="pkgColumns"
      row-key="id"
      :loading="loading"
      :filter="search"
      :pagination="{ rowsPerPage: 15 }"
      class="erp-data-grid"
    >
      <template #body-cell-type="props">
        <q-td :props="props">
          <q-badge
            :color="typeColor(props.row.package_type)"
            :label="props.row.package_type"
            class="text-capitalize"
          />
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn
            flat
            dense
            icon="edit"
            color="amber"
            size="sm"
            @click="openPkg(props.row)"
            no-caps
          />
          <q-btn
            flat
            dense
            icon="rule"
            color="cyan"
            size="sm"
            @click="openRules(props.row)"
            label="Rules"
            no-caps
          />
        </q-td>
      </template>
    </q-table>

    <!-- Package Dialog -->
    <q-dialog v-model="showPkgDialog" persistent>
      <q-card style="min-width: 500px; background: var(--erp-bg-form-card, #111827); color: #fff">
        <q-bar class="bg-grey-10"
          ><q-icon name="monetization_on" />
          <div class="q-ml-sm">Commission Package</div>
          <q-space /><q-btn dense flat icon="close" @click="showPkgDialog = false"
        /></q-bar>
        <q-card-section class="q-gutter-md">
          <q-input
            dark
            outlined
            v-model="pkgForm.name"
            label="Package Name *"
            :rules="[(v) => !!v || 'Required']"
          />
          <q-input
            dark
            outlined
            v-model="pkgForm.code"
            label="Code *"
            :rules="[(v) => !!v || 'Required']"
          />
          <q-select
            dark
            outlined
            v-model="pkgForm.package_type"
            :options="['sales', 'recovery', 'hotline', 'installation']"
            label="Type *"
          />
          <q-input
            dark
            outlined
            v-model="pkgForm.description"
            label="Description"
            type="textarea"
            rows="2"
          />
          <div class="row justify-end q-gutter-sm">
            <q-btn flat label="Cancel" @click="showPkgDialog = false" color="grey" no-caps />
            <q-btn
              color="primary"
              label="Save"
              icon="save"
              @click="savePkg"
              :loading="saving"
              no-caps
            />
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Rules Dialog -->
    <q-dialog v-model="showRulesDialog" persistent>
      <q-card style="min-width: 800px; background: var(--erp-bg-form-card, #111827); color: #fff">
        <q-bar class="bg-grey-10"
          ><q-icon name="rule" />
          <div class="q-ml-sm">Rules — {{ selectedPkg?.name }}</div>
          <q-space /><q-btn dense flat icon="close" @click="showRulesDialog = false"
        /></q-bar>
        <q-card-section>
          <q-btn
            color="primary"
            icon="add"
            label="Add Rule"
            @click="addRule()"
            class="q-mb-md"
            dense
            no-caps
          />
          <q-table
            dark
            flat
            bordered
            dense
            :rows="rules"
            :columns="ruleColumns"
            row-key="id"
            :pagination="{ rowsPerPage: 20 }"
          >
            <template #body-cell-type="props">
              <q-td :props="props"
                ><q-badge
                  color="deep-purple"
                  :label="props.row.rule_type?.replace('_', ' ')"
                  class="text-capitalize"
              /></q-td>
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props" class="q-gutter-xs">
                <q-btn
                  flat
                  round
                  dense
                  icon="delete"
                  color="red"
                  size="sm"
                  @click="deleteRule(props.row.id)"
                />
              </q-td>
            </template>
          </q-table>
        </q-card-section>

        <!-- Add Rule sub-dialog -->
        <q-dialog v-model="showAddRule">
          <q-card style="min-width: 500px; background: #1a1f2e; color: #fff">
            <q-card-section class="q-gutter-md">
              <q-select
                dark
                outlined
                v-model="ruleForm.rule_type"
                :options="ruleTypes"
                label="Rule Type *"
                emit-value
                map-options
              />
              <q-input dark outlined v-model="ruleForm.tier_name" label="Tier Name" />
              <div class="row q-col-gutter-md">
                <div class="col-4">
                  <q-input
                    dark
                    outlined
                    v-model.number="ruleForm.min_units"
                    label="Min Units"
                    type="number"
                  />
                </div>
                <div class="col-4">
                  <q-input
                    dark
                    outlined
                    v-model.number="ruleForm.max_units"
                    label="Max Units"
                    type="number"
                  />
                </div>
                <div class="col-4">
                  <q-input
                    dark
                    outlined
                    v-model.number="ruleForm.rate_per_unit"
                    label="Rate/Unit"
                    type="number"
                  />
                </div>
              </div>
              <div class="row q-col-gutter-md">
                <div class="col-4">
                  <q-input
                    dark
                    outlined
                    v-model.number="ruleForm.fixed_amount"
                    label="Fixed Amount"
                    type="number"
                  />
                </div>
                <div class="col-4">
                  <q-input
                    dark
                    outlined
                    v-model.number="ruleForm.percentage"
                    label="Percentage %"
                    type="number"
                  />
                </div>
                <div class="col-4">
                  <q-select
                    dark
                    outlined
                    v-model="ruleForm.applies_to"
                    :options="['self', 'team', 'branch', 'district', 'region', 'zone']"
                    label="Applies To"
                  />
                </div>
              </div>
            </q-card-section>
            <q-card-actions align="right" class="q-pa-md">
              <q-btn flat label="Cancel" v-close-popup color="grey" no-caps />
              <q-btn color="primary" label="Add Rule" icon="add" @click="saveRule" no-caps />
            </q-card-actions>
          </q-card>
        </q-dialog>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const search = ref('')
const packages = ref([])
const rules = ref([])
const selectedPkg = ref(null)
const showPkgDialog = ref(false)
const showRulesDialog = ref(false)
const showAddRule = ref(false)

const pkgForm = reactive({ id: null, name: '', code: '', package_type: 'sales', description: '' })
const ruleForm = reactive({
  rule_type: 'direct_commission',
  tier_name: '',
  min_units: 0,
  max_units: null,
  rate_per_unit: 0,
  fixed_amount: 0,
  percentage: 0,
  applies_to: 'self',
})

const ruleTypes = [
  { label: 'Direct Commission', value: 'direct_commission' },
  { label: 'Leader Commission', value: 'leader_commission' },
  { label: 'Up-line Commission', value: 'upline_commission' },
  { label: 'Fuel Allowance', value: 'fuel_allowance' },
  { label: 'Installation Incentive', value: 'installation_incentive' },
  { label: 'Tier MPO', value: 'tier_mpo' },
  { label: 'Tier BSM', value: 'tier_bsm' },
  { label: 'Other', value: 'other' },
]

const pkgColumns = [
  { name: 'name', label: 'Package', align: 'left', field: 'name', sortable: true },
  { name: 'code', label: 'Code', align: 'left', field: 'code' },
  { name: 'type', label: 'Type', align: 'center', field: 'package_type' },
  { name: 'actions', label: '', align: 'center' },
]

const ruleColumns = [
  { name: 'type', label: 'Rule Type', align: 'left', field: 'rule_type' },
  { name: 'tier', label: 'Tier', align: 'left', field: 'tier_name' },
  { name: 'min', label: 'Min Units', align: 'right', field: 'min_units' },
  { name: 'max', label: 'Max Units', align: 'right', field: 'max_units' },
  { name: 'rate', label: 'Rate/Unit', align: 'right', field: 'rate_per_unit' },
  { name: 'fixed', label: 'Fixed', align: 'right', field: 'fixed_amount' },
  { name: 'pct', label: '%', align: 'right', field: 'percentage' },
  { name: 'actions', label: '', align: 'center' },
]

function typeColor(t) {
  return (
    { sales: 'deep-orange', recovery: 'purple', hotline: 'cyan', installation: 'teal' }[t] || 'grey'
  )
}

async function loadPackages() {
  loading.value = true
  const { data } = await supabase
    .from('commission_packages')
    .select('*')
    .eq('is_active', true)
    .order('name')
  packages.value = data || []
  loading.value = false
}

function openPkg(row) {
  if (row) {
    Object.keys(pkgForm).forEach((k) => {
      pkgForm[k] = row[k] ?? ''
    })
    pkgForm.id = row.id
  } else {
    Object.assign(pkgForm, { id: null, name: '', code: '', package_type: 'sales', description: '' })
  }
  showPkgDialog.value = true
}

async function savePkg() {
  saving.value = true
  try {
    const p = { ...pkgForm }
    const id = p.id
    delete p.id
    p.company_id = authStore.currentBranch?.company_id
    p.created_by = authStore.user?.id
    if (id) {
      await supabase.from('commission_packages').update(p).eq('id', id)
    } else {
      await supabase.from('commission_packages').insert(p)
    }
    $q.notify({ type: 'positive', message: 'Package saved' })
    showPkgDialog.value = false
    loadPackages()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

async function openRules(pkg) {
  selectedPkg.value = pkg
  const { data } = await supabase
    .from('commission_rules')
    .select('*')
    .eq('package_id', pkg.id)
    .order('sort_order')
  rules.value = data || []
  showRulesDialog.value = true
}

function addRule() {
  Object.assign(ruleForm, {
    rule_type: 'direct_commission',
    tier_name: '',
    min_units: 0,
    max_units: null,
    rate_per_unit: 0,
    fixed_amount: 0,
    percentage: 0,
    applies_to: 'self',
  })
  showAddRule.value = true
}

async function saveRule() {
  try {
    await supabase
      .from('commission_rules')
      .insert({ ...ruleForm, package_id: selectedPkg.value.id })
    $q.notify({ type: 'positive', message: 'Rule added' })
    showAddRule.value = false
    openRules(selectedPkg.value)
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  }
}

async function deleteRule(id) {
  await supabase.from('commission_rules').delete().eq('id', id)
  openRules(selectedPkg.value)
}

onMounted(() => loadPackages())
</script>

<style scoped>
.erp-data-grid {
  background: var(--erp-bg-form-card, #111827);
  border-radius: 12px;
}
</style>
