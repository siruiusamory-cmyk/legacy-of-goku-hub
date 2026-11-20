# Owner runbook

This is the one guide for running the Hub day to day. Everything except the last section happens in the administrator dashboard at https://admin.legacyofgokuhub.com. Only the last section needs GitHub or Cloudflare.

## Your daily routine

1. Open the dashboard and enter the sign-in code that Cloudflare emails you. The dashboard starts its own session; a **Sign in** button appears only if that fails. A session lasts 30 minutes, and getting back in is one click.
2. Look at the row of five counts under the navigation. Each one is a button that opens the matching list.

| Count | What it holds | Pressing it opens |
| --- | --- | --- |
| New submissions | Submissions you have not decided on yet, including ones you started reviewing | The inbox, showing only new and under-review submissions |
| Waiting on the visitor | Submissions where you asked the visitor for corrections | The inbox, showing only those |
| Ready for review | Previews waiting for your approval | Publication reviews, showing only those |
| Publishing | Approved changes on their way to the live site | Publication reviews, showing only those |
| Needs attention | Something stopped and needs a click from you | Publication reviews, showing only those |

A count of zero is dimmed. Needs attention above zero is filled dark and marked with "!". In Publication reviews, **Show all reviews** brings back the full list.

3. Work in this order: Needs attention, then Ready for review, then New submissions.
4. Nothing else needs a daily check. Approved changes publish themselves.

Notices appear pinned to the top of the window. Information notices clear by themselves when the screen moves on. Error notices stay until your next action.

## Reviewing new submissions

1. The inbox opens on the "Needs action" filter: everything new, under review, awaiting corrections or approved. Choose "New and under review" to see only the new work.
2. A card tagged "Reply received" means the visitor answered your request for corrections. A visitor who changed details without writing a message also gets the tag, and their reply reads "Changed details without a message."
3. Open a submission. Correction requests and ownership claims are headed with the project's name as it appears in the catalogue. The "Messages" block at the top shows, in date order:
   - what the visitor first wrote, headed "Message from the submitter", "Correction request" or "Ownership claim";
   - each reply from the visitor, headed "Reply from the submitter";
   - each message you sent them, headed "You wrote".

   If the visitor's replies grew too long to keep, a line says how many earlier replies were removed.
4. If other submissions or live listings share the same project address, they are shown side by side. Nothing is deleted automatically.
5. Decide what to do:
   - **Start review** marks it as under review. The visitor's status page then says a person is reviewing it.
   - **Request corrections** asks the visitor for more. Write your message in "Message to the submitter (shown on their receipt)"; it needs at least 5 characters. The visitor reads it on the status page with their receipt. They get no email, because the Hub keeps no visitor email. When they reply, the submission comes back as new with the "Reply received" tag.
   - **Reject submission** closes it. It also needs a message for the visitor. A rejected submission shows no further decision or prepare controls.
   - To publish it, prepare a preview (next section).
6. Private notes stay in the dashboard. The visitor never sees them.

Visitors paste links to pictures; there are no uploads. The dashboard never shows a submitted picture until it has made a safe copy in a preview.

Open submissions that nobody touches are removed after 90 days. Rejected ones are removed after 30 days.

## Approving and publishing

1. In the submission, check the form fields and fix anything that is wrong. For a new listing (Add or Suggest), tick "Also make this the Featured project" if you want it on the home page.
2. Press **Prepare preview** (for an ownership claim, **Prepare ownership verification**). The dashboard downloads the pictures itself, checks them and makes prepared images. This takes a few minutes. The preview then shows up in the Ready for review count.
   - Artwork is optional. You can choose to omit all artwork before preparing; the listing then uses the built-in placeholder picture.
   - At most six previews can be in progress. If the dashboard says "Six previews are already in progress. Finish or discard one first.", approve or discard one.
   - A preview is kept for seven days.
3. Open the preview from Publication reviews. Look at every picture at full size, and at the title, description, links and warnings. If you ticked Featured, the warning "Also makes this the Featured project on the home page, replacing the current one if there is one." is listed.
4. Tick the review boxes, press **Approve & Expedite** and confirm. If a tick is missing, the dashboard tells you instead of asking for confirmation.
5. Publication then runs by itself. The panel moves through Approved, Publishing, Waiting for checks, Deploying and Published, and shows a link to the live page at the end. It merges by itself once the automatic checks pass, so you do not go to GitHub. You can close the page; the status is kept.
6. The submission becomes Published, and the visitor's status page says so.

Things you may see while approving:

- "The submission changed. Prepare it again." The visitor changed it after you prepared. Prepare a fresh preview.
- "Another change is being published. If it goes live first, this one will need a fresh preview." You can still approve; if the other change lands first, the dashboard asks for a new preview.
- On a preview that replaces an earlier one: "No differences from what you approved before." or "Differs in:" followed by the parts that changed.
- If you approved without starting publication, **Publish now** starts it.

## Correcting listings

A live listing changes in one of two ways.

**A visitor asks for a correction.** Open the correction request. The form is filled with the live listing's current details and titled with its name. Each field where the visitor proposed something different is listed with **Use this**; press it to copy their value into the form. A proposed picture address is shown as a link, never as a picture. Edit anything else you want, then press **Prepare preview**. Only the fields you changed are sent. If you changed nothing, the dashboard says "Nothing has changed yet." and sends nothing. If the dashboard says "This listing is not on the site, so it cannot be corrected here.", **Prepare preview** stays off; reply to the visitor or reject the request instead.

**You change it yourself.** Open **Existing listings**, press the button that reads **Manage** followed by the project's name, change the details and press **Prepare metadata / artwork changes**.

Either way, you then approve the preview as in "Approving and publishing".

To take a listing off the site or bring it back:

- **Suspend listing** hides it for now. Offered only while the listing is live.
- **Delist listing** removes it until you restore it. Offered while it is live or suspended.
- **Restore listing** brings it back. Offered while it is suspended or delisted.

Each one needs a reason of at least 10 characters; it is published with the listing's status, so write nothing private in it. Each one goes through a preview and your approval like any other change. The listing keeps its address and its ratings.

"Changes to this listing" shows each finished change: the date, the change, the result, the reason and who approved it. A finished suspension or delisting reads "Done", for example "Suspend · Done".

If a preview would change nothing, it fails with "Nothing has changed from the published listing." Discard it; there is nothing to publish.

## Managing Featured

One project at a time is Featured on the home page.

- **New listing:** tick "Also make this the Featured project" before you press **Prepare preview**. If you forgot, open the ready preview and press **Prepare again as Featured**. That makes a new preview for you to approve.
- **Existing listing:** **Existing listings** shows the project that is Featured now. On a project's card, press **Make Featured**, or **Switch Featured to this project** when another project is Featured. On the Featured project's card, press **Clear Featured**. Only approved projects that are live on the site can be Featured. The same choice is in the project's **Manage** view, where the buttons read **Feature** (**Replace Featured** when another project is Featured) and **Remove from Featured**.

Choosing a new Featured project replaces the old one in the same change. Removing it leaves the home page's Featured frame empty. The status stays at Deploying until the home page shows the new choice as the only Featured project. Suspending or delisting a Featured project also removes it from Featured.

## Deleting submissions and duplicates

Only you, the publication owner, can delete.

- **Delete submission** is on each submission's page.
- **Delete duplicate** is beside each entry in a duplicate comparison.
- To delete many, tick their cards, or press **Select all N matching**, where N is the number shown (every submission matching the current search and status, up to 500, fixed when you press it), then **Delete selected**. Changing the search or status clears the selection.

One confirmation names the count and lists anything that will be kept. Deleting removes the submission, its messages, its unfinished previews and its history, and its receipt stops working at once. One history line records who deleted which submission number and when, with no submitted content.

Deleting never removes a published listing; use **Delist listing** for that. A submission whose publication is still in progress cannot be deleted until it finishes or its review is discarded. Duplicates are found by project address only, and nothing is deleted unless you choose it.

## Managing ratings

Press **Ratings** in the navigation.

For each project you see "Community rating" with the average and the count, for example "Community rating 4.5 from 12 ratings" or "from 1 rating" (or "No ratings yet"), how many ratings are "not counted", and how many ratings each score from 1 to 7 has. These are the same numbers visitors see. The dashboard never shows who voted, and it never offers to stop counting a group smaller than five.

Two lines can appear on a project:

- "Worth a look: many one-time ratings of the same score" is a prompt to look, not evidence of cheating. On a small site many genuine visitors rate only one project, so a popular project can show this line.
- "Totals need checking" means the stored rating does not match the individual ratings. Fixing that is outside the dashboard; see the last section.

To stop counting a suspicious group:

1. Open "One-time ratings by score". Each line gives a number of ratings of one score that "came from browsers that rated nothing else".
2. Press **Stop counting these** and write a reason of at least 10 characters. Do not include names.
3. The confirmation shows how many ratings are affected and the project's rating before and after. Read it, then confirm.

This stops counting every rating of that score on that project from browsers that rated nothing else, including genuine ones. Those browsers' future ratings are not counted either, until you count them again.

To undo it, find the reason under "Ratings not being counted" and press **Count these again**.

"Recent ratings actions" lists each action you took and its result. You can take about two ratings actions a minute. If the ratings changed between the preview and your confirmation, the dashboard says "These ratings changed; check again." and changes nothing.

Not in the dashboard: excluding one chosen browser, exporting ratings, restoring the ratings database, fixing totals and pausing ratings. These are in the last section.

## What each status means

| Status | Where you see it | What it means | What you do |
| --- | --- | --- | --- |
| New submission | Inbox | It arrived, or the visitor replied, and you have not decided yet | Review it |
| Under review | Inbox | You pressed **Start review** | Prepare it, ask for corrections or reject it |
| Awaiting corrections | Inbox, Waiting on the visitor | You asked the visitor for more | Wait; it comes back as a new submission with "Reply received" |
| Rejected | Inbox | You closed it | Nothing; it is removed after 30 days |
| Preparing | Publication reviews | The preview is being made | Wait a few minutes |
| Ready for your review | Publication reviews | The preview is waiting for you | Check it and approve or discard it |
| Approved | Inbox and Publication reviews | Your approval is recorded | Nothing, unless **Publish now** is shown |
| Publishing | Publication reviews | Publication is starting | Nothing |
| Waiting for checks | Publication reviews | Automatic checks are running | Nothing |
| Deploying | Publication reviews | The approved change is being put on the site | Nothing |
| Published | Inbox and Publication reviews | The change is live, with a link | Nothing |
| Needs attention | Publication reviews | Something stopped | Follow "When something fails" |
| Replaced | Publication reviews | A newer preview took its place | Nothing; use the newer one |
| Discarded | Publication reviews | You discarded it | Nothing |
| Expired | Publication reviews | It was left unfinished for seven days | Prepare a new preview if you still want the change |

## When something fails

A failure shows under Needs attention with the reason in plain words and the buttons that fit. A new preview always starts unapproved; an approval is never carried over.

| What the dashboard says | What to press |
| --- | --- |
| "Preparation has not started after 5 minutes.", "Preparation could not start." or "Preparation has not finished after 15 minutes." | **Try again**, or **Discard unfinished review** |
| "An image could not be downloaded or no longer matches what was reviewed." or "An image was refused:" and a reason | **Prepare without artwork** to publish without pictures, **Try again**, or **Back to the submission** to fix the picture link |
| "The site changed after this was approved, so the approval no longer matches it. Nothing was published." | Nothing at first. The dashboard prepares a fresh preview by itself, once, and says "The site changed after your approval, so a fresh preview is being prepared. Nothing is approved until you review it." Review and approve the new preview. |
| "The site changed after this was approved, so this approval can no longer be published." | **Prepare a new review**, then approve the new preview. The old publication request stays open on GitHub; see the last section. |
| "The automated check" (name) "failed, so nothing was published." | **Check publication** to look again, or **Prepare a new review** |
| "Automatic merge was not turned on" or "Automatic merge is off for this change" | See "A refused automatic merge" in the last section |
| "The publication request was closed before anything was published." or "Publication stopped before it finished. Nothing was published." | **Prepare a new review** |
| "Publication has not started after 5 minutes." | **Try again** |
| "Publishing the site failed" (with the name of the step) "The live site is unchanged." | It was already repeated once by itself. Press **Try again**. After three attempts only **Check publication** remains; then see the last section. |
| "Nothing has changed from the published listing." | **Discard unfinished review**; there is nothing to publish |
| "This could not finish. Try again, or discard it." | **Try again**, or **Discard unfinished review**. If you had ticked the Featured choice and it was refused, **Prepare without the Featured choice** makes a new preview without it. |
| "The publication status could not be checked." | **Check publication** |
| "Administration unavailable; retry later" or "Catalog unavailable" | Nothing was changed. Wait a minute and reload the page. If it lasts more than an hour, see "The dashboard stays unavailable" in the last section. |

Where a button reads **Try again** before you approve, it reads **Prepare a new review** after you approve.

**Discard unfinished review** removes a review you no longer want. It is refused while a job is running or while the publication can still merge. An approved submission goes back to Under review.

Handled without you: a failed read from GitHub is repeated once; starting a job is tried three times; a failed site deployment is repeated once; a publication whose job never reported back is found and followed.

## Understanding notifications

You get one email when the number of new submissions waiting for you rises. The Hub checks once an hour.

- The email says only "N submission(s) waiting for review" and the dashboard address. It never holds a title, a message or anything about the visitor.
- It counts submissions you have not started reviewing. A visitor's reply puts a submission back to new, so a reply can also bring an email.
- No email is sent when the number stays the same or falls. If it falls and later rises again, you get another one.
- If sending fails, the Hub tries again the next hour.
- Cloudflare's Email Routing summary lists these emails as "dropped" even when they arrive. That is a quirk of the summary; trust your inbox and the dashboard.
- Visitors never get email. They check the status page with their receipt.
- The dashboard counts are always right, even if an email is late or missing. If no email comes, check your spam folder first.

Email notifications have been on since 2026-11-19. Your current address is already verified in Cloudflare. Only a new or changed address needs Cloudflare's verification.

## Exceptional situations requiring GitHub or Cloudflare

These are rare. Each one needs your own hands, or an operator you trust, on GitHub or Cloudflare. Commands run in the repository folder on a trusted computer with Node 24 and the project's dependencies installed.

### A refused automatic merge

When: Needs attention says automatic merge was not turned on, or is off for this change.

Open the publication request from the panel and merge it on GitHub. The dashboard follows it from there and marks it as merged by hand.

### A publication request left behind after the site changed

When: Needs attention says "this approval can no longer be published".

After you have prepared and approved the new preview, close the old pull request on GitHub. It can never merge, because its branch is locked, and the dashboard cannot close pull requests.

### Turning automatic merge off or on

Automatic merge of owner-approved publications is on in production. It was turned on on 2026-11-18 (LOG-HUB-023-ADDENDUM-001).

- To turn it off: in the repository's Actions variables, delete `ADMIN_AUTO_MERGE_ENABLED`. New publications then need a manual merge on GitHub.
- To stop one pull request that is already waiting: choose **Disable auto-merge** on it.

Details: [Administrator documentation](launch/ADMIN.md#automatic-merge-after-owner-approval-log-hub-023-on-in-production).

### Adding or removing an administrator

Change the Cloudflare Access policy for the dashboard and the admin Worker's `ADMIN_EMAILS` list. Removing someone for good needs both. Details: [Administrator documentation](launch/ADMIN.md#authentication-design-historical-rationale).

### Pausing submissions

When: a flood of spam or an incident on the public form.

`npx wrangler deploy --config intake/wrangler.jsonc` closes the form, because the committed setting keeps submissions off. To also send the site's Submit link back to the GitHub route, set the repository variable `INTAKE_ENABLED` to `false` and run the catalog workflow.

To open the form again with notifications, deploy the submission service as described in "Deploying an approved change" below.

### Pausing ratings

When: sustained abuse of ratings.

Set the ratings Worker's `RATINGS_ENABLED` to `false`. Ratings then show as unavailable and the directory is unaffected. Details: [Ratings service](launch/RATINGS.md), step 7 of "Production activation gate".

### Pausing publishing

When: a publishing incident that needs investigation.

Set the repository's Actions variable `PUBLISHING_ENABLED` to `false`. Details: [Publication, backups and recovery](OPERATIONS.md#publishing-gate).

### Excluding one chosen browser from ratings

When: an investigated case of one browser abusing ratings. The dashboard only handles groups.

This is a manual database procedure: [Fraud exclusion and appeal](launch/RATINGS.md#fraud-exclusion-and-appeal).

### Ratings export, recovery and totals repair

When: the ratings database is damaged or lost, or "Totals need checking" stays.

See [Private export and recovery](launch/RATINGS.md#private-export-and-recovery). Ratings are not part of the catalogue backups.

Last export: 2026-11-19 (24 ratings), taken without pausing ratings. A ratings export is kept for seven days at most, so delete that one by 2026-11-26.

### Backups and restore of the catalogue

When: a publication was lost or damaged, or GitHub is unavailable.

See [Restore and off-platform export](OPERATIONS.md#restore-and-off-platform-export-windows) and [Compromised credentials](OPERATIONS.md#compromised-credentials).

Last export: 2026-11-19, recovery point `44613623538`, all 27 listings, verified offline with `verify-export`. An export only protects against losing GitHub once its ZIP is copied to storage outside GitHub and Cloudflare. Take a new one after a batch of publications and write its date here.

### Credentials that expire

When: before the earliest date below. Publishing from the dashboard stops when either of the first two lapses; the public site, submissions and ratings keep working.

| Credential | Used by | Expires (UTC) | To renew |
| --- | --- | --- | --- |
| GitHub token `GH_DISPATCH_TOKEN` | The dashboard, to start and follow publications | 2026-12-16 08:00 | GitHub, Settings, Developer settings, Fine-grained tokens: regenerate it, or create a new one with the permissions listed in [the administrator service notes](launch/ADMIN.md); an expired token cannot be restored. Then `npx wrangler secret put GH_DISPATCH_TOKEN --config admin/wrangler.production.jsonc` |
| Access service token `loghub-admin-private-processor` | The publication workflow, to reach the dashboard (`ADMIN_ACCESS_CLIENT_ID` and `ADMIN_ACCESS_CLIENT_SECRET` in the `admin-processing` environment) | 2026-12-16 16:50 | Cloudflare Zero Trust, service tokens: **Refresh** sets the expiry to 30 days from that moment and keeps the same ID and secret, so nothing has to be re-entered. To renew less often, edit the token and choose a longer duration |
| Access service token `loghub-admin-isolated-private-processor` | Nothing since the isolated acceptance test on 2026-11-16 | 2026-12-16 17:03 | Let it lapse |
| Cloudflare token `CLOUDFLARE_API_TOKEN` | The site deploy (`cloudflare-pages` environment), set 2026-11-16 | Not recorded | Read the date in Cloudflare under My Profile, API Tokens, and write it here |

These have no expiry: the two GitHub App keys, the signing keys, `RATE_SALT`, the human-check secret and `ADMIN_PROCESSOR_TOKEN`. After renewing, replace the date in this table.

### The dashboard stays unavailable

When: "Administration unavailable; retry later" or "Catalog unavailable" lasts more than an hour.

Check https://www.cloudflarestatus.com first. If Cloudflare reports no incident and the dashboard broke right after a deploy, go back to the version before it: `npx wrangler deployments list --config admin/wrangler.production.jsonc` shows the versions, and `npx wrangler rollback <version id> --config admin/wrangler.production.jsonc` restores one. Submissions and the public site keep working while the dashboard is down.

### Deploying an approved change

When: a merged change touches the submission service (`intake/`), the dashboard (`admin/`) or the ratings service (`ratings/`). The public site deploys itself after every merge; only these three services are deployed by hand. Work in a clean, up-to-date checkout of `main`.

**The private notification settings.** Your notification address is never put in the public repository. It lives in one private file, kept outside every checkout:

`%LOCALAPPDATA%\loghub-private\intake\wrangler.private.jsonc`

That file is the committed `intake/wrangler.jsonc` plus two additions: `"send_email": [{"name": "NOTIFY_EMAIL", "destination_address": "<owner address>"}]`, and `"NOTIFY_TO": "<owner address>"` under `vars`. If the file is ever lost, write it again from that description; your address is the only private part. If a release changes `intake/wrangler.jsonc`, make the same change in the private file.

**Submission service.** Copy the private file into the checkout's `intake` folder (Git ignores it there), then run:

`npx wrangler deploy --config intake/wrangler.private.jsonc --var INTAKE_ENABLED:true`

Both parts matter. Without the private file no email is sent. Without `--var INTAKE_ENABLED:true` the public form closes. Afterwards `npx wrangler deployments list --config intake/wrangler.jsonc` shows the new version, and `npx wrangler versions view <version id> --config intake/wrangler.jsonc` must list `NOTIFY_EMAIL`, `NOTIFY_TO` and `INTAKE_ENABLED ("true")`.

**Dashboard.** `npx wrangler deploy --config admin/wrangler.production.jsonc`

This command can end with "Could not find zone for admin.legacyofgokuhub.com" even though the new version is live. Do not repeat it. `npx wrangler deployments list --config admin/wrangler.production.jsonc` tells the truth: the newest entry at 100% is what is running. The dashboard's secrets and its address survive every deploy.

**Ratings service.** `npx wrangler deploy --config ratings/wrangler.jsonc --var RATINGS_ENABLED:true`

Without `--var RATINGS_ENABLED:true` ratings turn off, because the committed setting keeps them off. When a site change needs a new ratings route, deploy the ratings service from that change's branch before you merge it; this is the one case where you do not deploy from `main`.

**Going back.** `npx wrangler rollback <version id> --config <the same config>` restores an earlier version of any of these services.

### Changing the notification address

When: email should go to a different address.

Register the new address in Cloudflare Email Routing and confirm it through the link Cloudflare sends to it. Put it in both places in the private file described above, then deploy the submission service. Details: [Submissions service](launch/SUBMISSIONS.md#live-deployment-record).
