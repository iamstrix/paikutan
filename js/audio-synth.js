// Short, responsive wood / bronze / air recipes. No assets, DOM, or timers are required.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function cueRecipe(id, intensity = 0.6, variation = 0.5) {
  const events = [], strength = clamp(Number.isFinite(intensity) ? intensity : 0.6, 0, 1);
  const pitch = 0.96 + clamp(variation, 0, 1) * 0.08;
  const tone = (freq, at = 0, vol = 0.1, decay = 0.2, type = 'triangle', end, attack = 0.003) => events.push({ kind: 'tone', freq: freq * pitch, at, vol, decay, type, end, attack });
  const noise = (at = 0, vol = 0.1, decay = 0.15, freq = 1200, end, type = 'bandpass', q = 1) => events.push({ kind: 'noise', at, vol, decay, freq, end, type, q });
  const gong = (freq, at = 0, vol = 0.16, decay = 0.7) => {
    tone(freq, at, vol, decay, 'sine'); tone(freq * 2.76, at, vol * 0.28, decay * 0.55, 'sine'); tone(freq * 5.4, at, vol * 0.07, decay * 0.25, 'sine');
  };
  const wood = (at = 0, vol = 0.13, freq = 420) => { tone(freq, at, vol, 0.08, 'triangle', freq * 0.6); noise(at, vol * 0.5, 0.035, 1500); };
  const melody = (notes, spacing = 0.09, vol = 0.12, decay = 0.4) => notes.forEach((freq, i) => gong(freq, i * spacing, vol, decay));
  switch (id) {
    case 'uiTap': wood(0, 0.055, 690); break;
    case 'uiBack': wood(0, 0.055, 590); tone(330, 0.04, 0.035, 0.07); break;
    case 'pick': wood(0, 0.065, 820); tone(1175, 0.025, 0.025, 0.09, 'sine'); break;
    case 'confirm': melody([523, 784], 0.07, 0.065, 0.25); wood(0, 0.05, 440); break;
    case 'join': melody([392, 587], 0.08, 0.065, 0.28); break;
    case 'leave': melody([523, 349], 0.08, 0.05, 0.22); break;
    case 'error': wood(0, 0.065, 200); wood(0.11, 0.055, 175); break;
    case 'recenter': tone(440, 0, 0.05, 0.15, 'sine', 660); tone(880, 0.08, 0.035, 0.18, 'sine'); break;
    case 'pickStart': melody([392, 523, 587], 0.075, 0.075, 0.35); break;
    case 'versus': wood(0, 0.18, 190); gong(196, 0.06, 0.16, 0.65); noise(0, 0.08, 0.25, 450, 1400); break;
    case 'charge': wood(0, 0.12, 390); wood(0.1, 0.12, 520); gong(784, 0.17, 0.09, 0.5); break;
    case 'spinLock': melody([440, 659, 880 + strength * 200], 0.065, 0.09, 0.35); noise(0, 0.045, 0.2, 1600, 3000); break;
    case 'countdown': gong(587, 0, 0.11, 0.2); wood(0, 0.05, 310); break;
    case 'throwReady': gong(784, 0, 0.18, 0.55); gong(1175, 0.035, 0.09, 0.3); wood(0, 0.14, 185); break;
    case 'fight': wood(0, 0.18, 170); wood(0.06, 0.11, 210); gong(392, 0.09, 0.12, 0.45); break;
    case 'throw': noise(0, 0.16, 0.22, 350, 3500, 'bandpass', 2); tone(260, 0, 0.055, 0.16, 'triangle', 600); break;
    case 'land': tone(150, 0, 0.16, 0.15, 'triangle', 65); noise(0, 0.15, 0.16, 650, 190, 'lowpass'); wood(0.012, 0.08, 570); break;
    case 'hit':
      wood(0, 0.08 + strength * 0.2, 500 - strength * 180);
      noise(0, 0.07 + strength * 0.18, 0.05 + strength * 0.035, 2200, 900, 'highpass');
      tone(1700 + strength * 200, 0, 0.025 + strength * 0.07, 0.12, 'sine');
      tone(120, 0, strength * 0.17, 0.12, 'sine', 55); break;
    case 'wardHit': gong(1568, 0, 0.09, 0.35); tone(2470, 0, 0.04, 0.2, 'sine'); break;
    case 'dash': noise(0, 0.15, 0.19, 2400, 350); tone(200, 0, 0.035, 0.13, 'triangle', 95); break;
    case 'steal': melody([330, 440, 660], 0.045, 0.06, 0.25); noise(0, 0.035, 0.2, 500, 2200); break;
    case 'fall': [0, 0.09, 0.16, 0.22].forEach((at, i) => wood(at, 0.15 / (1 + i * 0.45), 520 + i * 70)); tone(260, 0, 0.05, 0.45, 'triangle', 70); break;
    case 'out': noise(0, 0.13, 0.28, 1800, 200); tone(650, 0, 0.065, 0.3, 'triangle', 150); wood(0.18, 0.14, 190); break;
    case 'powerReady': melody([659, 880, 1318], 0.065, 0.075, 0.45); break;
    case 'dashReady': wood(0, 0.045, 920); tone(1320, 0.035, 0.025, 0.13, 'sine'); break;
    case 'wardEnd': melody([1175, 784], 0.08, 0.04, 0.35); break;
    case 'curseEnd': melody([392, 587, 784], 0.07, 0.055, 0.3); break;
    case 'lowSpin': wood(0, 0.055, 250); wood(0.17, 0.04, 230); break;
    case 'kidlat': noise(0, 0.48, 0.14, 3300, 600, 'highpass'); noise(0.025, 0.23, 0.85, 1800, 120, 'lowpass'); tone(65, 0, 0.2, 0.6, 'sine', 35); break;
    case 'kidlatAccent': [0,0.045,0.1].forEach(at => noise(at, 0.045, 0.09, 4000, 1800, 'highpass')); break;
    case 'tikbalang':
      for (let beat = 0; beat < 6; beat++) for (const [at, gain] of [[0,1],[0.075,0.6],[0.14,0.8]]) {
        wood(beat * 0.31 + at, 0.12 * gain, 230); tone(90, beat * 0.31 + at, 0.075 * gain, 0.1, 'sine', 48);
      }
      noise(0, 0.045, 1.7, 350, 950); break;
    case 'stomp': tone(90, 0, 0.28, 0.3, 'sine', 38); wood(0, 0.24, 180); noise(0.02, 0.18, 0.3, 500, 100, 'lowpass'); break;
    case 'agimat': gong(262, 0, 0.19, 1); melody([1047, 1568, 2093], 0.055, 0.065, 0.7); noise(0.02, 0.025, 0.8, 4200); break;
    case 'agimatAccent': gong(262, 0, 0.11, 0.65); break;
    case 'diwata': melody([587, 784, 988, 1175], 0.12, 0.08, 0.5); noise(0, 0.055, 1.1, 1800, 4000); break;
    case 'diwataAccent': [587,784,1175].forEach((f,i) => tone(f, i * 0.12, 0.03, 0.4, 'sine', undefined, 0.04)); break;
    case 'bakunawa':
      tone(55, 0, 0.1, 1.3, 'sawtooth', 32, 0.12); tone(58.3, 0, 0.07, 1.3, 'sawtooth', 35, 0.12);
      noise(0, 0.1, 1.1, 300, 100, 'lowpass'); [196,262,392].forEach((f,i) => gong(f, 0.7 + i * 0.16, 0.14, 0.85)); break;
    case 'dogWarn': [0,0.22].forEach(at => { tone(330, at, 0.055, 0.07, 'triangle', 190); noise(at, 0.07, 0.07, 750); }); gong(196, 0.02, 0.065, 0.4); break;
    case 'dogRun': for (let i=0;i<6;i++) wood(i * 0.09, 0.045, i % 2 ? 290 : 200); break;
    case 'bark': [0,0.16].forEach(at => { tone(540, at, 0.075, 0.08, 'square', 310); noise(at, 0.1, 0.085, 900); }); break;
    case 'cluck': [0,0.1,0.2].forEach((at,i) => tone(760 - i * 65, at, 0.085, 0.055, 'triangle', 460)); break;
    case 'egg': wood(0, 0.085, 900); tone(380, 0.015, 0.055, 0.08, 'sine', 240); break;
    case 'crack': noise(0, 0.21, 0.055, 2200, 500, 'highpass'); [0,0.035,0.07].forEach((at,i) => wood(at, 0.065 / (i + 1), 840 + i * 270)); break;
    case 'hatch': [0,0.12].forEach(at => tone(2100, at, 0.045, 0.075, 'sine', 2900)); wood(0, 0.035, 800); break;
    case 'birdWarn': [0, 0.17, 0.32].forEach(at => tone(1900, at, 0.05, 0.09, 'sine', 2850)); break;
    case 'puddleWarn': tone(360, 0, 0.06, 0.09, 'triangle', 180); noise(0.13, 0.055, 0.32, 750, 350); break;
    case 'luckyLand': noise(0, 0.075, 0.09, 600, 180, 'lowpass'); melody([784, 1175], 0.08, 0.055, 0.3); break;
    case 'puddleLand': noise(0, 0.1, 0.17, 700, 200, 'lowpass'); tone(270, 0.02, 0.065, 0.12, 'sine', 90); break;
    case 'luckyEnter': melody([988, 1318], 0.06, 0.035, 0.25); break;
    case 'slipEnter': noise(0, 0.07, 0.24, 1600, 250); tone(520, 0, 0.035, 0.2, 'sine', 150); break;
    case 'squeeze': [392,294,196].forEach((f,i) => gong(f, i * 0.22, 0.14, 0.75)); wood(0, 0.13, 180); break;
    case 'roundWin': melody([392,523,659,784], 0.09, 0.11, 0.5); break;
    case 'roundLose': [523,440,330].forEach((f,i) => { wood(i * 0.13, 0.08, f); tone(f, i * 0.13, 0.025, 0.2, 'sine'); }); break;
    case 'draw': melody([440,523,440], 0.12, 0.07, 0.28); break;
    case 'champion': melody([392,440,523,587,784,1047], 0.12, 0.13, 0.9); gong(98, 0, 0.19, 1.8); [0.12,0.36,0.6].forEach(at => wood(at, 0.12, 180)); break;
    case 'matchLose': melody([587,523,392,294], 0.14, 0.075, 0.6); break;
  }
  return events;
}

export function createSynth(ctx, destination, { random = Math.random, maxVoices = 160 } = {}) {
  const voices = new Map();
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const samples = noiseBuffer.getChannelData(0);
  for (let i=0;i<samples.length;i++) samples[i] = random() * 2 - 1;

  function primitive(event, when = ctx.currentTime, bus = destination, volume = 1) {
    if (voices.size >= maxVoices || event.vol <= 0) return;
    const t = Math.max(ctx.currentTime, when + (event.at || 0)), attack = event.attack || 0.003, end = t + attack + event.decay;
    const source = event.kind === 'noise' ? ctx.createBufferSource() : ctx.createOscillator();
    const gain = ctx.createGain(), nodes = [source, gain];
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, event.vol * volume), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    if (event.kind === 'noise') {
      const filter = ctx.createBiquadFilter(); nodes.push(filter);
      source.buffer = noiseBuffer; source.loop = true;
      filter.type = event.type || 'bandpass'; filter.Q.value = event.q || 1;
      filter.frequency.setValueAtTime(Math.min(event.freq, ctx.sampleRate * 0.45), t);
      if (event.end) filter.frequency.exponentialRampToValueAtTime(event.end, end);
      source.connect(filter).connect(gain);
    } else {
      source.type = event.type || 'sine';
      source.frequency.setValueAtTime(event.freq, t);
      if (event.end) source.frequency.exponentialRampToValueAtTime(event.end, end);
      source.connect(gain);
    }
    gain.connect(bus); voices.set(source, nodes);
    source.onended = () => { nodes.forEach(node => node.disconnect()); voices.delete(source); };
    if (event.kind === 'noise') source.start(t, random() * 0.5); else source.start(t);
    source.stop(end + 0.025);
  }
  return {
    play(id, { intensity, variation = random(), at = ctx.currentTime, volume = 1 } = {}) {
      const events = cueRecipe(id, intensity, variation);
      events.forEach(event => primitive(event, at, destination, volume));
      return events.length;
    },
    primitive,
    noiseBuffer,
    get activeVoices() { return voices.size; },
    stop() {
      for (const [source, nodes] of voices) {
        nodes[1].gain.cancelScheduledValues(ctx.currentTime);
        nodes[1].gain.setTargetAtTime(0.0001, ctx.currentTime, 0.003);
        try { source.stop(ctx.currentTime + 0.02); } catch { /* already ended */ }
      }
      voices.clear();
    },
  };
}
