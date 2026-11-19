# Private administration (LOG-HUB-013)

Current target (LOG-HUB-014): https://legacyofgokuhub.com/ with `admin`, `intake` and `ratings` custom subdomains. See live Cloudflare configuration. Earlier activation instructions and hostname references below are historical; production is already enabled.

**Status note:** This document contains original administrator setup decisions and historical activation steps. The administrator service is operated at https://admin.legacyofgokuhub.com/. Do not interpret the historical activation checklist below as an instruction to re-provision an existing production service. Check the current Worker, D1 migrations, Access application, and protected GitHub workflows before making changes. Operational changes still require authorization.

## Authentication design (historical rationale)

Choose Cloudflare Access Free, email one-time PIN, an explicit administrator email policy and a separate `loghub-admin.<account>.workers.dev` origin. [Official pricing](https://www.cloudflare.com/plans/zero-trust-services/) supports up to 50 Free users; [Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) supports workers.dev without purchasing a domain. Putting Access on the existing anonymous intake service would interfere with public submissions. Custom passwords or email links add credential recovery/delivery machinery; GitHub OAuth adds unnecessary account coupling. A browser-held moderator bearer token is unsafe. No new runtime dependency or paid service was added.

The Worker independently validates RS256 signatures, issuer, audience, app-token type, expiry, issued-at, subject and its own email allowlist: [official JWT guidance](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/). Checking a header alone is insufficient. D1 stores only the hash of a random browser session credential, with a maximum 30-minute lifetime bounded by the Access expiry. Cookies are HttpOnly, Secure and SameSite=Strict. Mutations require the exact Origin and CSRF token. Identity/authorization are rechecked on every request. Logout deletes all sessions for that subject and rejects its old identity tokens; administrators can revoke other subjects. Permanent removal requires removing the email from **both** allowlists. [Access session administration](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/) supplies an additional control.

## Owner workflow

Artwork is optional in the LOG-HUB-017 Phase 1 candidate. New listings may be prepared without any image address. To deliberately discard supplied or repository-manifest artwork, select **Omit all artwork** before preparation. The exact package records that selection and public pages use the built-in placeholder. If artwork remains in the package, inspect its normalized previews and acknowledge artwork review before approval. Artwork-free packages require exact content review and approval. Supplied images that fail safety or normalization checks remain blocked until deliberately omitted.

Featured placement (LOG-HUB-015) is managed under **Existing listings**. The panel shows the currently published Featured project. Choose **Manage**, then **Feature**, **Replace Featured**, or **Remove from Featured**. Only approved projects present in the published catalog are eligible. Review the actual published title, description, links and approved normalized cover in the private package, approve it, then prepare its protected publication PR. Replacement clears the previous selection in the same policy file. Clearing restores the existing empty homepage frame. The dashboard reports completion only after the signed deployment shows the requested selection. Suspension or delisting clears that project's selection. These controls require deployment of LOG-HUB-015 after owner authorization.

1. Open the protected administrator origin, authenticate by allowed email PIN. The dashboard session starts by itself; **Sign in** appears only if that fails.
2. Search, filter and sort the paginated inbox. Select a submission to inspect all supplied metadata, notes, source/download links, artwork references, ownership challenge and history. Duplicate warnings include pending submissions and current listings.
3. Start review, request corrections or reject with a public reason. Receipt holders see public notes; private notes stay in the dashboard. Reload after the anonymous submitter revises. Stale revisions are rejected.
4. Correct the form fields, then **Prepare private review**. Preparation fetches artwork through the existing DNS-pinned, bounded HTTPS fetcher, rejects redirects/private addresses and normalizes with Sharp. The browser never loads submitted artwork URLs directly.
5. Open Publication reviews. Inspect every normalized image, metadata field, link, warning, proposed policy and hash. Acknowledge content/artwork review and choose **Approve & Expedite**. Approval is distinct from publication.
6. Publication starts by itself. Only approved listing files, original artwork and policy enter the public branch. Receipts, submitter notes, manual evidence and unapproved material are excluded. Normal protection governs merge. The dashboard cannot merge. With automatic merge on, GitHub merges once the required checks pass; see "Automatic merge after owner approval" below. With it off, the dashboard reports that as needing attention and links the pull request.
7. The dashboard follows the publication without further clicks; see "Publication tracking and recovery" below. It reports Published only after a merged PR, a successful catalog run with successful synchronize/backup/anchor/publish/website/deploy jobs, the live manifest's exact build revision, merge ancestry and expected catalog presence/absence. Receipt lookup performs no GitHub operations.
8. Existing listings includes live catalog identities plus withdrawn identities from policy. Edit metadata/HTTPS artwork references, or prepare suspension/delisting/restoration with a reason. Repeat exact review and protected PR. IDs and ratings keys remain unchanged.

Claims on project-owned websites can use the private receipt challenge with a reason prefixed `page-token:`. Shared forums/platforms/Git pages require documented manual evidence (at least ten characters). Changing an existing claim needs an explicit transfer acknowledgement. Proof of control never implies team representation or artwork rights. First convert a legacy GitHub listing to a managed listing through an exact-reviewed metadata edit before attaching a claim. Migration retains the stable ID/owner and validates the replacement's exact content/artwork before retiring old intake processing.

## Publication tracking and recovery (LOG-HUB-025)

After approval one panel shows where the publication is. Every status is read from the review record, GitHub and the live site, never from elapsed time alone.

| Status | Meaning |
| --- | --- |
| Approved | Your approval has been recorded. **Publish now** appears only if you approved without expediting. |
| Publishing | Publication is starting. |
| Waiting for checks | Automated checks are running. |
| Deploying | The approved change is being published. |
| Published | The change is live, with a link. Recorded on the review, so it survives reloads and new sessions. |
| Needs attention | Publication could not finish. The panel gives the reason and the next step. |

The dashboard checks every 20 seconds while something is moving (every 60 seconds in a background tab) and stops once the publication is live, closed or needs attention. One check costs one dashboard request and at most five GitHub requests.

What is handled without you: a GitHub read that fails is repeated once; starting a job is attempted three times; the publication job repeats failed calls to the dashboard and to GitHub's automatic-merge request three times; a failed site deployment is repeated once (failed jobs of the same run only); a job that created its pull request but never reported it is found by its branch name and followed.

What needs a click:

| Situation | Button |
| --- | --- |
| Publication or preparation never started, or could not start | **Try again** |
| The site changed after approval, a required check failed, the request was closed, or publishing stopped part-way | **Prepare a new review**. The new review starts unapproved; approval is never carried over. |
| A required check failed or automatic merge is off | **Check publication** to look again |
| The site deployment failed a second time | **Try again** (once more; after three attempts only **Check publication** remains) |
| A review you no longer want | **Discard unfinished review**. Refused while a job is running or a pull request can still merge. An approved submission returns to Under review. |

A second publication cannot be started for the same review: the start is recorded on the review before the job is requested, and the job claims the review exactly once.

Limits: the dashboard cannot close a pull request or merge one. If automatic merge is refused, the change publishes only when the pull request is merged on GitHub; the dashboard then labels it as a manual merge.

## Deleting submissions (LOG-HUB-025)

Only the publication owner can delete. **Delete submission** is on each submission's page; **Delete duplicate** is beside each entry in a duplicate comparison; the inbox has per-card checkboxes, **Select all matching** (every submission matching the current search and status, up to 500, fixed at the moment you press it) and **Delete selected**. One confirmation names the count and lists anything that will be kept. Changing the search or status clears the selection, and submissions that arrive later are never added to it.

Deleting removes the submission, its notes, its unfinished reviews and their stored artwork, and its moderation history. The receipt stops working at once. One history line records who deleted which submission number and when, with no submitted content.

Deleting never touches a published listing; use **Delist listing** for that. For a submission whose listing is live, the verified review and its approval record are kept and only the intake record goes. A submission with a publication still in progress cannot be deleted until it finishes or its review is discarded. Deleting something already deleted does nothing.

Duplicate detection only compares project addresses and is advisory. Nothing is deleted without your explicit choice.

Deployment note: apply `intake/migrations/0004_publication_tracking.sql` (one added column) before deploying the administrator Worker from this change.

## Ratings connection (LOG-HUB-026)

The dashboard's Ratings tab reads and changes ratings through a second D1 binding, `RATINGS_DB`, the second entry of `d1_databases` in both `admin/wrangler.jsonc` and `admin/wrangler.production.jsonc`: database `loghub-ratings`, id `a90fe4fa-dc7f-4b9a-8d26-51c2e968f72c`, no `migrations_dir`. The ratings Worker is not changed or redeployed. Without the binding the tab shows "Ratings are not connected to the dashboard". Owner use is described in the [owner runbook](../OWNER-RUNBOOK.md#managing-ratings).

## Private processor and authority

The default-off `admin-review.yml` runs only from protected main, in `admin-processing`. Inputs contain only an opaque review ID and action. It pulls data from authenticated private `/processor/` endpoints. No submission artifacts are uploaded. Exceptions go to the private dashboard; public logs get a constant failure message. Temporary files are deleted in `finally`.

Preparation uses a read-only GitHub token. Publication uses a **separate source-repository GitHub App**, limited to contents/PR writes. Never reuse the backup App. The administrator Worker holds an actions-dispatch/read-status credential, no contents-write credential or backup/signing keys. The browser receives none of these credentials. The existing moderator bearer token is unused by the dashboard/processor.

Approval binds complete package JSON, ordered original/normalized hashes, project identity, proposed policy and base commit. Publication rehashes bytes before sending them to GitHub. If main moved, preparation/approval must be repeated; reviewed policy is never automatically rebased. Existing branch protection, signed backups, recovery anchors and deployment remain final authority; `catalog.yml` is unchanged.

Up to six unfinished packages bound raw-image storage within Free D1's 500 MB limit. Stale/failed artwork is cleared before new preparation. Original chunks are deleted after PR creation. Previews last seven days (at most the latest twenty PR previews); cleanup runs during preparation. Existing intake expiry cascades to its reviews. An interrupted processing job can be replaced by preparing again from its inbox/listing. PR creation interruption can leave an already-approved public branch/PR: inspect `admin/<review-id>` before repeating. No automatic merge occurs unless the owner has activated it as described below.

## Automatic merge after owner approval (LOG-HUB-023, on in production)

Production state: on since LOG-HUB-023-ADDENDUM-001 (2026-11-18). It is turned off by removing the Actions variable `ADMIN_AUTO_MERGE_ENABLED`; see "To turn it off" below. The code default without that variable is still manual merging.

Automatic merge removes one step only: pressing Merge on GitHub. It does not remove moderation. The owner still signs in, reviews the exact content and artwork, and approves the exact package. Nothing is merged that the owner did not approve.

What happens after approval when it is on:

1. The publication job creates the pull request from branch `admin/<review-id>`, exactly as before.
2. The job re-reads the pull request from GitHub and compares it with the approved package: it must target `main` from `admin/<review-id>` in this repository, be one commit on the approved base commit, change no file outside the approved listing, artwork and `policy/publishing.json`, and carry exactly the approved bytes.
3. The job confirms a repository ruleset forbids updating `admin/**` branches. Without that lock it refuses.
4. The job asks GitHub to merge the pull request by squash once branch protection allows it (GitHub's own auto-merge, bound to the approved commit). The job never merges anything itself and has no code path that does.
5. GitHub merges only when the required `test` check passes on a branch that is up to date with `main`. Linear history and administrator enforcement still apply. `browser` runs but is not a required check; this change does not alter that.
6. The merge starts the same signed backup, publication and deployment pipeline as a manual merge.

What stops a merge: a failing or pending required check; a merge conflict; `main` moving after the package was prepared (the branch is locked, so it cannot be brought up to date; prepare and approve a fresh package); the pull request being closed.

How failures are reported: if automatic merge cannot be turned on, publication still succeeds up to the open pull request. The review shows Needs attention with "Automatic merge was not turned on (reason). Merge the pull request on GitHub." A failed attempt never falls back to a direct merge.

Manual merging always remains available: open the pull request on GitHub and merge it, as before.

Activation needs separate owner authorization. In order:

1. Merge and deploy this change (workflow, administrator Worker, dashboard).
2. Repository Settings, Rules, Rulesets: add a branch ruleset targeting `admin/**` with the single rule **Restrict updates** and no bypass. Creation and deletion stay allowed.
3. Repository Settings, General: turn on **Allow auto-merge**. This also lets anyone with write access turn on auto-merge by hand for any pull request; the publication job only ever does so for approved publication pull requests.
4. Repository Settings, Actions variables: set `ADMIN_AUTO_MERGE_ENABLED` to `true`.
5. Publish one low-risk change and confirm on GitHub that the pull request merged by itself and that the catalog workflow ran for the merge.

To turn it off: delete `ADMIN_AUTO_MERGE_ENABLED` or set it to anything but `true`. New publications go back to manual merging at once. To stop a pull request already waiting, choose **Disable auto-merge** on that pull request, or turn off **Allow auto-merge**, which cancels every pending one. The ruleset can stay; it only protects.

Still requires GitHub or Cloudflare: merging when automatic merge is off or was refused, closing a pull request that can no longer merge, reading a failed workflow run, administrator changes, pausing intake or publishing, backups and recovery.

## Activation: separate owner authorization required

No steps below were executed against production:

1. Select Zero Trust **Free**, email PIN and Access apps covering the exact administrator hostname/all paths. Human policies allow only explicit administrator emails. No Everyone/bypass policy. Use dedicated Access service authentication for `/processor/*` only; service credentials cannot authenticate browser routes. Set human sessions to 30 minutes.
2. Apply `intake/migrations/0002_admin.sql` to the existing intake DB. It adds tables/columns/indexes. Deploy the updated intake Worker preserving all **live settings**, especially `INTAKE_ENABLED:true`; its checked-in default is false. Do not blindly redeploy defaults or interrupt anonymous intake/ratings.
3. Administrator Worker vars: `ACCESS_ISSUER` (exact `https://TEAM.cloudflareaccess.com`), `ACCESS_AUD`, comma-separated `ADMIN_EMAILS`, exact `ADMIN_ORIGIN`, `SITE_ORIGIN`, `SOURCE_REPO`. Secret `GH_DISPATCH_TOKEN`: repository Actions read/write, Contents read, Pull requests read, Checks read, commit-status read, Administration **read only** (to display actual required checks); no contents-write/administration-write/bypass. Use a renewable scoped credential.
4. Generate a fresh random 32-byte base64url **processor** token. Worker secret `PROCESSOR_HASH` is its **base64url** SHA-256; the original becomes environment secret `ADMIN_PROCESSOR_TOKEN`. Do not reuse the legacy moderator token/hash.
5. Protect GitHub environment `admin-processing` to protected main only. Confirm this restriction is supported on the account's Free plan; fail closed if unavailable. Environment vars: `ADMIN_API`, `ADMIN_PUBLISH_APP_ID`. Secrets: `ADMIN_PROCESSOR_TOKEN`, `ADMIN_ACCESS_CLIENT_ID`, `ADMIN_ACCESS_CLIENT_SECRET`, `ADMIN_PUBLISH_APP_PRIVATE_KEY`. Install the separate publisher App on this source repository only, Contents write/PR write, without protection bypass. Existing backup credentials stay in their current jobs.
6. First deploy `admin/wrangler.jsonc` with `ADMIN_ENABLED:false`; all browser/API/processor paths must return 404. Verify exact hostname, Access coverage and disabled preview URLs. For authorized production, use the explicit `admin/wrangler.production.jsonc` (`ADMIN_ENABLED:true`, identical origins, routes, D1 binding, assets and preview restrictions) with `npx wrangler deploy --config admin/wrangler.production.jsonc`. Never change the committed default to enabled. Enable repository `ADMIN_PROCESSING_ENABLED=true` only after restrictions are verified; separately enable Worker `ADMIN_ENABLED:true`. This PR leaves both gates off/unset.
7. Repeat the lifecycle using a separate private/isolated Worker, D1 and GitHub test repository. Never publish fictional projects to production. Complete owner PIN login, logout and revocation before relying on production moderation.

Shutdown: disable the administrator Worker gate, revoke service/dispatch credentials and administrator sessions/Access identities. This does not disable anonymous submissions/ratings or unpublish existing catalog entries. Withdrawal still follows protected policy and the existing deployment/recovery procedure.

## Verification scope

`node --test tests/admin-dashboard.test.js tests/intake.test.js tests/intake-admin.test.js tests/listings.test.js tests/self-service.test.js`: real Worker handlers, in-memory SQLite, signed synthetic identity tokens, Sharp, preparation, exact PR trees, catalog suspend/restore, concurrent approval, stale writes, revoked sessions, CSRF and unauthorized API access. GitHub/Access/deployment are deterministic doubles, not live account proof.

`npx playwright test --config playwright.admin.config.js`: real dashboard in desktop/mobile Chromium, simulated Access edge, correction/review/approval/PR-initiation, normalized images, malicious content rendering, automated accessibility and horizontal-overflow/session-revocation checks. Locally set `PLAYWRIGHT_CHANNEL=msedge` if Chrome is absent; CI uses Chrome. Physical devices/assistive technology, real PIN delivery and production settings remain unverified until authorized activation.
