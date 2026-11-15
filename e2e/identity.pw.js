import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const phase=process.env.IDENTITY_PHASE==='before'?'before':'after';
test('visual identity matching released-ROM-hack evidence',async({page},info)=>{
  const directory=`docs/frontend/visual-identity/evidence/${phase}`;await fs.mkdir(directory,{recursive:true});
  for(const [kind,width,height] of [['desktop',1448,1086],['mobile',390,844]]){
    await page.setViewportSize({width,height});await page.goto('/projects/fixture-0/',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
    await page.locator('img').evaluateAll(async es=>{es.forEach(e=>e.loading='eager');await Promise.all(es.map(e=>e.decode()));});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const file=`${directory}/released-${kind}.png`;await page.screenshot({path:file,fullPage:kind==='mobile'});await info.attach(kind,{path:file,contentType:'image/png'});
  }
});
