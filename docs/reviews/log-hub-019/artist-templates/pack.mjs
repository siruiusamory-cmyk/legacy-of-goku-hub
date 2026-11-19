import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const site = path.join(root, '.site/artist-templates');
const work = path.join(root, '.site/artist-pack-build');
const packName = 'Legacy of Goku Hub - Artist Pack';
const pack = path.join(process.argv[2] || path.join(here, '..'), packName);
const art = path.join(root, 'website/src/assets/artist');
const measured = JSON.parse(fs.readFileSync(path.join(here, 'measurements.json'), 'utf8'));
for (const dir of [work, pack]) {fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});}
const folders = {clean: '1 - Templates (clean)', marked: '2 - Templates (with measurements)', other: '3 - Other screen sizes (with measurements)'};
for (const name of Object.values(folders)) fs.mkdirSync(path.join(pack, name));
const pageNames = {home: 'Home page', detail: 'Project page'};
const sizeNames = {1440: 'desktop, 1440 wide', 1024: 'small laptop, 1024 wide', 768: 'tablet, 768 wide', 390: 'phone, 390 wide', 360: 'small phone, 360 wide', 320: 'smallest phone, 320 wide'};
for (const [page, pageName] of Object.entries(pageNames)) for (const [width, sizeName] of Object.entries(sizeNames)) {
  const kind = width === '1440' ? 'desktop' : width === '390' ? 'mobile' : 'check';
  const file = `${pageName} (${sizeName}).png`;
  const source = path.join(here, 'png', `${kind}-${page}-${width}`);
  if (kind === 'check') fs.copyFileSync(source + '-annotated.png', path.join(pack, folders.other, file));
  else {
    fs.copyFileSync(source + '-clean.png', path.join(pack, folders.clean, file));
    fs.copyFileSync(source + '-annotated.png', path.join(pack, folders.marked, file));
  }
}
const types = {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml'};
const server = http.createServer((request, response) => {
  let name = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  if (!path.extname(name)) name = path.join(name, 'index.html');
  const file = path.resolve(site, '.' + path.sep + name);
  if (!file.startsWith(site + path.sep) || !fs.existsSync(file)) {response.writeHead(404); response.end(); return;}
  response.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'});
  response.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(4341, '127.0.0.1', resolve));
const browser = await chromium.launch();
const address = {home: '/', detail: '/projects/fixture-0/'};
const views = [['home', 1440], ['home', 390], ['detail', 1440], ['detail', 390]];
for (const [page, width] of views) {
  const tab = await browser.newPage({viewport: {width, height: 900}, deviceScaleFactor: width === 390 ? 2 : 1, reducedMotion: 'reduce'});
  await tab.goto(`http://127.0.0.1:4341${address[page]}?shot&annotate=1`, {waitUntil: 'networkidle'});
  const size = width === 390 ? 22 : 24;
  await tab.addStyleTag({content: `.anno-legend{display:none!important}.anno-tag{font-size:${size}px!important;padding:2px ${size / 3}px!important}`});
  await tab.evaluate(() => {document.querySelector('.anno-layer').style.height = '0'; dispatchEvent(new Event('resize')); if (innerWidth < 600) document.querySelectorAll('.anno-tag').forEach(tag => {tag.textContent = tag.textContent.split(' ')[0];});});
  const height = await tab.evaluate(() => document.documentElement.scrollHeight);
  await tab.screenshot({path: path.join(work, `${page}-${width}.png`), fullPage: true, clip: {x: 0, y: 0, width, height}});
  await tab.close();
}
server.close();
for (const file of ['energy-banner-960x160.png', 'ball-4-active.png', 'ball-4-inactive.png', 'ball-1-active.png']) fs.copyFileSync(path.join(art, file), path.join(work, file));
const colours = {'ARTIST ASSET IN PLACE': ['#39ff9a', 'Your art, in place'], 'VARIABLE CONTENT': ['#6ad1ff', 'Changes per project'], 'ARTWORK NOT YET DRAWN': ['#ff5cf0', 'Not drawn yet'], 'GAME-DERIVED ASSET': ['#ffd54a', 'Taken from the games'], 'LIVE TEXT': ['#ffffff', 'Live text']};
const chip = status => `<span class="chip" style="background:${colours[status][0]}">${colours[status][1]}</span>`;
const table = key => `<table><thead><tr><th>No.</th><th>What it is</th><th>Status</th><th>Shown at</th><th>How it is used</th></tr></thead><tbody>${measured[key].map(row => `<tr><td class="n">${row.n}</td><td><strong>${row.name}</strong>${row.count > 1 ? `<br><small>appears ${row.count} times</small>` : ''}</td><td>${chip(row.status)}</td><td class="size">${row.width} x ${row.height}</td><td>${row.scale}.<br><small>Source: ${row.source}. Background: ${row.bg}.</small></td></tr>`).join('')}</tbody></table>`;
const pick = (key, name) => {const row = measured[key].find(item => item.name === name); return row ? `${row.width} x ${row.height}` : 'not on this page';};
const both = name => `<td class="size">${pick('home-1440', name) === 'not on this page' ? pick('detail-1440', name) : pick('home-1440', name)}</td><td class="size">${pick('home-390', name) === 'not on this page' ? pick('detail-390', name) : pick('home-390', name)}</td>`;
const ball = (file, top, label) => `<figure class="ballfig"><div class="canvas"><img src="${file}" alt=""><span class="artbox" style="top:${top * 3}px"></span></div><figcaption>${label}</figcaption></figure>`;
const template = (title, key, image, tall) => `<section class="sheet ${tall ? 'tall' : ''}"><h2>${title}</h2><p class="lead">Every numbered box on the picture matches a row in the table. Sizes are measured from the working page, in pixels.</p><div class="layout"><img class="shot" src="${image}" alt=""><div class="side">${table(key)}</div></div></section>`;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Legacy of Goku Hub: Artist Guide</title><style>
@page{size:A4;margin:16mm 15mm 18mm}
*{box-sizing:border-box}
body{margin:0;font:10.5pt/1.5 "Segoe UI",Arial,sans-serif;color:#1b1e28}
h1{font:700 30pt/1.1 "Segoe UI",Arial,sans-serif;margin:0 0 4mm}
h2{font:700 17pt/1.2 "Segoe UI",Arial,sans-serif;margin:0 0 3mm;padding-bottom:2mm;border-bottom:1.2mm solid #f5b921}
h3{font:700 11.5pt/1.3 "Segoe UI",Arial,sans-serif;margin:4mm 0 1.5mm}
p{margin:0 0 3mm}
small{color:#555b6e;font-size:8.5pt}
.sheet{break-before:page}
.cover{padding-top:8mm}
.cover .banner{width:100%;background:#0a1128;padding:6mm;image-rendering:pixelated}
.sub{font-size:13pt;color:#3a4056;margin-bottom:8mm}
.lead{color:#3a4056}
ul,ol{margin:0 0 3mm;padding-left:6mm}
li{margin-bottom:1.5mm}
table{width:100%;border-collapse:collapse;font-size:9pt;line-height:1.35}
th{text-align:left;font-weight:700;background:#1b2550;color:#fff;padding:1.6mm 2mm}
td{padding:1.6mm 2mm;border-bottom:.25mm solid #c9cede;vertical-align:top}
tr{break-inside:avoid}
td.n{font-weight:700;font-size:11pt;width:9mm}
td.size{white-space:nowrap;font-weight:700}
.chip{display:inline-block;padding:.4mm 1.8mm;border:.25mm solid #1b1e28;font-size:8pt;font-weight:700;white-space:nowrap;color:#000}
.key{display:flex;flex-wrap:wrap;gap:2mm 5mm;margin:2mm 0 4mm}
.key span.item{display:flex;align-items:center;gap:2mm}
.shot{display:block;max-width:100%;max-height:205mm;margin:0 auto 5mm;border:.25mm solid #1b1e28}
.side{break-before:page}
.tall .side{break-before:auto}
.tall .layout{display:flex;gap:6mm;align-items:flex-start}
.tall .shot{max-height:232mm;flex:none;margin:0}
.tall .side{flex:1;min-width:0}
.tall table{font-size:8.5pt}
.tall td{padding:1.1mm 1.6mm}
.full .shot{max-height:236mm}
.figrow{display:flex;gap:8mm;align-items:flex-start;margin:3mm 0 4mm}
.figrow>div{flex:1;min-width:0}
.ballfig{flex:none}
.ballfig{margin:0;text-align:center;font-size:8.5pt;color:#3a4056}
.canvas{position:relative;width:192px;height:192px;background:repeating-conic-gradient(#d9dce6 0 25%,#f1f2f6 0 50%) 0 0/12px 12px;outline:2px solid #1b1e28}
.canvas img{width:192px;height:192px;image-rendering:pixelated;display:block}
.artbox{position:absolute;left:27px;width:144px;height:144px;outline:2px dashed #d1007a}
.bannerfig{position:relative;background:#0a1128;margin:3mm 0 4mm}
.bannerfig img{display:block;width:100%;image-rendering:pixelated}
.bannerfig span{position:absolute;left:22.5%;width:70%;top:30.6%;height:41.3%;outline:2px dashed #d1007a;display:grid;place-items:center;font-weight:700;color:#d1007a;font-size:9pt}
.note{padding:3mm 4mm;background:#fff6d6;border-left:1.2mm solid #f5b921;margin:3mm 0 4mm}
.files td:first-child{font-weight:700;white-space:nowrap}
</style><body>
<section class="cover"><h1>Legacy of Goku Hub</h1><p class="sub">Artist guide: where your artwork goes, at what size, and what is still needed</p>
<img class="banner" src="energy-banner-960x160.png" alt="">
<h3>What this is</h3><p>The site has been rebuilt around your banner and your Dragon Balls. This guide shows the working pages with every piece of artwork marked and measured, so you can see exactly where each piece sits and how big it is on screen.</p><p>Nothing here is a brief you must follow to the pixel. If a size or shape would look better another way, say so and the layout can move. The one fixed rule is the other way round: the site will not stretch, recolour or redraw anything you made.</p>
<h3>What is in this folder</h3><table class="files"><tbody>
<tr><td>Read me first - Artist Guide.pdf</td><td>This document.</td></tr>
<tr><td>${folders.clean}</td><td>The four main screens exactly as visitors see them. Good for painting over.</td></tr>
<tr><td>${folders.marked}</td><td>The same four screens with every artwork area boxed, numbered and measured, and a full list under each picture.</td></tr>
<tr><td>${folders.other}</td><td>The same pages on a small laptop, a tablet and two smaller phones, so you can see how sizes change.</td></tr></tbody></table>
<h3>How to read the boxes</h3><div class="key">${Object.keys(colours).map(status => `<span class="item">${chip(status)}</span>`).join('')}</div><p>Dashed pink boxes are stand-ins drawn in code. Those are the places where your artwork would replace something temporary. All sizes are in screen pixels. On a phone or a sharp laptop screen each of those is two or three real pixels, which is why pixel art should be drawn at its own size or an exact multiple (2x, 3x).</p></section>
<section class="sheet"><h2>Your energy banner</h2><p>It is the masthead on every page, shown at its full 960 x 160 on desktop with nothing scaled. The site name sits in the white core. Right now it is typed text standing in for your lettering. The dashed box is the space your lettering has to fit.</p>
<div class="bannerfig"><img src="energy-banner-960x160.png" alt=""><span>your lettering goes here: 672 x 66</span></div>
<table><thead><tr><th>Lettering</th><th>Measurement</th></tr></thead><tbody><tr><td>Space available</td><td class="size">672 x 66</td></tr><tr><td>Where it starts in the 960 x 160 banner</td><td class="size">216 from the left, 49 from the top</td></tr><tr><td>Easiest file to send</td><td>A PNG the full size of the banner (960 x 160) with a transparent background and only the lettering on it. It then drops straight on top with nothing to line up.</td></tr><tr><td>Also fine</td><td>The lettering drawn into the banner itself, sent as a new 960 x 160 banner.</td></tr><tr><td>Words</td><td>Legacy of Goku Hub</td></tr></tbody></table><p style="margin-top:3mm">On a phone the same space is only 251 x 25, so thin strokes will blur. If you draw the optional phone banner, lettering made for that size would keep it sharp.</p><p>On screens narrower than 1032 the banner has to shrink to fit (720 wide on a tablet, 358 on a phone), so it loses its crisp pixels there. A version drawn for phones is on the wish list below, and is optional.</p>
</section><section class="sheet"><h2>Your Dragon Balls</h2><p>All fourteen (lit and grey, one to seven stars) are used for every rating on the site. They are only ever shown at exact sizes: 48 (full size), 24 (half) and 16 (a third), so they stay sharp.</p>
<div class="figrow">${ball('ball-4-active.png', 11, 'Lit ball: 11 pixels from the top')}${ball('ball-4-inactive.png', 16, 'Grey ball: 16 pixels from the top')}<div><p><strong>One thing we found by measuring.</strong> Each file is 64 x 64, and the ball inside is 48 x 48, but the ball does not sit in the middle of the file. Lit balls sit 10 or 11 pixels from the top. Grey balls sit 16 from the top, touching the bottom edge.</p><p>Side by side that made grey balls hang lower than lit ones. The site now cuts out just the 48 x 48 ball (the dashed box) so they all line up. Your files have not been edited.</p><p>Nothing for you to fix. If you ever re-export them, putting every ball in the same spot, or cropping the files to 48 x 48, would make them simpler to use.</p></div></div></section>
<section class="sheet"><h2>What is still needed</h2><p class="lead">Listed by how much each one would lift the site. Everything here is currently a plain stand-in drawn in code.</p>
<table><thead><tr><th>No.</th><th>Piece</th><th>Size to draw</th><th>Notes</th></tr></thead><tbody>
<tr><td class="n">1</td><td><strong>Banner lettering</strong> (in progress)</td><td class="size">672 x 66</td><td>The site name inside the energy banner. Measurements are on the energy banner page.</td></tr>
<tr><td class="n">2</td><td><strong>Menu frame</strong></td><td class="size">30 x 30 or 60 x 60</td><td>One square tile with cut corners and a double line. The site stretches it around every box: corners stay fixed, edges repeat. Corners are 10 pixels at the size now used. Two colours: gold and steel blue. Solid dark-blue middle.</td></tr>
<tr><td class="n">3</td><td><strong>Missing-artwork picture</strong></td><td class="size">640 x 360 or larger</td><td>Shown when a project has no image of its own. 16:9.</td></tr>
<tr><td class="n">4</td><td><strong>Phone banner</strong> (optional)</td><td class="size">358 x 60 or 716 x 120</td><td>A version of the energy banner drawn for phones so it stays crisp. Same idea, same empty core for the site name.</td></tr>
<tr><td class="n">5</td><td><strong>Empty-catalogue art</strong> (optional)</td><td class="size">640 x 360 or larger</td><td>For the screen visitors see when no projects are listed yet. 16:9.</td></tr>
<tr><td class="n">6</td><td><strong>Backdrop scenery</strong> (optional)</td><td class="size">about 1440 x 120</td><td>A strip that could sit under the header. Not shown at the moment; the crop taken from the game looked messy behind text.</td></tr>
<tr><td class="n">7</td><td><strong>Site icon and share image</strong></td><td class="size">512 x 512 and 1200 x 630</td><td>The browser tab icon, and the picture that shows when someone shares a link.</td></tr></tbody></table>
<h3>File formats</h3><ul><li>Pixel art: PNG, no smoothing, transparent background unless the table says solid.</li><li>Draw at the size listed or an exact multiple of it (2x, 3x). In-between sizes go blurry.</li><li>Large painted pieces and the share image: PNG or WebP.</li><li>The layered source file too, if you are happy to share it.</li></ul>
</section><section class="sheet"><h2>Sizes at a glance</h2><table><thead><tr><th>Area</th><th>Desktop (1440 wide)</th><th>Phone (390 wide)</th></tr></thead><tbody>
<tr><td>Energy banner</td>${both('Energy banner')}</tr>
<tr><td>Site name lettering area inside the banner</td>${both('Site name lettering area')}</tr>
<tr><td>Rating ball, large</td>${both('Rating ball, large')}</tr>
<tr><td>Rating ball, on project cards</td>${both('Rating ball, card')}</tr>
<tr><td>Rating picker tap area (ball inside is 48 x 48)</td>${both('Rating picker tap area')}</tr>
<tr><td>Featured artwork (home page)</td>${both('Featured artwork window')}</tr>
<tr><td>Project artwork (project page)</td>${both('Project artwork window')}</tr>
<tr><td>Project card thumbnail</td>${both('Card thumbnail')}</tr>
<tr><td>Screenshot tile</td>${both('Screenshot tile')}</tr>
<tr><td>Large menu frame (home page)</td>${both('Large menu frame')}</tr>
<tr><td>Project card frame</td>${both('Card frame')}</tr></tbody></table></section>
${template('Home page on a desktop screen', 'home-1440', 'home-1440.png', false)}
${template('Project page on a desktop screen', 'detail-1440', 'detail-1440.png', false)}
${template('Home page on a phone', 'home-390', 'home-390.png', true)}
${template('Project page on a phone', 'detail-390', 'detail-390.png', true)}
<section class="sheet"><h2>Notes for phones</h2><ul><li>The page content is 358 wide on a 390 phone, 328 on a 360 phone and 288 on a 320 phone.</li><li>Project card thumbnails become nearly square on phones, so the middle of each project picture is what shows.</li><li>Rating balls never go below 16 x 16. Details smaller than three pixels in your original will not survive at that size.</li><li>The rating picker shows seven balls as four on top and three centred below. They are grey until a visitor picks one; then that ball and every ball before it light up.</li></ul>
<div class="note">Questions, or something here looks wrong against your files? Reply to whoever sent you this pack. Measurements were taken from the working site on 18 November 2026 and will be re-measured if the layout changes.</div></section>
</body></html>`;
fs.writeFileSync(path.join(work, 'guide.html'), html);
const tab = await browser.newPage();
await tab.goto(pathToFileURL(path.join(work, 'guide.html')).href, {waitUntil: 'networkidle'});
await tab.pdf({path: path.join(pack, 'Read me first - Artist Guide.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="width:100%;font:8px Arial;color:#666;text-align:center">Legacy of Goku Hub: Artist Guide, page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'});
await browser.close();
console.log(pack);
for (const entry of fs.readdirSync(pack, {recursive: true})) console.log(' ', entry);
