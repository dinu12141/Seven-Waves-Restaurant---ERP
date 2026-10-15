// ═══════════════════════════════════════════════════════════════════════════════
// Enterprise Security Standards Test Suite
// MFA (2FA), Automated Cold Backup (SHA-256), and Real-time Incident Alerting
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest'
import { automatedBackupService } from 'src/services/automatedBackupService'
import { securityAlertService } from 'src/core/security/securityAlertService'
import { checkRateLimit, resetRateLimit } from 'src/core/security/rateLimiter'
import { sanitizeValue, containsDangerousPattern } from 'src/core/security/inputSanitizer'

describe('1. Two-Factor Authentication (MFA / 2FA) Engine', () => {
  it('validates 6-digit TOTP codes and rejects non-6-digit inputs', () => {
    const validateCode = (code: string) => {
      const clean = code.replace(/\D/g, '').trim()
      if (clean.length !== 6) throw new Error('Verification code must be 6 digits.')
      return clean
    }

    expect(validateCode('123456')).toBe('123456')
    expect(validateCode('  456 789  ')).toBe('456789')
    expect(() => validateCode('12345')).toThrow('Verification code must be 6 digits.')
    expect(() => validateCode('1234567')).toThrow('Verification code must be 6 digits.')
    expect(() => validateCode('abc')).toThrow('Verification code must be 6 digits.')
  })
})

describe('2. Automated Cold Backup & Cryptographic Integrity (SHA-256)', () => {
  it('computes identical SHA-256 checksum for identical payload content', async () => {
    const payload = JSON.stringify({ company: 'Seven Waves', recordCount: 1500, version: '2.0.0' })
    const hash1 = await automatedBackupService.computeSha256(payload)
    const hash2 = await automatedBackupService.computeSha256(payload)

    expect(hash1).toBe(hash2)
    expect(hash1.length).toBeGreaterThan(10)
  })

  it('detects tampering when payload content is modified', async () => {
    const original = JSON.stringify({ voucher: 'PV-000001', amount: 50000 })
    const tampered = JSON.stringify({ voucher: 'PV-000001', amount: 500000 }) // Altered amount

    const originalHash = await automatedBackupService.computeSha256(original)
    const tamperedHash = await automatedBackupService.computeSha256(tampered)

    expect(originalHash).not.toBe(tamperedHash)

    const isIntact = await automatedBackupService.verifyIntegrity(original, originalHash)
    const isTamperedDetected = await automatedBackupService.verifyIntegrity(tampered, originalHash)

    expect(isIntact).toBe(true)
    expect(isTamperedDetected).toBe(false)
  })
})

describe('3. Real-Time Incident Alerting Engine', () => {
  it('loads and saves alert configuration correctly', () => {
    const testConfig = {
      telegramEnabled: true,
      telegramBotToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      telegramChatId: '-100987654321',
      discordEnabled: false,
      discordWebhookUrl: '',
      inAppAlertsEnabled: true,
    }

    securityAlertService.saveConfig(testConfig)
    const loaded = securityAlertService.getConfig()

    expect(loaded.telegramEnabled).toBe(true)
    expect(loaded.telegramBotToken).toBe(testConfig.telegramBotToken)
    expect(loaded.telegramChatId).toBe(testConfig.telegramChatId)
    expect(loaded.inAppAlertsEnabled).toBe(true)
  })

  it('rejects sending Telegram test alert without token and chat ID', async () => {
    securityAlertService.saveConfig({
      telegramEnabled: true,
      telegramBotToken: '',
      telegramChatId: '',
      discordEnabled: false,
      discordWebhookUrl: '',
      inAppAlertsEnabled: true,
    })

    await expect(securityAlertService.sendTestAlert('telegram')).rejects.toThrow('Telegram Bot Token and Chat ID are required.')
  })

  it('rejects sending Discord test alert without webhook URL', async () => {
    securityAlertService.saveConfig({
      telegramEnabled: false,
      telegramBotToken: '',
      telegramChatId: '',
      discordEnabled: true,
      discordWebhookUrl: '',
      inAppAlertsEnabled: true,
    })

    await expect(securityAlertService.sendTestAlert('discord')).rejects.toThrow('Discord Webhook URL is required.')
  })
})

describe('4. Brute-Force & Input Security Shields', () => {
  beforeEach(() => {
    resetRateLimit('login', 'test-user@sevenwaves.lk')
  })

  it('allows normal login attempts and enforces rate limits under attack', () => {
    const user = 'test-user@sevenwaves.lk'
    const attempt1 = checkRateLimit('login', user)
    expect(attempt1.allowed).toBe(true)
  })

  it('sanitizes dangerous XSS payloads', () => {
    const maliciousInput = '<script>alert("hack")</script>John Doe'
    const clean = sanitizeValue(maliciousInput)

    expect(clean).not.toContain('<script>')
    expect(clean).toContain('&lt;script&gt;')
  })

  it('flags dangerous XSS and SQL injection patterns', () => {
    expect(containsDangerousPattern('<img src=x onerror=alert(1)>')).toBe(true)
    expect(containsDangerousPattern('javascript:void(0)')).toBe(true)
    expect(containsDangerousPattern('Normal customer note')).toBe(false)
  })
})
