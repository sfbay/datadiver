# /bank addendum — DataDiver

Project-specific surfaces and quirks, applied on top of the global bank skill.

## Extra surfaces
- **`docs/data-insights.md`** — dataset biases, coding traps, and lag
  structures discovered while querying SF open data (NAICS lag, citations
  geo gap, Vision Zero double-lag). Any "the data lies unless you know X"
  finding lands here, with the evidence that proved it. This doubles as
  source material for the methodology whitepaper (long-term goal).
- **`docs/superpowers/specs/`** — design specs. Capture sweep: if a design
  conversation reached decisions Jesse wants durable, it's a spec.
- **`docs/geo-newsletters-runbook.md`** — alerts backend operational truth
  (env vars, cron, Neon, Resend). Backend changes update the runbook.
- **`.claude/skills/datadiver-compliance.md` / `datadiver-conventions.md`**
  — compliance-dashboard knowledge base and cross-view conventions. Palette,
  idiom, or compliance-methodology changes update these.
- **`reports/`** — stakeholder deliverables (Maya / Resolution 240210).

## Quirks
- CLAUDE.md carries dated "Status" paragraphs — sweep them for staleness;
  they rot fast during sprints.
- Memory MEMORY.md is over budget (200+ lines) — when touching it, prefer
  tightening existing lines over adding; move detail into topic files.
- Verification ground truth is `pnpm build` (tsc -b incremental cache gives
  false passes); `unset GITHUB_TOKEN` before any `gh` call.
- Deploy state: Vercel auto-deploys main; env vars + crons are Vercel-side
  state, Neon DB is under the Vercel-Marketplace org (not Jesse's personal
  Neon org).
