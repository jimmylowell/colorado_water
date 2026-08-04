# Colorado Water — where it sits, where it combines

An interactive map of Colorado's reservoirs and rivers for drought awareness:
where the water actually sits, where it comes from, and how a dry year draws it
down. Reservoirs are drawn as glasses of water (fill level = storage, filled by
area so the level is honest), rivers as source-coloured ribbons, and the
transmountain tunnels that move West Slope water to the Front Range as dashed
crossings of the Continental Divide.

The front door (`index.html`) is one scrolling **story in three acts**, widening
then narrowing:

1. **Colorado** — snowpack, the water year that begins Oct 1, what a reservoir
   is actually for, the seven basins shaded by how each stands against its own
   normal, and the long view (Lake Powell, aridification). No ZIP required.
2. *— the ZIP/city gate sits here, once the reader knows what they're looking
   at and has a reason to want their own —*
3. **Your basin** — basin stats and a basin-focused map: its real boundary,
   rivers, reservoirs as glasses, and live gage flows (`js/basinmap.js`).
4. **Your tap** — the utility, its reservoirs, current restrictions, and what
   you can do.

The dense statewide reservoir-by-reservoir map is deliberately *not* used in
the story — it is offered once, at the very end, as a detail view for large
screens. Provider/basin data is `TAPS` (+ `hb` home basin) and `BASININFO` in
`js/data.js`. A shareable `/#80302` opens the story on that ZIP.

Navigable map state lives in the URL hash (`#r=<reservoir>`, `#n=<gage/node>`,
`#zip=<zip>`, `#view=flow`, `#basin=<id>`), so the browser Back button walks
selections and every view is a shareable link. Legacy/map deep-links opened on
the root auto-redirect from the story to `map.html`.

**Pages**

- `index.html` — the story front door (Colorado → your basin → your tap)
- `map.html` — the detailed statewide map and flow-and-mixing diagram; linked
  from the end of the story rather than the site nav, since it is dense and
  wants a large screen
- `timeline.html` — scrub/play water year 2026 and watch the drawdown
- `data.html` — the full dataset as downloadable CSVs, with sources
- `about.html` — the story and the methods

## How data flows

`js/data.js` is the canonical dataset — a dated snapshot (22 Jul 2026) of 49
reservoirs, basin history, rivers, and the flow graph. The site renders
entirely from it, so everything works offline or from a saved file.

On load, the browser asks two public CORS-open APIs for fresher numbers and
overlays whatever it gets:

- **Colorado DWR CDSS telemetry** — latest storage for the 27 reservoirs with a
  `dwr` station code (14-day staleness cutoff, plausibility-checked), plus the
  past week of daily storage to compute each reservoir's drawdown rate in cfs
- **USGS NWIS instantaneous values** — streamflow at 18 gages

Selecting a reservoir or gage additionally fetches a trailing year of daily
data (CDSS `telemetrytimeseriesday` / USGS `nwis/dv`) for the in-sheet
hydrograph, cached per station for the session.

The CSVs in `data/` are generated from the snapshot:

```sh
python3 scripts/make_csvs.py    # uses node if present, else macOS JavaScriptCore
```

`data.html` also offers a client-side "current values" CSV export that folds in
the live readings the browser just fetched.

## Local development

No build step. Serve the directory and open it:

```sh
python3 -m http.server 8000
```

(Opening `index.html` directly as a file also works — live fetches that the
browser blocks simply fall back to the snapshot.)

## Smoke tests

The site has no build step, but it has tests. `package.json` is
dev-tooling only (jsdom) — nothing under `js/` ever imports from
`node_modules`.

```sh
npm install        # once
npm run smoke      # both suites
```

- `scripts/smoke_data.mjs` — zero-dependency: evaluates the baked data and
  every string-rendered chart (basin maps, step-downs, shared-core marks)
  and asserts the invariants they depend on: band shapes, the
  supply-only capacity identity, no `NaN`/`undefined` in any SVG,
  finite viewBoxes, aria-labels present.
- `scripts/smoke_dom.mjs` — loads `index.html` for real in jsdom with
  network stubbed off, drives the ZIP flow, and checks every rendered
  chart plus the keyboard crosshair/tooltip layer.

### Manual verification checklist

After chart changes, also eyeball the real thing:

1. `python3 -m http.server 8000` **and** open `index.html` from `file://` —
   both must render Act 1 with a clean console.
2. `#livestat` reports either live counts or the snapshot fallback.
3. Select a basin on the seven-basin map, hit a live refresh — the
   selection must survive.
4. ZIP 80302: both basin maps, both step-downs, the two-panel
   snow/storage chart, reservoir rows.
5. DevTools responsive mode + touch emulation: drag across the snowpack,
   Powell, panel and hydrograph charts — tooltip follows, leaves cleanly.
6. Keyboard: Tab to each chart, arrow through it, Escape dismisses.
7. Lighthouse: no render-blocking script on index.html.

## Updating the snapshot

Edit the values in `js/data.js` (each reservoir row carries its source and
as-of date), then regenerate the CSVs with the script above and commit both.

## Deploying

The site is static; any host works. For GitHub Pages: push, then Settings →
Pages → deploy from `main`, root. `.nojekyll` is included so the `js/` and
`data/` directories are served as-is.

## Sources & license

Data collated from public sources: USGS NWIS, Colorado DWR (CDSS), USBR,
Denver Water, Northern Water, and NRCS Water Supply Outlook reports. This is an
educational project, not operational data — verify against primary sources
before relying on any number.

Code: MIT. Data files: public-domain source material; attribution appreciated.
