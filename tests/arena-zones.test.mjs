import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, launch, step, snapshot, decodeSnap, STEP } from '../js/sim.js';
import { placeZone, canPlaceZone, advanceZones, applyZone, zoneAt, ZONE_WARN, ZONE_RULES } from '../js/arena-zones.js';
import { joystickVector } from '../js/joystick.js';
import { Engine } from '../js/engine.js';

function world() {
  const w = createWorld([{ char: 'bata', top: 'kidlat' }, { char: 'lola', top: 'diwata' }], () => 0.5);
  launch(w, 0, { spinPower: 0.8 }); launch(w, 1, { spinPower: 0.8 });
  w.dogAt = w.nextEgg = w.birdAt = Infinity;
  w.tops[0].x = -3; w.tops[0].z = 0; w.tops[1].x = 3; w.tops[1].z = 0;
  return w;
}

test('joystick has a dead zone, proportional movement, and a circular maximum', () => {
  assert.deepEqual(joystickVector(4, -3), [0, 0]);
  assert.deepEqual(joystickVector(60, 0), [1, 0]);
  assert.deepEqual(joystickVector(0, -60), [0, 1]);
  const diagonal = joystickVector(500, 500);
  assert(Math.abs(Math.hypot(...diagonal) - 1) < 1e-10);
  assert(joystickVector(30, 0)[0] > 0 && joystickVector(30, 0)[0] < 0.5);
});

test('luck gives a warning, caps actual spin recovery per player, and cannot be farmed by re-entry', () => {
  const w = world(), zone = placeZone(w, 'swerte', 0, 0), tp = w.tops[0];
  tp.x = tp.z = 0; tp.spin = 0.4; tp.wobble = 0.4;
  applyZone(w, tp, 1); assert.equal(tp.spin, 0.4);
  advanceZones(w, ZONE_WARN); assert.equal(zone.age, 0);
  const charge = tp.charge;
  for (let i = 0; i < 240; i++) applyZone(w, tp, STEP);
  assert(Math.abs(tp.spin - 0.5) < 1e-10);
  assert(Math.abs(zone.used[0] - 0.1) < 1e-10); assert(tp.luckSpent);
  assert(tp.wobble < 0.4); assert.equal(tp.charge, charge);
  tp.x = 3; applyZone(w, tp, STEP); tp.x = 0; applyZone(w, tp, 1);
  assert(Math.abs(tp.spin - 0.5) < 1e-10);
  const other = w.tops[1]; other.x = other.z = 0; other.spin = 0.3;
  applyZone(w, other, 1); assert(Math.abs(other.spin - 0.345) < 1e-10);
});

test('luck clamps full spin, does not spend unused recovery, and never revives fallen tops', () => {
  const w = world(), zone = placeZone(w, 'swerte', 0, 0), tp = w.tops[0]; zone.age = 0;
  tp.x = tp.z = 0; tp.spin = 0.99;
  applyZone(w, tp, 1); assert.equal(tp.spin, 1); assert(Math.abs(zone.used[0] - 0.01) < 1e-10);
  applyZone(w, tp, 1); assert(Math.abs(zone.used[0] - 0.01) < 1e-10);
  tp.spin = 0; applyZone(w, tp, 1); assert.equal(tp.spin, 0);
  tp.alive = false; tp.spin = 0.5; applyZone(w, tp, 1); assert.equal(tp.spin, 0.5); assert.equal(tp.zone, '');
});

test('puddles add spin drain, reduce steering grip, retain drift, and stop affecting tops outside', () => {
  const wet = world(), dry = world();
  const zone = placeZone(wet, 'ihi', 0, 0); zone.age = 0;
  for (const w of [wet, dry]) Object.assign(w.tops[0], { x: 0, z: 0, vx: 0, vz: 0, sx: 1, sy: 0, spin: 0.8, wobble: 0 });
  step(wet); step(dry);
  assert(wet.tops[0].vx < dry.tops[0].vx * 0.75);
  assert(Math.abs(dry.tops[0].spin - wet.tops[0].spin - 0.02 * STEP) < 1e-10);
  for (const w of [wet, dry]) Object.assign(w.tops[0], { x: 0, z: 0, vx: 2, vz: 0, sx: 0, sy: 0, spin: 0.8, wobble: 0 });
  step(wet); step(dry); assert(wet.tops[0].vx > dry.tops[0].vx);
  wet.tops[0].x = 2; applyZone(wet, wet.tops[0], 1); assert.equal(wet.tops[0].zone, '');
  assert.equal(zoneAt(wet, wet.tops[0]), null);
});

test('placement avoids live tops, eggs, other patches, and the ring boundary; patches expire', () => {
  const w = world();
  assert(!canPlaceZone(w, 'ihi', -3, 0)); assert(!canPlaceZone(w, 'ihi', 4, 0));
  w.eggs.push({ x: 0, z: 0 }); assert(!canPlaceZone(w, 'swerte', 0, 0)); w.eggs = [];
  assert(canPlaceZone(w, 'swerte', 0, 0)); const zone = placeZone(w, 'swerte', 0, 0);
  assert(!canPlaceZone(w, 'ihi', 0.5, 0));
  advanceZones(w, ZONE_WARN); assert(w.events.some(e => e.type === 'zoneLand'));
  advanceZones(w, zone.life); assert.equal(w.zones.length, 0);
  placeZone(w, 'ihi', 2.5, 0); w.ring = 3; advanceZones(w, STEP); assert.equal(w.zones.length, 0);
});

test('bird visits once per round and dog pauses once to warn before its puddle activates', () => {
  const w = world(); w.birdAt = 0; w.rand = () => 0;
  step(w); assert.equal(w.zones.filter(z => z.type === 'swerte').length, 1); assert(w.birdDone);
  // A deterministic dog path with plenty of space away from both tops and the luck patch.
  w.dog = { x: -2, z: -2, vx: 6, warn: 0, mark: 0, marked: false, hit: [false, false] };
  step(w); assert.equal(w.dog.mark, ZONE_WARN);
  const puddle = w.zones.find(z => z.type === 'ihi'); assert(puddle && puddle.age < 0);
  const x = w.dog.x; step(w); assert.equal(w.dog.x, x);
  for (let i = 0; i < 100; i++) step(w);
  assert.equal(w.zones.filter(z => z.type === 'ihi').length, 1);
  assert.equal(w.zones.filter(z => z.type === 'swerte').length, 1);
  assert(puddle.age >= 0);
  const fresh = world(); assert.equal(fresh.zones.length, 0); assert(!fresh.birdDone);
});

test('snapshots round-trip warning, active zones, puddle status and dog marking; older packets still decode', () => {
  const w = world(), zone = placeZone(w, 'ihi', 0.4, 0.6); zone.age = 0.333;
  Object.assign(w.tops[0], { zone: 'ihi' });
  w.dog = { x: 0.4, z: 0.6, vx: 6, warn: 0, mark: 0.75 };
  const decoded = decodeSnap(JSON.parse(JSON.stringify(snapshot(w))));
  assert.equal(decoded.zones[0].type, 'ihi'); assert.equal(decoded.zones[0].age, 0.333);
  assert.equal(decoded.tops[0].zone, 'ihi'); assert.equal(decoded.dog.mark, 0.75);
  w.tops[0].zone = 'swerte'; w.tops[0].luckSpent = true;
  assert(decodeSnap(snapshot(w)).tops[0].luckSpent);
  const old = snapshot(w); delete old.zones; old.tops.forEach(a => a.pop()); old.dog.pop();
  assert.deepEqual(decodeSnap(old).zones, []); assert.equal(decodeSnap(old).tops[0].zone, '');
});

test('CPUs seek unspent luck at low spin and avoid puddles', () => {
  const engine = new Engine(() => {}); engine.join('a', 'A', 'cpu'); engine.join('b', 'B', 'cpu');
  engine.world = world();
  const w = engine.world, me = w.tops[0]; Object.assign(me, { x: -2, z: 0, spin: 0.4, boostCd: 1 });
  const lucky = placeZone(w, 'swerte', 0, 2); lucky.age = 0;
  engine.cpuSteer(0); assert(me.sx > 0 && me.sy < 0, 'seek the luck patch in local coordinates');
  lucky.used[0] = ZONE_RULES.swerte.cap;
  const puddle = placeZone(w, 'ihi', -1.5, 0); puddle.age = 0;
  engine.cpuSteer(0); assert(me.sx < 0, 'steer away from the puddle');
});
