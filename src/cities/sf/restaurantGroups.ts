// AUTHORED DATA — curated "same restaurant group" claims for Behind the
// Storefront (spec §3.8, D9, §11). Type-only import; a pure data leaf.
//
// WHAT A ROW HERE MEANS. The view publishes two different things about
// ownership, and only this file may make the second one:
//   · the FACT, automatic: "These N companies list the same mailing address
//     on their city registrations." (ownerGroups.sharedMailingAddresses,
//     after filters F1–F5, company-only addresses.)
//   · the CLAIM, curated here: these companies are ONE restaurant group. A
//     mailing-address cluster is right only ~77% of the time (F §3) —
//     accountants, registered agents and incubators share addresses too — so
//     no algorithm output ever becomes a claim without a row in this file.
//
// HOW A ROW GETS HERE. The generator writes every surviving mailing-address
// cluster to the gitignored review queue (scripts/out/restaurant-groups-
// queue.json — it holds people's names and possibly home addresses, gate
// G7). A human checks a cluster against at least one OTHER public source and
// writes the row. First candidates (F §3): 2020 Union St (Super Duper,
// Beretta, Delarosa), 460 Grove St (Souvla), 25 Division St (Dumpling Time
// family), 470 Pacific Ave, 244 Kearny St. Split mixed clusters (950 Mason
// mixes McDonald's franchise LLCs with the Fairmont).
//
// SCHEMA (CuratedGroup, src/lib/storefronts/types.ts), enforced by gate G6
// (ownerGroups.validateCuratedGroup) in the generator AND restaurantGroups.test.ts:
//   id         lower-case slug, unique — the `?group=` value
//   label      reader-facing, BY BRANDS, never by a person or an address:
//              "Super Duper, Beretta, Delarosa +10"
//   brands     trade names, as the public knows them
//   companies  2+ registered owner names, exactly as the registry spells them
//   evidence   ≥ 2 DISTINCT kinds from: registry-mailing-address,
//              shared-trade-name, group-website, abc-licensee-address,
//              sos-agent-address — each with an https url a reader can
//              follow, the YYYY-MM-DD it was checked, and one plain sentence
//              saying what it shows. Never the retired legacy DataSF host
//              (data.sf.gov only — portalHost.test.ts).
//
// Wording stays "restaurant group", never "hidden owner" (banned copy).
//
// Ships EMPTY on purpose (Jesse, 2026-09-24: ship now; claims may be empty).
// The Owners tab's "Same restaurant group" section hides while this is [].

import type { CuratedGroup } from '../../lib/storefronts/types'

export const RESTAURANT_GROUPS: readonly CuratedGroup[] = []
