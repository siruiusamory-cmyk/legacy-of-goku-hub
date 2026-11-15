import fs from 'node:fs/promises';
export function assertDeployable(provenance) {
  if (provenance.purpose !== 'production' || !/^[0-9]+-[a-f0-9]{64}$/.test(provenance.point || '') || !/^[a-f0-9]{64}$/.test(provenance.snapshot_id || '') || !/^[a-f0-9]{40}$/.test(provenance.source_commit || '')) throw Error('Only a verified production snapshot can be deployed; fixtures are prohibited');
}
if (process.argv[1]?.endsWith('check-deployment.js')) assertDeployable(JSON.parse(await fs.readFile('.site/production/site-provenance.json','utf8')));
