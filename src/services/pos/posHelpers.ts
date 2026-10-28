/**
 * Small pure helpers shared by POS / front-of-house pages.
 *
 * Kept dependency-free so they can be unit-tested without Supabase/Quasar.
 */

/** YYYY-MM-DD in the browser's local time zone (toISOString() is UTC — wrong in UTC+5:30 before 05:30). */
export function localDateKey(d: Date | string | number = new Date()): string {
  const dt = d instanceof Date ? d : new Date(d)
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${m}-${day}`
}

/** ISO timestamp (UTC) of local midnight for the given day — use for timestamptz `>=` filters. */
export function localDayStartISO(d: Date | string | number = new Date()): string {
  const dt = d instanceof Date ? new Date(d.getTime()) : new Date(d)
  dt.setHours(0, 0, 0, 0)
  return dt.toISOString()
}

/** ISO timestamp (UTC) of the next local midnight — use for timestamptz `<` filters. */
export function localDayEndExclusiveISO(d: Date | string | number = new Date()): string {
  const dt = d instanceof Date ? new Date(d.getTime()) : new Date(d)
  dt.setHours(0, 0, 0, 0)
  dt.setDate(dt.getDate() + 1)
  return dt.toISOString()
}

/**
 * Role names from `user_roles` rows selected as `roles(name)`.
 * (user_roles has no `role` column — it is `role_id` → roles.name.)
 */
export function roleNamesFromUserRoles(rows: unknown): string[] {
  if (!Array.isArray(rows)) return []
  return rows
    .map((r) => {
      const rel = (r as { roles?: { name?: string } | { name?: string }[] | null })?.roles
      if (Array.isArray(rel)) return rel[0]?.name
      return rel?.name
    })
    .filter((n): n is string => typeof n === 'string' && n.length > 0)
}

/** True when the role list grants manager-level override authority. */
export function hasManagerAuthority(roleNames: string[]): boolean {
  return roleNames.some((r) => r === 'manager' || r === 'admin')
}

export interface AddableMenuItem {
  id: string
  name: string
  base_price: number
  kitchen_id: string | null
  category_name: string
}

/**
 * Normalise menu rows for the waiter "Add Items" sheet.
 * Accepts either `menu_book_items` rows (with nested `menu_items` + override_price)
 * or plain `menu_items` rows. Unavailable items are dropped; result is name-sorted.
 */
export function normalizeAddableMenu(rows: unknown, fromMenuBook: boolean): AddableMenuItem[] {
  if (!Array.isArray(rows)) return []
  const out: AddableMenuItem[] = []
  const seen = new Set<string>()
  for (const row of rows as Record<string, unknown>[]) {
    const mi = (fromMenuBook ? row?.menu_items : row) as Record<string, unknown> | null | undefined
    if (!mi || !mi.id || mi.is_available === false) continue
    const id = String(mi.id)
    if (seen.has(id)) continue
    seen.add(id)
    const override = fromMenuBook ? Number(row.override_price) : NaN
    const cat = mi.categories as { name?: string } | null | undefined
    out.push({
      id,
      name: String(mi.name ?? 'Item'),
      base_price: Number.isFinite(override) && override > 0 ? override : Number(mi.base_price || 0),
      kitchen_id: (mi.kitchen_id as string) ?? null,
      category_name: cat?.name || 'Other',
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Start (ISO, UTC) of a "last N local days" window, or null for "all".
 * period: 'today' | '7d' | '30d' | '90d' | 'all'
 */
export function periodStartISO(period: string, now: Date = new Date()): string | null {
  const days: Record<string, number> = { today: 0, '7d': 6, '30d': 29, '90d': 89 }
  if (!(period in days)) return null
  const d = new Date(now.getTime())
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (days[period] as number))
  return d.toISOString()
}

/**
 * Fetch every row of a PostgREST query past the 1000-row cap, page by page.
 * `makeQuery(from, to)` must return a fresh query with `.range(from, to)` applied.
 * Stops at `maxRows` as a safety valve.
 */
export async function fetchAllPages<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
  maxRows = 20000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await makeQuery(from, from + pageSize - 1)
    if (error) throw error
    const rows = data || []
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return out
}

/** Order matches a status filter value against either order status or payment status. */
export function matchesOrderStatus(
  order: { status?: string | null; payment_status?: string | null },
  filter: string,
): boolean {
  if (!filter || filter === 'all') return true
  return order.status === filter || order.payment_status === filter
}

/**
 * Lower bound for "still active" KDS tickets: local midnight, but never less than
 * `lookbackHours` ago — so an order fired at 23:50 that is still cooking at 00:10
 * does not vanish from the kitchen screen at midnight.
 */
export function kdsActiveSinceISO(now: Date = new Date(), lookbackHours = 12): string {
  const midnight = new Date(now.getTime())
  midnight.setHours(0, 0, 0, 0)
  const lookback = now.getTime() - lookbackHours * 3600_000
  return new Date(Math.min(midnight.getTime(), lookback)).toISOString()
}

/** Normalise a table label/number ("Table 07", 7, "T7") to a comparable key ("7"). */
export function tableKey(v: unknown): string {
  const digits = String(v ?? '').replace(/\D/g, '')
  return digits ? String(parseInt(digits, 10)) : ''
}

/**
 * Group active orders under restaurant tables. Orders link by table_id when set,
 * otherwise by table_number — POS / waiter-POS orders only carry table_number,
 * so matching on table_id alone showed occupied tables as vacant.
 */
export function groupOrdersByTable<
  T extends { id: string; table_number?: unknown },
  O extends { table_id?: string | null; table_number?: unknown },
>(tables: T[], orders: O[]): Map<string, O[]> {
  const byId = new Map<string, O[]>()
  const keyToTableId = new Map<string, string>()
  for (const t of tables || []) {
    byId.set(t.id, [])
    const k = tableKey(t.table_number)
    if (k && !keyToTableId.has(k)) keyToTableId.set(k, t.id)
  }
  for (const o of orders || []) {
    let tid = o.table_id && byId.has(o.table_id) ? o.table_id : null
    if (!tid) tid = keyToTableId.get(tableKey(o.table_number)) || null
    if (tid) byId.get(tid)!.push(o)
  }
  return byId
}
