import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../tools/admin/test-fixture.js';
import {random} from '../intake/worker.js';

const A = 'ext-aaaaaaaaaaaa', B = 'ext-bbbbbbbbbbbb', changed = 'These ratings changed; check again.';
const data = async res => { assert.equal(res.ok, true, await res.clone().text()); return res.json(); };
async function setup(t) {
  const x = await fixture(); const original = globalThis.fetch; globalThis.fetch = x.fetcher;
  t.after(() => { globalThis.fetch = original; x.db.close(); x.ratings.close(); });
  await x.login();
  x.state.projects = [{id: A, title: 'Alpha <b>project</b>'}, {id: B, title: 'Beta project'}];
  const hashes = [];
  const vote = (project, score, hash = random()) => { hashes.push(hash); x.ratings.prepare('INSERT INTO votes(project_id,credential_hash,score) VALUES(?,?,?)').run(project, hash, score); return hash; };
  for (let n = 0; n < 6; n++) vote(A, 1);
  for (let n = 0; n < 3; n++) { const shared = vote(A, 7); vote(B, 5, shared); }
  for (let n = 0; n < 4; n++) vote(B, 2);
  const unlimit = () => x.db.exec("DELETE FROM limits WHERE key LIKE 'dashboard:ratings:%'");
  return {...x, hashes, vote, unlimit};
}
const totals = (x, id) => ({...x.ratings.prepare('SELECT total,count FROM totals WHERE project_id=?').get(id)});
const excludedCount = x => x.ratings.prepare('SELECT count(*) n FROM excluded_credentials').get().n;
const audit = x => x.db.prepare("SELECT action,private_note FROM admin_history WHERE action LIKE 'ratings-%' ORDER BY id").all().map(r => [r.action, r.private_note]);
const noHashes = (x, text) => { for (const hash of x.hashes) assert.equal(text.includes(hash), false, 'credential hash leaked'); assert.equal(text.includes('credential_hash'), false); };

test('the ratings view reports public aggregates and withholds one-time groups under five', async t => {
  const x = await setup(t);
  const res = await x.call('/api/ratings'), text = await res.text(), view = JSON.parse(text);
  noHashes(x, text);
  const [alpha, beta] = view.projects;
  assert.deepEqual([alpha.id, alpha.title, alpha.count, alpha.average, alpha.excluded, alpha.unusual, alpha.consistent], [A, 'Alpha <b>project</b>', 9, 3, 0, true, true]);
  assert.deepEqual(alpha.scores.map(s => [s.score, s.counted, s.excluded, s.only_here]), [[1, 6, 0, 6], [2, 0, 0, 0], [3, 0, 0, 0], [4, 0, 0, 0], [5, 0, 0, 0], [6, 0, 0, 0], [7, 3, 0, 0]]);
  assert.deepEqual([beta.count, beta.average, beta.unusual, beta.consistent], [7, 23 / 7, false, true]);
  assert.deepEqual(beta.scores.find(s => s.score === 2), {score: 2, counted: 4, excluded: 0, only_here: 0});
  assert.deepEqual(view.exclusions, []); assert.deepEqual(view.log, []);
  const small = await x.call('/api/ratings/exclude', {project_id: B, score: 2, reason: 'Four one-time ratings'});
  assert.equal(small.status, 409); assert.deepEqual(await small.json(), {error: changed});
  for (const expected of [4, 3, 0]) assert.equal((await x.call('/api/ratings/exclude', {project_id: B, score: 2, reason: 'Four one-time ratings', expected})).status, 409);
  assert.equal(excludedCount(x), 0); assert.deepEqual(totals(x, B), {total: 23, count: 7}); assert.deepEqual(audit(x), []);
  x.unlimit();
  assert.equal((await x.call('/api/ratings/exclude', {project_id: B, score: 2, reason: 'Claiming a group of five', expected: 5})).status, 409);
  assert.equal(excludedCount(x), 0);
  x.vote(B, 2);
  assert.equal((await data(await x.call('/api/ratings'))).projects[1].scores.find(s => s.score === 2).only_here, 5);
  x.ratings.prepare('UPDATE totals SET count=count+1 WHERE project_id=?').run(A);
  assert.equal((await data(await x.call('/api/ratings'))).projects[0].consistent, false);
});

test('stopping counting a group previews exactly, applies atomically and restores by reason', async t => {
  const x = await setup(t), start = totals(x, A), reason = 'One-time wave of low scores';
  const preview = await data(await x.call('/api/ratings/exclude', {project_id: A, score: 1, reason}));
  assert.deepEqual(preview, {credentials: 6, before: {count: 9, average: 3}, after: {count: 3, average: 7}});
  assert.equal(excludedCount(x), 0); assert.deepEqual(totals(x, A), start); assert.deepEqual(audit(x), []);
  x.vote(A, 1);
  const raced = await x.call('/api/ratings/exclude', {project_id: A, score: 1, reason, expected: 6});
  assert.equal(raced.status, 409); assert.deepEqual(await raced.json(), {error: changed});
  assert.equal(excludedCount(x), 0); assert.deepEqual(totals(x, A), {total: 28, count: 10});
  const again = await data(await x.call('/api/ratings/exclude', {project_id: A, score: 1, reason}));
  assert.equal(again.credentials, 7);
  const applied = await data(await x.call('/api/ratings/exclude', {project_id: A, score: 1, reason, expected: 7}));
  assert.deepEqual(applied, {excluded: 7, before: again.before, after: again.after});
  assert.deepEqual(totals(x, A), {total: 21, count: 3}); assert.deepEqual(totals(x, B), {total: 23, count: 7});
  const stored = `${new Date().toISOString().slice(0, 10)} ${A} score 1: ${reason}`;
  const view = await x.call('/api/ratings'), text = await view.text(), listed = JSON.parse(text);
  noHashes(x, text);
  assert.deepEqual(listed.exclusions, [{reason: stored, credentials: 7, votes: 7}]);
  assert.deepEqual(listed.projects[0].scores[0], {score: 1, counted: 0, excluded: 7, only_here: 0});
  assert.equal(listed.projects[0].excluded, 7);
  const restored = await data(await x.call('/api/ratings/restore', {reason: stored}));
  assert.deepEqual(restored, {restored: 7});
  assert.deepEqual(totals(x, A), {total: 28, count: 10}); assert.equal(excludedCount(x), 0);
  const log = audit(x);
  assert.deepEqual(log, [['ratings-exclude', stored + '; 6 ratings'], ['ratings-exclude-result', '0'], ['ratings-exclude', stored + '; 7 ratings'], ['ratings-exclude-result', '7'], ['ratings-restore', stored], ['ratings-restore-result', '7']]);
  assert.deepEqual((await data(await x.call('/api/ratings'))).log.map(l => [l.action, l.private_note, l.actor]).reverse(), log.map(l => [...l, 'owner@example.org']));
  const repeat = await x.call('/api/ratings/restore', {reason: stored});
  assert.equal(repeat.status, 429);
  x.unlimit();
  const gone = await x.call('/api/ratings/restore', {reason: stored});
  assert.equal(gone.status, 404);
  assert.deepEqual(audit(x).slice(-2), [['ratings-restore', stored], ['ratings-restore-result', '0']]);
});

test('a failing ratings database leaves a result row saying failed and changes nothing', async t => {
  const x = await setup(t), prepare = x.env.RATINGS_DB.prepare;
  x.env.RATINGS_DB.prepare = query => { if (/^(?:INSERT|DELETE)/.test(query)) throw Error('ratings database unavailable'); return prepare(query); };
  const res = await x.call('/api/ratings/exclude', {project_id: A, score: 1, reason: 'One-time wave of low scores', expected: 6});
  assert.equal(res.status, 503); assert.deepEqual(await res.json(), {error: 'Administration unavailable; retry later'});
  assert.deepEqual(audit(x).map(([action, note]) => [action, note.endsWith('; 6 ratings') ? 'intent' : note]), [['ratings-exclude', 'intent'], ['ratings-exclude-result', 'failed']]);
  assert.equal((await x.call('/api/ratings/restore', {reason: 'anything recorded'})).status, 503);
  assert.deepEqual(audit(x).slice(-2), [['ratings-restore', 'anything recorded'], ['ratings-restore-result', 'failed']]);
  assert.equal(excludedCount(x), 0); assert.deepEqual(totals(x, A), {total: 27, count: 9});
});

test('ratings requests are validated and limited to five a minute', async t => {
  const x = await setup(t), ok = {project_id: A, score: 1, reason: 'One-time wave of low scores'};
  const bad = [{...ok, project_id: 'gh-1x'}, {...ok, project_id: [A]}, {...ok, score: 0}, {...ok, score: 8}, {...ok, score: 1.5}, {...ok, score: '1'}];
  for (const body of bad) { x.unlimit(); assert.equal((await x.call('/api/ratings/exclude', body)).status, 400, JSON.stringify(body)); }
  x.unlimit();
  assert.deepEqual(await (await x.call('/api/ratings/exclude', {...ok, reason: 'too short'})).json(), {error: 'Record a reason of at least 10 characters'});
  assert.equal((await x.call('/api/ratings/exclude', {...ok, reason: 'x'.repeat(201)})).status, 400);
  assert.equal((await x.call('/api/ratings/exclude', {...ok, reason: 'Contains <markup> here'})).status, 400);
  assert.equal((await x.call('/api/ratings/exclude', {...ok, expected: 6.5})).status, 400);
  x.unlimit();
  for (const reason of ['', 7, 'x'.repeat(1001)]) assert.equal((await x.call('/api/ratings/restore', {reason})).status, 400);
  assert.deepEqual(audit(x), []);
  x.unlimit();
  for (let n = 0; n < 5; n++) assert.equal((await x.call('/api/ratings/exclude', ok)).status, 200);
  assert.equal((await x.call('/api/ratings/exclude', ok)).status, 429);
  assert.equal((await x.call('/api/ratings/restore', {reason: 'anything recorded'})).status, 429);
  assert.equal(excludedCount(x), 0);
});

test('ratings routes need a session, a same-origin CSRF request, the owner and the binding', async t => {
  const x = await setup(t), body = {project_id: A, score: 1, reason: 'One-time wave of low scores', expected: 6};
  for (const route of ['/api/ratings/exclude', '/api/ratings/restore']) {
    const request = route.endsWith('restore') ? {reason: 'anything recorded'} : body;
    assert.equal((await x.call(route, request, {Cookie: ''})).status, 401, route);
    assert.equal((await x.call(route, request, {'Cf-Access-Jwt-Assertion': ''})).status, 401, route);
    assert.equal((await x.call(route, request, {'X-CSRF-Token': ''})).status, 403, route);
    assert.equal((await x.call(route, request, {Origin: 'https://attacker.example'})).status, 403, route);
    assert.equal((await x.call(route, request, {'Sec-Fetch-Site': 'cross-site'})).status, 403, route);
  }
  assert.equal((await x.call('/api/ratings', undefined, {Cookie: ''})).status, 401);
  x.env.ADMIN_EMAILS += ',moderator@example.org';
  const headers = {'Cf-Access-Jwt-Assertion': await x.jwt({sub: 'moderator', email: 'moderator@example.org'})};
  const signed = await x.call('/api/login', {}, headers), session = await signed.json();
  const asModerator = {...headers, Cookie: signed.headers.get('Set-Cookie').split(';')[0], 'X-CSRF-Token': session.csrf};
  const refused = await x.call('/api/ratings/exclude', body, asModerator);
  assert.equal(refused.status, 403); assert.deepEqual(await refused.json(), {error: 'Only the publication owner can change which ratings count'});
  assert.equal((await x.call('/api/ratings/exclude', {...body, expected: undefined}, asModerator)).status, 403);
  assert.equal((await x.call('/api/ratings/restore', {reason: 'anything recorded'}, asModerator)).status, 403);
  assert.equal((await x.call('/api/ratings', undefined, asModerator)).status, 200);
  assert.equal(excludedCount(x), 0); assert.deepEqual(audit(x), []);
  delete x.env.RATINGS_DB;
  for (const [route, request] of [['/api/ratings'], ['/api/ratings/exclude', body], ['/api/ratings/restore', {reason: 'anything recorded'}]]) {
    const res = await x.call(route, request);
    assert.equal(res.status, 503, route); assert.deepEqual(await res.json(), {error: 'Ratings are not connected to the dashboard'});
  }
  assert.deepEqual(audit(x), []);
});
