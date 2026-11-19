import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const out = path.join(root, '.site/artist-templates');
const shots = path.join(here, 'png');
fs.rmSync(out, {recursive: true, force: true});
fs.cpSync(path.join(root, '.site/preview'), out, {recursive: true});
fs.copyFileSync(path.join(here, 'annotate.js'), path.join(out, 'annotate.js'));
const pages = {home: 'index.html', detail: 'projects/fixture-0/index.html'};
for (const file of Object.values(pages)) {
  const full = path.join(out, file);
  fs.writeFileSync(full, fs.readFileSync(full, 'utf8').replace('</body>', '<script type="module" src="/annotate.js"></script></body>'));
}
const templates = [['desktop-home', 'home', 1440], ['mobile-home', 'home', 390], ['desktop-detail', 'detail', 1440], ['mobile-detail', 'detail', 390]];
const address = page => '/' + pages[page].replace('index.html', '');
const links = templates.map(([name]) => `<a href="/templates/${name}.html">${name}</a>`).join(' | ');
fs.mkdirSync(path.join(out, 'templates'), {recursive: true});
for (const [name, page, width] of templates) {
  fs.writeFileSync(path.join(out, 'templates', name + '.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>${name} ${width}px artist template</title><style>body{margin:0;background:#888;font:14px Arial,sans-serif}header{position:sticky;top:0;z-index:2;padding:8px;background:#fff;color:#000}button{font:inherit;font-weight:700;padding:6px 10px}iframe{display:block;margin:12px auto;border:0;background:#000;width:${width}px;height:900px}</style><header><strong>${name}, ${width}px wide</strong> <button type="button" id="toggle">Toggle annotations</button> ${links}</header><iframe id="frame" title="${name}" src="${address(page)}?annotate=1"></iframe><script type="module">const frame=document.getElementById('frame');const fit=()=>{frame.style.height=frame.contentDocument.documentElement.scrollHeight+'px';};frame.addEventListener('load',()=>{fit();setTimeout(fit,500);});document.getElementById('toggle').addEventListener('click',()=>{frame.contentDocument.documentElement.toggleAttribute('data-annotate');frame.contentWindow.dispatchEvent(new Event('resize'));fit();});</script></html>`);
}
fs.writeFileSync(path.join(out, 'templates', 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Artist templates</title><body style="font:16px Arial,sans-serif;padding:24px"><h1>Artist reference templates</h1><p>${links}</p></body></html>`);
const types = {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml'};
const server = http.createServer((request, response) => {
  let name = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  if (!path.extname(name)) name = path.join(name, 'index.html');
  const file = path.resolve(out, '.' + path.sep + name);
  if (!file.startsWith(out + path.sep) || !fs.existsSync(file)) {response.writeHead(404); response.end(); return;}
  response.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'});
  response.end(fs.readFileSync(file));
});
const port = Number(process.env.PORT || 4340);
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
if (process.argv.includes('--serve')) {
  console.log(`Artist templates: http://127.0.0.1:${port}/templates/`);
} else {
  fs.rmSync(shots, {recursive: true, force: true});
  fs.mkdirSync(shots, {recursive: true});
  const browser = await chromium.launch();
  const measured = {};
  const widths = {home: [1440, 1024, 768, 390, 360, 320], detail: [1440, 1024, 768, 390, 360, 320]};
  for (const [page, list] of Object.entries(widths)) for (const width of list) {
    const tab = await browser.newPage({viewport: {width, height: 900}, reducedMotion: 'reduce'});
    const primary = width === 1440 || width === 390;
    const label = `${width === 1440 ? 'desktop' : width === 390 ? 'mobile' : 'check'}-${page}-${width}`;
    await tab.goto(`http://127.0.0.1:${port}${address(page)}?shot`, {waitUntil: 'networkidle'});
    const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (primary) await tab.screenshot({path: path.join(shots, label + '-clean.png'), fullPage: true});
    await tab.goto(`http://127.0.0.1:${port}${address(page)}?shot&annotate=1`, {waitUntil: 'networkidle'});
    measured[`${page}-${width}`] = await tab.evaluate(() => window.annotationRows);
    await tab.screenshot({path: path.join(shots, label + '-annotated.png'), fullPage: true});
    console.log(label, 'overflow', overflow, 'regions', measured[`${page}-${width}`].length);
    await tab.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(here, 'measurements.json'), JSON.stringify(measured, null, 1) + '\n');
  server.close();
}
