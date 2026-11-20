import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../tools/admin/test-fixture.js';
import {digest} from '../intake/worker.js';

const main = 'a'.repeat(40), now = () => Math.floor(Date.now() / 1000), P = 'ext-abcdefghijkl';
async function setup(t) { const x = await fixture(); const original = globalThis.fetch; globalThis.fetch = x.fetcher; t.after(() => { globalThis.fetch = original; x.db.close(); x.ratings.close(); }); await x.login(); return x; }
const data = async res => { assert.equal(res.ok, true, await res.clone().text()); return res.json(); };
const stage = async (x, id) => data(await x.call('/api/publication?id=' + id));
const actions = status => (status.actions || []).map(a => a.action);
let serial = 0;
async function review(x, state, more = {}) {
  const id = String(++serial).padStart(24, 'q'), pkg = JSON.stringify({project_id: P, files: []}), hash = await digest(pkg);
  const row = {id, submission_id: null, revision: null, project_id: P, operation: 'submission', payload: '{"value":{}}', state, version: 1, package: pkg, digest: hash, approved_digest: hash, pr: null, error: null, created: now(), updated: now(), dispatched: null, ...more};
  x.db.prepare('INSERT INTO admin_reviews(id,submission_id,revision,project_id,operation,payload,state,version,package,digest,approved_digest,pr,error,created,updated,dispatched) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(row));
  return row;
}
const reviewRow = (x, id) => x.db.prepare('SELECT * FROM admin_reviews WHERE id=?').get(id);
const reviewCount = x => x.db.prepare('SELECT count(*) n FROM admin_reviews').get().n;
const setState = (x, id, state) => x.db.prepare('UPDATE submissions SET state=? WHERE id=?').run(state, id);
const openPR = more => ({number: 42, state: 'open', merged: false, mergeable_state: 'blocked', auto_merge: {merge_method: 'squash'}, head: {sha: main}, html_url: 'https://github.com/fictional/hub/pull/42', ...more});
const deployed = x => { x.state.manifest = {build_commit: main}; x.state.runs = [{id: 1, head_sha: main, event: 'push', status: 'completed', conclusion: 'success', run_attempt: 1}]; x.state.jobs = ['synchronize', 'backup', 'anchor', 'publish', 'website', 'deploy-website'].map(name => ({name, conclusion: 'success'})); };
async function moderator(x) {
  x.env.ADMIN_EMAILS += ',moderator@example.org';
  const headers = {'Cf-Access-Jwt-Assertion': await x.jwt({sub: 'moderator', email: 'moderator@example.org'})};
  const signed = await x.call('/api/login', {}, headers), session = await signed.json();
  return {...headers, Cookie: signed.headers.get('Set-Cookie').split(';')[0], 'X-CSRF-Token': session.csrf};
}

test('summary counts and inbox filters follow the stored state exactly', async t => {
  const x = await setup(t);
  const received = await x.seed({title: 'Received', url: 'https://fiction.example.org/a'}), reviewing = await x.seed({title: 'Reviewing', url: 'https://fiction.example.org/b'});
  const waiting = await x.seed({title: 'Waiting', url: 'https://fiction.example.org/c'}), approved = await x.seed({title: 'Approved', url: 'https://fiction.example.org/d'});
  const rejected = await x.seed({title: 'Rejected', url: 'https://fiction.example.org/e'}), published = await x.seed({title: 'Published', url: 'https://fiction.example.org/f'});
  setState(x, reviewing.id, 'in-review'); setState(x, waiting.id, 'needs-changes'); setState(x, approved.id, 'approved'); setState(x, rejected.id, 'rejected'); setState(x, published.id, 'published');
  await review(x, 'ready', {submission_id: received.id, revision: 1, approved_digest: null});
  await review(x, 'approved', {dispatched: now()});
  await review(x, 'failed', {error: 'Something broke'});
  assert.deepEqual(await data(await x.call('/api/summary')), {new: 2, waiting: 1, ready: 1, publishing: 1, attention: 1});
  const ids = async state => (await data(await x.call('/api/queue?state=' + state))).items.map(i => i.id).sort((a, b) => a - b);
  assert.deepEqual(await ids('new'), [received.id, reviewing.id]);
  assert.deepEqual(await ids('open'), [received.id, reviewing.id, waiting.id, approved.id]);
  assert.deepEqual(await ids('needs-changes'), [waiting.id]);
  assert.deepEqual(await ids(''), [received.id, reviewing.id, waiting.id, approved.id, rejected.id, published.id]);
  assert.deepEqual(await ids('approved%27%20OR%201=1'), []);
  assert.deepEqual((await data(await x.call('/api/queue?state=open&all=1'))).ids, [received.id, reviewing.id, waiting.id, approved.id]);
  assert.deepEqual((await data(await x.call('/api/queue?state=new&all=1&q=Reviewing'))).ids, [reviewing.id]);
  const page = await data(await x.call('/api/queue?state=open'));
  assert.equal(page.total, 4);
  assert.equal(page.items.find(i => i.id === received.id).review.bucket, 'ready');
  assert.equal(page.items.find(i => i.id === waiting.id).review, null);
});

test('every review carries the bucket the summary counted it in, at each stalled boundary', async t => {
  const x = await setup(t), t0 = now();
  const cases = [
    ['queued', {updated: t0 - 290}, null], ['queued', {updated: t0 - 300}, 'attention'],
    ['processing', {updated: t0 - 890}, null], ['processing', {updated: t0 - 900}, 'attention'],
    ['ready', {}, 'ready'], ['failed', {}, 'attention'], ['dispatch-failed', {}, 'attention'],
    ['approved', {}, 'publishing'], ['approved', {error: 'Publication could not start.'}, 'attention'],
    ['approved', {dispatched: t0 - 290}, 'publishing'], ['approved', {dispatched: t0 - 300}, 'attention'],
    ['publishing', {updated: t0 - 590}, 'publishing'], ['publishing', {updated: t0 - 600}, 'attention'],
    ['pr-open', {pr: 1}, 'publishing'], ['pr-open', {pr: 1, error: 'Automatic merge was not turned on.'}, 'attention'],
    ['stale', {}, null], ['published', {}, null], ['discarded', {}, null], ['expired', {}, null]];
  const made = [];
  for (const [state, more, bucket] of cases) made.push([(await review(x, state, more)).id, bucket]);
  const items = (await data(await x.call('/api/reviews'))).items;
  for (const [id, bucket] of made) assert.equal(items.find(i => i.id === id).bucket, bucket, id);
  const summary = await data(await x.call('/api/summary'));
  for (const bucket of ['ready', 'publishing', 'attention']) assert.equal(summary[bucket], items.filter(i => i.bucket === bucket).length, bucket);
  assert.deepEqual(summary, {new: 0, waiting: 0, ready: 1, publishing: 4, attention: 8});
});

test('prepare reports field errors as fields and owner-facing messages read plainly', async t => {
  const x = await setup(t), sub = await x.seed();
  const short = await x.call('/api/prepare', {operation: 'submission', submission_id: sub.id, revision: 1, payload: {...sub.payload, description: 'Too short'}});
  assert.equal(short.status, 422);
  const body = await short.json();
  assert.equal(body.error, 'Some details need fixing.'); assert.equal(body.error.includes('{"'), false);
  assert.equal(typeof body.fields.description, 'string'); assert.deepEqual(Object.keys(body.fields), ['description']);
  assert.equal(reviewCount(x), 0);
  const marked = await x.call('/api/prepare', {operation: 'submission', submission_id: sub.id, revision: 1, payload: sub.payload, reason: 'a <b> tag'});
  assert.equal(marked.status, 400); assert.deepEqual(await marked.json(), {error: 'Messages cannot contain < or > or control characters.'});
  const other = await x.call('/api/decision', {id: sub.id, revision: 1, state: 'in-review', public_note: 'bell\x07here'});
  assert.equal((await other.json()).error, 'Messages cannot contain < or > or control characters.');
  assert.equal(Object.hasOwn(await (await x.call('/api/approve', {id: 'z'.repeat(24)})).json(), 'fields'), false);
  const ready = await review(x, 'ready', {submission_id: sub.id, revision: 1, approved_digest: null});
  assert.deepEqual(await (await x.call('/api/approve', {id: ready.id, version: 1, digest: ready.digest, content_reviewed: false})).json(), {error: 'Tick the review boxes for this exact preview first.'});
  x.db.prepare('UPDATE submissions SET revision=2 WHERE id=?').run(sub.id);
  assert.deepEqual(await (await x.call('/api/approve', {id: ready.id, version: 1, digest: ready.digest, content_reviewed: true})).json(), {error: 'The submission changed. Prepare it again.'});
});

test('preparing with replaces stales only the same replaceable review and never carries an approval', async t => {
  const x = await setup(t);
  const old = await review(x, 'failed', {operation: 'edit', error: 'Main changed: prepare and approve a fresh package', created: now() - 100});
  const made = await data(await x.call('/api/prepare', {operation: 'edit', project_id: P, payload: {title: 'Changed title'}, reason: '', replaces: old.id}));
  const fresh = reviewRow(x, made.id);
  assert.equal(reviewRow(x, old.id).state, 'stale'); assert.equal(reviewRow(x, old.id).version, 2);
  assert.equal(fresh.state, 'queued'); assert.equal(fresh.approved_digest, null); assert.equal(fresh.digest, null);
  assert.equal(JSON.parse(fresh.payload).replaces, old.id);
  const before = reviewCount(x);
  const again = await x.call('/api/prepare', {operation: 'edit', project_id: P, payload: {}, reason: '', replaces: old.id});
  assert.equal(again.status, 409); assert.deepEqual(await again.json(), {error: 'That review was already replaced. Reload.'});
  assert.equal(reviewCount(x), before);
  for (const [more, request] of [[{operation: 'edit', project_id: 'ext-zzzzzzzzzzzz'}, {operation: 'edit', project_id: P}], [{operation: 'suspend'}, {operation: 'edit', project_id: P}], [{state: 'approved', operation: 'edit'}, {operation: 'edit', project_id: P}], [{state: 'queued', operation: 'edit'}, {operation: 'edit', project_id: P}]]) {
    const target = await review(x, more.state || 'failed', more);
    const count = reviewCount(x);
    assert.equal((await x.call('/api/prepare', {...request, payload: {}, reason: '', replaces: target.id})).status, 409, JSON.stringify(more));
    assert.equal(reviewCount(x), count); assert.equal(reviewRow(x, target.id).state, more.state || 'failed');
  }
  const failedStart = await review(x, 'dispatch-failed', {operation: 'restore', project_id: 'ext-bbbbbbbbbbbb'});
  await data(await x.call('/api/prepare', {operation: 'restore', project_id: 'ext-bbbbbbbbbbbb', payload: {}, reason: 'Restoring the listing after review', replaces: failedStart.id}));
  assert.equal(reviewRow(x, failedStart.id).state, 'stale');
  for (const replaces of ['short', 123, {id: old.id}]) assert.equal((await x.call('/api/prepare', {operation: 'edit', project_id: P, payload: {}, reason: '', replaces})).status, 400);
});

test('replaces is bound to the same submission and a racing request inserts nothing', async t => {
  const x = await setup(t), sub = await x.seed(), other = await x.seed({url: 'https://fiction.example.org/other'});
  const theirs = await review(x, 'failed', {submission_id: other.id, revision: 1});
  const count = reviewCount(x);
  assert.equal((await x.call('/api/prepare', {operation: 'submission', submission_id: sub.id, revision: 1, payload: sub.payload, replaces: theirs.id})).status, 409);
  assert.equal(reviewCount(x), count); assert.equal(reviewRow(x, theirs.id).state, 'failed');
  const mine = await review(x, 'ready', {submission_id: sub.id, revision: 1, approved_digest: null});
  const made = await data(await x.call('/api/prepare', {operation: 'submission', submission_id: sub.id, revision: 1, payload: sub.payload, replaces: mine.id}));
  assert.equal(reviewRow(x, mine.id).state, 'stale'); assert.equal(reviewRow(x, made.id).approved_digest, null);
  const listing = await review(x, 'failed', {operation: 'edit'});
  const batch = x.env.DB.batch;
  x.env.DB.batch = async statements => { x.env.DB.batch = batch; x.db.prepare("UPDATE admin_reviews SET state='stale' WHERE id=?").run(listing.id); return batch(statements); };
  const before = reviewCount(x), dispatched = x.state.dispatched.length;
  const raced = await x.call('/api/prepare', {operation: 'edit', project_id: P, payload: {}, reason: '', replaces: listing.id});
  assert.equal(raced.status, 409); assert.equal((await raced.json()).error, 'That review was already replaced. Reload.');
  assert.equal(reviewCount(x), before); assert.equal(x.state.dispatched.length, dispatched);
});

test('six active previews block a seventh until one is discarded', async t => {
  const x = await setup(t), active = [];
  for (const [n, state] of ['queued', 'processing', 'ready', 'approved', 'publishing', 'ready'].entries()) active.push(await review(x, state, {project_id: 'ext-aaaaaaaaaaa' + n, operation: 'edit'}));
  const full = await x.call('/api/prepare', {operation: 'edit', project_id: P, payload: {}, reason: ''});
  assert.equal(full.status, 503); assert.deepEqual(await full.json(), {error: 'Six previews are already in progress. Finish or discard one first.'});
  await data(await x.call('/api/discard', {id: active[2].id}));
  assert.equal((await x.call('/api/prepare', {operation: 'edit', project_id: P, payload: {}, reason: ''})).status, 201);
  assert.equal((await x.call('/api/prepare', {operation: 'edit', project_id: 'ext-cccccccccccc', payload: {}, reason: ''})).status, 503);
});

test('automatic re-preparation is offered only for an unreplaced main-moved failure', async t => {
  const x = await setup(t), sub = await x.seed(), moved = 'Main changed: prepare and approve a fresh package';
  const lone = await review(x, 'failed', {operation: 'edit', error: moved, created: now() - 100});
  let s = await stage(x, lone.id);
  assert.equal(s.auto, 'reprepare'); assert.match(s.message, /site changed after this was approved/);
  await review(x, 'failed', {operation: 'edit', project_id: 'ext-zzzzzzzzzzzz', error: moved});
  await review(x, 'failed', {operation: 'suspend', error: moved});
  assert.equal((await stage(x, lone.id)).auto, 'reprepare');
  await review(x, 'stale', {operation: 'edit'});
  assert.equal(Object.hasOwn(await stage(x, lone.id), 'auto'), false);
  const subFailed = await review(x, 'failed', {submission_id: sub.id, revision: 1, error: moved, created: now() - 100});
  assert.equal((await stage(x, subFailed.id)).auto, 'reprepare');
  await review(x, 'discarded', {submission_id: sub.id, revision: 1});
  assert.equal(Object.hasOwn(await stage(x, subFailed.id), 'auto'), false);
  const later = await review(x, 'failed', {operation: 'restore', error: 'Preparation stopped. Main changed: prepare again'});
  s = await stage(x, later.id);
  assert.equal(Object.hasOwn(s, 'auto'), false); assert.deepEqual(actions(s), ['reprepare', 'discard']);
  const behind = await review(x, 'pr-open', {pr: 42, operation: 'unfeature'});
  x.state.pr = openPR({mergeable_state: 'behind'});
  s = await stage(x, behind.id);
  assert.match(s.message, /can no longer be published/); assert.equal(Object.hasOwn(s, 'auto'), false);
});

test('image failures read plainly and offer preparing without artwork only where it applies', async t => {
  const x = await setup(t);
  const status = async (error, more = {}) => stage(x, (await review(x, 'failed', {error, ...more})).id);
  const download = 'An image could not be downloaded or no longer matches what was reviewed.';
  for (const error of ['image cover.webp: HTTP 404; check public pinned URL', 'artwork https://fiction.example.org/a.png: HTTP 500', 'Artwork unavailable', 'Artwork changed']) {
    const s = await status(error);
    assert.equal(s.message, download, error); assert.deepEqual(s.actions.at(-1), {action: 'reprepare-plain', label: 'Prepare without artwork'});
  }
  let s = await status('image must be 1 byte to 5 MiB');
  assert.equal(s.message, 'An image was refused: image must be 1 byte to 5 MiB.'); assert.ok(actions(s).includes('reprepare-plain'));
  s = await status('artwork must be PNG, JPEG or WebP', {operation: 'edit'});
  assert.equal(s.message, 'An image was refused: artwork must be PNG, JPEG or WebP.'); assert.ok(actions(s).includes('reprepare-plain'));
  for (const error of ['Upload broke the image cover.png: HTTP 404', 'images: use safe repository-relative paths', null]) {
    s = await status(error);
    assert.equal(s.message, 'This could not finish. Try again, or discard it.'); assert.equal(actions(s).includes('reprepare-plain'), false);
  }
  s = await status('image cover.png: HTTP 404', {payload: JSON.stringify({value: {}, omit_artwork: true})});
  assert.equal(s.message, download); assert.equal(actions(s).includes('reprepare-plain'), false);
  s = await status('image cover.png: HTTP 404', {operation: 'suspend'});
  assert.equal(actions(s).includes('reprepare-plain'), false);
  s = await status('Nothing has changed from the published listing.', {operation: 'edit'});
  assert.equal(s.message, 'Nothing has changed from the published listing.'); assert.deepEqual(actions(s), ['reprepare', 'discard']);
});

test('the Featured choice is stored only for new listings and a Featured package waits for the live catalogue', async t => {
  const x = await setup(t);
  const stored = async (request, kind, extra = {}) => {
    const sub = kind && await x.seed({kind, url: 'https://fiction.example.org/' + kind + serial++, ...extra});
    const made = await data(await x.call('/api/prepare', sub ? {operation: 'submission', submission_id: sub.id, revision: 1, payload: sub.payload, ...request} : request));
    return JSON.parse(reviewRow(x, made.id).payload);
  };
  assert.equal((await stored({feature: true}, 'add')).feature, true);
  assert.equal((await stored({feature: true}, 'suggest')).feature, true);
  assert.equal(Object.hasOwn(await stored({feature: 'yes'}, 'add'), 'feature'), false);
  assert.equal(Object.hasOwn(await stored({}, 'suggest'), 'feature'), false);
  assert.equal(Object.hasOwn(await stored({feature: true}, 'correct', {listing_id: P, note: 'Please fix the title of this listing.'}), 'feature'), false);
  assert.equal(Object.hasOwn(await stored({operation: 'edit', project_id: P, payload: {}, reason: '', feature: true}), 'feature'), false);
  const pkg = JSON.stringify({project_id: P, files: [], rule: {project_id: P, featured: true}});
  const r = await review(x, 'pr-open', {pr: 42, package: pkg, digest: await digest(pkg), approved_digest: await digest(pkg)});
  x.state.pr = openPR({state: 'closed', merged: true, merge_commit_sha: main}); deployed(x);
  for (const projects of [[{id: P}], [{id: P, featured: true}, {id: 'ext-zzzzzzzzzzzz', featured: true}]]) {
    x.state.projects = projects;
    assert.equal((await stage(x, r.id)).stage, 'deploying', JSON.stringify(projects));
    assert.equal(reviewRow(x, r.id).state, 'pr-open');
  }
  x.state.projects = [{id: P, featured: true}, {id: 'ext-zzzzzzzzzzzz'}];
  assert.equal((await stage(x, r.id)).stage, 'published');
  const plainPkg = JSON.stringify({project_id: 'ext-yyyyyyyyyyyy', files: []});
  const unfeatured = await review(x, 'pr-open', {pr: 42, project_id: 'ext-yyyyyyyyyyyy', package: plainPkg, digest: await digest(plainPkg), approved_digest: await digest(plainPkg)});
  x.state.projects = [{id: 'ext-yyyyyyyyyyyy'}];
  assert.equal((await stage(x, unfeatured.id)).stage, 'published');
});

test('a listing returns its past operations newest first with reason and approver', async t => {
  const x = await setup(t), t0 = now();
  const first = await review(x, 'published', {operation: 'submission', created: t0 - 300, payload: JSON.stringify({value: {}, reason: ''})});
  await review(x, 'withdrawn', {operation: 'suspend', created: t0 - 200, payload: JSON.stringify({value: {}, reason: 'Broken download link reported'})});
  await review(x, 'stale', {operation: 'restore', created: t0 - 100, payload: JSON.stringify({value: {}, reason: 'Download link fixed by the developer'})});
  await review(x, 'published', {operation: 'edit', project_id: 'ext-zzzzzzzzzzzz'});
  x.db.prepare("INSERT INTO admin_history(review_id,actor,action,created) VALUES(?,'owner@example.org','exact-approval-expedited',1)").run(first.id);
  const listing = await data(await x.call('/api/listing?id=' + P));
  assert.deepEqual(listing.history, [
    {created: t0 - 100, operation: 'restore', state: 'stale', reason: 'Download link fixed by the developer', approved_by: null},
    {created: t0 - 200, operation: 'suspend', state: 'withdrawn', reason: 'Broken download link reported', approved_by: null},
    {created: t0 - 300, operation: 'submission', state: 'published', reason: '', approved_by: 'owner@example.org'}]);
  for (let n = 0; n < 22; n++) await review(x, 'stale', {operation: 'edit', created: t0 - 1000 - n});
  assert.equal((await data(await x.call('/api/listing?id=' + P))).history.length, 20);
  globalThis.fetch = async (url, opts) => String(url).includes('/contents/listings/') ? Response.json({content: Buffer.from(JSON.stringify({id: P, title: 'Live'})).toString('base64')}) : x.fetcher(url, opts);
  const editable = await data(await x.call('/api/listing?id=' + P));
  assert.equal(editable.editable, true); assert.equal(editable.history[0].operation, 'restore');
  assert.deepEqual((await data(await x.call('/api/listing?id=ext-qqqqqqqqqqqq'))).history, []);
});

test('queue and detail name a correction or claim by its catalogue title', async t => {
  const x = await setup(t);
  x.state.projects = [{id: P, title: 'Live project'}];
  const correction = await x.seed({kind: 'correct', listing_id: P, note: 'Please fix the title of this listing.'});
  const claim = await x.seed({kind: 'claim', listing_id: P, note: 'I made this project and can prove it.'});
  const missing = await x.seed({kind: 'correct', listing_id: 'ext-zzzzzzzzzzzz', note: 'Please fix this old listing.'});
  const added = await x.seed({url: 'https://fiction.example.org/new'});
  const queued = (await data(await x.call('/api/queue?state=open'))).items;
  for (const [s, title] of [[correction, 'Live project'], [claim, 'Live project'], [missing, null], [added, null]]) {
    assert.equal(queued.find(i => i.id === s.id).listing_title, title, String(s.id));
    assert.equal((await data(await x.call('/api/detail?id=' + s.id))).submission.listing_title, title, String(s.id));
  }
  assert.equal((await data(await x.call('/api/listing?id=ext-zzzzzzzzzzzz'))).message, 'This listing is not on the site, so it cannot be corrected here.');
});

test('new and changed routes keep the session, Origin and CSRF gates', async t => {
  const x = await setup(t), sub = await x.seed(), r = await review(x, 'failed', {operation: 'edit'});
  for (const route of ['/api/summary', '/api/reviews', '/api/queue?state=open', '/api/listing?id=' + P, '/api/publication?id=' + r.id]) {
    assert.equal((await x.call(route, undefined, {Cookie: ''})).status, 401, route);
    assert.equal((await x.call(route, undefined, {'Cf-Access-Jwt-Assertion': ''})).status, 401, route);
  }
  const request = {operation: 'edit', project_id: P, payload: {}, reason: '', replaces: r.id};
  assert.equal((await x.call('/api/prepare', request, {Cookie: ''})).status, 401);
  assert.equal((await x.call('/api/prepare', request, {Origin: 'https://attacker.example'})).status, 403);
  assert.equal((await x.call('/api/prepare', request, {'Sec-Fetch-Site': 'cross-site'})).status, 403);
  assert.equal((await x.call('/api/prepare', request, {'X-CSRF-Token': 'wrong'})).status, 403);
  assert.equal(reviewRow(x, r.id).state, 'failed'); assert.equal(reviewCount(x), 1);
  const asModerator = await moderator(x);
  assert.equal((await x.call('/api/summary', undefined, asModerator)).status, 200);
  assert.equal((await x.call('/api/prepare', {operation: 'submission', submission_id: sub.id, revision: 1, payload: sub.payload}, asModerator)).status, 201);
});
