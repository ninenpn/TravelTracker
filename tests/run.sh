#!/bin/bash
# One entry point for QA.   bash tests/run.sh [--quick] [--live] [--sql]
#   (default)  static checks + e2e browser tests (needs Playwright; Chromium is pre-installed in the cloud sandbox)
#   --quick    static checks only          --sql   also validate docs/*.sql on a local Postgres
#   --live     also run the read-only smoke test against the live Supabase (public key only)
# Exit code is non-zero if anything failed, so Developer/QA agents can loop on it.
cd "$(dirname "$0")/.." || exit 1
QUICK=0; LIVE=0; SQL=0
for a in "$@"; do case "$a" in --quick) QUICK=1;; --live) LIVE=1;; --sql) SQL=1;; esac; done
export NODE_PATH="${NODE_PATH:-$(npm root -g 2>/dev/null)}"
rc=0
echo "== static checks"; bash tests/static-check.sh || rc=1
if [ $QUICK -eq 0 ]; then
  PORT=${PORT:-8123}; export BASE_URL="http://localhost:$PORT/"
  (python3 -m http.server "$PORT" >/dev/null 2>&1 & echo $! > /tmp/tt_http.pid); sleep 1
  echo; echo "== e2e (browser)"; node tests/e2e.js || rc=1
  kill "$(cat /tmp/tt_http.pid)" 2>/dev/null
fi
if [ $SQL -eq 1 ]; then echo; echo "== sql (local postgres)"; bash tests/sql/test.sh || rc=1; fi
if [ $LIVE -eq 1 ]; then echo; echo "== live smoke (read-only)"; node tests/live-smoke.js || rc=1; fi
echo; [ $rc -eq 0 ] && echo "ALL GREEN" || echo "SOMETHING FAILED (exit 1)"
exit $rc
