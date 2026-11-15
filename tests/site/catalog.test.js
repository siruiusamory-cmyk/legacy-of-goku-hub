import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fixtureInput} from '../../tools/site/fixtures.js';
import {validateSiteCatalog} from '../../tools/site/catalog.js';
import {assertDeployable} from '../../tools/site/check-deployment.js';
import YAML from 'yaml';

test('site validates both full fixture and empty catalog with stable identities', async t => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'loghub-site-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const {catalog,provenance}=await fixtureInput(dir);
  assert.equal((await validateSiteCatalog(catalog)).projects.length,7);
  assert.equal((await validateSiteCatalog((await fixtureInput(dir,true)).catalog)).projects.length,0);
  assert.throws(()=>assertDeployable(provenance),/fixtures/);
  const duplicate=structuredClone(catalog);duplicate.projects.push(duplicate.projects[0]);
  await assert.rejects(validateSiteCatalog(duplicate),/duplicate/);
  for (const mutation of [p=>p.cover='../../key.pem',p=>p.screenshots=['assets/other/screenshot-1.webp'],p=>p.repository='javascript:alert(1)',p=>p.release.download_url='https://example.org/game.zip',p=>p.links=[{label:'unsafe',url:'javascript:alert(1)'}],p=>p.links=[{label:'unsafe',url:'https://github.com@evil.example/'}]]) {
    const altered=structuredClone(catalog);mutation(altered.projects[0]);await assert.rejects(validateSiteCatalog(altered));
  }
  const sorts=structuredClone(catalog);sorts.sort.name=['absent'];await assert.rejects(validateSiteCatalog(sorts),/sort/);
});
test('frontend deployment is default-branch gated, production-only and separated from write credentials', async () => {
  const workflow=YAML.parse(await fs.readFile('.github/workflows/catalog.yml','utf8'));
  assert.equal(workflow.jobs.website.needs,'publish');
  assert.deepEqual(workflow.jobs.website.permissions,{contents:'read',actions:'read'});
  assert.match(workflow.jobs['deploy-website'].if,/SITE_DEPLOYMENT_ENABLED/);
  assert.match(workflow.jobs['deploy-website'].if,/default_branch/);
  assert.equal(workflow.jobs['deploy-website'].environment.name,'github-pages');
  assert.deepEqual(workflow.jobs['deploy-website'].permissions,{contents:'read',pages:'write','id-token':'write'});
  assert.ok(workflow.jobs['deploy-website'].steps.some(s=>s.name==='Reject a stale source revision before deployment'));
  assert.ok(workflow.jobs.website.steps.some(s=>s.run==='node tools/site/check-deployment.js'));
  assert.ok(workflow.jobs.website.steps.some(s=>s.run==='npm run site:build -- --snapshot .previous'));
  assert.ok(!JSON.stringify(workflow.jobs['deploy-website']).includes('BACKUP_'));
});
