// Per-page filter persistence for Finance pages (localStorage, best-effort).
import { isDateKey, normalizeRange, presetRange } from './finance-dates'

const PREFIX = 'sw_fin_filters:'

function storage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/**
 * Restore a saved filter state. A saved preset is re-resolved against today, so
 * "This month" saved in September still means the current month in October.
 */
export function loadFilterState(key, now = new Date(), fyStartMonth) {
  const ls = key ? storage() : null
  if (!ls) return null
  try {
    const raw = JSON.parse(ls.getItem(PREFIX + key) || 'null')
    if (!raw || typeof raw !== 'object') return null
    const out = { search: typeof raw.search === 'string' ? raw.search : '', preset: null, extra: raw.extra || {} }
    const fromPreset = raw.preset ? presetRange(raw.preset, now, fyStartMonth) : null
    if (fromPreset) {
      Object.assign(out, fromPreset, { preset: raw.preset })
    } else {
      const r = normalizeRange(raw.from, raw.to)
      out.from = r.from
      out.to = r.to
    }
    return out
  } catch {
    return null
  }
}

export function saveFilterState(key, state) {
  const ls = key ? storage() : null
  if (!ls) return
  try {
    ls.setItem(
      PREFIX + key,
      JSON.stringify({
        from: isDateKey(state.from) ? state.from : null,
        to: isDateKey(state.to) ? state.to : null,
        preset: state.preset || null,
        search: state.search || '',
        extra: state.extra || {},
      }),
    )
  } catch {
    /* storage full / blocked — persistence is a convenience only */
  }
}

export function clearFilterState(key) {
  const ls = key ? storage() : null
  try {
    ls?.removeItem(PREFIX + key)
  } catch {
    /* ignore */
  }
}
