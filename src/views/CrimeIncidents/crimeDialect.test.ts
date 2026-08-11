import { describe, it, expect } from 'vitest'
import {
  OAKLAND_CRIME_GROUPS, OAKLAND_CRIME_COUNT, OAKLAND_CRIME_QUERY_FLOOR,
  titleCaseCrimetype, adaptOaklandIncident,
  buildSfCrimeWhere, buildOaklandCrimeWhere,
  classifyOaklandCategory, oaklandCategoryExpr,
  OAK_CAT_HOMICIDE, OAK_CAT_DEATH_INVESTIGATIONS, OAK_CAT_OTHER,
} from './crimeDialect'
import { planCrimeEra } from './crimeEra'
import { distinctCases } from '@/hooks/useComparisonDataFactory'

// Probe-pinned recent crimetype vocabulary (top 40, 2026-08-05 —
// stage-3 spec, Fresh probe facts). Group membership must stay inside it.
const PROBE_VOCAB = new Set([
  'STOLEN VEHICLE', 'BURG - AUTO', 'PETTY THEFT', 'VANDALISM', 'MISDEMEANOR ASSAULT',
  'DOMESTIC VIOLENCE', 'ROBBERY', 'GRAND THEFT', 'FELONY ASSAULT', 'OTHER',
  'BURG - RESIDENTIAL', 'WEAPONS', 'BURG - COMMERCIAL', 'NARCOTICS', 'THREATS',
  'DISORDERLY CONDUCT', 'HOMICIDE', 'FORGERY & COUNTERFEITING', 'STOLEN AND RECOVERED VEHICLE',
  'FRAUD', 'RECOVERED O/S STOLEN', 'DUI', 'BURG - OTHER', 'FORCIBLE RAPE',
  'CURFEW & LOITERING', 'OTHER SEX OFFENSES', 'ARSON', 'PROSTITUTION', 'KIDNAPPING',
  'MISCELLANEOUS TRAFFIC CRIME', 'RECOVERED VEHICLE - OAKLAND STOLEN', 'EMBEZZLEMENT',
  'BRANDISHING', 'TOWED VEHICLE', 'CHILD ABUSE', 'MISSING', 'POSSESSION - STOLEN PROPERTY',
  'FELONY WARRANT', 'OUTSIDE AGENCY INCIDENT', 'MISDEMEANOR WARRANT',
])

describe('OAKLAND_CRIME_GROUPS', () => {
  it('every authored member is a probe crimetype or the derived Homicide category', () => {
    // 'HOMICIDE' the raw code is split (see classifyOaklandCategory); its
    // Violent slot is now the DERIVED 'Homicide' category, which is not a raw
    // vocabulary value. Everything else must still be a real probe crimetype.
    const allowed = new Set([...PROBE_VOCAB, OAK_CAT_HOMICIDE])
    for (const members of Object.values(OAKLAND_CRIME_GROUPS)) {
      for (const m of members) expect(allowed.has(m), m).toBe(true)
    }
  })
  it('groups are disjoint and the admin tail is deliberately ungrouped', () => {
    const all = Object.values(OAKLAND_CRIME_GROUPS).flat()
    expect(new Set(all).size).toBe(all.length)
    for (const admin of ['WEAPONS', 'OTHER', 'TOWED VEHICLE', 'FELONY WARRANT', 'MISSING']) {
      expect(all.includes(admin), admin).toBe(false)
    }
    // The two judgment calls, made once in the spec: THREATS→Violent, VANDALISM→Property.
    expect(OAKLAND_CRIME_GROUPS.Violent).toContain('THREATS')
    expect(OAKLAND_CRIME_GROUPS.Property).toContain('VANDALISM')
  })
  it('the HOMICIDE code is split: derived Homicide is Violent; the raw code and the death/other buckets are ungrouped', () => {
    const all = Object.values(OAKLAND_CRIME_GROUPS).flat()
    expect(OAKLAND_CRIME_GROUPS.Violent).toContain(OAK_CAT_HOMICIDE)
    expect(all).not.toContain('HOMICIDE')                    // raw code no longer a member
    expect(all).not.toContain(OAK_CAT_DEATH_INVESTIGATIONS)  // coroner probes ungrouped — not crimes
    expect(all).not.toContain(OAK_CAT_OTHER)
  })
})

describe('classifyOaklandCategory (the HOMICIDE-code split)', () => {
  // OPD files coroner death probes under crimetype='HOMICIDE' (~92% of the
  // bucket). We split that ONE code by description into three honest display
  // categories; every other crimetype passes through untouched.
  it('routes charged murder / manslaughter to Homicide', () => {
    expect(classifyOaklandCategory('HOMICIDE', 'MURDER')).toBe(OAK_CAT_HOMICIDE)
    expect(classifyOaklandCategory('HOMICIDE', 'MURDER:FIRST DEGREE')).toBe(OAK_CAT_HOMICIDE)
    expect(classifyOaklandCategory('HOMICIDE', 'VOLUNTARY MANSLAUGHTER')).toBe(OAK_CAT_HOMICIDE)
    expect(classifyOaklandCategory('HOMICIDE', 'VEHICLE MANSLAUGHTER W/GROSS NEGLIGENCE')).toBe(OAK_CAT_HOMICIDE)
  })
  it('routes coroner death probes to Death Investigations', () => {
    expect(classifyOaklandCategory('HOMICIDE', 'SC UNEXPLAINED DEATH')).toBe(OAK_CAT_DEATH_INVESTIGATIONS)
    expect(classifyOaklandCategory('HOMICIDE', 'CONCL/ETC ACCIDENTL DEATH')).toBe(OAK_CAT_DEATH_INVESTIGATIONS)
  })
  it('routes the violent tail (attempts, assaults) to Other — never Homicide', () => {
    // These are real violence, but the label says "murder and manslaughter";
    // routing them to Homicide would overstate the floor. Other is the safe home.
    expect(classifyOaklandCategory('HOMICIDE', 'ATTEMPTED MURDER-FIREARM')).toBe(OAK_CAT_OTHER)
    expect(classifyOaklandCategory('HOMICIDE', 'ASSAULT WITH FIREARM ON PERSON')).toBe(OAK_CAT_OTHER)
    expect(classifyOaklandCategory('HOMICIDE', 'SHOOT AT INHABITED DWELLING/VEHICLE/ETC')).toBe(OAK_CAT_OTHER)
  })
  it('an elder-abuse charge mentioning DEATH is NOT a coroner probe', () => {
    // 'LIKELY GBI OR DEATH' contains DEATH but not UNEXPLAINED/ACCIDENTL DEATH,
    // so the narrow coroner match must not swallow it.
    expect(classifyOaklandCategory('HOMICIDE', 'CRUELTY TO ELDER/DEPENDENT ADULT WITH LIKELY GBI OR DEATH')).toBe(OAK_CAT_OTHER)
  })
  it('passes every non-HOMICIDE crimetype through untouched', () => {
    expect(classifyOaklandCategory('STOLEN VEHICLE', 'VEHICLE THEFT - AUTO')).toBe('STOLEN VEHICLE')
    expect(classifyOaklandCategory('ROBBERY', 'ROBBERY-FIREARM')).toBe('ROBBERY')
  })
  it('a HOMICIDE row with no description defaults to Other, never Homicide', () => {
    expect(classifyOaklandCategory('HOMICIDE', '')).toBe(OAK_CAT_OTHER)
  })
})

describe('oaklandCategoryExpr (SoQL mirror of the classifier)', () => {
  // The SELECT/GROUP CASE string and the filter's IN() share this ONE
  // expression, and it must carry the SAME description tokens the JS
  // classifier keys on — drift here silently unlinks how we count from how
  // we filter (the sidebar row and its own filter would disagree).
  const expr = oaklandCategoryExpr()
  it('emits the three derived category literals', () => {
    expect(expr).toContain(`'${OAK_CAT_HOMICIDE}'`)
    expect(expr).toContain(`'${OAK_CAT_DEATH_INVESTIGATIONS}'`)
    expect(expr).toContain(`'${OAK_CAT_OTHER}'`)
  })
  it('keys on the same description tokens as the JS classifier', () => {
    expect(expr).toContain('%MURDER%')
    expect(expr).toContain('%MANSLAUGHTER%')
    expect(expr).toContain('%ATTEMPTED%')
    expect(expr).toContain('%UNEXPLAINED DEATH%')
    expect(expr).toContain('%ACCIDENTL DEATH%')
  })
  it('passes non-HOMICIDE crimetypes through unchanged', () => {
    expect(expr).toContain("crimetype != 'HOMICIDE', crimetype")
  })
})

describe('titleCaseCrimetype', () => {
  it('title-cases ALL-CAPS phrases but preserves acronyms', () => {
    expect(titleCaseCrimetype('STOLEN VEHICLE')).toBe('Stolen Vehicle')
    expect(titleCaseCrimetype('FORGERY & COUNTERFEITING')).toBe('Forgery & Counterfeiting')
    expect(titleCaseCrimetype('DUI')).toBe('DUI')
    expect(titleCaseCrimetype('RECOVERED O/S STOLEN')).toBe('Recovered O/S Stolen')
  })
})

describe('planCrimeEra (city-branched)', () => {
  it('oakland always returns the single-extract plan with currentRange VERBATIM', () => {
    // The SF builder clamps currentRange.start to the 2018 seam — routed
    // through it, an Oakland range into 2004–2017 silently drops 14 years.
    const plan = planCrimeEra({ start: '2004-01-01', end: '2016-06-30' }, 'oakland')
    expect(plan.era).toBe('current')
    expect(plan.currentRange).toEqual({ start: '2004-01-01', end: '2016-06-30' })
    expect(plan.historicalRange).toBeNull()
    expect(plan.categoryFilterAvailable).toBe(true)
    expect(plan.cadLinkAvailable).toBe(false)
    expect(plan.resolutionAvailable).toBe(false)
  })
  it('sf plans are unchanged and gain resolutionAvailable: true', () => {
    const straddle = planCrimeEra({ start: '2016-01-01', end: '2020-01-01' })
    expect(straddle.era).toBe('straddle')
    expect(straddle.currentRange?.start).toBe('2018-01-01')
    expect(straddle.resolutionAvailable).toBe(true)
  })
})

describe('WHERE builders', () => {
  const opts = {
    dateRange: { start: '2025-01-01', end: '2025-06-30' },
    categoryClause: '', selectedNeighborhood: null, timeOfDayFilter: null,
  }
  it('SF builder emits the legacy string byte-identically (comparison replace-pattern fence)', () => {
    // The comparison factory derives its window by literal string-replace of
    // `${dateField} >= '${start}T00:00:00'` — one drifted character and the
    // replace silently no-ops, fabricating ~0% deltas. This pin is the fence.
    expect(buildSfCrimeWhere(opts)).toBe(
      "incident_datetime >= '2025-01-01T00:00:00' AND incident_datetime <= '2025-06-30T23:59:59'"
    )
  })
  it('oakland builder leads with the same replace-compatible clause shape', () => {
    const w = buildOaklandCrimeWhere(opts)
    expect(w.startsWith("datetime >= '2025-01-01T00:00:00'")).toBe(true)
    expect(w.replace("datetime >= '2025-01-01T00:00:00'", "datetime >= '2024-01-01T00:00:00'")).not.toBe(w)
  })
  it('oakland builder clamps below the query floor — junk trickle returns absence, not data', () => {
    const w = buildOaklandCrimeWhere({ ...opts, dateRange: { start: '1995-01-01', end: '2010-01-01' } })
    expect(w).toContain(`datetime >= '${OAKLAND_CRIME_QUERY_FLOOR}T00:00:00'`)
    expect(w).not.toContain('1995')
  })
  it('oakland builder filters beats and escapes quotes', () => {
    const w = buildOaklandCrimeWhere({ ...opts, selectedNeighborhood: '07X' })
    expect(w).toContain("policebeat = '07X'")
  })
})

describe('adaptOaklandIncident', () => {
  it('adapts a charge row into the modern shape, keeping casenumber and raw crimetype', () => {
    const a = adaptOaklandIncident({
      casenumber: '25-041192', datetime: '2025-09-18T10:13:00.000', crimetype: 'NARCOTICS',
      description: 'MAINTAIN PUBLIC NUISANCE', policebeat: '04X', address: '00 BROADWAY',
      location: { type: 'Point', coordinates: [-122.28217, 37.81166] },
    })
    expect(a).toMatchObject({
      incident_id: '25-041192', casenumber: '25-041192', incident_category: 'NARCOTICS',
      analysis_neighborhood: '04X', cad_number: '', resolution: '',
      latitude: 37.81166, longitude: -122.28217,
    })
  })
  it('null geo yields null coords, not a dropped row', () => {
    const a = adaptOaklandIncident({ casenumber: 'x', datetime: '2025-01-01T00:00:00.000', crimetype: 'OTHER' })
    expect(a?.latitude).toBeNull()
  })
  it('count expression is the distinct-case aggregate', () => {
    expect(OAKLAND_CRIME_COUNT).toBe('count(distinct casenumber)')
  })
})

describe('distinctCases (symmetric dedupe fence)', () => {
  // Verify critical #1: the current side arrives PRE-deduped from the view
  // while the comparison side is a raw charge-row fetch. Both sides go
  // through distinctCases, which must be IDEMPOTENT — same answer for raw
  // and pre-deduped inputs, or every Oakland delta fabricates a decline.
  it('is idempotent: raw charge rows and pre-deduped rows agree', () => {
    const raw = [
      { casenumber: 'A' }, { casenumber: 'A' }, { casenumber: 'A' },
      { casenumber: 'B' }, { casenumber: 'C' },
    ]
    const deduped = [{ casenumber: 'A' }, { casenumber: 'B' }, { casenumber: 'C' }]
    expect(distinctCases(raw)).toBe(3)
    expect(distinctCases(raw)).toBe(distinctCases(deduped))
  })
  it('rows without a casenumber count individually', () => {
    expect(distinctCases([{ casenumber: 'A' }, {}, {}])).toBe(3)
  })
})
