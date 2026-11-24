# Design

Colorado water is five pages plus the map, the data page and About. Each page
holds one kind of content and changes at its own pace, so a reader can tell a
finished story from the day's readings.

## The pages

| Page | File | What is on it | Changes |
|---|---|---|---|
| **Today** | `index.html` | The date of the newest readings and the water-year day. The seven basins from that day's readings only, as a map and a list. This winter's snow so far against the median for the date. Lake Powell on its newest day. Blue Mesa. The ZIP box, which opens your provider's reservoirs with their newest readings. Links to the other pages. | daily |
| **Water year 2026** | `water-year-2026.html` | The finished year, 1 October 2025 to 30 September 2026: the year in brief, the snow season chart with 2026 on it, where each basin ended on 30 September, the month-by-month player, snow in and water out for each basin. It loads no daily readings. | never |
| **Reports** | `reports.html` | The check-ins and the yearly reports, newest first, the date of the next one, and the yearly rhythm. Each check-in is its own frozen page, `check-in-<year>-<season>.html` (`check-in-2026-autumn.html`). | four times a year |
| **The long view** | `long-view.html` | The record, year by year: Lake Powell every September since 1963 (chart and table), the snowpack by decade since the 1980s (chart and table). Each October the closed year is added as one more value. | once a year |
| **How it works** | `how-it-works.html` | Snow, reservoirs, the seven basins, the megadrought. The ZIP trace: your basin, its maps and step-down diagrams, the tunnels, your tap, what you can do. | rarely |
| Map, Data, About | `map.html`, `data.html`, `about.html` | The detailed map, the CSV downloads and sources, the project and its methods. | as needed |

Nav on every page: Today, Reports, Long view, How it works, Map, Data, About.
The yearly report and the check-ins mark Reports as the current page. Today
links to the newest check-in and to the water year 2026 report.

`timeline.html` forwards to `water-year-2026.html#player` (keeping a `#m=`
month). `index.html#80302` and `index.html#zip=80302` open that ZIP on Today;
map deep links (`#r=`, `#n=`, `#view=`, `#basin=`, `#m=`) on `index.html`
forward to the map.

## Today means today

- "Today", "right now" and "live" are said only of a figure from the newest
  day's readings. That day is the newest reservoir reading date in
  `data/live.json` (`LIVE_META.day`), not the reader's clock.
- A basin's figure on Today is storage summed over the reservoirs that
  reported that day, against the sum of their medians for that week
  (`basinToday` in `js/data.js`). It says how many of the basin's reservoirs
  reported. A basin with none says so and is drawn blank; nothing is
  estimated in its place.
- A reservoir with no reading that day shows its last one with that reading's
  date (`readingOf`, `readingWhen`): a DWR reading up to 14 days old, a
  published reading from the July snapshot, or the snapshot's estimate,
  labelled as one.
- Snow so far is the fixed 43-site SNOTEL panel of the snowpack-by-decade
  chart (`data/snow_panel.json`, built by `scripts/build_snow_panel.py` with
  that chart's rule). The day is the newest on which at least 85% of the
  panel reported, else the newest with any reading. The figure is the sum of
  the reporting sites' readings over the sum of their own medians for that
  calendar day (water years 1981 to 2026), with the mean of each and how many
  of the 43 reported. Sites with no reading are left out; with no median for
  the day, no percent is shown.
- Lake Powell is USBR's newest daily row of storage and elevation, the
  30 September row that opened the water year, and the same calendar day a
  year earlier; the changes are plain differences. A missing row says "no
  reading".
- Snow and Lake Powell carry their own dates, which can differ from the
  reservoirs' day. A day the fetch fails keeps the last block with its date.
- If the daily file does not load, Today says so and shows no basin figures.
- Every other figure carries its own date. The report page loads no daily
  readings, so nothing on it can move into the new year.

## The words

Mostly bullets, so a water professional can check each claim. The smoke test
fails any story paragraph over 30 words (the provider descriptions aside):

- One claim to a bullet: the figure, what it is measured against, its date,
  its source.
- At most one plain sentence opens a section. No scene-setting, no metaphor.
- An estimate says so in the bullet. A missing reading says "no reading".
- The method is its own short list at the foot, with the file the figures come
  from.

Every claim cites a published source (Wikipedia first, the agency where the
number is theirs) or is cut.

## Check-ins

One phone screen: a few bullets and three to five figures, each from a named
file with its date. Frozen once published; the head says the day it was
written and that it is not updated.

| When | What it answers |
|---|---|
| Early January | How is the snow starting? |
| Early April | How much snow is there to melt? |
| Early July | What did the melt put in the reservoirs? |
| October | The year closes: this one is the yearly report. |

AI drafts each one from the site's data files; the owner reads it and says go
before it is public.

How one is made:

1. Run `scripts/fetch_live.py` on the day, so `data/live.json` is that day's.
   Read Lake Powell again from USBR's daily
   [storage](https://www.usbr.gov/uc/water/hydrodata/reservoir_data/919/csv/17.csv)
   and [elevation](https://www.usbr.gov/uc/water/hydrodata/reservoir_data/919/csv/49.csv)
   files.
2. Work the figures out with the site's own functions (`basinToday`,
   `readingOf`, the weekly medians in `js/normals.js`, `LIVE_META.snow` and
   `LIVE_META.powell`), by loading Today in jsdom with the day's file. Check
   each gage's reading time in `data/raw/usgs_iv.json`: a value older than
   the day is not used.
3. Copy the last check-in's page to `check-in-<year>-<season>.html`. Type the
   figures in: it loads no scripts, so nothing on it moves. The head says
   "Written <day> · this page is not updated"; each section's kicker names its
   source and date; the method list at the foot names the files and the time
   `data/live.json` was generated.
4. Put it first in `reports.html`'s list, change the next check-in's date
   there, and point Today's first page link at it.
5. Add its smoke test beside the autumn 2026 one in `scripts/smoke_dom.mjs`.

The October report is a new `water-year-<year>.html` built like
`water-year-2026.html`, and the long view gains the closed year.

## Data sources

| Series | Source | Read |
|---|---|---|
| Reservoir storage, daily | Colorado DWR CDSS telemetry, [dwr.state.co.us](https://dwr.state.co.us/Rest/GET/Help) | daily, `scripts/fetch_live.py` |
| Streamflow, daily | USGS NWIS, [waterservices.usgs.gov](https://waterservices.usgs.gov/); CDSS for the DWR-operated gages and for any gage whose newest USGS value is over 14 days old (Rio Grande near Del Norte and South Platte at Kersey, whose USGS records end in 2003 and 2000) | daily, `scripts/fetch_live.py` |
| Weekly medians, monthly basin history | CDSS daily from 2005, USGS daily values from 1991 | on rebuild, `scripts/build_normals.py` |
| Snowpack, by basin and by decade | NRCS AWDB SNOTEL snow-water equivalent, [wcc.sc.egov.usda.gov](https://wcc.sc.egov.usda.gov/); a fixed panel of 43 sites for the decades | on rebuild, `scripts/build_normals.py` |
| Lake Powell, every September | USBR Upper Colorado daily storage, [usbr.gov/uc](https://www.usbr.gov/uc/water/hydrodata/reservoir_data/919/csv/17.csv) | on rebuild, `scripts/build_normals.py` |
| Lake Powell, daily | USBR Upper Colorado daily [storage](https://www.usbr.gov/uc/water/hydrodata/reservoir_data/919/csv/17.csv) and [elevation](https://www.usbr.gov/uc/water/hydrodata/reservoir_data/919/csv/49.csv) | daily, `scripts/fetch_live.py` |
| Snowpack so far this winter | NRCS AWDB SNOTEL, daily snow-water equivalent on the same fixed panel of 43 sites, [AWDB REST](https://wcc.sc.egov.usda.gov/awdbRestApi/) | daily, `scripts/fetch_live.py` |
| The panel and each site's median for every day of the water year | the same NRCS records, water years 1981 to 2026 | on rebuild, `scripts/build_snow_panel.py` |

## Roadmap

1. The pages above, made from what exists. (done)
2. The words as bullets, every claim sourced. (done; the provider
   descriptions remain)
3. Today's own data: snow so far against the median for the date, and Lake
   Powell daily with its change since 30 September and the same day a year
   earlier. (done; publishing the readings daily needs a Cloudflare Pages
   token in the repo secrets)
4. Reports and the autumn 2026 check-in. (done; then the reworked site goes
   live)
5. Later, on the long view: one value per year for snow (the peak, 1981 on)
   and for storage (30 September, 2005 on), worked out from the same records.
