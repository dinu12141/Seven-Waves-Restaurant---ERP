#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Rollback Script — Revert to Previous Deployment
# Seven Waves ERP — Step 03E
# ═══════════════════════════════════════════════════════════════════
# Usage: ./scripts/rollback.sh [netlify|supabase] [deploy-id]

set -euo pipefail

TARGET="${1:-netlify}"
DEPLOY_ID="${2:-}"

echo "═══════════════════════════════════════════════════════════"
echo "  Seven Waves ERP — Rollback"
echo "  Target: $TARGET"
echo "═══════════════════════════════════════════════════════════"

case "$TARGET" in
  netlify)
    echo ""
    echo "🔄 Rolling back Netlify deployment..."
    echo ""
    echo "Option 1: Via Netlify CLI"
    echo "  npx netlify-cli rollback"
    echo ""
    echo "Option 2: Via Netlify Dashboard"
    echo "  1. Go to: https://app.netlify.com/sites/YOUR_SITE/deploys"
    echo "  2. Find the last known good deploy"
    echo "  3. Click → Publish deploy"
    echo ""
    echo "Option 3: Via API (if DEPLOY_ID provided)"
    if [ -n "$DEPLOY_ID" ]; then
      echo "  Restoring deploy: $DEPLOY_ID"
      npx netlify-cli api restoreSiteDeploy --data "{\"deploy_id\": \"$DEPLOY_ID\"}" || {
        echo "  ❌ API rollback failed. Use dashboard."
      }
    fi
    ;;

  supabase)
    echo ""
    echo "⚠️  Supabase Database Rollback"
    echo ""
    echo "CAUTION: Database rollbacks require manual intervention."
    echo ""
    echo "Options:"
    echo "  1. PITR (Point-in-Time Recovery) — Pro plan only"
    echo "     → Supabase Dashboard → Database → Backups → PITR"
    echo ""
    echo "  2. Manual SQL rollback"
    echo "     → Write and execute a reverse migration"
    echo "     → Test on staging FIRST"
    echo ""
    echo "  3. Restore from daily backup"
    echo "     → Supabase Dashboard → Database → Backups"
    echo "     → Download and restore"
    echo ""
    echo "  ❌ NEVER run DROP TABLE in production without a backup."
    ;;

  *)
    echo "❌ Unknown target: $TARGET"
    echo "Usage: ./scripts/rollback.sh [netlify|supabase] [deploy-id]"
    exit 1
    ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Rollback procedure complete. Verify the deployment."
echo "═══════════════════════════════════════════════════════════"
