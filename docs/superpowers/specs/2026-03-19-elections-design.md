# SF Elections — Live Results, Historical Playback & Neighborhood Time Machine

**Date:** 2026-03-19
**Status:** Draft — pending scope confirmation

## Vision

The most immersive interactive election experience ever built for San Francisco. Not just election night — a **civic time machine** that lets you press play on 30 years of democracy, neighborhood by neighborhood, race by race, era by era.

A journalist covering the Mission should be able to watch how that neighborhood voted for every mayoral race from 1999 to 2024 in a single animated sequence. A policy researcher should be able to compare how Prop 13 (1978) sentiment maps against modern housing measures. A civic educator should be able to show a student how San Francisco's political identity has shifted across presidential elections from 1996 to 2024.

This is what the user built by hand for the 1996 Presidential election at SFSU — now automated, animated, and explorable at every level of granularity.

## Data Sources

### Primary: SF Department of Elections (sfelections.org)

The richest source. Publishes extraordinary detail for every SF election since 1995.

| Data Type | Format | Granularity | Coverage |
|-----------|--------|-------------|----------|
| Election results | Excel, PDF, XML | Precinct, neighborhood, district | 1995–present |
| RCV round-by-round | Excel (short + detailed) | Citywide per round | All RCV races |
| Cast Vote Records (CVR) | JSON (daily ZIP exports) | Individual ballot | Recent elections |
| Precinct boundaries | GIS Shapefile | 514 precincts | Current + historical |
| District boundaries | GIS Shapefile | 11 supervisor districts | Current + historical |
| Voter turnout | Text/CSV | Citywide | **1899–present** |
| Ballot propositions | Text/Excel | Citywide | All historical |
| Precinct-to-district mapping | Text | Precinct → district | Current |

**Election night reporting cadence:**
1. ~8:45 PM — First report (pre-Election Day mail ballots)
2. ~9:45 PM — Second report (some polling places)
3. ~10:45 PM — Third report (more polling places)
4. All precincts in — Fourth report
5. Next day ~4 PM daily — Updated preliminary results + remaining ballot count
6. ~30 days — Final certification

### Supplement: CivicAPI (civicapi.org)

Free, no-auth API for state/federal races appearing on SF ballots.

| Feature | Detail |
|---------|--------|
| Coverage | State/federal races (President, Governor, US House, State Senate/Assembly) |
| SF local | Almost none (only 1 race indexed as of research date) |
| Live updates | Every 5-10 seconds during active elections |
| Race History | Timestamped snapshots for playback (post-October 2025 only) |
| Authentication | None required |
| Cost | Free (attribution required for non-personal use) |

### Not using:
- **AP Elections API** — Paid, expensive, covers same races as CivicAPI
- **Google Civic API** — Voter info only, no results
- **OpenElections** — Sparse SF coverage
- **DataSF/Socrata** — No election results datasets (only campaign finance)

## Feature Architecture

### The Map (hero element)

**Choropleth map** — precinct-level or neighborhood-level results, colored by:
- Winner (candidate color)
- Margin of victory (intensity)
- Turnout (% of registered voters)
- Proposition yes/no (green/red gradient)

**Three geographic resolutions:**
1. **Precinct** (514 polygons) — finest grain, shows block-by-block patterns
2. **Neighborhood** (37 polygons) — matches all other DataDiver views, most useful for comparison
3. **Supervisor District** (11 polygons) — political unit, useful for supervisor races

**Zoom-adaptive:** Show neighborhoods at overview zoom, switch to precincts at street level (same pattern as Census demographic underlays).

### The Timeline — "Press Play"

**This is the signature feature.** Three modes of temporal navigation:

#### Mode 1: Election Night Playback
- Animate through election night reports (8:45 PM → 9:45 PM → 10:45 PM → final)
- Then daily canvass updates through certification
- Watch RCV leads flip as mail ballots arrive
- Speed control: 1x (real-time proportional), 5x, 10x, instant
- Scrubber bar with timestamps

#### Mode 2: Cross-Election Comparison (the Time Machine)
- Select a race type (e.g., "Mayor" or "President" or "Prop: Housing")
- Select a geography (e.g., "Mission" or "all neighborhoods" or a single precinct)
- Press play to animate through every election of that type: 1996 → 2000 → 2004 → ... → 2024
- The map morphs between elections, showing how the geography's vote shifted
- Side panel shows the evolving margin, turnout, and demographic context (Census underlay)

**Use cases:**
- "How has the Mission voted for president since 1996?" — watch the blue deepening or shifting
- "Compare housing ballot measures across eras" — see which neighborhoods flipped from NIMBY to YIMBY
- "Track supervisor race competitiveness by district over time" — see where races tightened
- "Mayoral elections 1999–2024" — watch the political center of gravity move across neighborhoods

#### Mode 3: Side-by-Side
- Split-screen: two elections, same geography, same scale
- Synchronized hover: mouse over a precinct highlights it in both panels
- Perfect for "2020 vs 2024" or "Prop A (2018) vs Prop D (2024)"

### Neighborhood Deep Dive

Click any neighborhood on the map to open a **neighborhood election profile:**

- All races in the selected election, with neighborhood-specific results
- Turnout trend for this neighborhood across all elections
- RCV round progression for this neighborhood's votes
- Demographic context panel (Census data — already built)
- Historical voting pattern: "This neighborhood has voted for the winning mayoral candidate in X of the last Y elections"
- Comparison to city average: "Mission turnout was 12% above/below citywide average"

### Ranked Choice Voting Visualizer

SF's RCV creates uniquely rich data. No one visualizes this well today.

**RCV Sankey diagram:**
- Animated flow showing vote transfers round by round
- Each eliminated candidate's votes flow to their voters' next choices
- Exhausted ballots (no more rankings) flow to a "depleted" pool
- Color-coded by candidate
- Can overlay on map: show which neighborhoods' votes transferred to whom

**RCV neighborhood timeline:**
- For a given RCV race, show how each neighborhood's "effective vote" changed through rounds
- A neighborhood might start 60% for Candidate A in round 1, but after transfers end up 52% for Candidate B
- Animate this progression on the map

### Ballot Measure Explorer

Propositions are where neighborhood-level analysis is most powerful.

- All SF ballot measures, categorized by topic (housing, transit, taxes, public safety, etc.)
- Map: neighborhood yes/no choropleth
- Timeline: how has neighborhood X voted on housing measures over time?
- Cross-measure comparison: "Neighborhoods that voted yes on Prop A also tended to vote yes on Prop D"
- Historical context: link to ballot measure text, sponsors, campaign spending (cross-reference Campaign Finance view)

### Live Election Night Mode

On election nights, the view transforms:

- **Live banner** with next expected report time
- **CivicAPI polling** (5-10s) for state/federal races
- **sfelections.org polling** (~hourly) for SF local races
- **Automatic map updates** as new reports arrive
- **Push notification-style alerts** for race calls, lead changes, RCV round completions
- **Remaining ballots counter** showing how many are left to count
- **Projection mode** (optional): based on which precincts have reported and historical patterns, estimate likely final outcome

## Data Architecture

### Static Archive (pre-built)

Historical election data needs one-time processing from SF Elections Excel/PDF files into a queryable format.

```
public/elections/
  index.json                    — election manifest (all elections, dates, race list)
  results/
    2024-11-05/
      summary.json              — race results, candidates, vote totals
      neighborhoods.json        — neighborhood-level results for all races
      precincts.json            — precinct-level results (larger file)
      rcv/
        mayor_rounds.json       — RCV round-by-round for mayor
        da_rounds.json          — RCV round-by-round for DA
        ...
    2022-11-08/
      ...
    ...back to 1995...
  turnout/
    historical.json             — 1899–present citywide turnout
    by_neighborhood.json        — neighborhood turnout per election
  geo/
    precincts.geojson           — 514 precinct polygons
    precinct_neighborhood_map.json — precinct → neighborhood lookup
```

**Processing pipeline:** Script to parse SF Elections Excel files into standardized JSON. Run once per election cycle. Could be automated with a GitHub Action after each certification.

### Live Data (election night)

```
CivicAPI → poll every 10s → merge with local state
sfelections.org → poll results page → parse HTML/Excel → merge
Unified state → broadcast to UI via React state
```

### Hooks

- `useElectionResults(electionDate, raceId, resolution)` — fetch results at precinct/neighborhood/district level
- `useRCVRounds(electionDate, raceId)` — fetch RCV round-by-round data
- `useElectionTimeline(raceType, geography)` — fetch cross-election series for playback
- `useLiveElection()` — poll CivicAPI + sfelections.org on election nights
- `useTurnoutHistory(geography?)` — historical turnout series

## UI Design Notes

- **Accent color:** `#6366f1` (indigo) — civic/institutional, distinct from existing views
- **Route:** `/elections`
- **Map is the hero** — choropleth fills the viewport, controls float on glass
- **Timeline scrubber** — bottom of map, full-width, with play/pause/speed controls
- **Election picker** — dropdown or calendar in header bar
- **Race picker** — tab bar or pill group for races within an election
- **The "Time Machine" mode** should feel cinematic — smooth transitions between election years, year counter prominently displayed

## Cross-View Integration

The elections view connects to existing DataDiver infrastructure:

- **Census demographic underlays** (already built) — overlay income, race, education on election map
- **Campaign Finance** — "Who funded this candidate?" link from election results to campaign spending
- **Neighborhood context panels** — existing `NeighborhoodCensusContext` works here too
- **311/Crime/Emergency** — correlate neighborhood complaints/crime with voting patterns (research use)

## Implementation Phases

### Phase 1: Data Foundation
- Election data parser (Excel → JSON)
- Process 5 most recent elections (2024, 2022, 2020, 2019, 2018)
- Precinct GIS shapefile → GeoJSON conversion
- Precinct-to-neighborhood mapping
- Basic hooks: `useElectionResults`, `useRCVRounds`

### Phase 2: Core Map View
- Neighborhood choropleth for single election
- Race picker, election picker
- Basic results sidebar (candidates, vote totals, turnout)
- Neighborhood click → profile panel

### Phase 3: RCV Visualization
- Round-by-round bar chart / Sankey
- Animated round progression on map
- Exhausted ballot tracking

### Phase 4: The Time Machine
- Cross-election playback for a race type
- Timeline scrubber with play/pause
- Neighborhood-specific historical series
- Side-by-side comparison mode

### Phase 5: Historical Archive
- Process all elections back to 1995
- Turnout history back to 1899
- Ballot measure categorization and explorer

### Phase 6: Live Election Night
- CivicAPI integration for state/federal
- sfelections.org scraper for local
- Real-time map updates
- Remaining ballot counter

## Decisions (confirmed 2026-03-19)

1. **Neighborhoods for cross-era, precincts for single-election.** Neighborhoods are stable across redistricting cycles. Time Machine uses neighborhoods. Single-election views use actual precinct boundaries at street-level zoom.
2. **Process 5 most recent elections first** to confirm Excel structure, then work backwards. If older RCV data is PDF-only, start Time Machine from first machine-readable election.
3. **Respectful polling** of sfelections.org (~60s interval). Public government data, no restrictions. May reach out to SF Elections for undocumented API/feed.
4. **Lazy-load by election.** Manifest loads on mount (~metadata only). Neighborhood-level results (~50KB/election) preloaded for Time Machine. Precinct-level (~500KB/election) loads on zoom. Total neighborhood archive: ~1.5MB for 30 elections.
5. **Subtle mention** in footer or info section: "One of San Francisco's first live election results websites was hand-built at SFSU in 1996. DataDiver continues that tradition."
