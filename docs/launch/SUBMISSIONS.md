# Universal project submissions (LOG-HUB-012)

Current target (LOG-HUB-014): https://legacyofgokuhub.com/ with `admin`, `intake` and `ratings` custom subdomains. See live Cloudflare configuration. Earlier activation instructions and hostname references below are historical; production is already enabled.

Anyone can suggest, add, correct or claim a project at [the public submission form](https://legacyofgokuhub.com/submit/) without a GitHub account, a Git repository, public source code or registration. The checked-in Worker configuration retains a safe default-off setting; production enablement must be checked against live configuration, not assumed from that default. Historical first-activation steps below are retained for reference and must not be repeated blindly.

## What changed

- Native `/submit/` page: URL first, optional details folded away, four actions (Add, Suggest, Correct, Claim), review step, receipt, and `/submit/status/` for follow-up.
- Listings with hub-assigned IDs `ext-` plus 12 characters for projects with no GitHub repository. Existing `gh-<repoId>` IDs and ratings are unchanged.
- Source-aware labels: View Repository (Git hosts), Visit Project (everything else), Download Patch (only a moderator-approved HTTPS distribution). The hub never hosts ROMs.
- Duplicate detection by normalized address across hosts, suggesters and host moves.
- GitHub Issue Forms and `.loghub.json` manifests remain in the repository as advanced routes. The website does not link to them. Hosted manifests also work on gitlab.com and codeberg.org.

## Private intake service

`intake/` is a separate Cloudflare Worker plus D1 database (Free plan). It stores only a hash of each receipt, applies Turnstile, a honeypot field, per-network rate limits and a pending cap (`MAX_PENDING`), and returns 503 while `INTAKE_ENABLED` is `false`.

Activation (owner decision, not done by this change):

1. `wrangler d1 create loghub-intake`, put the id in `intake/wrangler.jsonc`, then `wrangler d1 migrations apply loghub-intake --remote`.
2. Make a moderator token with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` and keep it private. Secrets: `TURNSTILE_SECRET`, `RATE_SALT`, and `ADMIN_HASH`, the base64url SHA-256 of that token: `node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('base64url'))" TOKEN`. Automatic claim proof works only for project-owned websites; forum, platform and Git claims are verified manually.
3. Deploy the Worker, set `INTAKE_ENABLED` to `"true"`.
4. For the protected production website build, set repository variables `INTAKE_API_ORIGIN=<worker origin>` and `TURNSTILE_SITE_KEY=<public site key>`. After the Worker has passed live checks, set `INTAKE_ENABLED=true` and dispatch `catalog.yml` on protected `main`. The workflow maps these to Astro's `PUBLIC_INTAKE_API`, `PUBLIC_TURNSTILE_SITE_KEY` and `PUBLIC_INTAKE_ENABLED` settings. Until then, leave `INTAKE_ENABLED` absent/false; the Submit page stays up, says submissions are not open yet, and sends nothing.

## Moderator workflow

**Superseded by the dashboard, see the [owner runbook](../OWNER-RUNBOOK.md).** The command-line moderator below is kept for reference only.

Set `INTAKE_API` and `INTAKE_ADMIN_TOKEN`, then `node tools/intake/moderate.js`:

| Command | Purpose |
| --- | --- |
| `queue`, `show ID` | Review pending submissions |
| `prepare ID DIR` | Fetch metadata and artwork through the SSRF-safe fetcher into a private directory |
| `adopt DIR [--approve]` | Move the reviewed listing into `listings/` and optionally record the exact content and artwork approval in policy |
| `claim-check ID LISTING [--apply]` | Verify the page-token challenge `loghub-claim-...` on the project's own page |
| `claim-manual ID LISTING --reason TEXT` | Record an out-of-band verification |
| `status LISTING suspended\|delisted\|approved\|review` | Suspend, delist or restore |
| `decide ID state` | Set the visitor-facing state and note |

Approval is always a human, signed-pipeline step: an unapproved or changed content digest or artwork set keeps the listing out of public artifacts. A claim that changes the proof digest needs `--transfer`. A repository file proves repository control, not team authority; third-party suggestions never grant ownership.

## Verification

`node --test` covers listings, intake Worker, moderator tooling, recovery and a generated project page. `npm run test:browser` covers the submit journeys (receipt, validation, duplicates, claim, status, mobile, axe). Status is never color-only: each state has a glyph and text.

## Live deployment record

- Worker `loghub-intake` at https://loghub-intake.siruiusamory.workers.dev, D1 `loghub-intake` (`7f30d601-b245-4384-95de-792b0b5ed48f`, WNAM), Turnstile widget `loghub-submissions` for `loghub.pages.dev`.
- The committed `INTAKE_ENABLED` stays `"false"`. The live gate was turned on at deploy time: `wrangler deploy --config intake/wrangler.jsonc --var INTAKE_ENABLED:true`. Redeploy with the same flag or the gate closes.
- Repository variables `INTAKE_ENABLED`, `INTAKE_API_ORIGIN` and `TURNSTILE_SITE_KEY` feed the protected website build. To roll back, set `INTAKE_ENABLED` to `false` and dispatch the catalog workflow; the Submit page then says submissions are not open and sends nothing. The website no longer links to the GitHub Issue Forms.
- Secrets live only in the Worker and a private local folder. Rotate by re-running `wrangler secret put`.
- `ADMIN_ORIGIN` (`https://admin.legacyofgokuhub.com`) is a committed variable in `intake/wrangler.jsonc`. The owner notification email links to it.
- Owner notification email uses the `send_email` binding `NOTIFY_EMAIL` (with `destination_address`) and the variable `NOTIFY_TO`, both holding the owner's verified Email Routing address. Neither is committed. The private configuration is kept outside every checkout at `%LOCALAPPDATA%\loghub-private\intake\wrangler.private.jsonc` and copied to `intake/wrangler.private.jsonc` (listed in `.gitignore`) at deploy time. It is the committed `intake/wrangler.jsonc` plus `"send_email": [{"name": "NOTIFY_EMAIL", "destination_address": "<owner address>"}]` and `"NOTIFY_TO": "<owner address>"` under `vars`. Deploy it with `npx wrangler deploy --config intake/wrangler.private.jsonc --var INTAKE_ENABLED:true`. Without the binding, `NOTIFY_TO` or a valid `ADMIN_ORIGIN`, no mail is sent and everything else works. Live since 2026-11-19 as version `86d9cc39`; the first scheduled email arrived at 13:17 UTC that day. The full procedure is "Deploying an approved change" in the [owner runbook](../OWNER-RUNBOOK.md#deploying-an-approved-change).
- The hourly cron sends one count-only email ("N submission(s) waiting for review" plus `ADMIN_ORIGIN`) when the number of `received` submissions rises. The last notified count is the `limits` row `notify:received`, written only after a successful send or when the count did not rise, so a failed send is retried the next hour. Cloudflare's Email Routing summary lists these sends as "dropped" even when they are delivered.
- Automated browsers usually fail the Turnstile check, so live end-to-end tests need a person to tick the box.
