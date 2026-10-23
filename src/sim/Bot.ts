import { toLocal, type Battle, type Top } from './TrompoSim';

// CPU players, ported from paikutan's engine.js runCpu/cpuSteer and pointed at
// the nearest rival instead of the single opponent. skill 0..1.

export function botSpin(rng: () => number, skill: number): { power: number; stability: number } {
  return { power: 0.4 + skill * 0.45 + rng() * 0.15, stability: 0.35 + skill * 0.5 + rng() * 0.15 };
}

export function botThrow(rng: () => number, skill: number): { power: number; angle: number } {
  return { power: 0.4 + skill * 0.45 + rng() * 0.15, angle: (rng() - 0.5) * 0.5 * (1.2 - skill) };
}

/** Steering in the bot's player-local frame, plus whether it wants to fire its power or palo now.
 * `risk` 0..1: how much it chases rim coins and charges its palo. */
export function botSteer(
  battle: Battle,
  me: Top,
  rng: () => number,
  risk = 0.5,
): { x: number; y: number; ability: boolean; palo: boolean; paloCharge: number } {
  const op = battle.nearestRival(me);
  const opDist = op ? Math.hypot(op.x - me.x, op.z - me.z) : Infinity;
  let coin: { x: number; z: number } | null = null;
  if (risk > 0 && opDist > 1.2) {
    for (const c of battle.coins) {
      const d = Math.hypot(c.x - me.x, c.z - me.z);
      if (d < 1.5 + risk && (!coin || d < Math.hypot(coin.x - me.x, coin.z - me.z))) coin = c;
    }
  }
  const shadow = battle.mangoes.find((m) => m.t < 0 && Math.hypot(m.x - me.x, m.z - me.z) < 0.9);
  let tx: number;
  let tz: number;
  if (shadow) {
    tx = me.x - shadow.x;
    tz = me.z - shadow.z;
  } else if (coin) {
    tx = coin.x - me.x;
    tz = coin.z - me.z;
  } else if (!op) {
    tx = -me.x;
    tz = -me.z;
  } else if (me.spin > op.spin - 0.05 || me.dash > 0) {
    tx = op.x - me.x;
    tz = op.z - me.z;
  } else {
    // Losing on spin: circle around the middle and avoid contact.
    const ang = Math.atan2(me.z, me.x) + 0.8;
    tx = Math.cos(ang) * 2.5 - me.x;
    tz = Math.sin(ang) * 2.5 - me.z;
  }
  if (Math.hypot(me.x, me.z) > battle.ring * (coin && !shadow ? 0.95 : 0.76)) {
    tx = -me.x;
    tz = -me.z;
  }
  const m = Math.hypot(tx, tz) || 1;
  const [lx, ly] = toLocal(me.seat, tx / m, tz / m);
  let ability = false;
  if (me.charge >= 1 && rng() < 0.25) {
    const d = op ? Math.hypot(op.x - me.x, op.z - me.z) : Infinity;
    ability = me.power !== 'tikbalang' || d < 3.5;
  }
  // Palo when there's a spin edge and a target in reach.
  const reach = op ? Math.hypot(op.x - me.x, op.z - me.z) : Infinity;
  const palo = !!op && me.paloCd <= 0 && reach < 2.5 && me.spin > op.spin - 0.05 && rng() < 0.3;
  // Full charge when the rival is near the rim (a ring-out pays double).
  const nearRim = !!op && op.grace <= 0 && Math.hypot(op.x, op.z) > battle.ring * 0.72;
  const paloCharge = nearRim ? risk : 0;
  return { x: lx * 0.8, y: ly * 0.8, ability, palo, paloCharge };
}
