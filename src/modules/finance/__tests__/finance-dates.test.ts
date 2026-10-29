import { describe, it, expect } from 'vitest'
import {
  lkDateKey,
  todayLK,
  addDays,
  monthStart,
  monthEnd,
  fiscalYearRange,
  lkDayBounds,
  presetRange,
  matchPreset,
  normalizeRange,
  inDateRange,
  formatMoney,
  formatLKR,
  formatDateLK,
  rangeLabel,
  filterOptions,
} from '../utils/finance-dates'

// 2026-10-27T20:00:00Z == 2026-10-28 01:30 in Colombo (UTC date is still the 27th)
const EARLY_MORNING_LK = new Date('2026-10-27T20:00:00Z')

describe('finance-dates: Sri Lanka local date keys', () => {
  it('uses Colombo wall-clock date, not UTC', () => {
    expect(lkDateKey(EARLY_MORNING_LK)).toBe('2026-10-28')
    expect(EARLY_MORNING_LK.toISOString().slice(0, 10)).toBe('2026-10-27')
  })
  it('handles the 18:30Z day boundary', () => {
    expect(lkDateKey(new Date('2026-10-27T18:29:59Z'))).toBe('2026-10-27')
    expect(lkDateKey(new Date('2026-10-27T18:30:00Z'))).toBe('2026-10-28')
  })
  it('todayLK accepts an injected clock; invalid input → empty', () => {
    expect(todayLK(EARLY_MORNING_LK)).toBe('2026-10-28')
    expect(lkDateKey('not a date' as any)).toBe('')
  })
})

describe('finance-dates: arithmetic', () => {
  it('addDays crosses month / year / leap boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('monthStart / monthEnd', () => {
    expect(monthStart('2026-10-28')).toBe('2026-10-01')
    expect(monthEnd('2026-02-10')).toBe('2026-02-28')
    expect(monthEnd('2026-12-05')).toBe('2026-12-31')
  })
  it('fiscalYearRange defaults to April–March', () => {
    expect(fiscalYearRange('2026-10-28')).toEqual({ from: '2026-04-01', to: '2027-03-31' })
    expect(fiscalYearRange('2026-02-15')).toEqual({ from: '2025-04-01', to: '2026-03-31' })
    expect(fiscalYearRange('2026-02-15', 1)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })
})

describe('finance-dates: bounds with explicit offset', () => {
  it('lkDayBounds carries +05:30 and is inclusive', () => {
    const b = lkDayBounds('2026-10-01', '2026-10-31')
    expect(b.start).toBe('2026-10-01T00:00:00+05:30')
    expect(b.end).toBe('2026-10-31T23:59:59.999+05:30')
    expect(new Date(b.start).toISOString()).toBe('2026-09-30T18:30:00.000Z')
  })
  it('lkDayBounds ignores empty / malformed keys', () => {
    expect(lkDayBounds('', null)).toEqual({ start: null, end: null })
    expect(lkDayBounds('2026/10/01', '2026-10-31').start).toBeNull()
  })
})

describe('finance-dates: presets', () => {
  const now = EARLY_MORNING_LK // 28 Oct 2026 in Colombo
  it('resolves every preset', () => {
    expect(presetRange('today', now)).toEqual({ from: '2026-10-28', to: '2026-10-28' })
    expect(presetRange('yesterday', now)).toEqual({ from: '2026-10-27', to: '2026-10-27' })
    expect(presetRange('this_month', now)).toEqual({ from: '2026-10-01', to: '2026-10-28' })
    expect(presetRange('last_month', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(presetRange('this_fy', now)).toEqual({ from: '2026-04-01', to: '2026-10-28' })
    expect(presetRange('last_fy', now)).toEqual({ from: '2025-04-01', to: '2026-03-31' })
    expect(presetRange('last_30', now)).toEqual({ from: '2026-09-29', to: '2026-10-28' })
    expect(presetRange('nope', now)).toBeNull()
  })
  it('last_month in January rolls back the year', () => {
    expect(presetRange('last_month', new Date('2027-01-15T06:00:00Z'))).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    })
  })
  it('matchPreset recognises a range', () => {
    expect(matchPreset('2026-10-01', '2026-10-28', now)).toBe('this_month')
    expect(matchPreset('2026-10-02', '2026-10-28', now)).toBeNull()
  })
})

describe('finance-dates: range filtering', () => {
  it('normalizeRange swaps reversed bounds and drops bad keys', () => {
    expect(normalizeRange('2026-10-31', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(normalizeRange('x', '2026-10-01')).toEqual({ from: null, to: '2026-10-01' })
  })
  it('inDateRange is inclusive on both ends and accepts timestamps', () => {
    expect(inDateRange('2026-10-01', '2026-10-01', '2026-10-31')).toBe(true)
    expect(inDateRange('2026-10-31T23:00:00', '2026-10-01', '2026-10-31')).toBe(true)
    expect(inDateRange('2026-11-01', '2026-10-01', '2026-10-31')).toBe(false)
    expect(inDateRange(null, '2026-10-01', null)).toBe(false)
    expect(inDateRange(null, null, null)).toBe(true)
  })
})

describe('finance-dates: formatting', () => {
  it('formats money and LKR', () => {
    expect(formatMoney(1234.5)).toBe('1,234.50')
    expect(formatMoney(-50, { brackets: true })).toBe('(50.00)')
    expect(formatMoney(null)).toBe('0.00')
    expect(formatLKR(1000)).toBe('LKR 1,000.00')
    expect(formatLKR(-1000)).toBe('-LKR 1,000.00')
  })
  it('formats dates and range labels', () => {
    expect(formatDateLK('2026-10-28')).toBe('28 Oct 2026')
    expect(formatDateLK('2026-10-27T20:00:00Z')).toBe('28 Oct 2026')
    expect(formatDateLK(null)).toBe('-')
    expect(rangeLabel('2026-10-01', '2026-10-31')).toBe('01 Oct 2026 – 31 Oct 2026')
    expect(rangeLabel(null, null)).toBe('All dates')
  })
})

describe('finance-dates: filterOptions (searchable selects)', () => {
  const opts = [
    { value: 1, label: '5100 Electricity Expense' },
    { value: 2, label: '5200 Gas Expense' },
    { value: 3, label: '1010 Cash in Hand', code: 'CASH' },
  ]
  it('matches every token case-insensitively', () => {
    expect(filterOptions(opts, 'gas').map((o) => o.value)).toEqual([2])
    expect(filterOptions(opts, 'EXP 51').map((o) => o.value)).toEqual([1])
    expect(filterOptions(opts, 'cash').map((o) => o.value)).toEqual([3])
  })
  it('empty needle returns all; bad input is safe', () => {
    expect(filterOptions(opts, '')).toHaveLength(3)
    expect(filterOptions(null, 'x')).toEqual([])
  })
})
