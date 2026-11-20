import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import sharp from 'sharp';
test.beforeEach(async ({context}) => {
  await context.route('**/*',route => /^http:\/\/127\.0\.0\.1:(4321|4322|4323|4324)\//.test(route.request().url()) ? route.continue() : route.abort());
});
test('multi-game listings pass a game filter, filters offer only what exists, and page links are named for the project', async ({page}) => {
  await page.goto('http://127.0.0.1:4324/?category=tool');
  await page.getByLabel('Base game',{exact:true}).selectOption('legacy-of-goku');
  expect(await page.locator('.project-card:visible').evaluateAll(cards => cards.map(card => card.dataset.id))).toEqual(['ext-sitehack0002']);
  await page.getByLabel('Base game',{exact:true}).selectOption('multiple');
  expect(await page.locator('.project-card:visible').evaluateAll(cards => cards.map(card => card.dataset.id))).toEqual(['ext-sitehack0002']);
  await expect(page.locator('#status option')).toHaveText(['All statuses','Released','In Development']);
  await page.goto('http://127.0.0.1:4324/projects/ext-sitehack0002/');
  await expect(page.locator('.hero-actions a')).toHaveText(['Download Page']);
  await page.goto('http://127.0.0.1:4322/');
  await expect(page.locator('#status option')).toHaveText(['All statuses']);
  await expect(page.locator('#sort option')).toHaveText(['Sort by: Name','Sort by: Listing updated']);
});
test('sitemap, feed and robots file list the published pages', async ({page}) => {
  const sitemap = await (await page.request.get('/sitemap.xml')).text();
  for (const address of ['', 'how-to-patch/', 'submit/', 'ratings-privacy/', 'projects/fixture-0/', 'projects/fixture-6/']) expect(sitemap).toContain(`<loc>https://legacyofgokuhub.com/${address}</loc>`);
  expect(sitemap.match(/<url>/g)).toHaveLength(11);
  const feed = await (await page.request.get('/rss.xml')).text();
  expect(feed.match(/<item>/g)).toHaveLength(7);
  expect(feed).toContain('<guid>https://legacyofgokuhub.com/projects/fixture-6/</guid>');
  expect(feed).not.toMatch(/<img|<script/);
  expect(await (await page.request.get('/robots.txt')).text()).toContain('Sitemap: https://legacyofgokuhub.com/sitemap.xml');
  expect((await (await page.request.get('http://127.0.0.1:4322/rss.xml')).text()).match(/<item>/g)).toBeNull();
  await page.goto('/');
  await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute('href','/rss.xml');
});
const shown = page => page.locator('.project-card:visible').evaluateAll(cards => cards.map(card => card.dataset.id));
test('search, filters, clear and deterministic sorting work', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.project-card')).toHaveCount(7);
  await expect(page.locator('.project-card:visible')).toHaveCount(4);
  await page.getByRole('searchbox').fill('CapsuleWorks');
  expect(await shown(page)).toEqual(['fixture-4']);
  await page.getByLabel('Development status',{exact:true}).selectOption('in-development');
  await expect(page.getByText('No matching projects',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Clear filters'}).click();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.locator('.project-card:visible')).toHaveCount(4);
  await page.locator('.category-tabs a[data-category="rom-hack"]').click();
  await page.getByLabel('Base game',{exact:true}).selectOption('buus-fury');
  expect(await shown(page)).toEqual(['fixture-5']);
  await page.getByLabel('Base game',{exact:true}).selectOption('');
  await page.getByLabel('Sort projects',{exact:true}).selectOption('updated');
  expect(await shown(page)).toEqual(['fixture-6','fixture-5','fixture-1','fixture-0']);
  await page.getByLabel('Sort projects',{exact:true}).selectOption('release');
  expect(await shown(page)).toEqual(['fixture-6','fixture-5','fixture-0','fixture-1']);
  await page.getByLabel('Sort projects',{exact:true}).selectOption('name');
  expect(await shown(page)).toEqual(['fixture-5','fixture-6','fixture-1','fixture-0']);
});
test('search looks in every category and a tab click clears it', async ({page}) => {
  await page.goto('/');
  await page.getByRole('searchbox').fill('CapsuleWorks');
  expect(await shown(page)).toEqual(['fixture-4']);
  await expect(page.locator('.category-tabs [aria-current]')).toHaveCount(0);
  await expect(page.locator('#result-count')).toHaveText(/in all categories$/);
  await page.locator('.category-tabs a[data-category="translation"]').click();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  expect(await shown(page)).toEqual(['fixture-2']);
  await expect(page.locator('.category-tabs [aria-current]')).toHaveAttribute('data-category','translation');
});
test('phone cards show their status without horizontal overflow', async ({page}) => {
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  for (const card of await page.locator('.project-card:visible').all()) await expect(card.locator('.badge.released, .badge.in-development, .badge.on-hold, .badge.discontinued')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);
});
test('link previews, icons, patch guide, inclusion policy and unofficial notice', async ({page}) => {
  await page.goto('/');
  for (const name of ['og:title','og:description']) await expect(page.locator(`head meta[property="${name}"]`)).toHaveAttribute('content',/./);
  await expect(page.locator('head meta[name="twitter:card"]')).toHaveAttribute('content','summary_large_image');
  await expect(page.locator('head meta[property="og:image"]')).toHaveAttribute('content',/^https:\/\//);
  await expect(page.locator('.site-footer')).toContainText('Unofficial fan site, not affiliated with or endorsed by the owners of Dragon Ball Z or The Legacy of Goku games.');
  for (const [file,width,height] of [['favicon.png',48,48],['apple-touch-icon.png',180,180],['og-card.png',1200,630]]) {
    const response = await page.request.get('/' + file);expect(response.status()).toBe(200);
    expect(await sharp(await response.body()).metadata()).toMatchObject({format:'png',width,height});
  }
  await page.goto('/projects/fixture-0/');await expect(page.getByRole('link',{name:'How to apply a patch',exact:true})).toBeVisible();
  await page.goto('/projects/fixture-4/');await expect(page.getByRole('link',{name:'How to apply a patch',exact:true})).toHaveCount(0);
  await page.goto('/how-to-patch/');await expect(page.getByRole('heading',{level:1})).toHaveText('How to play a ROM hack or translation');
  await page.goto('/submit/');await expect(page.getByText('AI-assisted projects are welcome. Low-effort projects made mostly by AI are not listed.')).toBeVisible();
});
test('five category tabs replace the combined listing and match the catalogue', async ({page}) => {
  await page.goto('/');
  const tabs = page.locator('.category-tabs a');
  await expect(tabs).toHaveText(['ROM Hacks 4 projects','Translations 1 project','Fan Projects 1 project','Tools 1 project','Resources 0 projects']);
  await expect(page.locator('.category-tabs [aria-current]')).toHaveText(/^ROM Hacks/);
  await expect(page.locator('#directory').getByText(/^(all|all projects|all categories|everything)$/i)).toHaveCount(0);
  await expect(page.locator('#category')).toHaveCount(0);
  const catalogue = await (await page.request.get('/catalog.json')).json();
  await page.evaluate(() => {window.stayedOnPage = true;});
  for (const category of ['translation','fan-project','tool','resource','rom-hack']) {
    await page.locator(`.category-tabs a[data-category="${category}"]`).click();
    await expect(page).toHaveURL(new RegExp('\\?category=' + category + '#directory$'));
    const expected = catalogue.projects.filter(project => project.category === category).map(project => project.id).sort();
    expect((await shown(page)).sort()).toEqual(expected);
    await expect(page.locator('.category-tabs [aria-current]')).toHaveAttribute('data-category', category);
    await expect(page.locator(`.category-tabs a[data-category="${category}"] .tab-count`)).toHaveText(new RegExp('^' + expected.length + ' '));
  }
  expect(await page.evaluate(() => window.stayedOnPage)).toBe(true);
  await page.locator('.category-tabs a[data-category="resource"]').click();
  await expect(page.getByText('Nothing in this category yet',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Clear filters'})).toBeHidden();
});
test('category links are shareable and follow Back, Forward and the keyboard', async ({page}) => {
  await page.goto('/?category=tool#directory');
  await expect(page.locator('.category-tabs [aria-current]')).toHaveAttribute('data-category','tool');
  expect(await shown(page)).toEqual(['fixture-4']);
  await page.locator('.category-tabs a[data-category="translation"]').focus();
  await page.keyboard.press('Enter');
  expect(await shown(page)).toEqual(['fixture-2']);
  await page.keyboard.press('Tab');
  await expect(page.locator('.category-tabs a[data-category="fan-project"]')).toBeFocused();
  await page.goBack();
  await expect(page.locator('.category-tabs [aria-current]')).toHaveAttribute('data-category','tool');
  expect(await shown(page)).toEqual(['fixture-4']);
  await page.goForward();
  await expect(page.locator('.category-tabs [aria-current]')).toHaveAttribute('data-category','translation');
  await page.goto('/?category=everything');
  await expect(page.locator('.category-tabs [aria-current]')).toHaveAttribute('data-category','rom-hack');
  await expect(page.locator('.project-card:visible')).toHaveCount(4);
});
test('category tabs carry the main navigation styling and fit a phone', async ({page}) => {
  await page.goto('/');
  const style = selector => page.locator(selector).first().evaluate(element => {
    const computed = getComputedStyle(element);
    return Object.fromEntries(['fontFamily','fontSize','fontWeight','fontStyle','textTransform','letterSpacing','lineHeight','color','backgroundColor','borderTopColor','borderTopWidth','borderRightWidth','borderBottomWidth','paddingTop','paddingBottom','paddingLeft','paddingRight','clipPath','height'].map(key => [key, computed[key]]));
  });
  expect(await style('.category-tabs a:not([aria-current])')).toEqual(await style('.desktop-nav a:not(.active)'));
  expect(await style('.category-tabs [aria-current]')).toEqual(await style('.desktop-nav a.active'));
  await page.locator('.category-tabs a:not([aria-current])').first().hover();
  const hovered = await style('.category-tabs a:not([aria-current])');
  await page.locator('.desktop-nav a:not(.active)').first().hover();
  expect(hovered).toEqual(await style('.desktop-nav a:not(.active)'));
  for (const width of [390, 320]) {
    await page.setViewportSize({width, height: 844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.card-art img').first().evaluate(image => getComputedStyle(image).objectFit)).toBe('contain');
    for (const tab of await page.locator('.category-tabs a').all()) {
      const box = await tab.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(await tab.evaluate(element => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight)).toBe(true);
    }
  }
});
test('stable detail navigation, actual metadata and safe external actions', async ({page}) => {
  await page.goto('/');await page.getByRole('link',{name:'View Project',exact:true}).click();
  await expect(page).toHaveURL(/\/projects\/fixture-0\/$/);
  await expect(page.getByRole('heading',{level:1})).toHaveText('Saiyan Legacy Reborn');
  await expect(page.locator('.project-information')).toContainText('fixture-v1');
  await expect(page.locator('.screenshot-gallery img')).toHaveCount(3);
  await expect(page.getByRole('link',{name:'View Repository',exact:true})).toHaveAttribute('href','https://github.com/fixture-owner/fixture-0');
  await expect(page.getByRole('link',{name:'Download on GitHub',exact:true})).toHaveAttribute('href',/github\.com\/fixture-owner\/fixture-0\/releases\/download\/fixture-v1\/fixture.zip$/);
  await page.getByRole('link',{name:'All Projects',exact:true}).click();await expect(page).toHaveURL(/\/#directory$/);
});
test('seven-ball selection supports keyboard and pointer without persistence or voting', async ({page}) => {
  await page.goto('/projects/fixture-0/');
  await expect(page.locator('.rating-choice strong')).toHaveCount(0);
  for (let number=1;number<=7;number++) await expect(page.locator(`.rating-options [data-ball="${number}"] polygon`)).toHaveCount(number);
  const requests=[];page.on('request',r=>{if(r.method()!=='GET')requests.push(r.url());});
  const first=page.getByRole('radio',{name:'1 Dragon Ball',exact:true});await first.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio',{name:'2 Dragon Balls',exact:true})).toBeChecked();
  await page.getByRole('radio',{name:'7 Dragon Balls',exact:true}).check();
  await expect(page.locator('.rating-selector')).toHaveText('Preview only · not saved');
  expect(requests).toEqual([]);expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
  await page.reload();await expect(page.getByRole('radio',{checked:true})).toHaveCount(0);
});
test('in-development detail omits unavailable release metadata and safely renders untrusted text', async ({page}) => {
  await page.goto('/projects/fixture-1/');
  await expect(page.locator('.release-panel')).toHaveCount(0);await expect(page.getByRole('link',{name:'Download on GitHub',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Screenshots',exact:true})).toHaveCount(0);
  await expect(page.locator('.community-rating')).toContainText('Not rated yet');
  await page.goto('/projects/fixture-6/');await expect(page.locator('.description-box')).toContainText('<img src=x onerror="window.fixtureInjected=true">');
  expect(await page.evaluate(()=>window.fixtureInjected)).toBeUndefined();await expect(page.locator('img[src="x"]')).toHaveCount(0);
});
test('empty catalog is polished, honest, unrated and contains no synthetic projects', async ({page}) => {
  await page.goto('http://127.0.0.1:4322/');
  expect(await (await page.request.get('http://127.0.0.1:4322/site-provenance.json')).json()).toMatchObject({purpose:'fixture'});
  await expect(page.getByRole('heading',{name:'No approved projects yet'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Submit your project'})).toHaveAttribute('href','https://github.com/siruiusamory-cmyk/legacy-of-goku-hub/issues/new/choose');
  await expect(page.locator('.project-card')).toHaveCount(0);
  await expect(page.getByRole('heading',{level:1})).toContainText('Legacy of Goku Community Directory');
});
for (const width of [320,390,430,760,941,1024,1448]) test(`responsive home and detail have no overflow at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:1086});
  for (const route of ['/','/projects/fixture-0/','/projects/fixture-1/','/projects/fixture-6/']) {
    await page.goto(route);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.goto('http://127.0.0.1:4323/projects/fixture-6/');
  await expect(page.getByRole('heading',{level:1})).toHaveText('W'.repeat(100));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(width<=900){await page.goto('/');await page.getByLabel('Open navigation').click();await expect(page.getByRole('link',{name:'Submit a project',exact:true}).first()).toBeVisible();}
});
for (const [route,width] of [['/',1448],['/projects/fixture-0/',1448],['/',390],['/projects/fixture-0/',390],['http://127.0.0.1:4322/',390],['/how-to-patch/',1448],['/how-to-patch/',390]]) test(`WCAG automated checks ${route} ${width}`, async ({page}) => {
  await page.setViewportSize({width,height:1086});await page.goto(route);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
});
test('keyboard skip link and mobile touch rating have usable targets', async ({page, browser}) => {
  await page.goto('/');await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();
  await page.keyboard.press('Enter');await expect(page).toHaveURL(/#main$/);
  await page.setViewportSize({width:390,height:844});await page.goto('/projects/fixture-0/');
  for(const option of await page.locator('.rating-option').all()){const box=await option.boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);}
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:4321/')?route.continue():route.abort());
  const touchPage = await context.newPage(); await touchPage.goto('http://127.0.0.1:4321/projects/fixture-0/');
  await touchPage.getByRole('radio',{name:'3 Dragon Balls',exact:true}).tap();
  await expect(touchPage.getByRole('radio',{name:'3 Dragon Balls',exact:true})).toBeChecked();
  await context.close();
});
test('rendered screenshots and static performance evidence', async ({page, browser},testInfo) => {
  await fs.mkdir('test-results/evidence',{recursive:true});
  const metrics=[];
  for(const [name,route,width,height] of [['homepage-desktop','/',1448,1086],['detail-desktop','/projects/fixture-0/',1448,1086],['homepage-mobile','/',390,844],['detail-mobile','/projects/fixture-0/',390,844],['empty-desktop','http://127.0.0.1:4322/',1448,1086]]){
    await page.setViewportSize({width,height});await page.goto(route,{waitUntil:'networkidle'});await page.locator('img').evaluateAll(async es=>{es.forEach(e=>{e.loading='eager';});await Promise.all(es.map(e=>e.decode()));});
    const filename=`test-results/evidence/${name}.png`;await page.screenshot({path:filename,fullPage:name.includes('mobile')});await testInfo.attach(name,{path:filename,contentType:'image/png'});
    const data=await page.evaluate(()=>{const resources=performance.getEntriesByType('resource');return {domContentLoaded:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,resources:resources.length,transferred:performance.getEntriesByType('navigation')[0].transferSize+resources.reduce((n,r)=>n+r.transferSize,0),scriptBytes:resources.filter(r=>r.initiatorType==='script').reduce((n,r)=>n+r.transferSize,0),external:resources.filter(r=>new URL(r.name).origin!==location.origin).map(r=>r.name)};});
    expect(data.external).toEqual([]);expect(data.scriptBytes).toBeLessThan(30000);expect(data.transferred).toBeLessThan(400000);metrics.push({name,...data});
  }
  const mobile=await browser.newContext({viewport:{width:430,height:764},deviceScaleFactor:941/430,isMobile:true,hasTouch:true});
  await mobile.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:4321/')?route.continue():route.abort());const mp=await mobile.newPage();await mp.goto('http://127.0.0.1:4321/');await mp.locator('img').evaluateAll(async es=>{es.forEach(e=>{e.loading='eager';});await Promise.all(es.map(e=>e.decode()));});await mp.screenshot({path:'test-results/evidence/homepage-mobile-reference-resolution.png'});await mobile.close();
  await fs.writeFile('test-results/evidence/performance.json',JSON.stringify(metrics,null,2));
});

test('populated catalog without a featured listing never claims to be empty', async ({page}) => {
  await page.goto('http://127.0.0.1:4323/');
  await expect(page.locator('.project-card')).toHaveCount(7);
  await expect(page.locator('.spotlight-description')).toContainText('Browse community');
  await expect(page.locator('.spotlight-description')).not.toContainText('first community projects');
});

for (let i=0;i<7;i++) test(`detail information has one primary location for fixture ${i}`,async({page})=>{
  await page.goto(`/projects/fixture-${i}/`);
  await expect(page.locator('.detail-intro .detail-description')).toHaveCount(0);
  await expect(page.locator('.description-box')).toHaveCount(1);
  const labels=await page.locator('.project-information dt').allTextContents();
  expect(labels.some(label=>['Game','Category','Status','Repository'].includes(label))).toBe(false);
  const links=await page.locator('main a[href^="https://"]').evaluateAll(es=>es.map(e=>e.href.replace(/\/$/,'')));
  expect(new Set(links).size).toBe(links.length);
  if(i===0) await expect(page.getByRole('heading',{name:'Additional Links',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Screenshots',exact:true})).toHaveCount(i===0?1:0);
});
