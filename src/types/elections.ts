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
