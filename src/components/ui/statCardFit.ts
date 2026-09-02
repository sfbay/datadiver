// src/components/ui/statCardFit.ts
//
// Pure size step for StatCard's `valueFit` mode: long text values (SFPD
// category names run to 40 characters) step down by length instead of
// wrapping the tray. Thresholds are character counts of the rendered value.

export function fitValueClass(len: number): string {
  if (len <= 14) return 'text-2xl'
  if (len <= 22) return 'text-lg'
  return 'text-base'
}
