import {tidyAddress, RECEIPT} from './submission.js';

const STORE = 'loghub-submissions';
const root = document.querySelector('[data-status]');
if (root) start(root);

const GLYPHS = {received: '○', 'in-review': '◐', 'needs-changes': '!', approved: '✓', published: '✓✓', rejected: '×'};
const NAMES = {received: 'Received', 'in-review': 'In review', 'needs-changes': 'Needs changes', approved: 'Approved', published: 'Published', rejected: 'Not accepted'};
// The Worker's own sentence for this status names internal checks; it can only be redeployed by hand.
const MESSAGES = {approved: 'Approved. It will appear in the directory soon.'};

function saved() {
  try { return JSON.parse(localStorage.getItem(STORE) || '[]').filter(item => RECEIPT.test(item.receipt)); } catch { return []; }
}
function forget(receipt) {
  try { localStorage.setItem(STORE, JSON.stringify(saved().filter(item => item.receipt !== receipt))); } catch {}
}

function start(root) {
  const api = root.dataset.api;
  const form = root.querySelector('#status-form');
  const input = form.elements.receipt;
  const result = root.querySelector('#result');
  const revise = root.querySelector('#revise-form');
  const failure = root.querySelector('#status-error');
  let current = '';

  function setError(message) {
    const error = form.querySelector('#e-receipt');
    error.textContent = message ? 'Problem: ' + message : '';
    error.hidden = !message;
    form.querySelector('.field').classList.toggle('invalid', !!message);
    if (message) { input.setAttribute('aria-invalid', 'true'); input.focus(); } else input.removeAttribute('aria-invalid');
  }
  async function post(path, body) {
    const response = await fetch(api + path, {method: 'POST', credentials: 'omit', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const data = await response.json().catch(() => ({}));
    return {response, data};
  }
  function show(data) {
    root.querySelector('#status-glyph').textContent = GLYPHS[data.status] || '';
    root.querySelector('#status-name').textContent = NAMES[data.status] || data.status;
    root.querySelector('#status-message').textContent = MESSAGES[data.status] || data.message;
    const note = root.querySelector('#status-note');
    note.hidden = !data.note;
    note.textContent = data.note ? (data.answered ? 'You replied. Our earlier message: ' : 'Message from the moderators: ') + data.note : '';
    root.querySelector('#status-updated').textContent = 'Last updated ' + new Date(data.updated_at).toLocaleString();
    const link = root.querySelector('#status-link');
    link.hidden = data.status !== 'published' || !data.project_id;
    if (!link.hidden) root.querySelector('#status-project').href = new URL(`projects/${encodeURIComponent(data.project_id)}/`, document.baseURI.replace(/submit\/status\/.*$/, '')).href;
    const claim = root.querySelector('#claim-box');
    claim.hidden = !data.challenge;
    if (data.challenge) root.querySelector('#claim-challenge').textContent = data.challenge;
    revise.hidden = data.status !== 'needs-changes';
    result.hidden = false;
    result.querySelector('h2').focus();
  }
  async function check(receipt, button) {
    failure.textContent = '';
    setError('');
    if (!RECEIPT.test(receipt)) { setError('That does not look like a receipt. Paste the whole code: 43 letters, numbers, dashes and underscores.'); return; }
    if (!api) { failure.textContent = 'Submissions are not open yet.'; return; }
    try {
      const {response, data} = await post('/status', {receipt});
      if (response.status === 404) {
        result.hidden = true;
        if (!button) { setError('We could not find that receipt. Check for typos or missing characters.'); return; }
        forget(receipt);
        button.closest('li').remove();
        root.querySelector('#saved').hidden = !root.querySelector('#saved-list li');
        failure.textContent = 'That submission is no longer stored. We delete a submission 30 days after a decision, or after 90 days without activity.';
        return;
      }
      if (response.status === 429) { failure.textContent = 'Too many checks. Please wait a minute and try again.'; return; }
      if (!response.ok || !data.status) { failure.textContent = 'Status is unavailable right now. Please try again later.'; return; }
      current = receipt;
      show(data);
    } catch {
      failure.textContent = 'Status is unavailable right now. Please try again later.';
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); check(input.value.trim()); });
  revise.addEventListener('change', event => { if (event.target.name === 'url') event.target.value = tidyAddress(event.target.value); });
  let replying = false;
  revise.addEventListener('submit', async event => {
    event.preventDefault();
    if (replying) return;
    failure.textContent = '';
    revise.querySelectorAll('.error').forEach(el => { el.hidden = true; el.textContent = ''; });
    revise.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    revise.querySelectorAll('.field.invalid').forEach(el => el.classList.remove('invalid'));
    const changes = {};
    for (const name of ['note', 'url', 'title', 'creator', 'description']) { const value = name === 'url' ? tidyAddress(revise.elements[name].value) : revise.elements[name].value.trim(); if (value) changes[name] = value; }
    if (!Object.keys(changes).length) { failure.textContent = 'Add a reply or change at least one detail.'; revise.elements.note.focus(); return; }
    replying = true;
    try {
      const {response, data} = await post('/revise', {receipt: current, changes});
      if (response.status === 422 && data.errors) {
        let first = null;
        for (const [key, message] of Object.entries(data.errors)) {
          const name = key.replace(/\..*$/, '');
          const el = revise.querySelector(`#e-${name}`);
          const control = revise.elements[name];
          if (!el || !control) continue;
          el.textContent = 'Problem: ' + message;
          el.hidden = false;
          control.setAttribute('aria-invalid', 'true');
          control.closest('.field').classList.add('invalid');
          const more = control.closest('details');
          if (more) more.open = true;
          first ||= control;
        }
        failure.textContent = 'Please fix the highlighted fields.';
        first?.focus();
        return;
      }
      if (response.status === 409) { await check(current); failure.textContent = 'This submission is no longer waiting for changes. Its current status is shown above.'; return; }
      if (response.status === 429) { failure.textContent = 'Too many replies in a short time. Your reply is kept here; please try again in an hour.'; return; }
      if (!response.ok) { failure.textContent = response.status < 500 && data.error ? data.error : 'We could not send that right now. Your reply is kept here; please try again later.'; return; }
      revise.reset();
      check(current);
    } catch {
      failure.textContent = 'We could not send that right now. Your reply is kept here; please try again later.';
    } finally { replying = false; }
  });
  const list = saved();
  const ul = root.querySelector('#saved-list');
  for (const item of list) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary';
    button.textContent = `${item.title} (${new Date(item.at).toLocaleDateString()})`;
    button.addEventListener('click', () => { input.value = item.receipt; check(item.receipt, button); });
    li.append(button);
    ul.append(li);
  }
  root.querySelector('#saved').hidden = !list.length;
  form.querySelector('button[type=submit]').disabled = false;
  const linked = location.hash.slice(1);
  if (RECEIPT.test(linked)) {
    history.replaceState(null, '', location.pathname + location.search);
    input.value = linked;
    check(linked);
  } else if (list.length === 1) {
    input.value = list[0].receipt;
    check(list[0].receipt, ul.querySelector('button'));
  }
}
