# Contributing to Legacy of Goku Hub

Thank you for helping document and support the *Legacy of Goku* community. There are two different ways to contribute:

## Add or correct a community project

Use the **[public submission form](https://legacyofgokuhub.com/submit/)**. No GitHub account is required.

- **Add:** Submit a project you created or maintain.
- **Suggest:** Recommend somebody else's project.
- **Correct:** Report changes needed on an existing listing.
- **Claim:** Request verification of your connection to a listed project.

A submission receipt lets you [check its status](https://legacyofgokuhub.com/submit/status/). Images, a GitHub repository, and downloadable releases are not required for a listing. All proposed listings and changes receive moderation before publication.

AI-assisted projects are welcome. Low-effort projects made mostly by AI are not listed.

If you prefer a repository-based route, use the [GitHub submission forms](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/issues/new/choose). Repository authors can also provide a [`.loghub.json` manifest](schema/manifest.schema.json); see the [example](examples/.loghub.json).

A suggestion does not give you control of another creator's listing. Ownership claims are checked separately.

## Contribute to the Hub's source code

This repository contains the Astro website and the GitHub Actions/Cloudflare services that operate it. To propose a source change:

1. Review the [documentation index](docs/README.md), existing issues, and relevant source.
2. Fork the repository or create a branch with a focused change.
3. Keep changes scoped; describe the user-facing behavior and any compatibility implications.
4. Run appropriate targeted checks. The project uses Node.js 24; the usual starting point is `npm ci --ignore-scripts` followed by `npm test`. Frontend changes may also need `npm run test:site` and browser checks.
5. Open a pull request against `main`, explaining what changed and how it was verified.

Do not edit live project data or publishing policy as a substitute for a moderated submission. Code changes and project-content approvals follow different processes.

## Content and safety

- Do not commit or attach copyrighted commercial game ROMs, unapproved project artwork, or executable game files.
- Only submit images and project information you have a legitimate basis to share; attribution alone is not a redistribution license.
- Never include passwords, access tokens, private moderation notes, session receipts, or private user information in issues or pull requests.
- Do not copy test fixtures, preview art, or demonstration projects into the production catalogue.
- Do not publish suspected credentials or security vulnerabilities in public issues. Contact the maintainer privately through an established contact channel.

For questions and discussion, see the [community Discord](https://discord.gg/P8qC69G3sU). For project-content problems, use the [report form](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/issues/new?template=report.yml).

Legacy of Goku Hub is an unofficial fan-community project. Its code and the games' third-party artwork can have different licensing and reuse conditions.
