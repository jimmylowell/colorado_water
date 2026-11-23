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
  - Colorado DWR CDSS telemetry      dwr.state.co.us/Rest     reservoir storage (AF),
    and streamflow at the gages USGS no longer publishes discharge for (the
    South Platte at Denver and the Poudre at the canyon mouth are DWR-operated;
    CDSS carries them under their own abbrevs with the USGS site id attached)
"""
import json, re, os, sys, urllib.request, urllib.parse, datetime

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

# ---- CDSS streamflow for the gages USGS returned nothing for ----
# Some mapped gages are DWR-operated: NWIS lists the site but serves no
# discharge. CDSS carries them, keyed by usgsStationId. Same staleness rule
# as storage. gage_src records which agency each reading came from, and
# gage_dwr keeps the abbrev so the hydrograph can be filled from CDSS too.
gage_src = {site: 'usgs' for site in gages}
gage_dwr = {}
missing = [g for g in GAGES if g not in gages]
if missing:
    cutoff = NOW - datetime.timedelta(days=14)
    rows = []
    for site in missing:
        try:
            j = fetch_json('https://dwr.state.co.us/Rest/GET/api/v2/telemetrystations/telemetrystation/'
                           '?format=json&parameter=DISCHRG&usgsStationId=' + site)
            rows += (j.get('ResultList') or [])
        except Exception as e:
            print(f'  (CDSS discharge fetch failed for {site} -', str(e)[:60], ')')
    with open(os.path.join(RAW, 'cdss_telemetry_discharge.json'), 'w', encoding='utf-8') as f:
        json.dump({'note': 'telemetrystation?parameter=DISCHRG, one call per USGS site id '
                           'that NWIS iv returned no discharge for; rows concatenated verbatim',
                   'ResultList': rows}, f)
    for row in rows:
        site = str(row.get('usgsStationId') or '')
        if site not in missing:
            continue
        try:
            v = float(row['measValue'])
            t = datetime.datetime.fromisoformat(str(row['measDateTime'])).replace(tzinfo=datetime.timezone.utc)
        except (KeyError, TypeError, ValueError):
            continue
        if v < 0 or t <= cutoff:
            continue
        gages[site] = round(v, 1)
        gage_src[site] = 'dwr'
        gage_dwr[site] = row.get('abbrev')
    print(f'  CDSS filled {len(gage_dwr)} of {len(missing)} gages USGS left empty: '
          + ', '.join(f'{k}={v}' for k, v in gage_dwr.items()))

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

# A failed snow or Powell fetch keeps yesterday's block, which carries its
# own date, so the page shows the last reading with that date; nothing is
# filled in.
try:
    PREV = json.load(open(OUT, encoding='utf-8'))
except Exception:
    PREV = {}

WY_START = datetime.date(NOW.year if NOW.month >= 10 else NOW.year - 1, 10, 1)

# ---- this winter's snow on the fixed SNOTEL panel (NRCS AWDB) ----
# The 43 sites of the snowpack-by-decade chart, from data/snow_panel.json
# (scripts/build_snow_panel.py), which also holds each site's median for
# every day of the water year. The day used is the newest one on which at
# least 85% of the panel reported (the decade chart's rule), or failing that
# the newest day with any reading. Sites with no reading that day are left
# out of both the sum and its median.
snow = PREV.get('snow')
try:
    panel = json.load(open(os.path.join(ROOT, 'data', 'snow_panel.json'), encoding='utf-8'))
    trips = [s['triplet'] for s in panel['sites']]
    j = fetch_json('https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data'
                   '?stationTriplets=' + ','.join(urllib.parse.quote(t) for t in trips)
                   + '&elements=WTEQ&duration=DAILY&beginDate=' + WY_START.isoformat()
                   + '&endDate=' + NOW.date().isoformat(), timeout=120, raw='nrcs_snotel_panel.json')
    by_day = {}                                         # date -> {triplet: SWE}
    for st in j:
        for row in (st.get('data') or [{}])[0].get('values') or []:
            v = row.get('value')
            if isinstance(v, (int, float)) and v >= 0:
                by_day.setdefault(row['date'][:10], {})[st['stationTriplet']] = float(v)
    days = sorted(by_day)
    if days:
        full = [d for d in days if len(by_day[d]) >= 0.85 * len(trips)]
        day = full[-1] if full else days[-1]
        k = panel['days'].index(day[5:])
        med = {s['triplet']: s['med'][k] for s in panel['sites']}
        rep = {t: v for t, v in by_day[day].items() if t in med}
        withmed = [t for t in rep if med[t] is not None]
        sv, sm = sum(rep[t] for t in withmed), sum(med[t] for t in withmed)
        snow = {
            'asOf': day, 'wy': WY_START.year + 1, 'panel': len(trips), 'reporting': len(rep),
            'swe': round(sum(rep.values()) / len(rep), 1) if rep else None,
            'med': round(sm / len(withmed), 1) if withmed else None,
            'pct': round(sv / sm * 100) if sm > 0 else None,
            'withMedian': len(withmed), 'years': panel['years'],
        }
        print(f'  snow {day}: {len(rep)}/{len(trips)} sites, {snow["swe"]} in, '
              f'{snow["pct"]}% of median {snow["med"]} in')
except Exception as e:
    print('  (NRCS snow fetch failed -', str(e)[:80], ') keeping', (snow or {}).get('asOf'))

# ---- Lake Powell daily storage and elevation (USBR Upper Colorado) ----
# The same daily record the Powell chart cites (reservoir 919; 17 = storage,
# 49 = pool elevation). Recorded rows only: the 30 September that opened
# this water year and the same calendar day a year before the newest row.
powell = PREV.get('powell')
try:
    rec = {}
    for p, key in (('17', 'sto'), ('49', 'elev')):
        url = f'https://www.usbr.gov/uc/water/hydrodata/reservoir_data/919/csv/{p}.csv'
        req = urllib.request.Request(url, headers={'User-Agent': 'colorado-water-refresh/1.0'})
        txt = urllib.request.urlopen(req, timeout=90).read().decode('utf-8', 'ignore')
        with open(os.path.join(RAW, f'usbr_powell_{key}_last400.csv'), 'w', encoding='utf-8') as f:
            lines = txt.splitlines()
            f.write('\n'.join(lines[:1] + lines[-400:]) + '\n')
        for line in lines[1:]:
            try:
                ds, vs = line.split(',')
                datetime.date.fromisoformat(ds)
                rec.setdefault(ds, {})[key] = float(vs)
            except ValueError:
                continue

    def row(ds):
        r = rec.get(ds) or {}
        if 'sto' not in r:
            return None
        return {'date': ds, 'sto': round(r['sto']),
                'elev': round(r['elev'], 2) if 'elev' in r else None}
    newest = max(ds for ds, r in rec.items() if 'sto' in r)
    nd = datetime.date.fromisoformat(newest)
    try:
        ago = nd.replace(year=nd.year - 1).isoformat()
    except ValueError:                                 # 29 February
        ago = None
    powell = {'now': row(newest),
              'sep30': row((WY_START - datetime.timedelta(days=1)).isoformat()),
              'yearAgo': row(ago) if ago else None}
    print(f'  Powell {newest}: {powell["now"]["sto"]:,} AF, {powell["now"]["elev"]} ft')
except Exception as e:
    print('  (USBR Powell fetch failed -', str(e)[:80], ') keeping',
          ((powell or {}).get('now') or {}).get('date'))

out = {
    'generated': NOW.strftime('%Y-%m-%dT%H:%M:%SZ'),
    'attribution': {
        'gages': 'Streamflow: U.S. Geological Survey, National Water Information System '
                 '(waterservices.usgs.gov/nwis/iv). Public domain; provisional data subject to revision. '
                 'Sites marked dwr in gage_src are DWR-operated and read from CDSS telemetry '
                 '(parameter DISCHRG), because NWIS publishes no discharge for them.',
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
        'snow': 'inches of water: swe = mean of the panel sites that reported on asOf, med = mean '
                'of those sites\' medians for that day, pct = their sum over the sum of their '
                'medians (sites with a median that day only)',
        'powell': 'acre-feet (sto) and feet above sea level (elev), recorded daily values',
    },
    'gages': dict(sorted(gages.items())),
    'gage_src': dict(sorted(gage_src.items())),
    'res': dict(sorted(res.items())),
    'delta': dict(sorted(delta.items())),
    'snow': snow,
    'powell': powell,
}
out['attribution']['snow'] = ('Snowpack: USDA NRCS Air and Water Database (wcc.sc.egov.usda.gov/awdbRestApi), '
                              'SNOTEL snow-water equivalent, daily, on the fixed panel in data/snow_panel.json. '
                              'Public domain; provisional data subject to revision.')
out['attribution']['powell'] = ('Lake Powell: US Bureau of Reclamation, Upper Colorado Basin hydrodata '
                                '(usbr.gov/uc/water/hydrodata, reservoir 919), daily storage and pool '
                                'elevation. Provisional data subject to revision.')
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

# the DWR-operated gages: daily mean discharge from CDSS, keyed by USGS id so
# js/hydro.js needs no special case
for site, ab in sorted(gage_dwr.items()):
    if 'gage:' + site in series:
        continue
    try:
        j = fetch_json('https://dwr.state.co.us/Rest/GET/api/v2/telemetrystations/telemetrytimeseriesday/'
                       '?format=json&parameter=DISCHRG&abbrev=' + ab
                       + '&startDate=' + dstr(NOW - datetime.timedelta(days=DAYS)) + '&endDate=' + dstr(NOW),
                       timeout=90)
    except Exception as e:
        print(f'  (CDSS year discharge fetch failed for {ab} -', str(e)[:60], ')')
        continue
    arr = [None] * (DAYS + 1)
    for row in (j.get('ResultList') or []):
        try:
            v = float(row['measValue'])
            i = (datetime.date.fromisoformat(str(row['measDate'])[:10]) - start).days
        except (KeyError, TypeError, ValueError):
            continue
        if v >= 0 and 0 <= i <= DAYS:
            arr[i] = round(v, 1)
    if any(x is not None for x in arr):
        series['gage:' + site] = arr

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
                'subject to revision. DWR-operated sites (gage_src = dwr in live.json) come '
                'from CDSS telemetrytimeseriesday, parameter DISCHRG.',
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
