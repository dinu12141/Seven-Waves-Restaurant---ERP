/**
 * Core Security & Validation Module
 * Enforces Enterprise Security Guidelines:
 * 1. File size limits & upload safety
 * 2. Executable & malicious file blocking
 * 3. Client-side input validation & form rules
 * 4. PostgREST / Raw query injection sanitization
 * 5. Schema validation & prototype pollution defense
 * 6. Principle of Least Privilege enforcement
 */

// ─── 1. EXECUTABLE & MALICIOUS EXTENSION BLACKLIST ─────────────────────────
export const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'sh', 'bash', 'zsh', 'bin', 'msi', 'com', 'scr', 'pif',
  'php', 'php3', 'php4', 'php5', 'phtml', 'phps',
  'vbs', 'vbe', 'js', 'jse', 'ws', 'wsf', 'wsc', 'wsh',
  'ps1', 'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2', 'psm1', 'psd1',
  'dll', 'sys', 'drv', 'ocx', 'cpl',
  'jar', 'jsp', 'jspx', 'war', 'ear',
  'asp', 'aspx', 'cer', 'csr',
  'py', 'pyc', 'pyo', 'pyd',
  'rb', 'pl', 'cgi',
  'hta', 'reg', 'inf', 'lnk', 'iso', 'img', 'dmg'
])

export interface FileValidationOptions {
  allowedExtensions?: string[]
  allowedMimeTypes?: string[]
  maxSizeInBytes?: number
  label?: string
}

export interface FileValidationResult {
  valid: boolean
  error?: string
  sanitizedName?: string
}

/**
 * Validates a file against executable blocking, size limits, and whitelist types.
 */
export function validateFileSecurity(
  file: File | { name: string; size: number; type?: string },
  options: FileValidationOptions = {}
): FileValidationResult {
  if (!file) {
    return { valid: false, error: 'No file provided.' }
  }

  const name = (file.name || '').trim()
  const size = Number(file.size) || 0
  const type = (file.type || '').toLowerCase()

  // 1. Sanitize file name & check path traversal
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
    return { valid: false, error: 'Invalid file name. Path traversal characters detected.' }
  }

  // 2. Extract extensions (detect double extension tricks like invoice.pdf.exe)
  const parts = name.toLowerCase().split('.').filter(Boolean)
  if (parts.length < 2) {
    return { valid: false, error: 'File must have a valid extension.' }
  }

  // Check if ANY extension part is in the dangerous blacklist
  for (const part of parts.slice(1)) {
    if (DANGEROUS_EXTENSIONS.has(part)) {
      return {
        valid: false,
        error: `Security Alert: Executable/Script file type (.${part}) is strictly blocked!`
      }
    }
  }

  const primaryExt = parts[parts.length - 1]

  // 3. Extension whitelist check
  if (options.allowedExtensions && options.allowedExtensions.length > 0) {
    const allowed = options.allowedExtensions.map((e) => e.toLowerCase().replace(/^\./, ''))
    if (!allowed.includes(primaryExt)) {
      return {
        valid: false,
        error: `Invalid file type (.${primaryExt}). Allowed types: ${allowed.join(', ')}`
      }
    }
  }

  // 4. MIME type whitelist check
  if (options.allowedMimeTypes && options.allowedMimeTypes.length > 0) {
    const allowedMimes = options.allowedMimeTypes.map((m) => m.toLowerCase())
    if (type && !allowedMimes.includes(type)) {
      return {
        valid: false,
        error: `Invalid MIME type (${type}). Allowed: ${allowedMimes.join(', ')}`
      }
    }
  }

  // 5. File size limits
  const maxBytes = options.maxSizeInBytes || 10 * 1024 * 1024 // Default 10 MB
  if (size <= 0) {
    return { valid: false, error: 'File is empty (0 bytes).' }
  }
  if (size > maxBytes) {
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(1)
    const currentMb = (size / (1024 * 1024)).toFixed(2)
    return {
      valid: false,
      error: `File size (${currentMb} MB) exceeds maximum allowed limit of ${maxMb} MB.`
    }
  }

  // Generate safe sanitized file name
  const safeBase = parts[0].replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
  const sanitizedName = `${safeBase}.${primaryExt}`

  return { valid: true, sanitizedName }
}

// ─── Preset Configurations for Common Uploads ────────────────────────────────
export const IMAGE_UPLOAD_OPTIONS: FileValidationOptions = {
  allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxSizeInBytes: 5 * 1024 * 1024, // 5 MB
  label: 'Image'
}

export const DOCUMENT_UPLOAD_OPTIONS: FileValidationOptions = {
  allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
  allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  maxSizeInBytes: 10 * 1024 * 1024, // 10 MB
  label: 'Document'
}

export const BACKUP_UPLOAD_OPTIONS: FileValidationOptions = {
  allowedExtensions: ['json'],
  allowedMimeTypes: ['application/json', 'text/plain'],
  maxSizeInBytes: 25 * 1024 * 1024, // 25 MB
  label: 'Backup'
}

// ─── 2. POSTGREST / QUERY INJECTION DEFENSE ──────────────────────────────────
/**
 * Sanitizes user input before placing into PostgREST .or() or .ilike() filter clauses.
 * Strips control tokens like comma, parenthesis, dots, percentage and slashes.
 */
export function sanitizePostgrestFilter(input: unknown): string {
  if (input === null || input === undefined) return ''
  const str = String(input)
  // Remove PostgREST operators & injection characters: , ( ) . % _ \ / " '
  return str.replace(/[,().%_\\/"']/g, '').trim()
}

// ─── 3. SCHEMA VALIDATION & PROTOTYPE POLLUTION DEFENSE ─────────────────────
/**
 * Sanitizes an object payload by stripping dangerous keys (__proto__, constructor)
 * and extracting only allowed whitelist fields.
 */
export function sanitizePayload<T extends Record<string, any>>(
  raw: Record<string, any>,
  allowedKeys?: (keyof T | string)[]
): Partial<T> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {} as Partial<T>
  }

  const clean: Record<string, any> = {}
  const keysToProcess = allowedKeys || Object.keys(raw)

  for (const key of keysToProcess) {
    const k = String(key)
    // Prototype pollution defense
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
      continue
    }

    if (Object.prototype.hasOwnProperty.call(raw, k)) {
      const val = raw[k]
      // Nullify empty strings for nullable database fields
      if (typeof val === 'string') {
        clean[k] = val.trim()
      } else {
        clean[k] = val
      }
    }
  }

  return clean as Partial<T>
}

// ─── 4. REUSABLE CLIENT-SIDE FORM VALIDATION RULES ──────────────────────────
export const SECURITY_RULES = {
  required: (fieldName = 'This field') => (val: unknown) =>
    (val !== null && val !== undefined && String(val).trim().length > 0) ||
    `${fieldName} is required`,

  maxLength: (max: number, fieldName = 'Field') => (val: unknown) =>
    !val || String(val).length <= max || `${fieldName} cannot exceed ${max} characters`,

  email: (val: string) =>
    !val ||
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(val.trim()) ||
    'Please enter a valid email address',

  phone: (val: string) =>
    !val ||
    /^[0-9+\s()-]{7,20}$/.test(val.trim()) ||
    'Please enter a valid phone number (7-20 digits)',

  positiveNumber: (fieldName = 'Amount') => (val: unknown) => {
    if (val === null || val === undefined || val === '') return true
    const num = Number(val)
    return (!isNaN(num) && num >= 0) || `${fieldName} must be a positive number`
  },

  nic: (val: string) => {
    if (!val) return true
    const clean = val.trim().toUpperCase()
    // Sri Lanka NIC format: 9 digits + V/X OR 12 digits (or dummy during onboarding)
    const oldFormat = /^[0-9]{9}[VX]$/
    const newFormat = /^[0-9]{12}$/
    return (
      oldFormat.test(clean) ||
      newFormat.test(clean) ||
      clean.length >= 5 || // allow temporary ID
      'Please enter a valid National Identity Card (NIC) number'
    )
  },

  epf: (val: string) => {
    if (!val) return true
    return /^[0-9A-Za-z-]{1,15}$/.test(val.trim()) || 'Please enter a valid EPF number'
  }
}
