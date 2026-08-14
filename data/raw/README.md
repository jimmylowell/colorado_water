# Raw agency responses

The untouched API responses behind `data/live.json`, saved byte-for-byte by
`scripts/fetch_live.py` before any parsing, filtering, or rounding — so every
baked number can be checked against exactly what the agency returned.

| File | Source | Contents |
|---|---|---|
| `usgs_iv.json` | USGS NWIS instantaneous values (waterservices.usgs.gov/nwis/iv) | latest discharge (cfs) at the mapped gages |
| `cdss_telemetry_storage.json` | Colorado DWR CDSS REST (dwr.state.co.us/Rest, telemetrystation) | latest telemetered storage (acre-feet) at the mapped reservoirs |
| `cdss_week_storage.json` | Colorado DWR CDSS REST (telemetrytimeseriesday) | past week of daily storage, behind the drawdown markers |

Fixed filenames, overwritten by each daily run: **git history is the archive**
— `git log --follow data/raw/usgs_iv.json` walks every day's snapshot.

The year-long daily series behind `data/hydro.json` are deliberately *not*
mirrored raw here: each day's response repeats the previous ~364 days, and
USGS/CDSS remain the authoritative archive for the full record.

USGS data are public domain; CDSS is developed by the Colorado Water
Conservation Board and the Division of Water Resources. Recent agency values
are provisional and subject to revision — a snapshot here records what was
published on that day, not the final approved record.
