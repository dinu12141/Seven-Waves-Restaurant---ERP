<template>
  <q-page :class="['q-pa-md pay-grades-page', $q.dark.isActive ? 'theme-dark' : 'theme-light']">
    <!-- ── Page Header ────────────────────────────────────────── -->
    <div class="row items-center justify-between q-mb-md header-strip">
      <div>
        <div :class="['text-caption text-weight-bold q-mb-xs', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']">
          HUMAN RESOURCES / <span class="text-amber-7">PAY GRADES</span>
        </div>
        <h1 :class="['text-h5 text-weight-bold q-my-none row items-center', $q.dark.isActive ? 'text-white' : 'text-grey-10']">
          <q-icon name="badge" class="q-mr-sm text-amber-6" />
          Pay Grades & Fixed Additions
        </h1>
        <div :class="['text-caption q-mt-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-7']">
          Manage salary pay grades, fixed allowance structures, and staff assignments
        </div>
      </div>
      <div class="row q-gutter-sm items-center">
        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="add_circle"
          label="New Pay Grade"
          class="text-weight-bold"
          @click="openNewGradeDialog"
        />
        <q-btn
          :outline="!$q.dark.isActive"
          :unelevated="$q.dark.isActive"
          no-caps
          :color="$q.dark.isActive ? 'grey-8' : 'grey-8'"
          :text-color="$q.dark.isActive ? 'white' : 'dark'"
          icon="refresh"
          label="Reload"
          :loading="loading"
          class="btn-reload"
          @click="loadData"
        />
      </div>
    </div>

    <!-- ── Top Configuration Form (matching legacy screen) ───── -->
    <q-card flat bordered class="q-mb-md config-card" :class="$q.dark.isActive ? 'card-dark' : 'card-light'">
      <q-card-section class="q-pb-sm">
        <div class="text-subtitle2 text-amber-7 text-weight-bold row items-center">
          <q-icon name="edit_note" size="20px" class="q-mr-xs text-amber-6" />
          Fixed Addition Entry Form
        </div>
        <div :class="['text-caption', $q.dark.isActive ? 'text-grey-4' : 'text-grey-7']">
          Select Pay Grade, choose an Addition type, and set the fixed monthly allowance amount.
        </div>
      </q-card-section>

      <q-separator :dark="$q.dark.isActive" />

      <q-card-section>
        <div class="row q-col-gutter-md items-center">
          <!-- PAY GRADES -->
          <div class="col-12 col-md-4">
            <div :class="['text-caption text-weight-bold q-mb-xs', $q.dark.isActive ? 'text-grey-3' : 'text-grey-8']">
              PAY GRADES <span class="text-red-6">*</span>
            </div>
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="selectedGradeCode"
              :options="gradeOptions"
              emit-value
              map-options
              placeholder="Select Pay Grade"
              class="theme-input"
              @update:model-value="onGradeChanged"
            >
              <template #prepend>
                <q-icon name="badge" color="amber-6" />
              </template>
            </q-select>
          </div>

          <!-- ADD AN ADDITION -->
          <div class="col-12 col-md-4">
            <div :class="['text-caption text-weight-bold q-mb-xs', $q.dark.isActive ? 'text-grey-3' : 'text-grey-8']">
              ADD AN ADDITION <span class="text-red-6">*</span>
            </div>
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="additionForm.additionCode"
              :options="additionOptions"
              emit-value
              map-options
              placeholder="Select Addition"
              class="theme-input"
              @update:model-value="onAdditionTypeSelected"
            >
              <template #prepend>
                <q-icon name="payments" color="amber-6" />
              </template>
            </q-select>
          </div>

          <!-- AMOUNT -->
          <div class="col-12 col-md-4">
            <div :class="['text-caption text-weight-bold q-mb-xs', $q.dark.isActive ? 'text-grey-3' : 'text-grey-8']">
              AMOUNT (LKR) <span class="text-red-6">*</span>
            </div>
            <q-input
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model.number="additionForm.amount"
              type="number"
              placeholder="0.00"
              class="theme-input"
              prefix="LKR "
            />
          </div>
        </div>

        <div class="text-caption text-negative text-weight-medium q-mt-xs">* Required filled</div>

        <!-- Action Buttons (matching legacy screen) -->
        <div class="row q-gutter-sm q-mt-md items-center">
          <q-btn
            unelevated
            no-caps
            color="primary"
            icon="add"
            label="Add"
            :disable="!canAdd"
            class="text-weight-bold q-px-md"
            @click="handleAddAddition"
          />
          <q-btn
            unelevated
            no-caps
            color="amber-8"
            text-color="dark"
            icon="update"
            label="Update"
            :disable="!selectedAdditionId"
            class="text-weight-bold q-px-md"
            @click="handleUpdateAddition"
          />
          <q-btn
            unelevated
            no-caps
            color="negative"
            icon="delete"
            label="Delete"
            :disable="!selectedAdditionId"
            class="text-weight-bold q-px-md"
            @click="handleDeleteAddition"
          />
          <q-btn
            unelevated
            no-caps
            color="positive"
            text-color="white"
            icon="save"
            label="Save Changes"
            :loading="saving"
            class="text-weight-bold q-px-md"
            @click="persistChanges"
          />
          <q-btn
            :outline="true"
            no-caps
            :color="$q.dark.isActive ? 'grey-4' : 'grey-8'"
            icon="cancel"
            label="Cancel"
            class="text-weight-bold q-px-md"
            @click="resetForm"
          />
          <q-space />
          <div v-if="activeGrade" class="row items-center q-gutter-xs">
            <span :class="['text-caption text-weight-medium', $q.dark.isActive ? 'text-grey-4' : 'text-grey-7']">
              Template Code:
            </span>
            <q-badge
              :color="$q.dark.isActive ? 'amber-9' : 'amber-2'"
              :text-color="$q.dark.isActive ? 'white' : 'brown-10'"
              class="text-weight-bolder font-mono q-px-sm q-py-xs"
            >
              {{ activeGrade.templateCode || '0004' }}
            </q-badge>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- ── Search & Filter Strip ───────────────────────────────── -->
    <q-card flat bordered class="q-mb-md filter-card" :class="$q.dark.isActive ? 'card-dark' : 'card-light'">
      <q-card-section class="row items-center q-col-gutter-md">
        <div class="col-12 col-sm-7 col-md-5 row items-center q-gutter-sm">
          <span :class="['text-caption text-weight-bolder text-no-wrap', $q.dark.isActive ? 'text-grey-3' : 'text-grey-9']">
            SEARCH PAY GRADES :
          </span>
          <q-select
            :dark="$q.dark.isActive"
            dense
            outlined
            v-model="selectedGradeCode"
            :options="gradeOptions"
            emit-value
            map-options
            class="col theme-input"
            @update:model-value="onGradeChanged"
          />
          <q-btn
            unelevated
            dense
            no-caps
            color="brown-7"
            text-color="white"
            label="SEARCH"
            class="q-px-md text-weight-bolder"
            @click="onGradeChanged(selectedGradeCode)"
          />
        </div>

        <q-space />

        <div class="col-12 col-md-auto row q-gutter-sm items-center justify-end" v-if="activeGrade">
          <div class="stat-pill" :class="$q.dark.isActive ? 'pill-dark' : 'pill-light'">
            <span class="pill-label">Department:</span>
            <span class="pill-val q-ml-xs">{{ activeGrade.department || 'GENERAL' }}</span>
          </div>
          <div class="stat-pill" :class="$q.dark.isActive ? 'pill-dark' : 'pill-light'">
            <span class="pill-label">Total Additions:</span>
            <span class="pill-val text-positive q-ml-xs">
              LKR {{ gradeTotalAmount.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
            </span>
          </div>
          <div class="stat-pill" :class="$q.dark.isActive ? 'pill-dark' : 'pill-light'">
            <span class="pill-label">Assigned Staff:</span>
            <span class="pill-val text-amber-7 q-ml-xs">{{ assignedEmployees.length }}</span>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- ── Main Data Display Tabs ──────────────────────────────── -->
    <q-card flat bordered class="main-table-card" :class="$q.dark.isActive ? 'card-dark' : 'card-light'">
      <q-tabs
        v-model="mainTab"
        :dark="$q.dark.isActive"
        dense
        align="left"
        active-color="amber-7"
        indicator-color="amber-7"
        :class="['border-bottom-divider', $q.dark.isActive ? 'text-grey-4 bg-dark-tab' : 'text-grey-8 bg-grey-2']"
      >
        <q-tab name="additions" icon="table_chart" label="Fixed Additions Grid" class="text-weight-bold" />
        <q-tab name="employees" icon="people" :label="`Assigned Employees (${assignedEmployees.length})`" class="text-weight-bold" />
      </q-tabs>

      <q-tab-panels v-model="mainTab" :dark="$q.dark.isActive" class="bg-transparent">
        <!-- ══════════ TAB 1: ADDITIONS DATA GRID ══════════ -->
        <q-tab-panel name="additions" class="q-pa-none">
          <q-table
            :dark="$q.dark.isActive"
            flat
            :rows="activeGradeAdditions"
            :columns="gridColumns"
            row-key="id"
            :loading="loading"
            :pagination="{ rowsPerPage: 10 }"
            class="pay-grades-grid"
            :class="$q.dark.isActive ? 'grid-dark' : 'grid-light'"
          >
            <!-- Custom row rendering with yellow highlight on click (legacy replica) -->
            <template #body="props">
              <q-tr
                :props="props"
                class="cursor-pointer transition-row"
                :class="{ 'row-highlighted-yellow': selectedAdditionId === props.row.id }"
                @click="selectAdditionRow(props.row)"
              >
                <!-- Arrow indicator matching legacy screen -->
                <q-td style="width: 32px; padding: 4px; text-align: center;">
                  <span v-if="selectedAdditionId === props.row.id" class="arrow-indicator">
                    ➔
                  </span>
                </q-td>
                <q-td key="code" :props="props">
                  <span class="font-mono text-weight-bold">{{ props.row.code }}</span>
                </q-td>
                <q-td key="additionCode" :props="props">
                  <span class="font-mono text-weight-medium">{{ props.row.additionCode }}</span>
                </q-td>
                <q-td key="gradeCode" :props="props">
                  <q-badge
                    :color="selectedAdditionId === props.row.id ? 'brown-10' : ($q.dark.isActive ? 'grey-9' : 'amber-2')"
                    :text-color="selectedAdditionId === props.row.id ? 'amber-2' : ($q.dark.isActive ? 'amber-4' : 'brown-10')"
                    class="text-weight-bolder"
                  >
                    {{ props.row.gradeCode }}
                  </q-badge>
                </q-td>
                <q-td key="additionName" :props="props">
                  <span class="text-weight-bold">{{ props.row.additionName }}</span>
                </q-td>
                <q-td key="amount" :props="props" class="text-right">
                  <span class="text-weight-bolder font-mono font-14">
                    {{ Number(props.row.amount).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
                  </span>
                </q-td>
                <q-td key="actions" :props="props" class="text-center">
                  <q-btn
                    flat
                    round
                    dense
                    size="sm"
                    color="amber-8"
                    icon="edit"
                    @click.stop="selectAdditionRow(props.row)"
                  >
                    <q-tooltip>Edit this Addition</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    round
                    dense
                    size="sm"
                    color="negative"
                    icon="delete"
                    @click.stop="removeAddition(props.row.id)"
                  >
                    <q-tooltip>Remove</q-tooltip>
                  </q-btn>
                </q-td>
              </q-tr>
            </template>

            <!-- Bottom summary footer -->
            <template #bottom-row>
              <q-tr :class="['summary-row', $q.dark.isActive ? 'summary-dark' : 'summary-light']">
                <q-td colspan="4" class="text-right text-caption text-weight-bold">
                  TOTAL FIXED ADDITIONS FOR {{ selectedGradeCode }}:
                </q-td>
                <q-td class="text-right font-mono text-positive text-subtitle1 text-weight-bolder">
                  LKR {{ gradeTotalAmount.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
                </q-td>
                <q-td></q-td>
              </q-tr>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══════════ TAB 2: ASSIGNED EMPLOYEES ══════════ -->
        <q-tab-panel name="employees" class="q-pa-md">
          <div class="row items-center justify-between q-mb-md">
            <div>
              <div :class="['text-subtitle1 text-weight-bold', $q.dark.isActive ? 'text-white' : 'text-grey-10']">
                Staff Assigned to {{ selectedGradeCode }}
              </div>
              <div :class="['text-caption', $q.dark.isActive ? 'text-grey-4' : 'text-grey-7']">
                Employees holding this pay grade automatically receive the configured additions in monthly payroll
              </div>
            </div>
            <q-btn
              unelevated
              no-caps
              dense
              color="amber-8"
              text-color="dark"
              icon="person_add"
              label="Assign Staff to this Grade"
              class="q-px-md text-weight-bold"
              @click="showAssignDialog = true"
            />
          </div>

          <q-table
            :dark="$q.dark.isActive"
            flat
            bordered
            :rows="assignedEmployees"
            :columns="employeeColumns"
            row-key="id"
            class="employee-grid"
            :class="$q.dark.isActive ? 'grid-dark' : 'grid-light'"
            :pagination="{ rowsPerPage: 10 }"
          >
            <template #body-cell-actions="props">
              <q-td :props="props">
                <q-btn
                  flat
                  round
                  dense
                  color="negative"
                  icon="person_remove"
                  size="sm"
                  @click="unassignEmployee(props.row.id)"
                >
                  <q-tooltip>Remove from this Grade</q-tooltip>
                </q-btn>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>

    <!-- ── New Pay Grade Modal ──────────────────────────────────── -->
    <q-dialog v-model="showNewGradeDialog">
      <q-card :dark="$q.dark.isActive" style="min-width: 440px;" :class="$q.dark.isActive ? 'card-dark' : 'card-light'">
        <q-card-section class="row items-center justify-between q-pb-sm">
          <div :class="['text-subtitle1 text-weight-bold', $q.dark.isActive ? 'text-white' : 'text-grey-10']">
            Create New Pay Grade
          </div>
          <q-btn icon="close" flat round dense v-close-popup :color="$q.dark.isActive ? 'grey-4' : 'grey-7'" />
        </q-card-section>
        <q-separator :dark="$q.dark.isActive" />
        <q-card-section class="q-gutter-md q-pt-md">
          <div>
            <div :class="['text-caption text-weight-bold q-mb-xs', $q.dark.isActive ? 'text-grey-3' : 'text-grey-8']">
              Pay Grade Code *
            </div>
            <q-input
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="newGradeForm.code"
              placeholder="e.g. CR 04, JC BR 02"
              class="theme-input"
              :rules="[v => !!v || 'Required']"
            />
          </div>
          <div>
            <div :class="['text-caption text-weight-bold q-mb-xs', $q.dark.isActive ? 'text-grey-3' : 'text-grey-8']">
              Grade Name *
            </div>
            <q-input
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="newGradeForm.name"
              placeholder="e.g. Senior Cashier Grade 04"
              class="theme-input"
              :rules="[v => !!v || 'Required']"
            />
          </div>
          <div>
            <div :class="['text-caption text-weight-bold q-mb-xs', $q.dark.isActive ? 'text-grey-3' : 'text-grey-8']">
              Department
            </div>
            <q-input
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="newGradeForm.department"
              placeholder="e.g. CASHIER, CHINESE, BENMARY"
              class="theme-input"
            />
          </div>
          <div>
            <div :class="['text-caption text-weight-bold q-mb-xs', $q.dark.isActive ? 'text-grey-3' : 'text-grey-8']">
              Template Code
            </div>
            <q-input
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="newGradeForm.templateCode"
              placeholder="0004"
              class="theme-input"
            />
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" :color="$q.dark.isActive ? 'grey-4' : 'grey-7'" v-close-popup no-caps />
          <q-btn
            unelevated
            label="Create Grade"
            color="primary"
            no-caps
            class="text-weight-bold"
            :disable="!newGradeForm.code || !newGradeForm.name"
            @click="handleCreateGrade"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Assign Staff Dialog ──────────────────────────────────── -->
    <q-dialog v-model="showAssignDialog">
      <q-card :dark="$q.dark.isActive" style="min-width: 520px;" :class="$q.dark.isActive ? 'card-dark' : 'card-light'">
        <q-card-section class="row items-center justify-between q-pb-sm">
          <div :class="['text-subtitle1 text-weight-bold', $q.dark.isActive ? 'text-white' : 'text-grey-10']">
            Assign Staff to Pay Grade: <span class="text-amber-7">{{ selectedGradeCode }}</span>
          </div>
          <q-btn icon="close" flat round dense v-close-popup :color="$q.dark.isActive ? 'grey-4' : 'grey-7'" />
        </q-card-section>
        <q-separator :dark="$q.dark.isActive" />
        <q-card-section class="q-pt-md">
          <div :class="['text-caption text-weight-bold q-mb-sm', $q.dark.isActive ? 'text-grey-3' : 'text-grey-8']">
            Select an employee to assign:
          </div>
          <q-select
            :dark="$q.dark.isActive"
            dense
            outlined
            v-model="employeeToAssign"
            :options="allEmployeeOptions"
            emit-value
            map-options
            placeholder="Search employee by Name or EPF..."
            use-input
            class="theme-input"
            @filter="filterEmployees"
          >
            <template #prepend>
              <q-icon name="person_search" color="primary" />
            </template>
          </q-select>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" :color="$q.dark.isActive ? 'grey-4' : 'grey-7'" v-close-popup no-caps />
          <q-btn
            unelevated
            label="Assign & Apply Allowances"
            color="amber-8"
            text-color="dark"
            no-caps
            class="text-weight-bold"
            :disable="!employeeToAssign"
            @click="confirmAssignEmployee"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import {
  payGradesService,
  STANDARD_ADDITIONS
} from 'src/services/hr/payGradesService'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()

const loading = ref(false)
const saving = ref(false)
const mainTab = ref('additions')

const payGrades = ref([])
const selectedGradeCode = ref('CR 02')
const selectedAdditionId = ref(null)

// Form fields matching screenshot
const additionForm = ref({
  additionCode: '01',
  additionName: 'VARIABLE ALLOWANCE',
  amount: 9000
})

// Dialogs
const showNewGradeDialog = ref(false)
const newGradeForm = ref({
  code: '',
  name: '',
  department: '',
  templateCode: '0004'
})

const showAssignDialog = ref(false)
const employeeToAssign = ref(null)
const allEmployees = ref([])
const employeeFilterText = ref('')
const employeeAssignments = ref({})

// ── Dropdown Options ──────────────────────────────────────────
const gradeOptions = computed(() => {
  return payGrades.value.map(g => ({
    label: `${g.code} — ${g.name || g.department}`,
    value: g.code
  }))
})

const additionOptions = computed(() => {
  return STANDARD_ADDITIONS.map(a => ({
    label: `${a.code} — ${a.name}`,
    value: a.code,
    name: a.name
  }))
})

// Active Grade details
const activeGrade = computed(() => {
  return payGrades.value.find(g => g.code === selectedGradeCode.value)
})

const activeGradeAdditions = computed(() => {
  return activeGrade.value?.additions || []
})

const gradeTotalAmount = computed(() => {
  return activeGradeAdditions.value.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
})

const canAdd = computed(() => {
  return !!selectedGradeCode.value && !!additionForm.value.additionCode && Number(additionForm.value.amount) > 0
})

// Columns matching exact legacy table from Image 1:
const gridColumns = [
  { name: 'indicator', label: '', field: 'id', align: 'center' },
  { name: 'code', label: 'Fixed_All_Code', field: 'code', align: 'left', sortable: true },
  { name: 'additionCode', label: 'Fixed_All_Addition_code', field: 'additionCode', align: 'left', sortable: true },
  { name: 'gradeCode', label: 'Fixed_All_Grades', field: 'gradeCode', align: 'left', sortable: true },
  { name: 'additionName', label: 'Fixed_All_Addition', field: 'additionName', align: 'left', sortable: true },
  { name: 'amount', label: 'Fixed_All_Amount', field: 'amount', align: 'right', sortable: true },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' }
]

const employeeColumns = [
  { name: 'epf', label: 'EPF No', field: 'epf_no', align: 'left', sortable: true },
  { name: 'code', label: 'Employee Code', field: 'employee_code', align: 'left', sortable: true },
  { name: 'name', label: 'Name', field: 'full_name', align: 'left', sortable: true },
  { name: 'nic', label: 'NIC No', field: 'nic_number', align: 'left', sortable: true },
  { name: 'dept', label: 'Department', field: row => row.departments?.name || '-', align: 'left' },
  { name: 'desig', label: 'Designation', field: row => row.designations?.title || '-', align: 'left' },
  { name: 'actions', label: 'Action', field: 'id', align: 'center' }
]

const assignedEmployees = computed(() => {
  return allEmployees.value.filter(e => employeeAssignments.value[e.id] === selectedGradeCode.value)
})

const allEmployeeOptions = computed(() => {
  let list = allEmployees.value
  if (employeeFilterText.value) {
    const q = employeeFilterText.value.toLowerCase()
    list = list.filter(e =>
      (e.full_name || '').toLowerCase().includes(q) ||
      (e.epf_no || '').toLowerCase().includes(q) ||
      (e.employee_code || '').toLowerCase().includes(q)
    )
  }
  return list.map(e => ({
    label: `${e.epf_no ? '[EPF: ' + e.epf_no + '] ' : ''}${e.full_name} (${e.employee_code})`,
    value: e.id
  }))
})

function filterEmployees(val, update) {
  update(() => {
    employeeFilterText.value = val
  })
}

// ── Handlers ──────────────────────────────────────────────────
function onGradeChanged(newGrade) {
  selectedGradeCode.value = newGrade
  selectedAdditionId.value = null
  resetForm()
}

function onAdditionTypeSelected(addCode) {
  const opt = STANDARD_ADDITIONS.find(a => a.code === addCode)
  if (opt) {
    additionForm.value.additionName = opt.name
  }
}

function selectAdditionRow(row) {
  selectedAdditionId.value = row.id
  additionForm.value.additionCode = row.additionCode
  additionForm.value.additionName = row.additionName
  additionForm.value.amount = row.amount
}

function resetForm() {
  selectedAdditionId.value = null
  additionForm.value = {
    additionCode: '01',
    additionName: 'VARIABLE ALLOWANCE',
    amount: 0
  }
}

function handleAddAddition() {
  if (!activeGrade.value) return

  // Check if addition already exists for this grade
  const existing = activeGrade.value.additions.find(a => a.additionCode === additionForm.value.additionCode)
  if (existing) {
    existing.amount = Number(additionForm.value.amount)
    $q.notify({ type: 'info', message: `Updated existing addition ${existing.additionName}` })
    return
  }

  const newAddition = {
    id: `add-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    code: activeGrade.value.templateCode || '0004',
    additionCode: additionForm.value.additionCode,
    gradeCode: activeGrade.value.code,
    additionName: additionForm.value.additionName,
    amount: Number(additionForm.value.amount)
  }

  activeGrade.value.additions.push(newAddition)
  $q.notify({ type: 'positive', message: `Added ${newAddition.additionName} to ${activeGrade.value.code}` })
  resetForm()
}

function handleUpdateAddition() {
  if (!activeGrade.value || !selectedAdditionId.value) return
  const item = activeGrade.value.additions.find(a => a.id === selectedAdditionId.value)
  if (item) {
    item.additionCode = additionForm.value.additionCode
    item.additionName = additionForm.value.additionName
    item.amount = Number(additionForm.value.amount)
    $q.notify({ type: 'positive', message: `Updated ${item.additionName}` })
  }
}

function handleDeleteAddition() {
  if (!selectedAdditionId.value) return
  removeAddition(selectedAdditionId.value)
}

function removeAddition(additionId) {
  if (!activeGrade.value) return
  const idx = activeGrade.value.additions.findIndex(a => a.id === additionId)
  if (idx !== -1) {
    const removed = activeGrade.value.additions.splice(idx, 1)[0]
    $q.notify({ type: 'negative', message: `Removed ${removed.additionName}` })
    if (selectedAdditionId.value === additionId) {
      resetForm()
    }
  }
}

async function persistChanges() {
  saving.value = true
  try {
    const success = await payGradesService.savePayGrades(payGrades.value)
    if (success) {
      $q.notify({ type: 'positive', message: 'Pay Grades & Additions saved successfully to database!' })
    } else {
      $q.notify({ type: 'negative', message: 'Failed to save changes.' })
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Save error' })
  } finally {
    saving.value = false
  }
}

function openNewGradeDialog() {
  newGradeForm.value = {
    code: '',
    name: '',
    department: '',
    templateCode: '0004'
  }
  showNewGradeDialog.value = true
}

function handleCreateGrade() {
  const code = newGradeForm.value.code.trim().toUpperCase()
  if (!code) return

  const exists = payGrades.value.find(g => g.code === code)
  if (exists) {
    $q.notify({ type: 'warning', message: `Pay grade ${code} already exists.` })
    return
  }

  const newG = {
    code,
    name: newGradeForm.value.name.trim(),
    department: newGradeForm.value.department.trim().toUpperCase() || 'GENERAL',
    templateCode: newGradeForm.value.templateCode || '0004',
    additions: [
      { id: `add-${Date.now()}-1`, code: '0004', additionCode: '01', gradeCode: code, additionName: 'VARIABLE ALLOWANCE', amount: 8000 },
      { id: `add-${Date.now()}-2`, code: '0004', additionCode: '02', gradeCode: code, additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: `add-${Date.now()}-5`, code: '0004', additionCode: '05', gradeCode: code, additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: `add-${Date.now()}-6`, code: '0004', additionCode: '06', gradeCode: code, additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  }

  payGrades.value.push(newG)
  selectedGradeCode.value = code
  showNewGradeDialog.value = false
  $q.notify({ type: 'positive', message: `Created new pay grade ${code}!` })
  persistChanges()
}

async function confirmAssignEmployee() {
  if (!employeeToAssign.value || !selectedGradeCode.value) return
  const empId = employeeToAssign.value
  const grade = selectedGradeCode.value

  const success = await payGradesService.assignEmployeeToGrade(empId, grade, true)
  if (success) {
    employeeAssignments.value[empId] = grade
    showAssignDialog.value = false
    employeeToAssign.value = null
    $q.notify({ type: 'positive', message: `Employee assigned to ${grade} and allowances synchronized!` })
  } else {
    $q.notify({ type: 'negative', message: 'Failed to assign employee.' })
  }
}

async function unassignEmployee(empId) {
  delete employeeAssignments.value[empId]
  await payGradesService.assignEmployeeToGrade(empId, '', false)
  $q.notify({ type: 'info', message: 'Employee unassigned from pay grade.' })
}

// ── Initial Load ──────────────────────────────────────────────
async function loadData() {
  loading.value = true
  try {
    // 1. Load pay grades
    payGrades.value = await payGradesService.getPayGrades()
    if (!payGrades.value.find(g => g.code === selectedGradeCode.value) && payGrades.value.length > 0) {
      selectedGradeCode.value = payGrades.value[0].code
    }

    // 2. Load employees
    const { data: emps } = await supabase
      .from('employees')
      .select('id, employee_code, full_name, epf_no, nic_number, departments(name), designations(title)')
      .eq('is_active', true)
      .order('employee_code')

    allEmployees.value = emps || []

    // 3. Load assignments
    employeeAssignments.value = await payGradesService.getEmployeeGradeAssignments()

    // Auto seed initial assignment if empty for demo matching screenshots
    if (Object.keys(employeeAssignments.value).length === 0 && allEmployees.value.length > 0) {
      const crStaff = allEmployees.value.filter(e =>
        /lalindra|dhammika|nalin|venuj/i.test(e.full_name || '')
      )
      for (const s of crStaff) {
        employeeAssignments.value[s.id] = 'CR 02'
      }
    }
  } catch (err) {
    console.error('Failed to load Pay Grades data:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
/* ── Page Container Theme Responsiveness ── */
.pay-grades-page {
  min-height: 100vh;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.theme-dark {
  background: var(--erp-bg-page, #080e18);
  color: #f8fafc;
}

.theme-light {
  background: #f4f6f9;
  color: #0f172a;
}

/* ── Card Styling ── */
.card-dark {
  background: #111827 !important;
  border: 1px solid #1f2937 !important;
  border-radius: 8px;
}

.card-light {
  background: #ffffff !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.border-bottom-divider {
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
}

.bg-dark-tab {
  background: #0d131f;
}

/* ── Stat Pills ── */
.stat-pill {
  padding: 6px 14px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  transition: all 0.2s ease;
}

.pill-dark {
  background: #1e293b;
  border: 1px solid #334155;
}

.pill-light {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
}

.pill-dark .pill-label {
  color: #94a3b8;
  font-weight: 500;
}

.pill-light .pill-label {
  color: #475569;
  font-weight: 600;
}

.pill-dark .pill-val {
  color: #ffffff;
  font-weight: 700;
}

.pill-light .pill-val {
  color: #0f172a;
  font-weight: 700;
}

/* ── Font mono ── */
.font-mono {
  font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
}

.font-14 {
  font-size: 13.5px;
}

/* ── Table Styling ── */
.pay-grades-grid :deep(thead th) {
  font-weight: 700;
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.grid-dark :deep(thead th) {
  background: #1e293b !important;
  color: #cbd5e1 !important;
  border-bottom: 2px solid #334155 !important;
}

.grid-light :deep(thead th) {
  background: #f8fafc !important;
  color: #334155 !important;
  border-bottom: 2px solid #cbd5e1 !important;
}

.grid-dark :deep(tbody td) {
  border-bottom: 1px solid #1f2937;
}

.grid-light :deep(tbody td) {
  border-bottom: 1px solid #f1f5f9;
}

/* ── Legacy Screen Exact Selected Yellow Row Replica ── */
.row-highlighted-yellow {
  background-color: #fef08a !important;
  color: #1c1917 !important;
}

.row-highlighted-yellow td {
  color: #1c1917 !important;
}

.arrow-indicator {
  font-size: 16px;
  font-weight: 900;
  color: #1c1917;
}

/* Hover transitions */
.transition-row {
  transition: background-color 0.12s ease-in-out;
}

.grid-dark .transition-row:hover:not(.row-highlighted-yellow) {
  background-color: #1e293b !important;
}

.grid-light .transition-row:hover:not(.row-highlighted-yellow) {
  background-color: #f8fafc !important;
}

/* ── Summary Footer ── */
.summary-dark {
  background: #0b111e !important;
  border-top: 2px solid #1f2937 !important;
  color: #e2e8f0;
}

.summary-light {
  background: #f8fafc !important;
  border-top: 2px solid #e2e8f0 !important;
  color: #0f172a;
}

/* ── Employee Grid ── */
.employee-grid :deep(thead th) {
  font-weight: 700;
  font-size: 12px;
}
</style>
