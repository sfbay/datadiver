// scripts/preview-digest.ts — render the digest email with a realistic
// fixture to an HTML file for design review. The email is a designed surface;
// this is its dev server. Usage:
//   VITE_MAPBOX_TOKEN=pk.… npx tsx scripts/preview-digest.ts /tmp/digest.html
//   VITE_MAPBOX_TOKEN=pk.… npx tsx scripts/preview-digest.ts /tmp/welcome.html --welcome
import { writeFileSync } from 'node:fs'
import type { AlertEvent } from '../src/lib/alerts/streams.js'
import {
  summarize, busiestBuckets, bucketByDay, bucketReleased, radiusLabelText,
} from '../src/lib/alerts/digestSummary.js'
import { renderDigest, mapAltText } from '../src/lib/alerts/digestRender.js'
import { buildStaticMapUrl } from '../src/lib/alerts/staticMap.js'

const now = Date.now()
const H = 3600_000
const D = 24 * H
const ev = (o: Partial<AlertEvent>): AlertEvent => (o as AlertEvent)

const liveEvents: AlertEvent[] = [
  ev({ id: 'p1', datasetId: '911-realtime', receivedAt: now - 2 * H, callType: 'Suspicious person', address: '16th St & Church St', latitude: 37.7646, longitude: -122.4288, raw: {} }),
  ev({ id: 'p2', datasetId: '911-realtime', receivedAt: now - 5 * H, callType: 'Shots fired', address: 'Dolores St & 17th St', latitude: 37.7633, longitude: -122.4262, raw: {} }),
  ev({ id: 'p3', datasetId: '311-cases', receivedAt: now - 7 * H, callType: 'Garbage_and_debris', address: '3448 16th St', latitude: 37.7642, longitude: -122.4311, raw: {} }),
  ev({ id: 'p4', datasetId: '311-cases', receivedAt: now - 11 * H, callType: 'Building_inspection', address: '372 Dolores St', latitude: 37.7614, longitude: -122.4257, raw: {} }),
  ev({ id: 'p5', datasetId: 'fire-ems-dispatch', receivedAt: now - 26 * H, callType: 'Medical incident', address: '17th St & Dolores St', latitude: 37.7631, longitude: -122.4262, raw: {} }),
  ev({ id: 'p6', datasetId: 'fire-ems-dispatch', receivedAt: now - 30 * H, callType: 'Structure fire', address: 'Church St & Market St', latitude: 37.7671, longitude: -122.4291, raw: {} }),
  ev({ id: 'p7', datasetId: '311-cases', receivedAt: now - 15 * H, callType: 'Graffiti', address: '200 Church St', latitude: 37.7659, longitude: -122.4289, raw: {} }),
]

// Released tier — event dates weeks/days old, exactly as a real batch lands.
const releasedEvents: AlertEvent[] = [
  ev({ id: 'traffic-crashes:212413', datasetId: 'traffic-crashes', receivedAt: now - 52 * D,
       headline: 'Vehicle-pedestrian crash — one person killed', address: 'Mission St & 16th St',
       latitude: 37.7654, longitude: -122.4197, raw: { collision_severity: 'Fatal', number_killed: '1' } }),
  ev({ id: 'traffic-crashes:212319', datasetId: 'traffic-crashes', receivedAt: now - 47 * D,
       headline: 'Broadside crash — 2 people injured', address: 'Dolores St & 18th St',
       latitude: 37.7611, longitude: -122.4259, raw: { collision_severity: 'Injury (Other Visible)', number_killed: '0' } }),
  ev({ id: 'business-openings:1427086', datasetId: 'business-openings', receivedAt: now - 3 * D,
       headline: 'New business — Ermelinda House Cleaning', callType: 'Administrative and support services',
       address: '2060 Folsom St', latitude: 37.7644, longitude: -122.4154, raw: {} }),
  ev({ id: 'business-openings:1427234', datasetId: 'business-openings', receivedAt: now - 6 * D,
       headline: 'New business — Semillitas De Amor Childcare Center', callType: 'Social assistance',
       address: '2185 Mission St', latitude: 37.7621, longitude: -122.4192, raw: {} }),
]

const isWelcome = process.argv.includes('--welcome')
const center = { lat: 37.7645, lng: -122.429 }
const radiusMiles = 0.25
const token = (process.env.VITE_MAPBOX_TOKEN ?? '').replace(/"/g, '') // .env.local double-quotes it
const all = [...liveEvents, ...releasedEvents]
const summary = summarize(all)
const dots = all
  .filter((e) => e.latitude != null && e.longitude != null)
  .map((e) => ({ lat: e.latitude as number, lng: e.longitude as number }))

const payload = {
  windowLabel: isWelcome ? 'your first edition — the last 24 hours' : 'published since your last digest',
  nowMs: now,
  locations: [{
    label: '77 Chula Lane, San Francisco, California 94114, United States',
    mapUrl: buildStaticMapUrl({ center, radiusMiles, dots, token }),
    mapAlt: mapAltText('77 Chula Lane', radiusLabelText(radiusMiles), summary.significant),
    summary,
    buckets: busiestBuckets(liveEvents),
    days: bucketByDay(liveEvents, now),
    released: bucketReleased(releasedEvents),
  }],
}

const { subject, html, text } = renderDigest(payload, 'https://datadiver.jlabsf.org/api/alerts/unsubscribe?token=preview')
const out = process.argv[2] ?? '/tmp/digest-preview.html'
writeFileSync(out, html)
writeFileSync(out.replace(/\.html$/, '.txt'), `SUBJECT: ${subject}\n\n${text}`)
console.log(`subject: ${subject}\nwrote ${out} (+ .txt)`)
