import { supabase } from 'src/boot/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Category {
  id: string
  name: string
  sort_order: number
  is_active: boolean
  emoji?: string
}

export interface ItemVariant {
  id: string
  menu_item_id: string
  name: string
  price_delta: number
  is_available: boolean
}

export interface MenuItem {
  id: string
  category_id: string | null
  category_name: string
  name: string
  description: string
  base_price: number
  image_url: string | null
  is_available: boolean
  is_veg: boolean
  is_spicy: boolean
  is_best_seller: boolean
  kitchen_id: string | null
  preparation_time_minutes: number | null
  sort_order: number
  variants?: ItemVariant[]
}

// Category emoji map (fallback)
const CATEGORY_EMOJI_MAP: Record<string, string> = {
  starters: '🥗',
  appetizers: '🥗',
  soups: '🍜',
  salads: '🥙',
  mains: '🍛',
  'main course': '🍛',
  seafood: '🦞',
  fish: '🐟',
  chicken: '🍗',
  meat: '🥩',
  rice: '🍚',
  noodles: '🍝',
  pasta: '🍝',
  pizza: '🍕',
  burgers: '🍔',
  wraps: '🌯',
  sandwiches: '🥪',
  desserts: '🍰',
  sweets: '🍮',
  drinks: '🥤',
  beverages: '🧃',
  juices: '🍹',
  coffee: '☕',
  tea: '🍵',
  alcohol: '🍺',
  cocktails: '🍸',
  mocktails: '🍹',
  sides: '🍟',
  extras: '➕',
  combos: '🍱',
  specials: '⭐',
}

export function getCategoryEmoji(name: string): string {
  const key = name.toLowerCase().trim()
  for (const [k, v] of Object.entries(CATEGORY_EMOJI_MAP)) {
    if (key.includes(k)) return v
  }
  return '🍽️'
}

// ─── Load Categories ──────────────────────────────────────────────────────────

export async function loadCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  if (error) {
    console.error('[menuService] loadCategories error:', error)
    return []
  }

  return (data || []).map((c) => ({
    ...c,
    emoji: getCategoryEmoji(c.name),
  }))
}

// ─── Load Menu Items ──────────────────────────────────────────────────────────

export interface MenuFilters {
  search?: string
  categoryId?: string | null
  isVeg?: boolean
  isSpicy?: boolean
  isBestSeller?: boolean
}

export async function loadMenuItems(filters?: MenuFilters): Promise<MenuItem[]> {
  let query = supabase
    .from('menu_items')
    .select(
      `
      id, category_id, name, description, base_price,
      image_url, is_available, is_veg, is_spicy, is_best_seller,
      kitchen_id, preparation_time_minutes, sort_order,
      categories!left(id, name)
    `,
    )
    .eq('is_available', true)
    .order('sort_order')

  if (filters?.categoryId) {
    query = query.eq('category_id', filters.categoryId)
  }
  if (filters?.isVeg) query = query.eq('is_veg', true)
  if (filters?.isSpicy) query = query.eq('is_spicy', true)
  if (filters?.isBestSeller) query = query.eq('is_best_seller', true)
  if (filters?.search) {
    query = query.ilike('name', `%${filters.search}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('[menuService] loadMenuItems error:', error)
    return []
  }

  return (data || []).map((item) => {
    // Supabase join returns array for !left joins — safely handle both
    const cats = item.categories as { name?: string }[] | { name?: string } | null | undefined
    const catName = Array.isArray(cats) ? cats[0]?.name : (cats as { name?: string } | null)?.name
    return {
      id: item.id,
      category_id: item.category_id,
      category_name: catName ?? 'Other',
      name: item.name,
      description: item.description ?? '',
      base_price: Number(item.base_price ?? 0),
      image_url: item.image_url,
      is_available: item.is_available,
      is_veg: item.is_veg ?? false,
      is_spicy: item.is_spicy ?? false,
      is_best_seller: item.is_best_seller ?? false,
      kitchen_id: item.kitchen_id,
      preparation_time_minutes: item.preparation_time_minutes,
      sort_order: item.sort_order ?? 0,
    }
  })
}

// ─── Load Item Variants ───────────────────────────────────────────────────────

export async function loadItemVariants(menuItemId: string): Promise<ItemVariant[]> {
  const { data, error } = await supabase
    .from('item_variants')
    .select('*')
    .eq('menu_item_id', menuItemId)
    .eq('is_available', true)
    .order('name')

  if (error) {
    console.error('[menuService] loadItemVariants error:', error)
    return []
  }

  return data || []
}
