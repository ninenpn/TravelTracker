# Runbook

## One-time setup of a fresh Supabase project
SQL Editor → run in order: `docs/supabase.sql` → `docs/supabase_edit.sql` → `select public.set_edit_code('<your code>');` → `docs/supabase_trips.sql` → `docs/supabase_trips_v2.sql`. Put the project URL + publishable key in `config.js`. All files are idempotent (safe to re-run). Verify: `node tests/live-smoke.js`.

## Everyday
| Task | How |
|---|---|
| Run all checks | `bash tests/run.sh --sql --live` |
| Edit the public plan | in the app (Menu → enter edit code → Plan → แก้ไข) or edit `sheet_rows` rows in Supabase Table Editor |
| Edit another trip | signed in with PIN → open the trip → แก้ไข |
| Add a member | add a row to tab `Users` (Table Editor on `sheet_rows`, tab=`Users`); they create their PIN at first login |
| Reset someone's PIN | delete their row in `member_pins` (lowercase name); they set a new one next login. Or in the app: pick name → "ลืม PIN?" (needs the edit code) |
| Change the edit code | `select public.set_edit_code('<new>');` in SQL Editor |
| Add another trip from Excel | skill `import-trip` / `python3 tools/import_trip.py --help` |
| See free-tier usage | Menu → "โควตาฟรี Supabase" (DB size is exact; traffic is this device only) — real totals in Dashboard → Usage |
| Restore an older plan | `sheet_history` (rows = JSON snapshot per save ≥10 min apart, last 30): read the snapshot you want and write it back with `save_tab` / the secret key |

## Deploy
Push to `main` → GitHub Actions "Deploy to GitHub Pages" → live in ~30 s. Check with `skill deploy-and-verify`. If the deploy step says **"Deployment failed, try again later"** while build/upload are green it is a transient Pages error: start a **new** run (`workflow_dispatch` on `pages.yml`), do **not** "re-run" (artifact gone) and do not push empty commits.

## Secrets
- Publishable key: public (in `config.js`).
- Secret key (`sb_secret_…`): only for data maintenance, passed via env `SB_SECRET_KEY`, never stored. **Rotate** in Dashboard → Settings → API Keys after any session where it was shared in chat.
- Edit code: one shared secret (hash in `app_secrets`).
- If a secret or private data was committed: rotate/reset immediately, then remove from the tree (history stays public — treat as compromised).

## Incidents
| Symptom | Likely cause → action |
|---|---|
| App shows old design after a push | deploy failed or still running → `deploy-and-verify`; hard refresh; check `BUILD` at the bottom of Menu |
| Plan "saved" but gone after reload | save refused (wrong/expired edit code, RPC error toast) or you are looking at stale cache → check the toast text; `sheet_history` has snapshots |
| Cannot open other trips | not signed in with PIN, PIN not yet created, or SQL files not applied → `node tests/live-smoke.js`, check `pin_status` |
| "ลองผิดหลายครั้ง" at login | throttle (8 wrong PINs / 10 min) → wait, or delete that name's rows in `pin_fail` |
| Everything empty / HTTP 5xx | free project paused after 7 idle days → Dashboard → Restore |
| Almaty `ค่าใช้จ่าย` table missing | the tab is not in `sheet_rows` → apply `docs/supabase_trips_v2.sql` |

## Known limits
Pictures/Excel formulas/merged cells: only values and pictures are imported. OSM geocoding/routing are rate limited. A 4-digit PIN is weak by nature.
