# SF Elections — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-03-19-elections-design.md`
**Branch:** `feature/elections`
**Estimated chunks:** 5 (data foundation → core map → RCV → time machine → historical archive)

## Chunk 1: Data Foundation (do first)

### Task 1.1: Election data parser — XML summary
- File: `scripts/parse-election-xml.ts` (new)
- Parse SSRS XML from `sfelections.org/results/YYYYMMDD/data/summary.xml`
- Extract: races, candidates, vote counts (Election Day + VBM), percentages, precincts reporting
- Field mapping: `contestId` → race name, `candidateNameTextBox4` → candidate, `vot7` → votes per counting group, `vot8` → total
- Output: standardized JSON per election

### Task 1.2: Election data parser — RCV rounds
- File: `scripts/parse-rcv-rounds.ts` (new)
- Parse HTML tables from `sfelections.org/results/YYYYMMDD/final/round-pages/*_short-rounds-en.html`
- Extract: candidate name, votes per round, transfer amounts, elimination status
- Output: JSON array of rounds with per-candidate vote counts and transfers

### Task 1.3: Election manifest + types
- File: `src/types/elections.ts` (new)
- Types: `Election`, `Race`, `Candidate`, `RCVRound`, `NeighborhoodResult`, `PrecinctResult`, `BallotMeasure`
- `ElectionManifest` — index of all elections with metadata
- File: `public/elections/index.json` — generated manifest

### Task 1.4: Download + process 5 recent elections
- Script: `scripts/build-election-archive.ts` (new)
- Downloads XML + RCV HTML for: 2024-11-05, 2024-03-05, 2022-11-08, 2022-06-07, 2020-11-03
- Runs parsers from 1.1 and 1.2
- Outputs to `public/elections/results/YYYYMMDD/summary.json` and `rcv/*.json`
- Note: neighborhood-level breakdown requires the precinct→neighborhood Excel mapping from sfelections.org/tools/election_data/datasets.php — download and parse these too

### Task 1.5: Precinct GIS → GeoJSON
- Download precinct shapefile from sfelections.org/tools/election_data/datasets.php
- Convert to GeoJSON (use `ogr2ogr` or a Node shapefile parser like `shapefile` npm package)
- Output: `public/elections/geo/precincts.geojson`
- Also build `precinct_neighborhood_map.json` from the "Breakdown of Precincts by Districts, Ballot Types, and Neighborhoods" Excel file

### Task 1.6: Historical turnout + ballot propositions
- Download from sfelections.org cross-election datasets
- Parse text/CSV format
- Output: `public/elections/turnout/historical.json`, `public/elections/propositions/index.json`

### Task 1.7: Election data hooks
- File: `src/hooks/useElectionResults.ts` (new)
- `useElectionResults(electionDate, raceId?, resolution?)` — lazy-loads from static JSON
- `useRCVRounds(electionDate, raceId)` — loads RCV round data
- `useElectionManifest()` — loads the manifest index
- `useTurnoutHistory()` — loads historical turnout
- All use fetch + useMemo, NOT useDataset (these are static JSON, not Socrata)

### Task 1.8: Route + nav item
- File: `src/App.tsx` — add route `/elections`
- File: `src/components/layout/AppShell.tsx` — add nav item, shortLabel: 'EL', accentColor: '#6366f1'
- File: `src/views/Elections/Elections.tsx` — skeleton view

### Verification: Run parsers, verify JSON output, `npx tsc --noEmit && pnpm build`

## Chunk 2: Core Map View

### Task 2.1: Election choropleth map
- In Elections.tsx
- MapView with neighborhood choropleth (reuse existing useMapLayer pattern)
- Color by: winner color, margin intensity, or turnout %
- Three resolution modes: neighborhood (default), precinct (on zoom), district
- Use `useNeighborhoodBoundaries` for neighborhood polygons, new precinct GeoJSON for precinct level

### Task 2.2: Election picker + race picker
- File: `src/components/filters/ElectionPicker.tsx` (new)
- Dropdown: lists all elections from manifest, grouped by year
- Race picker: tab bar / pill group for races within selected election
- Both stored in URL params (?election=20241105&race=mayor)

### Task 2.3: Results sidebar
- Candidate list with vote bars (like neighborhood sidebar pattern)
- Turnout stat
- Precinct reporting status
- Click candidate → highlight their winning neighborhoods on map

### Task 2.4: Neighborhood click → profile panel
- Reuse DetailPanelShell pattern
- Show: all races for this neighborhood in the selected election
- Turnout vs city average
- Demographic context (existing NeighborhoodCensusContext)

### Task 2.5: CardTray metrics
- Cards: Winner, Margin, Turnout %, Registered Voters, Precincts Reporting

### Task 2.6: Map mode toggle
- Header toggle: Results / Turnout / Margin
- Changes choropleth coloring scheme

### Verification: Visual testing with real election data

## Chunk 3: RCV Visualization

### Task 3.1: RCV round bar chart
- File: `src/components/charts/RCVRoundChart.tsx` (new)
- Animated D3 bar chart showing candidates' vote totals per round
- Eliminated candidates fade out, their votes transfer
- Play/pause/step controls
- 50% threshold line

### Task 3.2: RCV Sankey diagram
- File: `src/components/charts/RCVSankey.tsx` (new)
- D3 Sankey showing vote transfers between rounds
- Eliminated candidate's votes flow to next choices
- Exhausted ballots flow to "depleted" pool
- Color by candidate

### Task 3.3: RCV map progression
- Animate neighborhood choropleth through RCV rounds
- Show which neighborhoods' "effective winner" changes as rounds progress
- Sync with the round chart above

### Task 3.4: RCV panel integration
- Add RCV tab/section to Elections.tsx for RCV races
- Show both round chart and Sankey
- "This race was decided in round N" callout

### Verification: Test with 2024 Mayor race (14 rounds, dramatic)

## Chunk 4: The Time Machine

### Task 4.1: Timeline scrubber component
- File: `src/components/filters/ElectionTimeline.tsx` (new)
- Full-width scrubber at bottom of map
- Dots for each election year
- Play/pause button, speed control (1x, 5x, 10x)
- Year counter display (prominently shown)

### Task 4.2: Cross-election playback
- File: `src/hooks/useElectionTimeline.ts` (new)
- `useElectionTimeline(raceType, geography?)` — loads results across all elections for a race type
- Preloads neighborhood-level results for smooth playback
- Returns: array of { electionDate, results } for animation

### Task 4.3: Map animation
- Smooth morphing between election results on the choropleth
- D3 interpolation for color transitions
- Year counter animates with each transition
- Side panel updates with candidates/results per election

### Task 4.4: Neighborhood time series
- Click a neighborhood in Time Machine mode → see its voting history
- Sparkline: how this neighborhood voted in every election of this type
- "The Mission voted for the winning mayoral candidate in X of Y elections"

### Task 4.5: Side-by-side mode
- Split screen: two elections, same geography
- Synchronized hover (mouse over a precinct highlights in both)
- Toggle in header: "Compare" mode

### Verification: Test with Presidential elections 2004–2024, Mayoral elections 2003–2024

## Chunk 5: Historical Archive + Polish

### Task 5.1: Process all remaining elections
- Extend build script to cover all elections back to November 2015 (from datasets dropdown)
- For older elections (pre-2015), check if results are on sfelections.org at older URL patterns
- Document any elections that can't be parsed automatically

### Task 5.2: Ballot measure explorer
- File: `src/components/charts/BallotMeasureExplorer.tsx` (new)
- Topic categorization (housing, transit, taxes, public safety)
- Neighborhood yes/no choropleth
- Cross-measure comparison: "neighborhoods that voted yes on Prop A also..."

### Task 5.3: Footer attribution
- "One of San Francisco's first live election results websites was hand-built at SFSU in 1996. DataDiver continues that tradition."
- Subtle placement in footer or info section

### Task 5.4: Home page tile
- Add Elections tile to Home.tsx VISUALIZATIONS array
- Badge: 'EL', accentColor: '#6366f1'
- Description + stats

### Task 5.5: Campaign Finance cross-link
- In election results sidebar, link to Campaign Finance view for the winning candidate's committee
- "See who funded this campaign →"

### Verification: Full build, all elections load, Time Machine works across full range

## Build order
Chunks must be sequential: 1 → 2 → 3 → 4 → 5.
Chunk 1 is the heaviest (data processing), Chunks 2-3 are the core UX, Chunk 4 is the signature feature.
Commit + push after each chunk.
