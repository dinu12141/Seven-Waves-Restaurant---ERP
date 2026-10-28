/**
 * Timezone-safe date helpers for HR (Sri Lanka, UTC+05:30).
 *
 * `new Date().toISOString().split('T')[0]` returns the *UTC* calendar date, which
 * is yesterday between 00:00 and 05:30 local time. `new Date('YYYY-MM-DDT00:00:00')`
 * is local midnight, so `.toISOString()` on it is the previous day in UTC+ zones.
 * These helpers always work on the local calendar date or on pure Y-M-D strings.
 */

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date as YYYY-MM-DD (default: today). */
export function localYmd(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local calendar month as YYYY-MM (default: this month). */
export function localYm(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** Adds `days` to a YYYY-MM-DD string using pure calendar arithmetic (no TZ drift). */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** Inclusive list of YYYY-MM-DD dates from start to end. Empty if end < start or invalid. */
export function enumerateYmd(start: string, end: string, max = 366): string[] {
  const re = /^\d{4}-\d{2}-\d{2}$/
  if (!re.test(start || '') || !re.test(end || '') || end < start) return []
  const out: string[] = []
  let cur = start
  while (cur <= end && out.length < max) {
    out.push(cur)
    cur = addDaysYmd(cur, 1)
  }
  return out
}

/** First and last day (YYYY-MM-DD) of a YYYY-MM month. */
export function monthBounds(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` }
}

/**
 * Fetches every row of a PostgREST query, paging past the 1000-row server cap.
 * `build` must return a fresh query builder each call (builders are single-use).
 */
export async function fetchAllRows<T = unknown>(
  build: () => {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
  },
  pageSize = 1000,
  hardCap = 50000,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; from < hardCap; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1)
    if (error) throw error
    const rows = data || []
    all.push(...rows)
    if (rows.length < pageSize) break
  }
  return all
}
