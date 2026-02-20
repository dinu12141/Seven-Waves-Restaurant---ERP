<template>
  <div class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h6">Departments & Designations</div>
      <q-space />
      <q-btn
        outline
        color="primary"
        icon="add"
        label="Add Department"
        @click="showAddDept = true"
        class="q-mr-sm"
      />
      <q-btn
        outline
        color="secondary"
        icon="add"
        label="Add Designation"
        @click="showAddDesig = true"
      />
    </div>

    <div class="row q-col-gutter-md">
      <!-- Departments -->
      <div class="col-12 col-md-6">
        <q-card class="bg-grey-9" flat bordered>
          <q-card-section class="q-pb-none">
            <div class="text-subtitle1 text-weight-bold">
              <q-icon name="business" class="q-mr-sm" />Departments
            </div>
          </q-card-section>
          <q-card-section>
            <q-list separator dark>
              <q-item v-for="dept in departments" :key="dept.id" class="rounded-borders">
                <q-item-section avatar>
                  <q-avatar color="indigo-9" text-color="white" icon="business" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-bold">{{ dept.name }}</q-item-label>
                  <q-item-label caption class="text-grey-5">{{
                    dept.description || 'No description'
                  }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-badge
                    :color="dept.is_active ? 'green' : 'grey'"
                    :label="dept.is_active ? 'Active' : 'Inactive'"
                  />
                </q-item-section>
              </q-item>

              <div v-if="departments.length === 0" class="text-center q-pa-lg text-grey">
                <q-icon name="business" size="48px" class="q-mb-sm" />
                <div>No departments found</div>
              </div>
            </q-list>
          </q-card-section>
        </q-card>
      </div>

      <!-- Designations -->
      <div class="col-12 col-md-6">
        <q-card class="bg-grey-9" flat bordered>
          <q-card-section class="q-pb-none">
            <div class="text-subtitle1 text-weight-bold">
              <q-icon name="badge" class="q-mr-sm" />Designations
            </div>
          </q-card-section>
          <q-card-section>
            <q-list separator dark>
              <q-item v-for="desig in designations" :key="desig.id" class="rounded-borders">
                <q-item-section avatar>
                  <q-avatar color="deep-purple-9" text-color="white" icon="badge" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-bold">{{ desig.title }}</q-item-label>
                  <q-item-label caption class="text-grey-5">{{
                    desig.description || 'No description'
                  }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-badge
                    :color="desig.is_active ? 'green' : 'grey'"
                    :label="desig.is_active ? 'Active' : 'Inactive'"
                  />
                </q-item-section>
              </q-item>

              <div v-if="designations.length === 0" class="text-center q-pa-lg text-grey">
                <q-icon name="badge" size="48px" class="q-mb-sm" />
                <div>No designations found</div>
              </div>
            </q-list>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Add Department Dialog -->
    <q-dialog v-model="showAddDept">
      <q-card class="bg-grey-9 text-white" style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">Add Department</div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input dark outlined v-model="newDept.name" label="Department Name" />
          <q-input
            dark
            outlined
            v-model="newDept.description"
            label="Description"
            type="textarea"
            autogrow
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" label="Save" @click="saveDepartment" :loading="saving" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Add Designation Dialog -->
    <q-dialog v-model="showAddDesig">
      <q-card class="bg-grey-9 text-white" style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">Add Designation</div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input dark outlined v-model="newDesig.title" label="Designation Title" />
          <q-input
            dark
            outlined
            v-model="newDesig.description"
            label="Description"
            type="textarea"
            autogrow
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="secondary" label="Save" @click="saveDesignation" :loading="saving" />
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

const $q = useQuasar()
const authStore = useAuthStore()
const departments = ref([])
const designations = ref([])
const saving = ref(false)
const showAddDept = ref(false)
const showAddDesig = ref(false)

const newDept = reactive({ name: '', description: '' })
const newDesig = reactive({ title: '', description: '' })

async function loadData() {
  const companyId = authStore.currentBranch?.company_id
  if (!companyId) return

  const [deptRes, desigRes] = await Promise.all([
    supabase.from('departments').select('*').eq('company_id', companyId).order('name'),
    supabase.from('designations').select('*').eq('company_id', companyId).order('title'),
  ])
  departments.value = deptRes.data || []
  designations.value = desigRes.data || []
}

async function saveDepartment() {
  saving.value = true
  try {
    const { error } = await supabase.from('departments').insert({
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
      name: newDept.name,
      description: newDept.description,
    })
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Department added' })
    showAddDept.value = false
    newDept.name = ''
    newDept.description = ''
    loadData()
  } catch (err) {
    if (err.code === '23505') {
      $q.notify({ type: 'warning', message: 'Department already exists' })
    } else {
      $q.notify({ type: 'negative', message: err.message })
    }
  } finally {
    saving.value = false
  }
}

async function saveDesignation() {
  saving.value = true
  try {
    const { error } = await supabase.from('designations').insert({
      company_id: authStore.currentBranch?.company_id,
      title: newDesig.title,
      description: newDesig.description,
    })
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Designation added' })
    showAddDesig.value = false
    newDesig.title = ''
    newDesig.description = ''
    loadData()
  } catch (err) {
    if (err.code === '23505') {
      $q.notify({ type: 'warning', message: 'Designation already exists' })
    } else {
      $q.notify({ type: 'negative', message: err.message })
    }
  } finally {
    saving.value = false
  }
}

onMounted(() => loadData())
</script>
