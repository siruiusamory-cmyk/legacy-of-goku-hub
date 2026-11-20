import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {fixture, origin} from '../../../tools/admin/test-fixture.js';
import {handle} from '../../../admin/worker.js';
import {handle as intake, digest} from '../../../intake/worker.js';

const API_ORIGIN = 'https://api.example', SITE_ORIGIN = 'https://site.example';
const XSS = '<img src=x onerror=window.__xss=1>', LIVE = 'ext-abcdefghijkl';
const FORBIDDEN = ['pr-open', 'dispatch-failed', 'stale', 'legacy-of-goku-2', 'preview-0.webp', '{"'];
const live = {id: LIVE, title: 'Live listing', description: 'The published description of this listing.', source: {url: 'https://forum.example.org/live'}, game: 'legacy-of-goku', category: 'tool', status: 'released'};

async function setup(page, context, width) {
  const x = await fixture(), original = globalThis.fetch; globalThis.fetch = x.fetcher;
  const errors = [], prepared = [];
  page.on('pageerror', error => errors.push(error.message));
  await x.login();
  await page.setViewportSize({width, height: 900});
  await context.route(origin + '/**', async route => {
    const req = route.request(), data = req.postData();
    if (new URL(req.url()).pathname === '/api/prepare') prepared.push(JSON.parse(data));
    const response = await handle(new Request(req.url(), {method: req.method(), headers: {...req.headers(), 'Cf-Access-Jwt-Assertion': x.token}, ...(data ? {body: data} : {})}), x.env);
    await route.fulfill({status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer())});
  });
  return {x, errors, prepared, done: () => { globalThis.fetch = original; x.db.close(); }};
}
async function insert(x, id, state, more = {}, pkg = {}) {
  const time = Math.floor(Date.now() / 1000);
  const text = pkg === null ? null : JSON.stringify({project_id: LIVE, operation: 'submission', files: [], policy: {}, listing: {title: 'Tracked project', description: 'A fictional tracked project.'}, ...pkg});
  const row = {id, submission_id: null, revision: null, project_id: LIVE, operation: 'submission', payload: '{"value":{}}', state, version: 1, package: text, digest: text && await digest(text), approved_digest: null, pr: null, error: null, dispatched: null, created: time, updated: time, ...more};
  x.db.prepare(`INSERT INTO admin_reviews(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
  return row;
}
const fits = page => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
async function checks(page) {
  await fits(page);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  const text = await page.evaluate(() => document.body.innerText);
  for (const word of FORBIDDEN) expect(text, word).not.toContain(word);
}
const review = (page, id) => page.getByRole('button', {name: 'Review submission ' + id, exact: true});
const titles = async page => (await page.locator('#items .item-card h3').allTextContents()).sort();

for (const width of [390, 1280]) test(`messages, replies and safe text at ${width}px`, async ({page, context}) => {
  const {x, errors, done} = await setup(page, context, width);
  try {
    x.state.projects = [live];
    const correction = await x.seed({kind: 'correct', listing_id: LIVE, note: 'Please fix the title ' + XSS, title: 'Better title'});
    const claim = await x.seed({kind: 'claim', listing_id: LIVE, note: 'I made this project and can prove it.', url: 'https://fiction.example.org/claim'});
    await page.goto(origin);
    for (const s of [correction, claim]) await expect(page.locator('.item-card').filter({has: review(page, s.id)}).locator('h3')).toHaveText('Live listing');
    await review(page, correction.id).click();
    const messages = page.locator('.message-block');
    await expect(messages.getByText('Correction request', {exact: true})).toBeVisible();
    await expect(messages).toContainText('Please fix the title ' + XSS);
    await expect(page.locator('#details img')).toHaveCount(0);
    await checks(page);
    await page.getByLabel('Message to the submitter (shown on their receipt)', {exact: true}).fill('Please send a longer description.');
    await page.getByRole('button', {name: 'Request corrections', exact: true}).click();
    await page.getByRole('button', {name: 'Confirm', exact: true}).click();
    await expect(page.locator('#details')).toContainText('Awaiting corrections');
    const reply = await intake(new Request(API_ORIGIN + '/revise', {method: 'POST', headers: {Origin: SITE_ORIGIN, 'Content-Type': 'application/json'}, body: JSON.stringify({receipt: correction.receipt, changes: {note: 'Here is the longer description you asked for.'}})}), {DB: x.env.DB, INTAKE_ENABLED: 'true', RATE_SALT: 'test', API_ORIGIN, SITE_ORIGIN});
    expect(reply.status).toBe(200);
    await page.getByRole('button', {name: 'Submission inbox', exact: true}).click();
    const card = page.locator('.item-card').filter({has: review(page, correction.id)});
    await expect(card.getByText('Reply received', {exact: true})).toBeVisible();
    await expect(page.locator('.item-card').filter({has: review(page, claim.id)}).getByText('Reply received')).toHaveCount(0);
    await checks(page);
    await review(page, correction.id).click();
    await expect(messages).toContainText('Please fix the title ' + XSS);
    await expect(messages.getByText('Reply from the submitter', {exact: true})).toBeVisible();
    await expect(messages).toContainText('Here is the longer description you asked for.');
    await page.getByRole('button', {name: 'Start review', exact: true}).click();
    await expect(page.locator('#details')).toContainText('Under review');
    await expect(page.getByRole('button', {name: 'Start review', exact: true})).toBeHidden();
    await expect(messages.getByText('You wrote', {exact: true})).toHaveCount(1);
    const stored = JSON.parse(x.db.prepare('SELECT payload FROM submissions WHERE id=?').get(correction.id).payload);
    expect(stored.note).toBe('Please fix the title ' + XSS);
    stored.replies.push({at: stored.replies[0].at + 1, text: 'Stored ' + XSS}); stored.replies_dropped = 2;
    x.db.prepare('UPDATE submissions SET payload=? WHERE id=?').run(JSON.stringify(stored), correction.id);
    await page.getByRole('button', {name: 'Submission inbox', exact: true}).click();
    await review(page, correction.id).click();
    await expect(messages).toContainText('Stored ' + XSS);
    await expect(messages.getByText('2 earlier replies were removed to fit.', {exact: true})).toBeVisible();
    await expect(page.locator('#details img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await checks(page);
    await page.getByRole('button', {name: 'Submission inbox', exact: true}).click();
    await review(page, claim.id).click();
    await expect(page.locator('#detail-title')).toHaveText('Review: Live listing');
    await expect(messages.getByText('Ownership claim', {exact: true})).toBeVisible();
    await expect(messages).toContainText('I made this project and can prove it.');
    await checks(page);
    expect(errors).toEqual([]);
  } finally { done(); }
});

for (const width of [390, 1280]) test(`summary strip, filters and closed decisions at ${width}px`, async ({page, context}) => {
  const {x, errors, done} = await setup(page, context, width);
  try {
    x.state.projects = [live];
    const fresh = await x.seed({title: 'Fresh arrival', game: 'legacy-of-goku-2', url: 'https://fiction.example.org/fresh'});
    const looked = await x.seed({title: 'Being looked at', url: 'https://fiction.example.org/looked'});
    const waiting = await x.seed({title: 'Waiting for visitor', url: 'https://fiction.example.org/waiting'});
    const rejected = await x.seed({title: 'Turned away', url: 'https://fiction.example.org/rejected'});
    const published = await x.seed({title: 'Already live', url: 'https://fiction.example.org/published'});
    for (const [s, state] of [[looked, 'in-review'], [waiting, 'needs-changes'], [rejected, 'rejected'], [published, 'published']]) x.db.prepare('UPDATE submissions SET state=? WHERE id=?').run(state, s.id);
    const time = Math.floor(Date.now() / 1000);
    await insert(x, 'r'.repeat(24), 'ready', {}, {files: [{name: 'preview-0.webp', sha256: 'a'.repeat(64), parts: 1}], listing: {title: 'Ready project', description: 'A fictional ready project.', game: 'legacy-of-goku-2', category: 'rom-hack', status: 'released', cover: 'assets/ready/cover.webp'}});
    const going = await insert(x, 'p'.repeat(24), 'approved', {dispatched: time}, {listing: {title: 'Going out', description: 'A fictional project being published.'}});
    x.db.prepare('UPDATE admin_reviews SET approved_digest=digest WHERE id=?').run(going.id);
    await insert(x, 'd'.repeat(24), 'dispatch-failed', {error: 'Preparation could not start; retry.', payload: '{"value":{"title":"Stuck project"}}'}, null);
    await insert(x, 's'.repeat(24), 'stale', {created: time - 50}, {listing: {title: 'Old attempt', description: 'A replaced fictional review.'}});
    await page.goto(origin);
    const count = name => page.locator('#count-' + name + ' .count');
    for (const [name, n] of [['new', '2'], ['waiting', '1'], ['ready', '1'], ['publishing', '1'], ['attention', '1']]) await expect(count(name)).toHaveText(n);
    await expect(page.locator('#state')).toHaveValue('open');
    expect(await titles(page)).toEqual(['Being looked at', 'Fresh arrival', 'Waiting for visitor']);
    await expect(page.locator('#state option[value=received]')).toHaveText('New only');
    await checks(page);
    await page.locator('#count-new').click();
    await expect(page.locator('#state')).toHaveValue('new');
    await expect.poll(() => titles(page)).toEqual(['Being looked at', 'Fresh arrival']);
    await page.locator('#count-waiting').click();
    await expect.poll(() => titles(page)).toEqual(['Waiting for visitor']);
    await expect(page.locator('#pagination')).toHaveText('Page 1 · 1 submission');
    await page.locator('#state').selectOption('open');
    await expect.poll(() => titles(page)).toEqual(['Being looked at', 'Fresh arrival', 'Waiting for visitor']);
    const listed = page.locator('#review-list .review-item');
    const keyboard = page.locator('#count-ready');
    await page.locator('#count-waiting').focus(); await page.keyboard.press('Tab');
    await expect(keyboard).toBeFocused();
    expect(await keyboard.evaluate(node => node.matches(':focus-visible') && getComputedStyle(node).outlineStyle)).toBe('solid');
    for (const [name, title] of [['ready', 'Ready project'], ['publishing', 'Going out'], ['attention', 'Stuck project']]) {
      if (name === 'ready') await page.keyboard.press('Enter'); else await page.locator('#count-' + name).click();
      await expect(listed).toHaveCount(1);
      await expect(listed).toContainText(title);
      await expect(page.getByRole('button', {name: 'Show all reviews', exact: true})).toBeVisible();
    }
    await checks(page);
    await page.getByRole('button', {name: 'Show all reviews', exact: true}).click();
    await expect(listed).toHaveCount(4);
    await listed.filter({hasText: 'Ready project'}).click();
    await expect(page.getByText('Another change is being published. If it goes live first, this one will need a fresh preview.', {exact: true})).toBeVisible();
    await expect(page.locator('#review-detail figcaption')).toHaveText('Cover');
    await expect(page.locator('#review-detail')).toContainText('Legacy of Goku II');
    await expect(page.locator('#review-detail')).toContainText('Review ' + 'r'.repeat(24));
    await checks(page);

    await insert(x, 'q'.repeat(24), 'pr-open', {pr: 44, approved_digest: 'x'}, {listing: {title: 'Checked project', description: 'A fictional project with a failing check.'}});
    x.state.pr = {number: 44, state: 'open', merged: false, mergeable_state: 'blocked', auto_merge: {merge_method: 'squash'}, head: {sha: 'b'.repeat(40)}, html_url: 'https://github.com/fictional/hub/pull/44'};
    x.state.checks = [{name: 'test', status: 'completed', conclusion: 'failure', html_url: 'https://github.com/fictional/hub/actions/runs/9'}];
    await page.getByRole('button', {name: 'Submission inbox', exact: true}).click();
    await expect(count('attention')).toHaveText('2');
    await expect(count('publishing')).toHaveText('1');
    await expect(page.locator('#count-attention')).toHaveClass(/alert/);
    await page.locator('#count-attention').click();
    await expect(listed).toHaveCount(2);
    await expect(listed.filter({hasText: 'Checked project'})).toHaveCount(1);
    await listed.filter({hasText: 'Checked project'}).click();
    await expect(page.locator('#publication-status')).toContainText('The automated check “test” failed, so nothing was published.');
    await checks(page);

    await page.getByRole('button', {name: 'Submission inbox', exact: true}).click();
    await review(page, looked.id).click();
    await expect(page.getByRole('button', {name: 'Start review', exact: true})).toBeHidden();
    await page.getByRole('button', {name: 'Submission inbox', exact: true}).click();
    await review(page, fresh.id).click();
    await expect(page.locator('select[name=game]')).toHaveValue('legacy-of-goku-2');
    await checks(page);
    await page.getByRole('button', {name: 'Reject submission', exact: true}).click();
    await expect(page.locator('#notice')).toHaveText('Write a message to the submitter of at least 5 characters first. It appears on their receipt.');
    expect(await page.locator('#confirmation').evaluate(dialog => dialog.open)).toBe(false);
    await expect(page.locator('#public-note')).toBeFocused();
    const noticeClear = () => page.evaluate(() => { const n = document.getElementById('notice').getBoundingClientRect(), f = document.activeElement.getBoundingClientRect(); return n.height > 0 && n.top >= 0 && n.bottom <= innerHeight && (f.top >= n.bottom || f.bottom <= n.top); });
    await expect.poll(noticeClear).toBe(true);
    await page.locator('#public-note').fill('Not a <b> project.');
    await page.getByRole('button', {name: 'Reject submission', exact: true}).click();
    await expect(page.locator('#notice')).toHaveText('Messages cannot contain < or > or control characters.');
    expect(await page.locator('#confirmation').evaluate(dialog => dialog.open)).toBe(false);
    await expect(page.locator('#public-note')).toBeFocused();
    await expect.poll(noticeClear).toBe(true);
    await page.locator('#public-note').fill('This is not a Legacy of Goku project.');
    await page.getByRole('button', {name: 'Reject submission', exact: true}).click();
    await expect(page.locator('#confirmation')).toBeVisible();
    await expect(page.locator('#notice')).toHaveText('');
    await page.getByRole('button', {name: 'Confirm', exact: true}).click();
    await expect(page.locator('#notice')).toHaveText('Moderation decision recorded.');
    await expect(page.locator('#details')).toContainText('This submission is closed.');
    for (const name of ['Start review', 'Request corrections', 'Reject submission', 'Prepare preview']) await expect(page.getByRole('button', {name, exact: true})).toBeHidden();
    await expect(page.getByLabel('Also make this the Featured project')).toBeHidden();
    for (const id of ['metadata', 'moderation-notes', 'policy-evidence']) await expect(page.locator('#' + id)).toBeHidden();
    await checks(page);
    await page.getByRole('button', {name: 'Existing listings', exact: true}).click();
    await expect(page.locator('#notice')).toHaveText('');
    await page.getByRole('button', {name: 'Manage Live listing', exact: true}).click();
    for (const id of ['metadata', 'moderation-notes', 'policy-evidence']) await expect(page.locator('#' + id)).toBeVisible();
    await checks(page);
    await page.getByRole('button', {name: 'Submission inbox', exact: true}).click();
    await expect.poll(() => titles(page)).toEqual(['Being looked at', 'Waiting for visitor']);
    await expect(count('new')).toHaveText('1');
    expect(errors).toEqual([]);
  } finally { done(); }
});

for (const width of [390, 1280]) test(`corrections open on the live listing at ${width}px`, async ({page, context}) => {
  const {x, errors, prepared, done} = await setup(page, context, width);
  try {
    x.state.projects = [live];
    const correction = await x.seed({kind: 'correct', listing_id: LIVE, note: 'Please update the listing.', title: 'Proposed ' + XSS + ' title', description: 'A proposed description that is long enough to pass.', links: [{label: 'Project page', url: 'https://evil.example/login'}], artwork: ['https://images.example.net/new.png']});
    const legacy = await x.seed({kind: 'correct', listing_id: 'ext-zzzzzzzzzzzz', note: 'Please update this old one.', title: 'Old listing new name', url: 'https://fiction.example.org/legacy'});
    await page.goto(origin);
    await review(page, correction.id).click();
    await expect(page.locator('#detail-title')).toHaveText('Review: Live listing');
    await expect(page.getByLabel('Project name', {exact: true})).toHaveValue('Live listing');
    await expect(page.getByLabel('Description', {exact: true})).toHaveValue(live.description);
    const proposed = page.locator('#details .compare li');
    await expect(proposed.filter({has: page.getByText('Project name', {exact: true})})).toContainText('Proposed ' + XSS + ' title');
    await expect(page.getByRole('link', {name: 'Image 1 (images.example.net)', exact: true})).toBeVisible();
    await expect(page.locator('#details > .summary-links').getByRole('link', {name: 'Project page (evil.example)', exact: true})).toBeVisible();
    await expect(page.locator('#details img')).toHaveCount(0);
    await expect(page.getByLabel('Also make this the Featured project')).toBeHidden();
    await checks(page);
    await page.getByRole('button', {name: 'Prepare preview', exact: true}).click();
    await expect(page.locator('#notice')).toHaveText('Nothing has changed yet.');
    expect(prepared).toEqual([]);
    await proposed.filter({has: page.getByText('Description', {exact: true})}).getByRole('button', {name: 'Use this', exact: true}).click();
    await expect(page.getByLabel('Description', {exact: true})).toHaveValue('A proposed description that is long enough to pass.');
    await expect(page.getByLabel('Description', {exact: true})).toBeFocused();
    await page.getByRole('button', {name: 'Prepare preview', exact: true}).click();
    await expect(page.locator('#notice')).toContainText('Private preparation queued');
    expect(prepared).toHaveLength(1);
    expect(prepared[0].payload).toEqual({kind: 'correct', listing_id: LIVE, note: 'Please update the listing.', description: 'A proposed description that is long enough to pass.'});
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await page.getByRole('button', {name: 'Submission inbox', exact: true}).click();
    await review(page, legacy.id).click();
    await expect(page.locator('#details')).toContainText('This listing is not on the site, so it cannot be corrected here.');
    await expect(page.getByLabel('Project name', {exact: true})).toHaveValue('Old listing new name');
    await expect(page.getByRole('button', {name: 'Prepare preview', exact: true})).toBeDisabled();
    await checks(page);
    await page.getByRole('button', {name: 'Existing listings', exact: true}).click();
    await page.getByRole('button', {name: 'Manage Live listing', exact: true}).click();
    await page.getByRole('button', {name: 'Prepare metadata / artwork changes', exact: true}).click();
    await expect(page.locator('#notice')).toHaveText('Nothing has changed yet.');
    expect(prepared).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally { done(); }
});

for (const width of [390, 1280]) test(`listing actions fit the listing state and show its history at ${width}px`, async ({page, context}) => {
  const {x, errors, done} = await setup(page, context, width);
  try {
    x.state.projects = [live];
    x.state.policy = {projects: [], external_projects: [{project_id: LIVE, decision: 'approved'}, {project_id: 'ext-suspendedaaa', decision: 'suspended'}, {project_id: 'ext-delistedaaaa', decision: 'delisted'}]};
    const time = Math.floor(Date.now() / 1000);
    await insert(x, 'e'.repeat(24), 'published', {operation: 'edit', created: time - 200, payload: '{"value":{},"reason":""}'});
    await insert(x, 'w'.repeat(24), 'withdrawn', {operation: 'suspend', created: time - 100, payload: '{"value":{},"reason":"Spam links were found here."}'});
    await insert(x, 'g'.repeat(24), 'stale', {operation: 'feature', created: time - 50});
    await insert(x, 'h'.repeat(24), 'failed', {operation: 'edit', created: time - 40, error: 'Nothing has changed from the published listing.'});
    x.db.prepare("INSERT INTO admin_history(review_id,actor,action,created) VALUES(?,'owner@example.org','exact-approval',?)").run('e'.repeat(24), time - 150);
    await page.goto(origin);
    await page.getByRole('button', {name: 'Existing listings', exact: true}).click();
    await checks(page);
    const visible = async (shown, hidden) => {
      for (const name of shown) await expect(page.getByRole('button', {name, exact: true})).toBeVisible();
      for (const name of hidden) await expect(page.getByRole('button', {name, exact: true})).toBeHidden();
    };
    await page.getByRole('button', {name: 'Manage Live listing', exact: true}).click();
    await visible(['Suspend listing', 'Delist listing'], ['Restore listing']);
    await page.locator('#history-panel summary').click();
    const history = page.locator('#history');
    await expect(history.getByRole('heading', {name: 'Changes to this listing'})).toBeVisible();
    await expect(history.locator('p')).toHaveCount(2);
    await expect(history.locator('p').first()).toContainText('Suspend · Done · Spam links were found here.');
    await expect(history.locator('p').nth(1)).toContainText('Listing edit · Published · Approved by owner@example.org');
    await expect(history).not.toContainText(/Replaced|Needs attention/);
    await checks(page);
    await page.getByRole('button', {name: 'Back to list', exact: false}).click();
    await page.getByRole('button', {name: 'Manage ext-suspendedaaa', exact: true}).click();
    await visible(['Delist listing', 'Restore listing'], ['Suspend listing']);
    await checks(page);
    await page.getByRole('button', {name: 'Back to list', exact: false}).click();
    await page.getByRole('button', {name: 'Manage ext-delistedaaaa', exact: true}).click();
    await visible(['Restore listing'], ['Suspend listing', 'Delist listing']);
    await checks(page);
    expect(errors).toEqual([]);
  } finally { done(); }
});

for (const width of [390, 1280]) test(`field errors, Featured choice and failure recovery at ${width}px`, async ({page, context}) => {
  const {x, errors, prepared, done} = await setup(page, context, width);
  try {
    const short = await x.seed({title: 'Short one', description: 'Too short', url: 'https://fiction.example.org/short'});
    const plain = await x.seed({kind: 'add', title: 'Plain listing', url: 'https://fiction.example.org/plain'});
    const broken = await x.seed({title: 'Image trouble', url: 'https://fiction.example.org/broken'});
    const value = s => JSON.stringify({value: s.payload, reason: '', transfer: false, omit_artwork: false});
    await insert(x, 'f'.repeat(24), 'ready', {submission_id: plain.id, revision: 1, payload: value(plain)}, {listing: {title: 'Plain listing', description: plain.payload.description}});
    await insert(x, 'i'.repeat(24), 'failed', {submission_id: broken.id, revision: 1, payload: value(broken), error: 'image cover.webp: HTTP 404'}, null);
    await page.goto(origin);
    await review(page, short.id).click();
    await expect(page.getByLabel('Also make this the Featured project')).toBeVisible();
    await page.getByRole('button', {name: 'Prepare preview', exact: true}).click();
    await expect(page.locator('#notice')).toContainText('Description: The description needs at least 20 characters.');
    await expect(page.locator('#notice')).not.toContainText('{"');
    await expect(page.getByLabel('Description', {exact: true})).toBeFocused();
    await checks(page);
    await page.getByLabel('Description', {exact: true}).fill('A description that is now long enough to pass.');
    await page.locator('#prepare').focus(); await page.keyboard.press('Tab');
    await expect(page.locator('#also-feature')).toBeFocused();
    expect(await page.locator('#also-feature').evaluate(node => node.matches(':focus-visible') && getComputedStyle(node).outlineStyle)).toBe('solid');
    await page.keyboard.press('Space');
    await expect(page.getByLabel('Also make this the Featured project')).toBeChecked();
    await page.getByRole('button', {name: 'Prepare preview', exact: true}).click();
    await expect(page.locator('#notice')).toContainText('Private preparation queued');
    expect(prepared.at(-1).feature).toBe(true);
    await expect(page.locator('#notice')).toHaveText('', {timeout: 6000});
    expect(JSON.parse(x.db.prepare('SELECT payload FROM admin_reviews WHERE submission_id=? AND state=?').get(short.id, 'queued').payload).feature).toBe(true);

    const listed = page.locator('#review-list .review-item');
    await listed.filter({hasText: 'Plain listing'}).click();
    await checks(page);
    await page.getByRole('button', {name: 'Prepare again as Featured', exact: true}).click();
    await expect(page.locator('#notice')).toContainText('A new review is being prepared.');
    expect(prepared.at(-1)).toMatchObject({operation: 'submission', submission_id: plain.id, feature: true, replaces: 'f'.repeat(24)});
    expect(x.db.prepare('SELECT state FROM admin_reviews WHERE id=?').get('f'.repeat(24)).state).toBe('stale');

    await listed.filter({hasText: 'Image trouble'}).click();
    const status = page.locator('#publication-status');
    await expect(status).toContainText('An image could not be downloaded or no longer matches what was reviewed.');
    for (const name of ['Prepare without artwork', 'Try again', 'Back to the submission']) await expect(status.getByRole('button', {name, exact: true})).toBeVisible();
    await expect(status.getByRole('button', {name: 'Prepare without the Featured choice'})).toHaveCount(0);
    await checks(page);
    await status.getByRole('button', {name: 'Back to the submission', exact: true}).click();
    await expect(page.locator('#detail-title')).toHaveText('Review: Image trouble');
    await page.getByRole('button', {name: 'Publication reviews', exact: true}).click();
    await listed.filter({hasText: 'Image trouble'}).click();
    await status.getByRole('button', {name: 'Prepare without artwork', exact: true}).click();
    await expect(page.locator('#notice')).toContainText('A new review is being prepared.');
    expect(prepared.at(-1)).toMatchObject({submission_id: broken.id, omit_artwork: true, replaces: 'i'.repeat(24), feature: false});
    expect(errors).toEqual([]);
  } finally { done(); }
});

for (const width of [390, 1280]) test(`main-moved failure is prepared again once, keeping Featured, at ${width}px`, async ({page, context}) => {
  const {x, errors, prepared, done} = await setup(page, context, width);
  try {
    const moved = await x.seed({kind: 'add', title: 'Moved project', url: 'https://fiction.example.org/moved'});
    x.db.prepare("UPDATE submissions SET state='approved' WHERE id=?").run(moved.id);
    const pkg = {listing: {title: 'Moved project', description: moved.payload.description, approved_at: '2026-11-18T00:00:00Z'}};
    const old = await insert(x, 'm'.repeat(24), 'failed', {submission_id: moved.id, revision: 1, error: 'Main changed: abc is now def', payload: JSON.stringify({value: moved.payload, reason: '', transfer: false, omit_artwork: false, feature: true})}, pkg);
    x.db.prepare('UPDATE admin_reviews SET approved_digest=digest WHERE id=?').run(old.id);
    await page.goto(origin);
    await expect(page.locator('#notice')).toHaveText('The site changed after your approval, so a fresh preview is being prepared. Nothing is approved until you review it.');
    expect(prepared).toHaveLength(1);
    expect(prepared[0]).toMatchObject({submission_id: moved.id, feature: true, replaces: old.id});
    expect(prepared[0]).not.toHaveProperty('digest');
    const next = x.db.prepare("SELECT id,approved_digest FROM admin_reviews WHERE submission_id=? AND state='queued'").get(moved.id);
    expect(next.approved_digest).toBeNull();
    expect(x.db.prepare('SELECT state FROM admin_reviews WHERE id=?').get(old.id).state).toBe('stale');
    await x.processCall(next.id, '/claim', {action: 'prepare'});
    expect((await x.processCall(next.id, '/ready', {package: {project_id: LIVE, operation: 'submission', files: [], policy: {}, listing: {...pkg.listing, approved_at: '2026-11-19T00:00:00Z'}}})).status).toBe(200);
    await page.getByRole('button', {name: 'Publication reviews', exact: true}).click();
    await expect(page.getByText('No differences from what you approved before.', {exact: true})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Prepare again as Featured', exact: true})).toHaveCount(0);
    await checks(page);
    expect(prepared).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally { done(); }
});

for (const width of [390, 1280]) test(`stalled preparation, replaced reviews and a refused Featured choice at ${width}px`, async ({page, context}) => {
  const {x, errors, prepared, done} = await setup(page, context, width);
  try {
    const time = Math.floor(Date.now() / 1000);
    const known = await x.seed({kind: 'add', title: 'Already listed project', url: 'https://fiction.example.org/known'});
    await insert(x, 'k'.repeat(24), 'failed', {submission_id: known.id, revision: 1, error: 'Featured can only be chosen when approving a new listing', payload: JSON.stringify({value: known.payload, reason: '', transfer: false, omit_artwork: false, feature: true})}, null);
    await insert(x, 'n'.repeat(24), 'queued', {updated: time - 400, payload: '{"value":{"title":"Stalled project"}}'}, null);
    await insert(x, 'c'.repeat(24), 'pr-open', {pr: 44, approved_digest: 'x'}, {listing: {title: 'Checked project', description: 'A fictional project with a failing check.'}});
    x.state.pr = {number: 44, state: 'open', merged: false, mergeable_state: 'blocked', auto_merge: {merge_method: 'squash'}, head: {sha: 'b'.repeat(40)}, html_url: 'https://github.com/fictional/hub/pull/44'};
    x.state.checks = [{name: 'test', status: 'completed', conclusion: 'failure', html_url: 'https://github.com/fictional/hub/actions/runs/9'}];
    await page.goto(origin);
    const count = name => page.locator('#count-' + name + ' .count'), listed = page.locator('#review-list .review-item'), status = page.locator('#publication-status');
    await expect(count('attention')).toHaveText('3');
    await expect(count('publishing')).toHaveText('0');
    x.db.prepare("UPDATE admin_reviews SET state='stale',error='Main changed: abc is now def' WHERE id=?").run('c'.repeat(24));
    await page.locator('#count-attention').click();
    await expect(listed).toHaveCount(2);
    await expect(listed.filter({hasText: 'Checked project'})).toHaveCount(0);
    await expect(count('attention')).toHaveText('2');

    await listed.filter({hasText: 'Stalled project'}).click();
    await expect(status).toContainText('Preparation has not started after 5 minutes.');
    await expect(page.getByText('Preparation is underway', {exact: false})).toHaveCount(0);
    await checks(page);

    await listed.filter({hasText: 'Already listed project'}).click();
    await expect(status).toContainText('This could not finish. Try again, or discard it.');
    await expect(status).not.toContainText('Featured can only');
    for (const name of ['Try again', 'Prepare without the Featured choice']) await expect(status.getByRole('button', {name, exact: true})).toBeVisible();
    await checks(page);
    await status.getByRole('button', {name: 'Prepare without the Featured choice', exact: true}).click();
    await expect(page.locator('#notice')).toContainText('A new review is being prepared.');
    expect(prepared.at(-1)).toMatchObject({submission_id: known.id, feature: false, replaces: 'k'.repeat(24)});
    expect(Object.hasOwn(JSON.parse(x.db.prepare("SELECT payload FROM admin_reviews WHERE submission_id=? AND state='queued'").get(known.id).payload), 'feature')).toBe(false);

    await page.getByRole('button', {name: 'Publication reviews', exact: true}).click();
    await listed.filter({hasText: 'Checked project'}).click();
    await expect(page.locator('#review-detail')).toContainText('Status: Replaced');
    await expect(page.locator('#review-detail')).not.toContainText(/This review stopped|Main changed/);
    await checks(page);
    expect(errors).toEqual([]);
  } finally { done(); }
});
