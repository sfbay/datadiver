#!/usr/bin/env python3
"""
Build public/data/geo/sf-analysis-neighborhoods.geojson.

WHY THIS EXISTS
---------------
The polygons are DataSF's official "Analysis Neighborhoods" layer (j2bu-swwd,
PDDL, Publishing Department: Planning). Until Sept. 2026 DataDiver fetched a
2016 export of the same geometry mirrored on a volunteer GitHub repo
(sfbrigade/data-science-wg) — byte-identical to DataSF's tract layer
m46u-xzix on all 195 features, but unlicensed and unpinned. Re-pointing here
changed nothing measurable: the 41 names equal SF_NEIGHBORHOODS exactly and
the census block-group crosswalk re-ran 677/677 identical (spec
2026-09-03-source-pill-design.md §3.3).

WHAT THIS DOES
--------------
Fetches that source once and bakes it into a same-origin asset (979 KB, 41
features — one per neighborhood, only Russian Hill genuinely multi-part):

  - j2bu-swwd is ALREADY dissolved: it publishes 41 neighborhood polygons, not
    the 195 census-TRACT fragments the old sfbrigade mirror carried. So the
    dissolve below is a pass-through, and the sliver filter finds nothing to
    drop — both survive as a guard, not as work: they are what makes re-pointing
    at a fragmentary layer (a future city, or an upstream reshape) safe rather
    than a regression, and they cost one union per neighborhood to keep.
  - Every consumer reads only `properties.nhood`, so the output keeps that key
    alone. Dropping the source's other columns is most of the size cut; rounding
    coordinates to 6 decimals (~10cm) is the rest.
  - The dissolve is what keeps a `line` layer drawn over these polygons showing
    NEIGHBORHOOD borders instead of internal tract seams (stray lines on the
    Elections map were the original symptom, back when the input was fragments).

Do NOT "fix" the sliver filter by buffering to weld parts together: on the old
fragmentary input a morphological close added vertices at every join and grew
the file to 3.2 MB — larger than the source.

USAGE
-----
    pip install shapely
    python3 scripts/build-neighborhood-boundaries.py

Re-run only to refresh from upstream. The output is committed; the app reads it
same-origin and never touches the network for boundaries.
"""

import json
import urllib.request
from pathlib import Path

from shapely.geometry import MultiPolygon, mapping, shape
from shapely.ops import unary_union

SOURCE = 'https://data.sfgov.org/resource/j2bu-swwd.geojson?$limit=100'
OUT = Path('public/data/geo/sf-analysis-neighborhoods.geojson')

# A part smaller than this share of its neighborhood's area is an alignment
# sliver left by unioning polygons that don't share exact vertices, not a real
# piece of the city. Fires on nothing from j2bu-swwd's already-dissolved
# polygons; kept for a fragmentary input (see the docstring).
SLIVER_SHARE = 0.001

# ~10cm at SF's latitude. Finer precision only inflates the payload.
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

    by_nhood = {}
    for f in src['features']:
        # buffer(0) repairs self-intersecting rings that would break the union
        by_nhood.setdefault(f['properties']['nhood'], []).append(
            shape(f['geometry']).buffer(0)
        )

    features = []
    dropped = 0
    for nhood, geoms in sorted(by_nhood.items()):
        merged = unary_union(geoms)
        parts = list(merged.geoms) if isinstance(merged, MultiPolygon) else [merged]
        total = sum(p.area for p in parts)
        kept = [p for p in parts if p.area / total >= SLIVER_SHARE]
        dropped += len(parts) - len(kept)

        geom = kept[0] if len(kept) == 1 else MultiPolygon(kept)
        m = mapping(geom)
        features.append({
            'type': 'Feature',
            'properties': {'nhood': nhood},
            'geometry': {'type': m['type'], 'coordinates': round_coords(m['coordinates'])},
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({'type': 'FeatureCollection', 'features': features}, separators=(',', ':'))
    )

    src_area = sum(shape(f['geometry']).buffer(0).area for f in src['features'])
    out_area = sum(shape(f['geometry']).area for f in features)
    print(f'{len(src["features"])} source features → {len(features)} neighborhoods')
    print(f'{OUT}  {OUT.stat().st_size / 1024:.0f} KB')
    print(f'slivers dropped: {dropped} · area drift: {abs(out_area - src_area) / src_area * 100:.4f}%')


if __name__ == '__main__':
    main()
