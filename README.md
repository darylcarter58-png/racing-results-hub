# DCR Hub — Automation

This folder contains:
- `providers.yaml` — provider deep-link templates.
- `fetch_results.py` — builds `data/results.json` from a CSV/JSON feed and templates.
- `.github/workflows/fetch-results.yml` — runs every 15 minutes (UTC) and on-demand.

## Inputs (set as GitHub Secrets)
- `SOURCE_CSV_URL` — a published CSV URL with columns:
  `meeting_date, course, off_time, race_number, race_title, horse, position, sp, note, handicap`
- `COURSE_ALIASES` — optional JSON mapping for normalising course names (e.g. `{ "Newcastle (AW)":"Newcastle" }`).

## Output
- `data/results.json` committed to the repo (served by your static site).

## Notes
- Cron is `*/15 * * * *` (UTC). UK time changes are handled by running every 15 minutes regardless of DST.
- Edit `providers.yaml` to ensure replay deep links are correct for your providers.
