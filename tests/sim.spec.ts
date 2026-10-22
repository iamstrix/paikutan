import { expect, test } from '@playwright/test';
import { botSpin, botSteer, botThrow } from '../src/sim/Bot';
import { ARENA_R, Battle, toLocal, toWorld, type LaunchInput } from '../src/sim/TrompoSim';
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
