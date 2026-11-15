import fs from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';
import {readJSON} from './records.js';
import {imageHash} from './images.js';
import {digest} from './intake.js';

const check = new Ajv({allErrors: true}).compile(await readJSON(new URL('../schema/policy.schema.json', import.meta.url)));
export function policyCheck(policy) {
  if (!check(policy)) throw Error('publishing policy: ' + JSON.stringify(check.errors));
  if (new Set(policy.projects.map(p => p.repository_id)).size !== policy.projects.length) throw Error('policy: duplicate repository IDs');
  return policy;
}
export function contentDigest(record, repository, release) {
  const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
  return digest(sorted({project_id: record.id, repository_id: repository.id, owner_id: repository.owner_id, record: {...record, featured: false, links: record.links || []}, release}));
}
export function artworkApproved(rule, id, artwork) {
  return Array.isArray(artwork) && rule?.project_id === id && rule.artwork_sets?.some(set => set.length === artwork.length && set.every((image, i) => image.source_sha256 === artwork[i].source_sha256 && image.sha256 === artwork[i].sha256));
}
export function entryApproved(entry, policy) {
  const rule = policy.projects.find(p => p.repository_id === entry.repository_id);
  return rule?.owner_id === entry.owner_id && rule.project_id === entry.id &&
    rule.content_digests?.includes(entry.moderation?.initial_content_digest) &&
    artworkApproved(rule, entry.id, entry.moderation?.artwork);
}
export async function verifyEntryArtwork(entry) {
  const names = ['cover.webp', ...(entry.record.screenshots || []).map((_, i) => `screenshot-${i + 1}.webp`)];
  if (entry.moderation?.artwork?.length !== names.length) throw Error('missing artwork moderation receipt');
  for (const [i, name] of names.entries()) {
    if (imageHash(await fs.readFile(path.join(entry.files, 'assets', entry.id, name))) !== entry.moderation.artwork[i].sha256) throw Error('approved artwork checksum mismatch');
  }
}
export async function assertPublicationPolicy(snapshot, catalog, policy, entries) {
  policyCheck(policy);
  for (const entry of entries) {
    if (!entryApproved(entry, policy)) throw Error('snapshot contains artwork/content without current approval');
    await verifyEntryArtwork({...entry, files: snapshot});
  }
  for (const project of catalog.projects) {
    const entry = entries.find(e => e.repository_id === project.repository_id && e.id === project.id);
    const rule = policy.projects.find(p => p.repository_id === project.repository_id);
    if (!entry || ['suspended', 'delisted'].includes(rule.decision) || policy.revoked_owner_ids.includes(entry.owner_id)) throw Error('current moderation policy excludes catalog project');
  }
}
