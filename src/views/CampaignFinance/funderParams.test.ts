// The funder card's `?funder=`/`&fzip=` params are wired entirely inside
// CampaignFinance.tsx (openFunder/closeFunder/setZip) — useUrlSync must
// never set or delete either one, or its global sync would clobber the
// card's own navigation (spec §2, the react-router-redirect-clobber class).
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

describe('funder card URL params are not touched by useUrlSync', () => {
  const src = readFileSync('src/hooks/useUrlSync.ts', 'utf8')

  it('never sets or deletes ?funder=', () => {
    expect(src).not.toMatch(/set\('funder'/)
    expect(src).not.toMatch(/delete\('funder'/)
  })

  it('never sets or deletes &fzip=', () => {
    expect(src).not.toMatch(/set\('fzip'/)
    expect(src).not.toMatch(/delete\('fzip'/)
  })
})
