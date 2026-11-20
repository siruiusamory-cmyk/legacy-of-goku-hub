import {$, el, line, button, api, notice, confirmAction, show} from './admin.js';

const ACTIONS = {'ratings-exclude': 'Stop counting requested', 'ratings-exclude-result': 'Stop counting, browsers affected', 'ratings-restore': 'Count again requested', 'ratings-restore-result': 'Count again, browsers affected'};
const short = a => a.count ? `${a.average.toFixed(1)} from ${a.count}` : 'no ratings';
const full = a => a.count ? short(a) + (a.count === 1 ? ' rating' : ' ratings') : 'no ratings';
const counts = r => `${r.credentials} ${r.credentials === 1 ? 'browser' : 'browsers'}, ${r.votes} ${r.votes === 1 ? 'rating' : 'ratings'}`;
const problemLine = text => { const n = line(text, 'warning'); n.setAttribute('role', 'alert'); return n; };

export async function open() { show('ratings-panel'); $('ratings-title').focus(); await load(); }

async function load(problem = '') {
  let data;
  try { data = await api('ratings'); } catch (e) { $('ratings-body').replaceChildren(problemLine(e.message)); return; }
  const cards = el('div'); cards.className = 'card-list';
  for (const p of data.projects) cards.append(card(p));
  $('ratings-body').replaceChildren(...(problem ? [problemLine(problem)] : []), cards, exclusions(data.exclusions), log(data.log));
}
async function reload(problem) { await load(problem); $('ratings-title').focus(); }
const act = fn => async () => { try { await fn(); } catch (e) { await reload(e.message); } };

function card(p) {
  const item = el('article'); item.className = 'item-card';
  item.append(el('h3', p.title || p.id), line(p.count ? 'Community rating ' + full(p) : 'No ratings yet'), line(`${p.excluded} not counted`), line(p.scores.map(s => `Score ${s.score}: ${s.counted}`).join(' · ')));
  if (p.unusual) item.append(line('Worth a look: many one-time ratings of the same score', 'warning'));
  if (!p.consistent) item.append(line('Totals need checking', 'warning'));
  const box = el('details'), body = el('div'); box.className = 'disclosure'; body.className = 'disclosure-body';
  box.append(el('summary', 'One-time ratings by score'), body);
  const groups = p.scores.filter(s => s.only_here > 0);
  if (!groups.length) body.append(line('No score has five or more one-time ratings.', 'muted'));
  for (const s of groups) body.append(group(p, s));
  item.append(box);
  return item;
}

function group(p, s) {
  const wrap = el('div'), input = el('input'), label = el('label', 'Reason (at least 10 characters; do not include names)'), row = el('div');
  input.maxLength = 200; input.autocomplete = 'off'; label.append(input); row.className = 'action-row';
  row.append(button('Stop counting these', act(async () => {
    const reason = input.value.trim();
    if (reason.length < 10) { notice('Write a reason of at least 10 characters first.', true); input.focus(); return; }
    const ask = {project_id: p.id, score: s.score, reason}, preview = await api('ratings/exclude', ask);
    if (!await confirmAction(`Stop counting ${preview.credentials} ratings of ${s.score} on ${p.title || p.id}.\nRating now ${full(preview.before)}; after ${full(preview.after)}.\nThis includes any genuine one-time ratings of ${s.score}. You can undo it under "Ratings not being counted".\nThese browsers' future ratings will not be counted either, until you count them again.`)) return;
    const done = await api('ratings/exclude', {...ask, expected: preview.credentials});
    await reload();
    notice(`Stopped counting ${done.excluded} ratings. ${p.title || p.id}: ${short(done.before)}, now ${short(done.after)}.`);
  })));
  wrap.append(line(`${s.only_here} ratings of ${s.score} came from browsers that rated nothing else`), label, row);
  return wrap;
}

function exclusions(rows) {
  const box = el('div'), list = el('ul'); list.className = 'compare';
  box.append(el('h3', 'Ratings not being counted'), rows.length ? list : line('None.', 'muted'));
  for (const r of rows) list.appendChild(el('li')).append(line(r.reason), line(counts(r), 'muted'), button('Count these again', act(async () => {
    if (!await confirmAction(`Count these ratings again?\n${r.reason}\n${counts(r)}. Their future ratings will be counted too.`)) return;
    const done = await api('ratings/restore', {reason: r.reason});
    await reload();
    notice(`Counting ratings from ${done.restored} ${done.restored === 1 ? 'browser' : 'browsers'} again.`);
  })));
  return box;
}

function log(rows) {
  const box = el('div'), list = el('ul'); list.className = 'compare';
  box.append(el('h3', 'Recent ratings actions'), rows.length ? list : line('None yet.', 'muted'));
  for (const r of rows) list.appendChild(el('li')).append(line(`${ACTIONS[r.action] || r.action}: ${r.private_note}`), line(`${new Date(r.created * 1000).toLocaleString()} · ${r.actor}`, 'muted'));
  return box;
}
