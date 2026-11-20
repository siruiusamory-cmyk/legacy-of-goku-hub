import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyExport} from '../../src/recovery.js';
import {readJSON} from '../../src/records.js';
import {validateSiteCatalog} from './catalog.js';
import {fixtureInput} from './fixtures.js';
import {detailImage} from './artwork.js';
import sharp from 'sharp';
import {starLayouts,starPolygon} from '../../website/src/lib/dragon-balls.js';
import {readSnapshot} from '../../src/publishing.js';
import {entryApproved, verifyEntryArtwork, policyCheck, ruleFor} from '../../src/moderation.js';
const root = fileURLToPath(new URL('../../',import.meta.url));
process.chdir(root);
const fixture = process.argv.includes('--fixture');
const empty = process.argv.includes('--empty');
const unfeatured = process.argv.includes('--unfeatured');
const external = process.argv.includes('--external');
const withoutArtwork = process.argv.includes('--without-artwork');
if ((empty || unfeatured || external || withoutArtwork) && !fixture) throw Error('empty preview is test-only');
const snapshot = process.argv[process.argv.indexOf('--snapshot')+1];
const base = process.env.SITE_BASE || '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw Error('unsafe site base path');
if (!fixture && (!process.argv.includes('--snapshot') || !snapshot)) throw Error('production site requires an explicitly selected signed recovery export');
await fs.rm(path.join(root,'.site/input'),{recursive:true,force:true});
await fs.mkdir(path.join(root,'.site/input/public'),{recursive:true});
let catalog, provenance;
if (fixture) ({catalog,provenance} = await fixtureInput(path.join(root,'.site/input'), empty, unfeatured, external, withoutArtwork));
else {
  const config = await readJSON(path.join(root,'policy/recovery.json'));
  const recovered = await verifyExport(config,path.resolve(snapshot));
  catalog = JSON.parse(recovered.files.get('catalog.json'));
  const policy = policyCheck(await readJSON(path.join(root,'policy/publishing.json')));
  const entries = await readSnapshot(path.resolve(snapshot));
  const eligible = new Set();
  for (const entry of entries) {
    const rule = ruleFor(policy,entry);
    if (entryApproved(entry,policy) && !['suspended','delisted'].includes(rule.decision) && !policy.revoked_owner_ids.includes(entry.owner_id)) {
      await verifyEntryArtwork(entry); eligible.add(entry.id);
    }
  }
  catalog.projects = catalog.projects.filter(p=>eligible.has(p.id));
  for (const project of catalog.projects) {
    const entry = entries.find(entry => entry.id === project.id);
    const rule = ruleFor(policy, entry);
    if (project.featured !== Boolean(rule.featured && rule.decision === 'approved')) throw Error('signed catalog Featured placement differs from current policy');
  }
  const ids = new Set(catalog.projects.map(p=>p.id));
  for (const key of Object.keys(catalog.sort)) catalog.sort[key] = catalog.sort[key].filter(id=>ids.has(id));
  for (const p of catalog.projects) for (const image of [p.cover,...p.screenshots].filter(Boolean)) {
    const bytes = recovered.files.get(image); if (!bytes) throw Error('missing verified site artwork');
    const target = path.join(root,'.site/input/public',image); await fs.mkdir(path.dirname(target),{recursive:true}); await fs.writeFile(target,bytes);
  }
  provenance = {purpose:'production',point:recovered.point,snapshot_id:recovered.envelope.snapshot_id,source_commit:recovered.envelope.provenance.source_commit};
}
provenance.base = base;
await validateSiteCatalog(catalog);
const artwork={};
const artDirection=await readJSON('website/src/assets/art-direction.json');
for(const project of catalog.projects){
  if(!project.cover){artwork[project.id]={src:null,width:640,height:360};continue;}
  const image=await detailImage(await fs.readFile(path.join(root,'.site/input/public',project.cover)),Object.hasOwn(artDirection,project.id)?artDirection[project.id]:undefined);
  const src=`assets/${project.id}/detail.webp`;
  await fs.writeFile(path.join(root,'.site/input/public',src),image.data);
  artwork[project.id]={src,width:image.width,height:image.height};
}
const ball = (size,pad=0,fill='',star=1) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-pad} ${-pad} ${100+2*pad} ${100+2*pad}">${fill&&`<rect x="${-pad}" y="${-pad}" width="100%" height="100%" fill="${fill}"/>`}<circle cx="50" cy="50" r="46" fill="#f47a1a"/>${starLayouts[4].map(([x,y])=>`<polygon points="${starPolygon(4)}" transform="translate(${x} ${y}) scale(${star})" fill="#c8102e"/>`).join('')}</svg>`);
// Larger stars on the small icon, or they vanish at 16 px.
await sharp(ball(48,0,'',1.5)).png().toFile(path.join(root,'.site/input/public/favicon.png'));
await sharp(ball(180,18,'#0c1533')).png().toFile(path.join(root,'.site/input/public/apple-touch-icon.png'));
// shortcut: site card has no lettering, replace when the artist banner lettering lands
await sharp({create:{width:1200,height:630,channels:3,background:'#0c1533'}}).composite([{input:await sharp('website/src/assets/artist/energy-banner-960x160.png').resize(1200,null,{kernel:'nearest'}).toBuffer()}]).png().toFile(path.join(root,'.site/input/public/og-card.png'));
await fs.writeFile(path.join(root,'.site/input/artwork.json'),JSON.stringify(artwork));
await fs.writeFile(path.join(root,'.site/input/catalog.json'),JSON.stringify(catalog));
await fs.writeFile(path.join(root,'.site/input/provenance.json'),JSON.stringify(provenance));
await fs.writeFile(path.join(root,'.site/input/public/catalog.json'),JSON.stringify(catalog));
await fs.writeFile(path.join(root,'.site/input/public/site-provenance.json'),JSON.stringify(provenance));
const result = spawnSync(process.execPath,[path.join(root,'node_modules/astro/bin/astro.mjs'),'build','--root',path.join(root,'website')],{stdio:'inherit',env:{...process.env,SITE_BASE:base,SITE_INPUT:path.join(root,'.site/input'),...(external?{PUBLIC_INTAKE_ENABLED:'true',PUBLIC_INTAKE_API:'http://127.0.0.1:4399',PUBLIC_TURNSTILE_SITE_KEY:'fixture-site-key'}:{})},windowsHide:true});
if (result.status !== 0) process.exit(result.status || 1);
const destination = path.join(root,fixture ? (empty ? '.site/empty-preview' : withoutArtwork ? '.site/artwork-free-preview' : external ? '.site/external-preview' : unfeatured ? '.site/unfeatured-preview' : '.site/preview') : '.site/production');
await fs.rm(destination,{recursive:true,force:true});await fs.rename(path.join(root,'.site/output'),destination);
console.log(`Static site built: ${destination}; purpose=${provenance.purpose}`);
