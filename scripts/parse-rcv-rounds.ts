/**
 * parse-rcv-rounds.ts
 *
 * Parses SF Elections RCV round-by-round HTML tables into structured JSON.
 * Source: sfelections.org/results/YYYYMMDD/final/round-pages/*_short-rounds-en.html
 *
 * HTML structure:
 * - table.ResultsTable
 * - Row 0: TH headers with "Round N" (colspan=3 each)
 * - Row 1: Subheaders (Votes, %, Transfer) repeated per round
 * - Rows 2..N: Candidate rows (class CandidateRow | AlternateCandidateRow)
 *   - Cell 0: td.CandidateCell = candidate name
 *   - Then 3 cells per round: Votes, %, Transfer
 *   - CSS classes encode state:
 *     - LeaderVotesCell / LeaderPercentageCell / LeaderVotesTransferredCell = round leader
 *     - EliminatedVotesCell / EliminatedPercentageCell / EliminatedVotesTransferredCell = eliminated this round
 *     - Empty cells after elimination round
 * - Summary rows (class NonCandidateRow):
 *   - "Continuing Ballots Total", "Blanks (Undervotes)", "Exhausted", "Overvotes", "Non Transferable Total"
 */

import { parse as parseHTML, type HTMLElement } from 'node-html-parser'
import type { RCVContest, RCVRound, RCVCandidateRound } from '../src/types/elections.js'

/** Parse a vote count string like "102,720" or "-1,385" */
function parseVotes(text: string): number {
  const cleaned = text.replace(/,/g, '').trim()
  if (!cleaned || cleaned === '') return 0
  return parseInt(cleaned, 10) || 0
}

/** Parse a percentage string like "26.33%" → 0.2633, rounded to avoid float artifacts */
function parsePct(text: string): number {
  const cleaned = text.replace('%', '').trim()
  if (!cleaned || cleaned === '') return 0
  const raw = parseFloat(cleaned) / 100
  return Math.round(raw * 10000) / 10000 || 0
}

export function parseRCVRounds(html: string, raceId: string, raceTitle: string): RCVContest {
  const root = parseHTML(html)
  const table = root.querySelector('table.ResultsTable') ?? root.querySelector('table')

  if (!table) {
    throw new Error(`No table found in RCV HTML for ${raceId}`)
  }

  const rows = table.querySelectorAll('tr')
  if (rows.length < 3) {
    throw new Error(`RCV table has too few rows (${rows.length}) for ${raceId}`)
  }

  // ── Count rounds from header row ────────────────────────────────
  const headerCells = rows[0].querySelectorAll('th')
  // First TH is empty (candidate name column), rest are round headers
  const totalRounds = headerCells.length - 1

  // ── Parse candidate rows and summary rows ───────────────────────
  const candidateNames: string[] = []
  const candidateData: Map<string, { votes: number; pct: number; transfer: number; isEliminated: boolean; isLeader: boolean }[]> = new Map()
  const summaryData: Map<string, number[]> = new Map()

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i]
    const rowClass = row.getAttribute('class') || ''
    const cells = row.querySelectorAll('td')
    if (cells.length === 0) continue

    const name = cells[0].textContent.trim()
    if (!name) continue

    const isSummary = rowClass.includes('NonCandidateRow')
    const isCandidate = !isSummary && (rowClass.includes('CandidateRow') || rowClass.includes('AlternateCandidateRow'))

    if (isCandidate) {
      candidateNames.push(name)
      const rounds: { votes: number; pct: number; transfer: number; isEliminated: boolean; isLeader: boolean }[] = []

      // Walk through cells after the candidate name cell.
      // Each round normally has 3 cells (Votes, %, Transfer), but
      // the winner's final round has only 2 (WinnerVotesCell, WinnerPercentageCell).
      let cellIdx = 1
      for (let r = 0; r < totalRounds; r++) {
        if (cellIdx >= cells.length) {
          rounds.push({ votes: 0, pct: 0, transfer: 0, isEliminated: false, isLeader: false })
          continue
        }

        const votesCell = cells[cellIdx]
        const votesClass = votesCell.getAttribute('class') || ''
        const isEliminated = votesClass.includes('Eliminated')
        const isLeader = votesClass.includes('Leader') || votesClass.includes('Winner')
        const isWinner = votesClass.includes('Winner')

        const votesText = votesCell.textContent.trim()

        // Empty cells mean candidate was already eliminated in a previous round
        if (!votesText && !isEliminated && !isWinner) {
          // Still consume the 3 cells (they exist but are empty)
          cellIdx += 3
          rounds.push({ votes: 0, pct: 0, transfer: 0, isEliminated: false, isLeader: false })
          continue
        }

        const pctCell = cellIdx + 1 < cells.length ? cells[cellIdx + 1] : null
        const pctText = pctCell?.textContent.trim() ?? ''

        // Winner's final round only has 2 cells (no transfer)
        const hasTransfer = cellIdx + 2 < cells.length &&
          !(cells[cellIdx + 2].getAttribute('class') || '').includes('CandidateCell') &&
          !isWinner
        const transferText = hasTransfer ? cells[cellIdx + 2].textContent.trim() : ''

        rounds.push({
          votes: parseVotes(votesText),
          pct: parsePct(pctText),
          transfer: parseVotes(transferText),
          isEliminated,
          isLeader,
        })

        cellIdx += isWinner ? 2 : 3
      }

      candidateData.set(name, rounds)
    } else if (isSummary) {
      const values: number[] = []
      for (let r = 0; r < totalRounds; r++) {
        const baseIdx = 1 + r * 3
        if (baseIdx >= cells.length) {
          values.push(0)
          continue
        }
        values.push(parseVotes(cells[baseIdx].textContent.trim()))
      }
      summaryData.set(name, values)
    }
  }

  // ── Build rounds array ──────────────────────────────────────────
  const rounds: RCVRound[] = []

  for (let r = 0; r < totalRounds; r++) {
    const candidates: RCVCandidateRound[] = []

    for (const name of candidateNames) {
      const data = candidateData.get(name)!
      const roundData = data[r]
      candidates.push({
        name,
        votes: roundData.votes,
        percentage: roundData.pct,
        transfer: roundData.transfer,
        isEliminated: roundData.isEliminated,
        isLeader: roundData.isLeader,
      })
    }

    const continuingValues = summaryData.get('Continuing Ballots Total')
    const exhaustedValues = summaryData.get('Exhausted')
    const overvoteValues = summaryData.get('Overvotes')
    const blankValues = summaryData.get('Blanks (Undervotes)')

    rounds.push({
      round: r + 1,
      candidates,
      continuingTotal: continuingValues?.[r] ?? 0,
      exhausted: exhaustedValues?.[r] ?? 0,
      overvotes: overvoteValues?.[r] ?? 0,
      blanks: blankValues?.[r] ?? 0,
    })
  }

  // ── Determine winner ────────────────────────────────────────────
  // Find candidate with most votes in the final round (excluding summary rows)
  const finalRound = rounds[rounds.length - 1]
  const winner = finalRound.candidates
    .filter((c) => c.votes > 0 && candidateNames.includes(c.name))
    .sort((a, b) => b.votes - a.votes)[0]?.name ?? ''

  return {
    raceId,
    title: raceTitle,
    totalRounds,
    rounds,
    winner,
  }
}
