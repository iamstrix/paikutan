// Gesture reading, ported from paikutan's js/input.js (the source of truth for
// the battle controls): circle drawing (spin), flick/swipe (throw), tilt (steer).
// Shared by the desktop HUD and the phone controller page.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const SPIN_SECONDS = 3;
/** Laps in SPIN_SECONDS for 100% spin power. */
const FULL_LAPS = 7;

export type SpinResult = { power: number; stability: number };
export type ThrowResult = { power: number; angle: number };

/** Tracks finger/mouse circles round a guide ring. Power = laps; steadiness = how closely you followed it, one way. */
export class CircleTracker {
  private total = 0;
  private abs = 0;
  private lastA: number | null = null;
  private dev = 0;
  private n = 0;
  private recent: [number, number][] = [];

  constructor(
    private readonly cx: number,
    private readonly cy: number,
    private readonly ringR: number,
  ) {}

  add(x: number, y: number, t: number): void {
    const dx = x - this.cx;
    const dy = y - this.cy;
    const r = Math.hypot(dx, dy);
    if (r < this.ringR * 0.25) {
      this.lastA = null;
      return;
    }
    const a = Math.atan2(dy, dx);
    if (this.lastA !== null) {
      let d = a - this.lastA;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.total += d;
      this.abs += Math.abs(d);
      this.recent.push([t, Math.abs(d)]);
    }
    this.lastA = a;
    this.dev += Math.abs(r - this.ringR);
    this.n += 1;
  }

  get laps(): number {
    return Math.abs(this.total) / (Math.PI * 2);
  }

  /** Laps per second over the last 0.4 s, for the whir sound. */
  speed(now: number): number {
    this.recent = this.recent.filter(([t]) => now - t < 400);
    return this.recent.reduce((s, [, d]) => s + d, 0) / (Math.PI * 2) / 0.4;
  }

  result(): SpinResult & { laps: number } {
    if (this.n < 8) return { power: 0, stability: 0, laps: 0 };
    const power = clamp(this.laps / FULL_LAPS, 0, 1);
    const neat = clamp(1 - this.dev / this.n / (this.ringR * 0.45), 0, 1);
    const oneWay = this.abs ? Math.abs(this.total) / this.abs : 0;
    return { power, stability: clamp(neat * oneWay, 0, 1), laps: this.laps };
  }
}

/** Swipe up to throw (touch or mouse). Null if it wasn't a throw. */
export function readSwipe(x0: number, y0: number, t0: number, x1: number, y1: number, t1: number): ThrowResult | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dt = Math.max(16, t1 - t0);
  if (dy > -40) return null;
  const speed = Math.hypot(dx, dy) / dt;
  return { power: clamp((speed - 0.3) / 2.2, 0.1, 1), angle: clamp(Math.atan2(dx, -dy), -0.6, 0.6) };
}

type PermissionCtor = { requestPermission?: () => Promise<string> };

/** iOS asks permission for motion sensors; must run inside a tap. */
export async function requestMotion(): Promise<boolean> {
  try {
    const motion = (typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : undefined) as unknown as PermissionCtor | undefined;
    const orient = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as unknown as PermissionCtor | undefined;
    if (motion?.requestPermission && (await motion.requestPermission()) !== 'granted') return false;
    if (orient?.requestPermission) await orient.requestPermission();
    return true;
  } catch {
    return false;
  }
}

/** Live phone sensors: orientation for aiming/steering, acceleration spikes for the flick. */
export class Motion {
  beta = 0;
  gamma = 0;
  hasTilt = false;
  hasMotion = false;
  onFlick: ((t: ThrowResult) => void) | null = null;
  private b0 = 0;
  private g0 = 0;
  private peak = 0;
  private peakAt = 0;
  private aimAtStart = 0;
  private moving = false;
  private grav: { x: number; y: number; z: number } | null = null;

  constructor() {
    addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      this.hasTilt = true;
      this.beta = e.beta;
      this.gamma = e.gamma;
    });
    addEventListener('devicemotion', (e) => this.motion(e));
  }

  /** Left/right tilt as a throw angle (-0.6..0.6 rad). */
  get aim(): number {
    return clamp((this.gamma - this.g0) / 40, -1, 1) * 0.6;
  }

  calibrate(): void {
    this.b0 = this.beta;
    this.g0 = this.gamma;
  }

  /** Steering relative to how the phone was held at calibration. */
  steer(): [number, number] {
    if (!this.hasTilt) return [0, 0];
    let x = (this.gamma - this.g0) / 22;
    let y = -(this.beta - this.b0) / 22;
    const m = Math.hypot(x, y);
    if (m < 0.12) return [0, 0];
    if (m > 1) {
      x /= m;
      y /= m;
    }
    return [x, y];
  }

  private motion(e: DeviceMotionEvent): void {
    const a = e.acceleration;
    let mag: number;
    if (a && a.x != null && a.y != null && a.z != null) mag = Math.hypot(a.x, a.y, a.z);
    else {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null || g.y == null || g.z == null) return;
      // No gravity-free reading on this phone: subtract a slow average.
      if (!this.grav) this.grav = { x: g.x, y: g.y, z: g.z };
      this.grav.x += (g.x - this.grav.x) * 0.1;
      this.grav.y += (g.y - this.grav.y) * 0.1;
      this.grav.z += (g.z - this.grav.z) * 0.1;
      mag = Math.hypot(g.x - this.grav.x, g.y - this.grav.y, g.z - this.grav.z);
    }
    this.hasMotion = true;
    const now = performance.now();
    if (!this.moving && mag > 6) {
      this.moving = true;
      this.aimAtStart = this.aim;
      this.peak = 0;
    }
    if (this.moving) {
      if (mag > this.peak) {
        this.peak = mag;
        this.peakAt = now;
      }
      // The flick is over once acceleration drops back down.
      if (mag < 4 || now - this.peakAt > 300) {
        this.moving = false;
        if (this.peak > 14 && this.onFlick) this.onFlick({ power: clamp((this.peak - 12) / 26, 0.15, 1), angle: this.aimAtStart });
      }
    }
  }
}
