# LOG-HUB-027: final production acceptance

Date: 2026-11-19. Scope: verify the deployed system after LOG-HUB-023, 025 and 026, make its configuration durable, and hand it over. No application code was deployed and no genuine record was changed during this work.

## Outcome

**OPERATIONALLY ACCEPTED WITH PENDING EVENTS.**

The owner can run the Hub from the administrator dashboard without an AI agent, GitHub, Cloudflare or a terminal for ordinary tasks. Every check that could be run against production passed, with one exception: a publication review that will stay at Deploying (finding 1). It does not block any task, and its fix (pull request #69) is merged as `82cb7de` and takes effect with the next administrator Worker deploy. Two checks wait for a genuine event.

| Result | Meaning |
| --- | --- |
| PASS | Verified against production |
| PENDING EVENT | Correctly configured, awaiting a genuine publication or other real event |
| BLOCKED | Cannot complete because of a specific permission or operational problem |
| FAIL | Verified defect requiring correction |

Evidence is marked **production** when it was observed on the live services, and **code tests** when it rests on the automated tests and the LOG-HUB-026 review.

## 1. Production deployment inventory

All production evidence.

| Item | Observed | Result |
| --- | --- | --- |
| `main` contains release commit `f98f7fa` | `main` head is `f98f7fa` | PASS |
| Public site, submission page, status page | Each answers 200 | PASS |
| Live site build | `deployment-manifest.json` reports `build_commit` `f98f7fa` | PASS |
| Administrator Worker `loghub-admin` | Version `7ff5cbda` at 100%, deployed 2026-11-19 12:55 UTC | PASS |
| Ratings database binding | `RATINGS_DB` bound beside `DB` on that version | PASS |
| Administrator sign-in wall | Anonymous requests to `/`, `/api/queue` and `/processor` are redirected to Cloudflare Access | PASS |
| Submission Worker `loghub-intake` | Version `86d9cc39` at 100%, deployed 2026-11-19 12:55 UTC; `INTAKE_ENABLED` is `true`; fetch and scheduled handlers | PASS |
| Ratings Worker `loghub-ratings` | Version `3b04340a`, unchanged since 2026-11-16 | PASS |
| Automatic publication merging | Repository allows auto-merge; `ADMIN_AUTO_MERGE_ENABLED` is `true` | PASS |
| Immutable publication branches | Ruleset 27616605 active on `refs/heads/admin/**`, rule `update`, no bypass | PASS |
| Protection of `main` | Required check `test`, up-to-date branch, linear history, enforced for administrators, no force push or deletion | PASS |
| Protected catalogue publication | Latest scheduled `catalog.yml` run 44568351304 succeeded (2026-11-19 16:38 UTC); the run for `f98f7fa` succeeded | PASS |

Nothing was redeployed.

## 2. Authenticated administrator dashboard

Production evidence: the dashboard was opened in the owner's own browser under the owner's existing Cloudflare Access sign-in. No sign-in code was requested, read or handled. Every screen was inspected read-only; nothing was approved, rejected, deleted, changed or published. All requests returned 200 and the browser console showed no errors.

| Area | Observed | Result |
| --- | --- | --- |
| Sign-in | Access let the owner in and the dashboard started its own session with no **Sign in** click. The emailed-code step itself was not exercised, because the Access sign-in was still valid. | PASS |
| Inbox | Three genuine submissions loaded from the real database | PASS |
| Overview | New 3, Waiting on the visitor 0, Ready for review 0, Publishing 1, Needs attention 1. These equal the database: 3 received, 1 publication open, 1 failed. | PASS (see finding 1 for the Publishing item) |
| Details | A submission opened with its Messages block and the visitor's message. No genuine visitor reply exists yet, so the display of replies rests on code tests. | PASS |
| Corrections | The Manage view loaded a live listing's current values into the form. No genuine visitor correction request exists yet; that path rests on code tests. | PASS |
| Publication reviews | The list and each review loaded with current states, previews and pictures. One review is stuck at Deploying. | FAIL, fix prepared (finding 1) |
| Existing listings | Eight listings, the current Featured project, **Manage**, the listing's history and the Featured, Suspend and Delist controls all rendered | PASS |
| Ratings | The real ratings database loaded totals for all eight projects, score counts, a "Worth a look" line, one-time rating groups, "Ratings not being counted" and "Recent ratings actions" | PASS |
| Deletion | **Delete selected**, **Select all 3 matching** and per-card selection are offered to the owner. The confirmation was not opened, to avoid any risk to genuine records; its wording rests on code tests. | PASS |
| Session | Automatic start observed. Renewal after the 30-minute expiry was not reached during the session. | PENDING EVENT |

### Finding 1: a replaced publication stays at Deploying

The review "Legacy of Goku Engine · Make Featured" (merged 2026-11-17) reads Deploying and keeps the Publishing count at one. Another project was made Featured later, and the tracker waits for a home page state that can no longer occur. The same would happen to any change that a later publication replaces before the dashboard has confirmed it. It blocks nothing, but the count is wrong and the owner cannot clear it.

Fix: pull request #69. Once a later publication is verified live, the earlier one is recorded as published. One new test; 35 of 35 tests in the four publication test files pass. It is merged. After an administrator Worker deploy, the stuck review resolves itself with no data edit. The deploy waits for the owner.

### Observation: one failed review is waiting for the owner

Needs attention holds one genuine failed ownership verification from 2026-11-17. It shows "This could not finish. Try again, or discard it." with **Try again**, **Discard unfinished review** and **Back to the submission**. This is the dashboard working as designed, and real evidence that a failure gives a plain message and a safe next action. The owner clears it with **Discard unfinished review**.

## 3. Submission notifications

| Item | Observed | Result |
| --- | --- | --- |
| Cloudflare Email Routing | Enabled, status ready | PASS, production |
| Owner destination | Verified; mail arrives | PASS, production |
| Email binding | `NOTIFY_EMAIL` and `NOTIFY_TO` present on the live version | PASS, production |
| Hourly schedule | Scheduled handler live; last run recorded 2026-11-19 16:17 UTC | PASS, production |
| Count-change logic | The stored count is 3 and equals the number of new submissions, so later runs correctly sent nothing | PASS, production |
| Real scheduled delivery | "3 submission(s) waiting for review" arrived in the owner's inbox at 13:17:58 UTC on 2026-11-19, from the first scheduled run after the deploy. This is the real scheduled path, separate from the earlier delivery test. | PASS, production |
| Failure handling | A failed send leaves the stored count unchanged, so the next hour tries again | PASS, code tests |

No submission was manufactured.

## 4. Durable notification configuration

The private settings file now lives at `%LOCALAPPDATA%\loghub-private\intake\wrangler.private.jsonc`, outside every working folder, byte-identical to the file used for the live deploy. It is not in the repository and holds the only private value, the owner's address.

Recovery was proven without the LOG-HUB-026 working folder: a clean export of `main` plus the private file, then `wrangler deploy --dry-run`, listed `NOTIFY_EMAIL`, `NOTIFY_TO` and every other binding of the live version. If the file is lost, the runbook describes how to write it again. The procedure is "Deploying an approved change" in the [owner runbook](../../OWNER-RUNBOOK.md#deploying-an-approved-change). The old copy in the LOG-HUB-026 folder was left in place; that folder can now be removed safely.

Result: PASS.

## 5. First automatic publication

PENDING EVENT. No genuine owner-approved publication was available, and none was fabricated.

What production already proves: eight publication pull requests created by the publisher app have merged and published through `catalog.yml`, all before automatic merge was turned on. What is still unproven until the first real approval: that the publisher app's request to turn on automatic merge is accepted, that the merge it arms starts `catalog.yml`, and that the dashboard reaches Published with no click.

The owner's procedure is "The first automatic publication" in the [operational handoff](../../HANDOFF.md#the-first-automatic-publication).

## 6. Recovery readiness

Each situation has a plain dashboard message and a safe next action, and every message quoted in the runbook's "When something fails" table was found word for word in the deployed source. Nothing was broken on purpose.

| Situation | What the owner sees and does | Evidence |
| --- | --- | --- |
| Failed GitHub request | Repeated once by itself; then "The publication status could not be checked." with **Check publication** | Code tests |
| Automatic merge not turned on | "Automatic merge was not turned on" or "is off for this change"; merge that pull request on GitHub | Code tests, and the LOG-HUB-023 drill in a disposable repository |
| Stalled preparation or publication | The 5 and 15 minute messages with **Try again** or **Discard unfinished review** | Code tests |
| Required check failed | The check is named; **Check publication** or **Prepare a new review** | Code tests |
| Failed site deployment | Repeated once by itself; **Try again** up to three attempts; then the runbook's last section | Code tests |
| Approval out of date | A fresh preview is prepared once by itself; nothing is published until it is approved | Code tests |
| Failed notification | Tried again the next hour; the dashboard counts stay right | Code tests; delivery itself is production |
| Failed database access | "Administration unavailable; retry later"; reload, and after an hour follow "The dashboard stays unavailable" | Code read. This message was missing from the runbook and has been added. |
| A failed review | Plain message with **Try again**, **Discard unfinished review**, **Back to the submission** | Production (the observation above) |

Recovery of a real failed publication has only been exercised against test doubles for GitHub. That remains true until a real failure happens; the runbook covers each case.

## 7. Release defects

| Item | Finding | Action |
| --- | --- | --- |
| Administrator deploy prints "Could not find zone" | The version is uploaded and serving before that message; it comes from wrangler's route step. It could not be reproduced without a deploy, which this work was not allowed to make. | Documented in the runbook with the check that tells the truth (`wrangler deployments list`). No code change. |
| Featured labels differ between the card and the Manage view | Card: **Make Featured**, **Switch Featured to this project**, **Clear Featured**. Manage view: **Feature**, **Replace Featured**, **Remove from Featured**. Both work. | Both sets are now named in the runbook. Unifying them is a wording change that would need its own deploy; not done. |
| Notification configuration depended on a working folder | Resolved | Section 4 |
| Publication recovery tested only with doubles | Still true | Sections 5 and 6 |
| Disposable repository `loghub-automerge-test` | Still exists and is public | Left in place. Deleting a repository cannot be undone, so it is the owner's decision. |
| Stuck Deploying review | New finding from this work | Pull request #69 |

## 8. Owner runbook

Corrected in the same change as this report:

- Notifications are described as on; the obsolete "turning email on" steps are removed.
- "Deploying an approved change" gives the full procedure for both services: the private file and where it lives, the commands, how to confirm the result, the misleading zone message and how to go back.
- "The dashboard stays unavailable" and its row in the failure table are new.
- The Manage view's Featured button names are given.
- "Changing the notification address" replaces the old set-up section.

## 9. Still open

| Item | Status | Who |
| --- | --- | --- |
| Pull request #69 | Merged as `82cb7de`; deploy the administrator Worker | Owner approval |
| First automatic publication | PENDING EVENT | Owner, at the next real approval |
| Session renewal after expiry | PENDING EVENT | Seen in normal use |
| Failed review in Needs attention | Press **Discard unfinished review** | Owner |
| `loghub-automerge-test` | Delete if no longer wanted | Owner |

The administration-development initiative is closed. What remains is routine maintenance and catalogue growth.
