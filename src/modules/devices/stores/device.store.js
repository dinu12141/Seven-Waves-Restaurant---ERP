// ═══════════════════════════════════════════════════════════════════
// Device Store — Reactive state for device management
// Seven Waves ERP — Step 06 Device & Platform Expansion
// ═══════════════════════════════════════════════════════════════════

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  fetchDevices, createDevice, updateDevice, deleteDevice,
  fetchDeviceAlerts, resolveDeviceAlert, sendHeartbeat
} from '../services/device.service'

export const useDeviceStore = defineStore('devices', () => {
  // ─── State ────────────────────────────────────────────────────────
  const devices = ref([])
  const alerts = ref([])
  const loading = ref(false)
  const error = ref(null)

  // ─── Computed ─────────────────────────────────────────────────────
  const onlineDevices = computed(() => devices.value.filter(d => d.status === 'online'))
  const offlineDevices = computed(() => devices.value.filter(d => d.status !== 'online'))
  const printers = computed(() => devices.value.filter(d => d.device_type === 'printer'))
  const scanners = computed(() => devices.value.filter(d => d.device_type === 'scanner'))
  const biometricDevices = computed(() => devices.value.filter(d => d.device_type === 'biometric'))
  const kdsDisplays = computed(() => devices.value.filter(d => d.device_type === 'kds_display'))
  const criticalAlerts = computed(() => alerts.value.filter(a => a.severity === 'critical' && !a.resolved))
  const unresolvedAlerts = computed(() => alerts.value.filter(a => !a.resolved))

  // ─── Actions ──────────────────────────────────────────────────────
  async function loadDevices(branchId) {
    loading.value = true
    error.value = null
    try {
      const result = await fetchDevices(branchId)
      if (result.data) devices.value = result.data
      if (result.error) error.value = result.error
    } finally {
      loading.value = false
    }
  }

  async function addDevice(device) {
    const result = await createDevice(device)
    if (result.data) devices.value.push(result.data)
    return result
  }

  async function editDevice(id, updates) {
    const result = await updateDevice(id, updates)
    if (result.data) {
      const idx = devices.value.findIndex(d => d.id === id)
      if (idx !== -1) devices.value[idx] = result.data
    }
    return result
  }

  async function removeDevice(id) {
    const result = await deleteDevice(id)
    if (!result.error) {
      devices.value = devices.value.filter(d => d.id !== id)
    }
    return result
  }

  async function loadAlerts(branchId) {
    const result = await fetchDeviceAlerts(branchId)
    if (result.data) alerts.value = result.data
  }

  async function resolveAlert(alertId, userId) {
    const result = await resolveDeviceAlert(alertId, userId)
    if (!result.error) {
      const idx = alerts.value.findIndex(a => a.id === alertId)
      if (idx !== -1) {
        alerts.value[idx].resolved = true
        alerts.value[idx].resolved_by = userId
        alerts.value[idx].resolved_at = new Date().toISOString()
      }
    }
    return result
  }

  async function heartbeat(deviceId) {
    return sendHeartbeat(deviceId)
  }

  return {
    devices, alerts, loading, error,
    onlineDevices, offlineDevices, printers, scanners, biometricDevices, kdsDisplays,
    criticalAlerts, unresolvedAlerts,
    loadDevices, addDevice, editDevice, removeDevice,
    loadAlerts, resolveAlert, heartbeat,
  }
})
