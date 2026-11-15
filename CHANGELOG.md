# Changelog

## LOG-HUB-003 (operational verification in progress)

- Added signed, content-addressed recovery snapshots in a separate private GitHub repository.
- Added immutable private recovery releases and protected public hash receipts without a paid GitHub plan.
- Split synchronization, backup, receipt creation and publication; unbacked candidates cannot become published catalogs.
- Added integrity checks, explicit rollback authorization, non-destructive restore/export and backup-health monitoring.
- Added eleven recovery tests using real local Git objects alongside the existing 47 regressions.
- Created the public source and private recovery repositories, configured backup-only App credentials and kept production disabled during verification.
- Hosted workflow verification and independent review results will be recorded before enabling production.

## Self-service milestone

- Added repository manifests, guided forms, numeric-ID claims, explicit trust policy and automatic eligible-project synchronization.
- Retained static catalog generation, GitHub-only releases, image normalization and failure retention.
- Verified 47 local tests and obtained a scoped independent source review.
