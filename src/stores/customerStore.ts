import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  saveCustomerLocally,
  loadCustomerLocally,
  clearCustomerLocally,
  getCurrentCustomerSession,
  signOutCustomer,
} from 'src/services/customerAuthService'
import { supabase } from 'src/boot/supabase'

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCustomerStore = defineStore('customer', () => {
  // ── State ──────────────────────────────────────────────────────────────────

  const customerId = ref<string | null>(null)
  const authUserId = ref<string | null>(null)
  const fullName = ref<string | null>(null)
  const phone = ref<string | null>(null)
  const nationalId = ref<string | null>(null)
  const email = ref<string | null>(null)
  const isNew = ref<boolean>(false)

  // Loyalty state — COIN BASED
  const loyaltyId = ref<string | null>(null)
  const cardNumber = ref<string | null>(null)
  const currentCoins = ref<number>(0)
  /** Legacy field kept for backward compat with LoyaltyPage.vue */
  const pointsBalance = ref<number>(0)
  const tier = ref<'bronze' | 'silver' | 'gold' | 'platinum' | 'standard'>('bronze')
  /** New tier code (STANDARD/SILVER/GOLD) */
  const tierCode = ref<string>('STANDARD')
  const tierName = ref<string>('Standard')
  const badgeColor = ref<string>('#9ca3af')
  const totalEarnedCoins = ref<number>(0)
  const totalSpent = ref<number>(0)
  const lastRewardedAt = ref<string | null>(null)

  // Auth state
  const awaitingOtp = ref<boolean>(false)
  const pendingPhone = ref<string | null>(null)
  const authError = ref<string | null>(null)
  const isLoading = ref<boolean>(false)

  // Realtime subscription handle
  let _realtimeChannel: ReturnType<typeof supabase.channel> | null = null

  // ── Computed ───────────────────────────────────────────────────────────────

  const isLoggedIn = computed(() => !!customerId.value)
  const displayName = computed(() => fullName.value ?? email.value ?? phone.value ?? 'Guest')
  const hasLoyalty = computed(() => !!cardNumber.value)
  const loyaltyCardDisplay = computed(() => cardNumber.value ?? null)

  /** Resolved coins — prefer currentCoins, fall back to pointsBalance */
  const coins = computed(() => currentCoins.value || pointsBalance.value || 0)

  const loyaltyTierDisplay = computed(() => {
    const tc = tierCode.value?.toUpperCase()
    if (tc === 'GOLD') return 'Gold'
    if (tc === 'SILVER') return 'Silver'
    const t = tier.value
    if (t === 'gold' || t === 'platinum') return 'Gold'
    if (t === 'silver') return 'Silver'
    return 'Standard'
  })

  const loyaltyTierColor = computed(() => {
    const tc = tierCode.value?.toUpperCase()
    if (tc === 'GOLD') return 'amber'
    if (tc === 'SILVER') return 'blue-grey'
    const t = tier.value
    if (t === 'gold' || t === 'platinum') return 'amber'
    if (t === 'silver') return 'blue-grey'
    return 'orange'
  })

  // ── Actions ────────────────────────────────────────────────────────────────

  function setCustomer(data: {
    customer_id: string
    full_name?: string | null
    phone?: string | null
    national_id?: string | null
    email?: string | null
    auth_user_id?: string | null
    loyalty_id?: string | null
    card_number?: string | null
    loyalty_card_no?: string | null
    points_balance?: number
    loyalty_points?: number
    current_coins?: number
    tier?: 'bronze' | 'silver' | 'gold' | 'platinum' | 'standard'
    loyalty_tier?: string
    tier_code?: string
    tier_name?: string
    badge_color?: string
    total_earned_coins?: number
    total_spent?: number
    last_rewarded_at?: string | null
    is_new?: boolean
  }) {
    customerId.value = data.customer_id
    fullName.value = data.full_name ?? null
    phone.value = data.phone ?? null
    nationalId.value = data.national_id ?? null
    email.value = data.email ?? null
    authUserId.value = data.auth_user_id ?? null
    loyaltyId.value = data.loyalty_id ?? null
    cardNumber.value = data.card_number ?? data.loyalty_card_no ?? null

    // Coins priority: current_coins > points_balance > loyalty_points
    const resolvedCoins = data.current_coins ?? data.points_balance ?? data.loyalty_points ?? 0
    currentCoins.value = resolvedCoins
    pointsBalance.value = resolvedCoins

    tier.value = (data.tier ?? data.loyalty_tier ?? 'bronze') as
      | 'bronze'
      | 'silver'
      | 'gold'
      | 'platinum'
      | 'standard'

    // Map tier code from explicit or infer from legacy tier
    const inferredTierCode =
      data.tier_code?.toUpperCase() ||
      (() => {
        const t = (data.tier ?? data.loyalty_tier ?? '').toLowerCase()
        if (t === 'gold' || t === 'platinum') return 'GOLD'
        if (t === 'silver') return 'SILVER'
        return 'STANDARD'
      })()

    tierCode.value = inferredTierCode
    tierName.value =
      data.tier_name ??
      (inferredTierCode === 'GOLD' ? 'Gold' : inferredTierCode === 'SILVER' ? 'Silver' : 'Standard')
    badgeColor.value =
      data.badge_color ??
      (inferredTierCode === 'GOLD'
        ? '#f59e0b'
        : inferredTierCode === 'SILVER'
          ? '#c0c0c0'
          : '#9ca3af')

    totalEarnedCoins.value = data.total_earned_coins ?? 0
    totalSpent.value = data.total_spent ?? 0
    lastRewardedAt.value = data.last_rewarded_at ?? null
    isNew.value = data.is_new ?? false

    // Persist to localStorage
    saveCustomerLocally({
      customer_id: data.customer_id,
      full_name: data.full_name ?? undefined,
      phone: data.phone ?? undefined,
      email: data.email ?? undefined,
      card_number: cardNumber.value ?? undefined,
      points_balance: resolvedCoins,
      tier: tier.value as 'bronze' | 'silver' | 'gold' | 'platinum',
    })
  }

  function updateLoyalty(data: {
    points_balance?: number
    loyalty_points?: number
    current_coins?: number
    tier?: string
    loyalty_tier?: string
    tier_code?: string
    tier_name?: string
    badge_color?: string
    total_earned_coins?: number
    total_spent?: number
    last_rewarded_at?: string | null
  }) {
    const resolvedCoins = data.current_coins ?? data.points_balance ?? data.loyalty_points
    if (resolvedCoins !== undefined) {
      currentCoins.value = resolvedCoins
      pointsBalance.value = resolvedCoins
    }

    if (data.tier) tier.value = data.tier as 'bronze' | 'silver' | 'gold' | 'platinum' | 'standard'
    if (data.loyalty_tier)
      tier.value = data.loyalty_tier as 'bronze' | 'silver' | 'gold' | 'platinum' | 'standard'
    if (data.tier_code) tierCode.value = data.tier_code.toUpperCase()
    if (data.tier_name) tierName.value = data.tier_name
    if (data.badge_color) badgeColor.value = data.badge_color
    if (data.total_earned_coins !== undefined) totalEarnedCoins.value = data.total_earned_coins
    if (data.total_spent !== undefined) totalSpent.value = data.total_spent
    if (data.last_rewarded_at !== undefined) lastRewardedAt.value = data.last_rewarded_at
  }

  /**
   * Subscribe to real-time loyalty account updates for the logged-in customer.
   * Should be called once after successful login.
   */
  function subscribeToLoyaltyRealtime() {
    if (!customerId.value || _realtimeChannel) return

    _realtimeChannel = supabase
      .channel(`loyalty_account_${customerId.value}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'loyalty_accounts',
          filter: `customer_id=eq.${customerId.value}`,
        },
        (payload) => {
          const updated = payload.new as {
            current_coins?: number
            points_balance?: number
            tier?: string
            tier_code?: string
            last_rewarded_at?: string
            total_earned_coins?: number
            total_spent?: number
          }
          updateLoyalty({
            current_coins: updated.current_coins,
            points_balance: updated.points_balance,
            tier: updated.tier,
            total_earned_coins: updated.total_earned_coins,
            total_spent: updated.total_spent,
            last_rewarded_at: updated.last_rewarded_at,
          })
        },
      )
      .subscribe()
  }

  function unsubscribeFromLoyaltyRealtime() {
    if (_realtimeChannel) {
      supabase.removeChannel(_realtimeChannel)
      _realtimeChannel = null
    }
  }

  async function clearCustomer() {
    unsubscribeFromLoyaltyRealtime()
    await signOutCustomer()
    customerId.value = null
    authUserId.value = null
    fullName.value = null
    phone.value = null
    nationalId.value = null
    email.value = null
    isNew.value = false
    loyaltyId.value = null
    cardNumber.value = null
    currentCoins.value = 0
    pointsBalance.value = 0
    tier.value = 'bronze'
    tierCode.value = 'STANDARD'
    tierName.value = 'Standard'
    badgeColor.value = '#9ca3af'
    totalEarnedCoins.value = 0
    totalSpent.value = 0
    lastRewardedAt.value = null
    awaitingOtp.value = false
    pendingPhone.value = null
    authError.value = null
    clearCustomerLocally()
  }

  /**
   * Try restoring customer from localStorage (on page reload).
   * Also checks active Supabase Auth session.
   */
  async function tryRestoreFromLocal() {
    // 1. Check Supabase Auth session
    const session = await getCurrentCustomerSession()
    if (session?.user) {
      authUserId.value = session.user.id
    }

    // 2. Restore display data from localStorage
    const saved = loadCustomerLocally()
    if (saved?.customer_id) {
      customerId.value = saved.customer_id
      fullName.value = saved.full_name ?? null
      phone.value = ((saved as Record<string, unknown>).phone as string) ?? null
      email.value = ((saved as Record<string, unknown>).email as string) ?? null
      cardNumber.value = saved.card_number ?? null

      const savedCoins = (saved.points_balance as number) ?? 0
      currentCoins.value = savedCoins
      pointsBalance.value = savedCoins
      tier.value = (saved.tier as 'bronze' | 'silver' | 'gold' | 'platinum') ?? 'bronze'

      // Infer tier code from legacy tier
      const t = tier.value.toLowerCase()
      if (t === 'gold' || t === 'platinum') {
        tierCode.value = 'GOLD'
        tierName.value = 'Gold'
        badgeColor.value = '#f59e0b'
      } else if (t === 'silver') {
        tierCode.value = 'SILVER'
        tierName.value = 'Silver'
        badgeColor.value = '#c0c0c0'
      } else {
        tierCode.value = 'STANDARD'
        tierName.value = 'Standard'
        badgeColor.value = '#9ca3af'
      }

      // Start realtime subscription
      subscribeToLoyaltyRealtime()
    }
  }

  return {
    // state
    customerId,
    authUserId,
    fullName,
    phone,
    nationalId,
    email,
    isNew,
    loyaltyId,
    cardNumber,
    currentCoins,
    pointsBalance,
    tier,
    tierCode,
    tierName,
    badgeColor,
    totalEarnedCoins,
    totalSpent,
    lastRewardedAt,
    awaitingOtp,
    pendingPhone,
    authError,
    isLoading,
    // computed
    isLoggedIn,
    displayName,
    hasLoyalty,
    loyaltyCardDisplay,
    coins,
    loyaltyTierDisplay,
    loyaltyTierColor,
    // actions
    setCustomer,
    updateLoyalty,
    clearCustomer,
    tryRestoreFromLocal,
    subscribeToLoyaltyRealtime,
    unsubscribeFromLoyaltyRealtime,
  }
})
