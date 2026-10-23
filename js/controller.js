// One player's controls and screens: pick, spin (draw circles), throw (flick/swipe), fight (steer + power).
// mode 'phone' uses touch + motion sensors; mode 'desktop' uses mouse + keyboard (practice on PC).
import { CHARACTERS, TOPS, PLAYER_COLORS, STAT_LABELS, byId } from './data.js';
import { toWorld, BOOST_CD } from './sim.js';
import { CircleTracker, SPIN_SECONDS, readSwipe, Motion } from './input.js';
import { WIN_ROUNDS } from './engine.js';
import { audio } from './audio.js';

const pct = v => Math.round(v * 100) + '%';
const REASON = {
  fall: 'Natumba! The trumpo toppled over.',
  out: 'Labas! Knocked out of the circle.',
  time: 'Time! The faster spinner wins.',
  draw: 'Tabla! Both fell together. Replay the round.',
};

export function topIcon(topId, size = 56) {
  const t = byId(TOPS, topId);
  return `<div class="top-icon" style="width:${size}px;height:${size}px;--c1:${t.colors[0]};--c2:${t.colors[1]}"></div>`;
}

export function charIcon(charId, size = 56) {
  const c = byId(CHARACTERS, charId);
  return `<div class="char-icon" style="width:${size}px;height:${size}px;background:${c.color};font-size:${size * 0.55}px">${c.emoji}</div>`;
}

const statBars = t => ['str', 'lon', 'sta'].map(k =>
  `<div class="stat"><span>${STAT_LABELS[k]}</span><i>${'<b></b>'.repeat(t[k])}${'<b class="off"></b>'.repeat(5 - t[k])}</i></div>`).join('');

export function createController(root, { mode = 'phone', send, myId, sounds = mode === 'phone' }) {
  const phone = mode === 'phone';
  const motion = new Motion();
  let st = null, slot = -1, key = '', cleanup = null, deadline = 0;
  let sel = { char: null, top: null };
  let lastPhase = '';
  const keys = new Set();
  let joy = null; // active touch joystick vector
  let lastSteer = [0, 0], lastSteerAt = 0;
  let inverted = false; // Bakunawa eclipse, from the latest snapshot

  root.classList.add('ctrl', phone ? 'phone' : 'desktop');

  const me = () => st && st.players[slot];
  const opp = () => st && st.players[1 - slot];
  const remaining = () => Math.max(0, (deadline - performance.now()) / 1000);

  function show(k, html, init) {
    if (k === key) return false;
    if (cleanup) cleanup();
    cleanup = null;
    key = k;
    root.innerHTML = html;
    root.dataset.view = k;
    if (init) cleanup = init() || null;
    return true;
  }

  // Swipeable trumpo picker: big trumpo in the middle, smaller neighbours, arrows on both sides.
  function carousel(el, startId, onChange) {
    const n = TOPS.length, at = k => TOPS[((k % n) + n) % n];
    let i = Math.max(0, TOPS.findIndex(t => t.id === startId));
    el.innerHTML = `
      <div class="carousel">
        <button class="car-arrow" data-d="-1" aria-label="Previous trumpo">◀</button>
        <div class="car-stage"></div>
        <button class="car-arrow" data-d="1" aria-label="Next trumpo">▶</button>
      </div>
      <div class="car-dots"></div>
      <div class="car-info"></div>`;
    const stage = el.querySelector('.car-stage');
    function render() {
      const t = at(i), strong = TOPS.find(x => x.id === t.strong);
      stage.innerHTML = `<div class="car-side" data-d="-1">${topIcon(at(i - 1).id, 52)}</div>
        <div class="car-main">${topIcon(t.id, 124)}</div>
        <div class="car-side" data-d="1">${topIcon(at(i + 1).id, 52)}</div>`;
      el.querySelector('.car-dots').innerHTML = TOPS.map((x, k) => `<i class="${x === t ? 'on' : ''}"></i>`).join('');
      el.querySelector('.car-info').innerHTML = `<b class="car-name">${t.name}</b><small>${t.power}</small>
        ${statBars(t)}<p>${t.desc}</p>${strong ? `<p class="car-strong">Strong against <b>${strong.name}</b></p>` : ''}`;
    }
    function move(d) { i += d; render(); if (sounds) audio.click(); onChange(at(i).id); }
    el.querySelectorAll('.car-arrow').forEach(b => { b.onclick = () => move(+b.dataset.d); });
    let x0 = null, swiped = false;
    stage.addEventListener('pointerdown', e => { x0 = e.clientX; swiped = false; });
    stage.addEventListener('pointerup', e => {
      if (x0 != null && Math.abs(e.clientX - x0) > 40) { swiped = true; move(e.clientX < x0 ? 1 : -1); }
      x0 = null;
    });
    stage.addEventListener('click', e => {
      const side = e.target.closest('.car-side');
      if (side && !swiped) move(+side.dataset.d);
    });
    render();
    return { get id() { return at(i).id; } };
  }

  // ---------- views ----------
  function viewLobby() {
    show('lobby', `
      <div class="panel center">
        <div class="badge" style="background:${PLAYER_COLORS[slot]}">Player ${slot + 1}</div>
        <h2>Waiting for your opponent…</h2>
        ${howTo()}
      </div>`);
  }

  function howTo() {
    return `<ol class="howto">
      <li><b>Pick</b> a player and a trumpo. Each trumpo has its own stats and a mythic power.</li>
      <li><b>Paikot!</b> Draw fast circles on the ring. Faster = more spin, neater = steadier.</li>
      <li><b>Bitaw!</b> ${phone ? 'Tilt to aim, then flick your phone forward like casting a line.' : 'Drag the mouse upward and let go, fast.'}</li>
      <li><b>Laban!</b> ${phone ? 'Tilt to steer' : 'WASD / arrows to steer'}, ${phone ? 'tap Dash' : 'Shift to dash'} for a quick burst (costs a little spin), tap the power when it’s full. Behind on spin? Dash into your rival to steal some back.</li>
      <li><b>Lost a round?</b> You may switch trumpo to counter your rival. The round winner stays locked. Last trumpo spinning inside the circle wins.</li>
    </ol>`;
  }

  function viewPick() {
    const p = me();
    if (!sel.char) sel = { char: p.char, top: p.top };
    if (p.picked) {
      show('pickWait', `
        <div class="panel center">
          <div class="vs-row">${charIcon(p.char, 72)}${topIcon(p.top, 72)}</div>
          <h2>Ready!</h2><p class="muted">Waiting for ${opp() ? opp().name : 'opponent'}…</p>
          <button class="btn ghost" data-act="unready">Change pick</button>
        </div>`, () => {
        root.querySelector('[data-act=unready]').onclick = () => send('pick', { ...sel, ready: false });
      });
      return;
    }
    const fresh = show('pick', `
      <div class="panel pick">
        <h2>Pick your player</h2>
        <div class="cards" data-list="char">${CHARACTERS.map(c => `
          <button class="card" data-id="${c.id}">
            ${charIcon(c.id, 54)}
            <div class="card-body"><b>${c.name}</b><small>${c.title}</small><p>${c.blurb}</p></div>
          </button>`).join('')}</div>
        <h2>Pick your trumpo</h2>
        <div data-car></div>
        <button class="btn big" data-act="ready">Ready!</button>
      </div>`, () => {
      root.querySelectorAll('[data-list] .card').forEach(b => {
        b.onclick = () => {
          const list = b.parentElement.dataset.list;
          sel[list] = b.dataset.id;
          if (sounds) audio.click();
          mark();
          send('pick', { ...sel, ready: false });
        };
      });
      carousel(root.querySelector('[data-car]'), sel.top, id => { sel.top = id; send('pick', { ...sel, ready: false }); });
      root.querySelector('[data-act=ready]').onclick = () => { if (sounds) audio.click(); send('pick', { ...sel, ready: true }); };
    });
    if (fresh) mark();
    function mark() {
      root.querySelectorAll('[data-list] .card').forEach(b => b.classList.toggle('on', sel[b.parentElement.dataset.list] === b.dataset.id));
    }
  }

  function viewVs() {
    const [a, b] = st.players;
    show('vs', `
      <div class="panel center vs">
        <div class="vs-side" style="--pc:${PLAYER_COLORS[0]}">${charIcon(a.char, 80)}<b>${a.name}</b>${topIcon(a.top, 48)}</div>
        <div class="vs-mid">VS</div>
        <div class="vs-side" style="--pc:${PLAYER_COLORS[1]}">${charIcon(b.char, 80)}<b>${b.name}</b>${topIcon(b.top, 48)}</div>
      </div>`);
  }

  function viewSpin() {
    const p = me();
    if (p.spun) {
      show('spunWait', `
        <div class="panel center">
          <h2>Ang ikot! Spin locked in</h2>
          <div class="meters big">
            <div class="meter"><span>Lakas · spin power</span><i><b style="width:${pct(p.spinPower)}"></b></i><em>${pct(p.spinPower)}</em></div>
            <div class="meter"><span>Tatag · steadiness</span><i><b style="width:${pct(p.steadiness)}"></b></i><em>${pct(p.steadiness)}</em></div>
          </div>
          <p class="muted">Next: <b>Bitaw!</b> ${phone ? 'tilt to aim and flick your phone forward.' : 'drag the mouse up and let go.'}</p>
          <p class="muted">Waiting for ${opp().name}… <span data-timer></span></p>
        </div>`);
      return;
    }
    show('spin', `
      <div class="panel spin">
        <div class="spin-head"><h2>PAIKOT!</h2><p>Draw fast circles <b>on the ring</b> for ${SPIN_SECONDS} seconds. Starts at your first touch.</p></div>
        <canvas class="pad"></canvas>
        <div class="meters">
          <div class="meter"><span>Lakas · spin power</span><i><b data-m="power"></b></i></div>
          <div class="meter"><span>Tatag · steadiness</span><i><b data-m="stab"></b></i></div>
        </div>
        <p class="muted small">Finish spinning within <span data-timer></span></p>
      </div>`, () => spinPad(root.querySelector('.pad')));
  }

  function spinPad(cv) {
    const g = cv.getContext('2d');
    let tracker = null, t0 = 0, done = false, trail = [], raf = 0, lastProg = 0, w = 0, h = 0, R = 0;
    const size = () => {
      const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
      w = r.width; h = r.height; R = Math.min(w, h) * 0.36;
      cv.width = w * dpr; cv.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const down = e => {
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      if (!tracker) { tracker = new CircleTracker(w / 2, h / 2, R); t0 = performance.now(); }
      move(e);
    };
    const move = e => {
      if (!tracker || done || (e.pointerType === 'mouse' && !e.buttons)) return;
      const [x, y] = pos(e);
      const now = performance.now();
      tracker.add(x, y, now);
      trail.push([x, y, now]);
    };
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const el = tracker ? (now - t0) / 1000 : 0;
      const res = tracker ? tracker.result() : { power: 0, stability: 0, laps: 0 };
      g.clearRect(0, 0, w, h);
      // Guide ring and its tolerance band.
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = R * 0.4;
      g.beginPath(); g.arc(w / 2, h / 2, R, 0, 7); g.stroke();
      g.strokeStyle = PLAYER_COLORS[slot]; g.lineWidth = 4; g.setLineDash([10, 10]);
      g.beginPath(); g.arc(w / 2, h / 2, R, 0, 7); g.stroke(); g.setLineDash([]);
      // Time left as an arc.
      if (tracker) {
        g.strokeStyle = '#ffd23f'; g.lineWidth = 8; g.lineCap = 'round';
        g.beginPath(); g.arc(w / 2, h / 2, R * 1.32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, 1 - el / SPIN_SECONDS)); g.stroke();
      }
      trail = trail.filter(p => now - p[2] < 350);
      g.lineWidth = 10; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 1; i < trail.length; i++) {
        g.strokeStyle = `rgba(255,210,63,${(1 - (now - trail[i][2]) / 350).toFixed(2)})`;
        g.beginPath(); g.moveTo(trail[i - 1][0], trail[i - 1][1]); g.lineTo(trail[i][0], trail[i][1]); g.stroke();
      }
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `bold ${Math.round(R * 0.45)}px Bungee, sans-serif`;
      g.fillText(tracker ? res.laps.toFixed(1) : '↻', w / 2, h / 2 - R * 0.08);
      g.font = `${Math.round(R * 0.14)}px Nunito, sans-serif`;
      g.fillText(tracker ? 'ikot (laps)' : 'touch the ring', w / 2, h / 2 + R * 0.28);
      root.querySelector('[data-m=power]').style.width = pct(res.power);
      root.querySelector('[data-m=stab]').style.width = pct(res.stability);
      if (sounds && tracker) audio.whir(done ? 0 : Math.min(1, tracker.speed(now) / 3));
      if (tracker && !done && now - lastProg > 200) { lastProg = now; send('prog', { laps: Math.round(res.laps * 10) / 10 }); }
      if (tracker && !done && el >= SPIN_SECONDS) {
        done = true;
        if (sounds) audio.whir(0);
        send('spin', { power: res.power, stability: res.stability });
      }
    };
    frame();
    addEventListener('resize', size);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', size); if (sounds) audio.whir(0); };
  }

  function viewThrow() {
    const p = me();
    if (p.thrown) {
      show('thrown', `<div class="hud-msg"><h2>Bitaw!</h2><p>Watch your trumpo land…</p></div>`);
      return;
    }
    show('throw', `
      <div class="panel throw clearish">
        <div class="count" data-count></div>
        <h2 data-title>Get ready…</h2>
        ${phone ? `<div class="aim"><div class="aim-arrow" style="--pc:${PLAYER_COLORS[slot]}"></div></div>
          <p>Hold your phone like a trumpo. <b>Tilt</b> left/right to aim, then <b>flick it forward</b>.</p>
          <p class="muted small">No motion sensor? Swipe up fast on the screen instead.</p>`
        : `<div class="aim"><div class="aim-arrow" style="--pc:${PLAYER_COLORS[slot]}"></div></div>
          <p><b>Drag the mouse upward and let go</b>. Faster = harder throw. The drag direction aims.</p>`}
      </div>`, () => {
      motion.calibrate();
      const arrow = root.querySelector('.aim-arrow');
      let raf = 0, sw = null, swipeAim = 0;
      const live = () => st.phase === 'throw' && !me().thrown;
      const doThrow = t => {
        if (!live()) return;
        if (sounds) audio.dash();
        send('throw', t);
        if (navigator.vibrate) navigator.vibrate(60);
      };
      motion.onFlick = doThrow;
      const pd = e => { sw = [e.clientX, e.clientY, performance.now()]; };
      const pm = e => {
        if (!sw) return;
        swipeAim = Math.max(-0.6, Math.min(0.6, Math.atan2(e.clientX - sw[0], sw[1] - e.clientY)));
      };
      const pu = e => {
        if (!sw) return;
        const t = readSwipe(sw[0], sw[1], sw[2], e.clientX, e.clientY, performance.now());
        sw = null;
        if (t) doThrow(t);
      };
      root.addEventListener('pointerdown', pd);
      root.addEventListener('pointermove', pm);
      root.addEventListener('pointerup', pu);
      const frame = () => {
        raf = requestAnimationFrame(frame);
        const aim = sw || !motion.hasTilt ? swipeAim : motion.aim;
        arrow.style.transform = `rotate(${aim}rad)`;
        const title = root.querySelector('[data-title]'), count = root.querySelector('[data-count]');
        if (st.phase === 'countdown') {
          const n = Math.ceil(remaining());
          count.textContent = ['', 'Isa', 'Dalawa', 'Tatlo'][4 - Math.min(3, Math.max(1, n))];
          title.textContent = 'Get ready…';
        } else {
          count.textContent = 'BITAW!';
          title.textContent = phone ? 'Flick now!' : 'Swipe up now!';
        }
      };
      frame();
      return () => {
        cancelAnimationFrame(raf);
        motion.onFlick = null;
        root.removeEventListener('pointerdown', pd);
        root.removeEventListener('pointermove', pm);
        root.removeEventListener('pointerup', pu);
      };
    });
  }

  function viewFight() {
    const p = me(), o = opp();
    const t = byId(TOPS, p.top);
    show('fight', `
      <div class="fight">
        ${phone ? `<div class="bars">
          <div class="bar" style="--pc:${PLAYER_COLORS[slot]}"><span>${p.name}</span><i><b data-b="me"></b></i></div>
          <div class="bar" style="--pc:${PLAYER_COLORS[1 - slot]}"><span>${o.name}</span><i><b data-b="opp"></b></i></div>
        </div>` : ''}
        <div class="warn" data-warn hidden>Bakunawa! Your steering is reversed!</div>
        ${phone ? `<div class="joy"><div class="joy-knob"></div><span>${motion.hasTilt ? 'Tilt to steer · or drag here' : 'Drag here to steer'}</span></div>
          <button class="btn ghost small center-btn" data-act="center">Re-center tilt</button>`
        : `<div class="keys-hint">WASD / arrows steer · <b>Shift</b> dash · <b>Space</b> power · steering and dashing cost a little spin</div>`}
        <button class="dash" data-act="dash">
          <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" class="track"/><circle cx="50" cy="50" r="45" class="fill" data-dring/></svg>
          <span><b>DASH</b></span>
        </button>
        <button class="power" data-act="power" style="--c1:${t.colors[0]};--c2:${t.colors[1]}">
          <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" class="track"/><circle cx="50" cy="50" r="45" class="fill" data-ring/></svg>
          <span><b>${t.power}</b><small data-ready>charging…</small></span>
        </button>
      </div>`, () => {
      motion.calibrate();
      const btn = root.querySelector('[data-act=power]');
      btn.onclick = () => send('ability', {});
      root.querySelector('[data-act=dash]').addEventListener('pointerdown', e => { e.preventDefault(); send('boost', {}); });
      const c = root.querySelector('[data-act=center]');
      if (c) c.onclick = () => motion.calibrate();
      const pad = root.querySelector('.joy');
      if (pad) {
        const knob = pad.querySelector('.joy-knob');
        let origin = null;
        pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); origin = [e.clientX, e.clientY]; joy = [0, 0]; });
        pad.addEventListener('pointermove', e => {
          if (!origin) return;
          let x = (e.clientX - origin[0]) / 60, y = -(e.clientY - origin[1]) / 60;
          const m = Math.hypot(x, y);
          if (m > 1) { x /= m; y /= m; }
          joy = [x, y];
          knob.style.transform = `translate(${x * 40}px, ${-y * 40}px)`;
        });
        const end = () => { origin = null; joy = null; knob.style.transform = ''; };
        pad.addEventListener('pointerup', end);
        pad.addEventListener('pointercancel', end);
      }
      const timer = setInterval(sendSteer, 66);
      return () => { clearInterval(timer); joy = null; send('steer', { x: 0, y: 0 }); };
    });
  }

  function readSteer() {
    if (joy) return joy;
    if (!phone) {
      const x = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0), y = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0);
      const m = Math.hypot(x, y) || 1;
      return [x / m, y / m];
    }
    return motion.steer();
  }

  // Steering in world space straight from local input, so the guide arrow needs no host round trip.
  function localSteer() {
    if (key !== 'fight' || slot < 0) return null;
    const [x, y] = readSteer(), k = inverted ? -1 : 1;
    return toWorld(slot, x * k, y * k);
  }

  function sendSteer() {
    const v = readSteer();
    const now = performance.now();
    if (Math.abs(v[0] - lastSteer[0]) + Math.abs(v[1] - lastSteer[1]) > 0.04 || now - lastSteerAt > 800) {
      lastSteer = v; lastSteerAt = now;
      send('steer', { x: Math.round(v[0] * 100) / 100, y: Math.round(v[1] * 100) / 100 });
    }
  }

  function viewRoundEnd() {
    const r = st.result || {};
    const won = r.winner === slot, draw = r.winner < 0;
    show('roundEnd', `
      <div class="hud-msg result ${draw ? '' : won ? 'win' : 'lose'}">
        <h2>${draw ? 'Tabla!' : won ? 'Panalo ka!' : 'Talo ka!'}</h2>
        <p>${REASON[r.reason] || ''}</p>
        <p class="score">${st.scores[slot]} – ${st.scores[1 - slot]} <small>(first to ${WIN_ROUNDS})</small></p>
      </div>`);
  }

  function viewCounter() {
    const loser = st.result && st.result.winner >= 0 ? 1 - st.result.winner : -1;
    const o = opp(), ot = byId(TOPS, o.top);
    if (slot !== loser) {
      show('counterWait', `
        <div class="hud-msg">
          <h2>Rival is picking a counter…</h2>
          <p>Round winners stay locked: you keep <b>${byId(TOPS, me().top).name}</b>.</p>
          <p class="score" data-timer></p>
        </div>`);
      return;
    }
    const cur = me().top;
    show('counter', `
      <div class="panel center counter">
        <h2>Pick a counter <span class="timer" data-timer></span></h2>
        <p class="muted small">You lost the round, so you may switch. ${o.name} is locked with <b>${ot.name}</b>.</p>
        <div data-car></div>
        <button class="btn big" data-act="confirm"></button>
      </div>`, () => {
      const btn = root.querySelector('[data-act=confirm]');
      const label = id => { btn.textContent = id === cur ? `Keep ${byId(TOPS, cur).name}` : `Switch to ${byId(TOPS, id).name}`; };
      const car = carousel(root.querySelector('[data-car]'), cur, label);
      label(cur);
      btn.onclick = () => { if (sounds) audio.click(); btn.disabled = true; send('counter', { top: car.id }); };
    });
  }

  function viewMatchEnd() {
    const champ = st.result && st.result.champion === slot;
    const p = me();
    show(p.rematch ? 'rematchWait' : 'matchEnd', `
      <div class="panel center result ${champ ? 'win' : 'lose'}">
        <h1>${champ ? 'KAMPEON!' : 'Talo… next time!'}</h1>
        <p class="score">${st.scores[slot]} – ${st.scores[1 - slot]}</p>
        ${p.rematch ? `<p class="muted">Waiting for ${opp().name}…</p>`
        : `<button class="btn big" data-act="rematch">Rematch</button>`}
      </div>`, () => {
      const b = root.querySelector('[data-act=rematch]');
      if (b) b.onclick = () => { if (sounds) audio.click(); send('rematch', {}); };
    });
  }

  // ---------- state ----------
  function setState(state) {
    st = state;
    slot = state.players.findIndex(p => p && p.id === myId);
    deadline = performance.now() + state.timer * 1000;
    if (slot < 0) return;
    if (sounds && state.phase !== lastPhase) {
      if (state.phase === 'throw') audio.beep(true);
      if (state.phase === 'roundEnd' && state.result && state.result.winner === slot) audio.win();
    }
    lastPhase = state.phase;
    switch (state.phase) {
      case 'lobby': viewLobby(); break;
      case 'pick': viewPick(); break;
      case 'vs': viewVs(); break;
      case 'charge': viewSpin(); break;
      case 'countdown': case 'throw':
        viewThrow();
        break;
      case 'fight': viewFight(); break;
      case 'roundEnd': viewRoundEnd(); break;
      case 'counter': viewCounter(); break;
      case 'matchEnd': viewMatchEnd(); break;
    }
  }

  function onSnap(s) {
    if (key !== 'fight' || slot < 0) return;
    const a = s.tops[slot], b = s.tops[1 - slot];
    const bm = root.querySelector('[data-b=me]'), bo = root.querySelector('[data-b=opp]');
    if (bm) bm.style.width = pct(a.spin);
    if (bo) bo.style.width = pct(b.spin);
    const ring = root.querySelector('[data-ring]');
    ring.style.strokeDashoffset = String(283 * (1 - a.charge));
    const ready = a.charge >= 1 && a.alive;
    root.querySelector('.power').classList.toggle('ready', ready);
    root.querySelector('[data-ready]').textContent = ready ? 'TAP!' : 'charging…';
    root.querySelector('[data-warn]').hidden = !a.invert;
    inverted = a.invert;
    root.querySelector('[data-dring]').style.strokeDashoffset = String(283 * (a.boostCd / BOOST_CD));
    root.querySelector('.dash').classList.toggle('ready', a.boostCd <= 0 && a.alive);
  }

  // Countdown beeps and timers shown in any view.
  let lastBeep = 0;
  setInterval(() => {
    const t = root.querySelector('[data-timer]');
    if (t) t.textContent = Math.ceil(remaining()) + 's';
    if (sounds && st && st.phase === 'countdown') {
      const n = Math.ceil(remaining());
      if (n !== lastBeep && n > 0 && n <= 3) { lastBeep = n; audio.beep(false); }
    } else lastBeep = 0;
  }, 100);

  if (!phone) {
    const map = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
    addEventListener('keydown', e => {
      if (map[e.code]) { keys.add(map[e.code]); e.preventDefault(); }
      if ((e.code === 'Space' || e.code === 'KeyE') && key === 'fight') { e.preventDefault(); send('ability', {}); }
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyQ') && key === 'fight' && !e.repeat) { e.preventDefault(); send('boost', {}); }
    });
    addEventListener('keyup', e => { if (map[e.code]) keys.delete(map[e.code]); });
  }

  return {
    setState, onSnap, localSteer,
    get slot() { return slot; },
    destroy() { if (cleanup) cleanup(); cleanup = null; key = ''; root.innerHTML = ''; },
  };
}
