// ═══════════════════════════════════════════════════════════════════════════════
// Real-Time Security Alerting Service — Webhook & Notification Engine
// Seven Waves Restaurant ERP — Enterprise Incident Response
// ═══════════════════════════════════════════════════════════════════════════════

import { Notify } from 'quasar'
import { SecuritySeverity } from './securityLogger'

export interface AlertConfig {
  telegramEnabled: boolean
  telegramBotToken: string
  telegramChatId: string
  discordEnabled: boolean
  discordWebhookUrl: string
  inAppAlertsEnabled: boolean
}

const STORAGE_ALERT_CONFIG_KEY = 'sw_erp_security_alert_config'
let memoryConfig: AlertConfig | null = null

export const securityAlertService = {
  /**
   * Load alert notification configuration.
   */
  getConfig(): AlertConfig {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_ALERT_CONFIG_KEY)
        if (raw) return JSON.parse(raw)
      } else if (memoryConfig) {
        return { ...memoryConfig }
      }
    } catch {}
    return {
      telegramEnabled: false,
      telegramBotToken: '',
      telegramChatId: '',
      discordEnabled: false,
      discordWebhookUrl: '',
      inAppAlertsEnabled: true,
    }
  },

  /**
   * Save alert notification configuration.
   */
  saveConfig(config: AlertConfig): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_ALERT_CONFIG_KEY, JSON.stringify(config))
      }
      memoryConfig = { ...config }
    } catch (e) {
      console.warn('[SecurityAlert] Failed to save config:', e)
    }
  },

  /**
   * Dispatch an instant security alert across enabled channels.
   */
  async dispatchAlert(alert: {
    title: string
    message: string
    severity?: string
    category?: string
    metadata?: Record<string, any>
  }): Promise<{ dispatchedChannels: string[]; errors: string[] }> {
    const config = this.getConfig()
    const dispatchedChannels: string[] = []
    const errors: string[] = []

    const timestamp = new Date().toLocaleString()
    const severity = alert.severity || SecuritySeverity.WARNING
    const isCritical = severity === SecuritySeverity.CRITICAL || severity === SecuritySeverity.ALERT

    // 1. In-App Notification (for active admin sessions)
    if (config.inAppAlertsEnabled && typeof window !== 'undefined') {
      try {
        Notify.create({
          type: isCritical ? 'negative' : 'warning',
          icon: isCritical ? 'gpp_bad' : 'shield',
          message: `[SECURITY ALERT] ${alert.title}: ${alert.message}`,
          position: 'top',
          timeout: isCritical ? 10000 : 5000,
          actions: [{ label: 'Dismiss', color: 'white' }],
        })
        dispatchedChannels.push('in-app')
      } catch {}
    }

    // 2. Telegram Webhook Alert
    if (config.telegramEnabled && config.telegramBotToken && config.telegramChatId) {
      try {
        const icon = isCritical ? '🚨' : '⚠️'
        const telegramText =
          `${icon} *Seven Waves ERP — Security Alert*\n\n` +
          `*Event:* ${alert.title}\n` +
          `*Severity:* ${severity.toUpperCase()}\n` +
          `*Time:* ${timestamp}\n` +
          `*Details:* ${alert.message}\n` +
          (alert.metadata ? `\`\`\`json\n${JSON.stringify(alert.metadata, null, 2)}\n\`\`\`` : '')

        const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: config.telegramChatId,
            text: telegramText,
            parse_mode: 'Markdown',
          }),
        })

        if (!res.ok) {
          const errText = await res.text()
          errors.push(`Telegram: ${errText}`)
        } else {
          dispatchedChannels.push('telegram')
        }
      } catch (err: any) {
        errors.push(`Telegram: ${err.message}`)
      }
    }

    // 3. Discord Webhook Alert
    if (config.discordEnabled && config.discordWebhookUrl) {
      try {
        const color = isCritical ? 0xdc2626 : 0xf59e0b
        const discordPayload = {
          embeds: [
            {
              title: `🛡️ Security Alert: ${alert.title}`,
              description: alert.message,
              color,
              timestamp: new Date().toISOString(),
              fields: [
                { name: 'Severity', value: severity.toUpperCase(), inline: true },
                { name: 'Category', value: alert.category || 'General', inline: true },
              ],
              footer: { text: 'Seven Waves Restaurant ERP Security Sentinel' },
            },
          ],
        }

        const res = await fetch(config.discordWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(discordPayload),
        })

        if (!res.ok) {
          errors.push(`Discord: HTTP ${res.status}`)
        } else {
          dispatchedChannels.push('discord')
        }
      } catch (err: any) {
        errors.push(`Discord: ${err.message}`)
      }
    }

    return { dispatchedChannels, errors }
  },

  /**
   * Send test alert to verify Telegram or Discord connection.
   */
  async sendTestAlert(channel: 'telegram' | 'discord'): Promise<boolean> {
    const config = this.getConfig()

    if (channel === 'telegram') {
      if (!config.telegramBotToken || !config.telegramChatId) {
        throw new Error('Telegram Bot Token and Chat ID are required.')
      }
      const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.telegramChatId,
          text: `✅ *Seven Waves ERP Alerting Verified!*\n\nThis is a test notification confirming your Telegram alert pipeline is active and working.`,
          parse_mode: 'Markdown',
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Telegram error: ${errText}`)
      }
      return true
    }

    if (channel === 'discord') {
      if (!config.discordWebhookUrl) {
        throw new Error('Discord Webhook URL is required.')
      }
      const res = await fetch(config.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '✅ **Seven Waves ERP Alerting Verified!** Discord security webhook is active.',
        }),
      })
      if (!res.ok) {
        throw new Error(`Discord error: HTTP ${res.status}`)
      }
      return true
    }

    return false
  },
}
