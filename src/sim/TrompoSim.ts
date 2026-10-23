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

// tromPOW core-loop tuning on top of paikutan (see tests/balance.spec.ts for the targets).
/** The circle starts shrinking at SQUEEZE_START and reaches SQUEEZE_MIN of its size at SQUEEZE_END. */
export const SQUEEZE_START = 18;
export const SQUEEZE_END = 38;
export const SQUEEZE_MIN = 0.6;
/** Palo: a dash-strike that costs spin and leaves you exposed for a moment afterwards. */
export const PALO_SPEED = 4.5;
export const PALO_COST = 0.015;
export const PALO_CD = 1.6;
const PALO_DASH = 0.35;
const EXPOSED = 0.6;
/** After landing, a top takes no clash damage (except a landing strike) so the opening isn't a blind pile-up. */
const GRACE = 1.5;
const LANDING_STRIKE_R = 1.0;
const CHARGE_START = 0.4;
/** A hit within this long before a top goes down earns the hitter the KO. */
export const KO_CREDIT = 2;
const FLICK_SPEED = 7;
const FLICK_R = 0.25;
const DIP = 0.5;
const KNOCKBACK = 1.0;
/** Passive spin drain per second (paikutan: 0.03); the squeeze, not slow decay, should end rounds. */
const BASE_DECAY = 0.02;
/** Charged palo (c = 1): faster, harder, pricier, and you're open longer afterwards. */
const PALO_MAX_SPEED = 7.5;
const PALO_MAX_COST = 0.06;
const PALO_MAX_DASH = 0.5;
const PALO_MAX_HIT = 0.8;

// Chaos and risk/reward (all seeded through this.rng, so online games stay in sync).
/** Piso coins spawn near the rim: points and power charge for whoever dares the edge. */
const COIN_EVERY = 4;
const COIN_PICKUP = TOP_R + 0.3;
const COIN_CHARGE = 0.25;
/** Mangoes: a shadow warns, they drop, then lie there as a bump for a while. */
export const MANGO_WARN = 1.1;
const MANGO_HIT = 0.8;
export const MANGO_R = 0.35;
const MANGO_LIE = 5;
/** Hangin: a telegraphed gust that shoves every top one way. */
export const WIND_WARN = 1.2;
const WIND_GUST = 1.6;
const WIND_ACCEL = 3;
/** Putik: a slippery puddle; fades in before it bites. */
const MUD_R = 0.9;
const MUD_EVERY = 12;
export const MUD_FADE = 1;

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
  paloCd: number;
  /** Seconds left of the post-palo exposed window (lighter and takes more damage). */
  exposed: number;
  /** Charge (0..1) of the palo dash in progress. */
  paloC: number;
  grace: number;
  stun: number;
  lastHitBy: number;
  lastHitAt: number;
  /** Steering in player-local space: x = right, y = away from the player. */
  sx: number;
  sy: number;
  wantAbility: boolean;
};

export type SimEvent =
  | { type: 'launch'; id: number; x: number; z: number; p: number }
  | { type: 'hit'; a: number; b: number; x: number; z: number; i: number }
  | { type: 'ability'; id: number; power: string; x: number; z: number; tx: number; tz: number }
  | { type: 'out'; id: number; x: number; z: number; by: number }
  | { type: 'fall'; id: number; x: number; z: number; by: number }
  | { type: 'palo'; id: number; x: number; z: number; c: number }
  | { type: 'coin'; id: number; x: number; z: number }
  | { type: 'mangoWarn' }
  | { type: 'mango'; x: number; z: number }
  | { type: 'windWarn'; dx: number; dz: number }
  | { type: 'wind' }
  | { type: 'mud'; x: number; z: number }
  | { type: 'steal'; id: number; amount: number; x: number; z: number }
  | { type: 'strike'; id: number; target: number; x: number; z: number }
  | { type: 'flick'; by: number; x: number; z: number }
  | { type: 'flickHit'; id: number; x: number; z: number }
  | { type: 'squeeze' }
  | { type: 'dog' }
  | { type: 'bark'; id: number; x: number; z: number };

export type Dog = { x: number; z: number; vx: number; hit: Set<number> };
/** A multo's flicked tsinelas: a small slider that bumps live tops; never scores. */
export type Flick = { by: number; x: number; z: number; vx: number; vz: number; life: number; hit: Set<number> };
/** t < 0: falling, seconds to impact. t > 0: lying on the ground, seconds left. */
export type Mango = { x: number; z: number; t: number };
/** t < 0: warning, seconds to the gust. t > 0: blowing, seconds left. */
export type Wind = { dx: number; dz: number; t: number };
/** t = age; slippery once t >= MUD_FADE. */
export type Mud = { x: number; z: number; r: number; t: number };

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
const weight = (tp: Top) => tp.mass * (tp.dash > 0 ? 1.8 : 1) * (tp.shield > 0 ? 1.5 : 1) * (tp.exposed > 0 ? 0.7 : 1);

export class Battle {
  readonly tops: Top[];
  t = 0;
  events: SimEvent[] = [];
  dog: Dog | null = null;
  readonly flicks: Flick[] = [];
  /** Current circle radius (shrinks during the squeeze). */
  ring = ARENA_R;
  readonly coins: { x: number; z: number }[] = [];
  readonly mangoes: Mango[] = [];
  wind: Wind | null = null;
  mud: Mud | null = null;
  private nextCoin = COIN_EVERY;
  private nextMango = 8;
  private nextWind = 10;
  private nextMud = 6;
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
        paloCd: 0,
        exposed: 0,
        paloC: 0,
        grace: 0,
        stun: 0,
        lastHitBy: -1,
        lastHitAt: -99,
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
    // The throw places the top: power is how far in it lands, the tilt is where. That makes it a decision.
    const reach = 0.3 + p * 2.2;
    tp.x = Math.cos(tp.seat) * LAUNCH_R + fx * reach;
    tp.z = Math.sin(tp.seat) * LAUNCH_R + fz * reach;
    tp.vx = fx * (1 + 2 * p);
    tp.vz = fz * (1 + 2 * p);
    tp.grace = GRACE;
    tp.charge = CHARGE_START;
    tp.spin = clamp(0.45 + 0.4 * clamp(input.spinPower, 0, 1) + 0.15 * p, 0, 1);
    tp.steady = s;
    // A harder throw lands with more shake; a neat spin absorbs some of it.
    tp.wobble = 0.2 * (1 - s) + 0.2 * p * (1 - 0.6 * s);
    this.events.push({ type: 'launch', id, x: tp.x, z: tp.z, p });
    // Landing strike: come down on a top that's already spinning (the old pukpukan hit).
    for (const o of this.tops) {
      if (o === tp || !o.launched || !o.alive || o.grace > 0.6) continue;
      if (Math.hypot(o.x - tp.x, o.z - tp.z) > LANDING_STRIKE_R) continue;
      const dx = o.x - tp.x;
      const dz = o.z - tp.z;
      const d = Math.hypot(dx, dz) || 1;
      this.damage(o, tp, 1, true);
      o.vx += (dx / d) * 4;
      o.vz += (dz / d) * 4;
      this.events.push({ type: 'strike', id, target: o.id, x: o.x, z: o.z });
    }
  }

  /** Palo: dash toward where you're steering (or the nearest rival). Costs spin; leaves you exposed after.
   * `c` (0..1) is how long it was charged: more speed and hit, more cost and exposure. */
  palo(id: number, c = 0): void {
    const tp = this.top(id);
    c = clamp(Number.isFinite(c) ? c : 0, 0, 1);
    const cost = PALO_COST + (PALO_MAX_COST - PALO_COST) * c;
    if (!tp || !tp.launched || !tp.alive || tp.paloCd > 0 || tp.spin < cost + 0.08 || tp.stun > 0) return;
    let dx: number;
    let dz: number;
    if (Math.hypot(tp.sx, tp.sy) > 0.2) {
      const flip = tp.invert > 0 ? -1 : 1;
      [dx, dz] = toWorld(tp.seat, tp.sx * flip, tp.sy * flip);
    } else {
      const op = this.nearestRival(tp);
      dx = op ? op.x - tp.x : -tp.x;
      dz = op ? op.z - tp.z : -tp.z;
    }
    const d = Math.hypot(dx, dz) || 1;
    const speed = PALO_SPEED + (PALO_MAX_SPEED - PALO_SPEED) * c;
    tp.vx = (dx / d) * speed + tp.vx * 0.3;
    tp.vz = (dz / d) * speed + tp.vz * 0.3;
    tp.dash = Math.max(tp.dash, PALO_DASH + (PALO_MAX_DASH - PALO_DASH) * c);
    tp.paloC = c;
    tp.exposed = 0;
    tp.spin -= cost;
    tp.paloCd = PALO_CD;
    this.events.push({ type: 'palo', id, x: tp.x, z: tp.z, c });
  }

  /** A knocked-out player's multo flicks a tsinelas from outside the circle toward (tx, tz). */
  flick(by: number, fromX: number, fromZ: number, tx: number, tz: number): void {
    const dx = tx - fromX;
    const dz = tz - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.flicks.push({ by, x: fromX, z: fromZ, vx: (dx / d) * FLICK_SPEED, vz: (dz / d) * FLICK_SPEED, life: 1.6, hit: new Set() });
    this.events.push({ type: 'flick', by, x: fromX, z: fromZ });
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
    const squeeze = clamp((this.t - SQUEEZE_START) / (SQUEEZE_END - SQUEEZE_START), 0, 1);
    if (squeeze > 0 && this.ring === ARENA_R) this.events.push({ type: 'squeeze' });
    this.ring = ARENA_R * (1 - (1 - SQUEEZE_MIN) * squeeze);
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
      const wasDashing = tp.dash > 0;
      tp.dash = Math.max(0, tp.dash - dt);
      if (wasDashing && tp.dash === 0 && tp.paloCd > 0) {
        tp.exposed = EXPOSED * (1 + tp.paloC);
        tp.paloC = 0;
      } else tp.exposed = Math.max(0, tp.exposed - dt);
      tp.paloCd = Math.max(0, tp.paloCd - dt);
      tp.grace = Math.max(0, tp.grace - dt);
      tp.stun = Math.max(0, tp.stun - dt);

      let sx = tp.stun > 0 ? 0 : tp.sx;
      let sy = tp.stun > 0 ? 0 : tp.sy;
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
      const muddy = this.inMud(tp);
      const grip = 4.5 * (0.35 + 0.65 * tp.spin) * (muddy ? 0.35 : 1);
      // The ground dips slightly toward the middle, so tops keep meeting.
      let ax = wx * grip - tp.x * DIP;
      let az = wz * grip - tp.z * DIP;
      if (this.wind && this.wind.t > 0) {
        ax += this.wind.dx * WIND_ACCEL;
        az += this.wind.dz * WIND_ACCEL;
      }
      const wander = tp.wobble * 2.2;
      ax += Math.cos(this.t * 3 + tp.id * 2) * wander;
      az += Math.sin(this.t * 3 + tp.id * 2) * wander;
      tp.vx += ax * dt;
      tp.vz += az * dt;
      const fr = Math.exp(-dt * (0.7 + 1.2 * (1 - tp.spin)) * (muddy ? 0.3 : 1));
      tp.vx *= fr;
      tp.vz *= fr;
      tp.x += tp.vx * dt;
      tp.z += tp.vz * dt;

      // Steering is not free: it costs a little spin.
      tp.spin -= dt * (BASE_DECAY * tp.decay * late + Math.min(1, m) * 0.008);
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
    this.moveFlicks(dt);
    this.chaos(dt);

    for (const tp of this.tops) {
      if (!tp.launched || !tp.alive) continue;
      const by = this.t - tp.lastHitAt < KO_CREDIT ? tp.lastHitBy : -1;
      if (Math.hypot(tp.x, tp.z) > this.ring + TOP_R * 0.5) {
        tp.alive = false;
        tp.out = true;
        this.events.push({ type: 'out', id: tp.id, x: tp.x, z: tp.z, by });
      } else if (tp.spin <= 0.03 || tp.wobble >= 1) {
        tp.alive = false;
        tp.spin = 0;
        this.events.push({ type: 'fall', id: tp.id, x: tp.x, z: tp.z, by });
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
          opp.spin -= 0.15 * k;
          opp.wobble += 0.15 * k;
          opp.vx += (dx / d) * 3 * k;
          opp.vz += (dz / d) * 3 * k;
          opp.stun = 0.5 * k;
          this.credit(opp, tp);
        }
        break;
      case 'tikbalang':
        tp.vx = (dx / d) * 9;
        tp.vz = (dz / d) * 9;
        tp.dash = 0.8;
        break;
      case 'agimat':
        // Shield: hits barely hurt and attackers bounce off (see collide).
        tp.shield = 5;
        break;
      case 'diwata':
        // Blessing: a little spin, no wobble, and a moment where hits don't hurt.
        tp.spin = Math.min(1, tp.spin + 0.08);
        tp.wobble = 0;
        tp.grace = Math.max(tp.grace, 1);
        break;
      case 'bakunawa':
        if (opp) {
          opp.invert = 4;
          opp.spin -= 0.1 * (opp.shield > 0 ? 0.3 : 1);
          this.credit(opp, tp);
        }
        break;
    }
    this.events.push({ type: 'ability', id: tp.id, power: tp.power, x: tp.x, z: tp.z, tx: opp ? opp.x : 0, tz: opp ? opp.z : 0 });
  }

  private credit(tp: Top, by: Top): void {
    tp.lastHitBy = by.id;
    tp.lastHitAt = this.t;
  }

  /** Spin and wobble damage to `tp` from `by`; mult > 1 when tp was the one hit, < 1 when tp did the hitting.
   * `by` null = the barangay itself (mangoes): no KO credit changes hands. */
  private damage(tp: Top, by: Top | null, mult: number, force = false): number {
    tp.charge = Math.min(1, tp.charge + 0.08);
    if (by) this.credit(tp, by);
    if (tp.grace > 0 && !force) return 0;
    const k = (tp.shield > 0 ? 0.3 : 1) * mult * (tp.exposed > 0 ? 1.3 : 1);
    const loss = Math.min(Math.max(0, tp.spin), 0.03 * k);
    tp.spin -= loss;
    // A slow top is much easier to knock over.
    tp.wobble += 0.12 * k * wobbleGain(tp) * (1.6 - tp.spin);
    return loss;
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
    // Still landing: tops just slide apart, no hit yet.
    if (a.grace > 0 || b.grace > 0) return;
    const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    // paikutan keeps a per-top hit cooldown; with many tops it has to be per pair.
    const fresh = (this.pairCd.get(key) ?? 0) <= 0;
    let J = vn < 0 ? (-1.8 * vn) / (ia + ib) : 0;
    // Both tops spin the same way, so their rims grind in opposite directions and kick apart.
    const clash = fresh ? 0.9 * (a.spin + b.spin) : 0;
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
    // Who hit whom: the top closing faster along the impact line (a dash counts extra) is the attacker.
    const closeA = a.vx * nx + a.vz * nz + (a.dash > 0 ? 3 : 0);
    const closeB = -(b.vx * nx + b.vz * nz) + (b.dash > 0 ? 3 : 0);
    const atk = closeA > closeB + 0.5 ? a : closeB > closeA + 0.5 ? b : null;
    if (!atk) {
      this.damage(a, b, i);
      this.damage(b, a, i);
    } else {
      const vic = atk === a ? b : a;
      const sign = atk === a ? 1 : -1;
      // A charged palo hits harder and shoves further (the ring-out pays double).
      const pm = atk.dash > 0 ? 1 + atk.paloC * PALO_MAX_HIT : 1;
      const stolen = this.damage(vic, atk, 1.8 * i * pm);
      this.damage(atk, vic, 0.5 * i);
      // Agaw-ikot: the attacker takes the spin the victim lost.
      if (stolen > 0) {
        atk.spin = Math.min(1, atk.spin + stolen);
        this.events.push({ type: 'steal', id: atk.id, amount: stolen, x: atk.x, z: atk.z });
      }
      const kb = vic.shield > 0 ? 0.4 : KNOCKBACK;
      vic.vx += nx * sign * kb * i * pm;
      vic.vz += nz * sign * kb * i * pm;
      // Agimat: attackers bounce off a shielded top.
      if (vic.shield > 0) {
        atk.vx -= nx * sign * 2.5 * i;
        atk.vz -= nz * sign * 2.5 * i;
      }
    }
    this.pairCd.set(key, 0.35);
    this.events.push({ type: 'hit', a: a.id, b: b.id, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, i });
  }

  private moveFlicks(dt: number): void {
    for (let i = this.flicks.length - 1; i >= 0; i -= 1) {
      const f = this.flicks[i];
      f.life -= dt;
      const fr = Math.exp(-dt * 0.8);
      f.vx *= fr;
      f.vz *= fr;
      f.x += f.vx * dt;
      f.z += f.vz * dt;
      for (const tp of this.tops) {
        if (!tp.launched || !tp.alive || f.hit.has(tp.id) || Math.hypot(tp.x - f.x, tp.z - f.z) > TOP_R + FLICK_R) continue;
        f.hit.add(tp.id);
        const sp = Math.hypot(f.vx, f.vz) || 1;
        tp.vx += (f.vx / sp) * 3;
        tp.vz += (f.vz / sp) * 3;
        if (tp.grace <= 0) {
          tp.spin -= 0.03 * (tp.shield > 0 ? 0.3 : 1);
          tp.wobble += 0.08 * (tp.shield > 0 ? 0.3 : 1);
        }
        this.events.push({ type: 'flickHit', id: tp.id, x: tp.x, z: tp.z });
      }
      if (f.life <= 0 || Math.hypot(f.x, f.z) > 9) this.flicks.splice(i, 1);
    }
  }

  private inMud(tp: Top): boolean {
    const m = this.mud;
    return !!m && m.t >= MUD_FADE && Math.hypot(tp.x - m.x, tp.z - m.z) < m.r;
  }

  /** Coins, mangoes, wind and mud: spawn on their timers, then act on live tops. */
  private chaos(dt: number): void {
    const live = this.tops.filter((t) => t.launched && t.alive);
    if (!live.length) return;
    const ang = () => this.rng() * Math.PI * 2;

    // Piso at the rim.
    if (this.t >= this.nextCoin) {
      this.nextCoin = this.t + COIN_EVERY;
      if (this.coins.length < 2) {
        const a = ang();
        const r = this.ring * (0.78 + this.rng() * 0.14);
        this.coins.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
      }
    }
    for (let i = this.coins.length - 1; i >= 0; i -= 1) {
      const c = this.coins[i];
      if (Math.hypot(c.x, c.z) > this.ring - TOP_R * 0.5) {
        this.coins.splice(i, 1);
        continue;
      }
      const tp = live.find((t) => Math.hypot(t.x - c.x, t.z - c.z) < COIN_PICKUP);
      if (!tp) continue;
      tp.charge = Math.min(1, tp.charge + COIN_CHARGE);
      this.coins.splice(i, 1);
      this.events.push({ type: 'coin', id: tp.id, x: c.x, z: c.z });
    }

    // Mangoes: a volley near random tops, more of them once the circle squeezes.
    if (this.t >= this.nextMango) {
      this.nextMango = this.t + 6 + this.rng() * 3;
      const n = (this.ring < ARENA_R ? 3 : 2) + (this.rng() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k += 1) {
        const near = live[Math.floor(this.rng() * live.length)];
        let x = near.x + (this.rng() - 0.5) * 2.4;
        let z = near.z + (this.rng() - 0.5) * 2.4;
        const d = Math.hypot(x, z);
        const max = this.ring * 0.9;
        if (d > max) {
          x *= max / d;
          z *= max / d;
        }
        this.mangoes.push({ x, z, t: -MANGO_WARN });
      }
      this.events.push({ type: 'mangoWarn' });
    }
    for (let i = this.mangoes.length - 1; i >= 0; i -= 1) {
      const m = this.mangoes[i];
      if (m.t < 0) {
        m.t += dt;
        if (m.t < 0) continue;
        m.t = MANGO_LIE;
        for (const tp of live) {
          const dx = tp.x - m.x;
          const dz = tp.z - m.z;
          const d = Math.hypot(dx, dz);
          if (d > MANGO_HIT) continue;
          this.damage(tp, null, 0.6, true);
          tp.wobble += 0.15;
          tp.vx += (dx / (d || 1)) * 2.5;
          tp.vz += (dz / (d || 1)) * 2.5;
        }
        this.events.push({ type: 'mango', x: m.x, z: m.z });
        continue;
      }
      m.t -= dt;
      if (m.t <= 0) {
        this.mangoes.splice(i, 1);
        continue;
      }
      // Lying mango: a bump that tops bounce off.
      for (const tp of live) {
        const dx = tp.x - m.x;
        const dz = tp.z - m.z;
        const d = Math.hypot(dx, dz);
        if (d >= TOP_R + MANGO_R || d === 0) continue;
        const nx = dx / d;
        const nz = dz / d;
        tp.x = m.x + nx * (TOP_R + MANGO_R);
        tp.z = m.z + nz * (TOP_R + MANGO_R);
        const vn = tp.vx * nx + tp.vz * nz;
        if (vn < 0) {
          tp.vx -= 1.6 * vn * nx;
          tp.vz -= 1.6 * vn * nz;
        }
      }
    }

    // Hangin.
    if (!this.wind && this.t >= this.nextWind) {
      this.nextWind = this.t + 9 + this.rng() * 3;
      const a = ang();
      this.wind = { dx: Math.cos(a), dz: Math.sin(a), t: -WIND_WARN };
      this.events.push({ type: 'windWarn', dx: this.wind.dx, dz: this.wind.dz });
    } else if (this.wind) {
      const w = this.wind;
      if (w.t < 0) {
        w.t += dt;
        if (w.t >= 0) {
          w.t = WIND_GUST;
          this.events.push({ type: 'wind' });
        }
      } else {
        w.t -= dt;
        if (w.t <= 0) this.wind = null;
      }
    }

    // Putik: one puddle that moves every so often.
    if (this.t >= this.nextMud) {
      this.nextMud = this.t + MUD_EVERY;
      const a = ang();
      const r = Math.sqrt(this.rng()) * this.ring * 0.6;
      this.mud = { x: Math.cos(a) * r, z: Math.sin(a) * r, r: MUD_R, t: 0 };
      this.events.push({ type: 'mud', x: this.mud.x, z: this.mud.z });
    }
    if (this.mud) this.mud.t += dt;
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
