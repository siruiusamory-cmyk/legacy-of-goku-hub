# LOG-HUB-017 migration plan

This is the proposed data and rollout contract accompanying the [authority decision](log-hub-017-authority.md). It defines future versioned migrations before implementation. It installs no migration and authorizes no production operation.

## Stored representations

Keep the existing intake D1 database, legacy tables, receipt hashes, public/private notes and audit history. Ratings stay in their separate database. No identifier, ownership claim, current Featured flag, approved image or signed recovery point is regenerated. Existing version-1 records remain readable.

New tables below use integer Unix timestamps, bounded canonical JSON for structured values, opaque 24-character IDs and explicit CHECK constraints for enums/booleans/versions. SHA-256 values use the encoding of the existing package contract where applicable. State versions are positive monotonic integers. Foreign keys retain history through `ON DELETE RESTRICT`; deleting/expiring an intake proposal must never cascade-delete its canonical attempt or decision ledger. Existing `admin_reviews.submission_id` cascade behavior is handled by storing canonical package/evidence independently before cleanup can remove a projection.

## Versioned additive migrations

| Migration | Defined change | Phase |
| --- | --- | --- |
| `0003_publication_authority.sql` | Add session establishment/epoch fields and the private control/authority history. | 2 |
| `0004_publication_attempts.sql` | Add attempts, decisions, events, durable jobs and finite legacy bindings. Add nullable projection links. | 2 |
| `0005_publication_overrides.sql` | Add exact override records and invalidation/consumption events. | 3, with check classifications populated in 6 |
| `0006_candidate_provenance.sql` | Add candidate origin, research provenance and deferral fields to existing proposals. | 5 |

Migration numbering is reserved by this plan only. Confirm actual pending migrations again before implementing. Every migration is applied first to a copy of the existing schema/data in isolation. No production table is dropped or reset.

### `0003` authority and sessions

| Table/column | Exact data contract |
| --- | --- |
| `admin_sessions.established_at INTEGER NOT NULL DEFAULT 0` | Trusted server creation time for new sessions. Zero means historical/unknown and cannot pass sensitive freshness checks. |
| `admin_sessions.authority_epoch INTEGER` | Epoch observed when the new session is established. Historical sessions remain NULL. |
| `publication_control` | Exactly one row with `id=1`, `schema_version`, `mode` (`shadow` or `authoritative`), `authority_epoch` nullable until provisioned, private `owner_config_hash`, `promoted_at` nullable and `updated_at`. All promoted writers and verifiers read this same row. |
| `publication_authorities` | `epoch` positive integer primary key, private issuer/audience/subject/normalized email, their `config_hash`, `created_at`, operator reference and authorization/evidence reference. Each epoch is append-only. Only the separately authorized configuration procedure can initialize or change the active epoch. |

The hash binds canonical issuer, expected audience, exact subject and normalized email. Runtime additionally requires current administrator allowlist membership. A runtime configuration/hash/epoch mismatch blocks owner decisions, consumption of owner-authorized publication jobs and unused overrides. Ordinary authenticated administrator review/preparation and authorized anonymous/receipt operations continue under their own guards. No login or processor callback initializes an epoch.

Provisioning uses a fresh real owner Access login and the existing JWT verifier. An authorized operator checks the actual issuer/audience/subject/email privately, provisions `OWNER_ACCESS_SUB` and `OWNER_ACCESS_EMAIL` as protected configuration, then performs the explicit authority initialization transaction. It inserts a new epoch, updates control, invalidates prior owner sessions and unused overrides and appends the configuration audit event. During a partial configuration change the mismatch fails closed. A changed owner needs a new epoch and new dashboard session. Store only verification references, never raw JWTs or credentials.

### `0004` attempts, approvals and audit

| Table | Fields and constraints |
| --- | --- |
| `publication_attempts` | `id` primary key, immutable `project_id`, `operation`, nullable `submission_id`/`legacy_review_id`, `content_revision`, `package_digest`, `source_revision`, `base_policy_digest`, `state`, `state_version`, `priority` (`normal` or `expedited`), nullable `approval_id`/`override_id`, `prepared_package_json`, nullable `pr_number`/`pr_head_sha`/`merge_commit_sha`, `deployment_evidence_json`, `verified_outcome`, `checkpoint_json`, `provenance` (`canonical` or `legacy_unknown`), `created_at`, `updated_at`, nullable `finished_at`. Identity must be resolved before row creation. Exact package/source fields may be NULL only before preparation has completed and can never be NULL for approval or later states. |
| `publication_approvals` | `id` primary key, `attempt_id` foreign key, `attempt_version`, `project_id`, `operation`, `content_revision`, `package_digest`, `source_revision`, `base_policy_digest`, `authority_epoch`, private verified owner subject/email, `mode` (`ordinary`, `editorial_override`), nullable `override_id`, reason, confirmation timestamp and creation timestamp. Immutable decision fields. A current pointer does not restore an invalidated decision. |
| `publication_events` | Monotonic integer `id`, nullable attempt reference for configuration events, project ID, actor type, private verified actor identity/reference, old/new state, old/new state version, action, reason, approval/override references, package/source identity, bounded external-evidence JSON, timestamp, `idempotency_key` and `request_digest`. Append-only application interface, with SQL UPDATE/DELETE rejection triggers. Unique `(attempt_id, idempotency_key)` for attempt events and a separate unique configuration-event key. |
| `publication_jobs` | Opaque job ID, attempt ID, action, expected attempt version, package/source/authority bindings, priority, unique idempotency key, status (`pending`, `leased`, `complete`, `invalidated`), lease expiry, attempt count, last error reference, created/updated timestamps. Durable transactional dispatch intent using the existing D1/processor mechanism. No new queue service. |
| `publication_legacy_bindings` | Stable project ID and exact finite approved content/artwork/policy fingerprint, observed signed point/build reference and import timestamp. Explicit `legacy_unknown` approval provenance. This preserves unchanged baseline content without asserting a historical Access-owner approval. |
| Projection columns | Add nullable `attempt_id` to `admin_reviews` and nullable `current_attempt_id` to `submissions`. Their state text and existing history remain compatibility views. They cannot independently authorize or report a new publication after promotion. |

Use primary/foreign keys and indexes on `(project_id, created_at)`, `(submission_id, created_at)`, `(state, updated_at)`, PR identity, event attempt/order and job status/priority/time. Add a partial unique index allowing one current nonterminal attempt per resolved project. Proposal revisions remain staged while that project is merged/awaiting verification. Add unique `(attempt_id, attempt_version, package_digest)` approval binding. Existing `admin_active_submission` is retired only after canonical capacity/uniqueness checks replace it in the promoted adapters; legacy data remains intact.

`state` is restricted to the 16 states in the authority decision. `verified_outcome` is NULL until trusted verification. Valid successful values include `available`, `withdrawn`, `featured` and `unfeatured`, bound to the operation. Only `verifying_live → published` writes the successful outcome/evidence/finished time. Terminal attempts cannot be reopened.

`deployment_evidence_json` validates exact repository/workflow run/job IDs, PR/head/merge/source commit, signed point/snapshot/policy digest, Pages deployment/manifest digest, observed content/artwork digest and operation outcome. Unknown or incomplete observations are retained as diagnostic provenance and cannot satisfy the success guard.

### `0005` exact overrides

`publication_overrides` stores ID, attempt/project/revision, package/source/authority bindings, optional bound PR head, owner approval reference, private verified owner subject, kind (`editorial` or `noncritical_automation`), individually selected policy check IDs, original failure results and trusted run references, written reason, explicit confirmation time, issued/expiry timestamps, nullable consumption/revocation timestamps and final-outcome reference. The selected-check JSON is server-validated against a reviewed classification policy. Unknown classifications are blocked.

The original failure and issuance fields remain immutable. Consumption/revocation are guarded one-time updates with append-only events in the same transaction. A unique attempt/authorization consumption reference prevents reuse. Expiry, owner-epoch change, digest/source/head change, cancellation, supersession or failed mandatory protections invalidates eligibility before dispatch, before PR/merge acceptance and before deployment acceptance. Consumed authorizations remain auditable, but do not authorize another attempt. No raw tokens are stored.

The policy categories are `informational`, `editorial_overridable`, `noncritical_automation_overridable`, `security_mandatory`, `integrity_mandatory` and `unclassified_blocked`. Existing security/integrity guards remain mandatory. Phase 6 proposes check splitting and a distinct protected gate that records eligible exceptions without changing failed test results. Applying required-check/protection configuration waits for explicit owner authorization.

### `0006` candidate provenance

Extend the existing proposal with `origin` (`community` or `administrator_candidate`, default `community`), nullable `research_json` and nullable `deferred_until`. Research JSON contains verified public source URLs, verification date, evidence-grounded metadata, artwork provenance, uncertainties and duplicate assessment. Administrator identity is recorded privately in the existing/canonical history. Candidate staging creates no public authority and grants no ownership.

Batch selection uses existing capacity of at most six unfinished packages and bounded serial processing. Every item has its own exact package and owner decision. Strict base-commit protection means PR preparation is serialized against current main. A later main change requires fresh preparation/approval, not automatic policy recomposition or blanket approval. Additional parallelism requires demonstrated Free-tier/resource need and separate review.

## Atomic transition and callback contract

One shared transition function is used by intake adapters, browser handlers and processor/reconciler handlers. It checks actor permission from the authority table, exact state/version, current submission revision, immutable project identity and the required package/source/checkpoint guards. Current owner configuration/epoch is mandatory for owner-only transitions and execution derived from an owner approval or override. Basic administrator review/preparation, anonymous proposal creation and permitted receipt revisions use their existing identity/origin/revision guards without requiring configured owner pins.

For a new idempotency key, a single D1 transaction conditionally updates `publication_attempts ... WHERE id=? AND state=? AND state_version=?`, increments the version, appends its event and updates compatibility pointers/state. Required dispatch intent is inserted into `publication_jobs` in that transaction. Use the existing batch/conditional `changes()` pattern, with tests that a failed state update cannot append an event or job. The service verifies the expected affected-row counts and returns conflict on a stale write.

A duplicate callback first finds its previously committed event. Same key and same canonical request digest returns its saved result without a new transition. Same key with different content is rejected. A callback arriving after cancellation, supersession, epoch/revision change or lease invalidation cannot advance state, even if it was once valid. Workers must reject callbacks whose expected version/package/source differ.

External GitHub calls occur outside the D1 transaction. Deterministic attempt branch names and PR lookup reconcile interruptions. After a crash, a processor independently inspects the actual remote branch/PR/head/tree before accepting a checkpoint. A branch-exists response alone is insufficient. A failure following a successful PR creation must recover that exact PR rather than create a second one. Approved content and state never advance merely because dispatch returned successfully.

Private final-approval data is written only by pinned-owner browser/configuration operations. The processor's read-only authorization response is derived from those rows. Protected main publication validation checks every new/changed editorial or policy projection against that exact authorization and actual PR diff. A processor callback, legacy CLI policy file or submitted opaque reference cannot create its own approval.

## Compatibility mapping and historical evidence

| Legacy data | Migration/projection rule |
| --- | --- |
| Submission `received`, `in-review`, `needs-changes`, `rejected` | Preserve proposal row and map display to canonical spelling. Link actual history. Create a stable-ID attempt only when trusted identity resolution succeeds. No invented prior attempt events. |
| Review `queued`, `processing`, `ready` | Preserve row. Shadow observation may identify `preparing` or `prepared` only with actual package/source and current revision evidence. Before promotion, require a fresh preparation when incomplete. |
| Review/submission `approved` | Preserve original label/history as legacy evidence. No Access-owner approval is backfilled. Reapproval by the pinned owner is required for new publication. |
| Review `publishing`, `pr-open` | Reconcile actual matching PR/head/merge first. Unmerged legacy work needs new owner approval. Already merged work is inspected through trusted deployment evidence and never cancelled by fiction. |
| `failed`, `dispatch-failed`, `stale`, `expired` | Retain original state/error privately. Import only independently verified checkpoints. Unknown history stays `legacy_unknown` and is not dispatchable. |
| Submission `published` or existing live catalog | Keep current visibility under finite verified baseline fingerprints. Do not fabricate owner approval or exact historical attempt success. Import a `published` attempt only when complete actual operation/deployment evidence independently supports it. |
| Successful suspension/delist | Canonical attempt `published`, outcome `withdrawn`. Legacy receipt/display adapters clearly show withdrawal rather than claiming public availability. |

Current live verification is stricter than the baseline presence check. For new/updated listing publication it compares the exact approved normalized public content/artwork revision. Featured replacement/removal checks the unique selected identity or absence. Withdrawal checks absence plus the approved operation. A newer successful deployment containing the same project ID cannot prove this attempt's requested revision.

## Controlled rollout, reconciliation and rollback

1. Apply each proposed migration to isolated snapshots of the existing schema, including legacy rows with NULL/missing evidence, old state spellings, artwork-free records and active interrupted jobs. Verify row counts, receipt/claim/ID preservation, foreign keys, capacity indexes and immutable old artwork bytes.
2. Deploy compatible readers/writers in isolation with `publication_control.mode=shadow`. Only the legacy path remains authoritative in that mode. Shadow observations cannot approve, dispatch, set published or manufacture owner identity. Compare all proposal/review/PR/live views and investigate mismatches.
3. Prepare a concrete production change packet with exact migrations/code versions, private owner-identity verification procedure, retained baseline fingerprints, original configuration and rollback versions. Obtain owner authorization for production migration, owner configuration and coordinated rollout.
4. Under that authorization, preserve live data privately and reconcile active jobs/PRs. Roll out compatible intake/admin Workers and protected processor/publication verifier before promotion. Verify owner pins/epoch and fresh sessions. Existing old decisions are preserved but cannot become new owner approvals.
5. Atomically promote the shared control row only when every participating writer/reader uses the canonical adapters and private authorization verification. Existing signed catalog remains available during reconciliation. After promotion only canonical attempts can authorize new work or establish new published outcomes.
6. Compare receipt/dashboard/protected PR/live views for representative isolated scenarios before relying on production promotion. Then run read-only production checks, checking all existing IDs, ratings, claims, Featured flags, notes and recovery identity.
7. Roll back code only to a release that understands the new schema/control and retains owner-only authority. Do not drop additive tables, erase events or revert to unrestricted legacy approval/status writers after promotion. If execution must pause, retain the canonical mode and fail closed for new publication while diagnosing. Reverting public content uses a new approved corrective attempt and current publishing policy.

Existing intake expiry currently cascades review deletion. Once a review links an attempt, canonical evidence/approval/audit stays independently stored with restrictive links or copied source provenance, and the expiry adapter deletes only disposable receipt/private artwork projections according to the retained policy. Full raw artwork keeps its existing bounded seven-day cleanup. Canonical decisions and transition metadata are retained while the listing or an unresolved attempt depends on them, with private backup/export and an explicitly reviewed future retention policy. No silent audit pruning is introduced. D1 rows and application append-only triggers are not cryptographic immutability.

## Focused migration and implementation verification

- Exercise every allowed transition and reject every other actor/state pair. Include a second allowlisted administrator, incorrect/missing owner pins, exact subject mismatch, allowlist removal, epoch change and expired/revoked session.
- Exercise duplicate same/different callbacks, two concurrent state versions, correction racing approval, lease expiry, dispatch failure, PR-created callback loss, changed PR head and merge racing cancellation. Assert state/event/outbox consistency.
- Verify no legacy CLI/policy/manifest path can grant new owner approval, and no incoming metadata refresh can publish a new approved editorial revision through an old digest.
- Verify zero-art GitHub/external preparation and signed export/recovery, placeholders in card/detail/Featured, deliberate omission of failed art and continued safe-image/path/hash rejection. Existing approved image bytes must match baseline hashes.
- Verify owner exception issuance/expiry/revocation/consumption and all mandatory failures. Preserve original failing-check evidence and require the reviewed protected gate configuration before live waiver operation.
- Verify post-publication image/link edits preserve stable ID, rating rows, project URL, claim and Featured relationship. A failed replacement retains the last verified public revision.

This plan defines migration contents and invariants. Its SQL and transition implementation receive focused tests and independent review in their owning phases before any production authorization request.
