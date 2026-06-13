// ═══════════════════════════════════════════════════════════════════
// Device Service — CRUD + heartbeat for device management
// Seven Waves ERP — Step 06 Device & Platform Expansion
// ═══════════════════════════════════════════════════════════════════

import { api } from 'src/core/api/ApiClient'

const MODULE = 'devices'

// ─── DEVICES CRUD ───────────────────────────────────────────────────
export async function fetchDevices(branchId) {
  return api.query(
    (c) => c.from('devices').select('*, device_printers(*)').eq('branch_id', branchId).order('device_name'),
    { module: MODULE, action: 'fetchDevices' }
  )
}

export async function fetchDeviceById(id) {
  return api.query(
    (c) => c.from('devices').select('*, device_printers(*)').eq('id', id).single(),
    { module: MODULE, action: 'fetchDeviceById' }
  )
}

export async function createDevice(device) {
  return api.query(
    (c) => c.from('devices').insert(device).select().single(),
    { module: MODULE, action: 'createDevice', retries: 0 }
  )
}

export async function updateDevice(id, updates) {
  return api.query(
    (c) => c.from('devices').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single(),
    { module: MODULE, action: 'updateDevice', retries: 0 }
  )
}

export async function deleteDevice(id) {
  return api.query(
    (c) => c.from('devices').delete().eq('id', id),
    { module: MODULE, action: 'deleteDevice', retries: 0 }
  )
}

// ─── HEARTBEAT ──────────────────────────────────────────────────────
export async function sendHeartbeat(deviceId, status = 'online') {
  return api.rpc('device_heartbeat', { p_device_id: deviceId, p_status: status }, {
    module: MODULE, action: 'heartbeat', silent: true
  })
}

// ─── DEVICE ALERTS ──────────────────────────────────────────────────
export async function fetchDeviceAlerts(branchId, resolvedFilter = false) {
  return api.query(
    (c) => c.from('device_alerts')
      .select('*, devices(device_name, device_type)')
      .eq('branch_id', branchId)
      .eq('resolved', resolvedFilter)
      .order('created_at', { ascending: false })
      .limit(100),
    { module: MODULE, action: 'fetchAlerts' }
  )
}

export async function createDeviceAlert(alert) {
  return api.query(
    (c) => c.from('device_alerts').insert(alert).select().single(),
    { module: MODULE, action: 'createAlert', retries: 0 }
  )
}

export async function resolveDeviceAlert(alertId, userId) {
  return api.rpc('resolve_device_alert', { p_alert_id: alertId, p_user_id: userId }, {
    module: MODULE, action: 'resolveAlert'
  })
}
