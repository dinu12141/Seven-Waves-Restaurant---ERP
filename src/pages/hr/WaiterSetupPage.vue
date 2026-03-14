<template>
  <div>
    <!-- ── Header ── -->
    <div class="row items-center q-mb-lg">
      <div>
        <div class="text-h5 text-weight-bold text-white">Waiter Setup</div>
        <div class="text-caption text-grey-5 q-mt-xs">
          Create waiter profiles, assign managers, and award points
        </div>
      </div>
      <q-space />
      <q-btn color="cyan-8" icon="add" label="Create Waiter Profile" no-caps @click="openCreateDialog" />
    </div>

    <!-- ── Stats Row ── -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-6 col-md-3">
        <div class="stat-card">
          <q-icon name="badge" size="28px" color="cyan" class="q-mb-sm" />
          <div class="stat-num text-cyan">{{ stats.total }}</div>
          <div class="stat-lbl">Total Waiter Profiles</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card">
          <q-icon name="check_circle" size="28px" color="green" class="q-mb-sm" />
          <div class="stat-num text-green">{{ stats.active }}</div>
          <div class="stat-lbl">Active</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card">
          <q-icon name="person_off" size="28px" color="orange" class="q-mb-sm" />
          <div class="stat-num text-orange">{{ stats.noProfile }}</div>
          <div class="stat-lbl">Employees Without Profile</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card">
          <q-icon name="stars" size="28px" color="amber" class="q-mb-sm" />
          <div class="stat-num text-amber">{{ stats.totalPoints }}</div>
          <div class="stat-lbl">Total Points Awarded</div>
        </div>
      </div>
    </div>

    <!-- ── Waiter Profiles Table ── -->
    <q-table
      dark flat bordered
      title="Waiter Profiles"
      :rows="waiterProfiles"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :pagination="{ rowsPerPage: 15 }"
      class="erp-data-grid"
    >
      <template #body-cell-waiter="props">
        <q-td :props="props">
          <div class="row items-center no-wrap q-gutter-sm">
            <q-avatar size="34px" class="wp-avatar">
              {{ initials(props.row.employee?.full_name) }}
            </q-avatar>
            <div>
              <div class="text-weight-bold text-white">{{ props.row.employee?.full_name }}</div>
              <div class="text-caption text-grey-5">{{ props.row.employee?.employee_code }}</div>
            </div>
          </div>
        </q-td>
      </template>

      <template #body-cell-waiter_code="props">
        <q-td :props="props">
          <q-chip dense color="cyan-9" text-color="white" icon="badge">
            {{ props.row.waiter_code }}
          </q-chip>
        </q-td>
      </template>

      <template #body-cell-status="props">
        <q-td :props="props">
          <q-chip dense :color="props.row.is_active ? 'green-9' : 'red-9'" text-color="white">
            {{ props.row.is_active ? 'Active' : 'Inactive' }}
          </q-chip>
        </q-td>
      </template>

      <template #body-cell-points="props">
        <q-td :props="props">
          <span class="text-amber text-weight-bold">{{ props.row.current_points }}</span>
          <span class="text-grey-6 text-caption q-ml-xs">pts</span>
        </q-td>
      </template>

      <template #body-cell-manager="props">
        <q-td :props="props">
          <span v-if="props.row.hierarchy?.length">
            {{ props.row.hierarchy[0]?.manager_employee?.full_name }}
            <q-badge class="q-ml-xs" color="purple-9" :label="formatHType(props.row.hierarchy[0]?.hierarchy_type)" />
          </span>
          <span v-else class="text-grey-6 text-caption">— Not assigned</span>
        </q-td>
      </template>

      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn flat round dense icon="supervisor_account" color="purple" size="sm"
            @click="openHierarchyDialog(props.row)">
            <q-tooltip>Assign Manager</q-tooltip>
          </q-btn>
          <q-btn flat round dense icon="stars" color="amber" size="sm"
            @click="openPointsDialog(props.row)">
            <q-tooltip>Award / Deduct Points</q-tooltip>
          </q-btn>
          <q-btn flat round dense icon="mail" color="blue" size="sm"
            @click="openMessageDialog(props.row)">
            <q-tooltip>Send Message</q-tooltip>
          </q-btn>
          <q-btn flat round dense :icon="props.row.is_active ? 'toggle_on' : 'toggle_off'"
            :color="props.row.is_active ? 'green' : 'grey'" size="sm"
            @click="toggleActive(props.row)">
            <q-tooltip>{{ props.row.is_active ? 'Deactivate' : 'Activate' }}</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- ══════════════════════════════════════════════════════
         DIALOG 1: Create Waiter Profile
    ══════════════════════════════════════════════════════ -->
    <q-dialog v-model="showCreate" persistent>
      <q-card class="erp-dialog-card" style="width: 500px; max-width: 95vw">
        <q-bar class="erp-dialog-bar">
          <q-icon name="badge" />
          <div class="q-ml-sm text-weight-bold">Create Waiter Profile</div>
          <q-space />
          <q-btn dense flat icon="close" v-close-popup />
        </q-bar>
        <q-card-section class="q-pb-none">
          <div class="text-caption text-grey-5 q-mb-md">
            Select an employee who has the <strong class="text-cyan">waiter</strong> role assigned. Their profile will appear in the waiter dashboard.
          </div>
          <q-select
            dark outlined
            v-model="createForm.employee_id"
            :options="employeesWithoutProfile"
            option-value="id" option-label="full_name"
            emit-value map-options
            label="Employee *"
            :rules="[v => !!v || 'Required']"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section avatar>
                  <q-avatar size="30px" color="primary" text-color="white" font-size="12px">
                    {{ initials(scope.opt.full_name) }}
                  </q-avatar>
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ scope.opt.full_name }}</q-item-label>
                  <q-item-label caption>{{ scope.opt.employee_code }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>

          <q-input
            dark outlined
            v-model="createForm.waiter_code"
            label="Waiter Code *"
            placeholder="e.g. W001"
            class="q-mt-md"
            :rules="[v => !!v || 'Required']"
            hint="Unique code shown on receipts and KOTs"
          />

          <q-input
            dark outlined
            v-model="createForm.display_name"
            label="Display Name (optional)"
            class="q-mt-md"
            hint="Shown on the waiter app. Defaults to employee name."
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md q-pt-lg">
          <q-btn flat label="Cancel" color="grey" v-close-popup no-caps />
          <q-btn color="cyan-8" label="Create Profile" icon="save" :loading="saving" @click="createProfile" no-caps />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══════════════════════════════════════════════════════
         DIALOG 2: Assign Manager / Hierarchy
    ══════════════════════════════════════════════════════ -->
    <q-dialog v-model="showHierarchy" persistent>
      <q-card class="erp-dialog-card" style="width: 500px; max-width: 95vw">
        <q-bar class="erp-dialog-bar">
          <q-icon name="supervisor_account" />
          <div class="q-ml-sm text-weight-bold">Assign Manager</div>
          <q-space />
          <q-btn dense flat icon="close" v-close-popup />
        </q-bar>
        <q-card-section>
          <div class="text-grey-4 text-body2 q-mb-md">
            Assigning manager for: <strong class="text-white">{{ selectedProfile?.employee?.full_name }}</strong>
          </div>
          <q-select
            dark outlined
            v-model="hierarchyForm.manager_employee_id"
            :options="managerEmployees"
            option-value="id" option-label="full_name"
            emit-value map-options
            label="Manager *"
            class="q-mb-md"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section avatar>
                  <q-avatar size="28px" color="purple" text-color="white" font-size="11px">
                    {{ initials(scope.opt.full_name) }}
                  </q-avatar>
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ scope.opt.full_name }}</q-item-label>
                  <q-item-label caption>{{ scope.opt.employee_code }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
          <q-select
            dark outlined
            v-model="hierarchyForm.hierarchy_type"
            :options="hierarchyTypeOpts"
            emit-value map-options
            label="Hierarchy Type *"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" v-close-popup no-caps />
          <q-btn color="purple" label="Save Assignment" :loading="saving" @click="saveHierarchy" no-caps icon="save" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══════════════════════════════════════════════════════
         DIALOG 3: Award / Deduct Points
    ══════════════════════════════════════════════════════ -->
    <q-dialog v-model="showPoints" persistent>
      <q-card class="erp-dialog-card" style="width: 460px; max-width: 95vw">
        <q-bar class="erp-dialog-bar">
          <q-icon name="stars" />
          <div class="q-ml-sm text-weight-bold">Points Management</div>
          <q-space />
          <q-btn dense flat icon="close" v-close-popup />
        </q-bar>
        <q-card-section>
          <div class="row items-center q-mb-md">
            <div class="text-grey-4 text-body2">
              Waiter: <strong class="text-white">{{ selectedProfile?.employee?.full_name }}</strong>
            </div>
            <q-space />
            <q-badge color="amber-9" text-color="dark" class="text-weight-bold q-px-sm">
              Current: {{ selectedProfile?.current_points }} pts
            </q-badge>
          </div>
          <q-select
            dark outlined
            v-model="pointsForm.point_type"
            :options="pointTypeOpts" emit-value map-options
            label="Type *"
            class="q-mb-md"
          />
          <q-input
            dark outlined
            v-model.number="pointsForm.points"
            label="Points (positive = award, negative = deduct) *"
            type="number"
            class="q-mb-md"
            :rules="[v => v !== 0 || 'Cannot be 0']"
          />
          <q-input
            dark outlined
            v-model="pointsForm.note"
            label="Note (optional)"
            type="textarea" rows="2"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" v-close-popup no-caps />
          <q-btn color="amber-8" label="Save Points" :loading="saving" @click="savePoints" no-caps icon="stars" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══════════════════════════════════════════════════════
         DIALOG 4: Send Manager Message
    ══════════════════════════════════════════════════════ -->
    <q-dialog v-model="showMessage" persistent>
      <q-card class="erp-dialog-card" style="width: 500px; max-width: 95vw">
        <q-bar class="erp-dialog-bar">
          <q-icon name="mail" />
          <div class="q-ml-sm text-weight-bold">Send Message</div>
          <q-space />
          <q-btn dense flat icon="close" v-close-popup />
        </q-bar>
        <q-card-section>
          <div class="text-grey-4 text-body2 q-mb-md">
            To: <strong class="text-white">{{ selectedProfile?.employee?.full_name }}</strong>
          </div>
          <q-input
            dark outlined
            v-model="messageForm.subject"
            label="Subject"
            class="q-mb-md"
          />
          <q-select
            dark outlined
            v-model="messageForm.priority"
            :options="[{label:'Normal', value:'normal'},{label:'🔴 Urgent', value:'urgent'},{label:'🚨 Critical', value:'critical'}]"
            emit-value map-options
            label="Priority"
            class="q-mb-md"
          />
          <q-input
            dark outlined
            v-model="messageForm.message_body"
            label="Message *"
            type="textarea"
            rows="4"
            :rules="[v => !!v || 'Required']"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" v-close-popup no-caps />
          <q-btn color="blue-7" label="Send Message" :loading="saving" @click="sendMessage" no-caps icon="send" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()

const loading = ref(false)
const saving = ref(false)
const waiterProfiles = ref([])
const allEmployees = ref([])

// dialogs
const showCreate = ref(false)
const showHierarchy = ref(false)
const showPoints = ref(false)
const showMessage = ref(false)
const selectedProfile = ref(null)

const createForm = reactive({ employee_id: null, waiter_code: '', display_name: '' })
const hierarchyForm = reactive({ manager_employee_id: null, hierarchy_type: 'waiter_manager' })
const pointsForm = reactive({ point_type: 'bonus', points: 10, note: '' })
const messageForm = reactive({ subject: '', message_body: '', priority: 'normal' })

const stats = computed(() => ({
  total: waiterProfiles.value.length,
  active: waiterProfiles.value.filter(w => w.is_active).length,
  noProfile: allEmployees.value.filter(e => !waiterProfiles.value.some(w => w.employee_id === e.id)).length,
  totalPoints: waiterProfiles.value.reduce((s, w) => s + (w.current_points || 0), 0),
}))

const employeesWithoutProfile = computed(() =>
  allEmployees.value.filter(e => !waiterProfiles.value.some(w => w.employee_id === e.id))
)

const managerEmployees = computed(() => allEmployees.value)

const hierarchyTypeOpts = [
  { label: 'Waiter Manager', value: 'waiter_manager' },
  { label: 'Floor Manager', value: 'floor_manager' },
  { label: 'Shift Lead', value: 'shift_lead' },
  { label: 'General', value: 'general' },
]

const pointTypeOpts = [
  { label: '✅ Served Order', value: 'served_order' },
  { label: '🎁 Bonus', value: 'bonus' },
  { label: '⚙️ Adjustment', value: 'adjustment' },
  { label: '⚠️ Penalty', value: 'penalty' },
  { label: '💰 Tip Received', value: 'tip_received' },
]

const columns = [
  { name: 'waiter', label: 'Employee', align: 'left', field: row => row.employee?.full_name, sortable: true },
  { name: 'waiter_code', label: 'Code', align: 'center', field: 'waiter_code' },
  { name: 'status', label: 'Status', align: 'center', field: 'is_active' },
  { name: 'points', label: 'Points', align: 'center', field: 'current_points', sortable: true },
  { name: 'orders', label: 'Orders', align: 'center', field: 'total_orders_served', sortable: true },
  { name: 'manager', label: 'Manager', align: 'left' },
  { name: 'actions', label: 'Actions', align: 'center' },
]

function initials(name) {
  if (!name) return '?'
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
}

function formatHType(type) {
  const m = { waiter_manager: 'W.Mgr', floor_manager: 'F.Mgr', shift_lead: 'Lead', general: 'GM', kitchen_manager: 'K.Mgr' }
  return m[type] || type
}

onMounted(async () => {
  await Promise.all([loadProfiles(), loadEmployees()])
})

async function loadProfiles() {
  loading.value = true
  const branchId = authStore.currentBranch?.id
  if (!branchId) { loading.value = false; return }

  const { data, error } = await supabase
    .from('waiter_profiles')
    .select(`
      *,
      employee:employee_id ( id, full_name, employee_code ),
      hierarchy:employee_hierarchy_assignments (
        hierarchy_type, is_active,
        manager_employee:manager_employee_id ( full_name, employee_code )
      )
    `)
    .eq('branch_id', branchId)
    .order('created_at')

  if (error) $q.notify({ type: 'negative', message: error.message })
  else waiterProfiles.value = data || []
  loading.value = false
}

async function loadEmployees() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  const { data } = await supabase
    .from('employees')
    .select('id, full_name, employee_code')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('full_name')
  allEmployees.value = data || []
}

function openCreateDialog() {
  Object.assign(createForm, { employee_id: null, waiter_code: '', display_name: '' })
  // Auto-generate next waiter code
  const total = waiterProfiles.value.length + 1
  createForm.waiter_code = `W${String(total).padStart(3, '0')}`
  showCreate.value = true
}

async function createProfile() {
  if (!createForm.employee_id || !createForm.waiter_code) {
    $q.notify({ type: 'warning', message: 'Employee and Waiter Code are required' })
    return
  }
  saving.value = true
  try {
    const branchId = authStore.currentBranch?.id

    // Get user_id from employee profile_id
    const { data: emp } = await supabase
      .from('employees')
      .select('profile_id')
      .eq('id', createForm.employee_id)
      .single()

    const { error } = await supabase.from('waiter_profiles').insert({
      employee_id: createForm.employee_id,
      user_id: emp?.profile_id || null,
      branch_id: branchId,
      waiter_code: createForm.waiter_code.toUpperCase().trim(),
      display_name: createForm.display_name || null,
      is_active: true,
      current_points: 0,
      total_orders_served: 0,
    })
    if (error) throw error
    $q.notify({ type: 'positive', message: '✅ Waiter profile created! The waiter can now see their profile tab.' })
    showCreate.value = false
    await loadProfiles()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

function openHierarchyDialog(profile) {
  selectedProfile.value = profile
  const existing = profile.hierarchy?.[0]
  hierarchyForm.manager_employee_id = existing?.manager_employee?.id || null
  hierarchyForm.hierarchy_type = existing?.hierarchy_type || 'waiter_manager'
  showHierarchy.value = true
}

async function saveHierarchy() {
  if (!hierarchyForm.manager_employee_id) {
    $q.notify({ type: 'warning', message: 'Please select a manager' })
    return
  }
  saving.value = true
  try {
    const branchId = authStore.currentBranch?.id
    const employeeId = selectedProfile.value.employee_id

    // Upsert — update existing or insert new
    const { error } = await supabase
      .from('employee_hierarchy_assignments')
      .upsert({
        employee_id: employeeId,
        manager_employee_id: hierarchyForm.manager_employee_id,
        branch_id: branchId,
        hierarchy_type: hierarchyForm.hierarchy_type,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'employee_id,hierarchy_type,branch_id' })

    if (error) throw error
    $q.notify({ type: 'positive', message: '✅ Manager assigned successfully' })
    showHierarchy.value = false
    await loadProfiles()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

function openPointsDialog(profile) {
  selectedProfile.value = profile
  Object.assign(pointsForm, { point_type: 'bonus', points: 10, note: '' })
  showPoints.value = true
}

async function savePoints() {
  if (!pointsForm.points || pointsForm.points === 0) {
    $q.notify({ type: 'warning', message: 'Points cannot be 0' })
    return
  }
  saving.value = true
  try {
    // Use the secure RPC — enforces role check + DB trigger recomputes current_points
    const { data, error } = await supabase.rpc('admin_adjust_waiter_points', {
      p_waiter_profile_id: selectedProfile.value.id,
      p_points:            pointsForm.points,
      p_point_type:        pointsForm.point_type,
      p_note:              pointsForm.note || null,
    })
    if (error) throw error
    if (data?.success === false) throw new Error(data.error || 'Adjustment failed')

    // Patch local list instantly using new balance from RPC
    const idx = waiterProfiles.value.findIndex(w => w.id === selectedProfile.value.id)
    if (idx !== -1) waiterProfiles.value[idx].current_points = data.new_balance

    const action = pointsForm.points > 0 ? 'awarded' : 'deducted'
    $q.notify({
      type: 'positive',
      message: `✅ ${Math.abs(pointsForm.points)} pts ${action}. New balance: ${data.new_balance} pts`,
    })
    showPoints.value = false
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

function openMessageDialog(profile) {
  selectedProfile.value = profile
  Object.assign(messageForm, { subject: '', message_body: '', priority: 'normal' })
  showMessage.value = true
}

async function sendMessage() {
  if (!messageForm.message_body) {
    $q.notify({ type: 'warning', message: 'Message body is required' })
    return
  }
  saving.value = true
  try {
    const branchId = authStore.currentBranch?.id

    // Get current user's employee record
    const { data: senderEmp } = await supabase
      .from('employees')
      .select('id')
      .eq('profile_id', authStore.user?.id)
      .maybeSingle()

    if (!senderEmp) throw new Error('Your employee record not found')

    const { error } = await supabase.from('manager_messages').insert({
      sender_employee_id: senderEmp.id,
      receiver_employee_id: selectedProfile.value.employee_id,
      branch_id: branchId,
      subject: messageForm.subject || '',
      message_body: messageForm.message_body,
      priority: messageForm.priority,
    })
    if (error) throw error
    $q.notify({ type: 'positive', message: '✅ Message sent! Waiter will see a notification.' })
    showMessage.value = false
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

async function toggleActive(profile) {
  const { error } = await supabase
    .from('waiter_profiles')
    .update({ is_active: !profile.is_active, updated_at: new Date().toISOString() })
    .eq('id', profile.id)
  if (error) $q.notify({ type: 'negative', message: error.message })
  else {
    $q.notify({ type: 'positive', message: `Profile ${profile.is_active ? 'deactivated' : 'activated'}` })
    await loadProfiles()
  }
}
</script>

<style lang="scss" scoped>
.stat-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  padding: 16px;
  text-align: center;
}
.stat-num {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.1;
}
.stat-lbl {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6b7280;
  margin-top: 4px;
}
.wp-avatar {
  background: linear-gradient(135deg, #06b6d4, #3b82f6) !important;
  color: #fff !important;
  font-size: 13px !important;
  font-weight: 700 !important;
}
.erp-dialog-card {
  background: #111827;
  color: #fff;
  border-radius: 12px;
}
.erp-dialog-bar {
  background: #1f2937;
  color: #fff;
  border-radius: 12px 12px 0 0;
}
</style>
