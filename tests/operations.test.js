import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notifyOperations} from '../tools/notify-operations.js';
import fs from 'node:fs/promises';
import YAML from 'yaml';

test('operational failures create one owner notification, repeat by comment, and close on recovery', async () => {
  let issue; let creates = 0; let comments = 0;
  const api = {request: async (endpoint, options = {}) => {
    if (endpoint.includes('/issues?')) return issue ? [{...issue}] : [];
    if (endpoint.includes('/labels/')) return {name: 'loghub-operations'};
    if (endpoint.endsWith('/issues') && options.method === 'POST') {creates++; issue = {...options.body, number: 1, state: 'open'}; return {...issue};}
    if (endpoint.endsWith('/comments')) {comments++; return {};}
    if (options.method === 'PATCH') {issue.state = options.body.state; return {...issue};}
    throw Error('unexpected notification operation');
  }};
  const context = {failed: true, runId: 123};
  await notifyOperations(api, 'owner/hub', context); await notifyOperations(api, 'owner/hub', context);
  assert.equal(creates, 1); assert.equal(comments, 1); assert.match(issue.body, /@owner/);
  assert.ok(!issue.body.includes('BACKUP_TOKEN'));
  await notifyOperations(api, 'owner/hub', {...context, failed: false}); assert.equal(issue.state, 'closed');
  await assert.rejects(notifyOperations(api, '../unsafe', context), /repository/);
});
test('alert self-tests cannot close an existing real incident', async () => {
  const real = {number: 1, title: '[Operations] Backup or publication needs attention', state: 'open', labels: ['loghub-operations']};
  const issues = [real];
  const api = {request: async (endpoint, options = {}) => {
    if (endpoint.includes('/issues?')) {const label = new URL('https://example.invalid' + endpoint).searchParams.get('labels'); return issues.filter(i => i.labels.includes(label)).map(i => ({...i}));}
    if (endpoint.includes('/labels/')) return {};
    if (endpoint.endsWith('/issues') && options.method === 'POST') {const issue = {...options.body, number: issues.length + 1, state: 'open'}; issues.push(issue); return {...issue};}
    if (endpoint.endsWith('/comments')) return {};
    if (options.method === 'PATCH') {const issue = issues.find(i => endpoint.endsWith('/' + i.number)); issue.state = options.body.state; return {...issue};}
    throw Error('unexpected test notification operation');
  }};
  const context = {failed: true, runId: 123, selfTest: true};
  const testIssue = await notifyOperations(api, 'owner/hub', context);
  await notifyOperations(api, 'owner/hub', {...context, failed: false});
  assert.equal(real.state, 'open'); assert.notEqual(testIssue, real.number);
  assert.equal(issues.find(i => i.number === testIssue).state, 'closed');
});
test('all production alert writers share one non-cancelling GitHub job lock', async () => {
  const locks = [];
  for (const name of ['catalog.yml', 'backup-health.yml']) {
    const workflow = YAML.parse(await fs.readFile(new URL('../.github/workflows/' + name, import.meta.url), 'utf8'));
    locks.push(workflow.jobs.notify.concurrency);
  }
  assert.deepEqual(locks, [{group: 'loghub-operations-alert', 'cancel-in-progress': false}, {group: 'loghub-operations-alert', 'cancel-in-progress': false}]);
});
