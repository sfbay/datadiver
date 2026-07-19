// Pure scaling of Mapbox `text-size` values for Large Type mode. Leaf module
// (no mapbox import) so the node-only Vitest config can test it.
//
// Mapbox text-size is px-only — the one text surface the root-% rem mechanism
// can't reach — and stock basemap values are camera expressions. `["zoom"]`
// may only appear as the input of a TOP-LEVEL "interpolate"/"step", so
// wrapping the whole expression in ["*", factor, …] is invalid; instead the
// expression is rebuilt with each numeric OUTPUT multiplied (zoom stops
// untouched). Any shape we don't recognize returns null and the caller leaves
// that layer at stock size — degrade to "not scaled", never to a corrupted
// style.

export function scaleTextSizeValue(value: unknown, factor: number): unknown | null {
  if (typeof value === 'number') return value * factor
  if (!Array.isArray(value)) return null
  const op = value[0]
  if (op === 'interpolate') {
    // ['interpolate', <type>, <input>, stop, output, stop, output, …]
    const out = [...value]
    for (let i = 4; i < out.length; i += 2) {
      const scaled = scaleTextSizeValue(out[i], factor)
      if (scaled === null) return null
      out[i] = scaled
    }
    return out
  }
  if (op === 'step') {
    // ['step', <input>, output0, stop, output, stop, output, …]
    const out = [...value]
    for (let i = 2; i < out.length; i += 2) {
      const scaled = scaleTextSizeValue(out[i], factor)
      if (scaled === null) return null
      out[i] = scaled
    }
    return out
  }
  return null
}
