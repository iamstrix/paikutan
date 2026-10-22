import * as THREE from 'three';
import { buildCharacter, type Expression, type Rig } from './characters';

export type AvatarMode = 'idle' | 'walk' | 'wind' | 'release' | 'watch' | 'cheer' | 'sad';

const TUMBLE_TIME = 1.3;

/** Procedural tween animation on a character rig. No skeletons, no clips. */
export class Avatar {
  readonly rig: Rig;
  readonly group: THREE.Group;
  mode: AvatarMode = 'idle';
  speed = 0;
  /** The trompo held in hand while winding; hidden once it leaves the hand. */
  held: THREE.Object3D | null = null;
  private phase = 0;
  private releaseT = 0;
  private tumbleT = 0;
  private readonly target = new THREE.Vector3();
  private targetRy = 0;
  private expression: Expression = 'neutral';

  constructor(
    readonly char: string,
    accent: string,
  ) {
    this.rig = buildCharacter(char, accent);
    this.group = this.rig.root;
  }

  get tumbling(): boolean {
    return this.tumbleT > 0;
  }

  tumble(): void {
    if (this.tumbleT <= 0) this.tumbleT = TUMBLE_TIME;
  }

  release(): void {
    this.mode = 'release';
    this.releaseT = 0;
  }

  /** Remote avatars ease toward the last networked pose. */
  setTarget(x: number, z: number, ry: number, snap = false): void {
    this.target.set(x, 0, z);
    this.targetRy = ry;
    if (snap) {
      this.group.position.copy(this.target);
      this.group.rotation.y = ry;
    }
  }

  followTarget(dt: number): void {
    const before = this.group.position.clone();
    this.group.position.lerp(this.target, 1 - Math.exp(-dt * 12));
    this.group.rotation.y = lerpAngle(this.group.rotation.y, this.targetRy, 1 - Math.exp(-dt * 12));
    this.speed = before.distanceTo(this.group.position) / Math.max(dt, 1e-4);
  }

  private setExpression(e: Expression): void {
    if (e === this.expression) return;
    this.rig.faces[this.expression].visible = false;
    this.rig.faces[e].visible = true;
    this.expression = e;
  }

  update(dt: number, elapsed: number): void {
    const r = this.rig;
    this.setExpression(
      this.tumbleT > 0 ? 'dizzy' : this.mode === 'cheer' || this.mode === 'release' ? 'happy' : this.mode === 'sad' ? 'sad' : 'neutral',
    );
    const ease = (o: THREE.Object3D, x: number, z = 0, k = 14) => {
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
    if (this.held) this.held.visible = mode === 'wind' || (mode === 'release' && this.releaseT < 0.12);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
  }
}

export function lerpAngle(a: number, b: number, t: number): number {
  const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}
