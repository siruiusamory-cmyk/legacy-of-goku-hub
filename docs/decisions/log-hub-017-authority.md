# LOG-HUB-017 authority contract

Status is proposed for phased implementation. This Phase 0 decision records the owner's supplied authority model and the verified baseline at `073722983d0999c62dfbd9f9508c3836b5917e1e`. Runtime enforcement and production configuration follow separately reviewed phases. The companion [migration plan](log-hub-017-migrations.md) defines their data contracts and cutover.

## Baseline audit

References below identify files and starting lines at the baseline commit. Live protection was read on November 16, 2026. LOG-HUB-015 and LOG-HUB-016 provide applicable deployed and isolated evidence, with the latter retaining its CONDITIONAL GO verdict.

| Question | Actual implementation and boundary |
| --- | --- |
| 1. Actor identities and authorization | `admin/auth.js:7` verifies Access RS256 signature, issuer, application audience, app-token type, time claims, subject, email and administrator allowlist. `admin/auth.js:27` binds the inner session to subject/email and expiry. `admin/worker.js:127` adds enabled/origin/CSRF checks. `admin/worker.js:80` accepts the separate processor credential behind its dedicated Access service policy. Anonymous intake and receipt revision use `intake/worker.js:75` and `intake/worker.js:108`. GitHub controller/representative authority is distinct from human Access identity in `src/publishing.js:38`. No configured publication-owner role exists today. |
| 2. Current final approval routes | Every authenticated allowlisted administrator can call `/api/approve` and `/api/publish` in `admin/worker.js:235` and `admin/worker.js:244`. The browser exposes both in `admin/public/admin.js:106`. Local `adopt --approve` writes an approved policy in `tools/intake/moderate.js:53` and `src/intake-admin.js:87`. Local policy decision/claim helpers also write policy at `src/intake-admin.js:99`. Direct reviewed policy edits can add approval hashes. Legacy `/admin/decision` may set submission `approved`, but explicitly refuses `published` at `intake/worker.js:133`. That submission approval alone does not satisfy catalog policy. `.github/workflows/approve.yml:1` is instructions only and grants no approval. |
| 3. Exact package and source binding | `tools/admin/process.js:131` packages operation, stable identity, base commit, base-policy hash, proposed listing/policy and ordered image hashes. `/ready` hashes the complete serialized package at `admin/worker.js:105`. `/api/approve` checks version/digest and conditionally updates matching submission revision in one D1 batch. `createPublicationPR` rehashes the package, requires `approved_digest`, checks current main equals `base_commit`, and rehashes stored file bytes at `tools/admin/process.js:136`. The PR body is a description, not a separately authenticated owner receipt. |
| 4. Mandatory cover dependencies | Public intake already permits an empty artwork array. `src/intake-admin.js:71` rejects preparation without art. Cover is required by `schema/manifest.schema.json:6`, `schema/project.schema.json:6`, `schema/listing.schema.json:6` and `schema/catalog.schema.json:38`. Cover-first loops occur in `src/listing-schema.js:52`, `src/listings.js:37`, `src/images.js:36`, `src/moderation.js:40`, `src/publishing.js:33`, `src/catalog.js:38`, `src/recovery.js:67` and `tools/site/build.js:56`. `schema/policy.schema.json:93` and `schema/policy.schema.json:139` forbid empty approved artwork sets. Featured preparation fetches an approved live cover at `tools/admin/process.js:45`. Cards, details and Featured currently consume a cover path through `website/src/components/ProjectArtwork.astro:1` and `website/src/pages/index.astro:17`. |
| 5. Existing status authorities | Submission states are `received`, `in-review`, `needs-changes`, `approved`, `published`, `rejected` in `intake/migrations/0001_submissions.sql:1`. Review states are application strings `queued`, `processing`, `ready`, `approved`, `publishing`, `pr-open`, `failed`, `dispatch-failed`, `stale`, `expired` in `admin/worker.js:94` and `admin/worker.js:196`. GitHub PR state and dynamic `awaiting-deployment`/`published`/`withdrawn` responses come from `admin/worker.js:53`. Verification requires merge ancestry, a live build manifest, successful signed pipeline jobs and operation-specific live presence/Featured checks. It can update submission `published` at line 76, but does not persist a complete deployment evidence record or exact content-revision outcome in the review. |
| 6. Actual GitHub protection | The fresh protection response requires strict `test`, enforces administrators, requires a PR, and disables force pushes/deletion. Required human approval count is zero and CODEOWNER approval is not enforced. `.github/workflows/ci.yml:1` makes `test` run the combined Node suite and validation. Browser verification is a separate workflow. The single aggregate required check cannot safely waive an individual noncritical assertion today. |
| 7. Configuration and migration work | `intake/migrations/0002_admin.sql:1` has review versions and submission revisions, but sessions have no establishment timestamp/owner epoch, and no canonical attempt, owner approval, override or transition ledger exists. Owner pins, authority-epoch initialization, expanded D1 schema and publication verification credentials/gates require an authorized production procedure. Later check splitting/required-gate changes require an explicit proposed GitHub configuration review. Phase 0 applies none of these changes. |
| 8. Preservation | Existing `gh-`/`ext-` identities, current publishing policy, claims and exact approved artwork remain inputs. Ratings use their existing separate database and stable project IDs. The migration adds private records in the intake database, keeps legacy rows/history, and imports only independently supported evidence. It does not reinitialize signed recovery or alter the three approved records. `src/moderation.js:47`, `src/recovery.js:96`, and `.github/workflows/catalog.yml:76` remain integrity boundaries. |

The real submission identified by LOG-HUB-016 reached preparation and failed safely because cover artwork was absent. Its submission identity, payload and receipt persisted. Phase 1 reproduces this type of content in isolation. Production receipt/private-note values are excluded from this decision.

## Owner identity and separate decisions

Exactly one publication owner is configured. Owner authorization requires successful existing Access verification and an exact match of verified issuer, expected application audience, Access `sub`, normalized verified email and current administrator allowlist membership. `OWNER_ACCESS_SUB` and `OWNER_ACCESS_EMAIL` are protected private configuration. A matching private authority epoch must also be active. Missing, malformed or mismatched configuration rejects owner-only operations while preserving unrelated administrator review access.

Ownership is never inferred from a GitHub name, repository controller, receipt, submitted email, administrator count or first login. The existing single allowlisted human does not automatically populate owner pins. The authorized provisioning procedure verifies that human's actual current Access identity and records the exact values privately, then initializes the epoch and invalidates prior owner sessions. Owner identity values and raw identity tokens do not enter source, public artifacts or PR descriptions.

Editorial approval, an eligible override, publication request, protected merge and verified live publication are five separate decisions. An approval contains the exact package/source binding. An override names only its eligible exceptions. A request queues that already approved attempt. GitHub permissions determine merge. Trusted verification alone establishes the live result. Processor credentials provide execution authority for their assigned callbacks and never provide human owner authority.

| Actor | Permitted authority |
| --- | --- |
| Anonymous submitter / receipt holder | Submit proposals, read receipt status, and provide permitted requested revisions. |
| Administrator | Classify and edit drafts, inspect proposals, request corrections, reject with a reason, prepare exact packages and recommend approval. |
| Pinned publication owner | Final exact approval, eligible editorial/test exception, publication request/priority, authorized retry, pre-merge cancellation, approval withdrawal and unused-override revocation. |
| Preparation processor | Resolve identity, validate and freeze exact prepared content, report preparation failure. |
| Publication processor | Claim authorized work, reconcile/create its matching protected PR and report execution evidence. |
| GitHub merge actor | Exercise actual repository merge permissions and protections. |
| Trusted reconciler / live verifier | Verify external merge/build/deployment facts and record the exact requested live outcome. |

The UI displays the authenticated role. Every protected endpoint independently enforces it. Sensitive override issuance requires a session established within five minutes, current Access validity, exact origin/CSRF, explicit confirmation and a written reason. A new dashboard session is not a claim of new MFA. Legacy sessions with no trustworthy establishment time must reestablish before owner-only decisions. A separately authorized owner-role configuration change increments the authority epoch, invalidates prior owner sessions/unused overrides and emits a private audit event atomically, as described in the migration plan.

## One authoritative lifecycle

An anonymous intake proposal may precede numeric GitHub identity resolution. Preserve its existing receipt and outage-tolerant acceptance. A proposal follows the applicable `received`, `in_review`, `needs_changes` and `rejected` transition permissions below, but cannot grant final approval or publication. Trusted preparation resolves/reuses the stable public project ID before creating its publication attempt. That creation records its real time and linked intake/review provenance. It does not backdate or manufacture earlier attempt events. The intake coordinator creates `received`, then applies the current recorded administrator/owner review intent to enter `in_review`. Unresolved identity cannot enter attempt `preparing`, approval or publication. This interpretation keeps stable IDs immutable for every authoritative attempt.

The canonical states are `received`, `in_review`, `needs_changes`, `preparing`, `prepared`, `approved`, `queued`, `preparing_pr`, `awaiting_merge`, `awaiting_deployment`, `verifying_live`, `published`, `failed`, `rejected`, `cancelled` and `superseded`. Terminal states are `published`, `rejected`, `cancelled` and `superseded`. The outcome is separate, for example `available`, `withdrawn`, `featured` or `unfeatured`. A verified withdrawal can finish in `published` with outcome `withdrawn`.

Every transition not listed is forbidden. All transitions compare current revision/state version and append their event atomically.

| From → To | Actor | Guard |
| --- | --- | --- |
| New → `received` | Intake coordinator or owner | Valid proposal and resolved stable identity. Link actual source provenance. |
| `received` → `in_review` | Administrator/owner | Current revision and recorded review intent. |
| `received` → `cancelled` | Owner | No merged publication. |
| `in_review` → `needs_changes` | Administrator/owner | Correction reason. |
| `needs_changes` → `received` | Authorized receipt holder/owner | Valid current revision, invalidate stale preparation and approvals. |
| `in_review` → `preparing` | Administrator/owner initiates, processor executes | Current authorized dispatch, resolved identity, operation and source binding. |
| `preparing` → `prepared` | Trusted preparation processor | Exact package and all mandatory checks. |
| `preparing` → `failed` | Trusted preparation processor | Real failure and checkpoint. |
| `prepared` → `in_review` | Administrator/owner | Invalidate package/approval and current work lease. |
| `prepared` → `approved` | Pinned owner | Exact package, current authority epoch and mandatory guards. |
| `approved` → `queued` | Owner or owner-authorized scheduler | Exact approval remains valid and unused exceptions remain eligible. |
| `queued` → `preparing_pr` | Publication processor | Idempotent claim bound to attempt, package, source and state version. |
| `preparing_pr` → `awaiting_merge` | Publication processor | Exact protected PR identity/head/tree verified. |
| `awaiting_merge` → `awaiting_deployment` | Trusted reconciler | Actual matching authorized merge and applicable checks. |
| `awaiting_deployment` → `verifying_live` | Trusted reconciler | Signed build and exact deployment evidence. |
| `verifying_live` → `published` | Trusted live verifier | Exact content/artwork/operation outcome verified, not identity presence alone. |
| Technical processing state → `failed` | Trusted processor/reconciler | Real failure and independently recoverable checkpoint. |
| `failed` → verified recoverable checkpoint | Owner authorizes, processor executes | Same package/source/authority binding, fresh independent checkpoint evidence. |
| `failed` → `in_review` | Owner | Invalidate prior preparation and obtain a new exact decision. |
| `in_review` or `needs_changes` → `rejected` | Administrator/owner | Current revision and rejection reason. |
| Eligible pre-merge state → `cancelled` | Owner | Reconcile jobs and PR, prove unmerged and prevent future merge before finalizing. |
| Eligible pre-merge state → `superseded` | Owner/revision coordinator | Authorized replacement, reconcile jobs/PR, invalidate stale approval. |
| `approved` → `in_review` | Owner | Explicit approval withdrawal before merge. |
| Terminal state → anything | Nobody | Create a new linked attempt for new work. |

Technical processing states are `queued`, `preparing_pr`, `awaiting_merge`, `awaiting_deployment` and `verifying_live`. Eligible cancellation/supersession states are the nonterminal pre-merge states, including `failed` only when its PR is independently proven unmerged. Cancellation is pending reconciliation until outstanding execution and an existing PR are safely closed. If merge wins the race, reconcile the merged attempt and use a new corrective publication. There is no direct failed-to-published transition.

## Closing alternate approval paths

Promotion to the canonical model must cover the whole catalog, including paths that predate the dashboard.

- `/api/approve` writes a private owner approval only after the pinned-role check. `/api/publish` consumes that authority through the attempt. Processor callbacks can never create either human decision.
- Legacy `/admin/decision` becomes a compatibility adapter for permitted review/rejection transitions. It cannot set owner approval, change canonical publication state, or set `published`. Local `adopt --approve`, `status ... approved`, claim-apply and policy edits can stage proposals, but cannot supply owner authorization.
- Manifest/issue control proves a source relationship and permits a proposal. It grants no final owner approval. After promotion, upstream editorial/artwork/release changes enter preparation instead of becoming new approved content through the existing retained initial digest. Availability diagnostics may refresh without claiming a new approved content revision.
- Public policy contains only opaque attempt/approval references and exact approved content/artwork projections. The protected main publication job queries the existing authenticated private processor service for the referenced owner authorization and verifies the actual proposed tree against that binding. It rejects new or changed editorial/policy authority without a matching current approval. This uses a read-only authorization endpoint, never an approval-granting processor endpoint.
- A private approval records the base source revision. After PR creation, the processor may bind a head only after proving its complete permitted diff matches the frozen package. The verifier checks PR identity, head, merge ancestry and operation. Head changes invalidate the binding and any head-bound exception. A PR body, submitted receipt reference or new policy hash cannot manufacture a private owner approval.
- Existing signed, currently approved content is preserved under explicit legacy fingerprints. That finite preservation allowance permits unchanged content only. An edit or new listing requires a new canonical owner decision. Signed recovery cannot broaden this allowance.

The protected repository/workflow configuration and authorized Cloudflare/D1 operators remain the system trust roots. The design removes ordinary approval shortcuts. It cannot make an operator with authority to replace the enforcement code or database cryptographically powerless.

## Phase sequence and acceptance

| Phase | Bounded work and evidence | Production dependency |
| --- | --- | --- |
| 0 | Audit, this contract, final migration definitions and independent review. | Documentation only. |
| 1 | Optional artwork across schemas, preparation, policy receipts, publisher, recovery, cards/details/Featured. Test zero-art GitHub/external packages and unchanged existing image hashes. One built-in placeholder is a presentation asset, never a fake project cover receipt. | Reviewed compatible source rollout only after owner authorization. |
| 2 | Add authority/lifecycle schema, guarded transitions, audit/outbox, compatibility reconciliation and owner-only approval enforcement. All transition and stale/idempotency tests use isolation. | Additive D1 migration, verified owner pins/epoch, coordinated Workers/processor/publication verifier rollout and explicit promotion authorization. |
| 3 | Expose role-aware approval, exact editorial exceptions, expedite/retry/history/revoke controls. Preserve all mandatory checks. | Compatible canonical lifecycle must already be verified. |
| 4 | Extend existing correction receipts for artwork addition/replacement/removal and metadata/link changes. Verify retained public revision, claims, ID, ratings and Featured relationship. | Canonical exact replacement path. |
| 5 | Sourced third-party candidate inventory and administrator staging/edit/defer/reject/bounded batch preparation. Stage in existing intake D1 and use individual exact decisions. Serialize PR preparation across main changes. | Owner approval for each package and each publication. |
| 6 | Reviewed server-side classifications and exact expiring per-check waivers. Preserve original failures. Propose a separate protected authorization gate with mandatory security/integrity checks. | Stop at the reviewed check/protection configuration proposal for explicit owner authorization before any live required-check change. |
| 7 | Representative isolated integrated scenarios, focused regressions, preserved production baseline and independent final review. | Every release/merge/deploy remains an explicit owner decision. |

Each phase identifies its candidate commit/PR, changed scope, focused checks, review result and dependencies. Existing comprehensive LOG-HUB-015/016 evidence is reused where applicable. Phase 0 does not claim later phases or the complete ticket are implemented.
