// AUTHORED DATA — SF campaign-consultant identity crosswalk.
//
// The SFEC campaign-consultant e-filing family (`iv34-5p9x` and children) carries NO
// structured filer/committee id: `campaignconsultantname` is free text a filer retypes
// every quarter. `normalizeName()` (src/lib/consultants/normalize.ts) collapses the
// mechanical drift — case, punctuation, and leading/trailing LLC/INC/CORP/CO/THE/&/AND/
// LTD/LP — which takes 90 raw spellings to 80 normalized keys (measured 2026-08-18).
// This table carries ONLY what mechanical normalization cannot do:
//
//   * `kind: 'hand'`  — two normalized keys that are one consultant (typos such as
//     'CS Communiations', an internal '&' vs 'and', a person name and their firm), plus
//     a payee pattern for the biggest consultants so the generator rarely falls back.
//   * `kind: 'inferred-dba'` — the consultant is INVISIBLE in `pitq-e56w` under its
//     registered name because committees paid a DBA / affiliate. Inferred from exact
//     dollar equality, never from ownership records; each note says so.
//
// `payeePatterns` are SoQL LIKE fragments applied to `upper(transaction_last_name)` in
// `pitq-e56w`. They are matched verbatim, so a pattern with no `%` is an EXACT match
// (used where a broad pattern would drag in unrelated payees — 'AGENCY' vs 'Wang
// Insurance Agency'). Every pattern here was probed live on 2026-08-18 against
// `record_type in ('EXPN','DEBT') AND filing_date >= '2024-09-01'`.
//
// GENERATOR FALLBACK: a consultant with no row here is queried as
// `'%' + normalizeName(raw) + '%'`. That is correct for most registrants — the rows
// below exist because the fallback would find nothing (the DBA bridges) or would find
// too much (a common surname, or 'AL MEDIA' matching 'Storefront Political Media').
//
// SCOPE WARNING: `payeeScope: 'own-clients'` marks a bridge that is a reporting-basis
// reading, NOT an identity. Applied globally it would misattribute another committee's
// money. Only Stearns↔Rough House carries it.

export interface ConsultantAlias {
  /** Stable slug used as the consultant's identity in the generated artifact. */
  id: string;
  /** Human-readable label; the spelling a reader should see. */
  displayName: string;
  /** Every raw `campaignconsultantname` spelling that belongs to this consultant. */
  rawNames: string[];
  /** 'hand' = a name cluster / payee hint; 'inferred-dba' = a DBA or affiliate bridge. */
  kind: 'hand' | 'inferred-dba';
  /** Upper-case SoQL LIKE fragments over `upper(transaction_last_name)` in pitq-e56w. */
  payeePatterns: string[];
  /** Present only where the bridge must NOT be applied outside this consultant's own clients. */
  payeeScope?: 'own-clients';
  /** Why this row exists, and what the inference rests on. */
  note: string;
}

export const CONSULTANT_ALIASES: ConsultantAlias[] = [
  // ── Hand clusters: one consultant, two or more normalized keys ────────────────

  {
    id: 'cs-communications',
    displayName: 'CS Communications',
    rawNames: ['CS Communications', 'CS Communiations'],
    kind: 'hand',
    payeePatterns: ['%CS COMMUNICATIONS%'],
    note: "Typo cluster: 'CS Communiations' (missing the second C) normalizes to its own key. Both filings report $0 in clients and the firm has no payee rows in pitq-e56w as of 2026-08-18, so the pattern is provisional.",
  },
  {
    id: 'amplify-campaigns',
    displayName: 'Amplify Campaigns LLC',
    rawNames: ['Amplify Campaigns LLC', 'Ammplify Campaigns LLC'],
    kind: 'hand',
    payeePatterns: ['%AMPLIFY CAMPAIGNS%', '%AMMPLIFY CAMPAIGNS%'],
    note: "Typo cluster: 'Ammplify' does not contain the substring 'AMPLIFY', so one pattern cannot cover both. Committees spell the payee 'AMPLIFY CAMPAIGNS' / 'Amplify Campaigns' (101 rows, $292,816 since 2024-09-01).",
  },
  {
    id: 'bmwl',
    displayName: 'BMWL Campaigns',
    rawNames: ['BMWL Campaigns', 'BMWL, Inc'],
    kind: 'hand',
    payeePatterns: ['%BMWL%'],
    note: "Barnes Mosher Whitehurst Lauter. 'BMWL, Inc' normalizes to bare 'BMWL' (INC stripped) and splits from 'BMWL CAMPAIGNS'. Payee spellings in pitq: 'BMWL Campaigns', 'BMWL, INC.', 'BMWL Public Affairs'.",
  },
  {
    id: 'outset-strategies',
    displayName: 'Outset Strategies (Joseph Sweiss)',
    rawNames: ['Outset Strategies', 'Joseph Sweiss'],
    kind: 'hand',
    payeePatterns: ['%OUTSET STRATEGIES%', '%SWEISS%'],
    note: "Person-and-firm cluster: the registrant filed as 'Joseph Sweiss' and later as 'Outset Strategies'. Committees pay both spellings ('OUTSET STRATEGIES' $51,553; 'SWEISS' $57,633).",
  },
  {
    id: 'paul-kumar',
    displayName: 'Paul Kumar',
    rawNames: ['Paul Kumar', 'Paul R Kumar', 'Paul R. Kumar'],
    kind: 'hand',
    payeePatterns: ['KUMAR'],
    note: "Three spellings; the middle initial splits 'PAUL R KUMAR' from 'PAUL KUMAR'. Pattern is an EXACT last-name match — '%KUMAR%' also catches 'VIJAYAKUMAR'. Zero payee rows in pitq as of 2026-08-18 (all three filings report $0 clients).",
  },
  {
    id: 'thematic-strategies',
    displayName: 'Thematic Campaigns (Tyler Law)',
    rawNames: ['Tyler Law', 'Tyler Law/Thematic Campaigns', 'Tyler Law, Thematic Campaigns'],
    kind: 'hand',
    payeePatterns: ['%THEMATIC CAMPAIGNS%'],
    note: "Three spellings of one registrant; the slash and the comma forms normalize apart. Committees pay 'THEMATIC CAMPAIGNS' / 'Thematic Campaigns' / 'THEMATIC CAMPAIGNS LLC'. Never pattern on 'LAW' — it matches every law firm in the payee column.",
  },
  {
    id: 'gallagher',
    displayName: 'John Gallagher',
    rawNames: ['John J Gallagher', 'John Gallagher'],
    kind: 'hand',
    payeePatterns: ['GALLAGHER'],
    note: "Middle-initial cluster. Pattern is an EXACT last-name match; pitq carries 29 'GALLAGHER' rows, all from the two firefighter committees this registrant reports (215726436 and 211998686).",
  },
  {
    id: 'szabo-associates',
    displayName: 'Szabo & Associates LLC',
    rawNames: ['Szabo & Associates LLC', 'Szabo and Associates'],
    kind: 'hand',
    payeePatterns: ['%SZABO%'],
    note: "Observed cluster not named in the recon: normalizeName only strips '&'/'AND' at the ENDS of a name, so the internal joiner leaves 'SZABO & ASSOCIATES' and 'SZABO AND ASSOCIATES' as two keys for one firm ($222,111.67 combined).",
  },

  // ── DBA / affiliate bridges: the registered name is invisible in pitq-e56w ────

  {
    id: 'kazin',
    displayName: 'Daniel Kazin',
    rawNames: ['Daniel Kazin'],
    kind: 'inferred-dba',
    payeePatterns: ['%KAZIN%', '%CANAL PARTNERS%'],
    note: "INFERRED from dollar equality, not ownership records: pitq has ZERO payee rows containing 'KAZIN'. Mark Farrell for Mayor 2024 paid 'Canal Partners Media' $681,410 and Mayor Mark Farrell for Yes on Prop D paid it $330,174 — $1,011,584, exactly Kazin's reported client total. Over-match to check by eye: '%KAZIN%' also returns one unrelated 'Kazinski' EXPN row ($140, outside the 2024-09-01 window) and one 'Kazin' RCPT row ($100), neither of which the EXPN/DEBT + in-window filter admits.",
  },
  {
    id: 'kmm-strategies',
    displayName: 'KMM Strategies',
    rawNames: ['KMM Strategies'],
    kind: 'inferred-dba',
    payeePatterns: ['%KMM%', '%KULLY HALL%'],
    note: "Committees write the payee as 'KULLY HALL LLC DBA KMM STRATEGIES' on 311 of 359 rows (and 'KULLY HALL LLC' alone once), so a '%KMM%'-only query drops ~$2.48M of the relationship. The DBA is stated in the payee string itself. Over-match to check by eye: '%KULLY HALL%' also returns 16 'Kully Hall Struble' rows — a successor/variant firm name, not necessarily the same engagement.",
  },
  {
    id: 'bedford-grove',
    displayName: 'Bedford Grove',
    rawNames: ['Bedford Grove', 'Celeste Wolter Sempere'],
    kind: 'inferred-dba',
    payeePatterns: ['%BEDFORD GROVE%', '%WOLTER SEMPERE%'],
    note: "Both a name cluster and a DBA bridge: the registrant files under her own name and under the firm, and committees write 'CELESTE WOLTER SEMPERE dba BEDFORD GROVE' on 15 rows ($132,500). The DBA is stated in the payee string.",
  },
  {
    id: 'agency',
    displayName: 'AGENCY',
    rawNames: ['AGENCY'],
    kind: 'inferred-dba',
    payeePatterns: ['AGENCY'],
    note: "NOT junk — a real Des Moines firm. Pattern is an EXACT match because '%AGENCY%' drags in insurance agencies and the SFMTA. Safer San Francisco reports 9 payments to payee 'Agency' totalling $453,053.54 against $449,484.50 reported (ratio 1.008); the flaw in this filer is the double filing across report types, not the identity.",
  },
  {
    id: 'stearns-consulting',
    displayName: 'Stearns Consulting',
    rawNames: ['Stearns Consulting'],
    kind: 'inferred-dba',
    payeePatterns: ['%STEARNS%', '%ROUGH HOUSE%'],
    payeeScope: 'own-clients',
    note: "SCOPED, NEVER GLOBAL. Stearns receives only ~$60,000 in-window under its own name; the reported figures equal Stearns plus 'Rough House Productions' rows FROM STEARNS'S OWN CLIENTS. Rough House is a shared media-production vendor paid by 10+ committees (~$727K from committees Stearns never reported — Preston, Fielder, Yes on A 2024, Build Affordable Faster, Lori Brooke) and is also listed in cfaj-f7ry as Avery Yu's sub-vendor. Applied as an identity it would falsely flag Stearns as under-reporting those committees.",
  },

  // ── Payee patterns for the largest consultants (mechanically resolvable names) ─

  {
    id: 'media-company',
    displayName: 'The Media Company LLC',
    rawNames: ['The Media Company LLC'],
    kind: 'hand',
    payeePatterns: ['%MEDIA COMPANY%'],
    note: "Largest registrant by reported receipts ($3.56M). The recon notes an amendment 'amending consultant name to firm' whose person-named predecessor never appears in iv34-5p9x, so there is no earlier spelling to cluster.",
  },
  {
    id: 'al-media',
    displayName: 'AL Media, LLC',
    rawNames: ['AL Media, LLC'],
    kind: 'hand',
    payeePatterns: ['AL MEDIA%'],
    note: "Pattern is PREFIX-anchored: '%AL MEDIA%' also matches 'Storefront Political Media' and 'Axial Media & Communications' (the substring sits inside 'POLITICAL MEDIA'). Anchored, it returns exactly the 17 Safer San Francisco rows summing $2,553,984 — the reported figure to the dollar.",
  },
  {
    id: 'strother-nuckels',
    displayName: 'Strother Nuckels Strategy, LLC',
    rawNames: ['Strother Nuckels Strategy, LLC'],
    kind: 'hand',
    payeePatterns: ['%STROTHER%'],
    note: "Committees write 'STROTHER NUCKELS STRATEGIES' (plural) where the registration says 'Strategy'; the surname token is the stable part.",
  },
  {
    id: 'sgr-consulting',
    displayName: 'SGR Consulting, LLC',
    rawNames: ['SGR Consulting, LLC'],
    kind: 'hand',
    payeePatterns: ['%SGR CONSULTING%'],
    note: "Two payee spellings differ only by the comma. Carries the recon's parent-only envelope ($403,889.62 declared on the parent with no client rows).",
  },
  {
    id: 'merrill-strategy-group',
    displayName: 'The Merrill Strategy Group',
    rawNames: ['The Merrill Strategy Group'],
    kind: 'hand',
    payeePatterns: ['%MERRILL STRATEGY%'],
    note: "DELIBERATELY NOT aliased to 'The Baughman Company Inc DBA BaughmanMerrill'. The recon could not establish that the Berkeley payee and the SF registrant are one business; merging them would convert an open question into a claim.",
  },
  {
    id: 'baughman-merrill',
    displayName: 'The Baughman Company Inc DBA BaughmanMerrill',
    rawNames: ['The Baughman Company Inc DBA BaughmanMerrill'],
    kind: 'hand',
    payeePatterns: ['%BAUGHMAN%'],
    note: "Kept SEPARATE from The Merrill Strategy Group on purpose (see that row). This registrant filed a $0 Sep–Nov 2024 quarterly and lists 'Katie Merrill' as an employee; the Berkeley payee lists 'Katherine Merrill'. Whether they are one business is unknown, and the crosswalk must not decide it.",
  },
  {
    id: 'outreach-team',
    displayName: 'The Outreach Team, Inc',
    rawNames: ['The Outreach Team, Inc', 'The Outreach Team Inc'],
    kind: 'hand',
    payeePatterns: ['%OUTREACH TEAM%'],
    note: 'Two raw spellings that already share a normalized key; the row exists for the payee pattern.',
  },
  {
    id: 'bearstar-strategies',
    displayName: 'Bearstar Strategies',
    rawNames: ['Bearstar Strategies'],
    kind: 'hand',
    payeePatterns: ['%BEARSTAR%'],
    note: "Gross-vs-fee case: Schedule E alone is far under the reported figure and only closes when this firm's Schedule G 'COMMISSION' rows are added — which the reconciler keeps SEPARATE by contract.",
  },
  {
    id: 'anderson-political',
    displayName: 'Anderson Political',
    rawNames: ['Anderson Political', 'Anderson Political LLC'],
    kind: 'hand',
    payeePatterns: ['%ANDERSON POLITICAL%'],
    note: "Pattern must keep the second token — a bare '%ANDERSON%' would match unrelated payees.",
  },
  {
    id: 'mje-strategies',
    displayName: 'MJE Strategies LLC',
    rawNames: ['MJE Strategies LLC'],
    kind: 'hand',
    payeePatterns: ['%MJE STRATEGIES%'],
    note: 'Three payee spellings differ only by comma and LLC.',
  },
  {
    id: 'cliffordmoss',
    displayName: 'CliffordMoss LLC',
    rawNames: ['CliffordMoss LLC', 'CliffordMoss'],
    kind: 'hand',
    payeePatterns: ['%CLIFFORD MOSS%', '%CLIFFORDMOSS%'],
    note: "The registration closes the name up ('CliffordMoss'); every committee writes it open ('Clifford Moss'). Both spellings are patterned so neither side is missed.",
  },
  {
    id: 'democratic-direct',
    displayName: 'Democratic Direct LLC',
    rawNames: ['Democratic Direct LLC', 'Democratic Direct, LLC', 'Democratic Direct'],
    kind: 'hand',
    payeePatterns: ['%DEMOCRATIC DIRECT%'],
    note: 'Three raw spellings sharing one normalized key; the row exists for the payee pattern.',
  },
  {
    id: 'swing-strategies',
    displayName: 'Swing Strategies',
    rawNames: ['Swing Strategies'],
    kind: 'hand',
    payeePatterns: ['%SWING STRATEGIES%'],
    note: "Reports $144,678.07 from a single client but has ZERO payee rows in pitq-e56w as of 2026-08-18 — its client is a General Purpose PAC whose Schedule E may not yet be filed. A real one-sided gap, not a pattern failure.",
  },
  {
    id: 'telegraph',
    displayName: 'Telegraph',
    rawNames: ['Telegraph', 'Telegraph LLC'],
    kind: 'hand',
    payeePatterns: ['%TELEGRAPH%'],
    note: "Two raw spellings sharing one normalized key. Its reported client (California Alliance of Family Owned Businesses) is NOT among the committees that pay 'Telegraph' in pitq — another one-sided gap to surface, not to paper over.",
  },
  {
    id: 'margaux-kelly',
    displayName: 'Margaux Kelly',
    rawNames: ['Margaux Kelly'],
    kind: 'hand',
    payeePatterns: ['%MARGAUX KELLY%', '%KELLY, MARGAUX%'],
    note: "NO PATTERN CAN FIND HER — disclosed rather than papered over. Her real rows carry transaction_last_name 'Kelly' with the first name in transaction_first_name ('Margaux'), a column payeePatterns never sees: 80 in-window rows, $167,982.45, from Mark Farrell for Mayor 2024 ($154,538.58) and Mayor Mark Farrell for Yes on Prop D ($13,443.87). A bare 'KELLY' pattern returns 86 rows / $172,176.07 because it also drags in JOSH KELLY's six Yes-on-K rows, so it is deliberately NOT used. The two patterns here match the combined spellings if a committee ever writes one (neither matches anything today); until then this consultant needs a first-name-aware read the pattern contract does not provide.",
  },
  {
    id: 'proverb-strategy',
    displayName: 'Proverb Strategy Advisors',
    rawNames: ['Proverb Strategy Advisors'],
    kind: 'hand',
    payeePatterns: ['%PROVERB%'],
    note: "Committees also write the shorter 'Proverb Strategy'; the one-token pattern covers both.",
  },
  {
    id: 'jamie-hughes',
    displayName: 'Jamie Hughes',
    rawNames: ['Jamie Hughes'],
    kind: 'hand',
    payeePatterns: ['%JAMIE HUGHES%'],
    note: "Full first name is required: a bare '%HUGHES%' returns 390 unrelated rows. Committees write 'Jamie Hughes Consulting, LLC'.",
  },
  {
    id: 'lisa-presta',
    displayName: 'Lisa Presta',
    rawNames: ['Lisa Presta'],
    kind: 'hand',
    payeePatterns: ['%PRESTA%'],
    note: "Committees carry the surname alone ('Presta', 33 rows) with the first name in transaction_first_name, which patterns never see.",
  },
  {
    id: 'nathan-allbee',
    displayName: 'Nathan Allbee',
    rawNames: ['Nathan Allbee'],
    kind: 'hand',
    payeePatterns: ['%ALLBEE%'],
    note: 'Surname-only payee rows; the surname is distinctive enough to stand alone.',
  },
  {
    id: 'heidi-sieck',
    displayName: 'Heidi L Sieck',
    rawNames: ['Heidi L Sieck'],
    kind: 'hand',
    payeePatterns: ['%SIECK%'],
    note: "Committees write 'HEIDI L SIECK LLC'. This registrant is one of the two inexact Quarterly/Termination restatement pairs the collapse rule has to resolve.",
  },
  {
    id: 'margaret-heisler',
    displayName: 'Margaret Heisler',
    rawNames: ['Margaret Heisler'],
    kind: 'hand',
    payeePatterns: ['%HEISLER%'],
    note: 'Surname-only payee rows. One of the five exact Quarterly/Termination restatement pairs.',
  },
  {
    id: 'yosemite-consulting',
    displayName: 'Yosemite Consulting LLC',
    rawNames: ['Yosemite Consulting LLC'],
    kind: 'hand',
    payeePatterns: ['%YOSEMITE%'],
    note: 'The only 2026 filer reporting sub-vendors (Trade Desk, Google, Facebook, PDI).',
  },
  {
    id: 'ravinett-strategies',
    displayName: 'Ravinett Strategies, LLC',
    rawNames: ['Ravinett Strategies, LLC'],
    kind: 'hand',
    payeePatterns: ['%RAVINETT%'],
    note: 'Distinctive single token; one payee spelling in pitq.',
  },
  {
    id: 'message-department',
    displayName: 'The Message Department, LLC',
    rawNames: ['The Message Department, LLC'],
    kind: 'hand',
    payeePatterns: ['%MESSAGE DEPARTMENT%'],
    note: "The leading 'The' is stripped by normalizeName but survives in the payee column, so the pattern omits it.",
  },
  {
    id: 'riff-city',
    displayName: 'Riff City Strategies, Inc',
    rawNames: ['Riff City Strategies, Inc', 'Riff City Strategies, Inc.'],
    kind: 'hand',
    payeePatterns: ['%RIFF CITY%'],
    note: "The trailing-period variant is the recon's example of a restatement a strict same-string rule misses; both spellings already share one normalized key.",
  },
  {
    id: 'cleansweep-campaigns',
    displayName: 'CleanSweep Campaigns',
    rawNames: ['CleanSweep Campaigns'],
    kind: 'hand',
    payeePatterns: ['%CLEANSWEEP%'],
    note: 'Three casing variants in the payee column; the pattern is case-folded by upper() on both sides.',
  },
  {
    id: 'storefront-political',
    displayName: 'Storefront Political Media',
    rawNames: ['Storefront Political Media'],
    kind: 'hand',
    payeePatterns: ['%STOREFRONT POLITICAL%'],
    note: "Pattern deliberately stops before 'MEDIA' so it also reaches the 'Storefront Political Data' rows. This registrant owns the key-only phantom envelope that plants a blank row in all eight child tables.",
  },
  {
    id: 'ground-floor',
    displayName: 'Ground Floor Public Affairs',
    rawNames: ['Ground Floor Public Affairs'],
    kind: 'hand',
    payeePatterns: ['%GROUND FLOOR%'],
    note: 'Also a registered lobbying firm (7 contact lobbyists), so it is the natural consultant-to-lobbyist cross.',
  },
  {
    id: 'campaign-workshop',
    displayName: 'The Campaign Workshop',
    rawNames: ['The Campaign Workshop'],
    kind: 'hand',
    payeePatterns: ['%CAMPAIGN WORKSHOP%'],
    note: "Its one reported client does not appear among the committees that pay it in pitq — a one-sided gap the lens should show, not resolve.",
  },
  {
    id: 'growth-political',
    displayName: 'Growth Political Strategies LLC',
    rawNames: ['Growth Political Strategies LLC', 'Growth Political Strategies'],
    kind: 'hand',
    payeePatterns: ['%GROWTH POLITICAL%'],
    note: 'Two raw spellings sharing one normalized key; the row exists for the payee pattern.',
  },
  {
    id: 'joseph-arellano',
    displayName: 'Joseph Arellano',
    rawNames: ['Joseph Arellano'],
    kind: 'hand',
    payeePatterns: ['%ARELLANO COMMUNICATIONS%'],
    note: "Pattern keeps the firm word on purpose: a bare '%ARELLANO%' also returns 'Herrera Arellano, LLP', a law firm. Committees write 'JOE ARELLANO COMMUNICATIONS' where the registration says 'Joseph'.",
  },
  {
    id: 'christian-kropff',
    displayName: 'Christian Kropff',
    rawNames: ['Christian Kropff'],
    kind: 'hand',
    payeePatterns: ['%KROPFF%'],
    note: "Surname-only payee rows. This registrant filed the same Initial Registration twice 1h54m apart with no amendment marker — a duplicate Original the latest-version rule cannot see.",
  },
];

/**
 * Parent envelopes excluded from every figure. Two production filings are self-evidently
 * junk (fantasy addresses, gifts to the filer's own alter ego, a client with no trace
 * anywhere in SF campaign finance); leaving them in would put $152,000 of fictional
 * client receipts and $9,542 of fictional gifts into published totals. Excluded by
 * ENVELOPE, not by name, so a legitimate later filing under any name is unaffected.
 * Envelope ids read live from `iv34-5p9x` on 2026-08-18.
 */
export const EXCLUDED_ENVELOPES: { envelope: string; reason: string }[] = [
  {
    envelope: '89f7b62b-be1f-4fc4-900a-22aba667b59c',
    reason:
      "Junk filing — 'Law enforcement protection' Initial Registration (datesigned 2025-12-10): a fantasy business address (Inverness / Shetland / 'Virgin Islands 42800'), a $600 'Watches' gift to 'Phillip Mccrown', and the code of conduct declined. The address is described, not reproduced — the redaction rule holds even for a junk filer, and this is a Person-type filing.",
  },
  {
    envelope: 'c99a90cf-9699-4669-ae9e-4202212061b4',
    reason:
      "Junk filing — 'Emelia Rosie Washington' Initial Registration (datesigned 2025-02-24): a $9,542 'Hotel bookings' gift to 'Emelia Rosie Washington Soviegn' (the filer) and a $152,000 client 'Caesar Kamila' that matches no filer, candidate, or measure in 4c8t-ngau or pitq-e56w.",
  },
];
