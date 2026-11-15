# Changelog

## LOG-HUB-003 (operational verification in progress)

- Added signed, content-addressed recovery snapshots in a separate private GitHub repository.
- Added immutable private recovery releases and protected public hash receipts without a paid GitHub plan.
- Split synchronization, backup, receipt creation and publication; unbacked candidates cannot become published catalogs.
- Added integrity checks, explicit rollback authorization, non-destructive restore/export and backup-health monitoring.
- Added eleven recovery tests using real local Git objects alongside the existing 47 regressions.
- Created the public source and private recovery repositories, configured backup-only App credentials and kept production disabled during verification.
- Hosted workflow verification and independent review results will be recorded before enabling production.
- Hosted CI passed and the initial signed immutable recovery point plus protected receipt were created successfully.
- Independent review prompted revision pinning/current-policy guards, complete uploaded-image verification and immutable-tag commit binding, with regression coverage.
- Added isolated live-GitHub fixture scenarios, purpose-separated integration recovery and offline signed-export verification.
- Hosted manifest registration and automatic-update tests passed, with recovery after actual Actions state-artifact deletion.
- Added direct immutable/protected-tag denial probes and deduplicated owner issue alerts for backup/publication failures.

## Self-service milestone

- Added repository manifests, guided forms, numeric-ID claims, explicit trust policy and automatic eligible-project synchronization.
- Retained static catalog generation, GitHub-only releases, image normalization and failure retention.
- Verified 47 local tests and obtained a scoped independent source review.
