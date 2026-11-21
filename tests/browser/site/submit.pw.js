import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync} from 'node:fs';

const SITE = /^http:\/\/127\.0\.0\.1:4324\//;
const API = 'http://127.0.0.1:4399';
const RECEIPT = 'Q'.repeat(43);
const CORS = {'Access-Control-Allow-Origin': 'http://127.0.0.1:4324', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST', Vary: 'Origin'};
test.use({baseURL: 'http://127.0.0.1:4324'});

async function mock(context, handler = {}) {
  const seen = [];
  await context.route('**/*', async route => {
    const request = route.request();
    const url = request.url();
    if (SITE.test(url)) return route.continue();
    if (url.startsWith('https://challenges.cloudflare.com/turnstile/')) return route.fulfill({contentType: 'text/javascript', body: 'window.turnstile={render:(el,opts)=>{const b=document.createElement("button");b.type="button";b.textContent="Verify human";b.onclick=()=>opts.callback("fixture-token-123456");el.append(b);return 1;},reset:()=>{}};'});
    if (url.startsWith(API)) {
      if (request.method() === 'OPTIONS') return route.fulfill({status: 204, headers: CORS});
      const path = new URL(url).pathname;
      const body = request.postDataJSON?.() ?? null;
      seen.push({path, body});
      const reply = handler[path]?.(body);
      if (reply) return route.fulfill({status: reply.status ?? 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(reply.body)});
      return route.fulfill({status: 404, headers: CORS, contentType: 'application/json', body: '{"error":"Not found"}'});
    }
    return route.abort();
  });
  return seen;
}
async function fillSuggestion(page, over = {}) {
  await page.getByLabel('Project address', {exact: false}).fill(over.url ?? 'https://forum.example.org/threads/new-hack.99/');
  await page.getByLabel('Project name', {exact: false}).fill(over.title ?? 'New Hack');
  await page.getByLabel('What is it?', {exact: false}).selectOption(over.category ?? 'rom-hack');
  await page.getByLabel('Short description', {exact: false}).fill(over.description ?? 'A new ROM hack discovered on a public forum thread.');
}
const send = page => page.getByRole('button', {name: 'Send submission'});
const axe = page => new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

test('suggesting a forum hack with no account reaches a receipt and the status page', async ({page, context}) => {
  const seen = await mock(context, {
    '/submissions': body => ({status: 201, body: {receipt: RECEIPT, status: 'received', message: 'We have your submission. A person will review it before anything is published.'}}),
    '/status': () => ({body: {status: 'in-review', kind: 'suggest', message: 'A person is reviewing your submission now.', note: null, updated_at: '2026-11-01T00:00:00.000Z'}})
  });
  await page.goto('/submit/');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Submit a project');
  await expect(page.getByLabel('Suggest a project')).toBeChecked();
  await fillSuggestion(page);
  await page.getByRole('button', {name: /Review your submission/}).click();
  await expect(page.getByRole('heading', {name: 'Check your submission'})).toBeFocused();
  await expect(page.locator('#review-list')).toContainText('https://forum.example.org/threads/new-hack.99/');
  await expect(page.locator('#review-list')).toContainText('Suggest a project');
  await expect(send(page)).toHaveAttribute('aria-disabled', 'true');
  await send(page).click({force: true});
  await expect(page.locator('#send-status')).toContainText('human check');
  await page.getByRole('button', {name: 'Verify human'}).click();
  await page.getByRole('button', {name: 'Send submission'}).click();
  await expect(page.getByRole('heading', {name: 'Submission received'})).toBeFocused();
  await expect(page.locator('#receipt-code')).toHaveText(RECEIPT);
  const sent = seen.find(item => item.path === '/submissions').body;
  expect(sent).toMatchObject({kind: 'suggest', url: 'https://forum.example.org/threads/new-hack.99/', title: 'New Hack', category: 'rom-hack', token: 'fixture-token-123456'});
  expect(JSON.stringify(sent)).not.toMatch(/github|email|password/i);
  await page.getByRole('link', {name: /Check status/}).click();
  await expect(page.getByRole('button', {name: /New Hack/})).toBeVisible();
  await page.getByRole('button', {name: /New Hack/}).click();
  await expect(page.locator('#status-name')).toHaveText('In review');
  await expect(page.getByRole('heading', {name: 'Status', exact: true})).toBeFocused();
});

test('errors are announced, tied to fields and fixable; layout passes accessibility checks', async ({page, context}) => {
  await mock(context);
  await page.goto('/submit/');
  expect((await axe(page)).violations).toEqual([]);
  await page.getByRole('button', {name: /Review your submission/}).click();
  const summary = page.locator('#error-summary');
  await expect(summary).toBeFocused();
  await expect(summary).toHaveAttribute('role', 'alert');
  await expect(summary.locator('li')).toHaveCount(4);
  await expect(page.locator('#f-url')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#e-url')).toContainText('Problem:');
  expect((await axe(page)).violations).toEqual([]);
  await summary.getByRole('link', {name: /Project name/}).click();
  await expect(page.locator('#f-title')).toBeFocused();
  await page.getByLabel('Project address', {exact: false}).fill('not an address');
  await page.getByLabel('Project name', {exact: false}).fill('X');
  await page.getByLabel('What is it?', {exact: false}).selectOption('tool');
  await page.getByLabel('Short description', {exact: false}).fill('short');
  await page.getByRole('button', {name: /Review your submission/}).click();
  await expect(page.locator('#e-url')).toContainText('https://');
  await expect(page.locator('#e-description')).toContainText('at least 20');
  await fillSuggestion(page);
  await page.getByRole('button', {name: /Review your submission/}).click();
  await expect(page.locator('#review')).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
  await page.getByRole('button', {name: 'Edit'}).click();
  await expect(page.locator('#submit-form')).toBeVisible();
  await expect(page.getByLabel('Suggest a project')).toBeFocused();
  await expect(page.getByLabel('Project name', {exact: false})).toHaveValue('New Hack');
});

test('already listed projects are detected from any address variant and steer to correction or claim', async ({page, context}) => {
  await mock(context);
  await page.goto('/submit/');
  await page.getByLabel('Project address', {exact: false}).fill('https://WWW.forum.example.org/threads/super-saiyan-frontier.4812?utm_source=x');
  const note = page.locator('#duplicate');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Super Saiyan Frontier');
  await page.getByLabel('Project name', {exact: false}).fill('Anything');
  await page.getByLabel('What is it?', {exact: false}).selectOption('rom-hack');
  await page.getByLabel('Short description', {exact: false}).fill('A description that is long enough to pass.');
  await page.getByRole('button', {name: /Review your submission/}).click();
  await expect(page.locator('#e-url')).toContainText('already listed');
  await expect(page.locator('#review')).toBeHidden();
  await note.getByRole('button', {name: 'Claim this listing'}).click();
  await expect(page.getByLabel('Claim a listing')).toBeChecked();
  await expect(page.getByLabel('Which listing?', {exact: false})).toHaveValue('ext-forumhack001');
});

test('correct and claim actions from a listing page are prefilled; claim shows a proof challenge', async ({page, context}) => {
  const seen = await mock(context, {'/submissions': body => ({status: 201, body: {receipt: RECEIPT, status: 'received', message: 'We have your submission.', ...(body.kind === 'claim' ? {challenge: 'loghub-claim-' + 'a'.repeat(24)} : {})}})});
  await page.goto('/projects/ext-forumhack001/');
  await page.getByRole('link', {name: 'Claim this listing'}).click();
  await expect(page.getByLabel('Which listing?', {exact: false})).toHaveValue('ext-forumhack001');
  await expect(page.locator('[data-field=note] .req')).toBeVisible();
  await expect(page.locator('#f-note')).toHaveAttribute('aria-required', 'true');
  await page.getByRole('button', {name: /Review your submission/}).click();
  await expect(page.locator('#e-note')).toContainText('connected');
  await page.getByLabel('How are you connected', {exact: false}).fill('I created this hack and run its forum thread.');
  await page.getByRole('button', {name: /Review your submission/}).click();
  await page.getByRole('button', {name: 'Verify human'}).click();
  await page.getByRole('button', {name: 'Send submission'}).click();
  await expect(page.locator('#claim-challenge')).toHaveText('loghub-claim-' + 'a'.repeat(24));
  expect(seen.find(item => item.path === '/submissions').body).toMatchObject({kind: 'claim', listing_id: 'ext-forumhack001'});
  await page.goto('/projects/ext-forumhack001/');
  await page.getByRole('link', {name: 'Correct this listing'}).click();
  await expect(page.getByLabel('Correct a listing')).toBeChecked();
  await expect(page.locator('#current')).toContainText('Super Saiyan Frontier');
  await expect(page.locator('#f-category option').first()).toHaveText('Keep as listed');
});

test('server-side failures keep the visitor answers and explain what to do', async ({page, context}) => {
  let mode = 429;
  await mock(context, {'/submissions': () => mode === 'dup' ? {status: 409, body: {error: 'This project is already listed.', duplicate: {id: 'ext-forumhack001', title: 'Super Saiyan Frontier'}}} : mode === 422 ? {status: 422, body: {error: 'Please fix', errors: {title: 'Add a project name.'}}} : {status: mode, body: {error: mode === 503 ? 'Submissions are unavailable' : 'x'}}});
  await page.goto('/submit/');
  await fillSuggestion(page);
  await page.getByRole('button', {name: /Review your submission/}).click();
  await page.getByRole('button', {name: 'Verify human'}).click();
  await page.getByRole('button', {name: 'Send submission'}).click();
  await expect(page.locator('#send-status')).toContainText('wait up to an hour');
  await expect(send(page)).toBeFocused();
  await expect(send(page)).toHaveAttribute('aria-disabled', 'true');
  mode = 503;
  await send(page).click({force: true});
  await expect(page.locator('#send-status')).toContainText('complete the human check');
  await page.getByRole('button', {name: 'Verify human'}).click();
  await page.getByRole('button', {name: 'Send submission'}).click();
  await expect(page.locator('#send-status')).toContainText('not open right now');
  mode = 'dup';
  await page.getByRole('button', {name: 'Verify human'}).click();
  await page.getByRole('button', {name: 'Send submission'}).click();
  await expect(page.locator('#send-status')).toContainText('already listed as Super Saiyan Frontier');
  await expect(send(page)).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', {name: 'Edit'}).click();
  await expect(page.locator('#duplicate')).toContainText('Super Saiyan Frontier');
  await page.getByLabel('Project address', {exact: false}).fill('https://forum.example.org/threads/another-hack.100/');
  await page.getByRole('button', {name: /Review your submission/}).click();
  mode = 422;
  await page.getByRole('button', {name: 'Verify human'}).click();
  await send(page).click();
  await expect(page.locator('#error-summary')).toBeFocused();
  await expect(page.getByLabel('Project name', {exact: false})).toHaveValue('New Hack');
});

test('status page handles bad receipts, unknown receipts and requested changes', async ({page, context}) => {
  let state = 'needs-changes';
  const seen = await mock(context, {
    '/status': body => body.receipt === 'U'.repeat(43) ? {status: 404, body: {error: 'We could not find that receipt.'}} : {body: {status: state, kind: 'suggest', message: 'We need a little more information before we can continue.', note: 'Please add the creator name.', updated_at: '2026-11-01T00:00:00.000Z'}},
    '/revise': body => { state = 'received'; return {body: {status: 'received', message: 'ok'}}; }
  });
  await page.goto('/submit/status/');
  expect((await axe(page)).violations).toEqual([]);
  await page.getByLabel('Receipt', {exact: false}).fill('nope');
  await page.getByRole('button', {name: 'Check status'}).click();
  await expect(page.locator('#e-receipt')).toContainText('does not look like a receipt');
  await page.getByLabel('Receipt', {exact: false}).fill('U'.repeat(43));
  await page.getByRole('button', {name: 'Check status'}).click();
  await expect(page.locator('#e-receipt')).toContainText('could not find');
  await page.getByLabel('Receipt', {exact: false}).fill(RECEIPT);
  await page.getByRole('button', {name: 'Check status'}).click();
  await expect(page.locator('#status-name')).toHaveText('Needs changes');
  await expect(page.locator('#status-note')).toContainText('Please add the creator name.');
  await expect(page.locator('#status-glyph')).toHaveText('!');
  await page.getByLabel('Your reply').fill('The creator is Sir Hacker.');
  await page.getByRole('button', {name: 'Send changes'}).click();
  await expect(page.locator('#status-name')).toHaveText('Received');
  expect(seen.filter(item => item.path === '/revise')[0].body).toEqual({receipt: RECEIPT, changes: {note: 'The creator is Sir Hacker.'}});
});

test('mobile layout has no horizontal scroll and stays accessible', async ({page, context}) => {
  await mock(context);
  await page.setViewportSize({width: 390, height: 800});
  for (const path of ['/submit/', '/submit/status/', '/projects/ext-forumhack001/']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect((await axe(page)).violations).toEqual([]);
  }
  await page.goto('/submit/');
  await page.getByText('Download page and community links (optional)').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

for (const width of [1280, 390]) {
  test(`at ${width} px the review shows readable choices and the receipt explains where replies appear`, async ({page, context}) => {
    await mock(context, {'/submissions': body => ({status: 201, body: {receipt: RECEIPT, status: 'received', message: 'We have your submission.', ...(body.kind === 'claim' ? {challenge: 'loghub-claim-' + 'a'.repeat(24)} : {})}})});
    await page.setViewportSize({width, height: 900});
    await page.goto('/submit/');
    await expect(page.locator('label[for="f-artwork"]')).toHaveText('Images');
    await expect(page.locator('#h-artwork')).toHaveText(/^We cannot take uploads\. Paste links to PNG, JPG or WebP pictures, one per line, up to four\./);
    const summary = page.locator('#more > summary');
    const marker = () => summary.evaluate(el => getComputedStyle(el, '::before').content);
    const closed = await marker();
    expect(closed).toContain('▸');
    await summary.click();
    const opened = await marker();
    expect(opened).toContain('▾');
    expect(opened).not.toEqual(closed);
    await fillSuggestion(page);
    await page.getByLabel('Base game').selectOption('legacy-of-goku-2');
    await page.getByLabel('Status', {exact: true}).selectOption('in-development');
    await page.getByRole('button', {name: /Review your submission/}).click();
    const list = page.locator('#review-list');
    await expect(list.locator('div', {has: page.locator('dt', {hasText: 'What is it'})}).locator('dd')).toHaveText('ROM hack');
    await expect(list.locator('div', {has: page.locator('dt', {hasText: 'Base game'})}).locator('dd')).toHaveText('Legacy of Goku II');
    await expect(list.locator('div', {has: page.locator('dt', {hasText: 'Status'})}).locator('dd')).toHaveText('In development');
    await expect(list).not.toContainText('rom-hack');
    await expect(list).not.toContainText('legacy-of-goku-2');
    await expect(list).not.toContainText('in-development');
    expect((await axe(page)).violations).toEqual([]);
    await page.getByRole('button', {name: 'Verify human'}).click();
    await page.getByRole('button', {name: 'Send submission'}).click();
    const hint = page.locator('#receipt > p.hint').first();
    await expect(hint).toContainText('only way to see replies from the moderators');
    await expect(hint).toContainText('we cannot recover it for you');
    expect((await axe(page)).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.goto('/projects/ext-forumhack001/');
    await page.getByRole('link', {name: 'Claim this listing'}).click();
    await page.getByLabel('How are you connected', {exact: false}).fill('I created this hack and run its forum thread.');
    await page.getByRole('button', {name: /Review your submission/}).click();
    await page.getByRole('button', {name: 'Verify human'}).click();
    await page.getByRole('button', {name: 'Send submission'}).click();
    await expect(page.locator('#claim-steps p.hint')).toHaveText(/a moderator will ask you another way on the status page\.$/);
  });

  test(`at ${width} px the status page says replies appear there and relabels an answered request`, async ({page, context}) => {
    let answered = false;
    await mock(context, {'/status': () => ({body: {status: answered ? 'received' : 'needs-changes', kind: 'suggest', message: answered ? 'We have your reply. A person will read it. Check this page again for our answer.' : 'We need a little more information before we can continue.', note: 'Please add the creator name.', updated_at: '2026-11-01T00:00:00.000Z', ...(answered ? {answered: true} : {})}}), '/revise': () => { answered = true; return {body: {status: 'received', message: 'ok'}}; }});
    await page.setViewportSize({width, height: 900});
    await page.goto('/submit/status/');
    await expect(page.locator('.submit-heading p')).toContainText('Replies from the moderators appear on this page.');
    await page.getByLabel('Receipt', {exact: false}).fill(RECEIPT);
    await page.getByRole('button', {name: 'Check status'}).click();
    await expect(page.locator('#status-note')).toHaveText('Message from the moderators: Please add the creator name.');
    const summary = page.locator('#revise-form .more > summary');
    const closed = await summary.evaluate(el => getComputedStyle(el, '::before').content);
    expect(closed).toContain('▸');
    await summary.click();
    expect(await summary.evaluate(el => getComputedStyle(el, '::before').content)).toContain('▾');
    expect((await axe(page)).violations).toEqual([]);
    await page.getByLabel('Your reply').fill('The creator is Sir Hacker.');
    await page.getByRole('button', {name: 'Send changes'}).click();
    await expect(page.locator('#status-note')).toHaveText('You replied. Our earlier message: Please add the creator name.');
    await expect(page.locator('#status-message')).toHaveText('We have your reply. A person will read it. Check this page again for our answer.');
    await expect(page.locator('#revise-form')).toBeHidden();
    expect((await axe(page)).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test('keyboard users can choose an action, fill the form and reach review', async ({page, context}) => {
  await mock(context);
  await page.goto('/submit/');
  await page.getByLabel('Suggest a project').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Add my project')).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(page.locator('#f-url')).toBeFocused();
  await page.keyboard.type('https://toolkit2.example.net/');
  await page.keyboard.press('Tab');
  await expect(page.locator('#f-no_page')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#f-url')).toBeDisabled();
  await expect(page.locator('[data-field=url] .req')).toBeHidden();
  await expect(page.locator('#f-url')).not.toHaveAttribute('aria-required', 'true');
});

test('external listings use accurate labels and never claim to be repositories', async ({page, context}) => {
  await mock(context);
  await page.goto('/');
  const forum = page.locator('[data-id="ext-forumhack001"]');
  await expect(forum.getByRole('link', {name: 'Download Patch for Super Saiyan Frontier'})).toHaveAttribute('href', 'https://files.example.org/frontier.bps');
  await expect(forum.getByRole('link', {name: 'Visit Super Saiyan Frontier project page'})).toHaveAttribute('href', 'https://forum.example.org/threads/super-saiyan-frontier.4812/');
  await expect(forum.getByRole('link', {name: /repository/i})).toHaveCount(0);
  await expect(page.locator('[data-id="fixture-0"]').getByRole('link', {name: 'View Saiyan Legacy Reborn repository'})).toHaveCount(1);
  await page.goto('/projects/ext-forumhack001/');
  await expect(page.getByRole('link', {name: 'Download Patch', exact: true})).toHaveAttribute('href', 'https://files.example.org/frontier.bps');
  await expect(page.getByRole('link', {name: 'Visit Project', exact: true})).toBeVisible();
  await expect(page.getByRole('link', {name: 'View Repository'})).toHaveCount(0);
  await expect(page.locator('.project-information')).toContainText('Community forum');
  await expect(page.locator('.project-information')).toContainText('not yet claimed');
  await expect(page.locator('.external-note')).toHaveCount(0);
  await page.goto('/projects/ext-sitehack0002/');
  await expect(page.locator('.project-information')).toContainText('Creator claim verified');
  await expect(page.getByRole('link', {name: 'Claim this listing'})).toHaveCount(0);
  await expect(page.getByRole('link', {name: 'Download Patch'})).toHaveCount(0);
  await page.goto('/projects/fixture-0/');
  await expect(page.getByRole('link', {name: 'View Repository', exact: true})).toBeVisible();
  await expect(page.getByRole('link', {name: 'Download on GitHub', exact: true})).toBeVisible();
});

test('primary navigation points at the native submit page', async ({page, context}) => {
  await mock(context);
  await page.goto('/');
  await expect(page.getByRole('navigation', {name: 'Main navigation'}).getByRole('link', {name: 'Submit'})).toHaveAttribute('href', '/submit/');
});

const received = () => ({status: 201, body: {receipt: RECEIPT, status: 'received', message: 'We have your submission.'}});
const review = page => page.getByRole('button', {name: /Review your submission/});

test('addresses typed without https are completed and a bad address says what is wrong', async ({page, context}) => {
  await mock(context);
  await page.goto('/submit/');
  const url = page.getByLabel('Project address', {exact: false});
  await url.fill('forum.example.org/threads/new-hack.99/');
  await url.blur();
  await expect(url).toHaveValue('https://forum.example.org/threads/new-hack.99/');
  await url.fill('http://forum.example.org/threads/new-hack.99/');
  await url.blur();
  await expect(url).toHaveValue('https://forum.example.org/threads/new-hack.99/');
  await url.fill('https://forum.example.org:8443/x');
  await review(page).click();
  await expect(page.locator('#e-url')).toContainText('without a password or port');
  await url.fill('https://forum.example.org/threads/new-hack.99/');
  await expect(page.locator('#e-url')).toBeHidden();
  await expect(page.locator('#error-summary li')).toHaveCount(3);
  await url.fill('www.forum.example.org/threads/super-saiyan-frontier.4812');
  await expect(page.locator('#duplicate')).toContainText('Super Saiyan Frontier');
});

test('a reload keeps what was typed and Start over clears it', async ({page, context}) => {
  await mock(context);
  await page.goto('/submit/');
  await expect(page.locator('#draft-note')).toBeHidden();
  await fillSuggestion(page);
  await page.getByLabel('Base game').selectOption('buus-fury');
  await page.reload();
  await expect(page.getByLabel('Project name', {exact: false})).toHaveValue('New Hack');
  await expect(page.getByLabel('Base game')).toHaveValue('buus-fury');
  await expect(page.locator('#draft-note')).toBeVisible();
  await page.getByRole('button', {name: 'Start over'}).click();
  await expect(page.getByLabel('Project name', {exact: false})).toHaveValue('');
  await expect(page.locator('#draft-note')).toBeHidden();
  await page.reload();
  await expect(page.getByLabel('Project name', {exact: false})).toHaveValue('');
});

test('a correction shows the listing as it is and sends only what changed', async ({page, context}) => {
  const seen = await mock(context, {'/submissions': received});
  await page.goto('/submit/?action=correct&listing=ext-forumhack001');
  await expect(page.locator('#current')).toContainText('Super Saiyan Frontier');
  await expect(page.locator('#current')).toContainText('Legacy of Goku II');
  await expect(page.locator('#current')).toContainText('https://forum.example.org/threads/super-saiyan-frontier.4812/');
  await expect(page.locator('[data-field=title] .req')).toBeHidden();
  await page.getByLabel('Project name', {exact: false}).fill('Super Saiyan Frontier');
  await page.getByLabel('Status', {exact: true}).selectOption('released');
  await page.getByLabel('Creator or team').fill('Sir Hacker');
  await review(page).click();
  await expect(page.locator('#review-list')).toContainText('Sir Hacker');
  await expect(page.locator('#review-list dt')).toHaveText(['Action', 'Listing', 'Creator or team']);
  await page.getByRole('button', {name: 'Verify human'}).click();
  await send(page).click();
  await expect(page.locator('#receipt-code')).toHaveText(RECEIPT);
  expect(seen.find(item => item.path === '/submissions').body).toEqual({kind: 'correct', listing_id: 'ext-forumhack001', url: '', creator: 'Sir Hacker', token: 'fixture-token-123456', company: ''});
});

test('answers typed under another action are not sent with a claim, and Correct is never blocked by a hidden field', async ({page, context}) => {
  const seen = await mock(context, {'/submissions': received});
  await page.goto('/submit/');
  await page.getByLabel('Project address', {exact: false}).fill('https://forum.example.org/threads/super-saiyan-frontier.4812/');
  await expect(page.locator('#duplicate')).toBeVisible();
  await page.getByLabel('Project name', {exact: false}).fill('Anything');
  await page.getByLabel('Correct a listing').check();
  await page.getByLabel('Which listing?', {exact: false}).selectOption('ext-forumhack001');
  await page.getByLabel('What should change?').fill('The download link no longer works.');
  await review(page).click();
  await expect(page.locator('#review')).toBeVisible();
  await page.getByRole('button', {name: 'Edit'}).click();
  await page.getByLabel('Claim a listing').check();
  await page.getByLabel('How are you connected', {exact: false}).fill('I created this hack and run its forum thread.');
  await review(page).click();
  await expect(page.locator('#review-list')).not.toContainText('Anything');
  await page.getByRole('button', {name: 'Verify human'}).click();
  await send(page).click();
  await expect(page.locator('#receipt-code')).toHaveText(RECEIPT);
  expect(seen.find(item => item.path === '/submissions').body).toEqual({kind: 'claim', listing_id: 'ext-forumhack001', url: '', note: 'I created this hack and run its forum thread.', token: 'fixture-token-123456', company: ''});
});

test('the receipt can be saved as a file and its status link opens the status directly', async ({page, context}) => {
  await mock(context, {'/submissions': received, '/status': () => ({body: {status: 'approved', kind: 'suggest', message: 'Approved. Publication is pending the protected review and deployment checks.', note: null, updated_at: '2026-11-01T00:00:00.000Z'}})});
  await page.goto('/submit/');
  await fillSuggestion(page);
  await review(page).click();
  await expect(page.locator('#steps li[aria-current]')).toHaveText('2Check');
  await page.getByRole('button', {name: 'Verify human'}).click();
  await send(page).click();
  await expect(page.locator('#steps li[aria-current]')).toHaveText('3Sent');
  const download = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Save receipt as a file'}).click();
  const saved = readFileSync(await (await download).path(), 'utf8');
  expect(saved).toContain('Receipt: ' + RECEIPT);
  expect(saved).toContain('Project: New Hack');
  expect(saved).toContain('http://127.0.0.1:4324/submit/status/');
  await expect(page.locator('#receipt-note')).toHaveText('Saved to your downloads.');
  await page.getByRole('link', {name: /Check status/}).click();
  await expect(page.locator('#status-name')).toHaveText('Approved');
  await expect(page.locator('#status-message')).toHaveText('Approved. It will appear in the directory soon.');
  expect(page.url()).toBe('http://127.0.0.1:4324/submit/status/');
  await page.goto('/submit/');
  await expect(page.getByLabel('Project name', {exact: false})).toHaveValue('');
  await expect(page.locator('#draft-note')).toBeHidden();
});

test('a saved receipt that is no longer stored is explained and removed', async ({page, context}) => {
  await mock(context, {'/status': () => ({status: 404, body: {error: 'We could not find that receipt.'}})});
  await page.goto('/submit/status/');
  await page.evaluate(receipt => localStorage.setItem('loghub-submissions', JSON.stringify([{receipt, title: 'Old Hack', kind: 'suggest', at: 1}, {receipt: 'Z'.repeat(43), title: 'Other Hack', kind: 'suggest', at: 2}])), RECEIPT);
  await page.reload();
  await page.getByRole('button', {name: /Old Hack/}).click();
  await expect(page.locator('#status-error')).toContainText('no longer stored');
  await expect(page.getByRole('button', {name: /Old Hack/})).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('loghub-submissions')).length)).toBe(1);
});

test('status errors move focus to the field and reply errors open the folded details', async ({page, context}) => {
  await mock(context, {'/status': () => ({body: {status: 'needs-changes', kind: 'suggest', message: 'We need a little more information before we can continue.', note: 'Please fix the name.', updated_at: '2026-11-01T00:00:00.000Z'}}), '/revise': () => ({status: 422, body: {error: 'Please fix', errors: {title: 'Add a project name.'}}})});
  await page.goto('/submit/status/');
  await expect(page.locator('#f-receipt')).toHaveAttribute('aria-required', 'true');
  await page.getByLabel('Receipt', {exact: false}).fill('nope');
  await page.getByRole('button', {name: 'Check status'}).click();
  await expect(page.locator('#f-receipt')).toBeFocused();
  await page.getByLabel('Receipt', {exact: false}).fill(RECEIPT);
  await page.getByRole('button', {name: 'Check status'}).click();
  await page.getByLabel('Your reply').fill('Here it is.');
  await page.getByRole('button', {name: 'Send changes'}).click();
  await expect(page.locator('#r-title')).toBeFocused();
  await expect(page.locator('#r-title')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#e-title')).toContainText('Add a project name.');
});

test('image links are tidied, limited to four and can be previewed', async ({page, context}) => {
  await mock(context);
  await page.goto('/submit/');
  const art = page.locator('#f-artwork');
  await art.fill('github.com/o/r/blob/main/shot.png\nhttps://img.example.org/missing.png');
  await art.blur();
  await expect(art).toHaveValue('https://raw.githubusercontent.com/o/r/main/shot.png\nhttps://img.example.org/missing.png');
  await page.getByRole('button', {name: 'Preview images'}).click();
  await expect(page.locator('#art-preview li')).toHaveCount(2);
  await expect(page.locator('#art-preview li').first()).toContainText('could not load');
  await fillSuggestion(page);
  await art.fill([1, 2, 3, 4, 5].map(n => 'https://img.example.org/' + n + '.png').join('\n'));
  await review(page).click();
  await expect(page.locator('#e-artwork')).toContainText('up to four');
});

test('required fields say so to assistive technology and placeholder text is readable', async ({page, context}) => {
  await mock(context);
  await page.goto('/submit/');
  for (const id of ['f-url', 'f-title', 'f-category', 'f-description']) await expect(page.locator('#' + id)).toHaveAttribute('aria-required', 'true');
  await expect(page.locator('#f-creator')).not.toHaveAttribute('aria-required', 'true');
  await expect(page.getByRole('textbox', {name: 'Project address', exact: true})).toHaveCount(1);
  const ratio = await page.locator('#f-url').evaluate(el => {
    const channels = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    const light = value => { const [r, g, b] = channels(value).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
    const a = light(getComputedStyle(el, '::placeholder').color), b = light(getComputedStyle(el).backgroundColor);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test('no page sends visitors to the site\'s own repository and listing repositories still work', async ({page, context}) => {
  await mock(context);
  for (const path of ['/', '/submit/', '/submit/status/', '/how-to-patch/', '/projects/fixture-0/', '/projects/ext-forumhack001/']) {
    await page.goto(path);
    await expect(page.locator('a[href*="siruiusamory-cmyk/legacy-of-goku-hub"]')).toHaveCount(0);
    await expect(page.getByText(/Contribute on GitHub|GitHub route/)).toHaveCount(0);
  }
  await page.goto('/');
  const nav = page.getByRole('navigation', {name: 'Main navigation'});
  await expect(nav.getByRole('link')).toHaveText(['Projects', 'Submit', 'Discord']);
  await expect(page.locator('footer').getByRole('link', {name: 'Check a submission'})).toHaveAttribute('href', '/submit/status/');
  await expect(page.locator('footer').getByRole('link', {name: 'Request a correction or removal'})).toHaveAttribute('href', '/submit/?action=correct');
  await page.goto('/projects/fixture-0/');
  await expect(page.getByRole('link', {name: 'View Repository', exact: true})).toHaveAttribute('href', /^https:\/\/github\.com\//);
});

test('a reload keeps the chosen action, and a link followed later wins over an older draft', async ({page, context}) => {
  await mock(context);
  await page.goto('/submit/?action=claim&listing=ext-forumhack001');
  await page.getByLabel('Correct a listing').check();
  await page.getByLabel('What should change?').fill('The download link no longer works.');
  await page.reload();
  await expect(page.getByLabel('Correct a listing')).toBeChecked();
  await expect(page.getByLabel('What should change?')).toHaveValue('The download link no longer works.');
  await page.goto('/submit/?action=claim&listing=ext-forumhack001&from=listing');
  await expect(page.getByLabel('Claim a listing')).toBeChecked();
  await expect(page.getByLabel('Which listing?', {exact: false})).toHaveValue('ext-forumhack001');
});

test('a file name is not accepted as an address and link errors name the right row', async ({page, context}) => {
  await mock(context);
  await page.goto('/submit/');
  await fillSuggestion(page);
  await page.getByLabel('Project address', {exact: false}).fill('goku.gba');
  await page.getByText('Download page and community links (optional)').click();
  await page.locator('#f-link-url-1').fill('https://bad.example.org:8080/x');
  await page.locator('#f-artwork').fill('https://img.example.org/1.png\n\nhttps://img.example.org/2.gif');
  await review(page).click();
  await expect(page.locator('#e-url')).toContainText('not to a game file');
  await expect(page.locator('#error-summary')).toContainText('Link 2:');
  await expect(page.locator('#error-summary')).toContainText('Line 3:');
});

test('the Submit tab is the highlighted tab on the submission pages', async ({page, context}) => {
  await mock(context);
  for (const path of ['/submit/', '/submit/status/']) {
    await page.goto(path);
    await expect(page.locator('.desktop-nav a.active')).toHaveText('Submit');
  }
  await page.goto('/');
  await expect(page.locator('.desktop-nav a.active')).toHaveText('Projects');
});

test('a second press of Send changes does not send the reply twice', async ({page, context}) => {
  let state = 'needs-changes';
  const seen = await mock(context, {'/status': () => ({body: {status: state, kind: 'suggest', message: 'm', note: 'Please add the creator name.', updated_at: '2026-11-01T00:00:00.000Z'}}), '/revise': () => { state = 'received'; return {body: {status: 'received', message: 'ok'}}; }});
  await page.goto('/submit/status/#' + RECEIPT);
  await page.getByLabel('Your reply').fill('The creator is Sir Hacker.');
  await page.locator('#revise-form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  await expect(page.locator('#status-name')).toHaveText('Received');
  expect(seen.filter(item => item.path === '/revise')).toHaveLength(1);
});

test('without JavaScript both pages say what to do and nothing can be sent', async ({browser}) => {
  const context = await browser.newContext({javaScriptEnabled: false, baseURL: 'http://127.0.0.1:4324'});
  const page = await context.newPage();
  await page.goto('/submit/status/');
  expect(await page.locator('main').innerText()).toContain('Checking a submission needs JavaScript.');
  await expect(page.getByRole('button', {name: 'Check status'})).toBeDisabled();
  await page.goto('/submit/');
  expect(await page.locator('main').innerText()).toContain('This form needs JavaScript.');
  await expect(page.locator('#script-note')).toBeHidden();
  await expect(page.getByRole('button', {name: /Review your submission/})).toBeDisabled();
  await context.close();
});

test('with submissions switched off the form says so and points to Discord', async ({page}) => {
  await page.goto('http://127.0.0.1:4321/submit/?action=correct');
  const note = page.locator('.availability-note').first();
  await expect(note).toContainText('Submissions are not open yet.');
  await expect(note.getByRole('link', {name: 'message us on Discord'})).toHaveAttribute('href', /^https:\/\/discord\.gg\//);
});
