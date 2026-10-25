// All sound is synthesized with WebAudio: no audio files.
// Music is a kulintang-style gong loop (pentatonic gongs, agung, dabakan drum).
let ctx = null, master, sfxBus, musicBus, noiseBuf;
let muted = false;
// Music can be switched off on its own (sound effects stay on); remembered per device.
let musicMuted = false, musicLevel = 0.32;
try { musicMuted = localStorage.getItem('paikutan-music') === 'off'; } catch { /* storage blocked: default on */ }
const hums = [];
let whirNode = null;
let musicTimer = null, musicStep = 0, musicNext = 0, musicWanted = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = musicMuted ? 0 : musicLevel; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(freq, t, { type = 'sine', vol = 0.2, attack = 0.005, decay = 0.3, bus = sfxBus, slideTo } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + attack + decay);
  env(g, t, vol, attack, decay);
  o.connect(g).connect(bus);
  o.start(t); o.stop(t + attack + decay + 0.05);
}

function noise(t, { vol = 0.2, decay = 0.2, type = 'bandpass', freq = 1000, q = 1, freqTo, bus = sfxBus } = {}) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + decay);
  env(g, t, vol, 0.004, decay);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 0.5); s.stop(t + decay + 0.05);
}

// Bronze gong: fundamental plus an inharmonic partial.
function gong(freq, t, vol = 0.25, decay = 1.1, bus = sfxBus) {
  tone(freq, t, { vol, decay, bus });
  tone(freq * 2.76, t, { vol: vol * 0.25, decay: decay * 0.4, bus });
  tone(freq * 5.4, t, { vol: vol * 0.08, decay: decay * 0.15, bus });
}

// Pentatonic kulintang row, low to high.
const ROW = [293.7, 329.6, 392, 440, 523.3, 587.3, 659.3, 784];
const MEL_A = [4, 3, 2, 3, 4, -1, 4, 5, 6, 5, 4, 3, 2, -1, 2, 3];
const MEL_B = [4, 4, 3, 2, 1, 2, 3, -1, 2, 1, 0, 1, 2, -1, -1, -1];
const SONG = [...MEL_A, ...MEL_A, ...MEL_B, ...MEL_A];
const DRUM = [1, 0, 1, 1, 0, 1, 0, 1];
const STEP_S = 0.22;

function scheduleMusic() {
  while (musicNext < ctx.currentTime + 0.25) {
    const i = musicStep % SONG.length, t = musicNext;
    const n = SONG[i];
    if (n >= 0) gong(ROW[n], t, 0.18, 0.6, musicBus);
    if (i % 8 === 0) gong(98, t, 0.3, 1.8, musicBus);             // agung
    if (i % 8 === 4) gong(110, t, 0.18, 1.2, musicBus);
    if (i % 2 === 1) tone(1180, t, { vol: 0.04, decay: 0.07, bus: musicBus }); // babendil
    if (DRUM[i % 8]) noise(t, { vol: 0.12, decay: 0.09, freq: 180, q: 2, bus: musicBus }); // dabakan
    musicStep++;
    musicNext += STEP_S;
  }
}

export const audio = {
  // Must be called from a user gesture (tap/click) the first time.
  unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (musicWanted) { const [on, level] = musicWanted; musicWanted = null; this.music(on, level); }
  },
  get muted() { return muted; },
  get musicMuted() { return musicMuted; },
  setMusicMuted(m) {
    musicMuted = m;
    try { localStorage.setItem('paikutan-music', m ? 'off' : 'on'); } catch { /* not saved: fine */ }
    if (ctx) musicBus.gain.setTargetAtTime(m ? 0 : musicLevel, ctx.currentTime, 0.1);
  },
  setMuted(m) {
    muted = m;
    if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
  },
  music(on, level = 0.32) {
    // Browsers block audio before the first tap, so remember the request until unlock().
    if (!ctx) { musicWanted = [on, level]; return; }
    musicLevel = level;
    musicBus.gain.setTargetAtTime(musicMuted ? 0 : level, ctx.currentTime, 0.4);
    if (on && !musicTimer) {
      musicNext = ctx.currentTime + 0.1;
      musicTimer = setInterval(scheduleMusic, 60);
    } else if (!on && musicTimer) {
      clearInterval(musicTimer); musicTimer = null;
    }
  },
  // Continuous hum of a spinning top. Call every frame; spin 0 silences it.
  hum(slot, spin, wobble) {
    if (!ctx) return;
    let h = hums[slot];
    if (!h) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; f.type = 'lowpass'; f.Q.value = 4; g.gain.value = 0;
      lfo.frequency.value = 5; lg.gain.value = 0;
      lfo.connect(lg).connect(g.gain);
      o.connect(f).connect(g).connect(sfxBus);
      o.start(); lfo.start();
      h = hums[slot] = { o, f, g, lfo, lg };
    }
    const t = ctx.currentTime;
    const on = spin > 0.02 ? 1 : 0;
    h.o.frequency.setTargetAtTime(70 + spin * 150 + slot * 9, t, 0.05);
    h.f.frequency.setTargetAtTime(250 + spin * 1100, t, 0.05);
    h.g.gain.setTargetAtTime(on * (0.025 + spin * 0.05), t, 0.08);
    h.lfo.frequency.setTargetAtTime(3 + wobble * 9, t, 0.1);
    h.lg.gain.setTargetAtTime(on * wobble * 0.03, t, 0.1);
  },
  // Whoosh while drawing spin circles; level 0..1.
  whir(level) {
    if (!ctx) return;
    if (!whirNode) {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.Q.value = 3; g.gain.value = 0;
      s.connect(f).connect(g).connect(sfxBus); s.start();
      whirNode = { f, g };
    }
    const t = ctx.currentTime;
    whirNode.f.frequency.setTargetAtTime(300 + level * 1800, t, 0.05);
    whirNode.g.gain.setTargetAtTime(level * 0.25, t, 0.05);
  },
  hit(i = 0.5) {
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(t, { vol: 0.15 + i * 0.35, decay: 0.08, type: 'highpass', freq: 1800 });
    tone(1700 + Math.random() * 300, t, { vol: 0.08 + i * 0.12, decay: 0.18 });
    tone(2650 + Math.random() * 300, t, { vol: 0.05 + i * 0.08, decay: 0.12 });
    tone(140, t, { vol: 0.2 * i, decay: 0.12, slideTo: 70 });
  },
  land() {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(130, t, { vol: 0.3, decay: 0.18, slideTo: 60 });
    noise(t, { vol: 0.15, decay: 0.15, type: 'lowpass', freq: 600 });
  },
  fall() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 0.11, 0.19, 0.25].forEach((d, i) => noise(t + d, { vol: 0.3 / (i + 1), decay: 0.06, freq: 700 + i * 90, q: 6 }));
    tone(300, t, { vol: 0.15, decay: 0.5, type: 'triangle', slideTo: 90 });
  },
  kidlat() {
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(t, { vol: 0.6, decay: 0.7, type: 'lowpass', freq: 6000, freqTo: 150 });
    tone(55, t, { vol: 0.5, decay: 0.9, slideTo: 30 });
  },
  dash() {
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(t, { vol: 0.4, decay: 0.45, freq: 300, freqTo: 2500, q: 2 });
    tone(220, t, { vol: 0.15, decay: 0.3, type: 'sawtooth', slideTo: 90 }); // neigh-ish growl
  },
  shield() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [523.3, 659.3, 784].forEach((f, i) => tone(f, t + i * 0.04, { vol: 0.12, attack: 0.15, decay: 0.8 }));
  },
  heal() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [587.3, 784, 987.8, 1174.7].forEach((f, i) => tone(f, t + i * 0.08, { vol: 0.12, type: 'triangle', decay: 0.4 }));
  },
  eclipse() {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(55, t, { vol: 0.25, type: 'sawtooth', attack: 0.3, decay: 2 });
    tone(58.3, t, { vol: 0.2, type: 'sawtooth', attack: 0.3, decay: 2 });
    gong(98, t, 0.3, 2);
  },
  bark() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 0.18].forEach(d => {
      tone(620, t + d, { vol: 0.25, type: 'square', decay: 0.09, slideTo: 380 });
      noise(t + d, { vol: 0.15, decay: 0.08, freq: 900 });
    });
  },
  // The end of a Tikbalang stampede: a heavy hoof thud.
  stomp() {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(90, t, { vol: 0.45, decay: 0.35, slideTo: 40 });
    noise(t, { vol: 0.3, decay: 0.25, type: 'lowpass', freq: 500 });
  },
  // Sikip na!: a falling warning gong as the circle starts to shrink.
  squeeze() {
    if (!ctx) return;
    const t = ctx.currentTime;
    gong(392, t, 0.25, 1.2);
    gong(294, t + 0.25, 0.25, 1.4);
  },
  // Hen running in: a quick "bok-bok-bok".
  cluck() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 0.11, 0.2].forEach((d, i) => tone(760 - i * 60, t + d, { vol: 0.14, type: 'triangle', decay: 0.07, slideTo: 480 }));
  },
  crack() {
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(t, { vol: 0.3, decay: 0.06, type: 'highpass', freq: 2500 });
    tone(420, t, { vol: 0.12, decay: 0.1, slideTo: 200 });
  },
  chirp() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 0.12].forEach(d => tone(2200, t + d, { vol: 0.08, decay: 0.06, slideTo: 2900 }));
  },
  beep(high = false) {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (high) { gong(784, t, 0.3, 0.8); tone(1568, t, { vol: 0.15, type: 'square', decay: 0.25 }); }
    else tone(660, t, { vol: 0.18, type: 'square', decay: 0.12 });
  },
  win() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [392, 440, 523.3, 587.3, 784].forEach((f, i) => gong(f, t + i * 0.13, 0.22, 0.9));
    gong(98, t, 0.4, 2.5);
  },
  click() {
    if (!ctx) return;
    tone(900, ctx.currentTime, { vol: 0.08, decay: 0.05, type: 'triangle' });
  },
};

// Sound for a sim event (see sim.js events).
export function playFx(e) {
  switch (e.type) {
    case 'hit': audio.hit(e.i); break;
    case 'launch': audio.land(); break;
    case 'boost': audio.dash(); break;
    case 'fall': case 'out': audio.fall(); break;
    case 'dogWarn': case 'dog': case 'bark': audio.bark(); break;
    case 'eggWarn': audio.cluck(); break;
    case 'egg': audio.click(); break;
    case 'crack': audio.crack(); break;
    case 'hatch': audio.chirp(); break;
    case 'stomp': audio.stomp(); break;
    case 'squeeze': audio.squeeze(); break;
    case 'ability': {
      const f = { kidlat: audio.kidlat, tikbalang: audio.dash, agimat: audio.shield, diwata: audio.heal, bakunawa: audio.eclipse }[e.top];
      if (f) f();
      break;
    }
  }
}
