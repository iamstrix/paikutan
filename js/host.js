// Desktop page: title screen with a CPU demo, online host/spectator, and practice vs CPU.
import { Engine, WIN_ROUNDS } from './engine.js';
import { decodeSnap, LATE_T } from './sim.js';
import { createScene } from './scene.js';
import { createController, charIcon, topIcon } from './controller.js';
import { connect, makeRoomCode, isLocalNet } from './net.js';
import { audio, playFx } from './audio.js';
import { CHARACTERS, TOPS, PLAYER_COLORS, byId } from './data.js';

const $ = s => document.querySelector(s);
// Canvas signs and POW! bursts letter in Lilita One; give it a moment to load so they don't bake in a fallback.
await Promise.race([document.fonts.load('64px "Lilita One"').catch(() => {}), new Promise(r => setTimeout(r, 1500))]);
const scene = createScene($('#view'));
let engine = null, net = null, ctrl = null, mode = 'title';
const CAMS = ['auto', 'top', 'close', 'orbit'];
let camIdx = 0;
let state = null, snap = null, lastNetSnap = 0, lastPhase = '', lateSaid = false, bannerUntil = 0;

const REASON = { fall: 'Natumba! Toppled over.', out: 'Labas! Out of the circle.', time: 'Time! Faster spinner wins.', draw: 'Tabla! Replay the round.' };
const nameOf = s => (state && state.players[s] ? state.players[s].name : `P${s + 1}`);

function start(newMode) {
  mode = newMode;
  if (net) { net.close(); net = null; }
  if (ctrl) { ctrl.destroy(); ctrl = null; }
  document.body.dataset.mode = mode;
  document.body.classList.remove('lobby-open');
  $('#lobby').hidden = mode !== 'host';
  state = snap = null; lastPhase = '';
  scene.reset();
  scene.setLocalSteer(-1, null);
  scene.setCam(mode === 'title' ? 'menu' : CAMS[camIdx]);
  engine = new Engine(onEngine);
  $('#ticker').innerHTML = '';
  if (mode === 'title' || mode === 'demo') {
    engine.join('cpu-a', 'Kulas', 'cpu');
    engine.join('cpu-b', 'Ising', 'cpu');
  } else if (mode === 'practice') {
    ctrl = createController($('#ctrl'), { mode: 'desktop', myId: 'me', sounds: false, send: (ev, p) => engine.handle('me', ev, p) });
    engine.join('me', 'Ikaw', 'local');
    engine.join('cpu', 'CPU', 'cpu');
  }
}

async function hostRoom() {
  start('host');
  const room = makeRoomCode();
  const url = new URL('play.html', location.href);
  url.searchParams.set('room', room);
  if (isLocalNet()) url.searchParams.set('net', 'local');
  $('#room-code').textContent = room;
  $('#room-url').textContent = url.href.replace(/^https?:\/\//, '');
  $('#room-url').href = url.href;
  try {
    const qr = window.qrcode(0, 'M');
    qr.addData(url.href); qr.make();
    $('#qr').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  } catch { $('#qr').textContent = 'QR unavailable: open the link on your phone.'; }
  $('#net-status').textContent = 'Connecting…';
  try {
    const n = await connect(room, onNet);
    if (mode !== 'host') { n.close(); return; }
    net = n;
    $('#net-status').textContent = net.kind === 'local' ? 'Local test mode (same PC tabs)' : 'Online · scan to join';
    net.send('state', engine.state());
  } catch (e) {
    $('#net-status').textContent = 'Could not connect: ' + e.message + '. Check the internet, or add ?net=local to test on one PC.';
  }
}

function onNet(ev, p) {
  if (!engine || mode !== 'host' || !p || !p.id) return;
  if (ev === 'hello') {
    const s = engine.handle(p.id, 'hello', { name: p.name, kind: 'remote' });
    if (s < 0) net.send('full', { id: p.id });
    return;
  }
  engine.handle(p.id, ev, p);
}

function onEngine(type, payload) {
  if (type === 'state') onState(payload);
  else if (type === 'snap') {
    snap = decodeSnap(payload);
    scene.applySnap(snap, true);
    if (ctrl) ctrl.onSnap(snap);
    const now = performance.now();
    if (net && now - lastNetSnap > 100) { lastNetSnap = now; net.send('snap', payload); }
  } else if (type === 'fx') {
    payload.forEach(e => { scene.fx(e); if (mode !== 'title') playFx(e); commentary(e); });
    if (net) net.send('fx', payload);
  }
}

function onState(s) {
  state = s;
  document.body.dataset.phase = s.phase;
  scene.setPlayers(s.players);
  if (ctrl) ctrl.setState(s);
  if (net) net.send('state', s);
  if (s.phase !== lastPhase) {
    if (s.phase === 'countdown') { scene.reset(); lateSaid = false; }
    if (s.phase === 'throw' && mode !== 'title') audio.beep(true);
    if ((s.phase === 'roundEnd' || s.phase === 'matchEnd') && s.result && s.result.winner >= 0 && mode !== 'title') audio.win();
    if (s.phase === 'roundEnd' && s.result && s.result.winner >= 0) scene.celebrate(s.result.winner, Math.max(...s.scores) >= WIN_ROUNDS);
    if (s.phase === 'fight') bannerUntil = performance.now() + 1200;
    if (s.phase === 'charge' && s.switched && s.switched.from !== s.switched.to) {
      say(`Counterpick! <b style="color:${PLAYER_COLORS[s.switched.slot]}">${nameOf(s.switched.slot)}</b> switches to ${byId(TOPS, s.switched.to).name}.`);
    }
    audio.music(true, ['fight', 'throw', 'countdown'].includes(s.phase) ? 0.12 : 0.3);
    lastPhase = s.phase;
  }
  renderLobby();
  renderCards();
}

function renderLobby() {
  if (mode !== 'host') return;
  $('#slots').innerHTML = [0, 1].map(i => {
    const p = state.players[i];
    return `<li style="--pc:${PLAYER_COLORS[i]}"><b>P${i + 1}</b> ${p ? p.name + (p.picked ? ' ✓' : '') : '<span class="muted">waiting…</span>'}</li>`;
  }).join('');
  $('#lobby').hidden = state.phase !== 'lobby' && state.phase !== 'pick';
  document.body.classList.toggle('lobby-open', !$('#lobby').hidden);
}

function renderCards() {
  [0, 1].forEach(i => {
    const p = state.players[i], el = $(`#card${i}`);
    if (!p || state.phase === 'lobby') { el.hidden = true; return; }
    el.hidden = false;
    const c = byId(CHARACTERS, p.char), t = byId(TOPS, p.top);
    el.querySelector('.who').innerHTML = `${charIcon(p.char, 44)}<div class="txt"><b>${p.name}</b><small>${c.name} · ${t.name}</small></div>${topIcon(p.top, 36)}`;
    el.querySelector('.wins').innerHTML = Array.from({ length: WIN_ROUNDS }, (_, k) => `<i class="${k < state.scores[i] ? 'on' : ''}"></i>`).join('');
  });
}

// Live HUD numbers, every frame.
function updateHud() {
  if (!state) return;
  const ph = state.phase;
  const fighting = snap && (ph === 'throw' || ph === 'fight' || ph === 'roundEnd');
  [0, 1].forEach(i => {
    const el = $(`#card${i}`);
    if (el.hidden) return;
    const tp = fighting ? snap.tops[i] : null;
    const p = engine.players[i];
    let spin = tp ? tp.spin : 0;
    let label = tp ? (tp.alive ? Math.round(tp.spin * 100) + '%' : tp.out ? 'LABAS' : 'NATUMBA') : '';
    if (ph === 'charge' && p) {
      spin = p.spun ? 0.45 + 0.4 * p.spun.power : Math.min(1, p.laps / 7);
      label = p.spun ? 'ready!' : p.laps.toFixed(1) + ' ikot';
    }
    el.querySelector('.spin b').style.width = Math.round(spin * 100) + '%';
    const dmg = el.querySelector('.spin .dmg');
    if (dmg) dmg.style.width = Math.round(spin * 100) + '%';
    el.querySelector('.spin em').textContent = label;
    el.querySelector('.wob b').style.width = Math.round((tp ? tp.wobble : 0) * 100) + '%';
    const pips = el.querySelectorAll('.pips i'), charge = tp ? tp.charge : 0;
    pips.forEach((pip, k) => pip.classList.toggle('on', charge >= (k + 1) / 3 - 0.001));
    el.classList.toggle('ready', !!(tp && tp.charge >= 1 && tp.alive));
    el.classList.toggle('inverted', !!(tp && tp.invert));
  });
  if (fighting && snap.t > LATE_T && !lateSaid && ph === 'fight') { lateSaid = true; say('Pagod na! Spin now drains twice as fast.'); }
  renderBanner();
}

function renderBanner() {
  const b = $('#banner'), ph = state.phase, t = Math.ceil(engine.timer);
  let big = '', small = '';
  if (mode === 'practice' && !['fight', 'roundEnd', 'matchEnd'].includes(ph)) { b.hidden = true; return; }
  switch (ph) {
    case 'pick': big = 'Pumili!'; small = 'Players are picking a character and a trumpo'; break;
    case 'vs': big = `${nameOf(0)} <em>vs</em> ${nameOf(1)}`; small = 'Best of 3'; break;
    case 'counter': {
      const w = state.result.winner;
      big = `${nameOf(1 - w)} is picking a counter…`;
      small = `${nameOf(w)} won, so stays locked with ${byId(TOPS, state.players[w].top).name} · ${t}s`;
      break;
    }
    case 'charge': {
      const sw = state.switched;
      big = `Round ${state.round}: PAIKOT!`;
      small = sw ? `${nameOf(sw.slot)} ${sw.from === sw.to ? 'stays with' : 'switches to'} ${byId(TOPS, sw.to).name}!` : 'Players draw fast circles to spin their trumpo';
      break;
    }
    case 'countdown': big = ['', 'Isa…', 'Dalawa…', 'Tatlo…'][4 - Math.min(3, Math.max(1, t))]; small = 'Get ready to throw'; break;
    case 'throw': big = 'BITAW!'; break;
    case 'fight': if (performance.now() < bannerUntil) big = 'LABAN!'; break;
    case 'roundEnd': {
      const r = state.result;
      big = r.winner < 0 ? 'Tabla!' : `${nameOf(r.winner)} wins round ${state.round}`;
      small = REASON[r.reason] || '';
      break;
    }
    case 'matchEnd': big = `KAMPEON: ${nameOf(state.result.champion)}!`; small = `${state.scores[0]} – ${state.scores[1]}`; break;
  }
  b.hidden = !big;
  b.innerHTML = `<h1>${big}</h1>${small ? `<p>${small}</p>` : ''}`;
  $('#end-bar').hidden = !(ph === 'matchEnd' && (mode === 'host' || mode === 'practice'));
}

function say(text) {
  const li = document.createElement('li');
  li.innerHTML = text;
  $('#ticker').prepend(li);
  while ($('#ticker').children.length > 4) $('#ticker').lastChild.remove();
  setTimeout(() => li.classList.add('old'), 4000);
}

function commentary(e) {
  const n = s => `<b style="color:${PLAYER_COLORS[s]}">${nameOf(s)}</b>`;
  switch (e.type) {
    case 'launch': say(`${n(e.slot)} throws! ${e.p > 0.8 ? 'Malakas! A hard throw.' : e.p < 0.3 ? 'A soft toss…' : 'Bitaw!'}`); break;
    case 'hit': if (e.i > 0.75) say('BANGGAAN! Huge clash!'); break;
    case 'steal': if (e.amt > 0.03) say(`Agaw-ikot! ${n(e.slot)} steals spin back!`); break;
    case 'ability': {
      const o = n(1 - e.slot);
      say({
        kidlat: `KIDLAT! ${n(e.slot)} calls lightning down on ${o}!`,
        tikbalang: `${n(e.slot)} charges like a Tikbalang!`,
        agimat: `${n(e.slot)}'s agimat glows. Hits barely hurt now!`,
        diwata: `A diwata blesses ${n(e.slot)}'s trumpo!`,
        bakunawa: `Bakunawa swallows the moon! ${o} steers in reverse!`,
      }[e.top]);
      break;
    }
    case 'dogWarn': say('Uy! Asong gala! A stray dog is about to charge. Get out of the red lane!'); break;
    case 'bark': say(`Arf! The dog knocks ${n(e.slot)} aside!`); break;
    case 'eggWarn': say('Putak! A hen is running into the circle…'); break;
    case 'crack': say(`${n(e.slot)} smashes the egg!`); break;
    case 'fall': say(`${n(e.slot)}'s trumpo topples. Natumba!`); break;
    case 'out': say(`${n(e.slot)} is knocked out of the circle. Labas!`); break;
  }
}

// ---------- buttons ----------
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
$('#btn-host').onclick = () => { audio.unlock(); hostRoom(); };
$('#btn-practice').onclick = () => {
  audio.unlock();
  if (matchMedia('(pointer: coarse)').matches) location.href = 'play.html?solo=1';
  else start('practice');
};
$('#btn-help').onclick = () => { $('#help').hidden = false; };
$('#help-close').onclick = () => { $('#help').hidden = true; };
$('#btn-back').onclick = () => start('title');
$('#btn-lobby-cancel').onclick = () => start('title');
$('#btn-rematch').onclick = () => {
  engine.players.forEach(p => p && engine.handle(p.id, 'rematch'));
};
$('#btn-mute').onclick = () => { audio.unlock(); audio.setMuted(!audio.muted); $('#btn-mute').textContent = audio.muted ? '🔇' : '🔊'; };
const musicBtn = () => { $('#btn-music').classList.toggle('off', audio.musicMuted); $('#btn-music').title = audio.musicMuted ? 'Music off (N)' : 'Music on (N)'; };
$('#btn-music').onclick = () => { audio.unlock(); audio.setMusicMuted(!audio.musicMuted); musicBtn(); };
musicBtn();
$('#btn-full').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
addEventListener('keydown', e => {
  if (e.code === 'Escape' && mode !== 'title') start('title');
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'KeyM') $('#btn-mute').click();
  if (e.code === 'KeyN') $('#btn-music').click();
  // B-roll helpers: C cycles the spectator camera, H hides the HUD for clean footage.
  if (e.code === 'KeyC' && (mode === 'host' || mode === 'demo')) {
    camIdx = (camIdx + 1) % CAMS.length;
    scene.setCam(CAMS[camIdx]);
  }
  if (e.code === 'KeyH') document.body.classList.toggle('clean');
});
// Online rooms need a heartbeat so late joiners and reconnects get the current state.
setInterval(() => { if (net && engine) net.send('state', engine.state()); }, 2000);

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  engine.update(dt);
  if (ctrl && ctrl.slot >= 0) scene.setLocalSteer(ctrl.slot, ctrl.localSteer());
  scene.render(dt);
  updateHud();
  const humOn = mode !== 'title' && snap && state && ['throw', 'fight'].includes(state.phase);
  [0, 1].forEach(i => audio.hum(i, humOn && snap.tops[i].alive && snap.tops[i].launched ? snap.tops[i].spin : 0, humOn ? snap.tops[i].wobble : 0));
}
// ?demo runs a CPU vs CPU match with the full HUD (for trailers and showcase screens).
// ?practice jumps straight into practice vs CPU.
const q = new URLSearchParams(location.search);
start(q.has('demo') ? 'demo' : q.has('practice') ? 'practice' : 'title');
requestAnimationFrame(frame);
