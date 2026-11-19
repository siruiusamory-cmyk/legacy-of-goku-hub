# Changelog

Changes that visitors or contributors can see. Catalogue publications are not listed here; they are recorded by the moderated publication process.

## Unreleased

### Changed

- The public site has a new look modelled on a Game Boy Advance pause menu. The commissioned energy banner is the masthead at its native 960x160, and the fourteen commissioned Dragon Ball sprites show every rating at exact pixel sizes (48, 24 or 16).
- The four menu tabs are equal width and sit together like folder tabs.
- Panels, cards and the featured project use cut-corner menu frames with gold tab titles.
- The community rating panel sits on a dragon radar grid. Rating balls start grey; hovering or choosing one lights it and every ball before it. On phones the seven balls sit four over three.
- On phones the directory is a list of equal-height rows with the thumbnail on the left.
- The empty catalogue and the not-found page use plain, factual wording.

### Added

- Owner-approved publications can merge by themselves once the required checks pass, so the owner no longer has to press Merge on GitHub. Off by default; the owner turns it on separately. The publication job checks that the pull request holds exactly the approved content before asking GitHub to merge it, and never merges anything itself.
- The dashboard says whether GitHub will merge an open publication by itself, and shows the reason when automatic merge could not be turned on.
- Directory cards show a short project summary and the date the listing was last updated (screens wider than 580px).
- A Recently Updated list on the home page links to the three most recently updated projects.
- A measured reference pack for the artist in `docs/reviews/log-hub-019/`.

### Fixed

- Game, category, status and repository are shown once on a project page instead of being repeated in the side column.
- The release panel appears only for projects that have a release.
- Lit and grey rating balls now line up. The sprites sit off-centre in their files, so the site shows only the 48x48 ball.
