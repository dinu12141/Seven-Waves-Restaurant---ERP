import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  saveCustomerLocally,
  loadCustomerLocally,
  clearCustomerLocally,
} from 'src/services/customerAuthService'
import type { LoyaltyAccount } from 'src/services/loyaltyService'

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCustomerStore = defineStore('customer', () => {
  // ── State ──────────────────────────────────────────────────────────────────

  const customerId = ref<string | null>(null)
  const fullName = ref<string | null>(null)
  const phone = ref<string | null>(null)
  const nationalId = ref<string | null>(null)
  const email = ref<string | null>(null)
  const isNew = ref<boolean>(false)

  // Loyalty state
  const loyaltyId = ref<string | null>(null)
  const cardNumber = ref<string | null>(null)
  const pointsBalance = ref<number>(0)
  const tier = ref<'bronze' | 'silver' | 'gold' | 'platinum'>('bronze')

  // Auth state (OTP flow)
  const awaitingOtp = ref<boolean>(false)
  const pendingPhone = ref<string | null>(null)
  const authError = ref<string | null>(null)
  const isLoading = ref<boolean>(false)

  // ── Computed ───────────────────────────────────────────────────────────────

  const isLoggedIn = computed(() => !!customerId.value)
  const displayName = computed(() => fullName.value ?? phone.value ?? 'Guest')
  const hasLoyalty = computed(() => !!cardNumber.value)

  // ── Actions ────────────────────────────────────────────────────────────────

  function setCustomer(data: {
    customer_id: string
    full_name: string
    phone: string
    national_id?: string | null
    email?: string | null
    loyalty_id?: string | null
    card_number?: string | null
    points_balance?: number
    tier?: 'bronze' | 'silver' | 'gold' | 'platinum'
    is_new?: boolean
  }) {
    customerId.value = data.customer_id
    fullName.value = data.full_name
    phone.value = data.phone
    nationalId.value = data.national_id ?? null
    email.value = data.email ?? null
    loyaltyId.value = data.loyalty_id ?? null
    cardNumber.value = data.card_number ?? null
    pointsBalance.value = data.points_balance ?? 0
    tier.value = data.tier ?? 'bronze'
    isNew.value = data.is_new ?? false

    // Persist non-sensitive display data
    saveCustomerLocally({
      customer_id: data.customer_id,
      full_name: data.full_name,
      phone: data.phone,
      card_number: data.card_number ?? undefined,
      points_balance: data.points_balance ?? 0,
      tier: data.tier ?? 'bronze',
    })
  }

  function updateLoyalty(account: Partial<LoyaltyAccount>) {
    if (account.points_balance !== undefined) pointsBalance.value = account.points_balance
    if (account.tier) tier.value = account.tier
  }

  function clearCustomer() {
    customerId.value = null
    fullName.value = null
    phone.value = null
    nationalId.value = null
    email.value = null
    isNew.value = false
    loyaltyId.value = null
    cardNumber.value = null
    pointsBalance.value = 0
    tier.value = 'bronze'
    awaitingOtp.value = false
    pendingPhone.value = null
    authError.value = null
    clearCustomerLocally()
  }

  /**
   * Try restoring customer from localStorage (on page reload).
   * Call this on app startup.
   */
  function tryRestoreFromLocal() {
    const saved = loadCustomerLocally()
    if (saved?.customer_id) {
      customerId.value = saved.customer_id
      fullName.value = saved.full_name ?? null
      phone.value = saved.phone ?? null
      cardNumber.value = saved.card_number ?? null
      pointsBalance.value = (saved.points_balance as number) ?? 0
      tier.value = (saved.tier as 'bronze' | 'silver' | 'gold' | 'platinum') ?? 'bronze'
    }
  }

  return {
    // state
    customerId,
    fullName,
    phone,
    nationalId,
    email,
    isNew,
    loyaltyId,
    cardNumber,
    pointsBalance,
    tier,
    awaitingOtp,
    pendingPhone,
    authError,
    isLoading,
    // computed
    isLoggedIn,
    displayName,
    hasLoyalty,
    // actions
    setCustomer,
    updateLoyalty,
    clearCustomer,
    tryRestoreFromLocal,
  }
})
