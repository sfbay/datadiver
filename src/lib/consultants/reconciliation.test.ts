/**
 * Standing pins over the COMMITTED campaign-consultant reconciliation artifact
 * (`public/data/consultants/reconciliation.json`). Reads the file from disk —
 * never the network. If one of these fails, either the artifact was regenerated
 * against changed data (rerun `pnpm build:consultants` and read its gate report)
 * or a crosswalk drifted; never "fix" it by hand-editing the JSON.
 *
 * Two kinds of pin live here:
 *   STRUCTURAL — gates, redaction, exclusion. These must hold at every filing
 *   deadline forever; a failure is a bug in the generator or the crosswalks.
 *   STORY — the recon memo's exact-to-the-dollar reconciliations (AL Media,
 *   Kazin/Canal Partners, the SF Believes 2026 divergence). These are the
 *   findings the lens will publish; a failure means the underlying money moved
 *   and the finding needs re-reporting, not silencing.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONSULTANT_ALIASES } from '../../cities/sf/consultants/consultantAliases'
import { ARTIFACT_PATH, PROJECTION } from '../../../scripts/build-consultant-recon'
import type { ReconciliationArtifact } from '../../../scripts/build-consultant-recon'

const artifact = JSON.parse(
  readFileSync(join(process.cwd(), ARTIFACT_PATH), 'utf8')
) as ReconciliationArtifact

/** Every key name anywhere in the parsed JSON (objects and nested arrays alike). */
function allKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const v of value) allKeys(v, out)
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.push(k)
      allKeys(v, out)
    }
  }
  return out
}

const PII_KEY = /phone|streetaddress|fulladdress|employertelephone|employees_name/i

/** Every string VALUE anywhere in the parsed JSON. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out)
  else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) allStrings(v, out)
  }
  return out
}

const PII_VALUE: { name: string; re: RegExp }[] = [
  { name: 'phone number', re: /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/ },
  {
    name: 'street address',
    re: /\b\d+\s+\w+\s+(St|Street|Ave|Avenue|Blvd|Dr|Drive|Apt)\b/,
  },
]

describe('reconciliation artifact — provenance', () => {
  it('carries a provenance header with at least five sources', () => {
    expect(artifact.provenance.generator).toBe('scripts/build-consultant-recon.ts')
    expect(artifact.provenance.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(artifact.provenance.sources.length).toBeGreaterThanOrEqual(5)
    for (const s of artifact.provenance.sources) {
      expect(s.id).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/)
      expect(s.rowsUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(s.rowCount).toBeGreaterThan(0)
    }
  })

  it('names the recipes the figures depend on', () => {
    const r = artifact.provenance.recipes
    expect(r.latestRule).toContain('filingseries')
    expect(r.restatement).toBeTruthy()
    expect(r.schE).toBeTruthy()
    expect(r.undated).toBeTruthy()
    expect(r.contributions).toBeTruthy()
  })
})

describe('reconciliation artifact — gates', () => {
  it('dedupe: latest-per-series count equals the distinct series count (never a literal)', () => {
    expect(artifact.gates.latestCount).toBe(artifact.gates.distinctSeries)
    expect(artifact.gates.latestCount).toBeGreaterThan(0)
  })

  it('join integrity: zero orphan child rows', () => {
    expect(artifact.gates.orphans).toBe(0)
  })

  it('conservation: zero child-sum vs parent-total mismatches', () => {
    expect(artifact.gates.conservationMismatches).toBe(0)
  })

  it('identity: nothing unmapped in either crosswalk', () => {
    expect(artifact.gates.unmappedConsultants).toEqual([])
    expect(artifact.gates.unmappedClients).toEqual([])
  })
})

describe('reconciliation artifact — redaction is structural', () => {
  it('no key anywhere in the JSON is a phone, address, or employee-name field', () => {
    const offenders = allKeys(artifact).filter((k) => PII_KEY.test(k))
    expect(offenders).toEqual([])
  })

  it('the parent projection itself excludes every phone/address column', () => {
    expect(PROJECTION.length).toBeGreaterThan(10)
    expect(PROJECTION.filter((c) => PII_KEY.test(c))).toEqual([])
  })

  it('no string VALUE reads as a phone number or a street address either', () => {
    // Keys alone are not enough: the authored `reason` and `evidence` prose is
    // free text, and describing a junk filer's fantasy address is one careless
    // sentence away from reproducing a real person's home address.
    const strings = allStrings(artifact)
    expect(strings.length).toBeGreaterThan(100)
    for (const { name, re } of PII_VALUE) {
      const offenders = strings.filter((v) => re.test(v))
      expect(offenders, `${name} found in an artifact string`).toEqual([])
    }
  })
})

describe('reconciliation artifact — the two junk filings are excluded, not merely unresolved', () => {
  const excludedIds = artifact.excluded.map((e) => e.envelope)

  it('both junk envelopes are listed with a reason', () => {
    expect(excludedIds).toContain('89f7b62b-be1f-4fc4-900a-22aba667b59c')
    expect(excludedIds).toContain('c99a90cf-9699-4669-ae9e-4202212061b4')
    for (const e of artifact.excluded) expect(e.reason.length).toBeGreaterThan(40)
  })

  it('no receipt, filing, or restatement anywhere references an excluded envelope', () => {
    const envelopeKeys = new Set(['envelope', 'keptEnvelope', 'droppedEnvelope'])
    const seen: string[] = []
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const v of value) walk(v)
      } else if (value !== null && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (envelopeKeys.has(k) && typeof v === 'string') seen.push(v)
          walk(v)
        }
      }
    }
    for (const c of artifact.consultants) walk(c)
    for (const id of excludedIds) expect(seen).not.toContain(id)
  })

  it("the junk filer's $152,000 'Caesar Kamila' client is in no total", () => {
    const strings = artifact.consultants.flatMap((c) => c.receipts.map((r) => r.clientString))
    expect(strings).not.toContain('Caesar Kamila')
    expect(artifact.unresolvedClients.map((u) => u.clientString)).not.toContain('Caesar Kamila')
    const amounts = artifact.consultants.flatMap((c) => c.receipts.map((r) => r.reported))
    expect(amounts).not.toContain(152000)
  })
})

describe('reconciliation artifact — authored envelope-level corrections', () => {
  it('drops the AGENCY double filing and keeps the Termination that carries the true period', () => {
    const dup = artifact.overrides.duplicates.find(
      (d) => d.envelope === '59d2f802-601a-47bc-88e2-d629a125d7eb'
    )
    expect(dup).toBeDefined()
    expect(dup!.duplicateOf).toBe('bd2d3c05-88b2-4c60-aca0-42162096666d')
    expect(dup!.droppedTotal).toBe(449484.5)
    expect(dup!.reason).toMatch(/AGENCY/)
  })

  it('AGENCY reports 449,484.50 — not the 898,969 the two copies add up to', () => {
    const agency = artifact.consultants.find((c) => c.id === 'agency')
    expect(agency).toBeDefined()
    const reported = agency!.receipts.reduce((s, r) => s + r.reported, 0)
    expect(reported).toBe(449484.5)
    expect(reported).not.toBe(898969)
  })

  it('no consultant reaches the top ten on a doubled figure', () => {
    // The top ten is the table a reader sees first. AGENCY entered it at 898,969
    // before the duplicate was authored, displacing SGR Consulting and Anderson
    // Political — a ranking artifact of one filer submitting the same report twice.
    const top10 = [...artifact.consultants]
      .sort((a, b) => b.totals.reported - a.totals.reported)
      .slice(0, 10)
    expect(top10.map((c) => c.totals.reported)).not.toContain(898969)
    expect(top10.map((c) => c.id)).toContain('sgr-consulting')
  })

  it('every corrected quarterly now begins on or before the day it was signed', () => {
    const corrected = artifact.consultants.flatMap((c) =>
      c.quarterlies.filter((q) => q.periodCorrected)
    )
    expect(corrected.length).toBeGreaterThanOrEqual(12)
    for (const q of corrected) {
      // The defect being corrected: a quarter cannot be reported before it starts.
      expect(q.periodStart <= q.datesigned.slice(0, 10), `${q.envelope} still impossible`).toBe(true)
      // Both figures stay published — the correction is disclosed, never silent.
      expect(q.originalPeriodStart).toBeDefined()
      expect(q.originalPeriodEnd).toBeDefined()
      expect(q.periodStart < q.originalPeriodStart!).toBe(true)
    }
  })

  it('leaves an indeterminate period exactly as filed, with its reason', () => {
    for (const u of artifact.overrides.uncorrectable) {
      expect(u.periodStart > u.datesigned.slice(0, 10)).toBe(true)
      expect(u.reason).toMatch(/no correction is determinate/)
    }
  })
})

describe('reconciliation artifact — story pins from the recon memo §4', () => {
  const pairs = artifact.consultants.flatMap((c) => c.reconciliation)

  it('AL Media / Safer SF for Farrell, Sep–Nov 2024: reported == schE == 2,553,984', () => {
    const pair = pairs.find((p) => p.consultantId === 'al-media' && p.periodStart === '2024-09-01')
    expect(pair).toBeDefined()
    expect(pair!.reported).toBe(2553984)
    expect(pair!.schE).toBe(2553984)
    expect(pair!.exactMatch).toBe(true)
  })

  it('Kazin ↔ Canal Partners Media: Σ reported == Σ schE == 1,011,584', () => {
    const kazin = artifact.consultants.find((c) => c.id === 'kazin')
    expect(kazin).toBeDefined()
    const reported = kazin!.reconciliation.reduce((s, p) => s + p.reported, 0)
    const schE = kazin!.reconciliation.reduce((s, p) => s + p.schE, 0)
    expect(reported).toBe(1011584)
    expect(schE).toBe(1011584)
  })

  it('The Media Company ↔ SF Believes, Mar–May 2026: reported is under a quarter of Schedule E', () => {
    const pair = pairs.find(
      (p) =>
        p.consultantId === 'media-company' &&
        p.filerNid === '215606983' &&
        p.periodStart === '2026-03-01'
    )
    expect(pair).toBeDefined()
    expect(pair!.schE).toBeGreaterThan(0)
    expect(pair!.reported / pair!.schE).toBeLessThan(0.25)
  })

  /**
   * A FLOOR, not equality — a new filing can only add rows. 19, not the recon
   * memo's headline 21, is the number that is reachable by this pipeline, and
   * the arithmetic is exact rather than approximate: 26 priced rows survive the
   * restatement collapse (the memo's 27 counts Heisler's $250 twice, under both
   * her Quarterly and her Termination); 5 name a recipient that does not file
   * with SF Ethics at all (Scott Wiener's state senate committee, Barbara Lee
   * for Oakland Mayor, Connie Chan for Congress, Maffei for Superior Court, and
   * the San Francisco Firefighters Slate Mailer — the memo counted that last one
   * by finding a $20,000 Schedule C IN-KIND booked to a DIFFERENT committee,
   * which is not the slate mailer receiving money and is not something a
   * recipient-scoped match can or should do); and 2 fall under the $100
   * itemization threshold, so the recipient never had to list them. 26 − 5 − 2
   * = 19, and all 19 currently reconcile — zero 'unmatched'.
   */
  it('every structurally matchable contribution is corroborated in the recipient’s own ledger', () => {
    const all = artifact.consultants.flatMap((c) => c.contributions)
    const matched = all.filter((m) => m.matched === 'exact' || m.matched === 'principal')
    expect(matched.length).toBeGreaterThanOrEqual(19)
    expect(all.filter((m) => m.matched === 'unmatched')).toEqual([])
  })
})

describe('reconciliation artifact — the figures are self-consistent', () => {
  const round2 = (n: number): number => Math.round(n * 100) / 100
  const pairs = artifact.consultants.flatMap((c) => c.reconciliation)

  it('the whole subtraction chain closes to the cent', () => {
    // Everything published is the city's own child ledger minus three authored
    // removals. If this does not close, one removal is double-counting or missing
    // money and no headline built on `reportedAll` can be trusted.
    const excluded = artifact.excluded.reduce((s, e) => s + e.reportedTotal, 0)
    const duplicates = artifact.overrides.duplicates.reduce((s, d) => s + d.droppedChildSum, 0)
    const restated = artifact.consultants
      .flatMap((c) => c.restatementsCollapsed)
      .reduce((s, r) => s + r.droppedChildSum, 0)
    expect(
      round2(artifact.totals.childReportedRaw - excluded - duplicates - restated)
    ).toBe(artifact.totals.reportedAll)
  })

  it('every published total is the sum of its own parts', () => {
    const receipts = artifact.consultants.flatMap((c) => c.receipts)
    expect(round2(receipts.reduce((s, r) => s + r.reported, 0))).toBe(artifact.totals.reportedAll)
    expect(round2(pairs.reduce((s, p) => s + p.reported, 0))).toBe(artifact.totals.reportedReconcilable)
    expect(round2(artifact.consultants.reduce((s, c) => s + c.totals.schE, 0))).toBe(artifact.totals.schE)
    expect(round2(artifact.consultants.reduce((s, c) => s + c.totals.schG, 0))).toBe(artifact.totals.schG)
    expect(receipts.length).toBe(artifact.totals.receipts)
    expect(pairs.length).toBe(artifact.totals.pairs)
  })

  it('a receipt group never draws from two envelopes for one committee and period', () => {
    // Two envelopes reporting the same client for the same quarter is the
    // duplicate-filing signature; if one ever survives the scan, this catches it
    // downstream at the only place it changes a number.
    for (const c of artifact.consultants) {
      const byGroup = new Map<string, Set<string>>()
      for (const r of c.receipts) {
        if (!r.filerNid) continue
        const k = `${r.filerNid}::${r.periodStart}`
        const set = byGroup.get(k) ?? new Set<string>()
        set.add(r.envelope)
        byGroup.set(k, set)
      }
      for (const [k, envelopes] of byGroup) {
        expect([...envelopes], `${c.id} ${k} draws from ${envelopes.size} envelopes`).toHaveLength(1)
      }
    }
  })

  it('an undated Schedule E row is counted once across the WHOLE artifact', () => {
    // Keyed on (filerNid, transaction_id) with no consultant in the key: one
    // committee's payment can be caught by two consultants' payee patterns, and
    // counting it under both is the same dollar twice.
    const seen = new Map<string, string>()
    for (const p of pairs) {
      for (const tx of p.undatedTransactionIds) {
        const k = `${p.filerNid}::${tx}`
        expect(seen.get(k), `${k} counted twice`).toBeUndefined()
        seen.set(k, `${p.consultantId}/${p.periodStart}`)
      }
    }
    expect(seen.size).toBeGreaterThan(0)
  })

  it('an exact match is never published on a comparison that is not sound', () => {
    // Before this rule two pairs published `ratio: null, status:
    // 'no-payee-ledger'` AND `exactMatch: true` in the same object, and the
    // headline count included pairs where reported === schE === 0.
    for (const p of pairs) {
      if (!p.exactMatch) continue
      expect(p.status, `${p.consultantId}/${p.filerNid} matches on an unsound comparison`).toBe('reconciled')
      expect(p.reported, `${p.consultantId}/${p.filerNid} matches on $0`).toBeGreaterThan(0)
      expect(p.ratio).not.toBeNull()
    }
    expect(pairs.filter((p) => p.exactMatch).length).toBe(artifact.totals.exactMatchPairs)
    expect(artifact.totals.exactMatchPairs).toBeGreaterThan(0)
  })
})

describe('reconciliation artifact — a number is withheld where it would be a claim', () => {
  const pairs = artifact.consultants.flatMap((c) => c.reconciliation)

  it('a committee with no Schedule E gets a null ratio, never a 0.00 omission', () => {
    const noLedger = pairs.filter((p) => p.committeeHasScheduleE === false)
    expect(noLedger.length).toBeGreaterThan(0)
    for (const p of noLedger) {
      expect(p.ratio, `${p.consultantId}/${p.filerNid} publishes a ratio with no payee ledger`).toBeNull()
      expect(p.status).toBe('no-payee-ledger')
    }
    // And the committee rollup says so too, so a consumer never has to infer it.
    const flagged = artifact.committees.filter((c) => c.hasScheduleE === false)
    expect(flagged.length).toBeGreaterThan(0)
  })

  it('an impossible reporting period gets a null ratio, no deadline, and no days-late', () => {
    const impossible = pairs.filter((p) => p.status === 'period-impossible')
    expect(impossible.length).toBe(artifact.overrides.uncorrectable.length)
    for (const p of impossible) expect(p.ratio).toBeNull()

    const quarterlies = artifact.consultants.flatMap((c) =>
      c.quarterlies.filter((q) => q.periodImpossible)
    )
    expect(quarterlies.length).toBe(artifact.overrides.uncorrectable.length)
    for (const q of quarterlies) {
      // "172 days early" would be measuring the typo, not the filer.
      expect(q.deadline).toBeNull()
      expect(q.daysLate).toBeNull()
    }
  })

  it("discloses the envelopes that declare client money and publish no client rows", () => {
    // SGR Consulting's Sep–Nov 2024 filing declares $403,889.62 with nothing in
    // m75g-xpci. It is a real gap in the city's data; hiding it would be the lie.
    const sgr = artifact.gates.parentOnlyEnvelopes.find(
      (e) => e.envelope === '9baff337-9bfb-4094-91d6-70331b42b9dc'
    )
    expect(sgr).toBeDefined()
    expect(sgr!.declaredTotal).toBe(403889.62)
  })

  it('a placeholder contribution row is blank, not below-threshold', () => {
    const blanks = artifact.consultants
      .flatMap((c) => c.contributions)
      .filter((m) => m.matched === 'blank')
    expect(blanks.length).toBeGreaterThan(0)
    for (const b of blanks) expect(b.amount).toBe(0)
    const belowThreshold = artifact.consultants
      .flatMap((c) => c.contributions)
      .filter((m) => m.matched === 'below-threshold')
    for (const b of belowThreshold) expect(b.amount).toBeGreaterThan(0)
  })
})

describe('reconciliation artifact — duplicate filings are detected, not just corrected', () => {
  it('leaves no same-consultant, same-report, same-period group unexplained', () => {
    expect(artifact.gates.duplicateGroupsDetected).toBe(0)
  })

  it('drops the Bedford Grove Mar–May 2026 filing that its own superset repeats', () => {
    const dup = artifact.overrides.duplicates.find(
      (d) => d.envelope === '1593b3f6-bef1-847d-8075-d919308371b2'
    )
    expect(dup).toBeDefined()
    expect(dup!.duplicateOf).toBe('bbf8ae37-d87a-8741-820b-d9afd0829e1d')
    expect(dup!.droppedChildSum).toBe(30000)
  })

  it('publishes the advisory same-day scan without gating on it', () => {
    // The Outreach Team signed two DIFFERENT quarters 30 seconds apart on
    // 2025-06-02 — a catch-up filer, not a duplicate. Gating on same-day would
    // break the build on a legitimate filing pattern, so it is published to be
    // read rather than enforced.
    expect(Array.isArray(artifact.gates.sameDayFilings)).toBe(true)
    for (const g of artifact.gates.sameDayFilings) {
      expect(g.envelopes.length).toBeGreaterThan(1)
    }
  })

  it('reports any consultant id that was not in the previously committed artifact', () => {
    expect(Array.isArray(artifact.gates.newConsultantIds)).toBe(true)
  })
})

describe('reconciliation artifact — every consultant id is accounted for', () => {
  it('resolvedBy is always declared and rawNames never empty', () => {
    for (const c of artifact.consultants) {
      expect(['alias', 'mechanical']).toContain(c.resolvedBy)
      expect(c.rawNames.length).toBeGreaterThan(0)
    }
  })

  it('every alias-resolved id really exists in the authored alias table', () => {
    const aliasIds = new Set(CONSULTANT_ALIASES.map((a) => a.id))
    for (const c of artifact.consultants) {
      if (c.resolvedBy !== 'alias') continue
      expect(aliasIds, `${c.id} claims an alias that is not authored`).toContain(c.id)
    }
  })

  it('every reconciliation pair carries the client confidence forward', () => {
    for (const c of artifact.consultants) {
      for (const p of c.reconciliation) {
        expect(['exact', 'inferred', 'uncertain']).toContain(p.clientConfidence)
      }
      for (const r of c.receipts) {
        expect(['exact', 'inferred', 'uncertain']).toContain(r.clientConfidence)
      }
    }
  })
})
