// src/views/Restaurants/closureEpisodes.test.ts
//
// The §3.6 episode rule against REAL rows, fetched live from tvy3-wexg on
// data.sf.gov (2026-09-24):
//   SELECT permit_number, inspection_date, facility_rating_status, street_address_clean …
//   WHERE permit_number IN ('31974','103413','78172','99181','112297','H2406732977')
// Addresses are kept to show the padded-address duplicate the dedupe absorbs.
//
// Whole-extract check at the same probe (22,620 rows, sfToday 2026-09-24):
// 399 episodes at 356 permits; 341 cleared (66 the same day); 58 with no
// later pass, 42 of them after the break; 39 permits with 2+ episodes, 4 with
// 3+; 321 episodes start before the break, 78 after — the spec's G5 figures.

import { describe, it, expect } from 'vitest'
import {
  closureEpisodes,
  summarizeEpisodes,
  repeatBarCount,
  meetsRepeatBar,
  episodesByKey,
  daysBetween,
  type PlacardReading,
} from './closureEpisodes'

/** [permit_number, inspection_date, facility_rating_status, street_address_clean] */
const LIVE_ROWS: ReadonlyArray<readonly [string, string, string | null, string]> = [
  ['103413', '2024-03-05', 'Closure', '1310 GRANT AVE'],
  ['103413', '2024-03-05', 'Pass', '1310 GRANT AVE'],
  ['103413', '2024-03-07', 'Conditional Pass', '1310 GRANT AVE'],
  ['103413', '2024-03-07', 'Pass', '1310 GRANT AVE'],
  ['103413', '2024-03-28', 'Pass', '1310 GRANT AVE'],
  ['103413', '2024-06-11', 'Pass', '1310 GRANT AVE'],
  ['103413', '2024-06-13', 'Pass', '1310 GRANT AVE'],
  ['103413', '2024-06-14', 'Closure', '1310 GRANT AVE'],
  ['103413', '2024-06-20', 'Closure', '1310 GRANT AVE'],
  ['103413', '2024-06-21', 'Pass', '1310 GRANT AVE'],
  ['103413', '2024-07-18', 'Pass', '1310 GRANT AVE'],
  ['103413', '2024-09-26', 'Conditional Pass', '1310 GRANT AVE'],
  ['103413', '2024-10-01', 'Pass', '1310 GRANT AVE'],
  ['103413', '2025-06-25', 'Closure', '1310   GRANT AVE'],
  ['103413', '2025-06-25', 'Closure', '1310 GRANT AVE'],
  ['103413', '2025-06-26', 'Pass', '1310   GRANT AVE'],
  ['103413', '2026-02-11', 'Pass', '1310   GRANT AVE'],
  ['103413', '2026-02-20', 'Pass', '1310   GRANT AVE'],
  ['103413', '2026-08-25', 'Pass', '1310   GRANT AVE'],
  ['112297', '2024-09-25', 'Closure', '615 CORTLAND AVE'],
  ['112297', '2024-09-26', 'Pass', '615 CORTLAND AVE'],
  ['31974', '2024-07-15', 'Closure', '667 JACKSON ST'],
  ['31974', '2024-07-17', 'Closure', '667 JACKSON ST'],
  ['31974', '2024-07-29', 'Closure', '667 JACKSON ST'],
  ['31974', '2024-07-31', 'Closure', '667 JACKSON ST'],
  ['31974', '2024-08-01', 'Pass', '667 JACKSON ST'],
  ['31974', '2024-10-01', 'Pass', '667 JACKSON ST'],
  ['31974', '2025-02-04', 'Pass', '667 JACKSON ST'],
  ['31974', '2025-06-04', 'Closure', '667 JACKSON ST'],
  ['31974', '2025-06-05', 'Pass', '667 JACKSON ST'],
  ['31974', '2025-06-13', 'Pass', '667 JACKSON ST'],
  ['78172', '2024-08-05', 'Closure', '800 VALENCIA ST'],
  ['78172', '2024-08-07', 'Pass', '800 VALENCIA ST'],
  ['78172', '2024-08-08', 'Pass', '800 VALENCIA ST'],
  ['78172', '2025-08-19', 'Closure', '800 VALENCIA ST'],
  ['78172', '2025-08-19', 'Pass', '800 VALENCIA ST'],
  ['78172', '2025-08-21', 'Closure', '800 VALENCIA ST'],
  ['78172', '2025-08-21', 'Pass', '800 VALENCIA ST'],
  ['99181', '2024-09-25', 'Closure', '615 CORTLAND AVE'],
  ['99181', '2024-09-25', 'Pass', '615 CORTLAND AVE'],
  ['99181', '2024-09-26', 'Pass', '615 CORTLAND AVE'],
  ['H2406732977', '2024-05-20', 'Closure', '393 EDDY ST'],
  ['H2406732977', '2024-05-21', 'Closure', '393 EDDY ST'],
  ['H2406732977', '2024-05-22', 'Closure', '393 EDDY ST'],
  ['H2406732977', '2024-05-23', 'Pass', '393 EDDY ST'],
  ['H2406732977', '2025-01-29', 'Pass', '393 EDDY ST'],
  ['H2406732977', '2025-01-31', 'Pass', '393 EDDY ST'],
  ['H2406732977', '2025-02-04', 'Pass', '393 EDDY ST'],
  ['H2406732977', '2025-09-11', 'Closure', '393   EDDY ST'],
]

// Fed newest-first to prove the rule sorts for itself.
const readings: PlacardReading[] = [...LIVE_ROWS].reverse().map(([key, date, status]) => ({
  key,
  date: `${date}T00:00:00.000`,
  status,
}))
const TODAY = '2026-09-24'
const eps = closureEpisodes(readings, { sfToday: TODAY })
const byKey = episodesByKey(eps)
const of = (k: string) => byKey.get(k) ?? []

describe('closureEpisodes — the §3.6 rule on real rows', () => {
  it('Golden Flower 31974: four Closure rows are ONE episode, cleared Aug. 1 2024 (17 days)', () => {
    const [july, june] = of('31974')
    expect(of('31974')).toHaveLength(2)
    expect(july).toMatchObject({
      start: '2024-07-15',
      clearedOn: '2024-08-01',
      days: 17,
      closureVisits: 4,
      closureDates: ['2024-07-15', '2024-07-17', '2024-07-29', '2024-07-31'],
      sameDay: false,
      afterBreak: false,
    })
    expect(june).toMatchObject({ start: '2025-06-04', clearedOn: '2025-06-05', days: 1, closureVisits: 1 })
  })

  it('Yarsa 103413: three episodes; the padded-address duplicate counts once; 2024-03-05 cleared the same day', () => {
    const list = of('103413')
    expect(list).toHaveLength(3)
    expect(list[0]).toMatchObject({ start: '2024-03-05', clearedOn: '2024-03-05', sameDay: true, days: null, closureVisits: 1 })
    expect(list[1]).toMatchObject({ start: '2024-06-14', clearedOn: '2024-06-21', days: 7, closureVisits: 2 })
    // Two Closure rows on 2025-06-25 ('1310   GRANT AVE' and '1310 GRANT AVE') → one visit.
    expect(LIVE_ROWS.filter(([k, d, s]) => k === '103413' && d === '2025-06-25' && s === 'Closure')).toHaveLength(2)
    expect(list[2]).toMatchObject({ start: '2025-06-25', clearedOn: '2025-06-26', days: 1, closureVisits: 1 })
    expect(repeatBarCount(list)).toBe(3)
  })

  it("Rhea's 78172: two same-day pairs are two same-day episodes; <30 days apart they are one for the bar", () => {
    const list = of('78172')
    expect(list.map((e) => [e.start, e.clearedOn, e.sameDay, e.days])).toEqual([
      ['2024-08-05', '2024-08-07', false, 2],
      ['2025-08-19', '2025-08-19', true, null],
      ['2025-08-21', '2025-08-21', true, null],
    ])
    expect(repeatBarCount(list)).toBe(2)
    expect(meetsRepeatBar(list)).toBe(true)
  })

  it('Lindo Yucatan H2406732977: the after-break closure has no later pass — unresolved, flagged afterBreak', () => {
    const list = of('H2406732977')
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ start: '2024-05-20', clearedOn: '2024-05-23', days: 3, closureVisits: 3 })
    expect(list[1]).toMatchObject({ start: '2025-09-11', clearedOn: null, days: null, closureVisits: 1, afterBreak: true, sameDay: false })
  })

  it("615 Cortland Ave.: Moki's 99181 and Kiwa 112297 are two permits, never one address's repeat", () => {
    expect(of('99181')).toHaveLength(1)
    expect(of('99181')[0]).toMatchObject({ start: '2024-09-25', sameDay: true })
    expect(of('112297')).toHaveLength(1)
    expect(of('112297')[0]).toMatchObject({ start: '2024-09-25', clearedOn: '2024-09-26', days: 1 })
    expect(meetsRepeatBar(of('99181'))).toBe(false)
    expect(meetsRepeatBar(of('112297'))).toBe(false)
  })

  it('a reading after sfToday never resolves an episode (the 2031-05-16 junk-row class)', () => {
    const junk = [...readings, { key: 'H2406732977', date: '2031-05-16T00:00:00.000', status: 'Pass' }]
    const clamped = episodesByKey(closureEpisodes(junk, { sfToday: TODAY })).get('H2406732977')!
    expect(clamped[1].clearedOn).toBeNull()
    const unclamped = episodesByKey(closureEpisodes(junk)).get('H2406732977')!
    expect(unclamped[1].clearedOn).toBe('2031-05-16') // why every caller passes sfToday
  })

  it('NULL placards are ignored, and a Conditional Pass ends a run', () => {
    const e = closureEpisodes([
      { key: 'x', date: '2024-01-10', status: 'Closure' },
      { key: 'x', date: '2024-01-11', status: null },
      { key: 'x', date: '2024-01-12', status: 'Conditional Pass' },
    ])
    expect(e).toEqual([
      expect.objectContaining({ key: 'x', start: '2024-01-10', clearedOn: '2024-01-12', days: 2, closureVisits: 1 }),
    ])
  })

  it('reads the 2020–23 spellings (CLOSURE / CONDITIIONAL PASS) by facility id', () => {
    const e = closureEpisodes([
      { key: '8733', date: '2021-02-01T00:00:00.000', status: 'CLOSURE' },
      { key: '8733', date: '2021-02-03T00:00:00.000', status: 'CONDITIIONAL PASS' },
    ])
    expect(e[0]).toMatchObject({ start: '2021-02-01', clearedOn: '2021-02-03', days: 2 })
  })

  it('the repeat bar starts in March 2020', () => {
    const e = closureEpisodes([
      { key: 'y', date: '2019-05-01', status: 'Closure' },
      { key: 'y', date: '2019-05-02', status: 'Pass' },
      { key: 'y', date: '2021-05-01', status: 'Closure' },
      { key: 'y', date: '2021-05-02', status: 'Pass' },
    ])
    expect(e).toHaveLength(2)
    expect(repeatBarCount(e)).toBe(1)
  })

  it('summarizes: same-day episodes are excluded from every day figure', () => {
    const s = summarizeEpisodes(eps)
    expect(s).toMatchObject({
      episodes: 12,
      keys: 6,
      cleared: 11,
      sameDay: 4,
      unresolved: 1,
      unresolvedAfterBreak: 1,
      keysWith2Plus: 4,
      keysWith3Plus: 2,
      repeatKeys: 4,
    })
    // Day figures over the seven cleared, not-same-day episodes: 1, 1, 1, 2, 3, 7, 17.
    expect(s.medianDays).toBe(2)
    expect(s.maxDays).toBe(17)
  })

  it('daysBetween is integer date math (DST-proof)', () => {
    expect(daysBetween('2024-03-09', '2024-03-11')).toBe(2) // spans spring-forward
    expect(daysBetween('2024-07-15', '2024-08-01')).toBe(17)
    expect(daysBetween('2024-12-31', '2025-01-01')).toBe(1)
  })
})
