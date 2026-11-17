# Legacy of Goku Hub documentation

The **[public website](https://legacyofgokuhub.com/)** is the place to browse and submit projects. This repository is the source for the site and its supporting services.

Documentation is organized below by reader and purpose. Some files retain historical milestone evidence; they should not be read as current deployment status or instructions.

## For community members

- [How to submit, suggest, correct, or claim a listing](../CONTRIBUTING.md#add-or-correct-a-community-project)
- [Public submission form](https://legacyofgokuhub.com/submit/)
- [Submission status lookup](https://legacyofgokuhub.com/submit/status/)
- [Report inappropriate or misleading project content](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/issues/new?template=report.yml)
- [Ratings privacy](https://legacyofgokuhub.com/ratings-privacy/)

## For project developers

- [Contributing to the Hub](../CONTRIBUTING.md)
- [Repository manifest schema](../schema/manifest.schema.json)
- [Example `.loghub.json`](../examples/.loghub.json)
- [Moderation and publication policy](moderation.md)

Artwork is optional. Repository control, project attribution, team representation, and permission to redistribute artwork are distinct matters.

## For maintainers and code contributors

- [Source contribution guide](../CONTRIBUTING.md#contribute-to-the-hubs-source-code)
- [Operational reference and recovery](OPERATIONS.md)
- [Administrator service](launch/ADMIN.md)
- [Submission service](launch/SUBMISSIONS.md)
- [Deployment and rollback reference](launch/DEPLOYMENT.md)
- [Ratings service](launch/RATINGS.md)
- [Publishing authority and migration design records](decisions/log-hub-017-authority.md)
- [Verification record](../VERIFICATION.md)

**Operational caution:** The repository contains dated setup guides and launch checklists alongside current source. Confirm the production hostname, Cloudflare/GitHub configuration, current schemas, and signed deployment state before performing an operational change. Old activation instructions must not be repeated blindly.

## Historical design and implementation records

The following preserve decisions and test evidence from earlier development phases, including statements that were accurate only at the time:

- [Launch-readiness assessment](launch/README.md)
- [Frontend design report](frontend/README.md)
- [Visual identity and refinement](frontend/visual-identity/README.md)
- [Typography design](frontend/typography/README.md)
- [Legacy pipeline documentation](LEGACY.md)
- [Original verification record](../VERIFICATION.md)

Historical reports are not public feature announcements or current service-status pages. Refer to the [live website](https://legacyofgokuhub.com/) and the deployed source/manifests for current public functionality.
