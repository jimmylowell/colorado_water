# Colorado Water — where it sits, where it combines

An interactive map of Colorado's reservoirs and rivers for drought awareness:
where the water actually sits, where it comes from, and how a dry year draws it
down. Reservoirs are drawn as glasses of water (fill level = storage, filled by
area so the level is honest), rivers as source-coloured ribbons, and the
transmountain tunnels that move West Slope water to the Front Range as dashed
crossings of the Continental Divide.

**Pages**

- `index.html` — the map and the flow-and-mixing diagram, with a monthly
  timeline of water year 2026
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
