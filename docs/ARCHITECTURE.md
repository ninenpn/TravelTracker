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
Tabs: **แผน** (plan: sticky map dock + day bar, countdown, stay card, steps, ideas, gallery shortcut) · **เงิน** (budget/ledger per currency, expense list) · **สถานที่** (suggestions from the saved list, all places, tips "น่าไป") · **แผนที่** (full map, filters) · **เมนู** (profile, edit card, pictures, usage card, notifications, theme, trips, members).
Scroll behaviour: `window scroll` handler toggles `ui.dockAway = false | 'hide' | 'peek'` → classes `.dock.away` / `.dock.peek` (CSS transform, no layout shift) so details are never hidden by the map.

## Maps & travel time
Leaflet + OSM tiles; geocoding via Nominatim (cache `tt.gc2`), routing via routing.openstreetmap.de (cache `tt.trv`); estimates are marked `~`. Location tracking is only requested between the first flight's arrival and the last flight's departure (`gate()`).

## Pictures
Excel pictures → JPEG ≤1000 px → base64 chunks (`private_rows`, tab `media:<id>`; index in tab `media`). The gallery fetches thumbnails lazily (IntersectionObserver) and caches them in memory per session.

## Free-tier budget
500 MB DB (now ~14 MB), 5 GB egress/month (`apiStat` counts this device's usage), 7-day idle pause. Menu → "โควตาฟรี Supabase" shows real DB size via `usage_stats`.
