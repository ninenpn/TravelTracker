# Travel Tracker — project memory for Claude

Mobile-only trip web app (static site on GitHub Pages) backed by Supabase. Users answer in **Thai**; code comments/commits may be Thai or English. Live: https://ninenpn.github.io/TravelTracker/ · Repo: `ninenpn/TravelTracker` (public).

## Read first
`docs/ARCHITECTURE.md` (how it works) · `docs/QA.md` (what "done" means) · `docs/RUNBOOK.md` (operations) · `docs/AGENTS.md` (Developer/QA loop).

## Architecture in 10 lines
- Vanilla JS single page: `index.html`, `app.js` (~1700 lines, sections marked `/* ---------- name ---------- */`), `style.css`, `config.js` (Supabase URL + **publishable** key), `sw.js` (notifications only, no caching).
- Data = rows/cells like a spreadsheet. Public trip (Almaty): table `sheet_rows(tab,row_no,cells)`. Other trips: `private_rows(trip,tab,row_no,cells)` (+ pictures as `media`/`media:<id>` tabs).
- Reads: REST with the publishable key. If Supabase is unreachable the app falls back to the Google Sheet for Almaty only.
- Writes: only through SQL functions (RPC) — `save_tab/append_row/upsert_row` need the **edit code** (public trip); `private_write` needs only a trip member's **name** (other trips; no PIN). Tables are not writable directly (RLS).
- **No login / no PIN (owner's explicit decision, made after being warned): private trips and documents are readable and writable by anyone who has the link / calls the API and knows a member name.** The app opens straight to the trip; header button = plain traveller list ("who am I", `localStorage['tt.me']`, not secret): Almaty = all names of the Users tab, every other trip = Nine and Mew only (`PRIV_TRAVELLERS`; a chosen name not on the trip's list falls back to Nine, the choice is kept). RPCs keep their `(name, hash)` signatures; the client sends the constant `'open'` and the server ignores it (`docs/supabase_open.sql`, applied by the user/lead, never by agents on live). The edit code for the public trip is unchanged.
- Every trip is listed for everyone. Trips show **Current / Upcoming / Past**; default list = Current + Upcoming.
- Tabs: แผน · เงิน · สถานที่ · เอกสาร · เมนู (no Map tab; "เปิดแผนที่เต็ม" opens a full-screen overlay that borrows the single Leaflet map). Home: the map card scrolls away with the page (normal flow, no scroll JS); only the slim day bar (day chips + "แผนที่" button that scrolls back to the map) is sticky under the header; one slim "ถัดไป / ที่พัก" row.
- Stability rules: `load()` compares a data signature and re-renders nothing when identical; changed data re-renders via `keepScroll`; trip switch never blanks; tabs keep scroll and are not re-rendered unless changed; reserve space (CLS <= 0.05), animate only transform/opacity, honour reduced motion.
- Documents (tab เอกสาร): personal + shared files, **visible to everyone (any listed name)** (private group app; a member may add a document for another member via `doc_put(..., p_owner)`; rename/delete only by owner or uploader) in `member_docs`/`member_doc_chunks` (no table grants), only via RPC `doc_list/get/put/rename/delete` (name only, `docs/supabase_docs.sql` + `docs/supabase_open.sql`; the user runs it — never run it on live yourself). Client downsizes images (≤1800 px JPEG), cache in IndexedDB `tt-docs` (wiped by `clearPrivCaches` → `docsWipe`), full-screen viewer `#docOv`. Never commit real documents/IDs; tests use synthetic PNGs.
- Offline: last good data per trip cached in `localStorage` (`tt.cache.<trip>`, <= 1.5 MB, no pictures), shown at start then refreshed; private caches are cleared when the traveller name changes.
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
