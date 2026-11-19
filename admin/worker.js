import {digest, random} from '../intake/worker.js';
import {isOwner} from '../src/owner-authority.js';
import {validateSubmission, LISTING_ID} from '../website/src/lib/submission.js';
import {projectKeys} from '../website/src/lib/urlkey.js';
import {identity, session, startSession, cookie, seconds, requireThat as check, sql, readBody, rate} from './auth.js';

const security = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'};
const json = (data, status = 200, headers = {}) => Response.json(data, {status, headers: {...security, ...headers}});
const note = (value = '', max = 1000) => { check(typeof value === 'string' && value.length <= max && !/[\x00-\x08\x0b-\x1f<>]/.test(value), 400, 'Messages cannot contain < or > or control characters.'); return value; };
const item = row => { const {receipt_hash, ...rest} = row; return {...rest, payload: JSON.parse(row.payload)}; };
const review = row => row && ({...row, payload: JSON.parse(row.payload), package: row.package ? JSON.parse(row.package) : null});
const history = (env, user, action, submission = null, id = null, pub = '', priv = '') => sql(env, 'INSERT INTO admin_history(submission_id,review_id,actor,action,public_note,private_note,created) VALUES(?,?,?,?,?,?,?)', submission, id, user, action, pub, priv, seconds());
async function github(env, path, method = 'GET', data, missing = false) {
  check(env.GH_DISPATCH_TOKEN && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.SOURCE_REPO), 503, 'GitHub connection is not configured');
  let response;
  for (let readAttempts = method === 'GET' ? 2 : 1; readAttempts--;) {
    response = await fetch(`https://api.github.com/repos/${env.SOURCE_REPO}${path}`, {method, headers: {Authorization: 'Bearer ' + env.GH_DISPATCH_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'loghub-admin', 'X-GitHub-Api-Version': '2022-11-28', ...(data ? {'Content-Type': 'application/json'} : {})}, body: data ? JSON.stringify(data) : undefined, redirect: 'manual', signal: AbortSignal.timeout(10000)}).catch(() => null);
    if (response && response.status < 500) break;
  }
  if (missing && response?.status === 404) return null;
  check(response?.ok, 503, 'GitHub request failed; retry later');
  return response.status === 204 ? null : response.json();
}
async function dispatch(env, id, action) {
  for (let left = 3; ; await new Promise(resolve => setTimeout(resolve, 300))) {
    try { return await github(env, '/actions/workflows/admin-review.yml/dispatches', 'POST', {ref: 'main', inputs: {review: id, action}}); }
    catch (error) { if (!--left) throw error; }
  }
}
async function startPublication(env, id) {
  const started = await sql(env, "UPDATE admin_reviews SET dispatched=?,error=NULL WHERE id=? AND state='approved' AND (dispatched IS NULL OR dispatched<?)", seconds(), id, seconds() - STALLED).run();
  check(started.meta.changes, 409, 'Publication has already started');
  try { await dispatch(env, id, 'publish'); } catch {
    await sql(env, "UPDATE admin_reviews SET dispatched=NULL,error='Publication could not start.' WHERE id=? AND state='approved'", id).run();
    check(false, 503, 'Publication could not start. Try again in a moment.');
  }
}
async function requireOwner(env, user, message) {
  const control = await sql(env, 'SELECT c.authority_epoch,c.owner_config_hash FROM publication_control c JOIN publication_authorities a ON a.epoch=c.authority_epoch AND a.config_hash=c.owner_config_hash WHERE c.id=1').first();
  check(await isOwner(user, env, control), 403, message);
}
async function catalog(env) {
  const response = await fetch(env.SITE_ORIGIN + '/catalog.json', {redirect: 'manual', signal: AbortSignal.timeout(6000), cache: 'no-store'});
  check(response.ok, 503, 'Catalog unavailable');
  const data = await response.json(); check(Array.isArray(data.projects), 503); return data.projects;
}
async function managedCatalog(env) {
  const projects = await catalog(env);
  const file = await github(env, '/contents/policy/publishing.json?ref=main');
  const policy = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0))));
  const rules = [...policy.projects, ...(policy.external_projects || [])];
  check(rules.filter(rule => rule.featured).length <= 1 && projects.filter(project => project.featured).length <= 1, 503, 'Conflicting featured assignments');
  for (const project of projects) project.published = true;
  for (const rule of rules) {
    if (!rule.project_id) continue;
    let project = projects.find(project => project.id === rule.project_id);
    if (!project) { project = {id: rule.project_id, title: rule.project_id, published: false}; projects.push(project); }
    project.moderation = rule.decision;
    project.feature_selected = rule.featured === true;
    project.feature_eligible = project.published && rule.decision === 'approved' && !(policy.revoked_owner_ids || []).includes(rule.owner_id);
  }
  return {projects, featured: projects.find(project => project.featured) || null};
}
async function currentReview(env, id) {
  check(/^[A-Za-z0-9_-]{24}$/.test(id || ''));
  const row = await sql(env, 'SELECT * FROM admin_reviews WHERE id=?', id).first(); check(row, 404, 'Review not found'); return row;
}
async function fresh(env, row) {
  if (!row.submission_id) return;
  const sub = await sql(env, 'SELECT revision FROM submissions WHERE id=?', row.submission_id).first();
  check(sub && sub.revision === row.revision, 409, 'The submission changed. Prepare it again.');
}
const STALLED = 300;
const act = (action, label) => ({action, label});
const attention = (message, actions, more = {}) => ({stage: 'attention', message, actions, ...more});
const IMAGE_ERROR = /^(?:image|artwork)\b/i, UNCHANGED = 'Nothing has changed from the published listing.';
const plain = error => /Main changed/.test(error || '') ? 'The site changed after this was approved, so the approval no longer matches it. Nothing was published.'
  : IMAGE_ERROR.test(error || '') ? (/HTTP \d{3}/.test(error) || /^Artwork (?:unavailable|changed)/.test(error) ? 'An image could not be downloaded or no longer matches what was reviewed.' : 'An image was refused: ' + error + '.')
  : error === UNCHANGED ? UNCHANGED
  : 'This could not finish. Try again, or discard it.';
const SAME = '(submission_id=? OR (? IS NULL AND submission_id IS NULL AND project_id=? AND operation=?))';
const REPLACEABLE = `id=? AND state IN ('failed','dispatch-failed','ready') AND ${SAME}`;
const OPEN = "('received','in-review','needs-changes','approved')", NEW = "('received','in-review')";
const BUCKET = "CASE WHEN state IN ('failed','dispatch-failed') OR (state='queued' AND updated<=?1-300) OR (state='processing' AND updated<=?1-900) OR (state='approved' AND ((dispatched IS NULL AND error IS NOT NULL) OR dispatched<=?1-300)) OR (state='publishing' AND updated<=?1-600) OR (state='pr-open' AND error IS NOT NULL) THEN 'attention' WHEN state='ready' THEN 'ready' WHEN state IN ('approved','publishing','pr-open') THEN 'publishing' END";
async function publication(env, row) {
  const age = seconds() - row.updated, retry = act('reprepare', row.approved_digest ? 'Prepare a new review' : 'Try again'), discard = act('discard', 'Discard unfinished review'), recheck = act('check', 'Check publication');
  const live = {stage: 'published', message: row.error ? 'The change is live. It was merged by hand on GitHub because automatic merge could not be turned on.' : 'The change is live.', live_url: ['feature', 'unfeature'].includes(row.operation) ? env.SITE_ORIGIN + '/' : env.SITE_ORIGIN + '/projects/' + row.project_id + '/'};
  const withdrawn = {stage: 'published', message: 'The change is live. The listing is no longer shown on the site.'};
  if (row.state === 'published') return live;
  if (row.state === 'withdrawn') return withdrawn;
  if (row.state === 'ready') return {stage: 'review'};
  if (row.state === 'queued' || row.state === 'processing') return age < STALLED * (row.state === 'queued' ? 1 : 3) ? {stage: 'preparing'} : attention(row.state === 'queued' ? 'Preparation has not started after 5 minutes.' : 'Preparation has not finished after 15 minutes.', [retry, discard]);
  if (row.state === 'dispatch-failed') return attention('Preparation could not start.', [retry, discard]);
  if (row.state === 'failed') {
    const actions = [retry, discard];
    if (IMAGE_ERROR.test(row.error || '') && ['submission', 'edit'].includes(row.operation) && JSON.parse(row.payload).omit_artwork !== true) actions.push(act('reprepare-plain', 'Prepare without artwork'));
    const newer = /^Main changed:/.test(row.error || '') && await sql(env, `SELECT 1 FROM admin_reviews WHERE created>? AND ${SAME} LIMIT 1`, row.created, row.submission_id, row.submission_id, row.project_id, row.operation).first();
    return attention(plain(row.error), actions, newer === null ? {auto: 'reprepare'} : {});
  }
  if (row.state === 'approved') {
    if (!row.dispatched) return row.error ? attention(row.error, [act('publish', 'Try again'), discard]) : {stage: 'approved', message: 'Your approval has been recorded.', actions: [act('publish', 'Publish now'), discard]};
    return seconds() - row.dispatched < STALLED ? {stage: 'publishing', message: 'Publication is starting.'} : attention('Publication has not started after 5 minutes.', [act('publish', 'Try again'), discard]);
  }
  if (row.state === 'publishing') {
    if (age < STALLED * 2) return {stage: 'publishing', message: 'Publication is starting.'};
    const found = (await github(env, `/pulls?state=all&head=${env.SOURCE_REPO.split('/')[0]}%3Aadmin/${row.id}`)).find(p => p.base.ref === 'main' && p.head.repo?.full_name === env.SOURCE_REPO);
    if (!found) return attention('Publication stopped before it finished. Nothing was published.', [retry, discard]);
    const manual = found.auto_merge ? null : 'Automatic merge was not turned on. Merge the pull request on GitHub.';
    await sql(env, "UPDATE admin_reviews SET pr=?,state='pr-open',error=?,version=version+1,updated=? WHERE id=? AND state='publishing'", found.number, manual, seconds(), row.id).run();
    row = {...row, pr: found.number, state: 'pr-open', error: manual};
  }
  if (row.state !== 'pr-open') return {stage: 'closed'};
  const pr = await github(env, '/pulls/' + row.pr), links = {url: pr.html_url};
  if (!pr.merged) {
    if (pr.state !== 'open') return attention('The publication request was closed before anything was published.', [retry, discard], links);
    if (['behind', 'dirty'].includes(pr.mergeable_state)) return attention('The site changed after this was approved, so this approval can no longer be published.', [retry, discard], links);
    const [checks, combined, required] = await Promise.all([github(env, `/commits/${pr.head.sha}/check-runs`), github(env, `/commits/${pr.head.sha}/status`), github(env, '/branches/main/protection/required_status_checks')]);
    const names = [...(required.contexts || []), ...(required.checks || []).map(c => c.context)];
    const failed = checks.check_runs.find(c => names.includes(c.name) && c.status === 'completed' && !['success', 'neutral', 'skipped'].includes(c.conclusion)) || (combined.statuses || []).find(s => names.includes(s.context) && ['failure', 'error'].includes(s.state));
    if (failed) return attention(`The automated check “${failed.name || failed.context}” failed, so nothing was published.`, [recheck, retry], {...links, detail_url: failed.html_url || failed.target_url});
    if (!pr.auto_merge) return attention(row.error || 'Automatic merge is off for this change. Merge the pull request on GitHub.', [recheck, retry], links);
    return {stage: 'checks', message: 'Automated checks are running.'};
  }
  const deploying = {stage: 'deploying', message: 'The approved change is being published.'};
  const runs = (await github(env, '/actions/workflows/catalog.yml/runs?branch=main&per_page=20')).workflow_runs.filter(r => r.event !== 'pull_request');
  const covers = async run => ['identical', 'ahead'].includes((await github(env, `/compare/${pr.merge_commit_sha}...${run.head_sha}`)).status);
  const latest = runs[0];
  if (latest?.status === 'completed' && latest.conclusion !== 'success' && await covers(latest)) {
    if (latest.run_attempt === 1) { await github(env, `/actions/runs/${latest.id}/rerun-failed-jobs`, 'POST').catch(() => {}); return deploying; }
    const job = (await github(env, `/actions/runs/${latest.id}/jobs?per_page=100`)).jobs.find(j => j.conclusion && !['success', 'skipped'].includes(j.conclusion));
    return attention(`Publishing the site failed${job ? ` at the “${job.name}” step` : ''}. The live site is unchanged.`, [latest.run_attempt < 3 ? act('redeploy', 'Try again') : recheck], {detail_url: latest.html_url, run: latest.id});
  }
  const manifestResponse = await fetch(env.SITE_ORIGIN + '/deployment-manifest.json', {cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(6000)});
  if (!manifestResponse.ok) return deploying;
  const manifest = await manifestResponse.json();
  const run = runs.find(r => r.conclusion === 'success' && r.head_sha === manifest.build_commit);
  if (!run || !await covers(run)) return deploying;
  const jobs = await github(env, `/actions/runs/${run.id}/jobs?per_page=100`);
  if (!['synchronize', 'backup', 'anchor', 'publish', 'website', 'deploy-website'].every(name => jobs.jobs.some(j => j.name === name && j.conclusion === 'success'))) return deploying;
  const projects = await catalog(env), listed = projects.find(p => p.id === row.project_id);
  const absent = ['suspend', 'delist'].includes(row.operation);
  if (absent ? Boolean(listed) : !listed) return deploying;
  if (!absent && (row.operation === 'feature' || JSON.parse(row.package).rule?.featured === true) && (!listed.featured || projects.filter(project => project.featured).length !== 1)) return deploying;
  if (row.operation === 'unfeature' && projects.some(project => project.featured)) return deploying;
  const changes = [sql(env, "UPDATE admin_reviews SET state=?,version=version+1,updated=? WHERE id=? AND state='pr-open'", absent ? 'withdrawn' : 'published', seconds(), row.id), sql(env, "INSERT INTO admin_history(submission_id,review_id,actor,action,created) SELECT ?,?,'verifier','verified-live',? WHERE changes()=1", row.submission_id, row.id, seconds())];
  if (row.submission_id && !absent) changes.push(sql(env, "UPDATE submissions SET state='published',updated=? WHERE id=? AND revision=? AND state='approved'", seconds(), row.submission_id, row.revision));
  await env.DB.batch(changes);
  return absent ? withdrawn : live;
}
const BUSY = "NOT EXISTS (SELECT 1 FROM admin_reviews WHERE submission_id=?1 AND state IN ('approved','publishing','pr-open'))";
const BUSY_TEXT = 'A publication for this submission is still in progress. Wait for it to finish, or discard its unfinished review first.';
const marks = list => list.map(() => '?').join(',');
async function twins(env, rows) {
  const keys = [...new Set(rows.map(row => row.url_key).filter(Boolean))];
  const found = keys.length ? (await sql(env, `SELECT id,url_key,payload,state,created FROM submissions WHERE url_key IN (${marks(keys)}) ORDER BY id LIMIT 200`, ...keys).all()).results : [];
  return row => found.filter(other => other.id !== row.id && other.url_key === row.url_key).map(other => { const payload = JSON.parse(other.payload); return {id: other.id, title: payload.title || 'Untitled submission', url: payload.url || '', created: other.created, state: other.state}; });
}
const UNUSUAL = {minimum: 5, share: 2};
const RATINGS_CHANGED = 'These ratings changed; check again.';
const rsql = (env, query, ...args) => env.RATINGS_DB.prepare(query).bind(...args);
const ONE_TIME = 'NOT EXISTS (SELECT 1 FROM votes o WHERE o.credential_hash=v.credential_hash AND o.project_id<>v.project_id)';
const GROUP = `FROM votes v WHERE v.project_id=? AND v.score=? AND v.excluded=0 AND ${ONE_TIME}`;
const EXCLUDE = `INSERT INTO excluded_credentials(credential_hash,reason) SELECT v.credential_hash,? ${GROUP} AND (SELECT count(*) ${GROUP})=?`;
const TOTALS = 'SELECT total,count FROM totals WHERE project_id=?';
const aggregate = row => ({count: row?.count || 0, average: row?.count ? row.total / row.count : null});
async function ratings(env) {
  check(env.RATINGS_DB, 503, 'Ratings are not connected to the dashboard');
  const [projects, totals, scores, exclusions, log] = await Promise.all([catalog(env),
    rsql(env, 'SELECT project_id,total,count FROM totals').all(),
    rsql(env, `SELECT project_id,score,sum(excluded=0) counted,sum(excluded) excluded,sum(excluded=0 AND ${ONE_TIME}) only_here FROM votes v GROUP BY project_id,score`).all(),
    rsql(env, 'SELECT e.reason,count(DISTINCT e.credential_hash) credentials,count(v.project_id) votes FROM excluded_credentials e LEFT JOIN votes v ON v.credential_hash=e.credential_hash GROUP BY e.reason ORDER BY e.reason').all(),
    sql(env, "SELECT created,actor,action,private_note FROM admin_history WHERE action IN ('ratings-exclude','ratings-exclude-result','ratings-restore','ratings-restore-result') ORDER BY id DESC LIMIT 50").all()]);
  return {projects: projects.map(p => {
    const row = totals.results.find(t => t.project_id === p.id), {count, average} = aggregate(row);
    const list = [1, 2, 3, 4, 5, 6, 7].map(score => { const s = scores.results.find(r => r.project_id === p.id && r.score === score) || {counted: 0, excluded: 0, only_here: 0}; return {score, counted: s.counted, excluded: s.excluded, only_here: s.only_here >= UNUSUAL.minimum ? s.only_here : 0}; });
    const counted = list.reduce((n, s) => n + s.counted, 0), total = list.reduce((n, s) => n + s.score * s.counted, 0);
    return {id: p.id, title: p.title, count, average, excluded: list.reduce((n, s) => n + s.excluded, 0), scores: list, unusual: list.some(s => s.only_here >= UNUSUAL.minimum && s.only_here * UNUSUAL.share >= count), consistent: count === counted && (row?.total || 0) === total};
  }), exclusions: exclusions.results, log: log.results};
}
async function audited(env, user, action, intent, statement) {
  await history(env, user.email, action, null, null, '', intent).run();
  let result = 'failed';
  try { const done = await statement(); result = String(done.meta.changes); return done.meta.changes; }
  finally { await history(env, user.email, action + '-result', null, null, '', result).run(); }
}

async function processor(request, env, path) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  check(token && env.PROCESSOR_HASH && await digest(token) === env.PROCESSOR_HASH, 401, 'Processor credential required');
  const id = path.split('/')[2], row = await currentReview(env, id);
  await fresh(env, row);
  if (request.method === 'GET') {
    if (path.endsWith('/file')) {
      const u = new URL(request.url), name = u.searchParams.get('name'), part = Number(u.searchParams.get('part'));
      const file = await sql(env, 'SELECT data FROM admin_files WHERE review_id=? AND name=? AND part=?', id, name, part).first(); check(file, 404); return json(file);
    }
    const result = review(row);
    if (row.submission_id) result.challenge = (await sql(env, 'SELECT challenge FROM submissions WHERE id=?', row.submission_id).first())?.challenge;
    return json(result);
  }
  const data = await readBody(request, 400000);
  if (path.endsWith('/claim')) {
    const from = data.action === 'publish' ? 'approved' : 'queued', to = data.action === 'publish' ? 'publishing' : 'processing';
    const r = await sql(env, 'UPDATE admin_reviews SET state=?,version=version+1,updated=? WHERE id=? AND state=?', to, seconds(), id, from).run(); check(r.meta.changes, 409, 'Job already claimed');
    return json({state: to});
  }
  if (path.endsWith('/file')) {
    check(row.state === 'processing', 409);
    check(/^(?:(?:cover|screenshot-[1-6])\.(?:png|jpg|jpeg|webp)|preview-[0-6]\.webp)$/.test(data.name) && Number.isInteger(data.part) && data.part >= 0 && data.part < 28 && typeof data.data === 'string' && data.data.length <= 262144 && /^[A-Za-z0-9+/]*={0,2}$/.test(data.data));
    await sql(env, 'INSERT INTO admin_files(review_id,name,part,data) VALUES(?,?,?,?) ON CONFLICT(review_id,name,part) DO UPDATE SET data=excluded.data', id, data.name, data.part, data.data).run(); return json({ok: true});
  }
  if (path.endsWith('/ready')) {
    check(row.state === 'processing' && data.package && JSON.stringify(data.package).length < 64000, 409);
    const pkg = data.package; check(pkg.project_id && LISTING_ID.test(pkg.project_id) && Array.isArray(pkg.files) && pkg.files.length <= 14);
    for (const f of pkg.files) {
      check(/^(?:(?:cover|screenshot-[1-6])\.(?:png|jpg|jpeg|webp)|preview-[0-6]\.webp)$/.test(f.name) && /^[a-f0-9]{64}$/.test(f.sha256) && Number.isInteger(f.parts) && f.parts > 0 && f.parts <= 28);
      const count = await sql(env, 'SELECT count(*) n FROM admin_files WHERE review_id=? AND name=?', id, f.name).first(); check(count.n === f.parts);
    }
    const encoded = JSON.stringify(pkg), hash = await digest(encoded);
    await env.DB.batch([sql(env, "UPDATE admin_reviews SET package=?,digest=?,project_id=?,state='ready',version=version+1,updated=? WHERE id=? AND state='processing'", encoded, hash, pkg.project_id, seconds(), id), history(env, 'processor', 'prepared', row.submission_id, id)]);
    return json({digest: hash});
  }
  if (path.endsWith('/published-pr')) {
    check(row.state === 'publishing' && row.approved_digest === row.digest && Number.isInteger(data.pr) && data.pr > 0, 409);
    const manual = ['off', 'enabled', undefined].includes(data.auto_merge) ? null : 'Automatic merge was not turned on (' + note(data.auto_merge, 300) + '). Merge the pull request on GitHub.';
    await env.DB.batch([sql(env, "UPDATE admin_reviews SET pr=?,state='pr-open',error=?,version=version+1,updated=? WHERE id=? AND state='publishing'", data.pr, manual, seconds(), id), sql(env, "DELETE FROM admin_files WHERE review_id=? AND name NOT LIKE 'preview-%'", id), sql(env, "DELETE FROM admin_files WHERE review_id IN (SELECT id FROM admin_reviews WHERE state IN ('pr-open','published','withdrawn') ORDER BY created DESC LIMIT -1 OFFSET 20)"), history(env, 'processor', 'publication-pr', row.submission_id, id)]); return json({ok: true});
  }
  if (path.endsWith('/failed')) {
    check(['processing', 'publishing'].includes(row.state), 409);
    await sql(env, "UPDATE admin_reviews SET state='failed',error=?,version=version+1,updated=? WHERE id=?", note(data.error), seconds(), id).run(); return json({ok: true});
  }
  check(false, 404);
}

export async function handle(request, env) {
  let stage = 'request-validation';
  try {
    check(env.ADMIN_ENABLED === 'true', 404, 'Not found');
    const url = new URL(request.url), path = url.pathname;
    check(url.origin === env.ADMIN_ORIGIN, 400, 'Wrong origin');
    if (path.startsWith('/processor/')) { stage = 'processor'; return await processor(request, env, path); }
    stage = 'database-rate-limit';
    await rate(env, await digest(request.headers.get('CF-Connecting-IP') || 'local'), 240);
    stage = 'access-identity';
    const user = await identity(request, env);
    if (!path.startsWith('/api/')) {
      check(request.method === 'GET', 405);
      stage = 'static-assets';
      const response = await env.ASSETS.fetch(request);
      return new Response(response.body, {status: response.status, headers: {...Object.fromEntries(response.headers), ...security}});
    }
    stage = 'authenticated-rate-limit';
    await rate(env, user.sub);
    if (request.method !== 'GET') check(request.method === 'POST' && request.headers.get('Origin') === env.ADMIN_ORIGIN && request.headers.get('Sec-Fetch-Site') !== 'cross-site', 403, 'Origin rejected');
    if (path === '/api/login' && request.method === 'POST') {
      const s = await startSession(env, user); return json({email: user.email, csrf: s.csrf, expires: s.expires}, 200, {'Set-Cookie': cookie(s.token, s.expires - seconds())});
    }
    stage = 'session-database';
    const s = await session(request, env, user);
    if (request.method !== 'GET') check(request.headers.get('X-CSRF-Token') === s.csrf, 403, 'CSRF check failed');
    if (path === '/api/session') return json({email: user.email, csrf: s.csrf, expires: s.expires});
    if (path === '/api/logout' && request.method === 'POST') {
      await env.DB.batch([sql(env, 'DELETE FROM admin_sessions WHERE subject=?', user.sub), sql(env, 'INSERT INTO admin_revocations(subject,before) VALUES(?,?) ON CONFLICT(subject) DO UPDATE SET before=excluded.before', user.sub, seconds())]);
      return json({ok: true}, 200, {'Set-Cookie': cookie('', 0)});
    }
    if (path === '/api/revoke' && request.method === 'POST') {
      const data = await readBody(request); check(typeof data.subject === 'string' && data.subject.length <= 200);
      await env.DB.batch([sql(env, 'DELETE FROM admin_sessions WHERE subject=?', data.subject), sql(env, 'INSERT INTO admin_revocations(subject,before) VALUES(?,?) ON CONFLICT(subject) DO UPDATE SET before=excluded.before', data.subject, seconds()), history(env, user.email, 'revoke-sessions')]); return json({ok: true});
    }
    if (path === '/api/sessions' && request.method === 'GET') return json((await sql(env, 'SELECT subject,email,max(expires) expires FROM admin_sessions WHERE expires>? GROUP BY subject,email', seconds()).all()).results);
    if (path === '/api/catalog' && request.method === 'GET') return json(await managedCatalog(env));
    if (path === '/api/listing' && request.method === 'GET') {
      const id = url.searchParams.get('id'); check(LISTING_ID.test(id || ''));
      const past = (await sql(env, "SELECT r.created,r.operation,r.state,r.payload,(SELECT h.actor FROM admin_history h WHERE h.review_id=r.id AND h.action LIKE 'exact-approval%' ORDER BY h.id DESC LIMIT 1) approved_by FROM admin_reviews r WHERE r.project_id=? ORDER BY r.created DESC,r.rowid DESC LIMIT 20", id).all()).results.map(r => ({created: r.created, operation: r.operation, state: r.state, reason: JSON.parse(r.payload).reason || '', approved_by: r.approved_by}));
      const file = await github(env, `/contents/listings/${id}/listing.json?ref=main`, 'GET', undefined, true);
      if (file) return json({editable: true, record: JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0)))), history: past});
      const live = (await catalog(env)).find(p => p.id === id);
      return json({editable: Boolean(live), record: live || {id}, ...(!live ? {message: 'This listing is not on the site, so it cannot be corrected here.'} : {}), history: past});
    }
    if (path === '/api/queue' && request.method === 'GET') {
      const state = url.searchParams.get('state') || '', q = (url.searchParams.get('q') || '').slice(0, 100), page = Number(url.searchParams.get('page') || 1), order = url.searchParams.get('sort') === 'oldest' ? 'ASC' : 'DESC';
      check(Number.isInteger(page) && page > 0 && page < 10000);
      const where = `WHERE (?='' OR state=? OR (?='open' AND state IN ${OPEN}) OR (?='new' AND state IN ${NEW})) AND (?='' OR instr(lower(payload),lower(?))>0 OR instr(COALESCE(listing_id,''),?)>0)`, filter = [state, state, state, state, q, q, q];
      if (url.searchParams.get('all')) return json({ids: (await sql(env, `SELECT id FROM submissions ${where} ORDER BY id LIMIT 500`, ...filter).all()).results.map(row => row.id)});
      const rows = (await sql(env, `SELECT * FROM submissions ${where} ORDER BY created ${order},id ${order} LIMIT 25 OFFSET ?`, ...filter, (page - 1) * 25).all()).results;
      const count = await sql(env, `SELECT count(*) n FROM submissions ${where}`, ...filter).first();
      const counts = Object.fromEntries((await sql(env, 'SELECT state,count(*) n FROM submissions GROUP BY state').all()).results.map(row => [row.state, row.n]));
      const projects = await catalog(env), related = await twins(env, rows), ids = rows.map(row => row.id);
      const latest = ids.length ? (await sql(env, `SELECT id,submission_id,state,${BUCKET} bucket FROM admin_reviews WHERE submission_id IN (${marks(ids)}) ORDER BY created,id`, seconds(), ...ids).all()).results : [];
      const items = rows.map(row => ({...item(row), listing_title: projects.find(p => p.id === row.listing_id)?.title || null, possible_duplicates: related(row), review: latest.findLast(r => r.submission_id === row.id) || null, existing: projects.filter(p => row.url_key && projectKeys(p).includes(row.url_key)).map(p => ({id: p.id, title: p.title}))}));
      return json({items, total: count.n, page, counts});
    }
    if (path === '/api/detail' && request.method === 'GET') {
      const id = Number(url.searchParams.get('id')); check(Number.isInteger(id));
      const row = await sql(env, 'SELECT * FROM submissions WHERE id=?', id).first(); check(row, 404);
      const listing_title = row.listing_id ? (await catalog(env).catch(() => [])).find(p => p.id === row.listing_id)?.title || null : null;
      return json({submission: {...item(row), listing_title, possible_duplicates: (await twins(env, [row]))(row)}, history: (await sql(env, 'SELECT * FROM admin_history WHERE submission_id=? ORDER BY id', id).all()).results, reviews: (await sql(env, 'SELECT * FROM admin_reviews WHERE submission_id=? ORDER BY created DESC', id).all()).results.map(review)});
    }
    if (path === '/api/reviews' && request.method === 'GET') return json({items: (await sql(env, `SELECT *,${BUCKET} bucket FROM admin_reviews ORDER BY created DESC LIMIT 100`, seconds()).all()).results.map(review)});
    if (path === '/api/summary' && request.method === 'GET') return json(await sql(env, `SELECT (SELECT count(*) FROM submissions WHERE state IN ${NEW}) new,(SELECT count(*) FROM submissions WHERE state='needs-changes') waiting,count(CASE WHEN bucket='ready' THEN 1 END) ready,count(CASE WHEN bucket='publishing' THEN 1 END) publishing,count(CASE WHEN bucket='attention' THEN 1 END) attention FROM (SELECT ${BUCKET} bucket FROM admin_reviews)`, seconds()).first());
    if (path === '/api/ratings' && request.method === 'GET') return json(await ratings(env));
    if (path === '/api/preview' && request.method === 'GET') {
      const row = await currentReview(env, url.searchParams.get('id')), name = url.searchParams.get('name');
      check(/^preview-[0-6]\.webp$/.test(name || ''));
      const f = JSON.parse(row.package || '{}').files?.find(f => f.name === name); check(f, 404);
      const parts = (await sql(env, 'SELECT data FROM admin_files WHERE review_id=? AND name=? ORDER BY part', row.id, name).all()).results;
      const bytes = Uint8Array.from(atob(parts.map(p => p.data).join('')), c => c.charCodeAt(0));
      return new Response(bytes, {headers: {...security, 'Content-Type': 'image/webp'}});
    }
    if (path === '/api/publication' && request.method === 'GET') return json(await publication(env, await currentReview(env, url.searchParams.get('id'))));
    if (request.method !== 'POST') check(false, 404);
    const data = await readBody(request);
    if (path === '/api/decision') {
      check(Number.isInteger(data.id) && Number.isInteger(data.revision) && ['in-review', 'needs-changes', 'rejected'].includes(data.state));
      const pub = note(data.public_note, 500), priv = note(data.private_note);
      check(data.state === 'in-review' || pub.length >= 5, 400, 'A public reason is required');
      const changed = await sql(env, "UPDATE submissions SET state=?,public_note=?,private_note=?,revision=revision+1,updated=?,expires=? WHERE id=? AND revision=? AND state IN ('received','in-review','needs-changes')", data.state, pub, priv, seconds(), seconds() + (data.state === 'rejected' ? 30 : 90) * 86400, data.id, data.revision).run();
      check(changed.meta.changes, 409, 'Submission changed; reload it');
      await env.DB.batch([sql(env, "UPDATE admin_reviews SET state='stale',version=version+1 WHERE submission_id=? AND state IN ('queued','processing','ready','approved')", data.id), history(env, user.email, data.state, data.id, null, pub, priv)]);
      return json({ok: true});
    }
    if (path === '/api/prepare') {
      await env.DB.batch([sql(env, 'DELETE FROM admin_files WHERE review_id IN (SELECT id FROM admin_reviews WHERE updated<?)', seconds() - 7 * 86400), sql(env, "UPDATE admin_reviews SET state='expired',package=NULL WHERE updated<? AND state NOT IN ('pr-open','published','withdrawn','discarded','expired')", seconds() - 7 * 86400)]);
      await sql(env, "DELETE FROM admin_files WHERE review_id IN (SELECT id FROM admin_reviews WHERE state IN ('stale','failed','expired','discarded'))").run();
      const stored = await sql(env, "SELECT count(DISTINCT review_id) n FROM admin_files WHERE name NOT LIKE 'preview-%'").first();
      check(stored.n < 6, 503, 'Private artwork storage is full; wait for its seven-day retention cleanup');
      check(['submission', 'edit', 'suspend', 'delist', 'restore', 'claim', 'feature', 'unfeature'].includes(data.operation));
      let sub = null, payload;
      if (data.operation === 'submission' || data.operation === 'claim') {
        check(Number.isInteger(data.submission_id)); sub = await sql(env, 'SELECT * FROM submissions WHERE id=?', data.submission_id).first();
        check(sub && sub.revision === data.revision && ['received', 'in-review', 'needs-changes', 'approved'].includes(sub.state), 409, 'Submission changed or closed');
        const checked = validateSubmission(data.payload); if (!checked.ok) throw Object.assign(Error('Some details need fixing.'), {status: 422, fields: checked.errors});
        check(checked.value.kind === sub.kind && (checked.value.listing_id || null) === sub.listing_id, 400, 'Submission identity cannot change');
        payload = checked.value;
        check((data.operation === 'claim') === (sub.kind === 'claim'));
      } else {
        check(LISTING_ID.test(data.project_id || '')); payload = data.payload || {};
        if (['feature', 'unfeature'].includes(data.operation)) {
          const project = (await managedCatalog(env)).projects.find(project => project.id === data.project_id);
          check(project?.feature_eligible, 409, 'Featured requires an approved, published project');
          if (data.operation === 'unfeature') check(project.feature_selected, 409, 'Featured selection changed; reload the catalog');
        }
      }
      const priv = note(data.reason); if (data.operation === 'claim' || ['suspend', 'delist', 'restore'].includes(data.operation)) check(priv.length >= 10, 400, 'Record a reason of at least 10 characters');
      const id = random().slice(0, 24), replaces = data.replaces ?? null, gone = 'That review was already replaced. Reload.';
      const same = [replaces, sub?.id || null, sub?.id || null, data.project_id || null, data.operation];
      if (replaces !== null) { check(typeof replaces === 'string' && /^[A-Za-z0-9_-]{24}$/.test(replaces)); check(await sql(env, `SELECT 1 FROM admin_reviews WHERE ${REPLACEABLE}`, ...same).first(), 409, gone); }
      const feature = data.feature === true && data.operation === 'submission' && ['add', 'suggest'].includes(sub.kind);
      const full = 'Six previews are already in progress. Finish or discard one first.';
      const active = await sql(env, "SELECT count(*) n FROM admin_reviews WHERE state IN ('queued','processing','ready','approved','publishing')").first(); check(active.n < 6, 503, full);
      const added = await env.DB.batch([sql(env, "UPDATE admin_reviews SET state='stale',version=version+1 WHERE submission_id=? AND state IN ('queued','processing','ready','approved','failed')", sub?.id || null), sql(env, `INSERT INTO admin_reviews(id,submission_id,revision,project_id,operation,payload,created,updated) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM admin_reviews WHERE state IN ('queued','processing','ready','approved','publishing'))<6 AND (? IS NULL OR ? IS NOT NULL OR EXISTS (SELECT 1 FROM admin_reviews WHERE ${REPLACEABLE}))`, id, sub?.id || null, sub?.revision || null, sub?.listing_id || sub?.project_id || data.project_id || null, data.operation, JSON.stringify({value: payload, reason: priv, transfer: data.transfer === true, omit_artwork: data.omit_artwork === true, ...(feature ? {feature: true} : {}), ...(replaces ? {replaces} : {})}), seconds(), seconds(), replaces, sub?.id || null, ...same), history(env, user.email, 'prepare-' + data.operation, sub?.id || null, id, '', priv), ...(replaces ? [sql(env, `UPDATE admin_reviews SET state='stale',version=version+1 WHERE ${REPLACEABLE}`, ...same)] : [])]);
      check(added[1].meta.changes, replaces ? 409 : 503, replaces ? gone : full);
      try { await dispatch(env, id, 'prepare'); } catch { await sql(env, "UPDATE admin_reviews SET state='dispatch-failed',error='Preparation could not start; retry.' WHERE id=?", id).run(); throw Object.assign(Error('Preparation could not start; retry.'), {status: 503}); }
      return json({id}, 201);
    }
    if (path === '/api/approve') {
      await requireOwner(env, user, 'Only the publication owner can approve');
      const override = data.override === true, reason = note(data.reason, 500);
      check(!override || reason.length >= 5, 400, 'A reason is required to approve incomplete metadata');
      const row = await currentReview(env, data.id); await fresh(env, row);
      const pkg = row.package && JSON.parse(row.package);
      const noArtwork = Array.isArray(pkg?.files) && pkg.files.length === 0;
      check(row.state === 'ready' && row.version === data.version && row.digest === data.digest && (noArtwork || data.artwork_reviewed === true) && data.content_reviewed === true, 409, 'Tick the review boxes for this exact preview first.');
      const pub = note(data.public_note, 500), priv = note(data.private_note);
      const changes = [sql(env, "UPDATE admin_reviews SET state='approved',approved_digest=digest,version=version+1,updated=? WHERE id=? AND version=? AND state='ready' AND (submission_id IS NULL OR EXISTS (SELECT 1 FROM submissions s WHERE s.id=admin_reviews.submission_id AND s.revision=admin_reviews.revision AND s.state IN ('received','in-review','needs-changes','approved')))", seconds(), row.id, row.version)];
      if (row.submission_id) changes.push(sql(env, "UPDATE submissions SET state='approved',project_id=?,public_note=?,private_note=?,updated=? WHERE id=? AND revision=? AND changes()=1", row.project_id, pub, priv, seconds(), row.submission_id, row.revision));
      changes.push(sql(env, "INSERT INTO admin_history(submission_id,review_id,actor,action,public_note,private_note,created) SELECT ?,?,?,?,?,?,? WHERE changes()=1", row.submission_id, row.id, user.email, (override ? 'exact-approval-override' : 'exact-approval') + (data.expedite === true ? '-expedited' : ''), pub, override ? (reason + ' ' + priv).slice(0, 1000) : priv, seconds()));
      const results = await env.DB.batch(changes); check(results[0].meta.changes, 409, 'Submission or review changed; reload before approving');
      if (data.expedite !== true) return json({ok: true, expedited: false});
      try { await startPublication(env, row.id); } catch (error) { return json({ok: true, expedited: false, warning: error.message}); }
      return json({ok: true, expedited: true});
    }
    if (path === '/api/publish') {
      const row = await currentReview(env, data.id); await fresh(env, row);
      check(row.state === 'approved' && row.digest === data.digest && row.approved_digest === row.digest, 409, 'Exact approval is required');
      await rate(env, 'publish:' + user.sub, 5);
      await startPublication(env, row.id); return json({ok: true});
    }
    if (path === '/api/redeploy') {
      const status = await publication(env, await currentReview(env, data.id));
      check(status.actions?.some(a => a.action === 'redeploy'), 409, 'There is nothing to try again');
      await rate(env, 'publish:' + user.sub, 5);
      await github(env, `/actions/runs/${status.run}/rerun-failed-jobs`, 'POST'); return json({ok: true});
    }
    if (path === '/api/discard') {
      await requireOwner(env, user, 'Only the publication owner can discard a review');
      const row = await currentReview(env, data.id);
      const free = ['queued', 'processing', 'ready', 'failed', 'dispatch-failed'].includes(row.state) || (await publication(env, row)).actions?.some(a => a.action === 'discard');
      check(free, 409, 'This review cannot be discarded while its publication is in progress');
      const gone = "EXISTS (SELECT 1 FROM admin_reviews WHERE id=? AND state='discarded' AND version=?)";
      const done = await env.DB.batch([
        sql(env, "UPDATE admin_reviews SET state='discarded',package=NULL,version=version+1,updated=? WHERE id=? AND state=? AND version=?", seconds(), row.id, row.state, row.version),
        sql(env, `DELETE FROM admin_files WHERE review_id=? AND ${gone}`, row.id, row.id, row.version + 1),
        sql(env, `UPDATE submissions SET state='in-review',updated=? WHERE id=? AND state='approved' AND ${gone}`, seconds(), row.submission_id, row.id, row.version + 1),
        sql(env, `INSERT INTO admin_history(submission_id,review_id,actor,action,created) SELECT ?,?,?,'discarded-review',? WHERE ${gone}`, row.submission_id, row.id, user.email, seconds(), row.id, row.version + 1)]);
      check(done[0].meta.changes, 409, 'This review changed; reload it');
      return json({ok: true});
    }
    if (path === '/api/delete') {
      await requireOwner(env, user, 'Only the publication owner can delete submissions');
      const ids = data.ids;
      check(Array.isArray(ids) && ids.length > 0 && ids.length <= 10 && ids.every(Number.isInteger) && new Set(ids).size === ids.length, 400, 'Choose between 1 and 10 submissions');
      const rows = (await sql(env, `SELECT id,payload,listing_id FROM submissions WHERE id IN (${marks(ids)})`, ...ids).all()).results;
      const unfinished = () => sql(env, `SELECT * FROM admin_reviews WHERE submission_id IN (${marks(ids)}) AND state IN ('approved','publishing','pr-open')`, ...ids).all();
      for (const pending of (await unfinished()).results.filter(r => r.state === 'pr-open')) await publication(env, pending).catch(() => {});
      const busy = new Set((await unfinished()).results.map(r => r.submission_id)), items = [];
      for (const id of ids) {
        const row = rows.find(r => r.id === id), entry = {id, title: row ? JSON.parse(row.payload).title || row.listing_id || 'Untitled submission' : null};
        if (!row) entry.gone = true;
        else if (busy.has(id)) entry.blocked = BUSY_TEXT;
        else if (data.preview !== true) try {
          const done = await env.DB.batch([
            sql(env, `UPDATE admin_reviews SET submission_id=NULL WHERE submission_id=?1 AND state IN ('published','withdrawn') AND ${BUSY}`, id),
            sql(env, `DELETE FROM admin_history WHERE submission_id=?1 AND (review_id IS NULL OR review_id NOT IN (SELECT id FROM admin_reviews WHERE state IN ('published','withdrawn'))) AND EXISTS (SELECT 1 FROM submissions WHERE id=?1) AND ${BUSY}`, id),
            sql(env, `DELETE FROM submissions WHERE id=?1 AND ${BUSY}`, id),
            sql(env, "INSERT INTO admin_history(submission_id,actor,action,created) SELECT ?1,?2,'deleted-submission',?3 WHERE changes()=1", id, user.email, seconds())]);
          if (done[2].meta.changes) entry.deleted = true; else entry.blocked = BUSY_TEXT;
        } catch { entry.blocked = 'This submission could not be deleted. Try again.'; }
        items.push(entry);
      }
      return json({items});
    }
    if (path === '/api/ratings/exclude' || path === '/api/ratings/restore') {
      await requireOwner(env, user, 'Only the publication owner can change which ratings count');
      check(env.RATINGS_DB, 503, 'Ratings are not connected to the dashboard');
      await rate(env, 'ratings:' + user.sub, 5);
    }
    if (path === '/api/ratings/exclude') {
      check(typeof data.project_id === 'string' && LISTING_ID.test(data.project_id) && Number.isInteger(data.score) && data.score >= 1 && data.score <= 7);
      const text = note(data.reason, 200); check(text.length >= 10, 400, 'Record a reason of at least 10 characters');
      const before = await rsql(env, TOTALS, data.project_id).first();
      if (data.expected === undefined) {
        const n = (await rsql(env, `SELECT count(*) n ${GROUP}`, data.project_id, data.score).first()).n;
        check(n >= UNUSUAL.minimum, 409, RATINGS_CHANGED);
        return json({credentials: n, before: aggregate(before), after: aggregate({total: (before?.total || 0) - data.score * n, count: (before?.count || 0) - n})});
      }
      check(Number.isInteger(data.expected)); check(data.expected >= UNUSUAL.minimum, 409, RATINGS_CHANGED);
      const reason = `${new Date().toISOString().slice(0, 10)} ${data.project_id} score ${data.score}: ${text}`;
      const excluded = await audited(env, user, 'ratings-exclude', `${reason}; ${data.expected} ratings`, () => rsql(env, EXCLUDE, reason, data.project_id, data.score, data.project_id, data.score, data.expected).run());
      check(excluded, 409, RATINGS_CHANGED);
      return json({excluded, before: aggregate(before), after: aggregate(await rsql(env, TOTALS, data.project_id).first())});
    }
    if (path === '/api/ratings/restore') {
      check(typeof data.reason === 'string' && data.reason.length > 0 && data.reason.length <= 1000);
      const restored = await audited(env, user, 'ratings-restore', data.reason, () => rsql(env, 'DELETE FROM excluded_credentials WHERE reason=?', data.reason).run());
      check(restored, 404, 'Nothing is excluded under that reason. Reload.');
      return json({restored});
    }
    check(false, 404);
  } catch (error) {
    if (!error?.status) console.error('Unexpected admin failure at stage: ' + stage);
    return json({error: error.status ? error.message : 'Administration unavailable; retry later', ...(error.status && error.fields ? {fields: error.fields} : {})}, error.status || 503);
  }
}
export default {fetch: handle};
