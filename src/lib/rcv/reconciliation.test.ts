/**
 * Standing reconciliation: every committed CVR ballot artifact, tabulated
 * from scratch, must reproduce SF's certified round report byte-for-value.
 * If this fails, either an artifact was regenerated incorrectly (rerun
 * scripts/build-cvr-ballots.ts and inspect its gates) or tabulate's
 * semantics drifted — never "fix" it by editing the certified rcv/ files.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RECONCILIATION_BLOCKED, TIE_ORDER_PINS } from '../../../scripts/build-cvr-ballots'
import type { CVRBallotArtifact, CVRManifest, RCVContest } from '@/types/elections'
import { decodeBallots } from './ballots'
import { tabulate } from './tabulate'

const DATE_CODE = '20241105'
const base = join(process.cwd(), 'public/data/elections/results', DATE_CODE)
const manifest = JSON.parse(readFileSync(join(base, 'cvr/_manifest.json'), 'utf8')) as CVRManifest

describe(`CVR artifacts reproduce the certified rounds (${DATE_CODE})`, () => {
  const raceIds = Object.keys(manifest.races)
  it('manifest covers all 10 gated RCV races', () => {
    expect(raceIds).toHaveLength(10)
  })

  for (const raceId of raceIds) {
    it(`${raceId}: tabulate(decodeBallots(artifact)) equals rcv/${raceId}.json`, () => {
      const artifact = JSON.parse(readFileSync(join(base, `cvr/${raceId}.json`), 'utf8')) as CVRBallotArtifact
      const committed = JSON.parse(readFileSync(join(base, `rcv/${raceId}.json`), 'utf8')) as RCVContest
      const out = tabulate(
        decodeBallots(artifact),
        { raceId: artifact.raceId, title: artifact.title, candidates: artifact.candidates },
        { tieOrder: TIE_ORDER_PINS[`${DATE_CODE}/${raceId}`] },
      )
      expect(out.contest).toEqual(committed)
    })
  }

  it('treasurer stays reconciliation-blocked, bidirectionally', () => {
    expect(RECONCILIATION_BLOCKED).toContain(`${DATE_CODE}/treasurer`)
    expect(manifest.reconciliationBlocked).toEqual(['treasurer'])
    expect(existsSync(join(base, 'cvr/treasurer.json'))).toBe(false)
    expect(
      existsSync(join(base, 'rcv/treasurer.json')),
      'treasurer has certified rounds now — unblock it in build-cvr-ballots',
    ).toBe(false)
  })

  it(`TIE_ORDER_PINS has no ${DATE_CODE} entries (no ties in these races)`, () => {
    expect(Object.keys(TIE_ORDER_PINS).filter((k) => k.startsWith(`${DATE_CODE}/`))).toEqual([])
  })
})
