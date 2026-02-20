<template>
  <q-card class="bg-grey-9 text-white employee-card" flat bordered>
    <q-card-section class="text-center">
      <q-avatar size="80px" color="primary" text-color="white" class="q-mb-md shadow-2">
        {{ employee.first_name?.charAt(0) }}{{ employee.last_name?.charAt(0) }}
      </q-avatar>
      <div class="text-h6 text-weight-bold">{{ employee.full_name }}</div>
      <div class="text-subtitle2 text-grey-5">
        {{ employee.designations?.title || 'No Designation' }}
      </div>
      <q-badge
        :color="statusColor(employee.employment_status)"
        :label="employee.employment_status"
        class="q-mt-sm text-capitalize"
      />
    </q-card-section>

    <q-separator dark inset />

    <q-card-section>
      <div class="row q-col-gutter-sm text-caption">
        <div class="col-6">
          <div class="text-grey-5">Department</div>
          <div>{{ employee.departments?.name || '—' }}</div>
        </div>
        <div class="col-6">
          <div class="text-grey-5">Code</div>
          <div>{{ employee.employee_code }}</div>
        </div>
        <div class="col-6">
          <div class="text-grey-5">Joined</div>
          <div>{{ formatDate(employee.hire_date) }}</div>
        </div>
        <div class="col-6">
          <div class="text-grey-5">Type</div>
          <div class="text-capitalize">{{ employee.employment_type?.replace('_', ' ') }}</div>
        </div>
      </div>
    </q-card-section>

    <q-separator dark />

    <q-card-actions align="right">
      <q-btn flat round icon="phone" color="green" type="a" :href="`tel:${employee.phone}`">
        <q-tooltip>Call</q-tooltip>
      </q-btn>
      <q-btn flat round icon="email" color="blue" type="a" :href="`mailto:${employee.email}`">
        <q-tooltip>Email</q-tooltip>
      </q-btn>
      <q-space />
      <q-btn flat round icon="edit" color="amber" @click="$emit('edit', employee)">
        <q-tooltip>Edit</q-tooltip>
      </q-btn>
      <q-btn flat round icon="visibility" color="primary" @click="$emit('view', employee)">
        <q-tooltip>View Details</q-tooltip>
      </q-btn>
    </q-card-actions>
  </q-card>
</template>

<script setup>
defineProps({
  employee: {
    type: Object,
    required: true,
  },
})

defineEmits(['edit', 'view'])

function statusColor(status) {
  const map = { active: 'green', inactive: 'grey', suspended: 'orange', terminated: 'red' }
  return map[status] || 'grey'
}

function formatDate(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString()
}
</script>

<style scoped>
.employee-card {
  transition: transform 0.2s;
  height: 100%;
}
.employee-card:hover {
  transform: translateY(-4px);
  border-color: var(--q-primary);
}
</style>
