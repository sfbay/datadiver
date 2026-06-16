# Self-Hosted Fonts — Design

**Date:** 2026-06-15
**Status:** Approved, pre-implementation
**Topic:** Migrate Fraunces / Roboto Serif / Space Mono from the Google Fonts CDN to self-hosted (Fontsource) delivery.

---

## Goal

Serve all three typefaces from DataDiver's own origin (Vercel edge) instead of `fonts.googleapis.com` + `fonts.gstatic.com`, **preserving the current rendering pixel-for-pixel** — optical sizing, weights, italics, and the `cv11`/`ss01` stylistic set.

## Motivation

1. **Privacy.** Every page load currently hands the visitor's IP to Google (the render-blocking `<link>` to `googleapis`, then the font fetch from `gstatic`). DataDiver is a public-interest civic tool whose stated design principle is to "choose the most privacy-preserving option." Self-hosting keeps font delivery first-party. It also removes exposure to the GDPR Google-Fonts rulings.
2. **Performance — drops two render-blocking third-party origins.** Today's critical path: parse HTML → fetch Google's CSS (blocking; DNS+TLS hop #1 to `googleapis`) → that CSS points at `gstatic` (hop #2, fresh DNS+TLS) → fetch woff2. Self-hosting collapses this to same-origin, HTTP/2-multiplexed delivery.
3. **The classic counter-argument is obsolete.** The "Google Fonts is already cached from other sites" defense died in 2020 when browsers partitioned the HTTP cache by origin (a privacy fix). Every site now re-downloads its Google Fonts, so we pay the third-party privacy/latency cost with zero shared-cache benefit. Self-hosting loses nothing that still exists.
4. **Determinism.** Pinned files, works offline in dev/preview, immune to Google changing subsetting by User-Agent or having an outage.

## Current state

`index.html` loads (lines 28–29 preconnects, line 34 stylesheet):

```
https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Roboto+Serif:ital,opsz,wght@0,8..144,300..700;1,8..144,300..700&family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap
```

So: **Fraunces** and **Roboto Serif** are variable fonts with the `opsz` (optical size) + `wght` axes, upright + italic. **Space Mono** is static (400/700 + italics).

Verified in the codebase:
- **No** `font-variation-settings`, `optical-sizing`, `SOFT`, or `WONK` anywhere. The site relies on the browser default `font-optical-sizing: auto`, which auto-maps font-size → `opsz`. The `SOFT 0..100` axis named in code comments/CLAUDE.md is **not actually wired** (the Google request doesn't even include it) — a no-op today; we do not need it.
- One stylistic-feature declaration: `font-feature-settings: "cv11", "ss01"` at `src/index.css:138`.
- Family names are declared in exactly two places: the `@theme` block at `src/index.css:127–129` and the mirror token block at `src/styles/tokens.css:126–128`. Everything else resolves through `var(--font-*)` / Tailwind font utilities.
- Two hard-coded inline `Space Mono` references (Mapbox popup `Neighborhood.tsx:298`, SVG label `CivicFingerprint.tsx:186`).

## Approach: Fontsource (npm)

Three dependencies:

| Package | Type | Carries |
|---|---|---|
| `@fontsource-variable/fraunces` | variable | opsz + wght + italic |
| `@fontsource-variable/roboto-serif` | variable | opsz + wght + italic |
| `@fontsource/space-mono` | static | 400 / 700 + italics |

Imported as CSS in the app entry (`src/main.tsx`). Vite fingerprints the woff2 and serves them same-origin with immutable cache headers. Fontsource ships the *same* unicode-range-subsetted woff2 that Google does, so byte parity is close — the win is origin + privacy, not a size cut. Fontsource CSS sets `font-display: swap` by default.

### The core mechanism: a family-name rename

Fontsource's **variable** packages register the font under `"<Name> Variable"`, not the bare name. So the load-bearing edit is renaming the family in the two declaration sites:

- `src/index.css` `@theme`: `--font-display` and `--font-sans` → `"Fraunces Variable"` / `"Roboto Serif Variable"`
- `src/styles/tokens.css`: `--font-display` and `--font-body` → same

Because all consumers flow through these tokens / Tailwind utilities, the two edits propagate site-wide. **Space Mono is the static package and keeps the bare `"Space Mono"` name**, so the two inline references need no change. Only the two variable families are renamed.

### Preserving opsz + cv11/ss01

- **opsz axis is mandatory.** With `font-optical-sizing: auto` in effect, the self-hosted file must carry the `opsz` axis or the display face silently collapses to a single optical master (Fraunces especially degrades). Fontsource exposes per-axis CSS entry points; the implementation will **inspect the installed package's real file list** (`ls node_modules/@fontsource-variable/fraunces/`) and import the entry that carries opsz **and** wght together (its `full` or `opsz` variant), upright + italic — rather than guess a subpath.
- **`cv11`/`ss01`** ride inside the woff2; no separate handling.
- **Subsets:** latin + latin-ext (covers accented SF names, e.g. "Peña"). CJK/other scripts are out of these fonts' coverage today and fall back to system fonts either way — no behavior change.

## Files touched (~6)

1. `package.json` — add the three Fontsource deps.
2. `src/main.tsx` — import the Fontsource CSS (variable opsz+italic for the two, static for Space Mono).
3. `src/index.css:127–128` + `src/styles/tokens.css:126–127` — rename the two variable families to `"… Variable"`.
4. `index.html` — delete the two `<preconnect>`s (28–29) and the `<link>` stylesheet (34); correct the descriptive comment (31–33), which currently misstates a `SOFT 0..100` axis that isn't used.
5. `src/views/About/About.tsx:83` — the public stack table reads "via Google Fonts"; update to self-hosted so the AI/stack disclosure stays truthful (CLAUDE.md flags About as keep-in-sync).
6. **Doc sync:** CLAUDE.md's Fonts section ("All three loaded from Google Fonts CDN via `<link>`") becomes false → update in the same PR.

## Out of scope (YAGNI)

- **No manual `<link rel=preload>` tuning in v1.** Same-origin + `font-display: swap` already removes the third-party hop. Add a preload only if the spot-check shows hero FOUT (fingerprinted Vite asset URLs make a static preload href brittle anyway).
- No manual subsetting beyond Fontsource defaults.
- No font/typeface changes — this is a delivery swap only.

## Verification (spot-check)

On the Vercel preview:
- Eyeball **hero Fraunces** (optical sizing at display scale), **card titles** (Fraunces at small opsz), **mono data values** (Space Mono), and **italic subtitles** (both serifs' italics) for parity with production.
- DevTools Network: woff2 served from the datadiver origin; **zero** requests to `fonts.gstatic.com` / `fonts.googleapis.com`.
- `pnpm build` green; the built `dist/assets` includes the woff2 files.

## Risks & rollback

- **Risk:** wrong Fontsource entry imported → opsz stops varying. *Mitigation:* inspect the package file list before choosing the import; verify the hero vs. card-title optical difference in the spot-check.
- **Risk:** a missed literal family reference renders fallback serif. *Mitigation:* the grep confirmed only the two CSS sites declare the variable families; Space Mono inline refs are unaffected.
- **Rollback** is trivial: revert the PR — the Google `<link>` returns and the deps are dropped. No data, no migration, no env state involved.
