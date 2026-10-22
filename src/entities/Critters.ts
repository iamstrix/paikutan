import * as THREE from 'three';
import { ball, box, cyl } from '../world/kit';

type Chicken = { group: THREE.Group; head: THREE.Object3D; target: THREE.Vector2; speed: number; peck: number; flap: number };

/** Free-roaming manok. Cosmetic and local to each client; they flee people and trip dashers. */
export class Critters {
  readonly group = new THREE.Group();
  private readonly chickens: Chicken[] = [];

  constructor(
    private readonly rng: () => number,
    count = 6,
  ) {
    for (let i = 0; i < count; i += 1) {
      const g = new THREE.Group();
      const feather = i % 3 === 0 ? '#f4efe3' : i % 3 === 1 ? '#8a4a24' : '#3b2a20';
      ball(g, 0.16, feather, [0, 0.24, 0], [1.2, 1, 0.9]);
      box(g, [0.06, 0.18, 0.14], i % 2 ? '#2b5e3a' : '#5a2a1a', [-0.18, 0.34, 0], [0, 0, 0.5]);
      const head = new THREE.Group();
      head.position.set(0.15, 0.36, 0);
      ball(head, 0.08, feather, [0, 0.04, 0]);
      box(head, [0.06, 0.06, 0.02], '#d62d20', [0, 0.12, 0]);
      box(head, [0.06, 0.03, 0.03], '#f2c230', [0.08, 0.03, 0]);
      g.add(head);
      for (const z of [-0.05, 0.05]) cyl(g, 0.012, 0.012, 0.12, '#e0a530', [0, 0.06, z], undefined, 4);
      g.position.set((this.rng() - 0.5) * 30, 0, -3 + this.rng() * 12);
      this.group.add(g);
      this.chickens.push({ group: g, head, target: this.pick(), speed: 0.6, peck: this.rng() * 3, flap: 0 });
    }
  }

  /** Returns true when a dashing avatar ran into a chicken this frame. */
  update(dt: number, elapsed: number, people: THREE.Vector3[], dasher: THREE.Vector3 | null): boolean {
    let tripped = false;
    for (const c of this.chickens) {
      const p = c.group.position;
      let flee = false;
      for (const person of people) {
        const dx = p.x - person.x;
        const dz = p.z - person.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.6) {
          c.target.set(p.x + (dx / (d || 1)) * 4, p.z + (dz / (d || 1)) * 4);
          flee = true;
        }
      }
      if (dasher && Math.hypot(p.x - dasher.x, p.z - dasher.z) < 0.55 && c.flap <= 0) {
        tripped = true;
        c.flap = 0.8;
      }
      const dx = c.target.x - p.x;
      const dz = c.target.y - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.2) {
        c.target = this.pick();
        c.peck = 1 + this.rng() * 3;
      }
      c.peck -= dt;
      c.flap -= dt;
      const pecking = c.peck > 0 && !flee && c.flap <= 0;
      const speed = flee || c.flap > 0 ? 3.2 : pecking ? 0 : 0.7;
      if (d > 0.01 && speed > 0) {
        p.x += (dx / d) * speed * dt;
        p.z += (dz / d) * speed * dt;
        c.group.rotation.y = Math.atan2(-dz, dx);
      }
      p.x = THREE.MathUtils.clamp(p.x, -25, 25);
      p.z = THREE.MathUtils.clamp(p.z, -11, 18);
      p.y = c.flap > 0 ? Math.abs(Math.sin(elapsed * 30)) * 0.25 : speed > 0 ? Math.abs(Math.sin(elapsed * 14)) * 0.03 : 0;
      c.head.rotation.z = pecking ? -0.9 * Math.max(0, Math.sin(elapsed * 9)) : 0;
    }
    return tripped;
  }

  private pick(): THREE.Vector2 {
    // Anywhere on the plaza except the bilog itself.
    for (;;) {
      const v = new THREE.Vector2((this.rng() - 0.5) * 40, -6 + this.rng() * 22);
      if (v.length() > 4) return v;
    }
  }
}
