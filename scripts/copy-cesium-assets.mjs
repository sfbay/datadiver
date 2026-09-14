// scripts/copy-cesium-assets.mjs
// Cesium loads Workers/ThirdParty/Assets at RUNTIME from CESIUM_BASE_URL.
// They are ~40 MB and only fetched when the photoreal chunk mounts, so they
// live in public/cesium/ (gitignored) and are copied here before build/dev.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules/cesium/Build/Cesium')
const dst = join(root, 'public/cesium')
if (!existsSync(src)) { console.error('cesium not installed'); process.exit(1) }
rmSync(dst, { recursive: true, force: true })
mkdirSync(dst, { recursive: true })
for (const dir of ['Workers', 'ThirdParty', 'Assets']) cpSync(join(src, dir), join(dst, dir), { recursive: true })
console.log('cesium assets → public/cesium')
