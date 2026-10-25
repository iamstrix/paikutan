import * as THREE from 'three';
import { ZONE_WARN } from '../arena-zones.js';

function texture(draw, width = 256, height = 256) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function patchTexture(lucky) {
  return texture((g, w, h) => {
    g.translate(w / 2, h / 2);
    if (lucky) {
      const halo = g.createRadialGradient(0, 0, 40, 0, 0, 125);
      halo.addColorStop(0, '#ffd95a99'); halo.addColorStop(1, '#ffd95a00');
      g.fillStyle = halo; g.fillRect(-128, -128, 256, 256);
    }
    g.fillStyle = lucky ? '#fff8e7' : '#e5b928b8';
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = i ? 30 + i * 5 : 0;
      g.beginPath(); g.ellipse(Math.cos(a) * r, Math.sin(a) * r * 0.8, 30 + i % 3 * 5, 22 + i % 2 * 7, a, 0, Math.PI * 2); g.fill();
    }
    if (lucky) {
      g.fillStyle = '#746b4d'; g.beginPath(); g.ellipse(2, 0, 24, 19, 0.3, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffdc5c';
      for (const [x, y] of [[-85, -50], [65, 70], [90, -55]]) {
        g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x + 4, y - 3); g.lineTo(x + 12, y); g.lineTo(x + 4, y + 3);
        g.lineTo(x, y + 12); g.lineTo(x - 4, y + 3); g.lineTo(x - 12, y); g.lineTo(x - 4, y - 3); g.closePath(); g.fill();
      }
    } else {
      g.strokeStyle = '#fff3a1aa'; g.lineWidth = 3;
      for (const r of [30, 56, 84]) { g.beginPath(); g.ellipse(0, 0, r, r * 0.55, -0.25, 0, Math.PI * 2); g.stroke(); }
    }
  });
}

function labelTexture(text, lucky) {
  return texture((g, w, h) => {
    g.fillStyle = '#201936e8'; g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 25); g.fill();
    g.strokeStyle = lucky ? '#ffdf6c' : '#f4bd43'; g.lineWidth = 4; g.stroke();
    g.fillStyle = lucky ? '#fff4b5' : '#ffe195'; g.font = 'bold 40px system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2);
  }, 256, 80);
}

function bird() {
  const group = new THREE.Group(), brown = new THREE.MeshLambertMaterial({ color: '#685044' });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), brown); body.scale.set(1.8, 0.9, 1);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), brown); head.position.set(0.18, 0.08, 0);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 4), new THREE.MeshBasicMaterial({ color: '#e7b451' }));
  beak.rotation.z = -Math.PI / 2; beak.position.set(0.31, 0.08, 0);
  const wings = [-1, 1].map(side => {
    const pivot = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.35), brown);
    mesh.position.z = side * 0.17; pivot.add(mesh); group.add(pivot); return pivot;
  });
  group.add(body, head, beak); group.userData.wings = wings;
  return group;
}

export class ArenaZoneViews {
  constructor(scene) {
    this.scene = scene; this.views = new Map(); this.time = 0;
    this.maps = { swerte: patchTexture(true), ihi: patchTexture(false) };
    this.labels = {};
    for (const type of ['swerte', 'ihi']) for (const pending of [true, false]) {
      const name = type === 'swerte' ? 'SWERTE!' : 'MADULAS!';
      this.labels[type + pending] = labelTexture(pending ? (type === 'swerte' ? 'IBON!' : 'IHI!') : name, type === 'swerte');
    }
  }
  make(zone) {
    const group = new THREE.Group(); group.name = 'arena-zone-' + zone.type;
    group.position.set(zone.x, 0, zone.z);
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(zone.r * 2.2, zone.r * 2.2), new THREE.MeshBasicMaterial({
      map: this.maps[zone.type], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
    }));
    patch.rotation.x = -Math.PI / 2; patch.position.y = 0.026;
    const ring = new THREE.Mesh(new THREE.RingGeometry(zone.r * 0.94, zone.r, 40), new THREE.MeshBasicMaterial({
      color: zone.type === 'swerte' ? '#ffdc65' : '#e7ae30', transparent: true, depthWrite: false, opacity: 0.85,
    }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.labels[zone.type + true], depthWrite: false, depthTest: false }));
    label.position.set(0, 0.65, 0); label.scale.set(1.6, 0.5, 1); label.renderOrder = 20;
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), new THREE.MeshBasicMaterial({ color: '#251b11', transparent: true, opacity: 0.3, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.022;
    group.add(patch, ring, label, shadow);
    let visitor = null, drop = null;
    if (zone.type === 'swerte') {
      visitor = bird(); group.add(visitor);
      drop = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), new THREE.MeshBasicMaterial({ color: '#fff8e7' })); group.add(drop);
    }
    this.scene.add(group);
    return { group, patch, ring, label, shadow, visitor, drop, state: { ...zone } };
  }
  remove(id) {
    const view = this.views.get(id); if (!view) return;
    view.group.removeFromParent();
    const materials = new Set(), geometries = new Set();
    view.group.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    this.views.delete(id);
  }
  sync(zones = []) {
    const ids = new Set(zones.map(zone => zone.id));
    for (const id of this.views.keys()) if (!ids.has(id)) this.remove(id);
    for (const zone of zones) {
      let view = this.views.get(zone.id);
      if (!view) { view = this.make(zone); this.views.set(zone.id, view); }
      view.state = { ...zone };
    }
  }
  reset() { for (const id of this.views.keys()) this.remove(id); }
  update(dt) {
    this.time += dt;
    for (const view of this.views.values()) {
      const zone = view.state; zone.age += dt;
      const pending = zone.age < 0, fade = pending ? 1 : Math.min(1, (zone.life - zone.age) / 0.7);
      view.group.visible = fade > 0;
      view.shadow.visible = pending && zone.type === 'swerte';
      view.shadow.scale.setScalar(1 + Math.min(1, (zone.age + ZONE_WARN) / ZONE_WARN));
      view.patch.visible = !pending; view.patch.material.opacity = Math.max(0, fade);
      view.ring.material.opacity = Math.max(0, fade) * (pending ? 0.45 + 0.4 * Math.sin(this.time * 12) ** 2 : 0.65);
      view.ring.scale.setScalar(pending ? 1 + 0.12 * Math.sin(this.time * 8) : 1);
      view.label.material.map = this.labels[zone.type + pending]; view.label.material.opacity = Math.max(0, fade);
      if (view.visitor) {
        const progress = (zone.age + ZONE_WARN) / (ZONE_WARN + 1);
        view.visitor.visible = progress < 1;
        view.visitor.position.set((progress - 0.5) * 8, 3.2, 0);
        view.visitor.userData.wings.forEach((wing, i) => { wing.rotation.x = Math.sin(this.time * 22) * (i ? -0.7 : 0.7); });
        view.drop.visible = pending && zone.age > -0.4;
        view.drop.position.set(0, Math.max(0, -zone.age / 0.4 * 3), 0);
      }
    }
  }
}
