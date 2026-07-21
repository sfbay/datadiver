// ── Election Manifest (index.json) ──────────────────────────────────

export interface ElectionManifest {
  generated: string
  elections: ElectionMeta[]
}

export interface ElectionMeta {
  date: string // "2024-11-05"
  dateCode: string // "20241105"
  type: 'general' | 'primary' | 'special' | 'runoff'
  label: string // "November 5, 2024 General Election"
  races: RaceMeta[]
  hasRCV: boolean
}

export interface RaceMeta {
  id: string // slug: "president", "mayor", "d1", "prop-a"
  title: string // "PRESIDENT AND VICE PRESIDENT"
  type: 'federal' | 'state' | 'local' | 'measure'
  isRCV: boolean
}

// ── Election Results (summary.json) ─────────────────────────────────

export interface ElectionResults {
  election: ElectionMeta
  registration: RegistrationData
  races: Race[]
}

export interface RegistrationData {
  totalRegistered: number
  totalBallotsCast: number
  turnoutPct: number
  electionDayBallots: number
  vbmBallots: number
}

export interface Race {
  id: string
  title: string
  type: 'federal' | 'state' | 'local' | 'measure'
  isRCV: boolean
  totalBallotsCast: number
  candidates: Candidate[]
}

export interface Candidate {
  name: string
  totalVotes: number
  electionDayVotes: number
  vbmVotes: number
  percentage: number
  isWinner: boolean
}

// ── RCV Round Data (rcv/*.json) ─────────────────────────────────────

export interface RCVContest {
  raceId: string
  title: string
  totalRounds: number
  rounds: RCVRound[]
  winner: string
}

export interface RCVRound {
  round: number
  candidates: RCVCandidateRound[]
  continuingTotal: number
  exhausted: number
  overvotes: number
  blanks: number
}

export interface RCVCandidateRound {
  name: string
  votes: number
  percentage: number
  transfer: number
  isEliminated: boolean // eliminated IN this round
  isLeader: boolean
}

// ── CVR Ballot Artifacts ────────────────────────────────────────────

export const OVERVOTE_TERMINATOR = -1

export interface CVRBallotArtifact {
  formatVersion: 1
  dateCode: string
  raceId: string
  /** Certified round-report names VERBATIM, in the committed round file's
   *  round-1 row order (descending R1 votes). Pattern values index here.
   *  Already clean — cleanCandidateName is a no-op; buildCandidateColorMap
   *  keys match. */
  candidates: string[]
  /** Emitted-geometry id strings ("1101"), sorted ascending. Includes the
   *  SOV-withheld precincts — their ballots are in the public CVR. */
  precincts: string[]
  /** Subset of precincts with no _turnout/SOV row (13 for 20241105).
   *  Derived from data, never hardcoded. */
  sovSuppressed: string[]
  title: string
  /** Canonical effective rankings: candidate indices; a trailing
   *  OVERVOTE_TERMINATOR means exhaust-by-overvote at that point; [] = blank
   *  contest. Sorted by citywide count desc, then lexicographic (common
   *  patterns get short indices; deterministic for --check). */
  patterns: number[][]
  /** Flat (precinctIdx, patternIdx, count) triples, sorted by
   *  (precinctIdx, patternIdx). Client wraps in typed arrays. */
  groups: number[]
}

export interface CVRManifest {
  dateCode: string
  formatVersion: 1
  races: Record<string, { ballots: number; patterns: number; groups: number; bytes: number }>
  /** isRCV races with CVR ballots but no certified round report to gate
   *  against — mirrors KNOWN_MISSING_RCV. ["treasurer"] today. */
  reconciliationBlocked: string[]
}

// ── Historical Turnout ──────────────────────────────────────────────

export interface TurnoutRecord {
  date: string
  type: string
  registered: number
  ballotsCast: number
  turnoutPct: number
}

// ── Ballot Propositions ─────────────────────────────────────────────

export interface BallotProposition {
  date: string
  letter: string
  title: string
  yesVotes: number
  noVotes: number
  yesPct: number
  passed: boolean
}

// ── Precinct + neighborhood results (public/data/elections/results/<dateCode>/) ──
// Shapes verified against the emitted files 2026-07-14 — see the UI plan's
// "Verified data facts". Do not re-derive from the spec sketches.

export type PrecinctEra = 'prec_2012' | 'prec_2022'

export interface PrecinctTurnoutRow {
  /** Geometry feature ids this row paints. Consolidated labels ("1104/1105")
   *  carry several. Unmapped rows KEEP their id — skip by the flag. */
  ids: string[]
  registered: number
  ballots: number
  turnout: number
  /** True for the 12 pinned 2012-era precincts with no published geometry. */
  unmapped?: boolean
}

export interface PrecinctTurnoutFile {
  dateCode: string
  era: PrecinctEra
  precincts: Record<string, PrecinctTurnoutRow>
  /** Voters in dsov but withheld from the precinct SOV for ballot secrecy. */
  suppressed: { registered: number; ballots: number }
  /** Summary of unmapped rows. NOTE: no `precincts`/`ballots` fields exist —
   *  derive the count from ids.length. */
  unmapped: { ids: string[]; registered: number }
}

export interface PrecinctRaceFile {
  dateCode: string
  raceId: string
  title: string
  era: PrecinctEra
  /** Keyed by the same labels as _turnout. Vote keys may carry "\n(PARTY)". */
  precincts: Record<string, { votes: Record<string, number>; total: number }>
}

export interface NeighborhoodRow {
  registered: number
  ballots: number
  turnout: number
  races: Record<string, { votes: Record<string, number>; total: number }>
}

export interface NeighborhoodResultsFile {
  dateCode: string
  scheme: 'analysis41' | 'legacy26'
  /** Keyed by UPPERCASE dsov names ("CASTRO/UPPER MARKET"). */
  neighborhoods: Record<string, NeighborhoodRow>
}
