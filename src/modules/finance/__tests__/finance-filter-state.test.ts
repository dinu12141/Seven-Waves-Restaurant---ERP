import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { loadFilterState, saveFilterState, clearFilterState } from '../utils/finance-filter-state'

const g = globalThis as any
const hadWindow = 'window' in g
const store = new Map<string, string>()
g.window = {
  localStorage: {
    getItem: (k: string) => (store.has(k) ? store.get(k) : null),
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
  },
}
afterAll(() => {
  if (!hadWindow) delete g.window
})

const OCT_28 = new Date('2026-10-28T06:00:00Z')
const NOV_15 = new Date('2026-11-15T06:00:00Z')

describe('finance filter persistence', () => {
  beforeEach(() => store.clear())

  it('returns null without a key or saved state', () => {
    expect(loadFilterState('', OCT_28)).toBeNull()
    expect(loadFilterState('expenses', OCT_28)).toBeNull()
  })

  it('round-trips a custom range + search', () => {
    saveFilterState('expenses', { from: '2026-10-05', to: '2026-10-20', search: 'gas' })
    expect(loadFilterState('expenses', OCT_28)).toMatchObject({
      from: '2026-10-05',
      to: '2026-10-20',
      search: 'gas',
      preset: null,
    })
  })

  it('re-resolves a saved preset against the current date', () => {
    saveFilterState('tax', { from: '2026-10-01', to: '2026-10-28', preset: 'this_month' })
    expect(loadFilterState('tax', NOV_15)).toMatchObject({ from: '2026-11-01', to: '2026-11-15', preset: 'this_month' })
  })

  it('drops malformed dates and corrupt JSON', () => {
    saveFilterState('x', { from: 'bad', to: '2026-10-20' })
    expect(loadFilterState('x', OCT_28)).toMatchObject({ from: null, to: '2026-10-20' })
    store.set('sw_fin_filters:y', '{not json')
    expect(loadFilterState('y', OCT_28)).toBeNull()
  })

  it('clear removes the saved state', () => {
    saveFilterState('z', { from: '2026-10-01', to: '2026-10-02' })
    clearFilterState('z')
    expect(loadFilterState('z', OCT_28)).toBeNull()
  })
})
