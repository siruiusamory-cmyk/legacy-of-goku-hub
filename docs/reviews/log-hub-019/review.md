# LOG-HUB-019 candidate: review package

Status: design approved by the owner on 18 November 2026. Not merged or deployed.

- Branch: `log-hub-019-fable-redesign`, cut from `origin/main` at `4eba1db`
- Look at it: `npm run site:fixture`, then `node tools/site/serve.js` and open http://127.0.0.1:4321/
- `visual-redesign`, PR #53, PR #60 and PR #62 are untouched. PR #60's discovery features are deliberately not included.

## What it is

The idea is a Game Boy Advance pause menu turned into a website. Three things carry it:

1. **The artist's Kamehameha banner is the masthead.** The banner has a blank white core. Earlier attempts read it as a grey smear and shrank or dropped it. Here it is shown at its full 960x160, centred, with the site name inside the beam in dark ink and "Hub" in red. The menu tabs sit under it.

Removed on owner instruction (18 November), because none of it was asked for: the three footer badges, the gold motto strip under the menu, the "Error 404" label, the visible "Open navigation" words on the phone menu button, and the visible project count.
2. **Chamfered menu frames with gold tab titles.** Hero, panels and cards are boxes with cut corners and a double line, as in both mock-ups. Panel titles are slanted gold tabs with a red arrow. The directory heading is a dark red ribbon.
3. **The artist's Dragon Balls are the rating system.** All fourteen sprites are used: lit for earned, grey for not. They are shown only at exact pixel sizes (48, 24 or 16).

Other decisions:

- Flat navy with a small tiled star pattern. No gradients on surfaces, no blurred shadows, no rounded cards. Buttons are square with a hard offset shadow, like a pressed menu item.
- Type: Kanit heavy italic for titles (closest free match to the mock-up lettering), Barlow Condensed italic capitals for labels, Inter for reading text. Total font weight 84 KB.
- The description sits on a cream box, as in the detail mock-up.
- Featured and detail artwork keep the existing Buu's Fury portrait frame.
- On phones the card grid becomes a list of "save slot" rows: thumbnail left, details right.
- The game scenery band is switched off. Behind the detail title it made the text hard to read, and on the home page only a sliver showed. The component is still in the code.
- Home and detail heroes use the same gold frame. Featured artwork and card artwork are shown whole at 16:9, never cropped on desktop. On the home hero the rating sits under the artwork so both columns end on the same line.
- On phones, cards drop the two icon buttons and the status badge so every row is the same height (151px). Download stays one tap away on the project page.
- Between 901 and 1100 wide the directory is two columns, so three badges always fit on one line.

Owner-directed changes (18 November):

- The four menu tabs (Projects, Submit, GitHub, Discord) are equal width with no gaps, like folder tabs.
- The community rating panel keeps the grid from the live site, now coloured like the dragon radar (green). Text contrast on it: 8.4, 6.3, 5.2 and 5.1 to 1, all above the 4.5 minimum.
- The dotted divider between the community rating and the rating picker is gone.
- Rating picker: no boxes around the balls. All seven start grey. Hovering or picking a ball lights it and every ball before it.
- On phones the picker is four balls on top and three centred below.

## Measured alignment pass

Every item below was found by measuring the rendered page (element boxes and the painted pixels inside them), then fixed and measured again.

| Found | Fix |
|---|---|
| Ball sprites sit off-centre in their 64x64 files (lit 10 to 11 from the top, grey 16), so grey balls hung 5px low and an orange ring showed behind each ball | Only the 48x48 ball is cut out and shown; files untouched |
| Balls drawn at 18, 22, 32, 38, 40 (blurry in-between sizes) | Exact sizes only: 48, 24, 16 |
| Title wrapped with an orange slash on line one only, so the two lines did not start together | Slash removed |
| Featured artwork cropped at the sides; card artwork cropped top and bottom | Both shown whole at 16:9 |
| One card wrapped its badges to two lines | Icon buttons moved beside the title; badges get the full row |
| Rating balls and rating picker on the detail page sat 7px apart vertically | Same height, same line |
| Label text sat 1 to 2px low in menu tabs and filter boxes | Centred to within half a pixel |
| Detail page columns ended 67px apart | Bottoms line up |
| Phone filter box cut off "All categories" | Boxes are wide enough |
| Phone rows were 145 to 166 tall depending on content | All 151 from 360 to 580 wide |
| Sort box orphaned on its own line at tablet width | Search takes a full row; filters and sort share the next |
| Submit form fields touched each other | Even 20px gaps |
| Gap above the footer was 70px on home and 60px on detail | 60px on both |

## Fixes the ticket asked for

- **Duplicate metadata:** game, category, status and repository appear once, in the title area. The side column no longer repeats them.
- **Missing release information:** released projects get their own Release Info panel (version, file size, date, checksum). Projects without a release show no empty panel.

## Screenshots

| View | File |
|---|---|
| Home, desktop 1440 | `artist-templates/png/desktop-home-1440-clean.png` |
| Home, phone 390 | `artist-templates/png/mobile-home-390-clean.png` |
| Detail, desktop 1440 | `artist-templates/png/desktop-detail-1440-clean.png` |
| Detail, phone 390 | `artist-templates/png/mobile-detail-390-clean.png` |
| Empty catalogue | `screens/empty1440.png`, `screens/empty390.png` |
| Submit form | `screens/submit1440.png`, `screens/submit390.png` |
| No artwork supplied | `screens/artfree1440.png` |
| Unreleased project, 404 | `screens/unrel.png`, `screens/nf.png` |
| Tablet 1024 and 768 | `screens/h1024.png`, `screens/h768.png`, `screens/d768.png` |
| 1024, 768, 360, 320 checks | `artist-templates/png/check-*-annotated.png` |
| Artist pack (PDF guide and named pictures) | `Legacy of Goku Hub - Artist Pack.zip` |

## Compared with the earlier attempts

| | This candidate | `visual-redesign` | PR #62 |
|---|---|---|---|
| Banner | Masthead at full size, title inside the beam | Present but not used as a title plate | Not used |
| Frames | Cut-corner double-line frames, gold tabs | Rounded panels, partial tabs | Everything squared to plain 2px boxes |
| Rating balls | Artist sprites, vector fallback kept underneath | Artist sprites only | Vector balls |
| Detail side column | No repeated fields, Release Info only when there is a release | Repeats game, status, repository; always shows Release Info | Unchanged from main |
| Browser tests | 38 of 38, test assertions untouched | Predicted to fail two tests, never ran CI | Passing |
| Closeness to mock-ups | Frames, tabs, cream box, badges, title lettering | Colours and lettering | Colours only |

Against the mock-ups themselves: frames, tabs, badges, cream overview box and title style are followed. The grid texture is used on the community rating panel only. Not reproduced: the pixel cliffs and clouds, and character art, because no such artwork exists yet and none was generated.

## Tests

- `npm test`: 166 of 166 pass.
- Browser suite: 38 of 38 pass. Covers no sideways scroll at 320, 390, 430, 760, 941, 1024 and 1448; automated accessibility checks on home, detail, empty and submit pages; keyboard skip link; 44px touch targets; no outside requests; page weight limits.
- One test file changed: `tests/site/typography.test.js`, where the list of shipped font files now names Kanit. No assertion was loosened.
- Administrator browser suite: 5 of 5 pass.

## Release candidate (LOG-HUB-020)

The approved design is commit `64e9f10`. The release candidate branch `log-hub-020-release-candidate` adds, without changing the approved look:

- From the public discovery branch (PR #60): a two-line summary and the last-updated date on directory cards, and a Recently Updated list of three projects between the featured project and the directory. They use the same steel frames, ribbon heading and type as the rest of the page. On screens 580px and narrower the summary and date are hidden so phone rows keep their fixed height.
- From PR #62, wording only: the empty catalogue says "No approved projects yet" under the title "Legacy of Goku Community Directory", and the not-found page says "Project not found". The two browser assertions that quote that wording were updated to match.
- Not taken from PR #62: its palette, square framing, form restyling, the "About this directory" strip under the menu, the footer rewording and the removal of the missing-artwork symbol. The approved design supersedes them.
- One administrator browser test pinned the old layout's artwork height (276px). It now checks that the missing-artwork box is exactly the size of a real artwork box, which is what the fixed number stood for.

The candidate was also built from the live public catalogue (eight projects, read-only) and checked for search, filters, sorting, ratings, links, the submission and status pages, and the phone menu.

Seen with live data, accepted as known limits: long titles wrap to two lines beside the icon buttons, which makes some rows taller (phone rows 151px or 176px); wide logo artwork is cropped to its centre in phone thumbnails.

The pictures in the artist pack show the approved design before the Recently Updated list and card summaries were added. Every artwork measurement in it still holds; only the card height differs (435px instead of 364px on desktop).

## Known limits

- The banner is pixel-perfect on desktop but shrinks on screens under 1032 wide, because 960 does not fit. See the artist handoff.
- At 320 wide, phone rows differ in height when a title needs two lines.
- On the detail page the last panel in the shorter column is stretched so the columns end together; it can show empty space.
- The submit form got spacing fixes only. Its option boxes still use the older rounded style.
- The header is now 262px tall on desktop because of the full-size banner.
- Checked in Chromium only. No Firefox, Safari or real Android device.
- Reduced motion: the site has no animation; the only movement is a 2px button press, which is switched off.
- The site name in the banner is live text. The artist is drawing lettering for that space; the swap is not built yet and waits for the file.
- Fixture data only. The eight live listings were not rendered through this design.
- README and CHANGELOG are not updated; that belongs with the commit, if the owner approves one.
- The review folder holds about 23 MB: the PNGs, the artist pack folder and its zip.
- Some pictures in `screens/` predate the equal-width tabs and the radar grid.

## Hemwy's assessment

Disclosure: Hemwy built this candidate in the same session, so this is a self-assessment and not an independent one. An outside review needs a second reviewer.

- **Strong:** the masthead. It is the first version where the commissioned banner reads as the site's logo. The frames and tabs make the pages look like a game menu, not a product page.
- **Good:** phone layout. Save-slot rows keep seven projects scannable without seven tall cards.
- **Weak:** the directory cards on desktop are the most ordinary part. Three equal cards in a row is still a card grid, only framed.
- **Weak:** the submit form inherits the frame and type but is otherwise a plain form.
- **Unfinished:** everything marked "not yet drawn" in the artist handoff. The frames and badges are code stand-ins and look flatter than the hand-drawn pieces beside them.

Verdict: fit for owner review as the leading candidate. Not ready to ship before the owner signs off on the direction and the artist replaces the stand-ins that matter.
