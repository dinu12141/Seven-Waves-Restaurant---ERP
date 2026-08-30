<template>
  <q-page class="q-pa-md">
    <PageHeader title="Admin Console" subtitle="System configuration and management" />

    <div class="row q-col-gutter-md">
      <div
        v-for="(module, index) in filteredModules"
        :key="index"
        class="col-12 col-sm-6 col-md-4 col-lg-3"
      >
        <q-card
          class="bg-grey-9 text-white full-height cursor-pointer setting-card"
          flat
          bordered
          @click="$router.push(module.to)"
        >
          <q-card-section class="text-center q-py-xl">
            <q-avatar
              size="80px"
              font-size="40px"
              :color="module.color"
              text-color="white"
              :icon="module.icon"
              class="q-mb-md shadow-2"
            />
            <div class="text-h6">{{ module.title }}</div>
            <div class="text-caption text-grey-5 q-mt-sm">{{ module.description }}</div>
          </q-card-section>

          <q-separator color="grey-8" />

          <q-card-actions align="center">
            <q-btn flat color="primary" label="Open Settings" :to="module.to" />
          </q-card-actions>
        </q-card>
      </div>

      <div v-if="filteredModules.length === 0" class="col-12 text-center q-pa-xl">
        <q-icon name="lock" size="100px" color="grey-8" />
        <div class="text-h5 text-grey-7 q-mt-md">Access Restricted</div>
        <p class="text-grey-6">You don't have permission to manage any system settings.</p>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import PageHeader from 'components/common/PageHeader.vue'
import { useAuthStore } from 'src/stores/auth'

const authStore = useAuthStore()

const modules = ref([
  {
    title: 'User Management',
    description: 'Manage staffs, waiters, and admin accounts.',
    icon: 'group',
    color: 'blue',
    to: '/admin/users',
    permission: 'admin:users',
  },
  {
    title: 'Role & Permissions',
    description: 'Configure access levels and security policies.',
    icon: 'security',
    color: 'indigo',
    to: '/admin/roles',
    permission: 'admin:roles',
  },
  {
    title: 'Branch Settings',
    description: 'Manage multiple outlets and locations.',
    icon: 'store',
    color: 'brown',
    to: '/admin/branches',
    permission: 'admin:branches',
  },
  {
    title: 'Printer Management',
    description: 'Configure receipt and kitchen printers for each branch.',
    icon: 'print',
    color: 'teal',
    to: '/devices/printers',
    permission: 'admin:printers',
  },
  {
    title: 'Notification Gateways',
    description: 'Configure Meta WhatsApp, Twilio, and Resend Email APIs & automated triggers.',
    icon: 'campaign',
    color: 'positive',
    to: '/admin/settings',
    permission: 'admin:settings',
  },
  {
    title: 'System Settings',
    description: 'Global system configuration and module activation.',
    icon: 'settings',
    color: 'grey-8',
    to: '/admin/settings',
    permission: 'admin:settings',
  },
  {
    title: 'Customer Directory',
    description: 'View and manage all registered customers.',
    icon: 'people_alt',
    color: 'blue-grey',
    to: '/admin/customers',
    permission: 'admin:customers',
  },
  {
    title: 'Loyalty Program',
    description: 'Manage loyalty tiers, coins, and rewards.',
    icon: 'card_giftcard',
    color: 'amber-8',
    to: '/admin/loyalty',
    permission: 'admin:customers',
  },
  {
    title: 'System Backup',
    description: 'View backup status and download/trigger information.',
    icon: 'cloud_download',
    color: 'deep-purple',
    to: '/admin/backup',
    permission: 'admin:backup',
  },
])

const filteredModules = computed(() => {
  // Admin role gets everything
  if (authStore.isAdmin || authStore.permissions?.includes('admin:console')) {
    // If they have admin:console but not specific sub-permissions, we still check filtering
    // below unless they are a full "admin" role.
    if (authStore.isAdmin) return modules.value
  }

  return modules.value.filter((m) => {
    return authStore.permissions?.includes(m.permission)
  })
})
</script>

<style scoped>
.setting-card {
  transition: all 0.2s ease;
}
.setting-card:hover {
  transform: translateY(-4px);
  border-color: var(--q-primary);
}
</style>
