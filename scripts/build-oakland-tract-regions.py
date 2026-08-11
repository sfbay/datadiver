#!/usr/bin/env python3
"""Build src/cities/oakland/tractRegions.ts — the tract→region crosswalk.

WHY THIS EXISTS
---------------
Oakland Demographics aggregates ACS 5-year tract data up to the 10 planning
regions. This crosswalk says which region each census tract belongs to. Unlike
SF's fractional TRACT_MAPPINGS (161/244 partial coverage — the silent
mass-drop bug), Oakland's is CENTROID-based, weight 1.0: each Alameda tract's
internal point falls in exactly one region polygon (or none → not an Oakland
tract, or the Port/airport edge). Full coverage of the tracts it lists, by
construction — a tract is never split, so no weight can be lost.

WHAT THIS DOES
--------------
  - Reads tract internal points (centroids) from the Census 2023 Gazetteer
    (CA file, keyless TSV) — column GEOID + INTPTLAT/INTPTLONG.
  - Loads the 10 committed region polygons (oakland-regions.geojson).
  - Assigns each Alameda tract whose centroid is inside a region to that region
    (shapely covers()). Tracts outside every region are non-Oakland (Berkeley,
    Fremont, …) or uncovered edges — excluded, not dropped.
  - Emits TractMapping[] (tractId = last 6 of GEOID; one region, weight 1).

Gate: assigns a plausible Oakland tract count (>90). Prints the count so the
downstream ACS reconciliation (~430k pop) has a coverage anchor.

USAGE:  python3 scripts/build-oakland-tract-regions.py   (output committed)
Requires shapely.
"""

import json
import urllib.request
from pathlib import Path

from shapely.geometry import shape, Point

GAZETTEER = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_gaz_tracts_06.txt'
REGIONS = Path('public/data/geo/oakland-regions.geojson')
OUT = Path('src/cities/oakland/tractRegions.ts')
COUNTY_PREFIX = '06001'  # Alameda


def load_regions():
    fc = json.loads(REGIONS.read_text())
    return [(f['properties']['nhood'], shape(f['geometry'])) for f in fc['features']]


def main():
    regions = load_regions()
    with urllib.request.urlopen(GAZETTEER) as r:
        lines = r.read().decode('latin-1').splitlines()

    assigned = []  # (tractId6, code)
    for line in lines[1:]:
        cols = line.split('\t')
        geoid = cols[1].strip()
        if not geoid.startswith(COUNTY_PREFIX):
            continue
        lat, lon = float(cols[6].strip()), float(cols[7].strip())
        pt = Point(lon, lat)
        for code, poly in regions:
            if poly.covers(pt):
                assigned.append((geoid[-6:], code))
                break

    if len(assigned) < 90:
        raise SystemExit(f'only {len(assigned)} Oakland tracts assigned — expected >90; source or geometry changed?')

    assigned.sort()
    entries = ',\n'.join(
        f"  {{ tractId: '{tid}', neighborhoods: [{{ name: '{code}', weight: 1 }}] }}"
        for tid, code in assigned
    )
    ts = (
        "// src/cities/oakland/tractRegions.ts\n"
        "//\n"
        "// GENERATED — re-run `python3 scripts/build-oakland-tract-regions.py`.\n"
        "// Census tract (2023) -> Oakland planning region. Centroid-in-polygon,\n"
        "// weight 1.0, full coverage of the tracts listed (a tract is never split,\n"
        "// so no ACS mass is lost — structurally immune to SF's partial-crosswalk\n"
        "// bug). Consumed by aggregateToNeighborhoods(tracts, OAKLAND_TRACT_REGIONS).\n"
        "\n"
        "import type { TractMapping } from '../../types/census'\n"
        "\n"
        f"export const OAKLAND_TRACT_REGIONS: TractMapping[] = [\n{entries},\n]\n"
    )
    OUT.write_text(ts)
    by_region = {}
    for _, code in assigned:
        by_region[code] = by_region.get(code, 0) + 1
    print(f'{len(assigned)} Oakland tracts -> {OUT}')
    print('  per region:', dict(sorted(by_region.items())))


if __name__ == '__main__':
    main()
