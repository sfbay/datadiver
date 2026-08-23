// AUTHORED DATA — SF campaign-consultant client crosswalk.
//
// `clientlist_clientname` in `m75g-xpci` is free text with NO committee, FPPC, or filer
// id anywhere in the SFEC consultant e-filing family, so every join to campaign-finance
// data is name-only and fuzzy. This table resolves each distinct client string ONCE, by
// hand, with the evidence written down — 118 strings as of the 2026-08-18 pull.
//
// Resolution ladder, cheapest first (the `evidence` string says which rung was used):
//   1. exact / near-exact `filer_name` in `4c8t-ngau`, or a same-nid ALTERNATE name the
//      filer itself uses in `pitq-e56w` (committees rename mid-cycle and 4c8t keeps only
//      the current name);
//   2. token match plus a corroborating `pitq-e56w` Schedule E payment from that
//      filer_nid to the consultant that reported the string;
//   3. the consultant's own `acwz-2ua3` client statement, which names the committee in
//      `clientinformation_committeename` — or, where that field is unusable (it is the
//      literal 'na' on the Bedford Grove row behind 'ESER'), in
//      `clientinformation_nameofclient`;
//   4. exact-dollar, in-window equality when no filer of that name exists at all
//      (`class: 'resolved-by-money'` — an inference from equality, never a filed id).
//
// CLASSES and what they promise:
//   committee         resolved to an SF Ethics `filer_nid` (`4c8t-ngau` / `pitq-e56w`)
//   candidate-only    a BARE person's name. Deliberately NOT resolved: a candidate
//                     usually has several committees (primary, general, officeholder,
//                     independent) and picking one would fabricate precision.
//   state             a state committee absent from SF Ethics. `filerNid` is a
//                     Secretary-of-State `filer_id` from `3n88-2rrb`, NOT an SF
//                     `filer_nid` — every such row says so in its evidence.
//   resolved-by-money no filer of that name exists; identity inferred from exact-dollar
//                     equality in a matched window.
//   unresolved        nothing in any published ledger matches. Left absent on purpose.
//
// CONFIDENCE describes how certain the CLASSIFICATION is — not how large the match is.
// It is set on EVERY row so a consumer never has to infer it from prose:
//   exact       an exact `4c8t-ngau` filer_name; a same-nid alternate name the filer
//               itself files under; a committee named by the consultant's own `acwz-2ua3`
//               statement; a real state filer; a definitively bare candidate name; or a
//               string that certainly matches nothing anywhere. For the non-resolving
//               classes (`candidate-only`, `unresolved`) 'exact' means the CLASSIFICATION
//               is certain, not that a filer was matched.
//   inferred    a token-overlap pick that a payment corroborates, or a resolved-by-money
//               equality.
//   uncertain   the four rows whose `evidence` also carries the word UNCERTAIN. Those two
//               facts are pinned to each other by `crosswalks.test.ts` in both directions.
// Counts on the 2026-08-18 pull: 53 exact / 61 inferred / 4 uncertain.
//
// `filerName` is always the RAW certified string from `4c8t-ngau` (or `3n88-2rrb` for
// state rows) — never title-cased, never tidied. Where `pitq-e56w` carries a different
// as-filed name for the same `filer_nid`, the evidence records both.
//
// DEVIATION FROM THE RECON MEMO (docs/recon/2026-08-14-sfec-campaign-consultant-family.md):
// the memo listed four unresolved strings. The three 'Strong(er) Muni for All' spellings
// are reclassified here as `resolved-by-money` — each one matches a Daniel Lurie Muni
// ballot-measure committee payment to the reporting consultant to the dollar, inside the
// consultant's own reporting period. The memo ran its money test only on the top-ten
// consultants and never reached Nathan Allbee or Amplify Campaigns. 'Caesar Kamila'
// remains unresolved. Every other count matches the memo exactly: 102 committee
// ($17,318,195.50), 9 candidate-only ($285,873.06), 2 state ($164,479.06).

export type ClientClass = 'committee' | 'candidate-only' | 'state' | 'resolved-by-money' | 'unresolved';

/** How certain the classification is. See the CONFIDENCE block above. */
export type ClientConfidence = 'exact' | 'inferred' | 'uncertain';

export interface ClientEntry {
  /** The raw `clientlist_clientname` string, byte-for-byte as filed. */
  clientString: string;
  class: ClientClass;
  /** SF Ethics `filer_nid`, or a `3n88-2rrb` state `filer_id` on `state` rows. */
  filerNid?: string;
  /** Raw certified filer name — never title-cased. */
  filerName?: string;
  /** Certainty of the classification. Set on every row authored here. */
  confidence?: ClientConfidence;
  /** What matched, and how. Never empty. */
  evidence: string;
  /** ISO date this row was reviewed against live data. */
  reviewedAt: string;
}

/** Ordered by reported receipts, descending — the reading order a human review wants. */
export const CLIENT_CROSSWALK: ClientEntry[] = [
  {
    clientString: "Believe in SF, Lurie for Mayor 2024",
    class: "committee",
    filerNid: "208769508",
    filerName: "Believe in SF, Lurie for Mayor 2024",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Believe in SF, Lurie for Mayor 2024' (filer_nid 208769508).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Safer San Francisco for Mark Farrell for Mayor 2024",
    class: "committee",
    filerNid: "211765770",
    filerName: "Safer San Francisco",
    confidence: "exact",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Safer San Francisco' (filer_nid 211765770) pays 'AL Media LLC' 17 rows summing $2,553,984 — the reported figure to the dollar. 4c8t-ngau carries the short current name 'Safer San Francisco'; pitq-e56w carries the as-filed 'Safer San Francisco for Mark Farrell for Mayor 2024'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Committee to Fix San Francisco Government, A Coalition of San Francisco Civic Organizations Dedicated to Improving the City's Future",
    class: "committee",
    filerNid: "208835453",
    filerName: "Committee to Fix San Francisco Government, Yes on D, No on E, A Coalition of San Francisco Civic Organizations Dedicated to Improving the City's Future",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Committee to Fix San Francisco Government, Yes on D, No on E, A Coalition of San Francisco Civic Organizations Dedicated to Improving the City's Future' (filer_nid 208835453) pays Strother Nuckels $1,256,870 across 8 rows; the filer dropped the 'Yes on D, No on E' clause from the registered name.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "San Franciscans for Fire, Earthquake and Disaster Preparedness, sponsored by San Francisco Firefighters Local 798",
    class: "committee",
    filerNid: "215726436",
    filerName: "Yes on A, San Franciscans for Fire, Earthquake, and Disaster Preparedness, sponsored by San Francisco Firefighters local 798",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Yes on A, San Franciscans for Fire, Earthquake, and Disaster Preparedness, sponsored by San Francisco Firefighters local 798' (filer_nid 215726436) pays The Merrill Strategy Group $1,125,860.01; the registered name leads with 'Yes on A,'. The similarly named 150591077 is a terminated earlier-cycle committee and predates this family.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Mark Farrell for Mayor 2024",
    class: "committee",
    filerNid: "210489481",
    filerName: "Mark Farrell for Mayor 2024",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Mark Farrell for Mayor 2024' (filer_nid 210489481).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Re-lect Mayor London Breed 2024",
    class: "committee",
    filerNid: "201219888",
    filerName: "Re-Elect Mayor London Breed 2024",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Re-Elect Mayor London Breed 2024' (filer_nid 201219888); 'Re-lect' is a filer typo for 'Re-Elect'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Yes on C, No on D to Protect San Francisco’s Small Businesses and Economic Recovery, Sponsored by San Francisco Civic Organizations",
    class: "committee",
    filerNid: "215118470",
    filerName: "YES ON C, NO ON D TO PROTECT SAN FRANCISCO'S SMALL BUSINESSES AND ECONOMIC RECOVERY, SPONSORED BY SAN FRANCISCO CIVIC ORGANIZATIONS",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'YES ON C, NO ON D TO PROTECT SAN FRANCISCO'S SMALL BUSINESSES AND ECONOMIC RECOVERY, SPONSORED BY SAN FRANCISCO CIVIC ORGANIZATIONS' (filer_nid 215118470) pays Bearstar Strategies $720,270.77. Same name as the registration up to case and a curly apostrophe.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Forward Action SF, Supporting Breed for Mayor 2024, Sponsored by Abundance Network",
    class: "committee",
    filerNid: "208688469",
    filerName: "Forward Action SF, Supporting London Breed for Mayor 2024, Sponsored by Abundance Network",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Forward Action SF, Supporting London Breed for Mayor 2024, Sponsored by Abundance Network' (filer_nid 208688469) pays The Outreach Team $1,850,000. The registered name spells out 'London Breed'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Safer San Francisco for Mark Farrel 2024",
    class: "committee",
    filerNid: "211765770",
    filerName: "Safer San Francisco",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Safer San Francisco' (filer_nid 211765770) pays payee 'Agency' 9 rows summing $453,053.54 against $449,484.50 reported. 'Farrel' is a filer misspelling; this and the 'for Mayor' variant are the AGENCY double filing across report types.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Safer San Francisco for Mark Farrel for Mayor 2024",
    class: "committee",
    filerNid: "211765770",
    filerName: "Safer San Francisco",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Safer San Francisco' (filer_nid 211765770) second spelling of the AGENCY double filing; same committee, same $449,484.50. 'Farrel' is a filer misspelling.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Healthy Vibrant SF, Yes on B",
    class: "committee",
    filerNid: "211837252",
    filerName: "Healthy, Vibrant SF, Yes on B",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Healthy, Vibrant SF, Yes on B' (filer_nid 211837252); the registration punctuates it 'Healthy, Vibrant SF, Yes on B'; KMM and Bedford Grove are both paid by this committee.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Aaron Peskin for Mayor",
    class: "committee",
    filerNid: "211430184",
    filerName: "Aaron Peskin for Mayor 2024",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Aaron Peskin for Mayor 2024' (filer_nid 211430184) pays Stearns Consulting $164,900; the registered name carries the year.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Committee to Fix San Francisco Government",
    class: "committee",
    filerNid: "208835453",
    filerName: "Committee to Fix San Francisco Government, Yes on D, No on E, A Coalition of San Francisco Civic Organizations Dedicated to Improving the City's Future",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Committee to Fix San Francisco Government, Yes on D, No on E, A Coalition of San Francisco Civic Organizations Dedicated to Improving the City's Future' (filer_nid 208835453) pays 'SGR CONSULTING, LLC' three rows summing $388,889.62 — the reported figure to the penny. Short form of the same registered name.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Mayor Mark Farrell for Yes on Prop D",
    class: "committee",
    filerNid: "211027210",
    filerName: "Mayor Mark Farrell for Yes on Prop D",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Mayor Mark Farrell for Yes on Prop D' (filer_nid 211027210).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Yes on B",
    class: "committee",
    filerNid: "211837252",
    filerName: "Healthy, Vibrant SF, Yes on B",
    confidence: "exact",
    evidence:
      "Resolves only through the consultant's own acwz-2ua3 statement: Stearns Consulting's Termination (datesigned 2024-12-16) names client 'Yes on B' with clientinformation_committeename 'Healthy Vibrant SF' = 4c8t-ngau filer_nid 211837252 'Healthy, Vibrant SF, Yes on B'. The bare string matches an unrelated 1990s filer by tokens and must never be joined by name.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Daniel Lurie Ballot Measure Committee Safe, Affordable MUNI for a Thriving San Francisco",
    class: "committee",
    filerNid: "214099226",
    filerName: "Daniel Lurie Ballot Measure Committee - Safe, Affordable MUNI for a Thriving San Francisco",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Daniel Lurie Ballot Measure Committee - Safe, Affordable MUNI for a Thriving San Francisco' (filer_nid 214099226); the registered name inserts a hyphen after \"Committee\".",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Yes on Prop K, Ocean Beach for All",
    class: "committee",
    filerNid: "211776936",
    filerName: "No on G, Save Sunset Dunes sponsored by Friends of Sunset Dunes",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'No on G, Save Sunset Dunes sponsored by Friends of Sunset Dunes' (filer_nid 211776936) pays KMM Strategies $268,929.99; the registered name is 'Yes on K, Ocean Beach Park for All Sponsored By Community Nonprofits'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Yes on L, Fund the Bus",
    class: "committee",
    filerNid: "211486142",
    filerName: "Yes on L, Fund the Bus",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Yes on L, Fund the Bus' (filer_nid 211486142).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Stop the Recall, Stand with Joel Engardio",
    class: "committee",
    filerNid: "212872841",
    filerName: "No on A, Stop the Engardio Recall",
    confidence: "exact",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'No on A, Stop the Engardio Recall' (filer_nid 212872841) this filer_nid appears in pitq-e56w under BOTH 'Stop the Recall, Stand with Joel Engardio' and its later name 'No on A, Stop the Engardio Recall' (KMM Strategies is paid $156,366.86 and $84,205.62 respectively). 4c8t-ngau carries only the current name.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Yes on G, the Affordable Housing Opportunity Fund",
    class: "committee",
    filerNid: "211945518",
    filerName: "Yes on G, the Affordable Housing Opportunity Fund",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Yes on G, the Affordable Housing Opportunity Fund' (filer_nid 211945518).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Scott Wiener for State Senate 2024",
    class: "state",
    filerNid: "1434666",
    filerName: "Re-Elect Scott Wiener for State Senate 2024",
    confidence: "exact",
    evidence:
      "State committee, not an SF Ethics filer: 4c8t-ngau has no 2024 Wiener senate committee. Reconciles in 3n88-2rrb (Secretary of State ledger) as filer_name 'Re-Elect Scott Wiener for State Senate 2024', filer_id 1434666, whose payments to the KMM/Kully Hall payee family total $362,037.12 across 48 rows and whose nine Schedule E rows dated 2024-09-09 to 2024-11-05 sum to the reported $156,979.06. filerNid here is a STATE filer_id, not an SF filer_nid.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Clean Up City Hall, Mayor Lurie's Ballot Measure Committee",
    class: "committee",
    filerNid: "216006060",
    filerName: "Clean Up City Hall, Mayor Lurie's Ballot Measure Committee",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Clean Up City Hall, Mayor Lurie's Ballot Measure Committee' (filer_nid 216006060).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "SF Believes",
    class: "committee",
    filerNid: "215606983",
    filerName: "SF Believes",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'SF Believes' (filer_nid 215606983).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Caesar Kamila",
    class: "unresolved",
    confidence: "exact",
    evidence:
      "No filer, candidate, or measure of this name exists in 4c8t-ngau, pitq-e56w or 3n88-2rrb, and no committee pays the registrant. Sole client of the junk 'Emelia Rosie Washington' Initial Registration ($152,000), whose envelope is in EXCLUDED_ENVELOPES.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Mayor Breed's Committee for Reproductive Freedom, Yes on O",
    class: "committee",
    filerNid: "211703442",
    filerName: "Mayor Breed's Committee for Reproductive Freedom, Yes on O",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Mayor Breed's Committee for Reproductive Freedom, Yes on O' (filer_nid 211703442).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Stephen Sherrill for Supervisor 2026",
    class: "committee",
    filerNid: "213987622",
    filerName: "Stephen Sherrill for Supervisor 2026",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Stephen Sherrill for Supervisor 2026' (filer_nid 213987622).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "California Alliance of Family Owned Businesses PAC",
    class: "committee",
    filerNid: "216701453",
    filerName: "California Alliance of Family Owned Businesses PAC",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'California Alliance of Family Owned Businesses PAC' (filer_nid 216701453).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Connie Chan for Supervisor 2024",
    class: "committee",
    filerNid: "206871404",
    filerName: "Connie Chan for Supervisor 2024",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Connie Chan for Supervisor 2024' (filer_nid 206871404).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Daniel Lurie for Mayor 2024",
    class: "committee",
    filerNid: "208599394",
    filerName: "Daniel Lurie for Mayor 2024",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Daniel Lurie for Mayor 2024' (filer_nid 208599394) pays 'Szabo & Associates LLC' $475,070.16; exact filer_name match.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Natalie Gee for Supervisor 2026",
    class: "committee",
    filerNid: "214896050",
    filerName: "Natalie Gee for Supervisor 2026",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Natalie Gee for Supervisor 2026' (filer_nid 214896050).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Stand Up For SF",
    class: "committee",
    filerNid: "214966146",
    filerName: "Yes on D - Stand Up for SF sponsored by labor organizations",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Yes on D - Stand Up for SF sponsored by labor organizations' (filer_nid 214966146) pays 'Clifford Moss LLC' $502,322.22 — CliffordMoss is the consultant reporting this $125,000 client. Registered name 'Yes on D - Stand Up for SF sponsored by labor organizations'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "California Alliance of Family Owned Businesses",
    class: "committee",
    filerNid: "216701453",
    filerName: "California Alliance of Family Owned Businesses PAC",
    confidence: "uncertain",
    evidence:
      "Token match to 4c8t-ngau filer_name 'California Alliance of Family Owned Businesses PAC' (filer_nid 216701453); no filer exists under the bare organization name; 216701453 is its only ACTIVE SF-registered committee (212422378 'A Better Bay Area, Sponsored by California Alliance of Family Owned Businesses' is terminated). UNCERTAIN: 216701453 has NO Schedule E rows in pitq-e56w at all — only F496 late-independent-expenditure rows — so no payee ledger exists to corroborate or refute the pick from either side.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Yes on F, San Franciscans for a Fully Staffed Police Department",
    class: "committee",
    filerNid: "211940502",
    filerName: "Yes on F, San Franciscans for a Full Police Staffing",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Yes on F, San Franciscans for a Full Police Staffing' (filer_nid 211940502) pays KMM Strategies $124,529.32; the registered name is 'Yes on F, San Franciscans for a Full Police Staffing'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Danny Sauter",
    class: "candidate-only",
    confidence: "exact",
    evidence:
      "Bare candidate name. 4c8t-ngau holds ONE 2024-era Sauter filer, 208713856 'Danny Sauter for Supervisor 2024 Officerholder Committee' (pitq-e56w also files it under the as-filed 'Danny Sauter for Supervisor 2024' — the same nid, not a second committee), plus the terminated 2020 committee. The dollars do not reconcile: KMM reports $108,195.18 against $135,901.83 of Schedule E, or $165,082.74 once debt rows are counted. A bare person name plus an unreconciled figure is not enough to name a committee.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "San Franciscans for Fire, Earthquake and Disaster Preparedness",
    class: "committee",
    filerNid: "215726436",
    filerName: "Yes on A, San Franciscans for Fire, Earthquake, and Disaster Preparedness, sponsored by San Francisco Firefighters local 798",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Yes on A, San Franciscans for Fire, Earthquake, and Disaster Preparedness, sponsored by San Francisco Firefighters local 798' (filer_nid 215726436) pays Bedford Grove/Celeste Wolter Sempere $80,000, Stearns Consulting $52,500 and John Gallagher $42,629.53 — the four consultants reporting this string. Short form of the registered name.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Forward Action SF",
    class: "committee",
    filerNid: "208688469",
    filerName: "Forward Action SF, Supporting London Breed for Mayor 2024, Sponsored by Abundance Network",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Forward Action SF, Supporting London Breed for Mayor 2024, Sponsored by Abundance Network' (filer_nid 208688469) pays Bedford Grove $101,950 across 4 rows; short form of the registered name.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Brandee Marckmann",
    class: "candidate-only",
    confidence: "exact",
    evidence:
      "Bare candidate name; Democratic Direct separately reports 'Brandee Marckmann for Board of Education 2026' as its own client string, so the bare form is not simply shorthand for it. Not guessed.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Chyanne Chen for Supervisor 2024",
    class: "committee",
    filerNid: "210823617",
    filerName: "Chyanne Chen for Supervisor 2024",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Chyanne Chen for Supervisor 2024' (filer_nid 210823617).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Sharon Lai for Supervisor",
    class: "committee",
    filerNid: "208584481",
    filerName: "Sharon Lai for Supervisor 2024",
    confidence: "exact",
    evidence:
      "Named in Stearns Consulting's acwz-2ua3 Termination (2024-12-16) as client 'Sharon Lai for Supervisor', committee 'Sharon Lai for Supervisor 2024' = filer_nid 208584481, which pays Stearns $24,000 in pitq-e56w.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "San Franciscans Opposed to Aaron Peskin for Mayor 2024",
    class: "resolved-by-money",
    filerNid: "212327513",
    filerName: "Residents Opposing Aaron Peskin for Mayor 2024",
    confidence: "inferred",
    evidence:
      "No filer of this name exists. Resolved by exact-dollar equality: 'Residents Opposing Aaron Peskin for Mayor 2024' (filer_nid 212327513) paid Strother Nuckels exactly $81,500 in one Schedule E row in the same quarter, matching the reported receipt to the dollar. Inference from equality, not from any filed identifier.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Vote Marjan Philhour for Supervisor 2024",
    class: "committee",
    filerNid: "208734348",
    filerName: "Vote Marjan Philhour for Supervisor 2024",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Vote Marjan Philhour for Supervisor 2024' (filer_nid 208734348) pays The Outreach Team $80,000 — the reported figure to the dollar. Exact filer_name match.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "San Franciscans for Term Limit Reform",
    class: "committee",
    filerNid: "215271192",
    filerName: "Term Limits Now - Yes on B!",
    confidence: "exact",
    evidence:
      "Same-nid alternate name: filer_nid 215271192 files in pitq-e56w under the LITERAL string 'San Franciscans for Term Limit Reform' (3 S497 rows, Mar 2026) as well as under its 4c8t-ngau current name 'Term Limits Now - Yes on B!'. Corroborated by money: 215271192 pays BMWL Campaigns $467,837.50, and BMWL is the consultant reporting this $75,000 client.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Yes on C, No on D to Protect San Francisco's Small Business Recovery",
    class: "committee",
    filerNid: "215118470",
    filerName: "YES ON C, NO ON D TO PROTECT SAN FRANCISCO'S SMALL BUSINESSES AND ECONOMIC RECOVERY, SPONSORED BY SAN FRANCISCO CIVIC ORGANIZATIONS",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'YES ON C, NO ON D TO PROTECT SAN FRANCISCO'S SMALL BUSINESSES AND ECONOMIC RECOVERY, SPONSORED BY SAN FRANCISCO CIVIC ORGANIZATIONS' (filer_nid 215118470) pays SGR Consulting $77,798; short form of the registered name (straight apostrophe).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Yes on D Stand Up For SF Sponsored By Labor Organizations",
    class: "committee",
    filerNid: "214966146",
    filerName: "Yes on D - Stand Up for SF sponsored by labor organizations",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Yes on D - Stand Up for SF sponsored by labor organizations' (filer_nid 214966146); the registered name inserts a hyphen after \"Yes on D\".",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "San Franciscans Supporting Brooke Jenkins for District Attorney 2024",
    class: "committee",
    filerNid: "212266099",
    filerName: "San Franciscans in Support of Brooke Jenkins for District Attorney 2024",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'San Franciscans in Support of Brooke Jenkins for District Attorney 2024' (filer_nid 212266099) pays Strother Nuckels exactly $50,000, the reported figure; the registered name reads 'in Support of' rather than 'Supporting'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Support Our First Responders Now! Yes on N",
    class: "committee",
    filerNid: "211945441",
    filerName: "Support our First Responders Now! Yes on N",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Support our First Responders Now! Yes on N' (filer_nid 211945441).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "United Educators of San Francisco Candidate PAC",
    class: "committee",
    filerNid: "6685673",
    filerName: "United Educators of San Francisco Candidate PAC",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'United Educators of San Francisco Candidate PAC' (filer_nid 6685673) pays Yosemite Consulting LLC $140,000; exact filer_name match (status NONSF).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Ernest Jones for Supervisor 2024",
    class: "committee",
    filerNid: "208059485",
    filerName: "Ernest 'EJ' Jones for Supervisor 2024",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Ernest 'EJ' Jones for Supervisor 2024' (filer_nid 208059485) pays 'Clifford Moss' $63,134.24; the registered name carries the nickname, \"Ernest 'EJ' Jones for Supervisor 2024\".",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Healthy and Vibrant SF - Yes on B",
    class: "committee",
    filerNid: "211837252",
    filerName: "Healthy, Vibrant SF, Yes on B",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Healthy, Vibrant SF, Yes on B' (filer_nid 211837252); punctuation-and-conjunction variant of the registered name.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Stephen Torres for Supervisor 2024",
    class: "committee",
    filerNid: "208763299",
    filerName: "Stephen Torres for Supervisor 2024",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Stephen Torres for Supervisor 2024' (filer_nid 208763299).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Yes on A, San Franciscans for Fire, Earthquake and Disaster Preparedness",
    class: "committee",
    filerNid: "215726436",
    filerName: "Yes on A, San Franciscans for Fire, Earthquake, and Disaster Preparedness, sponsored by San Francisco Firefighters local 798",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Yes on A, San Franciscans for Fire, Earthquake, and Disaster Preparedness, sponsored by San Francisco Firefighters local 798' (filer_nid 215726436) pays John J Gallagher $42,629.53 across 23 rows; the registered name adds the Local 798 sponsor clause.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Theo Ellington for Supervisor 2026",
    class: "committee",
    filerNid: "214808596",
    filerName: "Theo Ellington for Supervisor 2026",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Theo Ellington for Supervisor 2026' (filer_nid 214808596).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Our Neighborhood, Our Future Supporting the Recall of Supervisor Engardio",
    class: "committee",
    filerNid: "212570183",
    filerName: "Our Neighborhood, Our Future",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Our Neighborhood, Our Future' (filer_nid 212570183); 'Our Neighborhood, Our Future' is the registered name; the recall clause is the filer's own descriptive suffix.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Alan Wong for Supervisor 2026",
    class: "committee",
    filerNid: "215112140",
    filerName: "Alan Wong for Supervisor 2026",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Alan Wong for Supervisor 2026' (filer_nid 215112140).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Committee to Re-Elect Mayor London Breed",
    class: "committee",
    filerNid: "201219888",
    filerName: "Re-Elect Mayor London Breed 2024",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Re-Elect Mayor London Breed 2024' (filer_nid 201219888); the registered name is 'Re-Elect Mayor London Breed 2024'; no separate 'Committee to Re-Elect' filer exists.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Brandee Marckmann for Board of Education 2026",
    class: "committee",
    filerNid: "215120587",
    filerName: "Brandee Marckmann for Board of Education 2026",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Brandee Marckmann for Board of Education 2026' (filer_nid 215120587).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Improve Emergency Response Times - Yes on I",
    class: "committee",
    filerNid: "211945557",
    filerName: "Improve Emergency Responses Times - Yes on I",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Improve Emergency Responses Times - Yes on I' (filer_nid 211945557) pays 'Clifford Moss' $45,972.32; the registered name carries the typo 'Responses'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Re-Elect Mayor London Breed",
    class: "committee",
    filerNid: "201219888",
    filerName: "Re-Elect Mayor London Breed 2024",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Re-Elect Mayor London Breed 2024' (filer_nid 201219888); year-less form of the registered name.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Manny Yekutiel for Supervisor 2026",
    class: "committee",
    filerNid: "214772801",
    filerName: "Manny Yekutiel for Supervisor 2026",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Manny Yekutiel for Supervisor 2026' (filer_nid 214772801) pays BMWL Campaigns $71,814.98; exact filer_name match. Distinct from the 'Team Manny' independent committee 217128861.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Affordable SF Now, supporting Natalie Gee for Supervisor 2026",
    class: "committee",
    filerNid: "216048526",
    filerName: "Affordable SF Now supporting Natalie Gee for Supervisor 2026, Sponsored by Labor Organizations",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Affordable SF Now supporting Natalie Gee for Supervisor 2026, Sponsored by Labor Organizations' (filer_nid 216048526) pays 'Clifford Moss' $52,500; the registered name adds ', Sponsored by Labor Organizations'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Real Reform, Yes on C, No on D, Yes on E ,a coalition of small businesses, neighbors and Aaron Peskin",
    class: "committee",
    filerNid: "211810083",
    filerName: "Real Reform, Yes on C, No on D, Yes on E, A Coalition of Small Businesses, Neighbors and Aaron Peskin",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Real Reform, Yes on C, No on D, Yes on E, A Coalition of Small Businesses, Neighbors and Aaron Peskin' (filer_nid 211810083); same name up to a stray space before \"a coalition\".",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Re-Elect Mayor London Breed 2024",
    class: "committee",
    filerNid: "201219888",
    filerName: "Re-Elect Mayor London Breed 2024",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Re-Elect Mayor London Breed 2024' (filer_nid 201219888).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Real Reform Yes on C, No on D, Yes on E",
    class: "committee",
    filerNid: "211810083",
    filerName: "Real Reform, Yes on C, No on D, Yes on E, A Coalition of Small Businesses, Neighbors and Aaron Peskin",
    confidence: "exact",
    evidence:
      "Short form of 4c8t-ngau filer_name 'Real Reform, Yes on C, No on D, Yes on E, A Coalition of Small Businesses, Neighbors and Aaron Peskin' (filer_nid 211810083); corroborated by Stearns Consulting's acwz-2ua3 Termination naming client 'Real Reform' with committee 'Real Reform, Yes on C, No on D, Yes on E'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Michael Nguyen",
    class: "candidate-only",
    confidence: "exact",
    evidence:
      "Bare candidate name; the same consultant separately reports 'Michael Nguyen for Supervisor 2026'. Not guessed.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Stephen Sherrill",
    class: "candidate-only",
    confidence: "exact",
    evidence:
      "Bare candidate name; 4c8t-ngau holds four Sherrill committees (candidate, general, GrowSF IE, and a support committee) and the filings do not say which. Not guessed.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Earthquake Safety and Emergency Response (ESER)",
    class: "committee",
    filerNid: "215726436",
    filerName: "Yes on A, San Franciscans for Fire, Earthquake, and Disaster Preparedness, sponsored by San Francisco Firefighters local 798",
    confidence: "exact",
    evidence:
      "'ESER' is the Earthquake Safety and Emergency Response bond program, not a committee name, and no filer carries it. Resolved through the consultant's own acwz-2ua3 statement: Bedford Grove's only earthquake-related client statement names 'San Franciscans for Fire, Earthquake and Disaster Preparedness', which is filer_nid 215726436 ('Yes on A, ...sponsored by San Francisco Firefighters local 798') and pays Bedford Grove $80,000 in pitq-e56w.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Healthy Vibrant SF YES on B",
    class: "committee",
    filerNid: "211837252",
    filerName: "Healthy, Vibrant SF, Yes on B",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Healthy, Vibrant SF, Yes on B' (filer_nid 211837252); casing-and-punctuation variant of the registered name.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Our Neighborhood, Our Future",
    class: "committee",
    filerNid: "212570183",
    filerName: "Our Neighborhood, Our Future",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Our Neighborhood, Our Future' (filer_nid 212570183).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Yes on C, No on D to Protect San Francisco Small Businesses and Economic Recovery, Sponsored by San Francisco Civic Organizations",
    class: "committee",
    filerNid: "215118470",
    filerName: "YES ON C, NO ON D TO PROTECT SAN FRANCISCO'S SMALL BUSINESSES AND ECONOMIC RECOVERY, SPONSORED BY SAN FRANCISCO CIVIC ORGANIZATIONS",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'YES ON C, NO ON D TO PROTECT SAN FRANCISCO'S SMALL BUSINESSES AND ECONOMIC RECOVERY, SPONSORED BY SAN FRANCISCO CIVIC ORGANIZATIONS' (filer_nid 215118470); same registered name with the possessive 's dropped from 'San Francisco's'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Gary McCoy for Supervisor 2026",
    class: "committee",
    filerNid: "214783692",
    filerName: "Gary Mc Coy for Supervisor 2026",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Gary Mc Coy for Supervisor 2026' (filer_nid 214783692); same open-spelling trap: 'Gary Mc Coy for Supervisor 2026'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Stephen Sherrill for Supervisor",
    class: "committee",
    filerNid: "213987622",
    filerName: "Stephen Sherrill for Supervisor 2026",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Stephen Sherrill for Supervisor 2026' (filer_nid 213987622); year-less form; 213987622 is the primary candidate committee this consultant is paid by.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Clean Up City Hall",
    class: "committee",
    filerNid: "216006060",
    filerName: "Clean Up City Hall, Mayor Lurie's Ballot Measure Committee",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Clean Up City Hall, Mayor Lurie's Ballot Measure Committee' (filer_nid 216006060); short form of \"Clean Up City Hall, Mayor Lurie's Ballot Measure Committee\", which pays Nathan Allbee $78,000 and Amplify Campaigns $9,788.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Strong Muni for All",
    class: "resolved-by-money",
    filerNid: "214099226",
    filerName: "Daniel Lurie Ballot Measure Committee - Safe, Affordable MUNI for a Thriving San Francisco",
    confidence: "inferred",
    evidence:
      "No filer named 'Strong(er) Muni for All' exists in 4c8t-ngau (checked 2026-08-18). Resolved by exact-dollar, in-window equality against 'Daniel Lurie Ballot Measure Committee - Safe, Affordable MUNI for a Thriving San Francisco' (filer_nid 214099226): it paid Nathan Allbee $12,000 (2025-12-31) + $6,000 (2026-02-17) = $18,000 inside his Dec 2025-Feb 2026 period, the reported figure to the dollar. DEVIATION FROM THE RECON, which listed this string unresolved — the recon ran its money test only on the top-ten consultants and never reached Allbee. Corroborating: the same filings name the sibling Lurie committee 'Clean Up City Hall' by its real name, so this string is the other one.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Stronger Muni for All",
    class: "resolved-by-money",
    filerNid: "214099226",
    filerName: "Daniel Lurie Ballot Measure Committee - Safe, Affordable MUNI for a Thriving San Francisco",
    confidence: "inferred",
    evidence:
      "No filer named 'Strong(er) Muni for All' exists in 4c8t-ngau (checked 2026-08-18). Resolved by exact-dollar, in-window equality against 'Daniel Lurie Ballot Measure Committee - Safe, Affordable MUNI for a Thriving San Francisco' (filer_nid 214099226): it paid Nathan Allbee $6,000 (2026-03-23) + $6,000 (2026-04-28) + $6,000 (2026-05-04) = $18,000 inside his Mar-May 2026 period, the reported figure to the dollar. DEVIATION FROM THE RECON, which listed this string unresolved.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Albert Chow for Supervisor 2026",
    class: "committee",
    filerNid: "215019694",
    filerName: "Albert Chow for Supervisor 2026",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Albert Chow for Supervisor 2026' (filer_nid 215019694).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Stronger Muni For All, Mayor Lurie's Ballot Measure Committee",
    class: "resolved-by-money",
    filerNid: "214099226",
    filerName: "Daniel Lurie Ballot Measure Committee - Safe, Affordable MUNI for a Thriving San Francisco",
    confidence: "inferred",
    evidence:
      "No filer named 'Strong(er) Muni for All' exists in 4c8t-ngau (checked 2026-08-18). Resolved by exact-dollar, in-window equality against 'Daniel Lurie Ballot Measure Committee - Safe, Affordable MUNI for a Thriving San Francisco' (filer_nid 214099226): it paid Amplify Campaigns $10,810 (2026-03-12) + $5,390 (2026-04-10) = $16,200 inside its Mar-May 2026 period, the reported figure to the dollar; the client string itself names a Lurie ballot-measure committee and 214099226 is the Muni one. DEVIATION FROM THE RECON, which listed this string unresolved.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Brooke Jenkins for District Attorney 2024",
    class: "committee",
    filerNid: "208090470",
    filerName: "Brooke Jenkins for District Attorney 2024",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Brooke Jenkins for District Attorney 2024' (filer_nid 208090470).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Lori Brooke",
    class: "candidate-only",
    confidence: "exact",
    evidence:
      "Bare candidate name; the same consultant separately reports 'Lori Brooke for Supervisor 2026', and a general-election committee also exists. Not guessed.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Mark Farrell for Mayor",
    class: "committee",
    filerNid: "210489481",
    filerName: "Mark Farrell for Mayor 2024",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Mark Farrell for Mayor 2024' (filer_nid 210489481); year-less form of the registered name.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Stephen Sherrill For Supervisor",
    class: "committee",
    filerNid: "213987622",
    filerName: "Stephen Sherrill for Supervisor 2026",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Stephen Sherrill for Supervisor 2026' (filer_nid 213987622); capitalisation variant of the year-less form.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "California Federation of Teachers",
    class: "committee",
    filerNid: "212294989",
    filerName: "California Federation of Teachers COPE",
    confidence: "uncertain",
    evidence:
      "Token match to 4c8t-ngau filer_name 'California Federation of Teachers COPE' (filer_nid 212294989); no filer exists under the bare organization name; 'California Federation of Teachers COPE' (212294989) is its only ACTIVE SF-registered committee, the sibling 'California Federation of Teachers COPE Prop/Ballot Committee' (204879406) being terminated. UNCERTAIN: 212294989 has zero Schedule E rows in pitq-e56w (F496 only), and CFT does not appear among the committees paying The Campaign Workshop, so nothing corroborates the pick.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Our Neighborhood, Our Future, Supporting the Recall of Supervisor Engardio",
    class: "committee",
    filerNid: "212570183",
    filerName: "Our Neighborhood, Our Future",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Our Neighborhood, Our Future' (filer_nid 212570183); third spelling of the same descriptive suffix on the registered name 'Our Neighborhood, Our Future'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Fair Housing",
    class: "committee",
    filerNid: "216747316",
    filerName: "Fair Housing",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Fair Housing' (filer_nid 216747316).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Albert Chow",
    class: "candidate-only",
    confidence: "exact",
    evidence:
      "Bare candidate name reported by two consultants; 4c8t-ngau holds both a primary and a general Albert Chow committee. Not guessed.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "GrowSF Supporting Alan Wong for Supervisor 2026",
    class: "committee",
    filerNid: "215852865",
    filerName: "GrowSF Supporting Alan Wong for Supervisor 2026",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'GrowSF Supporting Alan Wong for Supervisor 2026' (filer_nid 215852865) pays 'Szabo & Associates LLC' $10,000; exact filer_name match.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "GrowSF Supporting Stephen Sherrill for Supervisor 2026",
    class: "committee",
    filerNid: "214918275",
    filerName: "GrowSF Supporting Stephen Sherrill for Supervisor 2026",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'GrowSF Supporting Stephen Sherrill for Supervisor 2026' (filer_nid 214918275) pays 'Szabo & Associates LLC' $10,000; exact filer_name match.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Paid for by Real Reform, Yes on C, No on D, Yes on E, a coalition of small businesses, neighbors and Aaron Peskin",
    class: "committee",
    filerNid: "211810083",
    filerName: "Real Reform, Yes on C, No on D, Yes on E, A Coalition of Small Businesses, Neighbors and Aaron Peskin",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Real Reform, Yes on C, No on D, Yes on E, A Coalition of Small Businesses, Neighbors and Aaron Peskin' (filer_nid 211810083); the registered name with a \"Paid for by\" disclaimer prefix pasted in.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Stephen Martin Pinto for Supervisor",
    class: "committee",
    filerNid: "208395017",
    filerName: "Stephen Martin-Pinto for Supervisor 2024",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Stephen Martin-Pinto for Supervisor 2024' (filer_nid 208395017); the registered name hyphenates 'Martin-Pinto' and carries the year.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Yes on F - Fully Staffed Police Dept.",
    class: "committee",
    filerNid: "211940502",
    filerName: "Yes on F, San Franciscans for a Full Police Staffing",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Yes on F, San Franciscans for a Full Police Staffing' (filer_nid 211940502) pays Bedford Grove $10,000; abbreviated form of 'Yes on F, San Franciscans for a Full Police Staffing'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "JR Eppler for Supervisor 2026",
    class: "committee",
    filerNid: "214577156",
    filerName: "J.R. Eppler for Supervisor 2026",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'J.R. Eppler for Supervisor 2026' (filer_nid 214577156); the registered name punctuates the initials, 'J.R. Eppler for Supervisor 2026'; it is the only Eppler committee and it pays MJE Strategies $14,972.87.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Matt Dorsey for DCCC",
    class: "committee",
    filerNid: "208697921",
    filerName: "Matt Dorsey for DCCC Member 2024 Officeholder Committee",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'Matt Dorsey for DCCC Member 2024 Officeholder Committee' (filer_nid 208697921) pays Bedford Grove $11,500 across 4 rows — Bedford Grove is the consultant reporting this client. Registered name 'Matt Dorsey for DCCC Member 2024 Officeholder Committee'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "DJ Brookter For Supervisor 2026",
    class: "committee",
    filerNid: "214443884",
    filerName: "DJ Brookter for Supervisor 2026",
    confidence: "inferred",
    evidence:
      "Resolved against pitq-e56w Schedule E: 'DJ Brookter for Supervisor 2026' (filer_nid 214443884) pays Proverb Strategy $30,896.46; capitalisation variant of the exact filer_name.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "DJ Brookter for Supervisor 2026",
    class: "committee",
    filerNid: "214443884",
    filerName: "DJ Brookter for Supervisor 2026",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'DJ Brookter for Supervisor 2026' (filer_nid 214443884).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Re-elect Mayor London Breed 2024",
    class: "committee",
    filerNid: "201219888",
    filerName: "Re-Elect Mayor London Breed 2024",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Re-Elect Mayor London Breed 2024' (filer_nid 201219888); capitalisation variant of the exact filer_name.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Lori Brooke for Supervisor 2026",
    class: "committee",
    filerNid: "214820258",
    filerName: "Lori Brooke for Supervisor 2026",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Lori Brooke for Supervisor 2026' (filer_nid 214820258).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Phil Kim for Schoolboard 2026 July",
    class: "committee",
    filerNid: "214769736",
    filerName: "Kim for School Board June 2026",
    confidence: "uncertain",
    evidence:
      "Nathan Allbee's only Kim payer in pitq-e56w is filer_nid 214769736 'Kim for School Board June 2026' ($19,799.16 over 9 rows, against $17,500 reported across his three Kim strings; it is also the only Kim filer with substantial activity, 67 EXPN rows). The registry is genuinely ambiguous here: THREE near-identical 2026 Kim school-board committees exist, two of them sharing the IDENTICAL filer_name 'Kim for School Board June 2026' and the identical fppc_id 1483649 (214769736 candidate_name 'Kim, Phil'; 214769651 candidate_name 'Kim, Phillip', which has no pitq activity at all), plus 214769397 'Kim for School Board 2026' (candidate_name 'Lim, Phil') and a junk '[delete] Phil Kim for School Board 2026' row. The money is the only safe discriminator. UNCERTAIN: the filer also wrote 'July' where every committee name says 'June'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Rafael Mandelman for Senate 2028",
    class: "state",
    filerNid: "1460689",
    filerName: "Rafael Mandelman for State Senate 2028",
    confidence: "exact",
    evidence:
      "State committee, not an SF Ethics filer. Present in 3n88-2rrb as filer_name 'Rafael Mandelman for State Senate 2028', filer_id 1460689 (251 rows). The $7,500 Bedford Grove receipt is Mar-May 2025, outside 3n88-2rrb's frozen 2024-cycle window (ends 2025-02-01), so it cannot be reconciled from any published ledger. filerNid here is a STATE filer_id, not an SF filer_nid.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Yes on B, Healthy Vibrant SF Total",
    class: "committee",
    filerNid: "211837252",
    filerName: "Healthy, Vibrant SF, Yes on B",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Healthy, Vibrant SF, Yes on B' (filer_nid 211837252); the filer appended the word 'Total' to a line label; the committee is 'Healthy, Vibrant SF, Yes on B'.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Dean Preston for Supervisor 2024",
    class: "committee",
    filerNid: "208504134",
    filerName: "Dean Preston for Supervisor 2024",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Dean Preston for Supervisor 2024' (filer_nid 208504134).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Healthy Vibrant SF",
    class: "committee",
    filerNid: "211837252",
    filerName: "Healthy, Vibrant SF, Yes on B",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Healthy, Vibrant SF, Yes on B' (filer_nid 211837252); measure-less short form of the registered name.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Michael Alioto-Pier for DCCC",
    class: "committee",
    filerNid: "208865143",
    filerName: "MICHELA ALIOTO-PIER FOR DEMOCRATIC COUNTY CENTRAL COMMITTEE 2024",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'MICHELA ALIOTO-PIER FOR DEMOCRATIC COUNTY CENTRAL COMMITTEE 2024' (filer_nid 208865143); first-name typo: no Michael Alioto-Pier exists; 'MICHELA ALIOTO-PIER FOR DEMOCRATIC COUNTY CENTRAL COMMITTEE 2024' is the only DCCC committee of that surname and matches the filing's Mar 2024 reporting period.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Phil Kim for School Board",
    class: "committee",
    filerNid: "214769736",
    filerName: "Kim for School Board June 2026",
    confidence: "uncertain",
    evidence:
      "Nathan Allbee's only Kim payer in pitq-e56w is filer_nid 214769736 'Kim for School Board June 2026' ($19,799.16 over 9 rows, against $17,500 reported across his three Kim strings; it is also the only Kim filer with substantial activity, 67 EXPN rows). The registry is genuinely ambiguous here: THREE near-identical 2026 Kim school-board committees exist, two of them sharing the IDENTICAL filer_name 'Kim for School Board June 2026' and the identical fppc_id 1483649 (214769736 candidate_name 'Kim, Phil'; 214769651 candidate_name 'Kim, Phillip', which has no pitq activity at all), plus 214769397 'Kim for School Board 2026' (candidate_name 'Lim, Phil') and a junk '[delete] Phil Kim for School Board 2026' row. The money is the only safe discriminator. UNCERTAIN: the same three-way registry ambiguity applies to this string.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Miyamoto for Sheriff 2024",
    class: "committee",
    filerNid: "208440318",
    filerName: "Miyamoto for Sheriff 2024",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Miyamoto for Sheriff 2024' (filer_nid 208440318).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "J.R. Eppler for District 10 Supervisor 2026",
    class: "committee",
    filerNid: "214577156",
    filerName: "J.R. Eppler for Supervisor 2026",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'J.R. Eppler for Supervisor 2026' (filer_nid 214577156); the registered name omits the district; MJE Strategies reports this string and is paid $14,972.87 by 214577156.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Matt Dorsey for Supervisor 2026",
    class: "committee",
    filerNid: "215579031",
    filerName: "Matt Dorsey for Supervisor 2026",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Matt Dorsey for Supervisor 2026' (filer_nid 215579031).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Michael Nguyen for Supervisor 2026",
    class: "committee",
    filerNid: "214884831",
    filerName: "Michael Nguyen for Supervisor 2026",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Michael Nguyen for Supervisor 2026' (filer_nid 214884831).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Stephen Martin-Pinto for Supervisor 2024",
    class: "committee",
    filerNid: "208395017",
    filerName: "Stephen Martin-Pinto for Supervisor 2024",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Stephen Martin-Pinto for Supervisor 2024' (filer_nid 208395017).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Phil Kim",
    class: "candidate-only",
    confidence: "exact",
    evidence:
      "Bare candidate name; 4c8t-ngau holds two near-identical Kim school-board committees plus a '[delete]' row. Not guessed even though the same consultant's committee-named Kim strings resolve by money.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "J.R. Eppler for Supervisor 2026",
    class: "committee",
    filerNid: "214577156",
    filerName: "J.R. Eppler for Supervisor 2026",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'J.R. Eppler for Supervisor 2026' (filer_nid 214577156).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Mark Farrell for Proposition D",
    class: "committee",
    filerNid: "211027210",
    filerName: "Mayor Mark Farrell for Yes on Prop D",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Mayor Mark Farrell for Yes on Prop D' (filer_nid 211027210); descriptive form of 'Mayor Mark Farrell for Yes on Prop D'; the sibling candidate committee 210489481 is reported separately by the same consultants.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "San Francisco Parent PAC",
    class: "committee",
    filerNid: "10944875",
    filerName: "San Francisco Parent PAC",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'San Francisco Parent PAC' (filer_nid 10944875).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Paul Miyamoto",
    class: "candidate-only",
    confidence: "exact",
    evidence:
      "Bare candidate name on a Termination Report ($738.80); 4c8t-ngau holds both 'Miyamoto for Sheriff 2024' and a Paul Miyamoto officeholder account. Not guessed.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Bilal Mahmood for Supervisor 2024",
    class: "committee",
    filerNid: "209865652",
    filerName: "Bilal Mahmood for Supervisor 2024",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Bilal Mahmood for Supervisor 2024' (filer_nid 209865652).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Gary McCoy for Supervisor",
    class: "committee",
    filerNid: "214783692",
    filerName: "Gary Mc Coy for Supervisor 2026",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Gary Mc Coy for Supervisor 2026' (filer_nid 214783692); 4c8t-ngau spells the surname open, 'Gary Mc Coy for Supervisor 2026'; it is the only Gary McCoy committee of this cycle.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Our Neighborhood, Our Future, the Campaign to Recall Joel Engardio",
    class: "committee",
    filerNid: "212570183",
    filerName: "Our Neighborhood, Our Future",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Our Neighborhood, Our Future' (filer_nid 212570183); fourth descriptive suffix on the registered name.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Stand Up for SF sponsored by labor organizations",
    class: "committee",
    filerNid: "214966146",
    filerName: "Yes on D - Stand Up for SF sponsored by labor organizations",
    confidence: "inferred",
    evidence:
      "Token match to 4c8t-ngau filer_name 'Yes on D - Stand Up for SF sponsored by labor organizations' (filer_nid 214966146); the registered name leads with 'Yes on D - '; same committee as the 'Stand Up For SF' string, which CliffordMoss is paid $502,322.22 by.",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Team Manny, Manny Yekutiel for Supervisor 2026",
    class: "committee",
    filerNid: "217128861",
    filerName: "Team Manny, Manny Yekutiel for Supervisor 2026",
    confidence: "exact",
    evidence:
      "Exact filer_name match in 4c8t-ngau: 'Team Manny, Manny Yekutiel for Supervisor 2026' (filer_nid 217128861).",
    reviewedAt: '2026-08-18',
  },
  {
    clientString: "Theo Ellington",
    class: "candidate-only",
    confidence: "exact",
    evidence:
      "Bare candidate name ($0 reported, twice); the same consultant separately reports 'Theo Ellington for Supervisor 2026'. Not guessed.",
    reviewedAt: '2026-08-18',
  },
];
