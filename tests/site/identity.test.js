import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

test('decorative LoG II scenery matches its credited source and remains a bounded static image',async()=>{
  const manifest=JSON.parse(await fs.readFile('website/src/assets/sources.json','utf8'));
  assert.equal(manifest.assets.length,1);
  const asset=manifest.assets[0];assert.equal(asset.game,'Dragon Ball Z: The Legacy of Goku II');assert.equal(asset.contributor,'Son Gohan');
  const bytes=await fs.readFile('website/src/assets/'+asset.file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.equal(bytes.length,asset.bytes);assert.ok(bytes.length<30000);
  const {info}=await sharp(bytes,{limitInputPixels:65536,failOn:'warning'}).raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,256);assert.equal(info.height,256);
});
