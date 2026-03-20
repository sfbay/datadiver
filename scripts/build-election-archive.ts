/**
 * build-election-archive.ts
 *
 * Downloads and processes SF election data into static JSON files.
 * Run: npx tsx scripts/build-election-archive.ts
 *
 * Sources:
 * - XML summaries: sfelections.org/results/YYYYMMDD/data/summary.xml
 * - RCV rounds: sfelections.org/results/YYYYMMDD/final/round-pages/*_short-rounds-en.html
 * - Historical turnout: sfelections.org/tools/election_data/datasets/HistoricalVoterTurnout_SF.txt
 * - Historical propositions: sfelections.org/tools/election_data/datasets/HistoricalBallotPropositions_20260115.txt
 *
 * Output structure:
 * public/elections/
 *   index.json                   — election manifest
 *   results/YYYYMMDD/
 *     summary.json               — race results + registration
 *     rcv/<race-id>.json         — RCV round-by-round data
 *   turnout/historical.json      — turnout back to 1899
 *   propositions/index.json      — all ballot propositions
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { parseElectionXML, contestSlug } from './parse-election-xml.js'
import { parseRCVRounds } from './parse-rcv-rounds.js'
import type { ElectionManifest, ElectionMeta, TurnoutRecord, BallotProposition } from '../src/types/elections.js'

// ── Configuration ───────────────────────────────────────────────────

const BASE_URL = 'https://sfelections.org'
const OUT_DIR = join(import.meta.dirname, '..', 'public', 'data', 'elections')

const ELECTIONS = [
  {
    dateCode: '20241105',
    date: '2024-11-05',
    type: 'general' as const,
    label: 'November 5, 2024 General Election',
  },
  {
    dateCode: '20240305',
    date: '2024-03-05',
    type: 'primary' as const,
    label: 'March 5, 2024 Primary Election',
  },
  {
    dateCode: '20221108',
    date: '2022-11-08',
    type: 'general' as const,
    label: 'November 8, 2022 General Election',
  },
  {
    dateCode: '20220607',
    date: '2022-06-07',
    type: 'primary' as const,
    label: 'June 7, 2022 Primary Election',
  },
  {
    dateCode: '20201103',
    date: '2020-11-03',
    type: 'general' as const,
    label: 'November 3, 2020 General Election',
  },
]

// Known RCV race slugs to try for each election
const RCV_RACE_SLUGS = [
  { slug: 'mayor', title: 'MAYOR' },
  { slug: 'da', title: 'DISTRICT ATTORNEY' },
  { slug: 'ca', title: 'CITY ATTORNEY' },
  { slug: 'sheriff', title: 'SHERIFF' },
  { slug: 'treasurer', title: 'TREASURER' },
  { slug: 'assessor', title: 'ASSESSOR-RECORDER' },
  { slug: 'publicdefender', title: 'PUBLIC DEFENDER' },
  { slug: 'd1', title: 'BOARD OF SUPERVISORS, DISTRICT 1' },
  { slug: 'd3', title: 'BOARD OF SUPERVISORS, DISTRICT 3' },
  { slug: 'd5', title: 'BOARD OF SUPERVISORS, DISTRICT 5' },
  { slug: 'd7', title: 'BOARD OF SUPERVISORS, DISTRICT 7' },
  { slug: 'd9', title: 'BOARD OF SUPERVISORS, DISTRICT 9' },
  { slug: 'd11', title: 'BOARD OF SUPERVISORS, DISTRICT 11' },
  { slug: 'd2', title: 'BOARD OF SUPERVISORS, DISTRICT 2' },
  { slug: 'd4', title: 'BOARD OF SUPERVISORS, DISTRICT 4' },
  { slug: 'd6', title: 'BOARD OF SUPERVISORS, DISTRICT 6' },
  { slug: 'd8', title: 'BOARD OF SUPERVISORS, DISTRICT 8' },
  { slug: 'd10', title: 'BOARD OF SUPERVISORS, DISTRICT 10' },
]

// ── Helpers ─────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string | null> {
  try {
    console.log(`  Fetching: ${url}`)
    const res = await fetch(url)
    if (!res.ok) {
      console.log(`  → ${res.status} ${res.statusText}`)
      return null
    }
    return await res.text()
  } catch (err) {
    console.log(`  → Error: ${(err as Error).message}`)
    return null
  }
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function writeJSON(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, null, 2))
  console.log(`  ✓ Wrote ${path}`)
}

// ── Process a single election ───────────────────────────────────────

async function processElection(election: (typeof ELECTIONS)[number]): Promise<ElectionMeta | null> {
  console.log(`\n━━ ${election.label} ━━`)

  const resultDir = join(OUT_DIR, 'results', election.dateCode)
  const rcvDir = join(resultDir, 'rcv')
  ensureDir(resultDir)
  ensureDir(rcvDir)

  // ── 1. Fetch + parse XML summary ──────────────────────────────
  const xmlUrl = `${BASE_URL}/results/${election.dateCode}/data/summary.xml`
  const xml = await fetchText(xmlUrl)

  if (!xml) {
    console.log(`  ✗ No XML summary found — skipping election`)
    return null
  }

  const results = parseElectionXML(xml, {
    electionDate: election.date,
    electionType: election.type,
    electionLabel: election.label,
  })

  writeJSON(join(resultDir, 'summary.json'), results)
  console.log(`  → ${results.races.length} races, ${results.registration.totalBallotsCast.toLocaleString()} ballots`)

  // ── 2. Fetch + parse RCV rounds ───────────────────────────────
  let rcvCount = 0
  for (const rcvRace of RCV_RACE_SLUGS) {
    const rcvUrl = `${BASE_URL}/results/${election.dateCode}/final/round-pages/${rcvRace.slug}_short-rounds-en.html`
    const html = await fetchText(rcvUrl)
    if (!html) continue

    try {
      // Find matching race in parsed results to get proper title
      const matchingRace = results.races.find(
        (r) => r.id === contestSlug(rcvRace.title) || r.title.toUpperCase().includes(rcvRace.title.split(',')[0]),
      )
      const raceTitle = matchingRace?.title ?? rcvRace.title
      const raceId = matchingRace?.id ?? contestSlug(rcvRace.title)

      const rcvData = parseRCVRounds(html, raceId, raceTitle)
      writeJSON(join(rcvDir, `${rcvRace.slug}.json`), rcvData)
      rcvCount++
      console.log(`  → RCV ${rcvRace.slug}: ${rcvData.totalRounds} rounds, winner: ${rcvData.winner}`)

      // Fix isWinner: for RCV races, the XML's first-choice plurality leader
      // may not be the final RCV winner. Cross-reference with round data.
      if (rcvData.winner && matchingRace) {
        const race = results.races.find((r) => r.id === raceId)
        if (race) {
          const rcvWinnerName = rcvData.winner.toUpperCase()
          race.candidates.forEach((c) => {
            c.isWinner = c.name.toUpperCase() === rcvWinnerName
          })
        }
      }
    } catch (err) {
      console.log(`  ✗ RCV parse error for ${rcvRace.slug}: ${(err as Error).message}`)
    }
  }
  console.log(`  → ${rcvCount} RCV contests processed`)

  // Re-write summary.json with corrected RCV winners
  if (rcvCount > 0) {
    writeJSON(join(resultDir, 'summary.json'), results)
    console.log(`  → Re-wrote summary.json with RCV-corrected winners`)
  }

  return results.election
}

// ── Process historical turnout ──────────────────────────────────────

async function processHistoricalTurnout() {
  console.log('\n━━ Historical Voter Turnout ━━')

  const url = `${BASE_URL}/tools/election_data/datasets/HistoricalVoterTurnout_SF.txt`
  const text = await fetchText(url)
  if (!text) {
    console.log('  ✗ No turnout data found')
    return
  }

  const lines = text.trim().split('\n')
  const records: TurnoutRecord[] = []

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    if (cols.length < 4) continue

    // Numbers may be quoted: "500,856" — strip quotes and commas
    const clean = (s: string) => s.replace(/[",]/g, '').trim()
    const dateStr = cols[0].trim()
    const registered = parseInt(clean(cols[1]), 10) || 0
    const ballotsCast = parseInt(clean(cols[2]), 10) || 0
    const turnoutPctStr = cols[3].replace(/["%]/g, '').trim()
    const turnoutPct = parseFloat(turnoutPctStr) / 100 || 0

    // Parse date like "3/5/2024" → "2024-03-05"
    const parts = dateStr.split('/')
    if (parts.length === 3) {
      const month = parts[0].padStart(2, '0')
      const day = parts[1].padStart(2, '0')
      const year = parts[2]
      const isoDate = `${year}-${month}-${day}`

      // Determine election type from month
      const monthNum = parseInt(parts[0], 10)
      const type =
        monthNum === 11
          ? 'General'
          : monthNum === 6 || monthNum === 3
            ? 'Primary'
            : 'Special'

      records.push({
        date: isoDate,
        type,
        registered,
        ballotsCast,
        turnoutPct,
      })
    }
  }

  ensureDir(join(OUT_DIR, 'turnout'))
  writeJSON(join(OUT_DIR, 'turnout', 'historical.json'), records)
  console.log(`  → ${records.length} elections from ${records[records.length - 1]?.date} to ${records[0]?.date}`)
}

// ── Process ballot propositions ─────────────────────────────────────

async function processBallotPropositions() {
  console.log('\n━━ Historical Ballot Propositions ━━')

  const url = `${BASE_URL}/tools/election_data/datasets/HistoricalBallotPropositions_20260115.txt`
  const text = await fetchText(url)
  if (!text) {
    console.log('  ✗ No proposition data found')
    return
  }

  const lines = text.trim().split('\n')
  const propositions: BallotProposition[] = []

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    if (cols.length < 8) continue

    const month = cols[0].trim()
    const year = cols[1].trim()
    const letter = cols[2].trim()
    const title = cols[3].replace(/^"|"$/g, '').trim()
    const yesVotes = parseInt(cols[4].replace(/[", ]/g, ''), 10) || 0
    const noVotes = parseInt(cols[5].replace(/[", ]/g, ''), 10) || 0
    const passFail = cols[6].trim()
    const pctStr = cols[7].replace('%', '').trim()
    const yesPct = parseFloat(pctStr) / 100 || 0

    // Convert month name to number
    const monthMap: Record<string, string> = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    }
    const monthNum = monthMap[month.toUpperCase()] ?? '01'

    propositions.push({
      date: `${year}-${monthNum}-01`,
      letter,
      title,
      yesVotes,
      noVotes,
      yesPct,
      passed: passFail === 'P',
    })
  }

  ensureDir(join(OUT_DIR, 'propositions'))
  writeJSON(join(OUT_DIR, 'propositions', 'index.json'), propositions)
  console.log(`  → ${propositions.length} propositions from ${propositions[0]?.date} to ${propositions[propositions.length - 1]?.date}`)
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║  SF Elections — Build Archive             ║')
  console.log('╚══════════════════════════════════════════╝')

  ensureDir(OUT_DIR)

  // Process each election
  const electionMetas: ElectionMeta[] = []
  for (const election of ELECTIONS) {
    const meta = await processElection(election)
    if (meta) electionMetas.push(meta)

    // Respectful delay between elections
    await new Promise((r) => setTimeout(r, 1000))
  }

  // Build manifest
  const manifest: ElectionManifest = {
    generated: new Date().toISOString(),
    elections: electionMetas,
  }
  writeJSON(join(OUT_DIR, 'index.json'), manifest)

  // Process historical data
  await processHistoricalTurnout()
  await processBallotPropositions()

  console.log('\n━━ Summary ━━')
  console.log(`  ${electionMetas.length} elections processed`)
  console.log(`  Output: ${OUT_DIR}`)
  console.log('  Done!')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
