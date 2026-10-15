// ═══════════════════════════════════════════════════════════════════════════════
// MFA Service — Multi-Factor Authentication (TOTP / Google Authenticator)
// Seven Waves Restaurant ERP — Enterprise Security Standard
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { logSecurityEvent, SecurityCategory, SecuritySeverity } from './securityLogger'

export interface MfaStatus {
  enabled: boolean
  factorId: string | null
  currentLevel: string
  nextLevel: string
  factorName: string | null
}

export interface MfaEnrollmentResult {
  id: string
  qrCodeUrl: string
  secret: string
  uri: string
}

export const mfaService = {
  /**
   * Check MFA status of the current logged-in user.
   */
  async getStatus(): Promise<MfaStatus> {
    try {
      const { data: aal, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aalErr) throw aalErr

      const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors()
      if (fErr) throw fErr

      const totpFactors = factors?.totp || []
      const verifiedFactor = totpFactors.find((f: any) => f.status === 'verified')

      return {
        enabled: Boolean(verifiedFactor),
        factorId: verifiedFactor?.id || null,
        currentLevel: aal?.currentLevel || 'aal1',
        nextLevel: aal?.nextLevel || 'aal1',
        factorName: verifiedFactor?.friendly_name || 'Authenticator App',
      }
    } catch (err: any) {
      console.warn('[MFA] Failed to check status:', err)
      return {
        enabled: false,
        factorId: null,
        currentLevel: 'aal1',
        nextLevel: 'aal1',
        factorName: null,
      }
    }
  },

  /**
   * Start 2FA enrollment for current user.
   * Returns QR code (SVG data URL) and base32 secret.
   */
  async startEnrollment(friendlyName = 'Google Authenticator'): Promise<MfaEnrollmentResult> {
    const user = (await supabase.auth.getUser()).data?.user
    if (!user) throw new Error('User not logged in.')

    // Clean up any unverified factors first
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const unverified = (factors?.totp || []).filter((f: any) => f.status === 'unverified')
    for (const uf of unverified) {
      await supabase.auth.mfa.unenroll({ factorId: uf.id }).catch(() => {})
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'Seven Waves ERP',
      friendlyName: `${friendlyName} (${user.email})`,
    })

    if (error) throw error
    if (!data?.totp) throw new Error('Failed to generate TOTP secret.')

    return {
      id: data.id,
      qrCodeUrl: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    }
  },

  /**
   * Verify enrollment by entering the 6-digit code.
   */
  async verifyEnrollment(factorId: string, code: string): Promise<boolean> {
    const cleanCode = code.replace(/\D/g, '').trim()
    if (cleanCode.length !== 6) throw new Error('Verification code must be 6 digits.')

    const { data, error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: cleanCode,
    })

    if (error) throw error

    logSecurityEvent({
      category: SecurityCategory.AUTH,
      severity: SecuritySeverity.INFO,
      message: 'Two-factor authentication (2FA) successfully enrolled and verified',
      metadata: { factorId },
    })

    return true
  },

  /**
   * Unenroll / Disable 2FA for the current user.
   */
  async unenroll(factorId: string): Promise<boolean> {
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    if (error) throw error

    logSecurityEvent({
      category: SecurityCategory.AUTH,
      severity: SecuritySeverity.WARNING,
      message: 'Two-factor authentication (2FA) was disabled',
      metadata: { factorId },
    })

    return true
  },

  /**
   * Challenge & Verify 2FA code during login.
   */
  async verifyLogin(factorId: string, code: string): Promise<any> {
    const cleanCode = code.replace(/\D/g, '').trim()
    if (cleanCode.length !== 6) throw new Error('Verification code must be 6 digits.')

    const { data, error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: cleanCode,
    })

    if (error) {
      logSecurityEvent({
        category: SecurityCategory.AUTH,
        severity: SecuritySeverity.WARNING,
        message: 'Invalid 2FA verification attempt during login',
        metadata: { factorId, error: error.message },
      })
      throw error
    }

    logSecurityEvent({
      category: SecurityCategory.AUTH,
      severity: SecuritySeverity.INFO,
      message: 'Two-factor verification successful during login (AAL2 granted)',
      metadata: { factorId },
    })

    return data
  },
}
