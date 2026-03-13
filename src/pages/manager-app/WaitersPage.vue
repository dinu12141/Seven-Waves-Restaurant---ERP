<template>
  <q-page class="mgr-waiters-page" padding>
    <div class="row items-center q-mb-md">
      <q-icon name="groups" size="24px" color="cyan-4" class="q-mr-sm" />
      <div class="text-h6 text-white text-weight-bold">Waiters</div>
      <q-space />
      <q-btn flat round icon="refresh" color="grey-5" :loading="store.loading" @click="store.loadOnShiftWaiters()" />
    </div>

    <!-- Search -->
    <q-input
      v-model="search"
      dark filled dense
      placeholder="Search waiters..."
      class="q-mb-md"
      style="border-radius:10px"
    >
      <template #prepend><q-icon name="search" color="grey-6" /></template>
      <template #append v-if="search"><q-icon name="clear" class="cursor-pointer" @click="search=''" /></template>
    </q-input>

    <!-- Waiter List -->
    <div v-if="store.loading" class="column items-center q-pa-lg">
      <q-spinner-orbit size="32px" color="cyan" />
    </div>
    <div v-else-if="filtered.length === 0" class="text-grey-6 text-center q-pa-lg text-caption">
      No waiters found.
    </div>
    <div v-else>
      <div
        v-for="w in filtered"
        :key="w.id"
        class="waiter-row q-mb-sm row items-center"
        @click="$router.push(`/manager-app/waiters/${w.id}`)"
      >
        <q-avatar size="40px" class="waiter-avatar q-mr-md text-weight-bold text-white">
          {{ initials(w.display_name || w.employee_name) }}
        </q-avatar>
        <div class="col">
          <div class="text-white text-weight-bold" style="font-size:0.9rem">{{ w.display_name || w.employee_name }}</div>
          <div class="text-caption text-grey-5">{{ w.waiter_code }} · {{ w.active_orders }} active · {{ w.served_count }} served</div>
        </div>
        <q-chip dense color="amber-9" text-color="dark" icon="stars" size="sm">{{ w.current_points }}</q-chip>
        <q-icon name="chevron_right" color="grey-7" class="q-ml-sm" />
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useManagerAppStore } from 'src/stores/managerAppStore'

const store = useManagerAppStore()
const search = ref('')

const filtered = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return store.onShiftWaiters
  return store.onShiftWaiters.filter(w =>
    (w.display_name || '').toLowerCase().includes(q) ||
    (w.employee_name || '').toLowerCase().includes(q) ||
    (w.waiter_code || '').toLowerCase().includes(q)
  )
})

function initials(name) { return name ? name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') : '?' }
</script>

<style lang="scss" scoped>
.mgr-waiters-page { background: #090c14; min-height: 100vh; }
.waiter-row {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px; padding: 12px 14px; cursor: pointer; transition: border-color 0.15s;
  &:active { border-color: rgba(34,211,238,0.3); }
}
.waiter-avatar { background: linear-gradient(135deg, #06b6d4, #8b5cf6) !important; font-size: 13px !important; }
</style>
