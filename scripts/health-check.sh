#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Production Health Check Script
# Seven Waves ERP — Step 03E
# ═══════════════════════════════════════════════════════════════════
# Usage: ./scripts/health-check.sh https://app.sevenwaves.lk

set -euo pipefail

URL="${1:-https://app.sevenwaves.lk}"
PASSED=0
WARNED=0
FAILED=0

echo "═══════════════════════════════════════════════════════════"
echo "  Seven Waves ERP — Production Health Check"
echo "  URL: $URL"
echo "  Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "═══════════════════════════════════════════════════════════"

# ── 1. App Loads ──────────────────────────────────────────────────
echo ""
echo "📡 1. App Availability"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL" --max-time 15)
LOAD_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$URL" --max-time 15)
if [ "$STATUS" = "200" ]; then
  echo "  ✅ HTTP 200 OK (${LOAD_TIME}s)"
  PASSED=$((PASSED+1))
  if [ "$(echo "$LOAD_TIME > 3.0" | bc -l 2>/dev/null || echo 0)" = "1" ]; then
    echo "  ⚠️ Slow load time: ${LOAD_TIME}s (target: <3s)"
    WARNED=$((WARNED+1))
  fi
else
  echo "  ❌ HTTP $STATUS"
  FAILED=$((FAILED+1))
fi

# ── 2. Security Headers ──────────────────────────────────────────
echo ""
echo "🔒 2. Security Headers"
HEADERS=$(curl -sI "$URL" --max-time 10)
for HEADER in "x-content-type-options" "x-frame-options" "referrer-policy" "strict-transport-security" "content-security-policy" "permissions-policy"; do
  if echo "$HEADERS" | grep -qi "$HEADER"; then
    echo "  ✅ $HEADER"
    PASSED=$((PASSED+1))
  else
    echo "  ❌ Missing: $HEADER"
    FAILED=$((FAILED+1))
  fi
done

# ── 3. HTTPS ──────────────────────────────────────────────────────
echo ""
echo "🔐 3. HTTPS"
if echo "$URL" | grep -q "^https://"; then
  echo "  ✅ HTTPS enforced"
  PASSED=$((PASSED+1))
else
  echo "  ❌ Not using HTTPS!"
  FAILED=$((FAILED+1))
fi

# ── 4. PWA Assets ────────────────────────────────────────────────
echo ""
echo "📱 4. PWA Assets"
for ASSET in "/manifest.json" "/sw.js"; do
  ASSET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${URL}${ASSET}" --max-time 10 2>/dev/null || echo "000")
  if [ "$ASSET_STATUS" = "200" ]; then
    echo "  ✅ $ASSET (HTTP 200)"
    PASSED=$((PASSED+1))
  else
    echo "  ⚠️ $ASSET (HTTP $ASSET_STATUS)"
    WARNED=$((WARNED+1))
  fi
done

# ── 5. Cache Headers on Assets ───────────────────────────────────
echo ""
echo "💾 5. Cache Configuration"
BODY=$(curl -s "$URL")
# Extract first .js asset reference
ASSET_URL=$(echo "$BODY" | grep -oP 'src="/assets/[^"]+\.js' | head -1 | sed 's/src="//')
if [ -n "$ASSET_URL" ]; then
  ASSET_HEADERS=$(curl -sI "${URL}${ASSET_URL}" --max-time 10 2>/dev/null || echo "")
  if echo "$ASSET_HEADERS" | grep -qi "immutable"; then
    echo "  ✅ Immutable cache on hashed assets"
    PASSED=$((PASSED+1))
  else
    echo "  ⚠️ Missing immutable cache header on assets"
    WARNED=$((WARNED+1))
  fi
else
  echo "  ⚠️ Could not find asset URL to test"
  WARNED=$((WARNED+1))
fi

# ── Summary ──────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  RESULTS"
echo "  ✅ Passed:  $PASSED"
echo "  ⚠️  Warned:  $WARNED"
echo "  ❌ Failed:  $FAILED"
echo "═══════════════════════════════════════════════════════════"

if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo "❌ HEALTH CHECK FAILED — Review failures above."
  exit 1
else
  echo ""
  echo "✅ ALL CRITICAL CHECKS PASSED"
fi
