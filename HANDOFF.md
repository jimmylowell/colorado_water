# Handoff

- **State, hosting (2026-11-06)** — Moving from GitHub Pages to Cloudflare
  Pages, project `colorado-water` (`colorado-water.pages.dev`, first deploy
  2026-11-06 by direct upload of the pages, `css/`, `js/`, `img/`, `data/`
  and the icons). water.myjimmycloud.com still points at GitHub Pages until
  the DNS flip. This branch drops `CNAME` and gives `refresh-data.yml` a
  deploy step (wrangler pinned to 4.42.0), so the daily refresh publishes
  itself once the repo has `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`
  (a Pages-Edit-only token). Merge only after the secrets are set and the
  domain is flipped; until then the deploy step would fail.
- **Next, hosting** — Secrets set, one `workflow_dispatch` run proves a
  deploy lands, attach the domain, flip the CNAME, merge. A merge that is not
  a data refresh goes live by running the workflow from the Actions tab (it
  always deploys), or `wrangler pages deploy` of the same files.
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
- **Next** — Jimmy reviews and merges PR #1. Before any later rebuild, check
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
- **Open** — The `~80% of water supply arrives as snowpack` stat in
  `js/data.js` is cited "NRCS / NOAA" with no link.
- **Over to you** — Reviewers and the email are drafted in the private project
  notes; sending is Jimmy's.
