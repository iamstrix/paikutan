// Paikutan's mixer: responsive synthesis, five compact CC0 power textures, and Filipino chat.
import { QUICK_CHAT, CHAT_CLIPS } from './chat.js';
import { POWER_SAMPLES, FX_CUES } from './sfx-catalog.js';
import { createSynth } from './audio-synth.js';
import { createMatchAudio, installAudioUI } from './audio-events.js';

let ctx = null, master, compressor, sfxBus, musicBus, synth;
let muted = false, musicMuted = false, sfxVolume = 0.85, musicLevel = 0.32;
try { musicMuted = localStorage.getItem('paikutan-music') === 'off'; } catch { /* optional */ }
const hums = [], buffers = new Map(), loads = new Map(), samples = new Set(), lastCue = new Map();
let whirNode = null, voice = null, voiceRequest = 0, duckUntil = 0;
let musicTimer = null, musicStep = 0, musicNext = 0, musicWanted = null, currentSnap = null;
let lastUIAt = -Infinity;
let lastNavigationAt = -Infinity;
const timers = new Set();
const UI_CUES = new Set(['uiTap','uiBack','pick','confirm','join','leave','error','recenter']);
const ACCENTS = { kidlat: 'kidlatAccent', agimat: 'agimatAccent', diwata: 'diwataAccent' };
const now = () => ctx?.currentTime || 0;
const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(+value) ? +value : 0));

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85;
  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -10; compressor.knee.value = 12; compressor.ratio.value = 6;
  compressor.attack.value = 0.003; compressor.release.value = 0.18;
  master.connect(compressor).connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVolume; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = musicMuted ? 0 : musicLevel; musicBus.connect(master);
  synth = createSynth(ctx, sfxBus);
  return ctx;
}

function loadBuffer(key, url) {
  if (!loads.has(key)) loads.set(key, fetch(url)
    .then(response => { if (!response.ok) throw Error('Audio unavailable'); return response.arrayBuffer(); })
    .then(bytes => ctx.decodeAudioData(bytes))
    .then(buffer => { buffers.set(key, buffer); return buffer; }).catch(() => null));
  return loads.get(key);
}

function duck(duration = 0.8) {
  if (!ctx) return;
  duckUntil = Math.max(duckUntil, now() + duration);
  musicBus.gain.cancelScheduledValues(now());
  musicBus.gain.setTargetAtTime(musicMuted ? 0 : musicLevel * 0.35, now(), 0.025);
  musicBus.gain.setTargetAtTime(musicMuted ? 0 : musicLevel, duckUntil, 0.35);
}

function sample(key, { volume = 0.85, rate = 1 } = {}) {
  const buffer = buffers.get(key);
  if (!buffer || samples.size >= 12) return null;
  const source = ctx.createBufferSource(), gain = ctx.createGain();
  source.buffer = buffer; source.playbackRate.value = rate;
  gain.gain.value = volume; source.connect(gain).connect(sfxBus);
  const entry = { source, gain };
  samples.add(entry);
  source.onended = () => { source.disconnect(); gain.disconnect(); samples.delete(entry); if (voice === source) voice = null; };
  source.start(); return source;
}

function cue(id, options = {}) {
  if (!ctx || muted) return false;
  const time = now();
  const gap = id === 'hit' ? 0.055 : id === 'steal' ? 0.16 : id === 'countdown' ? 0.2 : 0.09;
  if (!options.force && time - (lastCue.get(id) ?? -Infinity) < gap) return false;
  lastCue.set(id, time);
  if (UI_CUES.has(id)) lastUIAt = time;
  if (POWER_SAMPLES[id]) {
    const source = !options.synthOnly && sample(id);
    if (source) { if (ACCENTS[id]) synth.play(ACCENTS[id]); }
    else synth.play(id, options);
    duck(id === 'bakunawa' ? 1.6 : 0.85);
  } else synth.play(id, options);
  if (['throwReady','squeeze','roundWin','roundLose','champion','matchLose'].includes(id)) duck(id === 'champion' ? 1.8 : 0.65);
  return true;
}

const matchAudio = createMatchAudio({
  play: cue,
  schedule(fn, delay) { const timer = setTimeout(() => { timers.delete(timer); fn(); }, delay); timers.add(timer); return timer; },
  cancel(timer) { clearTimeout(timer); timers.delete(timer); },
});

// Kulintang-style synthesized music stays adaptive; the sourced T'boli fragment is only in Bakunawa.
const ROW = [293.7,329.6,392,440,523.3,587.3,659.3,784];
const A = [4,3,2,3,4,-1,4,5,6,5,4,3,2,-1,2,3], B = [4,4,3,2,1,2,3,-1,2,1,0,1,2,-1,-1,-1];
const SONG = [...A,...A,...B,...A], DRUM = [1,0,1,1,0,1,0,1];
function musicGong(freq, at, volume, decay) {
  for (const [partial, gain, length] of [[1,1,1],[2.76,0.25,0.4],[5.4,0.08,0.15]])
    synth.primitive({ kind: 'tone', type: 'sine', freq: freq * partial, vol: volume * gain, decay: decay * length, attack: 0.005 }, at, musicBus);
}
function scheduleMusic() {
  if (!ctx || ctx.state !== 'running') return;
  if (musicNext < now() - 0.3) musicNext = now() + 0.03;
  while (musicNext < now() + 0.2) {
    const i = musicStep % SONG.length, at = musicNext, note = SONG[i];
    if (note >= 0) musicGong(ROW[note], at, 0.15, 0.6);
    if (i % 8 === 0) musicGong(98, at, 0.23, 1.6);
    if (i % 8 === 4) musicGong(110, at, 0.14, 1.1);
    if (i % 2) synth.primitive({ kind: 'tone', type: 'sine', freq: 1180, vol: 0.03, decay: 0.07 }, at, musicBus);
    if (DRUM[i % 8]) synth.primitive({ kind: 'noise', type: 'bandpass', freq: 180, q: 2, vol: 0.09, decay: 0.09 }, at, musicBus);
    musicStep++; musicNext += 0.22;
  }
}

export const audio = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
    this.preload();
    if (musicWanted) { const request = musicWanted; musicWanted = null; this.music(...request); }
  },
  async preload({ retry = false } = {}) {
    if (!ensure()) return;
    if (retry) for (const [key] of loads) if (!buffers.has(key)) loads.delete(key);
    return Promise.all([
      ...Object.entries(POWER_SAMPLES).map(([key, url]) => loadBuffer(key, url)),
      ...CHAT_CLIPS.map((url, i) => loadBuffer('chat-' + i, url)),
    ]);
  },
  cue,
  uiCue(id) { if (id === 'uiBack') lastNavigationAt = now(); return cue(id); },
  get muted() { return muted; },
  get musicMuted() { return musicMuted; },
  get sfxVolume() { return sfxVolume; },
  get status() { return { context: ctx?.state || 'locked', voices: synth?.activeVoices || 0, samples: samples.size, loaded: [...buffers.keys()], pending: loads.size - buffers.size }; },
  setSfxVolume(value) { sfxVolume = clamp01(value); if (ctx) sfxBus.gain.setTargetAtTime(sfxVolume, now(), 0.025); },
  setMusicMuted(value) {
    musicMuted = !!value;
    try { localStorage.setItem('paikutan-music', musicMuted ? 'off' : 'on'); } catch { /* optional */ }
    if (ctx) { musicBus.gain.cancelScheduledValues(now()); musicBus.gain.setTargetAtTime(musicMuted ? 0 : musicLevel, now(), 0.1); }
  },
  setMuted(value) {
    muted = !!value;
    if (muted) { voiceRequest++; if (voice) { try { voice.stop(); } catch { /* ended */ } voice = null; } window.speechSynthesis?.cancel(); }
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.85, now(), 0.025);
  },
  async chat(i, character = '') {
    if (!QUICK_CHAT[i] || muted || !ctx) return;
    const request = ++voiceRequest;
    const buffer = await loadBuffer('chat-' + i, CHAT_CLIPS[i]);
    if (muted || request !== voiceRequest) return;
    if (voice) { try { voice.stop(); } catch { /* ended */ } voice = null; }
    if (buffer) { voice = sample('chat-' + i, { volume: 0.9, rate: character === 'bata' ? 1.06 : character === 'tambay' ? 0.96 : 1 }); duck(1.2); }
    else {
      const speech = window.speechSynthesis, filipino = speech?.getVoices().find(v => /^(fil|tl)([-_]|$)/i.test(v.lang));
      if (!filipino) return;
      const line = new SpeechSynthesisUtterance(QUICK_CHAT[i]); line.voice = filipino; line.lang = filipino.lang;
      speech.cancel(); speech.speak(line);
    }
  },
  setMatchState(state, options) { matchAudio.state(state, options); },
  setMatchSnap(snap) { currentSnap = snap; matchAudio.snapshot(snap); },
  stop() {
    const back = ctx && now() - lastNavigationAt < 0.08;
    matchAudio.reset(); timers.forEach(clearTimeout); timers.clear(); currentSnap = null;
    hums.forEach((_, i) => this.hum(i, 0, 0)); this.whir(0); this.music(false); voiceRequest++;
    synth?.stop();
    for (const { source } of samples) { try { source.stop(); } catch { /* ended */ } }
    voice = null; window.speechSynthesis?.cancel();
    lastCue.clear(); duckUntil = 0;
    lastNavigationAt = -Infinity;
    if (back) synth.play('uiBack');
  },
  music(on, level = 0.32) {
    if (!ctx) { musicWanted = [on, level]; return; }
    musicLevel = level;
    musicBus.gain.cancelScheduledValues(now());
    musicBus.gain.setTargetAtTime(musicMuted ? 0 : level * (now() < duckUntil ? 0.35 : 1), now(), 0.15);
    if (now() < duckUntil && !musicMuted) musicBus.gain.setTargetAtTime(level, duckUntil, 0.35);
    if (on && !musicTimer) { musicNext = now() + 0.08; musicTimer = setInterval(scheduleMusic, 60); }
    else if (!on && musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  },
  hum(slot, spin, wobble, level = 1) {
    if (!ctx) return;
    let hum = hums[slot];
    if (!hum && spin <= 0) return;
    if (!hum) {
      const source = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      const lfo = ctx.createOscillator(), modulation = ctx.createGain();
      source.type = 'sawtooth'; filter.type = 'lowpass'; filter.Q.value = 1.4; gain.gain.value = 0;
      modulation.gain.value = 0; lfo.connect(modulation).connect(gain.gain);
      source.connect(filter).connect(gain).connect(sfxBus); source.start(); lfo.start();
      hum = hums[slot] = { source, filter, gain, lfo, modulation };
    }
    const on = spin > 0.02 ? 1 : 0;
    hum.source.frequency.setTargetAtTime(65 + spin * 155 + slot * 5, now(), 0.06);
    hum.filter.frequency.setTargetAtTime(220 + spin * 1100, now(), 0.06);
    hum.gain.gain.setTargetAtTime(on * level * (0.018 + spin * 0.04), now(), 0.07);
    hum.lfo.frequency.setTargetAtTime(3 + wobble * 9, now(), 0.08);
    hum.modulation.gain.setTargetAtTime(on * level * Math.min(0.014, wobble * 0.014), now(), 0.07);
  },
  whir(level) {
    if (!ctx) return;
    if (!whirNode && level <= 0) return;
    if (!whirNode) {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      source.buffer = synth.noiseBuffer; source.loop = true; filter.type = 'bandpass'; filter.Q.value = 2.5; gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(sfxBus); source.start(); whirNode = { filter, gain };
    }
    whirNode.filter.frequency.setTargetAtTime(280 + level * 1900, now(), 0.04);
    whirNode.gain.gain.setTargetAtTime(clamp01(level) * 0.16, now(), 0.04);
  },
  hit(i = 0.5) { cue('hit', { intensity: i }); },
  land() { cue('land'); }, fall() { cue('fall'); }, out() { cue('out'); },
  throw() { cue('throw'); }, dash() { cue('dash'); }, stomp() { cue('stomp'); },
  kidlat() { cue('kidlat'); }, tikbalang() { cue('tikbalang'); },
  shield() { cue('agimat'); }, heal() { cue('diwata'); }, eclipse() { cue('bakunawa'); },
  bark() { cue('bark'); }, squeeze() { cue('squeeze'); }, cluck() { cue('cluck'); },
  crack() { cue('crack'); }, chirp() { cue('hatch'); },
  beep(high = false) { if (high || !matchAudio.managedCountdown) cue(high ? 'throwReady' : 'countdown'); },
  win() { cue(matchAudio.result || 'champion'); },
  click() { if (now() - lastUIAt > 0.12) cue('pick'); },
};

export function playFx(event) {
  if (event.type === 'hit') {
    audio.hit(event.i);
    if (currentSnap?.tops.some(top => top.shield && top.alive && Math.hypot(top.x - event.x, top.z - event.z) < 1.2)) cue('wardHit');
  } else if (event.type === 'ability') {
    if (POWER_SAMPLES[event.top]) cue(event.top);
  } else if (event.type === 'steal') {
    if (event.amt > 0.012) cue('steal');
  } else if (FX_CUES[event.type]) cue(FX_CUES[event.type]);
  // `over` is announced by setMatchState, which knows the local player and final score.
}

if (typeof document !== 'undefined' && document.body) installAudioUI(audio, document);
