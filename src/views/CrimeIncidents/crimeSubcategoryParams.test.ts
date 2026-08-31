// ?sub= is wired entirely inside CrimeIncidents.tsx — useUrlSync must never
// set or delete it, or the global param sync clobbers the view's own
// navigation (the react-router-redirect-clobber class).
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

describe('the ?sub= param', () => {
  const sync = readFileSync('src/hooks/useUrlSync.ts', 'utf8')
  const view = readFileSync('src/views/CrimeIncidents/CrimeIncidents.tsx', 'utf8')

  it('is never touched by useUrlSync', () => {
    expect(sync).not.toMatch(/set\('sub'/)
    expect(sync).not.toMatch(/delete\('sub'/)
  })

  it('is read and written by the view', () => {
    expect(view).toMatch(/searchParams\.get\('sub'\)/)
    expect(view).toMatch(/next\.set\('sub'/)
    expect(view).toMatch(/next\.delete\('sub'/)
  })

  it('encodes each pair key, so a comma inside a name cannot split a value', () => {
    expect(view).toMatch(/map\(encodeURIComponent\)\.join\(','\)/)
  })

  it('is SF-only — Oakland has no subcategory column', () => {
    expect(view).toMatch(/isSF && selectedSubs\.size > 0/)
  })
})
