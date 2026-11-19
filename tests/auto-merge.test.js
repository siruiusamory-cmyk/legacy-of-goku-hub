import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {enableAutoMerge} from '../tools/admin/process.js';

const git = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const base = 'a'.repeat(40), tip = 'b'.repeat(40), art = Buffer.from('approved artwork'), id = 'ext-aaaaaaaaaaaa';
const tree = files => ({truncated: false, tree: Object.entries(files).filter(([, sha]) => sha).map(([path, sha]) => ({path, mode: '100644', type: 'blob', sha}))});
const enabled = {data: {enablePullRequestAutoMerge: {pullRequest: {autoMergeRequest: {enabledAt: '2026-11-19T00:00:00Z'}}}}};

function world(change = {}) {
  const pkg = {version: 1, project_id: id, operation: 'edit', base_commit: base, listing: {id, title: 'Approved'}, policy: {projects: []}, files: [{name: 'cover.png', sha256: 'x', parts: 1}, {name: 'preview-0.webp', sha256: 'y', parts: 1}]};
  const digest = createHash('sha256').update(JSON.stringify(pkg)).digest('base64url');
  const row = {id: 'r'.repeat(24), state: 'publishing', package: pkg, digest, approved_digest: digest, ...change.row};
  const before = {'README.md': git(Buffer.from('readme')), 'policy/publishing.json': git(json({projects: ['old']}))};
  const after = {...before, 'policy/publishing.json': git(json(pkg.policy)), [`listings/${id}/listing.json`]: git(json(pkg.listing)), [`listings/${id}/cover.png`]: git(art), ...change.files};
  const pr = {node_id: 'PR_node', state: 'open', draft: false, auto_merge: null, base: {ref: 'main', repo: {full_name: 'fictional/hub'}}, head: {ref: 'admin/' + row.id, sha: tip, repo: {full_name: 'fictional/hub'}}, ...change.pr};
  const calls = [];
  const api = {request: async (endpoint, options = {}) => {
    calls.push({endpoint, ...options});
    if (endpoint.endsWith('/pulls/7')) return pr;
    if (endpoint.endsWith('/git/commits/' + base)) return {tree: {sha: 'before'}, parents: []};
    if (endpoint.endsWith('/git/commits/' + tip)) return {tree: {sha: 'after'}, parents: change.parents || [{sha: base}]};
    if (endpoint.includes('/git/trees/before')) return tree(before);
    if (endpoint.includes('/git/trees/after')) return tree(after);
    if (endpoint.includes('/rules/branches/admin/')) return change.rules || [{type: 'update'}];
    if (endpoint === '/graphql') return change.graphql || enabled;
    throw Error('Unexpected GitHub API ' + endpoint);
  }};
  return {calls, run: () => enableAutoMerge({row, api, repo: 'fictional/hub', pr: 7, loadFile: async () => art})};
}

test('approved publication asks GitHub for a squash auto-merge bound to the approved commit and never merges itself', async () => {
  const {calls, run} = world();
  await run();
  const writes = calls.filter(call => call.method && call.method !== 'GET');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].endpoint, '/graphql');
  assert.match(writes[0].body.query, /enablePullRequestAutoMerge\(input:\{pullRequestId:\$id,mergeMethod:SQUASH,expectedHeadOid:\$head\}\)/);
  assert.deepEqual(writes[0].body.variables, {id: 'PR_node', head: tip});
  assert.equal(calls.some(call => /\/merge$|mergePullRequest/.test(call.endpoint + (call.body?.query || ''))), false);
});

test('a repeated request leaves an already enabled auto-merge alone', async () => {
  const {calls, run} = world({pr: {auto_merge: {merge_method: 'squash'}}});
  await run();
  assert.equal(calls.some(call => call.endpoint === '/graphql'), false);
});

const refusals = [
  ['review without owner approval', {row: {approved_digest: null}}, /Approval digest mismatch/],
  ['package changed after approval', {row: {package: {project_id: id, files: []}}}, /Approval digest mismatch/],
  ['review not in publication', {row: {state: 'ready'}}, /Approval digest mismatch/],
  ['closed pull request', {pr: {state: 'closed'}}, /does not belong to this approved review/],
  ['pull request into another branch', {pr: {base: {ref: 'release', repo: {full_name: 'fictional/hub'}}}}, /does not belong to this approved review/],
  ['pull request from a fork', {pr: {head: {ref: 'admin/' + 'r'.repeat(24), sha: tip, repo: {full_name: 'someone/hub'}}}}, /does not belong to this approved review/],
  ['pull request from another branch', {pr: {head: {ref: 'dependabot/npm/sharp', sha: tip, repo: {full_name: 'fictional/hub'}}}}, /does not belong to this approved review/],
  ['extra commit on the branch', {parents: [{sha: 'c'.repeat(40)}]}, /not one commit on the approved base/],
  ['file outside the package changed', {files: {'.github/workflows/ci.yml': git(Buffer.from('on: push'))}}, /outside the approved package/],
  ['file outside the package deleted', {files: {'README.md': null}}, /outside the approved package/],
  ['listing differs from the approved listing', {files: {[`listings/${id}/listing.json`]: git(json({id, title: 'Swapped'}))}}, /differs from the approved package/],
  ['artwork differs from the approved artwork', {files: {[`listings/${id}/cover.png`]: git(Buffer.from('other artwork'))}}, /differs from the approved package/],
  ['policy differs from the approved policy', {files: {'policy/publishing.json': git(json({projects: ['old']}))}}, /differs from the approved package/],
  ['publication branches not locked', {rules: [{type: 'deletion'}]}, /not locked against later changes/],
  ['auto-merge on with another merge method', {pr: {auto_merge: {merge_method: 'merge'}}}, /unexpected method/],
  ['GitHub refuses', {graphql: {data: {enablePullRequestAutoMerge: null}, errors: [{message: 'Auto merge is not allowed for this repository'}]}}, /GitHub refused automatic merge: Auto merge is not allowed for this repository/]
];
for (const [name, change, expected] of refusals) test('auto-merge is refused for: ' + name, async () => {
  const {calls, run} = world(change);
  await assert.rejects(run(), expected);
  assert.equal(calls.some(call => /\/merge$|mergePullRequest/.test(call.endpoint + (call.body?.query || ''))), false);
  if (name !== 'GitHub refuses') assert.equal(calls.some(call => call.endpoint === '/graphql'), false);
});

test('auto-merge stays off unless the repository variable turns it on, and the publisher keeps its two permissions', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/admin-review.yml', import.meta.url), 'utf8');
  const source = await fs.readFile(new URL('../tools/admin/process.js', import.meta.url), 'utf8');
  assert.match(workflow, /ADMIN_AUTO_MERGE: \$\{\{ vars\.ADMIN_AUTO_MERGE_ENABLED \}\}/);
  assert.deepEqual(workflow.match(/permission-[a-z-]+: \w+/g), ['permission-contents: write', 'permission-pull-requests: write']);
  assert.match(source, /if \(process\.env\.ADMIN_AUTO_MERGE === 'true'\)/);
  assert.doesNotMatch(source, /pulls\/\$\{[^}]+\}\/merge|mergePullRequest/);
  assert.doesNotMatch(await fs.readFile(new URL('../admin/worker.js', import.meta.url), 'utf8'), /\/merge|enablePullRequestAutoMerge/);
});
