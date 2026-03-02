<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="finance"
      title="Finance Dashboard"
      breadcrumbs="Accounting / Finance"
      showSearch
      showBranchSelector
      showExport
      primaryAction
      primaryActionLabel="Record Expense"
      @primary-action="() => {}"
    >
      <template #secondary-actions>
        <q-btn-dropdown
          class="erp-toolbar__dropdown-btn q-ml-sm"
          outline
          color="white"
          label="Reports"
          icon="assessment"
        >
          <q-list class="bg-dark text-white">
            <q-item clickable v-close-popup>
              <q-item-section>Daily Sales Report</q-item-section>
            </q-item>
            <q-item clickable v-close-popup>
              <q-item-section>Expense Report</q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>
      </template>
    </ERPToolbar>

    <q-tabs
      v-model="tab"
      dense
      class="text-grey q-mb-md"
      active-color="primary"
      indicator-color="primary"
      align="left"
      narrow-indicator
    >
      <q-tab name="dashboard" label="Dashboard" />
      <q-tab name="invoices" label="Invoices" />
      <q-tab name="payments" label="Payments" />
      <q-tab name="refunds" label="Refunds" />
    </q-tabs>

    <q-tab-panels v-model="tab" animated class="bg-transparent">
      <q-tab-panel name="dashboard" class="q-pa-none">
        <DashboardTab />
      </q-tab-panel>

      <q-tab-panel name="invoices" class="q-pa-none">
        <InvoicesTab />
      </q-tab-panel>

      <q-tab-panel name="payments" class="q-pa-none">
        <PaymentsTab />
      </q-tab-panel>

      <q-tab-panel name="refunds" class="q-pa-none">
        <RefundsTab />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup>
import { ref } from 'vue'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardTab from 'components/finance/DashboardTab.vue'
import InvoicesTab from 'components/finance/InvoicesTab.vue'
import PaymentsTab from 'components/finance/PaymentsTab.vue'
import RefundsTab from 'components/finance/RefundsTab.vue'

const tab = ref('dashboard')
</script>
