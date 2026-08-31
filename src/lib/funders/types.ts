// Query-row shapes come straight off the six `FppcQueryBuilders.funder` builders
// (spec §3) — money and counts arrive as strings from Socrata, parsed here.
// The `Funder*` shapes are what `buildFunderProfile` (funderStats.ts) produces
// for the card to render; nothing here does I/O.
import type { Stance } from './stance'

export interface VariantRow {
  transaction_first_name?: string
  transaction_last_name: string
  transaction_city?: string
  transaction_state?: string
  transaction_zip?: string
  transaction_employer?: string
  transaction_occupation?: string
  entity_code?: string
  gifts: string
  total: string
}

export interface YearRow {
  y: string
  form_type: string
  gifts: string
  total: string
}

export interface RecipientRow {
  filer_nid: string
  filer_name: string
  filer_type?: string
  gifts: string
  total: string
  first_date?: string
  last_date?: string
}

export interface GiftRow {
  transaction_id?: string
  calculated_date?: string
  calculated_amount: string
  form_type: string
  record_type?: string
  filer_nid: string
  filer_name: string
  filer_type?: string
  transaction_zip?: string
  transaction_employer?: string
}

export interface FunderVariant {
  first?: string
  last: string
  city?: string
  state?: string
  zip?: string
  employer?: string
  occupation?: string
  entityCode?: string
  gifts: number
  total: number
}

export interface FunderRecipient {
  filerNid: string
  filerName: string
  stance: Stance
  gifts: number
  total: number
  firstDate?: string
  lastDate?: string
  pending: number
}

export interface FunderYear {
  year: number
  cash: number
  inKind: number
  gifts: number
  byType: { candidate: number; measure: number; pac: number } | null
  partial: boolean
}

export interface FunderGift {
  id: string
  date: string
  amount: number
  kind: 'cash' | 'in-kind' | 'notice'
  filerNid: string
  filerName: string
  year: number
}

export interface FunderProfile {
  key: string
  total: number
  cash: number
  inKind: number
  gifts: number
  average: number | null
  median: number | null
  firstYear: number | null
  lastYear: number | null
  activeYears: number
  recipients: FunderRecipient[]
  recipientCounts: { candidate: number; measure: number; pac: number }
  byYear: FunderYear[]
  variants: FunderVariant[]
  giftList: FunderGift[]
  /** `unknown: true` when the `gifts` fetch failed — with no gift rows to match against, every
   *  notice would spuriously read as pending. count/total both read 0 in that case, never a
   *  fabricated (inflated) pending figure off the raw notice rows. */
  pending: { count: number; total: number; unknown?: true }
  guard: { tripped: boolean; cities: string[]; zips: string[]; addresses: number }
  primaryCity?: string
  topEmployers: string[]
  capped: boolean
}
