// src/views/Restaurants/dataNotes.ts
//
// The ONE table of this view's data notes — the precision behind every
// simplified label (§11: chrome stays clean, the notes carry the detail).
// Before this file each tab and the biography panel re-printed its own
// subset (BREAK_NOTICE three times, MAILING_* three times), about 1,800
// words on one page. Now the header popover renders this table once,
// grouped, and every other surface links to its section. Nothing is cut:
// a note that was on a tab is still in that tab's section here.

import type { StorefrontSnapshot } from '@/lib/storefronts/types'
import {
  BREAK_NOTICE, CARD_NOTE, DURATION_NOTE, INSPECTOR_NOTE, MAILING_CITY_NOTE, MAILING_WITHHELD_NOTE,
  NEIGHBORHOOD_RATES_NOTE, SHARED_WITHHELD_NOTE, ownersNote, sameMailingNote, turnoverNote,
} from './restaurantPhrase'
import { REGISTRY_URL } from './storefrontBiography'
import {
  BUCKET_NOTE, CHAIN_NOTE, CLOSURE_LEDE_NOTE, CLOSURE_LIST_NOTE, FRANCHISE_NOTE, OWNER_CLOSURES_NOTE, REPEAT_NOTE,
  groupEvidencePhrase,
} from './storylineRows'

export type NoteSectionId = 'general' | 'turnover' | 'closures' | 'owners' | 'storefront'

export interface DataNote {
  title: string
  body: string
  /** An outbound link rendered after the body ("Open the business registry"). */
  link?: { href: string; text: string }
}

export interface NoteSection {
  id: NoteSectionId
  title: string
  notes: DataNote[]
}

const REGISTRY_LINK = { href: REGISTRY_URL, text: 'Open the business registry' }

export const HISTORIES_NOTE =
  'Names come from inspection records in three city datasets, each published in its own vocabulary: scores for ' +
  '2016–19, placards since 2020. The city published nothing from late November 2019 to early March 2020 or from ' +
  'early August through December 2023, so a business that opened and closed inside those gaps is missing. Owners ' +
  'are the city Treasurer’s registrations, matched to this address by name and dates.'

export function buildDataNotes(snapshot: StorefrontSnapshot | null, nowYear: number): NoteSection[] {
  const match = snapshot?.stats?.registryMatch
  const evidence = snapshot ? groupEvidencePhrase(snapshot.groups) : undefined
  return [
    {
      id: 'general',
      title: 'The cards and the feed',
      notes: [
        { title: 'The cards', body: CARD_NOTE },
        { title: 'The July 2025 feed change', body: BREAK_NOTICE },
        { title: 'Neighborhood rates', body: NEIGHBORHOOD_RATES_NOTE },
      ],
    },
    {
      id: 'turnover',
      title: 'Turnover',
      notes: [
        ...(snapshot ? [{ title: 'What counts as turnover', body: turnoverNote(snapshot.asOf, snapshot.excludedAddresses, nowYear) }] : []),
        { title: 'Counting operators', body: CHAIN_NOTE },
        { title: 'Owner patterns', body: BUCKET_NOTE },
      ],
    },
    {
      id: 'closures',
      title: 'Closures',
      notes: [
        { title: 'The closures figure', body: CLOSURE_LEDE_NOTE },
        { title: 'Closed more than once', body: REPEAT_NOTE },
        { title: 'How long a closure lasted', body: DURATION_NOTE },
        { title: 'Every closure', body: CLOSURE_LIST_NOTE },
      ],
    },
    {
      id: 'owners',
      title: 'Owners',
      notes: [
        ...(match && match.total > 0 ? [{ title: 'Matching owners to inspections', body: ownersNote((match.matched / match.total) * 100) }] : []),
        { title: 'Closures by owner', body: OWNER_CLOSURES_NOTE },
        { title: 'The city beside each owner', body: MAILING_CITY_NOTE },
        { title: 'One sign, many owners', body: FRANCHISE_NOTE },
        { title: 'Same mailing address', body: sameMailingNote(evidence) },
        { title: 'What is withheld', body: MAILING_WITHHELD_NOTE, link: REGISTRY_LINK },
        { title: 'A shared address withheld', body: SHARED_WITHHELD_NOTE, link: REGISTRY_LINK },
      ],
    },
    {
      id: 'storefront',
      title: 'Storefront histories',
      notes: [
        { title: 'Where the history comes from', body: HISTORIES_NOTE },
        { title: 'Inspectors', body: INSPECTOR_NOTE },
      ],
    },
  ]
}

/** Every note body, flat — for tests that pin "nothing was cut". */
export function allNoteBodies(sections: readonly NoteSection[]): string[] {
  return sections.flatMap((s) => s.notes.map((n) => n.body))
}
