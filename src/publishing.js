import fs from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';
import {readJSON, saveJSON, loadRecords, validateRecord} from './records.js';
import {repositoryInfo, releaseInfo} from './github.js';
import {processImages} from './images.js';
import {buildCatalog, validateState} from './catalog.js';
import {checkDownload} from './pipeline.js';
import {parseSubmission, loadManifest, manifestRecord, digest} from './intake.js';

const validatePolicy = new Ajv({allErrors: true}).compile(await readJSON(new URL('../schema/policy.schema.json', import.meta.url)));
export function policyCheck(policy) {
  if (!validatePolicy(policy)) throw Error('publishing policy: ' + JSON.stringify(validatePolicy.errors));
  if (new Set(policy.projects.map(p => p.repository_id)).size !== policy.projects.length) throw Error('policy: duplicate repository IDs');
  return policy;
}
const positive = n => Number.isSafeInteger(n) && n > 0;
export async function readSnapshot(root) {
  if (!root) return [];
  const registry = await readJSON(path.join(root, 'registry.json'));
  if (registry.version !== 1 || !Array.isArray(registry.entries) || registry.entries.length > 1000) throw Error('invalid snapshot registry');
  const ids = new Set(); const names = new Set(); const entries = [];
  for (const entry of registry.entries) {
    if (!positive(entry.repository_id) || !positive(entry.owner_id) || ids.has(entry.repository_id) || names.has(entry.id) || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(entry.id) || entry.id.length > 64 || !['manifest', 'guided', 'legacy'].includes(entry.source?.method)) throw Error('invalid or duplicate snapshot identity');
    ids.add(entry.repository_id); names.add(entry.id);
    const record = validateRecord(await readJSON(path.join(root, 'records', entry.id + '.json')));
    const state = await readJSON(path.join(root, 'state', entry.id + '.json')); await validateState(state);
    if (record.id !== entry.id || state.repository.id !== entry.repository_id || state.repository.owner_id !== entry.owner_id) throw Error('snapshot identity mismatch');
    entries.push({...entry, record, state, files: root});
  }
  return entries;
}
async function copyProject(from, to, record) {
  await fs.mkdir(path.join(to, 'assets', record.id), {recursive: true});
  for (const name of ['cover.webp', ...(record.screenshots || []).map((_, i) => `screenshot-${i + 1}.webp`)]) {
    await fs.copyFile(path.join(from, 'assets', record.id, name), path.join(to, 'assets', record.id, name));
  }
}
function controls(candidate, repo, rule) {
  return (repo.owner_type === 'User' && candidate.user_id === repo.owner_id) || (rule?.representative_ids || []).includes(candidate.user_id);
}
export async function listSubmissions(api, hub) {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await api.request(`/repos/${hub}/issues?state=all&sort=created&direction=asc&per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length > 100) throw Error('invalid issue ledger');
    all.push(...batch.filter(i => !i.pull_request && /^(\[Submission\]|\[Manifest\]|\[Claim\])/.test(i.title || '')));
    if (batch.length < 100) return all;
  }
  throw Error('issue ledger exceeds 1000 entries; archive/migrate through administrator policy before publishing');
}
export async function publish({root, previous, output, api, issues, fetcher = fetch}) {
  const policy = policyCheck(await readJSON(path.join(root, 'policy/publishing.json')));
  const entries = new Map((await readSnapshot(previous)).map(e => [e.repository_id, e]));
  const report = [];
  const rules = new Map(policy.projects.map(p => [p.repository_id, p]));
  for (const record of await loadRecords(root)) {
    const state = await readJSON(path.join(root, 'state', record.id + '.json')); await validateState(state);
    if (entries.has(state.repository.id)) continue;
    const rule = rules.get(state.repository.id);
    if (!rule || rule.decision !== 'approved') { report.push({id: record.id, outcome: 'review', reason: 'legacy seed needs explicit stable-ID ownership approval'}); continue; }
    if (state.repository.owner_id && state.repository.owner_id !== rule.owner_id) throw Error('legacy owner identity conflicts with migration policy');
    const boundState = {...state, repository: {...state.repository, owner_id: rule.owner_id}};
    entries.set(state.repository.id, {id: record.id, repository_id: state.repository.id, owner_id: rule.owner_id, source: {method: 'legacy'}, record, state: boundState, files: root});
  }
  const grouped = new Map(); const resolved = new Map();
  for (const issue of [...issues].sort((a, b) => a.number - b.number)) {
    try {
      const submission = parseSubmission(issue);
      let repo = resolved.get(submission.repository.toLowerCase());
      if (!repo) { repo = await repositoryInfo(api, {repository: submission.repository}); resolved.set(submission.repository.toLowerCase(), repo); }
      if (!positive(repo.owner_id)) throw Error('GitHub: missing stable owner ID');
      if (!grouped.has(repo.id)) grouped.set(repo.id, {repository: repo, candidates: []});
      grouped.get(repo.id).candidates.push(submission);
    } catch (error) { report.push({issue: issue.number, outcome: 'review', reason: error.message}); }
  }
  const snapshot = path.join(output, 'snapshot'); const work = path.join(output, 'work');
  await fs.mkdir(path.join(work, 'records'), {recursive: true});
  await fs.mkdir(path.join(snapshot, 'records'), {recursive: true});
  const saved = [];
  for (const repositoryId of [...new Set([...entries.keys(), ...grouped.keys()])].sort((a, b) => a - b)) {
    const prior = entries.get(repositoryId); const group = grouped.get(repositoryId); const rule = rules.get(repositoryId);
    let entry = prior; let visible = !!prior;
    const candidates = group?.candidates || [];
    try {
      if (['suspended', 'delisted'].includes(rule?.decision)) { visible = false; throw Error(`policy: ${rule.decision}; ${rule.reason || 'administrator decision'}`); }
      const repo = prior ? await repositoryInfo(api, prior.record, repositoryId) : group.repository;
      if (repo.id !== repositoryId || !positive(repo.owner_id)) throw Error('repository stable identity mismatch');
      if (prior && repo.owner_id !== prior.owner_id && !(rule?.decision === 'approved' && rule.owner_id === repo.owner_id)) throw Error('repository transfer: new numeric owner requires administrator approval');
      if (rule && rule.owner_id !== repo.owner_id) throw Error('policy owner no longer matches repository controller');
      if (policy.revoked_owner_ids.includes(repo.owner_id) || rule?.decision === 'review') throw Error('trust revoked or project explicitly held for review; snapshot frozen');
      for (const candidate of candidates) {
        if (candidate.action === 'Report ownership dispute') report.push({issue: candidate.number, repository_id: repositoryId, outcome: 'review', reason: 'ownership dispute requires a moderator; report cannot transfer listing control'});
        else if (!controls(candidate, repo, rule) && candidate.method === 'Guided form' && !(rule?.approved_issue === candidate.number && rule.approved_digest === candidate.digest)) report.push({issue: candidate.number, repository_id: repositoryId, outcome: 'review', submission_digest: candidate.digest, reason: 'third-party submission/claim has no edit authority; exact-content administrator approval required'});
      }
      const authorized = candidates.filter(c => c.action !== 'Report ownership dispute' && (controls(c, repo, rule) || (rule?.approved_issue === c.number && rule.approved_digest === c.digest)));
      let selected = authorized.at(-1) || (!prior ? candidates.filter(c => c.action !== 'Report ownership dispute').at(-1) : undefined);
      let metadata, commit, method;
      try {
        ({metadata, commit} = await loadManifest(api, repo)); method = 'manifest';
      } catch (error) {
        if (error.status !== 404) throw error;
        if (prior?.source.method === 'manifest' || authorized.some(c => c.method === 'Repository manifest')) throw Error('manifest missing: restore .loghub.json; existing claim is retained, never handed to another submitter');
        if (!selected) {
          if (!prior) throw Error('no authorized metadata source; new/unclaimed project requires review');
          if (prior.source.method === 'legacy') { metadata = null; method = 'legacy'; }
          else throw Error('approved guided source unavailable or edited without authority; snapshot retained');
        } else {
          if (selected.method !== 'Guided form') throw Error('expected repository manifest');
          if (prior?.source.method === 'guided' && selected.number < prior.source.issue) throw Error('newest guided source is missing; refusing rollback to an older issue');
          metadata = selected.metadata; method = 'guided';
          const head = await api.request(`/repos/${repo.url.slice(19)}/commits/HEAD`); commit = head?.sha;
        }
      }
      const owned = method === 'manifest' || (selected && controls(selected, repo, rule));
      const approved = rule?.decision === 'approved' || !!prior || (policy.trusted_owner_ids.includes(repo.owner_id) && owned);
      let record = metadata ? manifestRecord(metadata, repo, commit, prior?.id) : validateRecord({...prior.record, repository: repo.url});
      const metadataDigest = digest(metadata || record);
      if (prior && ['developer', 'game', 'category'].some(key => prior.record[key] !== record[key]) && rule?.approved_metadata_digest !== metadataDigest) throw Error(`sensitive attribution/game/category change requires review; metadata digest ${metadataDigest}`);
      record = {...record, featured: rule?.featured || false};
      const release = await releaseInfo(api, record, repo);
      if (!release && (prior?.state.release || record.status === 'released')) throw Error('release disappeared or released project has no stable download');
      if (!approved || (!owned && method !== 'legacy' && !(rule?.approved_issue === selected?.number && rule.approved_digest === selected.digest))) {
        if (release) await checkDownload(release.download_url, fetcher);
        await processImages(record, path.join(output, 'candidates'), fetcher);
        throw Error('new/untrusted or third-party project: validated mechanically; administrator review required before first publication');
      }
      const state = {repository: repo, release, availability: repo.archived ? 'archived' : 'available', warning: null,
        ownership: {claim: owned ? (method === 'guided' && rule?.representation_verified ? 'verified-representative' : 'repository-controlled') : 'unclaimed', representation_verified: rule?.representation_verified || false},
        last_updated: [repo.updated_at, release?.updated_at, release?.release_date].filter(Boolean).sort().at(-1)};
      if (release) await checkDownload(release.download_url, fetcher);
      const unchangedImages = prior && prior.record.cover === record.cover && JSON.stringify(prior.record.screenshots || []) === JSON.stringify(record.screenshots || []);
      if (unchangedImages) await copyProject(prior.files, snapshot, record);
      else await processImages(record, snapshot, fetcher);
      entry = {id: record.id, repository_id: repo.id, owner_id: repo.owner_id, source: {method, ...(selected ? {issue: selected.number, user_id: selected.user_id, digest: selected.digest} : prior?.source.issue ? {issue: prior.source.issue} : {})}, record, state, files: snapshot};
      visible = true;
      report.push({repository_id: repo.id, issues: candidates.filter(c => c.action !== 'Report ownership dispute' && (controls(c, repo, rule) || (c.method === 'Repository manifest' && method === 'manifest') || (rule?.approved_issue === c.number && rule.approved_digest === c.digest))).map(c => c.number), outcome: 'published', claim: state.ownership.claim, metadata_digest: metadataDigest});
    } catch (error) {
      report.push({repository_id: repositoryId, issues: candidates.map(c => c.number), outcome: visible ? 'retained' : 'review', reason: error.message,
        owner_id: group?.repository.owner_id || prior?.owner_id,
        ...(candidates.length ? {submission_digest: candidates.at(-1).digest} : {})});
      if (entry && visible) entry = {...entry, state: {...entry.state, availability: 'unavailable', warning: error.message}};
    }
    if (!entry) continue;
    if (entry.files !== snapshot) await copyProject(entry.files, snapshot, entry.record);
    await saveJSON(path.join(snapshot, 'records', entry.id + '.json'), entry.record);
    await saveJSON(path.join(snapshot, 'state', entry.id + '.json'), entry.state);
    const {record, state, files, ...registration} = entry; saved.push(registration);
    if (visible) {
      await copyProject(snapshot, work, record);
      await saveJSON(path.join(work, 'records', entry.id + '.json'), record);
      await saveJSON(path.join(work, 'state', entry.id + '.json'), state);
    }
  }
  await saveJSON(path.join(snapshot, 'registry.json'), {version: 1, entries: saved});
  const catalog = await buildCatalog(work);
  await saveJSON(path.join(output, 'report.json'), report);
  return {catalog, report};
}
