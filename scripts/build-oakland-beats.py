#!/usr/bin/env python3
"""
Build public/data/geo/oakland-beats.geojson.

WHY THIS EXISTS
---------------
Sibling of build-neighborhood-boundaries.py — the same vendoring convention
(committed same-origin asset, canonical `nhood` join property), applied to
Oakland's geography spine. Oakland's area vocabulary is the 59 OPD police
beats: the only boundary layer its event datasets join to (crime
`policebeat` at ~95%, 311 `beat` at ~98% — always the ZERO-PADDED id; the
layer's other id column `cp_beat` is unpadded ('4X') and silently loses
single-digit beats).

WHAT THIS DOES
--------------
Fetches the OakData beats layer (78s7-673i) once and bakes it into a
same-origin asset:

  - No dissolve — unlike SF's 195 tract fragments, the source is already
    one clean MultiPolygon per beat (which is why this script needs no
    shapely).
  - Properties reduced to exactly {'nhood': <beat id>} — `name` is the
    zero-padded id ('01X' … '35Y', plus the two special patrol areas LKM1
    and PDT2). Every boundary consumer in the app reads properties.nhood.
  - Coordinates rounded to 6 decimals (~10cm), compact separators.

Gates (fail loudly, elections-script convention): exactly 59 features;
every id matches ^([0-9]{2}[XYZ]|LKM1|PDT2)$ — note the Z suffix (13Z and
31Z are real beats; an [XY]-only pattern drops them).

USAGE
-----
    python3 scripts/build-oakland-beats.py

Re-run only to refresh from upstream. The output is committed; the app
reads it same-origin and never touches the network for boundaries.
"""

import json
import re
import urllib.request
from pathlib import Path

SOURCE = 'https://data.oaklandca.gov/resource/78s7-673i.geojson?$limit=100'
OUT = Path('public/data/geo/oakland-beats.geojson')
BEAT_ID = re.compile(r'^([0-9]{2}[XYZ]|LKM1|PDT2)$')

# ~10cm at Oakland's latitude. Finer precision only inflates the payload.
PRECISION = 6


def round_coords(node, precision=PRECISION):
    if isinstance(node, (list, tuple)):
        if node and isinstance(node[0], (int, float)):
            return [round(float(c), precision) for c in node]
        return [round_coords(x, precision) for x in node]
    return node


def main():
    with urllib.request.urlopen(SOURCE) as r:
        src = json.load(r)

    features = []
    for f in sorted(src['features'], key=lambda f: f['properties']['name']):
        beat = f['properties']['name']
        if not BEAT_ID.match(beat):
            raise SystemExit(f'unexpected beat id {beat!r} — grammar changed upstream?')
        g = f['geometry']
        features.append({
            'type': 'Feature',
            'properties': {'nhood': beat},
            'geometry': {'type': g['type'], 'coordinates': round_coords(g['coordinates'])},
        })

    if len(features) != 59:
        raise SystemExit(f'expected 59 beats, got {len(features)} — upstream changed?')

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({'type': 'FeatureCollection', 'features': features}, separators=(',', ':'))
    )
    print(f'{len(features)} beats → {OUT}  {OUT.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main()
