#!/usr/bin/env python3
"""Build js/normals.js — baked medians and long histories from authoritative,
public-domain sources, so the site can DERIVE "percent of normal" at runtime
(live current value / baked weekly median) instead of hand-authoring it.

Reproducible:  python3 scripts/build_normals.py
Responses are cached under /tmp so re-runs are fast.

Sources (all keyless, public domain):
  - USGS NWIS      waterservices.usgs.gov   streamflow (dv) + site coords
  - Colorado DWR   dwr.state.co.us/Rest     reservoir storage (CDSS telemetry)
  - NRCS AWDB      wcc.sc.egov.usda.gov     SNOTEL snow-water-equivalent
  - USBR UC        usbr.gov/uc/water        Lake Powell daily storage
"""
import json, urllib.request, urllib.parse, datetime, statistics, re, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, 'js', 'data.js')
OUT = os.path.join(ROOT, 'js', 'normals.js')
CACHE = '/tmp/cw_normals_cache'
os.makedirs(CACHE, exist_ok=True)
TODAY = datetime.date.today()


def fetch(url, key, timeout=90, binary=False):
    path = os.path.join(CACHE, key)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return open(path, 'rb').read() if binary else open(path, encoding='utf-8').read()
    req = urllib.request.Request(url, headers={'User-Agent': 'colorado-water-build/1.0'})
    data = urllib.request.urlopen(req, timeout=timeout).read()
    with open(path, 'wb') as f:
        f.write(data)
    return data if binary else data.decode('utf-8', 'ignore')


def try_fetch_json(url, key):
    """Resilient JSON fetch — a single station's missing endpoint must not
    abort the whole build. Returns None on any error."""
    try:
        return json.loads(fetch(url, key))
    except Exception as e:
        print('    (skip', key, '-', str(e)[:50], ')')
        return None


def weekidx(d):
    return min(51, (d.timetuple().tm_yday - 1) // 7)


def _fill(arr):
    """forward/backward-fill empty weeks from the nearest populated one."""
    for i in range(52):
        if arr[i] is None:
            for j in list(range(i, 52)) + list(range(i, -1, -1)):
                if arr[j] is not None:
                    arr[i] = arr[j]; break
    return [round(x, 1) if x is not None else 0 for x in arr]


def weekly_median(pairs):
    """[(date,value)] -> 52 weekly medians, gaps filled from neighbours."""
    buckets = [[] for _ in range(52)]
    for d, v in pairs:
        buckets[weekidx(d)].append(v)
    return _fill([statistics.median(b) if b else None for b in buckets])


def weekly_bands(pairs):
    """[(date,value)] -> ([52 weekly mins],[52 weekly maxs]) — the record range."""
    buckets = [[] for _ in range(52)]
    for d, v in pairs:
        buckets[weekidx(d)].append(v)
    return (_fill([min(b) if b else None for b in buckets]),
            _fill([max(b) if b else None for b in buckets]))


# ---- parse the canonical dataset for gage/reservoir wiring ----
SRC = open(DATA_JS, encoding='utf-8').read()
GAGE_BASIN = {}
for m in re.finditer(r"gage:'(\d+)'[^}]*?sys:'(\w+)'", SRC):
    GAGE_BASIN.setdefault(m.group(1), m.group(2))
RES_META = {}  # id -> {dwr, b, cap}
for m in re.finditer(r"\{id:'(\w+)',(?:dwr:'(\w+)',)?(?:fc:\d+,)?n:'[^']*',lat:[-\d.]+,lon:[-\d.]+,cap:(\d+),[^}]*b:'(\w+)'", SRC):
    RES_META[m.group(1)] = {'dwr': m.group(2), 'cap': int(m.group(3)), 'b': m.group(4)}
print(f'parsed {len(GAGE_BASIN)} gages, {len(RES_META)} reservoirs from data.js')


def get_gage_sites():
    ids = sorted(GAGE_BASIN)
    rdb = fetch('https://waterservices.usgs.gov/nwis/site/?format=rdb&sites=' + ','.join(ids),
                'usgs_sites.rdb')
    out = {}
    for line in rdb.splitlines():
        if line.startswith('USGS\t'):
            p = line.split('\t')
            out[p[1]] = {'name': p[2].title().replace(' Co.', ', CO'),
                         'lat': round(float(p[4]), 4), 'lon': round(float(p[5]), 4)}
    return out


def usgs_dv(site):
    j = try_fetch_json(
        f'https://waterservices.usgs.gov/nwis/dv/?format=json&sites={site}'
        f'&parameterCd=00060&startDT=1991-01-01&endDT={TODAY.isoformat()}', f'dv_{site}.json')
    ts = (j or {}).get('value', {}).get('timeSeries', []) if j else []
    if not ts:
        return []
    out = []
    for row in ts[0]['values'][0]['value']:
        try:
            v = float(row['value'])
            if v >= 0:
                out.append((datetime.date.fromisoformat(row['dateTime'][:10]), v))
        except (ValueError, KeyError):
            pass
    return out


def cdss_daily(abbrev):
    j = try_fetch_json(
        'https://dwr.state.co.us/Rest/GET/api/v2/telemetrystations/telemetrytimeseriesday/'
        f'?format=json&parameter=STORAGE&abbrev={abbrev}'
        f'&startDate=01%2F01%2F2005&endDate={TODAY.strftime("%m%%2F%d%%2F%Y")}', f'cdss_{abbrev}.json')
    out = []
    for r in (j or {}).get('ResultList', []):
        v = r.get('measValue')
        if isinstance(v, (int, float)) and v > 0:
            out.append((datetime.date.fromisoformat(r['measDate'][:10]), float(v)))
    return out


# ---- 1. gages: coords + weekly flow medians ----
sites = get_gage_sites()
GAGES, GAGE_NORMALS = {}, {}
for gid in sorted(GAGE_BASIN):
    s = sites.get(gid)
    if not s:
        continue
    GAGES[gid] = {'name': s['name'], 'lat': s['lat'], 'lon': s['lon'], 'basin': GAGE_BASIN[gid]}
    hist = usgs_dv(gid)
    if len(hist) > 365:
        GAGE_NORMALS[gid] = weekly_median(hist)
    print(f'  gage {gid} {s["name"][:34]:34} {len(hist):6} days')

# ---- 2. reservoirs: weekly storage medians (real baseline) + WY2026 basin history ----
MONTHS = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
          '2026-04', '2026-05', '2026-06', '2026-07']
RES_NORMALS = {}
RES_BANDS = {}   # id -> [ [52 weekly mins], [52 weekly maxs] ] — historical range
res_hist = {}  # id -> {date: value} for month-end lookups
for rid, meta in RES_META.items():
    if not meta['dwr']:
        continue
    hist = cdss_daily(meta['dwr'])
    if len(hist) > 365:
        RES_NORMALS[rid] = weekly_median(hist)
        RES_BANDS[rid] = list(weekly_bands(hist))
        res_hist[rid] = {d: v for d, v in hist}
    print(f'  res  {rid:14} {meta["dwr"]:9} {len(hist):6} days')


# ---- 2b. basin storage bands: weekly min/median/max of the basin's TOTAL
# telemetered storage, from daily totals on dates where >=80% of the basin's
# telemetered capacity is reporting (so coverage gaps don't distort it) ----
BASIN_BANDS = {}   # basin -> [ [52 min], [52 median], [52 max] ]  (acre-feet)
BASIN_TCAP = {}    # basin -> summed capacity of its telemetered reservoirs
_basin_res = {}
for rid in RES_NORMALS:
    _basin_res.setdefault(RES_META[rid]['b'], []).append(rid)
for b, rids in _basin_res.items():
    tcap = sum(RES_META[r]['cap'] for r in rids)
    BASIN_TCAP[b] = tcap
    daily, dcap = {}, {}
    for r in rids:
        cap = RES_META[r]['cap']
        for d, v in res_hist[r].items():
            daily[d] = daily.get(d, 0.0) + v
            dcap[d] = dcap.get(d, 0.0) + cap
    buckets = [[] for _ in range(52)]
    for d, tot in daily.items():
        if dcap[d] >= 0.8 * tcap:
            buckets[weekidx(d)].append(tot)
    if sum(len(x) for x in buckets) < 200:
        continue
    mn = _fill([min(x) if x else None for x in buckets])
    md = _fill([statistics.median(x) if x else None for x in buckets])
    mx = _fill([max(x) if x else None for x in buckets])
    BASIN_BANDS[b] = [mn, md, mx]
print(f'  basin bands: {", ".join(sorted(BASIN_BANDS))}')


def month_end_value(rid, ym):
    """storage on/just before the last day of month ym (YYYY-MM)."""
    y, mo = map(int, ym.split('-'))
    last = (datetime.date(y + (mo == 12), (mo % 12) + 1, 1) - datetime.timedelta(days=1))
    h = res_hist.get(rid, {})
    for back in range(0, 20):
        d = last - datetime.timedelta(days=back)
        if d in h:
            return h[d]
    return None


def median_at_week(rid, ym):
    y, mo = map(int, ym.split('-'))
    last = (datetime.date(y + (mo == 12), (mo % 12) + 1, 1) - datetime.timedelta(days=1))
    n = RES_NORMALS.get(rid)
    return n[weekidx(last)] if n else None

# real WY2026 monthly basin storage % of median. Per-reservoir ratio
# (current / its own median-for-the-week), capacity-weighted across only the
# reservoirs that actually reported that month — so a reservoir with stale
# telemetry drops out instead of dragging the basin to 0. Basins with no live
# reservoir that month carry forward; entirely dark basins are null.
BASINS = ['colorado', 'gunnison', 'yampa', 'sw', 'rio', 'arkansas', 'platte']
PMH = {}
for b in BASINS:
    rids = [rid for rid, m in RES_META.items() if m['b'] == b and rid in res_hist]
    series = []
    for ym in MONTHS:
        num = den = 0.0
        for rid in rids:
            cur, med = month_end_value(rid, ym), median_at_week(rid, ym)
            if cur is not None and med:
                w = RES_META[rid]['cap']
                num += (cur / med) * w
                den += w
        series.append(round(num / den * 100) if den else None)
    filled, last = [], None
    for v in series:
        last = v if v is not None else last
        filled.append(last)
    PMH[b] = filled
    print(f'  PMH {b:9} {filled}')

# ---- 3. statewide snowpack: weekly SWE median from long-record SNOTEL ----
SNOW_NORMALS = []
try:
    stations = json.loads(fetch(
        'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/stations'
        '?stationTriplets=*:CO:SNTL&returnStationElements=false', 'nrcs_stations.json'))
    # long-record stations, spread statewide, capped for a tractable build
    longrec = [s['stationTriplet'] for s in stations if s.get('beginDate', '2100')[:4] <= '1990'][:30]
    swe = {}
    for trip in longrec:
        try:
            j = json.loads(fetch(
                'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data'
                f'?stationTriplets={urllib.parse.quote(trip)}&elements=WTEQ&duration=DAILY'
                f'&beginDate=1991-01-01&endDate={TODAY.isoformat()}', f'snow_{trip.split(":")[0]}.json'))
            for row in j[0]['data'][0]['values']:
                v = row.get('value')
                if isinstance(v, (int, float)):
                    d = datetime.date.fromisoformat(row['date'][:10])
                    swe.setdefault(d, []).append(v)
        except Exception:
            continue
    # statewide daily mean SWE across stations, then weekly median across years
    daily = [(d, sum(vs) / len(vs)) for d, vs in swe.items() if vs]
    SNOW_NORMALS = weekly_median(daily) if daily else []
    print(f'  snow: {len(longrec)} stations, {len(daily)} days -> {"ok" if SNOW_NORMALS else "empty"}')
except Exception as e:
    print('  snow: skipped (', e, ')')

# ---- 4. Lake Powell annual end-of-water-year storage (USBR UC, 1963+) ----
POWELL_ANNUAL = []
try:
    csv = fetch('https://www.usbr.gov/uc/water/hydrodata/reservoir_data/919/csv/17.csv',
                'powell_storage.csv')
    by_year = {}
    for line in csv.splitlines()[1:]:
        try:
            ds, vs = line.split(',')
            d = datetime.date.fromisoformat(ds)
            by_year.setdefault(d.year, {})[d] = float(vs)
        except (ValueError, IndexError):
            pass
    for y in sorted(by_year):
        days = by_year[y]
        target = datetime.date(y, 9, 30)
        best = min(days, key=lambda d: abs((d - target).days))
        if abs((best - target).days) <= 20:
            POWELL_ANNUAL.append([y, round(days[best])])
    print(f'  Powell: {len(POWELL_ANNUAL)} years '
          f'({POWELL_ANNUAL[0][1]:,} -> {POWELL_ANNUAL[-1][1]:,} AF)')
except Exception as e:
    print('  Powell: skipped (', e, ')')

# ---- write js/normals.js ----
prov = {
    'built': TODAY.isoformat(),
    'sources': {
        'streamflow': 'USGS NWIS daily values (waterservices.usgs.gov), record from 1991',
        'reservoir': 'Colorado DWR CDSS telemetry (dwr.state.co.us), daily from 2005',
        'snowpack': 'NRCS AWDB SNOTEL SWE (wcc.sc.egov.usda.gov), long-record stations',
        'powell': 'USBR Upper Colorado hydrodata (usbr.gov/uc), Lake Powell daily storage from 1963'
    },
    'method': 'weekly day-of-year medians; runtime % of normal = current / median-for-this-week'
}


def js(name, obj):
    return f'const {name}={json.dumps(obj, separators=(",", ":"))};\n'


with open(OUT, 'w') as f:
    f.write('"use strict";\n')
    f.write('/* GENERATED by scripts/build_normals.py — do not edit by hand.\n')
    f.write('   Baked medians/history from authoritative public-domain sources so the\n')
    f.write('   site derives "% of normal" = live current / baked weekly median. */\n')
    f.write(js('NORMALS_PROV', prov))
    f.write(js('GAGE_META', GAGES))       # coords/name/basin — not the live.js GAGES id-list
    f.write(js('GAGE_NORMALS', GAGE_NORMALS))
    f.write(js('RES_NORMALS', RES_NORMALS))
    f.write(js('RES_BANDS', RES_BANDS))     # [minWeekly, maxWeekly] historical range
    f.write(js('BASIN_BANDS', BASIN_BANDS))  # basin -> [min, median, max] weekly totals (AF)
    f.write(js('BASIN_TCAP', BASIN_TCAP))    # basin -> telemetered capacity (AF)
    f.write(js('SNOW_NORMALS', SNOW_NORMALS))
    f.write(js('PMH_DERIVED', PMH))        # data.js builds runtime PMH, filling dark basins (yampa)
    f.write(js('POWELL_ANNUAL', POWELL_ANNUAL))
print(f'\nwrote {os.path.relpath(OUT, ROOT)}  '
      f'({len(GAGES)} gages, {len(RES_NORMALS)} res normals, '
      f'{"snow" if SNOW_NORMALS else "no-snow"}, {len(POWELL_ANNUAL)} Powell yrs)')
