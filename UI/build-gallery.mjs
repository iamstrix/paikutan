// Builds UI/index.html from UI/pc/shots.json and UI/mobile/shots.json (written by capture.mjs).
// Usage: node UI/build-gallery.mjs
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const dir = resolve(process.cwd(), 'UI');
// Mid-run there is no shots.json yet, so fall back to the PNGs on disk, titled from their file names.
const load = async k => {
  try { return JSON.parse(await readFile(resolve(dir, k, 'shots.json'), 'utf8')); } catch {}
  const files = (await readdir(resolve(dir, k)).catch(() => [])).filter(f => f.endsWith('.png')).sort();
  const title = f => f.replace(/^\d+-|\.png$/g, '').replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
  return { shots: files.map(file => ({ file, title: title(file), device: '', note: '' })), partial: files.length > 0 };
};
const runs = { pc: await load('pc'), mobile: await load('mobile') };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// One row per panel id (the number before the first dash), PC and mobile side by side.
const rows = new Map();
for (const [k, run] of Object.entries(runs)) for (const s of run.shots) {
  const id = s.file.split('-')[0];
  const row = rows.get(id) || { id, title: s.title, note: s.note, pc: null, mobile: null };
  row[k] = s;
  rows.set(id, row);
}
const SECTIONS = [
  { name: 'Menus', from: 0, to: 9, blurb: 'Title screen, mode select, join, help, and Practice on phone.' },
  { name: '1v1 match', from: 10, to: 49, blurb: 'Online 1v1: the host screen (TV) plus two phones, from lobby to rematch.' },
  { name: 'Brawl', from: 50, to: 99, blurb: 'Brawl with the host playing in their own room, CPUs, a phone, and a late joiner.' },
];
const card = (s, k) => s ? `
      <figure class="shot ${k}">
        <a href="${k}/${esc(s.file)}" data-full><img src="${k}/${esc(s.file)}" alt="${esc(s.title)} (${k === 'pc' ? 'PC 16:9' : 'mobile 9:16'})" loading="lazy"></a>
        <figcaption><span class="badge ${k}">${k === 'pc' ? 'PC 16:9' : 'Mobile 9:16'}</span> ${esc(s.device)}</figcaption>
      </figure>` : `
      <figure class="shot ${k} missing"><div>No ${k === 'pc' ? 'PC' : 'mobile'} capture</div></figure>`;

const body = SECTIONS.map(sec => {
  const list = [...rows.values()].filter(r => +r.id >= sec.from && +r.id <= sec.to).sort((a, b) => a.id - b.id);
  if (!list.length) return '';
  return `
  <section>
    <h2>${sec.name}</h2>
    <p class="blurb">${sec.blurb}</p>
    ${list.map(r => `
    <article class="panel" id="p${r.id}">
      <header>
        <span class="num">${r.id}</span>
        <div><h3>${esc(r.title)}</h3>${r.note ? `<p>${esc(r.note)}</p>` : ''}</div>
        <label class="flag"><input type="checkbox" data-flag="${r.id}"> Needs work</label>
      </header>
      <div class="pair">${card(r.pc, 'pc')}${card(r.mobile, 'mobile')}</div>
    </article>`).join('')}
  </section>`;
}).join('');

const meta = Object.entries(runs).map(([k, r]) => {
  const v = r.viewport;
  const size = v ? `${v.width}×${v.height}${v.deviceScaleFactor > 1 ? ` @${v.deviceScaleFactor}x` : ''}` : 'not captured';
  const state = r.partial ? ' · <b class="warn">capture still running: partial set</b>' : r.failed ? ` · <b class="warn">stopped early: ${esc(r.failed.split('\n')[0])}</b>` : '';
  return `<li><b>${k === 'pc' ? 'PC 16:9' : 'Mobile 9:16'}</b>: ${r.shots.length} shots, ${size}${state}</li>`;
}).join('');

await writeFile(resolve(dir, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paikutan UI Screens</title>
<style>
:root { --bg: #f6f3ec; --panel: #fff; --ink: #1d1b16; --muted: #6b665b; --line: #e3ddd0; --pc: #3a86ff; --mobile: #e63946; --flag: #f4a300; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #15140f; --panel: #1f1d17; --ink: #f3efe4; --muted: #a49d8c; --line: #343026; } }
:root[data-theme="dark"] { --bg: #15140f; --panel: #1f1d17; --ink: #f3efe4; --muted: #a49d8c; --line: #343026; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
.top { position: sticky; top: 0; z-index: 5; background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(6px); border-bottom: 1px solid var(--line); }
.top .in, main { max-width: 1500px; margin: 0 auto; padding: 12px 16px; }
.top .in { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
h1 { font-size: 1.25rem; margin: 0; }
.filters { display: flex; gap: 6px; margin-left: auto; flex-wrap: wrap; }
.filters button { border: 1px solid var(--line); background: var(--panel); color: var(--ink); padding: 6px 12px; border-radius: 999px; cursor: pointer; font: inherit; }
.filters button[aria-pressed="true"] { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.meta { color: var(--muted); margin: 4px 0 0; padding-left: 18px; font-size: 0.9rem; }
.warn { color: var(--mobile); }
section h2 { margin: 28px 0 2px; font-size: 1.15rem; }
.blurb { margin: 0 0 12px; color: var(--muted); }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px; margin: 0 0 14px; }
.panel.flagged { border-color: var(--flag); box-shadow: 0 0 0 2px color-mix(in srgb, var(--flag) 40%, transparent); }
.panel header { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 10px; }
.num { font-weight: 800; font-variant-numeric: tabular-nums; background: var(--ink); color: var(--bg); border-radius: 8px; padding: 2px 8px; }
.panel h3 { margin: 0; font-size: 1rem; }
.panel header p { margin: 2px 0 0; color: var(--muted); font-size: 0.88rem; }
.flag { margin-left: auto; white-space: nowrap; font-size: 0.85rem; color: var(--muted); cursor: pointer; }
.pair { display: grid; grid-template-columns: minmax(0, 16fr) minmax(0, 5.4fr); gap: 12px; align-items: start; }
body.only-pc .pair { grid-template-columns: minmax(0, 1fr); } body.only-pc .shot.mobile { display: none; }
body.only-mobile .pair { grid-template-columns: minmax(0, 320px); } body.only-mobile .shot.pc { display: none; }
body.only-flagged .panel:not(.flagged) { display: none; }
.shot { margin: 0; }
.shot img { display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--line); background: #000; }
.shot figcaption { margin-top: 4px; font-size: 0.82rem; color: var(--muted); }
.badge { display: inline-block; padding: 0 6px; border-radius: 4px; color: #fff; font-weight: 700; font-size: 0.75rem; }
.badge.pc { background: var(--pc); } .badge.mobile { background: var(--mobile); }
.missing div { border: 1px dashed var(--line); border-radius: 8px; color: var(--muted); padding: 24px 8px; text-align: center; font-size: 0.85rem; }
@media (max-width: 700px) { .pair { grid-template-columns: minmax(0, 1fr); } .shot.mobile { max-width: 280px; } .flag { margin-left: 0; } .panel header { flex-wrap: wrap; } }
#lightbox { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.88); display: grid; place-items: center; z-index: 20; padding: 16px; cursor: zoom-out; }
#lightbox[hidden] { display: none; }
#lightbox img { max-width: 100%; max-height: calc(100vh - 32px); border-radius: 6px; }
</style>
</head>
<body>
<div class="top"><div class="in">
  <h1>Paikutan UI screens</h1>
  <div class="filters" role="group" aria-label="Show">
    <button data-show="both" aria-pressed="true">PC + Mobile</button>
    <button data-show="pc" aria-pressed="false">PC 16:9</button>
    <button data-show="mobile" aria-pressed="false">Mobile 9:16</button>
    <button data-show="flagged" aria-pressed="false">Needs work only</button>
  </div>
</div></div>
<main>
  <ul class="meta">${meta}<li>Captured ${new Date().toISOString().slice(0, 16).replace('T', ' ')} with UI/capture.mjs. Click a screenshot to view it full size.</li></ul>
  ${body}
</main>
<div id="lightbox" hidden><img alt=""></div>
<script>
const box = document.getElementById('lightbox'), boxImg = box.querySelector('img');
document.addEventListener('click', e => {
  const a = e.target.closest('[data-full]');
  if (a) { e.preventDefault(); boxImg.src = a.href; boxImg.alt = a.querySelector('img').alt; box.hidden = false; }
});
box.onclick = () => { box.hidden = true; };
addEventListener('keydown', e => { if (e.key === 'Escape') box.hidden = true; });
document.querySelectorAll('[data-show]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-show]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  document.body.classList.toggle('only-pc', b.dataset.show === 'pc');
  document.body.classList.toggle('only-mobile', b.dataset.show === 'mobile');
  document.body.classList.toggle('only-flagged', b.dataset.show === 'flagged');
});
// "Needs work" ticks are remembered in this browser only.
let flags = {};
try { flags = JSON.parse(localStorage.getItem('paikutan-ui-flags') || '{}'); } catch {}
document.querySelectorAll('[data-flag]').forEach(cb => {
  const panel = cb.closest('.panel');
  cb.checked = !!flags[cb.dataset.flag]; panel.classList.toggle('flagged', cb.checked);
  cb.onchange = () => {
    flags[cb.dataset.flag] = cb.checked; panel.classList.toggle('flagged', cb.checked);
    try { localStorage.setItem('paikutan-ui-flags', JSON.stringify(flags)); } catch {}
  };
});
</script>
</body>
</html>
`);
console.log(`UI/index.html: ${rows.size} panels`);
