<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="hr"
      title="HR & Payroll"
      breadcrumbs="Human Resources"
      :roleBadge="isHR ? 'HR Admin' : isManager ? 'Manager' : 'Employee'"
      showSearch
      showBranchSelector
    />

    <!-- Navigation Tabs -->
    <q-card class="erp-form-card q-mt-md" flat>
      <q-tabs
        v-model="currentTab"
        dense
        class="text-grey erp-module-tabs"
        active-color="primary"
        indicator-color="primary"
        align="left"
        narrow-indicator
        no-caps
      >
        <q-tab
          v-for="t in visibleTabs"
          :key="t.name"
          :name="t.name"
          :label="t.label"
          :icon="t.icon"
          @click="navigateTab(t)"
        />
      </q-tabs>
    </q-card>

    <!-- Content Area -->
    <div class="q-mt-md">
      <router-view />
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from 'stores/auth'
import ERPToolbar from 'components/erp/ERPToolbar.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const isHR = computed(() => authStore.hasAnyRole(['admin', 'hr']))
const isManager = computed(() => authStore.hasRole('manager'))

const allTabs = [
  {
    name: 'employees',
    label: 'Employees',
    icon: 'people',
    path: '/hr/employees',
    roles: ['admin', 'hr'],
  },
  {
    name: 'salary-config',
    label: 'Salary Config',
    icon: 'tune',
    path: '/hr/salary-config',
    roles: ['admin', 'hr'],
  },
  {
    name: 'attendance',
    label: 'Attendance',
    icon: 'fingerprint',
    path: '/hr/attendance',
    roles: ['admin', 'hr', 'manager'],
  },
  {
    name: 'payroll',
    label: 'Payroll',
    icon: 'payments',
    path: '/hr/payroll',
    roles: ['admin', 'hr'],
  },
  {
    name: 'commission',
    label: 'Commission',
    icon: 'monetization_on',
    path: '/hr/commission',
    roles: ['admin', 'hr'],
  },
  {
    name: 'audit',
    label: 'Salary Audit',
    icon: 'fact_check',
    path: '/hr/audit',
    roles: ['admin', 'hr'],
  },
  {
    name: 'performance',
    label: 'Performance',
    icon: 'trending_up',
    path: '/hr/performance',
    roles: ['admin', 'hr', 'manager'],
  },
  {
    name: 'resignation',
    label: 'Resignation',
    icon: 'exit_to_app',
    path: '/hr/resignation',
    roles: ['admin', 'hr'],
  },
  {
    name: 'shifts',
    label: 'Shifts',
    icon: 'manage_history',
    path: '/hr/shifts',
    roles: ['admin', 'hr', 'manager'],
  },
]

const visibleTabs = computed(() => allTabs.filter((t) => t.roles.some((r) => authStore.hasRole(r))))

const currentTab = ref('')

function navigateTab(tab) {
  router.push(tab.path)
}

function syncTab() {
  const path = route.path
  const found = allTabs.find((t) => path.startsWith(t.path))
  currentTab.value = found?.name || 'employees'
}

watch(() => route.path, syncTab)
onMounted(syncTab)
</script>

<style scoped lang="scss">
.erp-module-tabs {
  background: var(--erp-bg-form-card, #111827);
  border-bottom: 1px solid var(--erp-input-border, #374151);

  :deep(.q-tab) {
    font-size: 13px;
    letter-spacing: 0.3px;
    min-height: 44px;
    text-transform: none;
  }
}
</style>
