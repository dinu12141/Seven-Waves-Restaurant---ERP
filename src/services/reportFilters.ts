/**
 * reportFilters.ts — timezone-safe date bounds + paged fetch for ERP reports.
 *
 * Why this exists:
 *  - The business runs in Sri Lanka (Asia/Colombo, UTC+05:30, no DST).
 *  - `new Date().toISOString().slice(0, 10)` returns *yesterday* between 00:00 and
 *    05:30 local time, and `'YYYY-MM-DD' + 'T00:00:00'` sent to a timestamptz column
 *    is interpreted by Postgres in the session timezone (UTC), shifting every
 *    report day by 5h30m (orders between 00:00–05:30 land on the previous day and
 *    orders between 18:30–23:59 UTC of the last day are dropped).
 *  - PostgREST caps every response at 1000 rows by default, so `.limit(5000)` and
 *    un-paged queries silently truncate totals.
 */

/** Business timezone offset (Asia/Colombo). Sri Lanka has no DST. */
export const BUSINESS_TZ_OFFSET = '+05:30'
const OFFSET_MS = (5 * 60 + 30) * 60 * 1000

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 'YYYY-MM-DD' for the business-local (Colombo) calendar day of `d` (default: now). */
export function businessDateStr(d: Date = new Date()): string {
  const shifted = new Date(d.getTime() + OFFSET_MS)
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

/** Add `n` days to a 'YYYY-MM-DD' string (pure calendar arithmetic, tz-independent). */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + n))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** First day of the month of a 'YYYY-MM-DD' string, offset by `monthDelta` months. */
export function monthStart(dateStr: string, monthDelta = 0): string {
  const [y, m] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1 + monthDelta, 1))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-01`
}

/** Last day of the month of a 'YYYY-MM-DD' string, offset by `monthDelta` months. */
export function monthEnd(dateStr: string, monthDelta = 0): string {
  return addDays(monthStart(dateStr, monthDelta + 1), -1)
}

/** Day-of-week (0=Sun) of a 'YYYY-MM-DD' string. */
export function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
}

/** ISO instant for 00:00 business-local time on `dateStr` (inclusive lower bound). */
export function dayStartISO(dateStr: string): string {
  if (!DATE_RE.test(String(dateStr || ''))) return dateStr
  return new Date(`${dateStr}T00:00:00${BUSINESS_TZ_OFFSET}`).toISOString()
}

/**
 * ISO instant for 00:00 business-local time on the day AFTER `dateStr`.
 * Use with `.lt()` — exclusive upper bound, so 23:59:59.5 is never lost.
 */
export function dayEndExclusiveISO(dateStr: string): string {
  if (!DATE_RE.test(String(dateStr || ''))) return dateStr
  return dayStartISO(addDays(dateStr, 1))
}

/** Business-local hour (0–23) of a timestamp — use for hourly buckets. */
export function businessHour(ts: string | number | Date): number {
  return new Date(new Date(ts).getTime() + OFFSET_MS).getUTCHours()
}

/** Business-local 'YYYY-MM-DD' of a timestamp — use for daily buckets. */
export function businessDateOf(ts: string | number | Date): string {
  return businessDateStr(new Date(ts))
}

interface RangeFilters {
  dateFrom?: string | null
  dateTo?: string | null
}

// Minimal structural type for a PostgREST filter builder.
interface FilterableQuery<Q> {
  gte(col: string, v: string): Q
  lte(col: string, v: string): Q
  lt(col: string, v: string): Q
}

/**
 * Apply a [dateFrom, dateTo] business-day range to a query.
 * @param dateOnly true when `field` is a DATE column (no tz conversion needed).
 */
export function applyDateRange<Q extends FilterableQuery<Q>>(
  query: Q,
  filters: RangeFilters = {},
  field = 'created_at',
  dateOnly = false,
): Q {
  let q = query
  if (filters.dateFrom) q = q.gte(field, dateOnly ? filters.dateFrom : dayStartISO(filters.dateFrom))
  if (filters.dateTo)
    q = dateOnly ? q.lte(field, filters.dateTo) : q.lt(field, dayEndExclusiveISO(filters.dateTo))
  return q
}

export interface PagedResult<T> {
  data: T[]
  error: unknown
  truncated: boolean
}

type RangeableQuery<T> = {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }>
}

/**
 * Fetch ALL rows of a query in pages of `pageSize` (PostgREST caps at 1000).
 *
 * Accepts either a builder (re-used: postgrest-js `.range()` overwrites
 * offset/limit and every `await` re-issues the request) or a factory returning a
 * fresh builder. The query should have a deterministic `.order()` so pages don't
 * overlap. Stops at `maxRows` and reports `truncated: true` so the UI can warn.
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  source: RangeableQuery<T> | (() => RangeableQuery<T>),
  { pageSize = 1000, maxRows = 50000 }: { pageSize?: number; maxRows?: number } = {},
): Promise<PagedResult<T>> {
  const build = typeof source === 'function' ? source : () => source
  const out: T[] = []
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize, maxRows) - 1
    const { data, error } = await build().range(from, to)
    if (error) return { data: out, error, truncated: false }
    const rows = data || []
    out.push(...rows)
    if (rows.length < to - from + 1) return { data: out, error: null, truncated: false }
  }
  return { data: out, error: null, truncated: true }
}
