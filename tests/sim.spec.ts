import { expect, test } from '@playwright/test';
import { botSpin, botSteer, botThrow } from '../src/sim/Bot';
import { ARENA_R, Battle, PALO_COST, PALO_CD, SQUEEZE_END, SQUEEZE_MIN, SQUEEZE_START, toLocal, toWorld, type LaunchInput } from '../src/sim/TrompoSim';
import { createSeededRandom } from '../src/utils/random';

// Pure checks of the ported paikutan battle physics; no browser page is opened.
// Inputs are hand-built, proving the sim does not depend on any input device.

const seats = (n: number) => Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2 + Math.PI / 2);
const make = (n: number, seed = 1, power = 'diwata') =>
  new Battle(
    seats(n).map((seat, id) => ({ id, char: 'tanod', power, seat })),
    seed,
  );
const good: LaunchInput = { spinPower: 1, steadiness: 1, throwPower: 0.3, angle: 0 };
const run = (b: Battle, seconds: number) => {
  for (let i = 0; i < seconds * 60; i += 1) b.step();
};

test('seat frames: local "away" points at the centre for every seat', () => {
  for (const seat of seats(5)) {
    const [wx, wz] = toWorld(seat, 0, 1);
    expect(wx).toBeCloseTo(-Math.cos(seat), 5);
    expect(wz).toBeCloseTo(-Math.sin(seat), 5);
    const [lx, ly] = toLocal(seat, wx, wz);
    expect(lx).toBeCloseTo(0, 5);
    expect(ly).toBeCloseTo(1, 5);
  }
});

test('a lone good throw spins a long time, then topples', () => {
  const b = make(2);
  b.launch(0, good);
  run(b, 20);
  expect(b.top(0)!.alive).toBe(true);
  run(b, 120);
  expect(b.top(0)!.alive).toBe(false);
  expect(b.top(0)!.out).toBe(false);
});

test('steering hard outward rings a top out', () => {
  const b = make(2);
  b.launch(0, good);
  b.steer(0, 0, -1); // backwards = away from the centre
  run(b, 6);
  const t = b.top(0)!;
  expect(t.alive).toBe(false);
  expect(t.out).toBe(true);
  expect(Math.hypot(t.x, t.z)).toBeGreaterThan(ARENA_R);
});

test('four tops collide pairwise and the round resolves to one winner', () => {
  const b = make(4, 3);
  const rng = createSeededRandom(9);
  for (const t of b.tops) {
    const s = botSpin(rng, 0.6);
    const th = botThrow(rng, 0.6);
    b.launch(t.id, { spinPower: s.power, steadiness: s.stability, throwPower: th.power, angle: th.angle });
  }
  let hits = 0;
  const pairs = new Set<string>();
  for (let i = 0; i < 95 * 60 && !b.over; i += 1) {
    for (const t of b.alive()) {
      const d = botSteer(b, t, rng);
      b.steer(t.id, d.x, d.y);
      if (d.ability) b.ability(t.id);
    }
    const before = b.alive().map((t) => t.id);
    b.step();
    for (const e of b.drainEvents()) {
      if (e.type === 'hit') {
        hits += 1;
        pairs.add([e.a, e.b].sort().join('-'));
      }
    }
    const downNow = before.filter((id) => !b.top(id)!.alive);
    b.settle(downNow);
  }
  expect(hits).toBeGreaterThan(0);
  expect(b.over).toBe(true);
  expect(b.winner).toBeGreaterThanOrEqual(-1);
  expect(pairs.size).toBeGreaterThan(0);
});

test('kidlat strikes the nearest rival and costs it spin', () => {
  const b = make(2, 1, 'kidlat');
  b.launch(0, good);
  b.launch(1, good);
  run(b, 1);
  const before = b.top(1)!.spin;
  b.top(0)!.charge = 1;
  b.ability(0);
  b.step();
  const ev = b.drainEvents().find((e) => e.type === 'ability');
  expect(ev).toBeTruthy();
  expect(b.top(1)!.spin).toBeLessThan(before - 0.05);
});

test('same seed and inputs give identical results', () => {
  const play = () => {
    const b = make(5, 42);
    const rng = createSeededRandom(7);
    for (const t of b.tops) {
      const s = botSpin(rng, 0.5);
      const th = botThrow(rng, 0.5);
      b.launch(t.id, { spinPower: s.power, steadiness: s.stability, throwPower: th.power, angle: th.angle });
    }
    for (let i = 0; i < 30 * 60; i += 1) {
      for (const t of b.alive()) {
        const d = botSteer(b, t, rng);
        b.steer(t.id, d.x, d.y);
      }
      b.step();
    }
    return JSON.stringify(b.tops);
  };
  expect(play()).toBe(play());
});

test('palo dashes, costs spin, and has a cooldown', () => {
  const b = make(2);
  b.launch(0, good);
  b.launch(1, good);
  run(b, 2);
  b.drainEvents();
  const t = b.top(0)!;
  const spin = t.spin;
  b.palo(0);
  b.palo(0); // still cooling down: ignored
  expect(b.drainEvents().filter((e) => e.type === 'palo')).toHaveLength(1);
  expect(t.spin).toBeCloseTo(spin - PALO_COST, 5);
  expect(t.paloCd).toBe(PALO_CD);
  expect(Math.hypot(t.vx, t.vz)).toBeGreaterThan(3);
});

test('landing grace: freshly thrown tops do not clash, then they do', () => {
  const b = make(2);
  b.launch(0, good);
  b.launch(1, good);
  const [a, c] = [b.top(0)!, b.top(1)!];
  const overlap = () => {
    a.x = 0;
    a.z = 0;
    c.x = 0.1;
    c.z = 0;
    a.vx = 2;
    c.vx = -2;
  };
  overlap();
  b.step();
  expect(b.drainEvents().some((e) => e.type === 'hit')).toBe(false);
  run(b, 2);
  b.drainEvents();
  overlap();
  b.step();
  expect(b.drainEvents().some((e) => e.type === 'hit')).toBe(true);
});

test('the circle squeezes from SQUEEZE_START to SQUEEZE_END', () => {
  const b = make(2);
  b.launch(0, good);
  run(b, SQUEEZE_START - 0.5);
  expect(b.ring).toBe(ARENA_R);
  b.drainEvents();
  run(b, 1);
  expect(b.drainEvents().some((e) => e.type === 'squeeze')).toBe(true);
  expect(b.ring).toBeLessThan(ARENA_R);
  run(b, SQUEEZE_END - SQUEEZE_START);
  expect(b.ring).toBeCloseTo(ARENA_R * SQUEEZE_MIN, 5);
});

test('a multo flick bumps a live top', () => {
  const b = make(2);
  b.launch(0, good);
  run(b, 2);
  const t = b.top(0)!;
  // Parked in the bowl's centre so the test is about the flick, not about aiming.
  t.x = t.z = t.vx = t.vz = 0;
  b.flick(1, ARENA_R + 0.8, 0, 0, 0);
  let hit = false;
  for (let i = 0; i < 100 && !hit; i += 1) {
    b.step();
    hit = b.drainEvents().some((e) => e.type === 'flickHit' && e.id === 0);
  }
  expect(hit).toBe(true);
});

test('a charged palo is faster and costs more than a tap', () => {
  const dash = (c: number) => {
    const b = make(2);
    b.launch(0, good);
    b.launch(1, good);
    run(b, 2);
    const t = b.top(0)!;
    t.vx = t.vz = 0;
    const spin = t.spin;
    b.palo(0, c);
    return { speed: Math.hypot(t.vx, t.vz), cost: spin - t.spin };
  };
  const tap = dash(0);
  const full = dash(1);
  expect(full.speed).toBeGreaterThan(tap.speed * 1.4);
  expect(full.cost).toBeGreaterThan(tap.cost * 3);
});

test('rolling over a rim coin picks it up', () => {
  const b = make(2);
  b.launch(0, good);
  run(b, 2);
  const t = b.top(0)!;
  b.coins.push({ x: t.x, z: t.z });
  b.drainEvents();
  b.step();
  expect(b.drainEvents().some((e) => e.type === 'coin' && e.id === 0)).toBe(true);
  expect(b.coins).toHaveLength(0);
});

test('a mango warns, lands on a top, then lies there as a bump', () => {
  const b = make(2);
  b.launch(0, good);
  run(b, 2);
  const t = b.top(0)!;
  t.x = t.z = t.vx = t.vz = 0;
  b.mangoes.push({ x: 0.3, z: 0, t: -0.1 });
  const spin = t.spin;
  let landed = false;
  for (let i = 0; i < 20 && !landed; i += 1) {
    b.step();
    landed = b.drainEvents().some((e) => e.type === 'mango');
  }
  expect(landed).toBe(true);
  expect(t.spin).toBeLessThan(spin - 0.01);
  expect(b.mangoes[0].t).toBeGreaterThan(0);
});

test('a gust pushes tops along its direction, and mud kills grip', () => {
  const drift = (setup: (b: Battle) => void) => {
    const b = make(2);
    b.launch(0, good);
    run(b, 2);
    const t = b.top(0)!;
    t.x = t.z = t.vx = t.vz = 0;
    setup(b);
    run(b, 0.5);
    return t;
  };
  const calm = drift(() => {});
  const windy = drift((b) => (b.wind = { dx: 1, dz: 0, t: 1 }));
  expect(windy.x).toBeGreaterThan(calm.x + 0.1);
  const steer = (mud: boolean) =>
    drift((b) => {
      b.steer(0, 1, 0);
      if (mud) b.mud = { x: 0, z: 0, r: 2, t: 5 };
    });
  const dry = steer(false);
  const wet = steer(true);
  expect(Math.hypot(wet.vx, wet.vz)).toBeLessThan(Math.hypot(dry.vx, dry.vz));
});
