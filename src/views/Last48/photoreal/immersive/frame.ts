// src/views/Last48/photoreal/immersive/frame.ts
//
// The largest 16:9 rectangle centred in a w×h box — the b-roll framing ticks
// (Spec A2 §6). Pure; the ticks component measures the host and draws this.
export interface Frame { x: number; y: number; w: number; h: number }

export function frame169(w: number, h: number): Frame {
  if (w <= 0 || h <= 0) return { x: 0, y: 0, w: 0, h: 0 }
  const fw = Math.min(w, (h * 16) / 9)
  const fh = (fw * 9) / 16
  return { x: (w - fw) / 2, y: (h - fh) / 2, w: fw, h: fh }
}
