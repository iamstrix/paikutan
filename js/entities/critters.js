// Free-roaming manok, ported from tromPOW's Critters (jmdgg). Cosmetic and local to each screen.
// Built in barangay metres: add the group to the barangay so it scales with it.
import * as THREE from 'three';
import { ball, box, cyl } from '../world/kit.js';

const FEATHERS = ['#f4efe3', '#8a4a24', '#3b2a20'];

// One chicken facing +x. Eyes are ours (tromPOW's are too small to need them; ours peek up close).
export function chicken(i) {
  const g = new THREE.Group();
  const feather = FEATHERS[i % 3];
  ball(g, 0.16, feather, [0, 0.24, 0], [1.2, 1, 0.9]);
  box(g, [0.06, 0.18, 0.14], i % 2 ? '#2b5e3a' : '#5a2a1a', [-0.18, 0.34, 0], [0, 0, 0.5]);
  const head = new THREE.Group();
  head.position.set(0.15, 0.36, 0);
  ball(head, 0.08, feather, [0, 0.04, 0]);
  box(head, [0.06, 0.06, 0.02], '#d62d20', [0, 0.12, 0]);
  box(head, [0.06, 0.03, 0.03], '#f2c230', [0.08, 0.03, 0]);
  for (const z of [-0.055, 0.055]) box(head, [0.025, 0.025, 0.02], '#1d1612', [0.04, 0.07, z]);
  g.add(head);
  for (const z of [-0.05, 0.05]) cyl(g, 0.012, 0.012, 0.12, '#e0a530', [0, 0.06, z], undefined, 4);
  g.userData.head = head;
  return g;
}

export class Critters {
  constructor(rng, count = 6) {
    this.rng = rng;
    this.group = new THREE.Group();
    this.chickens = [];
    for (let i = 0; i < count; i += 1) {
      const g = chicken(i);
      // Start outside the bilog: a hen placed inside could never walk out (see update).
      const start = this.pick();
      g.position.set(start.x, 0, start.y);
      this.group.add(g);
      this.chickens.push({ group: g, head: g.userData.head, target: this.pick(), peck: this.rng() * 3 });
    }
  }

  update(dt, elapsed) {
    for (const c of this.chickens) {
      const p = c.group.position;
      const dx = c.target.x - p.x;
      const dz = c.target.y - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.2) {
        c.target = this.pick();
        c.peck = 1 + this.rng() * 3;
      }
      c.peck -= dt;
      const pecking = c.peck > 0;
      const speed = pecking ? 0 : 0.7;
      if (d > 0.01 && speed > 0) {
        const nx = p.x + (dx / d) * speed * dt, nz = p.z + (dz / d) * speed * dt;
        // Ours: never wander across the bilog mid-match; turn back and pick somewhere else.
        if (Math.hypot(nx, nz) < 3.6) c.target = this.pick();
        else { p.x = nx; p.z = nz; }
        c.group.rotation.y = Math.atan2(-dz, dx);
      }
      p.x = THREE.MathUtils.clamp(p.x, -25, 25);
      p.z = THREE.MathUtils.clamp(p.z, -11, 18);
      p.y = speed > 0 ? Math.abs(Math.sin(elapsed * 14)) * 0.03 : 0;
      c.head.rotation.z = pecking ? -0.9 * Math.max(0, Math.sin(elapsed * 9)) : 0;
    }
  }

  pick() {
    // Anywhere on the plaza except the bilog itself.
    for (;;) {
      const v = new THREE.Vector2((this.rng() - 0.5) * 40, -6 + this.rng() * 22);
      if (v.length() > 4) return v;
    }
  }
}
