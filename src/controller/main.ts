import './controller.css';
import { slotPos, T_ALIVE, T_CHARGE, T_INVERT, T_LAUNCHED, T_SPIN, T_X, T_Z, type ClientMsg, type PlayerInfo, type Snapshot, type TopSnap } from '../game/RoundManager';
import { CircleTracker, Motion, readSwipe, requestMotion, SPIN_SECONDS } from '../input/gestures';
import { PhoneNet } from '../net/Net';
import { topById } from '../sim/data';
import { RING_RADIUS } from '../sim/TrompoSim';
import { QUICK_CHAT } from '../systems/AudioSystem';
import { PLAYER_COLORS } from '../ui/colors';

// Phone controller: a paired phone becomes one player's trompo. Gestures come
// from paikutan (circle-draw spin, tilt aim + flick throw, tilt steer, power
// tap). Messages go straight to the host, authenticated by the pairing key.

const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s)!;
const params = new URLSearchParams(location.search);
const room = (params.get('room') ?? '').toUpperCase();
const pid = Number(params.get('pid'));
const key = params.get('key') ?? '';
const view = $('#view');
const motion = new Motion();
let net: PhoneNet | null = null;
let snap: Snapshot | null = null;
let shown = '';
let cleanup: (() => void) | null = null;
let lastSnapAt = 0;

const send = (msg: ClientMsg) => net?.send(msg);
const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
const me = (): PlayerInfo | undefined => snap?.players.find((p) => p.id === pid);
const myTop = (): TopSnap | undefined => snap?.tops.find((t) => t[0] === pid);
const buzz = (ms: number | number[]) => navigator.vibrate?.(ms);

function show(name: string, html: string, init?: () => (() => void) | void): void {
  if (shown === name) return;
  shown = name;
  cleanup?.();
  cleanup = null;
  view.innerHTML = html;
  cleanup = init?.() ?? null;
}

function chatButtons(): string {
  return `<div class="chat">${QUICK_CHAT.map((t, i) => `<button class="pill" data-chat="${i}">${t}</button>`).join('')}</div>`;
}

function bindChat(): void {
  view.querySelectorAll<HTMLElement>('[data-chat]').forEach((b) => (b.onclick = () => send({ t: 'chat', i: Number(b.dataset.chat) })));
}

function start(): void {
  if (!room || !Number.isFinite(pid) || !key) {
    show('bad', `<div class="card"><h2>Bad link</h2><p>Scan the QR on your screen again (📱 button).</p></div>`);
    return;
  }
  show(
    'start',
    `<div class="card center">
      <h2>You are the trompo!</h2>
      <p>Room <b>${room}</b>. Tap to connect. Allow the motion sensor for tilt and flick.</p>
      <button class="btn big" id="go">Connect</button>
      <p id="msg" class="small"></p>
    </div>`,
    () => {
      $('#go').onclick = async () => {
        $('#go').setAttribute('disabled', '');
        $('#msg').textContent = 'Connecting…';
        const motionOk = await requestMotion();
        try {
          await (navigator as Navigator & { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request('screen');
        } catch {
          // Not supported: fine.
        }
        try {
          net = await PhoneNet.connect(room, pid, key);
        } catch (err) {
          $('#go').removeAttribute('disabled');
          $('#msg').textContent = `Couldn't connect (${(err as Error).message}).`;
          return;
        }
        net.onSnap = (s) => {
          snap = s;
          lastSnapAt = performance.now();
          render();
        };
        net.onEvents = (events) => {
          for (const e of events) {
            if (e.type === 'hit' && (e.a === pid || e.b === pid)) buzz(Math.round(30 + e.i * 60));
            if ((e.type === 'out' || e.type === 'fall') && e.id === pid) buzz(300);
            if (e.type === 'ko' && e.id === pid) buzz([60, 40, 60]);
            if (e.type === 'coin' && e.id === pid) buzz([20, 30, 20]);
            if (e.type === 'windWarn') buzz([80, 60, 80]);
            if (e.type === 'mango') {
              const t = myTop();
              if (t && t[T_ALIVE] && Math.hypot(t[T_X] - e.x, t[T_Z] - e.z) < 0.6) buzz(120);
            }
            if (e.type === 'roundWin' && e.id === pid) buzz(150);
          }
        };
        if (!motionOk) $('#msg').textContent = 'No motion sensor: using swipe and joystick instead.';
        show('wait', `<div class="card center"><h2>Waiting for the host…</h2></div>`);
        setInterval(() => {
          if (performance.now() - lastSnapAt > 6000) show('lost', `<div class="card center"><h2>Connection lost</h2><p>Is the game still open on the screen?</p></div>`);
        }, 1000);
      };
    },
  );
}

function render(): void {
  const p = me();
  if (!snap || !p) {
    show('notyet', `<div class="card center"><h2>Can't find you yet…</h2><p>Is the game open on your screen?</p></div>`);
    return;
  }
  const who = $('#who');
  who.textContent = p.name;
  who.style.borderColor = PLAYER_COLORS[p.color];
  const seated = snap.seats.includes(pid);
  const top = myTop();
  switch (snap.phase) {
    case 'charge':
      if (!seated) return idle('Watching this one…');
      return p.spun ? spunView(p) : spinView();
    case 'countdown':
    case 'throw':
      if (!seated) return idle('Watching…');
      return p.thrown ? idle('Thrown! Watch your trompo…', 'thrown') : throwView();
    case 'fight':
      if (seated && top && top[T_LAUNCHED] && top[T_ALIVE]) return fightView(p);
      if (seated && top && top[T_LAUNCHED]) return outView();
      return idle(seated ? 'You lost this round. Taunt them!' : 'Watching…', 'out');
    case 'roundEnd':
      return idle(snap.winner === pid ? 'YOU WIN!' : 'Round over…', 'roundEnd');
    case 'podium':
      return idle('Time to go home!', 'podium');
    default:
      return idle(`Connected! Trompo: ${topById(p.power).name}. Step into the circle on screen to play.`, 'hub');
  }
}

function idle(text: string, name = 'idle'): void {
  show(`${name}:${text}`, `<div class="card center"><h2>${text}</h2></div>${chatButtons()}`, bindChat);
}

function spunView(p: PlayerInfo): void {
  show(
    'spun',
    `<div class="card center">
      <h2>Nice spin!</h2>
      <div class="meter"><span>Power</span><i><b style="width:${pct(p.spinPower)}"></b></i></div>
      <div class="meter"><span>Balance</span><i><b style="width:${pct(p.steadiness)}"></b></i></div>
      <p class="small">Next: <b>Throw!</b> Tilt to aim, flick forward.</p>
    </div>`,
  );
}

/** PAIKOT: draw fast circles on the ring for SPIN_SECONDS (paikutan's spinPad). */
function spinView(): void {
  show(
    'spin',
    `<div class="card spin">
      <h2>SPIN!</h2>
      <p class="small">Draw fast circles <b>on the ring</b> for ${SPIN_SECONDS} seconds.</p>
      <canvas class="pad"></canvas>
      <div class="meter"><span>Power</span><i><b data-m="power"></b></i></div>
      <div class="meter"><span>Balance</span><i><b data-m="stab"></b></i></div>
      <p class="small">Neat circles = balance: you wobble less when hit.</p>
    </div>`,
    () => {
      const cv = $<HTMLCanvasElement>('.pad', view);
      const g = cv.getContext('2d')!;
      let tracker: CircleTracker | null = null;
      let t0 = 0;
      let done = false;
      let raf = 0;
      let trail: [number, number, number][] = [];
      let lastLap = 0;
      const rect = () => cv.getBoundingClientRect();
      const size = () => {
        const r = rect();
        const dpr = window.devicePixelRatio || 1;
        cv.width = r.width * dpr;
        cv.height = r.height * dpr;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      size();
      const pos = (e: PointerEvent) => [e.clientX - rect().left, e.clientY - rect().top] as const;
      cv.onpointerdown = (e) => {
        e.preventDefault();
        cv.setPointerCapture(e.pointerId);
        if (!tracker) {
          const r = rect();
          tracker = new CircleTracker(r.width / 2, r.height / 2, Math.min(r.width, r.height) * 0.36);
          t0 = performance.now();
        }
        move(e);
      };
      const move = (e: PointerEvent) => {
        if (!tracker || done) return;
        const [x, y] = pos(e);
        tracker.add(x, y, performance.now());
        trail.push([x, y, performance.now()]);
      };
      cv.onpointermove = move;
      const frame = () => {
        raf = requestAnimationFrame(frame);
        const r = rect();
        const w = r.width;
        const h = r.height;
        const R = Math.min(w, h) * 0.36;
        const now = performance.now();
        const el = tracker ? (now - t0) / 1000 : 0;
        const res = tracker ? tracker.result() : { power: 0, stability: 0, laps: 0 };
        g.clearRect(0, 0, w, h);
        g.strokeStyle = 'rgba(43,29,18,0.12)';
        g.lineWidth = R * 0.4;
        g.beginPath();
        g.arc(w / 2, h / 2, R, 0, 7);
        g.stroke();
        g.strokeStyle = '#c0392b';
        g.lineWidth = 4;
        g.setLineDash([10, 10]);
        g.beginPath();
        g.arc(w / 2, h / 2, R, 0, 7);
        g.stroke();
        g.setLineDash([]);
        if (tracker) {
          g.strokeStyle = '#f2c230';
          g.lineWidth = 8;
          g.lineCap = 'round';
          g.beginPath();
          g.arc(w / 2, h / 2, R * 1.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, 1 - el / SPIN_SECONDS));
          g.stroke();
        }
        trail = trail.filter((t) => now - t[2] < 350);
        g.lineWidth = 12;
        g.lineCap = 'round';
        for (let i = 1; i < trail.length; i += 1) {
          g.strokeStyle = `rgba(192,57,43,${(1 - (now - trail[i][2]) / 350).toFixed(2)})`;
          g.beginPath();
          g.moveTo(trail[i - 1][0], trail[i - 1][1]);
          g.lineTo(trail[i][0], trail[i][1]);
          g.stroke();
        }
        g.fillStyle = '#2b1d12';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `${Math.round(R * 0.45)}px "Lilita One", Impact, sans-serif`;
        g.fillText(tracker ? res.laps.toFixed(1) : '↻', w / 2, h / 2);
        $('[data-m=power]', view).style.width = pct(res.power);
        $('[data-m=stab]', view).style.width = pct(res.stability);
        if (Math.floor(res.laps) > lastLap) {
          lastLap = Math.floor(res.laps);
          buzz(12);
        }
        if (tracker && !done && el >= SPIN_SECONDS) {
          done = true;
          send({ t: 'spin', power: res.power, stability: res.stability });
          buzz(80);
        }
      };
      frame();
      return () => cancelAnimationFrame(raf);
    },
  );
}

/** BITAW: tilt to aim, flick forward (or swipe up) to throw. */
function throwView(): void {
  show(
    'throw',
    `<div class="card center throw">
      <div class="count" data-count>One</div>
      <div class="aim"><i data-arrow></i></div>
      <p>Hold it like a trompo. <b>Tilt</b> to aim, then <b>flick it forward</b>.</p>
      <p class="small">No motion sensor? Swipe up fast instead.</p>
    </div>`,
    () => {
      motion.calibrate();
      let raf = 0;
      let sw: [number, number, number] | null = null;
      let swipeAim = 0;
      const live = () => snap?.phase === 'throw' && !me()?.thrown;
      const doThrow = (t: { power: number; angle: number }) => {
        if (!live()) return;
        send({ t: 'throw', power: t.power, angle: t.angle });
        buzz(60);
      };
      motion.onFlick = doThrow;
      view.onpointerdown = (e) => (sw = [e.clientX, e.clientY, performance.now()]);
      view.onpointermove = (e) => {
        if (sw) swipeAim = Math.max(-0.6, Math.min(0.6, Math.atan2(e.clientX - sw[0], sw[1] - e.clientY)));
      };
      view.onpointerup = (e) => {
        if (!sw) return;
        const t = readSwipe(sw[0], sw[1], sw[2], e.clientX, e.clientY, performance.now());
        sw = null;
        if (t) doThrow(t);
      };
      const frame = () => {
        raf = requestAnimationFrame(frame);
        const aim = sw || !motion.hasTilt ? swipeAim : motion.aim;
        $('[data-arrow]', view).style.rotate = `${aim}rad`;
        const left = snap?.left ?? 0;
        $('[data-count]', view).textContent =
          snap?.phase === 'countdown' ? (['Three!', 'Three!', 'Two!', 'One!'][Math.max(1, Math.min(3, Math.ceil(left)))] ?? 'One!') : 'THROW!';
      };
      frame();
      return () => {
        cancelAnimationFrame(raf);
        motion.onFlick = null;
        view.onpointerdown = view.onpointermove = view.onpointerup = null;
      };
    },
  );
}

/** LABAN: tilt (or drag the pad) to steer, tap the power when charged. */
function fightView(p: PlayerInfo): void {
  const t = topById(p.power);
  show(
    'fight',
    `<div class="fight">
      <div class="meter big"><span>Spin</span><i><b data-spin></b></i></div>
      <div class="warn" data-warn hidden>BAKUNAWA! Steering reversed!</div>
      <div class="joy"><div class="joy-knob"></div><span>${motion.hasTilt ? 'Tilt to steer · TAP = PALO · HOLD = charged PALO' : 'Drag to steer · TAP = PALO · HOLD = charged'}</span></div>
      <button class="pill" data-center>Re-center tilt</button>
      <button class="power" data-power style="--c1:${t.colors[0]};--c2:${t.colors[1]}">
        <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="track"/><circle cx="50" cy="50" r="44" class="fill" data-ring/></svg>
        <span><b>${t.name}</b><small data-ready>charging…</small></span>
      </button>
    </div>`,
    () => {
      motion.calibrate();
      let joy: [number, number] | null = null;
      let last: [number, number] = [0, 0];
      let lastAt = 0;
      $('[data-power]', view).onclick = () => {
        send({ t: 'ability' });
        buzz(40);
      };
      $('[data-center]', view).onclick = () => motion.calibrate();
      const pad = $('.joy', view);
      const knob = $('.joy-knob', view);
      let origin: [number, number] | null = null;
      let downAt = 0;
      let moved = 0;
      let wasReady = false;
      pad.onpointerdown = (e) => {
        pad.setPointerCapture(e.pointerId);
        origin = [e.clientX, e.clientY];
        downAt = performance.now();
        moved = 0;
        joy = null;
      };
      pad.onpointermove = (e) => {
        if (!origin) return;
        moved = Math.max(moved, Math.hypot(e.clientX - origin[0], e.clientY - origin[1]));
        if (moved < 12) return;
        let x = (e.clientX - origin[0]) / 60;
        let y = -(e.clientY - origin[1]) / 60;
        const m = Math.hypot(x, y);
        if (m > 1) {
          x /= m;
          y /= m;
        }
        joy = [x, y];
        knob.style.translate = `${x * 40}px ${-y * 40}px`;
      };
      // Held without dragging = charging; a quick tap stays a plain palo (same curve as desktop).
      const charge = () => {
        const held = (performance.now() - downAt) / 1000;
        return held < 0.15 ? 0 : Math.min(1, (held - 0.15) / 0.65);
      };
      let fullBuzzed = false;
      pad.onpointerup = pad.onpointercancel = (e) => {
        if (e.type === 'pointerup' && origin && moved < 12) {
          const c = charge();
          send({ t: 'palo', c: Math.round(c * 100) / 100 });
          buzz(c > 0.5 ? 60 : 25);
        }
        fullBuzzed = false;
        knob.style.scale = '';
        origin = null;
        joy = null;
        knob.style.translate = '';
      };
      const tick = () => {
        const v = joy ?? motion.steer();
        const now = performance.now();
        if (origin && moved < 12) {
          const c = charge();
          knob.style.scale = String(1 + c * 0.9);
          if (c >= 1 && !fullBuzzed) {
            fullBuzzed = true;
            buzz(30);
          }
        }
        // Only send changes (and a keep-alive), as paikutan's controller does.
        if (Math.abs(v[0] - last[0]) + Math.abs(v[1] - last[1]) > 0.06 || now - lastAt > 800) {
          last = v;
          lastAt = now;
          send({ t: 'steer', x: Math.round(v[0] * 100) / 100, y: Math.round(v[1] * 100) / 100 });
        }
        const top = myTop();
        if (top) {
          $('[data-spin]', view).style.width = pct(top[T_SPIN]);
          const charge = top[T_CHARGE];
          ($('[data-ring]', view) as unknown as SVGCircleElement).style.strokeDashoffset = String(276.5 * (1 - Math.min(1, charge)));
          $('[data-ready]', view).textContent = charge >= 1 ? 'READY! TAP IT' : 'charging…';
          $('[data-power]', view).classList.toggle('ready', charge >= 1);
          if (charge >= 1 && !wasReady) buzz([40, 60, 40]);
          wasReady = charge >= 1;
          $('[data-warn]', view).hidden = !top[T_INVERT];
        }
      };
      const timer = window.setInterval(tick, 100);
      return () => {
        clearInterval(timer);
        send({ t: 'steer', x: 0, y: 0 });
      };
    },
  );
}

/** MULTO: out of the round, tap the mini bilog to flick your tsinelas at someone. */
function outView(): void {
  show(
    'out',
    `<div class="card spin">
      <h2>You're out!</h2>
      <p class="small">Tap the circle to flick your tsinelas at someone (every 3 s).</p>
      <canvas class="pad"></canvas>
    </div>${chatButtons()}`,
    () => {
      bindChat();
      const cv = $<HTMLCanvasElement>('.pad', view);
      const g = cv.getContext('2d')!;
      let raf = 0;
      // Drawn from your seat: you're at the bottom, so "up" is away from you, like on screen.
      const frameOf = () => {
        const seat = snap ? snap.seats.indexOf(pid) : -1;
        const sp = seat >= 0 && snap ? slotPos(seat, snap.seats.length) : { x: 0, y: 1 };
        const len = Math.hypot(sp.x, sp.y) || 1;
        const r = cv.getBoundingClientRect();
        return { dx: sp.x / len, dz: sp.y / len, w: r.width, h: r.height, k: (Math.min(r.width, r.height) * 0.45) / RING_RADIUS };
      };
      cv.onpointerdown = (e) => {
        const f = frameOf();
        const r = cv.getBoundingClientRect();
        const u = (e.clientX - r.left - f.w / 2) / f.k;
        const v = (e.clientY - r.top - f.h / 2) / f.k;
        send({ t: 'flick', x: Math.round((u * f.dz + v * f.dx) * 100) / 100, z: Math.round((-u * f.dx + v * f.dz) * 100) / 100 });
        buzz(30);
      };
      const frame = () => {
        raf = requestAnimationFrame(frame);
        const f = frameOf();
        const dpr = window.devicePixelRatio || 1;
        if (cv.width !== Math.round(f.w * dpr)) {
          cv.width = Math.round(f.w * dpr);
          cv.height = Math.round(f.h * dpr);
        }
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, f.w, f.h);
        const at = (x: number, z: number) => [f.w / 2 + (x * f.dz - z * f.dx) * f.k, f.h / 2 + (x * f.dx + z * f.dz) * f.k] as const;
        g.fillStyle = '#d9b98a';
        g.beginPath();
        g.arc(f.w / 2, f.h / 2, (snap?.ring ?? RING_RADIUS) * f.k, 0, 7);
        g.fill();
        g.strokeStyle = '#c0392b';
        g.lineWidth = 3;
        g.stroke();
        for (const t of snap?.tops ?? []) {
          if (!t[T_LAUNCHED] || !t[T_ALIVE]) continue;
          const pl = snap?.players.find((q) => q.id === t[0]);
          const [x, y] = at(t[T_X], t[T_Z]);
          g.fillStyle = pl ? PLAYER_COLORS[pl.color] : '#fff';
          g.beginPath();
          g.arc(x, y, 12, 0, 7);
          g.fill();
          g.strokeStyle = '#2b1d12';
          g.stroke();
        }
        if (snap?.mud) {
          const [x, y] = at(snap.mud[0], snap.mud[1]);
          g.fillStyle = `rgba(74,52,32,${0.6 * snap.mud[3]})`;
          g.beginPath();
          g.arc(x, y, snap.mud[2] * f.k, 0, 7);
          g.fill();
        }
        g.fillStyle = 'rgba(43,29,18,0.35)';
        for (const [mx, mz, mt] of snap?.mangoes ?? []) {
          const [x, y] = at(mx, mz);
          g.beginPath();
          g.arc(x, y, mt < 0 ? 10 : 6, 0, 7);
          g.fill();
        }
        g.fillStyle = '#f2c230';
        for (const [cx, cz] of snap?.coins ?? []) {
          const [x, y] = at(cx, cz);
          g.beginPath();
          g.arc(x, y, 7, 0, 7);
          g.fill();
        }
        g.fillStyle = '#c9c2e8';
        for (const [fx, fz] of snap?.flicks ?? []) {
          const [x, y] = at(fx, fz);
          g.fillRect(x - 5, y - 8, 10, 16);
        }
      };
      frame();
      return () => cancelAnimationFrame(raf);
    },
  );
}

start();
