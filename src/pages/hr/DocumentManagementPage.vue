<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="hr"
      title="Document Management"
      breadcrumbs="Human Resources / Document Management"
    />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="erp-stat-card" flat>
          <q-card-section class="row items-center no-wrap q-pa-md">
            <q-icon name="folder" size="36px" color="blue" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Total Documents</div>
              <div class="text-h5 text-weight-bold">{{ kpi.total }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="erp-stat-card" flat>
          <q-card-section class="row items-center no-wrap q-pa-md">
            <q-icon name="verified_user" size="36px" color="green" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Verified</div>
              <div class="text-h5 text-weight-bold text-green">{{ kpi.verified }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="erp-stat-card" flat>
          <q-card-section class="row items-center no-wrap q-pa-md">
            <q-icon name="pending" size="36px" color="amber" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Pending Verification</div>
              <div class="text-h5 text-weight-bold text-amber">{{ kpi.pending }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="erp-stat-card" flat>
          <q-card-section class="row items-center no-wrap q-pa-md">
            <q-icon name="event_busy" size="36px" color="red" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Expiring / Expired</div>
              <div class="text-h5 text-weight-bold text-red">{{ kpi.expiring }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Expiry Alert Banner -->
    <q-banner
      v-if="expiringDocs.length"
      dark
      dense
      rounded
      class="q-mb-md"
      style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3)"
    >
      <template #avatar>
        <q-icon name="warning" color="red-4" />
      </template>
      <span class="text-red-3 text-caption">
        <strong>{{ expiringDocs.length }} document(s)</strong> are expiring within 30 days or
        already expired.
      </span>
      <template #action>
        <q-btn
          flat
          dense
          color="red-3"
          label="View All"
          no-caps
          size="sm"
          @click="filterFilter = 'expiring'"
        />
      </template>
    </q-banner>

    <!-- Main Card -->
    <q-card
      flat
      bordered
      style="
        background: var(--erp-bg-form-card, #111827);
        border-color: rgba(255, 255, 255, 0.08);
        border-top: 3px solid #3b82f6;
      "
    >
      <!-- Filters -->
      <div class="row q-pa-md q-col-gutter-sm items-center">
        <div class="col-12 col-sm-3">
          <q-input
            dark
            dense
            outlined
            v-model="search"
            placeholder="Search by employee or document name..."
            clearable
          >
            <template #prepend><q-icon name="search" /></template>
          </q-input>
        </div>
        <div class="col-12 col-sm-2">
          <q-select
            dark
            dense
            outlined
            v-model="empFilter"
            :options="[{ label: 'All Employees', value: '' }, ...employeeOptions]"
            label="Employee"
            emit-value
            map-options
            clearable
          />
        </div>
        <div class="col-12 col-sm-2">
          <q-select
            dark
            dense
            outlined
            v-model="docTypeFilter"
            :options="[{ label: 'All Types', value: '' }, ...docTypeOptions]"
            label="Doc Type"
            emit-value
            map-options
            clearable
          />
        </div>
        <div class="col-12 col-sm-2">
          <q-select
            dark
            dense
            outlined
            v-model="verifiedFilter"
            :options="[
              { label: 'All Status', value: '' },
              { label: 'Verified', value: 'verified' },
              { label: 'Pending', value: 'pending' },
            ]"
            label="Status"
            emit-value
            map-options
          />
        </div>
        <div class="col-12 col-sm-2">
          <q-select
            dark
            dense
            outlined
            v-model="filterFilter"
            :options="[
              { label: 'All Documents', value: '' },
              { label: 'Expiring (30d)', value: 'expiring' },
              { label: 'Expired', value: 'expired' },
            ]"
            label="Expiry Filter"
            emit-value
            map-options
          />
        </div>
        <div class="col-auto">
          <q-btn
            unelevated
            color="blue-7"
            icon="refresh"
            no-caps
            size="sm"
            @click="loadDocuments"
            :loading="loading"
          />
        </div>
      </div>

      <q-separator dark style="opacity: 0.08" />

      <!-- Documents Table -->
      <div class="q-pa-md">
        <q-table
          dark
          flat
          bordered
          :rows="filteredDocuments"
          :columns="columns"
          row-key="id"
          :loading="loading"
          :pagination="{ rowsPerPage: 20 }"
          class="erp-data-grid"
        >
          <template #body-cell-employee="props">
            <q-td :props="props">
              <div class="row items-center no-wrap q-gutter-xs">
                <q-avatar size="28px" color="blue-9" text-color="white" font-size="11px">
                  {{ initials(props.row.employees?.full_name || props.row.employees?.first_name) }}
                </q-avatar>
                <div>
                  <div class="text-weight-medium text-grey-2" style="font-size: 12px">
                    {{ props.row.employees?.full_name || props.row.employees?.first_name }}
                  </div>
                  <div class="text-caption text-grey-5">
                    {{ props.row.employees?.employee_code }}
                  </div>
                </div>
              </div>
            </q-td>
          </template>

          <template #body-cell-doc_type="props">
            <q-td :props="props">
              <q-badge
                :color="docTypeColor(props.row.doc_type)"
                :label="formatDocType(props.row.doc_type)"
                class="text-capitalize"
              />
            </q-td>
          </template>

          <template #body-cell-expiry_date="props">
            <q-td :props="props">
              <template v-if="props.row.expiry_date">
                <span :class="expiryClass(props.row.expiry_date)">
                  {{ props.row.expiry_date }}
                </span>
                <q-badge
                  v-if="isExpired(props.row.expiry_date)"
                  color="red"
                  label="Expired"
                  class="q-ml-xs"
                />
                <q-badge
                  v-else-if="isExpiringSoon(props.row.expiry_date)"
                  color="amber-8"
                  label="Soon"
                  class="q-ml-xs"
                />
              </template>
              <span v-else class="text-grey-6">—</span>
            </q-td>
          </template>

          <template #body-cell-verified="props">
            <q-td :props="props" class="text-center">
              <q-badge
                :color="props.row.verified ? 'green' : 'grey-7'"
                :label="props.row.verified ? 'Verified' : 'Pending'"
              />
              <div
                v-if="props.row.verified && props.row.verified_at"
                class="text-caption text-grey-6 q-mt-xs"
              >
                {{ props.row.verified_at?.split('T')[0] }}
              </div>
            </q-td>
          </template>

          <template #body-cell-actions="props">
            <q-td :props="props" class="q-gutter-xs">
              <q-btn
                flat
                dense
                round
                icon="open_in_new"
                color="blue"
                size="sm"
                @click="viewDoc(props.row)"
              >
                <q-tooltip>View Document</q-tooltip>
              </q-btn>
              <q-btn
                v-if="!props.row.verified"
                flat
                dense
                round
                icon="verified_user"
                color="green"
                size="sm"
                @click="verifyDoc(props.row)"
              >
                <q-tooltip>Mark Verified</q-tooltip>
              </q-btn>
              <q-btn
                flat
                dense
                round
                icon="delete"
                color="negative"
                size="sm"
                @click="deleteDoc(props.row)"
              >
                <q-tooltip>Delete</q-tooltip>
              </q-btn>
            </q-td>
          </template>

          <template #no-data>
            <div class="text-center text-grey-5 q-pa-xl full-width">
              <q-icon name="folder_open" size="48px" class="q-mb-md" />
              <div>No documents found</div>
            </div>
          </template>
        </q-table>
      </div>
    </q-card>

    <!-- Expiring Documents Section -->
    <q-card
      v-if="expiringDocs.length"
      flat
      bordered
      class="q-mt-md"
      style="background: rgba(239, 68, 68, 0.05); border-color: rgba(239, 68, 68, 0.2)"
    >
      <q-card-section>
        <div class="row items-center q-mb-md">
          <q-icon name="event_busy" color="red-4" size="20px" class="q-mr-sm" />
          <span class="text-subtitle2 text-red-3 text-weight-bold"
            >Documents Expiring Within 30 Days or Expired</span
          >
        </div>
        <div class="row q-col-gutter-sm">
          <div
            v-for="doc in expiringDocs.slice(0, 8)"
            :key="doc.id"
            class="col-12 col-sm-6 col-md-4 col-lg-3"
          >
            <q-card
              flat
              style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2)"
            >
              <q-card-section class="q-pa-sm">
                <div class="row items-center no-wrap q-gutter-xs q-mb-xs">
                  <q-icon name="person" size="14px" color="grey-5" />
                  <span class="text-caption text-grey-3 ellipsis">{{
                    doc.employees?.full_name || doc.employees?.first_name
                  }}</span>
                </div>
                <div class="text-caption text-weight-bold text-grey-2 ellipsis">
                  {{ doc.doc_name }}
                </div>
                <div class="row items-center justify-between q-mt-xs">
                  <q-badge
                    :color="docTypeColor(doc.doc_type)"
                    :label="formatDocType(doc.doc_type)"
                    size="xs"
                  />
                  <span
                    class="text-caption"
                    :class="isExpired(doc.expiry_date) ? 'text-red' : 'text-amber'"
                  >
                    {{ doc.expiry_date }}
                  </span>
                </div>
              </q-card-section>
            </q-card>
          </div>
        </div>
      </q-card-section>
    </q-card>
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
  { name: 'employee', label: 'Employee', align: 'left', field: 'employee_id' },
  { name: 'doc_type', label: 'Type', align: 'left', field: 'doc_type' },
  { name: 'doc_name', label: 'Document', align: 'left', field: 'doc_name' },
  { name: 'expiry_date', label: 'Expiry', align: 'left', field: 'expiry_date' },
  { name: 'verified', label: 'Status', align: 'center', field: 'verified' },
  {
    name: 'uploaded',
    label: 'Uploaded',
    align: 'left',
    field: 'created_at',
    format: (v) => (v ? v.split('T')[0] : '—'),
  },
  { name: 'actions', label: '', align: 'center', field: 'id' },
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
    .filter((d) => {
      if (!d.expiry_date) return false
      const exp = new Date(d.expiry_date)
      return exp <= soon
    })
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
function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  return parts.length >= 2 ? parts[0][0] + parts[1][0] : name[0]
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
    nic_front: 'indigo',
    nic_back: 'indigo-8',
    photo: 'purple',
    contract_letter: 'blue',
    gs_letter: 'teal',
    police_report: 'deep-purple',
    driving_license: 'cyan',
    passport: 'green-8',
    birth_certificate: 'orange',
    cv: 'amber-8',
    educational_cert: 'deep-orange',
    experience_letter: 'pink',
    bank_statement: 'lime-8',
    other: 'grey-7',
  }
  return map[type] || 'grey-7'
}

function isExpired(date) {
  if (!date) return false
  return new Date(date) < new Date()
}

function isExpiringSoon(date) {
  if (!date) return false
  const soon = new Date()
  soon.setDate(soon.getDate() + 30)
  return new Date(date) <= soon && !isExpired(date)
}

function expiryClass(date) {
  if (isExpired(date)) return 'text-red text-weight-bold'
  if (isExpiringSoon(date)) return 'text-amber'
  return 'text-grey-3'
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
    console.error('[Docs] loadDocuments:', err.message)
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

// ── Actions ───────────────────────────────────────────────────────────────────
async function viewDoc(doc) {
  try {
    const { data } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(doc.file_path, 600)
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
    } else {
      $q.notify({ type: 'warning', message: 'Could not generate document URL' })
    }
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
    dark: true,
    color: 'negative',
  }).onOk(async () => {
    try {
      // Remove from storage
      await supabase.storage.from('employee-documents').remove([doc.file_path])
      // Remove from DB
      const { error } = await supabase.from('employee_documents').delete().eq('id', doc.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Document deleted' })
      documents.value = documents.value.filter((d) => d.id !== doc.id)
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message })
    }
  })
}

// ── Init ──────────────────────────────────────────────────────────────────────
onMounted(() => {
  loadDocuments()
  loadEmployees()
})
</script>
