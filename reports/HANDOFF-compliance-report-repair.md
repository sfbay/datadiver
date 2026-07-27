# HANDOFF — Resolution 240210 compliance report, corruption repair (2026-07-27)

Done in a different session (the Flow session — wrong window, right work). Nothing
in `~/dev/datadiver` was touched except the two files created below. No git
operations were run.

## Current authoritative file

**`reports/resolution-240210-compliance-report-4.docx`** — Jesse's reformatted
layout, all 15 corrupted spans repaired, verified. Use this one.

## What was wrong

The `.docx` Jesse formatted was generated from `resolution-240210-compliance-report.md`
by a converter that parsed paired `$` as LaTeX math. Two effects:

1. **Everything between two `$` became an inline equation** — words lost their
   spaces and turned italic Cambria Math (`FlipbirdFilms`, `ColeProMedia`).
2. **`%` starts a comment in LaTeX**, so the remainder of the span was *deleted*.
   `0% ethnic media): The Sheriff's advertising includes Professional Sports
   Publications (` vanished outright because it followed a `%`.

15 damaged sites across 9 logical passages. **6 of them silently reattached
dollar figures to the wrong organization** — the surviving fragments still read
as fluent English, e.g. `Sheriff ($24,500)` (that is Professional Sports
Publications' figure), and `Elections ($138,431…), Sheriff ($110,265, zero
ethnic placements)` (those are the Public Library's and the PUC's).

`resolution-240210-compliance-report.md` and `resolution-240210-compliance-report.docx`
(13:51) are both **clean** — they were the repair source.

## File inventory

| File | Status |
|---|---|
| `…-report.md` | ✅ clean — source of truth for text |
| `…-report.docx` (13:51) | ✅ clean text, no custom formatting |
| `…-report-2e.docx` | ❌ OMML math corruption (valid docx) |
| `…-report-2.docx` | ❌ **legacy binary `.doc` with a `.docx` extension**; math → QUOTE fields |
| `…-report-3.docx` | ❌ Jesse's true-`.docx` re-save of `-2`; 15 QUOTE fields wrapping EMF pictures |
| `…-report-4.docx` | ✅ **repaired — current good copy** |
| `REPAIR-SHEET-report-2.md` | reference: per-site before/after, written before the automated fix |

Backup of `-3` (pre-repair):
`/private/tmp/claude-505/-Users-faculty-m-dev-flow/5df21f57-a834-4491-ae13-707b839f5e22/scratchpad/docdiff/backup-3.docx`

## How the repair was done

Direct XML patch of `word/document.xml`. Each damaged site was a
`fldChar begin … QUOTE instrText … w:pict(EMF) … fldChar end` run sequence; each
was replaced with text runs carrying the `<w:rPr>` lifted from the field's own
runs (so each repair inherits that paragraph's existing font/size rather than a
hardcoded style). The two bold labels — `Sheriff (` and `Human Resources (` —
emit two runs each, bold through the colon then plain, matching the source.

Replacement text derived from the `.md`, not reconstructed.

## Verification (measured, not assumed)

- **Only `word/document.xml` changed.** The other 30 package parts — `styles.xml`,
  `numbering.xml`, `theme1.xml`, `header1.xml`, `footer1.xml`, all media,
  `fontTable.xml` — are byte-identical (md5).
- Paragraphs 987 → 987 · tables 21 → 21 · `pStyle` refs 967 → 967 · `rStyle` refs 27 → 27
- QUOTE fields 15 → 0 · `<w:pict>` 30 → 0 · `fldChar` 45 → 0
- Every XML part parses well-formed
- All 9 repaired passages string-match the `.md`
- Final word count 8,784

## ⚠️ Do NOT regenerate this document from the markdown

`-4` contains **8 edits by Jesse that exist nowhere else**. Regenerating from the
`.md` would fix nothing and lose all of these:

| In `-4` (keep) | In the `.md` |
|---|---|
| "reach **community or** ethnic media?" | "reach ethnic media?" |
| "(**Meta, etc.**)" | "(Facebook, Google, Instagram)" |
| "developed **by Assoc. Professor Jesse Garnier,** at SFSU" | "developed at SFSU" |
| "$23.8 **million**", "$4.9 **million**", "$1.73 **million**", "$340**k**" | "$23.8M", "$4.9M", "$1.73M", "$340K" |
| "FY 2025" | "FY2025" |
| "…share media placement data." | "…data so the full picture can be assessed." |
| "…**and does not reveal** the media outlet that **may have**…" | "…the bank that issues the card, not the media outlet that…" |
| "Hyperlocal/culture" | "Hyperlocal / neighborhood" |

If the `.md` is meant to stay canonical, these need to be back-ported into it —
that is an open question, not something done here.

## Open items

1. **Pipeline fix.** Whatever generates the `.docx` from the `.md` will reproduce
   this every run — the report is full of dollar figures. If pandoc is in the
   chain, `-f markdown-tex_math_dollars` disables math parsing. The clean 13:51
   `.docx` does *not* have the damage, so a working configuration already exists
   somewhere; worth finding rather than reinventing.
2. **Back-port decision** — the 8 edits above (see table).
3. **Cosmetic:** 15 now-unreferenced `.emf` files remain in the `-4` package
   (~6 KB). Harmless; Word drops them on its next save.
4. Word lock files (`~$solution-…`) existed for `-2`, `-3`, and `report.docx`
   during this work — those documents were open. `-3` should be closed *without
   saving* before `-4` is opened.

---

## RESOLUTION (main session, 2026-07-27)

1. **Pipeline fix — was already done** before the corruption was found: commit `24960a3`
   regenerates with `pandoc -f gfm-tex_math_dollars` (command pinned in an HTML comment
   at the top of the md). The clean 13:51 `.docx` was that regeneration; the corrupted
   lineage descended from the earlier `ec22a4c` docx, formatted before the fix landed.
2. **Back-port — done.** Twelve edits ported from `-4` into the canonical md — the 8
   listed above plus 4 the full diff surfaced: Rec 9 rewritten around an "advertising
   gateway", AsianWeek removed (§2 table + Appendix A), the Chinese-language outlet
   row reordered, and "social media boosts". Two deliberate deviations, both flagged
   to Jesse: "FY 2025" (stray space, judged accidental — md keeps "FY2025") and
   "citywide contracts requires" ported with subject-verb agreement ("require").
3. **Not missing, just invisible:** the review banner, "A Question for the Coalition,"
   and the "Live compliance monitoring" line are inside Word text boxes in `-4` —
   present in `word/document.xml` but dropped by pandoc extraction. Do not "restore"
   them to the body text.
4. **PDF:** the tracked `resolution-240210-compliance-report.pdf` is now Jesse's `-4`
   export (`-072726.pdf`, byte-identical). `-orig.pdf` was a byte-identical backup of
   the old March export. `-4.docx` is committed as the formatted master; `-2`, `-2e`,
   `-3` remain untracked corrupted intermediates, deletable once Jesse confirms.
