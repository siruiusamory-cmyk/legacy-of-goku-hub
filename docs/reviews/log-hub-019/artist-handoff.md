# Artist handoff: Legacy of Goku Hub

These are measurements taken from the working site, not from the mock-ups. All sizes are in CSS pixels (on a phone or sharp laptop screen, one CSS pixel is two or three real pixels).

## What to send the artist

Send `Legacy of Goku Hub - Artist Pack.zip` from this folder. It holds a PDF guide ("Read me first - Artist Guide.pdf") and three folders of pictures with plain names: clean templates, templates with measurements, and other screen sizes. The artist needs nothing else and does not need to run anything.

This file is the working copy of the same information. To rebuild the pack after a layout change: `node docs/reviews/log-hub-019/artist-templates/build.mjs`, then `node docs/reviews/log-hub-019/artist-templates/pack.mjs`, then zip the folder.

Box colours: green is your art in place, pink dashed is art not yet drawn, blue is whatever each project uploads, yellow is a piece taken from the games, white is live text.

## Sizes

| Region | Desktop 1440 | Phone 390 | Background | How it scales |
|---|---|---|---|---|
| Masthead beam banner | 960x160 (full size, 1:1) | 358x60 | Transparent | Full size when the screen allows; shrinks to fit below 1032 wide (952 at 1024, 720 at 768, 328 at 360, 288 at 320) |
| Site name lettering area | 672x66, starting 216 from the left and 49 from the top of the 960x160 banner | 251x25 | Transparent | Live text for now. The artist is drawing lettering for it (told by owner 18 November). Easiest delivery: a 960x160 transparent PNG with only the lettering |
| Rating ball, large | 48x48 (full size) | 24x24 (exact half) | Transparent | Only the 48x48 ball inside the 64x64 file is shown |
| Rating ball, on cards | 24x24 (exact half) | 16x16 (exact third) | Transparent | Same |
| Rating picker tap area | 60x60 (ball 48x48) | 71x60 (ball 48x48) | Transparent | Ball at full size, no box around it. Grey until picked; the picked ball and every ball before it light up. On phones: four on top, three centred below |
| Hero menu frame | 1168x484 home, 1168x328 detail | 358x738 home, 358x530 detail | Solid fill | Nine-slice: corners fixed, edges repeat |
| Panel menu frame | 1168 or 762 or 381 wide, height varies | 358 wide, height varies | Solid fill | Nine-slice |
| Card frame | 377x364 | 358x151 | Solid fill | Nine-slice |
| Missing-artwork placeholder | 601x338 | 316x178 | Solid | Fills, centre crop |

Variable (changes per project, nothing for you to draw): featured artwork 601x338 desktop, 316x178 phone, shown whole; detail artwork 481x270 desktop, 300x169 phone; card thumbnail 365x205 desktop (shown whole), 120x139 phone (centre crop); screenshots 232x156 desktop, 149x101 phone. Panel and card heights depend on the text inside.

## Your art already in use

- `energy-banner-960x160.png`: the masthead on every page. Shown at its full 960x160 on desktop. The site name sits in the white core, roughly from 22% to 93% of the width. Keep that area empty in any new version.
- `ball-1` to `ball-7`, `-active` and `-inactive` (64x64): every rating on the site. Measured: in each file the ball itself is 48x48 and does not sit in the middle of the 64x64 canvas. Lit balls sit 10 or 11 pixels from the top, grey balls 16. The site now cuts out just the 48x48 ball, so lit and grey balls line up. Your files are not changed.

## Still needed

In order of how much each would lift the site:

0. **Banner lettering (in progress).** Fits 672x66 inside the banner. When it arrives the site swaps the live text for the image and keeps the site name as hidden text for screen readers and search.
1. **Menu frame.** One square tile with cut corners and a double line, which the site stretches. Corners 10px at the size now used; draw it at 30x30 or 60x60. One gold version, one steel-blue version. Solid dark-blue middle.
2. **Balls centred in their files.** Optional. The balls are now shown at exact sizes (48, 24, 16), so they stay crisp. If you ever re-export them, put each ball in the same spot of its canvas, or crop the files to 48x48.
3. **Phone banner.** On phones the banner shrinks to 358 wide and loses its crisp pixels. A version drawn at 358x60 or 716x120 would stay sharp. Optional.
4. **Backdrop scenery.** Not shown at the moment: the game crop sat behind text and looked messy. A purpose-drawn strip, full page width and about 120 tall, could come back under the header.
5. **Missing-artwork picture.** 16:9, at least 640x360, for projects with no image.
6. **Empty-catalogue art.** Optional, 16:9, for when no projects are listed.
7. **Site icon and share image.** 512x512 icon; 1200x630 share image.

## File formats

- Pixel art: PNG, no smoothing, transparent unless the table says solid.
- Draw at the native pixel size or an exact multiple (2x, 3x). Do not export at in-between sizes.
- Share images and large painted pieces: PNG or WebP.
- Send the layered source too if you have it.

## Phone notes

- Content width is 358 at a 390 screen, 328 at 360, 288 at 320.
- Card thumbnails become nearly square (120x139), so the centre of each project image is what shows.
- The community rating panel has a dragon radar grid behind it (green, drawn in code). Nothing to draw.
- Rating balls never go below 16x16 (one third size); details smaller than 3 source pixels will not survive.
