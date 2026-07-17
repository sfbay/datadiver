import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ALERT_STREAMS, ALERT_STREAM_IDS, isLiveStream, isReleasedStream, streamWhere,
} from './streams.js'

describe('ALERT_STREAMS registry', () => {
  it('has exactly the five streams, three live + two released', () => {
    expect(ALERT_STREAM_IDS.sort()).toEqual(
      ['311-cases', '911-realtime', 'business-openings', 'fire-ems-dispatch', 'traffic-crashes'],
    )
    expect(ALERT_STREAM_IDS.filter(isLiveStream).sort()).toEqual(
      ['311-cases', '911-realtime', 'fire-ems-dispatch'],
    )
    expect(ALERT_STREAM_IDS.filter(isReleasedStream).sort()).toEqual(
      ['business-openings', 'traffic-crashes'],
    )
  })

  it('live hexes are pinned to FlowMapLayer COLORS (the app canon)', () => {
    // Source-scrape instead of importing FlowMapLayer (it pulls mapbox-gl,
    // which cannot load in the node test environment).
    const src = readFileSync(
      fileURLToPath(new URL('../../views/Last48/modes/FlowMapLayer.tsx', import.meta.url)),
      'utf8',
    )
    for (const id of ['911-realtime', 'fire-ems-dispatch', '311-cases'] as const) {
      const m = src.match(new RegExp(`'${id}':\\s+'(#[0-9a-fA-F]{6})'`))
      expect(m, `FlowMapLayer COLORS entry for ${id}`).toBeTruthy()
      expect(ALERT_STREAMS[id].hex).toBe(m![1])
    }
  })

  it('released pigments are the Jesse-approved canon', () => {
    expect(ALERT_STREAMS['traffic-crashes'].hex).toBe('#963e30')
    expect(ALERT_STREAMS['business-openings'].hex).toBe('#5c9693')
  })

  it('no reader-facing registry copy says "periodic"', () => {
    for (const cfg of Object.values(ALERT_STREAMS)) {
      expect(`${cfg.labelLong} ${cfg.releasedNote ?? ''}`).not.toMatch(/periodic/i)
    }
  })

  it('streamWhere: live streams get a lower bound only', () => {
    const w = streamWhere('911-realtime', Date.parse('2026-07-16T12:00:00Z'))
    expect(w).toMatch(/^received_datetime >= '/)
    expect(w).not.toContain('<=')
  })

  it('streamWhere: released streams are bounded both ends + extraWhere', () => {
    const now = Date.parse('2026-07-16T12:00:00Z')
    const wc = streamWhere('traffic-crashes', now)
    expect(wc).toMatch(/collision_datetime >= '.+' AND collision_datetime <= '/)
    const wb = streamWhere('business-openings', now)
    expect(wb).toContain('location IS NOT NULL')
    expect(wb).toContain('administratively_closed IS NULL')
    expect(wb).toContain('within_box(location, 37.85, -123.0, 37.6, -122.3)')
  })

  it('streamWhere honors a live window override (welcome edition uses 24h)', () => {
    const now = Date.parse('2026-07-16T12:00:00Z')
    const w48 = streamWhere('911-realtime', now)
    const w24 = streamWhere('911-realtime', now, 24 * 3600_000)
    expect(w24).not.toBe(w48) // different cutoff digit strings
  })

  it('normalizes a crash row (verified live shape)', () => {
    const ev = ALERT_STREAMS['traffic-crashes'].normalize({
      unique_id: '212413',
      collision_datetime: '2026-05-25T00:12:00.000',
      collision_severity: 'Fatal',
      number_killed: '1',
      number_injured: '0',
      type_of_collision: 'Vehicle/Pedestrian',
      primary_rd: 'MISSION ST',
      secondary_rd: '16TH ST',
      point: { type: 'Point', coordinates: [-122.419699855, 37.765371956] },
      analysis_neighborhood: 'Mission',
    })
    expect(ev).not.toBeNull()
    expect(ev!.id).toBe('traffic-crashes:212413')
    expect(ev!.datasetId).toBe('traffic-crashes')
    expect(ev!.address).toBe('Mission St & 16th St')
    expect(ev!.latitude).toBeCloseTo(37.7654, 3)
    expect(ev!.headline).toBe('Vehicle-pedestrian crash — one person killed')
  })

  it('crash headline: severe injury + fallback type', () => {
    const base = {
      unique_id: '1', collision_datetime: '2026-05-01T10:00:00.000',
      point: { type: 'Point', coordinates: [-122.4, 37.76] },
    }
    const severe = ALERT_STREAMS['traffic-crashes'].normalize({
      ...base, type_of_collision: 'Rear End', collision_severity: 'Injury (Severe)', number_killed: '0', number_injured: '1',
    })
    expect(severe!.headline).toBe('Rear end crash — severe injury')
    const plain = ALERT_STREAMS['traffic-crashes'].normalize({
      ...base, type_of_collision: 'Not Stated', collision_severity: 'Injury (Complaint of Pain)', number_killed: '0', number_injured: '2',
    })
    expect(plain!.headline).toBe('Traffic crash — 2 people injured')
  })

  it('normalizes a business row (already title-cased at source — no re-casing)', () => {
    const ev = ALERT_STREAMS['business-openings'].normalize({
      uniqueid: '1427086-07-261-1186273',
      dba_name: 'Ermelinda House Cleaning',
      full_business_address: '2060 Folsom St Apt 321',
      location: { type: 'Point', coordinates: [-122.415399, 37.764369] },
      location_start_date: '2026-07-09T00:00:00.000',
      self_reported_naics_code: '561720',
      neighborhoods_analysis_boundaries: 'Mission',
    })
    expect(ev).not.toBeNull()
    expect(ev!.id).toBe('business-openings:1427086-07-261-1186273')
    expect(ev!.headline).toBe('New business — Ermelinda House Cleaning')
    expect(ev!.address).toBe('2060 Folsom St Apt 321')
    expect(ev!.callType).toBeTruthy() // sector from the NAICS crosswalk
  })

  it('normalizers return null on a missing timestamp', () => {
    expect(ALERT_STREAMS['traffic-crashes'].normalize({ unique_id: 'x' })).toBeNull()
    expect(ALERT_STREAMS['business-openings'].normalize({ uniqueid: 'x' })).toBeNull()
  })

  it('live normalizers delegate to normalizeEvent (id prefix check)', () => {
    const ev = ALERT_STREAMS['911-realtime'].normalize({
      cad_number: 'C1', received_datetime: '2026-07-16T08:00:00.000',
      intersection_point: { type: 'Point', coordinates: [-122.42, 37.77] },
    })
    expect(ev!.id).toBe('911-realtime:C1')
  })
})
