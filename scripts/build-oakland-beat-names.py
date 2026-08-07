#!/usr/bin/env python3
"""
Build scripts/oakland-beat-names-evidence.json — the audit trail behind
src/cities/oakland/beatNames.ts.

WHY THIS EXISTS
---------------
No official beat->name crosswalk exists anywhere: the city's beat layer
(78s7-673i) names 2 of 59 polygons (LKM1, PDT2 via `fullname`), and the OPD
dispatch layer's names are junk or multi-beat for 23 of 59 codes. The labels
DataDiver ships are an EDITORIAL SYNTHESIS (spec:
docs/superpowers/specs/2026-08-06-oakland-front-door-design.md, section A).
This script regenerates the evidence that synthesis is audited against:

  - FORWARD share per beat x neighborhood: intersection / beat area — "how
    much of beat 12Y is Rockridge".
  - REVERSE share: intersection / neighborhood area — "how much of Rockridge
    lives in 12Y" (the promotion rule in spec A3.4).
  - The dispatch layer's NEIGHBORHO name per beat, and 78s7-673i's
    `fullname` pair (LKM1/PDT2) — the cross-check legs.

Shares are computed on the lon/lat plane: they are ratios within one beat at
city scale, so no projection is needed. Neighborhood polygons are merged BY
NAME first (the live layer has 131 polygons / 129 names — "Coliseum
Industrial Complex" and "East 14th Street Business" are each split across
two polygons).

Requires shapely (unlike build-oakland-beats.py, which needs no geometry
ops). One-off env:

    python3 -m venv /tmp/beatnames-venv
    /tmp/beatnames-venv/bin/pip install shapely
    /tmp/beatnames-venv/bin/python scripts/build-oakland-beat-names.py

Gates (fail loudly, elections-script convention): exactly 59 beats from the
vendored asset; 131 features / 129 merged names from the live layer; LKM1
coverage < 1% (it is the lake — the strongest sanity anchor for the whole
overlay). A gate failure means the upstream layer changed: re-review the
labels, don't just re-run.

The output is COMMITTED. src/cities/oakland/beatNamesEvidence.test.ts pins
its key set against OAKLAND_BEATS.
"""

import json
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

from shapely.geometry import shape
from shapely.ops import unary_union
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parent.parent
BEATS_ASSET = ROOT / 'public' / 'data' / 'geo' / 'oakland-beats.geojson'
OUT = ROOT / 'scripts' / 'oakland-beat-names-evidence.json'

NEIGHBORHOODS_URL = (
    'https://data.oaklandca.gov/api/geospatial/sb4q-6bkc'
    '?method=export&format=GeoJSON'
)
DISPATCH_URL = (
    'https://services.arcgis.com/9tC74aDHuml0x5Yz/arcgis/rest/services/'
    'Police_Beats_NCPC/FeatureServer/0/query?where=1%3D1'
    '&outFields=NAME,NEIGHBORHO&returnGeometry=false&f=json'
)
FULLNAME_URL = (
    'https://data.oaklandca.gov/resource/78s7-673i.json'
    '?%24select=name,fullname&%24limit=100'
)


def fetch_json(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def main():
    beats_fc = json.loads(BEATS_ASSET.read_text())
    beats = {
        f['properties']['nhood']: make_valid(shape(f['geometry']))
        for f in beats_fc['features']
    }
    if len(beats) != 59:
        sys.exit(f'GATE: expected 59 beats in vendored asset, got {len(beats)}')

    nb_fc = fetch_json(NEIGHBORHOODS_URL)
    if len(nb_fc['features']) != 131:
        sys.exit(
            f"GATE: expected 131 neighborhood features, got {len(nb_fc['features'])}"
        )
    by_name = defaultdict(list)
    for f in nb_fc['features']:
        by_name[f['properties']['neighbhd']].append(make_valid(shape(f['geometry'])))
    hoods = {name: unary_union(geoms) for name, geoms in by_name.items()}
    if len(hoods) != 129:
        sys.exit(f'GATE: expected 129 merged neighborhood names, got {len(hoods)}')

    dispatch = {}
    for f in fetch_json(DISPATCH_URL)['features']:
        a = f['attributes']
        dispatch[a['NAME'].strip()] = (a.get('NEIGHBORHO') or '').strip()
    # Gate the cross-check legs too — an outage/pagination/schema change must
    # fail HERE, not produce a complete-looking evidence file with an empty
    # cross-check column (absence rendered as presence, in the audit trail).
    if len(dispatch) != 59:
        sys.exit(f'GATE: dispatch layer returned {len(dispatch)} beats, expected 59')

    fullname = {}
    for row in fetch_json(FULLNAME_URL):
        if row.get('fullname'):
            fullname[row['name']] = row['fullname'].strip()
    if set(fullname) != {'LKM1', 'PDT2'}:
        sys.exit(f'GATE: fullname keys {sorted(fullname)} != [LKM1, PDT2]')

    evidence = {}
    for code in sorted(beats):
        bg = beats[code]
        ba = bg.area
        rows = []
        for name, hg in hoods.items():
            if not bg.intersects(hg):
                continue
            inter = bg.intersection(hg).area
            fwd = inter / ba
            if fwd < 0.005:
                continue
            rows.append({
                'name': name,
                'forwardShare': round(fwd, 4),
                'reverseShare': round(inter / hg.area, 4),
            })
        rows.sort(key=lambda r: -r['forwardShare'])
        evidence[code] = {
            'coverage': round(sum(r['forwardShare'] for r in rows), 4),
            'overlay': rows,
            'dispatchName': dispatch.get(code, ''),
            'fullname': fullname.get(code, ''),
        }

    if evidence['LKM1']['coverage'] >= 0.01:
        sys.exit(
            f"GATE: LKM1 (the lake) should have ~0 coverage, "
            f"got {evidence['LKM1']['coverage']}"
        )

    OUT.write_text(json.dumps(evidence, indent=1) + '\n')
    print(f'wrote {OUT.relative_to(ROOT)} — {len(evidence)} beats')


if __name__ == '__main__':
    main()
