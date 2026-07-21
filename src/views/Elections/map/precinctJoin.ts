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
import type { CoalitionPaintRow } from '@/lib/rcv/coalition'
import type { ReplayPaintRow } from '@/lib/rcv/replay'
import { cleanCandidateName, leaderDisplayName, nhoodKey, sharePhrase, yesShareOf } from '@/utils/electionData'
import {
  coalitionFill,
  focusFill,
  leaderOf,
  leaderShareQuartiles,
  marginFill,
  propFill,
  replayFill,
  resultsFill,
  turnoutFill,
  type Fill,
} from './precinctPaint'

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
  /** Clean candidate name — when set, results mode paints a continuous
   *  single-hue support ramp for this candidate instead of the leader steps. */
  focusCandidate: string | null
  /** REPLAY lens — when set, the fill is lens-driven: painted from these
   *  per-precinct round rows instead of `bundle.race`/`mode`. Preempts
   *  `focusCandidate` — a deep link carrying both paints replay. */
  replay?: {
    rows: Record<string, ReplayPaintRow>
    /** FIXED per race (spec §4.3): computed ONCE from round-1 rows over
     *  painted precincts by the caller and held constant across rounds —
     *  other precincts moving the yardstick would read as phantom motion;
     *  fixed cutpoints make late-round firming a true consolidation signal. */
    quartiles: [number, number, number] | null
    round: number
    totalRounds: number
    lift: boolean
  }
  /** COALITION lens — dominant second choice of the focus candidate's
   *  first-choice voters. Same preemption as replay: lens-driven fill,
   *  ignores `mode`/`focusCandidate`. `rows` is floor-filtered (Task 1) —
   *  absent label ⇒ unpainted (zero-cohort or suppressed). */
  coalition?: {
    rows: Record<string, CoalitionPaintRow>
    /** Race-relative quartiles of dominantShare over PAINTED precincts,
     *  computed once per focus candidate by the caller. */
    quartiles: [number, number, number] | null
    /** Surname for tooltips: "next choice of 34% of Peskin voters here". */
    focusDisplay: string
  }
}

const SELECT_LIFT = 0.1
export const FLIP_LIFT = 0.12
const MAX_OPACITY = 0.8

/** Per-precinct share of one candidate (clean name) across a race file,
 *  plus its [min,max] extent. Vote keys are RAW ("\n(PARTY)") — matched via
 *  cleanCandidateName. Zero-total precincts are skipped. */
export function candidateShares(
  race: PrecinctRaceFile,
  cleanName: string,
): { byLabel: Map<string, number>; extent: [number, number] | null } {
  const byLabel = new Map<string, number>()
  let min = Infinity
  let max = -Infinity
  for (const [label, row] of Object.entries(race.precincts)) {
    if (row.total === 0) continue
    let votes = 0
    for (const [k, v] of Object.entries(row.votes)) {
      if (cleanCandidateName(k) === cleanName) votes += v
    }
    const share = votes / row.total
    byLabel.set(label, share)
    if (share < min) min = share
    if (share > max) max = share
  }
  return { byLabel, extent: byLabel.size > 0 ? [min, max] : null }
}

export function buildPrecinctFeatures(opts: BuildPrecinctOptions): GeoJSON.FeatureCollection {
  const { bundle, geometry, mode, colorMap, raceIsProp, raceIsRCV, selectedNeighborhood, focusCandidate } = opts
  const byId = new Map<string, GeoJSON.Feature>()
  for (const f of geometry.features) byId.set(String(f.properties?.id), f)

  const selectedKey = selectedNeighborhood ? nhoodKey(selectedNeighborhood) : null
  const features: GeoJSON.Feature[] = []

  // Results mode (non-prop) precomputes ONE of two things before the main
  // loop: either the focused candidate's per-precinct share map (focus mode)
  // or the race-relative leader-share quartiles (leader-steps mode). Never
  // both — focus mode doesn't use resultsFill/quartiles at all. Skipped
  // entirely when opts.replay is set — REPLAY preempts fill selection in
  // the main loop below and never reads `focus`/`quartiles` (its quartiles
  // arrive pre-computed in opts.replay.quartiles, fixed per race).
  let quartiles: [number, number, number] | null = null
  let focus: { byLabel: Map<string, number>; extent: [number, number] | null } | null = null
  if (!opts.replay && !opts.coalition && mode === 'results' && bundle.race && !raceIsProp) {
    if (focusCandidate) {
      focus = candidateShares(bundle.race, focusCandidate)
    } else {
      const shares: number[] = []
      for (const [label, row] of Object.entries(bundle.turnout.precincts)) {
        if (row.unmapped) continue
        const raceRow = bundle.race.precincts[label]
        if (!raceRow) continue
        const leader = leaderOf(raceRow.votes)
        if (leader) shares.push(leader.share)
      }
      quartiles = leaderShareQuartiles(shares)
    }
  }

  for (const [label, row] of Object.entries(bundle.turnout.precincts)) {
    if (row.unmapped) continue

    const raceRow = bundle.race?.precincts[label] ?? null
    let fill: Fill | null = null
    let tipLeaderName = ''
    let tipLeaderPhrase = ''
    let votes = row.ballots

    if (opts.replay) {
      const replayRow = opts.replay.rows[label]
      if (!replayRow || replayRow.total === 0) continue
      const leader = leaderOf(replayRow.votes)
      if (!leader) continue
      fill = replayFill(leader, colorMap, opts.replay.quartiles, replayRow.drainShare)
      if (replayRow.flipped && opts.replay.lift) {
        fill = { ...fill, opacity: Math.min(MAX_OPACITY, fill.opacity + FLIP_LIFT) }
      }
      tipLeaderName = leaderDisplayName(leader.name)
      tipLeaderPhrase = `${Math.round(leader.share * 100)}% of ballots still counting here`
      // votes stays row.ballots — the tooltip template renders «votes» as
      // "votes cast", so it must carry the turnout row's ballots-cast, not
      // the round's continuing total (the leader phrase above is the
      // "still counting" carrier).
    } else if (opts.coalition) {
      const cRow = opts.coalition.rows[label]
      if (!cRow) continue // zero-cohort or floor-suppressed — unpainted, disclosed in the legend
      fill = coalitionFill(cRow, colorMap, opts.coalition.quartiles)
      const pct = Math.round(cRow.dominantShare * 100)
      if (cRow.dominant) {
        tipLeaderName = leaderDisplayName(cRow.dominant)
        tipLeaderPhrase = `next choice of ${pct}% of ${opts.coalition.focusDisplay} voters here`
      } else {
        tipLeaderName = 'No next choice'
        tipLeaderPhrase = `${pct}% of ${opts.coalition.focusDisplay} voters had no next choice here`
      }
      // votes stays row.ballots (same rule as replay: the tooltip template
      // renders «votes» as "votes cast").
    } else if (mode === 'turnout' || !bundle.race) {
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
    } else if (focusCandidate && focus) {
      const share = focus.byLabel.get(label)
      if (share === undefined) continue
      fill = focusFill(share, focus.extent!, colorMap.get(focusCandidate) ?? '#a8926a')
      tipLeaderName = leaderDisplayName(focusCandidate)
      tipLeaderPhrase = raceIsRCV
        ? sharePhrase(share).replace('votes', 'first choices').replace('every vote', 'every first choice')
        : sharePhrase(share)
      votes = raceRow.total
    } else {
      const leader = leaderOf(raceRow.votes)
      if (!leader) continue
      fill = resultsFill(leader, colorMap, quartiles)
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
