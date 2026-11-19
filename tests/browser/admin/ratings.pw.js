import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {fixture, origin, binding} from '../../../tools/admin/test-fixture.js';
import {handle} from '../../../admin/worker.js';
import {random} from '../../../intake/worker.js';
import {handle as publicRatings} from '../../../ratings/worker.js';

const A = 'ext-aaaaaaaaaaaa', B = 'ext-bbbbbbbbbbbb', C = 'ext-cccccccccccc', XSS = '<img src=x onerror=window.__xss=1>';
const ALPHA = 'Alpha ' + XSS, REASON = 'One-time wave of low scores', CHANGED = 'These ratings changed; check again.';
const FUTURE = "These browsers' future ratings will not be counted either, until you count them again.";

async function setup(page, context, width) {
  const x = await fixture(), original = globalThis.fetch; globalThis.fetch = x.fetcher;
  const errors = [], hashes = [], as = {token: x.token};
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width, height: 900});
  await context.route(origin + '/**', async route => {
    const req = route.request(), data = req.postData();
    const response = await handle(new Request(req.url(), {method: req.method(), headers: {...req.headers(), 'Cf-Access-Jwt-Assertion': as.token}, ...(data ? {body: data} : {})}), x.env);
    await route.fulfill({status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer())});
  });
  x.state.projects = [{id: A, title: ALPHA, availability: 'available'}, {id: B, title: 'Beta project', availability: 'available'}];
  const vote = (project, score, hash = random()) => { hashes.push(hash); x.ratings.prepare('INSERT INTO votes(project_id,credential_hash,score) VALUES(?,?,?)').run(project, hash, score); return hash; };
  for (let n = 0; n < 6; n++) vote(A, 1);
  for (let n = 0; n < 3; n++) vote(B, 5, vote(A, 7));
  for (let n = 0; n < 4; n++) vote(B, 2);
  const publicEnv = {DB: binding(x.ratings), RATINGS_ENABLED: 'true', RATE_SALT: 'test', API_ORIGIN: 'https://ratings.example', SITE_ORIGIN: x.env.SITE_ORIGIN};
  const shown = async id => { const a = await (await publicRatings(new Request(`https://ratings.example/projects/${id}`), publicEnv)).json(); return a.count ? `Community rating ${a.average.toFixed(1)} from ${a.count} ratings` : 'No ratings yet'; };
  return {x, errors, hashes, vote, as, shown, done: () => { globalThis.fetch = original; x.db.close(); x.ratings.close(); }};
}
const cardOf = (page, title) => page.locator('#ratings-body .item-card').filter({has: page.getByRole('heading', {name: title, exact: true})});
const totals = (x, id) => ({...x.ratings.prepare('SELECT total,count FROM totals WHERE project_id=?').get(id)});
const excludedCount = x => x.ratings.prepare('SELECT count(*) n FROM excluded_credentials').get().n;
async function noHashes(page, hashes) {
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  for (const hash of hashes) expect(html.includes(hash), 'credential hash in page').toBe(false);
  expect(html).not.toContain('credential_hash');
}
async function checks(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const box of await page.locator('#ratings-body details').all()) await box.evaluate(d => { d.open = true; });
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
}
async function openRatings(page) {
  await page.getByRole('button', {name: 'Ratings', exact: true}).click();
  await expect(page.locator('#ratings-title')).toBeFocused();
  await expect(page.locator('#ratings-body .item-card')).not.toHaveCount(0);
}

for (const width of [390, 1280]) test(`ratings: stop counting a group, then count it again, at ${width}px`, async ({page, context}) => {
  const {x, errors, hashes, shown, done} = await setup(page, context, width);
  try {
    const start = totals(x, A);
    await page.goto(origin);
    await openRatings(page);
    const alpha = cardOf(page, ALPHA), beta = cardOf(page, 'Beta project');
    await expect(alpha).toContainText(await shown(A));
    await expect(beta).toContainText(await shown(B));
    await expect(alpha.getByText('Community rating 3.0 from 9 ratings', {exact: true})).toBeVisible();
    await expect(alpha.getByText('0 not counted', {exact: true})).toBeVisible();
    await expect(alpha.getByText('Score 1: 6 · Score 2: 0 · Score 3: 0 · Score 4: 0 · Score 5: 0 · Score 6: 0 · Score 7: 3', {exact: true})).toBeVisible();
    await expect(alpha.getByText('Worth a look: many one-time ratings of the same score', {exact: true})).toBeVisible();
    await expect(beta.getByText('Worth a look', {exact: false})).toHaveCount(0);
    await expect(page.getByText('Totals need checking')).toHaveCount(0);
    await expect(page.getByText('None.', {exact: true})).toBeVisible();
    await expect(page.getByText('None yet.', {exact: true})).toBeVisible();
    await noHashes(page, hashes);
    await checks(page);

    await alpha.locator('summary').evaluate(s => { s.parentElement.open = false; });
    await alpha.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(alpha.getByText('6 ratings of 1 came from browsers that rated nothing else', {exact: true})).toBeVisible();
    const reason = alpha.getByLabel('Reason (at least 10 characters; do not include names)');
    const stop = alpha.getByRole('button', {name: 'Stop counting these', exact: true});
    await expect(stop).toHaveCount(1);
    await reason.fill('too short');
    await stop.click();
    await expect(page.locator('#notice')).toHaveText('Write a reason of at least 10 characters first.');
    await expect(page.locator('#confirmation')).toBeHidden();
    await expect(reason).toBeFocused();
    expect(excludedCount(x)).toBe(0);

    await reason.fill('');
    await reason.pressSequentially(REASON);
    await page.keyboard.press('Tab');
    await expect(stop).toBeFocused();
    expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).toBe('solid');
    await page.keyboard.press('Enter');
    const dialog = page.locator('#confirmation-text');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Stop counting 6 ratings of 1 on ' + ALPHA + '.');
    await expect(dialog).toContainText('Rating now 3.0 from 9 ratings; after 7.0 from 3 ratings.');
    await expect(dialog).toContainText('This includes any genuine one-time ratings of 1. You can undo it under "Ratings not being counted".');
    await expect(dialog).toContainText(FUTURE);
    expect(excludedCount(x)).toBe(0);
    await noHashes(page, hashes);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', {name: 'Confirm', exact: true})).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.locator('#notice')).toHaveText(`Stopped counting 6 ratings. ${ALPHA}: 3.0 from 9, now 7.0 from 3.`);
    expect(totals(x, A)).toEqual({total: 21, count: 3});
    expect(excludedCount(x)).toBe(6);
    await expect(page.locator('#ratings-title')).toBeFocused();
    await expect(alpha).toContainText(await shown(A));
    await expect(alpha.getByText('Community rating 7.0 from 3 ratings', {exact: true})).toBeVisible();
    await expect(alpha.getByText('6 not counted', {exact: true})).toBeVisible();
    const stored = `${new Date().toISOString().slice(0, 10)} ${A} score 1: ${REASON}`;
    const excluded = page.locator('#ratings-body li').filter({hasText: stored});
    await expect(excluded.getByText(stored, {exact: true})).toBeVisible();
    await expect(excluded.getByText('6 browsers, 6 ratings', {exact: true})).toBeVisible();
    await expect(page.getByText(`Stop counting requested: ${stored}; 6 ratings`, {exact: true})).toBeVisible();
    await expect(page.getByText('Stop counting, browsers affected: 6', {exact: true})).toBeVisible();
    await noHashes(page, hashes);
    await checks(page);

    await excluded.getByRole('button', {name: 'Count these again', exact: true}).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#confirmation-text')).toContainText(stored);
    await page.getByRole('button', {name: 'Confirm', exact: true}).click();
    await expect(page.locator('#notice')).toHaveText('Counting ratings from 6 browsers again.');
    expect(totals(x, A)).toEqual(start);
    expect(excludedCount(x)).toBe(0);
    await expect(alpha.getByText('Community rating 3.0 from 9 ratings', {exact: true})).toBeVisible();
    await expect(alpha).toContainText(await shown(A));
    await expect(page.getByText('None.', {exact: true})).toBeVisible();
    await expect(page.getByText(`Count again requested: ${stored}`, {exact: true})).toBeVisible();
    await expect(page.getByText('Count again, browsers affected: 6', {exact: true})).toBeVisible();
    await expect(page.locator('#ratings-body li').filter({hasText: 'requested'})).toHaveCount(2);
    await noHashes(page, hashes);
    await checks(page);
    expect(errors).toEqual([]);
  } finally { done(); }
});

for (const width of [390, 1280]) test(`ratings: small groups, markup and hashes stay out at ${width}px`, async ({page, context}) => {
  const {x, errors, hashes, vote, done} = await setup(page, context, width);
  try {
    x.state.projects.push({id: C, title: 'Gamma project', availability: 'available'});
    const manual = 'Manual case ' + XSS;
    x.ratings.prepare('INSERT INTO excluded_credentials(credential_hash,reason) VALUES(?,?)').run(vote(C, 4), manual);
    vote(C, 4);
    await page.goto(origin);
    await openRatings(page);
    const beta = cardOf(page, 'Beta project');
    await beta.locator('summary').click();
    await expect(beta.getByText('No score has five or more one-time ratings.', {exact: true})).toBeVisible();
    await expect(beta.getByRole('button', {name: 'Stop counting these'})).toHaveCount(0);
    await expect(beta.getByText(/ratings of 2 came from/)).toHaveCount(0);
    await expect(beta.locator('.disclosure-body')).not.toContainText('4');
    const alpha = cardOf(page, ALPHA);
    await alpha.locator('summary').click();
    await expect(alpha.getByText(/ratings of 7 came from/)).toHaveCount(0);
    await expect(page.getByRole('heading', {name: ALPHA, exact: true})).toBeVisible();
    await expect(page.getByText(manual, {exact: true})).toBeVisible();
    await expect(cardOf(page, 'Gamma project').getByText('1 not counted', {exact: true})).toBeVisible();
    await expect(cardOf(page, 'Gamma project').getByText('Community rating 4.0 from 1 rating', {exact: true})).toBeVisible();
    const manualRow = page.locator('#ratings-body li').filter({hasText: manual});
    await expect(manualRow.getByText('1 browser, 1 rating', {exact: true})).toBeVisible();
    await expect(page.locator('#ratings-body img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await noHashes(page, hashes);
    await checks(page);
    await manualRow.getByRole('button', {name: 'Count these again', exact: true}).click();
    await expect(page.locator('#confirmation-text')).toContainText('1 browser, 1 rating. Their future ratings will be counted too.');
    await page.getByRole('button', {name: 'Confirm', exact: true}).click();
    await expect(page.locator('#notice')).toHaveText('Counting ratings from 1 browser again.');
    expect(errors).toEqual([]);
  } finally { done(); }
});

for (const width of [390, 1280]) test(`ratings: refusals show the server's sentence and change nothing at ${width}px`, async ({page, context}) => {
  const {x, errors, hashes, vote, as, done} = await setup(page, context, width);
  try {
    const start = totals(x, A), alpha = cardOf(page, ALPHA), problem = page.locator('#ratings-body [role=alert]');
    const reason = () => alpha.getByLabel('Reason (at least 10 characters; do not include names)');
    const stop = () => alpha.getByRole('button', {name: 'Stop counting these', exact: true});
    await page.goto(origin);
    await openRatings(page);

    x.env.ADMIN_EMAILS += ',moderator@example.org';
    as.token = await x.jwt({sub: 'moderator', email: 'moderator@example.org'});
    await alpha.locator('summary').click();
    await reason().fill(REASON);
    await stop().click();
    await expect(problem).toHaveText('Only the publication owner can change which ratings count');
    await expect(page.locator('#confirmation')).toBeHidden();
    expect(excludedCount(x)).toBe(0); expect(totals(x, A)).toEqual(start);
    await expect(alpha.getByText('Community rating 3.0 from 9 ratings', {exact: true})).toBeVisible();
    await checks(page);
    as.token = x.token;

    await reason().fill(REASON);
    await stop().click();
    await expect(page.locator('#confirmation-text')).toContainText('Stop counting 6 ratings of 1');
    vote(A, 1);
    await page.getByRole('button', {name: 'Confirm', exact: true}).click();
    await expect(problem).toHaveText(CHANGED);
    expect(excludedCount(x)).toBe(0); expect(totals(x, A)).toEqual({total: 28, count: 10});
    await alpha.locator('summary').click();
    await expect(alpha.getByText('7 ratings of 1 came from browsers that rated nothing else', {exact: true})).toBeVisible();
    await expect(stop()).toBeEnabled();
    await expect(page.getByText('Stop counting, browsers affected: 0', {exact: true})).toBeVisible();
    await noHashes(page, hashes);
    await checks(page);

    const ratings = x.env.RATINGS_DB; delete x.env.RATINGS_DB;
    await reason().fill(REASON);
    await stop().click();
    await expect(problem).toHaveText('Ratings are not connected to the dashboard');
    await expect(page.locator('#ratings-body .item-card')).toHaveCount(0);
    await page.getByRole('button', {name: 'Ratings', exact: true}).click();
    await expect(problem).toHaveText('Ratings are not connected to the dashboard');
    await expect(page.locator('#ratings-title')).toBeFocused();
    await checks(page);
    x.env.RATINGS_DB = ratings;
    await openRatings(page);
    await expect(problem).toHaveCount(0);
    await expect(alpha.getByText('Community rating 2.8 from 10 ratings', {exact: true})).toBeVisible();
    expect(errors).toEqual([]);
  } finally { done(); }
});
