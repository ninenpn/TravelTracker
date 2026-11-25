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
- Private trip: RPC `get_private(trip, tab, name, pin_hash)` → rows or `null` (not allowed). Open access: the server accepts any name in `trip_members` (Nine, Mew) and ignores the hash (the client sends the constant `'open'`).
- `load()` fetches plan first, then the other tabs in parallel.

## Write path
- Public trip: RPC `save_tab` (replace a whole tab atomically, with history), `append_row`, `upsert_row` — take **no edit code** since `docs/supabase_nocode.sql` (owner's decision; the `code` parameter is kept but ignored so old clients work; `check_code` always returns true). `save_tab` still refuses an empty plan and snapshots into `sheet_history` (>= 10 min apart, last 30 kept) so a bad overwrite can be restored.
- Profile photos: `member_avatars(name pk, mime, data, updated_at)` (RLS, no grants) via `avatar_list()` / `avatar_put(name,hash,mime,data)` / `avatar_delete(name,hash)` (`docs/supabase_avatars.sql`; name must be in the Users tab, image/jpeg|png|webp, <= 120k base64 chars). Central: anyone may set/remove anyone's photo. Client: `avatar()` renders `<img>` or initials in a fixed-size circle, `avRefresh()` swaps in place (no re-render / no layout shift), cache `localStorage['tt.av']` <= 300 KB, RPC missing -> initials only + Thai hint on upload.
- Private trips: RPC `private_write(trip, tab, op, payload, name, pin_hash)` with `op = save|append|upsert`.
- The plan is saved by rebuilding all rows from the in-memory structure (`planToRows`) — raw rows are kept per step (`_row`) so unknown columns survive. Saving never clears first: the function replaces the tab in one transaction; an empty plan is refused.

## Auth model
- **Open access, no login (owner's explicit decision after being warned).** `docs/supabase_open.sql` redefines `_pin_ok` (true for any non-empty name listed in the public `Users` tab; no hash check, no throttle) and `_member` (name is a row of `trip_members`), and deletes every `trip_members` row except Nine and Mew. Signatures, grants, RLS and tables are unchanged, so anon still cannot read/write tables directly, only call the RPCs. The old PIN objects (`member_pins`, `verify_pin`, `set_first_pin`, `reset_pin`, `pin_status`, `pin_fail`) stay in the database but nothing uses them.
- Client: no login screen. `pick` (localStorage `tt.me`) = chosen name, `me` = effective name for the active trip (`syncMe()`): traveller list = Users tab on Almaty, `PRIV_TRAVELLERS` (Nine, Mew) on any private trip; if the pick is not in the list, `me` falls back (Nine on private trips, empty on Almaty) without losing the pick. `myHash()` is the constant `'open'`.
- **Consequence (accepted by the owner):** anyone with the link who knows or guesses a member name can read the private trips and every personal document (ID scans) and write to private trips / documents. Public-trip writes (`save_tab/append_row/upsert_row`) need no code either, so anyone with the link can rewrite the Almaty plan (history keeps 30 snapshots). Everything public (Almaty plan, expenses, Tips) is readable by anyone with the link.

## Trip status
`PRIV_TRIPS` (in `app.js`) carries `start/end`; Almaty's range is learned from its plan (`cfg.dates[tripId]`, default 2027-02-13…18). `tripStatus()` → `current | upcoming | past`; `tripList()` filters (default Current+Upcoming) and sorts; the picker is the title tap (top-left) and the Menu card.

## UI structure
Tabs (bottom nav, 5 items): **แผน** (plan: map card (normal flow) + sticky day bar, one slim "ถัดไป / ที่พัก" row, steps, ideas, gallery shortcut) · **เงิน** (budget/ledger per currency, expense list) · **สถานที่** (suggestions from the saved list, all places, tips "น่าไป") · **เอกสาร** (see Documents) · **เมนู** (profile, edit card, pictures, usage card, notifications, theme, trips, members). There is no Map tab: "เปิดแผนที่เต็ม" opens a **full-screen overlay** (`#mapOv`: ✕ top-right, ⟲ my location, filter chips เส้นทาง/ร้านอาหาร/ที่เที่ยว/อื่นๆ/เพื่อน, a location-status line with "ขอสิทธิ์ตำแหน่ง" only when needed). The single Leaflet instance is moved into the overlay and back (`mountMap`), never re-created or re-fitted; Back / Esc / ✕ close it (`history.pushState` + `popstate`).
Scroll behaviour: **no scroll-linked JS**. `#homeDock` (map card) is in normal flow and scrolls away with the page; only `#homeDays` (`.daybar`: day chips + a "แผนที่" button) is `position:sticky` at `--topH`, with a faint shadow + blur. No transform/transition/`will-change` on either. `html{scroll-padding-top}` = header + day bar (`--dockH` = day bar height) so scrolled-to steps are never covered. `showMap()` (the "แผนที่" button, also used by `focusStep` when the map is off-screen) smooth-scrolls to the map (`behavior:'auto'` under `prefers-reduced-motion`). A day change smooth-scrolls to the day heading only if the reader is already past it.

## Stability rules (the UI must not "bounce")
- **Refresh = compare, not re-render.** `load()` builds the new data, serialises the parsed tabs (`snapOf`, time-derived `dt` excluded) and compares it with `ui.sig`. Identical → nothing is touched (no `#tl`/`#homeDock`/`#map` replacement, no `drawMap`, scroll untouched). Different → `applyData` re-renders inside `keepScroll` (anchors on the first visible step). Under an open dialog / focused field / lightbox the new data waits (`ui.stale`) and is applied on close. A tab that fails to load keeps its last good copy; a failed plan fetch never wipes the screen.
- **Trip switch never blanks**: the previous plan stays (dimmed, sub-title "กำลังโหลด…") or the cached copy of the new trip is shown at once; nothing is cleared before new data arrives.
- **Reserve space**: sub-title, day bar and map have fixed/min sizes so late data cannot shift layout (CLS <= 0.05 in tests). Animate only `transform`/`opacity`.
- **Tabs**: each remembers its scroll (`ui.scroll`) and is re-rendered only when `ui.tabVer[tab] !== ui.ver` (`ui.ver` is bumped by `renderAll`, plan edits, spot/place changes).
- **Offline cache (stale-while-revalidate)**: `localStorage['tt.cache.<tripId>']` = `<time>\n<snapshot JSON>` of the last good data (skipped if > 1.5 MB; never picture chunks). Boot and trip switch render it immediately, then refresh; sub-title shows "กำลังอัปเดต…", and "ออฟไลน์ — แสดงข้อมูลล่าสุด HH:MM" when the network/RPC fails (no red error box when something is already shown). Private-trip caches (`tt.cache.priv:*`) are removed when a different traveller name is chosen (`#btnMe` list).

## Documents (tab เอกสาร)
- **Server** (`docs/supabase_docs.sql`, run by the user after the other docs/*.sql): tables `member_docs(id, scope person|shared, owner, trip, title, kind, mime, size_bytes, note, created_by, created_at, chunks)` + `member_doc_chunks(doc_id, i, data)` (base64 in <=300k-char chunks); RLS on, **no** grants to anon/authenticated. RPCs (SECURITY DEFINER, name via `_doc_auth` -> `_pin_ok`; after `supabase_open.sql` the hash is ignored): `doc_list` (metadata of ALL documents), `doc_get` (chunks, `null` if unknown), `doc_put(..., p_owner default null)` (for scope person the document belongs to `p_owner`, default the caller; `created_by` = caller; returns the id as text or `-1` auth, `-2` MIME, `-3` > 6 MB base64, `-4` limit 40 personal / 60 shared, `-5` bad title/scope/chunks, `-6` unknown owner; limit 40 is per owner), `doc_rename`, `doc_delete` (1 ok, 0 not found/not allowed, -1 auth). Policy (deliberate): documents are visible to every signed-in member (private group app) and any member can add a document for another member; rename/delete only by the owner or the uploader (`created_by`); shared docs by their creator. Allowed MIME: jpeg/png/webp/pdf. Honest limit: ID scans are sensitive; after `supabase_open.sql` they are protected only by knowing a member name (every listed name sees every document) and Supabase encryption at rest: effectively readable by anyone with the link (owner's explicit choice). No client-side encryption.
- **Segments**: ของฉัน | ส่วนกลาง | เพื่อน (friends' personal docs grouped per member, `friendGroups`, header toggles `dc.open`). The add sheet has a third scope "ของคนอื่น" + member picker (`p_owner`). "ดาวน์โหลดทั้งหมด" asks a scope (default ของฉัน+ส่วนกลาง; ทั้งหมดในกลุ่ม optional). Rename/delete menu items only when `docCan(d)` (owner or uploader).
- **Client** (`app.js`, section "documents"): `dc` state (list/status/segment), `dv` viewer state. `docsRefresh()` runs only when a name is chosen (otherwise a "เลือกชื่อ" panel, no RPC): `null` (server does not know the name) => Thai toast + retry panel (`docsRejected`), network error => use cached list ("ออฟไลน์" chip) or inline retry, missing function => `DOC_NOSQL` message.
- **Files**: `docBlob()` = IndexedDB (`tt-docs`, store `kv`: `l:<me>` list, `f:<me>:<id>` blob) -> network (`doc_get`, then cached). Thumbnails are fetched lazily (IntersectionObserver) into fixed 84 px boxes, so they also get cached. `docsWipe()` (called from `clearPrivCaches` on a traveller change, and from `syncMe()` when the effective name changes) bumps `dc.epoch` (in-flight work is discarded), revokes blob URLs and deletes the database.
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

## Header countdown chip
`#btnCd` in the header (replaces the old avatar button). `cdState()` derives the text from `tripRange/tripStatus` (date logic) and `nextEvent()` (plan events); `updateChip()` only touches the two text nodes, the class and the aria-label; called from `renderSub()` and a 30 s interval (skipped while the page is hidden). `openCdSheet()` shows a bottom sheet in the shared `<dialog id=dlg>` (class `cdsh`, rebuilt every 30 s while open). The traveller picker is reachable from Menu > profile card and the sheet footer.
