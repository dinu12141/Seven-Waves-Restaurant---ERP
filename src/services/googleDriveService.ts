/**
 * googleDriveService.ts
 * =====================
 * Enterprise Google Drive Cloud Backup & Offsite Synchronization (ERPNext Standard).
 * 
 * Supports:
 *  1. Direct Google Drive REST API v3 Multipart Uploads (OAuth2 / Access Token)
 *  2. Google Apps Script / Webhook Relay (Zero-Expiry Automation)
 *  3. Target Google Drive Folder Mapping
 *  4. Health Test & Folder Connection Ping
 *  5. Backup Retention & Cloud Sync Audit
 */

import { supabase } from '../boot/supabase'

export interface GoogleDriveConfig {
  is_enabled: boolean
  auth_type: 'oauth_token' | 'webhook_relay'
  access_token: string
  folder_id: string
  folder_name: string
  webhook_relay_url: string
  auto_upload_daily: boolean
  retention_count: number
}

const DEFAULT_DRIVE_CONFIG: GoogleDriveConfig = {
  is_enabled: false,
  auth_type: 'oauth_token',
  access_token: '',
  folder_id: '',
  folder_name: 'Seven Waves ERP Backups',
  webhook_relay_url: '',
  auto_upload_daily: true,
  retention_count: 14,
}

const DRIVE_STORAGE_KEY = 'sw_google_drive_backup_config'

/** Retrieve Google Drive settings */
export async function getGoogleDriveConfig(): Promise<GoogleDriveConfig> {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'google_drive_backup_config')
      .single()

    if (data && data.value) {
      return { ...DEFAULT_DRIVE_CONFIG, ...(typeof data.value === 'string' ? JSON.parse(data.value) : data.value) }
    }
  } catch {
    // Fallback to local storage
  }

  const local = localStorage.getItem(DRIVE_STORAGE_KEY)
  if (local) {
    try {
      return { ...DEFAULT_DRIVE_CONFIG, ...JSON.parse(local) }
    } catch {
      // ignore
    }
  }

  return { ...DEFAULT_DRIVE_CONFIG }
}

/** Save Google Drive settings */
export async function saveGoogleDriveConfig(config: GoogleDriveConfig): Promise<{ success: boolean; error?: string }> {
  try {
    localStorage.setItem(DRIVE_STORAGE_KEY, JSON.stringify(config))

    const { error } = await supabase
      .from('system_settings')
      .upsert({
        key: 'google_drive_backup_config',
        value: config,
        updated_at: new Date().toISOString(),
      })

    if (error && error.code !== 'PGRST116') {
      console.warn('[GoogleDriveService] System settings sync warning:', error)
    }

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to save Google Drive config' }
  }
}

/**
 * Upload a backup blob to Google Drive via REST API v3 Multipart Upload
 */
export async function uploadToGoogleDrive(payload: {
  blob: Blob
  filename: string
  mimeType?: string
}): Promise<{ success: boolean; fileId?: string; webViewLink?: string; error?: string }> {
  const config = await getGoogleDriveConfig()

  if (!config.is_enabled) {
    return { success: false, error: 'Google Drive integration is not enabled in settings.' }
  }

  // 1. Webhook Relay mode (Google Apps Script)
  if (config.auth_type === 'webhook_relay') {
    if (!config.webhook_relay_url) {
      return { success: false, error: 'Google Apps Script Webhook URL is missing.' }
    }

    try {
      const buffer = await payload.blob.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )

      const res = await fetch(config.webhook_relay_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: payload.filename,
          mimeType: payload.mimeType || 'application/json',
          folderId: config.folder_id || null,
          dataBase64: base64,
        }),
      })

      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`)

      return { success: true, fileId: json.fileId, webViewLink: json.url }
    } catch (err: any) {
      return { success: false, error: 'Webhook Relay Error: ' + err.message }
    }
  }

  // 2. Direct Google Drive REST API v3 Multipart Upload
  if (!config.access_token) {
    return {
      success: false,
      error: 'Google Drive Access Token is missing. Enter OAuth token or Access Token in Settings.',
    }
  }

  try {
    const metadata: Record<string, any> = {
      name: payload.filename,
      mimeType: payload.mimeType || (payload.filename.endsWith('.sql') ? 'application/sql' : 'application/json'),
    }

    if (config.folder_id) {
      metadata.parents = [config.folder_id.trim()]
    }

    const form = new FormData()
    form.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json; charset=UTF-8' })
    )
    form.append('file', payload.blob, payload.filename)

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.access_token.trim()}`,
        },
        body: form,
      }
    )

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || `Google Drive API Error (${response.status})`)
    }

    return {
      success: true,
      fileId: result.id,
      webViewLink: result.webViewLink,
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/** Test Google Drive connection by creating a small ping file */
export async function testGoogleDriveConnection(): Promise<{ success: boolean; message: string; fileId?: string }> {
  const config = await getGoogleDriveConfig()

  if (!config.access_token && !config.webhook_relay_url) {
    return { success: false, message: 'Please provide a Google Access Token or Webhook Relay URL first.' }
  }

  const pingBlob = new Blob(
    [JSON.stringify({ ping: 'Seven Waves ERP', timestamp: new Date().toISOString() }, null, 2)],
    { type: 'application/json' }
  )

  const uploadResult = await uploadToGoogleDrive({
    blob: pingBlob,
    filename: `sw_drive_ping_${Date.now()}.json`,
  })

  if (!uploadResult.success) {
    return { success: false, message: uploadResult.error || 'Connection test failed.' }
  }

  return {
    success: true,
    message: 'Google Drive connected successfully! Test file uploaded.',
    fileId: uploadResult.fileId,
  }
}
