// The DataSF portal domain, pinned.
//
// DataSF moved the open data portal from the legacy host to data.sf.gov on
// Sept. 1 2026, to satisfy California Gov. Code § 50034 (AB 1637, 2023), which
// requires every California city to serve its public sites from a .gov domain.
//
// The city's own migration notice says "All existing links, bookmarks, and API
// queries will automatically redirect to the new domain." That is true for
// $where / $order / $limit / $q, and FALSE for $select: the legacy edge answers
// a request carrying $select with a bare 403, not a 301. A browser cannot
// follow a 403, so on 2026-09-09 every San Francisco aggregate — stat cards,
// rankings, freshness probes, the era strip, and the digest's pulse section —
// failed at once while tiles and chrome kept loading, and the views rendered
// "No data in selected range" instead of an error. Measured that day:
//
//   legacy + $select=count(*)  → 403 Forbidden (nginx, no Location header)
//   legacy + $limit/$where     → 301 → data.sf.gov
//   data.sf.gov + $select      → 200, Access-Control-Allow-Origin: *
//
// So the host is not a cosmetic preference: reverting it takes San Francisco
// off the air. These two tests exist to make that impossible to do quietly.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { CITIES } from './registry'

// Assembled at runtime so this file can name the dead host without tripping
// its own scan.
const LEGACY_HOST = ['data', 'sfgov', 'org'].join('.')

describe('DataSF portal host', () => {
  it('San Francisco reads the .gov domain', () => {
    expect(CITIES.sf.portal.host).toBe('data.sf.gov')
    for (const cfg of Object.values(CITIES.sf.datasets)) {
      expect(cfg.endpoint.startsWith('https://data.sf.gov/'), cfg.id).toBe(true)
    }
  })

  it('Oakland is unaffected — a different portal, never migrated', () => {
    expect(CITIES.oakland.portal.host).toBe('data.oaklandca.gov')
  })

  it('no live source file still names the legacy host', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) {
          walk(p)
        } else if (['.ts', '.tsx', '.mjs', '.py'].includes(extname(name))) {
          const text = readFileSync(p, 'utf8')
          if (text.includes(LEGACY_HOST)) offenders.push(p)
        }
      }
    }
    for (const root of ['src', 'api', 'scripts']) walk(root)
    expect(offenders, `these still point at the retired ${LEGACY_HOST}`).toEqual([])
  })
})
