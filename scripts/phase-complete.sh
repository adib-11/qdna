#!/usr/bin/env bash
# Phase Completion Protocol — build, commit, push, and verify the Vercel
# production deployment. A non-zero exit means the phase is NOT complete.
#
#   ./scripts/phase-complete.sh <phase-number> "<conventional commit message>"
set -euo pipefail

PHASE="${1:-}"
MESSAGE="${2:-}"

if [[ -z "$PHASE" || -z "$MESSAGE" ]]; then
  echo "usage: $0 <phase-number> \"<conventional commit message>\"" >&2
  exit 2
fi

PLAN_FILE="plan/feature-qdna-platform-1.md"
POLL_INTERVAL=10
POLL_TIMEOUT=600

cd "$(git rev-parse --show-toplevel)"

# Newest production deployment as "<url> <state>".
#
# `vercel ls` prints its table to *stderr* and only the bare URL list to
# stdout, so stderr must be folded in or there is no status column to read at
# all. The state renders as "● Ready", so the bullet is stripped before the
# columns are split. Rows are identified by the Age column leading with a
# digit, which excludes both the header and the trailing URL list.
newest_deployment() {
  vercel ls --prod 2>&1 | tr -d '●' | awk '
    /^[[:space:]]*[0-9]/ {
      for (i = 1; i <= NF; i++)
        if ($i ~ /^https:\/\//) { print $i, $(i + 1); exit }
    }'
}

# 1. The plan file must record this phase's completion before the phase closes.
#    The plan is git-ignored (it is working material, not shipped code), so the
#    check is on the file itself rather than on the index.
if [[ -f "$PLAN_FILE" ]]; then
  if ! grep -q "^| TASK-.*| ✅ .*|" "$PLAN_FILE"; then
    echo "✗ $PLAN_FILE records no completed tasks." >&2
    echo "  Mark phase $PHASE tasks complete before running this script (GUD-002)." >&2
    exit 1
  fi
fi

# 2. A phase never ships a broken build or a failing test.
echo "→ npm run build"
npm run build
echo "→ npm test"
npm test

# 3. Commit and push.
#    The newest production URL is recorded first so that step 4 can tell a
#    fresh deployment apart from the one that was already live — otherwise the
#    poll reports READY instantly against the previous phase's build.
PREV_URL="$(newest_deployment | awk '{print $1}')"

git add -A
if git diff --cached --quiet; then
  # No new commit means no new deployment, so the currently live one is the
  # one to verify.
  echo "→ nothing to commit; using existing HEAD"
  PREV_URL=""
else
  git commit -m "$MESSAGE"
fi
echo "→ git push origin main"
git push origin main

# 4. Block until the newest production deployment resolves.
echo "→ polling vercel ls --prod"
DEADLINE=$(( $(date +%s) + POLL_TIMEOUT ))
while :; do
  LINE="$(newest_deployment || true)"
  URL="$(printf '%s' "$LINE" | awk '{print $1}')"
  STATE="$(printf '%s' "$LINE" | awk '{print $2}')"

  # A URL unchanged since before the push is the *previous* deployment; the new
  # one has not been registered yet, whatever state this one reports.
  if [[ -n "$PREV_URL" && "$URL" == "$PREV_URL" ]]; then
    STATE="Queued"
  fi

  case "$STATE" in
    Ready|READY)
      echo "✓ phase $PHASE complete — production READY: $URL"
      exit 0
      ;;
    Error|ERROR|Canceled|CANCELED)
      echo "✗ phase $PHASE INCOMPLETE — deployment $STATE: $URL" >&2
      echo "  diagnose with: vercel inspect $URL --logs" >&2
      exit 1
      ;;
  esac

  if (( $(date +%s) >= DEADLINE )); then
    echo "✗ phase $PHASE INCOMPLETE — timed out after ${POLL_TIMEOUT}s (last state: ${STATE:-unknown})" >&2
    exit 1
  fi
  echo "  ... ${STATE:-pending}"
  sleep "$POLL_INTERVAL"
done
