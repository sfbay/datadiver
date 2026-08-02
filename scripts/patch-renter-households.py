#!/usr/bin/env python3
# patch-renter-households.py — regenerate the renterHouseholds denominators in
# src/data/census-{neighborhoods,tracts}.json (eviction-rate denominators).
#
#   CENSUS_API_KEY=xxx python3 scripts/patch-renter-households.py
#
# Requires a Census API key (free: api.census.gov/data/key_signup.html —
# anonymous access was removed; keyless requests 302 to missing_key.html).
# Uses DataSF's OFFICIAL whole-tract assignment (sevw-6tgi) — NOT the repo's
# TRACT_MAPPINGS crosswalk, which covers only 161/244 tracts and drops ~70%
# of count mass. Verify after running: per-neighborhood sum must equal the
# citywide ACS total exactly (conservation printed at the end).
# Full story: docs/data-insights.md → Housing.
import json, os, urllib.request

key = os.environ['CENSUS_API_KEY']
YEAR = 2023
ROOT = '/Users/faculty-m/dev/datadiver'

# 1. ACS renter households per tract (tractce keyed)
url = f'https://api.census.gov/data/{YEAR}/acs/acs5?get=B25003_003E&for=tract:*&in=state:06+county:075&key={key}'
rows = json.load(urllib.request.urlopen(url))
hdr, data = rows[0], rows[1:]
v, t = hdr.index('B25003_003E'), hdr.index('tract')
by_tract = {r[t]: int(r[v]) for r in data if r[v] is not None and int(r[v]) >= 0}
print(f'ACS tracts: {len(by_tract)}, citywide renter HH: {sum(by_tract.values()):,}')

# 2. Official assignment: tractce → analysis neighborhood
url2 = 'https://data.sfgov.org/resource/sevw-6tgi.json?$select=tractce,neighborhoods_analysis_boundaries&$limit=400'
assign = json.load(urllib.request.urlopen(url2))
tract_to_nh = {r['tractce']: r['neighborhoods_analysis_boundaries'] for r in assign if r.get('tractce')}
print(f'assignment rows: {len(tract_to_nh)}')

# 3. Exact per-neighborhood sums
by_nh = {}
unassigned = 0
for tract, val in by_tract.items():
    nh = tract_to_nh.get(tract)
    if nh is None:
        unassigned += val
        continue
    by_nh[nh] = by_nh.get(nh, 0) + val
print(f'neighborhoods: {len(by_nh)}, assigned total: {sum(by_nh.values()):,}, unassigned renter HH: {unassigned:,}')

# 4. Patch neighborhoods JSON (names must match exactly — report misses)
p = f'{ROOT}/src/data/census-neighborhoods.json'
nbhds = json.load(open(p))
json_names = {r['name'] for r in nbhds}
patched = 0
for r in nbhds:
    if r['name'] in by_nh:
        r['renterHouseholds'] = by_nh[r['name']]
        patched += 1
open(p, 'w').write(json.dumps(nbhds, indent=2) + '\n')
print(f'patched {patched}/{len(nbhds)} neighborhoods')
print('assignment names NOT in JSON:', sorted(set(by_nh) - json_names))
print('JSON names NOT in assignment:', sorted(json_names - set(by_nh)))

# 5. Patch tracts JSON
p2 = f'{ROOT}/src/data/census-tracts.json'
tracts = json.load(open(p2))
tp = 0
for r in tracts:
    tid = str(r['geoId'])[-6:]
    if tid in by_tract:
        r['renterHouseholds'] = by_tract[tid]
        tp += 1
open(p2, 'w').write(json.dumps(tracts, indent=2) + '\n')
print(f'patched {tp}/{len(tracts)} tracts')

top = sorted(by_nh.items(), key=lambda kv: -kv[1])[:5]
print('top-5:', ' · '.join(f'{n}: {c:,}' for n, c in top))
mission = by_nh.get('Mission')
print(f'Mission check: {mission:,} (expect ~14-16K)')
