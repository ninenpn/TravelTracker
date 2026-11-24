---
name: import-trip
description: Import a new trip from an Excel/Google Drive file into Travel Tracker (plan, cost table, extra tabs, pictures) and register it in the app. Use when the user adds another trip file/folder to import.
---

# Import a trip

Pipeline: **Drive/Excel → `tools/import_trip.py` → Supabase `private_rows` → entry in `PRIV_TRIPS` (app.js) → QA → deploy**. The Excel file and everything generated stay **out of git** (`private/` is ignored).

1. **Get the file(s)**. For a public Drive folder: `curl -sL "https://drive.google.com/embeddedfolderview?id=<FOLDER_ID>"` lists `entry-<fileId>` + titles; download with `curl -sL "https://drive.google.com/uc?export=download&id=<fileId>" -o private/<name>.xlsx`. Put them under `private/` (create it).
2. **Inspect** the workbook: sheet names, which sheet is the plan, which is the cost table, extras. The plan needs columns `Day, Start time, Start Location, Arrive time, Arrive Location, How to Travel, Note` (extra `Notice`, `Tickets`, `Location` are fine). Day cells may be real dates (the year is kept) or text like `13-ก.พ.`.
3. **Dry run** (writes only `private/<key>.rows.json`):
   ```bash
   python3 tools/import_trip.py --xlsx private/<file>.xlsx --key <short-key> --name "<Trip Name>" \
       --map "<plan sheet>=plan,<cost sheet>=Cost,<other sheet>=<Other Tab>" --media
   ```
   Check the printed row counts, NOT-imported sheets, the date range and the suggested `PRIV_TRIPS` line. Mention to the user what cannot be imported (merged-cell layout, formulas become values).
4. **Compare with the source** before writing: every non-empty cell of every mapped sheet must appear identically (the importer is deterministic; for a deeper audit read the workbook again and diff). Hyperlinks hidden behind text are appended to the cell text automatically.
5. **Write** (needs the user's secret key for this session, see `supabase-ops`):
   ```bash
   SB_SECRET_KEY=... python3 tools/import_trip.py ... --media --members --write
   ```
   It replaces all rows of that trip, writes in batches, and verifies by reading back (`mismatches: 0` required).
6. **Register in the app**: paste the printed line into `PRIV_TRIPS` in `app.js` (keep `start`/`end` — they drive Current/Upcoming/Past). Add the trip key (and its extra tabs) to `FAKE` / `EXTRA` in `tests/lib.js` — required, otherwise the e2e trip-count checks (C1/C3) fail.
7. **QA + deploy**: `bash tests/run.sh --sql --live`, then `deploy-and-verify`. Finally open the trip as a signed-in member (see `supabase-ops` for the temporary-PIN technique) and check plan, cost, extras, pictures.
8. Tell the user to rotate the secret key and that the .xlsx/`private/` files were not committed.
