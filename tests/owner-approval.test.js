import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../tools/admin/test-fixture.js';
import {isOwner, ownerConfigHash} from '../src/owner-authority.js';

async function setup(t) {
  const x = await fixture(); const original = globalThis.fetch; globalThis.fetch = x.fetcher; t.after(() => { globalThis.fetch = original; x.db.close(); });
  await x.login(); const sub = await x.seed(); const time = Math.floor(Date.now() / 1000);
  x.db.prepare("INSERT INTO admin_reviews(id,submission_id,revision,operation,payload,state,version,digest,created,updated) VALUES(?,?,1,'submission','{}','ready',1,'digest',?,?)").run('a'.repeat(24), sub.id, time, time);
  return x;
}
const approval = extra => ({id: 'a'.repeat(24), version: 1, digest: 'digest', content_reviewed: true, artwork_reviewed: true, ...extra});
const decisions = x => x.db.prepare("SELECT action,private_note FROM admin_history WHERE action LIKE 'exact-approval%'").all();
const state = x => x.db.prepare('SELECT state FROM admin_reviews').get().state;

test('a non-owner administrator cannot approve, override or expedite', async t => {
  const x = await setup(t); x.env.OWNER_ACCESS_SUB = 'different-owner';
  for (const extra of [{}, {override: true, reason: 'Missing developer is acceptable'}, {expedite: true}]) assert.equal((await x.call('/api/approve', approval(extra))).status, 403);
  assert.equal(state(x), 'ready'); assert.equal(decisions(x).length, 0); assert.equal(x.state.dispatched.length, 0);
});

test('missing or mismatched owner pins fail closed', async t => {
  for (const change of [x => { delete x.env.OWNER_ACCESS_EMAIL; }, x => { delete x.env.OWNER_ACCESS_SUB; }, x => x.db.exec('UPDATE publication_control SET authority_epoch=NULL,owner_config_hash=NULL'), x => { x.env.ADMIN_EMAILS = 'owner@example.org,other@example.org'; x.env.OWNER_ACCESS_EMAIL = 'other@example.org'; }]) {
    const x = await setup(t); change(x);
    assert.equal((await x.call('/api/approve', approval())).status, 403); assert.equal(state(x), 'ready');
  }
});

test('owner approval writes exactly one audit row; override needs a reason; expedite dispatches protected publication', async t => {
  let x = await setup(t);
  assert.equal((await x.call('/api/approve', approval({override: true, reason: ''}))).status, 400);
  assert.equal((await x.call('/api/approve', approval({override: true, reason: 'Developer name unknown; approved as is'}))).status, 200);
  assert.equal((await x.call('/api/approve', approval({override: true, reason: 'Developer name unknown; approved as is'}))).status, 409);
  assert.equal(state(x), 'approved'); assert.deepEqual(decisions(x).map(d => d.action), ['exact-approval-override']); assert.match(decisions(x)[0].private_note, /Developer name unknown/);
  assert.equal(x.state.dispatched.length, 0);
  x = await setup(t);
  const res = await x.call('/api/approve', approval({expedite: true}));
  assert.equal(res.status, 200); assert.equal((await res.json()).expedited, true);
  assert.deepEqual(decisions(x).map(d => d.action), ['exact-approval-expedited']);
  assert.equal(x.state.dispatched.length, 1); assert.match(JSON.stringify(x.state.dispatched[0]), /publish/);
  assert.equal(state(x), 'approved');
});

test('isOwner requires exact issuer, audience, subject, normalized email, allowlist and pinned hash', async () => {
  const env = {ACCESS_ISSUER: 'https://i.cloudflareaccess.com', ACCESS_AUD: 'aud', ADMIN_EMAILS: 'owner@example.org,second@example.org', OWNER_ACCESS_SUB: 'owner', OWNER_ACCESS_EMAIL: 'Owner@Example.org'};
  const control = {authority_epoch: 1, owner_config_hash: await ownerConfigHash({issuer: env.ACCESS_ISSUER, audience: 'aud', subject: 'owner', email: 'owner@example.org'})};
  const claims = {iss: env.ACCESS_ISSUER, aud: ['aud'], sub: 'owner', email: 'OWNER@example.org'};
  assert.equal(await isOwner(claims, env, control), true);
  for (const bad of [{sub: 'second', email: 'second@example.org'}, {sub: 'owner2'}, {email: 'x@example.org'}, {iss: 'https://x.cloudflareaccess.com'}, {aud: ['other']}]) assert.equal(await isOwner({...claims, ...bad}, env, control), false);
  assert.equal(await isOwner(claims, env, {...control, owner_config_hash: 'x'.repeat(43)}), false);
  assert.equal(await isOwner(claims, env, null), false);
  assert.equal(await isOwner(claims, {...env, ADMIN_EMAILS: 'second@example.org'}, control), false);
  assert.equal(await isOwner(claims, {...env, OWNER_ACCESS_SUB: ''}, control), false);
});
