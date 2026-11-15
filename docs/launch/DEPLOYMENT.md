# Deployment and rollback checklist: do not execute before owner authorization

This document is a plan, not authorization. Neither Pages nor `SITE_DEPLOYMENT_ENABLED` was enabled. `PUBLISHING_ENABLED=true` already permits signed **catalog artifacts**, not website deployment. The initial approved catalog is currently empty.

## Before the owner launch decision

- [ ] Accept the [ratings strategy](RATINGS.md); review/merge disclosure [PR #29](https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/pull/29) or approve an equivalent honest non-voting treatment. Keep approved visual design.
- [ ] Decide which initial candidates may publish, approve exact current content/artwork through separate policy PRs, confirm attribution/representation and reject ROM-hosting or misleading release claims. DragonByte Z cannot submit without a suitable owner-approved cover. Do not silently substitute fixtures or placeholders. An intentionally empty launch requires explicit owner acceptance instead of pretending candidates are listed.
- [ ] Resolve/document owner's disposition of the unverified game-art redistribution rights in [credits](../../website/src/assets/CREDITS.md). Maintainer authorization is not a rights-holder license; no new legal clearance is claimed.
- [ ] Name the launch operator and backup maintainer, confirm Actions failure notifications and daily health monitoring, and copy a verified recovery kit to independently controlled storage. The existing export ZIP on the development disk is not off-platform protection. Preserve source, current policy/public verification keys, dependency lock/cache, export and external checksum; never include secrets. Follow [operations](../OPERATIONS.md).
- [ ] Review the current main SHA, policy diff, required `test` and frontend `browser` results for the launch code. Run relevant focused checks for changes; reuse valid prior evidence. `browser` is a release checklist requirement even though only `test` is branch-protection-required. Confirm catalog synchronize/backup/anchor/**publish**/website succeeded and health is within 48 hours. Recheck Pages remains disabled until the explicit go decision.

## URL and build

Default proposed URL: `https://siruiusamory-cmyk.github.io/legacy-of-goku-hub/`. Existing `catalog.yml` website job hardcodes `SITE_BASE: /legacy-of-goku-hub/`; internal routes and asset URLs use that base. No custom domain is configured. Owner must choose the URL. A root/custom-domain deployment needs a separately reviewed base-path/workflow change (typically `/`) and DNS/domain ownership/verification, not just a new Actions variable. Astro has no configured absolute `site`/canonical URL; add one only if the approved URL/SEO scope requires it.

Safe local check, with a **fresh signed export** obtained using approved read-only vault credentials via [operations](../OPERATIONS.md):

```powershell
node src/backup-cli.js verify-export C:\SafeExports\CURRENT-EXTRACTED-EXPORT
$env:SITE_BASE = '/legacy-of-goku-hub/'
node tools/site/build.js --snapshot C:\SafeExports\CURRENT-EXTRACTED-EXPORT
node tools/site/check-deployment.js
$env:SITE_SERVE_DIR = '.site/production'
$env:PORT = '4324'
node tools/site/serve.js
```

Inspect `http://127.0.0.1:4324/legacy-of-goku-hub/` with the same `SITE_BASE` setting in that shell. Check generated `catalog.json`, `site-provenance.json` purpose `production`, exact signed point, expected project identities and assets. Fixtures/real-preview directories must never be uploaded. Production builder independently checks signatures and current policy; deployability check rejects preview provenance. Export provenance may correctly name the older unchanged recovery source commit: verify current source/policy separately rather than demanding a new snapshot for unchanged data.

## Only after a separately recorded owner go decision

1. Record approved launch SHA, URL, catalog point, listings/artwork decisions and accountable operator. Reconfirm gates above.
2. In repository Settings → Pages choose **GitHub Actions**, approve the `github-pages` environment and restrict it to protected main; add environment approval if available/desired. Do not weaken branch or receipt protections. Configure/verify custom DNS only if separately chosen. Verify/enforce HTTPS when GitHub provisioning permits; check certificate and HTTP→HTTPS behavior, no mixed content. Default `github.io` needs no custom DNS.
3. Set `SITE_DEPLOYMENT_ENABLED=true` only under that authorization; retain `PUBLISHING_ENABLED=true`. Run the existing catalog workflow from approved main. No new workflow is needed. `website` depends on successful final catalog publication, exports/verifies signed recovery, builds with current policy, checks source revision and production provenance, then uploads Pages output. `deploy-website` checks current main again and holds Pages/id-token write permission; earlier jobs do not.
4. Capture the successful Actions run, final receipt, website/provenance, deployment URL and SHA. If checks fail or source changes, discard the stale build and rebuild from current approved main. Do not upload old local output to bypass the pipeline.
5. Smoke-test HTTPS home, direct detail URL/reload, 404, base-path assets/fonts, all game/category filters, navigation, repository/community links, submit/report issue chooser and truthful no-release/no-download/unrated states. Check 320/390px and desktop, keyboard focus/skip link and a screen reader. Confirm no fixture names/counts or unapproved art in downloaded HTML/catalog/assets and preview votes never appear submitted. Test real release links only where actual releases exist; currently none do.
6. Recheck protected point/current policy and Actions health; record outcome and maintainers' notification ownership. Public CDN propagation is not instantaneous. Monitor the next scheduled 07:23 UTC cycle.

## Emergency removal, suspension and rollback

1. For a publishing/security incident, owner/operator sets `SITE_DEPLOYMENT_ENABLED=false` and, when appropriate, `PUBLISHING_ENABLED=false`; cancel queued/running deployment jobs. These stop future writes, **do not remove an already served site**, and do not recall downloaded artifacts. If content must disappear immediately, unpublish Pages in Settings and verify URLs are unavailable after propagation. Record incident/time and preserve private evidence. Do not delete recovery tags or releases.
2. For a single harmful listing, apply a reviewed current identity-bound suspension/delisting, revoke inappropriate artwork sets and rebuild under current policy. An urgent whole-site unpublish can precede that PR; never bypass policy review by editing generated files. Inspect the rebuilt output, then owner explicitly authorizes republishing. Remove affected historical public Actions/Pages artifacts and address downstream caches/copies as feasible; immutable private history remains private evidence.
3. For frontend regression, prepare a normal reviewed revert PR from a known good code revision while preserving **current** moderation/recovery policy. Require current checks and rebuild from the verified snapshot. Do not redeploy an old site artifact that could revive withdrawn artwork.
4. For missing/corrupt latest recovery, use `node src/backup-cli.js inspect C:\SafeExports\NEW-INSPECTION` for inspection only. A separate administrator-approved recovery-policy PR must pin exact `rollback.point`, `rollback.observed_newest` and reason. No automatic older fallback, empty initialization or key rotation. After successful verified recovery, remove temporary rollback authorization by PR. See [operations](../OPERATIONS.md) for credential compromise/offline account-loss recovery.
5. Reenable publishing/deployment only after incident resolution and owner authorization; record new source SHA, successful signed publication and smoke tests. Old signatures prove integrity, not current permission.

References: existing [catalog workflow](../../.github/workflows/catalog.yml), [frontend checks](../../.github/workflows/frontend.yml), [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https), [custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).
