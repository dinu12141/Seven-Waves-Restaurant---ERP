// ═══════════════════════════════════════════════════════════════════
// CSP HEADERS — Content Security Policy Configuration
// Seven Waves ERP — Step 07 Production Hardening
// Deploy: Netlify _headers file OR edge function
// ═══════════════════════════════════════════════════════════════════

/**
 * Content Security Policy for production.
 * Restricts script sources, prevents XSS, and blocks unwanted resources.
 */
export const CSP_POLICY = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],  // No inline scripts in Quasar prod build (verified dist/spa/index.html)
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:', 'blob:', 'https://*.supabase.co'],
  'connect-src': [
    "'self'",
    'https://*.supabase.co',         // Supabase API
    'wss://*.supabase.co',           // Supabase Realtime
    'https://generativelanguage.googleapis.com',  // Gemini API (via edge fn)
  ],
  'media-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],     // Prevent clickjacking
  'upgrade-insecure-requests': [],
}

/**
 * Build CSP header string.
 */
export function buildCSPHeader(policy = CSP_POLICY) {
  return Object.entries(policy)
    .map(([directive, sources]) => {
      if (sources.length === 0) return directive
      return `${directive} ${sources.join(' ')}`
    })
    .join('; ')
}

/**
 * All security headers for production deployment.
 */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': buildCSPHeader(),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

/**
 * Generate Netlify _headers file content.
 */
export function generateNetlifyHeaders() {
  const lines = ['/*']
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    lines.push(`  ${header}: ${value}`)
  }
  return lines.join('\n')
}
