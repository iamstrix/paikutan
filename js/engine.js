// Match flow (lobby -> pick -> rounds -> champion) on top of sim.js. No DOM.
// The host page runs one Engine; phones send it messages through handle().
import { CHARACTERS, TOPS } from './data.js';
import { createWorld, launch, step, snapshot, STEP, toLocal } from './sim.js';

export const WIN_ROUNDS = 2; // best of 3
const DURATION = { vs: 3.5, charge: 25, countdown: 3.2, throw: 3, roundEnd: 3, counter: 8 };

const pickRandom = list => list[Math.floor(Math.random() * list.length)].id;
const rnd = (a, b) => a + Math.random() * (b - a);
const clean = s => String(s || '').replace(/[<>&"]/g, '').trim().slice(0, 14);

export class Engine {
  // emit(type, payload): 'state' on every phase/player change, 'snap' every sim frame, 'fx' for sim events.
  constructor(emit) {
    this.emit = emit;
    this.players = [null, null];
    this.round = 0;
    this.scores = [0, 0];
    this.world = null;
    this.result = null;
    this.acc = 0;
    this.cpuT = [0, 0];
    this.switched = null; // last counterpick: { slot, from, to }
    this.go('lobby');
  }

  slotOf(id) { return this.players.findIndex(p => p && p.id === id); }

  state() {
    return {
      phase: this.phase, timer: Math.max(0, Math.round(this.timer * 10) / 10), round: this.round,
      scores: this.scores, result: this.result, switched: this.switched,
      players: this.players.map(p => p && {
        id: p.id, name: p.name, kind: p.kind, char: p.char, top: p.top, picked: p.picked,
        spun: !!p.spun, spinPower: p.spun ? p.spun.power : 0, steadiness: p.spun ? p.spun.stability : 0,
        thrown: p.thrown, rematch: p.rematch,
      }),
    };
  }

  changed() { this.emit('state', this.state()); }

  go(phase) {
    this.phase = phase;
    this.timer = DURATION[phase] || 0;
    const ps = this.players.filter(Boolean);
    if (phase === 'pick') ps.forEach(p => { p.picked = false; p.rematch = false; });
    if (phase === 'vs') { this.round = 0; this.scores = [0, 0]; this.result = null; }
    if (phase === 'vs' || phase === 'counter') this.switched = null;
    if (phase === 'charge') {
      this.round++;
      this.world = null;
      this.result = null;
      ps.forEach(p => { p.spun = null; p.thrown = false; p.laps = 0; });
    }
    if (phase === 'countdown') this.world = createWorld(this.players[0], this.players[1]);
    if (phase === 'roundEnd') {
      const w = this.world;
      if (w.winner >= 0) this.scores[w.winner]++;
      this.result = { winner: w.winner, reason: w.reason };
      // A draw is replayed, so it does not count as a round.
      if (w.winner < 0) this.round--;
    }
    if (phase === 'matchEnd') this.result = { ...this.result, champion: this.scores[0] > this.scores[1] ? 0 : 1 };
    this.cpuT = [rnd(0.6, 1.6), rnd(0.6, 1.6)];
    this.changed();
  }

  join(id, name, kind = 'remote') {
    let s = this.slotOf(id);
    if (s < 0) {
      s = this.players.findIndex(p => !p);
      if (s < 0) return -1;
      this.players[s] = { id, kind, name: clean(name) || `Player ${s + 1}`, char: CHARACTERS[s * 2].id,
        top: TOPS[s].id, picked: false, spun: null, thrown: false, laps: 0, rematch: false };
    } else if (name) this.players[s].name = clean(name);
    if (this.phase === 'lobby' && this.players.every(Boolean)) this.go('pick');
    else this.changed();
    return s;
  }

  leave(id) {
    const s = this.slotOf(id);
    if (s < 0) return;
    this.players[s] = null;
    this.world = null;
    this.go('lobby');
  }

  // One entry point for every player message, local or from the network.
  handle(id, type, p = {}) {
    const s = this.slotOf(id);
    if (type === 'hello') return this.join(id, p.name, p.kind || 'remote');
    if (s < 0) return;
    const pl = this.players[s], tp = this.world && this.world.tops[s];
    switch (type) {
      case 'pick':
        if (this.phase !== 'pick') return;
        if (CHARACTERS.some(c => c.id === p.char)) pl.char = p.char;
        if (TOPS.some(t => t.id === p.top)) pl.top = p.top;
        pl.picked = !!p.ready;
        if (this.players.every(x => x && x.picked)) this.go('vs');
        else this.changed();
        break;
      case 'prog':
        if (this.phase === 'charge') pl.laps = +p.laps || 0;
        break;
      case 'spin':
        if (this.phase !== 'charge' || pl.spun) return;
        pl.spun = { power: clamp01(p.power), stability: clamp01(p.stability) };
        if (this.players.every(x => x.spun)) this.go('countdown');
        else this.changed();
        break;
      case 'throw':
        if (this.phase !== 'throw' || pl.thrown) return;
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
        if (this.phase !== 'counter' || !this.result || s !== 1 - this.result.winner) return;
        const from = pl.top;
        if (TOPS.some(t => t.id === p.top)) pl.top = p.top;
        this.switched = { slot: s, from, to: pl.top };
        this.go('charge');
        break;
      }
      case 'rematch':
        if (this.phase !== 'matchEnd') return;
        pl.rematch = true;
        if (this.players.every(x => x.rematch)) this.go('pick');
        else this.changed();
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
    if (this.players.every(x => x.thrown)) this.go('fight');
    else this.changed();
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    this.timer -= dt;
    this.runCpu(dt);
    const ph = this.phase;
    if (ph === 'vs' && this.timer <= 0) this.go('charge');
    else if (ph === 'charge' && this.timer <= 0) {
      // Too slow: whoever has not spun gets a weak default spin.
      this.players.forEach(p => { if (!p.spun) p.spun = { power: 0.2, stability: 0.3 }; });
      this.go('countdown');
    } else if (ph === 'countdown' && this.timer <= 0) this.go('throw');
    else if (ph === 'roundEnd' && this.timer <= 0) {
      // A replayed draw has no loser, so there is no counterpick.
      this.go(Math.max(...this.scores) >= WIN_ROUNDS ? 'matchEnd' : this.result.winner >= 0 ? 'counter' : 'charge');
    } else if (ph === 'counter' && this.timer <= 0) this.go('charge');
    if (ph === 'throw' && this.timer <= 0) {
      this.players.forEach((p, s) => { if (!p.thrown) this.throwTop(s, 0.15, 0); });
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

  // Simple opponent for practice and the title-screen demo.
  runCpu(dt) {
    this.players.forEach((p, s) => {
      if (!p || p.kind !== 'cpu') return;
      this.cpuT[s] -= dt;
      const ready = this.cpuT[s] <= 0;
      const ph = this.phase;
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
      } else if (ph === 'matchEnd' && this.cpuT[s] < -3 && !p.rematch) {
        this.handle(p.id, 'rematch');
      }
    });
  }

  cpuSteer(s) {
    const w = this.world, me = w.tops[s], op = w.tops[1 - s];
    if (!me.launched || !me.alive) return;
    let tx, tz;
    if (!op.launched || !op.alive) { tx = -me.x; tz = -me.z; }
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
      const near = op.launched && op.alive && Math.hypot(op.x - me.x, op.z - me.z) < 2.2;
      if (edge > 0.8 || (dodging && dog.warn < 0.8) || (near && me.spin > op.spin - 0.05 && Math.random() < 0.3)) me.wantBoost = true;
    }
    if (me.charge >= 1 && Math.random() < 0.25) {
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
