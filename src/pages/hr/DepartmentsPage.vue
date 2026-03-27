<template>
  <div class="dept-page">
    <!-- ── Two-panel grid ──────────────────────────────────── -->
    <div class="two-panel-grid">
      <!-- ═══════════ LEFT: DEPARTMENTS ═══════════ -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title-wrap">
            <q-icon name="account_tree" size="18px" color="primary" />
            <span class="panel-title">Departments</span>
            <q-badge color="primary" :label="departments.length" class="q-ml-xs" />
          </div>
          <q-btn
            unelevated
            no-caps
            dense
            icon="add"
            label="Add"
            color="primary"
            size="sm"
            class="add-btn"
            @click="openDeptDialog()"
          />
        </div>

        <!-- Search -->
        <div class="panel-search">
          <q-icon name="search" size="16px" color="grey-6" />
          <input v-model="deptSearch" placeholder="Search departments…" class="search-input" />
        </div>

        <!-- List -->
        <div v-if="loadingDepts" class="panel-loading">
          <q-spinner-dots color="primary" size="28px" />
        </div>
        <div v-else-if="filteredDepts.length === 0" class="panel-empty">
          <q-icon name="account_tree" size="32px" color="grey-8" />
          <div class="text-grey-6 text-caption q-mt-sm">No departments yet</div>
        </div>
        <div v-else class="dept-list">
          <div
            v-for="dept in filteredDepts"
            :key="dept.id"
            class="dept-item"
            :class="{ active: selectedDept?.id === dept.id }"
            @click="selectDept(dept)"
          >
            <div class="dept-item-left">
              <div class="dept-color-dot" :style="{ background: deptColor(dept.name) }" />
              <div>
                <div class="dept-name">{{ dept.name }}</div>
                <div class="dept-desc" v-if="dept.description">{{ dept.description }}</div>
                <div class="dept-meta">
                  <span>{{ designationsOf(dept.id).length }} designations</span>
                  <q-badge
                    :color="dept.is_active ? 'green-9' : 'grey-7'"
                    :label="dept.is_active ? 'Active' : 'Inactive'"
                    class="q-ml-sm status-badge"
                  />
                </div>
              </div>
            </div>
            <div class="dept-item-actions" @click.stop>
              <q-btn
                flat
                round
                dense
                icon="edit"
                size="xs"
                color="grey-5"
                @click="openDeptDialog(dept)"
              />
              <q-btn
                flat
                round
                dense
                icon="delete_outline"
                size="xs"
                color="red-4"
                @click="deleteDept(dept)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- ═══════════ RIGHT: DESIGNATIONS ═══════════ -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title-wrap">
            <q-icon name="badge" size="18px" color="deep-purple-4" />
            <span class="panel-title">Designations</span>
            <span v-if="selectedDept" class="panel-subtitle">— {{ selectedDept.name }}</span>
            <q-badge color="deep-purple-4" :label="filteredDesignations.length" class="q-ml-xs" />
          </div>
          <q-btn
            unelevated
            no-caps
            dense
            icon="add"
            label="Add"
            color="deep-purple-4"
            size="sm"
            class="add-btn"
            @click="openDesigDialog()"
          />
        </div>

        <!-- Filter chips -->
        <div class="desig-filter-row">
          <button
            class="filter-chip"
            :class="{ active: desigDeptFilter === null }"
            @click="
              desigDeptFilter = null
              selectedDept = null
            "
          >
            All
          </button>
          <button
            v-for="dept in departments"
            :key="dept.id"
            class="filter-chip"
            :class="{ active: desigDeptFilter === dept.id }"
            @click="
              desigDeptFilter = dept.id
              selectedDept = dept
            "
          >
            {{ dept.name }}
          </button>
        </div>

        <!-- Search -->
        <div class="panel-search">
          <q-icon name="search" size="16px" color="grey-6" />
          <input v-model="desigSearch" placeholder="Search designations…" class="search-input" />
        </div>

        <!-- List -->
        <div v-if="loadingDesig" class="panel-loading">
          <q-spinner-dots color="deep-purple-4" size="28px" />
        </div>
        <div v-else-if="filteredDesignations.length === 0" class="panel-empty">
          <q-icon name="badge" size="32px" color="grey-8" />
          <div class="text-grey-6 text-caption q-mt-sm">
            {{ desigDeptFilter ? 'No designations in this department' : 'No designations yet' }}
          </div>
        </div>
        <div v-else class="desig-list">
          <div v-for="desig in filteredDesignations" :key="desig.id" class="desig-item">
            <div class="desig-item-left">
              <div class="desig-icon-wrap">
                <q-icon name="badge" size="16px" color="deep-purple-3" />
              </div>
              <div>
                <div class="desig-title">{{ desig.title }}</div>
                <div class="desig-dept-tag" v-if="getDeptName(desig.department_id)">
                  <q-icon name="account_tree" size="11px" class="q-mr-xs" />
                  {{ getDeptName(desig.department_id) }}
                </div>
                <div class="desig-desc" v-if="desig.description">{{ desig.description }}</div>
                <q-badge
                  :color="desig.is_active ? 'green-9' : 'grey-7'"
                  :label="desig.is_active ? 'Active' : 'Inactive'"
                  class="q-mt-xs status-badge"
                />
              </div>
            </div>
            <div class="desig-item-actions">
              <q-btn
                flat
                round
                dense
                icon="edit"
                size="xs"
                color="grey-5"
                @click="openDesigDialog(desig)"
              />
              <q-btn
                flat
                round
                dense
                icon="delete_outline"
                size="xs"
                color="red-4"
                @click="deleteDesig(desig)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════ DEPARTMENT DIALOG ══════════════ -->
    <q-dialog v-model="deptDialogOpen" persistent>
      <q-card 
        class="full-width rounded-borders"
        style="max-width: 480px; padding: 0"
        :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark'"
      >
        <div class="dialog-header row items-center q-pa-md" :style="{ borderBottom: $q.dark.isActive ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(0,0,0,0.1)' }">
          <q-icon name="account_tree" size="24px" color="primary" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">{{ editingDept ? 'Edit Department' : 'New Department' }}</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </div>

        <q-card-section class="q-gutter-md q-pa-lg">
          <div>
            <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Department Name *</div>
            <q-input :dark="$q.dark.isActive"
              outlined
              dense
              v-model="deptForm.name"
              placeholder="e.g. Kitchen, Front of House, Management"
              @keyup.enter="saveDept"
            />
          </div>
          <div>
            <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Description</div>
            <q-input :dark="$q.dark.isActive"
              outlined
              dense
              v-model="deptForm.description"
              type="textarea"
              rows="3"
              placeholder="Brief description of this department…"
            />
          </div>
          <q-toggle :dark="$q.dark.isActive" v-model="deptForm.is_active" label="Active" color="primary" />
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat no-caps label="Cancel" color="grey-6" v-close-popup />
          <q-btn
            unelevated
            no-caps
            :label="editingDept ? 'Update Department' : 'Create Department'"
            color="primary"
            :loading="savingDept"
            @click="saveDept"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══════════ DESIGNATION DIALOG ═════════════ -->
    <q-dialog v-model="desigDialogOpen" persistent>
      <q-card 
        class="full-width rounded-borders"
        style="max-width: 480px; padding: 0"
        :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark'"
      >
        <div class="dialog-header row items-center q-pa-md" :style="{ borderBottom: $q.dark.isActive ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(0,0,0,0.1)' }">
          <q-icon name="badge" size="24px" color="deep-purple-4" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">{{ editingDesig ? 'Edit Designation' : 'New Designation' }}</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </div>

        <q-card-section class="q-gutter-md q-pa-lg">
          <div>
            <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Designation Title *</div>
            <q-input :dark="$q.dark.isActive"
              outlined
              dense
              v-model="desigForm.title"
              placeholder="e.g. Head Chef, Senior Waiter, Cashier"
              @keyup.enter="saveDesig"
            />
          </div>
          <div>
            <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Department</div>
            <q-select :dark="$q.dark.isActive"
              outlined
              dense
              v-model="desigForm.department_id"
              :options="activeDepts"
              option-label="name"
              option-value="id"
              emit-value
              map-options
              clearable
            />
          </div>
          <div>
            <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Description</div>
            <q-input :dark="$q.dark.isActive"
              outlined
              dense
              v-model="desigForm.description"
              type="textarea"
              rows="3"
              placeholder="Brief description of this role…"
            />
          </div>
          <q-toggle :dark="$q.dark.isActive" v-model="desigForm.is_active" label="Active" color="deep-purple-4" />
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat no-caps label="Cancel" color="grey-6" v-close-popup />
          <q-btn
            unelevated
            no-caps
            :label="editingDesig ? 'Update Designation' : 'Create Designation'"
            color="deep-purple-4"
            :loading="savingDesig"
            @click="saveDesig"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()

// ── State ────────────────────────────────────────────────────────────
const departments = ref([])
const designations = ref([])
const loadingDepts = ref(false)
const loadingDesig = ref(false)
const selectedDept = ref(null)
const desigDeptFilter = ref(null)

const deptSearch = ref('')
const desigSearch = ref('')

// Department dialog
const deptDialogOpen = ref(false)
const savingDept = ref(false)
const editingDept = ref(null)
const deptForm = ref({ name: '', description: '', is_active: true })

// Designation dialog
const desigDialogOpen = ref(false)
const savingDesig = ref(false)
const editingDesig = ref(null)
const desigForm = ref({ title: '', description: '', department_id: null, is_active: true })

// ── Computed ─────────────────────────────────────────────────────────
const companyId = computed(
  () => authStore.currentBranch?.company_id || authStore.profile?.company_id,
)
const branchId = computed(() => authStore.currentBranch?.id)

const activeDepts = computed(() => departments.value.filter((d) => d.is_active))

const filteredDepts = computed(() => {
  const q = deptSearch.value.toLowerCase()
  if (!q) return departments.value
  return departments.value.filter((d) => d.name.toLowerCase().includes(q))
})

const filteredDesignations = computed(() => {
  let list = designations.value
  if (desigDeptFilter.value) {
    list = list.filter((d) => d.department_id === desigDeptFilter.value)
  }
  const q = desigSearch.value.toLowerCase()
  if (q) list = list.filter((d) => d.title.toLowerCase().includes(q))
  return list
})

// ── Helpers ───────────────────────────────────────────────────────────
function designationsOf(deptId) {
  return designations.value.filter((d) => d.department_id === deptId)
}

function getDeptName(deptId) {
  return departments.value.find((d) => d.id === deptId)?.name || ''
}

const DEPT_COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
]
function deptColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return DEPT_COLORS[Math.abs(hash) % DEPT_COLORS.length]
}

function selectDept(dept) {
  selectedDept.value = dept
  desigDeptFilter.value = dept.id
}

// ── Fetch ─────────────────────────────────────────────────────────────
async function fetchDepartments() {
  loadingDepts.value = true
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('company_id', companyId.value)
      .order('name')
    if (error) throw error
    departments.value = data || []
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Failed to load departments: ' + e.message })
  } finally {
    loadingDepts.value = false
  }
}

async function fetchDesignations() {
  loadingDesig.value = true
  try {
    const { data, error } = await supabase
      .from('designations')
      .select('*')
      .eq('company_id', companyId.value)
      .order('title')
    if (error) throw error
    designations.value = data || []
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Failed to load designations: ' + e.message })
  } finally {
    loadingDesig.value = false
  }
}

// ── Department CRUD ───────────────────────────────────────────────────
function openDeptDialog(dept = null) {
  editingDept.value = dept
  deptForm.value = dept
    ? { name: dept.name, description: dept.description || '', is_active: dept.is_active }
    : { name: '', description: '', is_active: true }
  deptDialogOpen.value = true
}

async function saveDept() {
  if (!deptForm.value.name.trim()) {
    $q.notify({ type: 'warning', message: 'Department name is required' })
    return
  }
  savingDept.value = true
  try {
    const payload = {
      name: deptForm.value.name.trim(),
      description: deptForm.value.description?.trim() || null,
      is_active: deptForm.value.is_active,
      company_id: companyId.value,
      branch_id: branchId.value,
    }

    if (editingDept.value) {
      const { error } = await supabase
        .from('departments')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingDept.value.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Department updated' })
    } else {
      const { error } = await supabase.from('departments').insert(payload)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Department created' })
    }

    deptDialogOpen.value = false
    await fetchDepartments()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    savingDept.value = false
  }
}

async function deleteDept(dept) {
  const desigCount = designationsOf(dept.id).length
  const msg =
    desigCount > 0
      ? `Delete "${dept.name}"? ${desigCount} designation(s) will be unlinked.`
      : `Delete "${dept.name}"?`

  $q.dialog({
    title: 'Delete Department',
    message: msg,
    dark: true,
    cancel: { flat: true, noCaps: true, color: 'grey-5' },
    ok: { unelevated: true, noCaps: true, color: 'red-6', label: 'Delete' },
  }).onOk(async () => {
    try {
      const { error } = await supabase.from('departments').delete().eq('id', dept.id)
      if (error) throw error
      if (selectedDept.value?.id === dept.id) {
        selectedDept.value = null
        desigDeptFilter.value = null
      }
      $q.notify({ type: 'positive', message: 'Department deleted' })
      await Promise.all([fetchDepartments(), fetchDesignations()])
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message })
    }
  })
}

// ── Designation CRUD ──────────────────────────────────────────────────
function openDesigDialog(desig = null) {
  editingDesig.value = desig
  desigForm.value = desig
    ? {
        title: desig.title,
        description: desig.description || '',
        department_id: desig.department_id || null,
        is_active: desig.is_active,
      }
    : {
        title: '',
        description: '',
        department_id: desigDeptFilter.value || null,
        is_active: true,
      }
  desigDialogOpen.value = true
}

async function saveDesig() {
  if (!desigForm.value.title.trim()) {
    $q.notify({ type: 'warning', message: 'Designation title is required' })
    return
  }
  savingDesig.value = true
  try {
    const payload = {
      title: desigForm.value.title.trim(),
      description: desigForm.value.description?.trim() || null,
      department_id: desigForm.value.department_id || null,
      is_active: desigForm.value.is_active,
      company_id: companyId.value,
      branch_id: branchId.value,
    }

    if (editingDesig.value) {
      const { error } = await supabase
        .from('designations')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingDesig.value.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Designation updated' })
    } else {
      const { error } = await supabase.from('designations').insert(payload)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Designation created' })
    }

    desigDialogOpen.value = false
    await fetchDesignations()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    savingDesig.value = false
  }
}

async function deleteDesig(desig) {
  $q.dialog({
    title: 'Delete Designation',
    message: `Delete "${desig.title}"?`,
    dark: true,
    cancel: { flat: true, noCaps: true, color: 'grey-5' },
    ok: { unelevated: true, noCaps: true, color: 'red-6', label: 'Delete' },
  }).onOk(async () => {
    try {
      const { error } = await supabase.from('designations').delete().eq('id', desig.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Designation deleted' })
      await fetchDesignations()
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message })
    }
  })
}

// ── Init ──────────────────────────────────────────────────────────────
onMounted(async () => {
  await Promise.all([fetchDepartments(), fetchDesignations()])
})
</script>

<style scoped>
.dept-page {
  padding: 0;
}

/* ── Two Panel Grid ── */
.two-panel-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 900px) {
  .two-panel-grid {
    grid-template-columns: 1fr;
  }
}

/* ── Panel ── */
.panel {
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 520px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
}

.panel-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: #e5e7eb;
}

.panel-subtitle {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.35);
}

.add-btn {
  font-size: 0.75rem !important;
  font-weight: 600 !important;
  border-radius: 8px !important;
  padding: 0 12px !important;
}

/* ── Search ── */
.panel-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.015);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #e5e7eb;
  font-size: 0.8rem;
}
.search-input::placeholder {
  color: rgba(255, 255, 255, 0.25);
}

/* ── Filter chips ── */
.desig-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
}

.filter-chip {
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  transition: all 0.18s;
}
.filter-chip:hover {
  color: rgba(255, 255, 255, 0.7);
  border-color: rgba(255, 255, 255, 0.25);
}
.filter-chip.active {
  background: rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.35);
  color: #a78bfa;
}

/* ── Loading / Empty ── */
.panel-loading,
.panel-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

/* ── Department List ── */
.dept-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.dept-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.18s;
  border: 1px solid transparent;
  margin-bottom: 4px;
}
.dept-item:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.07);
}
.dept-item.active {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.25);
}

.dept-item-left {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.dept-color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}

.dept-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: #e5e7eb;
}

.dept-desc {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.dept-meta {
  display: flex;
  align-items: center;
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 4px;
}

.dept-item-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}
.dept-item:hover .dept-item-actions {
  opacity: 1;
}

/* ── Designation List ── */
.desig-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.desig-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 12px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.02);
  margin-bottom: 6px;
  transition: all 0.18s;
}
.desig-item:hover {
  background: rgba(139, 92, 246, 0.06);
  border-color: rgba(139, 92, 246, 0.15);
}

.desig-item-left {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex: 1;
}

.desig-icon-wrap {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(139, 92, 246, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.desig-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: #e5e7eb;
}

.desig-dept-tag {
  display: inline-flex;
  align-items: center;
  font-size: 0.68rem;
  color: #818cf8;
  margin-top: 2px;
  background: rgba(99, 102, 241, 0.1);
  padding: 1px 7px;
  border-radius: 10px;
}

.desig-desc {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 3px;
}

.desig-item-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}
.desig-item:hover .desig-item-actions {
  opacity: 1;
}

.status-badge {
  font-size: 0.6rem !important;
  padding: 1px 7px !important;
}

/* ── Dialog ── */
.dialog-card {
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  min-width: 420px;
  max-width: 480px;
  padding: 0;
}

.dialog-header {
  display: flex;
  align-items: center;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  font-size: 1rem;
  font-weight: 700;
  color: #e5e7eb;
}

.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px !important;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.45);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.field-input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 10px 14px;
  color: #e5e7eb;
  font-size: 0.88rem;
  outline: none;
  transition: border-color 0.2s;
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
}
.field-input:focus {
  border-color: rgba(99, 102, 241, 0.5);
}
.field-textarea {
  resize: vertical;
}
.field-select {
  cursor: pointer;
}
.field-select option {
  background: #1f2937;
}

.field-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 18px !important;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
</style>
