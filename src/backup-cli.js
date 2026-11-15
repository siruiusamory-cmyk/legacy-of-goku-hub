import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {GitHub} from './github.js';
import {readJSON, saveJSON} from './records.js';
import {RecoveryStore, recoveryConfig, payloadFiles, materialize} from './recovery.js';
import {selectSnapshot} from './service-cli.js';
import {loadRecords} from './records.js';
import {buildCatalog} from './catalog.js';

export async function sourceIdentity(api, config) {
  const source = await api.request(`/repositories/${config.source_repository_id}`);
  if (source.id !== config.source_repository_id || source.full_name !== config.source_repository || source.private !== false || source.default_branch !== config.default_branch) throw Error('source repository identity/default branch mismatch');
}
export async function backupHealth(api, store, now = Date.now()) {
  const latest = await store.latest(); const c = store.config;
  const runs = await api.request(`/repos/${c.source_repository}/actions/workflows/catalog.yml/runs?branch=${encodeURIComponent(c.default_branch)}&status=completed&per_page=100`);
  if (!Array.isArray(runs.workflow_runs)) throw Error('invalid publication history');
  for (const run of runs.workflow_runs) {
    if (run.repository?.id !== c.source_repository_id || run.head_repository?.id !== c.source_repository_id || run.path?.split('@')[0] !== '.github/workflows/catalog.yml' || run.head_branch !== c.default_branch || !['issues', 'push', 'workflow_dispatch', 'schedule'].includes(run.event)) continue;
    const jobs = await api.request(`/repos/${c.source_repository}/actions/runs/${run.id}/jobs?per_page=100`);
    if (!Array.isArray(jobs.jobs)) throw Error('invalid publication job history');
    if (!jobs.jobs.some(j => j.name === 'publish' && j.conclusion === 'success' && j.status === 'completed')) continue;
    const age = now - Date.parse(run.updated_at);
    if (!Number.isFinite(age) || age < -60000 || age > 48 * 3600000 || run.id < latest.run_id) throw Error('backup verification/publication is stale (over 48 hours) or precedes newest recovery point');
    return {point: latest.point, snapshot_id: latest.envelope.snapshot_id, verified_publication_run: run.id, age_hours: age / 3600000};
  }
  throw Error('no verified durable publication; maintainers must investigate');
}
async function main() {
  const root = process.cwd(); const command = process.argv[2];
  const config = recoveryConfig(await readJSON(path.join(root, 'policy/recovery.json')));
  const source = new GitHub();
  if (command === 'config') {
    if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== config.source_repository) throw Error('workflow repository is not configured source');
    if (process.env.GITHUB_REF && process.env.GITHUB_REF !== `refs/heads/${config.default_branch}`) throw Error('recovery is restricted to the protected source default branch');
    await sourceIdentity(source, config);
    if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `owner=${config.backup_repository.split('/')[0]}\nrepository=${config.backup_repository.split('/')[1]}\n`);
    console.log('recovery configuration and source identity verified'); return;
  }
  if (command === 'prepare-bootstrap') {
    await sourceIdentity(source, config);
    if (process.env.INITIALIZE_BACKUP !== 'I_AUTHORIZE_INITIAL_RECOVERY_POINT' || (await loadRecords(root)).length || (await selectSnapshot(source, config.source_repository, process.env.GITHUB_RUN_ID))) throw Error('empty initialization forbidden: explicit approval and a never-published empty hub are required');
    await saveJSON(path.join(root, '.bootstrap/snapshot/registry.json'), {version: 1, entries: []});
    await buildCatalog(root); console.log('Explicitly authorized empty initial hub prepared'); return;
  }
  if (!process.env.BACKUP_TOKEN) throw Error('BACKUP_TOKEN required; use a backup-only GitHub App installation token');
  const store = new RecoveryStore(config, new GitHub({token: process.env.BACKUP_TOKEN}), source);
  await sourceIdentity(source, config);
  if (command === 'restore' || command === 'export' || command === 'inspect') {
    const recovered = await store.latest({inspect: command === 'inspect'});
    const destination = path.resolve(process.argv[3] || (command === 'restore' ? '.previous' : 'recovery-export'));
    await materialize(recovered, destination);
    console.log(`${command}: integrity/signature verified ${recovered.point}${recovered.failures.length ? '; older point selected under explicit policy/inspection' : ''}`);
    if (command === 'inspect') console.log('Inspection only: this export does not authorize rollback/publication.');
  } else if (command === 'backup' || command === 'initialize') {
    if (command === 'initialize' && process.env.INITIALIZE_BACKUP !== 'I_AUTHORIZE_INITIAL_RECOVERY_POINT') throw Error('explicit administrator initialization acknowledgment required');
    const snapshot = path.resolve(process.argv[3] || '.generated/snapshot');
    const catalog = path.resolve(process.argv[4] || '.generated/work/dist/catalog.json');
    if (command === 'initialize' && !process.argv[3] && (await selectSnapshot(source, config.source_repository, process.env.GITHUB_RUN_ID))) throw Error('existing publication exists; supply an explicit reviewed export path for initialization');
    const commit = process.env.SOURCE_COMMIT || execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
    const provenance = {source_commit: commit, run_id: Number(process.env.GITHUB_RUN_ID), workflow: '.github/workflows/catalog.yml', ref: `refs/heads/${config.default_branch}`, kind: command === 'initialize' ? 'initialization' : 'publication'};
    if (!process.env.BACKUP_SIGNING_KEY) throw Error('BACKUP_SIGNING_KEY required; never put it in files or arguments');
    const recovered = await store.backup(await payloadFiles(snapshot, catalog), provenance, process.env.BACKUP_SIGNING_KEY, {initialize: command === 'initialize'});
    await saveJSON(path.join(root, '.generated/backup-receipt.json'), {point: recovered.point, snapshot_id: recovered.envelope.snapshot_id, commit: recovered.commit, reused: recovered.reused, verified: true});
    console.log(`backup: durably verified ${recovered.point}; reused=${recovered.reused}`);
  } else if (command === 'anchor' || command === 'verify-publication') {
    const receipt = await readJSON(path.join(root, '.generated/backup-receipt.json'));
    const recovered = await store.read({point: receipt.point, commit: receipt.commit, run_id: Number(receipt.point.split('-')[0])});
    if (command === 'anchor') await store.anchor(recovered);
    else {
      const latest = await store.latest();
      const files = await payloadFiles(path.join(root, '.generated/snapshot'), path.join(root, '.generated/work/dist/catalog.json'));
      if (latest.point !== receipt.point || latest.commit !== receipt.commit || files.size !== latest.files.size || [...files].some(([name, bytes]) => !latest.files.get(name)?.equals(bytes))) throw Error('publication does not match protected durable recovery point');
    }
    console.log(`${command}: protected durable recovery point verified`);
  } else if (command === 'health') console.log(JSON.stringify(await backupHealth(source, store)));
  else throw Error('usage: node src/backup-cli.js config|restore|backup|initialize|anchor|verify-publication|export|inspect|health [snapshot/export directory] [catalog file]');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
