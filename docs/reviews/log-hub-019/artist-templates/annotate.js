const regions = [
  {sel: '.brand-beam', name: 'Energy banner', status: 'done', source: '960x160 PNG (artist)', bg: 'transparent', scale: 'full size 1:1 when the screen is 1032 or wider, otherwise shrinks to fit'},
  {sel: '.brand-name', name: 'Site name lettering area', status: 'text', source: 'live text for now, to be replaced by your lettering', bg: 'transparent', scale: 'grows and shrinks with the banner'},
  {sel: '.spotlight-art', name: 'Featured artwork window', status: 'dynamic', source: 'project supplied, 16:9, 1280x720 or larger', bg: 'solid', scale: 'shown whole, no crop'},
  {sel: '.detail-art', name: 'Project artwork window', status: 'dynamic', source: 'project supplied, 16:9, 1280x720 or larger', bg: 'solid', scale: 'shown whole, no crop'},
  {sel: '.portrait-top', name: 'Artwork frame ornament', status: 'game', source: 'small frame pieces taken from the games', bg: 'transparent', scale: 'shown at 1x or 2x, never stretched'},
  {sel: '.rating-display:not(.compact) .dragon-ball', name: 'Rating ball, large', status: 'done', source: '64x64 PNG (artist), the ball itself is 48x48 inside it', bg: 'transparent', scale: 'only the 48x48 ball is shown, at exactly 48, 24 or 16'},
  {sel: '.rating-display.compact .dragon-ball', name: 'Rating ball, card', status: 'done', source: '64x64 PNG (artist), the ball itself is 48x48 inside it', bg: 'transparent', scale: 'only the 48x48 ball is shown, at exactly 48, 24 or 16'},
  {sel: '.rating-choice', name: 'Rating picker tap area', status: 'done', source: '64x64 PNG (artist)', bg: 'transparent', scale: 'ball shown at 48x48, full size; grey until picked, lit up to the picked ball'},
  {sel: '.card-art', name: 'Card thumbnail', status: 'dynamic', source: 'project supplied, same file as artwork window', bg: 'solid', scale: 'fills the box, edges may be cropped'},
  {sel: '.screenshot-gallery a', name: 'Screenshot tile', status: 'dynamic', source: 'project supplied, 3:2 (GBA 240x160 multiples)', bg: 'solid', scale: 'fills the box, edges may be cropped'},
  {sel: '.spotlight-inner, .detail-hero', name: 'Large menu frame', status: 'needed', source: 'stand-in drawn in code: 30x30 tile with 10px corners', bg: 'solid fill', scale: 'stretched from one small tile: corners stay fixed, edges repeat'},
  {sel: '.panel', name: 'Panel menu frame', status: 'needed', source: 'stand-in drawn in code: 30x30 tile with 10px corners', bg: 'solid fill', scale: 'stretched from one small tile: corners stay fixed, edges repeat'},
  {sel: '.project-card', name: 'Card frame', status: 'needed', source: 'stand-in drawn in code: 30x30 tile with 10px corners', bg: 'solid fill', scale: 'stretched from one small tile: corners stay fixed, edges repeat'},
  {sel: '.artwork-unavailable', name: 'Missing-artwork placeholder', status: 'needed', source: 'stand-in drawn in code, 16:9', bg: 'solid', scale: 'fills the box, edges may be cropped'}
];
const colours = {done: '#39ff9a', dynamic: '#6ad1ff', needed: '#ff5cf0', game: '#ffd54a', text: '#ffffff'};
const words = {done: 'ARTIST ASSET IN PLACE', dynamic: 'VARIABLE CONTENT', needed: 'ARTWORK NOT YET DRAWN', game: 'GAME-DERIVED ASSET', text: 'LIVE TEXT'};
const style = document.createElement('style');
style.textContent = '.anno-layer{position:absolute;inset:0 0 auto 0;z-index:9998;pointer-events:none;font:700 11px/1.2 Arial,sans-serif}.anno-box{position:absolute;border:2px solid;box-sizing:border-box}.anno-box.needed{border-style:dashed;background:repeating-linear-gradient(45deg,#ff5cf022 0 6px,transparent 6px 12px)}.anno-tag{position:absolute;left:-2px;top:-2px;padding:2px 4px;color:#000;white-space:nowrap}.anno-box.needed .anno-tag{top:auto;bottom:100%}.anno-legend{position:relative;z-index:9998;margin:0;padding:16px;background:#fff;color:#000;font:13px/1.45 Arial,sans-serif;overflow-wrap:anywhere}.anno-legend h2{font:700 16px Arial,sans-serif;text-transform:none;letter-spacing:0;margin:0 0 8px}.anno-legend li{margin-bottom:8px}.anno-legend b{padding:0 4px}.anno-toggle{position:fixed;right:8px;bottom:8px;z-index:9999;padding:8px 12px;border:2px solid #000;background:#fff;color:#000;font:700 13px Arial,sans-serif}html:not([data-annotate]) .anno-layer,html:not([data-annotate]) .anno-legend{display:none}html[data-shot] .anno-toggle{display:none}';
document.head.append(style);
const layer = document.createElement('div');
layer.className = 'anno-layer';
layer.setAttribute('aria-hidden', 'true');
const legend = document.createElement('section');
legend.className = 'anno-legend';
const toggle = document.createElement('button');
toggle.className = 'anno-toggle';
toggle.type = 'button';
const label = () => {toggle.textContent = 'Annotations: ' + (document.documentElement.hasAttribute('data-annotate') ? 'ON' : 'OFF') + ' (press A)';};
const flip = () => {document.documentElement.toggleAttribute('data-annotate'); draw(); label();};
toggle.addEventListener('click', flip);
addEventListener('keydown', event => {if (event.key.toLowerCase() === 'a' && !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) flip();});
function draw() {
  layer.replaceChildren();
  const rows = [];
  let n = 0;
  for (const region of regions) {
    const all = [...document.querySelectorAll(region.sel)].filter(node => node.getClientRects().length);
    if (!all.length) continue;
    const rect = all[0].getBoundingClientRect();
    n += 1;
    const width = Math.round(rect.width), height = Math.round(rect.height);
    const x = Math.round(rect.left + scrollX), y = Math.round(rect.top + scrollY);
    const box = document.createElement('div');
    box.className = 'anno-box ' + region.status;
    box.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${height}px;border-color:${colours[region.status]}`;
    const tag = document.createElement('span');
    tag.className = 'anno-tag';
    tag.style.background = colours[region.status];
    tag.textContent = `${n} ${width}x${height}`;
    box.append(tag);
    layer.append(box);
    const overflow = x + tag.offsetWidth - document.documentElement.clientWidth;
    if (overflow > 0) tag.style.left = -2 - overflow + 'px';
    rows.push({n, name: region.name, status: words[region.status], width, height, x, y, count: all.length, source: region.source, bg: region.bg, scale: region.scale, colour: colours[region.status]});
  }
  layer.style.height = document.documentElement.scrollHeight + 'px';
  legend.innerHTML = `<h2>Artwork regions at ${document.documentElement.clientWidth}px wide (sizes in screen pixels)</h2><ol>` + rows.map(row => `<li><b style="background:${row.colour}">${row.status}</b> <strong>${row.name}</strong>: shown ${row.width}x${row.height} at x ${row.x}, y ${row.y}${row.count > 1 ? `, repeats ${row.count} times` : ''}. Source: ${row.source}. Background: ${row.bg}. Scaling: ${row.scale}.</li>`).join('') + '</ol><p>Dashed pink boxes are stand-ins drawn in code. Blue boxes hold whatever each project uploads. Sizes change with screen width.</p>';
  window.annotationRows = rows;
}
document.body.append(layer, legend, toggle);
if (new URLSearchParams(location.search).get('annotate') === '1') document.documentElement.setAttribute('data-annotate', '');
if (new URLSearchParams(location.search).has('shot')) document.documentElement.setAttribute('data-shot', '');
addEventListener('resize', draw);
addEventListener('load', () => {draw(); label();});
draw();
label();
