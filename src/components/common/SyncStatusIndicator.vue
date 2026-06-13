<template>
  <q-btn
    v-if="syncStore.hasPending || syncStore.hasFailed || !syncStore.isOnline"
    flat
    round
    dense
    :icon="syncStore.statusIcon"
    :color="syncStore.statusColor"
    @click="showDialog = true"
  >
    <q-badge v-if="syncStore.pendingCount > 0" floating color="orange" :label="syncStore.pendingCount" />
    <q-badge v-if="syncStore.failedCount > 0" floating color="red" :label="syncStore.failedCount" />

    <q-tooltip>
      {{ tooltipText }}
    </q-tooltip>
  </q-btn>

  <q-dialog v-model="showDialog" position="right" full-height>
    <q-card style="width: 400px; max-width: 100vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Sync Status</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <q-banner :class="syncStore.isOnline ? 'bg-positive text-white' : 'bg-warning text-white'" rounded>
          <template #avatar>
            <q-icon :name="syncStore.isOnline ? 'cloud_done' : 'cloud_off'" />
          </template>
          {{ syncStore.isOnline ? 'Online' : 'Offline' }}
        </q-banner>
      </q-card-section>

      <q-card-section v-if="syncStore.pendingCount > 0">
        <div class="text-subtitle2 q-mb-sm">⏳ Pending: {{ syncStore.pendingCount }}</div>
        <q-btn
          label="Sync Now"
          color="primary"
          outline
          dense
          :loading="syncStore.loading"
          @click="syncStore.syncNow()"
        />
      </q-card-section>

      <q-card-section v-if="syncStore.failedCount > 0">
        <div class="text-subtitle2 text-negative q-mb-sm">❌ Failed: {{ syncStore.failedCount }}</div>
        <q-list separator bordered>
          <q-item v-for="item in syncStore.failedItems" :key="item.id" dense>
            <q-item-section>
              <q-item-label>{{ item.module }}.{{ item.action }}</q-item-label>
              <q-item-label caption class="text-negative">{{ item.errorMessage }}</q-item-label>
              <q-item-label caption>Attempts: {{ item.attempts }}/{{ item.maxAttempts }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <div class="row q-gutter-xs">
                <q-btn flat dense icon="refresh" size="sm" color="primary" @click="syncStore.retryItem(item.id)">
                  <q-tooltip>Retry</q-tooltip>
                </q-btn>
                <q-btn flat dense icon="delete" size="sm" color="negative" @click="syncStore.discardItem(item.id)">
                  <q-tooltip>Discard</q-tooltip>
                </q-btn>
              </div>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>

      <q-card-section v-if="syncStore.lastSyncAt" class="text-caption text-grey-5">
        Last sync: {{ new Date(syncStore.lastSyncAt).toLocaleTimeString() }}
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useOfflineSyncStore } from 'src/stores/offlineSyncStore'

const syncStore = useOfflineSyncStore()
const showDialog = ref(false)

const tooltipText = computed(() => {
  if (!syncStore.isOnline) return 'Offline — changes queued'
  if (syncStore.failedCount > 0) return `${syncStore.failedCount} failed sync items`
  if (syncStore.pendingCount > 0) return `${syncStore.pendingCount} items pending sync`
  return 'All synced'
})

onMounted(() => {
  syncStore.initialize()
})
</script>
