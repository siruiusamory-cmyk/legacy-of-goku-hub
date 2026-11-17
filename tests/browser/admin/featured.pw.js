import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {featuredFixture, featureBase} from '../../../tools/admin/featured-fixture.js';
import {preparePackage} from '../../../tools/admin/process.js';
import {handle} from '../../../admin/worker.js';
import {origin} from '../../../tools/admin/test-fixture.js';
import {saveJSON} from '../../../src/records.js';
import {detailImage} from '../../../tools/site/artwork.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
test('owner features, replaces and clears GitHub/community projects through private approval; actual homepage preserves artwork, rating and actions', async ({page, context}) => {
  test.setTimeout(120000);
  const x = await featuredFixture(), original = globalThis.fetch;
  globalThis.fetch = x.fetcher;
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const home = await context.newPage();
  let rendered, build = 0;
  try {
    await x.login();
    let publication = await x.refresh();
    await context.route(origin + '/**', async route => {
      const request = route.request(), body = request.postData();
      const response = await handle(new Request(request.url(), {method: request.method(), headers: {...request.headers(), 'Cf-Access-Jwt-Assertion': x.token}, ...(body ? {body} : {})}), x.env);
      await route.fulfill({status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer())});
    });
    await context.route('https://ratings.example/**', route => route.fulfill({json: {average: 6, count: 2}, headers: {'Access-Control-Allow-Origin': '*'}}));
    await context.route('https://site.example/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      const file = path.join(rendered, pathname === '/' ? 'index.html' : pathname.endsWith('/') ? pathname + 'index.html' : pathname);
      const type = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png'}[path.extname(file)] || 'application/octet-stream';
      await route.fulfill({body: await fs.readFile(file), contentType: type});
    });
    async function renderHome() {
      const directory = path.join(x.root, 'render-' + build++), input = path.join(directory, 'input');
      rendered = path.join(directory, 'site');
      await fs.mkdir(input, {recursive: true});
      await fs.cp(path.join(publication.output, 'work/dist'), path.join(input, 'public'), {recursive: true});
      const artwork = {};
      for (const project of publication.catalog.projects) {
        const detail = await detailImage(await fs.readFile(path.join(input, 'public', project.cover)));
        const src = `assets/${project.id}/detail.webp`;
        await fs.writeFile(path.join(input, 'public', src), detail.data); artwork[project.id] = {src, width: detail.width, height: detail.height};
      }
      await saveJSON(path.join(input, 'catalog.json'), publication.catalog);
      await saveJSON(path.join(input, 'artwork.json'), artwork);
      await saveJSON(path.join(input, 'provenance.json'), {purpose: 'fixture', base: '/'});
      const result = spawnSync(process.execPath, [path.join(root, 'node_modules/astro/bin/astro.mjs'), 'build', '--root', path.join(root, 'website')], {
        encoding: 'utf8', windowsHide: true, env: {...process.env, SITE_BASE: '/', SITE_INPUT: input, SITE_PUBLIC: path.join(input, 'public'), SITE_OUT: rendered, PUBLIC_RATINGS_ENABLED: 'true', PUBLIC_RATINGS_API: 'https://ratings.example'}
      });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      await home.goto('https://site.example/');
    }
    await page.setViewportSize({width: 390, height: 900});
    await page.goto(origin); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'Existing listings', exact: true}).click();
    await expect(page.getByText('Currently Featured: none', {exact: true})).toBeVisible();
    for (const [id, action] of [['gh-123', 'Feature'], ['ext-abcdefghijkl', 'Replace Featured'], ['ext-abcdefghijkl', 'Remove from Featured']]) {
      const project = x.state.projects.find(project => project.id === id);
      if (action === 'Feature') await page.locator('.item-card').filter({has: page.getByRole('button', {name: 'Manage ' + id, exact: true})}).getByRole('button', {name: 'Make Featured', exact: true}).click();
      else {
        await page.getByRole('button', {name: 'Manage ' + id, exact: true}).click();
        await page.getByRole('button', {name: action, exact: true}).click();
      }
      await expect(page.locator('#notice')).toContainText('Private preparation queued');
      const row = (await (await x.call('/api/reviews')).json()).items[0];
      await x.processCall(row.id, '/claim', {action: 'prepare'});
      const prepared = await preparePackage({row, root: x.root, api: x.api, fetcher: x.fetchImages, site: 'https://site.example', base: featureBase});
      for (const file of prepared.buffers) await x.processCall(row.id, '/file', {name: file.name, part: 0, data: file.bytes.toString('base64')});
      expect((await x.processCall(row.id, '/ready', {package: prepared.package})).status).toBe(200);
      await page.getByRole('button', {name: 'Refresh reviews', exact: true}).click();
      await expect(page.getByRole('heading', {name: 'Proposed homepage Featured project', exact: true})).toBeVisible();
      if (action === 'Remove from Featured') await expect(page.getByText('No project selected.', {exact: false})).toBeVisible();
      else {
        await expect(page.getByRole('heading', {name: project.title, exact: true})).toBeVisible();
        await expect(page.getByText(project.description, {exact: true})).toBeVisible();
        const image = page.getByRole('img', {name: 'Prepared cover artwork'});
        await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth === 640)).toBe(true);
      }
      await page.getByLabel('I reviewed the exact content', {exact: false}).check();
      if (prepared.package.files.length) await page.getByLabel('I inspected all normalized artwork', {exact: false}).check();
      expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', {name: prepared.package.files.length ? 'Approve exact content and artwork' : 'Approve exact content', exact: true}).click(); await page.getByRole('button', {name: 'Confirm', exact: true}).click();
      await expect(page.locator('#notice')).toContainText('Exact approval recorded');
      await page.getByRole('button', {name: 'Prepare protected publication PR'}).click(); await page.getByRole('button', {name: 'Confirm', exact: true}).click();
      await expect(page.locator('#notice')).toContainText('PR preparation queued');
      expect(x.state.dispatched.at(-1).inputs.action).toBe('publish');
      await saveJSON(path.join(x.root, 'policy/publishing.json'), prepared.package.policy);
      publication = await x.refresh();
      await renderHome();
      const spotlight = home.locator('.spotlight');
      if (action === 'Remove from Featured') await expect(spotlight).toHaveClass(/empty-spotlight/);
      else {
        await expect(spotlight.getByRole('heading', {name: project.title})).toBeVisible();
        await expect(spotlight.locator('.spotlight-art img')).toHaveAttribute('src', '/' + project.cover);
        await expect(spotlight.locator('[data-ratings-project]')).toHaveAttribute('data-ratings-project', id);
        await expect(spotlight.getByText('6.0', {exact: false})).toBeVisible();
        await expect(spotlight.getByRole('link', {name: 'View Project', exact: true})).toHaveAttribute('href', '/projects/' + id + '/');
        await expect(spotlight.getByRole('link', {name: id === 'gh-123' ? 'View Repository' : project.distribution.label, exact: true})).toHaveAttribute('href', id === 'gh-123' ? project.repository : project.distribution.url);
      }
      await expect(home.getByRole('button', {name: /Feature/})).toHaveCount(0);
      await page.getByRole('button', {name: 'Existing listings', exact: true}).click();
      await expect(page.getByText(action === 'Remove from Featured' ? 'Currently Featured: none' : 'Currently Featured: ' + project.title + ' · ' + id, {exact: true})).toBeVisible();
    }
    expect(errors).toEqual([]);
  } finally { await home.close(); globalThis.fetch = original; await x.dispose(); }
});
