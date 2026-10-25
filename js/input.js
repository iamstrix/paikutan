// Gesture reading: circle drawing (spin), flick/swipe (throw), tilt (steering).
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const SPIN_SECONDS = 3;
const FULL_LAPS = 7; // laps in SPIN_SECONDS for 100% spin power

// Tracks finger/mouse circles around a guide ring.
// Power = how many laps; steadiness = how closely you followed the ring, in one direction.
export class CircleTracker {
  constructor(cx, cy, ringR) {
    Object.assign(this, { cx, cy, ringR, total: 0, abs: 0, lastA: null, dev: 0, n: 0, recent: [] });
  }
  add(x, y, t) {
    const dx = x - this.cx, dy = y - this.cy, r = Math.hypot(dx, dy);
    if (r < this.ringR * 0.25) { this.lastA = null; return; }
    const a = Math.atan2(dy, dx);
    if (this.lastA !== null) {
      let d = a - this.lastA;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.total += d; this.abs += Math.abs(d);
      this.recent.push([t, Math.abs(d)]);
    }
    this.lastA = a;
    this.dev += Math.abs(r - this.ringR); this.n++;
  }
  get laps() { return Math.abs(this.total) / (Math.PI * 2); }
  // Laps per second over the last 0.4 s, for the whoosh sound.
  speed(now) {
    this.recent = this.recent.filter(([t]) => now - t < 400);
    return this.recent.reduce((s, [, d]) => s + d, 0) / (Math.PI * 2) / 0.4;
  }
  result() {
    if (this.n < 8) return { power: 0, stability: 0, laps: 0 };
    const power = clamp(this.laps / FULL_LAPS, 0, 1);
    const neat = clamp(1 - (this.dev / this.n) / (this.ringR * 0.45), 0, 1);
    const oneWay = this.abs ? Math.abs(this.total) / this.abs : 0;
    return { power, stability: clamp(neat * oneWay, 0, 1), laps: this.laps };
  }
}

// Swipe up to throw (touch or mouse). Returns {power, angle} or null if not a throw.
export function readSwipe(x0, y0, t0, x1, y1, t1) {
  const dx = x1 - x0, dy = y1 - y0, dt = Math.max(16, t1 - t0);
  if (dy > -40) return null;
  const speed = Math.hypot(dx, dy) / dt; // px per ms
  return { power: clamp((speed - 0.3) / 2.2, 0.1, 1), angle: clamp(Math.atan2(dx, -dy), -0.6, 0.6) };
}

// iOS asks permission for motion sensors; must run inside a tap.
export async function requestMotion() {
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
      if ((await DeviceMotionEvent.requestPermission()) !== 'granted') return false;
    }
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      await DeviceOrientationEvent.requestPermission();
    }
    return true;
  } catch { return false; }
}

// Live phone sensors: orientation for aiming/steering, acceleration spikes for the flick.
export class Motion {
  constructor() {
    this.beta = 0; this.gamma = 0; this.hasTilt = false; this.hasMotion = false;
    this.b0 = 0; this.g0 = 0;
    this.onFlick = null;
    this.peak = 0; this.peakAt = 0; this.aimAtStart = 0; this.moving = false;
    this.grav = null;
    this.orientationHandler = e => {
      if (e.beta == null) return;
      this.hasTilt = true; this.beta = e.beta; this.gamma = e.gamma;
    };
    this.motionHandler = e => this.motion(e);
    addEventListener('deviceorientation', this.orientationHandler);
    addEventListener('devicemotion', this.motionHandler);
  }
  destroy() {
    this.onFlick = null;
    removeEventListener('deviceorientation', this.orientationHandler);
    removeEventListener('devicemotion', this.motionHandler);
  }
  // Left/right tilt as a throw angle (-0.6..0.6 rad).
  get aim() { return clamp((this.gamma - this.g0) / 40, -1, 1) * 0.6; }
  calibrate() { this.b0 = this.beta; this.g0 = this.gamma; }
  // Steering relative to how the phone was held at calibration.
  steer() {
    if (!this.hasTilt) return [0, 0];
    let x = (this.gamma - this.g0) / 22, y = -(this.beta - this.b0) / 22;
    const m = Math.hypot(x, y);
    if (m < 0.12) return [0, 0];
    if (m > 1) { x /= m; y /= m; }
    return [x, y];
  }
  motion(e) {
    let a = e.acceleration;
    let mag;
    if (a && a.x != null) mag = Math.hypot(a.x, a.y, a.z);
    else {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null) return;
      // No gravity-free reading on this phone: subtract a slow average.
      if (!this.grav) this.grav = { x: g.x, y: g.y, z: g.z };
      for (const k of ['x', 'y', 'z']) this.grav[k] += (g[k] - this.grav[k]) * 0.1;
      mag = Math.hypot(g.x - this.grav.x, g.y - this.grav.y, g.z - this.grav.z);
    }
    this.hasMotion = true;
    const now = performance.now();
    if (!this.moving && mag > 6) { this.moving = true; this.aimAtStart = this.aim; this.peak = 0; }
    if (this.moving) {
      if (mag > this.peak) { this.peak = mag; this.peakAt = now; }
      // Flick is over once acceleration drops back down.
      if (mag < 4 || now - this.peakAt > 300) {
        this.moving = false;
        if (this.peak > 14 && this.onFlick) {
          this.onFlick({ power: clamp((this.peak - 12) / 26, 0.15, 1), angle: this.aimAtStart });
        }
      }
    }
  }
}
