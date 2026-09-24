// src/views/Restaurants/restaurantPhrase.test.ts
//
// Build-failing guard on the view's reader text (spec §5, §11):
//   - no word that turns a record into an accusation or a verdict
//     (cursed, shell, hidden owner, secretly, dirty, failed, still closed,
//     reopened, closed for good);
//   - no statistics jargon (σ / z-score / baseline / YoY);
//   - no "score" anywhere in placard-era text (2020+ grades are placards);
//   - no inspector name;
//   - an owner's mailing city is the plain city — "Daly City", never
//     "Mailing city on city registration: Daly City, Calif." (Jesse,
//     2026-09-24); what it means lives in the data notes.
// Plus the outcome phrases and window labels the spec pins verbatim.

import { describe, it, expect } from 'vitest'
import * as P from './restaurantPhrase'
import { closureEpisodes, type ClosureEpisode } from './closureEpisodes'
import { feedWindow } from './inspectionFeed'

const NOW = 2026
const T = '2026-09-24'

// Real shapes: Golden Flower July 2024 (4 visits, 17 days), Yarsa same-day,
// Lindo Yucatan after the break with no later pass.
const eps = closureEpisodes(
  [
    ['31974', '2024-07-15', 'Closure'],
    ['31974', '2024-07-17', 'Closure'],
    ['31974', '2024-07-29', 'Closure'],
    ['31974', '2024-07-31', 'Closure'],
    ['31974', '2024-08-01', 'Pass'],
    ['103413', '2024-03-05', 'Closure'],
    ['103413', '2024-03-05', 'Pass'],
    ['H2406732977', '2025-09-11', 'Closure'],
    ['112297', '2026-02-03', 'Closure'],
    ['112297', '2026-02-04', 'Pass'],
  ].map(([key, date, status]) => ({ key, date, status })),
  { sfToday: T },
)
const ep = (key: string): ClosureEpisode => eps.find((e) => e.key === key)!
const golden = ep('31974')
const sameDay = ep('103413')
const open = ep('H2406732977')
const oneDay = ep('112297')

/** Every reader-facing string the module can produce, over realistic inputs. */
function corpus(): string[] {
  const out: string[] = []
  for (const v of Object.values(P)) if (typeof v === 'string') out.push(v)
  for (const rec of [P.WINDOW_NAME]) out.push(...Object.values(rec))
  for (const e of eps) {
    out.push(P.episodeOutcome(e, NOW), P.closureStory(e, NOW), P.episodeFeedNote(e) ?? '')
  }
  out.push(
    P.repeatSummary(eps),
    P.repeatSummary([golden, oneDay]),
    P.repeatSummary([sameDay, sameDay]),
    P.windowLabel(feedWindow('since', T)),
    P.windowLabel(feedWindow('before', T)),
    P.nowLine('Golden Flower', '2025-06-13', 'pass', NOW),
    P.nowLine('Golden Flower', '2024-07-15', 'closure', NOW),
    P.nowLine('Golden Flower', '2024-07-15', 'conditional', NOW),
    P.turnoverLede(66, T, NOW),
    P.namesLede({ address: '2704 24th St.', sinceYear: 2016, names: ['Almanac', 'Seven Stills', 'Brewvino', 'Ayahuazka', 'Caprizza'], seenOnce: 2, counted: 3 }),
    P.ownerReturnedLede({ ownerKind: 'company', firstName: 'Katani Pizza', address: '2077 Hayes St.', fromYear: 2016, toYear: 2019, returnYear: 2024, returnName: 'The Hungry Spot', ownersBetween: 3 }),
    P.sameOwnerLede({ address: '570 Green St.', sinceYear: 2017, names: 5, owner: 'Pete’s on Green LLC', ownerKind: 'company', behindFirst: 3 }),
    P.closuresLede({ cleared: 341, clearedWithinADay: 190, since: '2024-01-02' }),
    P.verminSentence({ cited: 323, closureInspections: 384, since: '2024-01-02' }),
    P.ownerSizeSentence({ singleClosed: 185, singleInspections: 3773, bigThreshold: 10, bigClosed: 0, bigInspections: 203 }),
    P.sharedMailingSentence(23),
    P.turnoverNote(T, 249, NOW),
    P.ownersNote(90.8),
    P.sameMailingNote('the group’s own website'),
    P.sameMailingNote(),
    P.mailingCityLabel('Daly City') ?? '',
  )
  return out.filter(Boolean)
}

const BANNED_WORDS = ['cursed', 'shell', 'secretly', 'dirty', 'failed', 'reopened', 'sigma', 'yoy', 'baseline']
const BANNED_PHRASES = ['hidden owner', 'still closed', 'closed for good', 'σ', 'z-score', 'z score', 'zscore', 'year-over-year', 'year over year']
/** Real DPH inspector names from the extract — never in reader text. */
const INSPECTOR_NAMES = ['Patrick Wood']

describe('restaurantPhrase — banned words (build-failing)', () => {
  const text = corpus()

  it('produces a real corpus to check', () => {
    expect(text.length).toBeGreaterThan(40)
  })

  it('no accusation, verdict, jargon or inspector name reaches reader text', () => {
    for (const s of text) {
      const low = s.toLowerCase()
      for (const w of BANNED_WORDS) expect(new RegExp(`\\b${w}\\b`, 'i').test(s), `"${w}" in: ${s}`).toBe(false)
      for (const p of BANNED_PHRASES) expect(low.includes(p), `"${p}" in: ${s}`).toBe(false)
      for (const n of INSPECTOR_NAMES) expect(s.includes(n), `inspector name in: ${s}`).toBe(false)
    }
  })

  it('placard-era text never says "score"; scores belong to 2016–19 only', () => {
    for (const s of text) expect(/\bscor(e|es|ed|ing)\b/i.test(s), s).toBe(false)
    expect(P.scoreBadge(92)).toBe('92 · Good')
    expect(P.scoreBadge(88)).toBe('88 · Adequate')
    expect(P.scoreBadge(71)).toBe('71 · Needs Improvement')
    expect(P.scoreBadge(70)).toBe('70 · Poor')
    expect(P.scoreBadge(null)).toBe('Not scored')
  })
})

describe('restaurantPhrase — outcomes', () => {
  it('speaks the three pinned outcome phrases', () => {
    expect(P.episodeOutcome(golden, NOW)).toBe('Cleared Aug. 1, 2024 · at most 17 days')
    expect(P.episodeOutcome(oneDay, NOW)).toBe('Cleared Feb. 4 · at most one day')
    expect(P.episodeOutcome(sameDay, NOW)).toBe('Closed and cleared the same day')
    expect(P.episodeOutcome(open, NOW)).toBe('No later inspection published')
  })

  it('attaches the feed note only to an unresolved episode after the break', () => {
    expect(P.episodeFeedNote(open)).toBe(P.FEED_NOTE)
    expect(P.episodeFeedNote(oneDay)).toBeNull()
    expect(P.episodeFeedNote(golden)).toBeNull()
  })

  it('tells a multi-visit closure as ONE closure (voice sample 4, banned-word safe)', () => {
    expect(P.closureStory(golden, NOW)).toBe(
      'Closed July 15, 2024. The next three inspections found it closed. Cleared Aug. 1, 2024 — at most 17 days.',
    )
    expect(P.closureStory(sameDay, NOW)).toBe('Closed March 5, 2024. Cleared the same day.')
    expect(P.closureStory(open, NOW)).toBe('Closed Sept. 11, 2025. No later inspection published.')
  })

  it('summarizes repeat closures with outcomes', () => {
    expect(P.repeatSummary([golden, oneDay])).toBe('Two closures · each cleared within 17 days')
    expect(P.repeatSummary([sameDay, sameDay])).toBe('Two closures · each cleared the same day')
    expect(P.repeatSummary([golden, sameDay, open])).toBe('Three closures · two cleared, one with no later inspection published')
  })
})

describe('restaurantPhrase — windows, ledes, owners', () => {
  it('labels the two windows as the spec writes them', () => {
    expect(P.windowLabel(feedWindow('since', T))).toBe('Since the feed change · Sept. 2025–Aug. 2026')
    expect(P.windowLabel(feedWindow('before', T))).toBe('Full records · July 2024–June 2025')
    expect(P.THIN_FEED_BADGE).toBe('Thinner feed')
    expect(P.BREAK_NOTICE).toContain('about 70% fewer inspection records a month')
    expect(P.BREAK_NOTICE).toContain('never compares the two periods')
  })

  it('writes the voice samples', () => {
    expect(
      P.namesLede({ address: '2704 24th St.', sinceYear: 2016, names: ['Almanac', 'Seven Stills', 'Brewvino', 'Ayahuazka', 'Caprizza'], seenOnce: 2, counted: 3 }),
    ).toBe(
      'Five names have hung over 2704 24th St. since 2016: Almanac, Seven Stills, Brewvino, Ayahuazka and Caprizza. ' +
        'Two of them turn up at a single inspection, so we count three operators.',
    )
    expect(
      P.ownerReturnedLede({ ownerKind: 'company', firstName: 'Katani Pizza', address: '2077 Hayes St.', fromYear: 2016, toYear: 2019, returnYear: 2024, returnName: 'The Hungry Spot', ownersBetween: 3 }),
    ).toBe(
      'The company that ran Katani Pizza at 2077 Hayes St. from 2016 to 2019 came back in 2024 as The Hungry Spot. Three other owners came and went in between.',
    )
    expect(P.sameOwnerLede({ address: '570 Green St.', sinceYear: 2017, names: 5, owner: 'Pete’s on Green LLC', ownerKind: 'company', behindFirst: 3 })).toBe(
      'Five names since 2017 at 570 Green St. The city’s business registry lists one company, Pete’s on Green LLC, behind the first three.',
    )
    expect(P.verminSentence({ cited: 323, closureInspections: 384, since: '2024-01-02' })).toBe(
      'Signs of vermin were cited at 323 of the 384 closure inspections at food businesses since January 2024.',
    )
    expect(P.ownerSizeSentence({ singleClosed: 185, singleInspections: 3773, bigThreshold: 10, bigClosed: 0, bigInspections: 203 })).toMatch(
      /^Restaurants whose owner has a single location were closed at 185 of 3,773 routine inspections, or 4\.9%\. Owners with 10 or more locations: none of 203\. .*doesn’t show that bigger owners run cleaner kitchens\.$/,
    )
  })

  it('says "Most closures are short" only when the figures make it true', () => {
    expect(P.closuresLede({ cleared: 341, clearedWithinADay: 190, since: '2024-01-02' })).toBe(
      'Most closures are short. Of the 341 closures since January 2024 that ended in a passing inspection, 190 were cleared within a day.',
    )
    expect(P.closuresLede({ cleared: 341, clearedWithinADay: 100, since: '2024-01-02' }).startsWith('Of the 341')).toBe(true)
  })

  it('an owner mailing city is JUST the city (Jesse, 2026-09-24)', () => {
    expect(P.mailingCityLabel('Daly City')).toBe('Daly City')
    expect(P.mailingCityLabel('San  Francisco')).toBe('San Francisco')
    expect(P.mailingCityLabel('SOUTH SAN FRANCISCO')).toBe('South San Francisco')
    expect(P.mailingCityLabel('cheektowaga')).toBe('Cheektowaga')
    expect(P.mailingCityLabel('')).toBeNull()
    expect(P.mailingCityLabel(null)).toBeNull()
    const label = P.mailingCityLabel('Daly City')!
    for (const noise of ['mailing', 'registration', 'calif', ', ca', 'lives', 'local', ':']) {
      expect(label.toLowerCase()).not.toContain(noise)
    }
  })

  it('the data notes carry what the plain labels leave out', () => {
    // Mailing city: what it is, what it is not, the head-office effect, the placeholder rule.
    expect(P.MAILING_CITY_NOTE).toMatch(/mailing city on that owner’s city business registration/)
    expect(P.MAILING_CITY_NOTE).toMatch(/not necessarily where anyone lives/)
    expect(P.MAILING_CITY_NOTE).toMatch(/Aramark in Philadelphia/)
    expect(P.MAILING_CITY_NOTE).toMatch(/undeliverable/)
    // Withheld fields: what, why, where to find them.
    expect(P.MAILING_WITHHELD_NOTE).toMatch(/street address or ZIP code/)
    expect(P.MAILING_WITHHELD_NOTE).toMatch(/may be a home/)
    expect(P.MAILING_WITHHELD_NOTE).toMatch(/data\.sf\.gov/)
    expect(P.MAILING_WITHHELD_NOTE).not.toMatch(/data\.sfgov\.org/)
    // §11: owner names are shown — the superseded "not named here" line must not return.
    expect(P.ownersNote(90.8)).not.toMatch(/not named/)
    expect(P.ownersNote(90.8)).toContain('91% of inspected places match')
    // Shared address is a FACT, never common ownership.
    expect(P.sharedMailingSentence(7)).toBe('These seven companies list the same mailing address on their city registrations.')
    expect(P.sameMailingNote()).toMatch(/does not show common ownership/)
    expect(P.INSPECTOR_NOTE).toMatch(/does not rank, filter or search by inspector/)
  })

  it('AP numbers', () => {
    expect(P.apCount(0)).toBe('zero')
    expect(P.apCount(9)).toBe('nine')
    expect(P.apCount(10)).toBe('10')
    expect(P.apCount(3773)).toBe('3,773')
    expect(P.apCountStart(12)).toBe('Twelve')
    expect(P.apList(['a', 'b', 'c'])).toBe('a, b and c')
  })
})
