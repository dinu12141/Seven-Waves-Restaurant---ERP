import { describe, it, expect, vi } from 'vitest'
import {
  businessDateStr,
  addDays,
  monthStart,
  monthEnd,
  dayOfWeek,
  dayStartISO,
  dayEndExclusiveISO,
  businessHour,
  businessDateOf,
  applyDateRange,
  fetchAllRows,
} from 'src/services/reportFilters'

describe('reportFilters — Asia/Colombo business day', () => {
  it('businessDateStr: 00:30 Colombo is still "today" (UTC is previous day)', () => {
    // 2026-10-28 00:30 +05:30 == 2026-10-27T19:00Z
    expect(businessDateStr(new Date('2026-10-27T19:00:00Z'))).toBe('2026-10-28')
    // 2026-10-28 23:59 +05:30 == 2026-10-28T18:29Z
    expect(businessDateStr(new Date('2026-10-28T18:29:00Z'))).toBe('2026-10-28')
    expect(businessDateStr(new Date('2026-10-28T18:30:00Z'))).toBe('2026-10-29')
  })

  it('dayStartISO / dayEndExclusiveISO give Colombo midnight instants', () => {
    expect(dayStartISO('2026-10-28')).toBe('2026-10-27T18:30:00.000Z')
    expect(dayEndExclusiveISO('2026-10-28')).toBe('2026-10-28T18:30:00.000Z')
    expect(dayEndExclusiveISO('2026-12-31')).toBe('2026-12-31T18:30:00.000Z')
  })

  it('passes through non YYYY-MM-DD values untouched', () => {
    expect(dayStartISO('2026-10-28T10:00:00Z')).toBe('2026-10-28T10:00:00Z')
  })

  it('calendar helpers handle month/year/leap boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(monthStart('2026-01-15', -1)).toBe('2025-12-01')
    expect(monthEnd('2026-03-10', -1)).toBe('2026-02-28')
    expect(dayOfWeek('2026-10-28')).toBe(3) // Wednesday
  })

  it('businessHour / businessDateOf bucket by Colombo time', () => {
    expect(businessHour('2026-10-27T19:00:00Z')).toBe(0)
    expect(businessHour('2026-10-28T06:45:00Z')).toBe(12)
    expect(businessDateOf('2026-10-27T19:00:00Z')).toBe('2026-10-28')
  })
})

function fakeQuery() {
  const calls: [string, string, string][] = []
  const q = {
    gte: (c: string, v: string) => (calls.push(['gte', c, v]), q),
    lte: (c: string, v: string) => (calls.push(['lte', c, v]), q),
    lt: (c: string, v: string) => (calls.push(['lt', c, v]), q),
  }
  return { q, calls }
}

describe('applyDateRange', () => {
  it('timestamptz column uses [start, nextDayStart)', () => {
    const { q, calls } = fakeQuery()
    applyDateRange(q, { dateFrom: '2026-10-01', dateTo: '2026-10-28' })
    expect(calls).toEqual([
      ['gte', 'created_at', '2026-09-30T18:30:00.000Z'],
      ['lt', 'created_at', '2026-10-28T18:30:00.000Z'],
    ])
  })

  it('DATE column compares plain dates inclusively', () => {
    const { q, calls } = fakeQuery()
    applyDateRange(q, { dateFrom: '2026-10-01', dateTo: '2026-10-28' }, 'doc_date', true)
    expect(calls).toEqual([
      ['gte', 'doc_date', '2026-10-01'],
      ['lte', 'doc_date', '2026-10-28'],
    ])
  })

  it('no filters → no calls', () => {
    const { q, calls } = fakeQuery()
    applyDateRange(q, {})
    expect(calls).toEqual([])
  })
})

describe('fetchAllRows', () => {
  function pagedSource(total: number) {
    const range = vi.fn(async (from: number, to: number) => {
      const rows = []
      for (let i = from; i <= Math.min(to, total - 1); i++) rows.push({ i })
      return { data: rows, error: null }
    })
    return { range }
  }

  it('pages past the 1000-row PostgREST cap', async () => {
    const src = pagedSource(2500)
    const res = await fetchAllRows(src)
    expect(res.data).toHaveLength(2500)
    expect(res.truncated).toBe(false)
    expect(src.range).toHaveBeenCalledTimes(3)
    expect(src.range).toHaveBeenNthCalledWith(2, 1000, 1999)
  })

  it('exact multiple of page size does one extra (empty) request', async () => {
    const src = pagedSource(2000)
    const res = await fetchAllRows(src)
    expect(res.data).toHaveLength(2000)
    expect(src.range).toHaveBeenCalledTimes(3)
  })

  it('flags truncation at maxRows', async () => {
    const res = await fetchAllRows(pagedSource(5000), { maxRows: 1500 })
    expect(res.data).toHaveLength(1500)
    expect(res.truncated).toBe(true)
  })

  it('accepts a factory and surfaces errors', async () => {
    const res = await fetchAllRows(() => ({
      range: async () => ({ data: null, error: { message: 'boom' } }),
    }))
    expect(res.error).toEqual({ message: 'boom' })
    expect(res.data).toEqual([])
  })
})
