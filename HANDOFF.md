# Handoff

- **State, the story rework** — The one long front page is split into pages,
  one kind of content each: Today (`index.html`), Water year 2026
  (`water-year-2026.html`), The long view (`long-view.html`) and How it works
  (`how-it-works.html`). The design is [docs/design.md](docs/design.md). It is
  built on branch `next` and deployed to next.colorado-water.pages.dev only;
  the live site is unchanged. Step 2, the words as bullets, is on `next`
  too. Steps 3 and 4 (Today's own snow and Lake Powell data, Reports with
  the autumn check-in) follow on `next`, then it goes live in one step.
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
- **Next** — Put `next` up as the preview once wrangler is signed in again
  (`npx wrangler whoami` says not authenticated), check it at 390 and 1280 px
  in light and dark, then step 3. Before any later rebuild of the normals,
  check the report's figures against the new CSV: they are typed by hand. A
  fresh fetch takes more than ten minutes and caches under
  `/tmp/cw_normals_cache`.
- **Open** — About's *Since September* is still prose, figures from
  10 November; step 4 moves it into the autumn check-in as bullets, re-read
  on the day.
- **Open** — Not yet bullets or sourced: the provider descriptions (`desc` in
  `TAPS`, `js/data.js`, about 35 of them, class `tap-desc`, left out of the
  paragraph-length test) and the Moffat Tunnel note (Wikipedia's text does
  not name the Fraser or Gross Reservoir). The 91% of SNOTEL sites bare by
  1 June is cited "NRCS" with no document; the NRCS Colorado water supply
  outlook for June 2026 would be the link. The dead pool and power pool
  elevations on the Powell chart are not in the Wikipedia text read.
- **Over to you** — `README.md` still describes the single story page,
  `timeline.html` and GitHub Pages hosting. GitHub Pages is still switched on
  in the repo Settings and serves nothing; switching it off is optional.
