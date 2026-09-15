#!/bin/bash
# cleanup-legacy.sh
# Run this ONCE from your project root if you extracted the rebuilt engine
# INTO an existing mails2leadz checkout instead of replacing the folder
# wholesale. Copying new files on top only adds/overwrites matching
# filenames — it never removes what doesn't belong anymore, which is how
# you can end up with a stale `app/dashboard/layout.js` or old page routes
# (e.g. /crm) still referencing providers/tables that no longer exist and
# breaking `next build` with errors like "useNotifications must be used
# within NotificationProvider".
#
# Safe to run even if a path is already gone — every step is a no-op then.
# Usage:  bash cleanup-legacy.sh

set -e
cd "$(dirname "$0")"

echo "Removing old page routes..."
rm -rf app/crm app/ai-monitoring app/ai-tools app/analytics app/leads

echo "Removing old providers/components/hooks (app-level and root-level)..."
rm -rf app/components app/components_DISABLED app/hooks \
       app/lib app/lib_DISABLED app/format_DISABLED \
       components hooks

echo "Cleaning app/dashboard/ — keeping only the new page.js and settings/..."
if [ -d app/dashboard ]; then
  find app/dashboard -mindepth 1 -maxdepth 1 \
    ! -name 'page.js' ! -name 'settings' -exec rm -rf {} +
fi

is_kept() {
  # exact whole-token match — avoids grep -w treating "ai" as matching
  # inside the token "ai.js" (word-boundary matching is too loose here)
  local needle="$1"; shift
  for item in "$@"; do
    [ "$item" = "$needle" ] && return 0
  done
  return 1
}

echo "Cleaning root lib/ — keeping only the new engine's files..."
KEEP_LIB="account.js ai.js cronAuth.js followup.js gmail.js quota.js supabase.js supabaseBrowser.js supabaseServer.js unsubscribe.js whatsapp.js"
if [ -d lib ]; then
  for f in lib/*; do
    name=$(basename "$f")
    if ! is_kept "$name" $KEEP_LIB; then
      echo "  removing lib/$name"
      rm -rf "$f"
    fi
  done
fi

echo "Removing old API routes not part of the rebuilt engine..."
KEEP_API="account campaigns followups inbox leads messages unsubscribe webhooks"
if [ -d app/api ]; then
  for dir in app/api/*/; do
    name=$(basename "$dir")
    if ! is_kept "$name" $KEEP_API; then
      echo "  removing app/api/$name"
      rm -rf "$dir"
    fi
  done
fi

echo "Removing unrelated bundled projects and scrapers' output..."
rm -rf ledger anemails
rm -rf database/migrations
rm -rf scripts
rm -rf backend/__pycache__

echo "Removing old root-level debug scripts, doc sprawl, and data dumps..."
find . -maxdepth 1 -name "*.md" ! -name "README.md" -delete 2>/dev/null || true
find . -maxdepth 1 -iname "test-*.js" -delete 2>/dev/null || true
find . -maxdepth 1 -iname "*bracket*.js" -delete 2>/dev/null || true
rm -f analyze-syntax.js temp-start.js temp_check.txt firebase-debug.log \
      minimal-dashboard.js mails2leadz.rar firestore.rules \
      package-lock.json requirements.txt \
      sample-contacts.csv sample-targets.csv 2>/dev/null || true
rm -f business_leads*.csv emails_output.csv google-2025*.csv 2>/dev/null || true
rm -f public/api-diagnostic.js public/diagnose.js 2>/dev/null || true
rm -f app/favicon.ico 2>/dev/null || true

echo "Done. Run 'npm install' before your next build."
