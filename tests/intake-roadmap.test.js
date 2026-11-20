import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import worker, {handle, random, digest, notify} from '../intake/worker.js';

const origin = 'https://site.example', api = 'https://intake.example', adminOrigin = 'https://admin.example.org', owner = 'owner@example.org';
function binding(db) {
  return {
    prepare(query) {
      return {bind(...args) {
        const stmt = db.prepare(query);
        return {first: async () => stmt.get(...args) || null, run: async () => ({meta: {changes: Number(stmt.run(...args).changes)}}), all: async () => ({results: stmt.all(...args)})};
      }};
    },
    batch: async statements => { for (const statement of statements) await statement.run(); }
  };
}
function mailer() {
  const sent = [];
  return {sent, fails: false, async send(message) { if (this.fails) throw Object.assign(new Error('E_RECIPIENT_NOT_ALLOWED'), {code: 'E_RECIPIENT_NOT_ALLOWED'}); sent.push(message); return {messageId: 'm' + sent.length}; }};
}
async function setup(t, overrides = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(await fs.readFile(new URL('../intake/migrations/0001_submissions.sql', import.meta.url), 'utf8'));
  const admin = random();
  const mail = mailer();
  const env = {DB: binding(db), INTAKE_ENABLED: 'true', SITE_ORIGIN: origin, API_ORIGIN: api, RATE_SALT: random(), TURNSTILE_SECRET: 'secret', ADMIN_HASH: await digest(admin), MAX_PENDING: '300', NOTIFY_EMAIL: mail, NOTIFY_TO: owner, ADMIN_ORIGIN: adminOrigin, ...overrides};
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).startsWith('https://challenges.cloudflare.com/')) return Response.json({success: true, hostname: new URL(origin).hostname});
    if (url === origin + '/catalog.json') return Response.json({projects: [{id: 'ext-abcdefghijkl', title: 'Existing Hack'}]});
    throw Error('unexpected request ' + url);
  };
  const realNow = Date.now;
  const clock = {at: null};
  Date.now = () => clock.at === null ? realNow() : clock.at * 1000;
  t.after(() => { globalThis.fetch = original; Date.now = realNow; db.close(); });
  let ip = 0;
  const call = (path, data, headers = {}) => handle(new Request(api + path, {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.' + (++ip % 250), ...headers}, body: JSON.stringify(data)}), env);
  const decide = (id, state, public_note) => handle(new Request(api + '/admin/decision', {method: 'POST', headers: {Authorization: 'Bearer ' + admin, 'Content-Type': 'application/json'}, body: JSON.stringify({id, state, public_note})}), env);
  const stored = (id = 1) => JSON.parse(db.prepare('SELECT payload FROM submissions WHERE id=?').get(id).payload);
  const status = async receipt => (await call('/status', {receipt})).json();
  return {db, env, mail, clock, call, decide, stored, status};
}
const suggestion = (over = {}) => ({kind: 'suggest', url: 'https://forum.example.org/threads/new-hack.77/', title: 'New Hack', category: 'rom-hack', description: 'A new ROM hack found on a public forum thread.', token: 'human-token-123', ...over});
async function submit(x, over) {
  const response = await x.call('/submissions', suggestion(over));
  assert.equal(response.status, 201);
  return (await response.json()).receipt;
}

test('two request-and-reply rounds keep the original note and both replies in order with server times', async t => {
  const x = await setup(t);
  const receipt = await submit(x, {note: 'Original message.'});
  await x.decide(1, 'needs-changes', 'Who made it?');
  x.clock.at = 1800000000;
  assert.equal((await x.call('/revise', {receipt, changes: {note: 'First reply.', at: 5}})).status, 200);
  await x.decide(1, 'needs-changes', 'Anything else?');
  x.clock.at = 1800000600;
  assert.equal((await x.call('/revise', {receipt, changes: {note: 'Second reply.'}})).status, 200);
  const payload = x.stored();
  assert.equal(payload.note, 'Original message.');
  assert.deepEqual(payload.replies, [{at: 1800000000, text: 'First reply.'}, {at: 1800000600, text: 'Second reply.'}]);
  assert.equal(payload.replies_dropped, undefined);
  assert.equal(payload.at, undefined);
});

test('a reply to a submission without a note adds no note, and rounds without a reply carry the history over', async t => {
  const x = await setup(t);
  const receipt = await submit(x);
  await x.decide(1, 'needs-changes', 'Who made it?');
  x.clock.at = 1800000000;
  await x.call('/revise', {receipt, changes: {note: '  Sir   Hacker.  '}});
  assert.equal(x.stored().note, undefined);
  assert.deepEqual(x.stored().replies, [{at: 1800000000, text: 'Sir Hacker.'}]);
  await x.decide(1, 'needs-changes', 'Fix the name');
  assert.equal((await x.call('/revise', {receipt, changes: {title: 'Better Name'}})).status, 200);
  assert.equal(x.stored().title, 'Better Name');
  assert.deepEqual(x.stored().replies, [{at: 1800000000, text: 'Sir Hacker.'}, {at: 1800000000, text: 'Changed details without a message.'}]);
  await x.decide(1, 'needs-changes', 'Again');
  assert.equal((await x.call('/revise', {receipt, changes: {note: '   ', creator: 'Team'}})).status, 200);
  assert.equal(x.stored().creator, 'Team');
  assert.equal(x.stored().note, undefined);
  assert.equal(x.stored().replies.length, 3);
  assert.equal(x.stored().replies[2].text, 'Changed details without a message.');
});

test('a blank note in a revision never erases the original message', async t => {
  const x = await setup(t);
  const receipt = await submit(x, {note: 'Original message.'});
  await x.decide(1, 'needs-changes', 'Fix');
  assert.equal((await x.call('/revise', {receipt, changes: {note: '', creator: 'Team'}})).status, 200);
  assert.equal(x.stored().note, 'Original message.');
  assert.deepEqual(x.stored().replies.map(reply => reply.text), ['Changed details without a message.']);
});

test('a revision without a message stores one server-made reply and reads as answered; a written reply stores only its text', async t => {
  const x = await setup(t);
  const receipt = await submit(x, {note: 'Original message.'});
  await x.decide(1, 'needs-changes', 'Please give the project a clearer name.');
  x.clock.at = 1800000000;
  assert.equal((await x.status(receipt)).answered, undefined);
  assert.equal((await x.call('/revise', {receipt, changes: {title: 'Clearer Name', at: 5}})).status, 200);
  assert.deepEqual(x.stored().replies, [{at: 1800000000, text: 'Changed details without a message.'}]);
  assert.equal(x.stored().title, 'Clearer Name');
  assert.equal(x.stored().note, 'Original message.');
  const received = await x.status(receipt);
  assert.equal(received.status, 'received');
  assert.equal(received.answered, true);
  assert.equal(received.message, 'We have your reply. A person will read it. Check this page again for our answer.');
  await x.decide(1, 'in-review', 'Please give the project a clearer name.');
  assert.equal((await x.status(receipt)).answered, true);
  await x.decide(1, 'needs-changes', 'And the creator?');
  x.clock.at = 1800000600;
  assert.equal((await x.call('/revise', {receipt, changes: {note: 'Written reply.', creator: 'Team'}})).status, 200);
  assert.deepEqual(x.stored().replies, [{at: 1800000000, text: 'Changed details without a message.'}, {at: 1800000600, text: 'Written reply.'}]);
});

test('a revision without a message goes through the 8192 limit and drops the oldest reply first', async t => {
  const x = await setup(t);
  const receipt = await submit(x, {note: 'Original message.'});
  const seeded = {...x.stored(), replies: Array.from({length: 15}, (_, i) => ({at: 1700000000 + i, text: String(i).padEnd(490, 'r')})), replies_dropped: 2};
  seeded.replies[14].text += 'r'.repeat(8190 - JSON.stringify(seeded).length);
  assert.equal(JSON.stringify(seeded).length, 8190);
  x.db.prepare(`UPDATE submissions SET payload=?, state='needs-changes' WHERE id=1`).run(JSON.stringify(seeded));
  x.clock.at = 1800000000;
  assert.equal((await x.call('/revise', {receipt, changes: {creator: 'Team'}})).status, 200);
  const raw = x.db.prepare('SELECT payload FROM submissions WHERE id=1').get().payload;
  assert.ok(raw.length <= 8192);
  const payload = JSON.parse(raw);
  assert.equal(payload.note, 'Original message.');
  assert.equal(payload.replies_dropped, 3);
  assert.equal(payload.replies[0].at, 1700000001);
  assert.deepEqual(payload.replies.at(-1), {at: 1800000000, text: 'Changed details without a message.'});
});

test('visitor-supplied replies and replies_dropped cannot rewrite or erase stored history', async t => {
  const x = await setup(t);
  const receipt = await submit(x, {note: 'Original message.'});
  await x.decide(1, 'needs-changes', 'Who?');
  x.clock.at = 1800000000;
  await x.call('/revise', {receipt, changes: {note: 'Real first.'}});
  const history = x.stored().replies;
  let at = 1800000100;
  for (const forged of [[{at: 1, text: 'forged'}], [], 'forged string', null]) {
    await x.decide(1, 'needs-changes', 'More?');
    x.clock.at = at;
    assert.equal((await x.call('/revise', {receipt, changes: {note: 'Real ' + at, replies: forged, replies_dropped: 99}})).status, 200);
    history.push({at, text: 'Real ' + at});
    assert.deepEqual(x.stored().replies, history);
    assert.equal(x.stored().replies_dropped, undefined);
    assert.equal(x.stored().note, 'Original message.');
    at += 100;
  }
  await x.decide(1, 'needs-changes', 'Only forge');
  x.clock.at = at;
  assert.equal((await x.call('/revise', {receipt, changes: {creator: 'Team', replies: []}})).status, 200);
  history.push({at, text: 'Changed details without a message.'});
  assert.deepEqual(x.stored().replies, history);
});

test('history over 8192 characters drops the oldest replies first and counts them', async t => {
  const x = await setup(t);
  const receipt = await submit(x, {note: 'Original message.'});
  const seeded = {...x.stored(), replies: Array.from({length: 15}, (_, i) => ({at: 1700000000 + i, text: String(i).padEnd(490, 'r')})), replies_dropped: 2};
  assert.ok(JSON.stringify(seeded).length <= 8192);
  x.db.prepare(`UPDATE submissions SET payload=?, state='needs-changes' WHERE id=1`).run(JSON.stringify(seeded));
  x.clock.at = 1800000000;
  assert.equal((await x.call('/revise', {receipt, changes: {note: 'n'.repeat(500)}})).status, 200);
  const raw = x.db.prepare('SELECT payload FROM submissions WHERE id=1').get().payload;
  assert.ok(raw.length <= 8192);
  const payload = JSON.parse(raw);
  assert.equal(payload.note, 'Original message.');
  assert.equal(payload.replies_dropped, 3);
  assert.equal(payload.replies.length, 15);
  assert.equal(payload.replies[0].at, 1700000001);
  assert.deepEqual(payload.replies.at(-1), {at: 1800000000, text: 'n'.repeat(500)});
});

test('a reply that cannot fit even alone returns 413 and changes nothing', async t => {
  const x = await setup(t);
  const artwork = Array.from({length: 4}, (_, i) => `https://img.example.org/${i}/`.padEnd(496, 'a') + '.png');
  const receipt = await submit(x, {description: '"'.repeat(2000), note: '"'.repeat(500), artwork, patch_url: 'https://files.example.org/'.padEnd(500, 'p')});
  await x.decide(1, 'needs-changes', 'Reply please');
  const before = x.db.prepare('SELECT payload, state, updated FROM submissions WHERE id=1').get();
  assert.ok(before.payload.length + JSON.stringify({replies: [{at: 1800000000, text: '"'.repeat(500)}]}).length > 8192);
  const response = await x.call('/revise', {receipt, changes: {note: '"'.repeat(500)}});
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, 'That is too much text; shorten it and try again.');
  assert.deepEqual(x.db.prepare('SELECT payload, state, updated FROM submissions WHERE id=1').get(), before);
});

test('status reports answered after a reply while received or in review, and not before', async t => {
  const x = await setup(t);
  const receipt = await submit(x);
  const fresh = await x.status(receipt);
  assert.equal(fresh.answered, undefined);
  assert.equal(fresh.message, 'We have your submission. A person will review it before anything is published.');
  await x.decide(1, 'in-review');
  assert.equal((await x.status(receipt)).answered, undefined);
  await x.decide(1, 'needs-changes', 'Who made it?');
  assert.equal((await x.status(receipt)).answered, undefined);
  await x.call('/revise', {receipt, changes: {creator: 'No reply here'}});
  assert.equal((await x.status(receipt)).answered, true);
  await x.decide(1, 'needs-changes', 'Who made it?');
  await x.call('/revise', {receipt, changes: {note: 'Sir Hacker.'}});
  const received = await x.status(receipt);
  assert.equal(received.status, 'received');
  assert.equal(received.answered, true);
  assert.equal(received.message, 'We have your reply. A person will read it. Check this page again for our answer.');
  assert.equal(received.note, 'Who made it?');
  await x.decide(1, 'in-review', 'Who made it?');
  const review = await x.status(receipt);
  assert.equal(review.answered, true);
  assert.equal(review.message, 'We have your reply. A person will read it. Check this page again for our answer.');
  await x.decide(1, 'needs-changes', 'One more thing');
  const waiting = await x.status(receipt);
  assert.equal(waiting.answered, undefined);
  assert.equal(waiting.message, 'We need a little more information before we can continue.');
  await x.decide(1, 'approved');
  assert.equal((await x.status(receipt)).answered, undefined);
});

test('notify sends once when the received count rises, not when equal, and again after a fall and a rise', async t => {
  const x = await setup(t);
  const receipts = [await submit(x, {url: 'https://forum.example.org/threads/a.1/'}), await submit(x, {url: 'https://forum.example.org/threads/b.2/'})];
  assert.equal(x.mail.sent.length, 0);
  await notify(x.env);
  assert.equal(x.mail.sent.length, 1);
  assert.deepEqual(x.mail.sent[0], {to: owner, from: 'notifications' + String.fromCharCode(64) + new URL(origin).hostname, subject: '2 submission(s) waiting for review', text: '2 submission(s) waiting for review\n' + adminOrigin});
  await notify(x.env);
  assert.equal(x.mail.sent.length, 1);
  await x.decide(1, 'in-review');
  await notify(x.env);
  assert.equal(x.mail.sent.length, 1);
  assert.equal(x.db.prepare(`SELECT count FROM limits WHERE key='notify:received'`).get().count, 1);
  await submit(x, {url: 'https://forum.example.org/threads/c.3/'});
  await notify(x.env);
  assert.equal(x.mail.sent.length, 2);
  assert.equal(x.mail.sent[1].subject, '2 submission(s) waiting for review');
  const row = x.db.prepare(`SELECT count, expires FROM limits WHERE key='notify:received'`).get();
  assert.equal(row.count, 2);
  assert.ok(Math.abs(row.expires - (Math.floor(Date.now() / 1000) + 30 * 86400)) <= 5);
  assert.equal(receipts.length, 2);
});

test('the notification holds only the count and the dashboard address', async t => {
  const x = await setup(t);
  const secret = {url: 'https://secret.example.org/hidden-project/', title: 'Secret Title Words', description: 'Private description text that must stay out of mail.', note: 'Private note for moderators only.', creator: 'Hidden Creator'};
  const receipt = await submit(x, secret);
  await notify(x.env);
  const [message] = x.mail.sent;
  assert.deepEqual(Object.keys(message).sort(), ['from', 'subject', 'text', 'to']);
  assert.equal(message.text, '1 submission(s) waiting for review\n' + adminOrigin);
  const body = message.subject + '\n' + message.text;
  for (const value of [...Object.values(secret), receipt, await digest(receipt), 'forum', 'hidden']) assert.equal(body.includes(value), false, value);
});

test('a throwing send neither rejects nor stops cleanup, and is retried on the next run', async t => {
  const x = await setup(t);
  await submit(x);
  x.db.prepare('INSERT INTO limits(key,count,expires) VALUES(?,?,?)').run('old:1', 1, 1);
  x.mail.fails = true;
  await assert.doesNotReject(notify(x.env));
  assert.equal(x.db.prepare(`SELECT count(*) n FROM limits WHERE key='notify:received'`).get().n, 0);
  const waits = [];
  await worker.scheduled({}, x.env, {waitUntil: promise => waits.push(promise)});
  assert.equal(waits.length, 2);
  assert.deepEqual((await Promise.allSettled(waits)).map(r => r.status), ['fulfilled', 'fulfilled']);
  assert.equal(x.db.prepare(`SELECT count(*) n FROM limits WHERE key='old:1'`).get().n, 0);
  assert.equal(x.mail.sent.length, 0);
  x.mail.fails = false;
  const next = [];
  await worker.scheduled({}, x.env, {waitUntil: promise => next.push(promise)});
  await Promise.all(next);
  assert.equal(x.mail.sent.length, 1);
  assert.equal(x.db.prepare(`SELECT count FROM limits WHERE key='notify:received'`).get().count, 1);
});

test('a database failure inside notify does not reject the scheduled run or stop cleanup', async t => {
  const x = await setup(t);
  const real = x.env.DB;
  let cleaned = false;
  x.env.DB = {prepare: query => { if (query.includes('notify:received') || query.includes(`state='received'`)) throw Error('D1 down'); return real.prepare(query); }, batch: async s => { cleaned = true; return real.batch(s); }};
  const waits = [];
  await worker.scheduled({}, x.env, {waitUntil: promise => waits.push(promise)});
  assert.deepEqual((await Promise.allSettled(waits)).map(r => r.status), ['fulfilled', 'fulfilled']);
  assert.equal(cleaned, true);
  assert.equal(x.mail.sent.length, 0);
});

test('creating and revising submissions never sends mail', async t => {
  const x = await setup(t);
  const receipt = await submit(x, {note: 'Hello.'});
  await x.decide(1, 'needs-changes', 'Who?');
  await x.call('/revise', {receipt, changes: {note: 'Reply.'}});
  await x.status(receipt);
  assert.equal(x.mail.sent.length, 0);
});

test('nothing is sent or queried when the binding, recipient or dashboard address is missing or malformed', async t => {
  const x = await setup(t);
  const variants = [
    {NOTIFY_EMAIL: undefined}, {NOTIFY_EMAIL: {}}, {NOTIFY_EMAIL: {send: 'no'}},
    {NOTIFY_TO: undefined}, {NOTIFY_TO: ''}, {NOTIFY_TO: ['x']},
    {ADMIN_ORIGIN: undefined}, {ADMIN_ORIGIN: ''}, {ADMIN_ORIGIN: 'http://admin.example.org'}, {ADMIN_ORIGIN: 'https://admin.example.org/'}, {ADMIN_ORIGIN: 'https://admin.example.org/path'}, {ADMIN_ORIGIN: 'https://evil.example?x=1'}, {ADMIN_ORIGIN: 'https://Admin.example.org'}, {ADMIN_ORIGIN: 'https://admin.example.org\nhttps://evil.example'},
    {INTAKE_ENABLED: 'false'}, {INTAKE_ENABLED: undefined}
  ];
  for (const variant of variants) {
    let queries = 0;
    const env = {...x.env, DB: {prepare: () => { queries++; throw Error('queried'); }, batch: async () => { queries++; }}, ...variant};
    assert.equal(await notify(env), undefined);
    assert.equal(queries, 0, JSON.stringify(variant));
  }
  assert.equal(x.mail.sent.length, 0);
});

test('the committed intake config has no mail binding, adds only ADMIN_ORIGIN, and keeps notification off', async t => {
  const config = JSON.parse(await fs.readFile(new URL('../intake/wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(Object.hasOwn(config, 'send_email'), false);
  assert.equal(config.vars.ADMIN_ORIGIN, 'https://admin.legacyofgokuhub.com');
  assert.deepEqual(Object.keys(config.vars).sort(), ['ADMIN_ORIGIN', 'API_ORIGIN', 'INTAKE_ENABLED', 'MAX_PENDING', 'SITE_ORIGIN']);
  assert.equal(JSON.stringify(config).includes(String.fromCharCode(64)), false);
  const ignored = (await fs.readFile(new URL('../.gitignore', import.meta.url), 'utf8')).split(/\r?\n/);
  assert.ok(ignored.includes('intake/wrangler.private.jsonc'));
  let queries = 0;
  const env = {...config.vars, INTAKE_ENABLED: 'true', DB: {prepare: () => { queries++; throw Error('queried'); }}};
  await notify(env);
  const waits = [];
  await worker.scheduled({}, {...env, INTAKE_ENABLED: 'false'}, {waitUntil: promise => waits.push(promise)});
  await Promise.all(waits);
  assert.equal(queries, 0);
});
