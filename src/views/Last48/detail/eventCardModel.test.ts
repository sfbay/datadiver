import { describe, it, expect } from 'vitest'
import type { NormalizedEvent } from '@/types/last48'
import {
  DATASET_META, formatAge, formatApDate, compactFields, populatedFields,
  extractId, resolveExplore, locationLine,
} from './eventCardModel'

const base = (over: Partial<NormalizedEvent>): NormalizedEvent => ({
  id: 'x', datasetId: '911-realtime', timestamp: '2026-09-09T15:49:00', receivedAt: 0, raw: {}, ...over,
})

describe('DATASET_META', () => {
  it('pins label + pigment per stream', () => {
    expect(DATASET_META['911-realtime']).toEqual({ label: '911 DISPATCH', color: '#616a96' })
    expect(DATASET_META['fire-ems-dispatch']).toEqual({ label: 'FIRE/EMS', color: '#b85a33' })
    expect(DATASET_META['311-cases']).toEqual({ label: '311 CASE', color: '#7a9954' })
  })
})

describe('formatAge', () => {
  it('seconds → minutes → hours → days with singular forms', () => {
    const now = 1_000_000_000_000
    expect(formatAge(now - 1_000, now)).toEqual({ magnitude: '1', unit: 'second ago' })
    expect(formatAge(now - 43 * 60_000, now)).toEqual({ magnitude: '43', unit: 'minutes ago' })
    expect(formatAge(now - 2 * 3_600_000, now)).toEqual({ magnitude: '2', unit: 'hours ago' })
    expect(formatAge(now - 3 * 86_400_000, now)).toEqual({ magnitude: '3', unit: 'days ago' })
  })
})

describe('formatApDate', () => {
  it('is AP style on the SF calendar', () => {
    // 2026-09-09T22:30:00-07:00 — a Wednesday in SF, already Thursday in UTC
    expect(formatApDate(Date.parse('2026-09-10T05:30:00Z'))).toBe('Wed. Sept. 9')
  })
})

describe('compactFields / populatedFields', () => {
  it('911: disposition + unit; empty values drop', () => {
    const ev = base({ raw: { disposition: 'ADV', unit_id: '' } })
    expect(compactFields(ev)).toEqual([['Disposition', 'ADV'], ['Unit', '—']])
    expect(populatedFields(ev)).toEqual([['Disposition', 'ADV']])
  })
  it('fire: unit + station; 311: status + agency', () => {
    expect(compactFields(base({ datasetId: 'fire-ems-dispatch', raw: { unit_id: 'E01', station_area: '01' } })))
      .toEqual([['Unit', 'E01'], ['Station', '01']])
    expect(compactFields(base({ datasetId: '311-cases', raw: { status: 'Open', agency_responsible: 'DPW' } })))
      .toEqual([['Status', 'Open'], ['Agency', 'DPW']])
  })
})

describe('extractId + resolveExplore', () => {
  it('fire deep-links its incident', () => {
    const ev = base({ datasetId: 'fire-ems-dispatch', raw: { call_number: '2611' } })
    expect(extractId(ev)).toBe('2611')
    expect(resolveExplore(ev)?.to).toBe('/emergency-response?incident=2611')
  })
  it('311 deep-links its case', () => {
    expect(resolveExplore(base({ datasetId: '311-cases', raw: { service_request_id: '99' } }))?.to).toBe('/cases-311?case=99')
  })
  it('911 routes by call type to a place, or to Dispatch when suppressed', () => {
    expect(resolveExplore(base({ neighborhood: 'Mission', callType: 'Aggravated Assault' }))?.to).toBe('/crime-incidents?neighborhood=Mission')
    expect(resolveExplore(base({ neighborhood: 'Mission', callType: 'TRAFFIC STOP' }))?.to).toBe('/emergency-response?neighborhood=Mission')
    expect(resolveExplore(base({ raw: { cad_number: '7' } }))?.to).toBe('/dispatch-911?incident=7')
  })
})

describe('locationLine — the precision word comes first', () => {
  it('911 and fire say nearest intersection', () => {
    expect(locationLine(base({ latitude: 37.7, longitude: -122.4, address: '19th St & Dolores St' })))
      .toEqual({ label: 'Nearest intersection', place: '19th St & Dolores St' })
    expect(locationLine(base({ datasetId: 'fire-ems-dispatch', latitude: 37.7, longitude: -122.4, neighborhood: 'Mission' })))
      .toEqual({ label: 'Nearest intersection', place: 'Mission' })
  })
  it('311 says address', () => {
    expect(locationLine(base({ datasetId: '311-cases', latitude: 37.7, longitude: -122.4, address: '831 Fulton St' })))
      .toEqual({ label: 'Address', place: '831 Fulton St' })
  })
  it('no coordinates → null (the card renders the suppressed line)', () => {
    expect(locationLine(base({}))).toBeNull()
  })
})
