// Dependency-free Chromium integration checks. Caches pinned rendering dependencies locally.
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { CHAT_ENABLED } from '../js/chat.js';

const root = process.cwd();
const output = resolve(root, 'node_modules/.trumpo-check/audit');
await mkdir(output, { recursive: true });
await Promise.all([
  ['three.module.js', 'three@0.160.0/build/three.module.js'],
  ['utils/BufferGeometryUtils.js', 'three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js'],
  ['qrcode.js', 'qrcode-generator@1.4.4/qrcode.js'],
].map(async ([name, remote]) => {
  const vendor = resolve(root, 'node_modules/.trumpo-check/vendor', name);
  try { await readFile(vendor); } catch {
    const response = await fetch('https://cdn.jsdelivr.net/npm/' + remote, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error('Could not load test dependency: ' + name);
    await mkdir(resolve(vendor, '..'), { recursive: true });
    await writeFile(vendor, await response.text());
  }
}));
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/style.css"><script type="importmap">{"imports":{"three":"/node_modules/.trumpo-check/vendor/three.module.js","three/addons/":"/node_modules/.trumpo-check/vendor/"}}</script></head><body class="phone-page show-scene"><div id="ctrl"></div><script type="module">
import {createController} from '/js/controller.js';
import {Engine} from '/js/engine.js';
import {Particles} from '/js/fx/particles.js';
const engine = new Engine(()=>{});engine.join('tester','Juan','local');engine.join('rival','Maria','local');engine.go('charge');engine.phase='fight';
window.sent=[];window.controller=createController(document.querySelector('#ctrl'),{myId:'tester',mode:'phone',sounds:false,send:(ev,p)=>sent.push({ev,p})});
controller.setState(engine.state());controller.onSnap({tops:[0,1].map(()=>({x:0,z:0,spin:1,charge:1,alive:true,launched:true,invert:false,boostCd:0}))});
const dust=new Particles('soft',8);dust.emit(0,.01,0,{n:8,color:'#fff',speed:1,up:0,life:4,size:.1,gravity:4},()=>.5);for(let i=0;i<100;i++)dust.update(.02,500);
window.particleFloor=Math.min(...Array.from({length:8},(_,i)=>dust.pos[i*3+1]));window.ready=true;
</script></body></html>`;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/__fixture') { res.setHeader('Content-Type', 'text/html'); res.end(fixture); return; }
    const path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!path.startsWith(root + sep) || url.pathname.includes('/.git')) throw Error('Forbidden');
    let content = await readFile(path);
    // Software WebGL needs fewer pixels; keep camera geometry and CSS at real device sizes.
    if (url.pathname === '/js/scene.js') content = Buffer.from(content.toString().replace('renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.5 : 2))', 'renderer.setPixelRatio(0.5)'));
    if (extname(path) === '.html') content = Buffer.from(content.toString()
      .replaceAll('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js', '/node_modules/.trumpo-check/vendor/three.module.js')
      .replaceAll('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/', '/node_modules/.trumpo-check/vendor/')
      .replaceAll('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js', '/node_modules/.trumpo-check/vendor/qrcode.js')
      .replace(/<link[^>]+(?:fonts\.googleapis|fonts\.gstatic)[^>]*>/g, ''));
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg', '.png': 'image/png' })[extname(path)] || 'application/octet-stream');
    res.end(content);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${resolve(output, 'chrome-profile')}`, '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(Error('Chrome startup timed out')), 20000);
    chrome.on('error', reject);
    chrome.stderr.on('data', bytes => { text += bytes; const found = text.match(/DevTools listening on (ws:\/\/\S+)/); if (found) { clearTimeout(timer); resolve(found[1]); } });
  });
  socket = new WebSocket(endpoint);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let next = 0;
  const pending = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { const waiter = pending.get(message.id); pending.delete(message.id); if (message.error) waiter.reject(Error(JSON.stringify(message.error))); else waiter.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++next; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, sessionId })); });
  const page = async (url, mobile = false) => {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId);
    await send('Page.enable', {}, sessionId);
    // These tabs stand in for separate visible devices; headless Chrome otherwise suspends
    // background tabs' animation frames when the next virtual phone opens.
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.requestAnimationFrame=callback=>setTimeout(()=>callback(performance.now()),16);window.cancelAnimationFrame=id=>clearTimeout(id);` }, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: mobile ? 390 : 1280, height: mobile ? 844 : 900, deviceScaleFactor: 1, mobile }, sessionId);
    if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true }, sessionId);
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const until = async expression => {
      const start = Date.now();
      while (Date.now() - start < 45000) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 250)); }
      throw Error('Timed out waiting for ' + expression + ' ' + await evaluate(`JSON.stringify({phase:document.body.dataset.phase,view:document.querySelector('#ctrl')?.dataset.view,text:document.querySelector('#banner')?.textContent})`) + '\n' + errors.join('\n'));
    };
    await send('Page.navigate', { url: base + url }, sessionId);
    return { sessionId, evaluate, until, screenshot: async name => { const shot = await send('Page.captureScreenshot', {}, sessionId); await writeFile(resolve(output, name), Buffer.from(shot.data, 'base64')); } };
  };

  const controls = await page('/__fixture', true);
  await controls.until('window.ready');
  assert(await controls.evaluate('particleFloor >= .0299'), 'particles remain above ground');
  const rects = await controls.evaluate(`Object.fromEntries(['.joy','[data-act=power]','[data-act=dash]'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,{x:r.x+r.width/2,y:r.y+r.height/2}]}))`);
  const touch = async points => send('Input.dispatchTouchEvent', { type: points.length ? 'touchStart' : 'touchEnd', touchPoints: points }, controls.sessionId);
  const joystick = { ...rects['.joy'], id: 1 }, power = { ...rects['[data-act=power]'], id: 2 };
  await touch([joystick]);
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...joystick, x: joystick.x + 35 }] }, controls.sessionId);
  await touch([{ ...joystick, x: joystick.x + 35 }, power]);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...joystick, x: joystick.x + 35 }] }, controls.sessionId);
  assert.equal(await controls.evaluate(`sent.filter(e=>e.ev==='ability').length`), 1, 'skill fires while joystick remains captured');
  await touch([{ ...joystick, x: joystick.x + 35 }, { ...rects['[data-act=dash]'], id: 3 }]);
  await touch([]);
  assert.equal(await controls.evaluate(`sent.filter(e=>e.ev==='boost').length`), 1);
  await controls.screenshot('mobile-controls.png');
  console.log('PASS: real multi-touch joystick + power + dash; particle floor');

  const host = await page('/index.html?net=local');
  await host.until(`typeof document.querySelector('#btn-host')?.onclick === 'function'`);
  await host.evaluate(`document.querySelector('#btn-host').click();document.querySelector('#btn-host-brawl').click()`);
  await host.until(`document.querySelector('#net-status').textContent.includes('Local test')`);
  const room = await host.evaluate(`document.querySelector('#room-code').textContent`);
  await host.evaluate(`document.querySelector('#btn-add-cpu').click();document.querySelector('[data-remove-cpu]').click()`);
  assert.equal(await host.evaluate(`document.querySelectorAll('[data-remove-cpu]').length`), 0);
  await host.evaluate(`document.querySelector('#host-name').value='Host';document.querySelector('#btn-host-play').click()`);
  await host.until(`document.body.classList.contains('host-playing')`);
  assert(await host.evaluate(`document.querySelector('#ctrl .visual-howto').querySelectorAll('svg').length===5`));
  await host.screenshot('desktop-lobby.png');

  const phone = await page('/play.html?net=local&room=' + room, true);
  await phone.until(`typeof document.querySelector('#join')?.onclick==='function'`);
  await phone.evaluate(`document.querySelector('#name').value='Phone';document.querySelector('#join').click()`);
  await phone.until(`document.querySelector('#join-screen').hidden`);
  await phone.screenshot('mobile-waiting.png');
  await host.evaluate(`window.roomTraffic=[];window.observer=new BroadcastChannel('paikutan-${room}');observer.onmessage=e=>{roomTraffic.push(e.data);if(e.data.ev==='state')window.roomState=e.data.p};`);
  await host.evaluate(`document.querySelector('#btn-start').click()`);
  console.log('CHECK: both players are choosing');
  await phone.until(`document.querySelector('[data-act=ready]')`);
  await host.evaluate(`document.querySelector('[data-act=ready]').click()`);
  await phone.evaluate(`document.querySelector('[data-act=ready]').click()`);
  await host.until(`document.body.dataset.phase==='charge'`);
  console.log('CHECK: charge phase');
  await host.until(`window.roomState?.phase==='charge'`);
  await host.evaluate(`roomState.players.filter(Boolean).forEach(p=>observer.postMessage({ev:'spin',p:{id:p.id,power:.9,stability:.9}}))`);
  await host.until(`document.body.dataset.phase==='throw'`);
  await host.evaluate(`roomState.players.filter(Boolean).forEach(p=>observer.postMessage({ev:'throw',p:{id:p.id,power:.5,angle:0}}))`);
  await phone.until(`document.querySelector('#ctrl').dataset.view==='fight'`);
  console.log('CHECK: fight phase');
  await phone.evaluate(`(async()=>{window.humFrames=0;const {audio}=await import('/js/audio.js');const hum=audio.hum;audio.hum=function(...args){if(args[1]>0)humFrames++;return hum.apply(this,args)};document.querySelector('[data-chat="0"]')?.click()})()`);
  if (CHAT_ENABLED) {
    await host.until(`document.querySelector('.chat-bubble')?.textContent==='Tara G'`);
    await phone.until(`document.querySelector('.chat-bubble')?.textContent==='Tara G'`);
  } else assert.equal(await phone.evaluate(`document.querySelectorAll('.quick-chat').length`), 0, 'quick chat is hidden');
  await phone.until(`humFrames>2`);
  await phone.screenshot('mobile-match.png');
  assert.equal(await host.evaluate(`roomTraffic.filter(m=>m.ev==='fx').length`), 0);
  await phone.evaluate(`document.querySelector('#leave').click()`);
  await phone.until(`!document.querySelector('#join-screen').hidden`);
  await host.until(`document.body.dataset.phase==='lobby'`);
  await phone.evaluate(`document.querySelector('#name').value='Rejoined';document.querySelector('#join').click()`);
  await phone.until(`document.querySelector('#join-screen').hidden`);
  await host.evaluate(`document.querySelector('#btn-exit').click()`);
  await phone.until(`document.querySelector('#join-msg').textContent.includes('host ended')`);
  assert.equal(await phone.evaluate(`document.querySelectorAll('#ctrl > *').length`), 0);
  console.log(`PASS: host participation; CPU removal; multiplayer controller hum; ${CHAT_ENABLED ? 'shared Tagalog chat' : 'quick chat hidden'}; leave/rejoin; host exit`);

  await host.evaluate(`document.querySelector('#btn-join').click();document.querySelector('#join-code').value='ABCD';document.querySelector('#menu-join').requestSubmit()`);
  await host.until(`location.pathname==='/play.html'&&new URLSearchParams(location.search).get('room')==='ABCD'`);
  await host.until(`typeof document.querySelector('#join')?.onclick==='function'`);
  await host.evaluate(`document.querySelector('#join').click();document.querySelector('#leave').click()`);
  assert(await host.evaluate(`!document.querySelector('#join-screen').hidden&&!document.querySelector('#join').disabled`));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, host.sessionId);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true }, host.sessionId);
  await send('Page.navigate', { url: base + '/index.html?net=local' }, host.sessionId);
  await host.until(`typeof document.querySelector('#btn-host')?.onclick==='function'`);
  await host.evaluate(`document.querySelector('#btn-host').click();document.querySelector('#btn-host-brawl').click();document.querySelector('#btn-host-play').click()`);
  await host.until(`document.body.classList.contains('host-phone')`);
  await host.evaluate(`document.querySelector('#btn-room').click()`);
  assert(await host.evaluate(`getComputedStyle(document.querySelector('#lobby')).display!=='none'`));
  await host.screenshot('mobile-host.png');
  await host.evaluate(`document.querySelector('#btn-exit').click()`);
  const failures = errors.filter(e => !e.includes('WebGL context was lost'));
  assert.deepEqual(failures, [], 'no browser runtime errors');
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ passed: true, screenshots: ['mobile-controls.png','desktop-lobby.png','mobile-waiting.png','mobile-match.png','mobile-host.png'], errors }, null, 2));
  console.log('PASS: main-menu room-code entry; no browser runtime errors');
} finally {
  socket?.close();
  chrome.kill();
  server.close();
}
