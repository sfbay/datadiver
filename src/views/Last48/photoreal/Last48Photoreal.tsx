// src/views/Last48/photoreal/Last48Photoreal.tsx — placeholder, replaced in Task 7
import * as Cesium from 'cesium'
export default function Last48Photoreal() {
  // cesium@1.145.0's bundled Source/Cesium.d.ts (the package's "types" entry)
  // doesn't declare the top-level VERSION export, even though it exists at
  // runtime (verified via node -e against index.cjs) — an upstream type-decl
  // gap, not a typo here.
  // @ts-expect-error — see above
  return <div data-cesium-version={Cesium.VERSION} />
}
