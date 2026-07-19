<template>
  <q-page class="printers-page q-pa-md">
    <PageHeader
      title="Printer Management"
      subtitle="Configure receipt and kitchen printers for each branch"
      show-back
      back-route="/admin"
      breadcrumb="SYSTEM CONFIG"
    >
      <template #actions>
        <q-btn
          unelevated
          color="primary"
          icon="add"
          label="Add Printer"
          @click="openAdd"
          class="add-btn"
        />
      </template>
    </PageHeader>

    <!-- Stats row -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-6 col-md-3">
        <div class="stat-card">
          <q-icon name="print" size="24px" color="blue-5" class="q-mb-xs" />
          <div class="stat-number">{{ printers.length }}</div>
          <div class="stat-label">Total Printers</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card">
          <q-icon name="check_circle" size="24px" color="green-5" class="q-mb-xs" />
          <div class="stat-number">{{ activePrinters }}</div>
          <div class="stat-label">Active</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card">
          <q-icon name="restaurant" size="24px" color="orange-5" class="q-mb-xs" />
          <div class="stat-number">{{ kitchenPrinters }}</div>
          <div class="stat-label">Kitchen Printers</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card">
          <q-icon name="receipt" size="24px" color="purple-5" class="q-mb-xs" />
          <div class="stat-number">{{ receiptPrinters }}</div>
          <div class="stat-label">Receipt Printers</div>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="row q-gutter-sm q-mb-md">
      <q-input
        v-model="search"
        dense
        outlined
        placeholder="Search printers..."
        style="min-width: 230px"
      >
        <template v-slot:prepend><q-icon name="search" /></template>
      </q-input>

      <q-select
        v-model="typeFilter"
        :options="typeOptions"
        dense
        outlined
        options-dense
        style="min-width: 160px"
        emit-value
        map-options
        behavior="menu"
      />

      <q-select
        v-model="activeFilter"
        :options="[
          { label: 'All', value: null },
          { label: 'Active', value: true },
          { label: 'Inactive', value: false },
        ]"
        dense
        outlined
        options-dense
        style="min-width: 130px"
        emit-value
        map-options
        behavior="menu"
      />
    </div>

    <!-- Table -->
    <div class="printers-table-wrap">
      <q-table
        :rows="filteredPrinters"
        :columns="columns"
        row-key="id"
        flat
        :loading="loading"
        :rows-per-page-options="[10, 20, 50]"
        class="printers-table"
      >
        <!-- Name col -->
        <template v-slot:body-cell-name="props">
          <q-td :props="props">
            <div class="row items-center q-gutter-x-sm">
              <q-icon
                :name="printerIcon(props.row.type)"
                size="20px"
                :color="printerColor(props.row.type)"
              />
              <div>
                <div class="text-weight-bold text-body2">{{ props.row.name }}</div>
                <div v-if="props.row.notes" class="text-caption text-grey-6">
                  {{ props.row.notes }}
                </div>
              </div>
              <q-badge v-if="props.row.is_default" color="primary" class="q-ml-xs" dense
                >default</q-badge
              >
            </div>
          </q-td>
        </template>

        <!-- Type col -->
        <template v-slot:body-cell-type="props">
          <q-td :props="props">
            <q-chip
              dense
              size="sm"
              :color="printerColor(props.row.type)"
              text-color="white"
              :icon="printerIcon(props.row.type)"
            >
              {{ props.row.type }}
            </q-chip>
          </q-td>
        </template>

        <!-- Connection col -->
        <template v-slot:body-cell-connection="props">
          <q-td :props="props">
            <div v-if="props.row.ip_address" class="font-mono text-caption">
              {{ props.row.ip_address }}:{{ props.row.port }}
            </div>
            <div v-else class="text-grey-5 text-caption">—</div>
          </q-td>
        </template>

        <!-- Paper col -->
        <template v-slot:body-cell-paper_width="props">
          <q-td :props="props">
            <span>{{ props.row.paper_width }}mm</span>
          </q-td>
        </template>

        <!-- Active col -->
        <template v-slot:body-cell-is_active="props">
          <q-td :props="props">
            <q-toggle
              :model-value="props.row.is_active"
              color="green"
              @update:model-value="toggleActive(props.row)"
              dense
            />
          </q-td>
        </template>

        <!-- Actions col -->
        <template v-slot:body-cell-actions="props">
          <q-td :props="props">
            <div class="row items-center q-gutter-xs">
              <q-btn
                flat
                round
                dense
                icon="edit"
                color="blue-5"
                size="sm"
                @click="openEdit(props.row)"
              >
                <q-tooltip>Edit</q-tooltip>
              </q-btn>
              <q-btn
                flat
                round
                dense
                icon="print"
                color="grey-5"
                size="sm"
                @click="testPrint(props.row)"
              >
                <q-tooltip>Test Print</q-tooltip>
              </q-btn>
              <q-btn
                flat
                round
                dense
                icon="delete"
                color="negative"
                size="sm"
                @click="deletePrinter(props.row)"
              >
                <q-tooltip>Delete</q-tooltip>
              </q-btn>
            </div>
          </q-td>
        </template>

        <!-- Empty state -->
        <template v-slot:no-data>
          <div class="column items-center q-pa-xl full-width">
            <q-icon name="print_disabled" size="56px" color="grey-8" />
            <div class="text-grey-6 q-mt-sm text-subtitle1">No printers configured</div>
            <q-btn
              unelevated
              flat
              color="primary"
              label="Add your first printer"
              icon="add"
              class="q-mt-md"
              @click="openAdd"
            />
          </div>
        </template>
      </q-table>
    </div>

    <!-- Add / Edit Dialog -->
    <q-dialog v-model="dialogOpen" persistent>
      <q-card class="printer-dialog">
        <q-card-section class="dialog-header row items-center justify-between">
          <div class="text-h6">
            {{ isEditing ? 'Edit Printer' : 'Add New Printer' }}
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>

        <q-separator />

        <q-card-section class="q-gutter-y-sm q-pt-md">
          <q-form @submit.prevent="savePrinter" class="q-gutter-y-sm">
            <!-- Name -->
            <q-input
              v-model="form.name"
              label="Printer Name *"
              outlined
              dense
              :rules="[(v) => !!v || 'Name is required']"
            >
              <template v-slot:prepend><q-icon name="label" /></template>
            </q-input>

            <!-- Type + Branch row -->
            <div class="row q-gutter-sm">
              <q-select
                v-model="form.type"
                :options="typeOptionsRaw"
                emit-value
                map-options
                label="Printer Type *"
                outlined
                dense
                options-dense
                class="col"
                :rules="[(v) => !!v || 'Type required']"
              >
                <template v-slot:prepend>
                  <q-icon :name="printerIcon(form.type)" />
                </template>
              </q-select>

              <q-select
                v-model="form.branch_id"
                :options="branchOptions"
                emit-value
                map-options
                label="Branch *"
                outlined
                dense
                options-dense
                class="col"
                :loading="loadingBranches"
                :rules="[(v) => !!v || 'Branch required']"
              >
                <template v-slot:prepend><q-icon name="store" /></template>
              </q-select>
            </div>

            <!-- Kitchen (only for kitchen type) -->
            <q-select
              v-if="form.type === 'kitchen'"
              v-model="form.kitchen_id"
              :options="kitchenOptions"
              emit-value
              map-options
              label="Kitchen Station"
              outlined
              dense
              options-dense
              clearable
              :loading="loadingKitchens"
            >
              <template v-slot:prepend><q-icon name="restaurant" /></template>
            </q-select>

            <!-- Network section -->
            <div class="text-caption text-grey-6 q-mt-sm">NETWORK CONNECTION (optional)</div>
            <div class="row q-gutter-sm">
              <q-input
                v-model="form.ip_address"
                label="IP Address"
                outlined
                dense
                class="col"
                placeholder="192.168.1.100"
              >
                <template v-slot:prepend><q-icon name="wifi" /></template>
              </q-input>
              <q-input
                v-model.number="form.port"
                label="Port"
                outlined
                dense
                type="number"
                style="max-width: 120px"
              />
            </div>

            <!-- Paper width + default row -->
            <div class="row q-gutter-sm items-center">
              <q-select
                v-model.number="form.paper_width"
                :options="[
                  { label: '58mm (narrow)', value: 58 },
                  { label: '80mm (standard)', value: 80 },
                ]"
                emit-value
                map-options
                label="Paper Width"
                outlined
                dense
                options-dense
                class="col"
              />
              <q-toggle
                v-model="form.is_default"
                label="Set as Default"
                color="primary"
                class="q-ml-sm"
              />
            </div>

            <!-- Notes -->
            <q-input
              v-model="form.notes"
              label="Notes (optional)"
              outlined
              dense
              autogrow
              placeholder="e.g. Near fry station, USB connected"
            />

            <!-- Active toggle -->
            <q-toggle v-model="form.is_active" label="Active" color="green" />
          </q-form>
        </q-card-section>

        <q-separator />

        <q-card-actions align="right" class="q-pa-md q-gutter-sm">
          <q-btn flat label="Cancel" color="grey" v-close-popup />
          <q-btn
            unelevated
            :label="isEditing ? 'Save Changes' : 'Add Printer'"
            color="primary"
            icon="check"
            :loading="saving"
            @click="savePrinter"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import PageHeader from 'components/common/PageHeader.vue'

const $q = useQuasar()
const authStore = useAuthStore()

// ── State ──────────────────────────────────────────────────────────────────────
const printers = ref([])
const loading = ref(false)
const saving = ref(false)
const dialogOpen = ref(false)
const isEditing = ref(false)
const search = ref('')
const typeFilter = ref(null)
const activeFilter = ref(null)

// Branch / Kitchen helpers
const branches = ref([])
const kitchens = ref([])
const loadingBranches = ref(false)
const loadingKitchens = ref(false)

const form = reactive({
  id: null,
  branch_id: null,
  kitchen_id: null,
  name: '',
  type: 'receipt',
  ip_address: '',
  port: 9100,
  paper_width: 80,
  is_default: false,
  is_active: true,
  notes: '',
})

// ── Options ────────────────────────────────────────────────────────────────────
const typeOptionsRaw = [
  { label: 'Receipt', value: 'receipt' },
  { label: 'Kitchen', value: 'kitchen' },
  { label: 'Label', value: 'label' },
  { label: 'PDF / Virtual', value: 'pdf' },
]
const typeOptions = [{ label: 'All Types', value: null }, ...typeOptionsRaw]

const branchOptions = computed(() => branches.value.map((b) => ({ label: b.name, value: b.id })))
const kitchenOptions = computed(() => kitchens.value.map((k) => ({ label: k.name, value: k.id })))

// ── Computed ───────────────────────────────────────────────────────────────────
const activePrinters = computed(() => printers.value.filter((p) => p.is_active).length)
const kitchenPrinters = computed(() => printers.value.filter((p) => p.type === 'kitchen').length)
const receiptPrinters = computed(() => printers.value.filter((p) => p.type === 'receipt').length)

const filteredPrinters = computed(() => {
  let list = printers.value
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter((p) => p.name.toLowerCase().includes(q) || p.ip_address?.includes(q))
  }
  if (typeFilter.value) list = list.filter((p) => p.type === typeFilter.value)
  if (activeFilter.value !== null) list = list.filter((p) => p.is_active === activeFilter.value)
  return list
})

// ── Table Columns ──────────────────────────────────────────────────────────────
const columns = [
  { name: 'name', label: 'Printer', align: 'left', field: 'name', sortable: true },
  { name: 'type', label: 'Type', align: 'center', field: 'type', sortable: true },
  { name: 'connection', label: 'Connection', align: 'left', field: 'ip_address' },
  { name: 'paper_width', label: 'Paper', align: 'center', field: 'paper_width', sortable: true },
  { name: 'is_active', label: 'Active', align: 'center', field: 'is_active' },
  { name: 'actions', label: 'Actions', align: 'center', field: 'actions' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────
function printerIcon(type) {
  switch (type) {
    case 'kitchen':
      return 'restaurant'
    case 'label':
      return 'label'
    case 'pdf':
      return 'picture_as_pdf'
    default:
      return 'receipt_long'
  }
}

function printerColor(type) {
  switch (type) {
    case 'kitchen':
      return 'orange-7'
    case 'label':
      return 'teal-7'
    case 'pdf':
      return 'blue-7'
    default:
      return 'purple-7'
  }
}

// ── Data Fetching ──────────────────────────────────────────────────────────────
async function fetchPrinters() {
  loading.value = true
  const { data, error } = await supabase
    .from('printers')
    .select('*, branch:branches(name), kitchen:kitchens(name)')
    .order('created_at', { ascending: false })

  if (!error) printers.value = data ?? []
  else $q.notify({ type: 'negative', message: 'Failed to load printers' })
  loading.value = false
}

async function fetchBranches() {
  loadingBranches.value = true
  const { data } = await supabase
    .from('branches')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
  branches.value = data ?? []
  loadingBranches.value = false
}

async function fetchKitchens(branchId) {
  loadingKitchens.value = true
  let query = supabase.from('kitchens').select('id, name, branch_id').eq('is_active', true)
  if (branchId) query = query.eq('branch_id', branchId)
  const { data } = await query.order('name')
  kitchens.value = data ?? []
  loadingKitchens.value = false
}

// ── Dialog ─────────────────────────────────────────────────────────────────────
function resetForm() {
  Object.assign(form, {
    id: null,
    branch_id: authStore.currentBranch?.id ?? null,
    kitchen_id: null,
    name: '',
    type: 'receipt',
    ip_address: '',
    port: 9100,
    paper_width: 80,
    is_default: false,
    is_active: true,
    notes: '',
  })
}

function openAdd() {
  isEditing.value = false
  resetForm()
  dialogOpen.value = true
}

function openEdit(row) {
  isEditing.value = true
  Object.assign(form, {
    id: row.id,
    branch_id: row.branch_id,
    kitchen_id: row.kitchen_id,
    name: row.name,
    type: row.type,
    ip_address: row.ip_address ?? '',
    port: row.port ?? 9100,
    paper_width: row.paper_width ?? 80,
    is_default: row.is_default ?? false,
    is_active: row.is_active ?? true,
    notes: row.notes ?? '',
  })
  if (row.branch_id) fetchKitchens(row.branch_id)
  dialogOpen.value = true
}

async function savePrinter() {
  if (!form.name || !form.branch_id || !form.type) {
    $q.notify({ type: 'warning', message: 'Please fill in all required fields' })
    return
  }

  saving.value = true
  try {
    const payload = {
      branch_id: form.branch_id,
      kitchen_id: form.kitchen_id || null,
      name: form.name.trim(),
      type: form.type,
      ip_address: form.ip_address || null,
      port: form.port,
      paper_width: form.paper_width,
      is_default: form.is_default,
      is_active: form.is_active,
      notes: form.notes || null,
    }

    if (isEditing.value && form.id) {
      const { error } = await supabase.from('printers').update(payload).eq('id', form.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Printer updated', icon: 'print' })
    } else {
      const { error } = await supabase.from('printers').insert(payload)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Printer added', icon: 'print' })
    }

    dialogOpen.value = false
    await fetchPrinters()
  } catch (e) {
    $q.notify({ type: 'negative', message: e?.message ?? 'Failed to save' })
  } finally {
    saving.value = false
  }
}

async function toggleActive(row) {
  const { error } = await supabase
    .from('printers')
    .update({ is_active: !row.is_active })
    .eq('id', row.id)

  if (!error) {
    row.is_active = !row.is_active
  } else {
    $q.notify({ type: 'negative', message: 'Failed to update' })
  }
}

async function deletePrinter(row) {
  $q.dialog({
    title: 'Delete Printer',
    message: `Remove "${row.name}"? This cannot be undone.`,
    cancel: { label: 'Cancel', flat: true, color: 'grey' },
    ok: { label: 'Delete', color: 'negative', unelevated: true },
    persistent: true,
  }).onOk(async () => {
    const { error } = await supabase.from('printers').delete().eq('id', row.id)
    if (!error) {
      printers.value = printers.value.filter((p) => p.id !== row.id)
      $q.notify({ type: 'info', message: 'Printer removed', icon: 'delete' })
    } else {
      $q.notify({ type: 'negative', message: 'Failed to delete' })
    }
  })
}

function testPrint(row) {
  $q.notify({
    type: 'info',
    icon: 'print',
    message: `Test print sent to "${row.name}"`,
    caption: row.ip_address ? `${row.ip_address}:${row.port}` : 'Local / USB',
    position: 'top-right',
    timeout: 2500,
  })
  // TODO: When print-agent is available, POST to http://localhost:6001/test-print
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────
onMounted(async () => {
  await Promise.all([fetchPrinters(), fetchBranches()])
  // Pre-fetch kitchens for current branch
  const branchId = authStore.currentBranch?.id
  if (branchId) fetchKitchens(branchId)
})
</script>

<style scoped>
.printers-page {
  min-height: 100vh;
}

.add-btn {
  border-radius: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

/* ── Stats ── */
.stat-card {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
}
.stat-number {
  font-size: 2rem;
  font-weight: 800;
  color: var(--erp-text-primary);
  line-height: 1.1;
}
.stat-label {
  font-size: 0.75rem;
  color: var(--erp-text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 2px;
}

/* ── Table ── */
.printers-table-wrap {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: 12px;
  overflow: hidden;
}

.printers-table {
  background: transparent;
}
:deep(.q-table th) {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--erp-text-secondary);
  font-weight: 700;
  border-bottom: 1px solid var(--erp-border);
}
:deep(.q-table tbody tr) {
  border-bottom: 1px solid var(--erp-border);
}
:deep(.q-table tbody tr:hover td) {
  background: var(--erp-bg-hover);
}

/* ── Dialog ── */
.printer-dialog {
  min-width: 560px;
  max-width: 640px;
}

.font-mono {
  font-family: 'Roboto Mono', monospace;
}
</style>
