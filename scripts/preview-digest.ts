// scripts/preview-digest.ts — render the digest email with a realistic
// fixture to an HTML file for design review. The email is a designed surface;
// this is its dev server. Usage:
//   VITE_MAPBOX_TOKEN=pk.… npx tsx scripts/preview-digest.ts /tmp/digest.html
import { writeFileSync } from 'node:fs'
import type { NormalizedEvent } from '../src/types/last48'
import { summarize, busiestBuckets, bucketByDay, radiusLabelText } from '../src/lib/alerts/digestSummary.js'
import { renderDigest, mapAltText } from '../src/lib/alerts/digestRender.js'
import { buildStaticMapUrl } from '../src/lib/alerts/staticMap.js'

const now = Date.now()
const H = 3600_000
const ev = (o: Partial<NormalizedEvent>): NormalizedEvent => (o as NormalizedEvent)

const events: NormalizedEvent[] = [
  ev({ id: 'p1', datasetId: '911-realtime', receivedAt: now - 2 * H, callType: 'Suspicious person', address: '16th St & Church St', latitude: 37.7646, longitude: -122.4288 }),
  ev({ id: 'p2', datasetId: '911-realtime', receivedAt: now - 5 * H, callType: 'Shots fired', address: 'Dolores St & 17th St', latitude: 37.7633, longitude: -122.4262 }),
  ev({ id: 'p3', datasetId: '311-cases', receivedAt: now - 7 * H, callType: 'Garbage_and_debris', address: '3448 16th St', latitude: 37.7642, longitude: -122.4311 }),
  ev({ id: 'p4', datasetId: '311-cases', receivedAt: now - 11 * H, callType: 'Building_inspection', address: '372 Dolores St', latitude: 37.7614, longitude: -122.4257 }),
  ev({ id: 'p5', datasetId: 'fire-ems-dispatch', receivedAt: now - 26 * H, callType: 'Medical incident', address: '17th St & Dolores St', latitude: 37.7631, longitude: -122.4262 }),
  ev({ id: 'p6', datasetId: 'fire-ems-dispatch', receivedAt: now - 30 * H, callType: 'Structure fire', address: 'Church St & Market St', latitude: 37.7671, longitude: -122.4291 }),
  ev({ id: 'p7', datasetId: '311-cases', receivedAt: now - 15 * H, callType: 'Graffiti', address: '200 Church St', latitude: 37.7659, longitude: -122.4289 }),
]

const center = { lat: 37.7645, lng: -122.429 }
const radiusMiles = 0.25
const token = process.env.VITE_MAPBOX_TOKEN ?? ''
const summary = summarize(events)
const dots = events
  .filter((e) => e.latitude != null && e.longitude != null)
  .map((e) => ({ lat: e.latitude as number, lng: e.longitude as number }))

const payload = {
  windowLabel: 'published since your last digest',
  nowMs: now,
  locations: [{
    label: '77 Chula Lane, San Francisco, California 94114, United States',
    mapUrl: buildStaticMapUrl({ center, radiusMiles, dots, token }),
    mapAlt: mapAltText('77 Chula Lane', radiusLabelText(radiusMiles), summary.significant),
    summary,
    buckets: busiestBuckets(events),
    days: bucketByDay(events, now),
  }],
}

const { subject, html, text } = renderDigest(payload, 'https://datadiver.jlabsf.org/api/alerts/unsubscribe?token=preview')
const out = process.argv[2] ?? '/tmp/digest-preview.html'
writeFileSync(out, html)
writeFileSync(out.replace(/\.html$/, '.txt'), `SUBJECT: ${subject}\n\n${text}`)
console.log(`subject: ${subject}\nwrote ${out} (+ .txt)`)
