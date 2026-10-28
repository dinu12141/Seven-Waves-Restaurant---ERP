/**
 * Client-side password policy used by the reset-password page.
 * (Supabase Auth enforces its own server-side minimum; this is the UX gate.)
 *
 * @param {string} password
 * @param {string} confirm
 * @returns {string|null} an error message, or null when acceptable
 */
export const PASSWORD_MIN_LENGTH = 8

export function validateNewPassword(password, confirm) {
  const pw = typeof password === 'string' ? password : ''
  if (!pw) return 'Password is required'
  if (pw.length < PASSWORD_MIN_LENGTH) return `Minimum ${PASSWORD_MIN_LENGTH} characters required`
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use at least one letter and one number'
  if (pw !== confirm) return 'Passwords do not match'
  return null
}
