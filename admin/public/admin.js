const $ = id => document.getElementById(id);
let csrf = '', page = 1, total = 0, selected = null, listing = null, selectedReview;
let lastList = 'queue', catalogItems = [], searchTimer, reviewTimer;
let snapshot = null, counted = null, allReviews = [];
const labels = {received: 'New submission', 'in-review': 'Under review', 'needs-changes': 'Awaiting corrections', approved: 'Approved', published: 'Published', rejected: 'Rejected'};
const reviewLabels = {queued: 'Preparing', processing: 'Preparing', ready: 'Ready for your review', approved: 'Approved', publishing: 'Publishing', 'pr-open': 'Publishing', published: 'Published', withdrawn: 'Published', failed: 'Needs attention', 'dispatch-failed': 'Needs attention', stale: 'Replaced', expired: 'Expired', discarded: 'Discarded'};
const stageLabels = {approved: 'Approved', publishing: 'Publishing', checks: 'Waiting for checks', deploying: 'Deploying', published: 'Published', attention: 'Needs attention'};
const kindLabels = {add: 'New project', suggest: 'Suggested project', correct: 'Correction request', claim: 'Ownership claim'};
const operationLabels = {submission: 'Submission', edit: 'Listing edit', suspend: 'Suspend', delist: 'Delist', restore: 'Restore', claim: 'Ownership verification', feature: 'Make Featured', unfeature: 'Clear Featured'};
const listingLabels = {approved: 'Approved', suspended: 'Suspended', delisted: 'Delisted'};
const historyLabels = {'in-review': 'Started review', 'needs-changes': 'Asked for corrections', rejected: 'Rejected', prepared: 'Preview ready', 'publication-pr': 'Publication started', 'verified-live': 'Confirmed live', 'discarded-review': 'Discarded a preview', 'deleted-submission': 'Deleted the submission'};
const fieldLabels = {title: 'Project name', creator: 'Creator', developer: 'Creator', description: 'Description', game: 'Game', category: 'Category', url: 'Project page', status: 'Project status', patch_url: 'Download or patch page', artwork: 'Images', links: 'Community links', note: 'Message', listing_id: 'Listing', kind: 'Kind', no_page: 'No public project page'};
const diffLabels = {title: 'Project name', description: 'Description', developer: 'Creator', creator: 'Creator', game: 'Game', category: 'Category', status: 'Project status', source: 'Project page', repository: 'Project page', distribution: 'Download or patch page', links: 'Community links', cover: 'Images', screenshots: 'Images'};
const BUCKETS = {new: 'New submissions', waiting: 'Waiting on the visitor', ready: 'Ready for review', publishing: 'Publishing', attention: 'Needs attention'};
const FIELDS = ['title', 'creator', 'description', 'game', 'category', 'url', 'status', 'patch_url', 'artwork', 'links'];
const TRACKED = ['queued', 'processing', 'approved', 'publishing', 'pr-open', 'failed', 'dispatch-failed', 'published', 'withdrawn'];
const MOVING = ['preparing', 'publishing', 'checks', 'deploying'];
const REPLACEABLE = ['failed', 'dispatch-failed', 'ready'];
const picked = new Set(), watch = new Map(), automatic = new Set();
let trackTimer;
const notice = (text, error = false) => { $('notice').textContent = text; $('notice').classList.toggle('error', error); };
const settle = () => { if (!$('notice').classList.contains('error')) notice(''); };
const el = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
const when = s => new Date(s * 1000).toLocaleString();
const show = id => {
  for (const name of ['queue', 'catalog-panel', 'detail', 'publication', 'session-panel', 'ratings-panel']) $(name).hidden = name !== id;
  const tab = {queue: 'inbox', 'catalog-panel': 'catalog', publication: 'reviews', 'session-panel': 'sessions', 'ratings-panel': 'ratings'}[id];
  if (tab) for (const name of ['inbox', 'catalog', 'reviews', 'sessions', 'ratings']) {
    const active = tab === name;
    $(name).classList.toggle('active', active);
    if (active) $(name).setAttribute('aria-current', 'page');
    else $(name).removeAttribute('aria-current');
  }
};
async function api(path, data, retried) {
  const response = await fetch('/api/' + path, {method: data ? 'POST' : 'GET', headers: data ? {'Content-Type': 'application/json', 'X-CSRF-Token': csrf} : {}, body: data ? JSON.stringify(data) : undefined, redirect: 'error'});
  const result = await response.json();
  if (response.status === 401 && path !== 'login' && path !== 'logout' && !retried) { signedIn(await api('login', {})); return api(path, data, true); }
  if (!response.ok) { if (response.status === 401) $('login').hidden = false; throw Object.assign(Error(result.error || 'Request failed'), {fields: result.fields}); } return result;
}
const run = fn => async event => { if (event) { event.preventDefault(); notice(''); } try { await fn(); } catch (e) { notice(e.message, true); } };
function button(text, fn) { const n = el('button', text); n.type = 'button'; n.addEventListener('click', run(fn)); return n; }
function link(address, label) { try { const u = new URL(address); if (u.protocol !== 'https:' || u.username || u.password) return el('span', label + ': ' + address); const a = el('a', label + ' (' + u.host + ')'); a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; } catch { return el('span', label + ': ' + address); } }
function confirmAction(text, deleteLabel) {
  $('confirmation-title').textContent = deleteLabel ? 'Delete permanently?' : 'Confirm moderation action';
  $('confirm-button').textContent = deleteLabel || 'Confirm'; $('confirm-button').className = deleteLabel ? 'button-danger' : 'button-primary';
  $('confirmation-text').textContent = text; $('confirmation').showModal(); return new Promise(resolve => $('confirmation').addEventListener('close', () => resolve($('confirmation').returnValue === 'confirm'), {once: true})); }
function signedIn(s) { csrf = s.csrf; $('identity').textContent = s.email; $('workspace').hidden = false; $('logout').hidden = false; $('login').hidden = true; }
function tag(state, text = labels[state] || state) { const item = el('span', text); item.className = 'tag'; item.dataset.state = state; return item; }
function line(text, className = '') { const item = el('p', text); item.className = className; return item; }
function optionText(name, value) { return [...($('metadata').elements[name]?.options || [])].find(o => o.value === value)?.text || value; }
function detailLinks(payload) {
  const wrapper = el('div'), seen = new Set(); wrapper.className = 'summary-links';
  const sources = [[payload.url || payload.source?.url || payload.repository, 'Project page'], [payload.patch_url || payload.distribution?.url, 'Download or patch page'], ...(payload.links || []).map(l => [l.url, l.label || 'Community link'])];
  for (const [address, label] of sources) if (address && !seen.has(address)) { seen.add(address); wrapper.append(link(address, label)); }
  return wrapper;
}
function reviewTag(r) { const item = tag(r.state, reviewLabels[r.state] || 'Unknown'); item.dataset.review = r.id; return item; }
function reviewName(r) { return r.package?.listing?.title || r.package?.featured_preview?.title || r.payload?.value?.title || catalogItems.find(p => p.id === r.project_id)?.title || r.project_id || 'New listing'; }
const liveBucket = r => { const w = watch.get(r.id); return w?.state === r.state && w.status?.stage === 'attention' ? 'attention' : r.bucket; };
function paintStrip() {
  if (!counted) return;
  const moved = allReviews.filter(r => r.bucket === 'publishing' && liveBucket(r) === 'attention').length;
  const counts = {...counted, publishing: counted.publishing - moved, attention: counted.attention + moved};
  for (const name of Object.keys(BUCKETS)) { const item = $('count-' + name); item.querySelector('.count').textContent = counts[name]; item.classList.toggle('zero', !counts[name]); }
  $('count-attention').classList.toggle('alert', counts.attention > 0);
}
async function strip() {
  const [counts, data] = await Promise.all([api('summary'), api('reviews')]);
  counted = counts; allReviews = data.items;
  for (const r of data.items) if (r.bucket === 'publishing' || (r.state === 'failed' && r.approved_digest)) track(r);
  paintStrip();
  return data.items;
}
function track(r) {
  if (!TRACKED.includes(r.state)) return;
  const known = watch.get(r.id);
  if (known?.state === r.state) { if (known.status) paint(r, known.status); return; }
  watch.set(r.id, {state: r.state, review: r, fails: 0});
  clearTimeout(trackTimer); trackTimer = setTimeout(tick, 0);
}
async function tick() {
  clearTimeout(trackTimer);
  let moving = 0, left = false;
  for (const [id, w] of watch) {
    if (w.status && !MOVING.includes(w.status.stage)) continue;
    const before = w.status?.stage;
    try { w.status = await api('publication?id=' + id); w.fails = 0; }
    catch (e) { if (++w.fails >= 5) w.status = {stage: 'attention', message: 'The publication status could not be checked. ' + e.message, actions: [{action: 'check', label: 'Check publication'}]}; }
    if (before && w.status.stage !== before) settle();
    if (w.status) paint(w.review, w.status);
    if (!w.status || MOVING.includes(w.status.stage)) moving++; else left = true;
    if (w.status?.auto === 'reprepare' && !automatic.has(id)) { automatic.add(id); await reprepareAutomatically(allReviews.find(r => r.id === id) || w.review); }
  }
  if (left) await strip().catch(paintStrip); else paintStrip();
  // 20 seconds keeps six tracked publications near 18 dashboard requests a minute, under the 120 limit.
  if (moving) trackTimer = setTimeout(tick, document.hidden ? 60000 : 20000);
}
async function reprepareAutomatically(r) {
  try {
    const next = await recover.reprepare(r);
    watch.delete(r.id);
    notice('The site changed after your approval, so a fresh preview is being prepared. Nothing is approved until you review it.');
    if (!$('publication').hidden) await reviews(next); else await strip();
  } catch (e) { notice(e.message, true); }
}
const recover = {
  check: async () => {},
  publish: async r => { await api('publish', {id: r.id, digest: r.digest}); notice('Publication started.'); },
  redeploy: async r => { await api('redeploy', {id: r.id}); notice('Publishing restarted.'); },
  discard: async r => {
    if (!await confirmAction('Discard this unfinished review? Nothing from it will be published. The submission or listing itself is kept.')) return false;
    await api('discard', {id: r.id}); notice('Unfinished review discarded.');
  },
  reprepare: async (r, changes = {}) => {
    const request = {operation: r.operation, payload: r.payload.value, reason: r.payload.reason, transfer: r.payload.transfer, omit_artwork: r.payload.omit_artwork, feature: r.payload.feature === true, ...(REPLACEABLE.includes(r.state) ? {replaces: r.id} : {}), ...changes};
    if (r.submission_id) Object.assign(request, {submission_id: r.submission_id, revision: (await api('detail?id=' + r.submission_id)).submission.revision});
    else request.project_id = r.project_id;
    const made = await api('prepare', request);
    notice('A new review is being prepared. Nothing is approved until you review it.');
    return made.id;
  },
  'reprepare-plain': r => recover.reprepare(r, {omit_artwork: true}),
  'reprepare-unfeatured': r => recover.reprepare(r, {feature: false})
};
const FEATURE_REFUSED = /^Featured can only be chosen/;
function paint(r, s) {
  if (stageLabels[s.stage]) for (const item of document.querySelectorAll(`[data-review="${r.id}"]`)) { item.textContent = stageLabels[s.stage]; item.dataset.state = s.stage === 'attention' ? 'failed' : s.stage; }
  const panel = $('publication-status');
  if (!panel || selectedReview?.id !== r.id) return;
  r = selectedReview;
  if (s.stage === 'attention') $('underway')?.remove();
  panel.hidden = !stageLabels[s.stage];
  if (panel.hidden) return;
  const steps = el('div'); steps.className = 'review-stage';
  const order = ['approved', 'publishing', 'checks', 'deploying', 'published'];
  for (const name of order) { const part = el('span', stageLabels[name]); if (name === s.stage) { part.className = 'current'; part.setAttribute('aria-current', 'step'); } steps.append(part); }
  panel.replaceChildren(el('h3', 'Publication: ' + stageLabels[s.stage]));
  if (s.stage !== 'attention') panel.append(steps);
  panel.append(line(s.message, s.stage === 'attention' ? 'warning' : ''));
  const links = el('div'); links.className = 'summary-links';
  if (s.live_url) links.append(link(s.live_url, 'Open the live page'));
  if (s.detail_url) links.append(link(s.detail_url, 'See what failed'));
  if (s.stage === 'attention' && s.url) links.append(link(s.url, 'Open the publication request'));
  if (links.childNodes.length) panel.append(links);
  const actions = el('div'); actions.className = 'action-row';
  const offered = [...(s.actions || []), ...(s.stage === 'attention' && r.payload.feature === true && FEATURE_REFUSED.test(r.error || '') ? [{action: 'reprepare-unfeatured', label: 'Prepare without the Featured choice'}] : [])];
  for (const a of offered) {
    const b = button(a.label, async () => { const next = await recover[a.action](r); if (next === false) return; watch.delete(r.id); await reviews(next || r.id); });
    if (a.action === 'discard') b.className = 'button-danger';
    actions.append(b);
  }
  if (s.stage === 'attention' && r.submission_id) actions.append(button('Back to the submission', () => detail(r.submission_id)));
  if (actions.childNodes.length) panel.append(actions);
}
function updateSelection() {
  $('selected-count').textContent = picked.size + ' selected';
  $('delete-selected').disabled = !picked.size;
  for (const box of document.querySelectorAll('input[data-pick]')) box.checked = picked.has(Number(box.dataset.pick));
}
function pick(id, text) {
  const label = el('label'), box = el('input'); label.className = 'inline-check';
  box.type = 'checkbox'; box.dataset.pick = id; box.checked = picked.has(id);
  box.addEventListener('change', () => { if (box.checked) picked.add(id); else picked.delete(id); updateSelection(); });
  label.append(box, document.createTextNode(text)); return label;
}
async function removeSubmissions(ids) {
  const name = p => '#' + p.id + ' ' + p.title, checked = [];
  for (let i = 0; i < ids.length; i += 10) checked.push(...(await api('delete', {ids: ids.slice(i, i + 10), preview: true})).items);
  const ready = checked.filter(p => !p.blocked && !p.gone), held = checked.filter(p => p.blocked);
  for (const p of checked.filter(p => p.gone)) picked.delete(p.id);
  if (!ready.length) { notice(held.length ? 'Nothing was deleted. ' + held[0].blocked : 'Already deleted.', held.length > 0); return queue(); }
  let text = (ready.length === 1 ? 'Permanently delete submission ' + name(ready[0]) + '?' : 'Permanently delete ' + ready.length + ' submissions?') + ' The submitted details and notes are removed and the receipt stops working. Published listings stay online. This cannot be undone.';
  if (held.length) text += '\n\n' + held.length + ' cannot be deleted now and will be kept: ' + held.map(name).join(', ') + '. ' + held[0].blocked;
  if (!await confirmAction(text, ready.length === 1 ? 'Delete submission' : 'Delete ' + ready.length + ' submissions')) return;
  const failed = []; let deleted = 0;
  for (let i = 0; i < ready.length; i += 10) {
    const part = ready.slice(i, i + 10);
    try { for (const p of (await api('delete', {ids: part.map(p => p.id)})).items) { if (p.deleted || p.gone) { deleted++; picked.delete(p.id); } else failed.push(p); } }
    catch (e) { failed.push(...part.map(p => ({...p, blocked: e.message}))); }
  }
  page = Math.max(1, Math.min(page, Math.ceil((total - deleted) / 25)));
  await queue();
  $('queue-title').focus();
  notice('Deleted ' + deleted + (deleted === 1 ? ' submission.' : ' submissions.') + (failed.length ? ' Not deleted: ' + failed.map(p => name(p) + ' (' + p.blocked + ')').join('; ') : '') + (held.length ? ' Kept: ' + held.map(name).join(', ') + '.' : ''), failed.length > 0);
}
function duplicateBlock(item, open) {
  const box = el('details'); box.className = 'disclosure duplicates'; box.open = open;
  box.append(el('summary', 'Compare ' + (item.possible_duplicates.length + 1) + ' submissions with the same project address'));
  const body = el('div'); body.className = 'disclosure-body';
  body.append(line('These may be duplicates. Nothing is removed automatically: delete the ones you do not want and keep the original.', 'muted'));
  const list = el('ul'); list.className = 'compare';
  const self = {id: item.id, title: item.payload.title || 'Untitled submission', url: item.payload.url || '', created: item.created, state: item.state};
  for (const s of [self, ...item.possible_duplicates]) {
    const row = el('li'), head = el('div'); head.className = 'summary-row';
    head.append(el('strong', '#' + s.id + ' ' + s.title + (s === self ? ' (this one)' : '')), tag(s.state));
    row.append(head, line('Submitted ' + when(s.created), 'card-meta'));
    row.append(s.url ? link(s.url, 'Project page') : line('No project address', 'muted'));
    const actions = el('div'); actions.className = 'action-row';
    const remove = button('Delete duplicate #' + s.id, () => removeSubmissions([s.id])); remove.className = 'button-danger';
    actions.append(pick(s.id, 'Select #' + s.id), remove);
    row.append(actions); list.append(row);
  }
  body.append(list); box.append(body); return box;
}
async function queue() {
  clearTimeout(reviewTimer);
  show('queue'); lastList = 'queue';
  const result = await api('queue?page=' + page + '&q=' + encodeURIComponent($('search').value) + '&state=' + encodeURIComponent($('state').value) + '&sort=' + $('sort').value);
  total = result.total;
  $('queue-count').textContent = total + (total === 1 ? ' submission' : ' submissions');
  $('queue-summary').textContent = ['received', 'in-review', 'needs-changes', 'approved'].filter(state => result.counts[state]).map(state => labels[state] + ': ' + result.counts[state]).join(' · ') || 'Nothing is waiting for you.';
  $('select-all').textContent = 'Select all ' + total + ' matching';
  $('select-all').disabled = !total;
  $('items').replaceChildren();
  for (const item of result.items) {
    const article = el('article'); article.className = 'item-card';
    const head = el('div'); head.className = 'card-head';
    const following = item.state === 'approved' && item.review;
    head.append(el('h3', item.listing_title || item.payload.title || item.listing_id || 'Untitled submission'),following ? reviewTag(item.review) : tag(item.state));
    article.append(head);
    if (item.state === 'received' && Array.isArray(item.payload.replies) && item.payload.replies.length) { const reply = el('div'); reply.append(tag('reply', 'Reply received')); article.append(reply); }
    article.append(line((kindLabels[item.kind] || 'Submission') + ' · ' + when(item.created), 'card-meta'));
    if (item.payload.url) article.append(link(item.payload.url, 'Project page'));
    else article.append(line('No source page provided', 'muted'));
    if (item.existing.length) article.append(line('Already listed: ' + item.existing.map(p => p.title).join(', '), 'warning'));
    if (item.possible_duplicates.length) article.append(line('Possible duplicate of ' + item.possible_duplicates.map(d => 'submission ' + d.id).join(', '), 'warning'), duplicateBlock(item, false));
    article.append(pick(item.id, 'Select submission ' + item.id));
    if (following) track(item.review);
    const actions = el('div'); actions.className = 'card-actions';
    actions.append(button('Review submission ' + item.id, () => detail(item.id)));
    article.append(actions); $('items').append(article);
  }
  if (!result.items.length) $('items').append(line('No matching submissions. Try another status or search term.', 'muted'));
  updateSelection();
  $('pagination').textContent = 'Page ' + page + ' · ' + total + (total === 1 ? ' submission' : ' submissions');
  $('previous').disabled = page === 1;
  $('next').disabled = page * 25 >= total;
  await strip();
}
const asText = (name, value) => name === 'artwork' ? (value || []).join('\n') : name === 'links' ? (value || []).map(l => l.label + ' | ' + l.url).join('\n') : value || '';
function fill(value) {
  $('metadata').reset(); const form = $('metadata').elements;
  for (const name of ['title', 'description', 'url', 'game', 'category', 'status', 'patch_url']) form[name].value = value[name] || '';
  form.creator.value = value.creator || value.developer || ''; form.no_page.checked = value.no_page === true;
  form.artwork.value = asText('artwork', value.artwork); form.links.value = asText('links', value.links);
  $('omit-artwork').checked = value.omit_artwork === true;
  $('public-note').value = selected?.public_note || ''; $('private-note').value = selected?.private_note || ''; $('reason').value = ''; $('transfer').checked = false;
}
const liveValues = record => ({...record, url: record.source?.url || record.repository || '', patch_url: record.distribution?.url || ''});
function formState() {
  const form = $('metadata').elements;
  return {...Object.fromEntries(FIELDS.map(name => [name, form[name].value])), no_page: form.no_page.checked, omit_artwork: $('omit-artwork').checked};
}
function values() {
  const form = $('metadata').elements, value = {...(selected?.payload || {})};
  for (const name of ['title', 'description', 'url', 'game', 'category', 'status', 'patch_url', 'creator']) value[name] = form[name].value;
  value.no_page = form.no_page.checked;
  value.artwork = form.artwork.value.split('\n').map(s => s.trim()).filter(Boolean);
  value.links = form.links.value.split('\n').filter(s => s.trim()).map(s => { const at = s.indexOf('|'); if (at < 1) throw Error('Use label | HTTPS address for each community link'); return {label: s.slice(0, at).trim(), url: s.slice(at + 1).trim()}; });
  return value;
}
function messages(s, history) {
  const p = s.payload, list = el('ul'); list.className = 'messages';
  const entry = (who, at, text) => { const item = el('li'), meta = el('p'); meta.className = 'card-meta'; meta.append(el('strong', who), document.createTextNode(' · ' + when(at))); item.append(meta, line(String(text ?? ''), 'message-text')); list.append(item); };
  if (p.note) entry({correct: 'Correction request', claim: 'Ownership claim'}[s.kind] || 'Message from the submitter', s.created, p.note);
  const dropped = Number.isInteger(p.replies_dropped) && p.replies_dropped > 0 ? p.replies_dropped : 0;
  const later = [...(Array.isArray(p.replies) ? p.replies : []).map(r => ({who: 'Reply from the submitter', at: r?.at, text: r?.text})), ...history.filter(h => h.public_note).map(h => ({who: 'You wrote', at: h.created, text: h.public_note, own: true}))].sort((a, b) => a.at - b.at);
  let previous;
  for (const m of later) { if (m.own && m.text === previous) continue; if (m.own) previous = m.text; entry(m.who, m.at, m.text); }
  if (!list.childNodes.length && !dropped) return null;
  const box = el('div'); box.className = 'message-block'; box.append(el('h3', 'Messages'));
  if (dropped) box.append(line(dropped === 1 ? '1 earlier reply was removed to fit.' : dropped + ' earlier replies were removed to fit.', 'muted'));
  box.append(list); return box;
}
function proposals(payload) {
  const form = $('metadata').elements, list = el('ul'); list.className = 'compare';
  for (const name of FIELDS) {
    const value = payload[name], text = asText(name, value);
    if (!text || text === form[name].value) continue;
    const item = el('li'), head = el('div'); head.className = 'summary-row'; head.append(el('strong', fieldLabels[name]));
    item.append(head);
    if (name === 'url' || name === 'patch_url') item.append(link(value, fieldLabels[name]));
    else if (name === 'artwork') { const shown = el('div'); shown.className = 'summary-links'; value.forEach((address, i) => shown.append(link(address, 'Image ' + (i + 1)))); item.append(shown); }
    else if (name === 'links') { const shown = el('div'); shown.className = 'summary-links'; for (const l of value) shown.append(link(l.url, l.label || 'Community link')); item.append(shown); }
    else item.append(line(['game', 'category', 'status'].includes(name) ? optionText(name, value) : text, 'message-text'));
    const actions = el('div'); actions.className = 'action-row';
    actions.append(button('Use this', () => { form[name].value = text; if ($('more-metadata').contains(form[name])) $('more-metadata').open = true; form[name].focus(); }));
    item.append(actions); list.append(item);
  }
  const box = el('div'); box.append(el('h3', 'Changes the visitor proposed'));
  box.append(list.childNodes.length ? list : line('Everything the visitor proposed already matches the live listing.', 'muted'));
  return box;
}
async function detail(id) {
  clearTimeout(reviewTimer);
  const data = await api('detail?id=' + id);
  selected = data.submission; listing = null; lastList = 'queue'; snapshot = null;
  const live = selected.kind === 'correct' ? await api('listing?id=' + encodeURIComponent(selected.listing_id)) : null;
  show('detail');
  $('detail-title').textContent = 'Review: ' + ((live?.editable && live.record.title) || selected.listing_title || selected.payload.title || selected.listing_id || 'Untitled project');
  $('detail-title').focus();
  $('detail-kind').textContent = 'Submission #' + id;
  $('detail-helper').textContent = 'Review the submitted information, make corrections if needed, then prepare a preview.';
  const summary = $('details');
  summary.replaceChildren();
  const said = messages(selected, data.history);
  if (said) summary.append(said);
  const statusRow = el('div'); statusRow.className = 'summary-row';
  statusRow.append(tag(selected.state), line((kindLabels[selected.kind] || 'Submission') + ' · revision ' + selected.revision + ' · submitted ' + when(selected.created)));
  summary.append(statusRow);
  const sources = detailLinks(selected.payload);
  if (sources.childNodes.length) summary.append(sources);
  if (selected.challenge) summary.append(line('Ownership challenge: ' + selected.challenge));
  summary.append(line('Artwork is verified in the prepared preview, not from untrusted source links.', 'muted'));
  if (selected.possible_duplicates.length) summary.append(line('Possible duplicate of ' + selected.possible_duplicates.map(d => 'submission ' + d.id).join(', '), 'warning'), duplicateBlock(selected, true));
  const closed = ['rejected', 'published'].includes(selected.state);
  if (closed) summary.append(line('This submission is closed. Nothing more can be decided or prepared for it.', 'muted'));
  if (live && !live.editable) summary.append(line(live.message || 'This listing cannot be edited here.', 'warning'));
  fill(live?.editable ? liveValues(live.record) : selected.payload);
  if (live?.editable) { summary.append(proposals(selected.payload)); snapshot = formState(); }
  $('submission-actions').hidden = !['received', 'in-review', 'needs-changes'].includes(selected.state); $('start').hidden = selected.state === 'in-review';
  $('listing-actions').hidden = true; $('delete-panel').hidden = false; $('prepare-panel').hidden = closed;
  $('feature-choice').hidden = !['add', 'suggest'].includes(selected.kind); $('also-feature').checked = false;
  $('prepare').textContent = selected.kind === 'claim' ? 'Prepare ownership verification' : 'Prepare preview';
  $('metadata').hidden = closed; $('moderation-notes').hidden = closed; $('policy-evidence').hidden = closed; $('prepare').disabled = Boolean(live && !live.editable);
  $('more-metadata').open = false;
  $('moderation-notes').open = selected.state === 'in-review' || selected.state === 'needs-changes'; $('policy-evidence').open = selected.kind === 'claim';
  $('history-panel').open = false;
  $('history').replaceChildren(el('h3', 'Moderation history'));
  for (const h of data.history) {
    const action = historyLabels[h.action] || (h.action.startsWith('prepare-') ? 'Prepared a preview' : h.action.startsWith('exact-approval') ? 'Approved' : 'Recorded an action');
    $('history').append(line(when(h.created) + ' · ' + h.actor + ' · ' + action), line('Public: ' + (h.public_note || '—')), line('Private: ' + (h.private_note || '—')));
  }
  for (const r of data.reviews) $('history').append(button('Open review · ' + (reviewLabels[r.state] || 'Unknown'), () => showReview(r)));
}
async function decide(state) {
  if (!selected) return;
  if (state !== 'in-review' && $('public-note').value.trim().length < 5) {
    $('public-note').focus();
    notice('Write a message to the submitter of at least 5 characters first. It appears on their receipt.', true);
    return;
  }
  const marked = [$('public-note'), $('private-note')].find(field => /[<>]/.test(field.value));
  if (marked) {
    if (marked.id === 'private-note') $('moderation-notes').open = true;
    marked.focus();
    notice('Messages cannot contain < or > or control characters.', true);
    return;
  }
  if (state !== 'in-review' && !await confirmAction(`Set this submission to “${labels[state]}”? The message will appear on its receipt.`)) return;
  await api('decision', {id: selected.id, revision: selected.revision, state, public_note: $('public-note').value, private_note: $('private-note').value}); notice('Moderation decision recorded.'); await detail(selected.id);
}
function fieldErrors(e) {
  const entries = Object.entries(e.fields), form = $('metadata').elements;
  notice(e.message + ' ' + entries.map(([name, message]) => (fieldLabels[name.split('.')[0]] || 'Details') + ': ' + message).join(' '), true);
  const first = entries.map(([name]) => form[{developer: 'creator'}[name] || name.split('.')[0]]).find(field => field?.focus);
  if (first) { if ($('more-metadata').contains(first)) $('more-metadata').open = true; first.focus(); }
}
async function prepare(operation) {
  if (!selected && !listing) return;
  if (['suspend', 'delist', 'restore', 'claim'].includes(operation) && $('reason').value.trim().length < 10) {
    $('policy-evidence').open = true;
    $('reason').focus();
    notice('Please enter a reason of at least 10 characters for this action.', true);
    return;
  }
  let payload = ['feature', 'unfeature'].includes(operation) ? {} : values();
  if (['submission', 'edit'].includes(operation) && snapshot) {
    const now = formState(), changed = Object.keys(snapshot).filter(name => now[name] !== snapshot[name]);
    if (!changed.length) { notice('Nothing has changed yet.'); return; }
    if (selected) payload = {kind: selected.kind, listing_id: selected.listing_id, ...(selected.payload.note ? {note: selected.payload.note} : {}), ...Object.fromEntries(changed.filter(name => name in payload && name !== 'no_page').map(name => [name, payload[name]]))};
  }
  if (!selected) { const {creator, ...rest} = payload; payload = {...rest, developer: creator}; }
  const feature = operation === 'submission' && !$('feature-choice').hidden && $('also-feature').checked;
  let result;
  try { result = await api('prepare', {operation, payload, ...(selected ? {submission_id: selected.id, revision: selected.revision} : {project_id: listing.id}), reason: $('reason').value, transfer: $('transfer').checked, omit_artwork: $('omit-artwork').checked, ...(feature ? {feature: true} : {})}); }
  catch (e) { if (!e.fields) throw e; return fieldErrors(e); }
  notice('Private preparation queued. The review will update automatically when ready.');
  await reviews(result.id);
}
function renderCatalog() {
  const query = $('catalog-search').value.trim().toLowerCase();
  $('catalog-items').replaceChildren();
  const matched = catalogItems.filter(p => (p.title + ' ' + p.id).toLowerCase().includes(query));
  $('catalog-count').textContent = matched.length + (matched.length === 1 ? ' listing' : ' listings');
  for (const p of matched) {
    const article = el('article'); article.className = 'item-card';
    const head = el('div'); head.className = 'card-head';
    const state = p.moderation || 'approved';
    head.append(el('h3', p.title), tag(state, listingLabels[state] || 'Unknown status'));
    article.append(head, line(p.id, 'card-meta'));
    const actions = el('div'); actions.className = 'card-actions';
    actions.append(button('Manage ' + p.title, () => manageListing(p)));
    if (p.feature_eligible) {
      const op = p.featured ? 'unfeature' : 'feature';
      actions.append(button(p.featured ? 'Clear Featured' : (catalogItems.some(item => item.featured) ? 'Switch Featured to this project' : 'Make Featured'), async () => {
        selected = null; listing = p; await prepare(op);
      }));
    }
    article.append(actions); $('catalog-items').append(article);
  }
  if (!matched.length) $('catalog-items').append(line('No matching listings.', 'muted'));
}
async function manageListing(p) {
  clearTimeout(reviewTimer);
  const detailData = await api('listing?id=' + encodeURIComponent(p.id));
  const record = detailData.record, state = p.moderation || 'approved';
  selected = null; listing = p; lastList = 'catalog-panel'; show('detail');
  $('detail-title').textContent = 'Manage: ' + (record.title || p.title);
  $('detail-title').focus();
  $('detail-kind').textContent = 'Listing ' + p.id;
  $('detail-helper').textContent = 'Update a project or prepare a protected change to its published status.';
  $('details').replaceChildren(tag(state, listingLabels[state] || 'Unknown status'));
  const sources = detailLinks(liveValues(record));
  if (sources.childNodes.length) $('details').append(sources);
  if (detailData.message) $('details').append(line(detailData.message, 'warning'));
  fill(liveValues(record)); snapshot = formState();
  $('metadata').hidden = !detailData.editable; $('moderation-notes').hidden = false; $('policy-evidence').hidden = false;
  $('prepare').disabled = !detailData.editable;
  $('more-metadata').open = false; $('moderation-notes').open = false; $('policy-evidence').open = false; $('history-panel').open = false;
  $('feature').hidden = !p.feature_eligible || Boolean(p.featured);
  $('feature').textContent = catalogItems.some(item => item.featured) ? 'Replace Featured' : 'Feature';
  $('unfeature').hidden = !p.featured || !p.feature_eligible;
  $('suspend').hidden = state !== 'approved'; $('delist').hidden = !['approved', 'suspended'].includes(state); $('restore').hidden = !['suspended', 'delisted'].includes(state);
  $('submission-actions').hidden = true; $('listing-actions').hidden = false; $('delete-panel').hidden = true; $('prepare-panel').hidden = false; $('feature-choice').hidden = true;
  $('prepare').textContent = 'Prepare metadata / artwork changes';
  $('history').replaceChildren(el('h3', 'Changes to this listing'));
  const wentLive = (detailData.history || []).filter(h => ['published', 'withdrawn'].includes(h.state));
  for (const h of wentLive) $('history').append(line([when(h.created), operationLabels[h.operation] || 'Change', h.state === 'withdrawn' ? 'Done' : reviewLabels[h.state], h.reason, h.approved_by && 'Approved by ' + h.approved_by].filter(Boolean).join(' · ')));
  if (!wentLive.length) $('history').append(line('No changes recorded yet.', 'muted'));
}
async function catalog() {
  clearTimeout(reviewTimer);
  const data = await api('catalog');
  catalogItems = data.projects;
  show('catalog-panel'); lastList = 'catalog-panel';
  $('featured-summary').textContent = data.featured ? 'Currently Featured: ' + data.featured.title + ' · ' + data.featured.id : 'Currently Featured: none';
  renderCatalog();
}
function scheduleReview(id) {
  clearTimeout(reviewTimer);
  reviewTimer = setTimeout(() => {
    if (!$('publication').hidden && selectedReview?.id === id) run(() => { settle(); return reviews(id); })();
  }, 2500);
}
async function reviews(id, bucket = null) {
  clearTimeout(reviewTimer);
  show('publication');
  const items = await strip(), shown = bucket ? items.filter(r => liveBucket(r) === bucket) : items;
  const list = $('review-list');
  list.replaceChildren(button('Refresh reviews', () => reviews(selectedReview?.id, bucket)));
  if (bucket) list.append(line('Showing only: ' + BUCKETS[bucket], 'muted'), button('Show all reviews', () => reviews()));
  for (const r of shown) {
    const item = button('', () => showReview(r));
    item.className = 'review-item';
    if (r.id === (id || selectedReview?.id)) item.classList.add('active');
    const name = el('span', reviewName(r) + ' · ' + (operationLabels[r.operation] || 'Change')); name.className = 'review-name';
    item.append(name, reviewTag(r));
    list.append(item);
  }
  const target = shown.find(r => r.id === id) ||
    shown.find(r => r.id === selectedReview?.id) ||
    shown.find(r => ['ready', 'approved', 'queued', 'processing'].includes(r.state)) ||
    shown[0];
  if (target) await showReview(target);
  else $('review-detail').replaceChildren(line(bucket ? 'Nothing here right now.' : 'No publication reviews yet. Prepare a submission or listing to get started.', 'muted'));
}
function differences(r) {
  const before = allReviews.find(o => o.id === r.payload.replaces)?.package;
  if (!before) return null;
  const a = before.listing || before.featured_preview || {}, b = r.package.listing || r.package.featured_preview || {}, names = new Set();
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) if (key !== 'approved_at' && JSON.stringify(a[key]) !== JSON.stringify(b[key])) names.add(diffLabels[key] || 'Other details');
  if (JSON.stringify((before.files || []).map(f => f.sha256)) !== JSON.stringify((r.package.files || []).map(f => f.sha256))) names.add('Images');
  return names.size ? 'Differs in: ' + [...names].join(', ') + '.' : 'No differences from what you approved before.';
}
function advanced(r) {
  const technical = el('details'); technical.className = 'disclosure';
  technical.append(el('summary', r.package ? 'Advanced: preview details, policy and file hashes' : 'Advanced: review details'));
  const body = el('div'); body.className = 'disclosure-body'; body.append(line('Review ' + r.id, 'card-meta'));
  technical.append(body); return [technical, body];
}
async function showReview(r) {
  clearTimeout(reviewTimer);
  selectedReview = r; show('publication'); $('publication-title').focus();
  const box = $('review-detail');
  box.replaceChildren();
  const head = el('div'); head.className = 'section-intro';
  const top = el('div'); top.append(el('h3', reviewName(r) + ' · ' + (operationLabels[r.operation] || 'Change')));
  head.append(top, reviewTag(r)); box.append(head);
  if (['queued', 'processing', 'ready'].includes(r.state)) {
    const steps = el('div'); steps.className = 'review-stage';
    for (const [text, current] of [['Preparing', r.state !== 'ready'], ['Your review', r.state === 'ready'], ['Publishing', false]]) { const part = el('span', text); if (current) { part.className = 'current'; part.setAttribute('aria-current', 'step'); } steps.append(part); }
    box.append(steps);
  }
  const panel = el('div'); panel.id = 'publication-status'; panel.className = 'action-panel'; panel.setAttribute('role', 'status'); panel.hidden = true;
  box.append(panel); track(r);
  if (r.error && !TRACKED.includes(r.state) && r.state !== 'stale') box.append(line('This review stopped: ' + r.error, 'warning'));
  const [technical, details] = advanced(r);
  if (!r.package) {
    if (!['queued', 'processing', 'publishing'].includes(r.state)) box.append(line('No preview is available for this review.', 'muted'));
    else if (watch.get(r.id)?.status?.stage !== 'attention') { const underway = line('Preparation is underway. This view refreshes automatically—no need to navigate away.', 'muted'); underway.id = 'underway'; box.append(underway); }
    box.append(technical);
    if (['queued', 'processing', 'publishing'].includes(r.state)) scheduleReview(r.id);
    return;
  }
  const pkg = r.package;
  if (r.state === 'ready') {
    box.append(line('Ready for your exact content and artwork review. Nothing has been published yet.'));
    if (r.payload.replaces) { const compared = differences(r); if (compared) box.append(line(compared)); }
    if (allReviews.some(o => o.id !== r.id && ['approved', 'publishing', 'pr-open'].includes(o.state))) box.append(line('Another change is being published. If it goes live first, this one will need a fresh preview.', 'warning'));
  }
  else if (!TRACKED.includes(r.state)) box.append(line('Status: ' + (reviewLabels[r.state] || 'Unknown')));
  for (const warning of pkg.warnings || []) box.append(line(warning, 'warning'));
  if (['feature', 'unfeature'].includes(pkg.operation)) {
    box.append(el('h3', 'Proposed homepage Featured project'));
    const project = pkg.featured_preview;
    if (project) {
      box.append(el('h4', project.title), line(project.description));
      box.append(detailLinks(project));
    } else box.append(line('No project selected. The existing empty Featured frame will appear after publication.'));
  }
  if (pkg.listing) {
    box.append(el('h3', 'Proposed listing'));
    box.append(el('h4', pkg.listing.title || 'Untitled project'));
    box.append(line(pkg.listing.description || 'No description provided.'));
    const meta = line([pkg.listing.developer || pkg.listing.creator, pkg.listing.game && optionText('game', pkg.listing.game), pkg.listing.category && optionText('category', pkg.listing.category), pkg.listing.status && optionText('status', pkg.listing.status)].filter(Boolean).join(' · '), 'card-meta');
    box.append(meta, detailLinks(pkg.listing));
  }
  const art = el('div'); art.className = 'artwork';
  const cover = Boolean(pkg.listing?.cover || pkg.featured_preview?.cover);
  for (const f of (pkg.files || []).filter(f => f.name.startsWith('preview-'))) {
    const figure = el('figure'), img = el('img'), n = Number(f.name.match(/\d/)[0]);
    img.src = '/api/preview?id=' + encodeURIComponent(r.id) + '&name=' + encodeURIComponent(f.name);
    img.alt = n === 0 && cover ? 'Prepared cover artwork' : 'Prepared project screenshot';
    figure.append(img, el('figcaption', n === 0 && cover ? 'Cover' : 'Screenshot ' + (cover ? n : n + 1))); art.append(figure);
  }
  if (!(pkg.files || []).length) art.append(line('This preview contains no images to inspect.'));
  if ((pkg.listing && !pkg.listing.cover) || (pkg.featured_preview && !pkg.featured_preview.cover)) art.append(line('No cover supplied. Public pages use the built-in artwork placeholder.'));
  box.append(art);
  details.append(line('Preview digest: ' + r.digest));
  if (pkg.listing) details.append(el('h4', 'Proposed listing JSON'), el('pre', JSON.stringify(pkg.listing, null, 2)));
  details.append(el('h4', 'Exact proposed publishing policy'), el('pre', JSON.stringify(pkg.policy, null, 2)), el('h4', 'Approved file inventory'), el('pre', JSON.stringify(pkg.files, null, 2)));
  box.append(technical);
  if (r.state === 'ready') {
    const approvals = el('div'); approvals.className = 'action-panel';
    approvals.append(el('h3', 'Final review'));
    const acknowledgements = [['content-reviewed', 'I reviewed the exact content, source and download links.']];
    if (pkg.files.length) acknowledgements.push(['artwork-reviewed', 'I inspected all prepared images and verified their suitability and rights.']);
    for (const [id, text] of acknowledgements) {
      const label = el('label'), input = el('input');
      input.type = 'checkbox'; input.id = id;
      label.append(input, document.createTextNode(' ' + text)); approvals.append(label);
    }
    const pub = el('textarea'); pub.id = 'approval-public'; pub.maxLength = 500; pub.rows = 2;
    const pl = el('label', 'Public receipt decision note'); pl.append(pub); approvals.append(pl);
    const priv = el('textarea'); priv.id = 'approval-private'; priv.maxLength = 1000; priv.rows = 2;
    const prl = el('label', 'Private decision note (optional)'); prl.append(priv); approvals.append(prl);
    const exceptional = el('details'); exceptional.className = 'disclosure'; exceptional.append(el('summary', 'Advanced: exceptional approval reason'));
    const why = el('textarea'); why.maxLength = 500; why.rows = 2;
    const wl = el('label', 'Reason for exceptional approval (records justification; does not bypass preparation validation)'); wl.append(why);
    const extra = el('div'); extra.className = 'disclosure-body'; extra.append(wl); exceptional.append(extra); approvals.append(exceptional);
    const approve = expedite => async () => {
      const unticked = [$('content-reviewed'), $('artwork-reviewed')].find(tick => tick && !tick.checked);
      if (unticked) { unticked.focus(); notice('Tick the review boxes for this exact preview first.', true); return; }
      if (!await confirmAction(expedite ? 'Approve this exact preview and start publication now? Checks still run; it is not live until deployment is verified.' : 'Approve this exact preview? It remains unpublished until its publication is merged and deployment succeeds.')) return;
      const result = await api('approve', {id: r.id, version: r.version, digest: r.digest, content_reviewed: $('content-reviewed').checked, artwork_reviewed: $('artwork-reviewed')?.checked || false, public_note: pub.value, private_note: priv.value, override: why.value.trim().length > 0, reason: why.value, expedite});
      notice(result.warning ? 'Exact approval recorded. ' + result.warning : expedite ? 'Exact approval recorded; publication started.' : 'Exact approval recorded.', Boolean(result.warning));
      await reviews(r.id);
    };
    const actions = el('div'); actions.className = 'review-actions';
    actions.append(button('Approve & Expedite', approve(true)),
      button(pkg.files.length ? 'Approve exact content and artwork' : 'Approve exact content', approve(false)));
    if (r.operation === 'submission' && ['add', 'suggest'].includes(r.payload.value?.kind) && r.payload.feature !== true) actions.append(button('Prepare again as Featured', async () => reviews(await recover.reprepare(r, {feature: true}))));
    approvals.append(actions); box.append(approvals);
  }
  if (['queued', 'processing'].includes(r.state)) scheduleReview(r.id);
}
async function sessions() { show('session-panel'); const data = await api('sessions'); $('session-list').replaceChildren(); for (const s of data) $('session-list').appendChild(el('article')).append(el('p', s.email), button('Revoke sessions for ' + s.email, async () => { if (!await confirmAction('Revoke all active sessions for this administrator?')) return; await api('revoke', {subject: s.subject}); notice('Sessions revoked.'); await sessions(); })); }
$('login').onclick = run(async () => { signedIn(await api('login', {})); await queue(); });
$('logout').onclick = run(async () => { try { await api('logout', {}); } finally { location.assign('/cdn-cgi/access/logout'); } });
$('inbox').onclick = run(async () => { $('filters').hidden = false; $('previous').hidden = false; $('next').hidden = false; await queue(); });
$('catalog').onclick = run(catalog); $('reviews').onclick = run(() => reviews()); $('sessions').onclick = run(sessions);
$('ratings').onclick = run(async () => (await import('./ratings.js')).open());
for (const [name, state] of [['new', 'new'], ['waiting', 'needs-changes']]) $('count-' + name).onclick = run(async () => { $('state').value = state; page = 1; picked.clear(); await queue(); });
for (const name of ['ready', 'publishing', 'attention']) $('count-' + name).onclick = run(() => reviews(undefined, name));
$('back-to-list').onclick = run(() => lastList === 'catalog-panel' ? catalog() : queue());
$('catalog-search').addEventListener('input', renderCatalog);
for (const name of ['search', 'state', 'sort']) $(name).addEventListener(name === 'search' ? 'input' : 'change', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => run(async () => { page = 1; picked.clear(); await queue(); })(), name === 'search' ? 300 : 0);
});
$('select-all').onclick = run(async () => {
  const found = (await api('queue?all=1&q=' + encodeURIComponent($('search').value) + '&state=' + encodeURIComponent($('state').value))).ids;
  picked.clear(); for (const id of found) picked.add(id);
  updateSelection();
});
$('clear-selection').onclick = () => { picked.clear(); updateSelection(); };
$('delete-selected').onclick = run(() => removeSubmissions([...picked]));
$('delete-submission').onclick = run(() => removeSubmissions([selected.id]));
$('filters').onsubmit = run(async () => { page = 1; picked.clear(); await queue(); }); $('previous').onclick = run(async () => { page--; await queue(); }); $('next').onclick = run(async () => { page++; await queue(); });
$('start').onclick = run(() => decide('in-review')); $('corrections').onclick = run(() => decide('needs-changes')); $('reject').onclick = run(() => decide('rejected'));
$('prepare').onclick = run(() => prepare(selected?.kind === 'claim' ? 'claim' : selected ? 'submission' : 'edit'));
for (const op of ['suspend', 'delist', 'restore', 'feature', 'unfeature']) $(op).onclick = run(() => prepare(op));
export {$, el, line, button, tag, api, run, notice, confirmAction, show};
try { signedIn(await api('session')); await queue(); } catch { notice('Sign in through your authorized administrator identity.'); }
