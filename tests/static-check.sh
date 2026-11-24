#!/bin/bash
# Static guards: syntax, secrets, private data. Exits non-zero on the first problem class found.
cd "$(dirname "$0")/.." || exit 1
fail=0
node --check app.js && echo " PASS app.js syntax" || { echo " FAIL app.js syntax"; fail=1; }
node --check sw.js && echo " PASS sw.js syntax" || fail=1
# secrets: Supabase secret keys / service-role JWTs must never be tracked
if git grep -nE "sb_secret_[A-Za-z0-9_-]{12,}|service_role[\"' ]*[:=][\"' ]*eyJ" -- . ':!tests/static-check.sh' ':!.claude' ':!CLAUDE.md' ':!docs' >/tmp/sec.txt 2>/dev/null; then echo " FAIL secret-looking value is tracked:"; cat /tmp/sec.txt; fail=1; else echo " PASS no secret keys in tracked files"; fi
# private data must stay out of the public repo
tracked_bad=$(git ls-files | grep -Ei '\.xlsx$|^private/|trips_data|\.env' | grep -v '^docs/sheet-templates/' || true)
[ -z "$tracked_bad" ] && echo " PASS no xlsx / private data / env files tracked" || { echo " FAIL tracked private-looking files: $tracked_bad"; fail=1; }
# a 64-hex string in docs/sql would be a leaked PIN hash
if grep -nE "[0-9a-f]{64}" docs/*.sql >/tmp/hex.txt 2>/dev/null; then echo " FAIL 64-hex string (PIN hash?) in docs/*.sql"; cat /tmp/hex.txt | cut -c1-120; fail=1; else echo " PASS no PIN hashes in docs/*.sql"; fi
# build stamp placeholders must still be present for the deploy workflow
grep -q "__BUILD__" index.html && echo " PASS index.html build placeholder" || { echo " FAIL __BUILD__ placeholder missing"; fail=1; }
exit $fail
