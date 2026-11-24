# QA guide

Definition of done: **all gates green + every acceptance criterion proven + no secret/private data in the diff.**

## Gates (automated)
```bash
bash tests/run.sh --sql --live     # full
bash tests/run.sh --quick          # secrets / syntax only
```
- `tests/static-check.sh` — JS syntax; no `sb_secret_…`/service-role values tracked; no `.xlsx`/`private/`/`.env` tracked (except `docs/sheet-templates/`); no 64-hex strings in `docs/*.sql`; `__BUILD__` placeholder present.
- `tests/e2e.js` — Playwright against a local static server. Public data comes from the real Supabase; private trips/writes are **mocked with synthetic data** from `tests/lib.js` (`FAKE` trips). Sections: A data · B login/PIN · C trips/status/access/gallery · D plan editing & saving · E money · F tabs · G reminders/location · H layout on 360/390/430 px.
- `tests/sql/test.sh` — applies `docs/*.sql` to a throw-away Postgres twice (idempotency) and exercises RLS, code/PIN guards, throttle, history, membership.
- `tests/live-smoke.js` — read-only checks of the real database with the public key.

## Manual / exploratory checklist (QA agent walks the relevant parts)
**Login & PIN** — name with PIN asks PIN; wrong PIN rejected; name without PIN creates one (confirm mismatch refused); PIN never appears in localStorage/URL; guest.
**Trips** — signed-in sees all; logged-out sees only the public trip and never calls `get_private`; filter Current+Upcoming default / Past / All; Past sorted newest first; a saved Past trip falls back to a Current/Upcoming one on a fresh session; status flips with the date (use Playwright `clock`).
**Plan** — day bar, countdown, stay card collapsed, step cards with ⏱ travel and 🕒 stay chips, flights show no travel chip; edit: travel minutes ⇄ arrival time, stay minutes shift the next timed stops (even across a free-text row), add step prefilled from previous arrival, move to another day, delete, drag handle; save message "บันทึกแล้ว"; wrong edit code refused and forgotten; reload shows the saved change.
**Money** — per-currency budget/ledger; personal / shared / split maths; pair debts net each other.
**Places/Tips** — suggestions only from the user's own list and only when near the plan and time-feasible; "น่าไป" lists with Maps/TikTok/Facebook links (not for travel items).
**Map** — Leaflet renders; same-place visits merge into one pin (`3·5`) and return legs curve apart; finished stops are hidden for today, whole route shown for finished trips.
**Pictures** — gallery opens from Menu and plan; thumbnails load lazily; tap opens a lightbox.
**Menu** — usage card shows DB size / 500 MB; notifications toggle; theme toggle; trip list.
**Layout** — no horizontal scroll on any tab at 360×640 / 390×844 / 430×932; scrolling down hides map+day bar (content area ≥ 75 % of the viewport), scrolling up shows only the day bar (🗺 button restores the map); last item not covered by the bottom bar; dark mode legible.
**Security/privacy** — anon cannot read private tables or write `sheet_rows`; strangers get `null` / `-1`; no secret key or private text in the diff; temporary DB rows removed.

## Severity
blocker (criterion unmet, data loss/leak, crash, red gate) · major (wrong behaviour users will hit, content hidden, new behaviour untested) · minor (polish).

## Known limits (not bugs)
Excel merged-cell layout and formulas are not preserved (values only); a 4-digit PIN is weak; Almaty data is public by design; OSM/Nominatim/routing are third-party services (rate limited); free Supabase pauses after 7 idle days.
