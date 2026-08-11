#!/usr/bin/env python3
"""Build public/data/geo/oakland-regions.geojson.

WHY THIS EXISTS
---------------
Oakland's census/demographics geography (stage 5). The 131 official Oakland
neighborhoods (sb4q-6bkc) are tract-fine (~3,400 people each) — too small for
honest small-area ACS and too fine to nest census tracts. They roll up, via
their `code` letter-prefix, into exactly 10 coarse PLANNING REGIONS (~44k
people each) that tracts DO nest into. This script dissolves the 131 into
those 10 and bakes them into a same-origin asset (canonical `nhood` join key
= the region CODE). Sibling of build-neighborhood-boundaries.py (the dissolve
convention) and build-oakland-beats.py (structure + loud gates).

WHAT THIS DOES
--------------
  - Fetches sb4q-6bkc once, groups the 131 features by the `code` letter
    prefix (C, CE, E, F, L, N, NW, S, SE, W), unary_union each group.
  - Properties reduced to exactly {'nhood': <REGION CODE>}.
  - Coordinates rounded to 6 decimals (~10cm), compact separators.
  - Also emits, to stdout, the code->members map (for regionMembers.ts) when
    run with --members.

Gates (fail loudly): the grouped code set is EXACTLY the 10 expected codes;
output has exactly 10 features.

USAGE
-----
    python3 scripts/build-oakland-regions.py            # write the geojson
    python3 scripts/build-oakland-regions.py --members  # + dump members map

Requires shapely (pip install shapely). Output is committed; the app reads it
same-origin and never touches the network for boundaries.
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

SOURCE = 'https://data.oaklandca.gov/resource/sb4q-6bkc.geojson?$limit=200'
OUT = Path('public/data/geo/oakland-regions.geojson')
CODES = {'C', 'CE', 'E', 'F', 'L', 'N', 'NW', 'S', 'SE', 'W'}
PRECISION = 6


def round_coords(node, p=PRECISION):
    if isinstance(node, (list, tuple)):
        if node and isinstance(node[0], (int, float)):
            return [round(float(c), p) for c in node]
        return [round_coords(x, p) for x in node]
    return node


def prefix(code):
    m = re.match(r'^[A-Za-z]+', code or '')
    if not m:
        raise SystemExit(f'neighborhood code {code!r} has no letter prefix')
    return m.group(0)


def main():
    with urllib.request.urlopen(SOURCE) as r:
        src = json.load(r)

    groups = {}
    members = {}
    for f in src['features']:
        code = prefix(f['properties']['code'])
        groups.setdefault(code, []).append(shape(f['geometry']))
        members.setdefault(code, []).append(f['properties']['neighbhd'])

    if set(groups) != CODES:
        raise SystemExit(f'region codes {sorted(groups)} != expected {sorted(CODES)} — upstream changed?')

    features = []
    for code in sorted(groups):
        merged = unary_union(groups[code])
        g = mapping(merged)
        features.append({
            'type': 'Feature',
            'properties': {'nhood': code},
            'geometry': {'type': g['type'], 'coordinates': round_coords(g['coordinates'])},
        })

    if len(features) != 10:
        raise SystemExit(f'expected 10 regions, got {len(features)}')

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, separators=(',', ':')))
    total_members = sum(len(v) for v in members.values())
    print(f'{len(features)} regions ({total_members} neighborhoods) -> {OUT}  {OUT.stat().st_size / 1024:.0f} KB')

    if '--members' in sys.argv:
        dump = {code: sorted(members[code]) for code in sorted(members)}
        print('---MEMBERS---')
        print(json.dumps(dump, ensure_ascii=False))


if __name__ == '__main__':
    main()
