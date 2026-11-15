import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyExport} from '../../src/recovery.js';
import {readJSON} from '../../src/records.js';
import {validateSiteCatalog} from './catalog.js';
import {fixtureInput} from './fixtures.js';
import {copyRealPreview} from './real-preview.js';
import {detailImage} from './artwork.js';
const root = fileURLToPath(new URL('../../',import.meta.url));
process.chdir(root);
const fixture = process.argv.includes('--fixture');
const realPreview = process.argv.includes('--real-preview');
if (realPreview && (fixture || process.argv.includes('--snapshot'))) throw Error('real preview cannot be combined with fixture or production input');
const empty = process.argv.includes('--empty');
const unfeatured = process.argv.includes('--unfeatured');
if ((empty || unfeatured) && !fixture) throw Error('empty preview is test-only');
const snapshot = process.argv[process.argv.indexOf('--snapshot')+1];
const base = process.env.SITE_BASE || '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw Error('unsafe site base path');
if (!fixture && !realPreview && (!process.argv.includes('--snapshot') || !snapshot)) throw Error('production site requires an explicitly selected signed recovery export');
await fs.rm(path.join(root,'.site/input'),{recursive:true,force:true});
await fs.mkdir(path.join(root,'.site/input/public'),{recursive:true});
let catalog, provenance;
if (fixture) ({catalog,provenance} = await fixtureInput(path.join(root,'.site/input'), empty, unfeatured));
else if (realPreview) {
  const source=process.argv[process.argv.indexOf('--real-preview')+1];
  if (!source || source.startsWith('--')) throw Error('real preview requires an isolated input directory');
  ({catalog,provenance}=await copyRealPreview(path.resolve(source),path.join(root,'.site/input')));
}
else {
  const config = await readJSON(path.join(root,'policy/recovery.json'));
  const recovered = await verifyExport(config,path.resolve(snapshot));
  catalog = JSON.parse(recovered.files.get('catalog.json'));
  const policy = await readJSON(path.join(root,'policy/publishing.json'));
  const excluded = new Set(policy.projects.filter(p=>['suspended','delisted'].includes(p.decision)).map(p=>p.repository_id));
  catalog.projects = catalog.projects.filter(p=>!excluded.has(p.repository_id));
  const ids = new Set(catalog.projects.map(p=>p.id));
  for (const key of Object.keys(catalog.sort)) catalog.sort[key] = catalog.sort[key].filter(id=>ids.has(id));
  for (const p of catalog.projects) for (const image of [p.cover,...p.screenshots]) {
    const bytes = recovered.files.get(image); if (!bytes) throw Error('missing verified site artwork');
    const target = path.join(root,'.site/input/public',image); await fs.mkdir(path.dirname(target),{recursive:true}); await fs.writeFile(target,bytes);
  }
  provenance = {purpose:'production',point:recovered.point,snapshot_id:recovered.envelope.snapshot_id,source_commit:recovered.envelope.provenance.source_commit};
}
await validateSiteCatalog(catalog);
const artwork={};
for(const project of catalog.projects){
  const image=await detailImage(await fs.readFile(path.join(root,'.site/input/public',project.cover)));
  const src=`assets/${project.id}/detail.webp`;
  await fs.writeFile(path.join(root,'.site/input/public',src),image.data);
  artwork[project.id]={src,width:image.width,height:image.height};
}
await fs.writeFile(path.join(root,'.site/input/artwork.json'),JSON.stringify(artwork));
await fs.writeFile(path.join(root,'.site/input/catalog.json'),JSON.stringify(catalog));
await fs.writeFile(path.join(root,'.site/input/provenance.json'),JSON.stringify(provenance));
await fs.writeFile(path.join(root,'.site/input/public/catalog.json'),JSON.stringify(catalog));
await fs.writeFile(path.join(root,'.site/input/public/site-provenance.json'),JSON.stringify(provenance));
const result = spawnSync(process.execPath,[path.join(root,'node_modules/astro/bin/astro.mjs'),'build','--root',path.join(root,'website')],{stdio:'inherit',env:{...process.env,SITE_BASE:base,SITE_INPUT:path.join(root,'.site/input')},windowsHide:true});
if (result.status !== 0) process.exit(result.status || 1);
const destination = path.join(root,realPreview?'.site/real-preview':fixture ? (empty ? '.site/empty-preview' : unfeatured ? '.site/unfeatured-preview' : '.site/preview') : '.site/production');
await fs.rm(destination,{recursive:true,force:true});await fs.rename(path.join(root,'.site/output'),destination);
console.log(`Static site built: ${destination}; purpose=${provenance.purpose}`);
