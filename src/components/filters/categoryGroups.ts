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
