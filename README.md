# Legacy of Goku Hub

**A community directory for projects inspired by the *Dragon Ball Z: Legacy of Goku* games.**

Discover and share ROM hacks, fan projects, modding tools, disassemblies, and resources for *The Legacy of Goku*, *The Legacy of Goku II*, and *Buu's Fury*.

**[Explore projects](https://legacyofgokuhub.com/)** · **[Submit a project](https://legacyofgokuhub.com/submit/)** · [Check submission status](https://legacyofgokuhub.com/submit/status/) · [Join the community](https://discord.gg/P8qC69G3sU)

## Explore the directory

The [public catalogue](https://legacyofgokuhub.com/) brings community work together in one searchable place. You can:

- Browse by game, project type, or development status.
- Search for specific projects and follow links to their repositories, websites, or approved download pages.
- Discover featured projects, see what was recently updated, and read a short summary of what each one does.
- Rate listed projects with the site's seven-Dragon-Ball rating system, without creating an account.

Listings may cover released projects, works in progress, and useful tools or documentation. Not every project has a download or artwork.

## Submit, suggest, or update a project

**[Use the submission form](https://legacyofgokuhub.com/submit/)** — no account or GitHub repository required.

| Choose | When to use it |
| --- | --- |
| **Add** | You created or maintain a project and want it listed. |
| **Suggest** | You found someone else's project that belongs in the directory. |
| **Correct** | An existing listing needs an update or correction. |
| **Claim** | You created a listed project and want to verify your connection to it. |

Provide the project's name, a short description, and a link if one exists. Additional details and images are helpful but artwork is **optional**.

A moderator reviews submissions before anything is added or changed. Suggesting a project does not give you ownership or editing rights over its listing. Claims of project control require verification.

Keep the receipt provided after submitting; it lets you [check your submission's status](https://legacyofgokuhub.com/submit/status/).

Prefer GitHub? [Repository-based submission options](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/issues/new/choose) are also available.

## Ratings, safety, and reporting

Ratings are anonymous and tied to a credential saved in your browser. You can change or remove your rating from the same browser. See [how ratings and privacy work](https://legacyofgokuhub.com/ratings-privacy/).

The Hub links to community projects; **it does not host commercial game ROMs**. Project descriptions, external links, and supplied artwork are reviewed before publication. Inclusion in the directory does not by itself mean a project's creator has claimed or endorsed its listing.

To flag misleading information, inappropriate artwork, or an ownership concern, [report project content](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/issues/new?template=report.yml).

## For project developers

If your project has a public repository, you can optionally maintain its metadata in a `.loghub.json` file at the repository root. This is an alternative to manually entering all listing details; publication still requires review.

- [Manifest format](schema/manifest.schema.json)
- [Example manifest](examples/.loghub.json)
- [Submission guide](docs/launch/SUBMISSIONS.md)

## About this repository

This repository contains the source for the Legacy of Goku Hub website and its submission, moderation, catalogue, and publication tooling. The site uses Astro, Cloudflare Pages, Cloudflare Workers/D1, and GitHub Actions. Catalogue updates go through a moderated, protected publication process.

The administrator Worker stays disabled in the committed default configuration; authorized production deploys use the explicit `admin/wrangler.production.jsonc`. The administrator dashboard sits behind Cloudflare Access and starts its own session once Access has confirmed the owner, with no separate sign-in click or expiry countdown.

For those contributing to or operating the Hub:

- [Owner runbook](docs/OWNER-RUNBOOK.md): running the Hub day to day from the administrator dashboard
- [Contributing to the Hub](CONTRIBUTING.md)
- [Documentation index](docs/README.md)
- [Changelog](CHANGELOG.md)
- [Visual design notes and artist reference pack](docs/reviews/log-hub-019/review.md)
- [Moderation and content policy](docs/moderation.md)
- [Maintainer operations and recovery](docs/OPERATIONS.md)
- [Administrator documentation](docs/launch/ADMIN.md), including automatic publication tracking, failure recovery, submission deletion and automatic merging of owner-approved publications (on in production since 2026-11-18; turned off by removing `ADMIN_AUTO_MERGE_ENABLED`)
- [Auto-merge integration evidence and owner decision report](docs/reviews/log-hub-023/REPORT.md)
- [Deployment documentation](docs/launch/DEPLOYMENT.md)

Legacy of Goku Hub is an **unofficial community project**. The games and associated trademarks belong to their respective owners.
