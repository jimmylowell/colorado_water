# Handoff

- **State, the story rework** — The one long front page is split into pages,
  one kind of content each: Today (`index.html`), Water year 2026
  (`water-year-2026.html`), The long view (`long-view.html`) and How it works
  (`how-it-works.html`). The design is [docs/design.md](docs/design.md). It is
  built on branch `next` and deployed to next.colorado-water.pages.dev only;
  the live site is unchanged. Steps 2 to 4 of the rework (words as bullets,
  Today's own snow and Lake Powell data, Reports with the autumn check-in)
  follow on `next`, then it goes live in one step.
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
- **Next** — Step 2: the words as bullets on every page, each figure checked
  again against `data/basin_history.csv` and `js/normals.js`. Before any later
  rebuild of the normals, check the report's figures against the new CSV: its
  prose quotes it by hand. A fresh fetch takes more than ten minutes and
  caches under `/tmp/cw_normals_cache`.
- **Open** — About's *Since September* figures date from 10 November; step 4
  moves them into the autumn check-in, re-read on the day.
- **Open** — About's Methods list says the timeline is a reconstruction from
  NRCS reports, while the report says the months are derived from CDSS and
  gage records. Not checked which is current.
- **Open** — The `~80% of water supply arrives as snowpack` stat in
  `js/data.js` is cited "NRCS / NOAA" with no link; step 2 sources it or cuts
  it.
- **Over to you** — `README.md` still describes the single story page,
  `timeline.html` and GitHub Pages hosting. GitHub Pages is still switched on
  in the repo Settings and serves nothing; switching it off is optional.
