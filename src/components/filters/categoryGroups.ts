// Pure leaf for the quick-group buttons' availability logic. Extracted so the
// node-only Vitest suite can pin the disabled-when-empty fix: a group whose
// authored members intersect the loaded vocabulary to ZERO must disable, not
// fire onChange(new Set()) — which the size-0 convention reads as SELECT ALL.
export function availableInGroup(
  groupTypes: readonly string[],
  allTypes: ReadonlySet<string>
): string[] {
  return groupTypes.filter((t) => allTypes.has(t))
}

// Post-load disabled gate: a group only disables once categories have
// actually loaded AND its intersection with the loaded vocabulary is empty.
// Before load (categoriesLoaded false), every group must render enabled —
// otherwise every quick-group button flashes disabled during the initial
// fetch (the transient-flash bug this pin exists to prevent).
export function groupDisabled(
  categoriesLoaded: boolean,
  available: readonly string[]
): boolean {
  return categoriesLoaded && available.length === 0
}
