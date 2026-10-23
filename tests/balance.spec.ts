import { expect, test } from '@playwright/test';
import { botSpin, botSteer, botThrow } from '../src/sim/Bot';
import { Battle, STEP } from '../src/sim/TrompoSim';
import { TOPS } from '../src/sim/data';
import { createSeededRandom } from '../src/utils/random';

// The core-loop contract, proven against the real sim with seeded bot rounds:
// playing beats hiding, ring-outs are a real way to win, rounds have a middle,
// the opening isn't a lottery, and no power dominates. No browser is opened.

type Opts = { n: number; seed: number; passive0?: boolean; randomInputs?: boolean; risk0?: number };
type Result = {
  winner: number;
  t: number;
  deaths: { t: number; how: 'out' | 'fall' }[];
  powers: string[];
  inputs: number[];
  /** Match points per seat, scored as RoundManager does: KO 1, ring-out 2, coin 1, last spinning 3. */
  points: number[];
  seen: Set<string>;
};

function playRound({ n, seed, passive0, randomInputs, risk0 }: Opts): Result {
  const rng = createSeededRandom(seed);
  const b = new Battle(
    Array.from({ length: n }, (_, i) => ({ id: i, char: 'tanod', power: TOPS[(i + seed) % TOPS.length].id, seat: (i / n) * Math.PI * 2 + Math.PI / 2 })),
    seed,
  );
  const inputs: number[] = [];
  for (const t of b.tops) {
    const s = randomInputs ? { power: rng(), stability: rng() } : botSpin(rng, 0.6);
    const th = botThrow(rng, 0.6);
    inputs.push(s.power);
    b.launch(t.id, { spinPower: s.power, steadiness: s.stability, throwPower: th.power, angle: th.angle });
  }
  const deaths: Result['deaths'] = [];
  const points = b.tops.map(() => 0);
  const seen = new Set<string>();
  let lastDown: number[] = [];
  let timer = 0;
  while (!b.over) {
    timer -= STEP;
    if (timer <= 0) {
      timer = 0.2;
      for (const t of b.alive()) {
        if (passive0 && t.id === 0) continue;
        const d = botSteer(b, t, rng, t.id === 0 && risk0 !== undefined ? risk0 : 0.5);
        b.steer(t.id, d.x, d.y);
        if (d.ability) b.ability(t.id);
        if (d.palo) b.palo(t.id, d.paloCharge);
      }
    }
    const before = b.alive().map((t) => t.id);
    b.step();
    const down = before.filter((id) => !b.top(id)!.alive);
    if (down.length) lastDown = down;
    b.settle(lastDown);
    for (const e of b.drainEvents()) {
      seen.add(e.type);
      if (e.type === 'coin') points[e.id] += 1;
      if (e.type === 'out' || e.type === 'fall') {
        deaths.push({ t: b.t, how: e.type });
        if (e.by >= 0 && e.by !== e.id) points[e.by] += e.type === 'out' ? 2 : 1;
      }
    }
  }
  if (b.winner >= 0) points[b.winner] += 3;
  return { winner: b.winner, t: b.t, deaths, powers: b.tops.map((t) => t.power), inputs, points, seen };
}

const rounds = (opts: Omit<Opts, 'seed'>, count: number) => Array.from({ length: count }, (_, i) => playRound({ ...opts, seed: i + 1 }));
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const pct = (k: number, of: number) => (100 * k) / of;

test('playing beats hiding: a top that never steers or palos does not win more than its share', () => {
  const passive = rounds({ n: 4, passive0: true }, 1200);
  const active = rounds({ n: 4 }, 1200);
  const passiveWin = pct(passive.filter((r) => r.winner === 0).length, passive.length);
  const activeWin = pct(active.filter((r) => r.winner === 0).length, active.length);
  console.log(`passive ${passiveWin.toFixed(1)}% vs active ${activeWin.toFixed(1)}% (fair 25%)`);
  expect(passiveWin).toBeLessThanOrEqual(25);
  // With every seat active the fair share is 25% by symmetry; playing must clearly beat hiding.
  expect(activeWin).toBeGreaterThan(passiveWin + 5);
});

test('rounds have a middle, ring-outs are a real way to win, and the opening is not a lottery', () => {
  const four = rounds({ n: 4 }, 800);
  const six = rounds({ n: 6 }, 800);
  const deaths = four.flatMap((r) => r.deaths);
  const ringOuts = pct(deaths.filter((d) => d.how === 'out').length, deaths.length);
  const roundLen = median(four.map((r) => r.t));
  const firstElim6 = median(six.map((r) => r.deaths[0]?.t ?? r.t));
  console.log(`ring-outs ${ringOuts.toFixed(0)}% | median round ${roundLen.toFixed(1)}s | median first KO (6p) ${firstElim6.toFixed(1)}s`);
  expect(ringOuts).toBeGreaterThanOrEqual(15);
  expect(roundLen).toBeGreaterThanOrEqual(18);
  expect(roundLen).toBeLessThanOrEqual(35);
  expect(firstElim6).toBeGreaterThanOrEqual(4 - STEP); // sim time accumulates float error; allow one step
});

test('no power dominates and the circle drawing still matters', () => {
  const rs = rounds({ n: 4, randomInputs: true }, 2000);
  const byPower = new Map<string, [number, number]>();
  const byQuartile = [0, 0, 0, 0].map(() => [0, 0]);
  for (const r of rs) {
    r.powers.forEach((p, i) => {
      const e = byPower.get(p) ?? [0, 0];
      e[1] += 1;
      if (r.winner === i) e[0] += 1;
      byPower.set(p, e);
      const q = byQuartile[Math.min(3, Math.floor(r.inputs[i] * 4))];
      q[1] += 1;
      if (r.winner === i) q[0] += 1;
    });
  }
  const powerWin = [...byPower].map(([p, [w, t]]) => [p, pct(w, t)] as const);
  const quartileWin = byQuartile.map(([w, t]) => pct(w, t));
  console.log('power win%', powerWin.map(([p, v]) => `${p} ${v.toFixed(0)}`).join(' | '), '| spin-power quartiles', quartileWin.map((v) => v.toFixed(0)).join(' → '));
  for (const [, v] of powerWin) {
    expect(v).toBeGreaterThanOrEqual(18);
    expect(v).toBeLessThanOrEqual(32);
  }
  for (let i = 1; i < 4; i += 1) expect(quartileWin[i]).toBeGreaterThanOrEqual(quartileWin[i - 1] - 2);
  expect(quartileWin[3]).toBeGreaterThan(quartileWin[0] + 10);
});

test('risk pays: a bot that chases rim coins and charges its palo outscores a cautious one', () => {
  const bold = rounds({ n: 4, risk0: 1 }, 1200);
  const safe = rounds({ n: 4, risk0: 0 }, 1200);
  const avg = (rs: Result[]) => rs.reduce((a, r) => a + r.points[0], 0) / rs.length;
  const coins = bold.reduce((a, r) => a + (r.seen.has('coin') ? r.points.reduce((x, y) => x + y, 0) : 0), 0);
  const coinRounds = pct(bold.filter((r) => r.seen.has('coin')).length, bold.length);
  const chaos = ['mango', 'wind', 'mud'].map((k) => `${k} ${pct(bold.filter((r) => r.seen.has(k)).length, bold.length).toFixed(0)}%`);
  console.log(`points/round bold ${avg(bold).toFixed(2)} vs safe ${avg(safe).toFixed(2)} | rounds with a coin taken ${coinRounds.toFixed(0)}% | ${chaos.join(' ')}`, coins > 0 ? '' : '');
  expect(avg(bold)).toBeGreaterThan(avg(safe) + 0.15);
  expect(coinRounds).toBeGreaterThanOrEqual(50);
  for (const k of ['mango', 'wind', 'mud']) expect(pct(bold.filter((r) => r.seen.has(k)).length, bold.length)).toBeGreaterThanOrEqual(60);
});
