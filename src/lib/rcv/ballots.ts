// Relative import (not `@/`): scripts/build-cvr-ballots.ts imports this module
// under `npx tsx`, which resolves no tsconfig path aliases (alerts-lib precedent).
import { OVERVOTE_TERMINATOR, type CVRBallotArtifact } from '../../types/elections'

export interface DecodedBallots {
  candidateCount: number
  precinctCount: number
  patternCount: number
  patternFlat: Int16Array
  patternStart: Int32Array
  groupPrecinct: Int32Array
  groupPattern: Int32Array
  groupCount: Int32Array
  patternTotal: Int32Array
  totalBallots: number
}

export function decodeBallots(artifact: CVRBallotArtifact): DecodedBallots {
  if (artifact.formatVersion !== 1) {
    throw new Error(`Unsupported CVR artifact formatVersion ${artifact.formatVersion}`)
  }
  const patternCount = artifact.patterns.length
  let flatLen = 0
  for (const p of artifact.patterns) flatLen += p.length
  const patternFlat = new Int16Array(flatLen)
  const patternStart = new Int32Array(patternCount + 1)
  let off = 0
  for (let i = 0; i < patternCount; i++) {
    patternStart[i] = off
    for (const v of artifact.patterns[i]) {
      if (v !== OVERVOTE_TERMINATOR && (v < 0 || v >= artifact.candidates.length)) {
        throw new Error(`CVR artifact pattern ${i}: candidate index ${v} out of range`)
      }
      patternFlat[off++] = v
    }
  }
  patternStart[patternCount] = off
  if (artifact.groups.length % 3 !== 0) throw new Error('CVR artifact groups length not divisible by 3')
  const nGroups = artifact.groups.length / 3
  const groupPrecinct = new Int32Array(nGroups)
  const groupPattern = new Int32Array(nGroups)
  const groupCount = new Int32Array(nGroups)
  const patternTotal = new Int32Array(patternCount)
  let totalBallots = 0
  for (let g = 0; g < nGroups; g++) {
    const pr = artifact.groups[g * 3]
    const pat = artifact.groups[g * 3 + 1]
    const c = artifact.groups[g * 3 + 2]
    if (pr < 0 || pr >= artifact.precincts.length) throw new Error(`group ${g}: precinct index ${pr} out of range`)
    if (pat < 0 || pat >= patternCount) throw new Error(`group ${g}: pattern index ${pat} out of range`)
    groupPrecinct[g] = pr
    groupPattern[g] = pat
    groupCount[g] = c
    patternTotal[pat] += c
    totalBallots += c
  }
  return { candidateCount: artifact.candidates.length, precinctCount: artifact.precincts.length, patternCount, patternFlat, patternStart, groupPrecinct, groupPattern, groupCount, patternTotal, totalBallots }
}
