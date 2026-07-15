#!/usr/bin/env python3
"""
Build era-pinned election geometry for the Elections precinct fill.

Sibling of build-neighborhood-boundaries.py — same dissolve / precision-6 /
sliver rules. Read that script's docstring for the buffering trap: do NOT
weld slivers with a morphological close; it adds vertices at every join and
doubles the file size.

Reads gitignored sources (data/elections-src/prec_{2012,2022}.geojson —
refetch with `node scripts/fetch-election-sources.mjs`) and emits committed,
same-origin assets to public/data/elections/geo/:

  prec-2012.geojson            603 precincts, props {id, nhood} (nhood = neighrep;
                               605 source features minus 2 null-id GG Park placeholders)
  prec-2022.geojson            514 precincts, props {id, nhood} (nhood = neigh22)
  legacy-neighborhoods.geojson 26 legacy neighborhoods dissolved by neighrep
                               (neighrep 'NA' excluded — it is a placeholder,
                               not a neighborhood; 27 distinct values in source)

Every gate below FAILS the build (sys.exit) rather than warning: the
precinct-renumbering trap means a silently-wrong join renders a plausible
WRONG map (see docs/data-insights.md → Elections).
"""

import json
import sys
from pathlib import Path

from shapely.geometry import MultiPolygon, mapping, shape
from shapely.ops import unary_union

SRC_DIR = Path('data/elections-src')
OUT_DIR = Path('public/data/elections/geo')
RESULTS = Path('public/data/elections/results')
SLIVER_SHARE = 0.001
PRECISION = 6

# (era, id_field, nhood_field, src_count, placeholder_nulls, date_codes)
# placeholder_nulls: source features with a NULL precinct id — verified to be
# the two Golden Gate Park placeholder shapes (neighrep 'NA') in the 2012
# file. They are not precincts; no turnout row can reference them.
ERAS = [
    ('prec_2012', 'prec_2012', 'neighrep', 605, 2, ['20201103', '20220607']),
    ('prec_2022', 'prec_2022', 'neigh22', 514, 0, ['20221108', '20240305', '20241105', '20251104']),
]


def die(msg):
    print(f'GATE FAILED: {msg}', file=sys.stderr)
    sys.exit(1)


def round_coords(node, precision=PRECISION):
    if isinstance(node, (list, tuple)):
        if node and isinstance(node[0], (int, float)):
            return [round(float(c), precision) for c in node]
        return [round_coords(x, precision) for x in node]
    return node


def feature(props, geom):
    m = mapping(geom)
    return {
        'type': 'Feature',
        'properties': props,
        'geometry': {'type': m['type'], 'coordinates': round_coords(m['coordinates'])},
    }


def write_fc(path, features):
    path.write_text(json.dumps(
        {'type': 'FeatureCollection', 'features': features}, separators=(',', ':')))
    print(f'{path}  {path.stat().st_size / 1024:.0f} KB  ({len(features)} features)')


def nhood_key(s):
    return s.upper().strip()


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for era, id_field, nhood_field, expected, expected_nulls, date_codes in ERAS:
        src = json.loads((SRC_DIR / f'{era}.geojson').read_text())
        if len(src['features']) != expected:
            die(f'{era}: {len(src["features"])} source features, expected {expected}')

        out, seen = [], set()
        skipped_placeholder = 0
        for f in src['features']:
            raw_id = f['properties'][id_field]
            if raw_id is None:
                # Skip ONLY the known placeholder form; a null id on a real
                # neighborhood would be a source regression, not a park.
                if f['properties'][nhood_field] != 'NA':
                    die(f'{era}: null {id_field} on non-placeholder feature '
                        f'({nhood_field}={f["properties"][nhood_field]!r})')
                skipped_placeholder += 1
                continue
            pid = str(raw_id)
            if pid in seen:
                die(f'{era}: duplicate precinct id {pid}')
            seen.add(pid)
            geom = shape(f['geometry']).buffer(0)
            # neigh22 is null for two park/water placeholder precincts
            # (9903/9904) — normalize to the 2012 file's 'NA' convention so
            # the emitted contract stays {id: string, nhood: string}.
            nhood = f['properties'][nhood_field] or 'NA'
            out.append(feature({'id': pid, 'nhood': nhood}, geom))

        if skipped_placeholder != expected_nulls:
            die(f'{era}: {skipped_placeholder} null-id placeholder features, '
                f'expected {expected_nulls}')

        # Cross-check against every election of this era: each turnout id must
        # exist in this geometry, unless its row is flagged unmapped (the pinned
        # 2012-era allow-list) or carries zero registration (e.g. 9903 in
        # 20220607 — a zero-voter artifact with no polygon anywhere).
        for dc in date_codes:
            t = json.loads((RESULTS / dc / 'precincts' / '_turnout.json').read_text())
            if t['era'] != era:
                die(f'{dc}: results era {t["era"]} != geometry era {era}')
            for label, row in t['precincts'].items():
                if row.get('unmapped'):
                    continue
                for pid in row['ids']:
                    if pid not in seen and row['registered'] > 0:
                        die(f'{dc}: turnout id {pid} (label {label}, '
                            f'{row["registered"]} registered) has no {era} geometry')

        write_fc(OUT_DIR / f'{era.replace("_", "-")}.geojson', out)

    # Legacy neighborhood frame: dissolve prec_2012 by neighrep, excluding 'NA'.
    src = json.loads((SRC_DIR / 'prec_2012.geojson').read_text())
    by_nhood = {}
    for f in src['features']:
        rep = f['properties']['neighrep']
        if rep == 'NA':
            continue
        by_nhood.setdefault(rep, []).append(shape(f['geometry']).buffer(0))

    features, dropped = [], 0
    for nhood, geoms in sorted(by_nhood.items()):
        merged = unary_union(geoms)
        parts = list(merged.geoms) if isinstance(merged, MultiPolygon) else [merged]
        total = sum(p.area for p in parts)
        kept = [p for p in parts if p.area / total >= SLIVER_SHARE]
        dropped += len(parts) - len(kept)
        geom = kept[0] if len(kept) == 1 else MultiPolygon(kept)
        features.append(feature({'nhood': nhood}, geom))

    # Gate: every dsov legacy26 neighborhood key must match a frame feature.
    dsov = json.loads((RESULTS / '20201103' / 'neighborhoods.json').read_text())
    frame_keys = {nhood_key(f['properties']['nhood']) for f in features}
    for name in dsov['neighborhoods']:
        if nhood_key(name) not in frame_keys:
            die(f'legacy frame missing dsov neighborhood {name!r}')
    if len(features) != len(dsov['neighborhoods']):
        die(f'legacy frame has {len(features)} features, '
            f'dsov has {len(dsov["neighborhoods"])} neighborhoods')

    write_fc(OUT_DIR / 'legacy-neighborhoods.geojson', features)
    print(f'legacy slivers dropped: {dropped}')
    print('all gates passed')


if __name__ == '__main__':
    main()
