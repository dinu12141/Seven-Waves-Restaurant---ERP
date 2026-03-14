import { supabase } from 'src/boot/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Customer {
  customer_id: string
  full_name: string
  phone?: string | null
  national_id?: string | null
  email?: string | null
  loyalty_id?: string | null
  card_number?: string | null
  loyalty_card_no?: string | null
  points_balance?: number
  loyalty_points?: number
  loyalty_tier?: string
  tier?: 'bronze' | 'silver' | 'gold' | 'platinum'
  is_new?: boolean
}

export interface UpsertResult {
  success: boolean
  error?: string
  is_new?: boolean
  customer_id?: string
  full_name?: string
  phone?: string
  national_id?: string | null
  email?: string | null
  loyalty_id?: string | null
  card_number?: string | null
  loyalty_card_no?: string | null
  points_balance?: number
  loyalty_points?: number
  loyalty_tier?: string
  tier?: string
}

// ─── EMAIL / PASSWORD AUTH (PRIMARY FLOW) ─────────────────────────────────────

/**
 * Register a new customer with email/password via Supabase Auth.
 * Then calls the RPC to create the customer profile + loyalty account.
 */
export async function registerCustomerWithEmail(
  fullName: string,
  email: string,
  phone: string,
  password: string,
): Promise<UpsertResult> {
  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
        is_customer: true,
      },
    },
  })

  if (authError) {
    if (authError.message.includes('already registered')) {
      return { success: false, error: 'This email is already registered. Please login instead.' }
    }
    if (authError.message.includes('rate limit')) {
      return {
        success: false,
        error:
          'Too many registration attempts (Security Rate Limit). Please wait 1 hour or change your email address to continue.',
      }
    }
    return { success: false, error: authError.message }
  }

  if (!authData.user) {
    return { success: false, error: 'Registration failed. Please try again.' }
  }

  // 2. Create customer profile in DB
  // The RPC handles duplicate email/phone detection safely at the DB level.
  const { data: profileData, error: profileError } = await supabase.rpc(
    'register_customer_profile',
    {
      p_auth_user_id: authData.user.id,
      p_full_name: fullName.trim(),
      p_email: email.trim().toLowerCase(),
      p_phone: phone.trim() || null,
    },
  )

  if (profileError) {
    return { success: false, error: profileError.message }
  }

  const result = profileData as UpsertResult & {
    loyalty_card_no?: string
    loyalty_points?: number
    loyalty_tier?: string
  }

  // RPC may return success: false for duplicate email/phone
  if (!result?.success) {
    return { success: false, error: result?.error || 'Registration failed. Please try again.' }
  }

  return {
    ...result,
    success: true,
    is_new: true,
    card_number: result.loyalty_card_no,
    points_balance: result.loyalty_points ?? 0,
    tier: (result.loyalty_tier as 'bronze' | 'silver' | 'gold' | 'platinum') ?? 'bronze',
  }
}

/**
 * Login an existing customer with email/password.
 * Fetches customer profile after auth.
 */
export async function loginCustomerWithEmail(
  email: string,
  password: string,
): Promise<UpsertResult> {
  // 1. Supabase Auth sign in
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })

  if (authError) {
    if (authError.message.includes('Invalid login credentials')) {
      return { success: false, error: 'Incorrect email or password. Please try again.' }
    }
    return { success: false, error: authError.message }
  }

  if (!authData.user) {
    return { success: false, error: 'Login failed. Please try again.' }
  }

  // 2. Fetch customer profile
  const { data: profileData, error: profileError } = await supabase.rpc(
    'get_customer_profile_by_auth',
    { p_auth_user_id: authData.user.id },
  )

  if (profileError || !profileData) {
    // Customer profile not found — this might be an ERP user who isn't a customer
    // Create a minimal profile for them
    const createResult = await supabase.rpc('register_customer_profile', {
      p_auth_user_id: authData.user.id,
      p_full_name: authData.user.user_metadata?.full_name || email.split('@')[0],
      p_email: authData.user.email,
      p_phone: null,
    })

    if (createResult.error) {
      return { success: false, error: 'Profile not found. Please register first.' }
    }
    const result = createResult.data as UpsertResult
    return {
      ...result,
      success: true,
      is_new: false,
      card_number: result.loyalty_card_no,
      points_balance: result.loyalty_points ?? 0,
      tier: (result.loyalty_tier ?? 'bronze') as 'bronze' | 'silver' | 'gold' | 'platinum',
    }
  }

  const result = profileData as UpsertResult & {
    loyalty_card_no?: string
    loyalty_points?: number
    loyalty_tier?: string
  }

  if (!result.success) {
    return { success: false, error: result.error || 'Profile not found. Please register first.' }
  }

  return {
    ...result,
    success: true,
    is_new: false,
    card_number: result.loyalty_card_no,
    points_balance: result.loyalty_points ?? 0,
    tier: (result.loyalty_tier ?? 'bronze') as 'bronze' | 'silver' | 'gold' | 'platinum',
  }
}

/**
 * Sign out the customer from Supabase Auth.
 */
export async function signOutCustomer(): Promise<void> {
  await supabase.auth.signOut()
}

/**
 * Get the current Supabase Auth session (for restoring state on reload).
 */
export async function getCurrentCustomerSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

// ─── LEGACY PHONE-BASED FLOW (Preserved for backward compat) ─────────────────

/**
 * Registers a new customer or updates an existing one (by phone).
 * Also auto-creates a loyalty account. Returns full profile.
 * @deprecated Use registerCustomerWithEmail for new flows
 */
export async function upsertCustomerByPhone(
  name: string,
  phone: string,
  nationalId?: string,
  email?: string,
): Promise<UpsertResult> {
  const { data, error } = await supabase.rpc('upsert_customer_by_phone', {
    p_name: name.trim(),
    p_phone: phone.trim(),
    p_national_id: nationalId?.trim() || null,
    p_email: email?.trim() || null,
  })

  if (error) return { success: false, error: error.message }
  return data as UpsertResult
}

/**
 * Lookup a customer by phone. Returns null if not found.
 * @deprecated Use email-based flow for new implementations
 */
export async function getCustomerByPhone(phone: string): Promise<UpsertResult> {
  const { data, error } = await supabase.rpc('get_customer_by_phone', {
    p_phone: phone.trim(),
  })

  if (error) return { success: false, error: error.message }
  return data as UpsertResult
}

// ─── SESSION LINKING ──────────────────────────────────────────────────────────

/**
 * Links a customer to the current table session (legacy).
 */
export async function linkCustomerToSession(
  customerId: string,
  tableSessionId: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('link_customer_to_session', {
    p_customer_id: customerId,
    p_table_session_id: tableSessionId,
  })

  if (error) return { success: false, error: error.message }
  return data as { success: boolean }
}

/**
 * Links a customer to the current table session (v2 — with table/branch).
 */
export async function linkCustomerToSessionV2(
  customerId: string,
  tableSessionId: string,
  tableId?: string | null,
  branchId?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('link_customer_to_session_v2', {
    p_customer_id: customerId,
    p_table_session_id: tableSessionId,
    p_table_id: tableId || null,
    p_branch_id: branchId || null,
  })

  if (error) return { success: false, error: error.message }
  return data as { success: boolean }
}

// ─── PHONE OTP AUTH (Preserved) ───────────────────────────────────────────────

/**
 * Sends a phone OTP using Supabase Auth.
 */
export async function sendPhoneOtp(phone: string): Promise<{ success: boolean; error?: string }> {
  const formattedPhone = formatPhoneE164(phone)

  const { error } = await supabase.auth.signInWithOtp({
    phone: formattedPhone,
  })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Verifies the OTP entered by the customer.
 */
export async function verifyPhoneOtp(
  phone: string,
  token: string,
): Promise<{ success: boolean; error?: string; userId?: string }> {
  const formattedPhone = formatPhoneE164(phone)

  const { data, error } = await supabase.auth.verifyOtp({
    phone: formattedPhone,
    token: token.trim(),
    type: 'sms',
  })

  if (error) return { success: false, error: error.message }
  return { success: true, userId: data.user?.id }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats a phone number to E.164 format for Supabase.
 */
export function formatPhoneE164(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')

  if (phone.startsWith('+')) return phone
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return '+94' + cleaned.slice(1)
  }
  if (cleaned.length === 9) {
    return '+94' + cleaned
  }
  return '+' + cleaned
}

/**
 * Persist customer info locally (no sensitive auth token — only display data).
 */
const CUSTOMER_LOCAL_KEY = 'sw_customer'

export function saveCustomerLocally(customer: Partial<Customer>): void {
  localStorage.setItem(CUSTOMER_LOCAL_KEY, JSON.stringify(customer))
}

export function loadCustomerLocally(): Partial<Customer> | null {
  try {
    const raw = localStorage.getItem(CUSTOMER_LOCAL_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearCustomerLocally(): void {
  localStorage.removeItem(CUSTOMER_LOCAL_KEY)
}

// ─── Admin Services ───────────────────────────────────────────────────────────

/**
 * Fetch customers list for admin dashboard.
 */
export async function adminGetCustomers(params: {
  search?: string
  active?: boolean | null
  limit?: number
  offset?: number
}): Promise<{
  success: boolean
  data?: Customer[]
  total?: number
  error?: string
}> {
  const { data, error } = await supabase.rpc('admin_get_customers', {
    p_search: params.search || null,
    p_active: params.active ?? null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  })

  if (error) return { success: false, error: error.message }
  return data as { success: boolean; data: Customer[]; total: number }
}

/**
 * Fetch detailed customer info for admin.
 */
export async function adminGetCustomerDetail(customerId: string): Promise<{
  success: boolean
  customer?: Record<string, unknown>
  sessions?: Record<string, unknown>[]
  orders?: Record<string, unknown>[]
  activity?: Record<string, unknown>[]
  error?: string
}> {
  const { data, error } = await supabase.rpc('admin_get_customer_detail', {
    p_customer_id: customerId,
  })

  if (error) return { success: false, error: error.message }
  return data as {
    success: boolean
    customer: Record<string, unknown>
    sessions: Record<string, unknown>[]
    orders: Record<string, unknown>[]
    activity: Record<string, unknown>[]
  }
}

/**
 * Delete a customer record from the database.
 */
export async function adminDeleteCustomer(customerId: string): Promise<{
  success: boolean
  error?: string
}> {
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', customerId)

  if (error) {
    if (error.code === '23503') {
      return { success: false, error: 'Cannot delete customer - they have associated orders or loyalty points.' }
    }
    return { success: false, error: error.message }
  }
  
  return { success: true }
}
