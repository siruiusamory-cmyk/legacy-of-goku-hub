# Operational handoff

The administration work is finished. The Hub now runs from the administrator dashboard at https://admin.legacyofgokuhub.com. This page says what you do, what happens by itself, what is rare, and what has not yet been seen once in production. The step-by-step instructions are in the [owner runbook](OWNER-RUNBOOK.md).

## Daily operation

1. An email titled "N submission(s) waiting for review" tells you when new work has arrived. No email means nothing new.
2. Open the dashboard. Work the counts in this order: Needs attention, Ready for review, New submissions.
3. For each submission: start the review, then ask for corrections, reject it, or prepare a preview and approve it.

That is all. You do not need GitHub, Cloudflare or a terminal for any of it.

## Automatic operation

- **Publishing.** After you approve, the change is checked, merged, published and confirmed live without you. The dashboard shows each stage and ends at Published.
- **Notifications.** The Hub checks once an hour, at 17 minutes past, and emails you when the number of new submissions rises.
- **Clean-up.** Untouched open submissions are removed after 90 days, rejected ones after 30 days, unfinished previews after seven days.
- **Repeats.** A failed read from GitHub is repeated once, starting a job is tried three times, and a failed site deployment is repeated once.
- **The catalogue.** It is synchronised, backed up and republished on a schedule and after every merge.

## Exceptional operation

Each of these is rare and is written out in the last section of the runbook:

- Automatic merge was refused for one change: merge it on GitHub.
- An approval can no longer be published: close the old pull request on GitHub after approving the new preview.
- Pausing submissions, ratings or publishing.
- Adding or removing an administrator.
- Excluding one chosen browser from ratings, or repairing or restoring ratings.
- Restoring the catalogue from backup.
- The dashboard stays unavailable for more than an hour.

## Maintenance

- **Deploying.** The public site deploys itself. The submission service and the dashboard are deployed by hand after a merged change touches them. The commands, the check that the deploy worked and the way back are in "Deploying an approved change" in the runbook.
- **The one private file.** Your notification address is kept out of the public repository, in `%LOCALAPPDATA%\loghub-private\intake\wrangler.private.jsonc`. It does not live in any working folder, so deleting old working folders is safe. If it is lost, the runbook says how to write it again; your address is its only private part.
- **Secrets.** The services' secrets are stored in Cloudflare and survive every deploy. Nothing needs to be re-entered.
- **Protections that must stay as they are.** The `main` branch requires the `test` check, an up-to-date branch and linear history, for administrators too. Publication branches (`admin/**`) cannot be changed once created. Automatic merge is on through the Actions variable `ADMIN_AUTO_MERGE_ENABLED`.

## Outstanding verification

Two things could not be seen because no genuine event had happened yet. Neither blocks daily use.

### The first automatic publication

The next time you approve a real change, watch it once:

1. Approve the preview and leave the page open.
2. The panel should move through Approved, Publishing, Waiting for checks, Deploying and Published without any click from you. Expect several minutes.
3. Open the link shown at Published and confirm the change is on the site.
4. The submission should read Published in the inbox.

If it stops, the panel says why and offers a button; the matching row is in "When something fails" in the runbook. The one outcome that needs GitHub is "Automatic merge was not turned on": merge that pull request by hand once, and note it, because it means the publisher is not allowed to turn automatic merge on and an operator should look.

### Renewal of an expired session

A dashboard session lasts 30 minutes. When it runs out while the page is open, your next action should carry on without a sign-in screen. If a **Sign in** button appears, press it; that is the fallback working as intended.

Details and evidence for everything above are in the [production acceptance report](reviews/log-hub-027/REPORT.md).
