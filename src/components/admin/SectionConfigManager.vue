<template>
  <q-card flat bordered class="q-pa-md">
    <div class="row items-center q-mb-md">
      <q-icon name="storefront" size="26px" color="primary" class="q-mr-sm" />
      <div>
        <div class="text-subtitle1 text-weight-bold">Kottawa Kitchen Sections &amp; Departmental COGS Labels</div>
        <div class="text-caption text-grey-6">
          Customize kitchen section names and their corresponding Cost of Goods Sold (COGS) reporting labels.
        </div>
      </div>
      <q-space />
      <q-btn
        color="primary"
        icon="save"
        label="Save Section Names"
        no-caps
        unelevated
        :loading="saving"
        @click="save"
      />
    </div>

    <q-separator class="q-mb-md" />

    <div v-if="loading" class="text-center q-pa-md">
      <q-spinner-dots size="32px" color="primary" />
      <div class="text-caption text-grey-6 q-mt-xs">Loading section configuration...</div>
    </div>

    <div v-else>
      <q-table
        flat
        bordered
        dense
        :rows="sections"
        :columns="columns"
        row-key="code"
        :pagination="{ rowsPerPage: 15 }"
        hide-bottom
      >
        <template #body-cell-code="props">
          <q-td :props="props">
            <q-badge color="grey-8" text-color="white" class="text-weight-bold">
              {{ props.value }}
            </q-badge>
          </q-td>
        </template>

        <template #body-cell-name="props">
          <q-td :props="props">
            <q-input
              v-model="props.row.name"
              dense
              outlined
              placeholder="Section Name"
              hide-bottom-space
            />
          </q-td>
        </template>

        <template #body-cell-cogs_label="props">
          <q-td :props="props">
            <q-input
              v-model="props.row.cogs_label"
              dense
              outlined
              placeholder="e.g. COGS – Section Name"
              hide-bottom-space
            />
          </q-td>
        </template>

        <template #body-cell-is_production="props">
          <q-td :props="props" align="center">
            <q-toggle
              v-model="props.row.is_production"
              color="primary"
              dense
              :label="props.row.is_production ? 'Production (COGS)' : 'Support (Expense)'"
              left-label
            />
          </q-td>
        </template>
      </q-table>
    </div>
  </q-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import {
  getKottawaSections,
  saveKottawaSections,
} from 'src/services/inventory/sectionConfigService'

const $q = useQuasar()
const loading = ref(false)
const saving = ref(false)
const sections = ref([])

const columns = [
  { name: 'code', label: 'Code', field: 'code', align: 'left', style: 'width: 100px' },
  { name: 'name', label: 'Section Name (Kottawa)', field: 'name', align: 'left' },
  { name: 'cogs_label', label: 'Departmental COGS P&L Label', field: 'cogs_label', align: 'left' },
  { name: 'is_production', label: 'Classification', field: 'is_production', align: 'center', style: 'width: 180px' },
]

async function load() {
  loading.value = true
  try {
    const list = await getKottawaSections(true)
    sections.value = JSON.parse(JSON.stringify(list))
  } catch (err) {
    console.error('Failed to load sections:', err)
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const res = await saveKottawaSections(sections.value)
    if (res.success) {
      $q.notify({
        type: 'positive',
        message: 'Kitchen section & COGS names saved successfully!',
      })
    } else {
      throw new Error(res.error)
    }
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'Failed to save sections',
      caption: err?.message,
    })
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
