import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '../../../public/data/elections')

/** Races flagged isRCV whose round data SF never published (no round page). */
const KNOWN_MISSING_RCV = new Set(['20241105/treasurer'])

describe('RCV round files match the ids the frontend fetches', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'index.json'), 'utf8'))

  for (const election of manifest.elections) {
    const rcvDir = join(ROOT, 'results', election.dateCode, 'rcv')
    if (!existsSync(rcvDir)) continue

    const rcvRaces = election.races.filter((r: { isRCV?: boolean }) => r.isRCV)

    it(`${election.dateCode}: every isRCV race has a round file or is a pinned known-missing`, () => {
      for (const race of rcvRaces) {
        const key = `${election.dateCode}/${race.id}`
        const file = join(rcvDir, `${race.id}.json`)
        if (KNOWN_MISSING_RCV.has(key)) {
          expect(existsSync(file), `${key} is pinned missing but a file now exists — remove it from KNOWN_MISSING_RCV`).toBe(false)
        } else {
          expect(existsSync(file), `missing round file for ${key}`).toBe(true)
        }
      }
    })

    it(`${election.dateCode}: every round file's internal raceId matches its filename`, () => {
      for (const f of readdirSync(rcvDir)) {
        const data = JSON.parse(readFileSync(join(rcvDir, f), 'utf8'))
        expect(`${data.raceId}.json`).toBe(f)
      }
    })
  }
})
