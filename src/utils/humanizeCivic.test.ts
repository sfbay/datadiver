import { describe, it, expect } from 'vitest'
import { humanizeCallType, humanizeStreamName, streamLabelShort } from './humanizeCivic'

describe('humanizeCallType', () => {
  it('expands SF call-type shorthand and sentence-cases', () => {
    expect(humanizeCallType('Traf Violation Cite')).toBe('Traffic violation citation')
    expect(humanizeCallType('Susp Vehicle')).toBe('Suspicious vehicle')
    expect(humanizeCallType('Aud Alarm')).toBe('Audible alarm')
  })
  it('expands the W/ abbreviation to "with"', () => {
    expect(humanizeCallType('Meet W/Citizen')).toBe('Meet with citizen')
  })
  it('leaves already-plain text readable', () => {
    expect(humanizeCallType('Shooting')).toBe('Shooting')
  })
  it('handles empty/undefined', () => {
    expect(humanizeCallType(undefined)).toBe('')
    expect(humanizeCallType('')).toBe('')
  })
})

describe('humanizeStreamName', () => {
  it('names streams in plain English', () => {
    expect(humanizeStreamName('911-realtime')).toBe('911 calls')
    expect(humanizeStreamName('fire-ems-dispatch')).toBe('Fire & EMS responses')
    expect(humanizeStreamName('311-cases')).toBe('311 reports')
  })
})

describe('streamLabelShort', () => {
  it('gives the compact, noun-less label for dense rows', () => {
    expect(streamLabelShort('911-realtime')).toBe('911')
    expect(streamLabelShort('fire-ems-dispatch')).toBe('Fire/EMS')
    expect(streamLabelShort('311-cases')).toBe('311')
  })
})
