# Travel Tracker — project memory for Claude

Mobile-only trip web app (static site on GitHub Pages) backed by Supabase. Users answer in **Thai**; code comments/commits may be Thai or English. Live: https://ninenpn.github.io/TravelTracker/ · Repo: `ninenpn/TravelTracker` (public).

## Read first
`docs/ARCHITECTURE.md` (how it works) · `docs/QA.md` (what "done" means) · `docs/RUNBOOK.md` (operations) · `docs/AGENTS.md` (Developer/QA loop).

## Architecture in 10 lines
- Vanilla JS single page: `index.html`, `app.js` (~1700 lines, sections marked `/* ---------- name ---------- */`), `style.css`, `config.js` (Supabase URL + **publishable** key), `sw.js` (notifications only, no caching).
- Data = rows/cells like a spreadsheet. Public trip (Almaty): table `sheet_rows(tab,row_no,cells)`. Other trips: `private_rows(trip,tab,row_no,cells)` (+ pictures as `media`/`media:<id>` tabs).
- Reads: REST with the publishable key. If Supabase is unreachable the app falls back to the Google Sheet for Almaty only.
- Writes: only through SQL functions (RPC) — `save_tab/append_row/upsert_row` need the **edit code** (public trip); `private_write` needs a signed-in member's **PIN** (other trips). Tables are not writable directly (RLS).
- Login = pick name + 4-digit PIN (hash `sha256(name|pin|traveltracker)` stored server-side in `member_pins`, checked by `verify_pin`, throttled 8 tries/10 min). Session hash lives only in `sessionStorage` (`tt.ph`).
- Every signed-in member can open every trip. Trips show **Current / Upcoming / Past**; default list = Current + Upcoming.
- Tabs: แผน · เงิน · สถานที่ · เอกสาร · เมนู (no Map tab; "เปิดแผนที่เต็ม" opens a full-screen overlay that borrows the single Leaflet map). Home: sticky map + day bar slide away while scrolling down (`.dock.away`), only the day bar returns when scrolling up (`.dock.peek`), with >= 28 px hysteresis; one slim "ถัดไป / ที่พัก" row.
- Stability rules: `load()` compares a data signature and re-renders nothing when identical; changed data re-renders via `keepScroll`; trip switch never blanks; tabs keep scroll and are not re-rendered unless changed; reserve space (CLS <= 0.05), animate only transform/opacity, honour reduced motion.
- Documents (tab เอกสาร): personal (owner-only) + shared files in `member_docs`/`member_doc_chunks` (no table grants), only via RPC `doc_list/get/put/rename/delete` (name+PIN, `docs/supabase_docs.sql`; the user runs it — never run it on live yourself). Client downsizes images (≤1800 px JPEG), cache in IndexedDB `tt-docs` (wiped by `clearPrivCaches` → `docsWipe`), full-screen viewer `#docOv`. Never commit real documents/IDs; tests use synthetic PNGs.
- Offline: last good data per trip cached in `localStorage` (`tt.cache.<trip>`, <= 1.5 MB, no pictures), shown at start then refreshed; private caches are cleared on sign-out / stale PIN / user switch.
- Plan rows: `Day, Start time, Start Location, Arrive time, Arrive Location, How to Travel, Note[, Notice, Tickets, Location]`. Travel time = arrive − start; time at a place = arrive → next timed row's start.
- Free tier: Supabase 500 MB DB / 5 GB egress — usage card in Menu.

## Hard rules (never break)
1. **No secrets in git**: never commit `sb_secret_…`, service-role keys, `.env`. The secret key is used only via env var `SB_SECRET_KEY` in tools/skills and must not be written to any file. The publishable key in `config.js` is fine.
2. **No private data in git**: the repo is public. Never commit `.xlsx`, `private/`, trip itineraries, pictures, PIN hashes. Private trips live only in Supabase; test fixtures are synthetic (`tests/lib.js`).
3. **Never push an empty commit or re-run just to kick CI**; if Pages deploy fails see `.claude/skills/deploy-and-verify`.
4. Writes to the live database are a deliberate act: say what you will change, change the minimum, verify by reading back, clean up any temporary rows (e.g. a test PIN).
5. Don't claim something works unless a test/command output proves it; report failures plainly.
6. Don't create PRs unless asked; push to the working branch **and** `main` (`git push origin <branch>:main`).

## Commands
```bash
bash tests/run.sh              # static checks + e2e (browser)             ← run before every handoff
bash tests/run.sh --sql --live # + SQL validation on local Postgres + read-only live smoke test
bash tests/run.sh --quick      # static checks only (secrets/private-data/syntax)
python3 -m http.server 8123    # manual run; open http://localhost:8123/
python3 tools/import_trip.py --help   # import an Excel trip (dry-run by default)
```
Playwright + Chromium are pre-installed in the sandbox (`NODE_PATH=$(npm root -g)`).

## Roles
- `developer` agent implements; `qa` agent independently verifies; the `/dev-qa-loop` skill runs Developer → QA → (fail) → Developer … until QA says PASS (max 5 rounds). Details: `docs/AGENTS.md`.
- Other skills: `run-qa`, `deploy-and-verify`, `supabase-ops`, `import-trip` (in `.claude/skills/`).

## Conventions
- Keep changes small and in the existing style (one-file vanilla JS, no build step). Add a test in `tests/e2e.js` for each new behavior; keep fixtures synthetic.
- UI text is Thai. Mobile only (360–430 px wide); nothing may be hidden behind the top header / sticky map / bottom nav.
- Times are `HH.MM` strings; dates may carry a year (`5-ธ.ค. 2025`) and drive the trip status.
- When changing SQL, edit `docs/*.sql` (idempotent, re-runnable) and extend `tests/sql/test.sh`.
