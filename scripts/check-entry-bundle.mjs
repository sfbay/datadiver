// scripts/check-entry-bundle.mjs
// Fails the build if the eager entry chunk (or index.html's preloads) drags
// Cesium in. Same class as the Mapbox split in vite.config.ts — a single
// eager import anywhere silently ships ~3 MB to every Home visitor.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dist = 'dist'
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const entry = html.match(/<script type="module"[^>]*src="\/(assets\/[^"]+\.js)"/)?.[1]
if (!entry) { console.error('entry script not found in dist/index.html'); process.exit(1) }
const bad = []
if (/cesium/i.test(html)) bad.push('index.html references a cesium chunk (modulepreload?)')
const entrySrc = readFileSync(join(dist, entry), 'utf8')
if (/CESIUM_BASE_URL|cesium/.test(entrySrc)) bad.push(`${entry} references cesium`)
const cesiumChunks = readdirSync(join(dist, 'assets')).filter((f) => /^cesium-.*\.js$/.test(f))
if (cesiumChunks.length === 0) bad.push('no cesium-*.js chunk was emitted (manualChunks rule missing?)')
if (bad.length) { console.error('entry-bundle check FAILED:\n - ' + bad.join('\n - ')); process.exit(1) }
console.log(`entry-bundle check ok (${entry}; cesium in ${cesiumChunks.join(', ')})`)
