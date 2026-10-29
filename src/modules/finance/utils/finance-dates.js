// ═══════════════════════════════════════════════════════════════════════════════
// Finance UI date + money helpers
//
// All finance filters work in Sri Lanka local time (Asia/Colombo, UTC+05:30,
// no DST) regardless of the browser's time zone. Never build date bounds with
// toISOString() (UTC — shifts the day before 05:30) or `${d}T00:00:00` without
// an offset (browser-local, wrong on a mis-configured terminal).
// ═══════════════════════════════════════════════════════════════════════════════

export const LK_TIME_ZONE = 'Asia/Colombo'
export const LK_OFFSET = '+05:30'
const LK_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

/** Default first month of the financial year (Sri Lanka year of assessment: April). */
export const DEFAULT_FY_START_MONTH = 4

const pad = (n) => String(n).padStart(2, '0')
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** True for a 'YYYY-MM-DD' string. */
export function isDateKey(v) {
  return typeof v === 'string' && DATE_RE.test(v)
}

/**
 * 'YYYY-MM-DD' of the given instant in Sri Lanka time.
 * @param {Date | string | number | null | undefined} [d]
 * @returns {string}
 */
export function lkDateKey(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  // Shift the instant by +05:30 and read the UTC fields → Colombo wall-clock date.
  const s = new Date(dt.getTime() + LK_OFFSET_MS)
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`
}

/**
 * Today in Sri Lanka as 'YYYY-MM-DD'.
 * @param {Date | string | number | null | undefined} [now]
 * @returns {string}
 */
export function todayLK(now = new Date()) {
  return lkDateKey(now)
}

function keyParts(key) {
  const [y, m, d] = key.split('-').map(Number)
  return { y, m, d }
}
function keyOf(y, m, d) {
  // Normalise overflow (month 0 / 13, day 0) through Date.UTC.
  const dt = new Date(Date.UTC(y, m - 1, d))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** Add whole days to a 'YYYY-MM-DD' key. */
export function addDays(key, days) {
  const { y, m, d } = keyParts(key)
  return keyOf(y, m, d + days)
}

/** First / last day of the month containing `key`. */
export function monthStart(key) {
  const { y, m } = keyParts(key)
  return keyOf(y, m, 1)
}
export function monthEnd(key) {
  const { y, m } = keyParts(key)
  return keyOf(y, m + 1, 0)
}

/** Financial-year bounds containing `key` (FY starts on day 1 of fyStartMonth). */
export function fiscalYearRange(key, fyStartMonth = DEFAULT_FY_START_MONTH) {
  const { y, m } = keyParts(key)
  const startYear = m >= fyStartMonth ? y : y - 1
  return {
    from: keyOf(startYear, fyStartMonth, 1),
    to: keyOf(startYear + 1, fyStartMonth, 0),
  }
}

/**
 * Inclusive instant bounds for a local-date range, with the explicit
 * Sri Lanka offset — safe for timestamptz columns (created_at, posted_at…).
 * Date-only columns (entry_date, doc_date) should compare the keys directly.
 */
export function lkDayBounds(dateFrom, dateTo) {
  return {
    start: isDateKey(dateFrom) ? `${dateFrom}T00:00:00${LK_OFFSET}` : null,
    end: isDateKey(dateTo) ? `${dateTo}T23:59:59.999${LK_OFFSET}` : null,
  }
}

/** Preset catalogue for FinanceFilterBar. */
export const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_fy', label: 'This FY' },
  { value: 'last_fy', label: 'Last FY' },
]

/** Resolve a preset to { from, to } date keys (Sri Lanka local). */
export function presetRange(preset, now = new Date(), fyStartMonth = DEFAULT_FY_START_MONTH) {
  const today = todayLK(now)
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const y = addDays(today, -1)
      return { from: y, to: y }
    }
    case 'last_30':
      return { from: addDays(today, -29), to: today }
    case 'this_month':
      return { from: monthStart(today), to: today }
    case 'last_month': {
      const prev = addDays(monthStart(today), -1)
      return { from: monthStart(prev), to: monthEnd(prev) }
    }
    case 'this_fy': {
      const fy = fiscalYearRange(today, fyStartMonth)
      return { from: fy.from, to: today }
    }
    case 'last_fy': {
      const cur = fiscalYearRange(today, fyStartMonth)
      return fiscalYearRange(addDays(cur.from, -1), fyStartMonth)
    }
    default:
      return null
  }
}

/** Which preset (if any) exactly matches a range — used to highlight the chip. */
export function matchPreset(from, to, now = new Date(), fyStartMonth = DEFAULT_FY_START_MONTH) {
  for (const p of DATE_PRESETS) {
    const r = presetRange(p.value, now, fyStartMonth)
    if (r && r.from === from && r.to === to) return p.value
  }
  return null
}

/** Normalise a user range: swaps reversed bounds, drops invalid keys. */
export function normalizeRange(from, to) {
  const f = isDateKey(from) ? from : null
  const t = isDateKey(to) ? to : null
  if (f && t && f > t) return { from: t, to: f }
  return { from: f, to: t }
}

/** Inclusive date-key filter for client-side rows. */
export function inDateRange(value, from, to) {
  const d = String(value || '').slice(0, 10)
  if (!d) return !from && !to
  return (!from || d >= from) && (!to || d <= to)
}

/** Money: 1234.5 → '1,234.50'; negatives in brackets when `brackets`. */
export function formatMoney(v, { brackets = false } = {}) {
  const n = Number(v || 0)
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (n < 0) return brackets ? `(${s})` : `-${s}`
  return s
}

/** Money with currency: 'LKR 1,234.50'. */
export function formatLKR(v, opts = {}) {
  const n = Number(v || 0)
  const body = formatMoney(n, opts)
  if (n < 0 && !opts.brackets) return `-LKR ${body.slice(1)}`
  return `LKR ${body}`
}

/** Display date: '2026-10-28' → '28 Oct 2026'. */
export function formatDateLK(v) {
  if (!v) return '-'
  const key = isDateKey(String(v)) ? String(v) : lkDateKey(new Date(v))
  if (!key) return '-'
  const { y, m, d } = keyParts(key)
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${pad(d)} ${MONTHS[m - 1]} ${y}`
}

/** Human label for a range, for report sub-titles / export file names. */
export function rangeLabel(from, to) {
  if (from && to) return from === to ? formatDateLK(from) : `${formatDateLK(from)} – ${formatDateLK(to)}`
  if (from) return `From ${formatDateLK(from)}`
  if (to) return `Up to ${formatDateLK(to)}`
  return 'All dates'
}

/**
 * Searchable q-select helper: case-insensitive, every whitespace token must
 * appear in the option label (or `sublabel`/`code`). Empty needle → all.
 */
export function filterOptions(options, needle) {
  const list = Array.isArray(options) ? options : []
  const tokens = String(needle || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (!tokens.length) return list
  return list.filter((o) => {
    const hay = [o?.label, o?.sublabel, o?.code, typeof o === 'string' ? o : '']
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return tokens.every((t) => hay.includes(t))
  })
}
