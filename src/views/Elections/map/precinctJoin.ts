/**
 * The label→ids→features join. Race files key on row LABELS ("1104/1105");
 * only _turnout carries ids; every member id of a consolidated label paints
 * with that label's values. Rules verified against the emitted files:
 *   - rows flagged `unmapped` render nowhere, on purpose
 *   - an id absent from era geometry is tolerated only when registered === 0
 *   - geometry features with no data row stay unpainted (normal: 13 in 2024,
 *     414 in the consolidated 2025 special — the CoverageChip explains it)
 */
import type { PrecinctEra, PrecinctRaceFile, PrecinctTurnoutFile } from '@/types/elections'
import { leaderDisplayName, nhoodKey, sharePhrase, yesShareOf } from '@/utils/electionData'
import { leaderOf, marginFill, propFill, resultsFill, turnoutFill, type Fill } from './precinctPaint'

export type PrecinctMapMode = 'results' | 'turnout' | 'margin'

export interface PaintBundle {
  dateCode: string
  era: PrecinctEra
  turnout: PrecinctTurnoutFile
  /** Null → paint turnout instead (mode fallback while a race file loads). */
  race: PrecinctRaceFile | null
}

export interface BuildPrecinctOptions {
  bundle: PaintBundle
  geometry: GeoJSON.FeatureCollection
  mode: PrecinctMapMode
  colorMap: Map<string, string>
  raceIsProp: boolean
  raceIsRCV: boolean
  selectedNeighborhood: string | null
}

const SELECT_LIFT = 0.1
const MAX_OPACITY = 0.8

export function buildPrecinctFeatures(opts: BuildPrecinctOptions): GeoJSON.FeatureCollection {
  const { bundle, geometry, mode, colorMap, raceIsProp, raceIsRCV, selectedNeighborhood } = opts
  const byId = new Map<string, GeoJSON.Feature>()
  for (const f of geometry.features) byId.set(String(f.properties?.id), f)

  const selectedKey = selectedNeighborhood ? nhoodKey(selectedNeighborhood) : null
  const features: GeoJSON.Feature[] = []

  for (const [label, row] of Object.entries(bundle.turnout.precincts)) {
    if (row.unmapped) continue

    const raceRow = bundle.race?.precincts[label] ?? null
    let fill: Fill | null = null
    let tipLeaderName = ''
    let tipLeaderPhrase = ''
    let votes = row.ballots

    if (mode === 'turnout' || !bundle.race) {
      fill = turnoutFill(row.turnout)
    } else if (!raceRow) {
      continue // no votes reported for this race here — unpainted, honest
    } else if (mode === 'margin') {
      const leader = leaderOf(raceRow.votes)
      if (!leader) continue
      fill = marginFill(leader.lead)
      tipLeaderName = leaderDisplayName(leader.name)
      tipLeaderPhrase = sharePhrase(leader.share)
      votes = raceRow.total
    } else if (raceIsProp) {
      const yes = yesShareOf(raceRow.votes)
      if (yes === null) continue
      fill = propFill(yes)
      tipLeaderName = yes >= 0.5 ? 'Yes' : 'No'
      tipLeaderPhrase = sharePhrase(Math.max(yes, 1 - yes))
      votes = raceRow.total
    } else {
      const leader = leaderOf(raceRow.votes)
      if (!leader) continue
      fill = resultsFill(leader, colorMap)
      tipLeaderName = leaderDisplayName(leader.name)
      tipLeaderPhrase = raceIsRCV
        ? sharePhrase(leader.share).replace('votes', 'first choices').replace('every vote', 'every first choice')
        : sharePhrase(leader.share)
      votes = raceRow.total
    }

    for (const id of row.ids) {
      const geoFeature = byId.get(id)
      if (!geoFeature) continue // tolerated only for zero-registration strays (gated in Task 1)
      const nhood = String(geoFeature.properties?.nhood ?? '')
      const selected = selectedKey !== null && nhoodKey(nhood) === selectedKey
      features.push({
        ...geoFeature,
        properties: {
          label,
          nhood,
          selected,
          fillColor: fill.color,
          fillOpacity: selected ? Math.min(MAX_OPACITY, fill.opacity + SELECT_LIFT) : fill.opacity,
          tipLeaderName,
          tipLeaderPhrase,
          turnoutPct: row.turnout,
          votes,
        },
      })
    }
  }

  return { type: 'FeatureCollection', features }
}
