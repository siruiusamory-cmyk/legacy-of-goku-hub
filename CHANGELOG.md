# Changelog

Changes that visitors or contributors can see. Catalogue publications are not listed here; they are recorded by the moderated publication process.

## Unreleased

### Added

- Design changes can be looked at before they ship: `npm run site:preview` builds the site from the published catalogue and uploads it to https://preview.loghub.pages.dev in under a minute. Production is not touched and the preview is hidden from search engines.
- A merge that changes only the website, its tests or documentation now skips the catalogue synchronisation, backup and publication jobs and goes straight to the verified build and upload. It reaches the live site in about a minute and a half, down from nearly five.
- The submission form shows three steps (Details, Check, Sent) and keeps what you typed if the page reloads or you come back in the same tab. **Start over** clears it.
- Correcting a listing shows the listing as it is now, next to the fields. Fill in only what should change; anything left alone is not sent.
- The receipt can be saved as a file, and the **Check status** link opens the status directly. The footer and the submission page link to **Check a submission**.
- **Preview images** shows each picture link before you send, and says which ones could not load.
- A project already in the directory is pointed out as soon as its address is typed, with buttons to correct or claim that listing instead.
- When nothing matches a search or filter, the directory offers **Suggest it**.

- An RSS feed at `/rss.xml` announces new listings. A feed reader shows each listing once; a later edit moves it up the feed without announcing it again. A sitemap at `/sitemap.xml` and a `robots.txt` that points to it help search engines find every project page.
- The repository has a license: the code is released under the MIT License. The site's commissioned artwork and the artwork and descriptions of listed projects are not covered.
- A guide at `/how-to-patch/` explains how to apply a ROM hack or translation patch to your own copy of the game. The footer links to it, and ROM hack and translation pages link to it under their buttons.
- Links shared on Discord and other apps show a title, a short description and a picture: the cover art on a project page, and a site card everywhere else. The site has an icon in browser tabs and on phone home screens.
- The home page opens with one line saying what the Hub lists and that it offers patches and links only, never ROMs.
- The footer says the Hub is an unofficial fan site and links to the form for requesting a correction or removal.
- The submission page, the contributing guide and the moderation policy state that AI-assisted projects are welcome and low-effort projects made mostly by AI are not listed.
- **Translation** is a project type of its own. Submitters and the owner can choose it, listings show it as a badge, and the directory offers it as a filter once a translation is published.

### Changed

- The patch guide, the ratings privacy page and the not-found page sit in the same framed panel as the rest of the site. The "Project Directory" heading is an orange tag like the panel headings in place of a maroon ribbon, and the phone menu bar has the gloss of the tabs.
- The submission form matches the rest of the site: sunken fields, the site's own dropdown arrow, and raised step markers in the label lettering. The small download and repository buttons on cards have a raised edge. The "Projects" tab is highlighted only on project pages, no longer on the patch guide or privacy page.
- Tabs in the main navigation and the directory are redrawn as glossy folder tabs with rounded top corners and a small gap between them. The "Community Rating" tag sits on the top left corner of its frame like the tags of the other panels.
- Body text uses Verdana and Tahoma from the visitor's own device in place of the downloaded Inter font, which is removed. Badges are square with a raised edge, the search box is sunken and the filter dropdowns are raised, to match the site's turn-of-the-century look.
- The site title in the masthead is lettered after the games' own title logos: wide slanted capitals in Days One, black with a yellow to orange outline and a red drop shadow, in place of black with a red last word. The font file holds only the title's letters.
- No tab in the main navigation is highlighted on the home page. A tab turns cream when pointed at, and stays cream on the page it leads to.
- Every colour in the site's stylesheets is now one that appears in the three games: each was replaced by its nearest match among 2,197 colours counted from the games' sprites and backgrounds. Yellow and gold are replaced throughout by the gi orange. Selected tabs are cream so the one in the main navigation stands apart from the orange masthead.
- The top of every page is the orange of Goku's gi in the games (`#de8400`, with `#b55200` as its shade, both measured from the first game's Goku sprite) over the yellow clouds of Snake Way from Buu's Fury, in place of dark navy.
- The game's dialogue-box frame now surrounds the whole featured panel on the home page and the top panel of every project page; the artwork inside has a plain border.
- The community rating panel on a project page has a plain white line border in the colour of the Dragon Radar casing, with the "Community Rating" tag above it. The green grid inside is unchanged.
- Project pages no longer carry the boxed notice about links leading to sites run by other people. The footer still says no ROMs are hosted.
- A listing without artwork now shows a glowing Dragon Ball on a scanline plate, in place of the grey checkerboard and "Project artwork not provided". Legacy of Goku has one star, Legacy of Goku II two, Buu's Fury three and multi-game projects seven.
- The home page says each thing once. The line under the navigation, the sentence beside "Project Directory", the "Browse the directory" link and the footer's "A community home" line and second Submit link are gone. "No ROMs hosted" now appears once, in the footer. Project cards no longer print "Not rated yet" beside their grey balls or repeat the listing date; screen readers still hear the unrated state, and the date stays on the project page and in the ticker.
- Latest listing updates are a scrolling ticker above the directory in place of three boxes. It pauses under the pointer or keyboard focus and stays still for visitors who ask for reduced motion.
- Gold buttons and the selected tabs have a glossy shine, and the footer carries 88x31 buttons for the RSS feed, "Fan made" and "No ROMs hosted".
- The page background is a faint wallpaper of all seven Dragon Balls in a shuffled pattern, in place of the starfield. On wide screens it stays still while the page scrolls.
- The main menu is Projects, Submit and Discord. The Discord tab shows its name next to the logo. The GitHub tab, the footer's "Contribute on GitHub" link and the "GitHub route" notes on the submission pages are gone: the site no longer links to its own repository. Links to the repositories of listed projects are unchanged.
- Every Submit, Correct and Claim link opens the site's own form. If submissions are switched off, the form says so and points to Discord for corrections and removals, instead of sending visitors to GitHub.
- The Submit tab is the highlighted tab on the submission pages.
- With JavaScript turned off, both submission pages say that it is needed, and the status page can no longer put a receipt in the address bar.
- A file name such as `hack.gba` typed as an address is refused with a message to link a page instead.
- The submission form starts on **Suggest a project** and asks for the address first, then the name, type, game, status, creator, description and images. Download and community links are the only folded section.
- An address typed without `https://` is completed, an `http://` address is switched to `https://`, and a GitHub picture page link is turned into a direct picture link. A rejected address says what is wrong with it.
- Errors are listed in the order of the form, name the numbered link or line they refer to, and clear as soon as the field is fixed. Required fields are announced as required by screen readers.
- **Send submission** stays unavailable until the human check is done, and a second click cannot send twice. Messages for a busy service, a closed form, a missing listing and a project that is already listed say what to do next.
- Answers typed under one action are not sent with another.
- On phones the four actions fit on two rows, and the menu button reads "Menu".
- Project pages show **Correct this listing** and **Claim this listing** as buttons.
- The status page checks a receipt opened from its link straight away, removes a saved receipt that is no longer stored and says why, and puts the cursor on the field that needs fixing.
- The owner runbook opens with a table of dates to act on: the ratings export to delete by 26 November 2026 and the two credentials that expire on 16 December 2026.

- Choosing a game in the directory also shows projects listed for multiple games. The status filter offers only statuses that have a listing, and sorting by release date is offered only when at least two listings have a release.
- On fan project, tool and resource pages the button to an outside download page reads "Download Page" instead of "Patch Page".
- On every listing page and directory card, when the download button and "Visit Project" would lead to the same address, only the first is shown.
- Project page artwork loads faster: the large picture is about a fifth of its former size.
- A project with one rating reads "1 rating" instead of "1 ratings".
- The owner runbook lists the credentials that expire, with their dates and how to renew each (two of them last 30 days), and records the date of the last catalogue and ratings exports. The operational handoff records that automatic publication has been seen working and that publications merge on the `test` check alone.
- Search looks in every category. While a search is typed no tab is selected and the result count says "in all categories"; choosing a tab clears the search.
- On phones, directory cards show their status (Released, In Development, On Hold, Discontinued) again.
- The date on cards, on project pages and in the home page list is labelled "Listing updated", and the list is called Latest Listing Updates, because it is the date the Hub last changed the listing, not the date of project activity.
- The home page loads all community ratings with one request, so ratings no longer show as unavailable after a few quick visits.
- The project directory is browsed by category. Five tabs styled like the main menu (ROM Hacks, Translations, Fan Projects, Tools, Resources) sit above the listing, each with its number of published projects. One category shows at a time, starting with ROM Hacks; there is no combined view, and the category drop-down and the **All** button are gone. Game, status and sorting work inside the selected category. Each tab has its own address, such as `?category=tool`, so it can be shared and Back and Forward move between tabs.
- On phones, project artwork in the directory rows is shown whole instead of being cropped to the row.

- The owner runbook now matches production: email notifications are described as on, the deploy procedure for the submission service and the dashboard is written out with its private settings file, verification and rollback, and the dashboard's "unavailable" messages have a next step. An operational handoff and the production acceptance report are added.
- The dashboard uses plain words throughout: project names instead of ids, "preview" and "publication" instead of package and pull request terms, links shown as their label with the site name, and field errors shown as "Label: message" with the cursor on that field. The message to the submitter sits with the decision buttons, and a missing message or review tick is pointed out before any confirmation.
- Correction requests open with the live listing's details and list each field the visitor proposed with **Use this**. Only the fields the owner changed are sent, and a change that would leave the listing as published is refused.
- **Suspend**, **Delist** and **Restore** are offered only where they apply, so a suspended listing can be delisted directly.
- The public submission form says plainly that pictures are given as links, marks each folded section as open or closed, and shows option names such as "ROM hack" on the review step. The receipt and status pages explain that moderator replies appear on the status page, and say when the visitor's own reply has arrived.
- Historical command-line moderation procedures are marked as superseded by the dashboard, and the documentation states that automatic merge of owner-approved publications is on in production.
- The administrator dashboard starts its own session whenever Cloudflare Access has already proved who you are, and renews it when it runs out, so the header no longer shows a session expiry time. The **Sign in** button now appears only if that fails or after you sign out.
- The public site has a new look modelled on a Game Boy Advance pause menu. The commissioned energy banner is the masthead at its native 960x160, and the fourteen commissioned Dragon Ball sprites show every rating at exact pixel sizes (48, 24 or 16).
- The four menu tabs are equal width and sit together like folder tabs.
- Panels, cards and the featured project use cut-corner menu frames with gold tab titles.
- The community rating panel sits on a dragon radar grid. Rating balls start grey; hovering or choosing one lights it and every ball before it. On phones the seven balls sit four over three.
- On phones the directory is a list of equal-height rows with the thumbnail on the left.
- The empty catalogue and the not-found page use plain, factual wording.

### Added

- An owner runbook, [docs/OWNER-RUNBOOK.md](docs/OWNER-RUNBOOK.md), covers day-to-day running of the Hub from the dashboard and the rare jobs that still need GitHub or Cloudflare.
- Each submission shows the visitor's original message, every reply and every message sent to them, in date order. Submissions that came back with a reply carry the tag "Reply received".
- A row of five counts under the dashboard navigation: new submissions, waiting on the visitor, ready for review, publishing and needs attention. Each opens the matching list, and a failing check on an open publication shows under needs attention without opening another page. The inbox opens on "Needs action".
- The owner can get one email when the number of new submissions rises. It holds only the count and the dashboard address, and is sent once the address is set in the private configuration.
- "Also make this the Featured project" when preparing a new listing, and "Prepare again as Featured" on a ready preview. The Featured choice is part of the preview the owner approves.
- "Changes to this listing" shows each listing's past changes, with date, outcome, reason and approver.
- When an image fails, **Prepare without artwork** and **Back to the submission** are offered. When the site changed after approval, a fresh preview is prepared automatically, and nothing is approved until the owner reviews it.
- A Ratings tab shows each project's community rating and score spread, flags many one-time ratings of the same score as worth a look, and lets the owner stop counting such a group of five or more and count it again later. It never shows who voted.
- The administrator dashboard follows a publication by itself after approval. One panel moves through Approved, Publishing, Waiting for checks, Deploying and Published, and shows the live link once the deployment has been verified. The **Verify PR checks and deployment** button and the leftover publication button after **Approve & Expedite** are gone.
- When a publication cannot finish, the dashboard says why in plain words and offers the fitting next step: **Try again**, **Prepare a new review**, **Check publication** or **Discard unfinished review**. A failed site deployment is repeated once automatically.
- The owner can permanently delete submissions from the dashboard: one at a time, a chosen duplicate, or many at once with **Select all matching** and **Delete selected**. Deleting removes the private submission and its receipt and never removes a published listing.
- Submissions that share a project address are shown side by side with their names, addresses, dates and statuses. Nothing is deleted automatically.
- The inbox shows how many submissions are new, under review, awaiting corrections and approved.
- Owner-approved publications can merge by themselves once the required checks pass, so the owner no longer has to press Merge on GitHub. Off by default; the owner turns it on separately. On in production since 2026-11-18. The publication job checks that the pull request holds exactly the approved content before asking GitHub to merge it, and never merges anything itself.
- The dashboard says whether GitHub will merge an open publication by itself, and shows the reason when automatic merge could not be turned on.
- Directory cards show a short project summary and the date the listing was last updated (screens wider than 580px).
- A Recently Updated list on the home page links to the three most recently updated projects.
- A measured reference pack for the artist in `docs/reviews/log-hub-019/`.

### Fixed

- A publication that a later one replaced before the dashboard had confirmed it, such as a Featured choice changed again the same day, is now shown as Published. It used to stay at Deploying and keep the Publishing count at one.
- Game, category, status and repository are shown once on a project page instead of being repeated in the side column.
- The release panel appears only for projects that have a release.
- Lit and grey rating balls now line up. The sprites sit off-centre in their files, so the site shows only the 48x48 ball.

## Administrator runtime repair

- Deploy the current administrator Worker instead of the stale bundle whose Access certificate request used `redirect: "error"`, a mode Cloudflare Workers rejects.
- Keep the committed `admin/wrangler.jsonc` disabled by default and add the explicit `admin/wrangler.production.jsonc` for authorized deployments, with the permanent origins, custom domain, D1 binding and disabled preview URLs.
- Log only the failing request stage when an unexpected administrator exception is caught, without exception text, identities or request data.
