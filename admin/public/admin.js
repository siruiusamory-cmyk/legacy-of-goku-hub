const $ = id => document.getElementById(id);
let csrf = '', page = 1, total = 0, selected = null, listing = null, selectedReview;
let lastList = 'queue', catalogItems = [], searchTimer, reviewTimer;
const labels = {received: 'New submission', 'in-review': 'Under review', 'needs-changes': 'Awaiting corrections', approved: 'Approved', published: 'Published', rejected: 'Rejected'};
const reviewLabels = {queued: 'Preparing', processing: 'Preparing', ready: 'Ready for your review', approved: 'Approved', publishing: 'Publishing', 'pr-open': 'Publishing', published: 'Published', withdrawn: 'Published', failed: 'Needs attention', 'dispatch-failed': 'Needs attention', stale: 'Replaced', expired: 'Expired', discarded: 'Discarded'};
const stageLabels = {approved: 'Approved', publishing: 'Publishing', checks: 'Waiting for checks', deploying: 'Deploying', published: 'Published', attention: 'Needs attention'};
const TRACKED = ['queued', 'processing', 'approved', 'publishing', 'pr-open', 'failed', 'dispatch-failed', 'published', 'withdrawn'];
const MOVING = ['preparing', 'publishing', 'checks', 'deploying'];
const picked = new Set(), watch = new Map();
let trackTimer;
const notice = (text, error = false) => { $('notice').textContent = text; $('notice').classList.toggle('error', error); };
const el = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
const show = id => {
  for (const name of ['queue', 'catalog-panel', 'detail', 'publication', 'session-panel']) $(name).hidden = name !== id;
  const tab = {queue: 'inbox', 'catalog-panel': 'catalog', publication: 'reviews', 'session-panel': 'sessions'}[id];
  if (tab) for (const name of ['inbox', 'catalog', 'reviews', 'sessions']) {
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
  if (!response.ok) { if (response.status === 401) $('login').hidden = false; throw Error(result.error || 'Request failed'); } return result;
}
const run = fn => async event => { event?.preventDefault(); try { await fn(); } catch (e) { notice(e.message, true); } };
function button(text, fn) { const n = el('button', text); n.type = 'button'; n.addEventListener('click', run(fn)); return n; }
function link(address, label = address) { try { const u = new URL(address); if (u.protocol !== 'https:' || u.username || u.password) return el('span', address); const a = el('a', label); a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; } catch { return el('span', address); } }
function confirmAction(text, deleteLabel) {
  $('confirmation-title').textContent = deleteLabel ? 'Delete permanently?' : 'Confirm moderation action';
  $('confirm-button').textContent = deleteLabel || 'Confirm'; $('confirm-button').className = deleteLabel ? 'button-danger' : 'button-primary';
  $('confirmation-text').textContent = text; $('confirmation').showModal(); return new Promise(resolve => $('confirmation').addEventListener('close', () => resolve($('confirmation').returnValue === 'confirm'), {once: true})); }
function signedIn(s) { csrf = s.csrf; $('identity').textContent = s.email; $('workspace').hidden = false; $('logout').hidden = false; $('login').hidden = true; }
function tag(state, text = labels[state] || state) { const item = el('span', text); item.className = 'tag'; item.dataset.state = state; return item; }
function line(text, className = '') { const item = el('p', text); item.className = className; return item; }
function detailLinks(payload) {
  const wrapper = el('div'); wrapper.className = 'summary-links';
  const sources = [payload.url || payload.source?.url || payload.repository, payload.patch_url || payload.distribution?.url, ...(payload.links || []).map(l => l.url)].filter(Boolean);
  for (const address of [...new Set(sources)]) wrapper.append(link(address, address));
  return wrapper;
}
function reviewTag(r) { const item = tag(r.state, reviewLabels[r.state] || r.state); item.dataset.review = r.id; return item; }
function track(r) {
  if (!TRACKED.includes(r.state)) return;
  const known = watch.get(r.id);
  if (known?.state === r.state) { if (known.status) paint(r, known.status); return; }
  watch.set(r.id, {state: r.state, review: r, fails: 0});
  clearTimeout(trackTimer); trackTimer = setTimeout(tick, 0);
}
async function tick() {
  clearTimeout(trackTimer);
  let moving = 0;
  for (const [id, w] of watch) {
    if (w.status && !MOVING.includes(w.status.stage)) continue;
    try { w.status = await api('publication?id=' + id); w.fails = 0; }
    catch (e) { if (++w.fails >= 5) w.status = {stage: 'attention', message: 'The publication status could not be checked. ' + e.message, actions: [{action: 'check', label: 'Check publication'}]}; }
    if (w.status) paint(w.review, w.status);
    if (!w.status || MOVING.includes(w.status.stage)) moving++;
  }
  // 20 seconds keeps six tracked publications near 18 dashboard requests a minute, under the 120 limit.
  if (moving) trackTimer = setTimeout(tick, document.hidden ? 60000 : 20000);
}
const recover = {
  check: async () => {},
  publish: async r => { await api('publish', {id: r.id, digest: r.digest}); notice('Publication started.'); },
  redeploy: async r => { await api('redeploy', {id: r.id}); notice('Publishing restarted.'); },
  discard: async r => {
    if (!await confirmAction('Discard this unfinished review? Nothing from it will be published. The submission or listing itself is kept.')) return false;
    await api('discard', {id: r.id}); notice('Unfinished review discarded.');
  },
  reprepare: async r => {
    const request = {operation: r.operation, payload: r.payload.value, reason: r.payload.reason, transfer: r.payload.transfer, omit_artwork: r.payload.omit_artwork};
    if (r.submission_id) Object.assign(request, {submission_id: r.submission_id, revision: (await api('detail?id=' + r.submission_id)).submission.revision});
    else request.project_id = r.project_id;
    const made = await api('prepare', request);
    notice('A new review is being prepared. Nothing is approved until you review it.');
    return made.id;
  }
};
function paint(r, s) {
  if (stageLabels[s.stage]) for (const item of document.querySelectorAll(`[data-review="${r.id}"]`)) { item.textContent = stageLabels[s.stage]; item.dataset.state = s.stage === 'attention' ? 'failed' : s.stage; }
  const panel = $('publication-status');
  if (!panel || selectedReview?.id !== r.id) return;
  r = selectedReview;
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
  for (const a of s.actions || []) {
    const b = button(a.label, async () => { const next = await recover[a.action](r); if (next === false) return; watch.delete(r.id); await reviews(next || r.id); });
    if (a.action === 'discard') b.className = 'button-danger';
    actions.append(b);
  }
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
    row.append(head, line('Submitted ' + new Date(s.created * 1000).toLocaleString(), 'card-meta'));
    row.append(s.url ? link(s.url) : line('No project address', 'muted'));
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
    head.append(el('h3', item.payload.title || item.listing_id || 'Untitled submission'), following ? reviewTag(item.review) : tag(item.state));
    article.append(head, line(item.kind + ' · ' + new Date(item.created * 1000).toLocaleString(), 'card-meta'));
    if (item.payload.url) article.append(link(item.payload.url, 'View source'));
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
  $('pagination').textContent = 'Page ' + page + ' · ' + total + ' submissions';
  $('previous').disabled = page === 1;
  $('next').disabled = page * 25 >= total;
}
function fill(value) {
  $('metadata').reset(); const form = $('metadata').elements;
  for (const name of ['title', 'description', 'url', 'game', 'category', 'status', 'patch_url']) form[name].value = value[name] || '';
  form.creator.value = value.creator || value.developer || ''; form.no_page.checked = value.no_page === true;
  form.artwork.value = (value.artwork || []).join('\n'); form.links.value = (value.links || []).map(l => l.label + ' | ' + l.url).join('\n');
  $('omit-artwork').checked = value.omit_artwork === true;
  $('public-note').value = selected?.public_note || ''; $('private-note').value = selected?.private_note || ''; $('reason').value = ''; $('transfer').checked = false;
}
function values() {
  const form = $('metadata').elements, value = {...(selected?.payload || {})};
  for (const name of ['title', 'description', 'url', 'game', 'category', 'status', 'patch_url', 'creator']) value[name] = form[name].value;
  value.no_page = form.no_page.checked;
  value.artwork = form.artwork.value.split('\n').map(s => s.trim()).filter(Boolean);
  value.links = form.links.value.split('\n').filter(s => s.trim()).map(s => { const at = s.indexOf('|'); if (at < 1) throw Error('Use label | HTTPS address for each community link'); return {label: s.slice(0, at).trim(), url: s.slice(at + 1).trim()}; });
  return value;
}
async function detail(id) {
  clearTimeout(reviewTimer);
  const data = await api('detail?id=' + id);
  selected = data.submission; listing = null; lastList = 'queue';
  show('detail');
  $('detail-title').textContent = 'Review: ' + (selected.payload.title || selected.listing_id || 'Untitled project');
  $('detail-title').focus();
  $('detail-kind').textContent = 'Submission #' + id;
  $('detail-helper').textContent = 'Review the submitted information, make corrections if needed, then prepare the exact package.';
  const summary = $('details');
  summary.replaceChildren();
  const statusRow = el('div'); statusRow.className = 'summary-row';
  statusRow.append(tag(selected.state), line(selected.kind + ' · revision ' + selected.revision + ' · submitted ' + new Date(selected.created * 1000).toLocaleString()));
  summary.append(statusRow);
  const sources = detailLinks(selected.payload);
  if (sources.childNodes.length) summary.append(sources);
  if (selected.challenge) summary.append(line('Ownership challenge: ' + selected.challenge));
  summary.append(line('Artwork is verified in the prepared preview, not from untrusted source links.', 'muted'));
  if (selected.possible_duplicates.length) summary.append(line('Possible duplicate of ' + selected.possible_duplicates.map(d => 'submission ' + d.id).join(', '), 'warning'), duplicateBlock(selected, true));
  fill(selected.payload);
  $('submission-actions').hidden = false; $('listing-actions').hidden = true; $('delete-panel').hidden = false;
  $('prepare').textContent = selected.kind === 'claim' ? 'Prepare ownership verification' : 'Prepare private review';
  $('metadata').hidden = false; $('prepare').disabled = false;
  $('more-metadata').open = false;
  $('moderation-notes').open = selected.state === 'in-review' || selected.state === 'needs-changes'; $('policy-evidence').open = selected.kind === 'claim';
  $('history-panel').open = false;
  $('history').replaceChildren(el('h3', 'Moderation history'));
  for (const h of data.history) {
    $('history').append(line(new Date(h.created * 1000).toLocaleString() + ' · ' + h.actor + ' · ' + h.action), line('Public: ' + (h.public_note || '—')), line('Private: ' + (h.private_note || '—')));
  }
  for (const r of data.reviews) $('history').append(button('Open review · ' + (reviewLabels[r.state] || r.state), () => showReview(r)));
}
async function decide(state) {
  if (!selected) return;
  if (state !== 'in-review' && !await confirmAction(`Set this submission to “${labels[state]}”? The public note will appear on its receipt.`)) return;
  await api('decision', {id: selected.id, revision: selected.revision, state, public_note: $('public-note').value, private_note: $('private-note').value}); notice('Moderation decision recorded.'); await detail(selected.id);
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
  if (!selected) { const {creator, ...rest} = payload; payload = {...rest, developer: creator}; }
  const result = await api('prepare', {operation, payload, ...(selected ? {submission_id: selected.id, revision: selected.revision} : {project_id: listing.id}), reason: $('reason').value, transfer: $('transfer').checked, omit_artwork: $('omit-artwork').checked});
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
    head.append(el('h3', p.title), tag(p.moderation || 'approved', p.moderation || 'Approved'));
    article.append(head, line(p.id, 'card-meta'));
    const actions = el('div'); actions.className = 'card-actions';
    actions.append(button('Manage ' + p.id, () => manageListing(p)));
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
  const record = detailData.record;
  selected = null; listing = p; lastList = 'catalog-panel'; show('detail');
  $('detail-title').textContent = 'Manage: ' + (record.title || p.title);
  $('detail-title').focus();
  $('detail-kind').textContent = 'Listing ' + p.id;
  $('detail-helper').textContent = 'Update a project or prepare a protected change to its published status.';
  $('details').replaceChildren(tag(p.moderation || 'approved', p.moderation || 'Approved'));
  const sources = detailLinks({...record, url: record.source?.url || record.repository || ''});
  if (sources.childNodes.length) $('details').append(sources);
  if (detailData.message) $('details').append(line(detailData.message, 'warning'));
  fill({...record, url: record.source?.url || record.repository || '', patch_url: record.distribution?.url || ''});
  $('metadata').hidden = !detailData.editable;
  $('prepare').disabled = !detailData.editable;
  $('more-metadata').open = false; $('moderation-notes').open = false; $('policy-evidence').open = false; $('history-panel').open = false;
  $('feature').hidden = !p.feature_eligible || Boolean(p.featured);
  $('feature').textContent = catalogItems.some(item => item.featured) ? 'Replace Featured' : 'Feature';
  $('unfeature').hidden = !p.featured || !p.feature_eligible;
  $('submission-actions').hidden = true; $('listing-actions').hidden = false; $('delete-panel').hidden = true;
  $('prepare').textContent = 'Prepare metadata / artwork changes';
  $('history').replaceChildren();
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
    if (!$('publication').hidden && selectedReview?.id === id) run(() => reviews(id))();
  }, 2500);
}
async function reviews(id) {
  clearTimeout(reviewTimer);
  show('publication');
  const data = await api('reviews');
  const list = $('review-list');
  list.replaceChildren(button('Refresh reviews', () => reviews(selectedReview?.id)));
  for (const r of data.items) {
    const item = button('', () => showReview(r));
    item.className = 'review-item';
    if (r.id === (id || selectedReview?.id)) item.classList.add('active');
    const name = el('span', (r.package?.listing?.title || r.package?.featured_preview?.title || r.project_id || 'New listing') + ' · ' + r.operation); name.className = 'review-name';
    item.append(name, reviewTag(r));
    list.append(item);
  }
  for (const r of data.items.filter(r => ['approved', 'publishing', 'pr-open'].includes(r.state)).slice(0, 6)) track(r);
  const target = data.items.find(r => r.id === id) ||
    data.items.find(r => r.id === selectedReview?.id) ||
    data.items.find(r => ['ready', 'approved', 'queued', 'processing'].includes(r.state)) ||
    data.items[0];
  if (target) await showReview(target);
  else $('review-detail').replaceChildren(line('No publication reviews yet. Prepare a submission or listing to get started.', 'muted'));
}
async function showReview(r) {
  clearTimeout(reviewTimer);
  selectedReview = r; show('publication'); $('publication-title').focus();
  const box = $('review-detail');
  box.replaceChildren();
  const head = el('div'); head.className = 'section-intro';
  const top = el('div'); top.append(el('h3', (r.project_id || 'New listing') + ' · ' + r.operation), line('Review ' + r.id, 'card-meta'));
  head.append(top, reviewTag(r)); box.append(head);
  if (['queued', 'processing', 'ready'].includes(r.state)) {
    const steps = el('div'); steps.className = 'review-stage';
    for (const [text, current] of [['Preparing', r.state !== 'ready'], ['Your review', r.state === 'ready'], ['Publishing', false]]) { const part = el('span', text); if (current) part.className = 'current'; steps.append(part); }
    box.append(steps);
  }
  const panel = el('div'); panel.id = 'publication-status'; panel.className = 'action-panel'; panel.setAttribute('role', 'status'); panel.hidden = true;
  box.append(panel); track(r);
  if (r.error && !TRACKED.includes(r.state)) box.append(line('This review stopped: ' + r.error, 'warning'));
  if (!r.package) {
    box.append(line(['queued', 'processing', 'publishing'].includes(r.state)
      ? 'Preparation is underway. This view refreshes automatically—no need to navigate away.'
      : 'No prepared package is available for this review.', 'muted'));
    if (['queued', 'processing', 'publishing'].includes(r.state)) scheduleReview(r.id);
    return;
  }
  const pkg = r.package;
  if (r.state === 'ready') box.append(line('Ready for your exact content and artwork review. Nothing has been published yet.'));
  else if (!TRACKED.includes(r.state)) box.append(line('Status: ' + (reviewLabels[r.state] || r.state)));
  for (const warning of pkg.warnings || []) box.append(line(warning, 'warning'));
  if (['feature', 'unfeature'].includes(pkg.operation)) {
    box.append(el('h3', 'Proposed homepage Featured project'));
    const project = pkg.featured_preview;
    if (project) {
      box.append(el('h4', project.title), line(project.description));
      box.append(detailLinks(project));
    } else box.append(line('No project selected. The existing empty Featured frame will appear after protected publication.'));
  }
  if (pkg.listing) {
    box.append(el('h3', 'Proposed listing'));
    box.append(el('h4', pkg.listing.title || 'Untitled project'));
    box.append(line(pkg.listing.description || 'No description provided.'));
    const meta = line([pkg.listing.developer || pkg.listing.creator, pkg.listing.game, pkg.listing.category, pkg.listing.status].filter(Boolean).join(' · '), 'card-meta');
    box.append(meta, detailLinks(pkg.listing));
  }
  const art = el('div'); art.className = 'artwork';
  for (const f of (pkg.files || []).filter(f => f.name.startsWith('preview-'))) {
    const figure = el('figure'), img = el('img');
    img.src = '/api/preview?id=' + encodeURIComponent(r.id) + '&name=' + encodeURIComponent(f.name);
    img.alt = f.name === 'preview-0.webp' && (pkg.listing?.cover || pkg.featured_preview?.cover) ? 'Prepared cover artwork' : 'Prepared project screenshot';
    figure.append(img, el('figcaption', f.name)); art.append(figure);
  }
  if (!(pkg.files || []).length) art.append(line('This package contains no artwork to inspect.'));
  if ((pkg.listing && !pkg.listing.cover) || (pkg.featured_preview && !pkg.featured_preview.cover)) art.append(line('No cover supplied. Public pages use the built-in artwork placeholder.'));
  box.append(art);
  const technical = el('details'); technical.className = 'disclosure';
  const summary = el('summary', 'Advanced: exact package, policy and file hashes'); technical.append(summary);
  const advanced = el('div'); advanced.className = 'disclosure-body';
  advanced.append(line('Exact package digest: ' + r.digest));
  if (pkg.listing) advanced.append(el('h4', 'Proposed listing JSON'), el('pre', JSON.stringify(pkg.listing, null, 2)));
  advanced.append(el('h4', 'Exact proposed publishing policy'), el('pre', JSON.stringify(pkg.policy, null, 2)), el('h4', 'Approved file inventory'), el('pre', JSON.stringify(pkg.files, null, 2)));
  technical.append(advanced); box.append(technical);
  if (r.state === 'ready') {
    const approvals = el('div'); approvals.className = 'action-panel';
    approvals.append(el('h3', 'Final review'));
    const acknowledgements = [['content-reviewed', 'I reviewed the exact content, source, download links and proposed policy.']];
    if (pkg.files.length) acknowledgements.push(['artwork-reviewed', 'I inspected all normalized artwork and verified its suitability and rights.']);
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
      if (!await confirmAction(expedite ? 'Approve this exact package and start protected publication now? Checks still run; it is not live until deployment is verified.' : 'Approve this exact package? It remains unpublished until a protected PR is merged and deployment succeeds.')) return;
      const result = await api('approve', {id: r.id, version: r.version, digest: r.digest, content_reviewed: $('content-reviewed').checked, artwork_reviewed: $('artwork-reviewed')?.checked || false, public_note: pub.value, private_note: priv.value, override: why.value.trim().length > 0, reason: why.value, expedite});
      notice(result.warning ? 'Exact approval recorded. ' + result.warning : expedite ? 'Exact approval recorded; protected publication started.' : 'Exact approval recorded.', Boolean(result.warning));
      await reviews(r.id);
    };
    const actions = el('div'); actions.className = 'review-actions';
    actions.append(button('Approve & Expedite', approve(true)),
      button(pkg.files.length ? 'Approve exact content and artwork' : 'Approve exact content', approve(false)));
    approvals.append(actions); box.append(approvals);
  }
  if (['queued', 'processing'].includes(r.state)) scheduleReview(r.id);
}
async function sessions() { show('session-panel'); const data = await api('sessions'); $('session-list').replaceChildren(); for (const s of data) $('session-list').appendChild(el('article')).append(el('p', s.email), button('Revoke sessions for ' + s.email, async () => { if (!await confirmAction('Revoke all active sessions for this administrator?')) return; await api('revoke', {subject: s.subject}); notice('Sessions revoked.'); await sessions(); })); }
$('login').onclick = run(async () => { signedIn(await api('login', {})); await queue(); });
$('logout').onclick = run(async () => { try { await api('logout', {}); } finally { location.assign('/cdn-cgi/access/logout'); } });
$('inbox').onclick = run(async () => { $('filters').hidden = false; $('previous').hidden = false; $('next').hidden = false; await queue(); });
$('catalog').onclick = run(catalog); $('reviews').onclick = run(() => reviews()); $('sessions').onclick = run(sessions);
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
try { signedIn(await api('session')); await queue(); } catch { notice('Sign in through your authorized administrator identity.'); }
