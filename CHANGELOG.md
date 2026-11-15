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
- Hosted guided submission and protection-denial checks passed; cancelled one prematurely sequenced test and reran after verifying the fixture prerequisite.
- Independent review reproduced alert self-test interference and concurrent issue creation; isolated test alerts and serialized all production writers with regressions.

## Self-service milestone

- Added repository manifests, guided forms, numeric-ID claims, explicit trust policy and automatic eligible-project synchronization.
- Retained static catalog generation, GitHub-only releases, image normalization and failure retention.
- Verified 47 local tests and obtained a scoped independent source review.

- Correct limited-token ruleset visibility in the hosted drill; retain explicit bypass rejection and owner-side verification.

- Invalidate GitHub read caches after successful mutations, with a reproduced alert-cleanup regression.

- Include the hidden candidate staging directory in Actions uploads while excluding the raw HTTP cache; real production failure stays fail-closed and opens a maintainer alert.

- Keep the hidden-file setting on the upload action only.

- Complete hosted manifest/guided registration and update verification, production publication, artifact-loss recovery, offline export/restore, alert lifecycle and backup health. Record actual failures and scoped independent review outcomes.

- Record successful issue-event production and feedback verification.

- Clarify the sole-CODEOWNER review boundary for future owner-authored changes.
