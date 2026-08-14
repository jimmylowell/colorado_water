#!/usr/bin/env python3
"""Bake data/live.json + data/hydro.json — the daily readings, fetched once
by a scheduled GitHub Action so visitors download small same-origin files
instead of hitting the government APIs from every browser.

  live.json   latest reading per station + week trend  (~2 KB)
  hydro.json  trailing year of daily values per station, for the in-sheet
              hydrograph (~120 KB; smaller than ONE raw USGS response)

Reproducible:  python3 scripts/fetch_live.py
Zero dependencies (urllib only). Applies the ingestion rules that used to
live in js/live.js — reject <=0 storage rows (dropout sensors), keep the max
plausible reading per station, 14-day staleness cutoff, cap*1.15 sanity.

Sources (both keyless, public domain):
  - USGS NWIS instantaneous values   waterservices.usgs.gov   streamflow (cfs)
  - Colorado DWR CDSS telemetry      dwr.state.co.us/Rest     reservoir storage (AF)
"""
import json, re, os, sys, urllib.request, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, 'js', 'data.js')
OUT = os.path.join(ROOT, 'data', 'live.json')
OUT_HYDRO = os.path.join(ROOT, 'data', 'hydro.json')
RAW = os.path.join(ROOT, 'data', 'raw')
os.makedirs(RAW, exist_ok=True)


def fetch_json(url, timeout=60, raw=None):
    """Fetch and parse; when `raw` is given, first save the response verbatim
    to data/raw/<raw> — the untouched agency bytes the baked numbers came
    from. Fixed filenames, overwritten daily: git history is the archive."""
    req = urllib.request.Request(url, headers={'User-Agent': 'colorado-water-refresh/1.0'})
    data = urllib.request.urlopen(req, timeout=timeout).read()
    if raw:
        with open(os.path.join(RAW, raw), 'wb') as f:
            f.write(data)
    return json.loads(data.decode('utf-8', 'ignore'))


# ---- parse the canonical dataset for gage/reservoir wiring ----
SRC = open(DATA_JS, encoding='utf-8').read()
GAGES = sorted({m.group(1) for m in re.finditer(r"gage:'(\d+)'", SRC)})
RES = {}  # dwr abbrev -> {id, cap}
for m in re.finditer(r"\{id:'(\w+)',dwr:'(\w+)',(?:fc:\d+,)?n:'[^']*',lat:[-\d.]+,lon:[-\d.]+,cap:(\d+)", SRC):
    RES[m.group(2)] = {'id': m.group(1), 'cap': int(m.group(3))}
print(f'parsed {len(GAGES)} gages, {len(RES)} telemetered reservoirs from data.js')

NOW = datetime.datetime.now(datetime.timezone.utc)
def dstr(d):
    return d.strftime('%m%%2F%d%%2F%Y')

gages, res, delta = {}, {}, {}

# ---- USGS instantaneous streamflow ----
try:
    j = fetch_json('https://waterservices.usgs.gov/nwis/iv/?format=json&sites='
                   + ','.join(GAGES) + '&parameterCd=00060&siteStatus=all',
                   raw='usgs_iv.json')
    for ts in (j.get('value', {}).get('timeSeries') or []):
        try:
            site = ts['sourceInfo']['siteCode'][0]['value']
            v = float(ts['values'][0]['value'][0]['value'])
        except (KeyError, IndexError, TypeError, ValueError):
            continue
        if v >= 0:  # USGS uses -999999 for missing
            gages[site] = round(v, 1)
except Exception as e:
    print('  (USGS fetch failed -', str(e)[:80], ')')

# ---- CDSS latest storage ----
try:
    j = fetch_json('https://dwr.state.co.us/Rest/GET/api/v2/telemetrystations/telemetrystation/'
                   '?format=json&parameter=STORAGE&abbrev=' + '%2C'.join(sorted(RES)),
                   raw='cdss_telemetry_storage.json')
    cutoff = NOW - datetime.timedelta(days=14)  # ignore stations gone quiet
    best = {}
    for row in (j.get('ResultList') or []):
        r = RES.get(row.get('abbrev'))
        if not r:
            continue
        try:
            v = float(row['measValue'])
            t = datetime.datetime.fromisoformat(str(row['measDateTime'])).replace(tzinfo=datetime.timezone.utc)
        except (KeyError, TypeError, ValueError):
            continue
        # A station can return several rows for one timestamp — some are dropout
        # sensors reading 0 that would clobber the real value (Cheesman does this).
        if v <= 0 or t <= cutoff or v > r['cap'] * 1.15:
            continue
        cur = best.get(row['abbrev'])
        if not cur or v > cur[0]:
            best[row['abbrev']] = (v, str(row['measDateTime'])[:10])
    for ab, (v, as_of) in best.items():
        res[RES[ab]['id']] = {'sto': round(v), 'asOf': as_of}
except Exception as e:
    print('  (CDSS fetch failed -', str(e)[:80], ')')

# ---- CDSS week of daily storage -> trend in cfs (1 AF/day = 0.50417 cfs) ----
try:
    j = fetch_json('https://dwr.state.co.us/Rest/GET/api/v2/telemetrystations/telemetrytimeseriesday/'
                   '?format=json&parameter=STORAGE&abbrev=' + '%2C'.join(sorted(RES))
                   + '&startDate=' + dstr(NOW - datetime.timedelta(days=8)) + '&endDate=' + dstr(NOW),
                   timeout=90, raw='cdss_week_storage.json')
    by_ab = {}
    for row in (j.get('ResultList') or []):
        try:
            v = float(row['measValue'])
            t = datetime.datetime.fromisoformat(str(row['measDate']))
        except (KeyError, TypeError, ValueError):
            continue
        if v > 0:
            by_ab.setdefault(row['abbrev'], []).append((t, v))
    for ab, pts in by_ab.items():
        if len(pts) < 3 or ab not in RES:
            continue
        pts.sort()
        days = (pts[-1][0] - pts[0][0]).total_seconds() / 86400
        if days < 2:
            continue
        afday = (pts[-1][1] - pts[0][1]) / days
        delta[RES[ab]['id']] = round(-afday * 0.50417, 2)  # falling storage = releasing
except Exception as e:
    print('  (CDSS week fetch failed -', str(e)[:80], ')')

print(f'got {len(gages)} gages, {len(res)} reservoirs, {len(delta)} deltas')
if not gages and not res:
    sys.exit('nothing fetched — refusing to bake an empty file')

out = {
    'generated': NOW.strftime('%Y-%m-%dT%H:%M:%SZ'),
    'attribution': {
        'gages': 'Streamflow: U.S. Geological Survey, National Water Information System '
                 '(waterservices.usgs.gov/nwis/iv). Public domain; provisional data subject to revision.',
        'res': 'Reservoir storage: Colorado Division of Water Resources satellite telemetry, '
               'via the CDSS REST services (dwr.state.co.us/Rest). CDSS is developed by the '
               'Colorado Water Conservation Board and DWR. Provisional data subject to revision.',
        'note': 'Collated once daily by github.com/jimmylowell/colorado_water for '
                'water.myjimmycloud.com. Educational, not operational data — verify against '
                'the primary sources before relying on any value.',
    },
    'units': {
        'gages': 'cfs, latest instantaneous discharge',
        'res.sto': 'acre-feet, latest telemetered storage (asOf = reading date)',
        'delta': 'cfs equivalent of the past week’s storage trend; positive = drawing down '
                 '(1 acre-foot/day ≈ 0.50417 cfs)',
    },
    'gages': dict(sorted(gages.items())),
    'res': dict(sorted(res.items())),
    'delta': dict(sorted(delta.items())),
}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(out, f, separators=(',', ':'))
    f.write('\n')
print('wrote', OUT)

# ---- trailing year of daily values per station, for the hydrograph ----
# One value per day, aligned to a shared start date; null = no reading.
# Keys match js/hydro.js's cache keys: 'gage:<site>' and 'res:<dwr abbrev>'.
DAYS = 365
start = (NOW - datetime.timedelta(days=DAYS)).date()
series = {}

try:
    j = fetch_json('https://waterservices.usgs.gov/nwis/dv/?format=json&sites='
                   + ','.join(GAGES) + '&parameterCd=00060&period=P365D', timeout=120)
    for ts in (j.get('value', {}).get('timeSeries') or []):
        try:
            site = ts['sourceInfo']['siteCode'][0]['value']
            vals = ts['values'][0]['value']
        except (KeyError, IndexError, TypeError):
            continue
        arr = [None] * (DAYS + 1)
        for p in vals:
            try:
                v = float(p['value'])
                i = (datetime.date.fromisoformat(str(p['dateTime'])[:10]) - start).days
            except (KeyError, TypeError, ValueError):
                continue
            if v >= 0 and 0 <= i <= DAYS:  # 0 cfs is a real reading at a gage
                arr[i] = round(v, 1)
        if any(x is not None for x in arr):
            series['gage:' + site] = arr
except Exception as e:
    print('  (USGS dv fetch failed -', str(e)[:80], ')')

for ab in sorted(RES):
    j = None
    try:
        j = fetch_json('https://dwr.state.co.us/Rest/GET/api/v2/telemetrystations/telemetrytimeseriesday/'
                       '?format=json&parameter=STORAGE&abbrev=' + ab
                       + '&startDate=' + dstr(NOW - datetime.timedelta(days=DAYS)) + '&endDate=' + dstr(NOW),
                       timeout=90)
    except Exception as e:
        print(f'  (CDSS year fetch failed for {ab} -', str(e)[:60], ')')
        continue
    arr = [None] * (DAYS + 1)
    for row in (j.get('ResultList') or []):
        try:
            v = float(row['measValue'])
            i = (datetime.date.fromisoformat(str(row['measDate'])[:10]) - start).days
        except (KeyError, TypeError, ValueError):
            continue
        if v > 0 and v <= RES[ab]['cap'] * 1.15 and 0 <= i <= DAYS:
            arr[i] = round(v)
    if any(x is not None for x in arr):
        series['res:' + ab] = arr

print(f'hydro series: {len(series)} stations')
hydro = {
    'generated': NOW.strftime('%Y-%m-%dT%H:%M:%SZ'),
    'attribution': {
        'gage': 'Daily mean discharge: U.S. Geological Survey, National Water Information '
                'System (waterservices.usgs.gov/nwis/dv). Public domain; provisional data '
                'subject to revision.',
        'res': 'Daily storage: Colorado Division of Water Resources satellite telemetry, via '
               'the CDSS REST services (dwr.state.co.us/Rest, telemetrytimeseriesday). CDSS is '
               'developed by the Colorado Water Conservation Board and DWR. Provisional data '
               'subject to revision.',
        'note': 'Collated once daily by github.com/jimmylowell/colorado_water for '
                'water.myjimmycloud.com. Educational, not operational data — verify against '
                'the primary sources before relying on any value.',
    },
    'units': {'gage': 'cfs, daily mean discharge', 'res': 'acre-feet, daily storage'},
    'format': 'series[key][i] = value on (start + i days); null = no accepted reading',
    'start': start.isoformat(),
    'series': dict(sorted(series.items())),
}
with open(OUT_HYDRO, 'w', encoding='utf-8') as f:
    json.dump(hydro, f, separators=(',', ':'))
    f.write('\n')
print('wrote', OUT_HYDRO)
