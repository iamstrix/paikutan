import * as THREE from 'three';
import { buildCharacter } from './characters.js';

const TUMBLE_TIME = 1.3;
/** Seconds into the 'bowl' pose when the trompo leaves the hand. */
export const BOWL_RELEASE = 1.1;

const smooth = (t, a, b) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Procedural tween animation on a character rig. No skeletons, no clips. */
export class Avatar {
  rig;
  group;
  mode = 'idle';
  speed = 0;
  /** The trompo held in hand while winding; hidden once it leaves the hand. */
  held = null;
  phase = 0;
  releaseT = 0;
  /** Seconds into the 'bowl' pose, set by whoever drives it. */
  bowlT = 0;
  tumbleT = 0;
  target = new THREE.Vector3();
  targetRy = 0;
  expression = 'neutral';

  constructor(char, accent) {
    this.char = char;
    this.rig = buildCharacter(char, accent);
    this.group = this.rig.root;
  }

  get tumbling() {
    return this.tumbleT > 0;
  }

  tumble() {
    if (this.tumbleT <= 0) this.tumbleT = TUMBLE_TIME;
  }

  release() {
    this.mode = 'release';
    this.releaseT = 0;
  }

  /** Remote avatars ease toward the last networked pose. */
  setTarget(x, z, ry, snap = false) {
    this.target.set(x, 0, z);
    this.targetRy = ry;
    if (snap) {
      this.group.position.copy(this.target);
      this.group.rotation.y = ry;
    }
  }

  followTarget(dt) {
    const before = this.group.position.clone();
    this.group.position.lerp(this.target, 1 - Math.exp(-dt * 12));
    this.group.rotation.y = lerpAngle(this.group.rotation.y, this.targetRy, 1 - Math.exp(-dt * 12));
    this.speed = before.distanceTo(this.group.position) / Math.max(dt, 1e-4);
  }

          setExpression(e) {
    if (e === this.expression) return;
    this.rig.faces[this.expression].visible = false;
    this.rig.faces[e].visible = true;
    this.expression = e;
  }

  update(dt, elapsed) {
    const r = this.rig;
    this.setExpression(
      this.tumbleT > 0 || this.mode === 'ko' ? 'dizzy'
        : ['cheer', 'clap', 'release', 'bowl'].includes(this.mode) ? 'happy'
        : this.mode === 'sad' || this.mode === 'panic' ? 'sad' : 'neutral',
    );
    const ease = (o, x, z = 0, k = 14) => {
      o.rotation.x += (x - o.rotation.x) * Math.min(1, dt * k);
      o.rotation.z += (z - o.rotation.z) * Math.min(1, dt * k);
    };

    // Tumble overrides everything: fall back, lie there, scramble up.
    if (this.tumbleT > 0) {
      this.tumbleT -= dt;
      const t = TUMBLE_TIME - this.tumbleT;
      const fall = t < 0.25 ? t / 0.25 : t > TUMBLE_TIME - 0.4 ? Math.max(0, this.tumbleT / 0.4) : 1;
      r.body.rotation.x = -1.45 * fall;
      r.body.position.y = 0.18 * fall;
      ease(r.legL, -0.9 * fall + Math.sin(elapsed * 22) * 0.4 * fall, 0, 30);
      ease(r.legR, -0.9 * fall - Math.sin(elapsed * 22) * 0.4 * fall, 0, 30);
      ease(r.armL, -2.6 * fall, -0.4, 30);
      ease(r.armR, -2.6 * fall, 0.4, 30);
      return;
    }
    r.body.rotation.x = 0;

    const moving = this.speed > 0.4;
    const mode = moving && (this.mode === 'idle' || this.mode === 'walk' || this.mode === 'sad') ? 'walk' : this.mode;
    this.phase += dt * (moving ? 4 + this.speed * 1.6 : 2);
    const s = Math.sin(this.phase);
    let bob = 0;

    switch (mode) {
      case 'walk': {
        const k = Math.min(1, this.speed / 4);
        ease(r.legL, s * 0.8 * k);
        ease(r.legR, -s * 0.8 * k);
        ease(r.armL, -s * 0.7 * k, -0.08);
        ease(r.armR, s * 0.7 * k, 0.08);
        ease(r.head, 0);
        bob = Math.abs(s) * 0.06 * k;
        break;
      }
      case 'wind':
        // Crouched, winding the string round the trompo in quick circles.
        ease(r.legL, -0.35);
        ease(r.legR, 0.25);
        ease(r.armL, -1.1, -0.3);
        ease(r.armR, -1.2 + Math.sin(elapsed * 16) * 0.35, -0.2 + Math.cos(elapsed * 16) * 0.25, 30);
        ease(r.head, 0.25);
        bob = -0.05;
        break;
      case 'release': {
        this.releaseT += dt;
        const t = this.releaseT;
        // Wind-up overhead, then whip forward and down.
        ease(r.armR, t < 0.12 ? -2.8 : 0.9, 0.1, 40);
        ease(r.armL, -0.6, -0.3);
        ease(r.legL, -0.5);
        ease(r.legR, 0.35);
        ease(r.head, 0.3);
        bob = -0.04;
        if (t > 0.7) this.mode = 'watch';
        break;
      }
      case 'watch':
        ease(r.legL, -0.2);
        ease(r.legR, 0.2);
        ease(r.armL, -0.7, -0.2);
        ease(r.armR, -0.7 + Math.sin(elapsed * 9) * 0.25, 0.2);
        ease(r.head, 0.35 + Math.sin(elapsed * 5) * 0.05);
        bob = -0.08 + Math.abs(Math.sin(elapsed * 6)) * 0.03;
        break;
      case 'cheer':
        ease(r.armL, -2.9 + Math.sin(elapsed * 14) * 0.3, -0.4, 20);
        ease(r.armR, -2.9 - Math.sin(elapsed * 14) * 0.3, 0.4, 20);
        ease(r.legL, 0);
        ease(r.legR, 0);
        ease(r.head, -0.2);
        bob = Math.abs(Math.sin(elapsed * 7)) * 0.25;
        break;
      case 'clap': {
        // Arms out front, hands meeting in the middle.
        const k = Math.abs(Math.sin(elapsed * 9));
        ease(r.armL, -1.25, 0.15 + 0.4 * k, 30);
        ease(r.armR, -1.25, -0.15 - 0.4 * k, 30);
        ease(r.legL, 0);
        ease(r.legR, 0);
        ease(r.head, -0.1);
        bob = k * 0.03;
        break;
      }
      case 'bowl': {
        // A bowler's delivery: backswing, swing through, then hold the follow-through leaning in.
        const back = smooth(this.bowlT, 0.15, 0.75), through = smooth(this.bowlT, 0.8, BOWL_RELEASE);
        ease(r.armR, 1.7 * back - 3 * through, 0.15, 30);
        ease(r.armL, -0.3 - 0.6 * through, -0.9, 20);
        ease(r.legL, -0.8 * through, 0, 20);
        ease(r.legR, 0.3 + 0.4 * through, 0, 20);
        ease(r.head, 0.15);
        r.body.rotation.x = 0.35 * through;
        bob = -0.12 * through;
        break;
      }
      case 'panic':
        // Arms up, knees knocking: something is coming.
        ease(r.armL, -2.6 + Math.sin(elapsed * 30) * 0.4, -0.7, 30);
        ease(r.armR, -2.6 - Math.sin(elapsed * 30) * 0.4, 0.7, 30);
        ease(r.legL, Math.sin(elapsed * 25) * 0.15, 0.1);
        ease(r.legR, -Math.sin(elapsed * 25) * 0.15, -0.1);
        ease(r.head, -0.15);
        bob = Math.abs(Math.sin(elapsed * 25)) * 0.03;
        break;
      case 'ko':
        // Flat out, arms and legs spread like a fallen bowling pin.
        ease(r.armL, 0, -1.3);
        ease(r.armR, 0, 1.3);
        ease(r.legL, 0, -0.35);
        ease(r.legR, 0, 0.35);
        ease(r.head, 0);
        break;
      case 'sad':
        ease(r.armL, 0.1, -0.05);
        ease(r.armR, 0.1, 0.05);
        ease(r.legL, 0);
        ease(r.legR, 0);
        ease(r.head, 0.6);
        bob = -0.04;
        break;
      default: {
        ease(r.legL, 0);
        ease(r.legR, 0);
        ease(r.armL, r.prop ? -0.9 + Math.sin(elapsed * 9) * 0.35 : Math.sin(this.phase * 0.5) * 0.05, -0.1);
        ease(r.armR, Math.sin(this.phase * 0.5 + 1) * 0.05, 0.08);
        ease(r.head, Math.sin(this.phase * 0.3) * 0.06);
        bob = Math.sin(this.phase) * 0.012;
      }
    }
    r.body.position.y = bob;
    if (this.held) this.held.visible = mode === 'wind' || (mode === 'release' && this.releaseT < 0.12) || (mode === 'bowl' && this.bowlT < BOWL_RELEASE);
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const mesh = o;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
  }
}

export function lerpAngle(a, b, t) {
  const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}
