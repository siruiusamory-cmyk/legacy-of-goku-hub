import sharp from 'sharp';
import {createHash} from 'node:crypto';

export async function detailImage(bytes,direction) {
  const image=sharp(bytes,{limitInputPixels:640*360,failOn:'warning'});
  const metadata=await image.metadata();
  if(metadata.width!==640||metadata.height!==360||(metadata.pages||1)!==1)throw Error('detail artwork requires a normalized static cover');
  let {data,info}=await image.trim({background:'#161616',threshold:6}).webp({lossless:true}).toBuffer({resolveWithObject:true});
  if(direction?.source_sha256===createHash('sha256').update(bytes).digest('hex'))({data,info}=await sharp(data).extract(direction.crop).webp({lossless:true}).toBuffer({resolveWithObject:true}));
  // The cover it is cut from is already lossy, so a lossless copy only adds bytes.
  return {data:await sharp(data).webp({quality:82,effort:6}).toBuffer(),width:info.width,height:info.height};
}
