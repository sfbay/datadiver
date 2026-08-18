// AUTHORED DATA — envelope-level corrections the mechanical rules cannot make.
//
// Two rules in `src/lib/consultants/normalize.ts` are deliberately narrow, and each
// leaves one class of filer error standing:
//
//   * `latestPerSeries` dedupes VERSIONS of one report, keyed on `filingseries` —
//     which embeds the consultant's own spelling of its name AND its own typing of
//     the reporting-period start. A filer who re-files the same report under a
//     different report type and a different period lands in a NEW series, so both
//     copies survive and the money doubles.
//   * `collapseRestatements` collapses a Quarterly/Termination pair only when both
//     carry the SAME `reportingperiodstartdate`. The same typo defeats it.
//
// Neither rule should be loosened: a fuzzier dedupe would silently drop real
// filings. So the residue is corrected here, ONE AUTHORED ROW PER ENVELOPE, with
// the evidence written down and both figures published — the generator emits every
// row below under the artifact's `overrides` block, and the corrected quarterlies
// carry `periodCorrected: true` beside their original dates. Nothing here is
// inferred by pattern; each row was read against live `iv34-5p9x` on 2026-08-18.
//
// Envelope ids are the key, never names — a legitimate later filing under any name
// or period is unaffected.

/** One filing that is a second copy of another, not a distinct report. */
export interface DuplicateEnvelope {
  /** The envelope to DROP. */
  envelope: string
  /** The envelope it duplicates, which is kept. */
  duplicateOf: string
  /** Why these are one filing, and why the kept one is the right survivor. */
  reason: string
}

/**
 * A filing whose reporting period is impossible as typed — it begins AFTER the
 * filer signed it. A quarter cannot be reported before it starts.
 */
export interface PeriodOverride {
  envelope: string
  /** The period exactly as filed ('YYYY-MM-DD'). */
  originalStart: string
  originalEnd: string
  /** The corrected period. Same length as the original — only the year moves. */
  correctedStart: string
  correctedEnd: string
  /** What makes the correction determinate rather than a guess. */
  reason: string
}

/**
 * The AGENCY double filing. Both envelopes declare the identical $449,484.50 and
 * were signed 13 minutes 35 seconds apart on the same afternoon; the recon memo
 * (§4) reports the deduped $449,484.50 and calls the double filing "the flaw"
 * while correcting the record that AGENCY itself is a real Des Moines firm, not
 * junk. Left uncorrected, the consultant reads as reporting $898,969 against a
 * committee Schedule E of $453,053.54 — a fabricated 0.50 ratio where the true
 * pair reconciles at 1.008.
 */
export const DUPLICATE_ENVELOPES: DuplicateEnvelope[] = [
  {
    envelope: '59d2f802-601a-47bc-88e2-d629a125d7eb',
    duplicateOf: 'bd2d3c05-88b2-4c60-aca0-42162096666d',
    reason:
      "AGENCY filed the same $449,484.50 twice on 2025-03-05, 13m35s apart: a Quarterly Report signed 16:46:25 for a period typed 2025-09-01 to 2025-11-30, and a Termination Report signed 17:00:00 for 2024-09-01 to 2024-11-05. The Quarterly is dropped and the Termination kept because the Termination's period is the true one — AGENCY's client is Safer San Francisco for Mark Farrell for Mayor 2024, whose 9 Schedule E payments to payee 'Agency' ($453,053.54) all fall in October 2024, and because the Quarterly's period had not yet begun on the day it was signed. The two land in different `filingseries` (the string embeds report type and period start), so latestPerSeries cannot see the pair, and their period starts differ, so collapseRestatements cannot either.",
  },
]

/**
 * Fifteen filings in this family carry a reporting period that had not started
 * when the filer signed. Every row below is the same mechanical slip — a year
 * typed forward — and is corrected only where the one-year shift lands the whole
 * period at or before the signature AND matches the quarter the signature date
 * actually belongs to (quarterlies are due Mar 15 / Jun 15 / Sep 15 / Dec 15 for
 * the quarter that just closed). Where a one-year shift is not clearly the right
 * correction, NO row appears here — the generator reports that filing under
 * `overrides.uncorrectable` instead and leaves its dates as filed.
 */
export const PERIOD_OVERRIDES: PeriodOverride[] = [
  // ── Signed March 2025, filed for the Dec 2024–Feb 2025 quarter (due 2025-03-17) ──
  {
    envelope: '33d7f30c-e4db-4022-a58c-94e3b1ebd944',
    originalStart: '2025-12-01',
    originalEnd: '2026-02-28',
    correctedStart: '2024-12-01',
    correctedEnd: '2025-02-28',
    reason:
      'The Baughman Company Inc DBA BaughmanMerrill signed 2025-03-04, eleven days before the 2025-03-17 deadline for the Dec 2024–Feb 2025 quarter; the period as typed begins nine months after the signature. One year back lands it exactly on that quarter.',
  },
  {
    envelope: 'f2bb9a64-2f55-41e5-99c3-9676406b55f4',
    originalStart: '2025-12-01',
    originalEnd: '2026-02-28',
    correctedStart: '2024-12-01',
    correctedEnd: '2025-02-28',
    reason:
      'Bedford Grove signed 2025-03-05, twelve days before the 2025-03-17 deadline for the Dec 2024–Feb 2025 quarter; the period as typed begins nine months after the signature. One year back lands it exactly on that quarter.',
  },
  {
    envelope: '75372fe8-0d89-4eba-bc53-7b29270ecd67',
    originalStart: '2025-12-01',
    originalEnd: '2026-02-28',
    correctedStart: '2024-12-01',
    correctedEnd: '2025-02-28',
    reason:
      'Nathan Allbee signed 2025-03-20, three days after the 2025-03-17 deadline for the Dec 2024–Feb 2025 quarter; the period as typed begins nine months after the signature. One year back lands it exactly on that quarter.',
  },
  {
    envelope: 'fd4be27e-7ec3-41ff-97a1-5d52222b2934',
    originalStart: '2025-12-01',
    originalEnd: '2026-02-28',
    correctedStart: '2024-12-01',
    correctedEnd: '2025-02-28',
    reason:
      'Storefront Political Media signed 2025-04-08, after the 2025-03-17 deadline for the Dec 2024–Feb 2025 quarter; the period as typed begins eight months after the signature. One year back lands it exactly on that quarter — and makes this filing 22 days late rather than 347 days early.',
  },

  // ── Signed March 2026, filed for the Dec 2025–Feb 2026 quarter (due 2026-03-16) ──
  {
    envelope: '65efccfe-919a-4209-99f4-1350a81991da',
    originalStart: '2026-12-01',
    originalEnd: '2027-02-28',
    correctedStart: '2025-12-01',
    correctedEnd: '2026-02-28',
    reason:
      'Jamie Hughes signed 2026-03-04 ($20,000 of clients), twelve days before the 2026-03-16 deadline for the Dec 2025–Feb 2026 quarter; the period as typed begins nine months after the signature. One year back lands it exactly on that quarter.',
  },
  {
    envelope: '013e5323-9441-4c78-8b0c-787abf094a1a',
    originalStart: '2026-12-01',
    originalEnd: '2027-02-28',
    correctedStart: '2025-12-01',
    correctedEnd: '2026-02-28',
    reason:
      'CleanSweep Campaigns signed 2026-03-09, seven days before the 2026-03-16 deadline for the Dec 2025–Feb 2026 quarter; the period as typed begins nine months after the signature. One year back lands it exactly on that quarter.',
  },
  {
    envelope: '14293994-9c87-46e0-9855-dc4c7e6b402a',
    originalStart: '2026-12-01',
    originalEnd: '2027-02-28',
    correctedStart: '2025-12-01',
    correctedEnd: '2026-02-28',
    reason:
      "The Media Company LLC signed 2026-03-13 ($10,000 of clients), three days before the 2026-03-16 deadline for the Dec 2025–Feb 2026 quarter; the period as typed begins nine months after the signature. One year back lands it exactly on that quarter. This is the surviving envelope of the filer's Original→Amendment pair on filingseries 'The Media Company LLC_Quarterly Report_12-1-2026' (the superseded 2026-03-09 copy carries the same typo and is dropped by latestPerSeries before overrides are applied).",
  },
  {
    envelope: '1138b89a-1235-48b3-a79f-0f496409039f',
    originalStart: '2026-12-01',
    originalEnd: '2027-02-28',
    correctedStart: '2025-12-01',
    correctedEnd: '2026-02-28',
    reason:
      'The Baughman Company Inc DBA BaughmanMerrill signed 2026-03-11, five days before the 2026-03-16 deadline for the Dec 2025–Feb 2026 quarter; the period as typed begins nine months after the signature. Same slip as this filer made a year earlier. One year back lands it exactly on that quarter.',
  },
  {
    envelope: '21dacb4a-92cd-489f-97d5-22f87de411e7',
    originalStart: '2026-12-01',
    originalEnd: '2027-02-28',
    correctedStart: '2025-12-01',
    correctedEnd: '2026-02-28',
    reason:
      'John Gallagher signed 2026-03-16 ($9,846.15 of clients) — the deadline day itself for the Dec 2025–Feb 2026 quarter; the period as typed begins nine months after the signature. One year back lands it exactly on that quarter.',
  },
  {
    envelope: '8ef6e2be-8c7b-40c2-bbf8-e866e99a2302',
    originalStart: '2026-12-01',
    originalEnd: '2027-02-28',
    correctedStart: '2025-12-01',
    correctedEnd: '2026-02-28',
    reason:
      'Growth Political Strategies signed 2026-03-16 ($1,500 of clients) — the deadline day itself for the Dec 2025–Feb 2026 quarter; the period as typed begins nine months after the signature. One year back lands it exactly on that quarter.',
  },
  {
    envelope: '675751b3-3e67-4e7c-af5d-a4ce22df3e8b',
    originalStart: '2026-12-01',
    originalEnd: '2027-02-28',
    correctedStart: '2025-12-01',
    correctedEnd: '2026-02-28',
    reason:
      'Bedford Grove signed 2026-03-18 ($25,000 of clients), two days after the 2026-03-16 deadline for the Dec 2025–Feb 2026 quarter; the period as typed begins nine months after the signature. Same slip as this filer made a year earlier. One year back lands it exactly on that quarter.',
  },
  {
    envelope: '21f8c1b2-c67f-43c7-93ca-6147942be63a',
    originalStart: '2026-12-01',
    originalEnd: '2027-02-28',
    correctedStart: '2025-12-01',
    correctedEnd: '2026-02-28',
    reason:
      "Nathan Allbee signed 2026-03-22 ($24,000 of clients), six days after the 2026-03-16 deadline for the Dec 2025–Feb 2026 quarter; the period as typed begins nine months after the signature. Corroborated independently by the client crosswalk: the 'Strong Muni for All' row resolves by exact-dollar equality against Daniel Lurie Ballot Measure Committee payments of $12,000 on 2025-12-31 and $6,000 on 2026-02-17 — inside the corrected Dec 2025–Feb 2026 window, and nowhere near the period as typed.",
  },
]
