import { botSpin, botSteer, botThrow } from '../sim/Bot';
import { TOPS } from '../sim/data';
import { ARENA_R, Battle, MUD_FADE, RING_RADIUS, STEP, WORLD_SCALE, type SimEvent } from '../sim/TrompoSim';
import { createSeededRandom } from '../utils/random';

// Host-authoritative match logic. Runs only on the host (or in solo); clients
// and paired phones just render the Snapshot it produces. Round flow follows
// paikutan's engine: charge (draw circles) → countdown → throw (flick) → fight.

export type Phase = 'hub' | 'charge' | 'countdown' | 'throw' | 'fight' | 'roundEnd' | 'podium';

export type PlayerInfo = {
  id: number;
  name: string;
  char: string;
  power: string;
  bot: boolean;
  /** Match points: +1 per knockout, +3 for the last top spinning. */
  score: number;
  color: number;
  /** This round's spin drawing is locked in / the top has been thrown. */
  spun: boolean;
  thrown: boolean;
  /** Spin drawing results, shown on the player's own HUD and phone. */
  spinPower: number;
  steadiness: number;
  /** A phone is paired as this player's motion controller. */
  paired: boolean;
};

/** [x, z, rotationY, flags] — see AV_* bits. */
export type AvatarPose = [number, number, number, number];
export const AV_MOVING = 1;
export const AV_DASH = 2;
export const AV_TUMBLE = 4;

/** [id, x, z, spin, wobble, launched, alive, out, charge, shield, invert, dash], x/z in world metres. */
export type TopSnap = [number, number, number, number, number, number, number, number, number, number, number, number];
export const T_ID = 0;
export const T_X = 1;
export const T_Z = 2;
export const T_SPIN = 3;
export const T_WOBBLE = 4;
export const T_LAUNCHED = 5;
export const T_ALIVE = 6;
export const T_OUT = 7;
export const T_CHARGE = 8;
export const T_SHIELD = 9;
export const T_INVERT = 10;
export const T_DASH = 11;

export type Snapshot = {
  phase: Phase;
  t: number;
  /** Seconds left in a timed phase (charge, countdown, throw), else 0. */
  left: number;
  round: number;
  clock: number;
  winner: number;
  startIn: number;
  seats: number[];
  players: PlayerInfo[];
  tops: TopSnap[];
  dog: [number, number, number] | null;
  /** Current circle radius in world metres (shrinks during the squeeze). */
  ring: number;
  /** Multo tsinelas in flight, world [x, z]. */
  flicks: [number, number][];
  /** Piso coins near the rim, world [x, z]. */
  coins: [number, number][];
  /** Mangoes, world [x, z, t]: t < 0 falling (seconds to impact), t > 0 lying (seconds left). */
  mangoes: [number, number, number][];
  /** Hangin: [dx, dz, t]; t < 0 warning (seconds to the gust), t > 0 blowing. */
  wind: [number, number, number] | null;
  /** Putik puddle, world [x, z, radius, fade 0..1]. */
  mud: [number, number, number, number] | null;
  avatars: Record<number, AvatarPose>;
};

/** Sim events re-expressed in world metres, plus match events. */
export type GameEvent =
  | SimEvent
  | { type: 'chat'; id: number; i: number }
  | { type: 'tumble'; id: number }
  | { type: 'phase'; phase: Phase }
  | { type: 'roundWin'; id: number }
  /** Points awarded: `id` knocked `victim` out (ring-out 2, topple 1). */
  | { type: 'ko'; id: number; victim: number; how: 'out' | 'fall'; pts: number }
  | { type: 'matchEnd'; id: number }
  /** A bot commits to a power toward (x, z); it fires WINDUP seconds later. */
  | { type: 'windup'; id: number; x: number; z: number };

export type ClientMsg =
  | { t: 'av'; p: AvatarPose }
  | { t: 'spin'; power: number; stability: number }
  | { t: 'throw'; power: number; angle: number }
  | { t: 'steer'; x: number; y: number }
  | { t: 'ability' }
  /** Palo dash-strike; `c` 0..1 is how long it was charged. */
  | { t: 'palo'; c?: number }
  /** A knocked-out player's multo flicks a tsinelas at (x, z) in world metres. */
  | { t: 'flick'; x: number; z: number }
  | { t: 'power'; power: string }
  | { t: 'chat'; i: number }
  | { t: 'start' };

export const CHARACTERS = ['lola', 'totoy', 'binata', 'marites', 'tanod', 'bata'] as const;
export const BOT_NAMES: Record<string, string> = {
  lola: 'Lola Nena',
  totoy: 'Mang Totoy',
  binata: 'Kuya Jun',
  marites: 'Tita Marites',
  tanod: 'Kuya Tanod',
  bata: 'Totoy Bata',
};

export const DURATION = { charge: 25, countdown: 3.2, throw: 3 };
/** Bot powers that hit someone are telegraphed this long before they fire, so players can dodge. */
export const WINDUP = 0.45;
const ROUND_END_TIME = 4;
const PODIUM_TIME = 9;
export const KO_POINTS = 1;
/** Pushing someone out of the circle pays double: it's the riskier play. */
export const RINGOUT_POINTS = 2;
export const COIN_POINTS = 1;
export const LAST_SPINNING_POINTS = 3;
/** Seconds between multo flicks for one knocked-out player. */
export const FLICK_CD = 3;
export const CLOCK_START = 15 * 60 + 30;
export const CLOCK_DUSK = 18 * 60;
const CLOCK_PER_ROUND = 25;
const MAX_PLAYERS = 6;
const MIN_SEATS = 4;
export const STAND_RADIUS = RING_RADIUS + 0.9;
export const READY_RADIUS = 5.5;

const BOT_HANGOUTS: [number, number][] = [
  [-2.2, -5.4],
  [2.4, -5.6],
  [-5.6, -2.6],
  [5.2, 3.6],
  [-4.8, 4.2],
];

/** Where seat `index` of `count` stands around the bilog (world), and its angle. */
export function slotPos(index: number, count: number): { x: number; y: number; angle: number } {
  const angle = (index / count) * Math.PI * 2 + Math.PI / 2;
  return { x: Math.cos(angle) * STAND_RADIUS, y: Math.sin(angle) * STAND_RADIUS, angle };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export class RoundManager {
  players: PlayerInfo[] = [];
  readonly avatars: Record<number, AvatarPose> = {};
  battle: Battle | null = null;
  phase: Phase = 'hub';
  t = 0;
  round = 0;
  clock = CLOCK_START;
  winner = -1;
  startIn = -1;
  timeScale = 1;
  private events: GameEvent[] = [];
  private nextId = 0;
  private accumulator = 0;
  private seats: number[] = [];
  private lastDown: number[] = [];
  private readonly botTimers = new Map<number, number>();
  private readonly windups = new Map<number, number>();
  private readonly flickCd = new Map<number, number>();
  private readonly tumbleCooldown: Record<number, number> = {};
  private rng: () => number;

  constructor(private seed = 1) {
    this.rng = createSeededRandom(seed);
  }

  reseed(seed: number): void {
    this.seed = seed;
    this.rng = createSeededRandom(seed);
  }

  addHuman(name: string, char: string, power = 'kidlat'): number {
    const humans = this.players.filter((p) => !p.bot);
    if (humans.length >= MAX_PLAYERS) return -1;
    // A joining human replaces a bot.
    const bot = this.players.find((p) => p.bot);
    if (bot && this.players.length >= MIN_SEATS) {
      this.players = this.players.filter((p) => p !== bot);
      delete this.avatars[bot.id];
    }
    const id = this.add(name, char, power, false);
    this.fillBots();
    return id;
  }

  removePlayer(id: number): void {
    this.players = this.players.filter((p) => p.id !== id);
    delete this.avatars[id];
    if (this.phase === 'hub') this.fillBots();
  }

  setPaired(id: number, paired: boolean): void {
    const p = this.players.find((pl) => pl.id === id);
    if (p) p.paired = paired;
  }

  handle(id: number, msg: ClientMsg): void {
    const player = this.players.find((p) => p.id === id);
    if (!player) return;
    const top = this.battle?.top(id);
    switch (msg.t) {
      case 'av':
        this.avatars[id] = msg.p;
        break;
      case 'spin':
        if (this.phase !== 'charge' || player.spun) return;
        player.spun = true;
        player.spinPower = clamp01(msg.power);
        player.steadiness = clamp01(msg.stability);
        if (this.seated().every((p) => p.spun)) this.setPhase('countdown');
        break;
      case 'throw':
        if (this.phase !== 'throw' || player.thrown) return;
        this.launch(player, clamp01(msg.power), Math.max(-0.6, Math.min(0.6, Number(msg.angle) || 0)));
        break;
      case 'steer':
        if (top && (this.phase === 'throw' || this.phase === 'fight')) this.battle!.steer(id, msg.x, msg.y);
        break;
      case 'ability':
        if (top && (this.phase === 'throw' || this.phase === 'fight')) this.battle!.ability(id);
        break;
      case 'palo':
        if (top && this.phase === 'fight') this.battle!.palo(id, Number(msg.c) || 0);
        break;
      case 'flick':
        this.flick(id, Number(msg.x), Number(msg.z));
        break;
      case 'power':
        if (this.phase === 'hub' && TOPS.some((t) => t.id === msg.power)) player.power = msg.power;
        break;
      case 'chat':
        if (msg.i >= 0 && msg.i < 8) this.events.push({ type: 'chat', id, i: msg.i });
        break;
      case 'start':
        if (this.phase === 'hub') this.startMatch();
        break;
    }
  }

  step(rawDt: number): void {
    const dt = Math.min(rawDt, 0.1) * this.timeScale;
    this.t += dt;
    for (const key of Object.keys(this.tumbleCooldown)) this.tumbleCooldown[+key] -= dt;
    this.checkTumbles();
    this.runBots(dt);

    if ((this.phase === 'throw' || this.phase === 'fight') && this.battle) this.simulate(dt);

    switch (this.phase) {
      case 'hub':
        this.placeBotsInHub();
        this.updateReady(dt);
        break;
      case 'charge':
        if (this.t >= DURATION.charge) {
          // Too slow: whoever has not spun gets a weak default spin.
          for (const p of this.seated()) if (!p.spun) Object.assign(p, { spun: true, spinPower: 0.2, steadiness: 0.3 });
          this.setPhase('countdown');
        }
        break;
      case 'countdown':
        if (this.t >= DURATION.countdown) this.setPhase('throw');
        break;
      case 'throw':
        if (this.t >= DURATION.throw) {
          for (const p of this.seated()) if (!p.thrown) this.launch(p, 0.15, 0);
          if (this.phase === 'throw') this.setPhase('fight');
        }
        break;
      case 'roundEnd':
        if (this.t >= ROUND_END_TIME) {
          if (this.clock >= CLOCK_DUSK) this.endMatch();
          else this.startRound();
        }
        break;
      case 'podium':
        if (this.t >= PODIUM_TIME) this.setPhase('hub');
        break;
      default:
        break;
    }
  }

  startMatch(): void {
    for (const p of this.players) p.score = 0;
    this.round = 0;
    this.clock = CLOCK_START;
    this.startRound();
  }

  /** Test hook: jump straight to a representative moment of a phase. */
  forcePhase(phase: Phase): void {
    if (phase === 'hub') return this.setPhase('hub');
    this.startMatch();
    if (phase === 'charge') return;
    for (const p of this.seated()) {
      const s = botSpin(this.rng, 0.8);
      Object.assign(p, { spun: true, spinPower: s.power, steadiness: s.stability });
    }
    this.setPhase(phase === 'countdown' ? 'countdown' : 'throw');
    if (phase === 'countdown' || phase === 'throw') return;
    for (const p of this.seated()) {
      const th = botThrow(this.rng, 0.8);
      this.launch(p, th.power, th.angle);
    }
    for (let i = 0; i < 90; i += 1) this.battle!.step(STEP);
    this.battle!.drainEvents();
    this.setPhase('fight');
    if (phase === 'fight') return;
    this.players.forEach((p, i) => (p.score = Math.max(0, 9 - i * 3)));
    this.clock = CLOCK_DUSK + 15;
    this.endMatch();
  }

  snapshot(): Snapshot {
    const S = WORLD_SCALE;
    const timed = (DURATION as Record<string, number>)[this.phase];
    const b = this.battle;
    return {
      phase: this.phase,
      t: this.t,
      left: timed ? Math.max(0, timed - this.t) : 0,
      round: this.round,
      clock: this.clock,
      winner: this.winner,
      startIn: this.startIn,
      seats: this.seats,
      players: this.players,
      tops: b
        ? b.tops.map((tp) => [
            tp.id,
            r2(tp.x * S),
            r2(tp.z * S),
            r3(Math.max(0, tp.spin)),
            r3(tp.wobble),
            +tp.launched,
            +tp.alive,
            +tp.out,
            r2(tp.charge),
            +(tp.shield > 0),
            +(tp.invert > 0),
            +(tp.dash > 0),
          ])
        : [],
      dog: b?.dog ? [r2(b.dog.x * S), r2(b.dog.z * S), Math.sign(b.dog.vx)] : null,
      ring: r2((b ? b.ring : ARENA_R) * S),
      flicks: b ? b.flicks.map((f) => [r2(f.x * S), r2(f.z * S)]) : [],
      coins: b ? b.coins.map((c) => [r2(c.x * S), r2(c.z * S)]) : [],
      mangoes: b ? b.mangoes.map((m) => [r2(m.x * S), r2(m.z * S), r2(m.t)]) : [],
      wind: b?.wind ? [r2(b.wind.dx), r2(b.wind.dz), r2(b.wind.t)] : null,
      mud: b?.mud ? [r2(b.mud.x * S), r2(b.mud.z * S), r2(b.mud.r * S), r2(Math.min(1, b.mud.t / MUD_FADE))] : null,
      avatars: this.avatars,
    };
  }

  drainEvents(): GameEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  private seated(): PlayerInfo[] {
    return this.seats.map((id) => this.players.find((p) => p.id === id)).filter((p): p is PlayerInfo => !!p);
  }

  private add(name: string, char: string, power: string, bot: boolean): number {
    const id = this.nextId++;
    const used = new Set(this.players.map((p) => p.color));
    let color = 0;
    while (used.has(color)) color += 1;
    this.players.push({
      id,
      name: name.slice(0, 14) || BOT_NAMES[char],
      char,
      power: TOPS.some((t) => t.id === power) ? power : TOPS[id % TOPS.length].id,
      bot,
      score: 0,
      color,
      spun: false,
      thrown: false,
      spinPower: 0,
      steadiness: 0,
      paired: false,
    });
    this.avatars[id] = [0, 8, 0, 0];
    return id;
  }

  private fillBots(): void {
    while (this.players.length < MIN_SEATS) {
      const taken = new Set(this.players.map((p) => p.char));
      const char = CHARACTERS.find((c) => !taken.has(c)) ?? CHARACTERS[this.players.length % CHARACTERS.length];
      this.add(BOT_NAMES[char], char, TOPS[this.nextId % TOPS.length].id, true);
    }
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.t = 0;
    for (const id of this.botTimers.keys()) this.botTimers.set(id, 0.6 + this.rng() * 1.6);
    this.events.push({ type: 'phase', phase });
  }

  private startRound(): void {
    this.round += 1;
    this.winner = -1;
    this.startIn = -1;
    this.accumulator = 0;
    this.lastDown = [];
    this.windups.clear();
    this.flickCd.clear();
    this.seats = this.players.map((p) => p.id);
    const n = this.seats.length;
    this.battle = new Battle(
      this.seats.map((id, i) => {
        const p = this.players.find((pl) => pl.id === id)!;
        return { id, char: p.char, power: p.power, seat: slotPos(i, n).angle };
      }),
      this.seed * 1000 + this.round,
    );
    this.seats.forEach((id, i) => {
      const p = this.players.find((pl) => pl.id === id)!;
      Object.assign(p, { spun: false, thrown: false, spinPower: 0, steadiness: 0 });
      this.botTimers.set(id, 0);
      // Humans own their pose; the host only seats bots. Clients seat themselves from the snapshot.
      if (p.bot) {
        const s = slotPos(i, n);
        this.avatars[id] = [s.x, s.y, -s.angle - Math.PI / 2, 0];
      }
    });
    this.setPhase('charge');
  }

  private launch(p: PlayerInfo, power: number, angle: number): void {
    if (!this.battle) return;
    p.thrown = true;
    this.battle.launch(p.id, { spinPower: p.spinPower, steadiness: p.steadiness, throwPower: power, angle });
    if (this.phase === 'throw' && this.seated().every((s) => s.thrown)) this.setPhase('fight');
  }

  private simulate(dt: number): void {
    const b = this.battle!;
    for (const [id, left] of this.windups) {
      if (left - dt > 0) this.windups.set(id, left - dt);
      else {
        b.ability(id);
        this.windups.delete(id);
      }
    }
    this.accumulator += dt;
    while (this.accumulator >= STEP && !b.over) {
      const before = b.alive().map((t) => t.id);
      b.step(STEP);
      const down = before.filter((id) => !b.top(id)!.alive);
      if (down.length) this.lastDown = down;
      if (this.phase === 'fight') b.settle(this.lastDown);
      this.accumulator -= STEP;
    }
    const S = WORLD_SCALE;
    for (const e of b.drainEvents()) {
      if (e.type === 'ability') this.events.push({ ...e, x: e.x * S, z: e.z * S, tx: e.tx * S, tz: e.tz * S });
      else if ('x' in e) this.events.push({ ...e, x: e.x * S, z: e.z * S });
      else this.events.push(e);
      // Knockouts score for whoever last hit the top (within the sim's credit window).
      if ((e.type === 'out' || e.type === 'fall') && e.by >= 0 && e.by !== e.id) {
        const hitter = this.players.find((p) => p.id === e.by);
        if (hitter) {
          const pts = e.type === 'out' ? RINGOUT_POINTS : KO_POINTS;
          hitter.score += pts;
          this.events.push({ type: 'ko', id: e.by, victim: e.id, how: e.type, pts });
        }
      }
      if (e.type === 'coin') {
        const p = this.players.find((pl) => pl.id === e.id);
        if (p) p.score += COIN_POINTS;
      }
    }
    if (b.over && this.phase === 'fight') {
      this.winner = b.winner;
      const champ = this.players.find((p) => p.id === b.winner);
      if (champ) champ.score += LAST_SPINNING_POINTS;
      this.clock += CLOCK_PER_ROUND;
      this.events.push({ type: 'roundWin', id: b.winner });
      this.setPhase('roundEnd');
    }
  }

  private runBots(dt: number): void {
    const b = this.battle;
    for (const p of this.seated()) {
      if (!p.bot) continue;
      const left = (this.botTimers.get(p.id) ?? 0) - dt;
      this.botTimers.set(p.id, left);
      if (this.phase === 'charge' && !p.spun && left < -2) {
        const s = botSpin(this.rng, botSkill(p.id));
        this.handle(p.id, { t: 'spin', power: s.power, stability: s.stability });
      } else if (this.phase === 'throw' && !p.thrown && left <= 0) {
        const th = botThrow(this.rng, botSkill(p.id));
        this.handle(p.id, { t: 'throw', power: th.power, angle: th.angle });
      } else if (this.phase === 'fight' && b && left <= 0) {
        this.botTimers.set(p.id, 0.2);
        const me = b.top(p.id);
        if (me && me.launched && !me.alive) {
          // Out bots haunt the leader with their multo.
          const leader = b.alive().reduce<typeof me | null>((best, t) => {
            const sc = this.players.find((pl) => pl.id === t.id)?.score ?? 0;
            const bs = best ? (this.players.find((pl) => pl.id === best.id)?.score ?? 0) : -1;
            return sc > bs ? t : best;
          }, null);
          if (leader && this.rng() < 0.35) this.flick(p.id, leader.x * WORLD_SCALE, leader.z * WORLD_SCALE);
          continue;
        }
        if (!me || !me.alive || !me.launched) continue;
        const d = botSteer(b, me, this.rng);
        b.steer(p.id, d.x, d.y);
        if (d.palo) b.palo(p.id, d.paloCharge);
        if (d.ability && !this.windups.has(p.id)) {
          const target = b.nearestRival(me);
          // Powers that strike a rival are telegraphed so the target can react.
          if (target && (me.power === 'kidlat' || me.power === 'tikbalang' || me.power === 'bakunawa')) {
            this.windups.set(p.id, WINDUP);
            this.events.push({ type: 'windup', id: p.id, x: target.x * WORLD_SCALE, z: target.z * WORLD_SCALE });
          } else b.ability(p.id);
        }
      }
    }
  }

  /** Multo flick: only a seated player whose top is already out, once per FLICK_CD. Thrown from outside their own seat. */
  private flick(id: number, x: number, z: number): void {
    const b = this.battle;
    const top = b?.top(id);
    if (!b || this.phase !== 'fight' || !top || !top.launched || top.alive) return;
    if (!Number.isFinite(x) || !Number.isFinite(z) || (this.flickCd.get(id) ?? 0) > this.t) return;
    this.flickCd.set(id, this.t + FLICK_CD);
    const from = ARENA_R + 0.8;
    b.flick(id, Math.cos(top.seat) * from, Math.sin(top.seat) * from, x / WORLD_SCALE, z / WORLD_SCALE);
  }

  private endMatch(): void {
    const best = [...this.players].sort((a, b) => b.score - a.score)[0];
    this.winner = best?.id ?? -1;
    this.events.push({ type: 'matchEnd', id: this.winner });
    this.setPhase('podium');
  }

  private updateReady(dt: number): void {
    const humans = this.players.filter((p) => !p.bot);
    const ready =
      humans.length > 0 &&
      humans.every((p) => {
        const a = this.avatars[p.id];
        return a && Math.hypot(a[0], a[1]) < READY_RADIUS;
      });
    if (!ready) {
      this.startIn = -1;
      return;
    }
    this.startIn = this.startIn < 0 ? 3 : this.startIn - dt;
    if (this.startIn <= 0) this.startMatch();
  }

  private placeBotsInHub(): void {
    let i = 0;
    for (const p of this.players) {
      if (!p.bot) continue;
      const [x, z] = BOT_HANGOUTS[i++ % BOT_HANGOUTS.length];
      this.avatars[p.id] = [x, z, Math.atan2(-x, -z), 0];
    }
  }

  private checkTumbles(): void {
    const ids = Object.keys(this.avatars).map(Number);
    for (const a of ids) {
      const pa = this.avatars[a];
      if (!(pa[3] & AV_DASH)) continue;
      for (const b of ids) {
        if (a === b || (this.tumbleCooldown[b] ?? 0) > 0) continue;
        const pb = this.avatars[b];
        if (pb[3] & AV_TUMBLE) continue;
        if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 0.75) {
          this.tumbleCooldown[b] = 2;
          this.events.push({ type: 'tumble', id: b });
        }
      }
    }
  }
}

function botSkill(id: number): number {
  return 0.45 + ((id * 37) % 40) / 100;
}
