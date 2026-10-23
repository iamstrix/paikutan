import type { BattleInput, BattleStage } from './BattleInput';
import { CircleTracker, readSwipe, SPIN_SECONDS, type SpinResult, type ThrowResult } from './gestures';

/**
 * Desktop fallbacks for paikutan's phone controls:
 * spin = draw circles with the mouse on the pad; throw = drag up and let go
 * (Space for a medium throw); fight = WASD/arrows steer, Space/left-click palo,
 * E/right-click power; out = left-click the ground to flick your multo.
 */
export class DesktopBattleInput implements BattleInput {
  aim = 0;
  private stage: BattleStage = 'idle';
  private spinCb: (r: SpinResult) => void = () => {};
  private throwCb: (r: ThrowResult) => void = () => {};
  private steerCb: (x: number, y: number) => void = () => {};
  private abilityCb: () => void = () => {};
  private paloCb: () => void = () => {};
  private flickCb: (x: number, y: number) => void = () => {};
  private readonly keys = new Set<string>();
  private tracker: CircleTracker | null = null;
  private spinStart = 0;
  private spinDone = false;
  private trail: [number, number, number][] = [];
  private swipe: [number, number, number] | null = null;
  private steerTimer = 0;
  private lastSteer: [number, number] = [0, 0];
  private lastSteerAt = 0;
  private readonly ctx: CanvasRenderingContext2D;
  /** Spin progress for the HUD and the whir sound. */
  progress = { power: 0, stability: 0, laps: 0, speed: 0, timeLeft: SPIN_SECONDS, started: false };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    this.keys.add(e.code);
    if (e.repeat) return;
    if (this.stage === 'fight' && e.code === 'Space') {
      e.preventDefault();
      this.paloCb();
    } else if (this.stage === 'fight' && e.code === 'KeyE') {
      this.abilityCb();
    } else if (this.stage === 'throw' && e.code === 'Space') {
      e.preventDefault();
      this.throwCb({ power: 0.5, angle: 0 });
    }
  };
  private readonly onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private readonly onPadDown = (e: PointerEvent) => {
    e.preventDefault();
    this.pad.setPointerCapture(e.pointerId);
    if (!this.tracker && !this.spinDone) {
      const r = this.pad.getBoundingClientRect();
      this.tracker = new CircleTracker(r.width / 2, r.height / 2, Math.min(r.width, r.height) * 0.36);
      this.spinStart = performance.now();
    }
    this.onPadMove(e);
  };
  private readonly onPadMove = (e: PointerEvent) => {
    if (!this.tracker || this.spinDone || (e.pointerType === 'mouse' && !e.buttons)) return;
    const r = this.pad.getBoundingClientRect();
    const now = performance.now();
    this.tracker.add(e.clientX - r.left, e.clientY - r.top, now);
    this.trail.push([e.clientX - r.left, e.clientY - r.top, now]);
  };
  private readonly onDown = (e: PointerEvent) => {
    if (this.stage === 'throw' && e.button === 0) this.swipe = [e.clientX, e.clientY, performance.now()];
    else if (this.stage === 'fight' && e.button === 0) this.paloCb();
    else if (this.stage === 'fight' && e.button === 2) this.abilityCb();
    else if (this.stage === 'out' && e.button === 0) this.flickCb(e.clientX, e.clientY);
  };
  private readonly onContextMenu = (e: Event) => {
    if (this.stage === 'fight') e.preventDefault();
  };
  private readonly onMove = (e: PointerEvent) => {
    if (this.swipe) this.aim = Math.max(-0.6, Math.min(0.6, Math.atan2(e.clientX - this.swipe[0], this.swipe[1] - e.clientY)));
  };
  private readonly onUp = (e: PointerEvent) => {
    if (!this.swipe) return;
    const t = readSwipe(this.swipe[0], this.swipe[1], this.swipe[2], e.clientX, e.clientY, performance.now());
    this.swipe = null;
    if (t && this.stage === 'throw') this.throwCb(t);
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly pad: HTMLCanvasElement,
  ) {
    this.ctx = pad.getContext('2d')!;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    pad.addEventListener('pointerdown', this.onPadDown);
    pad.addEventListener('pointermove', this.onPadMove);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
  }

  setStage(stage: BattleStage): void {
    if (stage === this.stage) return;
    if (this.stage === 'fight') this.steerCb(0, 0);
    this.stage = stage;
    this.aim = 0;
    this.swipe = null;
    if (stage === 'spin') {
      this.tracker = null;
      this.spinDone = false;
      this.trail = [];
      this.progress = { power: 0, stability: 0, laps: 0, speed: 0, timeLeft: SPIN_SECONDS, started: false };
    }
  }

  onSpin(cb: (r: SpinResult) => void): void {
    this.spinCb = cb;
  }
  onThrow(cb: (r: ThrowResult) => void): void {
    this.throwCb = cb;
  }
  onSteer(cb: (x: number, y: number) => void): void {
    this.steerCb = cb;
  }
  onAbility(cb: () => void): void {
    this.abilityCb = cb;
  }
  onPalo(cb: () => void): void {
    this.paloCb = cb;
  }
  onFlick(cb: (x: number, y: number) => void): void {
    this.flickCb = cb;
  }

  update(dt: number): void {
    if (this.stage === 'spin') this.updateSpin();
    if (this.stage !== 'fight') return;
    this.steerTimer -= dt;
    if (this.steerTimer > 0) return;
    this.steerTimer = 0.1;
    const k = (a: string, b: string) => this.keys.has(a) || this.keys.has(b);
    const x = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
    const y = (k('KeyW', 'ArrowUp') ? 1 : 0) - (k('KeyS', 'ArrowDown') ? 1 : 0);
    const m = Math.hypot(x, y) || 1;
    const v: [number, number] = [x / m, y / m];
    const now = performance.now();
    // Only send changes (and a keep-alive), as paikutan's controller does.
    if (Math.abs(v[0] - this.lastSteer[0]) + Math.abs(v[1] - this.lastSteer[1]) > 0.06 || now - this.lastSteerAt > 800) {
      this.lastSteer = v;
      this.lastSteerAt = now;
      this.steerCb(v[0], v[1]);
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.pad.removeEventListener('pointerdown', this.onPadDown);
    this.pad.removeEventListener('pointermove', this.onPadMove);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
  }

  /** Draw the circle pad (guide ring, time arc, finger trail) and finish after SPIN_SECONDS. */
  private updateSpin(): void {
    const g = this.ctx;
    const rect = this.pad.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = rect.width;
    const h = rect.height;
    if (w < 2 || h < 2) return;
    if (this.pad.width !== Math.round(w * dpr)) {
      this.pad.width = Math.round(w * dpr);
      this.pad.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = Math.min(w, h) * 0.36;
    const now = performance.now();
    const el = this.tracker ? (now - this.spinStart) / 1000 : 0;
    const res = this.tracker ? this.tracker.result() : { power: 0, stability: 0, laps: 0 };
    this.progress = {
      ...res,
      speed: this.tracker && !this.spinDone ? this.tracker.speed(now) : 0,
      timeLeft: Math.max(0, SPIN_SECONDS - el),
      started: !!this.tracker,
    };
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(43,29,18,0.12)';
    g.lineWidth = R * 0.4;
    g.beginPath();
    g.arc(w / 2, h / 2, R, 0, 7);
    g.stroke();
    g.strokeStyle = '#c0392b';
    g.lineWidth = 4;
    g.setLineDash([10, 10]);
    g.beginPath();
    g.arc(w / 2, h / 2, R, 0, 7);
    g.stroke();
    g.setLineDash([]);
    if (this.tracker) {
      g.strokeStyle = '#f2c230';
      g.lineWidth = 8;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(w / 2, h / 2, R * 1.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, 1 - el / SPIN_SECONDS));
      g.stroke();
    }
    this.trail = this.trail.filter((p) => now - p[2] < 350);
    g.lineWidth = 10;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let i = 1; i < this.trail.length; i += 1) {
      g.strokeStyle = `rgba(192,57,43,${(1 - (now - this.trail[i][2]) / 350).toFixed(2)})`;
      g.beginPath();
      g.moveTo(this.trail[i - 1][0], this.trail[i - 1][1]);
      g.lineTo(this.trail[i][0], this.trail[i][1]);
      g.stroke();
    }
    g.fillStyle = '#2b1d12';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.round(R * 0.45)}px "Lilita One", Impact, sans-serif`;
    g.fillText(this.tracker ? res.laps.toFixed(1) : '↻', w / 2, h / 2 - R * 0.08);
    g.font = `800 ${Math.round(R * 0.14)}px Nunito, sans-serif`;
    g.fillText(this.tracker ? 'laps' : 'press and circle', w / 2, h / 2 + R * 0.3);
    if (this.tracker && !this.spinDone && el >= SPIN_SECONDS) {
      this.spinDone = true;
      this.spinCb({ power: res.power, stability: res.stability });
    }
  }
}
