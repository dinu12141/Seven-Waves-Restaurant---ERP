<template>
  <div class="q-pa-md">
    <!-- Toolbar -->
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-input
        dark
        outlined
        dense
        v-model="filter"
        placeholder="Search requests..."
        style="min-width: 250px"
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
      <q-select
        dark
        outlined
        dense
        v-model="statusFilter"
        :options="['All', 'Pending', 'Approved', 'Rejected', 'Issued']"
        display-value="Status"
        style="min-width: 150px"
      />
      <q-space />
      <BaseButton variant="primary" icon="add" label="New Request" @click="openCreate" />
    </div>

    <!-- DataGrid -->
    <DataTable
      title="Good Request Notes"
      :rows="filteredRequests"
      :columns="columns"
      :filter="filter"
      :loading="loading"
    >
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge :color="getStatusColor(props.value)" :label="props.value" />
        </q-td>
      </template>

      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn
            flat
            dense
            round
            icon="visibility"
            size="sm"
            color="info"
            @click="viewRequest(props.row)"
          >
            <q-tooltip>View/Process</q-tooltip>
          </q-btn>
          <q-btn
            v-if="props.row.status === 'Pending'"
            flat
            dense
            round
            icon="edit"
            size="sm"
            color="primary"
            @click="editRequest(props.row)"
          >
            <q-tooltip>Edit Draft</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </DataTable>

    <!-- Add/Edit/View Dialog -->
    <BaseDialog
      v-model="dialogOpen"
      :title="
        isViewing ? 'Process Good Request' : editingItem ? 'Edit Request' : 'New Good Request'
      "
      size="lg"
    >
      <div v-if="!isViewing" class="row q-col-gutter-md q-mb-md">
        <div class="col-6">
          <BaseSelect
            label="Requesting Warehouse"
            v-model="form.request_warehouse_id"
            :options="warehouses"
            option-label="name"
            option-value="id"
            emit-value
            map-options
          />
        </div>
        <div class="col-6">
          <BaseSelect
            label="Source Warehouse"
            v-model="form.source_warehouse_id"
            :options="warehouses"
            option-label="name"
            option-value="id"
            emit-value
            map-options
          />
        </div>
        <div class="col-6">
          <BaseInput label="Need Date" type="date" v-model="form.need_date" />
        </div>
        <div class="col-6">
          <BaseInput label="Remarks" v-model="form.remarks" />
        </div>
      </div>
      <div v-else class="row q-col-gutter-md q-mb-md text-white text-caption">
        <div class="col-3"><strong>Request No:</strong> {{ form.request_no }}</div>
        <div class="col-3">
          <strong>Status:</strong>
          <q-badge :color="getStatusColor(form.status)" :label="form.status" />
        </div>
        <div class="col-3">
          <strong>Requesting WH:</strong> {{ getWhName(form.request_warehouse_id) }}
        </div>
        <div class="col-3">
          <strong>Source WH:</strong> {{ getWhName(form.source_warehouse_id) }}
        </div>
      </div>

      <!-- Items -->
      <div class="row items-center justify-between q-mt-md q-mb-sm">
        <div class="text-subtitle1 text-primary">Requested Items</div>
        <q-btn
          v-if="!isViewing"
          dense
          color="primary"
          icon="add"
          label="Add Item"
          @click="addItem"
        />
      </div>

      <q-list bordered class="bg-dark rounded-borders">
        <div class="row q-pa-sm bg-grey-10 text-weight-bold text-grey-4 text-caption items-center">
          <div class="col-4">Item</div>
          <div class="col-3">UOM</div>
          <div class="col-3">Req Qty</div>
          <div class="col-2 text-center">Actions</div>
        </div>
        <div
          v-for="(it, index) in form.items"
          :key="index"
          class="row q-pa-sm q-col-gutter-sm items-center"
          style="border-top: 1px solid var(--border)"
        >
          <div class="col-4">
            <q-select
              v-if="!isViewing"
              v-model="it.item_id"
              :options="inventoryItems"
              option-label="name"
              option-value="id"
              emit-value
              map-options
              dense
              outlined
              dark
              hide-bottom-space
            />
            <span v-else>{{ getItemName(it.item_id) }}</span>
          </div>
          <div class="col-3">
            <q-select
              v-if="!isViewing"
              v-model="it.uom_id"
              :options="uoms"
              option-label="name"
              option-value="id"
              emit-value
              map-options
              dense
              outlined
              dark
              hide-bottom-space
            />
            <span v-else>{{ getUomName(it.uom_id) }}</span>
          </div>
          <div class="col-3">
            <q-input
              v-if="!isViewing"
              v-model.number="it.requested_qty"
              type="number"
              dense
              outlined
              dark
              hide-bottom-space
            />
            <span v-else>{{ it.requested_qty }}</span>
          </div>
          <div class="col-2 text-center">
            <q-btn
              v-if="!isViewing"
              flat
              round
              dense
              icon="delete"
              color="negative"
              size="sm"
              @click="removeItem(index)"
            />
          </div>
        </div>
      </q-list>

      <template #actions>
        <BaseButton label="Close" variant="secondary" @click="dialogOpen = false" class="q-mr-sm" />
        <BaseButton
          v-if="!isViewing"
          label="Submit Request"
          icon="send"
          variant="primary"
          @click="saveRequest"
        />
        <BaseButton
          v-if="isViewing && form.status === 'Pending'"
          label="Approve"
          icon="check"
          color="positive"
          @click="approveRequest"
          class="q-ml-sm"
        />
        <BaseButton
          v-if="isViewing && form.status === 'Pending'"
          label="Reject"
          icon="close"
          color="negative"
          @click="rejectRequest"
          class="q-ml-sm"
        />
      </template>
    </BaseDialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import DataTable from 'components/common/DataTable.vue'
import BaseButton from 'components/common/erp/BaseButton.vue'
import BaseDialog from 'components/common/erp/BaseDialog.vue'
import BaseSelect from 'components/common/erp/BaseSelect.vue'
import BaseInput from 'components/common/erp/BaseInput.vue'

const $q = useQuasar()
const authStore = useAuthStore()

const loading = ref(false)
const dialogOpen = ref(false)
const isViewing = ref(false)
const editingItem = ref(null)

const requests = ref([])
const warehouses = ref([])
const inventoryItems = ref([])
const uoms = ref([])

const filter = ref('')
const statusFilter = ref('All')

const emptyForm = {
  id: null,
  request_no: '',
  request_warehouse_id: null,
  source_warehouse_id: null,
  need_date: '',
  remarks: '',
  status: 'Pending',
  items: [],
}
const form = ref({ ...emptyForm })

const columns = [
  { name: 'request_no', label: 'Req No', field: 'request_no', align: 'left', sortable: true },
  { name: 'request_date', label: 'Date', field: 'request_date', align: 'left', sortable: true },
  {
    name: 'request_warehouse',
    label: 'Req WH',
    field: (row) => getWhName(row.request_warehouse_id),
    align: 'left',
  },
  {
    name: 'source_warehouse',
    label: 'Source WH',
    field: (row) => getWhName(row.source_warehouse_id),
    align: 'left',
  },
  { name: 'status', label: 'Status', field: 'status', align: 'center', sortable: true },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' },
]

const filteredRequests = computed(() => {
  let result = requests.value
  if (statusFilter.value !== 'All') {
    result = result.filter((r) => r.status === statusFilter.value)
  }
  if (filter.value) {
    result = result.filter((r) => r.request_no?.toLowerCase().includes(filter.value.toLowerCase()))
  }
  return result
})

onMounted(async () => {
  await fetchDependencies()
  await fetchRequests()
})

async function fetchDependencies() {
  const companyId = authStore.currentBranch?.company_id
  if (!companyId) return
  const [whRes, itRes, uomRes] = await Promise.all([
    supabase.from('warehouses').select('id, name').eq('company_id', companyId),
    supabase.from('items').select('id, name').eq('company_id', companyId),
    supabase.from('uom').select('id, name'),
  ])
  warehouses.value = whRes.data || []
  inventoryItems.value = itRes.data || []
  uoms.value = uomRes.data || []
}

async function fetchRequests() {
  loading.value = true
  try {
    const companyId = authStore.currentBranch?.company_id
    if (!companyId) return
    const { data: reqs, error } = await supabase
      .from('good_request_notes')
      .select('*, good_request_items(*)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    if (!error) requests.value = reqs || []
  } catch (err) {
    console.error(err)
  }
  loading.value = false
}

function openCreate() {
  form.value = { ...emptyForm, items: [] }
  isViewing.value = false
  editingItem.value = null
  dialogOpen.value = true
}

function editRequest(row) {
  form.value = { ...row, items: row.good_request_items || [] }
  isViewing.value = false
  editingItem.value = row
  dialogOpen.value = true
}

function viewRequest(row) {
  form.value = { ...row, items: row.good_request_items || [] }
  isViewing.value = true
  editingItem.value = row
  dialogOpen.value = true
}

function addItem() {
  form.value.items.push({ item_id: null, uom_id: null, requested_qty: 1 })
}

function removeItem(idx) {
  form.value.items.splice(idx, 1)
}

function getWhName(id) {
  return warehouses.value.find((w) => w.id === id)?.name || ''
}
function getItemName(id) {
  return inventoryItems.value.find((i) => i.id === id)?.name || ''
}
function getUomName(id) {
  return uoms.value.find((u) => u.id === id)?.name || ''
}

function getStatusColor(status) {
  switch (status) {
    case 'Pending':
      return 'orange'
    case 'Approved':
      return 'green'
    case 'Rejected':
      return 'red'
    case 'Issued':
      return 'blue'
    case 'Partially Issued':
      return 'info'
    default:
      return 'grey'
  }
}

async function saveRequest() {
  if (!form.value.request_warehouse_id || !form.value.source_warehouse_id) {
    $q.notify({ type: 'warning', message: 'Select Requesting and Source warehouses' })
    return
  }
  try {
    const companyId = authStore.currentBranch?.company_id
    const branchId = authStore.currentBranch?.id
    const payload = {
      company_id: companyId,
      branch_id: branchId,
      request_warehouse_id: form.value.request_warehouse_id,
      source_warehouse_id: form.value.source_warehouse_id,
      need_date: form.value.need_date,
      remarks: form.value.remarks,
      request_no: form.value.request_no || `GRN-${Date.now()}`, // Fallback logic
    }

    let headerId = form.value.id
    if (!headerId) {
      const { data, error } = await supabase
        .from('good_request_notes')
        .insert([payload])
        .select()
        .single()
      if (error) throw error
      headerId = data.id
    } else {
      await supabase.from('good_request_notes').update(payload).eq('id', headerId)
      // Delete old items
      await supabase.from('good_request_items').delete().eq('good_request_id', headerId)
    }

    if (form.value.items.length > 0) {
      const lineData = form.value.items.map((it) => ({
        good_request_id: headerId,
        item_id: it.item_id,
        uom_id: it.uom_id,
        requested_qty: it.requested_qty,
      }))
      await supabase.from('good_request_items').insert(lineData)
    }

    $q.notify({ type: 'positive', message: 'Request saved successfully' })
    dialogOpen.value = false
    fetchRequests()
  } catch (e) {
    console.error(e)
    $q.notify({
      type: 'negative',
      message: 'Failed to save request. Note: MCP schema must be applied first.',
    })
  }
}

async function approveRequest() {
  try {
    await supabase
      .from('good_request_notes')
      .update({
        status: 'Approved',
        approved_by: authStore.user?.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', form.value.id)
    $q.notify({ type: 'positive', message: 'Request Approved' })
    dialogOpen.value = false
    fetchRequests()
  } catch (e) {
    console.error(e)
  }
}

async function rejectRequest() {
  try {
    await supabase.from('good_request_notes').update({ status: 'Rejected' }).eq('id', form.value.id)
    $q.notify({ type: 'negative', message: 'Request Rejected' })
    dialogOpen.value = false
    fetchRequests()
  } catch (e) {
    console.error(e)
  }
}

defineExpose({
  columns,
  rows: filteredRequests,
})
</script>
