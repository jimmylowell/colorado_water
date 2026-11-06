# colorado_water

Static, build-free site: HTML + vanilla JS, vendored d3, `scripts/` for data
prep, small baked data committed. `README.md` is the technical reference (data
flow, tests, deploy). Copy rules: US spelling, plain sentences, no em-dash
asides, agency names as DWR uses them; the audience includes state water staff.

Verify with `npm run smoke` (data invariants + jsdom load of `index.html`).
`map.html`, `timeline.html` and `data.html` are not covered by the smoke suite;
load them in jsdom with `fetch` stubbed to `data/live.json` when they change.

## Now

Where things stand, what is next and what was decided: [HANDOFF.md](HANDOFF.md).

## Log

- 2026-09-07: Prose pass for a state-agency audience; live flow added for the
  two DWR-operated gages USGS publishes no discharge for; month list extended
  to the full water year; streamflow index switched from a hand series to one
  derived from the gage record (the hand series was far off in winter).
