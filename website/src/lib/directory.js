const form = document.querySelector('.directory-controls');
const grid = document.querySelector('.project-grid');
const cards = [...grid.querySelectorAll('.project-card')];
const tabs = [...document.querySelectorAll('.category-tabs a')];
const controls = Object.fromEntries(['search','game','status','sort'].map(id => [id, document.getElementById(id)]));
// The address is the only record of the selected category, so links, reload and Back/Forward all agree.
function selected() {
  const wanted = new URLSearchParams(location.search).get('category');
  return tabs.some(tab => tab.dataset.category === wanted) ? wanted : tabs[0].dataset.category;
}
function update() {
  const query = controls.search.value.normalize('NFKC').toLowerCase().trim();
  const category = query ? null : selected();
  let visible = 0, listed = 0;
  for (const tab of tabs) tab.dataset.category === category ? tab.setAttribute('aria-current', 'true') : tab.removeAttribute('aria-current');
  for (const card of cards) {
    const inCategory = !category || card.dataset.category === category;
    if (inCategory) listed++;
    card.hidden = !(inCategory && card.dataset.search.includes(query) && ['game','status'].every(key => !controls[key].value || card.dataset[key] === controls[key].value || key === 'game' && card.dataset.game === 'multiple'));
    if (!card.hidden) visible++;
  }
  const key = controls.sort.value;
  cards.sort((a,b) => {const x = a.dataset[key], y = b.dataset[key]; return (x < y ? -1 : x > y ? 1 : 0) * (key === 'name' ? 1 : -1) || (a.dataset.id < b.dataset.id ? -1 : 1);}).forEach(card => grid.append(card));
  document.getElementById('no-results').hidden = visible > 0;
  document.getElementById('result-count').textContent = `${visible} ${visible === 1 ? 'project' : 'projects'}${category ? '' : ' in all categories'}`;
  const clear = document.querySelector('[data-clear-filters]');
  if (clear) {
    clear.hidden = !listed;
    document.getElementById('no-results-title').textContent = listed ? 'No matching projects' : 'Nothing in this category yet';
    document.getElementById('no-results-hint').textContent = listed ? 'Try another search or clear your filters.' : 'Approved projects of this type will appear here.';
  }
}
function reset() {form.reset(); update();}
form.addEventListener('input', update);
form.addEventListener('change', update);
form.addEventListener('submit', event => {event.preventDefault(); update();});
document.querySelector('[data-clear-filters]')?.addEventListener('click', reset);
for (const tab of tabs) tab.addEventListener('click', event => {
  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  controls.search.value = '';
  history.pushState(null, '', tab.href);
  update();
});
addEventListener('popstate', update);
update();
