# LOG-HUB-023: automatic merge after owner approval

Status: built and verified in isolation. Production is unchanged and the feature is off. Turning it on needs a separate owner decision.

## Owner decision

**What you get.** After you approve a publication in the dashboard, you no longer open GitHub to press Merge. GitHub merges the pull request by itself once the required `test` check passes.

**What you give up.** Pressing Merge on GitHub was a second look at the change. After activation, your dashboard approval is the only human decision. The checks, the up-to-date rule, linear history and the signed publication pipeline are unchanged.

**What activation changes in the repository** (none of it done yet):

1. A new ruleset: branches named `admin/**` cannot be updated after they are created. No bypass.
2. The repository setting **Allow auto-merge** is turned on.
3. The Actions variable `ADMIN_AUTO_MERGE_ENABLED` is set to `true`.

`main` branch protection is not edited.

**Two side effects to accept.**

- With **Allow auto-merge** on, anyone with write access can turn on auto-merge by hand for any pull request. The publication job only does it for approved publication pull requests.
- An approved publication whose base is overtaken by another merge can no longer be brought up to date with the Update branch button, because its branch is locked. It has to be prepared and approved again. This is already the documented rule ("reviewed policy is never automatically rebased"); the lock enforces it.

Exact steps, and how to turn it off, are in `docs/launch/ADMIN.md` under "Automatic merge after owner approval".

## Why the ruleset is required

GitHub's documentation says auto-merge is cancelled when someone **without** write access pushes to the branch. A push by someone **with** write access leaves it armed. The control test below confirmed it on real GitHub: with the lock removed and auto-merge forced on by hand, a later push was accepted and the unreviewed content merged, even though the request named the approved commit (`expectedHeadOid`).

So the guarantee "content changed after approval cannot merge" cannot come from auto-merge alone. It comes from the ruleset: nobody, including administrators and the publisher App, can update an `admin/**` branch once it exists. The publication job creates the branch already pointing at the final commit, so it never needs to update it. The job checks that the lock is active and refuses to arm auto-merge without it.

## Where auto-merge is enabled, and what GitHub then enforces

| Step | Where | What must hold |
| --- | --- | --- |
| Owner approval | `admin/worker.js`, `/api/approve` | Cloudflare Access identity, owner-only, both review acknowledgements, exact package digest. Unchanged. |
| Job start | `.github/workflows/admin-review.yml` | Runs only from protected `main` in the `admin-processing` environment. Unchanged. |
| Pull request creation | `tools/admin/process.js`, `createPublicationPR` | Review in `publishing`, approved digest equals the package digest, `main` still at the approved base, artwork hashes match. Unchanged. |
| Arming auto-merge | `tools/admin/process.js`, `enableAutoMerge` (new) | Only when `ADMIN_AUTO_MERGE_ENABLED` is `true`. Re-checks the digest, then reads the pull request back from GitHub: open, into `main`, from `admin/<review-id>` in this repository, one commit on the approved base, no file changed outside the approved listing, artwork and `policy/publishing.json`, every approved file byte-identical, `admin/**` locked. Then one GraphQL call: `enablePullRequestAutoMerge`, squash, bound to the approved commit. |
| Merge | GitHub | Required check `test` passes, branch up to date with `main` (strict), linear history, administrators not exempt, pull request required. `browser` runs but is not a required check; this ticket does not change that. |
| After merge | `catalog.yml` | Signed backup, anchor, publication and deployment. Unchanged. |

A successful workflow run is not treated as authorization anywhere. Authorization is the owner's approval of an exact digest; the job only proves the pull request equals that digest.

## Security and permissions review

- The administrator Worker gains nothing. It still holds only a dispatch and read-status credential and contains no merge or auto-merge call (asserted by a test).
- The publisher App token is requested with the same two permissions as before, `contents: write` and `pull-requests: write` (asserted by a test). No new permission is requested. Reading branch rules needs only the metadata access every token has.
- No API that bypasses branch protection is used. There is no direct merge call in the job (asserted by a test). A failed attempt to arm auto-merge is caught and reported; the publication continues to an open pull request for manual merge.
- Required checks, review requirements and bypass lists are not modified.
- Nothing is re-approved automatically. A changed package has a different digest and is refused.

## Integration evidence

Run against the disposable public repository `siruiusamory-cmyk/loghub-automerge-test`, set up with production's protection: required check `test` from GitHub Actions, strict up-to-date, linear history, administrators enforced, pull request required with 0 approvals. The real `createPublicationPR` and `enableAutoMerge` were used. Raw results: `integration-evidence.json`. Reproduce with `node tools/admin/auto-merge-integration.js <owner>/loghub-automerge-test` (the script refuses any other repository name).

| Scenario | Expected | Observed | Result |
| --- | --- | --- | --- |
| Approved PR, checks pending | Remains open | Open, auto-merge on, check in progress (PR 6) | Pass |
| Approved PR, checks pass | Squash-merges | Merged by GitHub as one commit on the approved base; listing equals the approved listing (PR 6) | Pass |
| Required check fails | Does not merge | Check failed; still open (PR 8) | Pass |
| PR has merge conflict | Does not merge | Check passed; state `dirty`; still open (PR 10) | Pass |
| Owner has not approved | Auto-merge not enabled | Refused before any branch or pull request existed | Pass |
| Package digest differs | Publication refused | Refused: "Approval digest mismatch" | Pass |
| Approved PR content changes | Unreviewed content cannot merge | Push to the locked branch rejected (HTTP 422); head unchanged. Separately, a pull request whose content differs from the package is refused auto-merge | Pass |
| Base branch becomes outdated | Protections prevent merging | Check passed; state `behind`; still open (PR 11) | Pass |
| Auto-merge API fails | Safe failure, no direct merge | "Auto merge is not allowed for this repository"; open after checks passed (PR 5) | Pass |
| Duplicate activation request | No duplicate PR or unsafe state | Second enable was a no-op; second create refused; one pull request for the branch | Pass |
| Ordinary development PR | Unaffected | Check passed; open; no auto-merge (PR 7) | Pass |
| Branches not locked | Refuse to arm | Refused: "Publication branches are not locked against later changes" | Pass |
| Checks already green before the request | Manual path still works | GitHub refused ("clean status"); manual squash merge succeeded (PR 5) | Pass |
| Control: lock removed, auto-merge forced by hand, writer pushes | Shows what the lock prevents | Push accepted; unreviewed content merged (PR 12). The publication job itself refused to arm it | Pass |

Automated regression tests: `tests/auto-merge.test.js` (19 tests) and one added assertion in `tests/admin-dashboard.test.js`. Full suite: 185 pass, 0 fail.

## Failure handling

| Failure | What happens | What the administrator sees |
| --- | --- | --- |
| GitHub API error, rate limit, missing permission, auto-merge disabled in settings, branches not locked, pull request does not equal the package | Auto-merge is not armed. The pull request stays open. | "Automatic merge was not turned on (reason). Merge the pull request on GitHub." |
| Pull request creation fails | Unchanged: review marked failed; prepare again. | Existing failure message. |
| Check fails or stays pending, merge conflict, base moved | GitHub does not merge. | **Verify PR checks and deployment** shows the pull request still open. |
| Review closed, stale or superseded | The job cannot claim it; nothing is created. | Existing message. |
| Job retried | The claim step allows one publication per review; a repeated enable is a no-op. | Nothing new. |

## Limits of this verification

- The test used a personal token as the publisher, not the production GitHub App. The App's private key lives in the protected `admin-processing` environment and was not used. Two things therefore remain to confirm on the first real publication after activation: that the App's token is accepted by `enablePullRequestAutoMerge`, and that the merge GitHub performs on the App's behalf starts `catalog.yml`. If the second did not hold, the catalog workflow can be started by hand and also runs daily.
- The dashboard side (approval, digest, claim) was exercised by the unit suite with doubles, not against GitHub.
- The disposable repository still exists. The token used here cannot delete repositories; it can be deleted from its Settings page.

## Rollback

Delete `ADMIN_AUTO_MERGE_ENABLED`. New publications return to manual merging immediately, with no deploy. To stop one already waiting, choose **Disable auto-merge** on that pull request; turning off **Allow auto-merge** cancels all of them. The ruleset can stay.
