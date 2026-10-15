<template>
  <q-page class="q-pa-md bg-grey-1" :class="$q.dark.isActive ? 'bg-dark' : ''">
    <!-- ── PAGE HEADER ──────────────────────────────────────────────────────── -->
    <div class="row items-center justify-between q-mb-md">
      <div class="row items-center">
        <div class="bg-deep-purple text-white q-pa-sm rounded-borders q-mr-md shadow-1">
          <q-icon name="account_balance" size="28px" />
        </div>
        <div>
          <div class="text-h5 text-weight-bolder text-dark">Bank Reconciliation</div>
          <div class="text-caption text-grey-6">
            Compare monthly bank statements with internal cashbook transactions and reconcile cleared balances
          </div>
        </div>
      </div>

      <div class="row items-center q-gutter-x-sm">
        <q-btn
          flat
          dense
          icon="refresh"
          label="Refresh"
          color="grey-7"
          no-caps
          @click="loadData"
          :loading="reconStore.loading"
        />
        <q-btn
          unelevated
          color="deep-purple"
          icon="add"
          label="New Reconciliation"
          no-caps
          class="text-weight-bold shadow-1"
          @click="showCreateDialog = true"
        />
      </div>
    </div>

    <!-- ── KPI OVERVIEW CARDS ────────────────────────────────────────────────── -->
    <div class="row q-col-gutter-sm q-mb-md">
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="q-pa-md bg-white shadow-xs">
          <div class="text-caption text-grey-6 text-uppercase text-weight-bold">Total Reconciliations</div>
          <div class="text-h5 text-weight-bold text-dark q-mt-xs">
            {{ reconStore.summaryMetrics.total }}
          </div>
          <div class="text-caption text-grey-5">Monthly statements initiated</div>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="q-pa-md bg-white shadow-xs">
          <div class="text-caption text-positive text-uppercase text-weight-bold">Reconciled / Approved</div>
          <div class="text-h5 text-weight-bold text-positive q-mt-xs">
            {{ reconStore.summaryMetrics.reconciled + reconStore.summaryMetrics.approved }}
          </div>
          <div class="text-caption text-grey-5">{{ reconStore.summaryMetrics.approved }} approved &amp; locked</div>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="q-pa-md bg-white shadow-xs">
          <div class="text-caption text-orange-9 text-uppercase text-weight-bold">In Progress / Draft</div>
          <div class="text-h5 text-weight-bold text-orange-9 q-mt-xs">
            {{ reconStore.summaryMetrics.draft }}
          </div>
          <div class="text-caption text-grey-5">Active matching in progress</div>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="q-pa-md bg-white shadow-xs">
          <div class="text-caption text-negative text-uppercase text-weight-bold">Unresolved Variance</div>
          <div class="text-h5 text-weight-bold text-negative q-mt-xs">
            LKR {{ fmt(reconStore.summaryMetrics.totalVariance) }}
          </div>
          <div class="text-caption text-grey-5">Pending draft variances</div>
        </q-card>
      </div>
    </div>

    <!-- ── FILTER BAR ────────────────────────────────────────────────────────── -->
    <q-card flat bordered class="q-pa-sm q-mb-md bg-white shadow-xs">
      <div class="row q-col-gutter-sm items-center">
        <!-- Bank account filter -->
        <div class="col-12 col-md-4">
          <q-select
            v-model="reconStore.filters.bank_account_id"
            outlined
            dense
            clearable
            emit-value
            map-options
            placeholder="All Bank Accounts"
            :options="bankFilterOptions"
            :dark="$q.dark.isActive"
            @update:model-value="loadData"
          >
            <template v-slot:prepend>
              <q-icon name="account_balance" size="18px" />
            </template>
          </q-select>
        </div>

        <!-- Status filter -->
        <div class="col-12 col-md-3">
          <q-select
            v-model="reconStore.filters.status"
            outlined
            dense
            clearable
            emit-value
            map-options
            placeholder="All Statuses"
            :options="statusOptions"
            :dark="$q.dark.isActive"
            @update:model-value="loadData"
          >
            <template v-slot:prepend>
              <q-icon name="filter_alt" size="18px" />
            </template>
          </q-select>
        </div>

        <!-- Month search -->
        <div class="col-12 col-md-3">
          <q-input
            v-model="reconStore.filters.month"
            outlined
            dense
            type="month"
            clearable
            placeholder="Filter Month"
            :dark="$q.dark.isActive"
            @update:model-value="loadData"
          />
        </div>

        <div class="col-12 col-md-2 text-right">
          <q-btn
            flat
            dense
            no-caps
            label="Reset Filters"
            color="grey-7"
            @click="resetFilters"
          />
        </div>
      </div>
    </q-card>

    <!-- ── RECONCILIATIONS TABLE ─────────────────────────────────────────────── -->
    <q-card flat bordered class="bg-white shadow-xs">
      <q-table
        flat
        :rows="reconStore.reconciliations"
        :columns="columns"
        row-key="id"
        :loading="reconStore.loading"
        :pagination="{ rowsPerPage: 15 }"
        no-data-label="No bank reconciliations found. Click '+ New Reconciliation' to start."
      >
        <!-- Bank Account Column -->
        <template v-slot:body-cell-bank="p">
          <q-td :props="p">
            <div class="text-weight-bold text-dark">
              {{ p.row.bank_account?.bank_name || 'Bank' }}
            </div>
            <div class="text-caption text-grey-6">
              {{ p.row.bank_account?.registered_name }} ({{ p.row.bank_account?.account_number || 'N/A' }})
            </div>
          </q-td>
        </template>

        <!-- Period Column -->
        <template v-slot:body-cell-period="p">
          <q-td :props="p">
            <div class="text-caption text-dark text-weight-medium">
              {{ p.row.statement_start_date }} ➔ {{ p.row.statement_end_date }}
            </div>
            <div class="text-caption text-grey-6">
              Month: {{ p.row.reconciliation_month }}
            </div>
          </q-td>
        </template>

        <!-- Opening Balance -->
        <template v-slot:body-cell-opening_bank_balance="p">
          <q-td :props="p" class="text-right">
            LKR {{ fmt(p.value) }}
          </q-td>
        </template>

        <!-- Closing Balance -->
        <template v-slot:body-cell-closing_bank_balance="p">
          <q-td :props="p" class="text-right text-weight-medium">
            LKR {{ fmt(p.value) }}
          </q-td>
        </template>

        <!-- Difference Amount -->
        <template v-slot:body-cell-difference_amount="p">
          <q-td :props="p" class="text-right">
            <q-badge
              :color="Math.abs(Number(p.value)) < 0.01 ? 'positive' : 'negative'"
              text-color="white"
              class="text-weight-bold q-px-sm"
            >
              {{ Math.abs(Number(p.value)) < 0.01 ? '0.00 (Balanced)' : 'LKR ' + fmt(p.value) }}
            </q-badge>
          </q-td>
        </template>

        <!-- Progress / Lines Count -->
        <template v-slot:body-cell-lines_count="p">
          <q-td :props="p" class="text-center">
            <div class="text-caption text-weight-medium">
              {{ p.row.matched_lines_count || 0 }} / {{ p.row.total_lines_count || 0 }} cleared
            </div>
            <q-linear-progress
              rounded
              size="6px"
              :value="p.row.total_lines_count ? (p.row.matched_lines_count / p.row.total_lines_count) : 0"
              color="deep-purple"
              class="q-mt-xs"
            />
          </q-td>
        </template>

        <!-- Status Column -->
        <template v-slot:body-cell-status="p">
          <q-td :props="p" class="text-center">
            <q-badge :color="statusColor(p.value)" text-color="white" class="text-uppercase text-weight-bold q-px-sm">
              {{ p.value }}
            </q-badge>
          </q-td>
        </template>

        <!-- Actions Column -->
        <template v-slot:body-cell-actions="p">
          <q-td :props="p" class="text-center">
            <div class="row items-center justify-center q-gutter-x-xs">
              <q-btn
                unelevated
                size="sm"
                color="deep-purple"
                icon="compare_arrows"
                label="Reconcile"
                no-caps
                @click="openWorkspace(p.row.id)"
              >
                <q-tooltip>Open line-by-line reconciliation workspace</q-tooltip>
              </q-btn>

              <q-btn
                v-if="p.row.status === 'reconciled'"
                flat
                round
                size="sm"
                icon="check_circle"
                color="positive"
                @click="approveRecon(p.row.id)"
              >
                <q-tooltip>Approve reconciliation</q-tooltip>
              </q-btn>

              <q-btn
                v-if="p.row.status === 'draft'"
                flat
                round
                size="sm"
                icon="delete"
                color="negative"
                @click="confirmDelete(p.row)"
              >
                <q-tooltip>Delete draft reconciliation</q-tooltip>
              </q-btn>
            </div>
          </q-td>
        </template>
      </q-table>
    </q-card>

    <!-- ── NEW RECONCILIATION DIALOG ─────────────────────────────────────────── -->
    <NewReconciliationDialog
      v-model="showCreateDialog"
      :bank-accounts="accountStore.bankAccounts"
      :saving="reconStore.saving"
      @create="handleCreate"
    />

    <!-- ── RECONCILIATION WORKSPACE MODAL ────────────────────────────────────── -->
    <BankReconciliationWorkspaceDialog
      v-model="showWorkspace"
      :recon-id="activeReconId"
      @closed="onWorkspaceClosed"
    />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceBankReconciliationStore } from '../stores/finance-bank-reconciliation.store'
import { useFinanceAccountStore } from '../stores/finance-account.store'
import NewReconciliationDialog from '../components/NewReconciliationDialog.vue'
import BankReconciliationWorkspaceDialog from '../components/BankReconciliationWorkspaceDialog.vue'

const $q = useQuasar()
const reconStore = useFinanceBankReconciliationStore()
const accountStore = useFinanceAccountStore()

const showCreateDialog = ref(false)
const showWorkspace = ref(false)
const activeReconId = ref(null)

const statusOptions = [
  { label: 'Draft (In Progress)', value: 'draft' },
  { label: 'Reconciled (Balanced)', value: 'reconciled' },
  { label: 'Approved', value: 'approved' },
  { label: 'Locked', value: 'locked' },
]

const bankFilterOptions = computed(() => {
  return (accountStore.bankAccounts || []).map((acc) => ({
    label: `${acc.bank_name || 'Bank'} — ${acc.registered_name}`,
    value: acc.id,
  }))
})

const columns = [
  { name: 'bank', label: 'Bank Account', field: 'bank', align: 'left', sortable: true },
  { name: 'period', label: 'Reconciliation Period', field: 'period', align: 'left', sortable: true },
  { name: 'opening_bank_balance', label: 'Opening Bal', field: 'opening_bank_balance', align: 'right', sortable: true },
  { name: 'closing_bank_balance', label: 'Closing Bal', field: 'closing_bank_balance', align: 'right', sortable: true },
  { name: 'difference_amount', label: 'Difference', field: 'difference_amount', align: 'right', sortable: true },
  { name: 'lines_count', label: 'Cleared Items', field: 'lines_count', align: 'center' },
  { name: 'status', label: 'Status', field: 'status', align: 'center', sortable: true },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' },
]

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function statusColor(s) {
  return { draft: 'grey-7', reconciled: 'blue-8', approved: 'positive', locked: 'dark' }[s] || 'grey'
}

async function loadData() {
  await reconStore.fetchReconciliations()
}

function resetFilters() {
  reconStore.filters.bank_account_id = null
  reconStore.filters.status = null
  reconStore.filters.month = null
  loadData()
}

async function handleCreate({ recon, autoFetch }) {
  try {
    const created = await reconStore.createReconciliation(recon, { autoFetch })
    showCreateDialog.value = false
    $q.notify({ type: 'positive', message: 'Reconciliation created successfully!' })
    // Open the workspace immediately for matching
    openWorkspace(created.id)
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to create reconciliation' })
  }
}

function openWorkspace(id) {
  activeReconId.value = id
  showWorkspace.value = true
}

function onWorkspaceClosed() {
  activeReconId.value = null
  loadData()
}

async function approveRecon(id) {
  $q.dialog({
    title: 'Approve Reconciliation',
    message: 'Are you sure you want to approve this bank reconciliation?',
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      await reconStore.approveReconciliation(id)
      $q.notify({ type: 'positive', message: 'Reconciliation approved!' })
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message || 'Approval failed' })
    }
  })
}

function confirmDelete(row) {
  $q.dialog({
    title: 'Delete Reconciliation',
    message: `Are you sure you want to delete the draft reconciliation for ${row.bank_account?.bank_name} (${row.reconciliation_month})? This will also remove its lines.`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      await reconStore.deleteReconciliation(row.id)
      $q.notify({ type: 'positive', message: 'Reconciliation deleted' })
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message || 'Failed to delete' })
    }
  })
}

onMounted(async () => {
  await accountStore.fetchAccounts()
  await loadData()
})
</script>
