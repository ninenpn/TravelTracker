# Architecture

## Pieces
| Piece | Where | Notes |
|---|---|---|
| Web app | `index.html`, `app.js`, `style.css`, `config.js` | vanilla JS, no build; deployed by `.github/workflows/pages.yml` (stamps `__BUILD__` = short SHA into `index.html`) |
| Database | Supabase (project `vqelnacauxxprredxjda`) | tables + SQL functions defined in `docs/*.sql` |
| Notifications | `sw.js` | shows notifications only; **no caching** (so deploys are instantly visible) |
| Tests | `tests/` | `run.sh` = entry point (see docs/QA.md) |
| Tools | `tools/import_trip.py` | Excel → `private_rows` |
| Agents/skills | `.claude/` | see docs/AGENTS.md |

## Data model (spreadsheet-shaped on purpose)
Every tab is a list of rows; a row is a JSON array of strings (`cells`).
- `sheet_rows(tab, row_no, cells)` — **public** trip (Almaty). Tabs: `plan`, `Users`, `Expenses`, `Locations`, `Places`, `Stay`, `Tips`, `ค่าใช้จ่าย`. Row 0 is the header.
- `private_rows(trip, tab, row_no, cells)` — other trips (`macau`, `nagoya`, `kunming`, `xian`): tabs `plan`, `Cost`, extras, plus `media` (picture index) and `media:<id>` (base64 JPEG in ≤150 k-char chunks).
- Private/secret tables: `trip_members`, `member_pins(name, hash)`, `pin_fail`, `app_secrets` (edit-code hash), `sheet_history` (plan snapshots, ≥10 min apart, last 30).
- `Users` tab: `Name, Budget[, Budget <CUR>]` — the list of members (PIN values are **not** here).
- `plan` tab columns: `Day, Start time, Start Location, Arrive time, Arrive Location, How to Travel, Note` (+ `Notice`, `Tickets`, `Location`). A row with text in `Day` starts a new day; rows with a text-only `Start time` are free-text lines; a row `Day2`/`Day4`… in the start-time column after the last day = "ideas" block.

## Read path (`app.js`: `fetchTab` → `fetchSb` / `fetchPriv`)
- Public tab: `GET /rest/v1/sheet_rows?tab=eq.<tab>&order=row_no` with the publishable key; if the table is missing/unreachable → Google Sheet gviz CSV (Almaty only).
- Private trip: RPC `get_private(trip, tab, name, pin_hash)` → rows or `null` (not allowed). Only for a signed-in member (name + session PIN hash).
- `load()` fetches plan first, then the other tabs in parallel; `pin_status` is fetched to decide "verify PIN" vs "create PIN".

## Write path
- Public trip: RPC `save_tab` (replace a whole tab atomically, with history), `append_row`, `upsert_row` — all take the **edit code** (`cfg.editCode`, asked via dialog, verified by `check_code`).
- Private trips: RPC `private_write(trip, tab, op, payload, name, pin_hash)` with `op = save|append|upsert`.
- The plan is saved by rebuilding all rows from the in-memory structure (`planToRows`) — raw rows are kept per step (`_row`) so unknown columns survive. Saving never clears first: the function replaces the tab in one transaction; an empty plan is refused.

## Auth model
- Name + 4-digit PIN. Hash = `sha256(lower(name)|pin|traveltracker)`; stored in `member_pins`; compared **server-side** (`verify_pin`, `_pin_ok`) with a throttle (8 failures / 10 min / name). The session hash is kept in `sessionStorage['tt.ph']` only.
- Any name present in the public `Users` tab with a valid PIN counts as a member (`_member`, v2). Private data is invisible to anon (no table grants).
- Honest limits: a 4-digit PIN is weak against a determined attacker who can call the API many times (throttle slows it); the edit code is one shared secret; everything public (Almaty plan, expenses, Tips) is readable by anyone with the link.

## Trip status
`PRIV_TRIPS` (in `app.js`) carries `start/end`; Almaty's range is learned from its plan (`cfg.dates[tripId]`, default 2027-02-13…18). `tripStatus()` → `current | upcoming | past`; `tripList()` filters (default Current+Upcoming) and sorts; the picker is the title tap (top-left) and the Menu card.

## UI structure
Tabs (bottom nav, 5 items): **แผน** (plan: sticky map dock + day bar, one slim "ถัดไป / ที่พัก" row, steps, ideas, gallery shortcut) · **เงิน** (budget/ledger per currency, expense list) · **สถานที่** (suggestions from the saved list, all places, tips "น่าไป") · **เอกสาร** (see Documents) · **เมนู** (profile, edit card, pictures, usage card, notifications, theme, trips, members). There is no Map tab: "เปิดแผนที่เต็ม" opens a **full-screen overlay** (`#mapOv`: ✕ top-right, ⟲ my location, filter chips เส้นทาง/ร้านอาหาร/ที่เที่ยว/อื่นๆ/เพื่อน, a location-status line with "ขอสิทธิ์ตำแหน่ง" only when needed). The single Leaflet instance is moved into the overlay and back (`mountMap`), never re-created or re-fitted; Back / Esc / ✕ close it (`history.pushState` + `popstate`).
Scroll behaviour: `window scroll` handler toggles `ui.dockAway = false | 'hide' | 'peek'` → classes `.dock.away` / `.dock.peek` (CSS transform only, `will-change: transform`, no animation under `prefers-reduced-motion`). **Hysteresis**: >= 28 px of sustained movement in one direction is needed to flip; a reversal restarts the count; 'peek' only follows 'hide'.

## Stability rules (the UI must not "bounce")
- **Refresh = compare, not re-render.** `load()` builds the new data, serialises the parsed tabs (`snapOf`, time-derived `dt` excluded) and compares it with `ui.sig`. Identical → nothing is touched (no `#tl`/`#homeDock`/`#map` replacement, no `drawMap`, scroll untouched). Different → `applyData` re-renders inside `keepScroll` (anchors on the first visible step). Under an open dialog / focused field / lightbox the new data waits (`ui.stale`) and is applied on close. A tab that fails to load keeps its last good copy; a failed plan fetch never wipes the screen.
- **Trip switch never blanks**: the previous plan stays (dimmed, sub-title "กำลังโหลด…") or the cached copy of the new trip is shown at once; nothing is cleared before new data arrives.
- **Reserve space**: sub-title, day bar, login block and map have fixed/min sizes so late data cannot shift layout (CLS <= 0.05 in tests); the login block is top-aligned. Animate only `transform`/`opacity`.
- **Tabs**: each remembers its scroll (`ui.scroll`) and is re-rendered only when `ui.tabVer[tab] !== ui.ver` (`ui.ver` is bumped by `renderAll`, plan edits, spot/place changes).
- **Offline cache (stale-while-revalidate)**: `localStorage['tt.cache.<tripId>']` = `<time>\n<snapshot JSON>` of the last good data (skipped if > 1.5 MB; never picture chunks). Boot and trip switch render it immediately, then refresh; sub-title shows "กำลังอัปเดต…", and "ออฟไลน์ — แสดงข้อมูลล่าสุด HH:MM" when the network/RPC fails (no red error box when something is already shown). Private-trip caches (`tt.cache.priv:*`) are removed on stale PIN, user switch (`#btnMe`, a different name signing in) and at boot when nobody is signed in.

## Documents (tab เอกสาร)
- **Server** (`docs/supabase_docs.sql`, run by the user after the other docs/*.sql): tables `member_docs(id, scope person|shared, owner, trip, title, kind, mime, size_bytes, note, created_by, created_at, chunks)` + `member_doc_chunks(doc_id, i, data)` (base64 in <=300k-char chunks); RLS on, **no** grants to anon/authenticated. RPCs (SECURITY DEFINER, name+PIN via `_member`/`_pin_ok`, throttled): `doc_list` (metadata: shared + the caller's personal), `doc_get` (chunks, `null` if not visible), `doc_put` (returns the id as text or `-1` auth, `-2` MIME, `-3` > 6 MB base64, `-4` limit 40 personal / 60 shared, `-5` bad title/scope/chunks), `doc_rename`, `doc_delete` (1 ok, 0 not found/not yours, -1 auth). Personal docs: owner only. Shared docs: any signed-in member reads; only the creator renames/deletes. Allowed MIME: jpeg/png/webp/pdf. Honest limit: ID scans are sensitive; they are protected by the owner-only rule on the server and Supabase encryption at rest, nothing stronger (no client-side encryption).
- **Client** (`app.js`, section "documents"): `dc` state (list/status/segment), `dv` viewer state. `docsRefresh()` runs only for a signed-in member (guests: login panel, no RPC): `null` => clean sign-out (`docsStale`), network error => keep session, use cached list ("ออฟไลน์" chip) or inline retry, missing function => `DOC_NOSQL` message.
- **Files**: `docBlob()` = IndexedDB (`tt-docs`, store `kv`: `l:<me>` list, `f:<me>:<id>` blob) -> network (`doc_get`, then cached). Thumbnails are fetched lazily (IntersectionObserver) into fixed 84 px boxes, so they also get cached. `docsWipe()` (called from `clearPrivCaches`: sign-out, stale PIN, user switch, boot without a user) bumps `dc.epoch` (in-flight work is discarded), revokes blob URLs and deletes the database.
- **Upload**: images are downscaled (longest side <= 1800 px, JPEG q 0.82), PDFs <= 4 MB, sent by XHR (for progress) as chunks in one `doc_put`.
- **Viewer** `#docOv`: white full screen, pointer-events pinch/pan/double-tap, rotate, swipe/arrows between docs of the segment, Wake Lock when available (else hint), `history.pushState` so Back closes, `html.noscroll`. PDFs: "เปิด PDF" opens the blob in a new tab. The same overlay shows the **taxi screen** (stay name + address in huge type).
- **Quick info card** (top of the tab): `data.stay` (Stay tab) + optional public tab `Info` (Key,Value rows) parsed by `parseInfo`; `Info` is fetched with `noSheet` (never falls back to Google Sheets) and is part of the cache snapshot.
- Share: `navigator.share({files})` if `canShare({files})`, else `<a download>`, else `window.open(blobUrl)`.

## Maps & travel time
Leaflet + OSM tiles; geocoding via Nominatim (cache `tt.gc2`), routing via routing.openstreetmap.de (cache `tt.trv`); estimates are marked `~`. Location tracking is only requested between the first flight's arrival and the last flight's departure (`gate()`).

## Pictures
Excel pictures → JPEG ≤1000 px → base64 chunks (`private_rows`, tab `media:<id>`; index in tab `media`). The gallery fetches thumbnails lazily (IntersectionObserver) and caches them in memory per session.

## Free-tier budget
500 MB DB (now ~14 MB), 5 GB egress/month (`apiStat` counts this device's usage), 7-day idle pause. Menu → "โควตาฟรี Supabase" shows real DB size via `usage_stats`.
