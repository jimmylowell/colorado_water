#!/usr/bin/env python3
"""Regenerate data/*.csv from js/data.js (the canonical dataset).

js/data.js is plain JavaScript, so it is evaluated with the system
JavaScriptCore (via osascript, macOS) — or node if available — and the
result is written as CSV. Run from anywhere:

    python3 scripts/make_csvs.py
"""
import csv, json, pathlib, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA_JS = ROOT / 'js' / 'data.js'
OUT = ROOT / 'data'

EXTRACT = "return JSON.stringify({RES:RES,PMH:PMH,MONTHS:MONTHS,FLOWPCT:FLOWPCT,G:G,BASINS:BASINS});"


def eval_data_js():
    src = DATA_JS.read_text()
    if shutil.which('node'):
        out = subprocess.run(
            ['node', '-e', f'const f=new Function({json.dumps(src + ";" + EXTRACT)});process.stdout.write(f())'],
            capture_output=True, text=True, check=True).stdout
    else:
        jxa = (f'ObjC.import("Foundation");'
               f'var s=ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError({json.dumps(str(DATA_JS))},$.NSUTF8StringEncoding,null));'
               f'(new Function(s+";"+{json.dumps(EXTRACT)}))()')
        out = subprocess.run(['osascript', '-l', 'JavaScript', '-e', jxa],
                             capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def write(path, header, rows):
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f'wrote {path.relative_to(ROOT)} ({len(rows)} rows)')


def main():
    d = eval_data_js()
    OUT.mkdir(exist_ok=True)
    basin_names = {b['id']: b['n'] for b in d['BASINS']}

    write(OUT / 'reservoirs.csv',
          ['id', 'name', 'lat', 'lon', 'basin', 'river', 'capacity_af', 'storage_af',
           'pct_of_median_1991_2020', 'confidence', 'as_of', 'source', 'dwr_telemetry_abbrev'],
          [[r['id'], r['n'], r['lat'], r['lon'], basin_names.get(r['b'], r['b']), r['r'],
            r['cap'], r['sto'], r['pm'], 'observed' if r['c'] == 'obs' else 'basin estimate',
            r.get('d', ''), r.get('s', 'basin % of median (NRCS, 1 Jun 2026)'), r.get('dwr', '')]
           for r in d['RES']])

    hist = [[basin_names.get(b, b), m, pcts[i]]
            for b, pcts in d['PMH'].items() for i, m in enumerate(d['MONTHS'])]
    hist += [['Statewide streamflow', m, d['FLOWPCT'][i]] for i, m in enumerate(d['MONTHS'])]
    write(OUT / 'basin_history.csv',
          ['basin', 'month', 'pct_of_median_1991_2020'], hist)

    seen, gages = set(), []
    for n in d['G']['nodes']:
        if n.get('gage') and n['gage'] not in seen:
            seen.add(n['gage'])
            gages.append([n['gage'], n.get('l', ''), basin_names.get(n.get('sys'), n.get('sys', ''))])
    write(OUT / 'gages.csv', ['usgs_site_no', 'name', 'basin'], gages)


if __name__ == '__main__':
    sys.exit(main())
