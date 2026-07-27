# Repair sheet — `resolution-240210-compliance-report-2.docx`

Nine passages in your reformatted version were damaged when the document was
generated. **Six of them now attach dollar figures to the wrong organization** —
those are marked ⚠ and matter more than the missing words.

Source of truth: `resolution-240210-compliance-report.md` (and the clean
`resolution-240210-compliance-report.docx`, 13:51). Both are correct.

In Word the damaged spans appear as **inline equation objects** — italic Cambria
Math, no spaces between words. Click one and it selects as a single object.
Delete the object, then type the replacement text.

---

## ⚠ 1. Sheriff vendor list — four wrong attributions

**Shows now:** Sheriff ($24,500), KRON TV ($18,750), "Top of the World Media"
($10,000), Rivet Campus Media ($2,142), and $28,451…

**Should read:**

> **Sheriff ($121,118 discretionary in FY2026, 0% ethnic media):** The Sheriff's
> advertising includes Professional Sports Publications ($24,500), KRON TV
> ($20,000), Cole Pro Media ($18,750), "Top of the World Media" ($13,000),
> Flipbird Films ($10,000), Rivet Campus Media ($4,275), SACJOBS.COM ($2,142),
> and $28,451 across 11 payments recorded only as "Single Payment Payees"

Lost entirely: *Professional Sports Publications*, *Cole Pro Media*, *Flipbird
Films*, *SACJOBS.COM*, and the $121,118 / 0% framing. KRON TV currently shows
$18,750 (Cole Pro Media's figure); it was $20,000. Rivet Campus Media shows
$2,142 (SACJOBS.COM's figure); it was $4,275.

---

## ⚠ 2. Human Resources vendor list — three wrong attributions

**Shows now:** Human Resources ($39,996) — and on law enforcement trade press
(PORAC Law Enforcement News, $1,380), Sing Tao Daily ($590).

**Should read:**

> **Human Resources ($62,932 discretionary in FY2026, 4.7% ethnic media):** HRD
> spends heavily through agencies — Great Kolor LLC ($39,996) — and on law
> enforcement trade press (PORAC Law Enforcement News, $11,750). HRD does place
> some ethnic media: World Journal ($1,380), Sing Tao Daily ($960), and Wind
> Newspaper ($590).

Lost entirely: *Great Kolor LLC*, *World Journal*, *Wind Newspaper*, the $11,750
PORAC figure, and the $62,932 / 4.7% framing. PORAC currently shows $1,380
(World Journal's figure). Sing Tao Daily shows $590 (Wind Newspaper's figure);
it was $960.

**This one changes the argument.** The sentence that follows says "the ratio is
stark: $11,750 in a single law enforcement trade publication" — but $11,750 no
longer appears anywhere above it, so the comparison has nothing to stand on.

---

## ⚠ 3. Department compliance targets — two wrong attributions

**Shows now:** Departments with significant expenditures — Elections ($138,431,
mostly agency-routed), Sheriff ($110,265, zero ethnic placements) — each
represent…

**Should read:**

> Departments with significant expenditures — Elections ($240,357 in FY2026,
> entirely through a single agency), the Public Library ($138,431, mostly
> agency-routed), Sheriff ($121,118, primarily recruitment), and the Public
> Utilities Commission ($110,265, zero ethnic placements) — each represent

Lost entirely: *the Public Library*, *the Public Utilities Commission*. As it
reads now, Elections is credited with the Library's $138,431 and the Sheriff
with the PUC's $110,265 — including "zero ethnic placements," which is the PUC's
finding, not the Sheriff's.

---

## ⚠ 4. Elections / Public Library agency spending

**Shows now:** …Department of Elections ($424,980 in FY2025 and $106,986).

**Should read:**

> Most Likely To's work for the Department of Elections ($424,980 in FY2025 and
> $240,357 in FY2026) and, new in FY2026, the Public Library ($106,986).

Elections FY2026 was $240,357. The $106,986 belongs to the Public Library, which
has dropped out of the sentence.

---

## 5. MTA budget range

**Shows now:** …a department with a $59K annual advertising budget…

**Should read:** …a department with a **$53K–$59K** annual advertising budget…

---

## 6. Small-dollar compliance amounts

**Shows now:** These are small dollar amounts ($2,000), but they show…

**Should read:** These are small dollar amounts (**$385–$2,000**), but they show…

---

## 7. P-card total (Compliance Implication)

**Shows now:** P-card advertising totaling $59,000 per year…

**Should read:** P-card advertising totaling **$33,000–$59,000** per year…

---

## 8. P-card total (Limitations section)

**Shows now:** P-card opacity: The $59,000/year in P-card advertising…

**Should read:** P-card opacity: The **$33,000–$59,000/year** in P-card
advertising…

---

## 9. Civic Edge Consulting — stray field + missing parenthesis

**Shows now:** Agencies like Civic Edge Consulting  $23.8 million through
FY2026) and Most Likely To ($4.9 million)…

**Should read:** Agencies like Civic Edge Consulting **($23.8 million** through
FY2026) and Most Likely To ($4.9 million)…

Only the opening parenthesis is missing here — you had already retyped the
figures. Delete the leftover object and type `(`.

---

# Do not lose these — edits that exist only in your version

If you ever regenerate from the markdown, these will disappear. They are yours,
they are not in the source, and several are improvements:

| Your version (`-2`) | Source / clean version |
|---|---|
| "reach **community or** ethnic media?" | "reach ethnic media?" |
| "(**Meta, etc.**)" | "(Facebook, Google, Instagram)" |
| "developed **by Assoc. Professor Jesse Garnier,** at San Francisco State University" | "developed at San Francisco State University" |
| "$23.8 **million**", "$4.9 **million**", "$1.73 **million**", "$340**k**" | "$23.8M", "$4.9M", "$1.73M", "$340K" |
| "FY 2025" | "FY2025" |
| "…share media placement data." | "…share media placement data so the full picture can be assessed." |
| "…**and does not reveal** the media outlet that **may have**…" | "…the bank that issues the card, not the media outlet that…" |
| "Hyperlocal/culture" | "Hyperlocal / neighborhood" |

You had also already hand-repaired four other damaged spots (the Daily Journal /
Zeba / Intersection Media figures and the FY2025 Board of Supervisors line).
Those are correct as they stand.

---

# What happened

The `.docx` you formatted was generated from the markdown by a converter that
read paired dollar signs as LaTeX math. Everything between two `$` characters
became an equation — which is why the words inside lost their spaces and turned
italic.

Worse, a `%` inside a LaTeX equation starts a comment, so everything after it on
that line was thrown away. That is why "0% ethnic media): The Sheriff's
advertising includes Professional Sports Publications (" vanished outright
rather than merely being mangled — it followed a `%`.

The clean `resolution-240210-compliance-report.docx` does not have this problem,
so whatever produced it had math parsing turned off.

**One more thing:** your file is a legacy binary Word `.doc` that was given a
`.docx` extension — Word's own lock file calls it
`~$solution-240210-compliance-report-2.doc`. It opens fine, but anything that
reads it as a real `.docx` will fail. Worth a "Save As → .docx" once the text
repairs are in.
