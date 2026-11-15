import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
const phase=process.env.IDENTITY_PHASE==='before'?'before':'after';
test('visual identity matching real-page evidence',async({page},info)=>{
  await page.context().route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:4325/')?r.continue():r.abort());
  const directory=`docs/frontend/visual-identity/evidence/${phase}`;await fs.mkdir(directory,{recursive:true});
  const metrics=[];
  for(const [name,route] of [['homepage','/'],['detail','/projects/gh-1429374563/']])for(const [kind,width,height] of [['desktop',1448,1086],['mobile',390,844],['mobile-320',320,844]]){
    await page.setViewportSize({width,height});await page.goto(route,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
    await page.locator('img').evaluateAll(async es=>{es.forEach(e=>e.loading='eager');await Promise.all(es.map(e=>e.decode()));});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const file=`${directory}/${name}-${kind}.png`;await page.screenshot({path:file,fullPage:kind!=='desktop'});await info.attach(`${name}-${kind}`,{path:file,contentType:'image/png'});
    const performance=await page.evaluate(()=>{const resources=globalThis.performance.getEntriesByType('resource');return {transferred:globalThis.performance.getEntriesByType('navigation')[0].transferSize+resources.reduce((n,r)=>n+r.transferSize,0),scriptBytes:resources.filter(r=>r.initiatorType==='script').reduce((n,r)=>n+r.transferSize,0),external:resources.filter(r=>new URL(r.name).origin!==location.origin).map(r=>r.name)};});
    expect(performance.external).toEqual([]);expect(performance.scriptBytes).toBeLessThan(30000);expect(performance.transferred).toBeLessThan(600000);metrics.push({name,kind,width,height,...performance});
  }
  await fs.writeFile(`${directory}/performance.json`,JSON.stringify(metrics,null,2));
});

test('missing artwork has a neutral fallback and preserves navigation and metadata',async({page})=>{
  await page.route('**/assets/gh-1429374563/cover.webp',r=>r.fulfill({status:404,body:'unavailable'}));
  for(const route of ['/','/projects/gh-1429374563/']){
    await page.goto(route);
    const fallback=page.locator(route==='/'?'.project-card[data-id="gh-1429374563"] .artwork-unavailable':'.detail-art .artwork-unavailable');
    await expect(fallback).toBeVisible();await expect(fallback).toContainText('Project artwork unavailable');
    if(route!=='/'){
      await expect(page.getByRole('link',{name:'View Repository',exact:true})).toHaveAttribute('href','https://github.com/siruiusamory-cmyk/legacyofgoku2-disasm');
      await expect(page.locator('.description-box')).toHaveCount(1);
      expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    }
  }
});

test('artwork fits its card and menu focus remains visible at narrow widths',async({page})=>{
  for(const width of [320,390,760,1448]){
    await page.setViewportSize({width,height:844});await page.goto('/');await page.evaluate(()=>document.fonts.ready);
    for(const art of await page.locator('.card-art').all())expect(await art.evaluate(e=>e.getBoundingClientRect().width<=e.closest('.project-card').getBoundingClientRect().width)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('searchbox').focus();expect(await page.getByRole('searchbox').evaluate(e=>getComputedStyle(e).outlineStyle)).not.toBe('none');
    const scenery=await page.locator('.game-terrain').evaluate(e=>({size:getComputedStyle(e).backgroundSize,rendering:getComputedStyle(e).imageRendering}));
    expect(scenery.size).toBe(width<=580?'256px 256px':'512px 512px');expect(scenery.rendering).toBe('pixelated');
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  expect(await page.locator('.world-scenery').getAttribute('aria-hidden')).toBe('true');
  expect(await page.locator('.world-scenery').evaluate(e=>getComputedStyle(e).pointerEvents)).toBe('none');
});
