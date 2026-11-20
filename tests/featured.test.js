import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {featuredFixture, featureBase} from '../tools/admin/featured-fixture.js';
import {preparePackage, createPublicationPR} from '../tools/admin/process.js';
import {readJSON, saveJSON} from '../src/records.js';
import {policyCheck, assertPublicationPolicy} from '../src/moderation.js';
import {readSnapshot} from '../src/publishing.js';
import {payloadFiles, seal, verifyEnvelope} from '../src/recovery.js';
import {imageHash} from '../src/images.js';
import {setDecision} from '../src/intake-admin.js';

const json = async response => { assert.equal(response.ok, true, await response.clone().text()); return response.json(); };
async function setup(t) {
  const x = await featuredFixture(), original = globalThis.fetch;
  globalThis.fetch = x.fetcher;
  t.after(async () => { globalThis.fetch = original; await x.dispose(); });
  await x.login();
  return x;
}
async function review(x, operation, id) {
  const {id: reviewId} = await json(await x.call('/api/prepare', {operation, project_id: id}));
  await json(await x.processCall(reviewId, '/claim', {action: 'prepare'}));
  const row = await json(await x.processCall(reviewId));
  const prepared = await preparePackage({row, root: x.root, api: x.api, fetcher: x.fetchImages, site: 'https://site.example', base: featureBase});
  for (const file of prepared.buffers) await json(await x.processCall(reviewId, '/file', {name: file.name, part: 0, data: file.bytes.toString('base64')}));
  await json(await x.processCall(reviewId, '/ready', {package: prepared.package}));
  let ready = (await json(await x.call('/api/reviews'))).items.find(item => item.id === reviewId);
  assert.equal((await x.call('/api/publish', {id: reviewId, digest: ready.digest})).status, 409);
  await json(await x.call('/api/approve', {id: reviewId, version: ready.version, digest: ready.digest, content_reviewed: true, artwork_reviewed: true}));
  await json(await x.call('/api/publish', {id: reviewId, digest: ready.digest}));
  await json(await x.processCall(reviewId, '/claim', {action: 'publish'}));
  ready = await json(await x.processCall(reviewId));
  const calls = [], api = {request: async (endpoint, options = {}) => {
    calls.push({endpoint, ...options});
    if (endpoint.endsWith('/git/ref/heads/main')) return {object: {sha: featureBase}};
    if (endpoint.endsWith('/git/commits/' + featureBase)) return {tree: {sha: 'b'.repeat(40)}};
    if (endpoint.endsWith('/git/trees') || endpoint.endsWith('/git/commits')) return {sha: 'c'.repeat(40)};
    if (endpoint.endsWith('/git/refs')) return {};
    if (endpoint.endsWith('/pulls')) return {number: 42};
    throw Error('Unexpected publication request');
  }};
  await createPublicationPR({row: ready, api, repo: 'fictional/hub', loadFile: async () => { throw Error('Policy-only PR cannot publish artwork'); }});
  const tree = calls.find(call => call.endpoint.endsWith('/git/trees')).body.tree;
  assert.deepEqual(tree.map(file => file.path), ['policy/publishing.json']);
  assert.equal(calls.some(call => /merge|deploy/.test(call.endpoint)), false);
  await assert.rejects(createPublicationPR({row: ready, api: {request: async () => ({object: {sha: 'd'.repeat(40)}})}, repo: 'fictional/hub'}), /Main changed/);
  await json(await x.processCall(reviewId, '/published-pr', {pr: 42}));
  return {prepared, reviewId, policy: JSON.parse(tree[0].content)};
}

test('Featured management requires approved published projects and exact protected review for GitHub and community listings', async t => {
  const x = await setup(t);
  for (const id of ['gh-123', 'ext-abcdefghijkl']) {
    assert.equal((await x.call('/api/prepare', {operation: 'feature', project_id: id})).status, 409);
    await assert.rejects(x.prepare('feature', id), /published project/);
  }
  let publication = await x.refresh();
  const originalPolicy = structuredClone(x.state.policy);
  const originalProjects = structuredClone(x.state.projects);
  for (const id of ['gh-123', 'ext-abcdefghijkl']) {
    const change = await review(x, 'feature', id);
    assert.equal(change.prepared.package.listing, null);
    assert.equal(change.prepared.package.featured_preview.id, id);
    const project = x.state.projects.find(project => project.id === id);
    const cover = await fs.readFile(path.join(publication.output, 'work/dist', project.cover));
    assert.equal(imageHash(change.prepared.buffers[0].bytes), imageHash(cover));
    const expected = [...change.policy.projects, ...change.policy.external_projects].filter(rule => rule.featured);
    assert.deepEqual(expected.map(rule => rule.project_id), [id]);
    await saveJSON(path.join(x.root, 'policy/publishing.json'), change.policy);
    publication = await x.refresh();
    assert.deepEqual(publication.catalog.projects.filter(project => project.featured).map(project => project.id), [id]);
    await assertPublicationPolicy(publication.snapshot, publication.catalog, change.policy, await readSnapshot(publication.snapshot));
    x.state.pr = {head: {sha: featureBase}, merged: true, state: 'closed', merge_commit_sha: featureBase, html_url: 'https://github.com/fictional/hub/pull/42'};
    assert.equal((await json(await x.call('/api/publication?id=' + change.reviewId))).stage, 'deploying');
    x.state.manifest = {build_commit: featureBase}; x.state.runs = [{id: 7, head_sha: featureBase, event: 'push', status: 'completed', conclusion: 'success'}];
    x.state.jobs = ['synchronize', 'backup', 'anchor', 'publish', 'website', 'deploy-website'].map(name => ({name, conclusion: 'success'}));
    const status = await json(await x.call('/api/publication?id=' + change.reviewId));
    assert.equal(status.stage, 'published'); assert.equal(status.live_url, 'https://site.example/');
    x.state.jobs = [];
    const key = generateKeyPairSync('ed25519');
    const config = {version: 1, enabled: true, source_repository: 'fictional/hub', source_repository_id: 42, backup_repository: 'fictional/vault', backup_repository_id: 84, default_branch: 'main', signing_key_id: 'test', public_keys: {test: key.publicKey.export({format: 'pem', type: 'spki'})}};
    const files = await payloadFiles(publication.snapshot, path.join(publication.output, 'work/dist/catalog.json'));
    const envelope = seal(config, files, {source_commit: featureBase, run_id: 7, workflow: '.github/workflows/catalog.yml', ref: 'refs/heads/main', kind: 'publication'}, key.privateKey.export({format: 'pem', type: 'pkcs8'}));
    verifyEnvelope(config, envelope);
    assert.equal(JSON.parse(files.get('catalog.json')).projects.find(project => project.featured).id, id);
  }
  const clear = await review(x, 'unfeature', 'ext-abcdefghijkl');
  assert.equal(clear.prepared.package.featured_preview, null);
  await saveJSON(path.join(x.root, 'policy/publishing.json'), clear.policy);
  const cleared = await x.refresh();
  assert.equal(cleared.catalog.projects.some(project => project.featured), false);
  for (const project of cleared.catalog.projects) {
    const {featured: _before, ...before} = originalProjects.find(item => item.id === project.id);
    const {featured: _after, ...after} = project;
    assert.deepEqual(after, before);
  }
  for (const rule of clear.policy.external_projects) {
    const {featured: _featured, ...unchanged} = rule;
    assert.deepEqual(unchanged, originalPolicy.external_projects.find(item => item.project_id === rule.project_id));
  }
});

test('conflicting assignments, stale artwork, suspended targets and metadata-supplied placement fail closed', async t => {
  const x = await setup(t); let publication = await x.refresh();
  const policy = structuredClone(x.state.policy);
  const forged = structuredClone(publication.catalog); forged.projects[0].featured = true;
  await assert.rejects(assertPublicationPolicy(publication.snapshot, forged, policy, await readSnapshot(publication.snapshot)), /Featured placement/);
  assert.throws(() => policyCheck({...policy, external_projects: policy.external_projects.map(rule => ({...rule, featured: true}))}), /conflicting featured/);
  const wrong = await x.prepare('feature', 'gh-123');
  for (const rule of wrong.package.policy.external_projects) rule.featured = true;
  assert.throws(() => policyCheck(wrong.package.policy), /conflicting/);
  const source = path.join(x.root, 'listings/ext-abcdefghijkl/listing.json');
  const listing = await readJSON(source); listing.featured = true; await saveJSON(source, listing);
  publication = await x.refresh();
  assert.equal(publication.catalog.projects.some(project => project.featured), false);
  const feature = await x.prepare('feature', 'ext-abcdefghijkl');
  await saveJSON(path.join(x.root, 'policy/publishing.json'), feature.package.policy);
  publication = await x.refresh();
  for (const operation of ['suspend', 'delist']) {
    const hidden = await x.prepare(operation, 'ext-abcdefghijkl');
    assert.equal(hidden.package.rule.featured, false);
    await saveJSON(path.join(x.root, 'policy/publishing.json'), hidden.package.policy);
    const output = await x.refresh();
    assert.equal(output.catalog.projects.some(project => project.id === 'ext-abcdefghijkl'), false);
    assert.equal(output.catalog.projects.some(project => project.featured), false);
    assert.equal((await x.call('/api/prepare', {operation: 'feature', project_id: 'ext-abcdefghijkl'})).status, 409);
    await assert.rejects(x.prepare('feature', 'ext-abcdefghijkl'), /approved project/);
    await saveJSON(path.join(x.root, 'policy/publishing.json'), feature.package.policy); await x.refresh();
  }
  await setDecision(x.root, 'ext-abcdefghijkl', 'suspended', 'Isolated moderation test');
  assert.equal((await readJSON(path.join(x.root, 'policy/publishing.json'))).external_projects.find(rule => rule.project_id === 'ext-abcdefghijkl').featured, false);
  const corrupt = structuredClone(policy); corrupt.external_projects.find(rule => rule.project_id === 'gh-123').artwork_sets[0][0].sha256 = 'f'.repeat(64);
  await saveJSON(path.join(x.root, 'policy/publishing.json'), corrupt);
  await assert.rejects(x.prepare('feature', 'gh-123'), /approved artwork/);
});

test('legacy GitHub Featured reviews preserve the original policy identity without converting listings', async t => {
  const x = await setup(t); await x.refresh();
  const policy = structuredClone(x.state.policy), github = policy.external_projects.find(rule => rule.project_id === 'gh-123');
  policy.external_projects = policy.external_projects.filter(rule => rule !== github);
  policy.projects.push({repository_id: 123, ...github});
  await saveJSON(path.join(x.root, 'policy/publishing.json'), policy);
  x.state.policy = policy;
  const prepared = await x.prepare('feature', 'gh-123');
  assert.equal(prepared.package.listing, null);
  assert.deepEqual(prepared.package.policy.projects[0], {...policy.projects[0], featured: true});
  assert.deepEqual(prepared.package.policy.external_projects, policy.external_projects);
  prepared.package.policy.external_projects[0].featured = true;
  assert.throws(() => policyCheck(prepared.package.policy), /conflicting featured/);
});
