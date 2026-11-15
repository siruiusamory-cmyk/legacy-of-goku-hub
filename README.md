# Legacy of Goku Hub

LOG-HUB-003 provides signed durable recovery in the private backup repository, immutable releases, and protected public hash receipts. The public source is [legacy-of-goku-hub](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub). See [operations](docs/OPERATIONS.md) for setup, monitoring, recovery and off-platform export, and [verification](VERIFICATION.md) for measured hosted results. All configured features use GitHub Free.

Static catalog infrastructure for Legacy of Goku, Legacy of Goku II and Buu's Fury. Developers submit through a repository manifest or guided GitHub form. GitHub Actions validates, normalizes and publishes eligible listings as artifacts. An Astro static frontend is implemented for review; it is not publicly deployed. No CMS, dashboard, database, runtime AI service, monetization or production server is needed.

The existing Node 24, JSON Schema, GitHub release, Sharp image and deterministic catalog components remain in use. Legacy CLI tools and their regression tests are retained for migration, not the routine publishing path. Production has no community-approved records. Policy explicitly delists the isolated integration fixture; test data never becomes a community listing.

## Run locally on Windows

Install Node.js 24 LTS and Git, then use PowerShell:

```powershell
Set-Location C:\Users\hears\log-hub-pipeline
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run validate
npm.cmd run build
Get-Content dist\catalog.json
```

The last two commands validate/build Git-backed migration records offline. To exercise the current self-service publisher against a configured hub's public issue ledger:

```powershell
$env:GITHUB_REPOSITORY = 'YOUR-ORG/YOUR-HUB'
# Optional GH_TOKEN: read-only contents/issues access for public metadata.
# Restore the signed durable vault first using the read-only credentials in docs/OPERATIONS.md:
node src/backup-cli.js restore .previous
$env:SNAPSHOT_DIR = '.previous'
npm.cmd run publish:local
Get-Content .generated\report.json
Get-Content .generated\work\dist\catalog.json
```

Unset `SNAPSHOT_DIR` only for a genuine first publication with no previous catalog, or a deliberate administrator-managed recovery. Local commands do not download previous artifacts automatically, comment on issues, write Git branches or publish a website. Runtime dependencies remain Ajv and Sharp; YAML is test-only. Keep npm optional dependencies enabled for Sharp's platform binaries.

## Submit without editing hub source

**Method A : repository manifest:** put `.loghub.json` at the root of your public repository's default branch, then open **Register repository manifest** and supply the repository URL. Anyone may point to a manifest; the person submitting its URL does not gain edit authority. After approval, the file is read daily. Editing it updates your listing automatically.

**Method B : guided form:** open **Submit, update or claim a project**. Fill individual inputs and dropdowns, without JSON or fenced code. Select the base game, category and status, provide a title, attribution, description and image paths. The bot reads releases from GitHub. Submit from the repository owner's account, or an explicitly approved representative's account. Third-party suggestions can be reviewed but never grant control of an existing listing.

Keep the generated `###` field headings when editing an issue. Editing or closing/reopening it starts another synchronization; closed issues remain in the durable input ledger. Duplicate repository URLs, aliases and claims coalesce by numeric repository ID, not by user-supplied project identifiers. The public ID is generated as `gh-REPOSITORY_ID`; a migrated listing keeps its previous approved ID.

Validation feedback appears in the issue and in the Actions `validation-report` artifact. A review outcome identifies the reason and submission digest where relevant. Fix mechanical errors by editing the issue or manifest. Review decisions go through administrator policy, not a self-declared checkbox or bot-applied label. The artifact is the publication for this milestone; no site is deployed.

## Manifest v1

The machine contract is [schema/manifest.schema.json](schema/manifest.schema.json). An example with replaceable values is in [examples/.loghub.json](examples/.loghub.json). `schema_version` must be `1`; unknown properties and future versions are rejected.

| Field | Rule |
|---|---|
| `title` | Required, 1–100 characters |
| `developer` | Required attribution, 1–100 characters; does not establish team authority |
| `description` | Required, 20–2000 characters of trimmed plain text |
| `game` | `legacy-of-goku`, `legacy-of-goku-2`, `buus-fury`, `multiple` |
| `category` | `rom-hack`, `fan-project`, `tool`, `resource` |
| `status` | `in-development`, `released`, `on-hold`, `discontinued` |
| `cover` | Required repository-relative image path or immutable raw URL |
| `screenshots` | Optional, up to 6 unique paths/URLs |
| `asset_name` | Optional exact distribution filename; required if latest release has multiple supported assets |
| `links` | Optional, up to 6 `{label, url}` project/community links |

Do not add repository identity, owner IDs, trust flags, project IDs, featured flags, release versions, download URLs, checksums or sizes. GitHub and administrator policy supply them. A manifest cannot approve itself or override a moderation hold.

The reader resolves the default-branch commit once and reads `.loghub.json` at that SHA, capped at 16 KiB, with strict UTF-8/JSON decoding. Relative image paths are pinned to the same commit. Paths cannot be absolute, contain empty/traversal segments, spaces, backslashes or escapes. Raw image URLs must be on `raw.githubusercontent.com`, inside the same canonical repository and pinned to a full 40-character SHA. No raw-image redirects are followed.

Optional project links are HTTPS pages on `github.com`, a `*.github.io` project site, `discord.gg`, `discord.com`, `youtube.com` or `www.youtube.com`. No credentials, custom ports, fragments, direct software/game-file links or arbitrary hosts. These links are emitted as metadata, never fetched. Downloads still come exclusively from GitHub Releases. Extending the host allowlist is a reviewed code/policy change.

## Ownership, trust and approval

[policy/publishing.json](policy/publishing.json) is the administrator-controlled authority, validated by [schema/policy.schema.json](schema/policy.schema.json). Protect this file with branch review and CODEOWNERS. Login names and repository URLs are display/routing information; decisions bind to GitHub **numeric repository and owner/account IDs** obtained from the API.

| Situation | Behavior |
|---|---|
| New manifest under a trusted numeric owner ID | Mechanically valid project publishes automatically; issue author gains no claim |
| Guided form from a trusted repository owner | Automatically eligible after identical validation |
| New/untrusted owner | First publication requires an administrator policy approval |
| Previously published project, same numeric owner | Manifest and authorized guided updates synchronize without update PRs |
| Third-party suggestion | Review only; exact issue number + normalized submission digest must be approved; listing is unclaimed |
| Owner claims an unclaimed project | Actual repository control is verified; authorized updates can take over its metadata source |
| Organization member | Membership alone grants no edit authority; use the repository manifest or explicit administrator-approved representative IDs |
| Ownership dispute | Recorded for human review; the report itself cannot seize or delist a project |
| Repository rename | Resolve by stable repository ID and update canonical links |
| Repository transfer | Freeze the prior listing until policy approves the new numeric owner ID |
| Attribution/base-game/category change | Freeze until the exact new metadata digest is approved |
| Invalid manifest, missing assets, API/rate/image/download failure | Retain the previous valid listing with an unavailable warning; retry next run |
| Manifest removed | Freeze its last valid claim and metadata; do not silently return it to strangers |
| Suspended/delisted | Omit from the current public catalog; retain a recovery snapshot |

Repository control and team representation are separate facts. The `ownership` field exposes the claim plus `representation_verified`. A committed manifest establishes repository control, not authorship, licensing, development-team consent or software safety. Only an administrator can set `representation_verified: true` after checking authority. Personal owner submissions are checked by numeric account ID; a matching developer name or URL proves nothing. Existing claimants cannot carry a claim across an unapproved repository transfer.

Trust is granted by adding a verified numeric owner ID to `trusted_owner_ids` through normal administrator PR review. Removing it prevents new automatic listings; already approved listings continue normal maintenance. To revoke existing automatic-update authority as well, add the ID to `revoked_owner_ids`, or hold a specific project with `decision: "review"`. Revocation freezes the last good listing; `suspended`/`delisted` removes it from current output. Clearing a revocation/hold after investigation permits synchronization to recover.

### Exceptional human decisions

For a first-time project, review the bot's report and the actual repository, content rights, attribution and distribution. Add a policy project entry with its real `repository_id`, current `owner_id` and `decision: "approved"`. For third-party metadata, also bind `approved_issue` and `approved_digest` from the report. Editing that issue invalidates the approval. This is a content approval, not a grant of future edit authority. To authorize a team representative, explicitly list their verified numeric account ID under `representative_ids`.

For a held attribution/game/category change, review it and set `approved_metadata_digest` to the exact digest shown in the report. A transfer needs a separately verified new `owner_id`; do not approve on a matching old URL alone. Use `decision: "review"` while investigating a dispute, `suspended` for a temporary removal and `delisted` for removal. Optional `reason` explains the decision; `featured` remains administrator-owned.

Policy changes merge through normal protected PRs. They trigger publication automatically. No bot can write policy or push to the protected production branch in the routine flow. The only recurring human work is genuinely exceptional content, ownership and security review.

## Validation retained from the first milestone

All routes use the same editorial validator, image normalization, GitHub API client, release selector and catalog generator.

- Images: static PNG/JPEG/WebP, 5 MiB maximum, 20 MP maximum, 8192px maximum per side; signatures, corrupt/truncated data and animation are checked. Cover output is 640×360; screenshots 480×320. Letterboxing preserves the full aspect ratio; EXIF rotation is applied, metadata stripped and WebP optimized. Output names remain `assets/PROJECT_ID/cover.webp` and `screenshot-N.webp`.
- Releases: GitHub's latest stable release only; no drafts/prereleases or generated source archives. Supported assets: `.zip`, `.7z`, `.tar.gz`, `.ips`, `.bps`, `.ups`, `.xdelta`, `.exe`, `.msi`, `.dmg`, `.AppImage`. No ambiguity: select an exact filename if needed. Unreleased listings have `release: null`.
- File sizes, download links, version and publication dates come from GitHub. SHA-256 comes from GitHub's native asset digest, or is `null`; arbitrary release text/checksum sidecars are not interpreted. `last_updated` derives from GitHub dates, not the build clock.
- Downloads are never fetched or executed. HEAD checks follow only a bounded GitHub CDN allowlist. No `.gba`, `.gb`, `.gbc`, `.nds`, `.rom`, `.bin` distribution files; archives are not opened. Moderators remain responsible for verifying that a patch archive does not contain copyrighted ROM data.
- HTTP timeouts, byte/pixel limits, safe endpoints, bounded pagination, conditional-request support and conservative failure retention remain. No submitted repository is cloned or executed.
- The catalog is deterministic for identical snapshots and locked dependencies on the same platform. Projects sort by stable ID; title/release/update sort indexes and game/category/status filters remain available. Images are committed/copied normalized bytes; encoder equivalence across platform/library versions is not promised.

The generated contract remains [schema/catalog.schema.json](schema/catalog.schema.json), with optional ownership and project links added compatibly. Future consumers must render strings as text, not HTML.

## GitHub setup and publishing

The public source, private recovery vault, Issues, CODEOWNERS, protected source receipts and narrowly scoped backup App are configured. The [maintainer guide](docs/OPERATIONS.md) describes the exact authority and recovery boundaries. Source policy changes use protected PRs and the required `test` check. Default Actions token permissions are read-only; only the receipt job receives source contents write.

One serialized publishing workflow runs on submission issue changes, default-branch merges, a daily 07:23 UTC schedule, and manual dispatch. It restores signed durable state, reapplies current administrator policy, synchronizes eligible repositories and builds a candidate. Only after a verified private immutable snapshot and protected public receipt exist does final verification permit publication. A backup failure retains the previous verified point and blocks publication.

Published secondary artifacts retain for 30 days:

- **catalog**: JSON and normalized assets for future site consumption.
- **catalog-state**: convenient snapshot; durable recovery does not depend on its retention.
- **validation-report**: actionable submission/review/retained reasons.
- **protected-backup-receipt**: the verified private point reference.

Raw HTTP caches and administrator policy are excluded from recovery snapshots. GitHub-only bounded conditional requests remain available within a run. Restored policy is always the current protected source policy. Missing/corrupted newest recovery points block normal publication pending exact administrator rollback approval.

A daily health workflow checks signed recovery and a successful publication within 48 hours; failures create an owner-mention operations issue. GitHub Actions concurrency may coalesce pending runs, so individual notification delivery is not a guaranteed external monitoring service. No monitor can run during a complete GitHub outage.

Artifacts require GitHub download access and are not a public website endpoint. There is no frontend deployment, daily update PR, runtime AI agent or persistent server. The input ledger is capped at 1000 issues and fails explicitly at capacity.

## Migration and verification

Legacy approved Git records can seed the new publisher after an explicit numeric repository/owner policy approval. They are not silently treated as verified claims. Prefer moving them to repository manifests or guided sources. The legacy JSON form is archived outside the active Issue Template directory; its parser and tests remain. Manual legacy validation, staging/approval PR and snapshot-PR workflows are retained only for exceptional migration. Their old setup instructions are archived in [docs/LEGACY.md](docs/LEGACY.md), not the current publishing contract.

`npm test` includes the original regression coverage plus both new submission routes, root manifest restrictions, identity/claim authority, third-party approval binding, automatic maintenance, transfers, disputes, trust revocation, suspension/delisting, snapshot provenance, failure recovery and deterministic catalogs. See [VERIFICATION.md](VERIFICATION.md) for measured results and limits.

Recomp.fyi research and explicit differences are recorded in [docs/RECOMP-RESEARCH.md](docs/RECOMP-RESEARCH.md). Zeroshot is optional development-time verification only, documented in [docs/ZEROSHOT-REVIEW.md](docs/ZEROSHOT-REVIEW.md). The finished publisher works without Codex, Zeroshot or any AI account.


The candidate upload explicitly includes its hidden staging directory; download steps use normal artifact inputs.

LOG-HUB-003 hosted publication and recovery have passed. See VERIFICATION.md for exact run links, test counts, review findings and remaining operational responsibilities.

Actual issue-event processing and feedback passed in production with the isolated fixture excluded.

With the owner as sole CODEOWNER, independently authored policy PRs can be owner-reviewed; owner-authored PRs need a second designated CODEOWNER.

## Approved website design (LOG-HUB-004)

The Astro implementation, honest empty state, stable project pages, responsive directory and accurate seven-Dragon-Ball preview are ready for normal PR review. Persistent voting and public deployment remain disabled. See [the frontend report and Windows guide](docs/frontend/README.md), [rendered screenshots](docs/frontend/evidence/empty-desktop.png), [skill investigation](docs/frontend/SKILLS.md) and [independent review](docs/frontend/REVIEW.md). The site consumes signed recovery exports and never substitutes synthetic fixtures for approved projects.

Frontend CI uses the hosted runner's installed Chrome with sandboxing enabled; local Windows checks use project-local Chromium. Visual captures explicitly load and decode lazy images before inspecting them.
