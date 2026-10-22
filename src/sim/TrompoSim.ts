import { createSeededRandom } from '../utils/random';
import { statsOf } from './data';

// Trompo battle physics, ported from paikutan's sim.js (the source of truth for
// the battle mechanic) and generalised from 1v1 to 2–6 tops. Pure and
// deterministic: the host runs it, tests drive it, clients render snapshots.
//
// Units are paikutan's (a 5 m chalk circle). Multiply by WORLD_SCALE for
// tromPOW's 2.8 m bilog.

export const ARENA_R = 5;
export const TOP_R = 0.42;
export const LAUNCH_R = 4.2;
export const STEP = 1 / 60;
export const LATE_T = 45;
export const MAX_T = 90;
/** Bilog radius in world metres (tromPOW) over the sim's arena radius. */
export const RING_RADIUS = 2.8;
export const WORLD_SCALE = RING_RADIUS / ARENA_R;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** What one player's spin drawing and throw produced. Every input device produces this. */
export type LaunchInput = { spinPower: number; steadiness: number; throwPower: number; angle: number };

export type Top = {
  id: number;
  /** Seat angle round the circle; the player stands at (cos, sin) * LAUNCH_R. */
  seat: number;
  char: string;
  power: string;
  mass: number;
  decay: number;
  sta: number;
  launched: boolean;
  alive: boolean;
  out: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  spin: number;
  wobble: number;
  steady: number;
  charge: number;
  shield: number;
  invert: number;
  dash: number;
  /** Steering in player-local space: x = right, y = away from the player. */
  sx: number;
  sy: number;
  wantAbility: boolean;
};

export type SimEvent =
  | { type: 'launch'; id: number; x: number; z: number; p: number }
  | { type: 'hit'; a: number; b: number; x: number; z: number; i: number }
  | { type: 'ability'; id: number; power: string; x: number; z: number; tx: number; tz: number }
  | { type: 'out'; id: number; x: number; z: number }
  | { type: 'fall'; id: number; x: number; z: number }
  | { type: 'dog' }
  | { type: 'bark'; id: number; x: number; z: number };

export type Dog = { x: number; z: number; vx: number; hit: Set<number> };

/** Player-local direction (x = right, y = away) to world x/z for a seat, and back. */
export function toWorld(seat: number, x: number, y: number): [number, number] {
  const fx = -Math.cos(seat);
  const fz = -Math.sin(seat);
  return [x * -fz + y * fx, x * fx + y * fz];
}
export function toLocal(seat: number, wx: number, wz: number): [number, number] {
  const fx = -Math.cos(seat);
  const fz = -Math.sin(seat);
  return [wx * -fz + wz * fx, wx * fx + wz * fz];
}

// How much a hit unsettles a top: character balance and how neatly the player drew circles.
const wobbleGain = (tp: Top) => (1.6 - tp.sta * 0.2) * (1.25 - 0.5 * tp.steady);
// Dashing or shielded tops count as heavier in a clash.
const weight = (tp: Top) => tp.mass * (tp.dash > 0 ? 1.8 : 1) * (tp.shield > 0 ? 1.5 : 1);

export class Battle {
  readonly tops: Top[];
  t = 0;
  events: SimEvent[] = [];
  dog: Dog | null = null;
  over = false;
  winner = -1;
  reason = '';
  private dogDone = false;
  private readonly dogAt: number;
  private readonly rng: () => number;
  private readonly pairCd = new Map<number, number>();

  constructor(entries: { id: number; char: string; power: string; seat: number }[], seed: number) {
    this.rng = createSeededRandom(seed);
    this.tops = entries.map((e) => {
      const s = statsOf(e.char);
      return {
        id: e.id,
        seat: e.seat,
        char: e.char,
        power: e.power,
        mass: 1 + (s.str - 1) * 0.1,
        decay: 1.2 - s.lon * 0.07,
        sta: s.sta,
        launched: false,
        alive: true,
        out: false,
        x: Math.cos(e.seat) * LAUNCH_R,
        z: Math.sin(e.seat) * LAUNCH_R,
        vx: 0,
        vz: 0,
        spin: 0,
        wobble: 0,
        steady: 1,
        charge: 0,
        shield: 0,
        invert: 0,
        dash: 0,
        sx: 0,
        sy: 0,
        wantAbility: false,
      };
    });
    this.dogAt = 14 + this.rng() * 10;
  }

  top(id: number): Top | undefined {
    return this.tops.find((t) => t.id === id);
  }

  launch(id: number, input: LaunchInput): void {
    const tp = this.top(id);
    if (!tp || tp.launched || this.over) return;
    const p = clamp(input.throwPower, 0, 1);
    const a = clamp(input.angle, -0.6, 0.6);
    const s = clamp(input.steadiness, 0, 1);
    const [fx, fz] = toWorld(tp.seat, Math.sin(a), Math.cos(a));
    tp.launched = true;
    tp.x = Math.cos(tp.seat) * LAUNCH_R + fx * (0.3 + p);
    tp.z = Math.sin(tp.seat) * LAUNCH_R + fz * (0.3 + p);
    tp.vx = fx * (1.5 + 5 * p);
    tp.vz = fz * (1.5 + 5 * p);
    tp.spin = clamp(0.45 + 0.4 * clamp(input.spinPower, 0, 1) + 0.15 * p, 0, 1);
    tp.steady = s;
    // A harder throw lands with more shake; a neat spin absorbs some of it.
    tp.wobble = 0.2 * (1 - s) + 0.2 * p * (1 - 0.6 * s);
    this.events.push({ type: 'launch', id, x: tp.x, z: tp.z, p });
  }

  steer(id: number, x: number, y: number): void {
    const tp = this.top(id);
    if (!tp) return;
    tp.sx = clamp(Number.isFinite(x) ? x : 0, -1, 1);
    tp.sy = clamp(Number.isFinite(y) ? y : 0, -1, 1);
  }

  ability(id: number): void {
    const tp = this.top(id);
    if (tp) tp.wantAbility = true;
  }

  /** The nearest live, launched rival of `tp`, if any. */
  nearestRival(tp: Top): Top | null {
    let best: Top | null = null;
    let bestD = Infinity;
    for (const o of this.tops) {
      if (o === tp || !o.launched || !o.alive) continue;
      const d = Math.hypot(o.x - tp.x, o.z - tp.z);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  /** End the round once every top is down (call when the throw window has closed). */
  allLaunched(): boolean {
    return this.tops.every((t) => t.launched);
  }

  alive(): Top[] {
    return this.tops.filter((t) => t.launched && t.alive);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  step(dt = STEP): void {
    if (this.over) return;
    this.t += dt;
    const late = this.t > LATE_T ? 2 : 1;
    for (const tp of this.tops) {
      if (!tp.launched) continue;
      if (!tp.alive) {
        // Dead tops keep sliding (cosmetic); they no longer collide or score.
        const fr = Math.exp(-dt * 3);
        tp.vx *= fr;
        tp.vz *= fr;
        tp.x += tp.vx * dt;
        tp.z += tp.vz * dt;
        continue;
      }
      tp.shield = Math.max(0, tp.shield - dt);
      tp.invert = Math.max(0, tp.invert - dt);
      tp.dash = Math.max(0, tp.dash - dt);

      let sx = tp.sx;
      let sy = tp.sy;
      const m = Math.hypot(sx, sy);
      if (m > 1) {
        sx /= m;
        sy /= m;
      }
      if (tp.invert > 0) {
        sx = -sx;
        sy = -sy;
      }
      const [wx, wz] = toWorld(tp.seat, sx, sy);
      const grip = 4.5 * (0.35 + 0.65 * tp.spin);
      // The ground dips slightly toward the middle, so tops keep meeting.
      let ax = wx * grip - tp.x * 0.35;
      let az = wz * grip - tp.z * 0.35;
      const wander = tp.wobble * 2.2;
      ax += Math.cos(this.t * 3 + tp.id * 2) * wander;
      az += Math.sin(this.t * 3 + tp.id * 2) * wander;
      tp.vx += ax * dt;
      tp.vz += az * dt;
      const fr = Math.exp(-dt * (0.7 + 1.2 * (1 - tp.spin)));
      tp.vx *= fr;
      tp.vz *= fr;
      tp.x += tp.vx * dt;
      tp.z += tp.vz * dt;

      // Steering is not free: it costs a little spin.
      tp.spin -= dt * (0.03 * tp.decay * late + Math.min(1, m) * 0.012);
      const target = clamp((0.45 - tp.spin) / 0.45, 0, 1) * 0.85;
      if (tp.wobble < target) tp.wobble += (target - tp.wobble) * dt;
      else tp.wobble = Math.max(target, tp.wobble - dt * (0.015 + 0.012 * tp.sta));
      tp.charge = Math.min(1, tp.charge + dt / 10);
      if (tp.wantAbility) {
        tp.wantAbility = false;
        if (tp.charge >= 1) this.useAbility(tp);
      }
    }
    for (const [k, v] of this.pairCd) this.pairCd.set(k, v - dt);
    for (let i = 0; i < this.tops.length; i += 1) {
      for (let j = i + 1; j < this.tops.length; j += 1) this.collide(this.tops[i], this.tops[j], i * 16 + j);
    }
    this.strayDog(dt);

    for (const tp of this.tops) {
      if (!tp.launched || !tp.alive) continue;
      if (Math.hypot(tp.x, tp.z) > ARENA_R + TOP_R * 0.5) {
        tp.alive = false;
        tp.out = true;
        this.events.push({ type: 'out', id: tp.id, x: tp.x, z: tp.z });
      } else if (tp.spin <= 0.03 || tp.wobble >= 1) {
        tp.alive = false;
        tp.spin = 0;
        this.events.push({ type: 'fall', id: tp.id, x: tp.x, z: tp.z });
      }
    }
  }

  /** Decide the round: last top spinning wins; all down together is a draw; time-out goes to most spin. */
  settle(lastDown: number[]): void {
    const alive = this.alive();
    if (this.allLaunched() && alive.length <= 1) {
      this.over = true;
      if (alive.length === 1) {
        this.winner = alive[0].id;
        this.reason = 'last';
      } else {
        this.winner = lastDown.length === 1 ? lastDown[0] : -1;
        this.reason = lastDown.length === 1 ? 'last' : 'draw';
      }
    } else if (this.t > MAX_T) {
      this.over = true;
      const best = alive.reduce<Top | null>((b, t) => (!b || t.spin > b.spin ? t : b), null);
      this.winner = best ? best.id : -1;
      this.reason = 'time';
    }
  }

  private useAbility(tp: Top): void {
    tp.charge = 0;
    const opp = this.nearestRival(tp);
    const dx = opp ? opp.x - tp.x : -tp.x;
    const dz = opp ? opp.z - tp.z : -tp.z;
    const d = Math.hypot(dx, dz) || 1;
    switch (tp.power) {
      case 'kidlat':
        if (opp) {
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
        if (opp) {
          opp.invert = 5;
          opp.spin -= 0.06;
        }
        break;
    }
    this.events.push({ type: 'ability', id: tp.id, power: tp.power, x: tp.x, z: tp.z, tx: opp ? opp.x : 0, tz: opp ? opp.z : 0 });
  }

  private hitTop(tp: Top, by: Top, intensity: number): void {
    const k = ((tp.shield > 0 ? 0.3 : 1) * intensity * weight(by)) / weight(tp);
    tp.spin -= 0.025 * k;
    // A slow top is much easier to knock over.
    tp.wobble += 0.25 * k * wobbleGain(tp) * (1.6 - tp.spin);
    tp.charge = Math.min(1, tp.charge + 0.08);
  }

  private collide(a: Top, b: Top, key: number): void {
    if (!a.launched || !b.launched || !a.alive || !b.alive) return;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d >= TOP_R * 2 || d === 0) return;
    const nx = dx / d;
    const nz = dz / d;
    const ia = 1 / weight(a);
    const ib = 1 / weight(b);
    const push = (TOP_R * 2 - d) / (ia + ib);
    a.x -= nx * push * ia;
    a.z -= nz * push * ia;
    b.x += nx * push * ib;
    b.z += nz * push * ib;
    const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    // paikutan keeps a per-top hit cooldown; with many tops it has to be per pair.
    const fresh = (this.pairCd.get(key) ?? 0) <= 0;
    let J = vn < 0 ? (-1.8 * vn) / (ia + ib) : 0;
    // Both tops spin the same way, so their rims grind in opposite directions and kick apart.
    const clash = fresh ? 1.4 * (a.spin + b.spin) : 0;
    J += (clash / (ia + ib)) * 0.5;
    a.vx -= nx * J * ia;
    a.vz -= nz * J * ia;
    b.vx += nx * J * ib;
    b.vz += nz * J * ib;
    if (!fresh) return;
    const tx = -nz;
    const tz = nx;
    a.vx += tx * 0.6 * b.spin;
    a.vz += tz * 0.6 * b.spin;
    b.vx -= tx * 0.6 * a.spin;
    b.vz -= tz * 0.6 * a.spin;
    const i = clamp((Math.abs(vn) + clash) / 7, 0.15, 1);
    this.hitTop(a, b, i);
    this.hitTop(b, a, i);
    this.pairCd.set(key, 0.35);
    this.events.push({ type: 'hit', a: a.id, b: b.id, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, i });
  }

  // Asong gala: a stray dog runs through once per round and bumps whatever it touches.
  private strayDog(dt: number): void {
    if (!this.dog && !this.dogDone && this.t >= this.dogAt) {
      const dir = this.rng() < 0.5 ? 1 : -1;
      this.dog = { x: -8.5 * dir, z: (this.rng() - 0.5) * 5, vx: 6 * dir, hit: new Set() };
      this.events.push({ type: 'dog' });
    }
    const dog = this.dog;
    if (!dog) return;
    dog.x += dog.vx * dt;
    for (const tp of this.tops) {
      if (!tp.launched || !tp.alive || dog.hit.has(tp.id)) continue;
      if (Math.hypot(tp.x - dog.x, tp.z - dog.z) < 0.9) {
        dog.hit.add(tp.id);
        tp.vx += dog.vx * 0.5;
        tp.vz += Math.sign(tp.z - dog.z || 1) * 2;
        this.events.push({ type: 'bark', id: tp.id, x: tp.x, z: tp.z });
      }
    }
    if (Math.abs(dog.x) > 9) {
      this.dog = null;
      this.dogDone = true;
    }
  }
}
