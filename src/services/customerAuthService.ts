import { supabase } from 'src/boot/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Customer {
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
  points_balance?: number
  tier?: string
}

// ─── Customer Registration / Lookup ──────────────────────────────────────────

/**
 * Registers a new customer or updates an existing one (by phone).
 * Also auto-creates a loyalty account. Returns full profile.
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
 */
export async function getCustomerByPhone(phone: string): Promise<UpsertResult> {
  const { data, error } = await supabase.rpc('get_customer_by_phone', {
    p_phone: phone.trim(),
  })

  if (error) return { success: false, error: error.message }
  return data as UpsertResult
}

// ─── Session Linking ──────────────────────────────────────────────────────────

/**
 * Links a customer to the current table session (for order binding).
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

// ─── Phone OTP Auth ───────────────────────────────────────────────────────────

/**
 * Sends a phone OTP using Supabase Auth.
 * Uses phone auth which must be enabled in Supabase dashboard.
 */
export async function sendPhoneOtp(phone: string): Promise<{ success: boolean; error?: string }> {
  // Ensure E.164 format
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

/**
 * Fallback: Magic link via email (if phone OTP not configured).
 */
export async function sendMagicLink(email: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: true,
    },
  })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats a phone number to E.164 format for Supabase.
 * Handles Sri Lankan numbers (example): 0771234567 → +94771234567
 */
export function formatPhoneE164(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')

  // Already has country code
  if (phone.startsWith('+')) return phone

  // Local format with leading 0 (Sri Lanka / common format)
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return '+94' + cleaned.slice(1)
  }

  // Already 9-digit local (without 0)
  if (cleaned.length === 9) {
    return '+94' + cleaned
  }

  // Generic: prefix +
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
