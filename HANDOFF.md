# Handoff

- **State** — The story spans the whole water year (Oct 2025 – Sep 2026,
  `MONTHS` has 12 entries, `NOW=11`). Snapshot scaling is anchored to July via
  `SNAP_MI`. Basin storage (`PMH_DERIVED`) and statewide streamflow
  (`FLOWPCT_DERIVED`) are derived by `scripts/build_normals.py`. Live readings
  overlay "today" only. The about page's 80% line now cites the Colorado Water
  Plan, chapter 4 (70% of surface water west of the Divide, about 80% with the
  Rio Grande, which is the figure usually quoted). The about page's "Water
  year 2026" section is now a finished-year narrative. Every streamflow and
  basin-storage figure in it comes from `data/basin_history.csv` (rebuilt
  2026-11-04), and the section links that CSV. The one other number, 91% of
  SNOTEL sites bare by 1 June, is the NRCS figure already on the stat strip.
- **State** — Every page's footer links the source on GitHub, and the repo
  carries an MIT `LICENSE` (2026-11-10, Jimmy's approved line: "I want people
  to be able to take this in the free and open source software ideology").
  Vendored libraries under `js/vendor/` keep their own licences.
- **State** — The about page has a *Since September* section (2026-11-11):
  Lake Powell's low of 15 September, its rise to 10 November (USBR daily
  record, linked) and the reservoirs and gages of 10 November from
  `data/live.json` against the weekly medians. Its figures are typed by hand
  and dated; they do not update. The Powell chart's 2022 "lowest on record"
  mark is gone, since September 2026 ended lower; the last year's mark is now
  computed from `POWELL_ANNUAL` ("2026 lowest since 1964").
- **Decided** — The headline strip (`STATEWIDE`, `renderStrip`, `statSeries`,
  `deriveStats` in live.js, the `.strip`/`.stat` CSS) was removed
  (2026-11-11). Reason: no page has had a `#strip` element since f375bd9, so
  its June and July figures were never shown, only read in the source.
- **Next** — Before any later rebuild, check
  the about page's figures against the new CSV: the prose quotes it by hand.
  A fresh fetch takes more than ten minutes; it caches under
  `/tmp/cw_normals_cache`, so a second run resumes.
- **Decided** — The old prose's "75% statewide storage" (NRCS, 1 June) and
  "Blue Mesa visibly draining" were cut from the year summary (2026-11-04).
  Reason: there is no derived statewide storage series to give a final
  figure, and nothing on the page sources the Blue Mesa claim.
- **Decided** — The snow-decade panel (`SNOW_DECADES`) stays on the year just
  closed until the new water year is 250 days in (2026-11-04). Reason: in
  November no station had 250 days of WY2027, so the panel came out empty and
  the smoke test failed.
- **Decided** — The site is a retrospective of water year 2026 plus the new
  year's carryover, not a rolling dashboard (2026-09-07). Reason: the live
  overlay was overwriting parts of a story that stopped in July, and the two
  layers could not be told apart. The year charts, timeline and narrative stay
  pinned to the closed year.
- **Decided** — 70%/80% wording (2026-11-04): the plan's own analysis says 70%
  and footnotes 80% as the traditional figure that counts the Rio Grande; a
  state reviewer may know the footnote, so the page gives both.
- **Open** — The *Since September* figures date from 10 November. Refresh
  them by hand if the about page is shown to a reviewer much later.
- **Open** — The Methods list still says the timeline is a reconstruction
  from NRCS reports, while the water-year section says the months are
  derived from CDSS and gage records. Not checked which is current.
- **Open** — The `~80% of water supply arrives as snowpack` stat in
  `js/data.js` is cited "NRCS / NOAA" with no link.
- **Over to you** — Reviewers and the email are drafted in the private project
  notes; sending is Jimmy's.
