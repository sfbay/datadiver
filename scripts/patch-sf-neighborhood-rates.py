#!/usr/bin/env python3
# patch-sf-neighborhood-rates.py — fill the six tract-only rate variables on
# src/data/census-neighborhoods.json (poverty, unemployment, and the four
# commute-mode shares).
#
#   python3 scripts/patch-sf-neighborhood-rates.py
#
# NO Census API key, and no ACS call at all — every value already sits in the
# committed src/data/census-tracts.json (240 of 244 tracts carry all six). SF's
# neighborhood rows are built from BLOCK GROUPS, and the ACS does not tabulate
# these tables at block-group scale, so the six arrived empty and the
# Demographics view opened with a '—' Poverty Rate card.
#
# Do NOT "fix" this by running scripts/generate-census-static.ts instead: its SF
# path cannot produce these six either, AND it drops renterHouseholds from every
# row (only patch-renter-households.py writes that field, and Housing's eviction
# rates divide by it).
#
# These are RATES, so each neighborhood takes the POPULATION-WEIGHTED MEAN of
# its tracts — never a sum. Same semantics as aggregateToNeighborhoods() in
# src/utils/censusAggregator.ts: weight by tract population, skip tracts with no
# finite value or no population, round percents to 2 decimals.
#
# Tract → neighborhood comes from DataSF's OFFICIAL whole-tract assignment
# (sevw-6tgi, no key needed) — NOT the repo's TRACT_MAPPINGS crosswalk, which
# covers only 161/244 tracts. Coverage is printed per key at the end; anything
# short of 41 neighborhoods is named with its reason rather than invented.
# Pinned by src/data/census-sf.test.ts. Full story: docs/data-insights.md.
import json, math, urllib.request

ROOT = '/Users/faculty-m/dev/datadiver'
KEYS = ['povertyRate', 'unemploymentRate', 'pctWFH', 'pctDriveAlone', 'pctTransit', 'pctBikeWalk']
EXPECTED_TRACTS = 244
MIN_TRACTS_PER_KEY = 240

# 1. Committed tract values (no fetch — these ship in the repo)
tracts = json.load(open(f'{ROOT}/src/data/census-tracts.json'))
assert len(tracts) == EXPECTED_TRACTS, f'expected {EXPECTED_TRACTS} tracts, got {len(tracts)}'
print(f'tracts loaded: {len(tracts)}')
for k in KEYS:
    have = sum(1 for t in tracts if isinstance(t.get(k), (int, float)) and math.isfinite(t[k]))
    assert have >= MIN_TRACTS_PER_KEY, f'{k}: only {have}/{len(tracts)} tracts carry a value'
    print(f'  {k}: {have}/{len(tracts)} tracts')

# 2. Official assignment: tractce → analysis neighborhood
url = 'https://data.sfgov.org/resource/sevw-6tgi.json?$select=tractce,neighborhoods_analysis_boundaries&$limit=400'
assign = json.load(urllib.request.urlopen(url))
tract_to_nh = {r['tractce']: r['neighborhoods_analysis_boundaries'] for r in assign if r.get('tractce')}
print(f'assignment rows: {len(tract_to_nh)}')

# 3. Group tracts by neighborhood
by_nh = {}
unassigned = []
for t in tracts:
    tid = str(t['geoId'])[-6:]
    nh = tract_to_nh.get(tid)
    if nh is None:
        unassigned.append(tid)
        continue
    by_nh.setdefault(nh, []).append(t)
print(f'neighborhoods with tracts: {len(by_nh)}, unassigned tracts: {len(unassigned)} {unassigned}')

# 4. Population-weighted mean per neighborhood per key (rates, never sums)
rolled = {}
for nh, ts in by_nh.items():
    row = {}
    for k in KEYS:
        num = den = 0.0
        for t in ts:
            v, pop = t.get(k), t.get('population') or 0
            if isinstance(v, (int, float)) and math.isfinite(v) and pop > 0:
                num += v * pop
                den += pop
        if den > 0:
            row[k] = round(num / den, 2)
    rolled[nh] = row

# 5. Patch ONLY the six keys into the neighborhoods JSON — nothing else is touched
p = f'{ROOT}/src/data/census-neighborhoods.json'
nbhds = json.load(open(p))
before_renter = sum(1 for r in nbhds if isinstance(r.get('renterHouseholds'), (int, float)))
gaps = {}
for r in nbhds:
    values = rolled.get(r['name'], {})
    for k in KEYS:
        if k in values:
            r[k] = values[k]
        else:
            gaps.setdefault(r['name'], []).append(k)
after_renter = sum(1 for r in nbhds if isinstance(r.get('renterHouseholds'), (int, float)))
assert before_renter == after_renter == len(nbhds), 'renterHouseholds was disturbed — stop'
open(p, 'w').write(json.dumps(nbhds, indent=2) + '\n')

# 6. Coverage summary, loud
print(f'\npatched {len(nbhds)} neighborhood rows (renterHouseholds intact: {after_renter}/{len(nbhds)})')
for k in KEYS:
    have = sum(1 for r in nbhds if isinstance(r.get(k), (int, float)))
    print(f'  {k}: {have}/{len(nbhds)} neighborhoods')
if gaps:
    print('\nneighborhoods NOT filled (their tracts publish no value — left absent, not faked):')
    for name, missed in sorted(gaps.items()):
        codes = [str(t['geoId'])[-6:] for t in by_nh.get(name, [])]
        print(f'  {name}: {len(missed)} keys · tracts {codes}')
else:
    print('\nevery neighborhood received all six values')
print('assignment names NOT in JSON:', sorted(set(by_nh) - {r['name'] for r in nbhds}))

# 7. Citywide sanity check — SF's published ACS poverty rate is ~10-11%
num = den = 0.0
for r in nbhds:
    v, pop = r.get('povertyRate'), r.get('population') or 0
    if isinstance(v, (int, float)) and pop > 0:
        num += v * pop
        den += pop
print(f'citywide population-weighted poverty: {num / den:.2f}% over {den:,.0f} residents (expect ~10-11%)')
