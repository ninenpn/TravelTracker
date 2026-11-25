# Runbook

## One-time setup of a fresh Supabase project
SQL Editor → run in order: `docs/supabase.sql` → `docs/supabase_edit.sql` → `docs/supabase_trips.sql` → `docs/supabase_trips_v2.sql` → `docs/supabase_docs.sql` (เอกสาร) → `docs/supabase_open.sql` → `docs/supabase_nocode.sql` (no edit code) → `docs/supabase_avatars.sql` (profile photos). Put the project URL + publishable key in `config.js`. All files are idempotent (safe to re-run). Verify: `node tests/live-smoke.js`.

## Everyday
| Task | How |
|---|---|
| Run all checks | `bash tests/run.sh --sql --live` |
| Edit the public plan | in the app (Plan → แก้ไข, no code) or edit `sheet_rows` rows in Supabase Table Editor |
| Edit another trip | open the trip → แก้ไข (no PIN; the traveller is Nine or Mew) |
| Add a member | add a row to tab `Users` (Table Editor on `sheet_rows`, tab=`Users`); the name then appears in the Almaty traveller list (private trips are fixed to Nine and Mew via `trip_members`) |
| Apply open access | run `docs/supabase_open.sql` in the SQL Editor (idempotent). It removes the PIN requirement server-side and trims `trip_members` to Nine + Mew. To go back, re-run `supabase_trips.sql` + `supabase_trips_v2.sql` + `supabase_docs.sql` (restores the PIN-checking functions; the client would then need the PIN screen again) |
| Restore an older plan | `select id, saved_at from sheet_history where tab='plan' order by id desc;` then copy `rows` back into `sheet_rows` (30 snapshots kept) |
| Add another trip from Excel | skill `import-trip` / `python3 tools/import_trip.py --help` |
| See free-tier usage | Menu → "โควตาฟรี Supabase" (DB size is exact; traffic is this device only) — real totals in Dashboard → Usage |
| Restore an older plan | `sheet_history` (rows = JSON snapshot per save ≥10 min apart, last 30): read the snapshot you want and write it back with `save_tab` / the secret key |

## Deploy
Push to `main` → GitHub Actions "Deploy to GitHub Pages" (two jobs: `build` uploads the site without tests/docs/tools, `deploy` publishes) → live in ~30 s. Check with `skill deploy-and-verify`. If the deploy step says **"Deployment failed, try again later"** while build/upload are green it is a transient Pages error: start a **new** run (`workflow_dispatch` on `pages.yml`), do **not** "re-run" (artifact gone) and do not push empty commits.

## Secrets
- Publishable key: public (in `config.js`).
- Secret key (`sb_secret_…`): only for data maintenance, passed via env `SB_SECRET_KEY`, never stored. **Rotate** in Dashboard → Settings → API Keys after any session where it was shared in chat.
- No edit code any more (owner's decision): anyone with the link can edit the public trip; `sheet_history` is the safety net.
- If a secret or private data was committed: rotate/reset immediately, then remove from the tree (history stays public — treat as compromised).

## Incidents
| Symptom | Likely cause → action |
|---|---|
| App shows old design after a push | deploy failed or still running → `deploy-and-verify`; hard refresh; check `BUILD` at the bottom of Menu |
| Plan "saved" but gone after reload | save refused (RPC error toast) or you are looking at stale cache → check the toast text; `sheet_history` has snapshots |
| Cannot open other trips / documents ("ไม่รู้จักชื่อนี้") | `supabase_open.sql` not applied yet, or the chosen name is not in the `Users` tab → `node tests/live-smoke.js`, check `_pin_ok` / `_member` definitions |
| (retired) PIN throttle | no longer used after `supabase_open.sql` |
| Everything empty / HTTP 5xx | free project paused after 7 idle days → Dashboard → Restore |
| Tab เอกสาร says "ฟีเจอร์เอกสารยังไม่เปิดใช้งาน" | `docs/supabase_docs.sql` not applied → run it in SQL Editor (idempotent). Doc caps: 40 personal per owner, 60 shared, 6 MB each (~ DB usage visible in Menu quota card) |
| Delete someone's document | in the app only the owner or the uploader (shared: the creator) can; documents are visible to every signed-in member by design; as admin: `delete from member_docs where id = '<id>'` (chunks cascade) |
| Almaty `ค่าใช้จ่าย` table missing | the tab is not in `sheet_rows` → apply `docs/supabase_trips_v2.sql` |

## Known limits
Security note: after `supabase_open.sql` private trips and documents are readable by anyone with the link (owner's explicit choice). Pictures/Excel formulas/merged cells:
