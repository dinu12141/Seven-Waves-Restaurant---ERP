<template>
  <q-page class="q-pa-md">
    <PageHeader title="Admin Console" subtitle="System configuration and management" />

    <div class="row q-col-gutter-md">
      <div
        v-for="(module, index) in modules"
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
    </div>
  </q-page>
</template>

<script setup>
import { ref } from 'vue'
import PageHeader from 'components/common/PageHeader.vue'

const modules = ref([
  {
    title: 'User Management',
    description: 'Manage staffs, waiters, and admin accounts.',
    icon: 'group',
    color: 'blue',
    to: '/admin/users',
  },
  {
    title: 'Role & Permissions',
    description: 'Configure access levels and security policies.',
    icon: 'security',
    color: 'indigo',
    to: '/admin/roles',
  },
  {
    title: 'Branch Settings',
    description: 'Manage multiple outlets and locations.',
    icon: 'store',
    color: 'brown',
    to: '/admin/branches',
  },
  {
    title: 'Kitchen Setup',
    description: 'Configure kitchen stations and displays.',
    icon: 'kitchen',
    color: 'orange',
    to: '/admin/kitchens',
  },
  {
    title: 'Module Configuration',
    description: 'Enable or disable system modules (GRN, GIN, Auto Deduct, etc.)',
    icon: 'extension',
    color: 'deep-purple',
    to: '/admin/settings',
  },
  {
    title: 'System Settings',
    description: 'Global system configuration',
    icon: 'settings',
    color: 'grey-8',
    to: '/admin/settings',
  },
])
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
