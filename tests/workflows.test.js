import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import YAML from 'yaml';

const directory = new URL('../.github/workflows/', import.meta.url);
test('workflow YAML parses; actions are immutable; untrusted PR jobs have no write permission', async () => {
  for (const name of await fs.readdir(directory)) {
    const source = await fs.readFile(new URL(name, directory), 'utf8');
    const workflow = YAML.parse(source, {uniqueKeys: true});
    assert.ok(workflow.on && workflow.jobs, name);
    assert.ok(!workflow.on.pull_request_target && !workflow.on.workflow_run, 'no privileged untrusted-code trigger');
    assert.ok(!source.includes('${{ github.event.issue.body }}'), 'issue body must never be shell interpolation');
    for (const job of Object.values(workflow.jobs)) {
      assert.ok(job['timeout-minutes'] <= 15);
      for (const step of job.steps) {
        if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/, name);
        if (step.uses?.startsWith('actions/checkout@')) assert.equal(step.with['persist-credentials'], false);
      }
      if (workflow.on.pull_request !== undefined) {
        const permissions = job.permissions || workflow.permissions;
        assert.deepEqual(permissions, {contents: 'read'});
      }
    }
  }
});
test('candidate artifact includes its hidden staging directory while excluding HTTP cache', async () => {
  const workflow = YAML.parse(await fs.readFile(new URL('catalog.yml', directory), 'utf8'));
  const upload = workflow.jobs.synchronize.steps.find(s => s.with?.name === 'candidate');
  assert.equal(upload.with['include-hidden-files'], true);
  assert.equal(upload.with.path.trim(), '.generated/\n!.generated/snapshot/github-cache.json');
});
