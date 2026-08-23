import { describe, it, expect } from 'vitest';
import { normalizeName, amt, latestPerSeries, collapseRestatements } from './normalize';
import type { ParentRow, ClientRow } from './types';

describe('normalizeName', () => {
  it('treats trailing-period and no-trailing-period Inc as identical', () => {
    expect(normalizeName('Riff City Strategies, Inc.')).toBe(
      normalizeName('Riff City Strategies, Inc')
    );
  });

  it('is idempotent', () => {
    const once = normalizeName('Riff City Strategies, Inc.');
    const twice = normalizeName(once);
    expect(twice).toBe(once);
  });

  it('strips leading/trailing legal-form and joiner tokens', () => {
    expect(normalizeName('The Kazin Group, LLC')).toBe('KAZIN GROUP');
  });
});

describe('amt', () => {
  it('parses a numeric string', () => {
    expect(amt('3394794.14')).toBe(3394794.14);
  });

  it('treats undefined as 0', () => {
    expect(amt(undefined)).toBe(0);
  });

  it('treats null as 0', () => {
    expect(amt(null)).toBe(0);
  });
});

function parentRow(overrides: Partial<ParentRow>): ParentRow {
  return {
    envelope_id: 'env-default',
    filingseries: 'series-default',
    datesigned: '2024-01-01T00:00:00.000',
    filinginformation_reporttype: 'Quarterly Report',
    filinginformation_filingtype: 'Original',
    campaignconsultantname: 'Default Consultant',
    ...overrides,
  };
}

describe('latestPerSeries', () => {
  it('keeps the later-signed row and returns the earlier as superseded', () => {
    const earlier = parentRow({
      envelope_id: 'env-a',
      filingseries: 'series-1',
      datesigned: '2024-12-09T18:54:33.000',
    });
    const later = parentRow({
      envelope_id: 'env-b',
      filingseries: 'series-1',
      datesigned: '2024-12-11T08:33:00.000',
    });

    const { latest, superseded } = latestPerSeries([earlier, later]);

    expect(latest).toEqual([later]);
    expect(superseded).toEqual([earlier]);
  });

  it('throws on a tie', () => {
    const a = parentRow({
      envelope_id: 'env-a',
      filingseries: 'series-tie',
      datesigned: '2024-12-09T18:54:33.000',
    });
    const b = parentRow({
      envelope_id: 'env-b',
      filingseries: 'series-tie',
      datesigned: '2024-12-09T18:54:33.000',
    });

    expect(() => latestPerSeries([a, b])).toThrow();
  });
});

function clientRow(overrides: Partial<ClientRow>): ClientRow {
  return {
    envelope_id: 'env-default',
    entry_id: 'entry-default',
    filingseries: 'series-default',
    clientlist_clientname: 'Default Client',
    clientlist_economicconsiderationreceived: 0,
    ...overrides,
  };
}

const keyOf = (r: ParentRow) => normalizeName(r.campaignconsultantname);

describe('collapseRestatements', () => {
  it('collapses an exact pair: keeps the Termination (signed 25 min later), drops the Quarterly', () => {
    const q = parentRow({
      envelope_id: 'env-q',
      filingseries: 'series-q',
      datesigned: '2024-12-09T18:00:00.000',
      filinginformation_reporttype: 'Quarterly Report',
      campaignconsultantname: 'Acme Consulting',
      filinginformation_reportingperiod_reportingperiodstartdate: '2024-10-01',
      clientinformation_total: '9000',
    });
    const t = parentRow({
      envelope_id: 'env-t',
      filingseries: 'series-t',
      datesigned: '2024-12-09T18:25:00.000',
      filinginformation_reporttype: 'Termination Report',
      campaignconsultantname: 'Acme Consulting',
      filinginformation_reportingperiod_reportingperiodstartdate: '2024-10-01',
      clientinformation_total: '9000',
    });

    const qClients = [clientRow({ envelope_id: 'env-q', entry_id: 'q-1', clientlist_clientname: 'Client Q' })];
    const tClients = [clientRow({ envelope_id: 'env-t', entry_id: 't-1', clientlist_clientname: 'Client T' })];

    const result = collapseRestatements([q, t], [...qClients, ...tClients], keyOf);

    expect(result.clientRows).toEqual(tClients);
    expect(result.restatements).toHaveLength(1);
    expect(result.restatements[0]).toMatchObject({
      keptEnvelope: 'env-t',
      droppedEnvelope: 'env-q',
      exact: true,
      delta: 0,
    });
  });

  it('collapses an inexact pair: keeps the later-signed report, records the delta', () => {
    const q = parentRow({
      envelope_id: 'env-q2',
      filingseries: 'series-q2',
      datesigned: '2024-06-01T10:00:00.000',
      filinginformation_reporttype: 'Quarterly Report',
      campaignconsultantname: 'Beta Strategies',
      filinginformation_reportingperiod_reportingperiodstartdate: '2024-04-01',
      clientinformation_total: '5000',
    });
    const t = parentRow({
      envelope_id: 'env-t2',
      filingseries: 'series-t2',
      datesigned: '2024-06-02T10:00:00.000',
      filinginformation_reporttype: 'Termination Report',
      campaignconsultantname: 'Beta Strategies',
      filinginformation_reportingperiod_reportingperiodstartdate: '2024-04-01',
      clientinformation_total: '10000',
    });

    const result = collapseRestatements([q, t], [], keyOf);

    expect(result.restatements).toHaveLength(1);
    const r = result.restatements[0];
    expect(r.keptEnvelope).toBe('env-t2');
    expect(r.droppedEnvelope).toBe('env-q2');
    expect(r.exact).toBe(false);
    expect(Math.abs(r.delta)).toBe(5000);
  });

  it('leaves a Quarterly with no Termination partner untouched', () => {
    const q = parentRow({
      envelope_id: 'env-lonely-q',
      filingseries: 'series-lonely-q',
      datesigned: '2024-03-01T10:00:00.000',
      filinginformation_reporttype: 'Quarterly Report',
      campaignconsultantname: 'Gamma Group',
      filinginformation_reportingperiod_reportingperiodstartdate: '2024-01-01',
      clientinformation_total: '4000',
    });
    const clients = [clientRow({ envelope_id: 'env-lonely-q', entry_id: 'c-1', clientlist_clientname: 'Client G' })];

    const result = collapseRestatements([q], clients, keyOf);

    expect(result.restatements).toHaveLength(0);
    expect(result.clientRows).toEqual(clients);
  });

  it('leaves two Quarterlies for different consultants in the same period untouched', () => {
    const q1 = parentRow({
      envelope_id: 'env-d1',
      filingseries: 'series-d1',
      datesigned: '2024-05-01T10:00:00.000',
      filinginformation_reporttype: 'Quarterly Report',
      campaignconsultantname: 'Delta Partners',
      filinginformation_reportingperiod_reportingperiodstartdate: '2024-04-01',
      clientinformation_total: '2000',
    });
    const q2 = parentRow({
      envelope_id: 'env-e1',
      filingseries: 'series-e1',
      datesigned: '2024-05-02T10:00:00.000',
      filinginformation_reporttype: 'Quarterly Report',
      campaignconsultantname: 'Epsilon Media',
      filinginformation_reportingperiod_reportingperiodstartdate: '2024-04-01',
      clientinformation_total: '3000',
    });
    const clients = [
      clientRow({ envelope_id: 'env-d1', entry_id: 'c-d1', clientlist_clientname: 'Client D' }),
      clientRow({ envelope_id: 'env-e1', entry_id: 'c-e1', clientlist_clientname: 'Client E' }),
    ];

    const result = collapseRestatements([q1, q2], clients, keyOf);

    expect(result.restatements).toHaveLength(0);
    expect(result.clientRows).toEqual(clients);
  });
});
