// Phone page: join a room as a controller (or ?solo=1 to play the CPU on the phone alone).
import { Engine } from './engine.js';
import { decodeSnap } from './sim.js';
import { createScene } from './scene.js';
import { createController } from './controller.js';
import { connect, playerId } from './net.js';
import { requestMotion } from './input.js';
import { audio, playFx } from './audio.js';
import { createFxReceiver } from './chat.js';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const solo = params.has('solo');
const myId = solo ? 'me' : playerId();
// Canvas signs and POW! bursts letter in Lilita One; give it a moment to load so they don't bake in a fallback.
await Promise.race([document.fonts.load('64px "Lilita One"').catch(() => {}), new Promise(r => setTimeout(r, 1500))]);
const scene = createScene($('#view'), { low: true });
const SCENE_PHASES = ['charge', 'countdown', 'throw', 'fight', 'roundEnd'];
// The pick screen is see-through, so the arena shows behind it (music stays at menu volume).
const VISIBLE_PHASES = [...SCENE_PHASES, 'pick'];
let ctrl = null, net = null, engine = null, state = null, lastPhase = '', lastMsg = 0, snap = null;
let session = 0, retryTimer = null, wakeLock = null, lastSnapSeq = 0;
const effects = createFxReceiver(e => {
  scene.fx(e);
  if (e.type === 'chat') audio.chat(e.i, state?.players[e.slot]?.char);
  else playFx(e);
  if (e.type === 'hit' && navigator.vibrate) navigator.vibrate(Math.round(20 + 60 * e.i));
});

$('#room').value = (params.get('room') || '').toUpperCase();
try { $('#name').value = localStorage.getItem('paikutan-name') || ''; } catch { /* optional */ }
if (params.get('net') === 'local') $('#home').href = 'index.html?net=local';
if (solo) { $('#room-row').hidden = true; $('#join').textContent = 'Play vs CPU'; }

$('#join').onclick = async () => {
  if ($('#join').disabled) return;
  const name = $('#name').value.trim() || 'Player';
  const room = $('#room').value.trim().toUpperCase();
  if (!solo && !/^[A-Z]{4}$/.test(room)) { $('#join-msg').textContent = 'Enter the 4-letter room code shown on the big screen.'; return; }
  const attempt = ++session;
  $('#join').disabled = true;
  $('#leave').hidden = false;
  $('#leave').textContent = 'Cancel joining';
  try { localStorage.setItem('paikutan-name', name); } catch { /* optional */ }
  audio.unlock();
  await requestMotion();
  if (attempt !== session) return;
  try {
    const lock = await navigator.wakeLock?.request('screen');
    if (attempt !== session) { await lock?.release(); return; }
    wakeLock = lock;
  } catch { /* not supported: fine */ }
  if (attempt !== session) return;
  if (solo) return startSolo(name);
  $('#join-msg').textContent = 'Connecting…';
  try {
    const connection = await connect(room, (ev, p) => { if (attempt === session) onMessage(ev, p); });
    if (attempt !== session) { connection.close(); return; }
    net = connection;
  } catch (e) {
    if (attempt === session) leave('Could not connect (' + e.message + '). Check your internet and try again.');
    return;
  }
  $('#join-msg').textContent = 'Joining room ' + room + '…';
  ctrl = createController($('#ctrl'), { mode: 'phone', myId, send: (ev, p) => net.send(ev, { ...p, id: myId }) });
  const hello = () => net.send('hello', { id: myId, name });
  lastMsg = performance.now();
  const joinedAt = lastMsg;
  hello();
  // Keep saying hello until the host lists us (covers a host that opened late or refreshed).
  retryTimer = setInterval(() => {
    const listed = state && state.players.some(p => p && p.id === myId);
    if (!listed && performance.now() - joinedAt > 14000) { leave('No host replied. Check the room code and try again.'); return; }
    if (!listed) hello();
    $('#lost').hidden = performance.now() - lastMsg < 7000;
  }, 2000);
};

function leave(message = '', notify = true) {
  session++;
  clearInterval(retryTimer); retryTimer = null;
  if (ctrl) { ctrl.destroy(); ctrl = null; }
  if (net) { net.close(notify ? 'leave' : undefined, { id: myId }); net = null; }
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  engine = null; state = snap = null; lastPhase = ''; lastSnapSeq = 0; effects.reset();
  audio.stop(); scene.reset(); scene.setPlayers([]); scene.setLocalSteer(-1, null);
  document.body.classList.remove('show-scene');
  $('#lost').hidden = true; $('#leave').hidden = true;
  $('#join-screen').hidden = false; $('#join').disabled = false;
  $('#join-msg').textContent = message;
}
$('#leave').onclick = () => leave();
addEventListener('pagehide', () => leave());

function startSolo(name) {
  audio.music(true, 0.25);
  engine = new Engine((type, p) => onMessage(type, p));
  ctrl = createController($('#ctrl'), { mode: 'phone', myId, send: (ev, p) => engine.handle(myId, ev, p) });
  engine.join(myId, name, 'local');
  engine.join('cpu', 'CPU', 'cpu');
}

function onMessage(ev, p) {
  if (!p) return;
  lastMsg = performance.now();
  if (ev === 'state') {
    if (!ctrl) return;
    if (state?.session !== p.session) { effects.reset(); lastSnapSeq = 0; snap = null; scene.reset(); }
    state = p;
    const mine = p.players.some(x => x && x.id === myId);
    if (!mine) return;
    $('#join-screen').hidden = true;
    $('#leave').hidden = false; $('#leave').textContent = solo ? 'Back to practice setup' : 'Leave match';
    if (p.phase !== lastPhase) {
      if (p.phase === 'charge' || p.phase === 'countdown') scene.reset();
      audio.music(true, SCENE_PHASES.includes(p.phase) ? 0.1 : 0.25);
      lastPhase = p.phase;
    }
    scene.setPlayers(p.players);
    scene.setView(p.players.findIndex(x => x && x.id === myId));
    document.body.classList.toggle('show-scene', VISIBLE_PHASES.includes(p.phase));
    scene.resize();
    audio.setMatchState(p, { slot: p.players.findIndex(x => x?.id === myId) });
    ctrl.setState(p);
    if (!solo) effects.receive(p.fx);
  } else if (ev === 'snap') {
    if (!ctrl || !state?.players.some(x => x?.id === myId)) return;
    if (p.session !== state.session || p.round !== state.round) return;
    if (p.seq && p.seq <= lastSnapSeq) return;
    lastSnapSeq = p.seq || lastSnapSeq;
    snap = decodeSnap(p);
    audio.setMatchSnap(snap);
    scene.applySnap(snap, solo);
    ctrl && ctrl.onSnap(snap);
    if (!solo) effects.receive(p.fx);
  } else if (ev === 'fx') {
    if (solo) effects.receive(p);
  } else if (ev === 'full' && p.id === myId) {
    leave('This room is full. Try another room.', false);
  } else if (ev === 'roomClosed') {
    leave('The host ended the room. Join another match.', false);
  }
}

const musicBtn = () => $('#btn-music').classList.toggle('off', audio.musicMuted);
$('#btn-music').onclick = () => { audio.unlock(); audio.setMusicMuted(!audio.musicMuted); musicBtn(); };
musicBtn();

const muteBtn = () => {
  const el = $('#btn-mute');
  if (el) el.textContent = audio.muted ? '🔇' : '🔊';
};
if ($('#btn-mute')) {
  $('#btn-mute').onclick = () => { audio.unlock(); audio.setMuted(!audio.muted); muteBtn(); };
  muteBtn();
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (engine) engine.update(dt);
  if (ctrl && ctrl.slot >= 0) scene.setLocalSteer(ctrl.slot, ctrl.localSteer());
  const charging = state && state.phase === 'charge' && ctrl && state.players[ctrl.slot]?.inRound;
  scene.setCharge(charging ? ctrl.slot : -1, charging ? ctrl.localSpin() : null);
  if (document.body.classList.contains('show-scene')) scene.render(dt);
  if (snap && state) {
    const on = ['throw', 'fight'].includes(state.phase) && (solo || now - lastMsg < 7000);
    const level = Math.min(1, 2 / Math.max(2, snap.tops.length));
    snap.tops.forEach((top, i) => audio.hum(i, on && top.alive && top.launched ? top.spin : 0, on ? top.wobble : 0, level));
  }
}
requestAnimationFrame(frame);
