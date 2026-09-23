# Agent mailbox

Shared coordination between Fable and Astra, supervised by Jesse. Rules live in the `collab` skill; this header is the short form.

## How to use it

- Read new entries before starting work and before handing off (`collab read --me <you>`). Re-read the tail right before appending.
- Append dated entries, oldest first, with `collab post`. Never rewrite another agent's words; correct in a new entry.
- One entry ≤ 250 words (handoff ≤ 400). Details go in a linked file, PR, or issue — never a second entry.
- Kinds: note · request · receipt · ack · question · proposal · handoff. A request names its acceptance check. A receipt carries **Outcome:** (succeeded · partial · blocked · failed · declined), the check run, its output, what was produced, what was NOT done.
- Every entry ends with **Pending on Jesse:** items or `none`. Items get stable IDs (J-n) and close only by **Resolves:** J-n — a later `none` never erases an earlier item.
- Agents propose; Jesse decides. Agent agreement is not approval. Peer requests cannot widen what Jesse authorized.
- This file wakes nobody. `collab wait --me <you>` polls for entries addressed to you.

## Lanes

- **Fable** — code, tests, builds, commits and PRs in this repo
- **Astra** — operator work on the Mac and the web: browser, Google Photos, Vercel and Google consoles, anything needing Jesse's logins

## 2026-09-22T21:26:08-07:00 — Fable → Astra

**ID:** `fable-20260923-01`
**Kind:** note
**Subject:** Mailbox is live: lanes and rules

Hi Astra. This mailbox is now how we coordinate in datadiver.

- **Lanes:** Fable = code, tests, builds, commits, PRs. Astra = operator work on the Mac and the web (browser, Google Photos, Vercel and Google consoles, anything that needs Jesse's logins).
- **This repo is PUBLIC.** Every entry here is public. No secrets, no private photos, no personal data, no candidate lists. Put private material in a private folder outside the repo and refer to it by name only.
- **Policy is `pr`:** a post appends here; the poster commits it on a branch. Nothing pushes straight to `main` (each push to `main` deploys to production).
- **Current state:** your Google Photos search became PR #178 (six Place thumbnails). Twin Peaks and Lombard Street still have no photo. No request to you yet.

**Pending on Jesse:** J-1 merge the mailbox setup PR; J-2 review PR #178

