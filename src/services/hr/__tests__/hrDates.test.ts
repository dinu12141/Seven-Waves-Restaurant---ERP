import { describe, it, expect, vi } from 'vitest'
import {
  localYmd,
  localYm,
  addDaysYmd,
  enumerateYmd,
  monthBounds,
  fetchAllRows,
} from '../hrDates'

describe('hrDates', () => {
  it('localYmd uses the local calendar date, not UTC', () => {
    // 2026-10-28 02:00 local — in UTC+05:30 toISOString() would give 2026-10-27.
    const d = new Date(2026, 9, 28, 2, 0, 0)
    expect(localYmd(d)).toBe('2026-10-28')
    expect(localYm(d)).toBe('2026-10')
  })

  it('addDaysYmd crosses month / year / leap boundaries', () => {
    expect(addDaysYmd('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysYmd('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysYmd('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDaysYmd('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('enumerateYmd is inclusive and does not shift by a day', () => {
    expect(enumerateYmd('2026-10-01', '2026-10-03')).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ])
    expect(enumerateYmd('2026-10-05', '2026-10-05')).toEqual(['2026-10-05'])
  })

  it('enumerateYmd returns [] for reversed or invalid ranges and honours max', () => {
    expect(enumerateYmd('2026-10-05', '2026-10-01')).toEqual([])
    expect(enumerateYmd('', '2026-10-01')).toEqual([])
    expect(enumerateYmd('2026-01-01', '2026-12-31', 10)).toHaveLength(10)
  })

  it('monthBounds returns first/last day incl. leap February', () => {
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(monthBounds('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
    expect(monthBounds('2026-10')).toEqual({ start: '2026-10-01', end: '2026-10-31' })
  })

  it('fetchAllRows pages past the 1000-row cap and stops on a short page', async () => {
    const total = 2350
    const calls: Array<[number, number]> = []
    const build = vi.fn(() => ({
      range: (from: number, to: number) => {
        calls.push([from, to])
        const n = Math.max(0, Math.min(to, total - 1) - from + 1)
        return Promise.resolve({ data: Array.from({ length: n }, (_, i) => from + i), error: null })
      },
    }))
    const rows = await fetchAllRows<number>(build)
    expect(rows).toHaveLength(total)
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
    expect(build).toHaveBeenCalledTimes(3)
  })

  it('fetchAllRows throws the PostgREST error', async () => {
    const err = new Error('boom')
    await expect(
      fetchAllRows(() => ({ range: () => Promise.resolve({ data: null, error: err }) })),
    ).rejects.toBe(err)
  })
})
