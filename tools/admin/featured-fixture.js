import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {fixture} from './test-fixture.js';
import {preparePackage} from './process.js';
import {GitHub} from '../../src/github.js';
import {publish} from '../../src/publishing.js';
import {readJSON, saveJSON} from '../../src/records.js';

export const featureBase = 'a'.repeat(40);
export async function featuredFixture() {
  const x = await fixture();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loghub-featured-'));
  await fs.mkdir(path.join(root, 'records'));
  await saveJSON(path.join(root, 'policy/publishing.json'), {version: 1, trusted_owner_ids: [], revoked_owner_ids: [], projects: [], external_projects: []});
  const repository = (await readJSON(new URL('../../tests/fixtures/github.json', import.meta.url))).repository;
  const api = new GitHub({token: '', fetcher: async url => url.includes('/releases/latest') ? new Response('{}', {status: 404}) : Response.json({...repository, owner: {...repository.owner, id: 99}})});
  const images = {};
  for (const [name, background] of [['github', '#8c3040'], ['external', '#307080']]) images[name] = await sharp({create: {width: 80, height: 120, channels: 3, background}}).png().toBuffer();
  let current, sequence = 0;
  const fetcher = async url => {
    const target = new URL(url);
    if (target.origin === 'https://site.example') {
      if (target.pathname === '/catalog.json') return Response.json({projects: x.state.projects});
      return new Response(await fs.readFile(path.join(current.output, 'work/dist', target.pathname.slice(1))));
    }
    const image = images[path.basename(target.pathname, '.png')];
    assert(image, 'Unexpected fixture request ' + url);
    return new Response(image);
  };
  for (const [id, name, url] of [['gh-123', 'github', repository.html_url], ['ext-abcdefghijkl', 'external', 'https://forum.example.org/featured-fixture/']]) {
    const prepared = await preparePackage({row: {project_id: id, operation: 'submission', payload: {value: {
      kind: 'suggest', title: name === 'github' ? 'GitHub Training Project' : 'Community Training Project', creator: 'Training team',
      description: 'An isolated ' + name + ' project for Featured management acceptance.', category: 'rom-hack', game: 'legacy-of-goku-2',
      status: 'in-development', url, artwork: ['https://images.example/' + name + '.png'],
      links: [{label: 'Community documentation', url: 'https://docs.example.org/' + name}],
      ...(name === 'external' ? {patch_url: 'https://files.example.org/training.bps'} : {})
    }}}, root, api, fetcher, base: featureBase});
    await saveJSON(path.join(root, 'listings', id, 'listing.json'), prepared.package.listing);
    for (const file of prepared.buffers.filter(file => !file.name.startsWith('preview-'))) await fs.writeFile(path.join(root, 'listings', id, file.name), file.bytes);
    if (name === 'external') prepared.package.rule.claim = {method: 'manual', proof_digest: 'd'.repeat(64), verified_at: '2026-11-01T00:00:00Z'};
    await saveJSON(path.join(root, 'policy/publishing.json'), prepared.package.policy);
  }
  x.state.policy = await readJSON(path.join(root, 'policy/publishing.json'));
  const refresh = async () => {
    const output = path.join(root, 'publication-' + sequence++);
    const result = await publish({root, previous: current?.snapshot, output, api, issues: [], fetcher});
    current = {...result, output, snapshot: path.join(output, 'snapshot')};
    x.state.projects = result.catalog.projects;
    x.state.policy = await readJSON(path.join(root, 'policy/publishing.json'));
    return current;
  };
  const prepare = async (operation, id) => preparePackage({row: {project_id: id, operation, payload: {value: {}, reason: 'Isolated Featured acceptance'}}, root, api, fetcher, site: 'https://site.example', base: featureBase});
  const dispose = async () => { x.db.close(); await fs.rm(root, {recursive: true, force: true}); };
  return {...x, root, api, fetchImages: fetcher, refresh, prepare, dispose};
}
