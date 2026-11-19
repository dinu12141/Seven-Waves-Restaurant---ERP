// ═══════════════════════════════════════════════════════════════════════════
// Kottawa Section & Departmental COGS Configuration Service
// Supports dynamic customization of section names and COGS line labels
// Seven Waves Restaurant (Pvt) Ltd
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'

export interface SectionConfig {
  code: string
  name: string
  cogs_label: string
  is_production: boolean
  sort_order: number
}

export const DEFAULT_KOTTAWA_SECTIONS: SectionConfig[] = [
  { code: 'KOT-01', name: 'Benmar', cogs_label: 'COGS – Benmar', is_production: true, sort_order: 1 },
  { code: 'KOT-02', name: 'Cashier', cogs_label: 'COGS – Cashier (direct production only)', is_production: true, sort_order: 2 },
  { code: 'KOT-03', name: 'Pastry / Bakery', cogs_label: 'COGS – Pastry / Bakery', is_production: true, sort_order: 3 },
  { code: 'KOT-04', name: 'Chinese', cogs_label: 'COGS – Chinese', is_production: true, sort_order: 4 },
  { code: 'KOT-05', name: 'Rice and Curry', cogs_label: 'COGS – Rice and Curry', is_production: true, sort_order: 5 },
  { code: 'KOT-06', name: 'Italian', cogs_label: 'COGS – Italian', is_production: true, sort_order: 6 },
  { code: 'KOT-07', name: 'Juice Bar', cogs_label: 'COGS – Juice Bar', is_production: true, sort_order: 7 },
  { code: 'KOT-08', name: 'Cleaning', cogs_label: 'Cleaning Expense', is_production: false, sort_order: 8 },
  { code: 'KOT-09', name: 'Wash-up', cogs_label: 'Wash-up Expense', is_production: false, sort_order: 9 },
  { code: 'KOT-10', name: 'Kottu and Roti', cogs_label: 'COGS – Kottu and Roti', is_production: true, sort_order: 10 },
]

const SETTING_KEY = 'kottawa_sections_config'
let _cachedSections: SectionConfig[] | null = null

/**
 * Fetch sections from database (or return cached / default fallback).
 */
export async function getKottawaSections(forceRefresh = false): Promise<SectionConfig[]> {
  if (_cachedSections && !forceRefresh) {
    return _cachedSections
  }

  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', SETTING_KEY)
      .maybeSingle()

    if (!error && data?.setting_value && Array.isArray(data.setting_value)) {
      _cachedSections = data.setting_value as SectionConfig[]
      return _cachedSections
    }
  } catch (err) {
    console.warn('[sectionConfigService] Failed to load remote sections, using defaults:', err)
  }

  _cachedSections = [...DEFAULT_KOTTAWA_SECTIONS]
  return _cachedSections
}

/**
 * Persist updated sections to database.
 */
export async function saveKottawaSections(sections: SectionConfig[]): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: existing } = await supabase
      .from('system_settings')
      .select('id')
      .eq('setting_key', SETTING_KEY)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('system_settings')
        .update({
          setting_value: sections,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      if (error) throw error
    } else {
      const { error } = await supabase
        .from('system_settings')
        .insert({
          setting_key: SETTING_KEY,
          setting_value: sections,
          setting_type: 'json',
        })

      if (error) throw error
    }

    _cachedSections = [...sections]
    return { success: true }
  } catch (err: any) {
    console.error('[sectionConfigService] Failed to save sections:', err)
    return { success: false, error: err?.message || 'Failed to save sections' }
  }
}

/**
 * Get display options for select dropdowns.
 */
export async function getSectionSelectOptions(): Promise<Array<{ label: string; value: string; cogsLabel: string }>> {
  const sections = await getKottawaSections()
  return sections.map((s) => ({
    label: `${s.code}: ${s.name}`,
    value: s.code,
    cogsLabel: s.cogs_label,
  }))
}

/**
 * Resolve COGS label for a given section code.
 */
export function resolveCogsLabel(code: string, sections?: SectionConfig[]): string {
  const list = sections || _cachedSections || DEFAULT_KOTTAWA_SECTIONS
  const found = list.find((s) => s.code === code)
  return found ? found.cogs_label : `COGS – ${code}`
}
