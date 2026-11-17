import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import sharp from 'sharp';
import {fixture} from '../tools/admin/test-fixture.js';
import {preparePackage, createPublicationPR} from '../tools/admin/process.js';
import {GitHub} from '../src/github.js';
import {readJSON, saveJSON} from '../src/records.js';
import {publish} from '../src/publishing.js';
import {payloadFiles, seal, verifyEnvelope, materialize, verifyExport, verifyPublicationFiles} from '../src/recovery.js';
import {imageEntries, inspectImages, imageHash, writeImages} from '../src/images.js';
import {manifestRecord} from '../src/intake.js';
import {artworkApproved} from '../src/moderation.js';
import {prepareListing} from '../src/intake-admin.js';

const base = 'a'.repeat(40);
const repository = (await readJSON(new URL('./fixtures/github.json', import.meta.url))).repository;
const value = {kind: 'suggest', title: 'Artwork-free training project', creator: 'Training team', description: 'An isolated community project used to verify optional artwork.', category: 'tool', game: 'multiple', status: 'in-development'};
const json = async response => { assert.equal(response.ok, true, await response.clone().text()); return response.json(); };
async function setup(t) {
  const x = await fixture(), root = await fs.mkdtemp(path.join(os.tmpdir(), 'loghub-optional-art-'));
  await fs.mkdir(path.join(root, 'records'));
  await saveJSON(path.join(root, 'policy/publishing.json'), {version: 1, trusted_owner_ids: [], revoked_owner_ids: [], projects: [], external_projects: []});
  const api = new GitHub({token: '', fetcher: async url => url.includes('/releases/latest') ? new Response('{}', {status: 404}) : Response.json({...repository, owner: {...repository.owner, id: 99}})});
  const original = globalThis.fetch; globalThis.fetch = x.fetcher;
  t.after(async () => { globalThis.fetch = original; x.db.close(); await fs.rm(root, {recursive: true, force: true}); });
  await x.login();
  return {...x, root, api};
}

test('artwork-free GitHub and external submissions receive exact content approval, protected PRs and verified signed recovery', async t => {
  const x = await setup(t);
  for (const [id, url, artwork] of [['gh-123', repository.html_url, undefined], ['ext-abcdefghijkl', 'https://forum.example.org/artwork-free/', []]]) {
    const input = {...value, url, ...(artwork ? {artwork} : {})};
    const subInput = {...input, artwork};
    const sub = await x.seed(subInput);
    const {id: reviewId} = await json(await x.call('/api/prepare', {operation: 'submission', submission_id: sub.id, revision: 1, payload: input}));
    await json(await x.processCall(reviewId, '/claim', {action: 'prepare'}));
    const row = await json(await x.processCall(reviewId));
    row.project_id = id;
    const prepared = await preparePackage({row, root: x.root, api: x.api, fetcher: async () => { throw Error('Artwork-free preparation must not fetch images'); }, base});
    assert.equal(prepared.package.listing.cover, undefined);
    assert.deepEqual(prepared.package.rule.artwork_sets, [[]]);
    assert.deepEqual(prepared.buffers, []);
    await json(await x.processCall(reviewId, '/ready', {package: prepared.package}));
    let ready = (await json(await x.call('/api/reviews'))).items.find(item => item.id === reviewId);
    assert.equal((await x.call('/api/approve', {id: reviewId, version: ready.version, digest: ready.digest, artwork_reviewed: true})).status, 409);
    await json(await x.call('/api/approve', {id: reviewId, version: ready.version, digest: ready.digest, content_reviewed: true}));
    await json(await x.call('/api/publish', {id: reviewId, digest: ready.digest}));
    await json(await x.processCall(reviewId, '/claim', {action: 'publish'}));
    ready = await json(await x.processCall(reviewId));
    let tree;
    await createPublicationPR({row: ready, repo: 'fictional/hub', loadFile: async () => { throw Error('No artwork files'); }, api: {request: async (endpoint, options = {}) => {
      if (endpoint.endsWith('/git/ref/heads/main')) return {object: {sha: base}};
      if (endpoint.endsWith('/git/commits/' + base)) return {tree: {sha: 'b'.repeat(40)}};
      if (endpoint.endsWith('/git/trees')) { tree = options.body.tree; return {sha: 'c'.repeat(40)}; }
      if (endpoint.endsWith('/git/commits')) return {sha: 'd'.repeat(40)};
      if (endpoint.endsWith('/git/refs')) return {};
      if (endpoint.endsWith('/pulls')) return {number: 42};
      throw Error('Unexpected publication request');
    }}});
    assert.deepEqual(tree.map(file => file.path), [`listings/${id}/listing.json`, 'policy/publishing.json']);
    await json(await x.processCall(reviewId, '/published-pr', {pr: 42}));
    await saveJSON(path.join(x.root, 'listings', id, 'listing.json'), prepared.package.listing);
    await saveJSON(path.join(x.root, 'policy/publishing.json'), prepared.package.policy);
  }
  const output = path.join(x.root, 'publication');
  const publication = await publish({root: x.root, output, api: x.api, issues: [], fetcher: async () => { throw Error('No image fetch'); }});
  assert.equal(publication.catalog.projects.length, 2);
  assert(publication.catalog.projects.every(project => project.cover === null && project.screenshots.length === 0));
  const snapshot = path.join(output, 'snapshot'), files = await payloadFiles(snapshot, path.join(output, 'work/dist/catalog.json'));
  assert.equal([...files.keys()].some(name => name.startsWith('assets/')), false);
  const key = generateKeyPairSync('ed25519');
  const config = {version: 1, enabled: true, source_repository: 'fictional/hub', source_repository_id: 42, backup_repository: 'fictional/vault', backup_repository_id: 84, default_branch: 'main', signing_key_id: 'test', public_keys: {test: key.publicKey.export({format: 'pem', type: 'spki'})}};
  const envelope = seal(config, files, {source_commit: base, run_id: 7, workflow: '.github/workflows/catalog.yml', ref: 'refs/heads/main', kind: 'publication'}, key.privateKey.export({format: 'pem', type: 'pkcs8'}));
  verifyEnvelope(config, envelope);
  const recovered = {point: `7-${envelope.snapshot_id}`, envelope, files};
  const destination = path.join(x.root, 'verified-export');
  await materialize(recovered, destination);
  await verifyExport(config, destination);
  await verifyPublicationFiles(recovered, path.join(output, 'work/dist'));
  x.state.projects = publication.catalog.projects;
  for (const id of ['gh-123', 'ext-abcdefghijkl']) {
    const feature = await preparePackage({row: {operation: 'feature', project_id: id, payload: {value: {}}}, root: x.root, api: x.api, fetcher: async url => { assert.equal(url, 'https://site.example/catalog.json'); return Response.json({projects: x.state.projects}); }, site: 'https://site.example', base});
    assert.equal(feature.package.featured_preview.cover, null);
    assert.deepEqual(feature.buffers, []);
  }
});

test('screenshot-only manifests preserve screenshot dimensions, filenames and exact approval ordering', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loghub-screenshots-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const metadata = {schema_version: 1, title: value.title, developer: value.creator, description: value.description, game: value.game, category: value.category, status: value.status, screenshots: ['docs/screenshot.png']};
  const record = manifestRecord(metadata, {id: 123, url: repository.html_url}, base);
  const {screenshots: _screenshots, ...withoutImages} = metadata;
  const empty = manifestRecord(withoutImages, {id: 123, url: repository.html_url}, base);
  assert.deepEqual(await inspectImages(empty, async () => { throw Error('Missing artwork must not fetch'); }), {outputs: [], artwork: []});
  assert.equal(record.cover, undefined);
  assert.deepEqual(imageEntries(record).map(image => image.name), ['screenshot-1.webp']);
  const png = await sharp({create: {width: 80, height: 120, channels: 3, background: '#307080'}}).png().toBuffer();
  const inspected = await inspectImages(record, async () => new Response(png));
  await writeImages(record, root, inspected.outputs);
  const bytes = await fs.readFile(path.join(root, 'assets', record.id, 'screenshot-1.webp'));
  const dimensions = await sharp(bytes).metadata();
  assert.equal(dimensions.width, 480); assert.equal(dimensions.height, 320);
  assert.equal(imageHash(bytes), inspected.artwork[0].sha256);
  assert.equal(artworkApproved({project_id: record.id, artwork_sets: [[]]}, record.id, inspected.artwork), false);
});

test('malformed image bytes still fail unless explicitly omitted, including a hosted manifest artwork selection', async t => {
  const x = await setup(t);
  const input = {...value, url: 'https://gitlab.com/community/artwork-free', artwork: ['https://images.example/bad.png']};
  const metadata = {schema_version: 1, title: value.title, developer: value.creator, description: value.description, game: value.game, category: value.category, status: value.status, cover: 'bad.png'};
  let imageRequests = 0;
  const fetcher = async url => {
    if (url.includes('/api/v4/projects/') && !url.includes('/repository/')) return Response.json({id: 91, visibility: 'public', archived: false, namespace: {id: 92}, path_with_namespace: 'community/artwork-free', last_activity_at: '2026-11-01T00:00:00Z'});
    if (url.includes('/repository/commits')) return Response.json([{id: base}]);
    if (url.includes('/repository/files/')) return Response.json(metadata);
    imageRequests++; return new Response('unverified image bytes');
  };
  await assert.rejects(prepareListing({submission: {id: 1, payload: input}, directory: path.join(x.root, 'bad'), api: x.api, fetcher}), /unsupported|Input buffer/);
  imageRequests = 0;
  const omitted = await prepareListing({submission: {id: 1, payload: input}, directory: path.join(x.root, 'omitted'), api: x.api, fetcher, overrides: {omitArtwork: true}});
  assert.equal(omitted.listing.omit_artwork, true);
  assert.equal(omitted.listing.cover, undefined);
  assert.deepEqual(omitted.proposed.artwork_sets, [[]]);
  assert.equal(imageRequests, 0);
});
