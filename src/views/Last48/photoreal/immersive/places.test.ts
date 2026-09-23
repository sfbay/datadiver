// src/views/Last48/photoreal/immersive/places.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { PLACES, PLACES_SHOWN, PLACE_CAPTION_MAX } from './places'
import { SF_BOUNDS } from '@/utils/geo'

const THUMB_DIR = 'public/immersive/places'

/** A WebP's RIFF chunk FourCCs and its pixel size (lossy VP8, lossless VP8L
 *  or extended VP8X). Enough to pin shape and to prove there is no EXIF or
 *  XMP chunk — the privacy promise these personal photographs ship under. */
function webpInfo(buf: Buffer): { chunks: string[]; width: number; height: number } {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') throw new Error('not a WebP')
  const chunks: string[] = []
  let width = 0, height = 0
  for (let o = 12; o + 8 <= buf.length;) {
    const id = buf.toString('ascii', o, o + 4), size = buf.readUInt32LE(o + 4), d = o + 8
    chunks.push(id)
    if (id === 'VP8 ') { width = buf.readUInt16LE(d + 6) & 0x3fff; height = buf.readUInt16LE(d + 8) & 0x3fff }
    if (id === 'VP8L') { const b = buf.readUInt32LE(d + 1); width = (b & 0x3fff) + 1; height = ((b >> 14) & 0x3fff) + 1 }
    if (id === 'VP8X') { width = buf.readUIntLE(d + 4, 3) + 1; height = buf.readUIntLE(d + 7, 3) + 1 }
    o = d + size + (size & 1)
  }
  return { chunks, width, height }
}

describe('place thumbnails (Jesse\'s own photographs, 2026-09-22)', () => {
  const withThumb = PLACES.filter((p) => p.thumb)
  it('the four places shown by default all have a photo', () => {
    for (const p of PLACES.slice(0, PLACES_SHOWN)) expect(p.thumb, p.id).toBeDefined()
  })
  it('every thumb lives at /immersive/places/<id>.webp', () => {
    for (const p of withThumb) expect(p.thumb).toBe(`/immersive/places/${p.id}.webp`)
  })
  it('every thumb is a 160 px square WebP under 20 KB with NO EXIF or XMP chunk (no camera, date or location data)', () => {
    for (const p of withThumb) {
      const buf = readFileSync(`public${p.thumb}`)
      const w = webpInfo(buf)
      expect([w.width, w.height], p.id).toEqual([160, 160])
      expect(buf.length, p.id).toBeLessThan(20_000)
      expect(w.chunks, p.id).not.toContain('EXIF')
      expect(w.chunks, p.id).not.toContain('XMP ')
    }
  })
  it('the folder holds no orphan images', () => {
    const referenced = new Set(withThumb.map((p) => `${p.id}.webp`))
    for (const f of readdirSync(THUMB_DIR)) expect(referenced.has(f), f).toBe(true)
  })
})

describe('PLACES (Round B §2)', () => {
  it('seeds eight places and shows four', () => {
    expect(PLACES).toHaveLength(8)
    expect(PLACES_SHOWN).toBe(4)
  })
  it('ids are unique kebab-case', () => {
    const ids = PLACES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })
  it('every place sits inside San Francisco', () => {
    for (const p of PLACES) {
      expect(p.lat, p.id).toBeGreaterThan(SF_BOUNDS.south)
      expect(p.lat, p.id).toBeLessThan(SF_BOUNDS.north)
      expect(p.lng, p.id).toBeGreaterThan(SF_BOUNDS.west)
      expect(p.lng, p.id).toBeLessThan(SF_BOUNDS.east)
    }
  })
  it('camera range is 150–1500 m, pitch looks down, heading is a compass bearing', () => {
    for (const p of PLACES) {
      expect(p.rangeM, p.id).toBeGreaterThanOrEqual(150)
      expect(p.rangeM, p.id).toBeLessThanOrEqual(1500)
      expect(p.pitchDeg, p.id).toBeLessThan(0)
      expect(p.pitchDeg, p.id).toBeGreaterThanOrEqual(-60)
      expect(p.headingDeg, p.id).toBeGreaterThanOrEqual(0)
      expect(p.headingDeg, p.id).toBeLessThan(360)
    }
  })
  it('captions are short and plain', () => {
    for (const p of PLACES) {
      expect(p.caption.length, p.id).toBeLessThanOrEqual(PLACE_CAPTION_MAX)
      expect(p.caption, p.id).not.toMatch(/live/i)
    }
  })
})
