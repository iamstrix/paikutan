import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../js/engine.js';
import { createFxReceiver, QUICK_CHAT, CHAT_ENABLED } from '../js/chat.js';
import { arenaCameraDistance } from '../js/camera-fit.js';
import { pacedTransport } from '../js/net.js';

function match(mode = 'brawl', count = 3) {
  const events = [];
  const engine = new Engine((type, data) => events.push({ type, data }), { mode });
  for (let i = 0; i < count; i++) engine.join(`p${i}`, `Player ${i}`, 'local');
  return { engine, events };
}

test('removing a CPU frees its seat and clears its score for a human', () => {
  const { engine } = match('brawl', 2);
  const slot = engine.addCpu(), id = engine.players[slot].id;
  engine.points[slot] = 9; engine.scores[slot] = 2;
  engine.leave(id);
  assert.equal(engine.players[slot], null);
  assert.equal(engine.points[slot], 0);
  assert.equal(engine.scores[slot], 0);
  assert.equal(engine.join('human', 'Juan'), slot);
  assert.equal(engine.canStart(), true);
  engine.start();
  assert.equal(engine.addCpu(), -1);
});

test('leaving 1v1 during a round returns the remaining player to a clean lobby', () => {
  const { engine } = match('1v1', 2);
  engine.go('charge'); engine.go('countdown'); engine.go('fight');
  engine.scores[0] = 1;
  engine.leave('p1');
  assert.equal(engine.phase, 'lobby');
  assert.equal(engine.world, null);
  assert.equal(engine.round, 0);
  assert.equal(engine.players[0].inRound, false);
  assert.deepEqual(engine.scores, [0, 0]);
  engine.join('new', 'New');
  assert.equal(engine.phase, 'pick');
});

test('a brawl continues when a player leaves and the reused seat waits for the next round', () => {
  const { engine } = match();
  engine.go('charge');
  engine.players.forEach(p => { if (p) p.spun = { power: 0.8, stability: 0.8 }; });
  engine.go('countdown'); engine.go('throw');
  engine.players.forEach((p, s) => { if (p) engine.throwTop(s, 0.5, 0); });
  engine.leave('p1');
  assert.equal(engine.phase, 'fight');
  assert.equal(engine.world.tops[1].alive, false);
  assert.equal(engine.join('new', 'New'), 1);
  assert.equal(engine.players[1].inRound, false);
});

test('quick chat accepts only four fixed phrases and enforces cooldown per player', { skip: !CHAT_ENABLED && 'quick chat is switched off' }, () => {
  const { engine, events } = match();
  for (const i of [-1, 4, 0.5, '0', undefined]) engine.handle('p0', 'chat', { i });
  assert.equal(events.filter(e => e.type === 'fx').length, 0);
  engine.handle('p0', 'chat', { i: 0 });
  engine.handle('p0', 'chat', { i: 1 });
  engine.handle('p1', 'chat', { i: 2 });
  assert.equal(events.filter(e => e.type === 'fx').length, 2);
  for (let i = 0; i < 27; i++) engine.update(0.1);
  engine.handle('p0', 'chat', { i: 3 });
  assert.equal(events.filter(e => e.type === 'fx').length, 3);
  assert.deepEqual(QUICK_CHAT, ['Tara G', 'Aray mo', 'Lala', 'Hehe']);
});

test('lost snapshots recover all recent effects exactly once, including final-round events', () => {
  const { engine, events } = match('1v1', 2);
  engine.go('charge');
  engine.players.forEach(p => { p.spun = { power: 0.8, stability: 0.8 }; });
  engine.go('countdown'); engine.go('throw');
  engine.throwTop(0, 0.8, 0); engine.throwTop(1, 0.8, 0);
  for (let i = 0; i < 20; i++) engine.update(1 / 60);
  const snaps = events.filter(e => e.type === 'snap').map(e => e.data);
  const received = [], receiver = createFxReceiver(e => received.push(e.seq));
  receiver.receive(snaps[8].fx); // first eight packets were lost
  receiver.receive(snaps[19].fx);
  receiver.receive(snaps[8].fx); // delayed / duplicate packet
  assert.equal(new Set(received).size, received.length);
  assert.equal(received.length, events.filter(e => e.type === 'fx').flatMap(e => e.data).length);
  engine.emitEffects([{ type: 'fall', slot: 0, x: 0, z: 0 }]);
  receiver.receive(engine.state().fx); // final state carries an effect even if the final snap drops
  assert.equal(received.at(-1), engine.fxSeq);
  receiver.reset();
  receiver.receive([{ seq: 1, type: 'chat' }]);
  assert.equal(received.at(-1), 1);
});

test('portrait framing fits the arena with a fixed 48 degree lens', () => {
  for (const aspect of [0.375, 0.45, 0.5625, 1, 16 / 9]) {
    const distance = arenaCameraDistance(aspect, 48, 5.75);
    const available = Math.atan(Math.tan(48 * Math.PI / 360) * Math.min(1, aspect));
    assert(Math.asin(5.75 / distance) <= available + 1e-10);
  }
  assert(arenaCameraDistance(0.45, 48, 5.75) > arenaCameraDistance(1, 48, 5.75));
});

test('network pacing coalesces steering and snapshots while retaining discrete actions and final leave', async () => {
  const sent = [];
  let closed = false;
  const net = pacedTransport('test', (ev, p) => sent.push({ ev, p, at: performance.now() }), () => { closed = true; });
  try {
    for (let i = 0; i < 100; i++) { net.send('steer', { x: i }); net.send('snap', { t: i }); }
    net.send('ability', {}); net.send('boost', {});
    await new Promise(resolve => setTimeout(resolve, 280));
    assert.deepEqual(sent.map(e => e.ev), ['steer', 'snap', 'ability', 'boost']);
    assert.equal(sent[0].p.x, 99); assert.equal(sent[1].p.t, 99);
    for (let i = 1; i < sent.length; i++) assert(sent[i].at - sent[i - 1].at >= 40);
    net.send('steer', { x: 0 });
    net.close('leave', { id: 'p0' });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(sent.at(-1).ev, 'leave'); assert(closed);
    net.send('hello', {});
    assert.equal(sent.length, 5);
  } finally { net.close(); }
});
