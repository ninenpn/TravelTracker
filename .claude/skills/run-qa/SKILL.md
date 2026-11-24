---
name: run-qa
description: Run the full Travel Tracker QA suite (static guards, browser e2e, SQL validation, live read-only smoke test) and interpret the result. Use before handing off, before pushing, or when asked to "test everything" / "check the system".
---

# Run QA

```bash
bash tests/run.sh --sql --live      # everything (≈4 min). Use --quick for static guards only (≈2 s)
```
| Stage | What it proves | Needs |
|---|---|---|
| static checks | JS syntax, no secret keys / PIN hashes / .xlsx / private files tracked, build placeholder intact | git, node |
| e2e (`tests/e2e.js`) | load, login+PIN, trips & Current/Upcoming/Past filter, private-trip access, gallery, plan editing (travel/stay maths + shifting), saving via RPC, money maths, tabs, reminders, location window, 3 phone sizes, no console errors | Playwright + Chromium; network to Supabase (public reads) |
| sql (`tests/sql/test.sh`) | docs/*.sql apply cleanly twice, RLS blocks anon, wrong code/PIN refused, throttle, history | postgres binaries (skips if absent) |
| live smoke (`tests/live-smoke.js`) | the real database still has its public data, RLS holds, function guards hold, DB size < free limit | network only, **read-only** |

## Interpreting
- Exit code 0 and `ALL GREEN` = pass. Otherwise read the `FAIL` lines (each prints a detail after `→`).
- A failing e2e check on **Almaty live data** (A-section) may mean the real data changed or Supabase is unreachable — check `live-smoke` before assuming a code bug.
- Never "fix" a failure by deleting/loosening a check unless the check itself is wrong; if so, say why.
- Screenshots for visual checks: write scripts under the scratchpad with `deviceScaleFactor: 1`, look at them, don't commit them.

## Extra manual checks worth doing for UI changes
360×640 and 430×932 viewports · dark mode (`#bTheme`) · scroll down/up on a long day (map slides away, day bar returns) · a Past trip and the Upcoming trip · logged-out vs signed-in.
