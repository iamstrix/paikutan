// Captures every UI panel at 16:9 (PC) and 9:16 (mobile) with headless Chrome. No dependencies.
// Usage: node UI/capture.mjs pc|mobile   (writes UI/<pc|mobile>/*.png and UI/<pc|mobile>/shots.json)
// Rooms run over ?net=local (BroadcastChannel), so every tab must live in this one Chrome.
import http from 'node:http';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { spawn } from 'node:child_process';

const which = process.argv[2] === 'mobile' ? 'mobile' : 'pc';
const VIEW = which === 'pc' ? { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false } : { width: 405, height: 720, deviceScaleFactor: 2, mobile: true };
const root = process.cwd();
const out = resolve(root, 'UI', which);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const shots = [];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!path.startsWith(root + sep) || url.pathname.includes('/.git')) throw Error('Forbidden');
    res.setHeader('Content-Type', TYPES[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  // Real GPU: software WebGL takes minutes per frame at 1080p. CAPTURE_SOFTWARE=1 falls back to SwiftShader.
  '--headless=new', ...(process.env.CAPTURE_SOFTWARE ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']), '--no-first-run', '--no-default-browser-check', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=0', `--user-data-dir=${resolve(root, 'node_modules/.trumpo-check/ui-profile-' + which)}`,
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const started = Date.now();
let socket;
try {
  const endpoint = await new Promise((ok, fail) => {
    let text = '';
    const timer = setTimeout(() => fail(Error('Chrome startup timed out')), 20000);
    chrome.on('error', fail);
    chrome.stderr.on('data', b => { text += b; const m = text.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timer); ok(m[1]); } });
  });
  socket = new WebSocket(endpoint);
  await new Promise(r => socket.addEventListener('open', r, { once: true }));
  let next = 0;
  const pending = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id) { const w = pending.get(m.id); pending.delete(m.id); if (m.error) w.reject(Error(JSON.stringify(m.error))); else w.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => { const id = ++next; pending.set(id, { resolve: ok, reject: fail }); socket.send(JSON.stringify({ id, method, params, sessionId })); });

  const page = async (label, url) => {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId);
    await send('Page.enable', {}, sessionId);
    // Each tab stands in for a separate device; keep background tabs animating.
    await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),16);window.cancelAnimationFrame=id=>clearTimeout(id);' }, sessionId);
    await send('Emulation.setDeviceMetricsOverride', VIEW, sessionId);
    if (VIEW.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true }, sessionId);
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
      if (r.exceptionDetails) throw Error(label + ': ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    const until = async (expression, ms = 90000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (await evaluate(expression).catch(() => false)) return; await sleep(150); }
      throw Error(`${label}: timed out waiting for ${expression} ${await evaluate(`JSON.stringify({phase:document.body.dataset.phase,view:document.querySelector('#ctrl')?.dataset.view})`).catch(() => '')}\n${errors.join('\n')}`);
    };
    const shot = async (file, title, note = '') => {
      await sleep(350); // let CSS transitions and the next WebGL frame settle
      const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
      await writeFile(resolve(out, file + '.png'), Buffer.from(data, 'base64'));
      shots.push({ file: file + '.png', title, device: label, note });
      console.log(`[${which}] ${((Date.now() - started) / 1000).toFixed(0)}s ${file}  ${title}`);
    };
    const go = async u => { await send('Page.navigate', { url: base + u }, sessionId); };
    const mouse = (type, x, y, buttons = 0) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1, pointerType: 'mouse' }, sessionId);
    await go(url);
    return { evaluate, until, shot, go, mouse, sessionId };
  };
  const phaseIs = ph => `document.body.dataset.phase==='${ph}'`;
  const viewIs = v => `document.querySelector('#ctrl').dataset.view==='${v}'`;
  const click = sel => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;e.click();return true})()`;
  const fill = (sel, v) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`;
  const ready = `typeof document.querySelector('#btn-host')?.onclick==='function'`;
  const phoneReady = `typeof document.querySelector('#join')?.onclick==='function'`;

  // Some screens only last a moment; missing one logs a skip instead of ending the run.
  const optional = async (name, fn) => {
    try { await fn(); } catch (e) { console.log(`[${which}] skipped ${name}: ${e.message.split('\n')[0]}`); }
  };

  // Draws real circles on the spin pad for its 3 seconds; screenshots once mid-gesture.
  async function windUp(tab, file, title) {
    const r = await tab.evaluate(`(()=>{const b=document.querySelector('.pad').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2,R:Math.min(b.width,b.height)*0.36}})()`);
    const at = a => [r.x + Math.cos(a) * r.R, r.y + Math.sin(a) * r.R];
    let a = 0;
    await tab.mouse('mousePressed', ...at(a), 1);
    const t0 = Date.now();
    let took = false;
    while (Date.now() - t0 < 3600) {
      a += 0.42;
      await tab.mouse('mouseMoved', ...at(a), 1);
      if (!took && Date.now() - t0 > 1400) { took = true; await tab.shot(file, title, 'Mid-gesture: drawing circles on the ring.'); }
      await sleep(16);
    }
    await tab.mouse('mouseReleased', ...at(a), 0);
  }

  // ---------- Menus ----------
  const host = await page(which === 'pc' ? 'Host screen (PC/TV)' : 'Host screen (phone)', '/index.html?net=local');
  await host.until(ready);
  await sleep(2500);
  await host.shot('01-title', 'Title / main menu', 'CPU demo match plays behind the menu.');
  await host.evaluate(click('#btn-host'));
  await host.shot('02-host-mode', 'Host: pick a mode (1v1 / Brawl)');
  await host.evaluate(click('#btn-host-back'));
  await host.evaluate(click('#btn-join'));
  await host.evaluate(fill('#join-code', 'ABCD'));
  await host.shot('03-join-code', 'Join match: room code entry');
  await host.evaluate(click('#btn-join-back'));
  await host.evaluate(click('#btn-help'));
  await host.shot('04-how-to-play', 'How to play overlay');
  await host.evaluate(click('#help-close'));

  const solo = await page('Phone', '/play.html?solo=1');
  await solo.until(phoneReady);
  await sleep(800);
  await solo.shot('05-solo-join', 'Practice vs CPU on phone: name entry', 'play.html?solo=1 (where Practice sends touch devices).');

  // ---------- 1v1 room: TV + two phones ----------
  await host.evaluate(click('#btn-host'));
  await host.evaluate(click('#btn-host-1v1'));
  await host.until(`document.querySelector('#net-status').textContent.length>0`);
  const room = await host.evaluate(`document.querySelector('#room-code').textContent`);
  await sleep(600);
  await host.shot('10-lobby-1v1-empty', '1v1 lobby: QR + room code, no players yet');

  const a = await page('Phone A (Juan)', `/play.html?net=local&room=${room}`);
  await a.until(phoneReady);
  await a.evaluate(fill('#name', 'Juan'));
  await sleep(600);
  await a.shot('11-phone-join', 'Phone join screen (room code filled from QR)');
  await a.evaluate(click('#join'));
  await a.until(`document.querySelector('#join-screen').hidden`);
  await sleep(500);
  await a.shot('12-phone-lobby-wait', 'Phone: joined, waiting for the rival', 'Includes the visual how-to steps.');
  await host.shot('13-lobby-1v1-one', '1v1 lobby: one player joined');

  await host.evaluate(`window.obs=new BroadcastChannel('paikutan-${room}');obs.onmessage=e=>{if(e.data.ev==='state')window.roomState=e.data.p};true`);
  const b = await page('Phone B (Maria)', `/play.html?net=local&room=${room}`);
  await b.until(phoneReady);
  await b.evaluate(fill('#name', 'Maria'));
  await b.evaluate(click('#join'));
  await a.until(viewIs('pick'));
  await b.until(viewIs('pick'));
  await sleep(600);
  await host.shot('14-tv-pick', 'TV: both players choosing');
  await a.shot('15-phone-pick', 'Phone: pick character + trumpo');
  await a.evaluate(click('[data-act=ready]'));
  await sleep(400);
  await a.shot('16-phone-pick-ready', 'Phone: picked, waiting for rival');
  await host.shot('17-tv-pick-one-ready', 'TV: one player ready');
  await b.evaluate(click('[data-act=ready]'));
  await host.until(phaseIs('vs'));
  await sleep(500);
  await host.shot('18-tv-vs', 'TV: versus intro');
  await a.shot('19-phone-vs', 'Phone: versus intro');

  const ids = async () => host.evaluate(`(()=>{const p=roomState.players;return p.map(x=>x&&x.id)})()`);
  const spin = (id, power, stability) => host.evaluate(`obs.postMessage({ev:'spin',p:{id:'${id}',power:${power},stability:${stability}}});true`);
  const toss = (id, power, angle = 0) => host.evaluate(`obs.postMessage({ev:'throw',p:{id:'${id}',power:${power},angle:${angle}}});true`);

  await host.until(phaseIs('charge'));
  await a.until(viewIs('spin'));
  await sleep(700);
  await host.shot('20-tv-charge', 'TV: players winding (Paikot)');
  await a.shot('21-phone-spin', 'Phone: spin pad, before touching');
  const [idA, idB] = await ids();
  await windUp(a, '22-phone-spin-drawing', 'Phone: spinning (drawing circles)');
  // B spins only after A's "locked in" screen is captured; once both spin, the round moves on at once.
  await optional('23', async () => { await a.until(viewIs('spunWait'), 8000); await a.shot('23-phone-spin-locked', 'Phone: spin locked in, waiting'); });
  await spin(idB, 0.35, 0.4);
  await host.until(phaseIs('countdown'));
  await optional('24-25', async () => {
    await sleep(500);
    await host.shot('24-tv-countdown', 'TV: countdown to Bitaw');
    await a.shot('25-phone-throw-countdown', 'Phone: throw screen during countdown');
  });
  await host.until(phaseIs('throw'));
  // The throw window is only 3 s: phone A's two shots go first, then the TV.
  await optional('26', () => a.shot('26-phone-throw-now', 'Phone: BITAW! flick now'));
  await toss(idA, 0.75);
  await optional('28', async () => { await a.until(viewIs('thrown'), 2500); await a.shot('28-phone-thrown', 'Phone: thrown, watching it land'); });
  await optional('27', () => host.shot('27-tv-throw', 'TV: throw window open (one player thrown)'));
  await toss(idB, 0.6);
  await host.until(phaseIs('fight'));
  await a.until(viewIs('fight'));
  await sleep(1800);
  await a.evaluate(click('[data-chat="0"]'));
  await sleep(400);
  await host.shot('29-tv-fight', 'TV: fight HUD (with a quick-chat bubble)');
  await a.shot('30-phone-fight', 'Phone: fight controls + "You" tag');
  await b.evaluate(click('[data-chat="1"]'));
  await sleep(2500);
  await b.shot('31-phone-fight-b', 'Phone (other player): fight');

  await host.until(phaseIs('roundEnd'));
  await sleep(600);
  await host.shot('32-tv-round-end', 'TV: round end banner');
  const won = await host.evaluate(`roomState.result.winner`);
  const [W, L] = won === 1 ? [b, a] : [a, b];
  await W.shot('33-phone-round-won', 'Phone: round won');
  await L.shot('34-phone-round-lost', 'Phone: round lost');

  // Rounds until someone takes the match; the counter-pick screens show between rounds.
  let counterShot = false;
  for (let round = 0; round < 4; round++) {
    await host.until(`['counter','matchEnd','charge'].includes(document.body.dataset.phase)`);
    let ph = await host.evaluate(`document.body.dataset.phase`);
    console.log(`[${which}] between rounds: ${ph}`);
    if (ph === 'counter' && !counterShot) {
      counterShot = true;
      await optional('35-37', async () => {
        await sleep(600);
        await host.shot('35-tv-counter', 'TV: counter-pick between rounds');
        // Only the round loser gets the trumpo carousel.
        const loser = await a.evaluate(`!!document.querySelector('#ctrl [data-car]')`) ? a : b;
        const winner = loser === a ? b : a;
        await loser.shot('36-phone-counter-pick', 'Phone: loser may switch trumpo');
        await winner.shot('37-phone-counter-wait', 'Phone: winner locked, waiting');
      });
    }
    if (ph === 'matchEnd') break;
    await host.until(`['charge','matchEnd'].includes(document.body.dataset.phase)`);
    if (await host.evaluate(phaseIs('matchEnd'))) break;
    await sleep(400);
    await spin(idA, 0.95, 0.95);
    await spin(idB, 0.25, 0.3);
    await host.until(phaseIs('throw'));
    await toss(idA, 0.7);
    await toss(idB, 0.6);
    await host.until(`['roundEnd','matchEnd'].includes(document.body.dataset.phase)`);
  }
  await host.until(phaseIs('matchEnd'));
  await sleep(1200);
  await host.shot('38-tv-match-end', 'TV: match end + Rematch / Back');
  const champ = await host.evaluate(`roomState.result.champion`);
  const [C, Lo] = champ === 1 ? [b, a] : [a, b];
  await C.shot('39-phone-match-won', 'Phone: KAMPEON (match won)');
  await Lo.shot('40-phone-match-lost', 'Phone: match lost');
  await optional('41', async () => {
    await C.evaluate(click('[data-act=rematch]'));
    await C.until(viewIs('rematchWait'), 5000);
    await C.shot('41-phone-rematch-wait', 'Phone: rematch requested, waiting');
  });

  // ---------- Brawl room: host plays in their own room, + CPUs, + phones ----------
  await host.evaluate(click('#btn-exit'));
  await host.until(`!document.querySelector('#title').hidden || document.body.dataset.mode==='title'`);
  await sleep(500);
  await host.evaluate(click('#btn-host'));
  await host.evaluate(click('#btn-host-brawl'));
  await host.until(`document.querySelector('#net-status').textContent.length>0`);
  const room2 = await host.evaluate(`document.querySelector('#room-code').textContent`);
  await host.evaluate(`window.obs=new BroadcastChannel('paikutan-${room2}');obs.onmessage=e=>{if(e.data.ev==='state')window.roomState=e.data.p};true`);
  await host.evaluate(click('#btn-add-cpu'));
  await host.evaluate(click('#btn-add-cpu'));
  await sleep(500);
  await host.shot('50-lobby-brawl', 'Brawl lobby: CPUs added (removable)');
  await host.evaluate(fill('#host-name', 'Host'));
  await host.evaluate(click('#btn-host-play'));
  await host.until(`document.body.classList.contains('host-playing')`);
  await sleep(600);
  await host.shot('51-lobby-host-playing', 'Brawl lobby: host takes a seat (plays on this screen)');
  if (VIEW.mobile) {
    await host.evaluate(click('#btn-room'));
    await sleep(400);
    await host.shot('52-host-room-overlay', 'Host on phone: Room overlay (QR / code)');
    await host.evaluate(click('#btn-room'));
  }
  const c = await page('Phone C (Ana)', `/play.html?net=local&room=${room2}`);
  await c.until(phoneReady);
  await c.evaluate(fill('#name', 'Ana'));
  await c.evaluate(click('#join'));
  await c.until(`document.querySelector('#join-screen').hidden`);
  await sleep(400);
  await host.shot('53-lobby-brawl-full', 'Brawl lobby: host + phone + CPUs');
  await host.evaluate(click('#btn-start'));
  await host.until(viewIs('pick'));
  await sleep(600);
  await host.shot('54-brawl-pick', 'Brawl: pick (host controller on the big screen)');
  await c.shot('55-phone-brawl-pick', 'Phone: brawl pick (timed)');
  await host.evaluate(click('[data-act=ready]'));
  await c.evaluate(click('[data-act=ready]'));
  await host.until(phaseIs('charge'));
  await host.until(viewIs('spin'));
  await sleep(600);
  await host.shot('56-brawl-spin', 'Brawl: host spin pad');
  const idC = await c.evaluate(`sessionStorage.getItem('paikutan-id')`);
  await spin(idC, 0.6, 0.6);
  await spin('host-player', 0.8, 0.8);
  await host.until(phaseIs('countdown'));
  await optional('57', async () => { await sleep(500); await host.shot('57-brawl-countdown', 'Brawl: countdown (host controller)'); });
  await host.until(phaseIs('throw'));
  await optional('58', () => host.shot('58-brawl-throw', 'Brawl: throw (drag mouse up / swipe)'));
  await toss('host-player', 0.7);
  await toss(idC, 0.7, 0.3);
  await host.until(phaseIs('fight'));
  const d = await page('Phone D (late joiner)', `/play.html?net=local&room=${room2}`);
  await d.until(phoneReady);
  await d.evaluate(fill('#name', 'Late'));
  await d.evaluate(click('#join'));
  await sleep(1200);
  await host.shot('59-brawl-fight', 'Brawl: fight (host plays, roster on the side)');
  await c.shot('60-phone-brawl-fight', 'Phone: brawl fight');
  await optional('61', async () => { await d.until(viewIs('sitOut'), 8000); await d.shot('61-phone-sit-out', 'Phone: joined mid-round, sits out'); });
  await host.until(phaseIs('roundEnd'));
  await sleep(600);
  await host.shot('62-brawl-round-end', 'Brawl: round end (points, KOs)');
  await c.shot('63-phone-brawl-round-end', 'Phone: brawl round end');
  for (let round = 0; round < 4; round++) {
    await host.until(`['pick','matchEnd'].includes(document.body.dataset.phase)`);
    if (await host.evaluate(phaseIs('matchEnd'))) break;
    if (round === 0) { await sleep(500); await host.shot('64-brawl-pick-between', 'Brawl: pick between rounds (timer)'); }
    await host.evaluate(click('[data-act=ready]'));
    await c.evaluate(click('[data-act=ready]'));
    await d.evaluate(click('[data-act=ready]'));
    await host.until(phaseIs('charge'));
    await sleep(300);
    const idD = await d.evaluate(`sessionStorage.getItem('paikutan-id')`);
    for (const id of ['host-player', idC, idD]) await spin(id, 0.7, 0.7);
    await host.until(phaseIs('throw'));
    for (const id of ['host-player', idC, idD]) await toss(id, 0.7, Math.random() - 0.5);
    await host.until(`['roundEnd','matchEnd'].includes(document.body.dataset.phase)`);
  }
  await host.until(phaseIs('matchEnd'));
  await sleep(1200);
  await host.shot('65-brawl-match-end', 'Brawl: final standings');
  await c.shot('66-phone-brawl-match-end', 'Phone: brawl final place');

  await writeFile(resolve(out, 'shots.json'), JSON.stringify({ viewport: VIEW, shots, errors }, null, 2));
  console.log(`[${which}] done: ${shots.length} shots, ${errors.length} page errors`);
} catch (e) {
  await writeFile(resolve(out, 'shots.json'), JSON.stringify({ viewport: VIEW, shots, failed: String(e.stack || e) }, null, 2));
  console.error(`[${which}] FAILED after ${shots.length} shots:`, e.message);
  process.exitCode = 1;
} finally {
  socket?.close();
  chrome.kill();
  server.close();
  await import('./build-gallery.mjs');
}
