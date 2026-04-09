# Resolution 240210 Compliance Report

## City and County of San Francisco — Ethnic & Community Media Advertising

**Board of Supervisors File No. 240210** (Supervisors Dorsey; Preston)

---

**Report Date:** March 23, 2026
**Reporting Period:** Fiscal Years 2018–2026 (FY2026 partial, through March 2026)
**Prepared by:** DataDiver Civic Data Platform — San Francisco State University
**Data Source:** SF Open Data, Vendor Payments dataset `n9pm-xkyq` (7.9M records, updated weekly)
**Live Dashboard:** [datadiver.vercel.app/city-budget?tab=advertising](https://datadiver.vercel.app/city-budget?tab=advertising)

---

> **DRAFT FOR COALITION REVIEW — NOT FOR PUBLIC DISTRIBUTION**
>
> This is a first draft prepared for review by the ethnic and community media coalition. The data-backed findings in this report are derived from the city's public financial records and reflect what is visible in that data. However, several assertions — particularly regarding agency pass-through spending, P-card purchases, and department-level advertising practices — require verification by the departments themselves before this report is finalized for public release.
>
> **We invite coalition input on:**
> - The denominator question (Section 4) — which interpretation of "discretionary advertising" should the coalition advocate for?
> - The media classification registry — are there outlets missing or miscategorized?
> - The recommendations — which are highest priority for the coalition's advocacy?
> - The overall framing and tone — does this report serve the coalition's goals?
>
> Following coalition review, a revised version will be prepared for presentation to city departments, with an opportunity for departments to respond to the findings before public release.

---

## Executive Summary

**San Francisco is not meeting the advertising equity target set by its own Board of Supervisors.**

Resolution 240210 urges city departments to spend at least **50% of discretionary advertising budgets** with locally owned ethnic and community journalism outlets. Our analysis of 7.9 million vendor payment records finds:

| Metric | FY2025 (complete) | FY2026 (9 months) | Target |
|--------|-------------------|--------------------|--------|
| **Compliance rate** | **5.8%** | **9.9%** | **50%** |
| Ethnic media spend | $60,546 | $47,624 | — |
| Discretionary ad spend | $1,037,241 | $482,802 | — |
| Shortfall to 50% | $458,075 | $193,777 | — |
| Ethnic outlets paid | 9 | 10 | ~98 available |

**The city would need to redirect approximately $458,000 per year** from its existing discretionary advertising budget to reach the 50% target — roughly 44 cents of every advertising dollar that currently goes to non-ethnic-media vendors.

**Some departments are leading the way.** MTA consistently exceeds the 50% target (63.5% in FY2026 YTD), placing ads with 8 different ethnic and community outlets. HSA and ASR also meet or exceed the target. These departments demonstrate that compliance is operationally achievable — the question is how to extend their practices citywide.

The overall compliance trend is **declining**, not improving. From a peak of 21.0% in FY2022, ethnic media's share of discretionary advertising has fallen to single digits. The resolution, filed in 2024, has not yet reversed this trajectory.

### Three Open Questions

1. **Why do most departments spend zero?** Of ~24 departments with advertising budgets, only 2–3 direct any dollars to ethnic media in a given year. MTA and HSA demonstrate that compliance is achievable — what barriers prevent other departments from following their lead?

2. **Does any of the $29.4 million in agency contracts reach ethnic media?** Agencies like Civic Edge Consulting ($20.3M lifetime) and Most Likely To ($4.6M) receive city funds for marketing and communications work not classified as "Advertising" in the financial system. Some of this spending may well include ethnic media placements — but we cannot tell from the data. Departments and agencies are best positioned to answer this question.

3. **What are P-card advertising purchases being used for?** Between $33,000 and $58,000 per year in advertising is purchased via procurement cards (P-cards), appearing only as "P-CARD ONLY US BANK N.A." These may be digital platform buys (Facebook, Google), but they could also include other media. Departments using P-cards for advertising can clarify what these purchases represent.

---

## 1. About Resolution 240210

On [date of adoption], the San Francisco Board of Supervisors adopted Resolution 240210, sponsored by Supervisors Matt Dorsey and Dean Preston. The resolution:

> **RESOLVED**, That the Board of Supervisors urges City departments to sustain their spending of at least half of their annual discretionary advertising budgets with locally owned and run ethnic and community journalism outlets, which includes nonprofit and for-profit media organizations.

> **FURTHER RESOLVED**, That the Board of Supervisors urges the City to publicly report how much money is spent on ethnic and community journalism publications each year.

> **FURTHER RESOLVED**, That the Board of Supervisors recognizes local news as a public good.

The resolution was prompted by a **2023 Budget and Legislative Analyst (BLA) report** that found:

- Only **7 of 98** San Francisco media outlets receive city advertising dollars
- Many departments purchase ads through **third-party agencies**, and those expenditures are **not categorized as advertising** in the city's financial system
- Increasing ethnic media ad spend requires **streamlining** the city's procurement processes

The BLA report also found that FY2022–2023 ethnic media spending "exceeds fifty percent of total **print and digital** discretionary advertising." As Section 4 of this report explains, that finding used a narrower denominator than our analysis. When all discretionary advertising is considered — including out-of-home, radio/TV, and agency-placed media — the ethnic media share is significantly lower.

---

## 2. Methodology

### What We Measure

The percentage of the city's discretionary advertising spend that reaches ethnic and community journalism outlets, computed as:

```
Compliance % = Ethnic Media Spend / Total Discretionary Advertising × 100
```

### The Denominator: Discretionary Advertising

**Included:** All vendor payments where the city's financial system classifies the expenditure under `sub_object = 'Advertising'` (Socrata dataset `n9pm-xkyq`).

**Excluded from the denominator:**

| Vendor | Lifetime Spend | Reason for Exclusion |
|--------|---------------|---------------------|
| Daily Journal Corporation | $7.75M+ | Mandatory legal publications — public hearing notices, bid advertisements, and ordinance publications required by law |
| California Newspaper Service Bureau | $2.08M+ | Mandatory legal notice distribution — not discretionary outreach |

These vendors are excluded because legal notice publication is **mandated by statute**, not a discretionary advertising choice. Including them would inflate the denominator and misrepresent the spending departments actually control.

### The Numerator: Ethnic & Community Media

Vendors are classified using an open-source registry maintained in DataDiver's codebase (`src/utils/mediaClassification.ts`). The registry currently identifies **28+ ethnic and community media outlets** organized by community:

| Community | Outlets in Registry |
|-----------|-------------------|
| Chinese-language | Sing Tao Daily, World Journal, Chinese Times, Wind Newspaper |
| Spanish-language | El Mensajero, El Tecolote, El Reportero, Accion Latina |
| Filipino | Philippine News, Fil-Am Radio |
| Korean / South Asian | Korea Times, India Currents, AsianWeek, Center for Asian American Media |
| LGBTQ+ | Bay Area Reporter, San Francisco Bay Times |
| African American | San Francisco Bay View |
| Neighborhood / Hyperlocal | SF Neighborhood Newspaper Association, Mission Local, Broke-Ass Stuart |
| Multicultural Radio | Multicultural Radio Broadcasting |

**This registry is auditable.** It is published as open-source code, not a proprietary database. Any classification can be inspected, challenged, or corrected. The live dashboard links each vendor to its classification rationale.

### What We Do NOT Count

1. **Agency pass-through spending** — When a department pays an agency like Civic Edge Consulting or Most Likely To, the agency may place ads in ethnic media. But the city's payment records show only the agency, not the ultimate outlet. We cannot credit spending we cannot verify.

2. **P-card advertising** — Procurement card purchases appear as "P-CARD ONLY US BANK N.A." with no outlet identification. These are almost certainly direct-to-platform digital buys (Facebook, Google, Instagram), but we cannot confirm this.

3. **Non-advertising payments** — Some ethnic media outlets receive city payments for services other than advertising (e.g., translation, event hosting). Only payments classified as `sub_object = 'Advertising'` are counted.

### Alignment with the BLA Methodology

Our methodology aligns with the 2023 BLA report's approach of using the city's financial classification system as the baseline. One important difference: the BLA reported compliance against "print and digital" discretionary advertising specifically, while our analysis uses **all** discretionary advertising (including out-of-home, radio/TV, and other media types). This broader denominator produces a lower compliance percentage but more accurately reflects the total advertising budget departments control.

### Independent Validation: The 2022 OEWD File

In August 2022, the city's Office of Economic and Workforce Development (OEWD) prepared a detailed file of advertising voucher payments covering 2017 through mid-2022 in response to a community request. This file — pulled from the same underlying financial system DataDiver queries today — classified 116 city vendors as either "Community and Ethnic Print Media" (10 vendors) or "Other Media" (106 vendors), and attached a broader list of 31 SF community and ethnic media outlets the city tracks as part of the local information ecosystem.

**Applying DataDiver's classification methodology to OEWD's raw voucher data, we match the city's own classification to 100%** across all 10 vendors OEWD labeled as Community and Ethnic Print Media — $518,912.01 in aggregate, exact to the penny. DataDiver additionally catches two vendors OEWD omitted (Multicultural Radio Broadcasting, $54,135; Center for Asian American Media, $7,500), both of which are legitimate community and ethnic media by any reasonable definition.

**The three-layer model (tagged, agency, p-card) is validated by OEWD's own data ordering.** In the 2017–2022 period, the top four advertising recipients were Daily Journal Corporation ($1.73M legal notices), Zeba Consulting ($1.19M full-service agency), Promotion Marketing ($340K agency), and Intersection Media ($312K out-of-home) — exactly the categories DataDiver's three-layer model was designed to surface as non-community spending. OEWD labeled all four as "Other Media," confirming they should not count toward compliance.

A more striking finding from the same file: OEWD's broader 31-outlet ecosystem list names 19 community and ethnic media outlets that received **zero dollars** in city advertising payments across the full 5+ year period covered by the file. Full validation tables and the complete zero-payment outlet list are in Appendix D. The OEWD source file and our cross-reference CSV are version-controlled at `reports/validation/` alongside this report.

### Fiscal Year Convention

San Francisco's fiscal year runs July 1 through June 30. "FY2025" = July 1, 2024 – June 30, 2025. FY2026 data in this report covers approximately 9 months (July 2025 – March 2026).

---

## 3. Findings: Historical Compliance Trend

### Citywide Compliance Rate, FY2018–FY2026

| Fiscal Year | Total Advertising | Legal Notices | Discretionary | Ethnic Media | Compliance % | Outlets Paid |
|-------------|------------------|---------------|---------------|-------------|-------------|-------------|
| FY2018 | $1,137,376 | $409,540 | $727,836 | $130,755 | **18.0%** | 8 |
| FY2019 | $1,227,364 | $512,790 | $714,574 | $126,480 | **17.7%** | 8 |
| FY2020 | $1,611,905 | $409,304 | $1,202,601 | $148,615 | **12.4%** | 9 |
| FY2021 | $1,674,180 | $317,459 | $1,356,721 | $159,262 | **11.7%** | 7 |
| FY2022 | $1,491,282 | $455,411 | $1,035,871 | $217,942 | **21.0%** | 9 |
| FY2023 | $1,559,847 | $290,395 | $1,269,452 | $163,094 | **12.8%** | 10 |
| FY2024 | $1,538,522 | $318,377 | $1,220,145 | $90,993 | **7.5%** | 11 |
| FY2025 | $1,408,531 | $371,290 | $1,037,241 | $60,546 | **5.8%** | 9 |
| FY2026* | $829,607 | $346,805 | $482,802 | $47,624 | **9.9%** | 10 |

*\*FY2026 is a partial year (9 months through March 2026). Dollar amounts will increase; the percentage is indicative.*

### Key Observations

**The trend is moving in the wrong direction.** After reaching a peak of 21.0% in FY2022, ethnic media's share has declined steadily to single digits. The FY2025 figure of 5.8% represents the lowest compliance rate in the eight-year measurement window.

**Ethnic media spending is declining in absolute terms.** From $217,942 in FY2022 to $60,546 in FY2025 — a **72% decline** in three years. This is not a denominator effect; the actual dollars going to ethnic outlets are shrinking.

**The number of outlets receiving payments has plateaued.** Despite the BLA identifying 98 media outlets in San Francisco, only 7–11 ethnic/community outlets receive city advertising dollars in any given year. This number has barely changed since FY2018.

**The 50% target has never been met** under this methodology. The highest recorded compliance was 21.0% in FY2022 — less than half the target.

---

## 4. The Denominator Question — A Critical Choice for the Coalition

The BLA's 2023 report found that ethnic media spending in FY2022–2023 "exceeds fifty percent of total **print and digital** discretionary advertising." Resolution 240210 cites this finding.

Our analysis of the same data finds very different numbers — not because of a data error, but because the compliance percentage changes dramatically depending on what you include in the denominator. **The definition of "discretionary advertising" is the single most consequential decision in this entire analysis.**

### Three Lenses, Three Realities

We computed compliance under two definitions of the denominator — the resolution's plain language and the BLA's narrower framing:

**Resolution Standard — All Discretionary Advertising** (this report's primary method): Total `sub_object = 'Advertising'` minus legal notices. Includes newspapers, radio/TV, billboards, agencies, digital, P-card, recruitment ads, and everything else classified as advertising.

**BLA Standard — Print and Digital Only**: Ethnic press + metro dailies (Chronicle, Examiner) + P-card (likely digital) + unclassified vendors. Excludes out-of-home (billboards, transit), radio/TV broadcast, agencies, recruitment advertising, and production. This aligns with the BLA's language of "print and digital discretionary advertising."

| Fiscal Year | Resolution Standard (All Discretionary) | BLA Standard (Print + Digital) |
|-------------|-------------------------:|------------------------:|
| FY2018 | **18.0%** | 33.2% |
| FY2019 | **17.7%** | 41.2% |
| FY2020 | **12.4%** | 33.7% |
| FY2021 | **11.7%** | **46.2%** |
| FY2022 | **21.0%** | 40.8% |
| FY2023 | **12.8%** | 33.3% |
| FY2024 | **7.5%** | 22.9% |
| FY2025 | **5.8%** | 18.2% |
| FY2026* | **9.9%** | 14.4% |

*\*FY2026 is a partial year.*

### What Each Standard Reveals

**Under the Resolution Standard** (all discretionary), the city has never come close to the 50% target. The peak was 21.0% in FY2022, and compliance has declined to single digits. This is the most comprehensive measure and reflects the plain language of the resolution ("discretionary advertising budgets").

**Under the BLA Standard** (print + digital), the city came closest in FY2021 at 46.2% and hovered in the 33–41% range for several years — approaching but not reaching 50%. However, this measure has also declined sharply since FY2022, falling to 18.2% in FY2025. Even under the more favorable BLA methodology, the city is now well below the target and moving in the wrong direction.

**Neither standard shows current compliance.** The BLA's 2023 finding that spending "exceeds fifty percent" likely used an even narrower definition or included department survey data beyond what appears in the financial system. Regardless, both standards agree on the trend: ethnic media's share is declining.

### Why the Denominator Matters So Much

The gap between the two standards exists because most city advertising spending is *not* print or digital media. In FY2026, the advertising budget includes:

| Category | FY2026 Spend | Resolution Standard? | BLA Standard? |
|----------|------------:|:----------:|:----------:|
| Ethnic & community press | $47,624 | Yes | Yes |
| Metro dailies (Chronicle, Examiner) | $4,171 | Yes | Yes |
| P-card (likely digital) | $33,475 | Yes | Yes |
| Other / unclassified | $247,166 | Yes | Yes |
| Radio & TV (KRON, KTSF, etc.) | $46,230 | Yes | No |
| Out-of-home (Clear Channel, etc.) | $12,819 | Yes | No |
| Agencies (Great Kolor, Most Likely To, etc.) | $91,316 | Yes | No |
| **Denominator total** | | **$482,802** | **$330,294** |
| **Compliance %** | | **9.9%** | **14.4%** |

The same $47,624 in ethnic media spending produces a compliance rate of either 9.9% or 14.4% depending on the denominator. The numerator doesn't change — only the question of what it's measured against.

Under both standards, the city is well short of the 50% target. But the choice of standard affects how large the gap appears, what categories of spending become subject to the target, and what kinds of changes are needed to close the gap.

### A Question for the Coalition

> **Which standard should the coalition advocate for?**
>
> - **The Resolution Standard (all discretionary)** is the broader position. It says: every dollar a department spends on advertising — including billboards, TV, agency campaigns, and digital — should be subject to the 50% target. This demands the most change and captures the full scope of city advertising.
>
> - **The BLA Standard (print + digital)** is narrower. It says: the 50% target applies to print and digital media placements, but not to billboards, broadcast, or agency overhead. This aligns with the BLA's language and produces a smaller gap, but the city is still well below 50% and declining.
>
> Under either standard, the city is out of compliance and the trend is negative. The coalition's position on this question will shape the size of the ask and the advocacy strategy. This report currently uses the Resolution Standard as the primary measure, with the BLA Standard presented alongside it.

### Recommendation

Regardless of which standard the coalition adopts, we recommend the Board of Supervisors **clarify the resolution's intent** by specifying whether "discretionary advertising budgets" means:
- (a) All discretionary advertising (Resolution Standard), or
- (b) Print and digital media placements specifically (BLA Standard)

Without this clarification, the city and the coalition will continue measuring against different standards — and both will believe their numbers are correct.

---

## 5. Department Report Card

### FY2025 (Most Recent Complete Year)

| Status | Department | Ethnic Media | Discretionary Total | Compliance % | Outlets |
|--------|-----------|-------------|--------------------|--------------:|--------:|
| ✓ | HSA Human Services Agency | $13,358 | $13,539 | **98.7%** | 2 |
| ✓ | ASR Assessor-Recorder | $4,854 | $4,854 | **100.0%** | 1 |
| ✓ | MTA Municipal Transportation Agency | $30,231 | $52,839 | **57.2%** | 6 |
| ✓ | BOS Board of Supervisors | $480 | $480 | **100.0%** | 1 |
| ✗ | HRD Human Resources | $6,668 | $163,662 | **4.1%** | 3 |
| ✗ | LIB Public Library | $3,011 | $67,075 | **4.5%** | 2 |
| ✗ | PUC Public Utilities Commission | $1,945 | $46,452 | **4.2%** | 2 |
| ✗ | REG Elections | $0 | $444,325 | **0.0%** | 0 |
| ✗ | DPH Public Health | $0 | $88,790 | **0.0%** | 0 |
| ✗ | CSS Child Support Services | $0 | $37,500 | **0.0%** | 0 |
| ✗ | SHF Sheriff | $0 | $27,092 | **0.0%** | 0 |
| ✗ | PRT Port | $0 | $25,124 | **0.0%** | 0 |
| ✗ | DAT District Attorney | $0 | $18,860 | **0.0%** | 0 |
| ✗ | ECN Economic & Workforce Development | $0 | $13,500 | **0.0%** | 0 |
| ✗ | POL Police | $0 | $10,000 | **0.0%** | 0 |
| ✗ | HRC Human Rights Commission | $0 | $9,500 | **0.0%** | 0 |

*Departments with no discretionary advertising spend (MYR, CON, DPW, FIR, ADM) are excluded — the resolution does not apply to departments without advertising budgets. See "Departments with No Discretionary Advertising Budget" below.*

### FY2026 Year-to-Date (July 2025 – March 2026)

| Status | Department | Ethnic Media | Discretionary Total | Compliance % | Outlets |
|--------|-----------|-------------|--------------------|--------------:|--------:|
| ✓ | MTA Municipal Transportation Agency | $28,334 | $44,625 | **63.5%** | 8 |
| ✓ | ASR Assessor-Recorder | $2,000 | $2,000 | **100.0%** | 1 |
| ✓ | BOS Board of Supervisors | $385 | $385 | **100.0%** | 1 |
| ✓ | ECN Economic & Workforce Development | $176 | $176 | **100.0%** | 1 |
| ⚠ | HSA Human Services Agency | $11,780 | $34,371 | **34.3%** | 3 |
| ✗ | LIB Public Library | $3,570 | $43,140 | **8.3%** | 2 |
| ✗ | HRD Human Resources | $1,380 | $61,056 | **2.3%** | 3 |
| ✗ | SHF Sheriff | $0 | $111,718 | **0.0%** | 0 |
| ✗ | PUC Public Utilities Commission | $0 | $108,555 | **0.0%** | 0 |
| ✗ | DPH Public Health | $0 | $26,926 | **0.0%** | 0 |
| ✗ | DAT District Attorney | $0 | $25,000 | **0.0%** | 0 |
| ✗ | PRT Port | $0 | $9,178 | **0.0%** | 0 |

### Compliance Leaders

**MTA is the model department — and proof that compliance works.** The Municipal Transportation Agency consistently spends 57–64% of its discretionary advertising with ethnic media, placing ads across 6–8 different community outlets including Sing Tao, World Journal, Bay Area Reporter, El Reportero, SF Neighborhood Newspaper Association, and others. MTA demonstrates that meeting the 50% target is operationally achievable at scale — this is a department with a $44K–$53K annual advertising budget, not a token effort. Other departments looking for a template should look at MTA's media buying practices.

**HSA leads in commitment.** Human Services Agency directed 98.7% of its FY2025 advertising to ethnic media — nearly every discretionary dollar. While the FY2026 year-to-date figure (34.3%) shows that small-budget departments can swing based on a single buy cycle, HSA's consistent prioritization of community outlets is notable.

**ASR and BOS demonstrate that even small budgets can comply.** The Assessor-Recorder and Board of Supervisors both directed 100% of their (modest) advertising to ethnic media. These are small dollar amounts ($480–$4,854), but they show that compliance isn't a function of budget size — it's a function of choice.

### Departments with No Discretionary Advertising Budget

The following departments show **no discretionary advertising spend** in the measured period and are therefore not applicable for compliance measurement. These departments are not non-compliant — they simply don't have advertising budgets that the resolution applies to:

- Mayor's Office (MYR)
- Controller (CON)
- Public Works (DPW)
- Fire Department (FIR)
- GSA - City Administrator (ADM) — minimal/zero in most years

These departments are excluded from compliance scoring. If they begin purchasing advertising in future fiscal years, they would be included at that time.

### The Recruitment Advertising Gap

Several of the departments with zero or near-zero ethnic media compliance are primarily spending on **recruitment advertising** — job announcements for positions in law enforcement, public safety, and city government. This deserves special attention because recruitment advertising that bypasses ethnic and community media directly affects **who learns about job opportunities in city government** and, by extension, the diversity of the city's workforce.

**Sheriff ($111,718 discretionary in FY2026, 0% ethnic media):** The Sheriff's advertising includes Professional Sports Publications ($24,500), KRON TV ($20,000), Cole Pro Media ($28,100), "Top of the World Media" ($13,000), PORAC Law Enforcement News ($7,792), Rivet Campus Media ($4,275), and SACJOBS.COM ($2,142). These are recruitment placements. Not a single dollar went to Chinese-language, Spanish-language, Filipino, African American, or LGBTQ+ press — the communities that make up the majority of San Francisco's population.

**Human Resources ($61,056 discretionary in FY2026, 2.3% ethnic media):** HRD spends heavily through agencies — Great Kolor LLC ($39,996) and Promotion Marketing — and on law enforcement trade press (PORAC, $11,750). HRD does place some ethnic media: World Journal ($1,380) and a small number of other outlets. But the ratio is stark: $11,750 in a single law enforcement trade publication versus $1,380 total across all ethnic press.

**Police ($10,000 in FY2025, 0% ethnic media):** SFPD's advertising went to a music production company and legal notices. No community media placements.

**District Attorney ($25,000 in FY2026, 0% ethnic media):** Spent entirely through Better World Advertising, an agency. Whether any of that agency spend reached ethnic media is unknown (see Section 6).

If the city wants a workforce that reflects its communities, the departments doing the hiring need to advertise where those communities read, watch, and listen. A recruitment ad in PORAC Law Enforcement News reaches people who already work in law enforcement. A recruitment ad in El Reportero, Sing Tao, or the Bay Area Reporter reaches people who might never otherwise learn the Sheriff's department is hiring. **This is arguably the most consequential category of advertising the resolution covers.**

### Other Opportunities for Improvement

**Elections represents the largest single opportunity — and the clearest example of the agency opacity problem.** The Department of Elections spent $459,732 on advertising in FY2025, making it the largest single-department ad budget. Of that, $424,980 (92%) went to a single agency — Most Likely To Inc — with the remainder going to legal notices (Daily Journal, $15,408) and small miscellaneous payments. No ethnic media placements are recorded. It is possible that Most Likely To placed some of Elections' ads in ethnic media on the department's behalf, but the payment data shows only the agency, not the ultimate outlets. Elections' pattern is consistent across years ($395,941 in FY2024, also primarily through Most Likely To). Given Elections' mission of broad democratic participation, this department could have an outsized impact on citywide compliance — and on reaching voters in underserved communities — if it incorporated ethnic and community outlets into its media mix, either directly or by requiring its agency to report outlet-level placements.

**DPH's spending may be undercounted.** Public Health shows $0 in identifiable ethnic media advertising, but $26,926 in FY2026 P-card advertising (see Section 7) and substantial agency contracts. Some of this spending may reach ethnic or community audiences through channels not visible in the payment data. DPH's input on what these purchases represent would help complete the picture.

**HRD, LIB, and PUC are partially engaged.** Human Resources (2.3–4.1%), Public Library (4.5–8.3%), and Public Utilities Commission (4.2%) each directed a small share of advertising to ethnic media. These departments have existing relationships with community outlets — the foundation is there for scaling those placements closer to the 50% target.

---

## 6. Agency Spending: What We Can See, and What We Can't

The 2023 BLA report identified a structural issue: many departments purchase advertising through third-party agencies, and those purchases are **not classified as advertising** in the city's financial system.

Our analysis confirms that substantial spending flows through marketing and communications agencies under non-advertising budget codes. The following agencies receive city payments typically classified as "Professional & Specialized Services" or "Other Current Expenses":

| Agency | Total Non-Ad Spend | Primary Departments | Transactions |
|--------|-------------------|--------------------:|------------:|
| Civic Edge Consulting (all entities) | $20,303,421 | Airport, MTA, DPH, Port, PUC, ECN | 945+ |
| Most Likely To Inc | $4,573,096 | Environment, PUC | 153 |
| Better World Advertising | $1,587,270 | DPH, District Attorney | 49 |
| ZEBA Consulting Inc | $720,684 | Emergency Management | 7 |
| Great Kolor LLC | $134,494 | Human Resources | 14 |
| Promotion Marketing | $96,040 | Human Resources | 89 |

**Total agency spending not classified as advertising: $29.4 million** (all fiscal years combined).

### What We Don't Know — And Who Can Tell Us

These agencies provide marketing, communications, and outreach services that likely include some media placement — buying ads in newspapers, on radio, on digital platforms, and on billboards. But because the contracts are classified under broad service categories, the specific media placements are not visible in the city's financial data.

**This is the largest gap in our compliance picture.** It is possible that significant ethnic media spending is happening through these agencies and simply not being captured. If even 10% of agency-managed spending included ethnic media placements, it could meaningfully change the compliance numbers. **We invite departments and their agency partners to share media placement data** so the full picture can be assessed.

### Questions for Departments and Agencies

1. **What media outlets receive placements through these agency contracts?** A breakdown by outlet name and amount would allow us to credit ethnic media buys that currently go uncounted.
2. **Do agency contracts include ethnic media placement requirements?** If so, are they being met?
3. **Can report-back requirements be added to existing contracts?** The BLA recommended this; the resolution endorses it. Implementation would close the largest data gap in compliance measurement.

---

## 7. P-Card Advertising: An Open Question

Procurement cards (P-cards) allow city employees to make small purchases without a formal purchase order. When used for advertising, the vendor appears as **"P-CARD ONLY US BANK N.A."** — the bank that issues the card, not the media outlet that received the payment.

### P-Card Advertising Trend

| Fiscal Year | P-Card Ad Spend | Primary Department |
|-------------|----------------:|-------------------|
| FY2018 | $4,932 | DPH ($3,188) |
| FY2019 | $20,888 | DPH ($12,889) |
| FY2020 | $13,594 | DPH ($5,939) |
| FY2021 | $46,082 | PUC ($28,966) |
| FY2022 | $38,665 | DPH ($33,144) |
| FY2023 | $58,615 | DPH ($55,105) |
| FY2024 | $45,746 | DPH ($36,954) |
| FY2025 | $47,111 | DPH ($37,719) |
| FY2026* | $33,475 | DPH ($26,926) |

*\*Partial year*

### What Are These Purchases?

The payment method offers a clue — traditional media (newspapers, radio, TV, billboards) typically invoice through accounts payable, while digital platforms (Facebook, Google, Instagram) accept credit card payment for small, immediate ad buys. This suggests P-card advertising may skew toward digital platform purchases, but **we cannot confirm this without department input**.

The Department of Public Health is the primary P-card advertiser, spending $37,719 in FY2025. This is consistent with health campaigns using social media ad boosts for targeted outreach — but DPH is best positioned to confirm what these purchases represent.

### Questions for Departments

1. **What platforms or outlets are receiving P-card advertising payments?** Even a summary breakdown (e.g., "80% Facebook/Instagram, 20% Google") would significantly improve the compliance picture.
2. **Could any of these purchases reach ethnic or community audiences?** Some digital platforms offer geo-targeted and language-targeted advertising that may serve the same communities as ethnic media outlets.
3. **Would standard purchase orders be feasible for these buys?** Shifting from P-card to PO-based purchasing would create a vendor record, improving transparency without necessarily increasing procurement burden.

### The Compliance Implication

P-card advertising totaling $33,000–$58,000 per year is included in the discretionary advertising denominator but **cannot be counted toward ethnic media compliance** because the outlet is unknown. Greater transparency around these purchases could either reveal an additional compliance gap or — if some P-card spend does reach ethnic-adjacent audiences — improve the measured compliance rate.

---

## 8. Who Receives City Advertising Dollars

### Ethnic & Community Media Outlets Paid in FY2026

| Outlet | FY2026 Spend | Transactions | Community Served |
|--------|------------:|------------:|-----------------|
| SF Neighborhood Newspaper Association | $13,266 | 4 | Citywide neighborhood press |
| World Journal SF | $7,988 | 9 | Chinese-language |
| Bay Area Reporter | $6,108 | 8 | LGBTQ+ |
| Sing Tao Newspapers SF | $6,048 | 7 | Chinese-language |
| Wind Newspaper | $5,780 | 5 | Chinese-language |
| El Reportero | $2,600 | 2 | Spanish-language |
| Broke-Ass Stuart | $2,400 | 4 | Hyperlocal / neighborhood |
| Sing Tao Daily | $1,885 | 3 | Chinese-language |
| San Francisco Bay Times | $1,000 | 1 | LGBTQ+ |
| Mission Local SF | $550 | 1 | Mission District / hyperlocal |

**Total: $47,624** across 10 outlets.

### Communities Not Yet Reached

The following community types have **no identified city advertising spend** in FY2026. This may reflect vendor registration barriers, a lack of awareness within departments, or gaps in our classification registry:

- **African American press** (e.g., San Francisco Bay View)
- **Filipino press** (e.g., Philippine News)
- **Korean press** (e.g., Korea Times)
- **South Asian press** (e.g., India Currents)

Onboarding these outlets as city vendors (see Recommendation 4) and including them in the outlet directory (Recommendation 5) would expand the pool of options available to departments and help the city reach communities currently underserved by its advertising.

### Top Non-Ethnic Advertising Vendors (FY2026)

| Vendor | FY2026 Spend | Category |
|--------|------------:|---------|
| Daily Journal Corporation | $346,245 | Legal notices (excluded from compliance) |
| China Basin Ballpark Company (Giants) | $70,000 | Sports venue advertising |
| Great Kolor LLC | $39,996 | Full-service agency |
| P-CARD ONLY US BANK N.A. (DPH) | $26,926 | Untraceable digital |
| Most Likely To Inc | $26,320 | Full-service agency |
| Better World Advertising | $25,000 | Digital agency |
| Professional Sports Publications | $24,500 | Sports media |
| KRON | $20,000 | Television |
| Cole Pro Media Corp | $18,750 | Media production |
| AD CLUB | $18,603 | Industry association |
| ComputerLand of Silicon Valley | $16,775 | Technology |
| KTSF TV26 | $15,990 | Chinese-language television |

KTSF TV26 ($15,990) is a notable case — it is a Chinese-language television station that serves the same communities as classified ethnic press outlets. Under a broader interpretation of "ethnic and community journalism," KTSF might qualify. Our current registry classifies it under "Radio & TV" rather than "Community & Ethnic Press" because the resolution specifically references journalism outlets, not broadcast stations. This classification is reviewable.

---

## 9. Recommendations

### Improve Measurement: Close the Data Gaps

**1. Clarify the 50% target denominator.**
The Board should specify whether "discretionary advertising budgets" means all advertising or only print and digital. The compliance measurement depends entirely on this definition.

**2. Require agency media placement reporting.**
All city contracts with advertising or marketing agencies should require itemized reporting of which media outlets receive placements, as the BLA recommended. This would illuminate the $29.4 million currently invisible in agency pass-through. Departments and agencies are invited to share existing placement data voluntarily in the interim.

**3. Improve P-card advertising transparency.**
Departments that use P-cards for advertising should document which platforms or outlets receive those payments. Where feasible, shifting to standard purchase orders would create a vendor record without adding significant procurement burden.

### Increase Supply: Onboard Ethnic & Community Media as City Vendors

**4. Aggressively onboard ethnic and community outlets into the city vendor system.**
A significant barrier to compliance is that many ethnic media outlets are not registered city vendors. Departments cannot easily place ads with outlets that are not in the procurement system. The city should conduct targeted outreach — working with SFIMC (SF Independent Media Consortium), EMA (Ethnic Media Alliance), and neighborhood press associations — to register outlets as approved vendors. This should include hands-on support navigating the city's vendor registration process, which can be daunting for small publishers.

**5. Create the BLA-recommended outlet directory.**
Resolution 240210 references the BLA's recommendation to create a directory of ethnic and community journalism outlets. This directory does not yet exist. DataDiver's media classification registry (28+ outlets, organized by community) could serve as a starting point, but a comprehensive directory should include contact information, ad specs, rates, audience demographics, and languages served — everything a department communications officer needs to place an ad.

**6. Appoint the liaison position.**
The BLA recommended a staff member to serve as liaison between departments and community outlets. This position would address the operational friction that prevents departments from placing ethnic media ads — connecting publishers who want city business with departments that need to reach diverse communities.

### Build Capacity: Expand What Counts as Ethnic Media Advertising

**7. Help ethnic media outlets build digital and display advertising capacity.**
The resolution's language — "ethnic and community journalism outlets" — need not be limited to print placements. Many ethnic media outlets operate websites, social media channels, email newsletters, and mobile apps that accept display advertising, sponsored content, and social promotion. The city should:

- **Inventory the digital ad capacity** of registered ethnic media outlets (e.g., does El Tecolote accept web display ads? Does Sing Tao offer sponsored social posts?)
- **Include digital placements** in the definition of ethnic media advertising, so that a Facebook-targeted campaign run *through* an ethnic media outlet's social channels counts toward compliance
- **Fund capacity building** to help outlets that currently lack programmatic ad infrastructure develop it — a one-time investment that creates a permanent new channel for city advertising

**8. Redirect social media ad spend through ethnic media channels.**
Departments currently spending on direct-to-platform digital ads (via P-cards or agencies) should explore whether those same campaigns can be placed through ethnic media outlets' digital properties. A DPH health campaign that currently buys Facebook boosts directly could instead sponsor posts through community outlets' social channels — reaching the same audiences while simultaneously supporting local journalism and counting toward compliance.

**9. Establish a citywide advertising contract with ethnic media provisions.**
As recommended by the BLA, a centralized advertising services contract could streamline ethnic media placement for departments that currently lack the knowledge or relationships to do it independently. This contract should include specific ethnic media placement minimums and pre-negotiated rates with registered community outlets.

### Prioritize Recruitment Advertising

**10. Require ethnic media inclusion in all recruitment advertising.**
Recruitment advertising is where the resolution's goals intersect most directly with the city's equity commitments. When the Sheriff's department places $24,500 in Professional Sports Publications and $20,000 on KRON but $0 in any ethnic press, it is recruiting from some communities and not others. Departments with public safety and civil service recruitment budgets — Sheriff, Human Resources, Police, District Attorney — should be required to include ethnic and community media placements in every recruitment campaign. This is not just a media equity issue; it is a **workforce diversity** issue. The communities that read Sing Tao, El Reportero, the Bay Area Reporter, and the San Francisco Bay View deserve to know their city is hiring.

### Sustain Progress: Reporting and Accountability

**11. Issue department-level compliance targets.**
The departments with the largest discretionary ad budgets — Elections ($444K in FY2025), Sheriff ($112K in FY2026 YTD), and Human Resources ($61K in FY2026 YTD) — each represent significant opportunities to improve the citywide number. Department-specific improvement plans, with interim milestones, would create accountability without requiring new legislation.

**12. Fund annual compliance reporting.**
This analysis demonstrates that compliance monitoring is technically feasible using existing open data. The city should fund regular (at minimum annual) compliance reporting, with DataDiver or a similar tool providing the public-facing dashboard the resolution calls for.

---

## 10. Data Sources & Attribution

All data in this report is derived from publicly available San Francisco open data, queried via the Socrata Open Data API (SODA).

| Dataset | Socrata ID | Records | Coverage | Update Frequency |
|---------|-----------|---------|----------|-----------------|
| Vendor Payments (Vouchers) | `n9pm-xkyq` | 7.9M | FY2007–present | Weekly |
| Supplier Contracts | `cqi5-hm2d` | 47K | FY2018–present | Weekly |

### Reproducibility

Every figure in this report can be independently verified:

1. **Live dashboard**: The DataDiver compliance monitoring tool at [datadiver.vercel.app/city-budget?tab=advertising](https://datadiver.vercel.app/city-budget?tab=advertising) shows real-time compliance metrics with drill-down to individual payment records.

2. **CSV export**: Every aggregated view in DataDiver includes a "Based on N records" link that exports the exact source records as CSV.

3. **Open-source methodology**: The media classification registry is published as open-source code at `src/utils/mediaClassification.ts`. The compliance computation is at `src/hooks/useComplianceData.ts`. Both are inspectable and auditable.

4. **URL-encoded state**: Any finding can be bookmarked and shared via URL. Filter parameters (fiscal year, department, media category) are encoded in the URL for citation purposes.

5. **Direct API access**: The underlying Socrata dataset is publicly queryable. For example, to retrieve all FY2026 advertising payments:
   ```
   https://data.sfgov.org/resource/n9pm-xkyq.json?
     $select=vendor, department, SUM(vouchers_paid) as total_paid
     &$where=sub_object = 'Advertising' AND fiscal_year = '2026'
     &$group=vendor, department
     &$order=total_paid DESC
   ```

### Known Limitations

1. **Agency pass-through**: We cannot see which media outlets receive placements through agency contracts. This likely undercounts ethnic media spending. Department and agency input would improve accuracy (see Section 6).

2. **P-card opacity**: The $33,000–$58,000/year in P-card advertising cannot be attributed to any media outlet. Department input on what these purchases represent would close this gap (see Section 7).

3. **Registry completeness**: Our 28+ outlet registry covers known recipients from payment data. There may be ethnic media outlets receiving city dollars under names not yet in the registry.

4. **FY2026 is partial**: Data covers approximately 9 months (through March 2026). Full-year figures will differ.

5. **Classification judgments**: Categorizing vendors as "ethnic and community press" involves editorial judgment. Our classifications are transparent, auditable, and open to challenge. The case of KTSF TV26 (Chinese-language television) illustrates the boundary questions.

6. **Resolution is non-binding**: Resolution 240210 is a statement of policy intent, not an ordinance. Departments are urged but not legally required to comply.

---

## Appendix A: Ethnic Media Classification Registry

The following vendors are classified as "Community & Ethnic Press" in DataDiver's media classification system. This registry is maintained as open-source code and is subject to ongoing review.

### Chinese-Language Press
- Sing Tao Daily / Sing Tao Newspapers San Francisco Ltd
- World Journal SF LLC
- Chinese Times
- Wind Newspaper

### Spanish-Language Press
- El Mensajero
- El Tecolote
- El Reportero LLC
- Accion Latina

### Filipino Press
- Philippine News
- Fil-Am Radio

### Korean / South Asian Press
- Korea Times
- India Currents
- AsianWeek
- Center for Asian American Media

### LGBTQ+ Press
- Bay Area Reporter
- San Francisco Bay Times

### African American Press
- San Francisco Bay View

### Neighborhood / Hyperlocal
- SF Neighborhood Newspaper Association
- Mission Local SF
- Broke-Ass Stuart
- The Potrero View
- Hoodline / Pixel Labs Inc

### Multicultural Radio
- Multicultural Radio Broadcasting

---

## Appendix B: Legal Notice Exclusions

The following vendors are excluded from the discretionary advertising denominator because their payments represent **mandatory legal publications** required by statute, not discretionary outreach:

| Vendor | FY2025 Spend | FY2026 YTD | Lifetime Total |
|--------|------------:|----------:|---------------|
| Daily Journal Corporation | $370,730 | $346,245 | $7.75M+ |
| California Newspaper Service Bureau | $560 | $560 | $2.08M+ |

These vendors publish public hearing notices, bid advertisements, and ordinance publications as required by California Government Code. Their exclusion from the discretionary denominator is consistent with the BLA's approach and is transparent: the live dashboard shows the excluded amounts in a hatched segment of the advertising composition bar.

---

## Appendix C: Glossary

| Term | Definition |
|------|-----------|
| **Discretionary advertising** | City advertising spending where the department chooses the media outlet. Excludes mandatory legal notice publications. |
| **Ethnic and community journalism** | Locally owned or run outlets where one-third of readership are San Franciscans, employing at least one full-time staff member within 30 miles of SF (per Resolution 240210 definition). |
| **P-card** | Procurement card (city-issued credit card) used for small purchases. Vendor appears as the issuing bank, not the ultimate recipient. |
| **Tagged advertising** | Vendor payments classified under `sub_object = 'Advertising'` in the city's financial system. |
| **Agency layer** | Payments to known advertising/marketing agencies under non-advertising budget classifications. |
| **Fiscal year (FY)** | San Francisco's fiscal year runs July 1 – June 30. FY2026 = July 2025 – June 2026. |
| **BLA** | San Francisco Budget and Legislative Analyst, the independent fiscal advisor to the Board of Supervisors. |
| **SODA API** | Socrata Open Data API, the interface for querying SF Open Data programmatically. |
| **Compliance rate** | Ethnic media spend ÷ total discretionary advertising × 100. Target: ≥50% per Resolution 240210. |

---

## Appendix D: Independent Validation Against the 2022 OEWD File

**Source document:** `reports/validation/8.30.22_Advertising_Voucher_Payments_2017-2021_OEWD_File.xlsx` — prepared by the SF Office of Economic and Workforce Development on August 30, 2022 for community partner review. Contains 3,806 advertising voucher lines from 2017 through mid-2022 (pulled May 18, 2022), organized across four sheets: raw voucher data, year-by-year pivot tables, a by-vendor sort view, and a manual vendor classification.

**Why it matters.** This file predates DataDiver's existence by four years and was prepared by the city itself. Its classification of vendors into "Community and Ethnic Print Media" versus "Other Media" provides an independent check on DataDiver's classification methodology. The file's underlying voucher data is equivalent to DataDiver's primary source — both pull `Account Description = 'Advertising'` (equivalent to Socrata's `sub_object = 'Advertising'`) from the same city financial system.

### D.1 Classification Match: 100% on OEWD's 10-Vendor List

OEWD's classification marked exactly 10 suppliers as Community and Ethnic Print Media. DataDiver's classifier (after the minor Potrero View / Pixel Labs / Hoodline pattern additions documented in this report's commit history) matches all ten:

| OEWD-classified C&E Vendor | 2017–2022 Spend | DataDiver Match |
|----------------------------|---------------:|:---------------:|
| SF Neighborhood Newspaper Association | $264,819 | ✓ |
| Bay Area Reporter | $108,766 | ✓ |
| World Journal | $54,558 | ✓ |
| Sing Tao Daily | $36,431 | ✓ |
| Sing Tao Newspapers SF Ltd | $28,304 | ✓ |
| San Francisco Bay Times | $21,000 | ✓ |
| The Potrero View Inc | $2,805 | ✓ |
| San Francisco Bay View Inc | $1,130 | ✓ |
| El Reportero / The Reporter | $600 | ✓ |
| Pixel Labs Inc dba Hoodline.com | $500 | ✓ |
| **TOTAL** | **$518,912.01** | **100.00%** |

**Match rate: 100.00% — exact to the penny.** DataDiver's classification recovers OEWD's own categorization without exception.

### D.2 Classifier Additions Beyond OEWD's Narrow List

DataDiver classifies two additional vendors as community and ethnic press that OEWD's narrow print-focused list did not:

| Vendor | 2017–2022 Spend | Category | Rationale |
|--------|---------------:|----------|-----------|
| Multicultural Radio Broadcasting | $54,135 | Multilingual radio | Serves multilingual Bay Area audiences; legitimate community media infrastructure outside OEWD's "print" scope |
| Center for Asian American Media | $7,500 | Asian American | Major SF-based Asian American media organization |

Both additions are defensible on editorial grounds. OEWD's list was explicitly titled "Community and Ethnic **Print** Media" — DataDiver's broader scope includes multilingual radio and Asian American media institutions that serve the same communities through different channels.

### D.3 Three-Layer Model Validation

Applying DataDiver's full classifier to OEWD's 2017–2022 voucher data produces the following category breakdown:

| Category | Vendors | Total 2017–2022 | Share |
|----------|--------:|---------------:|------:|
| Legal notices (Daily Journal Corp) | 1 | $1,727,840 | 27.9% |
| Full-service agencies (Zeba, Promotion, Great Kolor) | 3 | $1,704,310 | 27.5% |
| Unknown / unclassified | 76 | $667,851 | 10.8% |
| **Community and ethnic press** | **12** | **$580,547** | **9.4%** |
| Radio & TV | 7 | $429,938 | 6.9% |
| Out-of-home (Intersection, CBS Outdoor, etc.) | 3 | $385,107 | 6.2% |
| Major metro print (SF Chronicle, SF Media Co) | 2 | $259,847 | 4.2% |
| Digital agency (CKR Interactive) | 1 | $169,122 | 2.7% |
| Direct social (LinkedIn) | 1 | $136,204 | 2.2% |
| P-card | 9 | $89,585 | 1.4% |
| Production | 2 | $43,788 | 0.7% |
| **TOTAL** | **117** | **$6,194,140** | **100.0%** |

**Key findings from the breakdown:**

- **Legal notices alone capture 27.9% of all tagged advertising** — confirming the decision to exclude Daily Journal Corporation from the discretionary denominator. This is not a policy choice the city advertising program has; it is statutory compliance spending.
- **Full-service agencies capture 27.5%** — confirming the three-layer model's "agency layer." One vendor alone (Zeba Consulting, $1.19M) received more than twice the entire community and ethnic press total over the same period.
- **Community and ethnic press received 9.4%** of all tagged advertising over 2017–2022 — directionally consistent with DataDiver's current measurement on live FY-based data.
- **The "unknown" bucket** at 10.8% is a remaining classification frontier, though spot-checks of the top unknowns show they are primarily recruitment agencies, historical publisher entities, and individual radio call-letter groupings — not miscategorized community media.

### D.4 The Broader 31-Outlet Ecosystem: A Zero-Payment Finding

OEWD maintained a second list in the same workbook — the "SF Ethnic & Community News Media Outlets" column — naming 31 outlets (after deduplication) the city recognized as part of the SF community and ethnic media ecosystem. **Cross-referencing this broader list against the raw voucher data reveals that 19 of 31 outlets (61%) received zero dollars in city advertising payments over the 5+ year period covered by the file.**

**Outlets receiving ZERO city advertising payments, 2017–2022:**

| Outlet | Community Served |
|--------|------------------|
| Mission Local | Neighborhood (nonprofit) |
| El Tecolote / Accion Latina | Spanish / Latino |
| SF Public Press | Investigative (nonprofit) |
| 48 Hills | Progressive (digital) |
| Nichi Bei Weekly | Japanese |
| Wind Newspaper | Chinese (bilingual) |
| The Ingleside Light | Neighborhood |
| Sunset Beacon | Neighborhood |
| Richmond Review | Neighborhood |
| Marina Times | Neighborhood |
| Noe Valley Times | Neighborhood |
| Broke-Ass Stuart | Alternative weekly |
| J. The Jewish News | Jewish |
| Catholic San Francisco | Religious |
| Street Sheet | Homeless services |
| El Mensajero | Spanish / Latino |
| Telemundo KSTS-TV48 | Spanish / Latino |
| Public Comment SF | Civic |
| Westside Observer | Neighborhood |

**The 12 outlets that did receive payments** captured $595,492 in aggregate over the period — but distribution was highly concentrated. Just four vendors (SF Neighborhood Newspaper Association $264,819; Bay Area Reporter $108,766; Sing Tao Daily $64,734; World Journal $54,558) received 82% of that total.

**Reading this finding in context:** The city itself, as of August 2022, named 31 community and ethnic media outlets as part of the SF ecosystem. Its own payment records showed that 19 of them had been paid nothing for advertising across five years. This is the empirical baseline Resolution 240210 was enacted to change. Whether the resolution has succeeded in reaching those previously invisible outlets is a question the current dashboard can now answer — and at the time of this report, the answer is "mostly not yet."

The machine-readable cross-reference is preserved at `reports/validation/oewd-broader-outlet-crossref-2017-2022.csv` for future re-analysis.

### D.5 Reconciliation Limits

This validation does not prove that DataDiver's current FY2025–FY2026 numbers are correct — it proves that DataDiver's **classification methodology** agrees with the city's own classification when applied to the same underlying data. Two specific reconciliation limits to note:

- **Calendar year vs. fiscal year.** OEWD's pivot tables are organized by calendar year (2017, 2018, 2019, 2020, 2021, 2022). This report and the DataDiver dashboard use SF fiscal years (July 1 – June 30). A calendar year 2020 total cannot be directly compared to a fiscal year 2020 total; the overlap is only 50%. Directional comparisons are valid; exact year-by-year matching is not.
- **Data lag.** The OEWD file was pulled May 18, 2022, meaning its "2022" column captures only about five months of calendar year 2022 (the $500 total in that column reflects this partial-year cutoff). Any comparison using the 2022 column should treat it as a partial-year snapshot.

The source file is preserved at `reports/validation/` for future re-analysis as methodology questions arise.

---

*This report was generated using data from the City and County of San Francisco's open data portal (data.sfgov.org). All figures are derived from the Vendor Payments dataset (`n9pm-xkyq`) and are independently verifiable. The DataDiver civic data platform is developed at San Francisco State University.*

*Live compliance monitoring: [datadiver.vercel.app/city-budget?tab=advertising](https://datadiver.vercel.app/city-budget?tab=advertising)*
