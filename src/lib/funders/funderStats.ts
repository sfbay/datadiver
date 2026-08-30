// Pure stats builder for the funder card (spec §3/§4). No I/O, no imports
// outside src/lib/funders — see the funderKey.ts identity note: a funder has
// no id in pitq-e56w, so every merge here is on the folded NAME.
import { fold } from './funderKey'
import { parseStance } from './stance'
import type {
  VariantRow,
  YearRow,
  RecipientRow,
  GiftRow,
  FunderVariant,
  FunderRecipient,
  FunderYear,
  FunderGift,
  FunderProfile,
} from './types'

export const GIFT_CAP = 5000

/** `YYYY-MM-DD` prefix of a floating SF-local datetime string (see sfTime.ts's
 *  rule elsewhere in the app — this module never imports it, it just follows
 *  the same never-Date.parse convention on the prefix). */
function datePrefix(s: string | undefined | null): string {
  if (!s) return ''
  return s.slice(0, 10)
}

/** Absolute day difference between two `YYYY-MM-DD`-prefixed strings, both
 *  read as UTC calendar dates (same idea as consultants/reconcile.ts's
 *  daysDiffUtc — copied, not imported, to keep this module a zero-import leaf). */
function daysDiffUtc(a: string | undefined, b: string | undefined): number | null {
  const ap = datePrefix(a)
  const bp = datePrefix(b)
  if (!ap || !bp) return null
  const [ay, am, ad] = ap.split('-').map(Number)
  const [by, bm, bd] = bp.split('-').map(Number)
  if (!ay || !am || !ad || !by || !bm || !bd) return null
  const aMs = Date.UTC(ay, am - 1, ad)
  const bMs = Date.UTC(by, bm - 1, bd)
  return Math.abs(aMs - bMs) / 86_400_000
}

function yearFromDate(s: string | undefined): number | null {
  const prefix = datePrefix(s)
  if (!prefix) return null
  const y = parseInt(prefix.slice(0, 4), 10)
  return Number.isFinite(y) ? y : null
}

/** Spec §3.1: a notice matches a gift when the recipient (`filer_nid`) is
 *  equal, amounts agree to the half-cent, and the dates are within 30 days.
 *  Matched notices are the same gift reported early and are dropped; only
 *  the unmatched ones are returned as `pending`. */
export function matchNotices(gifts: GiftRow[], notices: GiftRow[]): { pending: GiftRow[] } {
  const pending: GiftRow[] = []
  for (const notice of notices) {
    const noticeAmount = parseFloat(notice.calculated_amount)
    const matched = gifts.some((gift) => {
      if (gift.filer_nid !== notice.filer_nid) return false
      const giftAmount = parseFloat(gift.calculated_amount)
      if (Math.abs(giftAmount - noticeAmount) >= 0.005) return false
      const diff = daysDiffUtc(gift.calculated_date, notice.calculated_date)
      return diff !== null && diff <= 30
    })
    if (!matched) pending.push(notice)
  }
  return { pending }
}

/** Spec §2: tripped when the variants span more than one distinct (folded)
 *  city AND more than three distinct 5-digit ZIP prefixes. `cities`/`zips`
 *  are always returned filled — the caller decides what to do with them. */
export function commonNameGuard(variants: FunderVariant[]): FunderProfile['guard'] {
  const cities = Array.from(new Set(variants.map((v) => fold(v.city)).filter(Boolean)))
  const zips = Array.from(
    new Set(
      variants
        .map((v) => (v.zip ?? '').slice(0, 5))
        .filter((z) => /^\d{5}$/.test(z))
    )
  )
  const tripped = cities.length > 1 && zips.length > 3
  return { tripped, cities, zips }
}

function isPerson(v: FunderVariant): boolean {
  return !v.entityCode || v.entityCode === 'IND'
}

/** Tiny local sentence/title-caser — deliberately not the shared
 *  `toSentenceCase` util (src/lib/funders is a zero-import-outside-itself
 *  leaf): lower-cases then upper-cases each word's first letter. No
 *  abbreviation table (that's the shared util's job); good enough for an
 *  employer-name display line. */
function titleCaseWords(s: string): string {
  return s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase())
}

function computePrimaryCity(variants: FunderVariant[]): string | undefined {
  const totals = new Map<string, { total: number; label: string }>()
  for (const v of variants) {
    if (!v.city) continue
    const key = fold(v.city)
    const prev = totals.get(key)
    if (prev) prev.total += v.total
    else totals.set(key, { total: v.total, label: v.city })
  }
  let best: { total: number; label: string } | undefined
  for (const entry of totals.values()) {
    if (!best || entry.total > best.total) best = entry
  }
  return best?.label
}

function computeTopEmployers(variants: FunderVariant[]): string[] {
  const totals = new Map<string, { total: number; label: string }>()
  for (const v of variants) {
    if (!isPerson(v)) continue
    const raw = (v.employer ?? '').trim()
    if (!raw) continue
    const upper = raw.toUpperCase()
    if (upper === 'NONE' || upper === 'N/A') continue
    const prev = totals.get(upper)
    if (prev) prev.total += v.total
    else totals.set(upper, { total: v.total, label: raw })
  }
  return Array.from(totals.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 2)
    .map((e) => titleCaseWords(e.label))
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function giftId(g: GiftRow): string {
  return g.transaction_id ?? `${g.calculated_date}|${g.calculated_amount}|${g.filer_nid}`
}

export function buildFunderProfile(input: {
  key: string
  variants: VariantRow[] | null
  byYear: YearRow[] | null
  recipients: RecipientRow[] | null
  gifts: GiftRow[] | null
  notices: GiftRow[] | null
  currentYear: number
}): FunderProfile {
  const { key, currentYear } = input

  // --- Variants → identity, guard, masthead ------------------------------
  const variants: FunderVariant[] = (input.variants ?? []).map((v) => ({
    first: v.transaction_first_name || undefined,
    last: v.transaction_last_name,
    city: v.transaction_city || undefined,
    state: v.transaction_state || undefined,
    zip: v.transaction_zip || undefined,
    employer: v.transaction_employer || undefined,
    occupation: v.transaction_occupation || undefined,
    entityCode: v.entity_code || undefined,
    gifts: Number(v.gifts) || 0,
    total: parseFloat(v.total) || 0,
  }))
  const guard = commonNameGuard(variants)
  const primaryCity = computePrimaryCity(variants)
  const topEmployers = computeTopEmployers(variants)

  // --- Recipients → stance lookup ------------------------------------------
  const recipientRows = input.recipients ?? []
  const stanceByFiler = new Map<string, ReturnType<typeof parseStance>>()
  for (const r of recipientRows) stanceByFiler.set(r.filer_nid, parseStance(r.filer_name, r.filer_type))

  // --- Notices → pending -----------------------------------------------
  const giftRows = input.gifts // GiftRow[] | null — keep the null distinct from []
  const noticeRows = input.notices ?? []
  const { pending: pendingNotices } = matchNotices(giftRows ?? [], noticeRows)
  const pendingByFiler = new Map<string, number>()
  for (const n of pendingNotices) {
    pendingByFiler.set(n.filer_nid, (pendingByFiler.get(n.filer_nid) ?? 0) + (parseFloat(n.calculated_amount) || 0))
  }
  const pendingTotal = pendingNotices.reduce((sum, n) => sum + (parseFloat(n.calculated_amount) || 0), 0)

  // --- Recipients → FunderRecipient[] -------------------------------------
  const recipients: FunderRecipient[] = recipientRows
    .map((r) => ({
      filerNid: r.filer_nid,
      filerName: r.filer_name,
      stance: parseStance(r.filer_name, r.filer_type),
      gifts: Number(r.gifts) || 0,
      total: parseFloat(r.total) || 0,
      firstDate: r.first_date,
      lastDate: r.last_date,
      pending: pendingByFiler.get(r.filer_nid) ?? 0,
    }))
    .sort((a, b) => b.total - a.total)

  const recipientCounts = { candidate: 0, measure: 0, pac: 0 }
  for (const r of recipients) {
    if (r.stance.kind === 'candidate') recipientCounts.candidate++
    else if (r.stance.kind === 'pac') recipientCounts.pac++
    else recipientCounts.measure++ // yes / no / measure all fold into "measure"
  }

  // --- byYear (server sums) — cash/inKind/gifts count are the ONE source --
  type YearAgg = { cash: number; inKind: number; gifts: number }
  const yearMap = new Map<number, YearAgg>()
  for (const row of input.byYear ?? []) {
    const year = parseInt(row.y, 10)
    if (!Number.isFinite(year)) continue
    const agg = yearMap.get(year) ?? { cash: 0, inKind: 0, gifts: 0 }
    const amount = parseFloat(row.total) || 0
    const count = Number(row.gifts) || 0
    if (row.form_type === 'A') agg.cash += amount
    else if (row.form_type === 'C') agg.inKind += amount
    agg.gifts += count
    yearMap.set(year, agg)
  }

  const capped = giftRows !== null && giftRows.length >= GIFT_CAP
  const canStackByType = giftRows !== null && !capped && input.recipients !== null

  // per-year × recipient-type dollar stacking, joined gift → recipient stance
  const byTypeMap = new Map<number, { candidate: number; measure: number; pac: number }>()
  if (canStackByType) {
    for (const g of giftRows!) {
      const year = yearFromDate(g.calculated_date)
      if (year === null) continue
      const stance = stanceByFiler.get(g.filer_nid) ?? parseStance(g.filer_name, g.filer_type)
      const amount = parseFloat(g.calculated_amount) || 0
      const bucket = byTypeMap.get(year) ?? { candidate: 0, measure: 0, pac: 0 }
      if (stance.kind === 'candidate') bucket.candidate += amount
      else if (stance.kind === 'pac') bucket.pac += amount
      else bucket.measure += amount
      byTypeMap.set(year, bucket)
    }
  }

  const years = Array.from(yearMap.keys())
  const firstYear = years.length > 0 ? Math.min(...years) : null
  const lastYear = firstYear !== null ? currentYear : null
  const activeYears = yearMap.size

  const byYear: FunderYear[] = []
  if (firstYear !== null) {
    for (let y = firstYear; y <= currentYear; y++) {
      const agg = yearMap.get(y) ?? { cash: 0, inKind: 0, gifts: 0 }
      byYear.push({
        year: y,
        cash: agg.cash,
        inKind: agg.inKind,
        gifts: agg.gifts,
        byType: canStackByType ? byTypeMap.get(y) ?? { candidate: 0, measure: 0, pac: 0 } : null,
        partial: y === currentYear,
      })
    }
  }

  let cash = 0
  let inKind = 0
  let giftsCount = 0
  for (const agg of yearMap.values()) {
    cash += agg.cash
    inKind += agg.inKind
    giftsCount += agg.gifts
  }
  const total = cash + inKind
  const average = giftsCount > 0 ? total / giftsCount : null
  const medianValue =
    giftRows !== null && !capped && giftRows.length > 0
      ? median(giftRows.map((g) => parseFloat(g.calculated_amount) || 0))
      : null

  // --- Gift list -----------------------------------------------------------
  const giftList: FunderGift[] = giftRows
    ? [
        ...giftRows.map((g) => ({
          id: giftId(g),
          date: g.calculated_date ?? '',
          amount: parseFloat(g.calculated_amount) || 0,
          kind: (g.form_type === 'C' ? 'in-kind' : 'cash') as FunderGift['kind'],
          filerNid: g.filer_nid,
          filerName: g.filer_name,
          year: yearFromDate(g.calculated_date) ?? 0,
        })),
        ...pendingNotices.map((g) => ({
          id: giftId(g),
          date: g.calculated_date ?? '',
          amount: parseFloat(g.calculated_amount) || 0,
          kind: 'notice' as FunderGift['kind'],
          filerNid: g.filer_nid,
          filerName: g.filer_name,
          year: yearFromDate(g.calculated_date) ?? 0,
        })),
      ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    : []

  return {
    key,
    total,
    cash,
    inKind,
    gifts: giftsCount,
    average,
    median: medianValue,
    firstYear,
    lastYear,
    activeYears,
    recipients,
    recipientCounts,
    byYear,
    variants,
    giftList,
    pending: { count: pendingNotices.length, total: pendingTotal },
    guard,
    primaryCity,
    topEmployers,
    capped,
  }
}
