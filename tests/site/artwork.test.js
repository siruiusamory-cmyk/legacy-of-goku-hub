import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {detailImage} from '../../tools/site/artwork.js';

test('detail artwork removes normalization padding while preserving banner geometry and full-size covers',async()=>{
  const banner=await sharp({create:{width:640,height:160,channels:3,background:'#2060c0'}}).extend({top:100,bottom:100,left:0,right:0,background:'#161616'}).png().toBuffer();
  const cropped=await detailImage(banner);assert.equal(cropped.width,640);assert.equal(cropped.height,160);
  const direction={source_sha256:createHash('sha256').update(banner).digest('hex'),crop:{left:5,top:0,width:314,height:159}};
  const focused=await detailImage(banner,direction);assert.equal(focused.width,314);assert.equal(focused.height,159);
  const stale=await detailImage(banner,{...direction,source_sha256:'0'.repeat(64)});assert.equal(stale.width,640);assert.equal(stale.height,160);
  const cover=await sharp({create:{width:640,height:360,channels:3,background:'#2060c0'}}).png().toBuffer();
  const unchanged=await detailImage(cover);assert.equal(unchanged.width,640);assert.equal(unchanged.height,360);
  const pixels=await sharp(cropped.data).raw().toBuffer();assert.equal(pixels.length,640*160*3);
  assert.ok(pixels.every((value,i)=>Math.abs(value-[0x20,0x60,0xc0][i%3])<=6),'lossy output stays within 6 levels of the source colour');
  assert.ok(cropped.data.subarray(12,16).equals(Buffer.from('VP8 ')),'detail artwork is lossy WebP');
  await assert.rejects(detailImage(await sharp({create:{width:320,height:180,channels:3,background:'white'}}).png().toBuffer()),/normalized/);
});
