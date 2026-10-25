// Match flow (lobby -> pick -> rounds -> champion) on top of sim.js. No DOM.
// The host page runs one Engine; phones send it messages through handle().
// Two modes: '1v1' (best of 3 with counterpicks) and 'brawl' (up to 8 trumpos, points over 3 rounds).
import { CHARACTERS, TOPS } from './data.js';
import { createWorld, launch, step, snapshot, forfeit, rivalOf, STEP, toLocal, MAX_SEATS } from './sim.js';

export const WIN_ROUNDS = 2; // best of 3
export const BRAWL_ROUNDS = 3;
export const BRAWL_MAX = MAX_SEATS;
// Brawl points: the last top spinning, and each knockout (the last rival to hit a top before it went down).
export const BRAWL_WIN_PTS = 2, BRAWL_KO_PTS = 1;
const DURATION = { vs: 3.5, charge: 25, countdown: 3.2, throw: 3, roundEnd: 3, counter: 8 };
// Brawl picks are timed so one idle phone cannot hold up the room, with longer before the first round.
const BRAWL_PICK = { first: 30, between: 12 };
const CPU_NAMES = ['Kulas', 'Ising', 'Berto', 'Inday', 'Nonoy', 'Tisay', 'Totoy', 'Bebang'];

const pickRandom = list => list[Math.floor(Math.random() * list.length)].id;
const rnd = (a, b) => a + Math.random() * (b - a);
const clean = s => String(s || '').replace(/[<>&"]/g, '').trim().slice(0, 14);

export class Engine {
  // emit(type, payload): 'state' on every phase/player change, 'snap' every sim frame, 'fx' for sim events.
  constructor(emit, { mode = '1v1' } = {}) {
    this.emit = emit;
    this.mode = mode;
    this.brawl = mode === 'brawl';
    this.players = Array(this.brawl ? BRAWL_MAX : 2).fill(null);
    this.round = 0;
    this.scores = this.players.map(() => 0); // rounds won
    this.points = this.players.map(() => 0); // brawl only
    this.world = null;
    this.result = null;
    this.acc = 0;
    this.cpuT = this.players.map(() => 0);
    this.cpuN = 0;
    this.switched = null; // last counterpick: { slot, from, to }
    this.go('lobby');
  }

  slotOf(id) { return this.players.findIndex(p => p && p.id === id); }
  present() { return this.players.filter(Boolean); }
  // Players in the current round. In a brawl, anyone who joins mid-round waits for the next one.
  entrants() { return this.players.filter(p => p && p.inRound); }

  state() {
    return {
      mode: this.mode, phase: this.phase, timer: Math.max(0, Math.round(this.timer * 10) / 10), round: this.round,
      rounds: this.brawl ? BRAWL_ROUNDS : WIN_ROUNDS * 2 - 1,
      scores: this.scores, points: this.points, result: this.result, switched: this.switched,
      players: this.players.map(p => p && {
        id: p.id, name: p.name, kind: p.kind, char: p.char, top: p.top, picked: p.picked,
        spun: !!p.spun, spinPower: p.spun ? p.spun.power : 0, steadiness: p.spun ? p.spun.stability : 0,
        thrown: p.thrown, rematch: p.rematch, inRound: !!p.inRound,
      }),
    };
  }

  changed() { this.emit('state', this.state()); }

  go(phase) {
    this.phase = phase;
    this.timer = DURATION[phase] || 0;
    const ps = this.present();
    if (phase === 'pick') {
      ps.forEach(p => { p.picked = false; p.rematch = false; });
      if (this.brawl) this.timer = this.round > 0 ? BRAWL_PICK.between : BRAWL_PICK.first;
    }
    if (phase === 'vs') { this.round = 0; this.scores.fill(0); this.points.fill(0); this.result = null; }
    if (phase === 'vs' || phase === 'counter') this.switched = null;
    if (phase === 'charge') {
      this.round++;
      this.world = null;
      this.result = null;
      ps.forEach(p => { p.spun = null; p.thrown = false; p.laps = 0; p.inRound = true; });
    }
    if (phase === 'countdown') this.world = createWorld(this.players.map(p => (p && p.inRound ? p : null)));
    if (phase === 'roundEnd') {
      const w = this.world;
      if (w.winner >= 0) this.scores[w.winner]++;
      this.result = { winner: w.winner, reason: w.reason };
      if (this.brawl) {
        if (w.winner >= 0) this.points[w.winner] += BRAWL_WIN_PTS;
        const kos = w.elim.filter(e => e.by >= 0 && this.players[e.by]);
        kos.forEach(e => { this.points[e.by] += BRAWL_KO_PTS; });
        this.result.kos = kos;
      }
      // A draw is replayed, so it does not count as a round.
      if (w.winner < 0) this.round--;
    }
    if (phase === 'matchEnd') this.result = { ...this.result, champion: this.champion() };
    this.cpuT = this.players.map(() => rnd(0.6, 1.6));
    this.changed();
  }

  // 1v1: more rounds won. Brawl: most points, then most rounds won.
  champion() {
    if (!this.brawl) return this.scores[0] > this.scores[1] ? 0 : 1;
    let best = -1;
    this.players.forEach((p, s) => {
      if (!p) return;
      const more = best < 0 || this.points[s] > this.points[best]
        || (this.points[s] === this.points[best] && this.scores[s] > this.scores[best]);
      if (more) best = s;
    });
    return best;
  }

  join(id, name, kind = 'remote') {
    let s = this.slotOf(id);
    if (s < 0) {
      s = this.players.findIndex(p => !p);
      if (s < 0) return -1;
      this.players[s] = { id, kind, name: clean(name) || `Player ${s + 1}`, char: CHARACTERS[(s * 2) % CHARACTERS.length].id,
        top: TOPS[s % TOPS.length].id, picked: false, spun: null, thrown: false, laps: 0, rematch: false, inRound: false };
      this.scores[s] = 0; this.points[s] = 0;
    } else if (name) this.players[s].name = clean(name);
    // 1v1 starts as soon as both seats fill; a brawl waits for the host's Start.
    if (!this.brawl && this.phase === 'lobby' && this.players.every(Boolean)) this.go('pick');
    else this.changed();
    return s;
  }

  // Brawl lobby: fill a seat with a CPU player.
  addCpu() {
    if (!this.brawl || !this.players.includes(null)) return -1;
    const used = new Set(this.present().map(p => p.name));
    const name = CPU_NAMES.find(n => !used.has(n)) || 'CPU';
    return this.join(`cpu-${++this.cpuN}`, name, 'cpu');
  }

  canStart() { return this.brawl && this.phase === 'lobby' && this.present().length >= 2; }
  start() { if (this.canStart()) this.go('pick'); }

  leave(id) {
    const s = this.slotOf(id);
    if (s < 0) return;
    this.players[s] = null;
    if (!this.brawl || this.present().length < 2) {
      this.world = null;
      this.go('lobby');
      return;
    }
    // A brawl carries on without them: their top counts as out, and nobody waits on them.
    if (this.world) forfeit(this.world, s);
    this.advance();
  }

  // Moves on once everyone the current phase is waiting for is done.
  advance() {
    const ph = this.phase;
    if (ph === 'pick' && this.present().every(x => x.picked)) this.go(this.brawl && this.round > 0 ? 'charge' : 'vs');
    else if (ph === 'charge' && this.entrants().every(x => x.spun)) this.go('countdown');
    else if (ph === 'throw' && this.entrants().every(x => x.thrown)) this.go('fight');
    else if (ph === 'matchEnd' && this.present().every(x => x.rematch)) this.rematch();
    else this.changed();
  }

  rematch() {
    this.round = 0;
    this.go('pick');
  }

  // One entry point for every player message, local or from the network.
  handle(id, type, p = {}) {
    const s = this.slotOf(id);
    if (type === 'hello') return this.join(id, p.name, p.kind || 'remote');
    if (s < 0) return;
    const pl = this.players[s], tp = this.world && pl.inRound && this.world.tops[s];
    switch (type) {
      case 'pick':
        if (this.phase !== 'pick') return;
        if (CHARACTERS.some(c => c.id === p.char)) pl.char = p.char;
        if (TOPS.some(t => t.id === p.top)) pl.top = p.top;
        pl.picked = !!p.ready;
        this.advance();
        break;
      case 'prog':
        if (this.phase === 'charge') pl.laps = +p.laps || 0;
        break;
      case 'spin':
        if (this.phase !== 'charge' || pl.spun || !pl.inRound) return;
        pl.spun = { power: clamp01(p.power), stability: clamp01(p.stability) };
        this.advance();
        break;
      case 'throw':
        if (this.phase !== 'throw' || pl.thrown || !pl.inRound) return;
        this.throwTop(s, clamp01(p.power), Math.max(-0.6, Math.min(0.6, +p.angle || 0)));
        break;
      case 'steer':
        if (tp) { tp.sx = clampN(p.x); tp.sy = clampN(p.y); }
        break;
      case 'ability':
        if (tp && (this.phase === 'fight' || this.phase === 'throw')) tp.wantAbility = true;
        break;
      case 'boost':
        if (tp && (this.phase === 'fight' || this.phase === 'throw')) tp.wantBoost = true;
        break;
      case 'counter': {
        // Only the loser of the last round may switch; the winner stays locked.
        if (this.brawl || this.phase !== 'counter' || !this.result || s !== 1 - this.result.winner) return;
        const from = pl.top;
        if (TOPS.some(t => t.id === p.top)) pl.top = p.top;
        this.switched = { slot: s, from, to: pl.top };
        this.go('charge');
        break;
      }
      case 'rematch':
        if (this.phase !== 'matchEnd') return;
        pl.rematch = true;
        this.advance();
        break;
      case 'leave':
        this.leave(id);
        break;
    }
  }

  throwTop(s, power, angle) {
    const pl = this.players[s];
    pl.thrown = true;
    launch(this.world, s, { spinPower: pl.spun.power, steadiness: pl.spun.stability, throwPower: power, angle });
    this.advance();
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    this.timer -= dt;
    this.runCpu(dt);
    const ph = this.phase;
    if (ph === 'pick' && this.brawl && this.timer <= 0) {
      // Out of time: everyone still choosing goes with what they have.
      this.present().forEach(p => { p.picked = true; });
      this.advance();
    } else if (ph === 'vs' && this.timer <= 0) this.go('charge');
    else if (ph === 'charge' && this.timer <= 0) {
      // Too slow: whoever has not spun gets a weak default spin.
      this.entrants().forEach(p => { if (!p.spun) p.spun = { power: 0.2, stability: 0.3 }; });
      this.go('countdown');
    } else if (ph === 'countdown' && this.timer <= 0) this.go('throw');
    else if (ph === 'roundEnd' && this.timer <= 0) {
      if (this.brawl) this.go(this.round >= BRAWL_ROUNDS ? 'matchEnd' : 'pick');
      // A replayed draw has no loser, so there is no counterpick.
      else this.go(Math.max(...this.scores) >= WIN_ROUNDS ? 'matchEnd' : this.result.winner >= 0 ? 'counter' : 'charge');
    } else if (ph === 'counter' && this.timer <= 0) this.go('charge');
    if (ph === 'throw' && this.timer <= 0) {
      this.players.forEach((p, s) => { if (p && p.inRound && !p.thrown) this.throwTop(s, 0.15, 0); });
      if (this.phase === 'throw') this.go('fight');
    }
    if ((this.phase === 'throw' || this.phase === 'fight') && this.world) {
      this.acc += dt;
      while (this.acc >= STEP) { step(this.world, STEP); this.acc -= STEP; }
      if (this.world.events.length) { this.emit('fx', this.world.events); this.world.events = []; }
      this.emit('snap', snapshot(this.world));
      if (this.world.over) this.go('roundEnd');
    }
  }

  // Simple opponent for practice, the title-screen demo and filling brawl seats.
  runCpu(dt) {
    this.players.forEach((p, s) => {
      if (!p || p.kind !== 'cpu') return;
      this.cpuT[s] -= dt;
      const ready = this.cpuT[s] <= 0;
      const ph = this.phase;
      if (!p.inRound && ['charge', 'throw', 'fight'].includes(ph)) return;
      if (ph === 'pick' && ready && !p.picked) {
        this.handle(p.id, 'pick', { char: pickRandom(CHARACTERS), top: pickRandom(TOPS), ready: true });
      } else if (ph === 'charge' && !p.spun) {
        p.laps += dt * 2;
        if (this.cpuT[s] < -2) this.handle(p.id, 'spin', { power: rnd(0.55, 0.9), stability: rnd(0.5, 0.9) });
      } else if (ph === 'throw' && ready && !p.thrown) {
        this.handle(p.id, 'throw', { power: rnd(0.5, 0.9), angle: rnd(-0.25, 0.25) });
      } else if (ph === 'fight' && ready) {
        this.cpuT[s] = 0.2;
        this.cpuSteer(s);
      } else if (ph === 'counter' && ready && this.result && s === 1 - this.result.winner) {
        const c = TOPS.find(t => t.strong === this.players[this.result.winner].top);
        this.handle(p.id, 'counter', { top: c && Math.random() < 0.7 ? c.id : p.top });
      } else if (ph === 'matchEnd' && this.cpuT[s] < -3 && !p.rematch && !this.brawl) {
        // In a brawl the host starts the rematch.
        this.handle(p.id, 'rematch');
      }
    });
  }

  cpuSteer(s) {
    // In a brawl the CPU fights whoever is nearest.
    const w = this.world, me = w.tops[s], op = rivalOf(w, me);
    if (!me.launched || !me.alive) return;
    let tx, tz;
    if (!op || !op.launched || !op.alive) { tx = -me.x; tz = -me.z; }
    else if (me.spin > op.spin - 0.05 || me.dash > 0) { tx = op.x - me.x; tz = op.z - me.z; }
    else {
      // Losing on spin: circle around the middle and avoid contact.
      const ang = Math.atan2(me.z, me.x) + 0.8;
      tx = Math.cos(ang) * 2.5 - me.x; tz = Math.sin(ang) * 2.5 - me.z;
    }
    let m = Math.hypot(tx, tz) || 1;
    tx /= m; tz /= m;
    // Steer round eggs (and where a hen is about to lay one) when they are close.
    for (const egg of w.eggs) {
      const ex = me.x - egg.x, ez = me.z - egg.z, d = Math.hypot(ex, ez) || 1;
      if (d < 1.6) { tx += (ex / d) * (1.6 - d); tz += (ez / d) * (1.6 - d); }
    }
    // Get out of the stray dog's lane while it waits, and while it is still coming.
    const dog = w.dog;
    let dodging = false;
    if (dog && (dog.warn > 0 || Math.sign(me.x - dog.x) === Math.sign(dog.vx)) && Math.abs(me.z - dog.z) < 1.5) {
      tx = 0; tz = Math.sign(me.z - dog.z || -me.z || 1);
      dodging = true;
    }
    // The edge is relative to the circle, which shrinks late in the round.
    const edge = Math.hypot(me.x, me.z) / w.ring;
    if (edge > 0.76) { tx = -me.x; tz = -me.z; }
    m = Math.hypot(tx, tz) || 1;
    const [lx, ly] = toLocal(s, tx / m, tz / m);
    // Under Bakunawa's eclipse a person catches on after a second or so and steers the other way.
    const flip = me.invert > 0 && me.invert < 3.5 ? -1 : 1;
    me.sx = lx * 0.8 * flip; me.sy = ly * 0.8 * flip;
    // Dash back from the edge, out of the dog's way, or to press an attack when ahead on spin.
    if (me.boostCd <= 0 && me.spin > 0.35) {
      const near = op && op.launched && op.alive && Math.hypot(op.x - me.x, op.z - me.z) < 2.2;
      if (edge > 0.8 || (dodging && dog.warn < 0.8) || (near && me.spin > op.spin - 0.05 && Math.random() < 0.3)) me.wantBoost = true;
    }
    if (op && me.charge >= 1 && Math.random() < 0.25) {
      const d = Math.hypot(op.x - me.x, op.z - me.z);
      // Time the powers the way a person would: Tikbalang when close, Diwata when cursed or shaky,
      // Bakunawa to break a stampede, never into a shield.
      const go = {
        tikbalang: d < 3.5,
        diwata: me.invert > 0 || me.wobble > 0.4 || me.spin < op.spin - 0.08,
        bakunawa: op.dash > 0 || op.shield <= 0,
      }[me.top];
      if (go !== false) me.wantAbility = true;
    }
  }
}

function clamp01(v) { v = +v; return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }
function clampN(v) { v = +v; return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; }
