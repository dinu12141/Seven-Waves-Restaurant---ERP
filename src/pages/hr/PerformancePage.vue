<template>
  <div>
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-btn color="primary" icon="add" label="New Evaluation" @click="openEval()" no-caps />
      <q-space />
      <q-input
        dark
        dense
        outlined
        v-model="search"
        placeholder="Search..."
        class="col-12 col-sm-3"
        clearable
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
    </div>

    <q-table
      dark
      flat
      bordered
      :rows="evaluations"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :filter="search"
      :pagination="{ rowsPerPage: 15 }"
      class="erp-data-grid"
    >
      <template #body-cell-employee="props">
        <q-td :props="props">
          <div class="text-weight-bold">{{ props.row.employees?.full_name }}</div>
          <div class="text-caption text-grey-5">{{ props.row.employees?.employee_code }}</div>
        </q-td>
      </template>
      <template #body-cell-score="props">
        <q-td :props="props">
          <q-linear-progress
            :value="(props.row.percentage || 0) / 100"
            stripe
            rounded
            :color="
              props.row.percentage >= 75 ? 'green' : props.row.percentage >= 50 ? 'amber' : 'red'
            "
            size="20px"
            class="q-mb-xs"
          >
            <div class="absolute-full flex flex-center">
              <q-badge
                :label="`${props.row.percentage || 0}%`"
                color="transparent"
                text-color="white"
              />
            </div>
          </q-linear-progress>
        </q-td>
      </template>
      <template #body-cell-grade="props">
        <q-td :props="props">
          <q-badge :color="gradeColor(props.row.grade)" :label="props.row.grade || '—'" />
        </q-td>
      </template>
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge
            :color="
              { draft: 'grey', submitted: 'amber', approved: 'green', rejected: 'red' }[
                props.row.status
              ]
            "
            :label="props.row.status"
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
            @click="openEval(props.row)"
            no-caps
          />
          <q-btn
            v-if="props.row.status === 'submitted'"
            flat
            dense
            icon="check"
            color="green"
            size="sm"
            @click="approveEval(props.row)"
            no-caps
          />
        </q-td>
      </template>
    </q-table>

    <!-- Evaluation Form Dialog -->
    <q-dialog v-model="showDialog" persistent maximized>
      <q-card style="background: var(--erp-bg-page, #0b0f19); color: #fff">
        <q-bar class="bg-grey-10"
          ><q-icon name="trending_up" />
          <div class="q-ml-sm text-weight-bold">Performance Evaluation</div>
          <q-space /><q-btn dense flat icon="close" @click="showDialog = false"
        /></q-bar>
        <q-scroll-area style="height: calc(100vh - 50px)">
          <div class="q-pa-lg" style="max-width: 900px; margin: 0 auto">
            <div class="row q-col-gutter-md q-mb-lg">
              <div class="col-12 col-md-4">
                <q-select
                  dark
                  outlined
                  v-model="evalForm.employee_id"
                  :options="employeeOptions"
                  label="Employee *"
                  emit-value
                  map-options
                  :rules="[(v) => !!v || 'Required']"
                />
              </div>
              <div class="col-12 col-md-4">
                <q-input
                  dark
                  outlined
                  v-model="evalForm.evaluation_period"
                  label="Period *"
                  hint="e.g. 2026-Q1 or March-2026"
                  :rules="[(v) => !!v || 'Required']"
                />
              </div>
              <div class="col-12 col-md-4">
                <q-select
                  dark
                  outlined
                  v-model="evalForm.evaluator_id"
                  :options="employeeOptions"
                  label="Evaluator"
                  emit-value
                  map-options
                  clearable
                />
              </div>
            </div>

            <div class="text-subtitle1 text-weight-bold q-mb-md">Scoring Criteria</div>
            <q-card
              v-for="sc in scores"
              :key="sc.criteria_id"
              flat
              bordered
              class="q-mb-sm q-pa-md"
              style="background: rgba(255, 255, 255, 0.03)"
            >
              <div class="row items-center">
                <div class="col-6">
                  <div class="text-weight-bold">{{ sc.criteria_name }}</div>
                  <div class="text-caption text-grey-5">
                    Max: {{ sc.max_score }} · Weight: {{ sc.weight }}×
                  </div>
                </div>
                <div class="col-3">
                  <q-slider
                    dark
                    v-model="sc.score"
                    :min="0"
                    :max="sc.max_score"
                    :step="1"
                    label
                    :label-value="`${sc.score} / ${sc.max_score}`"
                    color="primary"
                  />
                </div>
                <div class="col-3">
                  <q-input
                    dark
                    outlined
                    dense
                    v-model="sc.remarks"
                    label="Remarks"
                    class="q-ml-md"
                  />
                </div>
              </div>
            </q-card>

            <q-input
              dark
              outlined
              v-model="evalForm.comments"
              label="Overall Comments"
              type="textarea"
              rows="3"
              class="q-mt-md"
            />

            <div class="row justify-end q-mt-lg q-gutter-sm">
              <q-btn flat label="Cancel" @click="showDialog = false" color="grey" no-caps />
              <q-btn
                color="amber"
                label="Save Draft"
                icon="save"
                @click="saveEval('draft')"
                :loading="saving"
                no-caps
              />
              <q-btn
                color="primary"
                label="Submit"
                icon="send"
                @click="saveEval('submitted')"
                :loading="saving"
                no-caps
              />
            </div>
          </div>
        </q-scroll-area>
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
const evaluations = ref([])
const showDialog = ref(false)
const employeeOptions = ref([])
const criteria = ref([])
const scores = ref([])

const evalForm = reactive({
  id: null,
  employee_id: null,
  evaluation_period: '',
  evaluator_id: null,
  comments: '',
})

const columns = [
  {
    name: 'employee',
    label: 'Employee',
    align: 'left',
    field: (r) => r.employees?.full_name,
    sortable: true,
  },
  { name: 'period', label: 'Period', align: 'left', field: 'evaluation_period', sortable: true },
  { name: 'score', label: 'Score', align: 'center', field: 'percentage' },
  { name: 'grade', label: 'Grade', align: 'center', field: 'grade' },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
  { name: 'actions', label: '', align: 'center' },
]

function gradeColor(g) {
  return { A: 'green', B: 'teal', C: 'amber', D: 'orange', F: 'red' }[g] || 'grey'
}

async function loadEvaluations() {
  loading.value = true
  const branchId = authStore.currentBranch?.id
  const { data } = await supabase
    .from('performance_evaluations')
    .select('*, employees(full_name, employee_code)')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
  evaluations.value = data || []
  loading.value = false
}

async function loadHelpers() {
  const branchId = authStore.currentBranch?.id
  const { data: emps } = await supabase
    .from('employees')
    .select('id, full_name, employee_code')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('first_name')
  employeeOptions.value = (emps || []).map((e) => ({
    label: `${e.full_name} (${e.employee_code})`,
    value: e.id,
  }))
  const { data: crit } = await supabase
    .from('performance_criteria')
    .select('*')
    .eq('is_active', true)
    .order('name')
  criteria.value = crit || []
}

async function openEval(row) {
  if (row) {
    evalForm.id = row.id
    evalForm.employee_id = row.employee_id
    evalForm.evaluation_period = row.evaluation_period
    evalForm.evaluator_id = row.evaluator_id
    evalForm.comments = row.comments
    const { data: sc } = await supabase
      .from('performance_scores')
      .select('*, performance_criteria(name, max_score, weight)')
      .eq('evaluation_id', row.id)
    scores.value = (sc || []).map((s) => ({
      criteria_id: s.criteria_id,
      criteria_name: s.performance_criteria?.name,
      max_score: s.performance_criteria?.max_score || 4,
      weight: s.performance_criteria?.weight || 1,
      score: s.score,
      remarks: s.remarks,
    }))
  } else {
    evalForm.id = null
    evalForm.employee_id = null
    evalForm.evaluation_period = ''
    evalForm.evaluator_id = null
    evalForm.comments = ''
    scores.value = criteria.value.map((c) => ({
      criteria_id: c.id,
      criteria_name: c.name,
      max_score: c.max_score,
      weight: c.weight,
      score: 0,
      remarks: '',
    }))
  }
  showDialog.value = true
}

async function saveEval(status) {
  saving.value = true
  try {
    const totalScore = scores.value.reduce((sum, s) => sum + s.score * s.weight, 0)
    const maxPossible = scores.value.reduce((sum, s) => sum + s.max_score * s.weight, 0)
    const percentage = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0
    const grade =
      percentage >= 90
        ? 'A'
        : percentage >= 75
          ? 'B'
          : percentage >= 60
            ? 'C'
            : percentage >= 40
              ? 'D'
              : 'F'

    const payload = {
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
      employee_id: evalForm.employee_id,
      evaluation_period: evalForm.evaluation_period,
      evaluator_id: evalForm.evaluator_id,
      total_score: totalScore,
      max_possible: maxPossible,
      percentage,
      grade,
      comments: evalForm.comments,
      status,
      created_by: authStore.user?.id,
    }

    let evalId = evalForm.id
    if (evalId) {
      await supabase.from('performance_evaluations').update(payload).eq('id', evalId)
    } else {
      const { data } = await supabase
        .from('performance_evaluations')
        .insert(payload)
        .select('id')
        .single()
      evalId = data.id
    }
    // Upsert scores
    await supabase.from('performance_scores').delete().eq('evaluation_id', evalId)
    await supabase.from('performance_scores').insert(
      scores.value.map((s) => ({
        evaluation_id: evalId,
        criteria_id: s.criteria_id,
        score: s.score,
        remarks: s.remarks,
      })),
    )
    $q.notify({
      type: 'positive',
      message: `Evaluation ${status === 'draft' ? 'saved' : 'submitted'}`,
    })
    showDialog.value = false
    loadEvaluations()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

async function approveEval(row) {
  await supabase
    .from('performance_evaluations')
    .update({
      status: 'approved',
      approved_by: authStore.user?.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', row.id)
  $q.notify({ type: 'positive', message: 'Evaluation approved' })
  loadEvaluations()
}

onMounted(() => {
  loadEvaluations()
  loadHelpers()
})
</script>

<style scoped>
.erp-data-grid {
  background: var(--erp-bg-form-card, #111827);
  border-radius: 12px;
}
</style>
