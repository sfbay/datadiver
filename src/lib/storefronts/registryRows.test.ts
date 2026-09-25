import { describe, expect, it } from 'vitest'
import {
  dedupeByUniqueId,
  isFoodRegistryRow,
  isLandlordRow,
  isOpenRow,
  registryDay,
  type RegistryRow,
} from './registryRows'

// Rows are real g8m3-pdis registrations (research scratch 2026-09-24),
// trimmed to the columns under test.

const row = (r: Partial<RegistryRow>): RegistryRow => ({ uniqueid: 'u', ...r })

describe('isLandlordRow', () => {
  it('drops building registrations named for the building (place probe)', () => {
    expect(isLandlordRow(row({ dba_name: '2077-2095 Hayes St Commercials', full_business_address: '2077 Hayes St' }))).toBe(true)
    expect(isLandlordRow(row({ dba_name: '2077-2095 Hayes', full_business_address: '2077 Hayes St' }))).toBe(true)
    expect(isLandlordRow(row({ dba_name: '570 Green St', full_business_address: '570 Green St #574', self_reported_naics_code: '53111' }))).toBe(true)
    expect(isLandlordRow(row({ dba_name: '570a Greenwich', full_business_address: '570 Greenwich St Unit A', self_reported_naics_code: '721199' }))).toBe(true)
    expect(isLandlordRow(row({ dba_name: 'Sunset Apts', full_business_address: '100 Irving St' }))).toBe(true)
  })

  it('keeps restaurants — including one named for its address, when food-coded', () => {
    expect(isLandlordRow(row({ dba_name: 'Katani Pizza', full_business_address: '2077 Hayes St' }))).toBe(false)
    expect(isLandlordRow(row({ dba_name: '25 Lusk', full_business_address: '25 Lusk St', self_reported_naics_code: '722511' }))).toBe(false)
    expect(isLandlordRow(row({ dba_name: '1300 on Fillmore', full_business_address: '1300 Fillmore St' }))).toBe(false)
    expect(isLandlordRow(row({ dba_name: '', full_business_address: '1300 Fillmore St' }))).toBe(false)
  })
})

describe('food + open filters', () => {
  it('food = NAICS 722 OR a DPH food license (F §2)', () => {
    expect(isFoodRegistryRow(row({ self_reported_naics_code: '722511' }))).toBe(true)
    expect(isFoodRegistryRow(row({ lic: 'D04R H26R' }))).toBe(true) // Noodlepanda, 1055 Taraval
    expect(isFoodRegistryRow(row({ lic: 'H25R P54R RSSFCPR' }))).toBe(true)
    expect(isFoodRegistryRow(row({ lic: 'H86' }))).toBe(true)
    expect(isFoodRegistryRow(row({ lic: 'H31' }))).toBe(false) // tobacco
    expect(isFoodRegistryRow(row({ self_reported_naics_code: '53111' }))).toBe(false)
    expect(isFoodRegistryRow(row({}))).toBe(false)
  })

  it('open = no location end (and no dba end / admin closure when present)', () => {
    expect(isOpenRow(row({}))).toBe(true)
    expect(isOpenRow(row({ location_end_date: '2024-11-01T00:00:00.000' }))).toBe(false)
    expect(isOpenRow(row({ dba_end_date: '2024-11-01T00:00:00.000' }))).toBe(false)
    expect(isOpenRow(row({ administratively_closed: 'true' }))).toBe(false)
  })

  it('cuts registry datetimes to the day', () => {
    expect(registryDay('2015-11-25T00:00:00.000')).toBe('2015-11-25')
    expect(registryDay('')).toBeNull()
    expect(registryDay(undefined)).toBeNull()
  })
})

describe('dedupeByUniqueId', () => {
  it('drops the stray duplicates $offset paging returns', () => {
    const rows = [row({ uniqueid: 'a', dba_name: 'first' }), row({ uniqueid: 'b' }), row({ uniqueid: 'a', dba_name: 'dup' })]
    expect(dedupeByUniqueId(rows).map((r) => r.dba_name ?? r.uniqueid)).toEqual(['first', 'b'])
  })
})
