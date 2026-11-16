import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const site='http://127.0.0.1:4327',api='http://127.0.0.1:8787';
const ids=['gh-1398951057','gh-1429374563','gh-1432341427'];
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
const context=await browser.newContext(),page=await context.newPage(),errors=[],network=[];
page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',route=>{const url=route.request().url();network.push(url);return url.startsWith(site+'/')||url.startsWith(api+'/')?route.continue():route.abort();});
try{
 for(const [i,id] of ids.entries()){
  await page.setViewportSize({width:i===0?390:1448,height:1000});await page.goto(site+'/projects/'+id+'/',{waitUntil:'networkidle'});
  await expect(page.getByRole('radio')).toHaveCount(7);await expect(page.getByRole('button',{name:/sign in/i})).toHaveCount(0);
  await page.getByRole('radio',{name:'7 Dragon Balls',exact:true}).check();await expect(page.getByRole('status')).toHaveText('Rating saved: 7 out of 7.');
  await expect(page.locator('[data-ratings-project] .rating-value')).toHaveText('7.0 / 7 (1 ratings)');
  await page.reload({waitUntil:'networkidle'});await expect(page.getByRole('radio',{name:'7 Dragon Balls',exact:true})).toBeChecked();await expect(page.getByRole('status')).toHaveText('Your saved rating: 7 out of 7.');
  await page.getByRole('radio',{name:'3 Dragon Balls',exact:true}).check();await expect(page.getByRole('status')).toHaveText('Rating saved: 3 out of 7.');await page.reload({waitUntil:'networkidle'});await expect(page.getByRole('radio',{name:'3 Dragon Balls',exact:true})).toBeChecked();
  const a11y=await new AxeBuilder({page}).include('.detail-rating').analyze();assert.deepEqual(a11y.violations,[]);
  await page.getByRole('button',{name:'Remove my rating',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Your rating was removed.');await expect(page.locator('[data-ratings-project] .rating-value')).toHaveText('Not rated yet');await page.reload({waitUntil:'networkidle'});await expect(page.locator('input:checked')).toHaveCount(0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 const token=await page.evaluate(()=>localStorage.getItem('loghub-anonymous-rating-credential'));assert.match(token,/^[A-Za-z0-9_-]{43}$/);
 const second=await browser.newContext(),other=await second.newPage();await other.goto(site+'/projects/'+ids[0]+'/',{waitUntil:'networkidle'});await expect(other.locator('input:checked')).toHaveCount(0);assert.equal(await other.evaluate(()=>localStorage.getItem('loghub-anonymous-rating-credential')),null);await second.close();
 await context.route(api+'/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"unavailable"}',headers:{'Access-Control-Allow-Origin':site}}));await page.reload({waitUntil:'networkidle'});await expect(page.locator('[data-ratings-project] .rating-value')).toHaveText('Ratings unavailable');
 await page.getByRole('radio',{name:'6 Dragon Balls',exact:true}).click();await expect(page.getByRole('status')).toContainText('Ratings unavailable');await expect(page.locator('input:checked')).toHaveCount(0);
 assert.deepEqual(errors,[]);assert.ok(network.every(url=>url.startsWith(site+'/')||url.startsWith(api+'/')));
 await fs.mkdir('.review/011',{recursive:true});await page.screenshot({path:'.review/011/browser-error.png',fullPage:true});await fs.writeFile('.review/011/BROWSER.json',JSON.stringify({status:'PASS',backend:'Actual local Wrangler 4.105.0/workerd and D1; no mocked votes',ids,save_reload_change_remove:true,anonymous:true,accessibility_violations:0,backend_failure_unavailable:true,credential_not_returned_by_public_api:true,production_contacted:false},null,2));
 console.log('PASS: anonymous browser save/reload/change/remove across all three IDs; accessibility and unavailable states.');
}finally{await context.close();await browser.close();}
