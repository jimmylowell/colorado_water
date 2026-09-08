# colorado_water

Static, build-free site: HTML + vanilla JS, vendored d3, `scripts/` for data
prep, small baked data committed. `README.md` is the technical reference (data
flow, tests, deploy). Copy rules: US spelling, plain sentences, no em-dash
asides, agency names as DWR uses them; the audience includes state water staff.

Verify with `npm run smoke` (data invariants + jsdom load of `index.html`).
`map.html`, `timeline.html` and `data.html` are not covered by the smoke suite;
load them in jsdom with `fetch` stubbed to `data/live.json` when they change.

## Now

- **State** — The story now spans the whole water year (Oct 2025 – Sep 2026,
  `MONTHS` has 12 entries, `NOW=11`). Snapshot scaling is anchored to July via
  `SNAP_MI`. Basin storage (`PMH_DERIVED`) and statewide streamflow
  (`FLOWPCT_DERIVED`) are derived by `scripts/build_normals.py`; September is
  carried forward from August until the month closes. Live readings overlay
  "today" only.
- **Next** — On or after 2026-10-01: `rm -rf /tmp/cw_normals_cache &&
  python3 scripts/build_normals.py && python3 scripts/make_csvs.py && npm run
  smoke`, then rewrite the about page's "Water year 2026" section as a
  finished-year narrative with the final September figures. It worked if
  `basin_history.csv` shows distinct August and September rows and the live
  status line reads "Water year 2027, day N · carryover".
- **Decided** — The site is a retrospective of water year 2026 plus the new
  year's carryover, not a rolling dashboard (2026-09-07). Reason: the live
  overlay was overwriting parts of a story that stopped in July, and the two
  layers could not be told apart. The year charts, timeline and narrative stay
  pinned to the closed year.
- **Open** — Who reviews it before it goes out. Jimmy wants someone at a
  Colorado water agency to look it over; no contact chosen.
- **Over to you** — Confirm the "about 80% of streamflow originates west of the
  Divide" wording against the Colorado Water Plan before emailing the site.

## Log

- 2026-09-07: Prose pass for a state-agency audience; live flow added for the
  two DWR-operated gages USGS publishes no discharge for; month list extended
  to the full water year; streamflow index switched from a hand series to one
  derived from the gage record (the hand series was far off in winter).
