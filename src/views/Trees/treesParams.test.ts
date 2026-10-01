// The Trees view's URL params (`?lens=`, `?tree=`, `?species=`, `?nh=`,
// `?rank=`) are wired entirely inside Trees.tsx with `replace: true` — useUrlSync
// must never set or delete one, or its global sync would clobber the view's own
// navigation (spec §4.4, "pinned, like `funder`"; the react-router redirect-
// clobber class). And /trees is DATELESS: the sync strips the global date
// params there. Mirrors src/views/CampaignFinance/funderParams.test.ts.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SF_MANIFEST } from '@/cities/sf/manifest'

const src = readFileSync('src/hooks/useUrlSync.ts', 'utf8')

describe('Trees URL params are not touched by useUrlSync', () => {
  for (const key of ['lens', 'tree', 'species', 'nh', 'rank']) {
    it(`never sets or deletes ?${key}=`, () => {
      expect(src).not.toMatch(new RegExp(`set\\(\\s*'${key}'`))
      expect(src).not.toMatch(new RegExp(`delete\\(\\s*'${key}'`))
    })
  }
})

describe('/trees is dateless, so the sync strips the global date params there', () => {
  it('the manifest marks trees dateless', () => {
    expect(SF_MANIFEST.find((e) => e.viewId === 'trees')?.dateless).toBe(true)
  })
  it('the dateless branch deletes every date key and returns before any is set', () => {
    const branch = /if \(dateless\) \{([\s\S]*?)return next\s*\}/.exec(src)
    expect(branch, 'the dateless branch').not.toBeNull()
    const body = branch![1]
    for (const key of ['start', 'end', 'tod_start', 'tod_end', 'compare']) expect(body).toContain(`next.delete('${key}')`)
    expect(body).not.toMatch(/next\.set\(/)
  })
})
