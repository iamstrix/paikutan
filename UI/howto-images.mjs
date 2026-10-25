// Makes the How to play pictures (assets/howto/*.webp, 480x300) by playing Practice vs CPU in headless
// Chrome and capturing each step. The win picture is cropped from the UI gallery capture.
// Usage: node UI/howto-images.mjs   (run node UI/capture.mjs pc first for 6-win)
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { spawn } from 'node:child_process';

const VIEW = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }; // 16:10, same as the pictures
const OUT_W = 480;
const WIN_SOURCE = ['pc/38-tv-match-end.png', [320, 100, 1280, 800]]; // crop box in source pixels

const root = process.cwd();
const out = resolve(root, 'assets/howto');
await mkdir(out, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(root + sep) || path.includes(sep + '.git')) throw 0;
    res.setHeader('Content-Type', TYPES[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--remote-debugging-port=0',
  `--user-data-dir=${resolve(root, 'node_modules/.trumpo-check/howto-profile')}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let socket;
try {
  const endpoint = await new Promise((ok, fail) => {
    let text = ''; setTimeout(() => fail(Error('Chrome startup timed out')), 20000);
    chrome.stderr.on('data', b => { text += b; const m = text.match(/DevTools listening on (ws:\/\/\S+)/); if (m) ok(m[1]); });
  });
  socket = new WebSocket(endpoint);
  await new Promise(r => socket.addEventListener('open', r, { once: true }));
  let next = 0; const pending = new Map();
  socket.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id) { const w = pending.get(m.id); pending.delete(m.id); m.error ? w[1](Error(JSON.stringify(m.error))) : w[0](m.result); } });
  const send = (method, params = {}, sessionId) => new Promise((a, b) => { const id = ++next; pending.set(id, [a, b]); socket.send(JSON.stringify({ id, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: s } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, s); await send('Page.enable', {}, s);
  await send('Emulation.setDeviceMetricsOverride', VIEW, s);
  const evaluate = async x => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true, userGesture: true }, s); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const until = async (x, ms = 90000) => { const t0 = Date.now(); while (!(await evaluate(x).catch(() => false))) { if (Date.now() - t0 > ms) throw Error('timed out waiting for ' + x); await sleep(100); } };
  const mouse = (type, x, y, buttons = 0) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 }, s);
  const key = (type, code, k) => send('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) }, s);
  const viewIs = v => `document.querySelector('#ctrl').dataset.view==='${v}'`;
  const save = async (name, data) => { await writeFile(resolve(out, name + '.webp'), Buffer.from(data, 'base64')); console.log(`assets/howto/${name}.webp  ${(data.length * 0.75 / 1024).toFixed(0)} KB`); };
  const shot = async name => {
    const { data } = await send('Page.captureScreenshot', { format: 'webp', quality: 82, clip: { x: 0, y: 0, width: VIEW.width, height: VIEW.height, scale: OUT_W / VIEW.width } }, s);
    await save(name, data);
  };

  await send('Page.navigate', { url: base + '/index.html?practice' }, s);
  await until(viewIs('pick'));
  await sleep(2500);
  await shot('1-pick');
  await evaluate(`document.querySelector('[data-act=ready]').click();1`);

  // Paikot: real circles on the spin pad, captured mid-gesture.
  await until(viewIs('spin'));
  await sleep(600);
  const pad = await evaluate(`(()=>{const b=document.querySelector('.pad').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2,R:Math.min(b.width,b.height)*0.36}})()`);
  const at = a => [pad.x + Math.cos(a) * pad.R, pad.y + Math.sin(a) * pad.R];
  let a = 0, took = false;
  await mouse('mousePressed', ...at(a), 1);
  const t0 = Date.now();
  while (Date.now() - t0 < 3400) {
    a += 0.4;
    await mouse('mouseMoved', ...at(a), 1);
    if (!took && Date.now() - t0 > 1500) { took = true; await shot('2-paikot'); }
    await sleep(16);
  }
  await mouse('mouseReleased', ...at(a), 0);

  // Bitaw: the throw prompt, then a fast upward drag.
  await until(`document.body.dataset.phase==='throw'`);
  await sleep(250);
  await shot('3-bitaw');
  const cx = VIEW.width / 2, cy = VIEW.height * 0.75;
  await mouse('mousePressed', cx, cy, 1);
  for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', cx + i * 4, cy - i * 55, 1); await sleep(12); }
  await mouse('mouseReleased', cx + 24, cy - 330, 0);

  // Laban: a moment into the fight.
  await until(viewIs('fight'));
  await sleep(2600);
  await shot('4-laban');

  // Lose round one on purpose (steer out of the circle) so this player gets the counter-pick.
  await key('keyDown', 'KeyA', 'a');
  await until(`['roundEnd','counter','matchEnd'].includes(document.body.dataset.phase)`, 120000);
  await key('keyUp', 'KeyA', 'a');
  await until(`document.body.dataset.phase==='counter'`, 15000).then(async () => {
    await until(viewIs('counter'), 5000);
    await sleep(900);
    await shot('5-counter');
  }).catch(e => console.log('skip 5-counter: ' + e.message + ' (this player did not lose round one)'));

  // Win: cropped from the gallery's match-end capture.
  const [src, [x, y, w, h]] = WIN_SOURCE;
  const url = await evaluate(`new Promise((ok, fail) => { const img = new Image(); img.onload = () => {
    const c = document.createElement('canvas'); c.width = ${OUT_W}; c.height = ${OUT_W * h / w};
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, ${x}, ${y}, ${w}, ${h}, 0, 0, c.width, c.height);
    ok(c.toDataURL('image/webp', 0.82)); }; img.onerror = () => ok(null); img.src = '/UI/${src}'; })`);
  if (url) await save('6-win', url.split(',')[1]); else console.log(`skip 6-win: UI/${src} missing (run node UI/capture.mjs pc)`);
} finally {
  socket?.close();
  chrome.kill();
  server.close();
}
