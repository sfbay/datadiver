import { describe, it, expect } from 'vitest'
import { buildDataNotes, allNoteBodies } from './dataNotes'
import {
  BREAK_NOTICE, CARD_NOTE, DURATION_NOTE, INSPECTOR_NOTE, MAILING_CITY_NOTE, MAILING_WITHHELD_NOTE,
  NEIGHBORHOOD_RATES_NOTE, SHARED_WITHHELD_NOTE,
} from './restaurantPhrase'
import {
  BUCKET_NOTE, CHAIN_NOTE, CLOSURE_LEDE_NOTE, CLOSURE_LIST_NOTE, FRANCHISE_NOTE, OWNER_CLOSURES_NOTE, REPEAT_NOTE,
} from './storylineRows'

describe('buildDataNotes — one table, nothing cut', () => {
  const sections = buildDataNotes(null, 2026)
  const bodies = allNoteBodies(sections)

  it('carries every note the tabs and the panel used to print', () => {
    for (const n of [
      CARD_NOTE, BREAK_NOTICE, NEIGHBORHOOD_RATES_NOTE, CHAIN_NOTE, BUCKET_NOTE, CLOSURE_LEDE_NOTE, REPEAT_NOTE,
      DURATION_NOTE, CLOSURE_LIST_NOTE, OWNER_CLOSURES_NOTE, MAILING_CITY_NOTE, FRANCHISE_NOTE, MAILING_WITHHELD_NOTE,
      SHARED_WITHHELD_NOTE, INSPECTOR_NOTE,
    ]) expect(bodies).toContain(n)
  })
  it('prints each note once — the repeats are what this table removes', () => {
    expect(new Set(bodies).size).toBe(bodies.length)
  })
  it('has one section per tab plus the general and storefront groups', () => {
    expect(sections.map((s) => s.id)).toEqual(['general', 'turnover', 'closures', 'owners', 'storefront'])
  })
  it('a withheld-address note carries the registry link (never a silent redaction)', () => {
    const owners = sections.find((s) => s.id === 'owners')!
    const withheld = owners.notes.filter((n) => n.link)
    expect(withheld.length).toBeGreaterThanOrEqual(2)
    for (const n of withheld) expect(n.link!.href).toMatch(/^https:\/\/data\.sf\.gov\//)
  })
})
