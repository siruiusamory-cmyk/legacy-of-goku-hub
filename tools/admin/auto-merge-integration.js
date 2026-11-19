import fs from 'node:fs/promises';
import {createHash, randomBytes} from 'node:crypto';
import {GitHub} from '../../src/github.js';
import {imageHash} from '../../src/images.js';
import {createPublicationPR, enableAutoMerge} from './process.js';

const repo = process.argv[2] || '';
if (!/^[A-Za-z0-9-]+\/loghub-automerge-test[a-z0-9-]*$/.test(repo)) throw Error('Refusing to run outside a disposable loghub-automerge-test repository');
const github = new GitHub(), root = new URL('../../', import.meta.url), R = `/repos/${repo}`, ID = 'ext-gvp2t5evruov';
const read = name => fs.readFile(new URL(name, root));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const api = {request: async (endpoint, options = {}) => {
  for (let tries = 0; ; tries++) try { return await github.request(endpoint, options); } catch (error) {
    if (error.status !== 0 || (options.method || 'GET') !== 'GET' || tries === 3) throw error;
    await sleep(3000);
  }
}};
const results = [];
const record = (scenario, expected, observed, pass) => { results.push({scenario, expected, observed, pass}); console.log(pass ? 'PASS' : 'FAIL', scenario, JSON.stringify(observed)); };
const attempt = fn => fn().then(value => ({ok: true, value}), error => ({ok: false, error: error.message}));
const until = async (fn, seconds = 300) => { for (let i = 0; i < seconds / 5; i++) { const value = await fn(); if (value) return value; await sleep(5000); } return null; };
const pull = number => api.request(`${R}/pulls/${number}`);
const brief = async number => { const pr = await pull(number); return {pr: number, state: pr.state, merged: pr.merged, auto_merge: pr.auto_merge?.merge_method || null, mergeable_state: pr.mergeable_state, head: pr.head.sha.slice(0, 8)}; };
const check = async number => (await api.request(`${R}/commits/${(await pull(number)).head.sha}/check-runs`)).check_runs.find(run => run.name === 'test');
const finished = number => until(async () => { const run = await check(number); return run?.status === 'completed' && run; });
const variable = (name, value) => api.request(`${R}/actions/variables/${name}`, {method: 'PATCH', body: {name, value}});
const close = number => api.request(`${R}/pulls/${number}`, {method: 'PATCH', body: {state: 'closed'}});
const head = async () => (await api.request(`${R}/git/ref/heads/main`)).object.sha;
const put = (path, bytes) => api.request(`${R}/contents/${path}`, {method: 'PUT', body: {message: 'Seed ' + path, content: bytes.toString('base64')}});

const policy = JSON.parse(await read('policy/publishing.json')), original = JSON.parse(await read(`listings/${ID}/listing.json`)), cover = await read(`listings/${ID}/cover.png`);
const loadFile = async () => cover;
const edit = tag => ({...original, description: `${original.description.slice(0, 200)} Integration ${tag}.`});
const row = (listing, base, approved = true) => {
  const pkg = {version: 1, project_id: listing.id, operation: 'edit', base_commit: base, listing, policy, rule: null, warnings: [], files: [{name: 'cover.png', sha256: imageHash(cover), parts: 1}]};
  const digest = createHash('sha256').update(JSON.stringify(pkg)).digest('base64url');
  return {id: randomBytes(18).toString('base64url'), state: 'publishing', package: pkg, digest, approved_digest: approved ? digest : null};
};
const create = review => createPublicationPR({row: review, api, repo, loadFile});
const enable = (review, pr) => attempt(() => enableAutoMerge({row: review, api, repo, pr, loadFile}));
const commitOn = async (parent, path, content) => {
  const tree = await api.request(`${R}/git/trees`, {method: 'POST', body: {base_tree: (await api.request(`${R}/git/commits/${parent}`)).tree.sha, tree: [{path, mode: '100644', type: 'blob', content}]}});
  return (await api.request(`${R}/git/commits`, {method: 'POST', body: {message: 'Change after approval', tree: tree.sha, parents: [parent]}})).sha;
};

if (!(await attempt(head)).ok) {
  await put('README.md', Buffer.from('Disposable fixture for Legacy of Goku Hub auto-merge integration tests.\n'));
  await put('policy/publishing.json', await read('policy/publishing.json'));
  await put(`listings/${ID}/listing.json`, await read(`listings/${ID}/listing.json`));
  await put(`listings/${ID}/cover.png`, cover);
  await put('.github/workflows/ci.yml', Buffer.from('name: Test and validate\non:\n  pull_request:\npermissions:\n  contents: read\njobs:\n  test:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: sleep "$PAUSE"; test "$RESULT" != fail\n        env:\n          PAUSE: ${{ vars.TEST_SLEEP }}\n          RESULT: ${{ vars.TEST_RESULT }}\n'));
  for (const [name, value] of [['TEST_SLEEP', '20'], ['TEST_RESULT', 'pass']]) await api.request(`${R}/actions/variables`, {method: 'POST', body: {name, value}});
  await api.request(`${R}/branches/main/protection`, {method: 'PUT', body: {required_status_checks: {strict: true, checks: [{context: 'test', app_id: 15368}]}, enforce_admins: true, required_pull_request_reviews: {dismiss_stale_reviews: true, required_approving_review_count: 0}, restrictions: null, required_linear_history: true, allow_force_pushes: false, allow_deletions: false}});
}
for (const stale of await api.request(`${R}/pulls?state=open&per_page=100`)) await close(stale.number);
for (const rule of await api.request(`${R}/rulesets`)) await api.request(`${R}/rulesets/${rule.id}`, {method: 'DELETE'});
await api.request(R, {method: 'PATCH', body: {allow_auto_merge: false, allow_squash_merge: true}});
await variable('TEST_SLEEP', '20'); await variable('TEST_RESULT', 'pass');
const protection = await api.request(`${R}/branches/main/protection`);

let base = await head();
const unapproved = row(edit('unapproved'), base, false);
const refused = await attempt(() => create(unapproved));
record('Owner has not approved', 'No pull request, no branch, auto-merge not enabled', {...refused, branch_exists: (await attempt(() => api.request(`${R}/git/ref/heads/admin/${unapproved.id}`))).ok}, !refused.ok && /Approval digest mismatch/.test(refused.error));

const tampered = row(edit('approved'), base); tampered.package = {...tampered.package, listing: edit('swapped')};
const swapped = await attempt(() => create(tampered));
record('Package digest differs', 'Publication refused', swapped, !swapped.ok && /Approval digest mismatch/.test(swapped.error));

const first = row(edit('one'), base), firstPR = await create(first);
const unlocked = await enable(first, firstPR);
record('Publication branches not locked', 'Auto-merge refused; pull request left for manual merge', {...unlocked, ...await brief(firstPR)}, !unlocked.ok && /not locked/.test(unlocked.error));
const other = {...row(edit('different'), base), id: first.id};
const mismatch = await enable(other, firstPR);
record('Pull request content differs from the approved package', 'Auto-merge refused', mismatch, !mismatch.ok && /differs from the approved package/.test(mismatch.error));

const lock = await api.request(`${R}/rulesets`, {method: 'POST', body: {name: 'Publication branches cannot change after creation', target: 'branch', enforcement: 'active', conditions: {ref_name: {include: ['refs/heads/admin/**'], exclude: []}}, rules: [{type: 'update'}], bypass_actors: []}});
const disabled = await enable(first, firstPR);
const firstCheck = await finished(firstPR);
record('Auto-merge API fails (repository setting off)', 'Safe failure, no direct merge, pull request stays open after checks pass', {...disabled, check: firstCheck?.conclusion, ...await brief(firstPR)}, !disabled.ok && /GitHub refused automatic merge/.test(disabled.error) && !(await pull(firstPR)).merged);

await api.request(R, {method: 'PATCH', body: {allow_auto_merge: true}});
const late = await enable(first, firstPR);
await sleep(15000);
let lateState = await brief(firstPR);
if (!lateState.merged) await api.request(`${R}/pulls/${firstPR}/merge`, {method: 'PUT', body: {merge_method: 'squash'}});
record('Checks already passed before auto-merge was requested', 'GitHub either merges under protection or refuses; a manual squash merge remains possible', {...late, before_manual: lateState, after: await brief(firstPR)}, (await pull(firstPR)).merged);

await variable('TEST_SLEEP', '45');
base = await head();
const second = row(edit('two'), base), secondPR = await create(second), enabled = await enable(second, secondPR);
const again = await enable(second, secondPR), recreate = await attempt(() => create(second));
const twins = await api.request(`${R}/pulls?state=all&head=${repo.split('/')[0]}%3Aadmin/${second.id}`);
record('Duplicate activation request', 'No duplicate pull request; second enable is a no-op', {first: enabled, second: again, recreate, pull_requests_for_branch: twins.length}, enabled.ok && again.ok && !recreate.ok && twins.length === 1);

const approvedHead = (await pull(secondPR)).head.sha;
const push = await attempt(async () => api.request(`${R}/git/refs/heads/admin/${second.id}`, {method: 'PATCH', body: {sha: await commitOn(approvedHead, 'policy/publishing.json', '{"unreviewed":true}\n'), force: true}}));
record('Approved PR content changes', 'GitHub rejects the push; head stays the approved commit', {...push, head_unchanged: (await pull(secondPR)).head.sha === approvedHead}, !push.ok && (await pull(secondPR)).head.sha === approvedHead);

const dev = 'dev/ordinary-' + randomBytes(4).toString('hex');
await api.request(`${R}/git/refs`, {method: 'POST', body: {ref: 'refs/heads/' + dev, sha: await commitOn(base, 'README.md', 'Ordinary development change.\n')}});
const ordinary = (await api.request(`${R}/pulls`, {method: 'POST', body: {title: 'Ordinary development change', head: dev, base: 'main'}})).number;

const pending = {check: (await until(() => check(secondPR), 60))?.status, ...await brief(secondPR)};
record('Approved PR, checks pending', 'Remains open with auto-merge on', pending, pending.state === 'open' && !pending.merged && pending.auto_merge === 'squash' && pending.check !== 'completed');
const merged = await until(async () => { const pr = await pull(secondPR); return pr.merged && pr; });
const landed = merged && await api.request(`${R}/git/commits/${merged.merge_commit_sha}`);
const live = merged && JSON.parse(Buffer.from((await api.request(`${R}/contents/listings/${ID}/listing.json?ref=${merged.merge_commit_sha}`)).content, 'base64').toString());
record('Approved PR, checks pass', 'Automatically squash-merges exactly the approved content', {check: (await check(secondPR))?.conclusion, merged: Boolean(merged), merged_by: merged?.merged_by?.login, parents: landed?.parents.length, on_base: landed?.parents[0].sha === base, content_matches: live?.description === second.package.listing.description}, Boolean(merged) && landed.parents.length === 1 && landed.parents[0].sha === base && live.description === second.package.listing.description);
const ordinaryCheck = await finished(ordinary);
const untouched = await brief(ordinary);
record('Ordinary development PR', 'Unaffected: stays open, no auto-merge', {check: ordinaryCheck?.conclusion, ...untouched}, untouched.state === 'open' && !untouched.merged && untouched.auto_merge === null);
await close(ordinary);

await variable('TEST_SLEEP', '10'); await variable('TEST_RESULT', 'fail');
base = await head();
const third = row(edit('three'), base), thirdPR = await create(third), thirdEnabled = await enable(third, thirdPR);
const failed = await finished(thirdPR);
await sleep(20000);
const afterFailure = await brief(thirdPR);
record('Required check fails', 'Does not merge', {enable: thirdEnabled, check: failed?.conclusion, ...afterFailure}, thirdEnabled.ok && failed?.conclusion === 'failure' && afterFailure.state === 'open' && !afterFailure.merged);
await close(thirdPR);
await variable('TEST_RESULT', 'pass');

await variable('TEST_SLEEP', '40');
base = await head();
const x = row(edit('x'), base), y = row(edit('y'), base), z = row({...original, id: 'ext-automergetest'.slice(0, original.id.length)}, base);
const xPR = await create(x), xEnabled = await enable(x, xPR);
await until(() => check(xPR), 60);
await variable('TEST_SLEEP', '100');
const yPR = await create(y), yEnabled = await enable(y, yPR), zPR = await create(z), zEnabled = await enable(z, zPR);
const xMerged = await until(async () => (await pull(xPR)).merged);
const yCheck = await finished(yPR), zCheck = await finished(zPR);
await sleep(20000);
const conflict = await brief(yPR), behind = await brief(zPR);
record('PR has merge conflict', 'Does not merge', {enable: yEnabled, earlier_merged: Boolean(xMerged), check: yCheck?.conclusion, ...conflict}, xEnabled.ok && Boolean(xMerged) && yEnabled.ok && conflict.state === 'open' && !conflict.merged && conflict.mergeable_state === 'dirty');
record('Base branch becomes outdated', 'Up-to-date rule keeps it unmerged; the locked branch cannot be updated', {enable: zEnabled, check: zCheck?.conclusion, ...behind}, zEnabled.ok && zCheck?.conclusion === 'success' && behind.state === 'open' && !behind.merged && behind.mergeable_state === 'behind');
await close(yPR); await close(zPR);

await api.request(`${R}/rulesets/${lock.id}`, {method: 'PUT', body: {enforcement: 'disabled'}});
await variable('TEST_SLEEP', '60');
base = await head();
const open = row(edit('unlocked'), base), openPR = await create(open), node = await pull(openPR);
const guarded = await enable(open, openPR);
const raw = await api.request('/graphql', {method: 'POST', body: {query: 'mutation($id:ID!,$head:GitObjectID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH,expectedHeadOid:$head}){clientMutationId}}', variables: {id: node.node_id, head: node.head.sha}}});
const changed = await attempt(async () => api.request(`${R}/git/refs/heads/admin/${open.id}`, {method: 'PATCH', body: {sha: await commitOn(node.head.sha, 'README.md', 'Unreviewed change pushed after approval.\n'), force: true}}));
await finished(openPR); await sleep(25000);
const outcome = await brief(openPR);
record('Control: lock removed, auto-merge forced on by hand, then a writer pushes', 'Shows what the lock prevents. The publisher itself refuses to enable auto-merge without the lock.', {publisher: guarded, forced: !raw.errors, push_accepted: changed.ok, ...outcome, unreviewed_content_merged: outcome.merged}, !guarded.ok && /not locked/.test(guarded.error));
if (!outcome.merged) await close(openPR);
await api.request(`${R}/rulesets/${lock.id}`, {method: 'PUT', body: {enforcement: 'active'}});
await api.request(R, {method: 'PATCH', body: {allow_auto_merge: false}});

const settings = await api.request(R);
await fs.mkdir(new URL('docs/reviews/log-hub-023/', root), {recursive: true});
await fs.writeFile(new URL('docs/reviews/log-hub-023/integration-evidence.json', root), JSON.stringify({repository: repo, ran: new Date().toISOString(), protection: {required_checks: protection.required_status_checks.checks, strict: protection.required_status_checks.strict, linear_history: protection.required_linear_history.enabled, enforce_admins: protection.enforce_admins.enabled, approvals: protection.required_pull_request_reviews.required_approving_review_count}, ruleset: {name: lock.name, include: lock.conditions.ref_name.include, rules: lock.rules.map(rule => rule.type), bypass_actors: lock.bypass_actors}, merge_methods: {squash: settings.allow_squash_merge}, results}, null, 2) + '\n');
console.log(results.every(result => result.pass) ? 'ALL PASS' : 'FAILURES', results.length);
process.exitCode = results.every(result => result.pass) ? 0 : 1;
