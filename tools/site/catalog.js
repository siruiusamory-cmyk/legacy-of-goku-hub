import Ajv from 'ajv';
import fs from 'node:fs/promises';
import {repoSlug} from '../../src/records.js';
import {validateState} from '../../src/catalog.js';
const schema = JSON.parse(await fs.readFile(new URL('../../schema/catalog.schema.json', import.meta.url)));
const check = new Ajv({allErrors: true}).compile(schema);
export async function validateSiteCatalog(catalog) {
  if (!check(catalog)) throw Error('invalid site catalog: ' + JSON.stringify(check.errors));
  const ids = new Set(), repositories = new Set();
  for (const p of catalog.projects) {
    if (ids.has(p.id) || repositories.has(p.repository_id)) throw Error('duplicate site identity');
    ids.add(p.id); repositories.add(p.repository_id);
    repoSlug(p.repository);
    await validateState({repository: {id: p.repository_id, archived: p.archived, url: p.repository}, availability: p.availability, release: p.release, last_updated: p.last_updated});
    if (p.cover !== `assets/${p.id}/cover.webp` || p.screenshots.some((s,i) => s !== `assets/${p.id}/screenshot-${i+1}.webp`)) throw Error('unsafe site image path');
    for (const link of p.links || []) {
      const u = new URL(link.url);
      if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash || !(/^(github\.com|discord\.gg|discord\.com|(?:www\.)?youtube\.com)$/.test(u.hostname) || /^[a-z0-9-]+\.github\.io$/.test(u.hostname))) throw Error('unsafe site link');
    }
  }
  for (const values of Object.values(catalog.sort)) if (values.length !== ids.size || values.some(id => !ids.has(id))) throw Error('site sort identities mismatch');
  return catalog;
}
