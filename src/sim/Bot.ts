import { toLocal, type Battle, type Top } from './TrompoSim';

// CPU players, ported from paikutan's engine.js runCpu/cpuSteer and pointed at
// the nearest rival instead of the single opponent. skill 0..1.

export function botSpin(rng: () => number, skill: number): { power: number; stability: number } {
  return { power: 0.4 + skill * 0.45 + rng() * 0.15, stability: 0.35 + skill * 0.5 + rng() * 0.15 };
}

export function botThrow(rng: () => number, skill: number): { power: number; angle: number } {
  return { power: 0.4 + skill * 0.45 + rng() * 0.15, angle: (rng() - 0.5) * 0.5 * (1.2 - skill) };
}

/** Steering in the bot's player-local frame, plus whether it wants to fire its power now. */
export function botSteer(battle: Battle, me: Top, rng: () => number): { x: number; y: number; ability: boolean; palo: boolean } {
  const op = battle.nearestRival(me);
  let tx: number;
  let tz: number;
  if (!op) {
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
  if (Math.hypot(me.x, me.z) > 3.8) {
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
  return { x: lx * 0.8, y: ly * 0.8, ability, palo };
}
