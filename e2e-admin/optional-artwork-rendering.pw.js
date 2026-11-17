import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('artwork-free Featured, cards and detail use the built-in placeholder while screenshots remain independent',async({page,context})=>{
  test.setTimeout(120000);
  const root=process.cwd();
  const build=spawnSync(process.execPath,['tools/site/build.js','--fixture','--without-artwork'],{encoding:'utf8',windowsHide:true,env:{...process.env,SITE_BASE:'/'}});
  expect(build.status,build.stdout+build.stderr).toBe(0);
  const output=path.join(root,'.site/artwork-free-preview');
  const catalog=JSON.parse(await fs.readFile(path.join(output,'catalog.json')));
  expect(catalog.projects[0].cover).toBeNull();
  expect(catalog.projects[1].screenshots).toEqual(['assets/fixture-1/screenshot-1.webp']);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const requests=[];page.on('request',request=>requests.push(request.url()));
  await context.route('https://site.example/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    const file=path.join(output,pathname.endsWith('/')?pathname+'index.html':pathname);
    const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
    await route.fulfill({body:await fs.readFile(file),contentType:type});
  });
  for(const width of [1448,390]){
    await page.setViewportSize({width,height:1000});await page.goto('https://site.example/');
    await expect(page.locator('.spotlight-art .artwork-unavailable')).toBeVisible();
    await expect(page.locator('.spotlight-art img')).toHaveCount(0);
    await expect(page.locator('[data-id="fixture-0"] .artwork-unavailable')).toBeVisible();
    await expect(page.locator('[data-id="fixture-1"] .artwork-unavailable')).toBeVisible();
    await expect(page.locator('[data-id="fixture-2"] img')).toHaveAttribute('src','/assets/fixture-2/cover.webp');
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    await page.screenshot({path:path.join(root,'.review/017-phase-1',`placeholder-home-${width}.png`),fullPage:true});
    await page.goto('https://site.example/projects/fixture-0/');
    await expect(page.locator('.detail-art .artwork-unavailable')).toBeVisible();
    await expect(page.locator('.detail-art img')).toHaveCount(0);
    await expect(page.locator('.screenshot-gallery')).toHaveCount(0);
    if(width===1448)expect(await page.locator('.detail-art').evaluate(node=>node.getBoundingClientRect().height)).toBe(276);
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    await page.screenshot({path:path.join(root,'.review/017-phase-1',`placeholder-detail-${width}.png`),fullPage:true});
    await page.goto('https://site.example/projects/fixture-1/');
    await expect(page.locator('.detail-art .artwork-unavailable')).toBeVisible();
    await expect(page.locator('.screenshot-gallery img')).toHaveAttribute('src','/assets/fixture-1/screenshot-1.webp');
    await expect.poll(()=>page.locator('.screenshot-gallery img').evaluate(image=>image.complete&&image.naturalWidth===480&&image.naturalHeight===320)).toBe(true);
  }
  expect(requests.some(url=>/\/null(?:$|[/?])|\/undefined(?:$|[/?])/.test(url))).toBe(false);
  expect(errors).toEqual([]);
});
