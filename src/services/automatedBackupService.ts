// ═══════════════════════════════════════════════════════════════════════════════
// Automated Backup & Cold Disaster Recovery Pipeline
// Seven Waves Restaurant ERP — Enterprise Data Loss Prevention (DLP)
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { logSecurityEvent, SecurityCategory, SecuritySeverity } from 'src/core/security/securityLogger'

export interface BackupMetadata {
  id: string
  timestamp: string
  filename: string
  tableCount: number
  recordCount: number
  fileSizeBytes: number
  sha256Checksum: string
  status: 'success' | 'failed'
  error?: string
  tablesIncluded: string[]
}

const BACKUP_TABLES = [
  // ── Core Finance & Accounting ──
  'finance_accounts',
  'finance_ledgers',
  'finance_vouchers',
  'finance_voucher_lines',
  'finance_cashbook_entries',
  'finance_petty_cash_entries',
  'finance_cheques',
  'finance_bank_reconciliations',
  'finance_bank_reconciliation_lines',
  'journal_entries',
  'journal_lines',
  'finance_audit_logs',

  // ── POS & Orders ──
  'orders',
  'order_items',
  'kot_tickets',
  'kot_ticket_items',
  'pos_shifts',
  'tables',
  'dine_in_sessions',

  // ── Inventory & Procurement ──
  'inventory_items',
  'stock_ledger',
  'stock_on_hand',
  'inventory_documents',
  'inventory_document_lines',
  'recipes',
  'recipe_ingredients',
  'procurement_purchase_orders',
  'procurement_purchase_order_items',
  'suppliers',

  // ── Multi-Tenancy & HR ──
  'companies',
  'branches',
  'employees',
  'payroll_records',
]

const STORAGE_REGISTRY_KEY = 'sw_erp_automated_backup_registry'
const LAST_BACKUP_TIMESTAMP_KEY = 'sw_erp_last_auto_backup_ts'
const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 Hours

export const automatedBackupService = {
  /**
   * Calculate SHA-256 Checksum of a string buffer.
   */
  async computeSha256(content: string): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const msgBuffer = new TextEncoder().encode(content)
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    }
    // Fallback simple hash if subtle crypto is unavailable
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      hash = (hash << 5) - hash + content.charCodeAt(i)
      hash |= 0
    }
    return `hash-${Math.abs(hash).toString(16)}`
  },

  /**
   * Execute full cold database backup.
   */
  async runBackup(): Promise<{ metadata: BackupMetadata; content: string }> {
    const startTime = Date.now()
    const timestampStr = new Date().toISOString()
    const dateFormatted = timestampStr.slice(0, 10).replace(/-/g, '')
    const timeFormatted = timestampStr.slice(11, 19).replace(/:/g, '')
    const filename = `SevenWaves_ColdBackup_${dateFormatted}_${timeFormatted}.json`
    const backupId = crypto.randomUUID?.() || `bkp-${Date.now()}`

    const dump: Record<string, any[]> = {}
    let totalRecords = 0
    const successfulTables: string[] = []

    try {
      for (const table of BACKUP_TABLES) {
        try {
          const { data, error } = await supabase.from(table).select('*').limit(10000)
          if (!error && Array.isArray(data)) {
            dump[table] = data
            totalRecords += data.length
            successfulTables.push(table)
          } else {
            dump[table] = []
          }
        } catch (tblErr) {
          console.warn(`[AutoBackup] Could not backup table ${table}:`, tblErr)
          dump[table] = []
        }
      }

      const backupPayload = {
        meta: {
          id: backupId,
          version: '2.0.0',
          engine: 'Seven Waves Restaurant ERP Disaster Recovery',
          timestamp: timestampStr,
          tableCount: successfulTables.length,
          recordCount: totalRecords,
        },
        data: dump,
      }

      const jsonString = JSON.stringify(backupPayload, null, 2)
      const fileSizeBytes = new Blob([jsonString]).size
      const sha256Checksum = await this.computeSha256(jsonString)

      const metadata: BackupMetadata = {
        id: backupId,
        timestamp: timestampStr,
        filename,
        tableCount: successfulTables.length,
        recordCount: totalRecords,
        fileSizeBytes,
        sha256Checksum,
        status: 'success',
        tablesIncluded: successfulTables,
      }

      // Record in local registry
      this.recordInRegistry(metadata)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_BACKUP_TIMESTAMP_KEY, String(Date.now()))
      }

      // Log security audit event
      logSecurityEvent({
        category: SecurityCategory.DATA_TAMPERING,
        severity: SecuritySeverity.INFO,
        message: `Automated cold database backup completed: ${filename}`,
        metadata: {
          tableCount: metadata.tableCount,
          recordCount: metadata.recordCount,
          fileSizeBytes: metadata.fileSizeBytes,
          sha256: metadata.sha256Checksum,
          durationMs: Date.now() - startTime,
        },
      })

      return { metadata, content: jsonString }
    } catch (err: any) {
      const failedMeta: BackupMetadata = {
        id: backupId,
        timestamp: timestampStr,
        filename,
        tableCount: successfulTables.length,
        recordCount: totalRecords,
        fileSizeBytes: 0,
        sha256Checksum: '',
        status: 'failed',
        error: err.message || 'Unknown backup error',
        tablesIncluded: successfulTables,
      }
      this.recordInRegistry(failedMeta)

      logSecurityEvent({
        category: SecurityCategory.DATA_TAMPERING,
        severity: SecuritySeverity.CRITICAL,
        message: `Automated database backup FAILED: ${err.message}`,
        metadata: { error: err.message },
      })

      throw err
    }
  },

  /**
   * Get backup history registry.
   */
  getHistory(): BackupMetadata[] {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_REGISTRY_KEY) : null
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  },

  /**
   * Save a backup metadata record in the registry.
   */
  recordInRegistry(meta: BackupMetadata): void {
    try {
      const history = this.getHistory()
      history.unshift(meta)
      // Retain last 30 backups
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_REGISTRY_KEY, JSON.stringify(history.slice(0, 30)))
      }
    } catch (e) {
      console.warn('[AutoBackup] Could not record history:', e)
    }
  },

  /**
   * Check if an automated backup is due (runs every 24h).
   */
  isBackupDue(): boolean {
    try {
      const last = typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_BACKUP_TIMESTAMP_KEY) : null
      if (!last) return true
      const lastTs = parseInt(last, 10)
      if (isNaN(lastTs)) return true
      return Date.now() - lastTs > AUTO_BACKUP_INTERVAL_MS
    } catch {
      return true
    }
  },

  /**
   * Trigger download of a backup file in browser.
   */
  downloadBackup(filename: string, content: string): void {
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },

  /**
   * Verify integrity of a backup file by recalculating its SHA-256 checksum.
   */
  async verifyIntegrity(content: string, expectedChecksum: string): Promise<boolean> {
    const actual = await this.computeSha256(content)
    return actual === expectedChecksum
  },
}
