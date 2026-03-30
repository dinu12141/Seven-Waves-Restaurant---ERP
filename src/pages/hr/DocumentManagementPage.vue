<template>
  <q-page class="doc-page q-pa-md">
    <ERPToolbar
      moduleName="hr"
      title="Document Management"
      breadcrumbs="Human Resources / Document Management"
    />

    <!-- ── KPI Stat Cards ─────────────────────────────────────────────────── -->
    <div class="row q-col-gutter-md q-mb-lg items-stretch">
      <!-- Total Documents -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card
          flat
          class="kpi-card"
          style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%) !important"
        >
          <q-card-section class="kpi-inner">
            <div class="kpi-icon-wrap" style="background: rgba(255, 255, 255, 0.2)">
              <q-icon name="folder_copy" size="22px" color="white" />
            </div>
            <div class="kpi-body">
              <div class="kpi-label">Total Documents</div>
              <div class="kpi-value">{{ kpi.total }}</div>
            </div>
            <q-icon
              name="description"
              size="64px"
              class="kpi-bg-icon"
              color="white"
              style="opacity: 0.07"
            />
          </q-card-section>
        </q-card>
      </div>

      <!-- Verified -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card
          flat
          class="kpi-card"
          style="background: linear-gradient(135deg, #065f46 0%, #10b981 100%) !important"
        >
          <q-card-section class="kpi-inner">
            <div class="kpi-icon-wrap" style="background: rgba(255, 255, 255, 0.2)">
              <q-icon name="verified_user" size="22px" color="white" />
            </div>
            <div class="kpi-body">
              <div class="kpi-label">Verified</div>
              <div class="kpi-value">{{ kpi.verified }}</div>
            </div>
            <q-icon
              name="check_circle"
              size="64px"
              class="kpi-bg-icon"
              color="white"
              style="opacity: 0.07"
            />
          </q-card-section>
        </q-card>
      </div>

      <!-- Pending Verification -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card
          flat
          class="kpi-card"
          style="background: linear-gradient(135deg, #78350f 0%, #f59e0b 100%) !important"
        >
          <q-card-section class="kpi-inner">
            <div class="kpi-icon-wrap" style="background: rgba(255, 255, 255, 0.2)">
              <q-icon name="pending_actions" size="22px" color="white" />
            </div>
            <div class="kpi-body">
              <div class="kpi-label">Pending Verification</div>
              <div class="kpi-value">{{ kpi.pending }}</div>
            </div>
            <q-icon
              name="hourglass_top"
              size="64px"
              class="kpi-bg-icon"
              color="white"
              style="opacity: 0.07"
            />
          </q-card-section>
        </q-card>
      </div>

      <!-- Expiring / Expired -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card
          flat
          class="kpi-card"
          style="background: linear-gradient(135deg, #7f1d1d 0%, #ef4444 100%) !important"
        >
          <q-card-section class="kpi-inner">
            <div class="kpi-icon-wrap" style="background: rgba(255, 255, 255, 0.2)">
              <q-icon name="event_busy" size="22px" color="white" />
            </div>
            <div class="kpi-body">
              <div class="kpi-label">Expiring / Expired</div>
              <div class="kpi-value">{{ kpi.expiring }}</div>
            </div>
            <q-icon
              name="timer_off"
              size="64px"
              class="kpi-bg-icon"
              color="white"
              style="opacity: 0.07"
            />
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- ── Expiry Alert Banner ────────────────────────────────────────────── -->
    <div v-if="expiringDocs.length" class="expiry-banner q-mb-md">
      <q-icon name="warning_amber" color="red-5" size="18px" class="q-mr-sm" />
      <span :class="$q.dark.isActive ? 'text-red-3' : 'text-red-8'" style="font-size: 13px">
        <strong>{{ expiringDocs.length }} document(s)</strong> expiring within 30 days or already
        expired.
      </span>
      <q-space />
      <q-btn
        flat
        dense
        no-caps
        size="sm"
        color="red-6"
        label="Show Expiring"
        icon-right="arrow_forward"
        @click="filterFilter = 'expiring'"
      />
    </div>

    <!-- ── Main Panel ─────────────────────────────────────────────────────── -->
    <q-card flat class="main-panel">
      <!-- Panel Header -->
      <div class="panel-header">
        <div class="row items-center no-wrap">
          <q-icon
            name="folder_shared"
            size="20px"
            :color="$q.dark.isActive ? 'blue-4' : 'blue-7'"
            class="q-mr-sm"
          />
          <div>
            <div :class="['panel-title', $q.dark.isActive ? 'text-grey-2' : 'text-grey-9']">
              All Documents
            </div>
            <div :class="['panel-sub', $q.dark.isActive ? 'text-grey-5' : 'text-grey-6']">
              {{ filteredDocuments.length }} of {{ documents.length }} records
            </div>
          </div>
          <q-space />
          <q-btn
            unelevated
            color="blue-7"
            icon="refresh"
            no-caps
            size="sm"
            label="Refresh"
            @click="loadDocuments"
            :loading="loading"
            style="border-radius: 8px; padding: 6px 14px"
          />
        </div>
      </div>

      <q-separator :dark="$q.dark.isActive" style="opacity: 0.07" />

      <!-- Filter Bar -->
      <div class="filter-bar">
        <div class="row q-col-gutter-sm items-center">
          <div class="col-12 col-sm-4 col-md-3">
            <q-input
              :dark="$q.dark.isActive"
              dense
              outlined
              rounded
              v-model="search"
              placeholder="Search employee or document..."
              clearable
              class="filter-input"
            >
              <template #prepend>
                <q-icon name="search" :color="$q.dark.isActive ? 'grey-5' : 'grey-6'" />
              </template>
            </q-input>
          </div>

          <div class="col-6 col-sm-3 col-md-2">
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              rounded
              v-model="empFilter"
              :options="[{ label: 'All Employees', value: '' }, ...employeeOptions]"
              label="Employee"
              emit-value
              map-options
              clearable
              class="filter-input"
            />
          </div>

          <div class="col-6 col-sm-3 col-md-2">
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              rounded
              v-model="docTypeFilter"
              :options="[{ label: 'All Types', value: '' }, ...docTypeOptions]"
              label="Doc Type"
              emit-value
              map-options
              clearable
              class="filter-input"
            />
          </div>

          <div class="col-6 col-sm-3 col-md-2">
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              rounded
              v-model="verifiedFilter"
              :options="[
                { label: 'All Status', value: '' },
                { label: '✓ Verified', value: 'verified' },
                { label: '⏳ Pending', value: 'pending' },
              ]"
              label="Status"
              emit-value
              map-options
              class="filter-input"
            />
          </div>

          <div class="col-6 col-sm-3 col-md-2">
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              rounded
              v-model="filterFilter"
              :options="[
                { label: 'All Documents', value: '' },
                { label: '⚠ Expiring (30d)', value: 'expiring' },
                { label: '✕ Expired', value: 'expired' },
              ]"
              label="Expiry"
              emit-value
              map-options
              class="filter-input"
            />
          </div>

          <div class="col-auto">
            <q-btn
              v-if="search || empFilter || docTypeFilter || verifiedFilter || filterFilter"
              flat
              dense
              no-caps
              size="sm"
              :color="$q.dark.isActive ? 'blue-4' : 'blue-7'"
              label="Clear"
              icon="filter_alt_off"
              @click="clearFilters"
            />
          </div>
        </div>
      </div>

      <q-separator :dark="$q.dark.isActive" style="opacity: 0.07" />

      <!-- Documents Table -->
      <div class="q-pa-sm">
        <q-table
          :dark="$q.dark.isActive"
          flat
          :rows="filteredDocuments"
          :columns="columns"
          row-key="id"
          :loading="loading"
          :pagination="{ rowsPerPage: 15 }"
          class="doc-table"
        >
          <!-- Employee Cell -->
          <template #body-cell-employee="props">
            <q-td :props="props">
              <div class="row items-center no-wrap" style="gap: 10px">
                <q-avatar
                  size="32px"
                  :style="
                    avatarStyle(props.row.employees?.full_name || props.row.employees?.first_name)
                  "
                >
                  <span style="font-size: 11px; font-weight: 700; color: white">
                    {{
                      initials(props.row.employees?.full_name || props.row.employees?.first_name)
                    }}
                  </span>
                </q-avatar>
                <div>
                  <div
                    :class="[
                      'text-weight-semibold',
                      $q.dark.isActive ? 'text-grey-2' : 'text-grey-9',
                    ]"
                    style="font-size: 13px; line-height: 1.2"
                  >
                    {{ props.row.employees?.full_name || props.row.employees?.first_name || '—' }}
                  </div>
                  <div
                    :class="$q.dark.isActive ? 'text-grey-6' : 'text-grey-5'"
                    style="font-size: 11px"
                  >
                    {{ props.row.employees?.employee_code }}
                  </div>
                </div>
              </div>
            </q-td>
          </template>

          <!-- Doc Type Cell -->
          <template #body-cell-doc_type="props">
            <q-td :props="props">
              <q-chip
                dense
                :color="docTypeColor(props.row.doc_type)"
                text-color="white"
                :label="formatDocType(props.row.doc_type)"
                style="font-size: 11px; border-radius: 6px; height: 22px; padding: 0 8px"
              />
            </q-td>
          </template>

          <!-- Document Name -->
          <template #body-cell-doc_name="props">
            <q-td :props="props">
              <div class="row items-center no-wrap" style="gap: 6px">
                <q-icon
                  :name="getFileIcon(props.row.file_path)"
                  :color="getFileIconColor(props.row.file_path)"
                  size="16px"
                />
                <span
                  :class="$q.dark.isActive ? 'text-grey-2' : 'text-grey-9'"
                  style="font-size: 12px; font-weight: 500"
                >
                  {{ props.row.doc_name || '—' }}
                </span>
              </div>
            </q-td>
          </template>

          <!-- Expiry Date -->
          <template #body-cell-expiry_date="props">
            <q-td :props="props">
              <template v-if="props.row.expiry_date">
                <div class="row items-center" style="gap: 6px">
                  <span :class="expiryClass(props.row.expiry_date)" style="font-size: 12px">
                    {{ props.row.expiry_date }}
                  </span>
                  <q-badge
                    v-if="isExpired(props.row.expiry_date)"
                    color="red-6"
                    label="Expired"
                    style="font-size: 10px; border-radius: 4px"
                  />
                  <q-badge
                    v-else-if="isExpiringSoon(props.row.expiry_date)"
                    color="orange-8"
                    label="Soon"
                    style="font-size: 10px; border-radius: 4px"
                  />
                </div>
              </template>
              <span
                v-else
                :class="$q.dark.isActive ? 'text-grey-6' : 'text-grey-5'"
                style="font-size: 12px"
                >No expiry</span
              >
            </q-td>
          </template>

          <!-- Status -->
          <template #body-cell-verified="props">
            <q-td :props="props">
              <div class="row items-center" style="gap: 6px">
                <div :class="['status-dot', props.row.verified ? 'dot-green' : 'dot-amber']" />
                <span
                  :class="[
                    'text-weight-medium',
                    props.row.verified ? 'text-green-7' : 'text-amber-8',
                  ]"
                  style="font-size: 12px"
                >
                  {{ props.row.verified ? 'Verified' : 'Pending' }}
                </span>
              </div>
              <div
                v-if="props.row.verified && props.row.verified_at"
                :class="$q.dark.isActive ? 'text-grey-6' : 'text-grey-5'"
                style="font-size: 10px; margin-top: 2px"
              >
                {{ props.row.verified_at?.split('T')[0] }}
              </div>
            </q-td>
          </template>

          <!-- Uploaded Date -->
          <template #body-cell-uploaded="props">
            <q-td :props="props">
              <span
                :class="$q.dark.isActive ? 'text-grey-4' : 'text-grey-7'"
                style="font-size: 12px"
              >
                {{ props.row.created_at?.split('T')[0] || '—' }}
              </span>
            </q-td>
          </template>

          <!-- Actions -->
          <template #body-cell-actions="props">
            <q-td :props="props">
              <div class="row no-wrap" style="gap: 4px; justify-content: center">
                <q-btn
                  flat
                  dense
                  round
                  size="sm"
                  icon="open_in_new"
                  color="blue-6"
                  @click="viewDoc(props.row)"
                >
                  <q-tooltip anchor="top middle" self="bottom middle">View</q-tooltip>
                </q-btn>
                <q-btn
                  v-if="!props.row.verified"
                  flat
                  dense
                  round
                  size="sm"
                  icon="verified_user"
                  color="green-6"
                  @click="verifyDoc(props.row)"
                >
                  <q-tooltip anchor="top middle" self="bottom middle">Mark Verified</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  dense
                  round
                  size="sm"
                  icon="delete_outline"
                  color="red-5"
                  @click="deleteDoc(props.row)"
                >
                  <q-tooltip anchor="top middle" self="bottom middle">Delete</q-tooltip>
                </q-btn>
              </div>
            </q-td>
          </template>

          <!-- Empty State -->
          <template #no-data>
            <div
              style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 60px 0;
                width: 100%;
              "
            >
              <q-icon
                name="folder_open"
                size="52px"
                :color="$q.dark.isActive ? 'grey-7' : 'grey-4'"
              />
              <div
                :class="[
                  'q-mt-md text-weight-medium',
                  $q.dark.isActive ? 'text-grey-5' : 'text-grey-6',
                ]"
                style="font-size: 14px"
              >
                No documents found
              </div>
              <div
                :class="$q.dark.isActive ? 'text-grey-7' : 'text-grey-4'"
                style="font-size: 12px; margin-top: 4px"
              >
                Try adjusting your filters or add documents via the employee profile
              </div>
            </div>
          </template>
        </q-table>
      </div>
    </q-card>

    <!-- ── Expiring Documents Preview ────────────────────────────────────── -->
    <q-expansion-item
      v-if="expiringDocs.length"
      class="q-mt-md expiry-section"
      icon="event_busy"
      :label="`Expiring / Expired Documents (${expiringDocs.length})`"
      :header-class="$q.dark.isActive ? 'text-red-3' : 'text-red-7'"
      expand-icon-class="text-red-5"
    >
      <div class="row q-col-gutter-sm q-pa-md">
        <div
          v-for="doc in expiringDocs.slice(0, 8)"
          :key="doc.id"
          class="col-12 col-sm-6 col-md-4 col-lg-3"
        >
          <q-card
            flat
            :class="['expiry-mini-card', isExpired(doc.expiry_date) ? 'mini-expired' : 'mini-soon']"
          >
            <q-card-section class="q-pa-sm">
              <div class="row items-center no-wrap q-mb-xs" style="gap: 6px">
                <q-icon name="person" size="13px" :color="$q.dark.isActive ? 'grey-5' : 'grey-6'" />
                <span
                  :class="['ellipsis', $q.dark.isActive ? 'text-grey-3' : 'text-grey-7']"
                  style="font-size: 11px; flex: 1"
                >
                  {{ doc.employees?.full_name || doc.employees?.first_name }}
                </span>
              </div>
              <div
                :class="[
                  'text-weight-bold ellipsis',
                  $q.dark.isActive ? 'text-grey-2' : 'text-grey-9',
                ]"
                style="font-size: 12px; margin-bottom: 8px"
              >
                {{ doc.doc_name }}
              </div>
              <div class="row items-center justify-between">
                <q-chip
                  dense
                  :color="docTypeColor(doc.doc_type)"
                  text-color="white"
                  :label="formatDocType(doc.doc_type)"
                  style="font-size: 10px; height: 18px; border-radius: 4px"
                />
                <span
                  class="text-weight-bold"
                  :class="isExpired(doc.expiry_date) ? 'text-red-6' : 'text-orange-8'"
                  style="font-size: 11px"
                >
                  {{ doc.expiry_date }}
                </span>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </q-expansion-item>
  </q-page>
</template>

<script setup>
import ERPToolbar from 'src/components/erp/ERPToolbar.vue'
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()

const documents = ref([])
const loading = ref(false)
const search = ref('')
const empFilter = ref('')
const docTypeFilter = ref('')
const verifiedFilter = ref('')
const filterFilter = ref('')

const allEmployees = ref([])
const employeeOptions = computed(() =>
  allEmployees.value.map((e) => ({
    label: `${e.full_name || e.first_name} (${e.employee_code})`,
    value: e.id,
  })),
)

const docTypeOptions = [
  { label: 'NIC Front', value: 'nic_front' },
  { label: 'NIC Back', value: 'nic_back' },
  { label: 'Photograph', value: 'photo' },
  { label: 'Contract Letter', value: 'contract_letter' },
  { label: 'GS Letter', value: 'gs_letter' },
  { label: 'Police Report', value: 'police_report' },
  { label: 'Driving License', value: 'driving_license' },
  { label: 'Passport', value: 'passport' },
  { label: 'Birth Certificate', value: 'birth_certificate' },
  { label: 'CV / Resume', value: 'cv' },
  { label: 'Educational Cert', value: 'educational_cert' },
  { label: 'Experience Letter', value: 'experience_letter' },
  { label: 'Bank Statement', value: 'bank_statement' },
  { label: 'Other', value: 'other' },
]

const columns = [
  { name: 'employee', label: 'Employee', align: 'left', field: 'employee_id', sortable: true },
  { name: 'doc_type', label: 'Type', align: 'left', field: 'doc_type', sortable: true },
  { name: 'doc_name', label: 'Document Name', align: 'left', field: 'doc_name', sortable: true },
  { name: 'expiry_date', label: 'Expiry', align: 'left', field: 'expiry_date', sortable: true },
  { name: 'verified', label: 'Status', align: 'left', field: 'verified', sortable: true },
  { name: 'uploaded', label: 'Uploaded', align: 'left', field: 'created_at', sortable: true },
  { name: 'actions', label: 'Actions', align: 'center', field: 'id' },
]

// ── KPIs ──────────────────────────────────────────────────────────────────────
const kpi = computed(() => ({
  total: documents.value.length,
  verified: documents.value.filter((d) => d.verified).length,
  pending: documents.value.filter((d) => !d.verified).length,
  expiring: expiringDocs.value.length,
}))

const expiringDocs = computed(() => {
  const today = new Date()
  const soon = new Date(today)
  soon.setDate(today.getDate() + 30)
  return documents.value
    .filter((d) => d.expiry_date && new Date(d.expiry_date) <= soon)
    .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))
})

// ── Filtered rows ─────────────────────────────────────────────────────────────
const filteredDocuments = computed(() => {
  const today = new Date()
  const soon = new Date(today)
  soon.setDate(today.getDate() + 30)
  let rows = documents.value

  if (search.value) {
    const t = search.value.toLowerCase()
    rows = rows.filter(
      (d) =>
        (d.employees?.full_name || d.employees?.first_name || '').toLowerCase().includes(t) ||
        (d.doc_name || '').toLowerCase().includes(t) ||
        (d.employees?.employee_code || '').toLowerCase().includes(t),
    )
  }
  if (empFilter.value) rows = rows.filter((d) => d.employee_id === empFilter.value)
  if (docTypeFilter.value) rows = rows.filter((d) => d.doc_type === docTypeFilter.value)
  if (verifiedFilter.value === 'verified') rows = rows.filter((d) => d.verified)
  if (verifiedFilter.value === 'pending') rows = rows.filter((d) => !d.verified)
  if (filterFilter.value === 'expiring')
    rows = rows.filter((d) => d.expiry_date && new Date(d.expiry_date) <= soon)
  if (filterFilter.value === 'expired')
    rows = rows.filter((d) => d.expiry_date && new Date(d.expiry_date) < today)

  return rows
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function clearFilters() {
  search.value = ''
  empFilter.value = ''
  docTypeFilter.value = ''
  verifiedFilter.value = ''
  filterFilter.value = ''
}

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  return parts.length >= 2 ? parts[0][0] + parts[1][0] : name[0]
}

const avatarColors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#6366f1']
function avatarStyle(name) {
  const idx = name ? name.charCodeAt(0) % avatarColors.length : 0
  return `background:${avatarColors[idx]};display:flex;align-items:center;justify-content:center`
}

function getFileIcon(path) {
  if (!path) return 'insert_drive_file'
  const ext = path.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'picture_as_pdf'
  if (['doc', 'docx'].includes(ext)) return 'article'
  return 'insert_drive_file'
}

function getFileIconColor(path) {
  if (!path) return 'grey-5'
  const ext = path.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'teal-6'
  if (ext === 'pdf') return 'red-5'
  if (['doc', 'docx'].includes(ext)) return 'blue-6'
  return 'grey-5'
}

function formatDocType(type) {
  const map = {
    nic_front: 'NIC Front',
    nic_back: 'NIC Back',
    photo: 'Photo',
    contract_letter: 'Contract',
    gs_letter: 'GS Letter',
    police_report: 'Police',
    driving_license: 'License',
    passport: 'Passport',
    birth_certificate: 'Birth Cert',
    cv: 'CV',
    educational_cert: 'Edu Cert',
    experience_letter: 'Exp Letter',
    bank_statement: 'Bank Stmt',
    other: 'Other',
  }
  return map[type] || type
}

function docTypeColor(type) {
  const map = {
    nic_front: 'indigo-6',
    nic_back: 'indigo-8',
    photo: 'purple-6',
    contract_letter: 'blue-7',
    gs_letter: 'teal-7',
    police_report: 'deep-purple-7',
    driving_license: 'cyan-8',
    passport: 'green-8',
    birth_certificate: 'orange-8',
    cv: 'amber-8',
    educational_cert: 'deep-orange-7',
    experience_letter: 'pink-7',
    bank_statement: 'lime-8',
    other: 'grey-6',
  }
  return map[type] || 'grey-6'
}

function isExpired(date) {
  return date && new Date(date) < new Date()
}

function isExpiringSoon(date) {
  if (!date) return false
  const soon = new Date()
  soon.setDate(soon.getDate() + 30)
  return new Date(date) <= soon && !isExpired(date)
}

function expiryClass(date) {
  if (isExpired(date)) return 'text-red-6 text-weight-bold'
  if (isExpiringSoon(date)) return 'text-orange-8 text-weight-medium'
  return $q.dark.isActive ? 'text-grey-3' : 'text-grey-8'
}

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadDocuments() {
  loading.value = true
  try {
    const companyId = authStore.currentBranch?.company_id
    if (!companyId) return
    const { data, error } = await supabase
      .from('employee_documents')
      .select('*, employees(id, full_name, first_name, employee_code)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    if (error) throw error
    documents.value = data || []
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to load documents: ' + err.message })
  } finally {
    loading.value = false
  }
}

async function loadEmployees() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  const { data } = await supabase
    .from('employees')
    .select('id, full_name, first_name, employee_code')
    .eq('branch_id', branchId)
    .order('first_name')
  allEmployees.value = data || []
}

async function viewDoc(doc) {
  try {
    const { data } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(doc.file_path, 600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    else $q.notify({ type: 'warning', message: 'Could not generate document URL' })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  }
}

async function verifyDoc(doc) {
  try {
    const { error } = await supabase
      .from('employee_documents')
      .update({
        verified: true,
        verified_by: authStore.user?.id,
        verified_at: new Date().toISOString(),
      })
      .eq('id', doc.id)
    if (error) throw error
    $q.notify({ type: 'positive', message: `"${doc.doc_name}" marked as verified` })
    const idx = documents.value.findIndex((d) => d.id === doc.id)
    if (idx !== -1) {
      documents.value[idx].verified = true
      documents.value[idx].verified_at = new Date().toISOString()
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  }
}

async function deleteDoc(doc) {
  $q.dialog({
    title: 'Delete Document',
    message: `Permanently delete "${doc.doc_name}"? This cannot be undone.`,
    cancel: true,
    dark: $q.dark.isActive,
    color: 'negative',
  }).onOk(async () => {
    try {
      await supabase.storage.from('employee-documents').remove([doc.file_path])
      const { error } = await supabase.from('employee_documents').delete().eq('id', doc.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Document deleted' })
      documents.value = documents.value.filter((d) => d.id !== doc.id)
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message })
    }
  })
}

onMounted(() => {
  loadDocuments()
  loadEmployees()
})
</script>

<style scoped>
/* ── KPI Cards ────────────────────────────────────────────────────────────── */
.kpi-card {
  border-radius: 14px;
  overflow: hidden;
  position: relative;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  height: 100%; /* fill full column height */
}
.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18) !important;
}
.kpi-inner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px !important;
  position: relative;
  overflow: hidden;
  min-height: 88px; /* keeps all cards equal height */
  height: 100%;
}
.kpi-bg-icon {
  position: absolute;
  right: -4px;
  bottom: -8px;
}

.kpi-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kpi-body {
  flex: 1;
}
.kpi-label {
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.75);
  line-height: 1.2;
  margin-bottom: 4px;
}
.kpi-value {
  font-size: 28px;
  font-weight: 800;
  color: #ffffff;
  line-height: 1;
}

/* ── Expiry Banner ─────────────────────────────────────────────────────────── */
.expiry-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
}

/* ── Main Panel ────────────────────────────────────────────────────────────── */
.main-panel {
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.07);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}
.body--dark .main-panel {
  border-color: rgba(255, 255, 255, 0.07);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
}

.panel-header {
  padding: 14px 18px;
}
.panel-title {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
}
.panel-sub {
  font-size: 11px;
  margin-top: 1px;
}

/* ── Filter Bar ────────────────────────────────────────────────────────────── */
.filter-bar {
  padding: 12px 16px;
}
.filter-input :deep(.q-field__inner) {
  border-radius: 8px !important;
}

/* ── Table ─────────────────────────────────────────────────────────────────── */
.doc-table :deep(.q-table__top),
.doc-table :deep(.q-table__bottom) {
  padding: 8px 12px;
}
.doc-table :deep(thead tr th) {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 10px 12px;
}
.doc-table :deep(tbody tr td) {
  padding: 10px 12px;
}
.doc-table :deep(tbody tr) {
  transition: background 0.15s;
}
.doc-table :deep(tbody tr:hover) {
  background: rgba(59, 130, 246, 0.05) !important;
}
.body--dark .doc-table :deep(tbody tr:hover) {
  background: rgba(255, 255, 255, 0.04) !important;
}

/* ── Status Dot ────────────────────────────────────────────────────────────── */
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-green {
  background: #22c55e;
  box-shadow: 0 0 4px rgba(34, 197, 94, 0.5);
}
.dot-amber {
  background: #f59e0b;
  box-shadow: 0 0 4px rgba(245, 158, 11, 0.5);
}

/* ── Expiry Section ────────────────────────────────────────────────────────── */
.expiry-section {
  border-radius: 12px;
  border: 1px solid rgba(239, 68, 68, 0.18);
  overflow: hidden;
}
.expiry-mini-card {
  border-radius: 10px;
  transition: transform 0.15s;
}
.expiry-mini-card:hover {
  transform: translateY(-1px);
}
.mini-expired {
  border: 1px solid rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.05);
}
.mini-soon {
  border: 1px solid rgba(245, 158, 11, 0.3);
  background: rgba(245, 158, 11, 0.05);
}
.body--dark .mini-expired {
  background: rgba(239, 68, 68, 0.09);
}
.body--dark .mini-soon {
  background: rgba(245, 158, 11, 0.09);
}
</style>
