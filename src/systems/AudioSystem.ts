// Event-driven audio. Everything works with zero asset files: SFX and the
// ambience bed are synthesised, barks fall back to speech synthesis. Drop CC0
// loops into public/audio/ and recorded barks into public/audio/barks/ (see
// public/audio/README.md) and they take over automatically.

export const QUICK_CHAT = ["Let's play!", 'Oops, missed!', 'Cheater!', 'Nice one!', 'Uh-oh!', 'You lose!'];
const BARK_FILES: Record<string, string> = {
  "Let's play!": 'tara',
  'Oops, missed!': 'sablay',
  'Cheater!': 'daya',
  'Nice one!': 'galing',
  'Uh-oh!': 'hala',
  'You lose!': 'talo',
  'One!': 'isa',
  'Two!': 'dalawa',
  'Three!': 'tatlo',
  'Time to go home!': 'uwi',
};

const NARRATOR_LINES = new Set([
  'One!', 'Two!', 'Three!', 'Time to go home!',
]);

export class AudioSystem {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;
  private unlocked = false;
  muteNarratorTts = true;
  private dusk = 0;
  private ambienceTimer = 0;
  private readonly missing = new Set<string>();
  muted = false;

  constructor() {
    const unlock = () => {
      void this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    await this.context.resume();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.context.destination);
    const len = this.context.sampleRate * 2;
    this.noise = this.context.createBuffer(1, len, this.context.sampleRate);
    const data = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i += 1) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    this.unlocked = true;
    this.startBreeze();
    void this.tryLoop('audio/ambience.mp3', 0.35);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.8;
    if (muted) window.speechSynthesis?.cancel();
  }

  /** 0 day → 1 night: birds give way to crickets. */
  setDusk(k: number): void {
    this.dusk = k;
  }

  update(dt: number): void {
    if (!this.context) return;
    this.ambienceTimer -= dt;
    if (this.ambienceTimer > 0) return;
    this.ambienceTimer = 0.6 + Math.random() * 2.2;
    if (Math.random() > this.dusk) this.bird();
    else this.cricket();
    if (Math.random() < 0.04 && this.dusk < 0.5) this.rooster();
  }

  // --- trompo ---
  wrap(clean: boolean): void {
    this.noiseBurst(clean ? 1800 : 600, 0.06, clean ? 0.25 : 0.18);
    if (clean) this.tone(880, 1320, 0.08, 0.06, 'triangle');
  }
  beat(final: boolean): void {
    this.tone(final ? 660 : 440, final ? 990 : 440, final ? 0.25 : 0.12, 0.12, 'square');
  }
  whoosh(): void {
    this.noiseBurst(900, 0.25, 0.3, 3000);
  }
  land(sablay: boolean): void {
    this.tone(sablay ? 90 : 140, 60, 0.12, 0.35, 'sine');
    this.noiseBurst(400, 0.1, 0.25);
  }
  clash(power: number): void {
    const p = Math.min(1, power / 4);
    this.tone(1400 + p * 900, 500, 0.08, 0.15 + p * 0.25, 'square');
    this.noiseBurst(3000, 0.07, 0.2 + p * 0.3);
  }
  /** Kidlat crack. */
  zap(): void {
    this.noiseBurst(4000, 0.3, 0.45, 300);
    this.tone(1800, 120, 0.3, 0.2, 'sawtooth');
  }
  /** Asong gala: arf! */
  bark(): void {
    this.tone(520, 300, 0.09, 0.25, 'square');
    setTimeout(() => this.tone(560, 320, 0.08, 0.2, 'square'), 140);
  }
  /** Diwata / Agimat shimmer. */
  chime(): void {
    [1046, 1318, 1568].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.25, 0.08, 'sine'), i * 70));
  }
  /** One click per lap while drawing circles. */
  lap(): void {
    this.tone(700, 1100, 0.05, 0.08, 'triangle');
  }

  /** Two quick high blips: a rival is about to strike you. */
  warn(): void {
    this.tone(1250, 1000, 0.06, 0.12, 'square');
    setTimeout(() => this.tone(1250, 1000, 0.06, 0.12, 'square'), 90);
  }
  out(): void {
    this.tone(300, 80, 0.4, 0.25, 'sawtooth');
  }
  win(): void {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.18, 0.15, 'triangle'), i * 110));
  }
  boing(): void {
    this.tone(180, 520, 0.25, 0.25, 'sine');
  }
  cluck(): void {
    for (let i = 0; i < 3; i += 1) setTimeout(() => this.tone(700, 420, 0.07, 0.12, 'square'), i * 90);
  }

  /** Continuous hum for the local player's top; spin 0 silences it. */
  setHum(spin: number): void {
    if (!this.context || !this.master) return;
    if (!this.hum) {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = 'sawtooth';
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(this.master);
      osc.start();
      this.hum = { osc, gain };
    }
    const now = this.context.currentTime;
    this.hum.osc.frequency.setTargetAtTime(70 + spin * 160, now, 0.05);
    this.hum.gain.gain.setTargetAtTime(spin > 0 ? 0.035 + spin * 0.03 : 0, now, 0.08);
  }

  /** A spoken line: recorded file if present, else the browser's voice. */
  say(text: string, pitch = 1): void {
    if (this.muted) return;
    const isNarrator = NARRATOR_LINES.has(text);
    const key = BARK_FILES[text];
    if (key && !this.missing.has(key)) {
      const audio = new Audio(`audio/barks/${key}.mp3`);
      audio.volume = 0.9;
      audio.play().catch(() => {
        this.missing.add(key);
        if (!(isNarrator && this.muteNarratorTts)) this.speak(text, pitch);
      });
      return;
    }
    if (!(isNarrator && this.muteNarratorTts)) this.speak(text, pitch);
  }

  dispose(): void {
    window.speechSynthesis?.cancel();
    void this.context?.close();
    this.context = null;
  }

  private speak(text: string, pitch: number): void {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    u.voice = voices.find((v) => /en/i.test(v.lang)) ?? voices.find((v) => /fil|tl/i.test(v.lang)) ?? null;
    u.pitch = pitch;
    u.rate = 1.1;
    synth.speak(u);
  }

  private async tryLoop(url: string, volume: number): Promise<void> {
    if (!this.context || !this.master) return;
    try {
      const res = await fetch(url);
      if (!res.ok || !res.headers.get('content-type')?.startsWith('audio')) return;
      const buffer = await this.context.decodeAudioData(await res.arrayBuffer());
      const src = this.context.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const gain = this.context.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(this.master);
      src.start();
    } catch {
      // No ambience file yet: the synthesized bed covers it.
    }
  }

  private startBreeze(): void {
    if (!this.context || !this.master || !this.noise) return;
    const src = this.context.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    const gain = this.context.createGain();
    gain.gain.value = 0.06;
    const lfo = this.context.createOscillator();
    const lfoGain = this.context.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain).connect(gain.gain);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    lfo.start();
  }

  private bird(): void {
    const base = 2200 + Math.random() * 1600;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i += 1) setTimeout(() => this.tone(base, base * 1.3, 0.07, 0.025, 'sine'), i * 120);
  }

  private cricket(): void {
    for (let i = 0; i < 4; i += 1) setTimeout(() => this.tone(4200, 4300, 0.03, 0.02, 'square'), i * 45);
  }

  private rooster(): void {
    // Tik-ti-la-ok, in synth.
    [520, 620, 760, 600].forEach((f, i) => setTimeout(() => this.tone(f, f * (i === 2 ? 1.25 : 0.95), i === 2 ? 0.45 : 0.14, 0.05, 'sawtooth'), i * 160));
  }

  private tone(from: number, to: number, duration: number, volume: number, type: OscillatorType): void {
    if (!this.context || !this.master || this.context.state !== 'running') return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private noiseBurst(freq: number, duration: number, volume: number, sweepTo?: number): void {
    if (!this.context || !this.master || !this.noise) return;
    const src = this.context.createBufferSource();
    src.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    const now = this.context.currentTime;
    filter.frequency.setValueAtTime(freq, now);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, now + duration);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(now, Math.random());
    src.stop(now + duration + 0.02);
  }
}
