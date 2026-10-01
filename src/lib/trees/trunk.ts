// src/lib/trees/trunk.ts
// ZERO-IMPORT LEAF. Trunk width ("diameter at breast height", inches) as the
// city last recorded it. Spec §10.1.6: all 9,537 rows with no mapdbh carry
// dbhrange 3 (the large class), so dbhrange is never read.

export type TrunkClass = 'small' | 'medium' | 'large' | 'unmeasured'
export const TRUNK_CLASSES: readonly TrunkClass[] = ['small', 'medium', 'large', 'unmeasured']

export const TRUNK_LABEL: Readonly<Record<TrunkClass, string>> = {
  small: '10 inches or narrower',
  medium: '11 to 20 inches',
  large: '21 inches or wider',
  unmeasured: 'Not measured',
}

export function trunkClass(mapdbh: string | number | null | undefined): TrunkClass {
  if (mapdbh === null || mapdbh === undefined || mapdbh === '') return 'unmeasured'
  const n = Number(mapdbh)
  if (!Number.isFinite(n) || n <= 0) return 'unmeasured'
  if (n <= 10) return 'small'
  if (n <= 20) return 'medium'
  return 'large'
}
