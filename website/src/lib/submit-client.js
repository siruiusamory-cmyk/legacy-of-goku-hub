import {validateSubmission, tidyAddress, tidyImage, KINDS, RECEIPT} from './submission.js';
import {urlKey, parseHttps, sourceKind} from './urlkey.js';

const STORE = 'loghub-submissions';
const DRAFT = 'loghub-submit-draft';
const root = document.querySelector('[data-submit]');
if (root) start(root);

function remember(entry) {
  try {
    const list = JSON.parse(localStorage.getItem(STORE) || '[]').filter(item => item.receipt !== entry.receipt);
    localStorage.setItem(STORE, JSON.stringify([entry, ...list].slice(0, 10)));
  } catch {}
}

function start(root) {
  const api = root.dataset.api;
  const siteKey = root.dataset.siteKey;
  const form = root.querySelector('#submit-form');
  const review = root.querySelector('#review');
  const receipt = root.querySelector('#receipt');
  const summary = root.querySelector('#error-summary');
  const status = root.querySelector('#send-status');
  const send = root.querySelector('#send-button');
  const edit = root.querySelector('#edit-button');
  let index = [];
  try { index = JSON.parse(document.querySelector('#listing-index').textContent); } catch {}
  const noteCopy = {
    add: ['Anything else we should know?', 'Only moderators can read this.'],
    suggest: ['Anything else we should know?', 'Only moderators can read this. Suggesting a project does not make you its owner.'],
    correct: ['What should change?', 'Describe the fix here, or fill in the new details above. Want the listing removed? Say so and why. Only moderators can read this.'],
    claim: ['How are you connected to this project?', 'For example: I made it, or I lead the team. No page you can edit to prove it? Say how else we can confirm it. Only moderators can read this.']
  };
  const urlHint = root.querySelector('#h-url').textContent;
  let kind = 'suggest';
  let duplicate = null;
  let listed = null;
  let pending = null;
  let saved = null;
  let token = '';
  let widget = null;
  let script = null;
  let sending = false;
  let done = false;

  const field = name => form.querySelector(`[data-field="${name}"]`);
  const control = name => form.elements[name];
  const labelOf = name => { const el = field(name)?.querySelector('label, legend'); return (el?.firstChild?.textContent || {kind: 'Action'}[name] || name).trim().replace(/\?$/, ''); };
  const optionText = (name, value) => [...control(name).options].find(option => option.value === value)?.textContent || value;
  const item = id => index.find(entry => entry.id === id);
  const shown = el => el && !el.closest('[hidden]');
  function rows(list, pairs) {
    list.replaceChildren();
    for (const [label, content] of pairs) {
      const wrapper = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = content;
      wrapper.append(dt, dd);
      list.append(wrapper);
    }
  }

  function requirements() {
    const noPage = shown(control('no_page')) && control('no_page').checked;
    control('url').disabled = noPage;
    if (noPage) control('url').value = '';
    form.querySelectorAll('[data-required]').forEach(el => {
      const on = el.dataset.required.split(' ').includes(kind) && !(el.dataset.field === 'url' && noPage);
      el.querySelector('.req').hidden = !on;
      const input = el.querySelector('input:not([type=checkbox]), select, textarea');
      if (on) input.setAttribute('aria-required', 'true'); else input.removeAttribute('aria-required');
    });
  }
  function showCurrent() {
    const entry = shown(control('listing_id')) ? item(control('listing_id').value) : null;
    const box = root.querySelector('#current');
    box.hidden = !entry?.now;
    if (box.hidden) return;
    const now = entry.now;
    rows(root.querySelector('#current-list'), [[labelOf('title'), entry.title], [labelOf('category'), optionText('category', now.category)], [labelOf('game'), optionText('game', now.game)], [labelOf('status'), optionText('status', now.status)], [labelOf('creator'), now.creator], [labelOf('url'), now.url || 'No web page'], [labelOf('description'), now.description]].filter(([, value]) => value));
    root.querySelector('#current-link').href = entry.url;
  }
  function showKind(next) {
    kind = next;
    form.querySelectorAll('[data-show]').forEach(el => { el.hidden = !el.dataset.show.split(' ').includes(kind); });
    root.querySelector('#kind-hint').textContent = form.querySelector(`input[name=kind][value=${kind}]`).closest('label').querySelector('.kind-text').textContent;
    const [label, hint] = noteCopy[kind];
    root.querySelector('#note-label').textContent = label;
    root.querySelector('#h-note').textContent = hint;
    const correct = kind === 'correct';
    for (const [name, text] of [['category', 'Choose one'], ['game', 'Not sure'], ['status', 'Not sure']]) control(name).options[0].textContent = correct ? 'Keep as listed' : text;
    root.querySelector('#h-url').textContent = correct ? 'Only if the project has moved to a new address.' : urlHint;
    requirements();
    checkDuplicate();
    prefillOffer();
    showCurrent();
    clearErrors();
  }
  function clearField(container) {
    container.classList.remove('invalid');
    container.querySelectorAll('.error').forEach(el => { el.hidden = true; el.textContent = ''; });
    container.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  }
  function clearErrors() {
    summary.hidden = true;
    summary.querySelector('ul').replaceChildren();
    form.querySelectorAll('.field').forEach(clearField);
  }
  function problems() {
    const checked = validateSubmission(read());
    const errors = {...checked.errors};
    if (duplicate) errors.url = `This project is already listed as ${duplicate.title}. Correct that listing instead.`;
    return {errors, value: checked.value};
  }
  function showErrors(errors) {
    clearErrors();
    const list = summary.querySelector('ul');
    const seen = new Set();
    const entries = Object.entries(errors).map(([key, message]) => ({name: key.replace(/\..*$/, ''), n: Number(key.split('.')[1]), message}));
    entries.sort((a, b) => { const x = field(a.name), y = field(b.name); return !x || !y || x === y ? 0 : x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
    for (const {name, n, message} of entries) {
      if (seen.has(name)) continue;
      seen.add(name);
      const container = field(name);
      const error = form.querySelector(`#e-${name}`);
      const input = (name === 'links' && form.querySelector(`#f-link-url-${n}`)) || container?.querySelector('input:not([type=checkbox]), select, textarea') || control(name);
      const text = (name === 'links' && n >= 0 ? `Link ${n + 1}: ` : name === 'artwork' && n >= 0 && n < 4 ? `Line ${artLines[n] ?? n + 1}: ` : '') + message;
      if (error) { error.textContent = 'Problem: ' + text; error.hidden = false; }
      container?.classList.add('invalid');
      input?.setAttribute('aria-invalid', 'true');
      const more = container?.closest('details');
      if (more) more.open = true;
      const entry = document.createElement('li');
      const link = document.createElement('a');
      entry.dataset.for = name;
      link.href = '#' + (input?.id || 'submit-form');
      link.textContent = `${labelOf(name)}: ${text}`;
      link.addEventListener('click', event => { event.preventDefault(); if (more) more.open = true; input?.focus(); });
      entry.append(link);
      list.append(entry);
    }
    summary.hidden = false;
    summary.focus();
  }
  function read() {
    const text = name => shown(control(name)) ? control(name).value : '';
    const links = [0, 1].map(i => ({label: text(`link_label_${i}`), url: tidyAddress(text(`link_url_${i}`))}));
    const lines = text('artwork').split(/\r?\n/).map(tidyImage);
    artLines = lines.flatMap((line, i) => line ? [i + 1] : []);
    const artwork = lines.filter(Boolean);
    const data = {kind, listing_id: text('listing_id'), url: tidyAddress(text('url')), no_page: shown(control('no_page')) && control('no_page').checked, title: text('title'), category: text('category'), description: text('description'), creator: text('creator'), game: text('game'), status: text('status'), patch_url: tidyAddress(text('patch_url')), links, artwork, note: text('note')};
    const entry = kind === 'correct' && item(data.listing_id);
    if (entry?.now) {
      for (const name of ['category', 'game', 'status', 'creator', 'description']) if (data[name].trim() === entry.now[name]) data[name] = '';
      if (data.title.trim() === entry.title) data.title = '';
      if (entry.keys.includes(urlKey(data.url.replace(/#.*$/, '')))) data.url = '';
    }
    return data;
  }
  function lookup(url) {
    const clean = tidyAddress(url).replace(/#.*$/, '');
    const key = parseHttps(clean) ? urlKey(clean) : null;
    if (!key) return null;
    return index.find(entry => entry.keys.includes(key)) || (listed?.key === key ? listed.entry : null);
  }
  function switchTo(action, id) {
    form.querySelector(`input[name=kind][value=${action}]`).checked = true;
    control('listing_id').value = id;
    showKind(action);
    control('listing_id').focus();
    saveDraft();
  }
  function checkDuplicate() {
    const box = form.querySelector('#duplicate');
    duplicate = (kind === 'add' || kind === 'suggest') && shown(control('url')) ? lookup(control('url').value) : null;
    box.replaceChildren();
    box.hidden = !duplicate;
    if (!duplicate) return;
    const text = document.createElement('p');
    text.append('This project is already listed as ');
    const link = document.createElement('a');
    link.href = duplicate.url;
    link.textContent = duplicate.title;
    text.append(link, '. Is something wrong with it?');
    box.append(text);
    if (!item(duplicate.id)) return;
    const actions = document.createElement('p');
    for (const [action, label] of [['correct', 'Correct this listing'], ['claim', 'Claim this listing']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.className = 'button secondary';
      button.addEventListener('click', () => switchTo(action, duplicate.id));
      actions.append(button, ' ');
    }
    box.append(actions);
  }
  function prefillOffer() {
    const box = form.querySelector('#prefill');
    const url = tidyAddress(control('url').value);
    const kindName = parseHttps(url) ? sourceKind(url) : null;
    box.hidden = !['github', 'gitlab', 'codeberg'].includes(kindName) || !!duplicate || kind === 'correct';
    form.querySelector('#prefill-note').textContent = box.hidden ? '' : 'Your browser asks that site directly. Check what it fills in.';
  }
  async function prefill() {
    const note = form.querySelector('#prefill-note');
    const url = parseHttps(tidyAddress(control('url').value));
    if (!url) return;
    const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    const kindName = sourceKind(url.href);
    note.textContent = 'Looking it up...';
    try {
      let endpoint;
      if (kindName === 'github' && parts.length >= 2) endpoint = `https://api.github.com/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
      else if (kindName === 'codeberg' && parts.length >= 2) endpoint = `https://codeberg.org/api/v1/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
      else if (kindName === 'gitlab' && parts.length >= 2) endpoint = `https://gitlab.com/api/v4/projects/${encodeURIComponent(parts.slice(0, parts.indexOf('-') === -1 ? parts.length : parts.indexOf('-')).join('/'))}`;
      if (!endpoint) throw Error('unsupported');
      const response = await fetch(endpoint, {headers: {Accept: 'application/json'}, credentials: 'omit', referrerPolicy: 'no-referrer'});
      if (!response.ok) throw Error('lookup failed');
      const data = await response.json();
      const fill = (name, value) => { const el = control(name); if (el && !el.value.trim() && typeof value === 'string' && value.trim()) el.value = value.trim().slice(0, name === 'description' ? 2000 : 100); };
      fill('title', (data.name || data.path || '').replace(/[-_]+/g, ' '));
      fill('description', data.description);
      fill('creator', data.owner?.login || data.owner?.username || data.namespace?.name);
      updateCount();
      saveDraft();
      note.textContent = 'Filled from the public page. Please check it and fix anything that is wrong.';
    } catch {
      note.textContent = 'We could not look that up. You can type the details instead.';
    }
  }
  function previewArt() {
    const list = form.querySelector('#art-preview');
    const lines = control('artwork').value.split(/\r?\n/).map(tidyImage).filter(Boolean).slice(0, 4);
    list.replaceChildren();
    list.hidden = !lines.length;
    form.querySelector('#art-note').textContent = lines.length ? 'Your browser asks each site for its picture.' : 'Paste at least one image link first.';
    lines.forEach((line, i) => {
      const entry = document.createElement('li');
      const caption = document.createElement('span');
      const name = `Image ${i + 1}${i ? '' : ' (cover)'}`;
      entry.append(caption);
      list.append(entry);
      if (!parseHttps(line.replace(/#.*$/, ''))) { caption.textContent = `${name}: not a web address we can use.`; return; }
      const img = new Image();
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      caption.textContent = `${name}: loading...`;
      img.onload = () => { caption.textContent = `${name}: loads, ${img.naturalWidth} by ${img.naturalHeight} pixels.`; };
      img.onerror = () => { img.remove(); caption.textContent = `${name}: could not load. Check that the link goes straight to a picture.`; };
      img.src = line;
      entry.prepend(img);
    });
  }
  function updateCount() { form.querySelector('#description-count').textContent = `${control('description').value.length} / 2000`; }

  let sameLink = false;
  let artLines = [];
  function saveDraft() {
    if (done) return;
    try {
      const data = {kind, search: location.search};
      for (const el of form.elements) if (el.name && el.name !== 'kind' && el.name !== 'hp_check') data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      sessionStorage.setItem(DRAFT, JSON.stringify(data));
    } catch {}
  }
  function loadDraft() {
    try {
      const data = JSON.parse(sessionStorage.getItem(DRAFT));
      if (!data || typeof data !== 'object') return false;
      let any = false;
      for (const el of form.elements) {
        if (!el.name || el.name === 'kind' || el.name === 'hp_check' || !(el.name in data)) continue;
        if (el.type === 'checkbox') el.checked = data[el.name] === true;
        else if (typeof data[el.name] === 'string') { el.value = data[el.name]; any ||= el.type !== 'select-one' && !!el.value; }
      }
      if (KINDS.includes(data.kind)) kind = data.kind;
      sameLink = data.search === location.search;
      return any;
    } catch { return false; }
  }

  function summarize(value) {
    const pairs = [['Action', form.querySelector(`input[name=kind][value=${value.kind}]`).closest('label').querySelector('.kind-title').textContent]];
    if (value.listing_id) pairs.push(['Listing', item(value.listing_id)?.title || value.listing_id]);
    if (value.url) pairs.push([labelOf('url'), value.url]); else if (value.no_page) pairs.push([labelOf('url'), 'No web page']);
    for (const key of ['title', 'category', 'game', 'status', 'creator', 'description', 'patch_url']) if (value[key]) pairs.push([labelOf(key), ['category', 'game', 'status'].includes(key) ? optionText(key, value[key]) : value[key]]);
    if (value.artwork) pairs.push([labelOf('artwork'), value.artwork.join('\n')]);
    if (value.links) pairs.push([labelOf('links'), value.links.map(link => `${link.label}: ${link.url}`).join('\n')]);
    if (value.note) pairs.push([labelOf('note'), value.note]);
    rows(root.querySelector('#review-list'), pairs);
  }
  function ready() {
    send.setAttribute('aria-disabled', String(!token || sending || !!listed?.blocked));
  }
  function humanScript() {
    if (window.turnstile) return Promise.resolve();
    script ||= new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      el.async = true;
      el.onload = resolve;
      el.onerror = () => { script = null; el.remove(); reject(Error('load')); };
      document.head.append(el);
    });
    return script;
  }
  async function mountHuman() {
    if (!api || !siteKey || widget !== null) return;
    widget = false;
    try {
      await humanScript();
      widget = window.turnstile.render(root.querySelector('#human-check'), {sitekey: siteKey, callback: value => { token = value; status.textContent = ''; ready(); }, 'expired-callback': () => { token = ''; ready(); }, 'error-callback': () => { token = ''; ready(); }}) ?? null;
      status.textContent = '';
    } catch {
      widget = null;
      status.textContent = 'The human check could not load. Check your connection, then press Send to try again.';
    }
  }
  function resetHuman() {
    token = '';
    try { if (window.turnstile && widget) window.turnstile.reset(widget); } catch {}
    ready();
  }
  function go(section) {
    form.hidden = section !== 'form';
    review.hidden = section !== 'review';
    receipt.hidden = section !== 'receipt';
    root.querySelectorAll('#steps li').forEach(li => { if (li.dataset.step === section) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    root.querySelector('#steps').scrollIntoView?.({block: 'start'});
    (section === 'form' ? form.querySelector('input[name=kind]:checked') : root.querySelector(`#${section} h2`)).focus({preventScroll: true});
  }
  function failure(code, error, sentKind) {
    if (code === 429) return 'You have sent several submissions in a short time. Please wait up to an hour and try again. Your answers are kept.';
    if (code === 404 && (sentKind === 'correct' || sentKind === 'claim')) return 'We could not confirm that listing just now. Your answers are kept; please try again in a few minutes.';
    if (code === 503) return error && error !== 'Submissions are unavailable' ? error + ' Your answers are kept.' : 'Submissions are not open right now. Your answers are kept; please try again later.';
    if (error && code >= 400 && code < 500) return error;
    return 'We could not send that. Your answers are kept; please try again.';
  }
  function alreadyListed(sent, found) {
    const entry = item(found.id) || {id: found.id, title: found.title, url: new URL(`../projects/${encodeURIComponent(found.id)}/`, location.href).href};
    listed = {key: urlKey(sent.url), entry, blocked: true};
    status.replaceChildren(`This project is already listed as ${found.title}. Press Edit to correct that listing instead, or `);
    const link = document.createElement('a');
    link.href = entry.url;
    link.textContent = 'open the listing';
    status.append(link, '.');
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    for (const el of form.querySelectorAll('[data-address]')) el.value = tidyAddress(el.value);
    checkDuplicate();
    const {errors, value} = problems();
    if (Object.keys(errors).length) { showErrors(errors); return; }
    clearErrors();
    pending = value;
    if (listed) listed.blocked = false;
    summarize(pending);
    status.textContent = api ? '' : 'Submissions are not open yet, so this cannot be sent. Your answers stay on this page.';
    send.disabled = !api;
    root.querySelector('#human-hint').hidden = !api;
    ready();
    go('review');
    mountHuman();
  });
  edit.addEventListener('click', () => { go('form'); checkDuplicate(); });
  send.addEventListener('click', async () => {
    if (!api || sending || listed?.blocked) return;
    if (!token) {
      status.textContent = widget === null ? 'Loading the human check again...' : 'Please complete the human check first.';
      mountHuman();
      return;
    }
    const sent = pending;
    sending = true;
    edit.disabled = true;
    ready();
    status.textContent = 'Sending...';
    try {
      const response = await fetch(api + '/submissions', {method: 'POST', credentials: 'omit', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...sent, token, company: control('hp_check').value})});
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.duplicate) { alreadyListed(sent, data.duplicate); return; }
      if (response.status === 422 && data.errors) { go('form'); showErrors(data.errors); return; }
      if (!response.ok) { status.textContent = failure(response.status, data.error, sent.kind); return; }
      if (!RECEIPT.test(data.receipt || '')) { status.textContent = failure(0); return; }
      saved = {receipt: data.receipt, title: sent.title || item(sent.listing_id)?.title || 'Submission', kind: sent.kind, at: Date.now()};
      remember(saved);
      done = true;
      try { sessionStorage.removeItem(DRAFT); } catch {}
      root.querySelector('#receipt-message').textContent = data.message || 'We have your submission. A person will review it before anything is published.';
      root.querySelector('#receipt-code').textContent = data.receipt;
      root.querySelector('#status-button').href = root.dataset.statusUrl + '#' + data.receipt;
      const steps = root.querySelector('#claim-steps');
      steps.hidden = !data.challenge;
      if (data.challenge) root.querySelector('#claim-challenge').textContent = data.challenge;
      go('receipt');
    } catch {
      status.textContent = failure(0);
    } finally {
      sending = false;
      edit.disabled = false;
      resetHuman();
    }
  });
  root.querySelector('#copy-receipt').addEventListener('click', async () => {
    const note = root.querySelector('#receipt-note');
    try { await navigator.clipboard.writeText(saved.receipt); note.textContent = 'Copied.'; } catch { note.textContent = 'Could not copy. Select the code and copy it yourself.'; }
  });
  root.querySelector('#save-receipt').addEventListener('click', () => {
    const text = `Legacy of Goku Hub submission receipt\n\nProject: ${saved.title}\nSent: ${new Date(saved.at).toISOString().slice(0, 10)}\nReceipt: ${saved.receipt}\n\nCheck its status at ${new URL(root.dataset.statusUrl, location.href).href}\nKeep this file private. Anyone who has the receipt can see the status.\n`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], {type: 'text/plain'}));
    link.download = 'legacy-of-goku-hub-receipt.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    root.querySelector('#receipt-note').textContent = 'Saved to your downloads.';
  });
  root.querySelector('#start-over').addEventListener('click', () => {
    try { sessionStorage.removeItem(DRAFT); } catch {}
    form.reset();
    listed = null;
    form.querySelector('#draft-note').hidden = true;
    form.querySelector('#art-preview').hidden = true;
    form.querySelector('#art-note').textContent = '';
    showKind('suggest');
    updateCount();
    form.querySelector('input[name=kind]:checked').focus();
  });
  form.addEventListener('change', event => {
    const target = event.target;
    if (target.matches('[data-address]')) target.value = tidyAddress(target.value);
    if (target.name === 'artwork') target.value = target.value.split(/\r?\n/).map(line => line.trim() ? tidyImage(line) : '').join('\n');
    if (target.name === 'kind') showKind(target.value);
    if (target.name === 'no_page') requirements();
    if (target.name === 'no_page' || target.name === 'url') { checkDuplicate(); prefillOffer(); }
    if (target.name === 'listing_id') showCurrent();
    saveDraft();
  });
  form.addEventListener('input', event => {
    if (event.target.name === 'url') { checkDuplicate(); prefillOffer(); }
    if (event.target.name === 'description') updateCount();
    saveDraft();
    const container = event.target.closest('.field.invalid');
    if (!container) return;
    const name = container.dataset.field;
    if (Object.keys(problems().errors).some(key => key.replace(/\..*$/, '') === name)) return;
    clearField(container);
    summary.querySelector(`li[data-for="${name}"]`)?.remove();
    summary.hidden = !summary.querySelector('li');
  });
  form.addEventListener('input', () => { if (api && siteKey) humanScript().catch(() => {}); }, {once: true});
  root.querySelector('#prefill-button').addEventListener('click', prefill);
  root.querySelector('#art-button').addEventListener('click', previewArt);

  const query = new URLSearchParams(location.search);
  form.querySelector('#draft-note').hidden = !loadDraft();
  if (!sameLink) {
    if (KINDS.includes(query.get('action'))) kind = query.get('action');
    if (item(query.get('listing'))) control('listing_id').value = query.get('listing');
  }
  form.querySelector(`input[name=kind][value=${kind}]`).checked = true;
  showKind(kind);
  updateCount();
  document.querySelector('#script-note').hidden = true;
  root.querySelector('#review-button').disabled = false;
}
