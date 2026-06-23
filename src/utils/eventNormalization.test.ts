import { describe, it, expect } from 'vitest'
import { normalizeEvent } from './eventNormalization'

describe('normalizeEvent — street-level address', () => {
  it('911: cleans an intersection_name "\\"-separator into a title-cased label', () => {
    const ev = normalizeEvent('911-realtime', {
      received_datetime: '2026-06-23T07:05:00',
      cad_number: 'P260010001',
      intersection_name: '19TH ST \\ DOLORES ST',
      analysis_neighborhood: 'Mission',
    })
    expect(ev?.address).toBe('19th St & Dolores St')
    expect(ev?.neighborhood).toBe('Mission')
  })

  it('Fire/EMS: cleans an address "/"-separator', () => {
    const ev = normalizeEvent('fire-ems-dispatch', {
      received_dttm: '2026-06-23T09:02:00',
      call_number: '262000001',
      address: 'OFARRELL ST/SHANNON ST',
      neighborhoods_analysis_boundaries: 'Tenderloin',
    })
    expect(ev?.address).toBe('Ofarrell St & Shannon St')
  })

  it('311: drops the city/state/zip tail and title-cases the street address', () => {
    const ev = normalizeEvent('311-cases', {
      requested_datetime: '2026-06-23T08:14:00',
      service_request_id: '17000001',
      address: '455 MINNA ST, SAN FRANCISCO, CA 94103',
      neighborhoods_sffind_boundaries: 'South of Market',
    })
    expect(ev?.address).toBe('455 Minna St')
  })

  it('leaves "19th" lowercase (only word-initial letters upcase)', () => {
    const ev = normalizeEvent('911-realtime', {
      received_datetime: '2026-06-23T07:05:00',
      cad_number: 'P260010002',
      intersection_name: '19TH AVE',
    })
    expect(ev?.address).toBe('19th Ave')
  })

  it('is undefined when the row has no usable location string', () => {
    const ev = normalizeEvent('911-realtime', {
      received_datetime: '2026-06-23T07:05:00',
      cad_number: 'P260010003',
      analysis_neighborhood: 'Mission',
    })
    expect(ev?.address).toBeUndefined()
  })
})
