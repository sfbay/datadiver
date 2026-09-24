// src/views/Restaurants/violationFamilies.ts
//
// Plain-English families for the violation items DPH writes into
// `violation_codes`. ZERO-IMPORT pure leaf, authored (never inferred).
//
// `violation_codes` is one free-text field per inspection: items of the form
// "<code list> - <instruction>." joined by ", ". The splitter is `\.,\s+`
// (spec §3.9, A trap 11) — a period, a comma, whitespace. It is imperfect by
// the data's own hand: an item that ends ". ," or with no period stays glued
// to its neighbor, so `violation_count` can exceed the parsed item count.
// That is why the view says "violations recorded" and never claims a severity
// (no major/minor flag exists, A §1).
//
// Families are keyed on the ITEM TEXT, not the code list: the same code
// appears under different instructions, and the city's own words are what a
// reader can check. Each family's pattern is tight on purpose — an item can
// belong to more than one family (glued items), and a loose word like
// "contamination" or "equipment" would pull the handwashing and plumbing
// items in too. Anything no family claims is 'other' — never dropped.
//
// Authored from the item frequencies in the 2024+ extract (446 distinct item
// texts, 48,340 items; probe 2026-09-24) — 'other' holds 0.2% of items. The
// four the spec cites: vermin (code 114259), handwashing (113953), holding
// temperature, water/sewage. 'Signs of vermin' matches the infestation
// instruction only, never the pest-PROOFING construction items (those are
// building and equipment) — it backs the sentence "Signs of vermin were cited
// at {n} of the {m} closure inspections".

export type ViolationFamilyId =
  | 'vermin'
  | 'handwashing'
  | 'temperature'
  | 'water-sewage'
  | 'sanitizing'
  | 'food-protection'
  | 'facility'
  | 'paperwork'
  | 'tobacco'
  | 'closure-notice'
  | 'other'

export interface ViolationFamily {
  id: ViolationFamilyId
  /** Reader-facing label. */
  label: string
  pattern: RegExp | null
}

/** Display order = this order. 'closure-notice' is the suspension notice DPH
 *  attaches to a Closure row (~1,900 characters) — not a violation, kept as a
 *  family so the panel can collapse it. */
export const VIOLATION_FAMILIES: readonly ViolationFamily[] = [
  { id: 'vermin', label: 'Signs of vermin', pattern: /infestation|presence of vermin/i },
  {
    id: 'handwashing',
    label: 'Handwashing',
    pattern: /wash hands|hand ?wash(?:ing)? (?:sink|station|facilit)|hand sinks?\b|single-use towels/i,
  },
  {
    id: 'temperature',
    label: 'Food temperature',
    pattern:
      /potentially hazardous food|\(PHF\)|\bPHF'?s\b|thaw|reheat|rapidly cool|hot held|food temperature|thermometer|time as a public health control|cooked to heat/i,
  },
  {
    id: 'water-sewage',
    label: 'Water and sewage',
    pattern:
      /sewage|backflow|hot running (?:potable )?water|potable (?:water )?supply|hot water of at least|water supply shall|air gap|wastewater|floor drains|discharges liquid waste/i,
  },
  {
    id: 'sanitizing',
    label: 'Cleaning and sanitizing',
    pattern: /wiping cloths|food contact surfaces|warewash|test strips|3-compartment sink|degrease|sanitizing solution/i,
  },
  {
    id: 'food-protection',
    label: 'Food protection',
    pattern:
      /separated and protected|protected from (?:potential )?contamination|discard all contaminated|adulterated|sneeze ?guard|elevate all food|approved sources|returned or reused|hair restraints|eat, drink, or smoke|thoroughly washed before|pesticide|raw, non-prepackaged food|voluntarily condemned/i,
  },
  {
    id: 'facility',
    label: 'Building and equipment',
    pattern:
      /walls? \/ ceilings|wall and ceiling|floor (?:finish|surfaces)|equipment is approved|all equipment shall|equipment and utensils shall|exhaust hoods?|ventilation|toilet facilities|toilet rooms shall|lightbulbs|rubbish|lockers|linen|janitorial|mops\b|conduits|premises of a food facility|fully enclosed in a building|self-closing|sleeping accommodations|residential use|refuse|shall at all times be constructed|splashguard|sealed to the floor|sink compartments|approved shelving|machinery|food -contact surfaces|adjacent table/i,
  },
  {
    id: 'paperwork',
    label: 'Permits and records',
    pattern:
      /food safety certification|inspection report|permit to operate|license certificate|submit additional documents|haccp|consumer advisory|shell ?fish tags|misbrand|valid permit|standard operating procedures|submit plans|specification sheets|verification form|operating location information|floor plan|(?:designate and (?:ensure|maintain)|shall have) a person in charge|training to staff|placard in a conspicuous|abatement conference|enforcement officers|referred for evaluation/i,
  },
  { id: 'tobacco', label: 'Tobacco rules', pattern: /tobacco|cigarette|smoking|Article 19[A-Z]/i },
  { id: 'closure-notice', label: 'Closure notice', pattern: /IMMEDIATE HEALTH PERMIT SUSPENSION AND CLOSURE/i },
  { id: 'other', label: 'Other', pattern: null },
]

const FAMILY_BY_ID: ReadonlyMap<ViolationFamilyId, ViolationFamily> = new Map(VIOLATION_FAMILIES.map((f) => [f.id, f]))

export function familyLabel(id: ViolationFamilyId): string {
  return FAMILY_BY_ID.get(id)?.label ?? 'Other'
}

/** The splitter, exactly as the spec pins it. */
export const ITEM_SPLITTER = /\.,\s+/

export interface ViolationItem {
  /** The citation list before " - " ('' when the item starts with "- "). */
  codes: string
  /** The city's instruction text. */
  text: string
  /** The raw item, trimmed. */
  raw: string
  families: ViolationFamilyId[]
}

const NOTICE = VIOLATION_FAMILIES.find((f) => f.id === 'closure-notice')!.pattern!

/** Families one item belongs to, in display order; ['other'] when none. The
 *  suspension notice is exclusive — its boilerplate ("The permit to operate
 *  … is hereby temporarily suspended") would otherwise read as paperwork. */
export function familiesOfItem(item: string): ViolationFamilyId[] {
  if (NOTICE.test(item)) return ['closure-notice']
  const out: ViolationFamilyId[] = []
  for (const f of VIOLATION_FAMILIES) if (f.pattern && f.pattern.test(item)) out.push(f.id)
  return out.length ? out : ['other']
}

/** Split one inspection's `violation_codes` into items. */
export function parseViolationItems(violationCodes: string | null | undefined): ViolationItem[] {
  if (!violationCodes) return []
  return violationCodes
    .split(ITEM_SPLITTER)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw) => {
      const cut = raw.indexOf(' - ')
      const lead = raw.startsWith('- ')
      const codes = lead ? '' : cut >= 0 ? raw.slice(0, cut).trim() : ''
      const text = lead ? raw.slice(2).trim() : cut >= 0 ? raw.slice(cut + 3).trim() : raw
      return { codes, text, raw, families: familiesOfItem(raw) }
    })
}

/** Every family cited in one inspection's `violation_codes`, in display
 *  order, deduped. Empty when nothing was recorded. */
export function violationFamilies(violationCodes: string | null | undefined): ViolationFamilyId[] {
  const seen = new Set<ViolationFamilyId>()
  for (const item of parseViolationItems(violationCodes)) for (const f of item.families) seen.add(f)
  return VIOLATION_FAMILIES.map((f) => f.id).filter((id) => seen.has(id))
}

/** True when the inspection's text carries the suspension notice. */
export function hasClosureNotice(violationCodes: string | null | undefined): boolean {
  return violationFamilies(violationCodes).includes('closure-notice')
}
