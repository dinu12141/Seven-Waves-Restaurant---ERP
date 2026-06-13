// ═══════════════════════════════════════════════════════════════════
// STRUCTURED LOGGER — Seven Waves ERP
// Step 03A Infrastructure
// ═══════════════════════════════════════════════════════════════════

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  level: LogLevel
  message: string
  data?: Record<string, unknown>
  timestamp: string
  module?: string
}

const LOG_LEVEL = import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.WARN
const MAX_LOG_BUFFER = 200

class Logger {
  private buffer: LogEntry[] = []

  debug(message: string, data?: Record<string, unknown>) {
    this.log(LogLevel.DEBUG, message, data)
  }

  info(message: string, data?: Record<string, unknown>) {
    this.log(LogLevel.INFO, message, data)
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.log(LogLevel.WARN, message, data)
  }

  error(message: string, data?: Record<string, unknown>) {
    this.log(LogLevel.ERROR, message, data)
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
    }

    // Buffer for export/audit
    this.buffer.unshift(entry)
    if (this.buffer.length > MAX_LOG_BUFFER) this.buffer.pop()

    // Console output (respects log level)
    if (level < LOG_LEVEL) return

    const prefix = `[${LogLevel[level]}]`
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(prefix, message, data || '')
        break
      case LogLevel.INFO:
        console.info(prefix, message, data || '')
        break
      case LogLevel.WARN:
        console.warn(prefix, message, data || '')
        break
      case LogLevel.ERROR:
        console.error(prefix, message, data || '')
        break
    }
  }

  /** Get buffered logs for export/debug */
  getBuffer(): LogEntry[] {
    return [...this.buffer]
  }

  /** Clear log buffer */
  clear() {
    this.buffer = []
  }

  /** Export as downloadable JSON (for support/debug) */
  exportAsJson(): string {
    return JSON.stringify(this.buffer, null, 2)
  }
}

export const logger = new Logger()
