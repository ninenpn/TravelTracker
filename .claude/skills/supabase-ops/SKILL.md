---
name: supabase-ops
description: Safely read or change the Travel Tracker Supabase database (data edits, SQL changes, PIN resets, membership, backups, quota). Use whenever a task touches the live database, RLS, SQL functions, PINs or trip data.
---

# Supabase operations

Project ref `vqelnacauxxprredxjda` — URL in `config.js`. **The Supabase MCP connector in the sandbox lists a different org's projects; never touch those.**

## Keys
- **Publishable key** (in `config.js`): used by the app and by `tests/live-smoke.js`. Safe to commit.
- **Secret key**: only if the user provides it for the session, and only via the env var `SB_SECRET_KEY` (or inline in one command). Never write it to a file, never commit, never echo it back. After use, remind the user to rotate it (Dashboard → Settings → API Keys). It can read/write table **data** through REST but **cannot run DDL** (no `CREATE FUNCTION`, no policy changes).

## What can be done how
| Need | How |
|---|---|
| Change **data** (rows, replace a trip, membership, delete a PIN) | REST with the secret key (`/rest/v1/<table>`; `Prefer: return=minimal`; filters required on DELETE). Tool: `tools/import_trip.py`. |
| Change **schema / functions / policies** | Edit the idempotent files in `docs/*.sql`, test with `bash tests/sql/test.sh`, then ask the **user** to run the file in Supabase SQL Editor (order: supabase → supabase_edit → supabase_trips → supabase_trips_v2). Say exactly which file(s). |
| Check state read-only | `node tests/live-smoke.js` (public key). `usage_stats` RPC for size/row counts. |

## Tables (RLS on; anon has no direct write)
`sheet_rows` (public read) · `private_rows`, `trip_members`, `member_pins`, `pin_fail`, `app_secrets`, `sheet_history` (no anon access at all). Functions: `check_code` (always true), `save_tab`, `append_row`, `upsert_row` (no edit code since supabase_nocode.sql), `avatar_list/put/delete` (member_avatars) · `pin_status`, `verify_pin`, `set_first_pin`, `reset_pin` · `get_private`, `private_write` (member PIN) · `usage_stats`.

## Procedures
- **Always** say what you will change, back up what you replace (read it to a scratch file outside the repo first), change the minimum, then **read back and compare**. Report the counts.
- **Reset a member's PIN**: `DELETE /member_pins?name=eq.<lowercase name>` (they create a new one at next login). Clear `pin_fail` rows if they were locked out.
- **Add a member**: add the name as a row in `sheet_rows` tab `Users`. With `supabase_trips_v2.sql` applied that is enough for all trips; otherwise add `trip_members` rows (`tools/import_trip.py --members` shows how).
- **Testing real server paths** needs a signed-in member: create a temporary PIN for an unused name via `set_first_pin` (public RPC), test, then delete it from `member_pins` and clear `pin_fail`. Verify `pin_status` is back to the original list.
- **Quota**: free tier = 500 MB DB, 5 GB egress/month, project pauses after 7 idle days (user can Restore). Pictures are JPEG ≤1000 px base64 in `private_rows`; check `usage_stats` after big imports.
- **Never** put private trip data, PIN hashes or the secret key into git (CLAUDE.md rules 1–2).
