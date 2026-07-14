#!/usr/bin/env python3
"""
Build public/data/geo/sf-analysis-neighborhoods.geojson.

WHY THIS EXISTS
---------------
DataDiver used to fetch SF's Analysis Neighborhood polygons at RUNTIME from a raw
GitHub URL on a volunteer brigade repo:

    raw.githubusercontent.com/sfbrigade/data-science-wg/master/.../city_analysis_neighbor.geojson

Twelve views and two hooks depend on those polygons — effectively every map in the
app. An unpinned `master` branch on a third-party repo is a single point of failure
for all of them: rename the branch, move the file, or hit GitHub's raw rate limit,
and every neighborhood layer in DataDiver dies at once. It was also the last
render-blocking third-party origin in the app, after the Google Fonts removal
(June 2026) took out the others for the same reason.

WHAT THIS DOES
--------------
Fetches that source once and bakes it into a same-origin asset, dissolving it on
the way:

  - The source is 195 features — census-TRACT fragments, several per neighborhood.
    Nothing in the app reads their tract properties (`tractce10`, `geoid`); every
    consumer only reads `properties.nhood`. So the fragments are pure overhead —
    and worse, any `line` layer drawn over them renders TRACT SEAMS rather than
    neighborhood borders (visible as stray internal lines on the Elections map).
  - Dissolving by `nhood` gives 41 features, one per neighborhood: 2065 KB → 979 KB
    (53% smaller, on a payload fetched every session), with 0.0023% area drift.
  - Unioning tracts that don't share exact vertices leaves ~37 hairline sliver
    polygons (North Beach alone had 15). Parts under 0.1% of their neighborhood's
    area are dropped — they are alignment artifacts, not geography. Only Russian
    Hill legitimately remains multi-part.

Do NOT "fix" this by buffering to weld the slivers: a morphological close adds
vertices at every join and grew the file to 3.2 MB — larger than the source.

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

SOURCE = (
    'https://raw.githubusercontent.com/sfbrigade/data-science-wg/master/'
    'projects-in-this-repo/SF_311_Data-Analysis/data/GeoJSON/city_analysis_neighbor.geojson'
)
OUT = Path('public/data/geo/sf-analysis-neighborhoods.geojson')

# A part smaller than this share of its neighborhood's area is an alignment
# sliver between adjacent census tracts, not a real piece of the city.
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
    print(f'{len(src["features"])} tract fragments → {len(features)} neighborhoods')
    print(f'{OUT}  {OUT.stat().st_size / 1024:.0f} KB')
    print(f'slivers dropped: {dropped} · area drift: {abs(out_area - src_area) / src_area * 100:.4f}%')


if __name__ == '__main__':
    main()
