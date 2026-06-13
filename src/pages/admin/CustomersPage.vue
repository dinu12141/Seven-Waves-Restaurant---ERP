<template>
  <q-page class="q-pa-md admin-customers-page">
    <!-- Header -->
    <PageHeader
      title="Customer Management"
      subtitle="View, search, and manage all registered customers"
      show-back
      back-route="/admin"
    >
      <template #actions>
        <q-input
          v-model="searchQuery"
          id="customer-search-input"
          dense
          outlined
          placeholder="Search by name, email, phone..."
          class="customer-search"
          debounce="400"
          @update:model-value="fetchCustomers"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
          <template #append>
            <q-icon v-if="searchQuery" name="close" class="cursor-pointer" @click="clearSearch" />
          </template>
        </q-input>
      </template>
    </PageHeader>

    <!-- Filters Bar -->
    <div class="row q-col-gutter-sm q-mb-md items-center">
      <div class="col-12 col-sm-auto">
        <q-btn-toggle
          v-model="statusFilter"
          no-caps
          unelevated
          dense
          :options="[
            { label: 'All', value: null },
            { label: 'Active', value: true },
            { label: 'Inactive', value: false },
          ]"
          color="primary"
          text-color="grey-7"
          toggle-color="primary"
          class="status-filter-toggle"
          @update:model-value="fetchCustomers"
        />
      </div>
      <q-space />
      <div class="col-12 col-sm-auto text-grey-6 text-caption">
        {{ totalCount }} customers found
      </div>
    </div>

    <!-- Customers Table -->
    <q-card flat bordered class="customers-table-card">
      <q-table
        :rows="customers"
        :columns="columns"
        row-key="id"
        :loading="loading"
        flat
        :pagination="{ rowsPerPage: 20 }"
        hide-pagination
        class="customers-table"
        @row-click="(_, row) => viewCustomer(row)"
      >
        <!-- Name + Avatar -->
        <template #body-cell-full_name="props">
          <q-td :props="props">
            <div class="row no-wrap items-center">
              <div class="customer-avatar">
                {{ (props.row.full_name || '?').charAt(0).toUpperCase() }}
              </div>
              <div class="q-ml-sm">
                <div class="text-weight-bold text-body2">{{ props.row.full_name || '—' }}</div>
                <div class="text-caption text-grey-6">{{ props.row.email || '—' }}</div>
              </div>
            </div>
          </q-td>
        </template>

        <!-- Phone -->
        <template #body-cell-phone="props">
          <q-td :props="props">
            <span class="text-body2">{{ props.row.phone || '—' }}</span>
          </q-td>
        </template>

        <!-- Loyalty -->
        <template #body-cell-loyalty="props">
          <q-td :props="props">
            <div v-if="props.row.card_number || props.row.loyalty_card_no">
              <div class="row items-center no-wrap">
                <q-icon name="stars" color="amber" size="14px" class="q-mr-xs" />
                <span class="text-caption font-mono">{{
                  props.row.card_number || props.row.loyalty_card_no
                }}</span>
              </div>
              <div class="row items-center no-wrap q-mt-xs">
                <q-chip
                  dense
                  :color="getTierColor(props.row.tier || props.row.loyalty_tier)"
                  text-color="white"
                  size="xs"
                  class="q-mr-xs"
                >
                  {{ getTierLabel(props.row.tier || props.row.loyalty_tier) }}
                </q-chip>
                <span class="text-caption text-grey-6">
                  {{ props.row.points_balance || props.row.loyalty_points || 0 }} pts
                </span>
              </div>
            </div>
            <span v-else class="text-grey-6 text-caption">—</span>
          </q-td>
        </template>

        <!-- Orders / Spent -->
        <template #body-cell-orders="props">
          <q-td :props="props">
            <div class="text-body2 text-weight-bold">{{ props.row.total_orders || 0 }}</div>
            <div class="text-caption text-grey-6">
              LKR {{ Number(props.row.total_spent || 0).toLocaleString('en-LK') }}
            </div>
          </q-td>
        </template>

        <!-- Status -->
        <template #body-cell-is_active="props">
          <q-td :props="props">
            <q-chip
              dense
              :color="props.row.is_active ? 'positive' : 'negative'"
              text-color="white"
              size="sm"
            >
              {{ props.row.is_active ? 'Active' : 'Inactive' }}
            </q-chip>
          </q-td>
        </template>

        <!-- Registered Date -->
        <template #body-cell-created_at="props">
          <q-td :props="props">
            <span class="text-caption text-grey-6">{{ formatDate(props.row.created_at) }}</span>
          </q-td>
        </template>

        <!-- Actions -->
        <template #body-cell-actions="props">
          <q-td :props="props" class="action-cell" @click.stop>
            <q-btn
              flat
              round
              icon="open_in_new"
              color="primary"
              size="sm"
              @click="viewCustomer(props.row)"
            >
              <q-tooltip>View Details</q-tooltip>
            </q-btn>
            <PermissionGate permission="admin.customers.delete">
              <q-btn
                flat
                round
                icon="delete"
                color="negative"
                size="sm"
                @click="deleteCustomerAction(props.row)"
                class="q-ml-sm"
              >
                <q-tooltip>Delete Customer</q-tooltip>
              </q-btn>
            </PermissionGate>
          </q-td>
        </template>

        <!-- Empty state -->
        <template #no-data>
          <div class="column items-center q-pa-xl text-grey-6">
            <q-icon name="people_outline" size="64px" class="q-mb-md" />
            <div class="text-h6 text-weight-bold">No customers found</div>
            <div class="text-caption">
              {{
                searchQuery
                  ? 'Try adjusting your search or filters.'
                  : 'No customers have registered yet.'
              }}
            </div>
          </div>
        </template>
      </q-table>

      <!-- Pagination -->
      <div v-if="totalCount > pageSize" class="row justify-center q-pa-md">
        <q-pagination
          v-model="currentPage"
          :max="Math.ceil(totalCount / pageSize)"
          direction-links
          @update:model-value="fetchCustomers"
          color="primary"
        />
      </div>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { date } from 'quasar'
import PageHeader from 'components/common/PageHeader.vue'
import PermissionGate from 'components/common/PermissionGate.vue'
import { adminGetCustomers, adminDeleteCustomer } from 'src/services/customerAuthService'

const router = useRouter()
const $q = useQuasar()

const customers = ref([])
const loading = ref(false)
const searchQuery = ref('')
const statusFilter = ref(null)
const totalCount = ref(0)
const currentPage = ref(1)
const pageSize = 20

const columns = [
  {
    name: 'full_name',
    label: 'Customer',
    align: 'left',
    field: 'full_name',
    sortable: true,
    style: 'min-width: 200px',
  },
  {
    name: 'phone',
    label: 'Phone',
    align: 'left',
    field: 'phone',
    style: 'min-width: 130px',
  },
  {
    name: 'loyalty',
    label: 'Loyalty',
    align: 'left',
    field: 'card_number',
    style: 'min-width: 160px',
  },
  {
    name: 'orders',
    label: 'Orders / Spent',
    align: 'center',
    field: 'total_orders',
    style: 'min-width: 120px',
  },
  {
    name: 'is_active',
    label: 'Status',
    align: 'center',
    field: 'is_active',
    style: 'min-width: 90px',
  },
  {
    name: 'created_at',
    label: 'Registered',
    align: 'left',
    field: 'created_at',
    sortable: true,
    style: 'min-width: 120px',
  },
  {
    name: 'actions',
    label: '',
    align: 'center',
    field: 'actions',
    style: 'width: 60px',
  },
]

function clearSearch() {
  searchQuery.value = ''
  fetchCustomers()
}

async function fetchCustomers() {
  loading.value = true
  try {
    const result = await adminGetCustomers({
      search: searchQuery.value || undefined,
      active: statusFilter.value,
      limit: pageSize,
      offset: (currentPage.value - 1) * pageSize,
    })

    if (!result.success) {
      $q.notify({ type: 'negative', message: result.error || 'Failed to load customers' })
      return
    }

    customers.value = result.data || []
    totalCount.value = result.total || 0
  } catch (err) {
    console.error('[CustomersPage] Error:', err)
    $q.notify({ type: 'negative', message: 'Failed to load customers' })
  } finally {
    loading.value = false
  }
}

function viewCustomer(customer) {
  router.push(`/admin/customers/${customer.id}`)
}

function formatDate(val) {
  if (!val) return '—'
  return date.formatDate(val, 'DD MMM YYYY')
}

function getTierColor(tier) {
  if (!tier) return 'grey'
  const t = tier.toLowerCase()
  if (t === 'platinum') return 'purple'
  if (t === 'gold') return 'amber'
  if (t === 'silver') return 'blue-grey'
  return 'orange'
}

function getTierLabel(tier) {
  if (!tier) return 'Standard'
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

function deleteCustomerAction(customer) {
  $q.dialog({
    title: 'Confirm Delete',
    message: `Are you sure you want to delete customer "${customer.full_name}"?`,
    cancel: true,
    persistent: true,
    color: 'negative',
  }).onOk(async () => {
    const result = await adminDeleteCustomer(customer.id)
    if (result.success) {
      $q.notify({ type: 'positive', message: 'Customer deleted successfully' })
      fetchCustomers()
    } else {
      $q.notify({
        type: 'negative',
        message: 'Failed to delete customer',
        caption: result.error,
      })
    }
  })
}

onMounted(fetchCustomers)
</script>

<style lang="scss" scoped>
.admin-customers-page {
  max-width: 1400px;
  margin: 0 auto;
}

.customer-search {
  min-width: 280px;
  :deep(.q-field__control) {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #e5e7eb;
  }
  :deep(.q-field__native) {
    color: #e5e7eb;
  }
  :deep(.q-field__native::placeholder) {
    color: #6b7280;
  }
}

.status-filter-toggle {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  overflow: hidden;
  :deep(.q-btn) {
    color: #9ca3af !important;
    &.q-btn--active {
      color: white !important;
    }
  }
}

.customers-table-card {
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.customers-table {
  background: transparent !important;
  :deep(.q-table__top) {
    display: none;
  }
  :deep(thead tr th) {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #6b7280;
    background: rgba(255, 255, 255, 0.03);
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
  }
  :deep(tbody tr) {
    cursor: pointer;
    &:hover {
      background: rgba(59, 130, 246, 0.06) !important;
    }
  }
  :deep(tbody tr td) {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    color: #d1d5db;
  }
  :deep(.q-table__bottom) {
    color: #6b7280;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
}

.customer-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ef4444);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 800;
  color: white;
  flex-shrink: 0;
}

.font-mono {
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.5px;
  color: #9ca3af;
}

.action-cell {
  width: 60px;
}
</style>
