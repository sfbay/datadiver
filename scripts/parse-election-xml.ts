/**
 * parse-election-xml.ts
 *
 * Parses SF Elections SSRS XML summary reports into standardized JSON.
 * Source: sfelections.org/results/YYYYMMDD/data/summary.xml
 *
 * The XML uses SSRS auto-generated field names (vot7, Textbox13, etc.).
 * This parser maps them to human-readable structures.
 */

import { XMLParser } from 'fast-xml-parser'
import type {
  ElectionResults,
  ElectionMeta,
  RegistrationData,
  Race,
  Candidate,
  RaceMeta,
} from '../src/types/elections.js'

// ── XML field mapping ───────────────────────────────────────────────
// SSRS XML attribute names → semantic meanings:
//
// Registration section (electorGroupId2):
//   Textbox32  → registered voters
//   ballots3   → ballots cast
//   Textbox6   → turnout fraction (0-1)
//   Details1.countingGroup1 → "Election Day" | "Vote by Mail"
//   Details1.Textbox171     → ballots per counting group
//
// Contest section (ContestIdGroup):
//   contestId  → race name (e.g., "PRESIDENT AND VICE PRESIDENT")
//
// Candidate section (candidateNameTextBox4):
//   candidateNameTextBox4 → candidate name (attr = element name!)
//   cgGroup.countingGroupName → "Election Day" | "Vote by Mail"
//   cgGroup.vot7              → votes per counting group
//   Textbox13.vot8            → total votes
//   Textbox13.Textbox17       → percentage (0-1)
//
// Totals section (Textbox5):
//   cgGroup.votesDivider_cg   → total votes per counting group
//   Textbox13.votes3          → grand total votes

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => {
    // Force arrays for collection elements that may have 1 item
    return [
      'chGroup',
      'cgGroup',
      'Details1',
      'ContestIdGroup',
      'TabBatchGroup',
      'electorGroupId2',
    ].includes(name)
  },
})

/** Ensure value is always an array */
function asArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return []
  return Array.isArray(val) ? val : [val]
}

/** Parse a numeric string, stripping commas */
function num(val: string | number | undefined): number {
  if (val === undefined || val === null) return 0
  if (typeof val === 'number') return val
  return parseFloat(val.replace(/,/g, '')) || 0
}

/** Convert contest title to a URL-friendly slug */
export function contestSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** Classify a race by its title */
function classifyRace(title: string): RaceMeta['type'] {
  const t = title.toUpperCase()
  if (t.includes('PRESIDENT') || t.includes('UNITED STATES')) return 'federal'
  if (t.includes('STATE') || t.includes('GOVERNOR') || t.includes('ASSEMBLY')) return 'state'
  if (t.startsWith('PROP') || t.startsWith('MEASURE') || /^[A-Z]\s*[-–]/.test(t)) return 'measure'
  return 'local'
}

/** Known RCV race patterns in SF */
const RCV_PATTERNS = [
  'MAYOR',
  'DISTRICT ATTORNEY',
  'CITY ATTORNEY',
  'SHERIFF',
  'TREASURER',
  'ASSESSOR',
  'PUBLIC DEFENDER',
  /BOARD OF SUPERVISORS/i,
  /SUPERVISOR.*DISTRICT/i,
]

function isRCVRace(title: string): boolean {
  const t = title.toUpperCase()
  return RCV_PATTERNS.some((p) =>
    typeof p === 'string' ? t.includes(p) : p.test(t),
  )
}

export interface ParseXMLOptions {
  electionDate: string // "2024-11-05"
  electionType: ElectionMeta['type']
  electionLabel: string
}

export function parseElectionXML(
  xmlString: string,
  opts: ParseXMLOptions,
): ElectionResults {
  const doc = parser.parse(xmlString)
  const report = doc.Report

  // ── Registration & Turnout ──────────────────────────────────────
  const regReport =
    report.RegistrationAndTurnout?.Report ??
    report['RegistrationAndTurnout']?.['Report']
  const tablix = regReport?.Tablix10
  const electorGroups = asArray(
    tablix?.electorGroupId2_Collection?.electorGroupId2,
  )
  // Find the "Total" group
  const totalGroup =
    electorGroups.find(
      (g: Record<string, unknown>) => g['@_electorGroupId2'] === 'Total',
    ) ?? electorGroups[0]

  const details = asArray(totalGroup?.Details1_Collection?.Details1)
  const edDetail = details.find(
    (d: Record<string, unknown>) => d['@_countingGroup1'] === 'Election Day',
  )
  const vbmDetail = details.find(
    (d: Record<string, unknown>) => d['@_countingGroup1'] === 'Vote by Mail',
  )

  const registration: RegistrationData = {
    totalRegistered: num(totalGroup?.['@_Textbox32']),
    totalBallotsCast: num(totalGroup?.['@_ballots3']),
    turnoutPct: num(totalGroup?.['@_Textbox6']),
    electionDayBallots: num(edDetail?.['@_Textbox171']),
    vbmBallots: num(vbmDetail?.['@_Textbox171']),
  }

  // ── Contest Results ─────────────────────────────────────────────
  // Path: Report > tabBatchIdList > TabBatchGroup_Collection > TabBatchGroup[0]
  //   > ElectionSummarySubReport > Report > contestList
  //   > ContestIdGroup_Collection > ContestIdGroup[]
  const batchGroups = asArray(
    report.tabBatchIdList?.TabBatchGroup_Collection?.TabBatchGroup,
  )
  const subReport = batchGroups[0]?.ElectionSummarySubReport?.Report
  const contestGroups = asArray(
    subReport?.contestList?.ContestIdGroup_Collection?.ContestIdGroup,
  )

  const races: Race[] = []

  for (const contest of contestGroups) {
    const title = contest['@_contestId'] as string
    if (!title) continue

    const candidateReport = contest.CandidateResults?.Report
    const tablix1 = candidateReport?.Tablix1
    const chGroups = asArray(tablix1?.chGroup_Collection?.chGroup)

    // Parse candidates
    const candidates: Candidate[] = []
    for (const ch of chGroups) {
      const nameNode = ch.candidateNameTextBox4
      if (!nameNode) continue

      const name = nameNode['@_candidateNameTextBox4'] as string
      const cgGroups = asArray(nameNode.cgGroup_Collection?.cgGroup)

      const edGroup = cgGroups.find(
        (g: Record<string, unknown>) =>
          g['@_countingGroupName'] === 'Election Day',
      )
      const vbmGroup = cgGroups.find(
        (g: Record<string, unknown>) =>
          g['@_countingGroupName'] === 'Vote by Mail',
      )

      const totals = nameNode.Textbox13
      candidates.push({
        name,
        totalVotes: num(totals?.['@_vot8']),
        electionDayVotes: num(edGroup?.['@_vot7']),
        vbmVotes: num(vbmGroup?.['@_vot7']),
        percentage: num(totals?.['@_Textbox17']),
        isWinner: false, // set below
      })
    }

    // Sort by total votes descending, mark winner
    candidates.sort((a, b) => b.totalVotes - a.totalVotes)
    if (candidates.length > 0) {
      candidates[0].isWinner = true
    }

    // Get total ballots for this race
    const totalsNode = tablix1?.Textbox5
    const totalVotes = num(totalsNode?.Textbox13?.['@_votes3'])

    const raceType = classifyRace(title)
    const isRCV = isRCVRace(title)
    const id = contestSlug(title)

    races.push({
      id,
      title,
      type: raceType,
      isRCV,
      totalBallotsCast: totalVotes,
      candidates,
    })
  }

  // ── Build metadata ──────────────────────────────────────────────
  const dateCode = opts.electionDate.replace(/-/g, '')
  const raceMetas: RaceMeta[] = races.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    isRCV: r.isRCV,
  }))

  const election: ElectionMeta = {
    date: opts.electionDate,
    dateCode,
    type: opts.electionType,
    label: opts.electionLabel,
    races: raceMetas,
    hasRCV: races.some((r) => r.isRCV),
  }

  return { election, registration, races }
}
