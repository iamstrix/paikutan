// Phone page: join a room as a controller (or ?solo=1 to play the CPU on the phone alone).
import { Engine } from './engine.js';
import { decodeSnap } from './sim.js';
import { createScene } from './scene.js';
import { createController } from './controller.js';
import { connect, playerId } from './net.js';
import { requestMotion } from './input.js';
import { audio, playFx } from './audio.js';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const solo = params.has('solo');
const myId = solo ? 'me' : playerId();
const scene = createScene($('#view'), { low: true });
const SCENE_PHASES = ['countdown', 'throw', 'fight', 'roundEnd'];
let ctrl = null, net = null, engine = null, state = null, lastPhase = '', lastMsg = 0, snap = null;

$('#room').value = (params.get('room') || '').toUpperCase();
$('#name').value = localStorage.getItem('paikutan-name') || '';
if (solo) { $('#room-row').hidden = true; $('#join').textContent = 'Play vs CPU'; }

$('#join').onclick = async () => {
  const name = $('#name').value.trim() || 'Player';
  const room = $('#room').value.trim().toUpperCase();
  localStorage.setItem('paikutan-name', name);
  audio.unlock();
  await requestMotion();
  try { await navigator.wakeLock?.request('screen'); } catch { /* not supported: fine */ }
  if (solo) return startSolo(name);
  if (!/^[A-Z]{4}$/.test(room)) { $('#join-msg').textContent = 'Enter the 4-letter room code shown on the big screen.'; return; }
  $('#join').disabled = true;
  $('#join-msg').textContent = 'Connecting…';
  try {
    net = await connect(room, onMessage);
  } catch (e) {
    $('#join').disabled = false;
    $('#join-msg').textContent = 'Could not connect (' + e.message + '). Check your internet and try again.';
    return;
  }
  $('#join-msg').textContent = 'Joining room ' + room + '…';
  ctrl = createController($('#ctrl'), { mode: 'phone', myId, send: (ev, p) => net.send(ev, { ...p, id: myId }) });
  const hello = () => net.send('hello', { id: myId, name });
  hello();
  // Keep saying hello until the host lists us (covers a host that opened late or refreshed).
  setInterval(() => {
    const listed = state && state.players.some(p => p && p.id === myId);
    if (!listed) hello();
    $('#lost').hidden = performance.now() - lastMsg < 7000;
  }, 2000);
};

function startSolo(name) {
  audio.music(true, 0.25);
  engine = new Engine((type, p) => onMessage(type, p));
  ctrl = createController($('#ctrl'), { mode: 'phone', myId, send: (ev, p) => engine.handle(myId, ev, p) });
  engine.join(myId, name, 'local');
  engine.join('cpu', 'CPU', 'cpu');
}

function onMessage(ev, p) {
  lastMsg = performance.now();
  if (ev === 'state') {
    state = p;
    const mine = p.players.some(x => x && x.id === myId);
    if (!mine) return;
    $('#join-screen').hidden = true;
    if (p.phase !== lastPhase) {
      if (p.phase === 'countdown') scene.reset();
      if (solo) audio.music(true, SCENE_PHASES.includes(p.phase) ? 0.1 : 0.25);
      lastPhase = p.phase;
    }
    scene.setPlayers(p.players);
    scene.setView(p.players.findIndex(x => x && x.id === myId));
    document.body.classList.toggle('show-scene', SCENE_PHASES.includes(p.phase));
    scene.resize();
    ctrl.setState(p);
  } else if (ev === 'snap') {
    snap = decodeSnap(p);
    scene.applySnap(snap, solo);
    ctrl && ctrl.onSnap(snap);
  } else if (ev === 'fx') {
    p.forEach(e => { scene.fx(e); playFx(e); if (e.type === 'hit' && navigator.vibrate) navigator.vibrate(Math.round(20 + 60 * e.i)); });
  } else if (ev === 'full' && p.id === myId) {
    $('#join-msg').textContent = 'This room already has two players.';
    $('#join').disabled = false;
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (engine) engine.update(dt);
  if (document.body.classList.contains('show-scene')) scene.render(dt);
  if (solo && snap && state) {
    const on = ['throw', 'fight'].includes(state.phase);
    [0, 1].forEach(i => audio.hum(i, on && snap.tops[i].alive ? snap.tops[i].spin : 0, snap.tops[i].wobble));
  }
}
requestAnimationFrame(frame);
