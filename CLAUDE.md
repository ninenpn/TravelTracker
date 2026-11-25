# Travel Tracker — project memory for Claude

Mobile-only trip web app (static site on GitHub Pages) backed by Supabase. Users answer in **Thai**; code comments/commits may be Thai or English. Live: https://ninenpn.github.io/TravelTracker/ · Repo: `ninenpn/TravelTracker` (public).

## Read first
`docs/ARCHITECTURE.md` (how it works) · `docs/QA.md` (what "done" means) · `docs/RUNBOOK.md` (operations) · `docs/AGENTS.md` (Developer/QA loop).

## Architecture in 10 lines
- Vanilla JS single page: `index.html`, `app.js` (~1700 lines, sections marked `/* ---------- name ---------- */`), `style.css`, `config.js` (Supabase URL + **publishable** key), `sw.js` (notifications only, no caching).
- Data = rows/cells like a spreadsheet. Public trip (Almaty): table `sheet_rows(tab,row_no,cells)`. Other trips: `private_rows(trip,tab,row_no,cells)` (+ pictures as `media`/`media:<id>` tabs).
- Reads: REST with the publishable key. If Supabase is unreachable the app falls back to the Google Sheet for Almaty only.
- Writes: only through SQL functions (RPC) — `save_tab/append_row/upsert_row` need **no code any more** (public trip; owner's decision — anyone with the link can edit it; `docs/supabase_nocode.sql`; `sheet_history` keeps the last 30 plan snapshots for restore; the empty-plan guard stays); `private_write` needs only a trip member's **name** (other trips; no PIN). Tables are not writable directly (RLS).
- **No login / no PIN (owner's explicit decision, made after being warned): private trips and documents are readable and writable by anyone who has the link / calls the API and knows a member name.** The app opens straight to the trip; the header's right corner is the countdown chip (#btnCd, see below); **There is NO user identity at all**: no "who am I", no switch-name button, no `tt.me`/`me`, no "ฉัน" chips, nothing is "mine"; everyone can edit everything on any name. Travellers (for pickers only): Almaty = all names of the Users tab, every other trip = Nine and Mew (`PRIV_TRAVELLERS`). RPCs keep their `(name, hash)` signatures, but the client ALWAYS sends ONE constant API identity, `apiName()` = the first traveller of the trip (Almaty: first Users name = Nine; private trips: Nine) and the dummy hash `'open'` (never user-chosen); the server ignores the hash (`docs/supabase_open.sql`) and, because the identity is fixed, ownership rules are central (`docs/supabase_central.sql`: any accepted member may rename/delete ANY document). Both SQL files are applied by the user/lead, never by agents on live. The Menu สมาชิก card is a plain member list (photo change/remove for anyone). Money asks "ใครจ่าย" (required) per entry; location sharing asks "แชร์ตำแหน่งของใคร" (a per-device label `tt.shareAs`, not a login). The public trip has no edit code either: Edit works straight from แก้ไข (anyone with the link can edit it).
- Profile photos are central: table `member_avatars` via RPC `avatar_list/put/delete` (`docs/supabase_avatars.sql`, user/lead applies it); anyone may set/remove any traveller's photo; client crops 256 px JPEG, caches in `localStorage['tt.av']` (<= 300 KB), shows initials if the SQL is missing.
- Header countdown chip `#btnCd` (fixed 112x44, two text nodes `#cdL/#cdV`, updated every 30 s without re-rendering; paused when hidden): upcoming trip = "อีก N วัน" (d/h under 3 days, h/m under 1 day), current = next stop "ถัดไป · HH.MM" + time left, past = muted "สิ้นสุดแล้ว". Tap = sheet `นับถอยหลัง` (next stops today, the trip, every Upcoming trip; tap = switch trip; footer = switch name). Code: section `header countdown chip` in app.js.
- Every trip is listed for everyone. Trips show **Current / Upcoming / Past**; default list = Current + Upcoming.
- Tabs: แผน · ค่าใช้จ่าย · สถานที่ · เอกสาร · เมนู (no Map tab and no inline map: the "เปิดแผนที่" card and the day-bar "แผนที่" button open the full-screen overlay `#mapOv`; Leaflet is created on the first open). Home: the map card scrolls away with the page (normal flow, no scroll JS); only the slim day bar is sticky under the header; ONE slim row "ถัดไป · ที่พัก · ข้อมูลด่วน (icon)". **Stay = a place**: plan steps to/from the stay carry a bed badge that opens a bottom sheet (details, navigate, copy, taxi screen); other `Info` rows open from one icon (popup). **Day lock**: each day has "ล็อกวัน/ปลดล็อก" (tab `Locks`: Day, Locked 0/1, By, Time, written with upsert_row / private_write) — a SOFT lock enforced by the app only, the server does not check it.
- **ค่าใช้จ่าย** (tab `money`) is ONE page: per currency a card with what each person has paid + who must pay whom (net pair debts) + the expense list; no budget/ending table. Add-expense form: what/amount/currency/category, "ใครจ่าย" (required picker, no default), then ส่วนกลาง (split among all) / ส่วนตัวของคนเดียว (pick one; stored as `personal` if it is the payer, else `split` with that person) / แบ่งกับบางคน (pick several, `split`). Private trips' `Cost` tab: columns "นาย" = Nine, "มิว" = Mew are personal amounts, a row without a person amount is a shared cost split among the travellers (`costExpenses()`). **สถานที่** is ONE page: add box (link / lat,lng / place name geocoded) -> instant insight (nearest plan stops + walk/drive estimate + the time gap where it fits) -> Suggestion cards with "แทรกเข้าแผน"; no built-in places (empty state). Sheet `Expenses` rows WITHOUT PaidBy are PENDING central costs (status text such as "รอชำระเงิน" in Date -> chip): card `#pendCard` "รอชำระ · ส่วนกลาง" grouped per currency (USD shown `$697 USD`), never split, no debts, no change to per-person totals; a filled PaidBy = normal expense. Stay key `Chat` (URL) = stay-sheet row "แชทกับที่พัก" with primary "เข้าร่วมแชท (Join)" + copy link.
- Stability rules: `load()` compares a data signature and re-renders nothing when identical; changed data re-renders via `keepScroll`; trip switch never blanks; tabs keep scroll and are not re-rendered unless changed; reserve space (CLS <= 0.05), animate only transform/opacity, honour reduced motion.
- Documents (tab เอกสาร): no name gate — the page opens with EVERYONE's documents grouped by person (sticky chips ทุกคน | each name | ส่วนกลาง; reads go out under the constant API name); add asks "เอกสารของใคร"; PDFs are rendered inline page by page with pdf.js (pinned on cdnjs, SRI, loaded only when a PDF is opened) and every opened file + its rendered pages is cached in IndexedDB ("บันทึกออฟไลน์แล้ว"). Personal + shared files, **visible to everyone (any listed name)** (private group app; a member may add a document for another member via `doc_put(..., p_owner)`; rename/delete by anyone after `docs/supabase_central.sql`) in `member_docs`/`member_doc_chunks` (no table grants), only via RPC `doc_list/get/put/rename/delete` (name only, `docs/supabase_docs.sql` + `docs/supabase_open.sql` + `docs/supabase_central.sql`; the user runs them — never run it on live yourself). Client downsizes images (≤1800 px JPEG), cache in IndexedDB `tt-docs` (`docsWipe` clears it; nothing calls it automatically now that there is no name switch), full-screen viewer `#docOv`. Never commit real documents/IDs; tests use synthetic PNGs.
- Offline: last good data per trip cached in `localStorage` (`tt.cache.<trip>`, <= 1.5 MB, no pictures), shown at start then refreshed; private caches are cleared when the traveller name changes.
- Plan rows: `Day, Start time, Start Location, Arrive time, Arrive Location, How to Travel, Note[, Notice, Tickets, Location]`. Travel time = arrive − start; time at a place = arrive → next timed row's start.
- Menu order: สมาชิก (plain list, anyone's photo) · ทริป · การแจ้งเตือน · โหมดมืด · รูป/ตารางเพิ่มเติม · รีเฟรช · **โควตาฟรี Supabase last**. No profile card, no edit card.
- Free tier: Supabase 500 MB DB / 5 GB egress — usage card at the bottom of Menu.

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
