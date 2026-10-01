// src/lib/trees/siteNotices.test.ts
import { describe, expect, it } from 'vitest'
import { noticeIdForms, noticeSiteId, readNotice } from './siteNotices'

describe('noticeSiteId — both id styles name the same inventory site', () => {
  it('plain numbers and the 2023+ TRE- prefix', () => {
    expect(noticeSiteId('209111')).toBe(209111)
    expect(noticeSiteId('TRE-124769')).toBe(124769)
    expect(noticeSiteId(' tre-30804 ')).toBe(30804)
  })
  it('anything else joins to nothing', () => {
    for (const v of [null, undefined, '', 'TRE-', 'ABC', '12a']) expect(noticeSiteId(v), String(v)).toBeNull()
  })
  it('the live query asks for both spellings', () => {
    expect(noticeIdForms(4155)).toEqual(['4155', 'TRE-4155'])
  })
})

describe('readNotice — a treeid is a SITE; trees get replaced', () => {
  it('a tree planted after the notice is a different tree', () => {
    // real: site 4155, notice 2018-02-27, Brisbane Box planted 2026-05-07
    expect(readNotice('2018-02-27', '2026-05-07')).toBe('earlier-tree')
  })
  it('planted on or before the notice, or no planting date: say only "at this site"', () => {
    expect(readNotice('2023-12-07', '2009-07-29')).toBe('this-site')
    expect(readNotice('2023-12-07', '2023-12-07')).toBe('this-site')
    expect(readNotice('2023-12-07', null)).toBe('this-site')
  })
  it('compares the date prefix only (floating SF-local timestamps)', () => {
    expect(readNotice('2018-02-27T00:00:00.000', '2018-02-28')).toBe('earlier-tree')
  })
})
