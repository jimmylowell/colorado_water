#!/usr/bin/env python3
"""Build data/snow_panel.json: the fixed SNOTEL panel behind the snowpack-by-
decade chart (SNOW_DECADES in js/normals.js), with each site's median snow-
water equivalent for every day of the water year. scripts/fetch_live.py reads
it each day to put this winter's snow against the median for the date.

Reproducible:  python3 scripts/build_snow_panel.py
Shares build_normals.py's cache (/tmp/cw_normals_cache, the same sweL_ files),
so after one of the two has run, the other is quick.

Source: NRCS Air and Water Database (AWDB) REST services,
wcc.sc.egov.usda.gov/awdbRestApi, element WTEQ, daily. Public domain.

The panel rule is build_normals.py's, unchanged: Colorado SNOTEL sites
installed by 1980 with at least 300 daily readings in every water year from
1981 to the year before the panel year, and at least 250 in the panel year.
The panel year is the water year SNOW_DECADES was built on (curWY), so the
two lists are the same sites; the script stops if the count differs.

A site's median for a day is the median of its own readings on that calendar
day across the closed water years 1981 to the panel year. 29 February uses
the leap years only. Nothing is filled in: a day with fewer than 20 years of
readings at a site (5 for 29 February) has no median there.
"""
import json, os, re, statistics, sys, urllib.parse, urllib.request, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'snow_panel.json')
CACHE = '/tmp/cw_normals_cache'
os.makedirs(CACHE, exist_ok=True)
TODAY = datetime.date.today()
DEC_FROM = 1981
MIN_YEARS = 20

src = open(os.path.join(ROOT, 'js', 'normals.js'), encoding='utf-8').read()
m = re.search(r'SNOW_DECADES\s*=\s*(\{.*?\});', src, re.S)
SD = json.loads(m.group(1))
WY_PANEL, N_PANEL = SD['curWY'], SD['n']


def fetch(url, key, timeout=120):
    path = os.path.join(CACHE, key)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return open(path, encoding='utf-8').read()
    req = urllib.request.Request(url, headers={'User-Agent': 'colorado-water-build/1.0'})
    data = urllib.request.urlopen(req, timeout=timeout).read()
    with open(path, 'wb') as f:
        f.write(data)
    return data.decode('utf-8', 'ignore')


def water_year(d):
    return d.year + 1 if d.month >= 10 else d.year


# the days of a water year, 1 October to 30 September, with 29 February
DAYS = []
d = datetime.date(2003, 10, 1)            # 2004 is a leap year
while d <= datetime.date(2004, 9, 30):
    DAYS.append(d.strftime('%m-%d'))
    d += datetime.timedelta(days=1)

stations = json.loads(fetch(
    'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/stations'
    '?stationTriplets=*:CO:SNTL&returnStationElements=false', 'nrcs_stations.json'))
cand = [s for s in stations if (s.get('beginDate') or '2100')[:4] <= '1980']
print(f'{len(cand)} candidate sites installed by 1980')

sites = []
for s in cand:
    trip = s['stationTriplet']
    try:
        j = json.loads(fetch(
            'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data'
            f'?stationTriplets={urllib.parse.quote(trip)}&elements=WTEQ&duration=DAILY'
            f'&beginDate=1978-10-01&endDate={TODAY.isoformat()}',
            f'sweL_{trip.split(":")[0]}.json'))
        rows = j[0]['data'][0]['values']
    except Exception as e:
        print('  skip', trip, str(e)[:60])
        continue
    vals = {}
    for row in rows:
        v = row.get('value')
        if isinstance(v, (int, float)):
            vals[datetime.date.fromisoformat(row['date'][:10])] = float(v)
    per_wy = {}
    for day in vals:
        per_wy[water_year(day)] = per_wy.get(water_year(day), 0) + 1
    if not (all(per_wy.get(y, 0) >= 300 for y in range(DEC_FROM, WY_PANEL))
            and per_wy.get(WY_PANEL, 0) >= 250):
        continue
    by_day = {}
    for day, v in vals.items():
        if DEC_FROM <= water_year(day) <= WY_PANEL:
            by_day.setdefault(day.strftime('%m-%d'), []).append(v)
    med = [round(statistics.median(by_day[k]), 1) if len(by_day.get(k, [])) >= MIN_YEARS
           or (k == '02-29' and len(by_day.get(k, [])) >= MIN_YEARS // 4) else None
           for k in DAYS]
    sites.append({'triplet': trip, 'name': s.get('name'),
                  'elev': int(s['elevation']) if s.get('elevation') else None, 'med': med})

print(f'panel: {len(sites)} sites (SNOW_DECADES says {N_PANEL})')
if len(sites) != N_PANEL:
    sys.exit('panel differs from SNOW_DECADES: not writing')

out = {
    'built': TODAY.isoformat(),
    'source': 'NRCS Air and Water Database (AWDB), wcc.sc.egov.usda.gov/awdbRestApi, '
              'SNOTEL snow-water equivalent (WTEQ), daily. Public domain.',
    'panel': f'Colorado SNOTEL sites installed by 1980 with at least 300 daily readings in every '
             f'water year {DEC_FROM}-{WY_PANEL - 1} and at least 250 in {WY_PANEL}: the panel of '
             f'the snowpack-by-decade chart.',
    'median': f'Each site\'s median reading on that calendar day across water years '
              f'{DEC_FROM}-{WY_PANEL}; null where the site has fewer than {MIN_YEARS} years of '
              f'readings on that day. 29 February: leap years only.',
    'units': 'inches of water',
    'years': [DEC_FROM, WY_PANEL],
    'days': DAYS,
    'sites': sorted(sites, key=lambda x: x['triplet']),
}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(out, f, separators=(',', ':'))
    f.write('\n')
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
