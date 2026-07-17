import { supabase } from 'src/boot/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoyaltyTier {
  id: string
  tier_code: 'STANDARD' | 'SILVER' | 'GOLD'
  tier_name: string
  min_coins: number
  max_coins: number | null
  badge_color: string
  rank_order: number
  benefits_json: Record<string, unknown>
}

export interface LoyaltyAccount {
  id: string
  customer_id: string
  /** Legacy card_number field */
  card_number: string | null
  /** New coin-based card number */
  loyalty_card_no: string | null
  current_coins: number
  total_earned_coins: number
  total_redeemed_coins: number
  total_spent: number
  last_rewarded_at: string | null
  /** Legacy points_balance (kept in sync) */
  points_balance: number
  /** Legacy tier string */
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  current_tier_id: string | null
  created_at: string
  updated_at: string | null
}

export interface LoyaltyTransaction {
  id: string
  customer_id: string
  loyalty_account_id: string | null
  order_id: string | null
  payment_id: string | null
  transaction_type: 'earn' | 'redeem' | 'adjust' | 'expire'
  /** Legacy field */
  type?: 'earn' | 'redeem' | 'adjust' | 'expire'
  coins: number
  /** Legacy field */
  points?: number
  amount_reference: number | null
  amount_value?: number | null
  note: string | null
  notes?: string | null
  created_at: string
  created_by?: string | null
}

export interface LoyaltyRewardResult {
  success: boolean
  error?: string
  coins_awarded?: number
  new_coin_balance?: number
  total_earned_coins?: number
  tier?: string
  order_id?: string
  amount?: number
  idempotent?: boolean
}

// ─── Coin-Based Tier Configuration ───────────────────────────────────────────

export const TIER_CONFIG = {
  // New coin-based tiers
  STANDARD: {
    label: 'Standard',
    color: '#9ca3af',
    gradient: 'linear-gradient(135deg, #4b5563, #6b7280)',
    minCoins: 0,
    maxCoins: 99,
    icon: '⭐',
    cssClass: 'standard',
  },
  SILVER: {
    label: 'Silver',
    color: '#c0c0c0',
    gradient: 'linear-gradient(135deg, #64748b, #94a3b8)',
    minCoins: 100,
    maxCoins: 249,
    icon: '🥈',
    cssClass: 'silver',
  },
  GOLD: {
    label: 'Gold',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #92400e, #f59e0b)',
    minCoins: 250,
    maxCoins: null,
    icon: '🥇',
    cssClass: 'gold',
  },
  // Legacy mappings (for backward compat with existing DB values)
  bronze: {
    label: 'Standard',
    color: '#9ca3af',
    gradient: 'linear-gradient(135deg, #4b5563, #6b7280)',
    minCoins: 0,
    maxCoins: 99,
    icon: '⭐',
    cssClass: 'standard',
  },
  silver: {
    label: 'Silver',
    color: '#c0c0c0',
    gradient: 'linear-gradient(135deg, #64748b, #94a3b8)',
    minCoins: 100,
    maxCoins: 249,
    icon: '🥈',
    cssClass: 'silver',
  },
  gold: {
    label: 'Gold',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #92400e, #f59e0b)',
    minCoins: 250,
    maxCoins: null,
    icon: '🥇',
    cssClass: 'gold',
  },
  platinum: {
    label: 'Gold',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #92400e, #f59e0b)',
    minCoins: 250,
    maxCoins: null,
    icon: '🥇',
    cssClass: 'gold',
  },
  standard: {
    label: 'Standard',
    color: '#9ca3af',
    gradient: 'linear-gradient(135deg, #4b5563, #6b7280)',
    minCoins: 0,
    maxCoins: 99,
    icon: '⭐',
    cssClass: 'standard',
  },
}

// ─── Get All Tiers from DB ────────────────────────────────────────────────────

export async function getLoyaltyTiers(): Promise<LoyaltyTier[]> {
  const { data } = await supabase.from('loyalty_tiers').select('*').order('rank_order')

  return (data as LoyaltyTier[]) || []
}

// ─── Get Loyalty Account ──────────────────────────────────────────────────────

export async function getLoyaltyAccount(customerId: string): Promise<LoyaltyAccount | null> {
  const { data, error } = await supabase
    .from('loyalty_accounts')
    .select('*, loyalty_tiers(*)')
    .eq('customer_id', customerId)
    .maybeSingle()

  if (error || !data) return null
  return data as LoyaltyAccount
}

// ─── Get My Loyalty (authenticated customer) ──────────────────────────────────

export async function getMyLoyaltyAccount(): Promise<{
  success: boolean
  loyalty?: LoyaltyAccount
  tier?: LoyaltyTier
  recent_transactions?: LoyaltyTransaction[]
  error?: string
}> {
  const { data, error } = await supabase.rpc('get_my_loyalty_account')

  if (error) return { success: false, error: error.message }
  const res = data as {
    success: boolean
    loyalty?: LoyaltyAccount
    tier?: LoyaltyTier
    recent_transactions?: LoyaltyTransaction[]
    error?: string
  }
  return res
}

// ─── Get Loyalty Transactions ─────────────────────────────────────────────────

export async function getLoyaltyTransactions(
  customerId: string,
  limit = 20,
): Promise<LoyaltyTransaction[]> {
  const { data, error } = await supabase
    .from('loyalty_transactions')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as LoyaltyTransaction[]
}

// ─── Apply Loyalty Reward (server-side) ───────────────────────────────────────

export async function applyLoyaltyReward(orderId: string): Promise<LoyaltyRewardResult> {
  const { data, error } = await supabase.rpc('rpc_apply_loyalty_reward', {
    p_order_id: orderId,
  })

  if (error) return { success: false, error: error.message }
  return data as LoyaltyRewardResult
}

// ─── Calculate coins for amount (client preview) ──────────────────────────────

export function calculateCoinsPreview(amount: number, threshold = 5000, perThreshold = 1): number {
  if (amount <= 0) return 0
  return Math.floor(amount / threshold) * perThreshold
}

// ─── Admin: Adjust Coins ──────────────────────────────────────────────────────

export async function adminAdjustLoyaltyCoins(
  customerId: string,
  delta: number,
  note: string,
): Promise<{ success: boolean; new_coins?: number; tier?: string; error?: string }> {
  const { data, error } = await supabase.rpc('rpc_adjust_loyalty_coins', {
    p_customer_id: customerId,
    p_delta: delta,
    p_note: note,
  })

  if (error) return { success: false, error: error.message }
  return data as { success: boolean; new_coins: number; tier: string }
}

// ─── Admin: Loyalty Dashboard Stats (DB aggregates) ──────────────────────────

export interface LoyaltyStats {
  totalMembers: number
  totalCoinsIssued: number
  coinsRedeemed: number
  goldMembers: number
  silverMembers: number
}

export async function adminGetLoyaltyStats(): Promise<{
  success: boolean
  stats?: LoyaltyStats
  error?: string
}> {
  const [totalRes, earnedRes, redeemedRes, tierRes] = await Promise.all([
    // Total members
    supabase.from('loyalty_accounts').select('id', { count: 'exact', head: true }),
    // Total coins ever issued (earn transactions)
    supabase
      .from('loyalty_transactions')
      .select('coins')
      .eq('transaction_type', 'earn'),
    // Total coins redeemed
    supabase
      .from('loyalty_transactions')
      .select('coins')
      .eq('transaction_type', 'redeem'),
    // Gold + Silver counts via loyalty_tiers join
    supabase
      .from('loyalty_accounts')
      .select('current_tier_id, loyalty_tiers!current_tier_id(tier_code)'),
  ])

  if (totalRes.error || earnedRes.error || redeemedRes.error || tierRes.error) {
    const err = totalRes.error || earnedRes.error || redeemedRes.error || tierRes.error
    return { success: false, error: err?.message }
  }

  const totalCoinsIssued = (earnedRes.data || []).reduce(
    (sum, r) => sum + (r.coins || 0),
    0,
  )
  const coinsRedeemed = (redeemedRes.data || []).reduce(
    (sum, r) => sum + Math.abs(r.coins || 0),
    0,
  )

  type TierRow = { loyalty_tiers: { tier_code: string } | null }
  const tierRows = (tierRes.data || []) as unknown as TierRow[]
  const goldMembers = tierRows.filter(
    (r) => r.loyalty_tiers?.tier_code === 'GOLD',
  ).length
  const silverMembers = tierRows.filter(
    (r) => r.loyalty_tiers?.tier_code === 'SILVER',
  ).length

  return {
    success: true,
    stats: {
      totalMembers: totalRes.count ?? 0,
      totalCoinsIssued,
      coinsRedeemed,
      goldMembers,
      silverMembers,
    },
  }
}

// ─── Admin: Get Loyalty Customer List ────────────────────────────────────────

export async function adminGetLoyaltyCustomers(params: {
  search?: string
  tier_code?: string
  limit?: number
  offset?: number
}): Promise<{
  success: boolean
  data?: LoyaltyCustomerRow[]
  total?: number
  error?: string
}> {
  const { data, error } = await supabase.rpc('get_loyalty_customer_list', {
    p_search: params.search || null,
    p_tier_code: params.tier_code || null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  })

  if (error) return { success: false, error: error.message }
  return data as { success: boolean; data: LoyaltyCustomerRow[]; total: number }
}

// ─── Admin: Get Loyalty Customer Detail ──────────────────────────────────────

export async function adminGetLoyaltyCustomerDetail(customerId: string): Promise<{
  success: boolean
  customer?: Record<string, unknown>
  loyalty?: LoyaltyAccount
  tier?: LoyaltyTier
  transactions?: LoyaltyTransaction[]
  order_count?: number
  error?: string
}> {
  const { data, error } = await supabase.rpc('get_loyalty_customer_detail', {
    p_customer_id: customerId,
  })

  if (error) return { success: false, error: error.message }
  return data as {
    success: boolean
    customer: Record<string, unknown>
    loyalty: LoyaltyAccount
    tier: LoyaltyTier
    transactions: LoyaltyTransaction[]
    order_count: number
  }
}

// ─── Types for admin list ─────────────────────────────────────────────────────

export interface LoyaltyCustomerRow {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  is_active: boolean
  registered_at: string
  loyalty_id: string
  card_number: string | null
  current_coins: number
  total_earned_coins: number
  total_redeemed_coins: number
  total_spent: number
  last_rewarded_at: string | null
  tier: string
  tier_code: string
  tier_name: string
  badge_color: string
  min_coins: number
  max_coins: number | null
  rank_order: number
}

// ─── Tier Progress (Coin-Based) ───────────────────────────────────────────────

export function getTierProgress(
  tierOrCode: string,
  coins: number,
): { nextTier: string | null; progress: number; coinsNeeded: number; pointsNeeded: number } {
  // Normalize tier key
  const tierKey = tierOrCode?.toUpperCase() as keyof typeof TIER_CONFIG

  // Ordered tiers
  const orderedTiers = [
    { code: 'STANDARD', min: 0, max: 99, label: 'Standard', nextLabel: 'Silver' },
    { code: 'SILVER', min: 100, max: 249, label: 'Silver', nextLabel: 'Gold' },
    { code: 'GOLD', min: 250, max: null, label: 'Gold', nextLabel: null },
  ]

  // Map legacy tier names
  const legacyMap: Record<string, string> = {
    bronze: 'STANDARD',
    standard: 'STANDARD',
    silver: 'SILVER',
    gold: 'GOLD',
    platinum: 'GOLD',
  }

  const normalizedCode =
    orderedTiers.find((t) => t.code === tierKey)?.code ||
    legacyMap[tierOrCode?.toLowerCase()] ||
    'STANDARD'

  const currentTierIdx = orderedTiers.findIndex((t) => t.code === normalizedCode)
  const currentTier = orderedTiers[currentTierIdx]

  if (!currentTier || currentTierIdx === orderedTiers.length - 1) {
    // Max tier (GOLD) — always at 100%
    return { nextTier: null, progress: 100, coinsNeeded: 0, pointsNeeded: 0 }
  }

  const nextTier = orderedTiers[currentTierIdx + 1]
  if (!nextTier) return { nextTier: null, progress: 100, coinsNeeded: 0, pointsNeeded: 0 }

  const rangeStart = currentTier.min
  const rangeEnd = nextTier.min
  const range = rangeEnd - rangeStart
  const progress = Math.min(100, Math.round(((coins - rangeStart) / range) * 100))
  const coinsNeeded = Math.max(0, rangeEnd - coins)

  return {
    nextTier: nextTier.label,
    progress: Math.max(0, progress),
    coinsNeeded,
    pointsNeeded: coinsNeeded, // Legacy compatibility
  }
}

// ─── Format Card Number ───────────────────────────────────────────────────────

export function formatCardNumber(cardNumber: string): string {
  if (!cardNumber) return ''
  if (cardNumber.startsWith('SW') && cardNumber.length === 10) {
    const digits = cardNumber.slice(2)
    return `SW ${digits.slice(0, 4)} ${digits.slice(4)}`
  }
  // Generic 4-digit grouping
  return cardNumber.replace(/(.{4})/g, '$1 ').trim()
}

// ─── Tier display helpers ─────────────────────────────────────────────────────

export function getTierConfig(tier: string) {
  const key = tier?.toUpperCase() as keyof typeof TIER_CONFIG
  return (
    TIER_CONFIG[key] ||
    TIER_CONFIG[tier?.toLowerCase() as keyof typeof TIER_CONFIG] ||
    TIER_CONFIG['STANDARD']
  )
}

export function getTierBadgeColor(tierCode: string): string {
  const map: Record<string, string> = {
    STANDARD: '#6b7280',
    SILVER: '#94a3b8',
    GOLD: '#f59e0b',
    bronze: '#9ca3af',
    silver: '#94a3b8',
    gold: '#f59e0b',
    platinum: '#f59e0b',
    standard: '#6b7280',
  }
  return map[tierCode] || '#6b7280'
}
