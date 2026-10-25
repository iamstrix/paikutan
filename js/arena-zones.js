// Host-authoritative arena patches. Clients receive their position and lifetime in snapshots.
export const ZONE_WARN = 1.2;
export const ZONE_RULES = {
  swerte: { r: 0.85, life: 6, recovery: 0.045, cap: 0.10, steady: 0.06 },
  ihi: { r: 0.9, life: 6, drain: 0.02, grip: 0.7, drag: 0.75 },
};

export function canPlaceZone(w, type, x, z) {
  const r = ZONE_RULES[type].r;
  return Math.hypot(x, z) + r + 0.3 < w.ring
    && w.tops.every(tp => !tp.launched || !tp.alive || Math.hypot(tp.x - x, tp.z - z) > r + 0.85)
    && w.eggs.every(e => Math.hypot(e.x - x, e.z - z) > r + 0.65)
    && w.zones.every(e => Math.hypot(e.x - x, e.z - z) > r + e.r + 0.35);
}

export function placeZone(w, type, x, z) {
  const rules = ZONE_RULES[type];
  const zone = { id: ++w.zoneId, type, x, z, r: rules.r, age: -ZONE_WARN, life: rules.life, used: w.tops.map(() => 0) };
  w.zones.push(zone);
  w.events.push({ type: 'zoneWarn', zone: type, id: zone.id, x, z });
  return zone;
}

export function advanceZones(w, dt) {
  for (let i = w.zones.length - 1; i >= 0; i--) {
    const zone = w.zones[i], before = zone.age;
    zone.age += dt;
    if (zone.age >= zone.life || Math.hypot(zone.x, zone.z) + zone.r > w.ring) {
      w.zones.splice(i, 1);
    } else if (before < 0 && zone.age >= 0) {
      w.events.push({ type: 'zoneLand', zone: zone.type, id: zone.id, x: zone.x, z: zone.z });
    }
  }
  // One bird visit per round. Retry a crowded landing site instead of dropping under a top.
  if (!w.birdDone && w.t >= w.birdAt && w.tops.filter(tp => tp.launched && tp.alive).length >= 2) {
    for (let i = 0; i < 24; i++) {
      const a = w.rand() * Math.PI * 2, r = Math.sqrt(w.rand()) * w.ring * 0.6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!canPlaceZone(w, 'swerte', x, z)) continue;
      placeZone(w, 'swerte', x, z); w.birdDone = true;
      break;
    }
    w.birdAt = w.t + 0.5;
  }
}

export function zoneAt(w, tp) {
  if (!tp.launched || !tp.alive) return null;
  return w.zones.find(zone => zone.age >= 0 && zone.age < zone.life
    && Math.hypot(tp.x - zone.x, tp.z - zone.z) <= zone.r + 0.12) || null;
}

export function applyZone(w, tp, dt) {
  const zone = zoneAt(w, tp);
  tp.zone = zone?.type || '';
  tp.luckSpent = false;
  if (zone && zone.id !== tp.zoneId) {
    w.events.push({ type: 'zoneEnter', zone: zone.type, id: zone.id, x: tp.x, z: tp.z, slot: tp.slot });
  }
  tp.zoneId = zone?.id || 0;
  if (!zone) return;
  const rules = ZONE_RULES[zone.type];
  if (zone.type === 'ihi') {
    tp.spin = Math.max(0, tp.spin - rules.drain * dt);
  } else {
    const available = Math.max(0, rules.cap - (zone.used[tp.slot] || 0));
    // Used luck persists across exits/re-entry. No revival or extra ability charge.
    if (tp.spin > 0.03 && tp.wobble < 1 && available > 1e-8) {
      const gain = Math.max(0, Math.min(rules.recovery * dt, available, 1 - tp.spin));
      tp.spin += gain; zone.used[tp.slot] = (zone.used[tp.slot] || 0) + gain;
      if (gain > 0) tp.wobble = Math.max(0, tp.wobble - rules.steady * dt);
    }
    tp.luckSpent = (zone.used[tp.slot] || 0) >= rules.cap - 1e-8;
  }
}
