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

describe('reconciliation artifact — every consultant id is accounted for', () => {
  it('resolvedBy is always declared and rawNames never empty', () => {
    for (const c of artifact.consultants) {
      expect(['alias', 'mechanical']).toContain(c.resolvedBy)
      expect(c.rawNames.length).toBeGreaterThan(0)
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
