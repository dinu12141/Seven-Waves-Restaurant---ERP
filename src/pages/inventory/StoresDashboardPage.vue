<template>
  <q-page class="q-pa-md">
    <ErpPageHeader
      title="Stores Dashboard"
      icon="dashboard"
      :breadcrumbs="[{ label: 'Stores' }, { label: 'Dashboard' }]"
    >
      <template #actions>
        <div class="row q-gutter-sm items-center">
          <q-btn
            outline
            no-caps
            icon="list_alt"
            label="All Purchase Orders"
            color="primary"
            to="/inventory/purchase-orders"
          />
          <q-btn
            unelevated
            no-caps
            icon="add"
            label="New Purchase Order"
            color="primary"
            class="text-weight-bold"
            to="/inventory/purchase-orders?action=new"
          />
          <q-btn flat round dense icon="refresh" :loading="loading" @click="fetchDashboard">
            <q-tooltip>Refresh Dashboard</q-tooltip>
          </q-btn>
        </div>
      </template>
    </ErpPageHeader>

    <!-- KPI Cards (Strictly Stores Purchase Orders) -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard
          title="Total Stores POs"
          :value="String(stats.total)"
          icon="shopping_cart"
          color="blue"
        />
      </div>
      <div class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard
          title="Pending Approval"
          :value="String(stats.pending)"
          icon="hourglass_empty"
          color="orange"
        />
      </div>
      <div class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard
          title="Approved POs"
          :value="String(stats.approved)"
          icon="check_circle"
          color="green"
        />
      </div>
      <div class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard
          title="Rejected POs"
          :value="String(stats.rejected)"
          icon="cancel"
          color="red"
        />
      </div>
      <div class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard
          title="Draft POs"
          :value="String(stats.draft)"
          icon="edit_note"
          color="purple"
        />
      </div>
      <div class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard
          title="Approved Value"
          :value="formatCurrency(stats.approvedValue)"
          icon="payments"
          color="teal"
          is-currency
        />
      </div>
    </div>

    <!-- Recent Stores Purchase Orders -->
    <q-card flat bordered class="erp-dashboard-panel shadow-1">
      <q-card-section class="row items-center justify-between q-pb-sm">
        <div>
          <div class="text-subtitle1 text-weight-bold">Recent Stores Purchase Orders</div>
          <div class="text-caption text-grey-7">Latest requisitions created by Stores</div>
        </div>
        <q-btn
          flat
          no-caps
          dense
          color="primary"
          icon-right="arrow_forward"
          label="Manage All POs"
          to="/inventory/purchase-orders"
        />
      </q-card-section>

      <q-separator />

      <q-table
        flat
        :rows="recentPOs"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :pagination="{ rowsPerPage: 10 }"
        no-data-label="No purchase orders created yet"
      >
        <template #body-cell-doc_number="props">
          <q-td :props="props">
            <router-link
              to="/inventory/purchase-orders"
              class="text-weight-bold text-primary"
              style="text-decoration: none"
            >
              {{ props.value }}
            </router-link>
          </q-td>
        </template>

        <template #body-cell-status="props">
          <q-td :props="props" class="text-center">
            <q-chip
              dense
              size="sm"
              :color="getStatusColor(props.value)"
              :text-color="getStatusTextColor(props.value)"
              :icon="getStatusIcon(props.value)"
              class="text-weight-medium q-px-sm"
            >
              {{ formatStatus(props.value) }}
            </q-chip>
            <div
              v-if="props.row.status === 'rejected' && props.row.reject_reason"
              class="text-caption text-negative q-mt-xs"
            >
              Reason: {{ props.row.reject_reason }}
            </div>
          </q-td>
        </template>

        <template #body-cell-total_amount="props">
          <q-td :props="props" class="text-right text-weight-bold">
            {{ formatCurrency(props.value) }}
          </q-td>
        </template>

        <template #no-data>
          <div class="full-width text-center q-pa-xl">
            <q-icon name="shopping_cart" size="48px" color="grey-5" class="q-mb-sm" />
            <div class="text-subtitle1 text-weight-bold">No Purchase Orders Yet</div>
            <div class="text-body2 text-grey-7 q-mb-md">
              Create your first Stores Purchase Order to submit it to Procurement.
            </div>
            <q-btn
              unelevated
              no-caps
              color="primary"
              icon="add"
              label="New Purchase Order"
              to="/inventory/purchase-orders?action=new"
            />
          </div>
        </template>
      </q-table>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { listStoresPOs } from 'src/services/procurementService'
import ErpPageHeader from 'components/common/ErpPageHeader.vue'
import DashboardCard from 'components/dashboard/DashboardCard.vue'

const $q = useQuasar()
const loading = ref(false)
const pos = ref([])

const columns = [
  { name: 'doc_number', label: 'PO #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'doc_date', label: 'Order Date', field: 'doc_date', align: 'left', sortable: true },
  { name: 'expected_date', label: 'Expected Date', field: 'expected_date', align: 'left', sortable: true },
  { name: 'remarks', label: 'Remarks', field: row => row.remarks || '—', align: 'left' },
  { name: 'total_amount', label: 'Total Amount', field: 'total_amount', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center', sortable: true },
]

const stats = computed(() => {
  const list = pos.value || []
  return {
    total: list.length,
    pending: list.filter(p => p.status === 'pending_approval').length,
    approved: list.filter(p => p.status === 'approved').length,
    rejected: list.filter(p => p.status === 'rejected').length,
    draft: list.filter(p => p.status === 'draft').length,
    approvedValue: list
      .filter(p => p.status === 'approved')
      .reduce((sum, p) => sum + Number(p.total_amount || 0), 0),
  }
})

const recentPOs = computed(() => (pos.value || []).slice(0, 10))

function formatCurrency(val) {
  return (
    'LKR ' +
    Number(val || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

function getStatusColor(st) {
  switch (st) {
    case 'approved':
      return 'positive'
    case 'pending_approval':
      return 'amber-9'
    case 'rejected':
      return 'negative'
    case 'draft':
      return 'grey-7'
    default:
      return 'primary'
  }
}

function getStatusTextColor(st) {
  return st === 'pending_approval' ? 'dark' : 'white'
}

function getStatusIcon(st) {
  switch (st) {
    case 'approved':
      return 'check_circle'
    case 'pending_approval':
      return 'hourglass_empty'
    case 'rejected':
      return 'cancel'
    default:
      return 'edit_note'
  }
}

function formatStatus(st) {
  switch (st) {
    case 'pending_approval':
      return 'Pending Approval'
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    case 'draft':
      return 'Draft'
    default:
      return st || 'Draft'
  }
}

async function fetchDashboard() {
  loading.value = true
  try {
    pos.value = (await listStoresPOs()) || []
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to load dashboard: ' + (err.message || err) })
  } finally {
    loading.value = false
  }
}

onMounted(fetchDashboard)
</script>
