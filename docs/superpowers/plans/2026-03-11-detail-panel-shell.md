# DetailPanelShell Extraction Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan.

**Goal:** Extract shared detail panel chrome (slide-in, close/share buttons, loading spinner, scroll container) into a reusable `DetailPanelShell` component, reducing ~600 LOC of duplication across 7 panels.

**Architecture:** A wrapper component that handles presentation chrome; each panel passes dataset-specific content as children.

---

### Task 1: Read all 7 detail panels and identify the shared pattern

**Files to read:**
- `src/components/ui/IncidentDetailPanel.tsx` (380 LOC)
- `src/components/ui/CaseDetailPanel.tsx` (283 LOC)
- `src/components/ui/CrimeDetailPanel.tsx` (431 LOC)
- `src/components/ui/CitationDetailPanel.tsx` (180 LOC)
- `src/components/ui/CrashDetailPanel.tsx` (233 LOC)
- `src/components/ui/MeterDetailPanel.tsx` (313 LOC)
- `src/components/ui/BusinessDetailPanel.tsx` (154 LOC)

- [ ] **Step 1:** Read all 7 files. Identify the exact shared JSX skeleton:
  - Outer `div` with `absolute top-5 right-5 z-30 rounded-xl p-4 w-72 max-h-[80vh] overflow-y-auto animate-in fade-in slide-in-from-right-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] shadow-xl shadow-black/20`
  - Close button (top-right): `<button onClick={onClose}><svg X icon /></button>`
  - ShareLinkButton (top-right, next to close)
  - Loading spinner: `<div className="w-5 h-5 border-2 border-[color] border-t-transparent animate-spin" />`
  - Content area (conditional on `detail && !isLoading`)

- [ ] **Step 2:** Note the per-panel variations:
  - Accent color (amber, emerald, red, orange, cyan, etc.)
  - ShareLinkButton presence (all except BusinessDetailPanel)
  - BusinessDetailPanel uses `glass-card` instead of `animate-in`, different close SVG, no share button, `animate-pulse` text instead of spinner

### Task 2: Create DetailPanelShell component

**Files:**
- Create: `src/components/ui/DetailPanelShell.tsx`

- [ ] **Step 1:** Create the component with this interface:

```typescript
interface DetailPanelShellProps {
  /** Whether data is loading */
  isLoading: boolean
  /** Whether there's content to show (detail object exists) */
  hasContent: boolean
  /** Accent color for the loading spinner border */
  accentColor: string
  /** Called when close button is clicked */
  onClose: () => void
  /** URL builder for ShareLinkButton. Omit to hide share button. */
  buildShareUrl?: () => string
  /** CSS class for ShareLinkButton accent */
  shareAccentClass?: string
  /** Panel content (rendered when hasContent && !isLoading) */
  children: React.ReactNode
}
```

- [ ] **Step 2:** Implement using the shared skeleton from Task 1. Use `useRef` for the panelRef. The component handles:
  - Outer positioned container with slide-in animation
  - Top-right close button (consistent X SVG: `strokeWidth="2"`, `currentColor`)
  - Optional ShareLinkButton
  - Loading spinner with configurable accent color
  - Scrollable content area

- [ ] **Step 3:** Verify: `npx tsc --noEmit`

### Task 3: Refactor IncidentDetailPanel to use DetailPanelShell

**Files:**
- Modify: `src/components/ui/IncidentDetailPanel.tsx`

- [ ] **Step 1:** Import `DetailPanelShell`. Replace the outer wrapper, close button, share button, and loading spinner with `<DetailPanelShell>`. Keep ALL content-specific JSX (header, timeline, fire cross-ref sections) as children.

- [ ] **Step 2:** Remove the now-unused `panelRef`, close button JSX, loading spinner JSX.

- [ ] **Step 3:** Verify: `npx tsc --noEmit`

### Task 4: Refactor remaining 5 standard panels

**Files:**
- Modify: `src/components/ui/CaseDetailPanel.tsx`
- Modify: `src/components/ui/CrimeDetailPanel.tsx`
- Modify: `src/components/ui/CitationDetailPanel.tsx`
- Modify: `src/components/ui/CrashDetailPanel.tsx`
- Modify: `src/components/ui/MeterDetailPanel.tsx`

- [ ] **Step 1:** Apply the same pattern as Task 3 to each. For each panel:
  - Import DetailPanelShell
  - Replace outer div + close button + share button + loading spinner with `<DetailPanelShell>`
  - Pass appropriate `accentColor`, `onClose`, `buildShareUrl`, `shareAccentClass`
  - Keep all content-specific JSX as children

- [ ] **Step 2:** Verify after each: `npx tsc --noEmit`

### Task 5: Normalize BusinessDetailPanel

**Files:**
- Modify: `src/components/ui/BusinessDetailPanel.tsx`

- [ ] **Step 1:** This panel is the outlier — it uses `glass-card` instead of `animate-in`, has no ShareLinkButton, uses different close SVG (`strokeWidth="1.5"`), and uses `animate-pulse` text instead of spinner. Refactor it to use `DetailPanelShell` with the same animation and close button as the other 6 panels. If it doesn't have a share URL builder, omit the `buildShareUrl` prop.

- [ ] **Step 2:** Verify: `npx tsc --noEmit`

### Task 6: Final verification and commit

- [ ] **Step 1:** Run `pnpm build` — must pass
- [ ] **Step 2:** Commit:
```bash
git add -A
git commit -m "refactor: extract DetailPanelShell — shared chrome for 7 detail panels"
```
