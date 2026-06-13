// ═══════════════════════════════════════════════════════════════════
// INPUT SANITIZER — Centralized XSS/Injection Protection
// Seven Waves ERP — Step 07 Production Hardening
// ═══════════════════════════════════════════════════════════════════

/**
 * HTML entity map for encoding dangerous characters.
 */
const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#96;',
}

/**
 * Patterns that indicate potential XSS or injection attacks.
 */
const DANGEROUS_PATTERNS = [
  /<script[\s>]/i,
  /javascript:/i,
  /on\w+\s*=/i,            // onclick=, onerror=, etc.
  /data:\s*text\/html/i,
  /vbscript:/i,
  /expression\s*\(/i,
  /url\s*\(/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /<form/i,
  /document\.\s*(cookie|domain|write)/i,
  /window\.\s*(location|open)/i,
  /eval\s*\(/i,
  /Function\s*\(/i,
  /setTimeout\s*\(\s*['"`]/i,
  /setInterval\s*\(\s*['"`]/i,
]

/**
 * SQL injection patterns for additional defense-in-depth.
 * (Primary protection is via Supabase RLS + parameterized queries.)
 */
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|UNION)\b.*\b(FROM|INTO|SET|TABLE|WHERE|ALL)\b)/i,
  /(--)|(;).*(\b(DROP|ALTER|DELETE|TRUNCATE)\b)/i,
  /'.*(\b(OR|AND)\b).*'.*=/i,
  /\b(SLEEP|BENCHMARK)\s*\(/i,
  /\bWAITFOR\s+(DELAY|TIME)\b/i,
  /\bEXEC(UTE)?\s+\w/i,
  /;\s*(\bEXEC|\bDROP|\bINSERT|\bUPDATE|\bDELETE)\b/i,
]

/**
 * Prompt injection patterns for AI layer protection.
 */
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  /you\s+are\s+now\s+(a|an|in)\s+(new|different|jailbreak)/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /bypass\s+(safety|filter|content|restriction)/i,
  /pretend\s+(you\s+are|to\s+be|you're)/i,
  /reveal\s+(your|the|system)\s+.{0,20}(prompt|instructions|rules)/i,
  /act\s+as\s+(if|though)\s+you\s+(have\s+no|don't\s+have)/i,
  /execute\s+(this\s+)?(sql|code|command|query)/i,
  /transfer|wire\s+\$|send\s+money|approve\s+payment/i,
]

// ─── Core Functions ─────────────────────────────────────────────

/**
 * Escape HTML entities in a string.
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return str
  return str.replace(/[&<>"'`/]/g, (char) => HTML_ENTITIES[char] || char)
}

/**
 * Strip all HTML tags from a string.
 */
export function stripHtml(str) {
  if (typeof str !== 'string') return str
  return str.replace(/<[^>]*>/g, '').trim()
}

/**
 * Check if a string contains dangerous XSS patterns.
 * Returns { safe: boolean, threats: string[] }
 */
export function detectXSS(input) {
  if (typeof input !== 'string') return { safe: true, threats: [] }

  const threats = []
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(input)) {
      threats.push(pattern.source)
    }
  }
  return { safe: threats.length === 0, threats }
}

/**
 * Check for SQL injection patterns (defense-in-depth).
 */
export function detectSQLInjection(input) {
  if (typeof input !== 'string') return { safe: true, threats: [] }

  const threats = []
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      threats.push(pattern.source)
    }
  }
  return { safe: threats.length === 0, threats }
}

/**
 * Check for prompt injection attempts.
 */
export function detectPromptInjection(input) {
  if (typeof input !== 'string') return { safe: true, threats: [] }

  const threats = []
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      threats.push(pattern.source)
    }
  }
  return { safe: threats.length === 0, threats }
}

/**
 * Sanitize a single value: escape HTML, enforce max length, trim.
 */
export function sanitizeValue(value, maxLength = 10000) {
  if (value === null || value === undefined) return value
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value !== 'string') return String(value)

  let sanitized = value.trim()

  // Enforce length limit
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength)
  }

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '')

  // Escape HTML entities
  sanitized = escapeHtml(sanitized)

  return sanitized
}

/**
 * Deeply sanitize an object: escape all string values.
 * Preserves object structure. Returns a new sanitized copy.
 */
export function sanitizePayload(payload, options = {}) {
  const { maxDepth = 10, maxStringLength = 10000, currentDepth = 0 } = options

  if (currentDepth >= maxDepth) return '[MAX_DEPTH]'
  if (payload === null || payload === undefined) return payload
  if (typeof payload === 'number' || typeof payload === 'boolean') return payload
  if (typeof payload === 'string') return sanitizeValue(payload, maxStringLength)

  if (Array.isArray(payload)) {
    if (payload.length > 1000) {
      return payload.slice(0, 1000).map(item =>
        sanitizePayload(item, { ...options, currentDepth: currentDepth + 1 })
      )
    }
    return payload.map(item =>
      sanitizePayload(item, { ...options, currentDepth: currentDepth + 1 })
    )
  }

  if (typeof payload === 'object') {
    const keys = Object.keys(payload)
    if (keys.length > 200) {
      // Reject objects with suspiciously many keys
      return { _error: 'Too many keys', _count: keys.length }
    }

    const sanitized = {}
    for (const key of keys) {
      const safeKey = sanitizeValue(key, 256)
      sanitized[safeKey] = sanitizePayload(payload[key], {
        ...options,
        currentDepth: currentDepth + 1,
      })
    }
    return sanitized
  }

  return payload
}

/**
 * Validate payload size (prevent oversized request bodies).
 */
export function validatePayloadSize(payload, maxBytes = 1_000_000) {
  try {
    const json = JSON.stringify(payload)
    const size = new Blob([json]).size
    return { valid: size <= maxBytes, size, maxBytes }
  } catch {
    return { valid: false, size: 0, maxBytes, error: 'Failed to serialize payload' }
  }
}

/**
 * Sanitize a string for use as an AI prompt (remove injection attacks).
 */
export function sanitizePrompt(input, maxLength = 5000) {
  if (typeof input !== 'string') return ''

  let sanitized = input.trim()

  // Enforce length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength)
  }

  // Remove null bytes and control characters (except newlines/tabs)
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  // Remove markdown-style code execution hints
  sanitized = sanitized.replace(/```(bash|sh|sql|python|js|javascript)/gi, '```')

  return sanitized
}

/**
 * Full security scan of a request payload.
 * Returns { safe: boolean, issues: string[] }
 */
export function securityScan(payload) {
  const issues = []

  const scan = (value, path = '') => {
    if (typeof value === 'string') {
      const xss = detectXSS(value)
      if (!xss.safe) issues.push(`XSS detected at ${path}: ${xss.threats[0]}`)

      const sqli = detectSQLInjection(value)
      if (!sqli.safe) issues.push(`SQL injection at ${path}: ${sqli.threats[0]}`)
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => scan(item, `${path}[${i}]`))
    } else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([k, v]) => scan(v, `${path}.${k}`))
    }
  }

  scan(payload, 'root')

  const sizeCheck = validatePayloadSize(payload)
  if (!sizeCheck.valid) issues.push(`Payload too large: ${sizeCheck.size} bytes`)

  return { safe: issues.length === 0, issues }
}
