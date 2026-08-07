import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { OAKLAND_BEATS } from './beats'

// The committed evidence and the beat vocabulary can never drift silently —
// the duplicated-allowlist lesson, applied to the naming audit trail.
describe('beat-names evidence ↔ OAKLAND_BEATS', () => {
  const evidence = JSON.parse(
    readFileSync('scripts/oakland-beat-names-evidence.json', 'utf8')
  ) as Record<
    string,
    {
      coverage: number
      overlay: { name: string; forwardShare: number; reverseShare: number }[]
      dispatchName: string
      fullname: string
    }
  >

  it('key set === OAKLAND_BEATS exactly', () => {
    expect(Object.keys(evidence).sort()).toEqual([...OAKLAND_BEATS].sort())
  })

  it('overlay rows are well-formed shares, sorted descending', () => {
    for (const [code, e] of Object.entries(evidence)) {
      for (const row of e.overlay) {
        expect(row.forwardShare, `${code}/${row.name}`).toBeGreaterThan(0)
        expect(row.forwardShare).toBeLessThanOrEqual(1)
        expect(row.reverseShare).toBeGreaterThanOrEqual(0) // rounds to 0 for slivers <0.005% of a hood
        expect(row.reverseShare).toBeLessThanOrEqual(1)
      }
      const shares = e.overlay.map((r) => r.forwardShare)
      expect(shares, code).toEqual([...shares].sort((a, b) => b - a))
    }
  })

  it('sanity anchors: the lake is empty, the specials carry fullname', () => {
    expect(evidence.LKM1.coverage).toBeLessThan(0.01)
    expect(evidence.LKM1.fullname).toBe('LAKE MERRIT') // sic — the city's own typo
    expect(evidence.PDT2.fullname).toBe('PIEDMONT')
  })
})
