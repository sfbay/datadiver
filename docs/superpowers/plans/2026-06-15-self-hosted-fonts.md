# Self-Hosted Fonts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve Fraunces, Roboto Serif, and Space Mono from DataDiver's own origin via Fontsource instead of the Google Fonts CDN, preserving optical sizing and the `cv11`/`ss01` stylistic set.

**Architecture:** Add three Fontsource npm packages and import their CSS in the app entry (`src/main.tsx`); Vite fingerprints and serves the woff2 same-origin. The one load-bearing edit is renaming the two *variable* families (`"Fraunces"` → `"Fraunces Variable"`, `"Roboto Serif"` → `"Roboto Serif Variable"`) in the two CSS token sites — Space Mono is static and keeps its name. Remove the Google `<link>` + preconnects from `index.html`. A node guard test locks in "no Google origins / Variable names present."

**Tech Stack:** Vite + React 18 + TypeScript, Tailwind v4 (`@theme` in `src/index.css`), Fontsource, Vitest (node env), pnpm.

**Spec:** `docs/superpowers/specs/2026-06-15-self-hosted-fonts-design.md`

**Branch:** `chore/self-host-fonts` (already created; spec already committed at `fd3d9e2`).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `package.json` / `pnpm-lock.yaml` | dependency manifest | add 3 Fontsource deps |
| `src/main.tsx` | app entry | import Fontsource CSS (before `./index.css`) |
| `src/index.css` (`@theme`, lines 127–128) | Tailwind font-utility source | rename 2 variable families |
| `src/styles/tokens.css` (lines 126–127) | font-stack tokens mirror | rename 2 variable families |
| `index.html` (lines 28–34) | document head | delete preconnects + Google `<link>`; fix font comment |
| `src/styles/font-hosting.test.ts` | regression guard | NEW — asserts no Google origins, Variable names present |
| `src/views/About/About.tsx` (line 83) | public stack disclosure | "via Google Fonts" → self-hosted |
| `CLAUDE.md` (Fonts section) | project docs | "Google Fonts CDN" → Fontsource |

---

### Task 1: Add Fontsource dependencies and identify the exact import entry points

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install the three Fontsource packages**

```bash
pnpm add @fontsource-variable/fraunces @fontsource-variable/roboto-serif @fontsource/space-mono
```

Expected: pnpm adds three entries under `dependencies` in `package.json` and updates `pnpm-lock.yaml`. No build runs.

- [ ] **Step 2: Confirm the exact variable family names and the opsz+wght CSS entry**

The variable packages register the family as `"<Name> Variable"`. The CSS entry that varies BOTH `opsz` (optical size) AND `wght` (300–700) is the **`full`** variant — single-axis files (`wght.css`, `opsz.css`) pin the other axis, which would lose either optical sizing or the weight range. Verify:

```bash
ls node_modules/@fontsource-variable/fraunces/
ls node_modules/@fontsource-variable/roboto-serif/
ls node_modules/@fontsource/space-mono/
grep -m1 "font-family" node_modules/@fontsource-variable/fraunces/full.css
grep -m1 "font-weight" node_modules/@fontsource-variable/fraunces/full.css
```

Expected: `full.css` and `full-italic.css` exist for both variable packages; `grep font-family` prints `font-family: 'Fraunces Variable';`; `grep font-weight` prints a RANGE like `font-weight: 300 700;` (a range proves the `wght` axis is present). Space Mono dir shows `400.css`, `700.css`, `400-italic.css`, `700-italic.css`.

> If `full.css` is absent in an installed version, pick the entry whose `@font-face` shows `font-weight: 300 700` AND is the optical/all-axis file; record the exact filenames you will import in Step 3 of Task 3. Use the family name exactly as printed by the `font-family` grep.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(fonts): add Fontsource deps (fraunces, roboto-serif, space-mono)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Write the failing self-hosting guard test

**Files:**
- Create: `src/styles/font-hosting.test.ts`

- [ ] **Step 1: Write the test**

Vitest runs from the repo root, so `readFileSync` with repo-relative paths resolves correctly.

```ts
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')

describe('fonts are self-hosted (no Google Fonts CDN)', () => {
  it('index.html references no Google Fonts origins', () => {
    const html = read('index.html')
    expect(html).not.toMatch(/fonts\.googleapis\.com/)
    expect(html).not.toMatch(/fonts\.gstatic\.com/)
  })

  it('the CSS font tokens use the Fontsource variable family names', () => {
    for (const file of ['src/index.css', 'src/styles/tokens.css']) {
      const css = read(file)
      expect(css, `${file} should reference "Fraunces Variable"`).toMatch(/Fraunces Variable/)
      expect(css, `${file} should reference "Roboto Serif Variable"`).toMatch(/Roboto Serif Variable/)
    }
  })
})
```

- [ ] **Step 2: Run it and confirm it FAILS**

```bash
pnpm exec vitest run src/styles/font-hosting.test.ts
```

Expected: BOTH tests FAIL — `index.html` still contains `fonts.googleapis.com`/`fonts.gstatic.com`, and the CSS still uses bare `"Fraunces"` / `"Roboto Serif"` (no `Variable`).

- [ ] **Step 3: Commit**

```bash
git add src/styles/font-hosting.test.ts
git commit -m "test(fonts): guard against Google Fonts CDN regressions (failing)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Import Fontsource CSS in the app entry

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Add the font imports above `./index.css`**

`src/main.tsx` currently begins:

```tsx
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
```

Replace with (use the exact filenames confirmed in Task 1; `full` + `full-italic` for the variable families, the four static Space Mono styles):

```tsx
import { createRoot } from 'react-dom/client'
// Self-hosted fonts (Fontsource) — replaces the Google Fonts CDN <link>.
// `full` carries BOTH the opsz (optical-size) and wght axes; single-axis
// files would pin one and lose optical sizing or the 300–700 weight range.
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/fraunces/full-italic.css'
import '@fontsource-variable/roboto-serif/full.css'
import '@fontsource-variable/roboto-serif/full-italic.css'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/400-italic.css'
import '@fontsource/space-mono/700.css'
import '@fontsource/space-mono/700-italic.css'
import './index.css'
import App from './App'
```

- [ ] **Step 2: Type-check still compiles**

```bash
pnpm exec tsc -b
```

Expected: clean exit. NOTE: `tsc` resolves `*.css` imports through a wildcard module declaration (`vite-env.d.ts`) and does NOT verify the file exists on disk — so this is only a compile smoke check, it will NOT catch a wrong CSS filename. The filenames were already confirmed to exist via `ls` in Task 1 Step 2; a genuinely bad import path surfaces at `vite build` in Task 7 (Vite does real resolution). If Task 7's build errors "Could not resolve …/full.css", the filename differs — re-check Task 1 Step 2.

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "feat(fonts): import self-hosted Fontsource CSS in app entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Rename the variable families in the two CSS token sites

**Files:**
- Modify: `src/index.css:127-128`
- Modify: `src/styles/tokens.css:126-127`

- [ ] **Step 1: Rename in `src/index.css` (`@theme` block)**

Change these two lines:

```css
  --font-display: "Fraunces", "Roboto Serif", Georgia, serif;
  --font-sans: "Roboto Serif", Georgia, serif;
```

to:

```css
  --font-display: "Fraunces Variable", "Roboto Serif Variable", Georgia, serif;
  --font-sans: "Roboto Serif Variable", Georgia, serif;
```

(Leave `--font-mono: "Space Mono", "Fira Code", monospace;` on line 129 unchanged — Space Mono is the static package and keeps its name.)

- [ ] **Step 2: Rename in `src/styles/tokens.css`**

Change these two lines:

```css
  --font-display: "Fraunces", "Roboto Serif", Georgia, Cambria, serif;
  --font-body:    "Roboto Serif", Georgia, Cambria, serif;
```

to:

```css
  --font-display: "Fraunces Variable", "Roboto Serif Variable", Georgia, Cambria, serif;
  --font-body:    "Roboto Serif Variable", Georgia, Cambria, serif;
```

(Leave `--font-mono` on line 128 unchanged.)

- [ ] **Step 3: Commit**

```bash
git add src/index.css src/styles/tokens.css
git commit -m "feat(fonts): point font tokens at Fontsource variable family names

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Remove the Google Fonts CDN from `index.html` and make the guard test pass

**Files:**
- Modify: `index.html:28-34`

- [ ] **Step 1: Delete the two preconnects and the Google stylesheet `<link>`; correct the comment**

Remove lines 28–29:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
```

Replace the existing font comment block (lines 31–33) and the `<link ... css2?family=Fraunces...>` stylesheet (line 34) with a single accurate comment:

```html
    <!-- Fonts are self-hosted via Fontsource, imported in src/main.tsx:
         · Fraunces (display) — variable opsz + wght 300..700, italic + roman
         · Roboto Serif (body) — variable opsz + wght 300..700, italic + roman
         · Space Mono (mono labels, data values) — static 400/700, italic + roman -->
```

(The old comment claimed a `SOFT 0..100` axis that was never actually requested or used — do not carry it forward.)

- [ ] **Step 2: Run the guard test — it now PASSES**

```bash
pnpm exec vitest run src/styles/font-hosting.test.ts
```

Expected: both tests PASS (no Google origins in `index.html`; both CSS files contain `Fraunces Variable` and `Roboto Serif Variable`).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(fonts): remove Google Fonts CDN link + preconnects from index.html

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Doc-sync — About page and CLAUDE.md

**Files:**
- Modify: `src/views/About/About.tsx:83`
- Modify: `CLAUDE.md` (Fonts section)

- [ ] **Step 1: Update the public stack disclosure in `About.tsx`**

Line 83 currently ends `... Fraunces / Roboto Serif / Space Mono via Google Fonts'`. Change `via Google Fonts` to `self-hosted via Fontsource`:

```tsx
  { area: 'Styling', tools: 'Tailwind CSS v4 — custom earth-tone token system (espresso/cream + seven pigment ramps), Fraunces / Roboto Serif / Space Mono self-hosted via Fontsource' },
```

- [ ] **Step 2: Update the Fonts section in `CLAUDE.md`**

Find the line in the `## Fonts` section that reads:

```
All three loaded from Google Fonts CDN via `<link>` in `index.html`. Type-stack tokens live in `src/styles/tokens.css` as `--font-display` / `--font-body` / `--font-mono`.
```

Replace with:

```
All three self-hosted via Fontsource (npm), imported in `src/main.tsx`; Vite fingerprints + serves the woff2 same-origin (no Google Fonts CDN — removed June 2026 for privacy + to drop two render-blocking third-party origins). The two variable families register under their Fontsource names — `"Fraunces Variable"` / `"Roboto Serif Variable"` (Space Mono is static, keeps `"Space Mono"`); the `--font-*` tokens in `src/styles/tokens.css` + the `@theme` block in `src/index.css` reference those names. A guard test (`src/styles/font-hosting.test.ts`) fails the build if a Google Fonts origin reappears.
```

- [ ] **Step 3: Commit**

```bash
git add src/views/About/About.tsx CLAUDE.md
git commit -m "docs(fonts): sync About page + CLAUDE.md to self-hosted fonts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Full verification, push, and open the PR

**Files:** none (verification + delivery)

- [ ] **Step 1: Full test suite + production build**

```bash
pnpm test
pnpm build
```

Expected: all tests pass (including the new guard). `pnpm build` completes green (`tsc -b` + api tsconfig + `vite build`). Confirm the woff2 shipped:

```bash
ls dist/assets/*.woff2 | head
```

Expected: several `.woff2` files present in `dist/assets/` (Fontsource files bundled by Vite).

- [ ] **Step 2: Push the branch**

```bash
unset GITHUB_TOKEN
git push -u origin chore/self-host-fonts
```

- [ ] **Step 3: Open the PR**

```bash
unset GITHUB_TOKEN
gh pr create --base main --head chore/self-host-fonts \
  --title "chore(fonts): self-host Fraunces / Roboto Serif / Space Mono (drop Google Fonts CDN)" \
  --body "$(cat <<'BODY'
## What

Serves all three typefaces from DataDiver's own origin via Fontsource instead of the Google Fonts CDN.

**Why:** privacy (no visitor IP to Google), drops two render-blocking third-party origins (`googleapis` + `gstatic`), and removes a dependency whose old "shared browser cache" justification died with cache partitioning in 2020.

## How

- Add `@fontsource-variable/fraunces`, `@fontsource-variable/roboto-serif`, `@fontsource/space-mono`; import their CSS in `src/main.tsx` (the `full` variant carries both the `opsz` optical-size axis and the 300–700 `wght` range).
- Rename the two **variable** families to their Fontsource names (`"Fraunces Variable"` / `"Roboto Serif Variable"`) in the `@theme` block (`src/index.css`) and the token mirror (`src/styles/tokens.css`). Space Mono is static and unchanged.
- Remove the Google `<link>` + preconnects from `index.html`.
- Guard test (`src/styles/font-hosting.test.ts`) fails if a Google Fonts origin reappears.
- Doc-sync: About-page stack line + CLAUDE.md Fonts section.

## Verification

`pnpm test` + `pnpm build` green; woff2 bundled into `dist/assets`. **Spot-check on the preview:** hero Fraunces (optical sizing at display scale), card titles (Fraunces small opsz), mono data values, italic subtitles; DevTools Network shows zero requests to `fonts.gstatic.com` / `fonts.googleapis.com`.

Spec: `docs/superpowers/specs/2026-06-15-self-hosted-fonts-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 4: Spot-check the Vercel preview**

When the preview deploy is ready, open it and verify on `/` (hero), a map view (mono values + card titles), and The Last 48 (`/live`, italic subtitles + the headline-italic count). In DevTools → Network, filter `font` and confirm every woff2 is served from the datadiver preview origin and there are **zero** requests to `fonts.gstatic.com` / `fonts.googleapis.com`. If the hero shows a flash of fallback serif (FOUT) that reads as objectionable, note it — a `<link rel=preload>` for the hero face is the deferred follow-up (out of scope per the spec).

---

## Notes for the executor

- **The opsz axis is the one real trap.** If the display face looks uniformly "flat" between the giant hero and small card titles after the swap, the wrong (single-axis) Fontsource entry was imported — go back to Task 1 Step 2 and use the `full` file.
- **Do not** add a `font-variation-settings` or `font-optical-sizing` declaration — the site relies on the browser default (`optical-sizing: auto`), and adding one risks changing rendering. This is a delivery swap only.
- The branch already carries the spec commit; these tasks add to it, and Task 7 opens the single PR.
