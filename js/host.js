// Desktop page: title screen with a CPU demo, online host/spectator, and practice vs CPU.
import { Engine, WIN_ROUNDS, BRAWL_ROUNDS, BRAWL_WIN_PTS } from './engine.js';
import { decodeSnap } from './sim.js';
import { createScene } from './scene.js';
import { createController, charIcon, topIcon } from './controller.js';
import { connect, makeRoomCode, isLocalNet } from './net.js';
import { audio, playFx } from './audio.js';
import { CHARACTERS, TOPS, PLAYER_COLORS, byId } from './data.js';
import { requestMotion } from './input.js';

const $ = s => document.querySelector(s);
// Canvas signs and POW! bursts letter in Lilita One; give it a moment to load so they don't bake in a fallback.
await Promise.race([document.fonts.load('64px "Lilita One"').catch(() => {}), new Promise(r => setTimeout(r, 1500))]);
const scene = createScene($('#view'), {
  low: matchMedia('(pointer: coarse)').matches,
  cue: (name, arg) => { if (mode !== 'title') audio[name]?.(arg); },
});
let engine = null, net = null, ctrl = null, mode = 'title', brawl = false;
const CAMS = ['auto', 'top', 'close', 'orbit'];
let camIdx = 0;
let roomAttempt = 0;
const HOST_ID = 'host-player';
let state = null, snap = null, lastNetSnap = 0, lastPhase = '', bannerUntil = 0, squeezeUntil = 0, bannerHtml = '';

const REASON = { fall: 'Natumba! Toppled over.', out: 'Labas! Out of the circle.', time: 'Time! Faster spinner wins.', draw: 'Tabla! Replay the round.' };
const nameOf = s => (state && state.players[s] ? state.players[s].name : `P${s + 1}`);
const tag = s => `<b style="color:${PLAYER_COLORS[s]}">${nameOf(s)}</b>`;

function start(newMode, { matchMode = '1v1' } = {}) {
  roomAttempt++;
  mode = newMode;
  brawl = matchMode === 'brawl';
  document.body.classList.toggle('brawl', brawl);
  showMenu('main');
  if (net) { net.close('roomClosed', {}); net = null; }
  if (ctrl) { ctrl.destroy(); ctrl = null; }
  audio.stop();
  document.body.dataset.mode = mode;
  document.body.classList.remove('lobby-open');
  document.body.classList.remove('host-playing', 'host-room-open', 'host-phone');
  $('#btn-exit').hidden = !['host', 'practice', 'demo'].includes(mode);
  $('#btn-room').hidden = true;
  $('#lobby').hidden = mode !== 'host';
  state = snap = null; lastPhase = ''; lastNetSnap = 0;
  scene.reset();
  scene.setLocalSteer(-1, null);
  scene.setView('spectator');
  scene.setCam(mode === 'title' ? 'menu' : CAMS[camIdx]);
  engine = new Engine(onEngine, { mode: matchMode });
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

function showMenu(which) {
  $('#menu-main').hidden = which !== 'main';
  $('#menu-host').hidden = which !== 'host';
  $('#menu-join').hidden = which !== 'join';
}

async function hostRoom(matchMode) {
  start('host', { matchMode });
  const attempt = roomAttempt;
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
    if (mode !== 'host' || attempt !== roomAttempt) { n.close(); return; }
    net = n;
    $('#net-status').textContent = net.kind === 'local' ? 'Local test mode (same PC tabs)' : 'Online · scan to join';
    net.send('state', engine.state());
  } catch (e) {
    if (attempt !== roomAttempt) return;
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
    audio.setMatchSnap(snap);
    scene.applySnap(snap, true);
    if (ctrl) ctrl.onSnap(snap);
    const now = performance.now();
    if (net && now - lastNetSnap > 100) { lastNetSnap = now; net.send('snap', payload); }
  } else if (type === 'fx') {
    payload.forEach(e => {
      scene.fx(e);
      if (mode !== 'title') {
        if (e.type === 'chat') audio.chat(e.i, state?.players[e.slot]?.char);
        else playFx(e);
      }
      commentary(e);
    });
  }
}

function onState(s) {
  state = s;
  document.body.dataset.phase = s.phase;
  scene.setPlayers(s.players);
  audio.setMatchState(s, { silent: mode === 'title', slot: ctrl ? s.players.findIndex(p => p?.id === (mode === 'practice' ? 'me' : HOST_ID)) : -1 });
  if (ctrl) ctrl.setState(s);
  // The occupied seat determines the camera on both mouse and touch clients.
  scene.setView(ctrl && ctrl.slot >= 0 ? ctrl.slot : 'spectator');
  if (net) net.send('state', s);
  if (s.phase !== lastPhase) {
    if (s.phase === 'charge') scene.reset();
    if (s.phase === 'countdown') scene.reset();
    if (s.phase === 'throw' && mode !== 'title') audio.beep(true);
    if ((s.phase === 'roundEnd' || s.phase === 'matchEnd') && s.result && s.result.winner >= 0 && mode !== 'title') audio.win();
    if (s.phase === 'roundEnd' && s.result && s.result.winner >= 0) {
      scene.celebrate(s.result.winner, brawl ? s.round >= BRAWL_ROUNDS : Math.max(...s.scores) >= WIN_ROUNDS);
    }
    // Match end: the top three take the podium in a brawl; in 1v1 the winner bowls the loser over.
    // Either one clears when the next match starts.
    if (s.phase === 'matchEnd' && brawl && s.result && s.result.standings) scene.showPodium(s.result.standings);
    else if (s.phase === 'matchEnd' && !brawl && s.result && mode !== 'title') scene.showStrike(s.result.champion, 1 - s.result.champion);
    else if (lastPhase === 'matchEnd') scene.reset();
    if (s.phase === 'roundEnd' && brawl && s.result && s.result.winner >= 0) {
      const kos = (s.result.kos || []).filter(e => e.by === s.result.winner).length;
      say(`${tag(s.result.winner)} is the last trumpo spinning! +${BRAWL_WIN_PTS}${kos ? ` and ${kos} knockout${kos > 1 ? 's' : ''}` : ''}.`);
    }
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
  // A brawl lists everyone in, plus the next open seat; 1v1 always shows both seats.
  const open = state.players.findIndex(p => !p);
  const playing = engine.slotOf(HOST_ID) >= 0;
  $('#host-seat').hidden = playing;
  $('#btn-host-spectate').hidden = !playing;
  $('#btn-host-play').disabled = open < 0;
  const seats = brawl ? state.players.map((p, i) => (p || i === open ? i : -1)).filter(i => i >= 0) : [0, 1];
  $('#slots').innerHTML = seats.map(i => {
    const p = state.players[i];
    const who = p ? p.name + (p.kind === 'cpu' ? ' <span class="muted small">CPU</span>' : '') + (state.phase === 'pick' && p.picked ? ' ✓' : '')
      + (brawl && !p.inRound && !['lobby', 'pick'].includes(state.phase) ? ' <span class="muted small">next round</span>' : '')
      : '<span class="muted">waiting…</span>';
    const remove = p?.kind === 'cpu' && state.phase === 'lobby' ? `<button type="button" class="remove-cpu" data-remove-cpu="${i}" aria-label="Remove CPU ${p.name}">Remove</button>` : '';
    return `<li style="--pc:${PLAYER_COLORS[i]}"><b>P${i + 1}</b> <span>${who}</span>${remove}</li>`;
  }).join('');
  $('#brawl-actions').hidden = !brawl || state.phase !== 'lobby';
  $('#btn-add-cpu').disabled = open < 0;
  $('#btn-start').disabled = !engine.canStart();
  $('#btn-start').textContent = `Start (${state.players.filter(Boolean).length})`;
  // A brawl keeps a small QR code up during the match, so people can scan in for the next round.
  const between = state.phase === 'lobby' || state.phase === 'pick';
  $('#lobby').hidden = !between && !brawl;
  $('#lobby').classList.toggle('mini', brawl && !between);
  document.body.classList.toggle('lobby-open', between);
}

function renderCards() {
  $('#roster').hidden = !brawl || state.phase === 'lobby';
  if (brawl) { renderRoster(); return; }
  [0, 1].forEach(i => {
    const p = state.players[i], el = $(`#card${i}`);
    if (!p || state.phase === 'lobby') { el.hidden = true; return; }
    el.hidden = false;
    const c = byId(CHARACTERS, p.char), t = byId(TOPS, p.top);
    el.querySelector('.who').innerHTML = `${charIcon(p.char, 44)}<div class="txt"><b>${p.name}</b><small>${c.name} · ${t.name}</small></div>${topIcon(p.top, 36)}`;
    el.querySelector('.wins').innerHTML = Array.from({ length: WIN_ROUNDS }, (_, k) => `<i class="${k < state.scores[i] ? 'on' : ''}"></i>`).join('');
  });
}

// Brawl: one row per player, ordered by points.
function renderRoster() {
  // At match end, the final standings break ties the same way as the podium.
  const rank = state.result && state.result.standings;
  const at = i => (rank.includes(i) ? rank.indexOf(i) : rank.length + i); // anyone who joined after the end goes last
  const rows = state.players.map((p, i) => p && { p, i }).filter(Boolean)
    .sort((a, b) => (rank ? at(a.i) - at(b.i) : state.points[b.i] - state.points[a.i] || a.i - b.i));
  $('#roster').innerHTML = rows.map(({ p, i }) => `<li data-slot="${i}" style="--pc:${PLAYER_COLORS[i]}">
    ${topIcon(p.top, 26)}<b>${p.name}</b><span class="spin"><i></i></span><em>${state.points[i]}</em></li>`).join('');
}

// Live HUD numbers, every frame.
function updateHud() {
  if (!state) return;
  const ph = state.phase;
  const fighting = snap && (ph === 'throw' || ph === 'fight' || ph === 'roundEnd');
  if (brawl) {
    $('#roster').querySelectorAll('li').forEach(li => {
      const i = +li.dataset.slot, p = engine.players[i], tp = fighting && snap.tops[i];
      const sitting = !p || !p.inRound || ph === 'pick' || ph === 'vs';
      let spin = tp && tp.launched ? tp.spin : 0;
      if (ph === 'charge' && p) spin = p.spun ? 0.45 + 0.4 * p.spun.power : Math.min(1, p.laps / 7);
      li.querySelector('.spin i').style.width = Math.round((sitting ? 0 : spin) * 100) + '%';
      li.classList.toggle('down', !!(tp && tp.launched && !tp.alive));
      li.classList.toggle('waiting', !!(p && !p.inRound && !['lobby', 'pick', 'vs'].includes(ph)));
    });
    renderBanner();
    return;
  }
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
  renderBanner();
}

function renderBanner() {
  const b = $('#banner'), ph = state.phase, t = Math.ceil(engine.timer);
  let big = '', small = '';
  if (mode === 'practice' && !['fight', 'roundEnd', 'matchEnd'].includes(ph)) { b.hidden = true; return; }
  switch (ph) {
    case 'pick': big = 'Pumili!'; small = brawl ? `Pick a player and a trumpo · ${t}s` : 'Players are picking a character and a trumpo'; break;
    case 'vs':
      if (brawl) { big = 'BRAWL!'; small = `${engine.present().length} trumpos · ${BRAWL_ROUNDS} rounds · most points wins`; }
      else { big = `${nameOf(0)} <em>vs</em> ${nameOf(1)}`; small = 'Best of 3'; }
      break;
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
      if (brawl) small = `Round ${state.round} of ${BRAWL_ROUNDS} · draw fast circles to spin`;
      break;
    }
    case 'countdown': big = ['', 'Isa…', 'Dalawa…', 'Tatlo…'][4 - Math.min(3, Math.max(1, t))]; small = 'Get ready to throw'; break;
    case 'throw': big = 'BITAW!'; break;
    case 'fight':
      if (performance.now() < bannerUntil) big = 'LABAN!';
      else if (performance.now() < squeezeUntil) { big = 'SIKIP NA!'; small = 'The circle is shrinking'; }
      break;
    case 'roundEnd': {
      const r = state.result;
      big = r.winner < 0 ? 'Tabla!' : `${nameOf(r.winner)} wins round ${state.round}`;
      small = brawl && r.winner >= 0 ? `Last trumpo spinning · +${BRAWL_WIN_PTS} points` : REASON[r.reason] || '';
      break;
    }
    case 'matchEnd': {
      const c = state.result.champion;
      big = `KAMPEON: ${nameOf(c)}!`;
      small = brawl ? `${state.points[c]} points · ${state.scores[c]} round${state.scores[c] === 1 ? '' : 's'} won` : `${state.scores[0]} – ${state.scores[1]}`;
      break;
    }
  }
  b.hidden = !big;
  // Only when the text changes: rewriting it every frame restarted the pop-in, so the headline never showed.
  const html = `<h1>${big}</h1>${small ? `<p>${small}</p>` : ''}`;
  if (html !== bannerHtml) { bannerHtml = html; b.innerHTML = html; }
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
  const n = tag;
  // In a brawl, say who scored the knockout and how many are left.
  const ko = () => (brawl && e.by >= 0 ? ` ${n(e.by)} gets the knockout!` : '') + (brawl && e.left > 1 ? ` ${e.left} left.` : '');
  switch (e.type) {
    case 'launch': say(`${n(e.slot)} throws! ${e.p > 0.8 ? 'Malakas! A hard throw.' : e.p < 0.3 ? 'A soft toss…' : 'Bitaw!'}`); break;
    case 'hit': if (e.i > 0.75) say('BANGGAAN! Huge clash!'); break;
    case 'steal': if (e.amt > 0.03) say(`Agaw-ikot! ${n(e.slot)} steals spin back!`); break;
    case 'ability': {
      const o = n(e.target ?? 1 - e.slot);
      say({
        kidlat: `KIDLAT! ${n(e.slot)} calls lightning down on ${o}!`,
        tikbalang: `Tikbalang stampede! ${n(e.slot)} breaks through anything in the way!`,
        agimat: `${n(e.slot)}'s agimat glows. Hits barely hurt now!`,
        diwata: `A diwata blesses ${n(e.slot)}'s trumpo!`,
        bakunawa: `Bakunawa swallows the moon! ${o} steers in reverse!`,
      }[e.top]);
      break;
    }
    case 'dogWarn': say('Uy! Asong gala! A stray dog is about to charge. Get out of the red lane!'); break;
    case 'bark': say(`Arf! The dog knocks ${n(e.slot)} aside!`); break;
    case 'eggWarn': say('Putak! A hen is running into the circle…'); break;
    case 'zoneWarn': say(e.zone === 'swerte' ? 'Ibon! A lucky dropping is about to land. Watch the gold ring!' : 'The dog is marking a spot! Watch out for the puddle.'); break;
    case 'zoneLand': say(e.zone === 'swerte' ? 'SWERTE! The gold patch restores spin, up to 10 points per player.' : 'MADULAS! The puddle drains spin and makes steering slippery.'); break;
    case 'crack': say(`${n(e.slot)} smashes the egg!`); break;
    case 'squeeze': say('Sikip na! The circle is shrinking!'); squeezeUntil = performance.now() + 1800; break;
    case 'fall': say(`${n(e.slot)}'s trumpo topples. Natumba!${ko()}`); break;
    case 'out': say(`${n(e.slot)} is knocked out of the circle. Labas!${ko()}`); break;
  }
}

// ---------- buttons ----------
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
$('#btn-host').onclick = () => { audio.unlock(); showMenu('host'); };
$('#btn-join').onclick = () => { showMenu('join'); $('#join-code').focus(); };
$('#btn-join-back').onclick = () => showMenu('main');
$('#menu-join').onsubmit = e => {
  e.preventDefault();
  const room = $('#join-code').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(room)) { $('#join-code').reportValidity(); return; }
  const url = new URL('play.html', location.href); url.searchParams.set('room', room);
  if (isLocalNet()) url.searchParams.set('net', 'local');
  location.href = url.href;
};
$('#btn-host-1v1').onclick = () => hostRoom('1v1');
$('#btn-host-brawl').onclick = () => hostRoom('brawl');
$('#btn-host-back').onclick = () => showMenu('main');
$('#btn-add-cpu').onclick = () => engine.addCpu();
$('#slots').onclick = e => {
  const button = e.target.closest('[data-remove-cpu]');
  if (!button || mode !== 'host' || engine.phase !== 'lobby') return;
  const player = engine.players[+button.dataset.removeCpu];
  if (player?.kind === 'cpu') engine.leave(player.id);
};
$('#btn-host-play').onclick = async () => {
  if (ctrl || mode !== 'host') return;
  const attempt = roomAttempt, phone = matchMedia('(pointer: coarse)').matches;
  audio.unlock();
  if (phone) await requestMotion();
  if (mode !== 'host' || attempt !== roomAttempt || ctrl) return;
  const name = $('#host-name').value.trim() || 'Host';
  try { localStorage.setItem('paikutan-name', name); } catch { /* optional */ }
  ctrl = createController($('#ctrl'), { mode: phone ? 'phone' : 'desktop', myId: HOST_ID, sounds: false, send: (ev, p) => engine.handle(HOST_ID, ev, p) });
  document.body.classList.add('host-playing');
  document.body.classList.toggle('host-phone', phone);
  if (engine.join(HOST_ID, name, 'local') < 0) { ctrl.destroy(); ctrl = null; document.body.classList.remove('host-playing', 'host-phone'); return; }
  ctrl.setState(engine.state());
  $('#btn-room').hidden = false;
};
$('#btn-host-spectate').onclick = () => {
  if (ctrl) { ctrl.destroy(); ctrl = null; }
  document.body.classList.remove('host-playing', 'host-room-open', 'host-phone');
  $('#btn-room').hidden = true;
  scene.setView('spectator'); scene.setLocalSteer(-1, null); scene.setCharge(-1);
  engine.leave(HOST_ID);
};
$('#btn-room').onclick = () => document.body.classList.toggle('host-room-open');
try { $('#host-name').value = localStorage.getItem('paikutan-name') || ''; } catch { /* optional */ }
$('#btn-start').onclick = () => engine.start();
$('#btn-practice').onclick = () => {
  audio.unlock();
  if (matchMedia('(pointer: coarse)').matches) location.href = 'play.html?solo=1';
  else start('practice');
};
$('#btn-help').onclick = () => { $('#help').hidden = false; };
$('#help-close').onclick = () => { $('#help').hidden = true; };
$('#btn-back').onclick = () => start('title');
$('#btn-lobby-cancel').onclick = () => start('title');
$('#btn-exit').onclick = () => start('title');
$('#btn-rematch').onclick = () => {
  if (brawl) engine.rematch();
  else engine.players.forEach(p => p && engine.handle(p.id, 'rematch'));
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
  const charging = state && state.phase === 'charge' && ctrl && state.players[ctrl.slot]?.inRound;
  scene.setCharge(charging ? ctrl.slot : -1, charging ? ctrl.localSpin() : null);
  scene.render(dt);
  updateHud();
  const humOn = mode !== 'title' && snap && state && ['throw', 'fight'].includes(state.phase);
  // Eight hums at full level would drown everything else out.
  const level = Math.min(1, 2 / Math.max(2, snap ? snap.tops.length : 2));
  (snap ? snap.tops : []).forEach((tp, i) => audio.hum(i, humOn && tp.alive && tp.launched ? tp.spin : 0, humOn ? tp.wobble : 0, level));
}
// ?demo runs a CPU vs CPU match with the full HUD (for trailers and showcase screens).
// ?practice jumps straight into practice vs CPU.
const q = new URLSearchParams(location.search);
addEventListener('pagehide', () => { if (net) net.close('roomClosed', {}); });
start(q.has('demo') ? 'demo' : q.has('practice') ? 'practice' : 'title');
requestAnimationFrame(frame);
