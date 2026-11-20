import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fixture, origin} from '../../../tools/admin/test-fixture.js';
import {handle} from '../../../admin/worker.js';
import {preparePackage} from '../../../tools/admin/process.js';
import {saveJSON} from '../../../src/records.js';

test('administrator deliberately omits supplied artwork and approves the exact artwork-free package', async ({page, context}) => {
  const x = await fixture(), original = globalThis.fetch;
  globalThis.fetch = x.fetcher;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loghub-no-art-browser-'));
  try {
    await x.login();
    await x.seed({artwork: ['https://images.example/bad.png']});
    await saveJSON(path.join(root, 'policy/publishing.json'), {version: 1, trusted_owner_ids: [], revoked_owner_ids: [], projects: [], external_projects: []});
    await context.route(origin + '/**', async route => {
      const request = route.request(), body = request.postData();
      const response = await handle(new Request(request.url(), {method: request.method(), headers: {...request.headers(), 'Cf-Access-Jwt-Assertion': x.token}, ...(body ? {body} : {})}), x.env);
      await route.fulfill({status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer())});
    });
    await page.goto(origin);
    await expect(page.getByRole('button', {name: 'Sign in', exact: true})).toBeHidden(); await expect(page.locator('#workspace')).toBeVisible();
    await page.getByRole('button', {name: 'Review submission 1', exact: true}).click();
    await page.locator('#more-metadata summary').click();
    await page.getByLabel('Omit all artwork', {exact: false}).check();
    await page.getByRole('button', {name: 'Prepare preview', exact: true}).click();
    await expect(page.locator('#notice')).toContainText('Private preparation queued');
    const row = (await (await x.call('/api/reviews')).json()).items[0];
    expect(row.payload.omit_artwork).toBe(true);
    await x.processCall(row.id, '/claim', {action: 'prepare'});
    const prepared = await preparePackage({row, root, fetcher: async () => { throw Error('Omitted artwork cannot be fetched'); }, base: 'a'.repeat(40)});
    expect(prepared.buffers).toEqual([]);
    expect((await x.processCall(row.id, '/ready', {package: prepared.package})).status).toBe(200);
    await page.getByRole('button', {name: 'Refresh reviews', exact: true}).click();
    await expect(page.getByText('No cover supplied.', {exact: false})).toBeVisible();
    await expect(page.getByLabel('I inspected all prepared images', {exact: false})).toHaveCount(0);
    await page.getByLabel('I reviewed the exact content', {exact: false}).check();
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    await page.getByRole('button', {name: 'Approve exact content', exact: true}).click();
    await page.getByRole('button', {name: 'Confirm', exact: true}).click();
    await expect(page.locator('#notice')).toContainText('Exact approval recorded');
    await page.getByRole('button', {name: 'Publish now', exact: true}).click();
    await expect(page.locator('#notice')).toContainText('Publication started');
    expect(x.state.dispatched.at(-1).inputs.action).toBe('publish');
  } finally { globalThis.fetch = original; x.db.close(); await fs.rm(root, {recursive: true, force: true}); }
});
