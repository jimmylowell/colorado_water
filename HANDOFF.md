# Handoff

- **State, the story rework** — The one long front page is split into pages,
  one kind of content each: Today (`index.html`), Water year 2026
  (`water-year-2026.html`), The long view (`long-view.html`) and How it works
  (`how-it-works.html`), plus Reports (`reports.html`) with the autumn 2026
  check-in (`check-in-2026-autumn.html`). The design is
  [docs/design.md](docs/design.md). It is live at water.myjimmycloud.com: `next`
  was merged into main and deployed on 2026-11-26.
- **State, check-ins** — A check-in is a frozen page with its figures typed
  in from the day it was written; it loads no scripts. Due early January,
  April and July; October's is the yearly report. How one is made, step by
  step: [docs/design.md](docs/design.md), *Check-ins*. The next is early
  January 2027 (how is the snow starting?); `reports.html` names that date.
  The autumn 2026 check-in was written 23 November 2026 from `data/live.json`
  generated 24 November 00:03 UTC and USBR's rows of 22 November.
- **State, stale gages** — USGS's newest value for Rio Grande near Del Norte
  (08220000) is from 30 April 2003 and for South Platte at Kersey (06754000)
  from 23 May 2000; `fetch_live.py` took them as current. It now drops a USGS
  value over 14 days old, and CDSS fills both (RIODELCO, PLAKERCO). Their
  weekly medians in `js/normals.js` come from DWR's published daily record in
  CDSS (`surfacewatertsday`), 1 January 1991 to 3 November 2026, 35 or more
  years in every week; `GAGE_NORMALS_SRC` names it, and the map sheet, the
  report's Method and the Data page say so. Only these two arrays were
  replaced; the other gages were not rebuilt. `build_normals.py` does the same
  for any gage whose newest USGS value is over 14 days old. The percents did
  not move for late November: Del Norte's week median is 190 cfs either way
  (737 cfs, 388%), Kersey's 813.5 became 811 (569 cfs, 70%).
- **Decided, stale-gage medians (2026-11-26)** — Medians use CDSS's published
  record, not its telemetry daily values: telemetry runs far above it in
  winter (Del Norte, January and February 1998: telemetry median 2,050 cfs,
  published 230 cfs; USGS gave the same 170 cfs as the published record on
  1 January 1991).
- **State, agency flags** — `fetch_live.py` keeps each gage reading's flags
  in `data/live.json` (`gage_flags`, with the agency's words in
  `flag_words`). A reading flagged anything but `A` or `P` carries a note in
  the agency's words, linked to its definition, on How it works (basin map,
  step-down, its table) and the map page (sheet, list, hover); the readings
  line counts them. Method: [docs/design.md](docs/design.md), *Today means
  today*. Rio Grande near Del Norte (782 cfs on 26 November 2026) and the
  other three DWR-operated gages carry CDSS `flagA` `O`, which CDSS's station
  flags table defines as "Original data as collected by the data collection
  platform" (`P` is "Provisional ... final processing has not been
  completed", `A` "Approved - Processing and review completed."). No `flagB`
  (such as `Ice`, "Ice affected") is on them; every USGS reading is `P`. The
  site shows the readings as recorded and says nothing about whether they
  are right.
- **Open, next rebuild** — On a full rebuild these two gages join
  `FLOWPCT_DERIVED`, the statewide monthly flow index, which they are not in
  now (USGS had no 2026 days for them). Check `secFlow2026` in `js/story.js`
  against the new index then. The autumn check-in is frozen and does not
  change; it gives no percent for Del Norte or Kersey, so nothing in it is off.
- **State, snow and Lake Powell on Today** — `scripts/fetch_live.py` adds
  `snow` and `powell` blocks to `data/live.json` each day (method in
  [docs/design.md](docs/design.md), *Today means today*), and saves the NRCS
  response and the last 400 USBR rows under `data/raw/`. The 43-site panel
  and each site's median for every day are in `data/snow_panel.json`, built
  by `scripts/build_snow_panel.py`, which stops unless it finds the same
  number of sites as `SNOW_DECADES`. Rebuild it when the normals are rebuilt.
  On 22 November 2026: 42 of 43 sites, 1.9 in of water, 65% of the median
  (3.0 in); Lake Powell 6,510,899 acre-feet at 3,540.98 ft.
- **State, the words** — Every story page is bullets, one claim to a bullet,
  each with its source; `shortProse` in `scripts/smoke_dom.mjs` fails any
  story paragraph over 30 words. The report's figures were checked against
  `data/basin_history.csv` and `js/normals.js` on 2026-11-23 and are typed in
  `secFlow2026`, `secStorage2026` and `secPowell2026` in `js/story.js`; the
  long view's and the snow bullets are computed from `SNOW_DECADES` and
  `POWELL_ANNUAL`. Claims with no published source were cut; the rest cite
  Wikipedia or the agency.
- **State, "today"** — "Today", "right now" and "live" appear only on a figure
  from the newest day's readings (`LIVE_META.day`, the newest `asOf` in
  `data/live.json`). `readingOf(r)` in `js/data.js` gives each reservoir its
  newest reading and that reading's date; `basinToday(bid)` sums the
  reservoirs that reported that day against their medians for that week. The
  map page (`viz.js`) still uses `stoAt`/`pmAt`, which scale the July snapshot
  to September where there is no reading; it labels readings with their date
  but was not reworked.
- **State, hosting** — water.myjimmycloud.com is Cloudflare Pages project
  `colorado-water` (`colorado-water.pages.dev`), a direct upload, with the
  domain a proxied CNAME to that address. A merge or the daily data commit
  goes live only when main is deployed by hand. The deploy is the pages
  (`*.html`), `css/`, `js/`, `img/`, `data/` and the two icons, nothing else:
  `npx wrangler pages deploy <that folder> --project-name colorado-water --branch main`
  (`--branch next` for the preview).
- **Decided, hosting** — The daily refresh commits and does not deploy until
  the owner adds a token with Cloudflare Pages Edit only to the repo secrets;
  then a `cloudflare/wrangler-action@v3` step pinned to
  `wranglerVersion: "4.42.0"` makes it daily.
- **Decided** — The water year 2026 report loads no daily readings
  (2026-11-23). Reason: with them loaded, the September month of the player and
  the snow-in charts showed November readings as September.
- **Decided** — The snow-decade panel (`SNOW_DECADES`) stays on the year just
  closed until the new water year is 250 days in (2026-11-04). Reason: in
  November no station had 250 days of WY2027, so the panel came out empty.
- **Decided** — The headline strip (`STATEWIDE`, `renderStrip`) was removed
  (2026-11-11): no page had an element for it.
- **Decided** — 70%/80% wording (2026-11-04): the Colorado Water Plan says
  70% and footnotes 80% as the figure that counts the Rio Grande; About gives
  both.
- **Decided, sources (2026-11-23)** — The "~80% of water supply arrives as
  snowpack" tile had no source: replaced by Wikipedia's "up to 90 percent of
  the [Colorado] river's flow originates as snowmelt" and "the majority of the
  water supply falls as snow". The megadrought is "the driest multi-decade
  period the region has seen since at least 800 CE" (Wikipedia; its link was
  to a missing article and is fixed). Aridification cites Wikipedia's "some
  researchers have found that the Colorado River basin ... [is] undergoing
  aridification"; the snow-to-rain and earlier-melt lines had no source and
  were cut. Cut too: the monsoon's effect on reservoirs, "half a Front Range
  home's summer water goes on the lawn" (now Wikipedia's US 50–70% for
  landscaping), "close to nine in ten Coloradans" (now ~80%, Wikipedia,
  Colorado–Big Thompson Project), Roberts as "Colorado's longest water
  tunnel" (Wikipedia: "one of the world's longest"). Sanchez's low levels are
  stated from its own weekly medians (5–11% of capacity).
- **Decided, method** — The month-by-month figures are derived from CDSS
  daily storage against weekly medians (`PMH_DERIVED`); the Yampa & White's
  are a hand-anchored estimate. About's Methods now says so (it said NRCS
  reports).
- **Next** — Changes on this project go straight live when their checks
  pass: build on a branch, merge into main and deploy main. After any fetch,
  check `data/hydro.json` still holds 43 or more series: when the USGS
  daily-values call times out it is written with 31, and the committed one
  should be kept. A fetch run long before the 12:15 UTC daily refresh catches
  a half-posted day (on 2026-11-26 at 07:17 UTC only 12 of 27 reservoirs had
  that day's reading), so deploy on the daily file or after mid-morning UTC.
  Before any later rebuild of the normals, check the report's figures against
  the new CSV: they are typed by hand. A fresh fetch takes more than ten
  minutes and caches under `/tmp/cw_normals_cache`.
- **Decided, provider descriptions (2026-11-26)** — Each `desc` in `TAPS`
  (`js/data.js`) says only what a Wikipedia article says, cited as
  `(Wikipedia: …)` through `wp(article,label)`; claims with no source were
  cut. 28 providers keep a cited line; 8 show name and figures only (empty
  `desc`): Highlands Ranch, Arvada, Broomfield group, Golden, Steamboat,
  Craig, Longmont, Trinidad. Wikipedia's Ralston Dam says Ralston supplies
  Denver, not Arvada. The smoke test holds every `desc` to 30 words with a
  Wikipedia link in each sentence.
- **Open** — The 8 empty providers need a published source for their supply
  (their own water pages refused automated reads), and Arvada's reservoir
  list (`ralston`) should be checked against Arvada's own water page.
- **Decided, sources (2026-11-26)** — Lake Powell's 3,490 ft power pool and
  3,370 ft dead pool cite Wikipedia, Glen Canyon Dam, *Water storage and
  distribution*. The Moffat Tunnel note says only what Wikipedia says:
  Williams Fork water reaches it through the Fraser valley (Moffat Tunnel,
  *Water tunnel*) and it feeds Gross Reservoir (Gross Reservoir). "By 1 June,
  91% of SNOTEL sites were bare" was cut: it dates from the first build, and
  no NRCS document for it was found (nrcs.usda.gov did not answer).
- **Over to you** — `README.md` still describes the single story page,
  `timeline.html` and GitHub Pages hosting. GitHub Pages is still switched on
  in the repo Settings and serves nothing; switching it off is optional.
