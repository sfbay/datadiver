import { describe, expect, it } from 'vitest'
import {
  cleanOwnerName,
  isCompany,
  isUndeliverableMailing,
  mailCityLabel,
  ownerKind,
  ownerOf,
} from './ownerLabel'

// Owner names and mailing fields are real g8m3-pdis values (probed live on
// data.sf.gov 2026-09-24).

describe('isCompany', () => {
  it('reads registered suffixes in every punctuation', () => {
    for (const n of [
      "Pete's On Green LLC", 'Red Smart LLC', 'Brew Vino, LLC', 'Noodlepanda Inc', "Macy's, Inc.",
      '1800 Fillmore Corp', 'Starbucks Corporation', 'Bon Appetit Management Co', 'Sodexo Operations, LLC',
      'Horvitz & Levy Llp', 'Example L.L.C.', 'Example Ltd', 'Example PC',
    ]) {
      expect(isCompany(n), n).toBe(true)
    }
  })

  it('accepts the authored suffixless companies', () => {
    expect(isCompany('Levy Restaurants')).toBe(true)
    expect(isCompany('Smg')).toBe(true)
  })

  it('when in doubt, it is not a company', () => {
    for (const n of ['Aguilar Marco', 'Kungfu Noodle Express', 'Petersen Adele Etal', 'Casey Marquez', 'Tacos El Cowboy', '', null]) {
      expect(isCompany(n), String(n)).toBe(false)
    }
  })
})

describe('ownerKind', () => {
  it('company / individual / unknown', () => {
    expect(ownerKind('Red Smart LLC')).toBe('company')
    expect(ownerKind('Aguilar Marco')).toBe('individual')
    expect(ownerKind('Carlos Zarate Ambrocio')).toBe('individual')
    expect(ownerKind('Levy David & Erlanger William')).toBe('individual')
    expect(ownerKind('Kungfu Noodle Express')).toBe('unknown')
    expect(ownerKind('Petersen Adele Etal')).toBe('unknown')
    expect(ownerKind('Levy Family Trust')).toBe('unknown')
    expect(ownerKind('Avocado Green')).toBe('individual') // a person-shaped business name stays person-safe
    expect(ownerKind('Smg')).toBe('company')
    expect(ownerKind('')).toBe('unknown')
  })
})

describe('owner names are published as registered (§11)', () => {
  it('collapses whitespace and nothing else', () => {
    expect(cleanOwnerName('  Aguilar   Marco ')).toBe('Aguilar Marco')
    expect(cleanOwnerName("A - Z Hospitality LLC Of San Francisco")).toBe('A - Z Hospitality LLC Of San Francisco')
  })
})

describe('mailing city', () => {
  it('is the plain city name — no state, no label', () => {
    expect(mailCityLabel({ mailing_address_1: '1538 Palou Ave', mail_city: 'Daly City' })).toBe('Daly City')
    expect(mailCityLabel({ mailing_address_1: 'Po Box 34442 Tax2', mail_city: 'Seattle' })).toBe('Seattle')
    expect(mailCityLabel({ mailing_address_1: '1 Main St', mail_city: 'San  Francisco' })).toBe('San Francisco')
    expect(mailCityLabel({ mailing_address_1: '1 Main St', mail_city: 'SOUTH SAN FRANCISCO' })).toBe('South San Francisco')
  })

  it("is NULL on the undeliverable placeholder — never the placeholder's 'San Francisco'", () => {
    expect(mailCityLabel({ mailing_address_1: '0000 Undeliverable Mail', mail_city: 'San Francisco' })).toBeNull()
    expect(mailCityLabel({ mailing_address_1: '9999 Undeliverable St', mail_city: 'San Francisco' })).toBeNull()
    expect(mailCityLabel({ mailing_address_1: '0000 UNDELIVERABLE MAIL', mail_city: 'San Francisco' })).toBeNull()
  })

  it('is null when blank', () => {
    expect(mailCityLabel({ mailing_address_1: null, mail_city: null })).toBeNull()
    expect(mailCityLabel({ mailing_address_1: '1 Main St', mail_city: '  ' })).toBeNull()
  })

  it('the undeliverable test reads the address, not the ZIP', () => {
    expect(isUndeliverableMailing('0000 Undeliverable Mail')).toBe(true)
    expect(isUndeliverableMailing('0000 undeliverable mail')).toBe(true)
    expect(isUndeliverableMailing('Po Box 80600')).toBe(false) // a real Indianapolis box filed with ZIP 99999
  })
})

describe('ownerOf', () => {
  it('carries name, kind and city — and has no field for a street or ZIP', () => {
    const o = ownerOf({ ownership_name: 'Aguilar Marco', mailing_address_1: '1538 Palou Ave', mail_city: 'San Francisco' })
    expect(o).toEqual({ name: 'Aguilar Marco', kind: 'individual', mailCity: 'San Francisco' })
    expect(JSON.stringify(o)).not.toMatch(/Palou/)
  })

  it('Brew Vino (2704 24th St) files through the placeholder: no city', () => {
    expect(ownerOf({ ownership_name: 'Brew Vino, LLC', mailing_address_1: '0000 Undeliverable Mail', mail_city: 'San Francisco' }))
      .toEqual({ name: 'Brew Vino, LLC', kind: 'company', mailCity: null })
  })
})
