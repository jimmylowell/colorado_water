# Handoff

- **State** — The story spans the whole water year (Oct 2025 – Sep 2026,
  `MONTHS` has 12 entries, `NOW=11`). Snapshot scaling is anchored to July via
  `SNAP_MI`. Basin storage (`PMH_DERIVED`) and statewide streamflow
  (`FLOWPCT_DERIVED`) are derived by `scripts/build_normals.py`. Live readings
  overlay "today" only. The about page's 80% line now cites the Colorado Water
  Plan, chapter 4 (70% of surface water west of the Divide, about 80% with the
  Rio Grande, which is the figure usually quoted).
- **Next** — The September rebuild: `rm -rf /tmp/cw_normals_cache && python3
  scripts/build_normals.py && python3 scripts/make_csvs.py && npm run smoke`,
  then rewrite the about page's "Water year 2026" section as a finished-year
  narrative with the final September figures. The fetch takes more than ten
  minutes; it caches as it goes, so a second run resumes. It worked if
  `basin_history.csv` shows distinct August and September rows and the live
  status line reads "Water year 2027, day N · carryover".
- **Decided** — The site is a retrospective of water year 2026 plus the new
  year's carryover, not a rolling dashboard (2026-09-07). Reason: the live
  overlay was overwriting parts of a story that stopped in July, and the two
  layers could not be told apart. The year charts, timeline and narrative stay
  pinned to the closed year.
- **Decided** — 70%/80% wording (2026-11-04): the plan's own analysis says 70%
  and footnotes 80% as the traditional figure that counts the Rio Grande; a
  state reviewer may know the footnote, so the page gives both.
- **Open** — The `~80% of water supply arrives as snowpack` stat in
  `js/data.js` is cited "NRCS / NOAA" with no link.
- **Over to you** — Reviewers and the email are drafted in the private project
  notes; sending is Jimmy's.
