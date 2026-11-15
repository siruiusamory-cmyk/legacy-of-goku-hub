import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notifyOperations} from '../tools/notify-operations.js';

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
