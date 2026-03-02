<template>
  <q-page class="tables-mgmt-page q-pa-md">
    <!-- Page Header -->
    <PageHeader
      title="Table Management"
      subtitle="Register tables, generate QR codes & manage table devices"
      show-back
      back-route="/admin"
    >
      <template #actions>
        <q-btn
          id="add-table-btn"
          color="primary"
          icon="add"
          label="Add Table"
          no-caps
          unelevated
          @click="openAddTable"
        />
      </template>
    </PageHeader>

    <!-- Stats Row -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-6 col-md-3">
        <div class="stat-card">
          <q-icon name="table_restaurant" size="28px" color="primary" class="q-mb-sm" />
          <div class="stat-value">{{ tables.length }}</div>
          <div class="stat-label">Total Tables</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card">
          <q-icon name="qr_code_2" size="28px" color="positive" class="q-mb-sm" />
          <div class="stat-value">{{ tables.filter((t) => t.has_qr).length }}</div>
          <div class="stat-label">With QR</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card">
          <q-icon name="devices" size="28px" color="orange" class="q-mb-sm" />
          <div class="stat-value">{{ tables.filter((t) => t.has_device).length }}</div>
          <div class="stat-label">With Device</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card">
          <q-icon name="check_circle" size="28px" color="teal" class="q-mb-sm" />
          <div class="stat-value">{{ tables.filter((t) => t.status === 'available').length }}</div>
          <div class="stat-label">Available</div>
        </div>
      </div>
    </div>

    <!-- Branch Filter -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="q-py-sm">
        <div class="row q-col-gutter-sm items-center">
          <div class="col-12 col-md-4">
            <q-select
              v-model="selectedBranch"
              :options="branchOptions"
              label="Filter by Branch"
              dense
              outlined
              emit-value
              map-options
              clearable
              @update:model-value="loadTables"
            />
          </div>
          <div class="col-12 col-md-4">
            <q-input v-model="search" dense outlined placeholder="Search tables..." clearable>
              <template #append><q-icon name="search" /></template>
            </q-input>
          </div>
          <div class="col-12 col-md-4 text-right">
            <q-btn
              flat
              icon="grid_view"
              label="Live Chart"
              no-caps
              color="primary"
              class="q-mr-sm"
              @click="floorPlanDialog = true"
            />
            <q-btn
              flat
              icon="refresh"
              label="Refresh"
              no-caps
              color="grey-7"
              @click="loadTables"
              :loading="loadingTables"
            />
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Tables Grid -->
    <div v-if="loadingTables" class="text-center q-py-xl">
      <q-spinner-dots color="primary" size="48px" />
      <div class="text-grey-6 q-mt-md">Loading tables...</div>
    </div>

    <div v-else-if="filteredTables.length === 0" class="empty-state">
      <q-icon name="table_restaurant" size="64px" color="grey-5" />
      <div class="text-h6 text-grey-6 q-mt-md">No tables found</div>
      <div class="text-caption text-grey-5">Add your first table to get started</div>
      <q-btn
        color="primary"
        icon="add"
        label="Add Table"
        no-caps
        class="q-mt-lg"
        @click="openAddTable"
      />
    </div>

    <div v-else class="tables-grid">
      <div
        v-for="table in filteredTables"
        :key="table.id"
        class="tbl-card"
        :class="'tbl-card--' + table.status"
      >
        <!-- Top bar: actions + status dot -->
        <div class="tbl-card__topbar">
          <div class="tbl-card__actions-top">
            <button class="tbl-icon-btn" title="Edit" @click="editTable(table)">
              <q-icon name="edit" size="14px" />
            </button>
            <button
              class="tbl-icon-btn tbl-icon-btn--danger"
              title="Delete"
              @click="deleteTable(table)"
            >
              <q-icon name="delete" size="14px" />
            </button>
          </div>
          <div class="tbl-status-dot" :class="'tbl-status-dot--' + table.status" />
        </div>

        <!-- Main info -->
        <div class="tbl-card__body">
          <q-icon
            name="table_restaurant"
            :class="'tbl-icon--' + table.status"
            size="28px"
            class="tbl-main-icon"
          />
          <div class="tbl-name">{{ table.table_number }}</div>
          <div class="tbl-meta">
            {{ table.section || 'General' }}&nbsp;·&nbsp;<q-icon
              name="people"
              size="11px"
            />&nbsp;{{ table.capacity }}
          </div>
        </div>

        <!-- Indicator chips -->
        <div class="tbl-card__chips">
          <span class="tbl-chip" :class="table.has_qr ? 'tbl-chip--green' : 'tbl-chip--muted'">
            <q-icon :name="table.has_qr ? 'qr_code_2' : 'qr_code'" size="11px" />
            <q-tooltip>{{ table.has_qr ? 'QR Ready' : 'No QR' }}</q-tooltip>
          </span>
          <span class="tbl-chip" :class="table.has_device ? 'tbl-chip--orange' : 'tbl-chip--muted'">
            <q-icon :name="table.has_device ? 'devices' : 'tv_off'" size="11px" />
            <q-tooltip>{{ table.has_device ? 'Device Linked' : 'No Device' }}</q-tooltip>
          </span>
        </div>

        <!-- Bottom action buttons -->
        <div class="tbl-card__footer">
          <button
            class="tbl-foot-btn tbl-foot-btn--green"
            :class="{ 'tbl-foot-btn--disabled': !table.has_qr }"
            :disabled="!table.has_qr"
            title="View QR Code"
            @click="table.has_qr ? viewQR(table) : null"
          >
            <q-icon name="qr_code_scanner" size="14px" />
          </button>
          <button
            class="tbl-foot-btn tbl-foot-btn--blue"
            title="Generate / Regenerate QR"
            @click="generateQR(table)"
          >
            <q-icon name="qr_code_2" size="14px" />
            <q-spinner-dots v-if="table.generatingQr" size="10px" />
          </button>
          <button
            class="tbl-foot-btn tbl-foot-btn--orange"
            title="Device Setup"
            @click="openDeviceDialog(table)"
          >
            <q-icon name="phonelink_setup" size="14px" />
          </button>
        </div>
      </div>
    </div>

    <!-- ─── Add / Edit Table Dialog ─── -->
    <q-dialog v-model="tableDialog" persistent>
      <q-card style="min-width: 480px; max-width: 560px">
        <q-card-section class="dialog-header">
          <q-icon :name="editingTable ? 'edit' : 'add_circle'" size="24px" class="q-mr-sm" />
          {{ editingTable ? 'Edit Table' : 'Add New Table' }}
          <q-btn flat round dense icon="close" class="dialog-close" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-form class="q-gutter-md">
            <div>
              <div class="erp-label q-mb-xs">Branch *</div>
              <q-select
                v-model="tableForm.branch_id"
                :options="branchOptions"
                outlined
                dense
                emit-value
                map-options
                :rules="[(val) => !!val || 'Branch is required']"
              />
            </div>
            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <div class="erp-label q-mb-xs">Table Number *</div>
                <q-input
                  v-model="tableForm.table_number"
                  outlined
                  dense
                  placeholder="e.g. T01, A1, 12"
                  :rules="[(val) => !!val || 'Required']"
                />
              </div>
              <div class="col-6">
                <div class="erp-label q-mb-xs">Capacity (seats)</div>
                <q-input
                  v-model.number="tableForm.capacity"
                  type="number"
                  outlined
                  dense
                  min="1"
                  max="20"
                />
              </div>
            </div>
            <div>
              <div class="erp-label q-mb-xs">Section / Zone</div>
              <q-select
                v-model="tableForm.section"
                :options="sectionOptions"
                outlined
                dense
                use-input
                hide-selected
                fill-input
                input-debounce="0"
                @new-value="addSectionOption"
                placeholder="Select or type section"
              />
            </div>
            <div>
              <div class="erp-label q-mb-xs">Status</div>
              <q-select
                v-model="tableForm.status"
                :options="['available', 'occupied', 'reserved', 'maintenance']"
                outlined
                dense
              />
            </div>
          </q-form>
        </q-card-section>

        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat label="Cancel" color="grey-7" v-close-popup no-caps />
          <q-btn
            unelevated
            color="primary"
            no-caps
            :label="editingTable ? 'Update' : 'Save'"
            :loading="savingTable"
            @click="saveTable"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ─── QR Code Dialog ─── -->
    <q-dialog v-model="qrDialog" persistent>
      <q-card style="width: 320px; max-width: 90vw">
        <q-card-section class="dialog-header" style="padding: 12px 16px">
          <q-icon name="qr_code_2" size="20px" class="q-mr-sm" />
          <span style="font-size: 0.95rem"
            >QR Code — T{{ (qrTarget?.table_number || '').replace('Table', '').trim() }}</span
          >
          <q-btn
            flat
            round
            dense
            icon="close"
            class="dialog-close"
            style="top: 8px; right: 8px"
            v-close-popup
          />
        </q-card-section>

        <q-card-section class="text-center q-pa-sm">
          <div class="qr-container" id="qr-print-area">
            <div class="qr-brand">SEVEN WAVES</div>
            <div class="qr-table-label">
              Table {{ (qrTarget?.table_number || '').replace('Table', '').trim() }}
            </div>
            <div v-if="qrTarget?.section" class="qr-section-label">{{ qrTarget?.section }}</div>
            <div class="qr-code-wrap q-my-sm">
              <canvas ref="qrCanvas" id="qr-canvas" style="border-radius: 8px" />
            </div>
            <div class="qr-instruction">
              <q-icon name="phone_iphone" size="14px" class="q-mr-xs" />
              Scan to view menu & order
            </div>
            <div class="qr-url q-mt-xs">
              <a
                :href="qrUrl"
                target="_blank"
                class="text-primary text-weight-medium"
                style="word-break: break-all; text-decoration: underline"
              >
                {{ qrUrl }}
              </a>
            </div>
            <div class="q-mt-sm">
              <q-btn
                unelevated
                dense
                color="primary"
                no-caps
                icon="open_in_new"
                label="Open Link"
                type="a"
                :href="qrUrl"
                target="_blank"
                class="q-px-sm"
                size="sm"
              />
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="center" class="q-pb-sm q-pt-none q-gutter-x-sm">
          <q-btn flat dense no-caps icon="print" color="grey-7" @click="printQR"
            ><q-tooltip>Print</q-tooltip></q-btn
          >
          <q-btn flat dense no-caps icon="download" color="primary" @click="downloadQR"
            ><q-tooltip>Download</q-tooltip></q-btn
          >
          <q-btn
            flat
            dense
            no-caps
            icon="refresh"
            color="orange"
            @click="regenerateQR"
            :loading="regeneratingQr"
            ><q-tooltip>Regenerate</q-tooltip></q-btn
          >
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ─── Device Registration Dialog ─── -->
    <q-dialog v-model="deviceDialog" persistent>
      <q-card style="min-width: 480px; max-width: 560px">
        <q-card-section class="dialog-header">
          <q-icon name="phonelink_setup" size="24px" class="q-mr-sm" />
          Table Device Setup — Table {{ deviceTarget?.table_number }}
          <q-btn flat round dense icon="close" class="dialog-close" v-close-popup />
        </q-card-section>

        <q-card-section>
          <div class="info-box q-mb-md">
            <q-icon name="info" size="18px" class="q-mr-sm text-blue-5" />
            Register a physical tablet/device for this table. The device will log in using a device
            code and PIN to access the table menu.
          </div>

          <q-form class="q-gutter-md">
            <div>
              <div class="erp-label q-mb-xs">Device Code *</div>
              <q-input
                v-model="deviceForm.device_code"
                outlined
                dense
                placeholder="e.g. TB-001"
                hint="Auto-generated or custom code"
                :rules="[(val) => !!val || 'Required']"
              >
                <template #append>
                  <q-btn
                    flat
                    dense
                    icon="auto_awesome"
                    size="sm"
                    color="primary"
                    @click="autoGenerateCode"
                  />
                </template>
              </q-input>
            </div>

            <div>
              <div class="erp-label q-mb-xs">Device Name</div>
              <q-input
                v-model="deviceForm.device_name"
                outlined
                dense
                placeholder="e.g. Table 01 Tablet"
              />
            </div>

            <div>
              <div class="erp-label q-mb-xs">PIN / Secret *</div>
              <q-input
                v-model="deviceForm.device_secret"
                :type="showSecret ? 'text' : 'password'"
                outlined
                dense
                placeholder="Enter a PIN (min 4 characters)"
                :rules="[(val) => (val && val.length >= 4) || 'Min 4 characters']"
              >
                <template #append>
                  <q-btn
                    flat
                    round
                    dense
                    :icon="showSecret ? 'visibility_off' : 'visibility'"
                    size="sm"
                    @click="showSecret = !showSecret"
                  />
                  <q-btn
                    flat
                    round
                    dense
                    icon="casino"
                    size="sm"
                    color="primary"
                    @click="randomPin"
                  />
                </template>
              </q-input>
            </div>
          </q-form>

          <!-- Existing devices for this table -->
          <div v-if="existingDevices.length > 0" class="q-mt-lg">
            <div class="text-caption text-grey-6 text-uppercase letter-spacing q-mb-sm">
              Registered Devices
            </div>
            <q-list dense bordered separator class="rounded-borders">
              <q-item v-for="dev in existingDevices" :key="dev.id">
                <q-item-section avatar>
                  <q-icon name="tablet" :color="dev.is_active ? 'positive' : 'grey-5'" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ dev.device_code }}</q-item-label>
                  <q-item-label caption
                    >{{ dev.device_name || 'No name' }} ·
                    {{ dev.is_active ? 'Active' : 'Inactive' }}</q-item-label
                  >
                </q-item-section>
                <q-item-section side>
                  <q-toggle
                    dense
                    :model-value="dev.is_active"
                    @update:model-value="toggleDevice(dev)"
                    color="positive"
                  />
                </q-item-section>
              </q-item>
            </q-list>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat label="Done" color="grey-7" v-close-popup no-caps />
          <q-btn
            unelevated
            color="primary"
            no-caps
            icon="save"
            label="Register Device"
            :loading="savingDevice"
            @click="saveDevice"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ─── Live Table Chart / Floor Plan Dialog ─── -->
    <q-dialog v-model="floorPlanDialog" maximized transition-show="scale" transition-hide="fade">
      <q-card class="bg-blue-grey-1 text-dark flex column">
        <!-- Header -->
        <q-card-section class="row items-center q-pb-md shadow-1 bg-white" style="z-index: 10">
          <q-icon name="grid_view" size="28px" color="primary" class="q-mr-sm" />
          <div class="text-h6 text-weight-bolder">Live Table Chart</div>
          <q-space />

          <div class="row q-gutter-x-lg q-mr-lg items-center">
            <div class="row items-center q-gutter-x-sm">
              <div
                class="box-available"
                style="width: 16px; height: 16px; border-radius: 4px"
              ></div>
              <span class="text-caption text-weight-bold" style="font-size: 13px"
                >Available ({{ floorPlanStats.available }})</span
              >
            </div>
            <div class="row items-center q-gutter-x-sm">
              <div
                class="box-locked pulse-lock-demo"
                style="width: 16px; height: 16px; border-radius: 4px"
              ></div>
              <span class="text-caption text-weight-bold" style="font-size: 13px"
                >Locked / Occupied ({{ floorPlanStats.occupied }})</span
              >
            </div>
          </div>

          <q-btn flat round dense icon="close" size="lg" v-close-popup />
        </q-card-section>

        <!-- Body: Scrollable Grid but fit all to page -->
        <q-card-section class="col q-pa-md row items-center justify-center">
          <div
            class="row q-gutter-md justify-center align-center"
            style="max-width: 1300px; width: 100%"
          >
            <div v-for="table in filteredTables" :key="table.id">
              <div
                class="floor-plan-box shadow-2"
                :class="
                  table.status === 'available'
                    ? 'bg-positive text-white box-available'
                    : 'bg-orange text-white box-locked'
                "
              >
                <div class="text-center">
                  <div class="text-weight-bolder" style="font-size: 15px; line-height: 1">
                    {{ (table.table_number || '').replace('Table', '').trim() }}
                  </div>
                  <div
                    class="row items-center justify-center q-mt-xs"
                    style="font-size: 9px; opacity: 0.9"
                  >
                    <q-icon name="people" size="9px" class="q-mr-xs" /> {{ table.capacity }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import QRCode from 'qrcode'
import PageHeader from 'components/common/PageHeader.vue'

const $q = useQuasar()

// ─── State ────────────────────────────────────────────────────────────────────
const tables = ref([])
const branches = ref([])
const selectedBranch = ref(null)
const search = ref('')
const loadingTables = ref(false)
const floorPlanDialog = ref(false)
let realtimeChannel = null

// Table dialog
const tableDialog = ref(false)
const editingTable = ref(null)
const savingTable = ref(false)
const tableForm = ref({
  branch_id: '',
  table_number: '',
  capacity: 4,
  section: '',
  status: 'available',
})

const sectionOptions = ref(['Indoor', 'Outdoor', 'VIP', 'Terrace', 'Main Hall', 'Bar Area'])

function addSectionOption(val, done) {
  if (val.length > 0) {
    if (!sectionOptions.value.includes(val)) {
      sectionOptions.value.push(val)
    }
    done(val, 'toggle')
  }
}

// QR dialog
const qrDialog = ref(false)
const qrTarget = ref(null)
const qrCanvas = ref(null)
const qrUrl = ref('')
const regeneratingQr = ref(false)

// Device dialog
const deviceDialog = ref(false)
const deviceTarget = ref(null)
const savingDevice = ref(false)
const showSecret = ref(false)
const existingDevices = ref([])
const deviceForm = ref({ device_code: '', device_name: '', device_secret: '' })

// ─── Computed ─────────────────────────────────────────────────────────────────
const branchOptions = computed(() => branches.value.map((b) => ({ label: b.name, value: b.id })))

const floorPlanStats = computed(() => {
  return {
    available: filteredTables.value.filter((t) => t.status === 'available').length,
    occupied: filteredTables.value.filter((t) => t.status !== 'available').length,
  }
})

const filteredTables = computed(() => {
  let list = tables.value
  if (selectedBranch.value) list = list.filter((t) => t.branch_id === selectedBranch.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(
      (t) =>
        t.table_number.toLowerCase().includes(q) || (t.section || '').toLowerCase().includes(q),
    )
  }
  return list
})

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadBranches()
  await loadTables()

  // Real-time listener for table status updates
  realtimeChannel = supabase
    .channel('tables_status_channel')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'restaurant_tables' },
      (payload) => {
        const idx = tables.value.findIndex((t) => t.id === payload.new.id)
        if (idx !== -1) {
          tables.value[idx].status = payload.new.status
          if (payload.new.capacity) tables.value[idx].capacity = payload.new.capacity
          if (payload.new.section) tables.value[idx].section = payload.new.section
        }
      },
    )
    .subscribe()
})

onUnmounted(() => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
  }
})

// ─── Data Loaders ─────────────────────────────────────────────────────────────
async function loadBranches() {
  const { data } = await supabase
    .from('branches')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
  branches.value = data || []
}

async function loadTables() {
  loadingTables.value = true
  try {
    const { data: tableData, error } = await supabase
      .from('restaurant_tables')
      .select('id, branch_id, table_number, section, capacity, status')
      .order('table_number')

    if (error) throw error

    // Load QR tokens & devices in parallel
    const [{ data: qrData }, { data: deviceData }] = await Promise.all([
      supabase
        .from('table_qr_tokens')
        .select('table_id, qr_token, is_active')
        .eq('is_active', true),
      supabase.from('table_devices').select('table_id, is_active'),
    ])

    const qrMap = {}
    const qrTokenMap = {}
    ;(qrData || []).forEach((q) => {
      qrMap[q.table_id] = true
      qrTokenMap[q.table_id] = q.qr_token
    })

    const deviceMap = {}
    ;(deviceData || []).forEach((d) => {
      if (d.is_active) deviceMap[d.table_id] = true
    })

    tables.value = (tableData || []).map((t) => ({
      ...t,
      has_qr: !!qrMap[t.id],
      qr_token: qrTokenMap[t.id] || null,
      has_device: !!deviceMap[t.id],
      generatingQr: false,
    }))
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Failed to load tables: ' + e.message })
  } finally {
    loadingTables.value = false
  }
}

// ─── Table CRUD ───────────────────────────────────────────────────────────────
function openAddTable() {
  editingTable.value = null
  tableForm.value = {
    branch_id: selectedBranch.value || (branches.value[0]?.id ?? ''),
    table_number: '',
    capacity: 4,
    section: '',
    status: 'available',
  }
  tableDialog.value = true
}

function editTable(table) {
  editingTable.value = table
  tableForm.value = {
    branch_id: table.branch_id,
    table_number: table.table_number,
    capacity: table.capacity,
    section: table.section || '',
    status: table.status,
  }
  tableDialog.value = true
}

async function saveTable() {
  if (savingTable.value) return
  if (!tableForm.value.branch_id || !tableForm.value.table_number) {
    $q.notify({ type: 'warning', message: 'Please fill required fields' })
    return
  }
  savingTable.value = true
  try {
    if (editingTable.value) {
      const { error } = await supabase
        .from('restaurant_tables')
        .update({
          branch_id: tableForm.value.branch_id,
          table_number: tableForm.value.table_number,
          capacity: tableForm.value.capacity,
          section: tableForm.value.section || null,
          status: tableForm.value.status,
        })
        .eq('id', editingTable.value.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Table updated' })
    } else {
      // Get company_id from branch
      const { data: branchFull, error: branchError } = await supabase
        .from('branches')
        .select('company_id')
        .eq('id', tableForm.value.branch_id)
        .single()

      if (branchError || !branchFull) {
        throw new Error('Could not find branch details. Please check branch settings.')
      }

      const { error } = await supabase.from('restaurant_tables').insert({
        company_id: branchFull.company_id,
        branch_id: tableForm.value.branch_id,
        table_number: tableForm.value.table_number,
        capacity: tableForm.value.capacity,
        section: tableForm.value.section || null,
        status: tableForm.value.status,
      })
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Table created' })
    }
    tableDialog.value = false
    await loadTables()
  } catch (e) {
    console.error('Table Save Error:', e)
    $q.notify({
      type: 'negative',
      message: e.details || e.message || 'An error occurred while saving the table',
      caption: e.hint || '',
    })
  } finally {
    savingTable.value = false
  }
}

async function deleteTable(table) {
  $q.dialog({
    title: 'Delete Table',
    message: `Delete Table ${table.table_number}? This will remove all QR codes and device links.`,
    cancel: true,
    persistent: true,
    color: 'negative',
  }).onOk(async () => {
    const { error } = await supabase.from('restaurant_tables').delete().eq('id', table.id)
    if (error) {
      $q.notify({ type: 'negative', message: error.message })
      return
    }
    $q.notify({ type: 'positive', message: 'Table deleted' })
    await loadTables()
  })
}

// ─── QR Code ──────────────────────────────────────────────────────────────────
async function generateQR(table) {
  const idx = tables.value.findIndex((t) => t.id === table.id)
  if (idx !== -1) tables.value[idx].generatingQr = true

  try {
    const { data, error } = await supabase.rpc('generate_qr_token_for_table', {
      p_table_id: table.id,
    })
    if (error) throw error
    if (!data?.success) throw new Error(data?.error || 'Failed to generate QR')

    $q.notify({ type: 'positive', message: 'QR code generated!' })
    await loadTables()

    // Open QR view
    const updatedTable = tables.value.find((t) => t.id === table.id)
    if (updatedTable) viewQR(updatedTable)
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    if (idx !== -1) tables.value[idx].generatingQr = false
  }
}

function getAppBaseUrl() {
  return window.location.origin
}

async function viewQR(table) {
  qrTarget.value = table
  const token = table.qr_token
  const url = `${getAppBaseUrl()}/c/${token}`
  qrUrl.value = url
  qrDialog.value = true

  // Draw QR canvas after dialog opens
  setTimeout(async () => {
    if (qrCanvas.value) {
      await QRCode.toCanvas(qrCanvas.value, url, {
        width: 170,
        margin: 2,
        color: { dark: '#111827', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      })
    }
  }, 100)
}

async function regenerateQR() {
  if (!qrTarget.value) return
  regeneratingQr.value = true
  try {
    const { data, error } = await supabase.rpc('generate_qr_token_for_table', {
      p_table_id: qrTarget.value.id,
    })
    if (error) throw error
    if (!data?.success) throw new Error(data?.error || 'Failed')

    await loadTables()
    const updatedTable = tables.value.find((t) => t.id === qrTarget.value.id)
    qrTarget.value = updatedTable

    const url = `${getAppBaseUrl()}/c/${updatedTable.qr_token}`
    qrUrl.value = url
    await QRCode.toCanvas(qrCanvas.value, url, {
      width: 170,
      margin: 2,
      color: { dark: '#111827', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    })
    $q.notify({ type: 'positive', message: 'QR code regenerated!' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    regeneratingQr.value = false
  }
}

function printQR() {
  const canvas = document.getElementById('qr-canvas')
  if (!canvas) return
  const img = canvas.toDataURL('image/png')

  const win = window.open('', '_blank')
  win.document.write(`
    <html>
    <head><title>QR - Table ${qrTarget.value?.table_number}</title>
    <style>
      body { font-family: Arial, sans-serif; text-align: center; padding: 40px; background: #fff; }
      .brand { font-size: 12px; font-weight: 800; letter-spacing: 4px; color: #f97316; margin-bottom: 4px; }
      .table-name { font-size: 24px; font-weight: 700; color: #111827; margin-bottom: 4px; }
      .section { font-size: 14px; color: #6b7280; margin-bottom: 16px; }
      img { width: 220px; height: 220px; border-radius: 12px; }
      .instruction { font-size: 13px; color: #374151; margin-top: 12px; }
      .url { font-size: 10px; color: #9ca3af; margin-top: 4px; word-break: break-all; }
    </style>
    </head>
    <body>
      <div class="brand">SEVEN WAVES</div>
      <div class="table-name">Table ${qrTarget.value?.table_number}</div>
      ${qrTarget.value?.section ? `<div class="section">${qrTarget.value.section}</div>` : ''}
      <img src="${img}" />
      <div class="instruction">📱 Scan to view menu & order</div>
      <div class="url">${qrUrl.value}</div>
    </body>
    </html>
  `)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
  }, 400)
}

function downloadQR() {
  const canvas = document.getElementById('qr-canvas')
  if (!canvas) return
  const link = document.createElement('a')
  link.download = `QR-Table-${qrTarget.value?.table_number}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

// ─── Device Registration ───────────────────────────────────────────────────────
async function openDeviceDialog(table) {
  deviceTarget.value = table
  deviceForm.value = {
    device_code: '',
    device_name: `Table ${table.table_number} Tablet`,
    device_secret: '',
  }
  showSecret.value = false

  // Load existing devices
  const { data } = await supabase
    .from('table_devices')
    .select('id, device_code, device_name, is_active, last_seen_at')
    .eq('table_id', table.id)
    .order('created_at', { ascending: false })

  existingDevices.value = data || []
  deviceDialog.value = true
}

function autoGenerateCode() {
  const tableNum = (deviceTarget.value?.table_number || '0').padStart(3, '0')
  deviceForm.value.device_code = `TB-${tableNum}`
}

function randomPin() {
  const pin = Math.floor(1000 + Math.random() * 9000).toString()
  deviceForm.value.device_secret = pin
  showSecret.value = true
  $q.notify({ type: 'info', message: `Generated PIN: ${pin}` })
}

async function saveDevice() {
  if (!deviceForm.value.device_code || !deviceForm.value.device_secret) {
    $q.notify({ type: 'warning', message: 'Device code and PIN are required' })
    return
  }
  if (deviceForm.value.device_secret.length < 4) {
    $q.notify({ type: 'warning', message: 'PIN must be at least 4 characters' })
    return
  }

  savingDevice.value = true
  try {
    const { data, error } = await supabase.rpc('register_table_device', {
      p_branch_id: deviceTarget.value.branch_id,
      p_table_id: deviceTarget.value.id,
      p_device_code: deviceForm.value.device_code.toUpperCase(),
      p_device_secret: deviceForm.value.device_secret,
      p_device_name: deviceForm.value.device_name || null,
    })
    if (error) throw error
    if (!data?.success) throw new Error(data?.error || 'Registration failed')

    $q.notify({
      type: 'positive',
      message: `Device ${data.device_code} registered!`,
      caption: `Login URL: ${getAppBaseUrl()}/table-login`,
    })

    // Refresh device list
    const { data: devs } = await supabase
      .from('table_devices')
      .select('id, device_code, device_name, is_active, last_seen_at')
      .eq('table_id', deviceTarget.value.id)
      .order('created_at', { ascending: false })
    existingDevices.value = devs || []

    deviceForm.value = {
      device_code: '',
      device_name: `Table ${deviceTarget.value.table_number} Tablet`,
      device_secret: '',
    }
    await loadTables()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    savingDevice.value = false
  }
}

async function toggleDevice(device) {
  const { error } = await supabase
    .from('table_devices')
    .update({ is_active: !device.is_active })
    .eq('id', device.id)

  if (error) {
    $q.notify({ type: 'negative', message: error.message })
    return
  }
  device.is_active = !device.is_active
  $q.notify({
    type: 'positive',
    message: `Device ${device.is_active ? 'activated' : 'deactivated'}`,
  })
  await loadTables()
}
</script>

<style lang="scss" scoped>
.tables-mgmt-page {
  max-width: 1400px;
  margin: 0 auto;
}

// ── Header ────────────────────────────────────────────────────────────────────
.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--q-dark, #111827);
}
.page-subtitle {
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 2px;
}

// ── Tables Grid layout ────────────────────────────────────────────────────────
.tables-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 12px;
}

// ── Table Card ────────────────────────────────────────────────────────────────
.tbl-card {
  background: var(--erp-bg-card, #1e293b);
  border: 1.5px solid var(--erp-border, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 168px;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s;
  cursor: default;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  // Status border accents
  &--available {
    border-color: rgba(16, 185, 129, 0.25);
  }
  &--occupied {
    border-color: rgba(249, 115, 22, 0.35);
  }
  &--reserved {
    border-color: rgba(59, 130, 246, 0.35);
  }
  &--maintenance {
    border-color: rgba(239, 68, 68, 0.3);
  }
}

// ── Top bar ───────────────────────────────────────────────────────────────────
.tbl-card__topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tbl-card__actions-top {
  display: flex;
  gap: 2px;
}

.tbl-icon-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.35);
  transition:
    background 0.15s,
    color 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
  }

  &--danger:hover {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }
}

// ── Status dot ────────────────────────────────────────────────────────────────
.tbl-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;

  &--available {
    background: #10b981;
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
  }
  &--occupied {
    background: #f97316;
    box-shadow: 0 0 6px rgba(249, 115, 22, 0.5);
  }
  &--reserved {
    background: #3b82f6;
    box-shadow: 0 0 6px rgba(59, 130, 246, 0.5);
  }
  &--maintenance {
    background: #ef4444;
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
  }
}

// ── Card body ─────────────────────────────────────────────────────────────────
.tbl-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  text-align: center;
}

.tbl-main-icon {
  &.tbl-icon--available {
    color: #10b981;
  }
  &.tbl-icon--occupied {
    color: #f97316;
  }
  &.tbl-icon--reserved {
    color: #3b82f6;
  }
  &.tbl-icon--maintenance {
    color: #ef4444;
  }
}

.tbl-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--erp-text-primary, #f1f5f9);
  line-height: 1.2;
  letter-spacing: -0.1px;
}

.tbl-meta {
  font-size: 11px;
  color: var(--erp-text-secondary, #94a3b8);
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
  justify-content: center;
}

// ── Indicator chips ───────────────────────────────────────────────────────────
.tbl-card__chips {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.tbl-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  cursor: default;

  &--green {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.25);
  }
  &--orange {
    background: rgba(249, 115, 22, 0.15);
    color: #f97316;
    border: 1px solid rgba(249, 115, 22, 0.25);
  }
  &--muted {
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.07);
  }
}

// ── Footer action buttons ─────────────────────────────────────────────────────
.tbl-card__footer {
  display: flex;
  justify-content: space-evenly;
  border-top: 1px solid var(--erp-border, rgba(255, 255, 255, 0.08));
  padding-top: 6px;
  margin-top: 2px;
}

.tbl-foot-btn {
  width: 30px;
  height: 30px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;

  &--green {
    color: #10b981;
    &:hover {
      background: rgba(16, 185, 129, 0.12);
      border-color: rgba(16, 185, 129, 0.3);
    }
  }
  &--blue {
    color: #3b82f6;
    &:hover {
      background: rgba(59, 130, 246, 0.12);
      border-color: rgba(59, 130, 246, 0.3);
    }
  }
  &--orange {
    color: #f97316;
    &:hover {
      background: rgba(249, 115, 22, 0.12);
      border-color: rgba(249, 115, 22, 0.3);
    }
  }
  &--disabled {
    color: rgba(255, 255, 255, 0.15);
    cursor: not-allowed;
    &:hover {
      background: transparent;
      border-color: transparent;
    }
  }
}

// ── Stats Cards ───────────────────────────────────────────────────────────────
.stat-card {
  background: var(--erp-bg-card, #1e293b);
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.08));
  border-radius: 14px;
  padding: 20px;
  text-align: center;
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  }
}
.stat-value {
  font-size: 2rem;
  font-weight: 800;
  color: var(--erp-text-primary, #f1f5f9);
  line-height: 1;
}
.stat-label {
  font-size: 0.78rem;
  color: var(--erp-text-secondary, #94a3b8);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

// ── Dialog ────────────────────────────────────────────────────────────────────
.dialog-header {
  display: flex;
  align-items: center;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--erp-text-primary, #f1f5f9);
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--erp-border, rgba(255, 255, 255, 0.08));
  position: relative;
}
.dialog-close {
  position: absolute;
  right: 12px;
  top: 12px;
}

// ── QR Dialog ─────────────────────────────────────────────────────────────────
.qr-container {
  padding: 12px;
  background: white;
  border-radius: 12px;
  display: inline-block;
  width: 100%;
}
.qr-brand {
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 3px;
  color: #f97316;
}
.qr-table-label {
  font-size: 1.2rem;
  font-weight: 800;
  color: #111827;
  line-height: 1.1;
}
.qr-section-label {
  font-size: 0.75rem;
  color: #6b7280;
}
.qr-code-wrap canvas {
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
.qr-instruction {
  font-size: 0.75rem;
  color: #374151;
  display: flex;
  align-items: center;
  justify-content: center;
}
.qr-url {
  font-size: 0.7rem;
  max-width: 260px;
  margin: 2px auto 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// ── Info Box ──────────────────────────────────────────────────────────────────
.info-box {
  background: rgba(59, 130, 246, 0.07);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 0.85rem;
  color: var(--erp-text-secondary, #94a3b8);
  display: flex;
  align-items: flex-start;
}

// ── Empty State ───────────────────────────────────────────────────────────────
.empty-state {
  text-align: center;
  padding: 80px 20px;
}

// ── Floor Plan ────────────────────────────────────────────────────────────────
.floor-plan-box {
  width: 54px;
  height: 54px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  user-select: none;
}
.floor-plan-box:hover {
  transform: scale(1.08);
  box-shadow:
    0 10px 15px -3px rgba(0, 0, 0, 0.2),
    0 4px 6px -2px rgba(0, 0, 0, 0.1);
}
.box-available {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}
.box-locked {
  background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
  animation: pulse-lock 2s infinite;
}
@keyframes pulse-lock {
  0% {
    box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.4);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(249, 115, 22, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(249, 115, 22, 0);
  }
}
.pulse-lock-demo {
  animation: pulse-lock 2s infinite;
}
</style>
