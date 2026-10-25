import test from 'node:test';
import assert from 'node:assert/strict';
import { SFX_CATALOG, FX_CUES } from '../js/sfx-catalog.js';
import { cueRecipe } from '../js/audio-synth.js';
import { createMatchAudio, resultCue } from '../js/audio-events.js';

const state = (phase, extra = {}) => ({ session: 'room', round: 1, phase, timer: 3.2, players: [{ id: 'me', inRound: true }, { id: 'other', inRound: true }], ...extra });
function observer() {
  const played = [], scheduled = [], canceled = [];
  const audio = createMatchAudio({ play: (id, options) => played.push({ id, options }), schedule: (fn, delay) => { const job = { fn, delay }; scheduled.push(job); return job; }, cancel: id => canceled.push(id) });
  return { audio, played, scheduled, canceled };
}

test('every catalog cue has a finite playable recipe at soft and hard intensities', () => {
  assert.equal(new Set(SFX_CATALOG.map(cue => cue.id)).size, SFX_CATALOG.length);
  for (const cue of SFX_CATALOG) for (const intensity of [0, 0.5, 1, NaN]) {
    const recipe = cueRecipe(cue.id, intensity);
    assert(recipe.length, cue.id + ' is audible');
    assert(recipe.some(event => event.vol > 0));
    for (const event of recipe) {
      for (const key of ['freq','at','vol','decay']) assert(Number.isFinite(event[key]), `${cue.id}: finite ${key}`);
      assert(event.freq > 0 && event.vol >= 0 && event.decay > 0);
      assert(event.at + event.decay + (event.attack || 0) < 3);
    }
  }
  assert.notDeepEqual(cueRecipe('hit', 0.1), cueRecipe('hit', 1));
  assert(cueRecipe('tikbalang').at(-1).decay > 1, 'stampede lasts across the power window');
});

test('all non-result simulation events have audio coverage', () => {
  const covered = new Set([...Object.keys(FX_CUES), 'hit', 'ability', 'over']);
  for (const type of ['launch','ability','boost','stomp','hit','steal','dogWarn','dog','bark','eggWarn','egg','hatch','crack','squeeze','fall','out','over','zoneWarn','zoneLand','zoneEnter']) assert(covered.has(type), type);
  for (const type of ['zoneWarn', 'zoneLand', 'zoneEnter']) for (const zone of ['swerte', 'ihi']) assert(cueRecipe(FX_CUES[type][zone]).length);
});

test('the countdown schedules three ticks once, and leaving cancels all of them', () => {
  const { audio, played, scheduled, canceled } = observer();
  audio.state(state('countdown'), { slot: 0 }); audio.state(state('countdown'), { slot: 0 });
  assert.equal(scheduled.length, 3);
  assert.deepEqual(scheduled.map(job => Math.round(job.delay)), [200,1200,2200]);
  scheduled[0].fn(); assert.equal(played.at(-1).id, 'countdown');
  audio.reset(); assert.equal(canceled.length, 3); assert.equal(audio.managedCountdown, false);
});

test('rounds, draws, spectators, and match results use the correct personal cue', () => {
  const round = state('roundEnd', { result: { winner: 1 } });
  assert.equal(resultCue(round, 0), 'roundLose'); assert.equal(resultCue(round, 1), 'roundWin'); assert.equal(resultCue(round), 'roundWin');
  assert.equal(resultCue(state('roundEnd', { result: { winner: -1 } }), 0), 'draw');
  assert.equal(resultCue({ ...round, players: [{ inRound: false }, { inRound: true }] }, 0), null);
  const final = state('matchEnd', { result: { champion: 0 } });
  assert.equal(resultCue(final, 0), 'champion'); assert.equal(resultCue(final, 1), 'matchLose');
});

test('readiness and effect expiration sound only on a local top transition', () => {
  const { audio, played } = observer(); audio.state(state('fight'), { slot: 0 }); played.length = 0;
  const top = { launched: true, alive: true, charge: 0.99, boostCd: 0.1, shield: true, invert: true, spin: 0.21 };
  audio.snapshot({ tops: [top] });
  const changed = { ...top, charge: 1, boostCd: 0, shield: false, invert: false, spin: 0.19 };
  audio.snapshot({ tops: [changed] }); audio.snapshot({ tops: [changed] });
  assert.deepEqual(played.map(item => item.id), ['powerReady','dashReady','wardEnd','curseEnd','lowSpin']);
});

test('the last player to finish winding still hears spin lock across the countdown transition', () => {
  const { audio, played } = observer(); audio.state(state('charge'), { slot: 0 });
  audio.state(state('countdown', { players: [{ inRound: true, spun: true, spinPower: 0.8 }, { inRound: true, spun: true }] }), { slot: 0 });
  assert(played.some(item => item.id === 'spinLock'));
});

test('the title demo stays quiet and state heartbeats do not repeat phase cues', () => {
  const { audio, played, scheduled } = observer();
  audio.state(state('countdown'), { silent: true }); assert.equal(scheduled.length, 0); assert.equal(played.length, 0);
  audio.state(state('fight'), { slot: 0 }); audio.state(state('fight'), { slot: 0 });
  assert.deepEqual(played.map(item => item.id), ['fight']);
});
