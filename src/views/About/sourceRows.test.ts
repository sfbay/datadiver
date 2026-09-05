import { describe, it, expect } from 'vitest'
import { buildSourceRows } from './sourceRows'
import { SOURCE_NOTES } from './sourceNotes'
import { CITIES } from '@/cities/registry'
import { NON_SOCRATA, nonSocrataFor } from '@/lib/provenance/nonSocrata'

describe('About source rows', () => {
  it('SF: every registry entry + every SF static source, in that order', () => {
    const rows = buildSourceRows('sf')
    expect(rows).toHaveLength(Object.keys(CITIES.sf.datasets).length + nonSocrataFor('sf').length)
    expect(rows[0].id).toBe(Object.values(CITIES.sf.datasets)[0].id)
    // The last SF static source is mapbox-basemap, which has no Socrata 4×4 —
    // buildSourceRows sets its `id` column to the landing host instead, so the
    // ordering intent is checked via the anchor, not the id column.
    expect(rows.at(-1)!.anchorId).toBe(`source-sf-${nonSocrataFor('sf').at(-1)!.id}`)
  })
  it('Oakland: 19 datasets + 4 static rows', () => {
    expect(buildSourceRows('oakland')).toHaveLength(23)
  })
  it('anchors are unique across both tables and prefixed by city', () => {
    const all = [...buildSourceRows('sf'), ...buildSourceRows('oakland')].map((r) => r.anchorId)
    expect(new Set(all).size).toBe(all.length)
    for (const a of all) expect(a).toMatch(/^source-(sf|oakland)-/)
  })
  it('every note key resolves to a source', () => {
    const ids = new Set([...Object.values(CITIES.sf.datasets), ...Object.values(CITIES.oakland.datasets)].map((c) => c.id).concat(Object.keys(NON_SOCRATA)))
    for (const key of Object.keys(SOURCE_NOTES)) expect(ids.has(key), key).toBe(true)
  })
  it('the two era clamps stay disclosed in the notes (Jesse, Sept. 2 2026)', () => {
    expect(SOURCE_NOTES['ab4h-6ztd']).toMatch(/2044/); expect(SOURCE_NOTES['ab4h-6ztd']).toMatch(/clamp/i)
    expect(SOURCE_NOTES['ppgh-7dqv']).toMatch(/2004/)
  })
  it('publisher column is the registry short form', () => {
    expect(buildSourceRows('sf').find((r) => r.id === 'wg3w-h783')!.publisher).toBe('SFPD')
  })
})
