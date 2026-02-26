import { supabase } from 'src/boot/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoyaltyAccount {
  id: string
  customer_id: string
  points_balance: number
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  card_number: string
  created_at: string
}

export interface LoyaltyTransaction {
  id: string
  customer_id: string
  order_id: string | null
  type: 'earn' | 'redeem' | 'adjust' | 'expire'
  points: number
  amount_value: number | null
  notes: string | null
  created_at: string
}

export interface LoyaltySettings {
  earn_rate: number
  min_redeem_pts: number
  redeem_rate: number
}

// ─── Tier Configuration ───────────────────────────────────────────────────────

export const TIER_CONFIG = {
  bronze: {
    label: 'Bronze',
    color: '#cd7f32',
    gradient: 'linear-gradient(135deg, #cd7f32, #a0522d)',
    minPoints: 0,
    icon: '🥉',
  },
  silver: {
    label: 'Silver',
    color: '#c0c0c0',
    gradient: 'linear-gradient(135deg, #c0c0c0, #808080)',
    minPoints: 1000,
    icon: '🥈',
  },
  gold: {
    label: 'Gold',
    color: '#ffd700',
    gradient: 'linear-gradient(135deg, #ffd700, #f59e0b)',
    minPoints: 5000,
    icon: '🥇',
  },
  platinum: {
    label: 'Platinum',
    color: '#e5e4e2',
    gradient: 'linear-gradient(135deg, #e5e4e2, #b0b0b0)',
    minPoints: 10000,
    icon: '💎',
  },
}

// ─── Get Loyalty Account ──────────────────────────────────────────────────────

export async function getLoyaltyAccount(customerId: string): Promise<LoyaltyAccount | null> {
  const { data, error } = await supabase
    .from('loyalty_accounts')
    .select('*')
    .eq('customer_id', customerId)
    .single()

  if (error || !data) return null
  return data as LoyaltyAccount
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

// ─── Award Points (manual trigger) ───────────────────────────────────────────

export async function awardLoyaltyPoints(
  orderId: string,
): Promise<{ success: boolean; error?: string; points_awarded?: number; new_balance?: number }> {
  const { data, error } = await supabase.rpc('award_loyalty_points', {
    p_order_id: orderId,
  })

  if (error) return { success: false, error: error.message }
  return data as { success: boolean; points_awarded?: number; new_balance?: number }
}

// ─── Redeem Points ────────────────────────────────────────────────────────────

export async function redeemPoints(
  customerId: string,
  points: number,
  orderId?: string,
): Promise<{ success: boolean; error?: string; new_balance?: number }> {
  const { data, error } = await supabase.rpc('redeem_points', {
    p_customer_id: customerId,
    p_points: points,
    p_order_id: orderId || null,
  })

  if (error) return { success: false, error: error.message }
  return data as { success: boolean; new_balance?: number }
}

// ─── Get Loyalty Settings ─────────────────────────────────────────────────────

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const { data } = await supabase
    .from('loyalty_settings')
    .select('earn_rate, min_redeem_pts, redeem_rate')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return (
    data || {
      earn_rate: 0.05,
      min_redeem_pts: 50,
      redeem_rate: 1.0,
    }
  )
}

// ─── Next Tier Progress ───────────────────────────────────────────────────────

export function getTierProgress(
  tier: string,
  points: number,
): { nextTier: string | null; progress: number; pointsNeeded: number } {
  const tiers = ['bronze', 'silver', 'gold', 'platinum']
  const currentIdx = tiers.indexOf(tier)

  if (currentIdx === -1 || currentIdx === tiers.length - 1) {
    return { nextTier: null, progress: 100, pointsNeeded: 0 }
  }

  const nextTier = tiers[currentIdx + 1] as keyof typeof TIER_CONFIG
  const currentMin = TIER_CONFIG[tier as keyof typeof TIER_CONFIG]?.minPoints ?? 0
  const nextMin = TIER_CONFIG[nextTier]?.minPoints ?? 0
  const range = nextMin - currentMin
  const progress = Math.min(100, Math.round(((points - currentMin) / range) * 100))
  const pointsNeeded = Math.max(0, nextMin - points)

  return { nextTier: TIER_CONFIG[nextTier]?.label ?? nextTier, progress, pointsNeeded }
}

// ─── Format Card Number for Display ──────────────────────────────────────────

export function formatCardNumber(cardNumber: string): string {
  // Format: SW00000000 → SW 0000 0000
  if (cardNumber.startsWith('SW')) {
    const digits = cardNumber.slice(2)
    return `SW ${digits.slice(0, 4)} ${digits.slice(4)}`
  }
  return cardNumber
}
