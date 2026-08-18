import { describe, it, expect } from 'vitest';
import { CONSULTANT_ALIASES, EXCLUDED_ENVELOPES } from './consultantAliases';
import { CLIENT_CROSSWALK } from './clientCrosswalk';
import { normalizeName } from '../../../lib/consultants/normalize';

describe('CONSULTANT_ALIASES', () => {
  it('has unique ids', () => {
    const ids = CONSULTANT_ALIASES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never lists the same raw name under two aliases', () => {
    // Two raw spellings that already share a normalized key MAY sit in one alias
    // (that is what a hand cluster is). What must never happen is one spelling — or one
    // normalized identity — claimed by two different aliases: the generator would then
    // have no deterministic answer for which consultant a filing belongs to.
    const rawSeen = new Map<string, string>();
    const keySeen = new Map<string, string>();
    for (const alias of CONSULTANT_ALIASES) {
      for (const raw of alias.rawNames) {
        const priorRaw = rawSeen.get(raw);
        expect(priorRaw, `raw name "${raw}" appears in both ${priorRaw} and ${alias.id}`).toBeUndefined();
        rawSeen.set(raw, alias.id);

        const key = normalizeName(raw);
        const priorKey = keySeen.get(key);
        if (priorKey !== undefined) {
          expect(priorKey, `normalized name "${key}" is claimed by ${priorKey} and ${alias.id}`).toBe(alias.id);
        }
        keySeen.set(key, alias.id);
      }
    }
  });

  it('gives every alias at least one raw name and at least one payee pattern', () => {
    for (const alias of CONSULTANT_ALIASES) {
      expect(alias.rawNames.length, alias.id).toBeGreaterThan(0);
      expect(alias.payeePatterns.length, alias.id).toBeGreaterThan(0);
      for (const p of alias.payeePatterns) {
        expect(p.trim().length, `${alias.id} empty payee pattern`).toBeGreaterThan(0);
        expect(p, `${alias.id} payee pattern must be upper-case`).toBe(p.toUpperCase());
      }
    }
  });

  it('gives every alias a non-empty note and a known kind', () => {
    for (const alias of CONSULTANT_ALIASES) {
      expect(alias.note.trim().length, alias.id).toBeGreaterThan(0);
      expect(alias.displayName.trim().length, alias.id).toBeGreaterThan(0);
      expect(['hand', 'inferred-dba']).toContain(alias.kind);
    }
  });

  it("scopes the Stearns/Rough House bridge to Stearns's own clients", () => {
    const stearns = CONSULTANT_ALIASES.find((a) => a.payeePatterns.some((p) => p.includes('ROUGH HOUSE')));
    expect(stearns, 'no alias carries a Rough House payee pattern').toBeDefined();
    expect(stearns!.payeeScope).toBe('own-clients');
    expect(stearns!.kind).toBe('inferred-dba');
  });

  it('uses payeeScope only where a bridge is scoped, never on a plain hand cluster', () => {
    for (const alias of CONSULTANT_ALIASES) {
      if (alias.payeeScope !== undefined) {
        expect(alias.payeeScope).toBe('own-clients');
        expect(alias.kind, `${alias.id} scoped bridge must be inferred-dba`).toBe('inferred-dba');
      }
    }
  });

  it('carries the recon’s hand clusters and DBA bridges', () => {
    const byId = new Map(CONSULTANT_ALIASES.map((a) => [a.id, a]));
    // multi-spelling hand clusters the recon named
    for (const id of [
      'cs-communications',
      'amplify-campaigns',
      'bmwl',
      'outset-strategies',
      'paul-kumar',
      'thematic-strategies',
      'gallagher',
      'szabo-associates',
    ]) {
      const alias = byId.get(id);
      expect(alias, `missing hand cluster ${id}`).toBeDefined();
      expect(alias!.kind).toBe('hand');
      expect(alias!.rawNames.length, `${id} should cluster >1 raw spelling`).toBeGreaterThan(1);
    }
    // DBA / affiliate bridges
    for (const [id, pattern] of [
      ['kazin', 'CANAL PARTNERS'],
      ['kmm-strategies', 'KULLY HALL'],
      ['bedford-grove', 'WOLTER SEMPERE'],
      ['agency', 'AGENCY'],
      ['stearns-consulting', 'ROUGH HOUSE'],
    ] as const) {
      const alias = byId.get(id);
      expect(alias, `missing DBA bridge ${id}`).toBeDefined();
      expect(alias!.kind).toBe('inferred-dba');
      expect(alias!.payeePatterns.some((p) => p.includes(pattern)), `${id} lacks ${pattern}`).toBe(true);
    }
  });
});

describe('EXCLUDED_ENVELOPES', () => {
  it('lists the two junk filers by envelope with a reason', () => {
    expect(EXCLUDED_ENVELOPES.length).toBe(2);
    const envelopes = EXCLUDED_ENVELOPES.map((e) => e.envelope);
    expect(new Set(envelopes).size).toBe(envelopes.length);
    for (const e of EXCLUDED_ENVELOPES) {
      expect(e.envelope.trim().length).toBeGreaterThan(0);
      expect(e.reason.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('CLIENT_CROSSWALK', () => {
  it('has unique client strings', () => {
    const strings = CLIENT_CROSSWALK.map((c) => c.clientString);
    expect(new Set(strings).size).toBe(strings.length);
  });

  it('keeps class and filerNid consistent', () => {
    for (const entry of CLIENT_CROSSWALK) {
      if (entry.class === 'committee' || entry.class === 'state' || entry.class === 'resolved-by-money') {
        expect(entry.filerNid, `${entry.clientString} (${entry.class}) needs a filerNid`).toBeTruthy();
        expect(entry.filerName, `${entry.clientString} (${entry.class}) needs a filerName`).toBeTruthy();
      } else {
        expect(entry.filerNid, `${entry.clientString} (${entry.class}) must not carry a filerNid`).toBeUndefined();
        expect(entry.filerName, `${entry.clientString} (${entry.class}) must not carry a filerName`).toBeUndefined();
      }
    }
  });

  it('gives every entry non-empty evidence and a review date', () => {
    for (const entry of CLIENT_CROSSWALK) {
      expect(entry.evidence.trim().length, entry.clientString).toBeGreaterThan(0);
      expect(entry.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('carries the recon’s named unresolved and inferred cases', () => {
    const byString = new Map(CLIENT_CROSSWALK.map((c) => [c.clientString, c]));

    const kamila = byString.get('Caesar Kamila');
    expect(kamila?.class).toBe('unresolved');

    // The three 'Strong(er) Muni for All' spellings match no filer name anywhere, but
    // each reconciles to the dollar against ONE committee — so they are inferences from
    // money, not absences. Pinning the shared filerNid is what stops a future edit from
    // silently splitting them across committees.
    const muni = CLIENT_CROSSWALK.filter((c) => /STRONG(ER)? MUNI/i.test(c.clientString));
    expect(muni.length).toBe(3);
    for (const m of muni) {
      expect(m.class).toBe('resolved-by-money');
      expect(m.filerNid).toBe('214099226');
    }

    const peskinOpp = byString.get('San Franciscans Opposed to Aaron Peskin for Mayor 2024');
    expect(peskinOpp?.class).toBe('resolved-by-money');
    expect(peskinOpp?.filerName).toBe('Residents Opposing Aaron Peskin for Mayor 2024');

    const stateRows = CLIENT_CROSSWALK.filter((c) => c.class === 'state');
    expect(stateRows.length).toBe(2);
    expect(stateRows.some((c) => /WIENER/i.test(c.clientString))).toBe(true);
    expect(stateRows.some((c) => /MANDELMAN/i.test(c.clientString))).toBe(true);
  });

  it('has at least one entry per class the generator can hit', () => {
    const classes = new Set(CLIENT_CROSSWALK.map((c) => c.class));
    for (const k of ['committee', 'candidate-only', 'state', 'resolved-by-money', 'unresolved']) {
      expect(classes.has(k as never), `no entry of class ${k}`).toBe(true);
    }
  });
});
