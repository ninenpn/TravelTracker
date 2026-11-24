# QA guide

Definition of done: **all gates green + every acceptance criterion proven + no secret/private data in the diff.**

## Gates (automated)
```bash
bash tests/run.sh --sql --live     # full
bash tests/run.sh --quick          # secrets / syntax only
```
- `tests/static-check.sh` — JS syntax; no `sb_secret_…`/service-role values tracked; no `.xlsx`/`private/`/`.env` tracked (except `docs/sheet-templates/`); no 64-hex strings in `docs/*.sql`; `__BUILD__` placeholder present.
- `tests/e2e.js` — Playwright against a local static server. Public data comes from the real Supabase; private trips/writes are **mocked with synthetic data** from `tests/lib.js` (`FAKE` trips). Sections: A data · B login/PIN · C trips/status/access/gallery · D plan editing & saving · E money · F tabs · G reminders/location · H layout on 360/390/430 px · I stale PIN / past-trip reminders · J calm UI (CLS <= 0.05 via `PerformanceObserver`, identical-refresh node identity, anchor kept on changed data, dialog safety, trip switch without blank frames, per-tab scroll memory, dock hysteresis + reduced motion, map overlay open/close/filters/Esc/Back, 4-5 item nav, home top compaction at 390×844 / 360×640, offline cache + banner via `setOffline`) · K documents (tab, segments/counts, upload + downscale, lazy thumbs, viewer zoom/rotate/prev-next/Esc/Back, PDF, share/download, offline open from IndexedDB, wipe on sign-out, privacy between two members (mock mirrors server rules), type/size/server refusals, stale PIN vs transient error, SQL-not-applied message, info card + taxi screen, CLS, 360/390/430 layouts). `tests/lib.js` has an in-memory `doc_*` mock (`s.docs`, flags `noDocsSql`, `nullDocs`, `offline`, `forcePut`).
- `tests/sql/test.sh` — applies `docs/*.sql` to a throw-away Postgres twice (idempotency) and exercises RLS, code/PIN guards, throttle, history, membership, and the document RPCs (every member sees/gets all docs, add-for-someone-else with `p_owner`, owner-or-uploader rename/delete, unknown owner -6, MIME/size/title/count limits, wrong PIN, no grants).
- `tests/live-smoke.js` — read-only checks of the real database with the public key.

## Manual / exploratory checklist (QA agent walks the relevant parts)
**Login & PIN** — name with PIN asks PIN; wrong PIN rejected; name without PIN creates one (confirm mismatch refused); PIN never appears in localStorage/URL; guest.
**Trips** — signed-in sees all; logged-out sees only the public trip and never calls `get_private`; filter Current+Upcoming default / Past / All; Past sorted newest first; a saved Past trip falls back to a Current/Upcoming one on a fresh session; status flips with the date (use Playwright `clock`).
**Plan** — day bar, countdown, stay card collapsed, step cards with ⏱ travel and 🕒 stay chips, flights show no travel chip; edit: travel minutes ⇄ arrival time, stay minutes shift the next timed stops (even across a free-text row), add step prefilled from previous arrival, move to another day, delete, drag handle; save message "บันทึกแล้ว"; wrong edit code refused and forgotten; reload shows the saved change.
**Money** — per-currency budget/ledger; personal / shared / split maths; pair debts net each other.
**Places/Tips** — suggestions only from the user's own list and only when near the plan and time-feasible; "น่าไป" lists with Maps/TikTok/Facebook links (not for travel items).
**Map (full-screen overlay from "เปิดแผนที่เต็ม"; there is no Map tab)** — opens/closes with ✕, Esc and Back without moving the view; chips toggle layers; "ขอสิทธิ์ตำแหน่ง" only when permission is needed; Leaflet renders; same-place visits merge into one pin (`3·5`) and return legs curve apart; finished stops are hidden for today, whole route shown for finished trips.
**Pictures** — gallery opens from Menu and plan; thumbnails load lazily; tap opens a lightbox.
**Menu** — usage card shows DB size / 500 MB; notifications toggle; theme toggle; trip list.
**Stability** — nothing jumps: layout-shift <= 0.05 on boot → login → home and on trip switch; a 60 s refresh with unchanged data touches no DOM and keeps scroll; each tab restores its own scroll; slow jittery scrolling does not flip the map/day bar back and forth; offline shows the last data with "ออฟไลน์ — แสดงข้อมูลล่าสุด HH:MM".
**Layout** — no horizontal scroll on any tab at 360×640 / 390×844 / 430×932; scrolling down hides map+day bar (content area ≥ 75 % of the viewport), scrolling up shows only the day bar (🗺 button restores the map); last item not covered by the bottom bar; dark mode legible.
**Documents** — real phone check (not automatable): camera capture, Share sheet with the file on iOS/Android, Wake Lock in Safari tab vs home-screen app (hint shown when unsupported), pinch/double-tap feel, airplane-mode open of a saved document, second person signing in on the same phone finds no cached files of the first (local cache wiped; the server list shows every member's documents by design). Documents are visible to every signed-in member (private group app); the shared 4-digit-PIN limits still apply. Checklist: เพื่อน segment grouped per member, add for someone else (ของคนอื่น) + toast, rename/delete only for owner/uploader, offline download scope choice.
**Security/privacy** — anon cannot read private tables or write `sheet_rows`; strangers get `null` / `-1`; no secret key or private text in the diff; temporary DB rows removed.

## Severity
blocker (criterion unmet, data loss/leak, crash, red gate) · major (wrong behaviour users will hit, content hidden, new behaviour untested) · minor (polish). **Personal documents being visible to all signed-in members is by design (user policy) — not a finding.**

## Known limits (not bugs)
Excel merged-cell layout and formulas are not preserved (values only); a 4-digit PIN is weak; Almaty data is public by design; OSM/Nominatim/routing are third-party services (rate limited); free Supabase pauses after 7 idle days.
