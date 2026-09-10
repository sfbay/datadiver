// src/views/Last48/photoreal/grade.ts
//
// Time-of-day GRADE for the photoreal tiles. Google's tiles are baked
// daylight photos — no provider can serve night — so dusk and night are a
// colour grade applied by a Cesium CustomShader (built in Last48Photoreal
// from these values), plus the real sun/sky from the matching clock time.
// Bright, warm-ish pixels are let through the grade as "lit windows".
// Values are the 2026-09-09 spike's; tune here, never inline.
export type Grade = 'day' | 'dusk' | 'night'

export interface GradeValues {
  tint: [number, number, number]
  mul: number
  win: number
}

export const GRADES: Record<Grade, GradeValues> = {
  day:   { tint: [1.0, 1.0, 1.0],    mul: 1.0,  win: 0 },
  dusk:  { tint: [1.0, 0.80, 0.62],  mul: 0.82, win: 0.35 },
  night: { tint: [0.42, 0.50, 0.78], mul: 0.30, win: 1.6 },
}

/** Sun position follows the grade: 13:00 / 19:20 / 22:30 SF (PDT = UTC−7). */
export const GRADE_CLOCK_ISO: Record<Grade, string> = {
  day: '2026-09-09T20:00:00Z',
  dusk: '2026-09-10T02:20:00Z',
  night: '2026-09-10T05:30:00Z',
}

/** Light theme = day, dark theme = dusk; `?tod=` (day|dusk|night) overrides. */
export function gradeForTheme(isDark: boolean, override: string | null): Grade {
  if (override === 'day' || override === 'dusk' || override === 'night') return override
  return isDark ? 'dusk' : 'day'
}

export const GRADE_FRAGMENT_GLSL = `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  vec3 c = material.diffuse;
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  float lit = smoothstep(0.62, 0.9, luma) * u_win;
  vec3 graded = c * u_tint * u_mul;
  material.diffuse = graded + c * vec3(1.0, 0.85, 0.55) * lit;
}`
