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
RES_META = {}  # id -> {dwr, lat, lon, cap, b}
for m in re.finditer(r"\{id:'(\w+)',(?:dwr:'(\w+)',)?(?:fc:\d+,)?n:'[^']*',lat:([-\d.]+),lon:([-\d.]+),cap:(\d+),[^}]*b:'(\w+)'", SRC):
    RES_META[m.group(1)] = {'dwr': m.group(2), 'lat': float(m.group(3)),
                            'lon': float(m.group(4)), 'cap': int(m.group(5)),
                            'b': m.group(6)}
print(f'parsed {len(GAGE_BASIN)} gages, {len(RES_META)} reservoirs from data.js')


def get_gage_sites():
    ids = sorted(GAGE_BASIN)
    rdb = fetch('https://waterservices.usgs.gov/nwis/site/?format=rdb&sites=' + ','.join(ids),
                'usgs_sites.rdb')
    out = {}
    for line in rdb.splitlines():
        if line.startswith('USGS\t'):
            p = line.split('\t')
            rec = {'name': p[2].title().replace(' Co.', ', CO'),
                   'lat': round(float(p[4]), 4), 'lon': round(float(p[5]), 4)}
            # alt_va: the surveyed altitude of the gage datum, in feet. This is
            # what puts a gage at its true height in the basin step-down.
            try:
                rec['elev'] = round(float(p[8]))
            except (ValueError, IndexError):
                pass
            out[p[1]] = rec
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
    GAGES[gid] = {'name': s['name'], 'lat': s['lat'], 'lon': s['lon'],
                  'basin': GAGE_BASIN[gid]}
    if s.get('elev') is not None:
        GAGES[gid]['elev'] = s['elev']
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

# ---- 3. snowpack: per-basin SWE, this water year vs the normal, from
# long-record SNOTEL assigned to basins by HUC (same split as the boundaries) ----
HUC4_BASIN = {'1019': 'platte', '1018': 'yampa', '1102': 'arkansas', '1301': 'rio',
              '1401': 'colorado', '1402': 'gunnison', '1405': 'yampa', '1408': 'sw'}


def basin_of_huc(huc):
    h4 = (huc or '')[:4]
    if h4 == '1403':
        return 'colorado' if (huc or '')[:8] in ('14030001', '14030005') else 'sw'
    return HUC4_BASIN.get(h4)


def cur_wy_weekly(pairs):
    """this water year's (Oct 2025+) weekly mean, 52 values, None where absent."""
    buckets = [[] for _ in range(52)]
    for d, v in pairs:
        if d >= datetime.date(2025, 10, 1):
            buckets[weekidx(d)].append(v)
    return [round(sum(b) / len(b), 2) if b else None for b in buckets]


MONTH_WK = [41, 45, 49, 2, 6, 10, 14, 19, 23, 27]  # ~mid-month week idx, Oct..Jul
SNOW_NORMALS = []          # statewide weekly median (kept for compatibility)
SNOW_BASIN = {}            # basin -> {"cur":[10 monthly SWE], "nrm":[10 monthly SWE]}
try:
    stations = json.loads(fetch(
        'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/stations'
        '?stationTriplets=*:CO:SNTL&returnStationElements=false', 'nrcs_stations.json'))
    longrec = [s for s in stations if s.get('beginDate', '2100')[:4] <= '1990']
    by_basin = {}
    for s in longrec:
        b = basin_of_huc(s.get('huc'))
        if b:
            by_basin.setdefault(b, []).append(s['stationTriplet'])
    picked = {b: trips[:8] for b, trips in by_basin.items()}     # cap per basin
    swe_all, swe_basin = {}, {b: {} for b in picked}             # date -> [values]
    for b, trips in picked.items():
        for trip in trips:
            try:
                j = json.loads(fetch(
                    'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data'
                    f'?stationTriplets={urllib.parse.quote(trip)}&elements=WTEQ&duration=DAILY'
                    f'&beginDate=1991-01-01&endDate={TODAY.isoformat()}', f'snow_{trip.split(":")[0]}.json'))
                for row in j[0]['data'][0]['values']:
                    v = row.get('value')
                    if isinstance(v, (int, float)):
                        d = datetime.date.fromisoformat(row['date'][:10])
                        swe_all.setdefault(d, []).append(v)
                        swe_basin[b].setdefault(d, []).append(v)
            except Exception:
                continue
    daily_all = [(d, sum(vs) / len(vs)) for d, vs in swe_all.items() if vs]
    SNOW_NORMALS = weekly_median(daily_all) if daily_all else []
    for b, daymap in swe_basin.items():
        pairs = [(d, sum(vs) / len(vs)) for d, vs in daymap.items() if vs]
        if len(pairs) < 400:
            continue
        nrm_wk = weekly_median(pairs)            # 52 weekly medians (all years)
        cur_wk = cur_wy_weekly(pairs)            # 52 weekly means (this WY)
        nrm = [round(nrm_wk[w], 1) for w in MONTH_WK]
        cur = [round(cur_wk[w], 1) if cur_wk[w] is not None else None for w in MONTH_WK]
        SNOW_BASIN[b] = {'cur': cur, 'nrm': nrm}
    print(f'  snow: {sum(len(t) for t in picked.values())} stations -> '
          f'basins {", ".join(sorted(SNOW_BASIN))}')
except Exception as e:
    print('  snow: skipped (', e, ')')

# ---- 3b. snowpack BY DECADE — the climate signal ----
# A decade-over-decade comparison is only honest if the station panel is held
# FIXED: if stations join or drop out, the "trend" is partly a change in who is
# measuring. So we take only SNOTEL sites installed by 1980 that have a
# near-complete record in EVERY water year since, and average that same panel
# across all decades. Indexed on the WATER year (days since Oct 1) rather than
# the calendar year, so the curve reads left-to-right as one season.
WY_NOW = TODAY.year + 1 if TODAY.month >= 10 else TODAY.year
DEC_FROM = 1981                       # first full water year after the 1978-80 build-out


def water_year(d):
    return d.year + 1 if d.month >= 10 else d.year


def wy_week(d):
    """0..51, weeks since Oct 1 of that date's water year."""
    start = datetime.date(d.year if d.month >= 10 else d.year - 1, 10, 1)
    return min(51, max(0, (d - start).days // 7))


SNOW_DECADES = {}
try:
    stations = json.loads(fetch(
        'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/stations'
        '?stationTriplets=*:CO:SNTL&returnStationElements=false', 'nrcs_stations.json'))
    cand = [s for s in stations if (s.get('beginDate') or '2100')[:4] <= '1980']
    print(f'  decades: {len(cand)} candidate stations installed by 1980')
    swe = {}                                   # station -> {date: SWE}
    for s in cand:
        trip = s['stationTriplet']
        j = try_fetch_json(
            'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data'
            f'?stationTriplets={urllib.parse.quote(trip)}&elements=WTEQ&duration=DAILY'
            f'&beginDate=1978-10-01&endDate={TODAY.isoformat()}',
            f'sweL_{trip.split(":")[0]}.json')
        if not j:
            continue
        vals = {}
        for row in j[0]['data'][0]['values']:
            v = row.get('value')
            if isinstance(v, (int, float)):
                vals[datetime.date.fromisoformat(row['date'][:10])] = float(v)
        if vals:
            swe[trip] = vals

    # the fixed panel: complete every water year of the comparison period
    panel = []
    for trip, vals in swe.items():
        per_wy = {}
        for d in vals:
            per_wy[water_year(d)] = per_wy.get(water_year(d), 0) + 1
        if (all(per_wy.get(y, 0) >= 300 for y in range(DEC_FROM, WY_NOW))
                and per_wy.get(WY_NOW, 0) >= 250):
            panel.append(trip)
    elevs = [s['elevation'] for s in cand if s['stationTriplet'] in panel and s.get('elevation')]

    # panel daily mean, then decade = median across that decade's water years
    daily = {}
    for trip in panel:
        for d, v in swe[trip].items():
            daily.setdefault((water_year(d), d), []).append(v)
    # require most of the panel reporting, so a sensor outage can't move the mean
    pmean = {k: sum(v) / len(v) for k, v in daily.items() if len(v) >= 0.85 * len(panel)}

    by_wy_wk = {}      # (water year, week) -> [daily panel means]
    by_wy = {}         # water year -> [(date, panel mean)]
    for (yy, d), v in pmean.items():
        by_wy_wk.setdefault((yy, wy_week(d)), []).append(v)
        by_wy.setdefault(yy, []).append((d, v))
    for y in by_wy:
        by_wy[y].sort()

    def wy_weekly(years):
        """median-across-years of the panel's weekly mean SWE, 52 water-year weeks."""
        out = []
        for w in range(52):
            per_year = [sum(vs) / len(vs) for y in years
                        for vs in [by_wy_wk.get((y, w))] if vs]
            out.append(round(statistics.median(per_year), 2) if per_year else None)
        return out

    def season_stats(years):
        """median peak SWE, its water-year week, and April 1 SWE across the years."""
        peaks, pweeks, apr1 = [], [], []
        for y in years:
            days = by_wy.get(y, [])
            if len(days) < 300:
                continue
            pd, pv = max(days, key=lambda t: t[1])
            peaks.append(pv)
            pweeks.append(wy_week(pd))
            a = [v for d, v in days if (d.month, d.day) == (4, 1)]
            if a:
                apr1.append(a[0])
        if not peaks:
            return None
        return {'peak': round(statistics.median(peaks), 1),
                'peakWk': int(statistics.median(pweeks)),
                'apr1': round(statistics.median(apr1), 1) if apr1 else None,
                'n': len(peaks)}

    decades = {}
    for d0 in range(1980, WY_NOW, 10):
        years = [y for y in range(max(d0 + 1, DEC_FROM), min(d0 + 11, WY_NOW))]
        if not years:
            continue
        st = season_stats(years)
        if not st:
            continue
        decades[f'{d0}s'] = {'wk': wy_weekly(years), **st,
                             'y0': years[0], 'y1': years[-1]}
    if decades:
        SNOW_DECADES = {
            'n': len(panel),
            'elev': [int(min(elevs)), int(max(elevs))] if elevs else None,
            'dec': decades,
            'cur': wy_weekly([WY_NOW]),
            'curWY': WY_NOW,
            'curStats': season_stats([WY_NOW]),
        }
        head = sorted(decades)
        print(f'  decades: panel of {len(panel)} stations, '
              f'{", ".join(f"{k} {decades[k]["peak"]}in" for k in head)}')
except Exception as e:
    print('  decades: skipped (', e, ')')

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

# ---- 5. reservoir elevations: the physical step-down ----
# The basin flow diagram stacks nodes by how high they actually sit, so every
# reservoir needs a water-surface elevation.
#   - CDSS `stage` where a reservoir is telemetered: the live pool elevation,
#     measured, from the same endpoint the storage comes from.
#   - otherwise the USGS 3DEP DEM sampled over the reservoir. A reservoir
#     surface is the FLAT, LOW part of its neighbourhood, so widen the sample
#     box until some 10-ft bin holds >=12% of the samples, then take the LOWEST
#     such plateau — a mesa above the lake is flat too; the water is the one at
#     the bottom of the valley. Checked against the CDSS stages that do exist,
#     this lands within 60 ft on 12 of 13.
RES_ELEV = {}


def dem_samples(lat, lon, step, n, key):
    pts = [[lon + dx * step, lat + dy * step]
           for dx in range(-n, n + 1) for dy in range(-n, n + 1)]
    q = {'geometry': json.dumps({'points': pts, 'spatialReference': {'wkid': 4326}}),
         'geometryType': 'esriGeometryMultipoint', 'returnFirstValueOnly': 'true',
         'f': 'json', 'sampleCount': str(len(pts))}
    j = try_fetch_json('https://elevation.nationalmap.gov/arcgis/rest/services/'
                       '3DEPElevation/ImageServer/getSamples?' + urllib.parse.urlencode(q), key)
    return [float(s['value']) * 3.28084 for s in (j or {}).get('samples', [])
            if s.get('value') not in (None, 'NoData')]


DEM_GRIDS = ((0.0012, 4), (0.0025, 4), (0.0045, 4))


def _plateau(vals, frac):
    """the lowest 10-ft band holding at least `frac` of the samples"""
    bins = {}
    for v in vals:
        bins[round(v / 10) * 10] = bins.get(round(v / 10) * 10, 0) + 1
    flat = sorted(b for b, c in bins.items() if c >= len(vals) * frac)
    if not flat:
        return None
    inb = [v for v in vals if round(v / 10) * 10 == flat[0]]
    return sum(inb) / len(inb)


def dem_water_surface(rid, lat, lon):
    """Only returns a value when the samples show a DOMINANT flat surface —
    i.e. we really are looking at a lake. A weak plateau means the coordinate
    sits on a hillside instead (Homestake's does, and a permissive threshold
    put it 1,160 ft too low), and a wrong height would mis-order the step-down
    while looking perfectly authoritative. Better to return nothing and let the
    diagram place the node by its neighbours, with no elevation printed."""
    for i, (step, n) in enumerate(DEM_GRIDS):
        vals = dem_samples(lat, lon, step, n, f'dem_{rid}_{i}.json')
        if not vals:
            continue
        got = _plateau(vals, 0.30)
        if got is not None:
            return got
    return None


try:
    stage = {}
    abbrevs = [m['dwr'] for m in RES_META.values() if m['dwr']]
    if abbrevs:
        j = try_fetch_json('https://dwr.state.co.us/Rest/GET/api/v2/telemetrystations/'
                           'telemetrystation/?format=json&abbrev=' + ','.join(abbrevs),
                           'cdss_stage.json')
        for r in (j or {}).get('ResultList', []):
            v = r.get('stage')
            # >1000 ft rules out a station reporting gage height above a local
            # datum rather than a true elevation; keep the max per duplicate row
            if isinstance(v, (int, float)) and v > 1000:
                stage[r['abbrev']] = max(stage.get(r['abbrev'], 0), v)
    for rid, meta in sorted(RES_META.items()):
        ft = stage.get(meta['dwr']) if meta['dwr'] else None
        src = 'cdss'
        if ft is None:
            ft = dem_water_surface(rid, meta['lat'], meta['lon'])
            src = 'dem'
        if ft is not None:
            RES_ELEV[rid] = {'ft': round(ft), 'src': src}
    n_cdss = sum(1 for v in RES_ELEV.values() if v['src'] == 'cdss')
    missing = [r for r in RES_META if r not in RES_ELEV]
    print(f'  elevations: {len(RES_ELEV)}/{len(RES_META)} reservoirs '
          f'({n_cdss} cdss stage + {len(RES_ELEV) - n_cdss} dem)'
          + (f'; none for: {", ".join(missing)}' if missing else ''))
except Exception as e:
    print('  elevations: skipped (', e, ')')

# ---- write js/normals.js ----
prov = {
    'built': TODAY.isoformat(),
    'sources': {
        'streamflow': 'USGS NWIS daily values (waterservices.usgs.gov), record from 1991',
        'reservoir': 'Colorado DWR CDSS telemetry (dwr.state.co.us), daily from 2005',
        'snowpack': 'NRCS AWDB SNOTEL SWE (wcc.sc.egov.usda.gov), long-record stations',
        'snowDecades': ('NRCS AWDB SNOTEL SWE, a FIXED panel of stations installed by 1980 '
                        'with a near-complete record in every water year since 1981, so a '
                        'decade-to-decade comparison is not confounded by the station set changing'),
        'powell': 'USBR Upper Colorado hydrodata (usbr.gov/uc), Lake Powell daily storage from 1963',
        'elevation': ('reservoir water-surface elevation from Colorado DWR CDSS telemetry `stage` '
                      'where telemetered, else the USGS 3DEP DEM (elevation.nationalmap.gov) '
                      'sampled over the reservoir; USGS NWIS `alt_va` for gage datums')
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
    f.write(js('SNOW_BASIN', SNOW_BASIN))    # basin -> {cur, nrm} monthly SWE, Oct..Jul
    f.write(js('SNOW_DECADES', SNOW_DECADES))  # fixed-panel SWE by decade, water-year weeks
    f.write(js('PMH_DERIVED', PMH))        # data.js builds runtime PMH, filling dark basins (yampa)
    f.write(js('RES_ELEV', RES_ELEV))      # id -> {ft, src} water-surface elevation
    f.write(js('POWELL_ANNUAL', POWELL_ANNUAL))
print(f'\nwrote {os.path.relpath(OUT, ROOT)}  '
      f'({len(GAGES)} gages, {len(RES_NORMALS)} res normals, '
      f'{"snow" if SNOW_NORMALS else "no-snow"}, {len(POWELL_ANNUAL)} Powell yrs)')
