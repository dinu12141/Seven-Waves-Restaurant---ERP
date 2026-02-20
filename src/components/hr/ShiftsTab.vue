<template>
  <div class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h6">Shift Management</div>
      <q-space />
      <q-btn outline color="primary" icon="add" label="Add Shift" @click="showAddShift = true" />
    </div>

    <!-- Shift Templates Cards -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div v-for="shift in shifts" :key="shift.id" class="col-12 col-sm-6 col-md-4">
        <q-card class="bg-grey-9 text-white" flat bordered>
          <q-card-section>
            <div class="row items-center q-mb-sm">
              <q-icon name="schedule" size="24px" color="amber" class="q-mr-sm" />
              <div class="text-h6 text-weight-bold">{{ shift.name }}</div>
              <q-space />
              <q-badge
                :color="shift.is_active ? 'green' : 'grey'"
                :label="shift.is_active ? 'Active' : 'Inactive'"
              />
            </div>
            <q-separator dark class="q-my-sm" />
            <div class="row q-col-gutter-sm q-mt-xs">
              <div class="col-6">
                <div class="text-caption text-grey-5">Start Time</div>
                <div class="text-weight-bold text-green">
                  <q-icon name="login" class="q-mr-xs" />{{ formatTime(shift.start_time) }}
                </div>
              </div>
              <div class="col-6">
                <div class="text-caption text-grey-5">End Time</div>
                <div class="text-weight-bold text-red">
                  <q-icon name="logout" class="q-mr-xs" />{{ formatTime(shift.end_time) }}
                </div>
              </div>
              <div class="col-6">
                <div class="text-caption text-grey-5">Break</div>
                <div>{{ shift.break_duration_minutes || 0 }} min</div>
              </div>
              <div class="col-6">
                <div class="text-caption text-grey-5">Overnight</div>
                <q-icon
                  :name="shift.is_overnight ? 'check_circle' : 'cancel'"
                  :color="shift.is_overnight ? 'amber' : 'grey'"
                />
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div v-if="shifts.length === 0" class="col-12 text-center q-pa-xl text-grey">
        <q-icon name="schedule" size="64px" class="q-mb-md" />
        <div class="text-h6">No shifts configured</div>
        <div class="text-caption q-mb-md">Add your first shift template or use defaults</div>
        <q-btn
          color="primary"
          outline
          label="Add Default Shifts"
          icon="auto_fix_high"
          @click="seedDefaultShifts"
          :loading="seeding"
        />
      </div>
    </div>

    <!-- Daily Scheduler -->
    <q-separator dark class="q-mb-lg" />
    <ShiftScheduler />

    <!-- Add Shift Dialog -->
    <q-dialog v-model="showAddShift">
      <q-card class="bg-grey-9 text-white" style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">Add Shift Template</div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input
            dark
            outlined
            v-model="newShift.name"
            label="Shift Name"
            placeholder="e.g. Morning Shift"
          />
          <q-input dark outlined v-model="newShift.start_time" label="Start Time" type="time" />
          <q-input dark outlined v-model="newShift.end_time" label="End Time" type="time" />
          <q-input
            dark
            outlined
            v-model.number="newShift.break_duration_minutes"
            label="Break Duration (min)"
            type="number"
          />
          <q-toggle dark v-model="newShift.is_overnight" label="Overnight Shift" />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" label="Save" @click="saveShift" :loading="saving" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import ShiftScheduler from 'components/hr/ShiftScheduler.vue'

const $q = useQuasar()
const authStore = useAuthStore()
const shifts = ref([])
const loading = ref(false)
const saving = ref(false)
const showAddShift = ref(false)

const newShift = reactive({
  name: '',
  start_time: '08:00',
  end_time: '16:00',
  break_duration_minutes: 30,
  is_overnight: false,
})

const seeding = ref(false)

async function seedDefaultShifts() {
  seeding.value = true
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const defaults = [
      {
        name: 'Morning Shift',
        start_time: '08:00',
        end_time: '16:00',
        break_duration_minutes: 60,
        is_overnight: false,
      },
      {
        name: 'Evening Shift',
        start_time: '16:00',
        end_time: '00:00',
        break_duration_minutes: 60,
        is_overnight: false,
      },
      {
        name: 'Night Shift',
        start_time: '00:00',
        end_time: '08:00',
        break_duration_minutes: 60,
        is_overnight: true,
      },
    ]

    const { error } = await supabase.from('shifts').insert(
      defaults.map((d) => ({
        company_id: authStore.currentBranch?.company_id,
        branch_id: branchId,
        ...d,
      })),
    )

    if (error) throw error
    $q.notify({ type: 'positive', message: 'Default shifts created' })
    loadData()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    seeding.value = false
  }
}

function formatTime(time) {
  if (!time) return '—'
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  return `${hour > 12 ? hour - 12 : hour || 12}:${m} ${ampm}`
}

async function loadData() {
  loading.value = true
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const { data: shiftData } = await supabase
      .from('shifts')
      .select('*')
      .eq('branch_id', branchId)
      .order('start_time')

    shifts.value = shiftData || []
  } catch (err) {
    console.error('Failed to load shifts:', err)
  } finally {
    loading.value = false
  }
}

async function saveShift() {
  saving.value = true
  try {
    const { error } = await supabase.from('shifts').insert({
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
      ...newShift,
    })
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Shift template created' })
    showAddShift.value = false
    loadData()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

onMounted(() => loadData())
</script>
