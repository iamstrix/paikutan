// Trumpo physics for one round. Pure functions with no DOM, so the host can run it
// authoritatively (and Node can test it). Phones only render snapshots of it.
import { TOPS, byId } from './data.js';

export const ARENA_R = 5;        // chalk circle radius
export const TOP_R = 0.42;       // trumpo body radius
export const STEP = 1 / 60;
export const LAUNCH_Z = 4.2;     // where each player stands (slot 0 at +z, slot 1 at -z)
export const LATE_T = 35;        // after this, spin drains twice as fast
export const MAX_T = 70;
export const BOOST_CD = 2.5;     // seconds between dashes
const BOOST_V = 6, BOOST_COST = 0.04;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function makeTop(slot, charId, topId) {
  const tp = byId(TOPS, topId);
  return {
    slot, char: charId, top: tp.id,
    mass: 1 + (tp.str - 1) * 0.1,
    decay: 1.2 - tp.lon * 0.07,
    sta: tp.sta,
    launched: false, alive: true, out: false,
    x: 0, z: slot === 0 ? LAUNCH_Z : -LAUNCH_Z, vx: 0, vz: 0,
    spin: 0, wobble: 0, steady: 1,
    charge: 0, shield: 0, invert: 0, dash: 0, hitCd: 0, boostCd: 0,
    sx: 0, sy: 0, wantAbility: false, wantBoost: false,
  };
}

export function createWorld(p0, p1, rand = Math.random) {
  return {
    t: 0, rand, events: [], over: false, winner: -1, reason: '',
    tops: [makeTop(0, p0.char, p0.top), makeTop(1, p1.char, p1.top)],
    dog: null, dogDone: false, dogAt: 14 + rand() * 10,
  };
}

// Player-local direction (x = right, y = away from the player) to world x/z and back.
export const toWorld = (slot, x, y) => (slot === 0 ? [x, -y] : [-x, y]);
export const toLocal = (slot, wx, wz) => (slot === 0 ? [wx, -wz] : [-wx, wz]);

const ev = (w, type, data) => w.events.push({ type, ...data });

// How much a hit unsettles a top: trumpo balance and how neatly the player drew circles.
const wobbleGain = tp => (1.6 - tp.sta * 0.2) * (1.25 - 0.5 * tp.steady);

export function launch(w, slot, { spinPower = 0.3, steadiness = 0.4, throwPower = 0.2, angle = 0 }) {
  const tp = w.tops[slot];
  if (tp.launched || w.over) return;
  const p = clamp(throwPower, 0, 1), a = clamp(angle, -0.6, 0.6), s = clamp(steadiness, 0, 1);
  const [fx, fz] = toWorld(slot, Math.sin(a), Math.cos(a));
  tp.launched = true;
  tp.x = fx * (0.3 + p);
  tp.z = (slot === 0 ? LAUNCH_Z : -LAUNCH_Z) + fz * (0.3 + p);
  tp.vx = fx * (1.5 + 5 * p);
  tp.vz = fz * (1.5 + 5 * p);
  tp.spin = clamp(0.45 + 0.4 * clamp(spinPower, 0, 1) + 0.15 * p, 0, 1);
  tp.steady = s;
  // A harder throw lands with more shake; a neat spin absorbs some of it.
  tp.wobble = 0.2 * (1 - s) + 0.2 * p * (1 - 0.6 * s);
  ev(w, 'launch', { slot, x: tp.x, z: tp.z, p });
}

function useAbility(w, tp, opp) {
  tp.charge = 0;
  const live = opp.launched && opp.alive;
  const dx = opp.x - tp.x, dz = opp.z - tp.z, d = Math.hypot(dx, dz) || 1;
  switch (tp.top) {
    case 'kidlat':
      if (live) {
        const k = opp.shield > 0 ? 0.3 : 1;
        opp.spin -= 0.07 * k;
        opp.wobble += 0.12 * k;
        opp.vx += (dx / d) * 3 * k;
        opp.vz += (dz / d) * 3 * k;
      }
      break;
    case 'tikbalang':
      tp.vx = (dx / d) * 8;
      tp.vz = (dz / d) * 8;
      tp.dash = 0.8;
      break;
    case 'agimat':
      tp.shield = 5;
      break;
    case 'diwata':
      tp.spin = Math.min(1, tp.spin + 0.07);
      tp.wobble = Math.max(0, tp.wobble - 0.3);
      break;
    case 'bakunawa':
      if (live) { opp.invert = 5; opp.spin -= 0.06; }
      break;
  }
  ev(w, 'ability', { slot: tp.slot, top: tp.top, x: tp.x, z: tp.z, tx: opp.x, tz: opp.z });
}

// Every top's quick dash: a burst toward where the player steers. It costs spin and adds
// no weight, so Tikbalang's charge stays the heavy ram.
function boost(w, tp, wx, wz) {
  let dx = wx, dz = wz, d = Math.hypot(dx, dz);
  if (d < 0.2) { dx = tp.vx; dz = tp.vz; d = Math.hypot(dx, dz); }
  if (d < 0.5) { dx = -tp.x; dz = -tp.z; d = Math.hypot(dx, dz); }
  if (d < 0.1) { [dx, dz] = toWorld(tp.slot, 0, 1); d = 1; }
  dx /= d; dz /= d;
  tp.vx = tp.vx * 0.4 + dx * BOOST_V;
  tp.vz = tp.vz * 0.4 + dz * BOOST_V;
  tp.spin -= BOOST_COST;
  tp.boostCd = BOOST_CD;
  ev(w, 'boost', { slot: tp.slot, x: tp.x, z: tp.z, dx, dz });
}

// Dashing or shielded tops count as heavier in a clash.
const weight = tp => tp.mass * (tp.dash > 0 ? 1.8 : 1) * (tp.shield > 0 ? 1.5 : 1);

function hitTop(tp, by, intensity) {
  const k = (tp.shield > 0 ? 0.3 : 1) * intensity * weight(by) / weight(tp);
  tp.spin -= 0.03 * k;
  // A slow top is much easier to knock over.
  tp.wobble += 0.25 * k * wobbleGain(tp) * (1.6 - tp.spin);
  tp.charge = Math.min(1, tp.charge + 0.08);
  tp.hitCd = 0.35;
}

function collide(w) {
  const [a, b] = w.tops;
  if (!a.launched || !b.launched || !a.alive || !b.alive) return;
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
  if (d >= TOP_R * 2 || d === 0) return;
  const nx = dx / d, nz = dz / d;
  const ia = 1 / weight(a), ib = 1 / weight(b);
  const push = (TOP_R * 2 - d) / (ia + ib);
  a.x -= nx * push * ia; a.z -= nz * push * ia;
  b.x += nx * push * ib; b.z += nz * push * ib;
  const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  const fresh = a.hitCd <= 0 && b.hitCd <= 0;
  let J = vn < 0 ? (-1.8 * vn) / (ia + ib) : 0;
  // Both tops spin the same way, so their rims grind in opposite directions and kick apart.
  const clash = fresh ? 1.4 * (a.spin + b.spin) : 0;
  J += clash / (ia + ib) * 0.5;
  a.vx -= nx * J * ia; a.vz -= nz * J * ia;
  b.vx += nx * J * ib; b.vz += nz * J * ib;
  if (!fresh) return;
  const tx = -nz, tz = nx;
  a.vx += tx * 0.6 * b.spin; a.vz += tz * 0.6 * b.spin;
  b.vx -= tx * 0.6 * a.spin; b.vz -= tz * 0.6 * a.spin;
  const i = clamp((Math.abs(vn) + clash) / 7, 0.15, 1);
  hitTop(a, b, i);
  hitTop(b, a, i);
  ev(w, 'hit', { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, i });
  // Agaw-ikot: a top that is behind on spin and dashes into the leader steals some spin.
  // Only on a dash, so it is a skill move rather than every bump. At most 40% of the gap
  // moves each way, so a lead shrinks but never flips from one hit.
  const gap = Math.abs(a.spin - b.spin);
  const [lo, hi] = a.spin < b.spin ? [a, b] : [b, a];
  if (gap > 0.05 && lo.boostCd > BOOST_CD - 0.6) {
    const amt = Math.min(0.08, gap * 0.4) * (0.4 + 0.6 * i);
    lo.spin += amt; hi.spin -= amt;
    ev(w, 'steal', { slot: lo.slot, x: lo.x, z: lo.z, fx: hi.x, fz: hi.z, amt });
  }
}

// Asong gala: a stray dog runs through once per round and bumps whatever it touches.
function strayDog(w, dt) {
  if (!w.dog && !w.dogDone && w.t >= w.dogAt) {
    const dir = w.rand() < 0.5 ? 1 : -1;
    w.dog = { x: -8.5 * dir, z: (w.rand() - 0.5) * 5, vx: 6 * dir, hit: [false, false] };
    ev(w, 'dog', {});
  }
  const dog = w.dog;
  if (!dog) return;
  dog.x += dog.vx * dt;
  for (const tp of w.tops) {
    if (!tp.launched || !tp.alive || dog.hit[tp.slot]) continue;
    if (Math.hypot(tp.x - dog.x, tp.z - dog.z) < 0.9) {
      dog.hit[tp.slot] = true;
      tp.vx += dog.vx * 0.5;
      tp.vz += Math.sign(tp.z - dog.z || 1) * 2;
      ev(w, 'bark', { x: tp.x, z: tp.z, slot: tp.slot });
    }
  }
  if (Math.abs(dog.x) > 9) { w.dog = null; w.dogDone = true; }
}

export function step(w, dt = STEP) {
  if (w.over) return;
  w.t += dt;
  const late = w.t > LATE_T ? 2 : 1;
  for (const tp of w.tops) {
    if (!tp.launched || !tp.alive) continue;
    const opp = w.tops[1 - tp.slot];
    tp.shield = Math.max(0, tp.shield - dt);
    tp.invert = Math.max(0, tp.invert - dt);
    tp.dash = Math.max(0, tp.dash - dt);
    tp.hitCd = Math.max(0, tp.hitCd - dt);
    tp.boostCd = Math.max(0, tp.boostCd - dt);

    let sx = tp.sx, sy = tp.sy;
    const m = Math.hypot(sx, sy);
    if (m > 1) { sx /= m; sy /= m; }
    if (tp.invert > 0) { sx = -sx; sy = -sy; }
    const [wx, wz] = toWorld(tp.slot, sx, sy);
    tp.wx = wx; tp.wz = wz;
    if (tp.wantBoost) {
      tp.wantBoost = false;
      if (tp.boostCd <= 0) boost(w, tp, wx, wz);
    }
    const grip = 7 * (0.35 + 0.65 * tp.spin);
    // The ground dips slightly toward the middle, so tops keep meeting.
    let ax = wx * grip - tp.x * 0.35, az = wz * grip - tp.z * 0.35;
    const wander = tp.wobble * 2.2;
    ax += Math.cos(w.t * 3 + tp.slot * 2) * wander;
    az += Math.sin(w.t * 3 + tp.slot * 2) * wander;
    tp.vx += ax * dt; tp.vz += az * dt;
    const fr = Math.exp(-dt * (1.0 + 1.2 * (1 - tp.spin)));
    tp.vx *= fr; tp.vz *= fr;
    tp.x += tp.vx * dt; tp.z += tp.vz * dt;

    // Steering is not free: it costs a little spin.
    tp.spin -= dt * (0.04 * tp.decay * late + Math.min(1, m) * 0.012);
    const target = clamp((0.45 - tp.spin) / 0.45, 0, 1) * 0.85;
    if (tp.wobble < target) tp.wobble += (target - tp.wobble) * dt;
    else tp.wobble = Math.max(target, tp.wobble - dt * (0.015 + 0.012 * tp.sta));
    // The top behind on spin charges its power up to 1.5x faster.
    const behind = opp.launched && opp.alive ? clamp((opp.spin - tp.spin) / 0.3, 0, 1) : 0;
    tp.charge = Math.min(1, tp.charge + dt / 8 * (1 + 0.5 * behind));
    if (tp.wantAbility) {
      tp.wantAbility = false;
      if (tp.charge >= 1) useAbility(w, tp, opp);
    }
  }
  collide(w);
  strayDog(w, dt);

  for (const tp of w.tops) {
    if (!tp.launched || !tp.alive) continue;
    if (Math.hypot(tp.x, tp.z) > ARENA_R + TOP_R * 0.5) {
      tp.alive = false; tp.out = true;
      ev(w, 'out', { slot: tp.slot, x: tp.x, z: tp.z });
    } else if (tp.spin <= 0.03 || tp.wobble >= 1) {
      tp.alive = false; tp.spin = 0;
      ev(w, 'fall', { slot: tp.slot, x: tp.x, z: tp.z });
    }
  }
  const dead = w.tops.filter(tp => tp.launched && !tp.alive);
  if (dead.length) {
    w.over = true;
    if (dead.length === 2) { w.winner = -1; w.reason = 'draw'; }
    else { w.winner = 1 - dead[0].slot; w.reason = dead[0].out ? 'out' : 'fall'; }
  } else if (w.t > MAX_T) {
    w.over = true;
    const [a, b] = w.tops;
    w.winner = Math.abs(a.spin - b.spin) < 0.01 ? -1 : a.spin > b.spin ? 0 : 1;
    w.reason = 'time';
  }
  if (w.over) ev(w, 'over', { winner: w.winner, reason: w.reason });
}

const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;

// Compact network form of the world, decoded by decodeSnap.
export function snapshot(w) {
  return {
    t: r2(w.t),
    tops: w.tops.map(tp => [r2(tp.x), r2(tp.z), r3(Math.max(0, tp.spin)), r3(tp.wobble),
      +tp.launched, +tp.alive, +tp.out, r2(tp.charge), +(tp.shield > 0), +(tp.invert > 0), +(tp.dash > 0), r2(tp.wx || 0), r2(tp.wz || 0), r2(tp.boostCd)]),
    dog: w.dog ? [r2(w.dog.x), r2(w.dog.z), Math.sign(w.dog.vx)] : null,
  };
}

export function decodeSnap(s) {
  return {
    t: s.t,
    tops: s.tops.map(a => ({ x: a[0], z: a[1], spin: a[2], wobble: a[3], launched: !!a[4], alive: !!a[5],
      out: !!a[6], charge: a[7], shield: !!a[8], invert: !!a[9], dash: !!a[10], wx: a[11] || 0, wz: a[12] || 0, boostCd: a[13] || 0 })),
    dog: s.dog && { x: s.dog[0], z: s.dog[1], dir: s.dog[2] },
  };
}
