#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Supabase Migration Deployment Script
# Seven Waves ERP — Step 03E
# ═══════════════════════════════════════════════════════════════════
# Usage: ./scripts/deploy-migrations.sh [staging|production]
#
# Prerequisites:
#   - Supabase CLI installed: npm i -g supabase
#   - SUPABASE_ACCESS_TOKEN set in environment
#
# Project References (hardcoded for safety):
#   Staging:    lirnqrcjbjncumwxrlqo
#   Production: clykwuzajtwvwuavmtzs

set -euo pipefail

ENV="${1:-staging}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# ── Environment-specific project refs ─────────────────────────────
case "$ENV" in
  staging)
    PROJECT_REF="lirnqrcjbjncumwxrlqo"
    echo "═══════════════════════════════════════════════════════════"
    echo "  Seven Waves ERP — Migration Deployment"
    echo "  Environment: STAGING"
    echo "  Project:     $PROJECT_REF"
    echo "  Timestamp:   $TIMESTAMP"
    echo "═══════════════════════════════════════════════════════════"
    ;;
  production)
    PROJECT_REF="clykwuzajtwvwuavmtzs"
    echo "═══════════════════════════════════════════════════════════"
    echo "  ⚠️  Seven Waves ERP — PRODUCTION Migration Deployment"
    echo "  Project:     $PROJECT_REF"
    echo "  Timestamp:   $TIMESTAMP"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    read -p "  Are you sure you want to deploy to PRODUCTION? (yes/no): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
      echo "  ❌ Aborted."
      exit 1
    fi
    ;;
  *)
    echo "❌ Unknown environment: $ENV"
    echo "Usage: ./scripts/deploy-migrations.sh [staging|production]"
    exit 1
    ;;
esac

# ── 1. Validate Environment ───────────────────────────────────────
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "❌ SUPABASE_ACCESS_TOKEN not set"
  exit 1
fi

# ── 2. Isolation Check ────────────────────────────────────────────
echo ""
echo "🔒 Step 1: Verifying environment isolation..."
if [ "$ENV" = "staging" ] && [ "$PROJECT_REF" = "clykwuzajtwvwuavmtzs" ]; then
  echo "  ❌ FATAL: Staging script is pointing to production project!"
  exit 1
fi
if [ "$ENV" = "production" ] && [ "$PROJECT_REF" = "lirnqrcjbjncumwxrlqo" ]; then
  echo "  ❌ FATAL: Production script is pointing to staging project!"
  exit 1
fi
echo "  ✅ Isolation verified: $ENV → $PROJECT_REF"

# ── 3. Validate SQL Files ─────────────────────────────────────────
echo ""
echo "📋 Step 2: Validating SQL files..."
ERRORS=0
for f in supabase/migrations/*.sql; do
  if grep -q "DROP TABLE " "$f" && ! grep -q "IF EXISTS" "$f"; then
    echo "  ❌ Unsafe DROP TABLE in $f"
    ERRORS=$((ERRORS+1))
  fi
  if grep -q "TRUNCATE" "$f"; then
    echo "  ❌ TRUNCATE found in $f"
    ERRORS=$((ERRORS+1))
  fi
done

if [ "$ERRORS" -gt 0 ]; then
  echo "❌ $ERRORS validation errors found. Fix before deploying."
  exit 1
fi
echo "  ✅ All SQL files validated"

# ── 4. Link to Project ────────────────────────────────────────────
echo ""
echo "🔗 Step 3: Linking to Supabase project ($PROJECT_REF)..."
npx supabase link --project-ref "$PROJECT_REF"

# ── 5. Push Migrations ────────────────────────────────────────────
echo ""
echo "📦 Step 4: Pushing migrations to $ENV..."
npx supabase db push

# ── 6. Deploy Edge Functions ──────────────────────────────────────
echo ""
echo "⚡ Step 5: Deploying Edge Functions to $ENV..."
for func_dir in supabase/functions/*/; do
  func_name=$(basename "$func_dir")
  echo "  Deploying: $func_name → $PROJECT_REF"
  npx supabase functions deploy "$func_name" --project-ref "$PROJECT_REF" || {
    echo "  ⚠️ Failed to deploy $func_name — continuing"
  }
done

# ── 7. Health Checks ──────────────────────────────────────────────
echo ""
echo "🏥 Step 6: Running health checks on $ENV..."

# Check tables exist
echo "  Checking tables..."
npx supabase db execute --project-ref "$PROJECT_REF" \
  "SELECT count(*) as table_count FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null || echo "  ⚠️ Could not check tables"

# Check RLS
echo "  Checking RLS..."
npx supabase db execute --project-ref "$PROJECT_REF" \
  "SELECT count(*) as tables_without_rls FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false" 2>/dev/null || echo "  ⚠️ Could not check RLS"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ Migration deployment complete"
echo "  Environment: $ENV"
echo "  Project:     $PROJECT_REF"
echo "  Timestamp:   $TIMESTAMP"
echo "═══════════════════════════════════════════════════════════"
