<template>
  <q-page class="q-pa-md">
    <ErpPageHeader
      title="Fiscal Periods"
      icon="calendar_month"
      subtitle="Manage and lock accounting periods"
    >
      <template v-slot:actions>
        <q-btn
          color="primary"
          icon="auto_awesome"
          label="Generate Periods"
          unelevated
          :loading="generating"
          @click="showGenerateDialog = true"
        />
      </template>
    </ErpPageHeader>

    <q-table
      flat
      bordered
      :rows="periods"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :pagination="{ rowsPerPage: 20 }"
    >
      <!-- Status chip -->
      <template v-slot:body-cell-status="props">
        <q-td :props="props">
          <q-chip
            :color="statusColor(props.value)"
            text-color="white"
            dense
            :label="props.value"
            class="text-capitalize"
          />
        </q-td>
      </template>

      <!-- Locked By -->
      <template v-slot:body-cell-locked_by_name="props">
        <q-td :props="props">{{ props.value || '—' }}</q-td>
      </template>

      <!-- Actions -->
      <template v-slot:body-cell-actions="props">
        <q-td :props="props">
          <!-- Lock: available when open -->
          <q-btn
            v-if="props.row.status === 'open'"
            flat
            round
            size="sm"
            icon="lock"
            color="orange"
            title="Lock Period"
            @click="confirmLock(props.row)"
          />
          <!-- Close: available when locked -->
          <q-btn
            v-if="props.row.status === 'locked'"
            flat
            round
            size="sm"
            icon="lock_clock"
            color="red"
            title="Close Period"
            @click="confirmClose(props.row)"
          />
          <!-- Reopen: admin only, for locked periods -->
          <q-btn
            v-if="props.row.status === 'locked' && authStore.isAdmin"
            flat
            round
            size="sm"
            icon="lock_open"
            color="green"
            title="Reopen Period (Admin)"
            @click="confirmReopen(props.row)"
          />
        </q-td>
      </template>
    </q-table>

    <!-- Generate Periods Dialog -->
    <q-dialog v-model="showGenerateDialog" persistent>
      <q-card style="min-width: 360px">
        <q-card-section class="row items-center bg-primary text-white">
          <q-icon name="auto_awesome" class="q-mr-sm" />
          <div class="text-h6">Generate Fiscal Periods</div>
          <q-space />
          <q-btn flat round dense icon="close" @click="showGenerateDialog = false" />
        </q-card-section>
        <q-card-section class="q-pa-md">
          <q-select
            v-model="generateYear"
            label="Fiscal Year"
            outlined
            dense
            :options="yearOptions"
            emit-value
            map-options
          />
          <div class="text-caption text-grey q-mt-sm">
            This will create 12 monthly periods for the selected year. Existing periods will be skipped.
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="showGenerateDialog = false" />
          <q-btn
            color="primary"
            label="Generate"
            unelevated
            :loading="generating"
            @click="generatePeriods"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'src/stores/auth'
import { supabase } from 'src/boot/supabase'
import ErpPageHeader from 'src/components/common/ErpPageHeader.vue'

const $q = useQuasar()
const authStore = useAuthStore()

const periods = ref([])
const loading = ref(false)
const generating = ref(false)
const showGenerateDialog = ref(false)

const currentYear = new Date().getFullYear()
const generateYear = ref(currentYear)
const yearOptions = [
  { label: String(currentYear - 1), value: currentYear - 1 },
  { label: String(currentYear), value: currentYear },
  { label: String(currentYear + 1), value: currentYear + 1 },
]

const columns = [
  { name: 'period_name', label: 'Period Name', field: 'period_name', align: 'left', sortable: true },
  { name: 'period_start', label: 'Start Date', field: 'period_start', align: 'left', sortable: true },
  { name: 'period_end', label: 'End Date', field: 'period_end', align: 'left', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'locked_by_name', label: 'Locked By', field: 'locked_by_name', align: 'left' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' },
]

function statusColor(status) {
  return { open: 'green', locked: 'orange', closed: 'red' }[status] || 'grey'
}

function getCompanyId() {
  return authStore.currentBranch?.company_id || null
}

async function loadPeriods() {
  loading.value = true
  try {
    const companyId = getCompanyId()
    if (!companyId) return

    const { data, error } = await supabase
      .from('fiscal_periods')
      .select('*, locked_user:locked_by(email)')
      .eq('company_id', companyId)
      .order('period_start', { ascending: true })

    if (error) throw error

    periods.value = (data || []).map(p => ({
      ...p,
      locked_by_name: p.locked_user?.email || null,
    }))
  } catch (e) {
    $q.notify({ type: 'negative', message: `Failed to load periods: ${e.message}` })
  } finally {
    loading.value = false
  }
}

async function generatePeriods() {
  generating.value = true
  try {
    const companyId = getCompanyId()
    if (!companyId) {
      $q.notify({ type: 'negative', message: 'Company not found' })
      return
    }

    const year = generateYear.value
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]

    const rows = monthNames.map((name, idx) => {
      const month = idx + 1

      const endDate = new Date(year, idx + 1, 0) // last day of month
      const pad = n => String(n).padStart(2, '0')
      return {
        company_id: companyId,
        period_name: `${name} ${year}`,
        period_start: `${year}-${pad(month)}-01`,
        period_end: `${year}-${pad(month)}-${pad(endDate.getDate())}`,
        status: 'open',
      }
    })

    // upsert — skip duplicates (company_id, period_start is unique)
    const { error } = await supabase
      .from('fiscal_periods')
      .upsert(rows, { onConflict: 'company_id,period_start', ignoreDuplicates: true })

    if (error) throw error

    $q.notify({ type: 'positive', message: `Fiscal periods for ${year} generated successfully` })
    showGenerateDialog.value = false
    await loadPeriods()
  } catch (e) {
    $q.notify({ type: 'negative', message: `Failed to generate periods: ${e.message}` })
  } finally {
    generating.value = false
  }
}

function confirmLock(row) {
  $q.dialog({
    title: 'Lock Period',
    message: `Lock "${row.period_name}"? No new entries will be allowed for this period.`,
    cancel: true,
    persistent: true,
  }).onOk(() => updateStatus(row.id, 'locked'))
}

function confirmClose(row) {
  $q.dialog({
    title: 'Close Period',
    message: `Permanently close "${row.period_name}"? This cannot be undone without admin access.`,
    cancel: true,
    persistent: true,
  }).onOk(() => updateStatus(row.id, 'closed'))
}

function confirmReopen(row) {
  $q.dialog({
    title: 'Reopen Period (Admin)',
    message: `Reopen "${row.period_name}"? This will allow new entries to be posted.`,
    cancel: true,
    persistent: true,
  }).onOk(() => updateStatus(row.id, 'open'))
}

async function updateStatus(id, status) {
  try {
    const now = new Date().toISOString()
    const userId = authStore.user?.id

    const patch = { status }
    if (status === 'locked') { patch.locked_by = userId; patch.locked_at = now }
    if (status === 'closed') { patch.closed_by = userId; patch.closed_at = now }
    if (status === 'open') { patch.locked_by = null; patch.locked_at = null }

    const { error } = await supabase
      .from('fiscal_periods')
      .update(patch)
      .eq('id', id)

    if (error) throw error

    const label = { locked: 'locked', closed: 'closed', open: 'reopened' }[status] || status
    $q.notify({ type: 'positive', message: `Period ${label} successfully` })
    await loadPeriods()
  } catch (e) {
    $q.notify({ type: 'negative', message: `Failed to update period: ${e.message}` })
  }
}

onMounted(loadPeriods)
</script>
