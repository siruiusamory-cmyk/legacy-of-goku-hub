import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {featuredFixture, featureBase} from '../tools/admin/featured-fixture.js';
import {preparePackage, createPublicationPR} from '../tools/admin/process.js';
import {readJSON, saveJSON} from '../src/records.js';
import {policyCheck} from '../src/moderation.js';
import {validateSubmission} from '../website/src/lib/submission.js';

const WARNING = 'Also makes this the Featured project on the home page, replacing the current one if there is one.';
const UNCHANGED = {message: 'Nothing has changed from the published listing.'};
const digest = pkg => createHash('sha256').update(JSON.stringify(pkg)).digest('base64url');
const featuredIds = policy => [...policy.projects, ...policy.external_projects].filter(rule => rule.featured).map(rule => rule.project_id);

async function setup(t) {
  const x = await featuredFixture();
  t.after(() => x.dispose());
  return x;
}
const run = (x, row) => preparePackage({row, root: x.root, api: x.api, fetcher: x.fetchImages, site: 'https://site.example', base: featureBase});
const addition = (x, feature, project_id = 'ext-approval0001') => run(x, {project_id, operation: 'submission', payload: {value: {
  kind: 'add', title: 'Approval Training Project', creator: 'Approval team', description: 'An isolated project for Featured approval acceptance.',
  category: 'rom-hack', game: 'legacy-of-goku-2', status: 'in-development', url: 'https://forum.example.org/approval-fixture/', artwork: ['https://images.example/external.png']
}, ...(feature === undefined ? {} : {feature})}});
async function featureGithub(x) {
  const policy = await readJSON(path.join(x.root, 'policy/publishing.json'));
  policy.external_projects.find(rule => rule.project_id === 'gh-123').featured = true;
  await saveJSON(path.join(x.root, 'policy/publishing.json'), policy);
  return policy;
}

test('Also make Featured is placed in the one approved package and clears the previous Featured rule', async t => {
  const x = await setup(t); await featureGithub(x);
  const {package: pkg} = await addition(x, true);
  assert.deepEqual(featuredIds(pkg.policy), [pkg.project_id]);
  assert.equal(pkg.rule.featured, true);
  assert.equal(pkg.policy.external_projects.find(rule => rule.project_id === 'gh-123').featured, false);
  assert.equal(pkg.warnings.filter(warning => warning === WARNING).length, 1);
  policyCheck(pkg.policy);
});

test('Featured is also set when no project was Featured before and the identity is assigned during preparation', async t => {
  const x = await setup(t);
  const {package: pkg} = await addition(x, true, null);
  assert.deepEqual(featuredIds(pkg.policy), [pkg.project_id]);
});

test('without the flag the existing Featured rule is untouched', async t => {
  const x = await setup(t); const before = await featureGithub(x);
  for (const feature of [undefined, false, 'true']) {
    const {package: pkg} = await addition(x, feature);
    assert.deepEqual(featuredIds(pkg.policy), ['gh-123']);
    assert.equal(pkg.rule.featured, undefined);
    assert.equal(pkg.warnings.includes(WARNING), false);
    assert.deepEqual(pkg.policy.external_projects.find(rule => rule.project_id === 'gh-123'), before.external_projects.find(rule => rule.project_id === 'gh-123'));
  }
});

test('the flag on an edit, a correction or a suggestion for a listed project fails preparation', async t => {
  const x = await setup(t);
  const rows = [
    {project_id: 'gh-123', operation: 'edit', payload: {value: {title: 'Changed title'}, feature: true}},
    {project_id: 'ext-abcdefghijkl', operation: 'submission', payload: {value: {kind: 'correct', listing_id: 'ext-abcdefghijkl', creator: 'Real Author'}, feature: true}},
    {project_id: 'ext-abcdefghijkl', operation: 'submission', payload: {value: {kind: 'suggest', title: 'Community Training Project', creator: 'Training team', url: 'https://forum.example.org/featured-fixture/'}, feature: true}}
  ];
  for (const row of rows) await assert.rejects(run(x, row), /^Error: Featured can only be chosen when approving a new listing$/);
});

test('the approved digest covers the Featured choice and the pull request carries exactly the approved policy', async t => {
  const x = await setup(t); await featureGithub(x);
  const featured = await addition(x, true), plain = await addition(x, false);
  plain.package.listing.approved_at = featured.package.listing.approved_at;
  assert.notEqual(digest(featured.package), digest(plain.package));
  const strip = pkg => ({...pkg, policy: null, rule: null, warnings: null});
  assert.equal(digest(strip(featured.package)), digest(strip(plain.package)), 'only the Featured choice differs');
  const pkg = featured.package, calls = [];
  const api = {request: async (endpoint, options = {}) => {
    calls.push({endpoint, ...options});
    if (endpoint.endsWith('/git/ref/heads/main')) return {object: {sha: featureBase}};
    if (endpoint.endsWith('/git/commits/' + featureBase)) return {tree: {sha: 'b'.repeat(40)}};
    if (endpoint.endsWith('/git/blobs')) return {sha: 'e'.repeat(40)};
    if (endpoint.endsWith('/git/trees') || endpoint.endsWith('/git/commits')) return {sha: 'c'.repeat(40)};
    if (endpoint.endsWith('/git/refs')) return {};
    if (endpoint.endsWith('/pulls')) return {number: 42};
    throw Error('Unexpected publication request');
  }};
  const loadFile = async file => featured.buffers.find(buffer => buffer.name === file.name).bytes;
  const row = {id: 'review-1', state: 'publishing', digest: digest(pkg), approved_digest: digest(pkg), package: pkg};
  assert.equal(await createPublicationPR({row, api, repo: 'fictional/hub', loadFile}), 42);
  const tree = calls.find(call => call.endpoint.endsWith('/git/trees')).body.tree;
  const policy = tree.find(file => file.path === 'policy/publishing.json');
  assert.equal(policy.content, JSON.stringify(pkg.policy, null, 2) + '\n');
  assert.deepEqual(featuredIds(JSON.parse(policy.content)), [pkg.project_id]);
  const flipped = structuredClone(pkg); flipped.rule.featured = false;
  for (const rule of flipped.policy.external_projects) rule.featured = rule.project_id === 'gh-123';
  await assert.rejects(createPublicationPR({row: {...row, package: flipped}, api, repo: 'fictional/hub', loadFile}), /Approval digest mismatch/);
});

test('an edit or a correction that leaves the published listing as it is fails, including an emptied field', async t => {
  const x = await setup(t);
  const listing = await readJSON(path.join(x.root, 'listings/ext-abcdefghijkl/listing.json'));
  const correction = payload => {
    const checked = validateSubmission({kind: 'correct', listing_id: 'ext-abcdefghijkl', ...payload});
    assert.equal(checked.ok, true, JSON.stringify(checked.errors));
    return {project_id: 'ext-abcdefghijkl', operation: 'submission', payload: {value: checked.value, reason: '', transfer: false, omit_artwork: false}};
  };
  const rows = [
    {project_id: 'ext-abcdefghijkl', operation: 'edit', payload: {value: {}, reason: '', omit_artwork: false}},
    {project_id: 'ext-abcdefghijkl', operation: 'edit', payload: {value: {title: listing.title, description: listing.description}, reason: '', omit_artwork: false}},
    {project_id: 'gh-123', operation: 'edit', payload: {value: {}}},
    correction({note: 'Please check the creator.'}),
    correction({creator: listing.developer, note: 'Same creator.'}),
    correction({creator: '', title: '', note: 'Emptied fields.'})
  ];
  assert.equal(rows.at(-1).payload.value.creator, undefined, 'validation drops the emptied field');
  for (const row of rows) await assert.rejects(run(x, row), UNCHANGED);
});

test('a changed field, changed artwork bytes or a corrected creator still prepares', async t => {
  const x = await setup(t);
  const rows = [
    {project_id: 'ext-abcdefghijkl', operation: 'edit', payload: {value: {title: 'Renamed Community Project'}}},
    {project_id: 'ext-abcdefghijkl', operation: 'edit', payload: {value: {artwork: ['https://images.example/github.png']}}},
    {project_id: 'ext-abcdefghijkl', operation: 'submission', payload: {value: validateSubmission({kind: 'correct', listing_id: 'ext-abcdefghijkl', creator: 'Real Author'}).value}},
    {project_id: 'ext-abcdefghijkl', operation: 'edit', payload: {value: {}, omit_artwork: true}}
  ];
  const results = [];
  for (const row of rows) results.push((await run(x, row)).package);
  assert.equal(results[0].listing.title, 'Renamed Community Project');
  assert.notDeepEqual(results[1].rule.artwork_sets, (await readJSON(path.join(x.root, 'policy/publishing.json'))).external_projects.find(rule => rule.project_id === 'ext-abcdefghijkl').artwork_sets);
  assert.equal(results[2].listing.developer, 'Real Author');
  assert.equal(results[3].listing.omit_artwork, true);
});

test('swapping artwork to other bytes from an approved set with the same file name prepares; identical bytes are still unchanged', async t => {
  const x = await setup(t);
  const swap = {project_id: 'ext-abcdefghijkl', operation: 'edit', payload: {value: {artwork: ['https://images.example/github.png']}}};
  const first = (await run(x, swap)).package;
  await saveJSON(path.join(x.root, 'policy/publishing.json'), first.policy);
  const again = await run(x, swap);
  assert.deepEqual(again.package.policy.external_projects.map(rule => ({...rule, content_digests: undefined})), first.policy.external_projects.map(rule => ({...rule, content_digests: undefined})), 'the artwork set is already approved');
  assert.equal(JSON.stringify({...again.package.listing, approved_at: undefined}), JSON.stringify({...(await readJSON(path.join(x.root, 'listings/ext-abcdefghijkl/listing.json'))), approved_at: undefined}), 'the listing and file names are as published');
  for (const file of again.buffers.filter(file => !file.name.startsWith('preview-'))) await fs.writeFile(path.join(x.root, 'listings/ext-abcdefghijkl', file.name), file.bytes);
  await assert.rejects(run(x, swap), UNCHANGED);
});
