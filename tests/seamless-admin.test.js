import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../tools/admin/test-fixture.js';
import {handle as intake, random, digest} from '../intake/worker.js';
import {patiently} from '../tools/admin/process.js';

const main = 'a'.repeat(40), now = () => Math.floor(Date.now() / 1000);
async function setup(t) { const x = await fixture(); const original = globalThis.fetch; globalThis.fetch = x.fetcher; t.after(() => { globalThis.fetch = original; x.db.close(); }); await x.login(); return x; }
const data = async res => { assert.equal(res.ok, true, await res.clone().text()); return res.json(); };
const stage = async (x, id) => data(await x.call('/api/publication?id=' + id));
const actions = status => (status.actions || []).map(a => a.action);
let serial = 0;
async function review(x, state, more = {}) {
  const id = String(++serial).padStart(24, 'r'), pkg = JSON.stringify({project_id: 'ext-abcdefghijkl', files: []}), hash = await digest(pkg);
  const row = {id, submission_id: null, revision: null, project_id: 'ext-abcdefghijkl', operation: 'submission', payload: '{"value":{}}', state, version: 1, package: pkg, digest: hash, approved_digest: hash, pr: null, error: null, created: now(), updated: now(), dispatched: null, ...more};
  x.db.prepare('INSERT INTO admin_reviews(id,submission_id,revision,project_id,operation,payload,state,version,package,digest,approved_digest,pr,error,created,updated,dispatched) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(row));
  return row;
}
const reviewRow = (x, id) => x.db.prepare('SELECT * FROM admin_reviews WHERE id=?').get(id);
const openPR = more => ({number: 42, state: 'open', merged: false, mergeable_state: 'blocked', auto_merge: {merge_method: 'squash'}, head: {sha: main}, html_url: 'https://github.com/fictional/hub/pull/42', ...more});
const deployed = x => { x.state.manifest = {build_commit: main}; x.state.runs = [{id: 1, head_sha: main, event: 'push', status: 'completed', conclusion: 'success', run_attempt: 1}]; x.state.jobs = ['synchronize', 'backup', 'anchor', 'publish', 'website', 'deploy-website'].map(name => ({name, conclusion: 'success'})); x.state.projects = [{id: 'ext-abcdefghijkl'}]; };

test('approval starts tracked publication once and every stage follows verified state', async t => {
  const x = await setup(t), sub = await x.seed();
  const r = await review(x, 'ready', {submission_id: sub.id, revision: 1, approved_digest: null});
  const approved = await data(await x.call('/api/approve', {id: r.id, version: 1, digest: r.digest, content_reviewed: true, expedite: true}));
  assert.equal(approved.expedited, true);
  assert.deepEqual(x.state.dispatched.map(d => d.inputs.action), ['publish']);
  assert.equal((await stage(x, r.id)).message, 'Publication is starting.');
  assert.equal((await x.call('/api/publish', {id: r.id, digest: r.digest})).status, 409);
  assert.equal(x.state.dispatched.length, 1);
  await data(await x.processCall(r.id, '/claim', {action: 'publish'}));
  assert.equal((await stage(x, r.id)).stage, 'publishing');
  await data(await x.processCall(r.id, '/published-pr', {pr: 42, auto_merge: 'enabled'}));
  x.state.pr = openPR(); x.state.checks = [{name: 'test', status: 'in_progress', conclusion: null}];
  assert.deepEqual(await stage(x, r.id), {stage: 'checks', message: 'Automated checks are running.'});
  x.state.pr = openPR({state: 'closed', merged: true, merge_commit_sha: main});
  assert.equal((await stage(x, r.id)).stage, 'deploying');
  assert.equal(reviewRow(x, r.id).state, 'pr-open');
  deployed(x); x.state.projects = [];
  assert.equal((await stage(x, r.id)).stage, 'deploying');
  x.state.projects = [{id: 'ext-abcdefghijkl'}];
  const before = x.state.github.length;
  const live = await stage(x, r.id);
  assert.deepEqual(live, {stage: 'published', message: 'The change is live.', live_url: 'https://site.example/projects/ext-abcdefghijkl/'});
  assert.ok(x.state.github.length - before <= 5);
  assert.equal(reviewRow(x, r.id).state, 'published');
  assert.equal(x.db.prepare('SELECT state FROM submissions WHERE id=?').get(sub.id).state, 'published');
  const settled = x.state.github.length;
  assert.deepEqual(await stage(x, r.id), live);
  assert.equal(x.state.github.length, settled);
  const inbox = await data(await x.call('/api/queue'));
  assert.equal(inbox.items[0].review.state, 'published'); assert.equal(inbox.counts.published, 1);
});

test('a failing required check, a moved main and a closed request never read as published', async t => {
  const x = await setup(t), r = await review(x, 'pr-open', {pr: 42});
  x.state.pr = openPR(); x.state.checks = [{name: 'test', status: 'completed', conclusion: 'failure', html_url: 'https://github.com/fictional/hub/runs/9'}, {name: 'browser', status: 'completed', conclusion: 'success'}];
  let s = await stage(x, r.id);
  assert.equal(s.stage, 'attention'); assert.match(s.message, /check “test” failed, so nothing was published/); assert.equal(s.detail_url, 'https://github.com/fictional/hub/runs/9');
  assert.deepEqual(actions(s), ['check', 'reprepare']);
  assert.equal((await x.call('/api/discard', {id: r.id})).status, 409);
  x.state.checks = [{name: 'browser', status: 'completed', conclusion: 'failure'}, {name: 'test', status: 'completed', conclusion: 'success'}];
  assert.equal((await stage(x, r.id)).stage, 'checks');
  x.state.pr = openPR({mergeable_state: 'behind'});
  s = await stage(x, r.id);
  assert.match(s.message, /site changed after this was approved/); assert.deepEqual(actions(s), ['reprepare', 'discard']);
  x.state.pr = openPR({state: 'closed'});
  s = await stage(x, r.id);
  assert.match(s.message, /closed before anything was published/);
  assert.equal(reviewRow(x, r.id).state, 'pr-open');
  await data(await x.call('/api/discard', {id: r.id}));
  assert.equal(reviewRow(x, r.id).state, 'discarded');
  assert.equal((await stage(x, r.id)).stage, 'closed');
});

test('an automatic-merge refusal is a visible failure and a later manual merge is labelled as one', async t => {
  const x = await setup(t), r = await review(x, 'publishing');
  await data(await x.processCall(r.id, '/published-pr', {pr: 42, auto_merge: 'GitHub refused automatic merge: Auto merge is not allowed for this repository'}));
  x.state.pr = openPR({auto_merge: null});
  const s = await stage(x, r.id);
  assert.equal(s.stage, 'attention'); assert.match(s.message, /Automatic merge was not turned on \(GitHub refused automatic merge: Auto merge is not allowed/);
  assert.equal(s.url, 'https://github.com/fictional/hub/pull/42');
  x.state.pr = openPR({state: 'closed', merged: true, merge_commit_sha: main}); deployed(x);
  assert.match((await stage(x, r.id)).message, /live\. It was merged by hand on GitHub because automatic merge could not be turned on/);
});

test('temporary GitHub errors are retried within bounds and never dispatch twice', async t => {
  const x = await setup(t), r = await review(x, 'pr-open', {pr: 42});
  x.state.pr = openPR(); x.state.outage = 1;
  assert.equal((await stage(x, r.id)).stage, 'checks');
  x.state.outage = 2;
  assert.equal((await x.call('/api/publication?id=' + r.id)).status, 503);
  const a = await review(x, 'approved');
  x.state.outage = 2;
  await data(await x.call('/api/publish', {id: a.id, digest: a.digest}));
  assert.equal(x.state.dispatched.length, 1);
  assert.equal((await x.call('/api/publish', {id: a.id, digest: a.digest})).status, 409);
  const b = await review(x, 'approved');
  x.state.outage = 3;
  assert.equal((await x.call('/api/publish', {id: b.id, digest: b.digest})).status, 503);
  assert.equal(x.state.dispatched.length, 1);
  const s = await stage(x, b.id);
  assert.equal(s.stage, 'attention'); assert.equal(s.message, 'Publication could not start.'); assert.deepEqual(actions(s), ['publish', 'discard']);
  await data(await x.call('/api/publish', {id: b.id, digest: b.digest}));
  assert.equal(x.state.dispatched.length, 2);
  let tries = 0;
  assert.equal(await patiently(async () => { if (++tries < 3) throw Error('temporary'); return 'done'; }, 3, 1), 'done');
  await assert.rejects(patiently(async () => { tries++; throw Object.assign(Error('refused'), {final: true}); }, 3, 1), /refused/);
  assert.equal(tries, 4);
  await assert.rejects(patiently(async () => { throw Error('down'); }, 2, 1), /down/);
});

test('stalled work gets a matching recovery path and an unreported pull request is adopted', async t => {
  const x = await setup(t), old = now() - 3600;
  const waiting = await review(x, 'approved');
  assert.deepEqual(await stage(x, waiting.id), {stage: 'approved', message: 'Your approval has been recorded.', actions: [{action: 'publish', label: 'Publish now'}, {action: 'discard', label: 'Discard unfinished review'}]});
  const never = await review(x, 'approved', {dispatched: old});
  let s = await stage(x, never.id);
  assert.equal(s.message, 'Publication has not started after 5 minutes.'); assert.deepEqual(actions(s), ['publish', 'discard']);
  await data(await x.call('/api/publish', {id: never.id, digest: never.digest}));
  assert.equal((await stage(x, never.id)).stage, 'publishing');
  const queued = await review(x, 'queued', {updated: old, approved_digest: null});
  s = await stage(x, queued.id);
  assert.equal(s.message, 'Preparation has not started after 5 minutes.'); assert.deepEqual(s.actions[0], {action: 'reprepare', label: 'Try again'});
  const failed = await review(x, 'failed', {error: 'Main changed: prepare and approve a fresh package'});
  s = await stage(x, failed.id);
  assert.match(s.message, /site changed after this was approved/); assert.deepEqual(s.actions[0], {action: 'reprepare', label: 'Prepare a new review'});
  const lost = await review(x, 'publishing', {updated: old});
  s = await stage(x, lost.id);
  assert.match(s.message, /stopped before it finished/); assert.deepEqual(actions(s), ['reprepare', 'discard']);
  x.state.pulls = [{number: 77, base: {ref: 'main'}, head: {repo: {full_name: 'attacker/hub'}}}, {number: 42, auto_merge: {}, base: {ref: 'main'}, head: {repo: {full_name: 'fictional/hub'}}}];
  x.state.pr = openPR(); x.state.checks = [];
  assert.equal((await stage(x, lost.id)).stage, 'checks');
  assert.equal(reviewRow(x, lost.id).pr, 42); assert.equal(reviewRow(x, lost.id).state, 'pr-open');
  const busy = await review(x, 'publishing');
  assert.equal((await x.call('/api/discard', {id: busy.id})).status, 409);
});

test('a failed deployment is repeated once by itself, then offered, then left alone', async t => {
  const x = await setup(t), r = await review(x, 'pr-open', {pr: 42});
  x.state.pr = openPR({state: 'closed', merged: true, merge_commit_sha: main});
  const run = attempt => { x.state.runs = [{id: 5, head_sha: main, event: 'push', status: 'completed', conclusion: 'failure', run_attempt: attempt, html_url: 'https://github.com/fictional/hub/actions/runs/5'}]; };
  x.state.jobs = [{name: 'synchronize', conclusion: 'success'}, {name: 'website', conclusion: 'failure'}];
  run(1);
  assert.equal((await stage(x, r.id)).stage, 'deploying'); assert.equal(x.state.reruns.length, 1);
  run(2);
  let s = await stage(x, r.id);
  assert.match(s.message, /failed at the “website” step\. The live site is unchanged/); assert.deepEqual(actions(s), ['redeploy']); assert.equal(x.state.reruns.length, 1);
  await data(await x.call('/api/redeploy', {id: r.id})); assert.equal(x.state.reruns.length, 2);
  run(3);
  s = await stage(x, r.id);
  assert.deepEqual(actions(s), ['check']);
  assert.equal((await x.call('/api/redeploy', {id: r.id})).status, 409); assert.equal(x.state.reruns.length, 2);
  assert.equal(reviewRow(x, r.id).state, 'pr-open');
});

test('preparing again after main moved carries no approval and discarding returns the submission to review', async t => {
  const x = await setup(t), sub = await x.seed();
  x.db.prepare("UPDATE submissions SET state='approved' WHERE id=?").run(sub.id);
  const stale = await review(x, 'failed', {submission_id: sub.id, revision: 1, error: 'Main changed: prepare and approve a fresh package', payload: JSON.stringify({value: sub.payload, reason: ''})});
  const made = await data(await x.call('/api/prepare', {operation: 'submission', submission_id: sub.id, revision: 1, payload: sub.payload, reason: ''}));
  const fresh = reviewRow(x, made.id);
  assert.equal(fresh.state, 'queued'); assert.equal(fresh.approved_digest, null); assert.equal(fresh.digest, null); assert.equal(fresh.dispatched, null);
  assert.equal(reviewRow(x, stale.id).state, 'stale');
  assert.equal((await x.call('/api/publish', {id: made.id, digest: stale.digest})).status, 409);
  await data(await x.call('/api/discard', {id: made.id}));
  assert.equal(x.db.prepare('SELECT state FROM submissions WHERE id=?').get(sub.id).state, 'in-review');
  assert.equal((await x.call('/api/discard', {id: made.id})).status, 409);
});

test('deleting removes intake data, invalidates the receipt and leaves every other record alone', async t => {
  const x = await setup(t);
  const fresh = await x.seed({title: 'Delete me'}), rejected = await x.seed({title: 'Rejected', url: 'https://fiction.example.org/rejected'}), correction = await x.seed({kind: 'correct', listing_id: 'ext-abcdefghijkl', title: 'Correction', url: 'https://fiction.example.org/c'}), claim = await x.seed({kind: 'claim', listing_id: 'ext-abcdefghijkl', title: 'Claim', url: 'https://fiction.example.org/k'}, {challenge: 'loghub-claim-x'}), keep = await x.seed({title: 'Keep me', url: 'https://fiction.example.org/keep'});
  await data(await x.call('/api/decision', {id: rejected.id, revision: 1, state: 'rejected', public_note: 'Not suitable', private_note: 'Private reason'}));
  const prep = await review(x, 'ready', {submission_id: fresh.id, revision: 1});
  x.db.prepare("INSERT INTO admin_files(review_id,name,part,data) VALUES(?,'cover.png',0,'AAAA')").run(prep.id);
  const intakeEnv = {...x.env, INTAKE_ENABLED: 'true', RATE_SALT: random(), API_ORIGIN: 'https://intake.example'};
  const receipt = value => intake(new Request('https://intake.example/status', {method: 'POST', headers: {Origin: intakeEnv.SITE_ORIGIN, 'Content-Type': 'application/json'}, body: JSON.stringify({receipt: value})}), intakeEnv);
  assert.equal((await receipt(fresh.receipt)).status, 200);
  const preview = await data(await x.call('/api/delete', {ids: [fresh.id, rejected.id], preview: true}));
  assert.deepEqual(preview.items, [{id: fresh.id, title: 'Delete me'}, {id: rejected.id, title: 'Rejected'}]);
  assert.equal(x.db.prepare('SELECT count(*) n FROM submissions').get().n, 5);
  const done = await data(await x.call('/api/delete', {ids: [fresh.id, rejected.id, correction.id, claim.id]}));
  assert.deepEqual(done.items.map(i => i.deleted), [true, true, true, true]);
  assert.deepEqual(x.db.prepare('SELECT id FROM submissions').all().map(r => r.id), [keep.id]);
  const lookup = await receipt(fresh.receipt);
  assert.equal(lookup.status, 404); assert.equal(JSON.stringify(await lookup.json()).includes('Delete me'), false);
  assert.equal((await receipt(keep.receipt)).status, 200);
  assert.equal(x.db.prepare('SELECT count(*) n FROM admin_reviews').get().n, 0); assert.equal(x.db.prepare('SELECT count(*) n FROM admin_files').get().n, 0);
  const audit = x.db.prepare('SELECT submission_id,actor,action,public_note,private_note FROM admin_history ORDER BY id').all();
  assert.deepEqual(audit.map(a => [a.submission_id, a.action]), [[fresh.id, 'deleted-submission'], [rejected.id, 'deleted-submission'], [correction.id, 'deleted-submission'], [claim.id, 'deleted-submission']]);
  assert.equal(JSON.stringify(audit).includes('Private reason'), false); assert.equal(JSON.stringify(audit).includes('Not suitable'), false);
  const again = await data(await x.call('/api/delete', {ids: [fresh.id]}));
  assert.deepEqual(again.items, [{id: fresh.id, title: null, gone: true}]);
  assert.equal(x.db.prepare('SELECT count(*) n FROM admin_history').get().n, 4);
  assert.equal((await x.call('/api/detail?id=' + fresh.id)).status, 404);
  assert.equal((await data(await x.call('/api/queue'))).total, 1);
});

test('duplicates are advisory, shown together, and deleted only by explicit choice', async t => {
  const x = await setup(t);
  const original = await x.seed({title: 'Original'}), copy = await x.seed({title: 'Copy'}), other = await x.seed({title: 'Other', url: 'https://fiction.example.org/other'});
  const inbox = await data(await x.call('/api/queue?sort=oldest'));
  assert.deepEqual(inbox.items[0].possible_duplicates.map(d => [d.id, d.title, d.url, d.state]), [[copy.id, 'Copy', 'https://fiction.example.org/project', 'received']]);
  assert.equal(typeof inbox.items[0].possible_duplicates[0].created, 'number');
  assert.deepEqual(inbox.items[2].possible_duplicates, []);
  assert.deepEqual((await data(await x.call('/api/detail?id=' + copy.id))).submission.possible_duplicates.map(d => d.id), [original.id]);
  assert.equal(x.db.prepare('SELECT count(*) n FROM submissions').get().n, 3);
  await data(await x.call('/api/delete', {ids: [copy.id]}));
  assert.deepEqual(x.db.prepare('SELECT id FROM submissions ORDER BY id').all().map(r => r.id), [original.id, other.id]);
  assert.deepEqual((await data(await x.call('/api/queue?sort=oldest'))).items[0].possible_duplicates, []);
  assert.deepEqual((await data(await x.call('/api/queue?all=1&q=Other'))).ids, [other.id]);
});

test('active publication blocks deletion, a published listing survives it, and partial results are reported', async t => {
  const x = await setup(t);
  const live = await x.seed({title: 'Live'}), flying = await x.seed({title: 'In flight', url: 'https://fiction.example.org/flying'}), plain = await x.seed({title: 'Plain', url: 'https://fiction.example.org/plain'});
  x.db.prepare("UPDATE submissions SET state='approved' WHERE id IN (?,?)").run(live.id, flying.id);
  const published = await review(x, 'pr-open', {submission_id: live.id, revision: 1, pr: 42});
  x.db.prepare("INSERT INTO admin_history(submission_id,review_id,actor,action,created) VALUES(?,?,'owner@example.org','exact-approval',1)").run(live.id, published.id);
  x.db.prepare("INSERT INTO admin_history(submission_id,actor,action,private_note,created) VALUES(?,'owner@example.org','in-review','Private triage note',1)").run(live.id);
  const active = await review(x, 'publishing', {submission_id: flying.id, revision: 1});
  x.state.pr = openPR({state: 'closed', merged: true, merge_commit_sha: main}); deployed(x);
  const preview = await data(await x.call('/api/delete', {ids: [live.id, flying.id, plain.id], preview: true}));
  assert.deepEqual(preview.items.map(i => Boolean(i.blocked)), [false, true, false]);
  assert.equal(reviewRow(x, published.id).state, 'published');
  const result = await data(await x.call('/api/delete', {ids: [live.id, flying.id, plain.id, 999]}));
  assert.deepEqual(result.items.map(i => [i.id, i.deleted === true, Boolean(i.blocked), i.gone === true]), [[live.id, true, false, false], [flying.id, false, true, false], [plain.id, true, false, false], [999, false, false, true]]);
  assert.match(result.items[1].blocked, /publication for this submission is still in progress/);
  assert.deepEqual(x.db.prepare('SELECT id FROM submissions').all().map(r => r.id), [flying.id]);
  assert.equal(reviewRow(x, active.id).state, 'publishing');
  const kept = reviewRow(x, published.id);
  assert.equal(kept.state, 'published'); assert.equal(kept.submission_id, null); assert.equal(kept.approved_digest, published.digest);
  const history = x.db.prepare('SELECT action FROM admin_history WHERE submission_id=? ORDER BY id').all(live.id).map(h => h.action);
  assert.deepEqual(history, ['exact-approval', 'verified-live', 'deleted-submission']);
  assert.deepEqual(x.state.projects, [{id: 'ext-abcdefghijkl'}]);
  assert.equal((await stage(x, published.id)).stage, 'published');
  const first = await x.seed({title: 'First', url: 'https://fiction.example.org/first'}), second = await x.seed({title: 'Second', url: 'https://fiction.example.org/second'});
  const batch = x.env.DB.batch; let calls = 0;
  x.env.DB.batch = async statements => { if (++calls === 1) throw Error('database unavailable'); return batch(statements); };
  const partial = await data(await x.call('/api/delete', {ids: [first.id, second.id]}));
  x.env.DB.batch = batch;
  assert.deepEqual(partial.items, [{id: first.id, title: 'First', blocked: 'This submission could not be deleted. Try again.'}, {id: second.id, title: 'Second', deleted: true}]);
  assert.deepEqual(x.db.prepare('SELECT id FROM submissions ORDER BY id').all().map(r => r.id), [flying.id, first.id]);
});

test('deletion and discarding reject forged, unauthorized and malformed requests', async t => {
  const x = await setup(t), sub = await x.seed();
  assert.equal((await x.call('/api/delete', {ids: [sub.id]}, {'X-CSRF-Token': 'wrong'})).status, 403);
  assert.equal((await x.call('/api/delete', {ids: [sub.id]}, {Origin: 'https://attacker.example'})).status, 403);
  assert.equal((await x.call('/api/delete', {ids: [sub.id]}, {'Sec-Fetch-Site': 'cross-site'})).status, 403);
  assert.equal((await x.call('/api/delete', {ids: [sub.id]}, {'Cf-Access-Jwt-Assertion': ''})).status, 401);
  assert.equal((await x.call('/api/delete', {ids: [sub.id]}, {Cookie: ''})).status, 401);
  for (const ids of [[], 'all', [sub.id, sub.id], ['1'], [1.5], Array.from({length: 11}, (_, n) => n + 1)]) assert.equal((await x.call('/api/delete', {ids})).status, 400);
  x.env.ADMIN_EMAILS += ',moderator@example.org';
  const moderator = {'Cf-Access-Jwt-Assertion': await x.jwt({sub: 'moderator', email: 'moderator@example.org'})};
  const signed = await x.call('/api/login', {}, moderator), session = await signed.json();
  const asModerator = {...moderator, Cookie: signed.headers.get('Set-Cookie').split(';')[0], 'X-CSRF-Token': session.csrf};
  assert.equal((await x.call('/api/queue', undefined, asModerator)).status, 200);
  assert.equal((await x.call('/api/delete', {ids: [sub.id]}, asModerator)).status, 403);
  assert.equal((await x.call('/api/delete', {ids: [sub.id], preview: true}, asModerator)).status, 403);
  const r = await review(x, 'ready', {submission_id: sub.id, revision: 1});
  assert.equal((await x.call('/api/discard', {id: r.id}, asModerator)).status, 403);
  assert.equal(x.db.prepare('SELECT count(*) n FROM submissions').get().n, 1); assert.equal(reviewRow(x, r.id).state, 'ready');
});

test('a Featured change replaced by a later verified publication is reported published, not deploying forever', async t => {
  const x = await setup(t);
  const r = await review(x, 'pr-open', {operation: 'feature', pr: 42});
  x.state.pr = openPR({state: 'closed', merged: true, merge_commit_sha: main});
  deployed(x); x.state.projects = [{id: 'ext-abcdefghijkl'}, {id: 'gh-123', featured: true}];
  assert.equal((await stage(x, r.id)).stage, 'deploying');
  await review(x, 'published', {operation: 'feature', project_id: 'gh-123', pr: 41});
  assert.equal((await stage(x, r.id)).stage, 'deploying');
  await review(x, 'published', {operation: 'feature', project_id: 'gh-123', pr: 43});
  assert.equal((await stage(x, r.id)).stage, 'published');
  assert.equal(reviewRow(x, r.id).state, 'published');
});
