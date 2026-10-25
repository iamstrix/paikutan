import * as THREE from 'three';
import { bakeChildren, ball, box, cyl, outline } from '../world/kit.js';

// Chunky big-head barangay characters built from primitives. Each recipe hangs
// meshes off the same rig of pivots so one animation set drives everyone.

export const CHARACTER_INFO = {
  lola: { label: 'Lola Nena', blurb: 'Hand fan and house dress. Never backs down.' },
  totoy: { label: 'Mang Totoy', blurb: 'Tank top, towel, flip-flops. King of the corner.' },
  binata: { label: 'Kuya Jun', blurb: 'Jersey and a backwards cap. Too cool.' },
  marites: { label: 'Tita Marites', blurb: 'Curlers in her hair. Knows everything.' },
  tanod: { label: 'Kuya Tanod', blurb: 'Has a flashlight. Guards the circle.' },
  bata: { label: 'Totoy Bata', blurb: 'Bowl cut. Fastest runner around.' },
};

function pivot(parent, x, y, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function face(head, r, opts = {}) {
  // The skull sits r * 0.9 above the head pivot. tromPOW laid the features out round the pivot,
  // which put them down at the neck, so they hang off an anchor at the skull's centre instead.
  const anchor = new THREE.Group();
  anchor.position.y = r * 0.9;
  head.add(anchor);
  head = anchor;
  const ex = r * 0.36;
  const ey = r * 0.05;
  const ez = r * 0.92;
  const my = -r * 0.38;
  const ink = '#1d1612';
  // Static features.
  for (const side of [-1, 1]) {
    if (opts.blush) box(head, [0.07, 0.035, 0.02], '#e98a8a', [side * r * 0.55, -r * 0.18, r * 0.82]);
    if (opts.glasses) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.012, 4, 10), new THREE.MeshStandardMaterial({ color: '#6b4a2b' }));
      lens.position.set(side * ex, ey, r * 0.97);
      head.add(lens);
    }
  }
  if (opts.glasses) box(head, [0.08, 0.012, 0.012], '#6b4a2b', [0, r * 0.07, r * 0.98]);
  box(head, [0.06, 0.06, 0.05], '#9a6444', [0, -r * 0.12, r * 0.95]);
  if (opts.mustache) box(head, [0.2, 0.04, 0.03], '#2b211b', [0, -r * 0.24, r * 0.92]);

  const group = () => {
    const g = new THREE.Group();
    head.add(g);
    return g;
  };
  const neutral = group();
  const happy = group();
  const sad = group();
  const dizzy = group();
  for (const side of [-1, 1]) {
    const x = side * ex;
    box(neutral, [0.06, 0.08, 0.03], ink, [x, ey, ez]);
    box(neutral, [0.02, 0.02, 0.01], '#ffffff', [x + 0.012, ey + 0.04, ez + 0.02]);
    // ^ ^ eyes.
    box(happy, [0.05, 0.018, 0.03], ink, [x - 0.016, ey, ez], [0, 0, 0.6]);
    box(happy, [0.05, 0.018, 0.03], ink, [x + 0.016, ey, ez], [0, 0, -0.6]);
    // Worried dots and tilted brows.
    box(sad, [0.05, 0.05, 0.03], ink, [x, ey - 0.01, ez]);
    box(sad, [0.075, 0.016, 0.03], ink, [x, ey + r * 0.28, ez - 0.01], [0, 0, side * -0.35]);
    // X X eyes.
    box(dizzy, [0.075, 0.016, 0.03], ink, [x, ey, ez], [0, 0, 0.785]);
    box(dizzy, [0.075, 0.016, 0.03], ink, [x, ey, ez], [0, 0, -0.785]);
  }
  box(neutral, [0.12, 0.025, 0.02], '#7a3b2e', [0, my, r * 0.88]);
  box(happy, [0.13, 0.06, 0.02], '#3a1612', [0, my + 0.01, r * 0.88]);
  box(happy, [0.07, 0.024, 0.022], '#d9545c', [0, my - 0.008, r * 0.885]);
  box(sad, [0.06, 0.02, 0.02], '#7a3b2e', [-0.025, my, r * 0.88], [0, 0, 0.4]);
  box(sad, [0.06, 0.02, 0.02], '#7a3b2e', [0.025, my, r * 0.88], [0, 0, -0.4]);
  box(dizzy, [0.05, 0.05, 0.02], '#3a1612', [0, my, r * 0.88]);
  happy.visible = sad.visible = dizzy.visible = false;
  bakeChildren(anchor);
  return { neutral, happy, sad, dizzy };
}

/** Bare feet in tsinelas (with the V strap), white sneakers, or tanod boots. */
function footwear(leg, char, y, skin, accent) {
  if (char === 'binata') {
    box(leg, [0.15, 0.07, 0.26], '#f4f1ea', [0, y + 0.01, 0.04]);
    box(leg, [0.155, 0.025, 0.265], '#2b2b2b', [0, y - 0.025, 0.04]);
    box(leg, [0.157, 0.025, 0.12], accent, [0, y + 0.015, 0.02]);
    return;
  }
  if (char === 'tanod') {
    box(leg, [0.15, 0.14, 0.24], '#1d1d1d', [0, y + 0.04, 0.03]);
    return;
  }
  const strap = ['#3f8fd8', '#2a9d5c', '#e94b3c', '#f2c230'][char.length % 4];
  box(leg, [0.15, 0.025, 0.27], '#f4f1ea', [0, y - 0.02, 0.04]);
  box(leg, [0.12, 0.045, 0.22], skin, [0, y + 0.012, 0.045]);
  for (const side of [-1, 1]) box(leg, [0.02, 0.022, 0.13], strap, [side * 0.035, y + 0.04, 0.09], [0, side * 0.55, 0]);
}

export function buildCharacter(char, accent) {
  // Paikutan's Kapitana wears the tanod's barangay uniform, with a bun instead of his mustache.
  const captain = char === 'kapitana';
  if (captain) char = 'tanod';
  const root = new THREE.Group();
  const body = pivot(root, 0, 0);
  const s = char === 'bata' ? 0.78 : 1;
  body.scale.setScalar(s);

  const skin = { lola: '#c99872', totoy: '#a8714a', binata: '#b98058', marites: '#d1a07a', tanod: '#a46c47', bata: '#c08a60' }[char] ?? '#b98058';
  const hipY = char === 'bata' ? 0.42 : 0.48;
  const legL = pivot(body, -0.12, hipY);
  const legR = pivot(body, 0.12, hipY);
  const armL = pivot(body, -0.3, 1.0);
  const armR = pivot(body, 0.3, 1.0);
  const head = pivot(body, 0, 1.13);
  const hand = pivot(armR, 0, -0.5, 0.05);
  let prop = null;

  const legColor = { lola: skin, totoy: '#2f5aa8', binata: '#202020', marites: skin, tanod: '#2b3140', bata: '#c0392b' }[char] ?? '#333';
  const legLen = hipY - 0.05;
  for (const leg of [legL, legR]) {
    cyl(leg, 0.075, 0.065, legLen, legColor === skin || char === 'binata' ? skin : legColor, [0, -legLen / 2, 0], undefined, 6);
    footwear(leg, char, -legLen, skin, accent);
  }
  if (char === 'totoy' || char === 'bata' || char === 'binata') {
    for (const leg of [legL, legR]) cyl(leg, 0.095, 0.095, 0.2, char === 'binata' ? accent : legColor, [0, -0.08, 0], undefined, 6);
  }

  // Torso by outfit.
  const torsoH = 1.0 - hipY + 0.06;
  const torsoY = hipY + torsoH / 2 - 0.02;
  switch (char) {
    case 'lola':
    case 'marites': {
      // Daster: flared to the knee.
      const daster = char === 'lola' ? '#e88aa7' : '#f2c94c';
      cyl(body, 0.24, 0.34, 0.75, daster, [0, 0.66, 0], undefined, 8);
      for (let i = 0; i < 7; i += 1) {
        const a = i * 0.9;
        ball(body, 0.035, char === 'lola' ? '#ffffff' : '#e86a3c', [Math.cos(a) * 0.29, 0.4 + (i % 3) * 0.18, Math.sin(a) * 0.29]);
      }
      box(body, [0.36, 0.06, 0.25], accent, [0, 0.92, 0.04]);
      break;
    }
    case 'totoy': {
      cyl(body, 0.25, 0.27, torsoH, '#f4f1ea', [0, torsoY, 0], undefined, 8);
      ball(body, 0.24, '#f4f1ea', [0, 0.7, 0.1], [1, 0.9, 0.9]);
      // Towel over the shoulder.
      box(body, [0.14, 0.04, 0.5], accent, [0.2, 1.02, 0], [0, 0, -0.3]);
      box(body, [0.14, 0.32, 0.04], accent, [0.25, 0.85, 0.22], [0, 0, -0.15]);
      break;
    }
    case 'binata': {
      cyl(body, 0.24, 0.22, torsoH, accent, [0, torsoY, 0], undefined, 8);
      box(body, [0.08, torsoH * 0.9, 0.02], '#ffffff', [0, torsoY, 0.23]);
      break;
    }
    case 'tanod': {
      cyl(body, 0.24, 0.24, torsoH, '#d9d2c0', [0, torsoY, 0], undefined, 8);
      cyl(body, 0.255, 0.255, torsoH * 0.85, '#1f3c78', [0, torsoY + 0.02, 0], undefined, 8);
      box(body, [0.3, 0.05, 0.02], '#f2c230', [0, torsoY + 0.08, 0.255]);
      box(body, [0.3, 0.05, 0.02], accent, [0, torsoY - 0.05, 0.255]);
      break;
    }
    default: {
      cyl(body, 0.22, 0.22, torsoH, '#f4f1ea', [0, torsoY, 0], undefined, 8);
      box(body, [0.3, 0.04, 0.02], accent, [0, torsoY, 0.22]);
    }
  }

  // Arms.
  const sleeve = char === 'binata' ? accent : char === 'tanod' ? '#d9d2c0' : skin;
  for (const arm of [armL, armR]) {
    cyl(arm, 0.065, 0.055, 0.45, sleeve === skin ? skin : sleeve, [0, -0.22, 0], undefined, 6);
    // Mitten hand with a thumb.
    ball(arm, 0.065, skin, [0, -0.48, 0], [1, 1.15, 0.8]);
    box(arm, [0.035, 0.055, 0.035], skin, [0, -0.46, 0.055], [0.4, 0, 0]);
  }

  // Head and hair.
  const r = char === 'bata' ? 0.3 : 0.27;
  const skull = ball(head, r, skin, [0, r * 0.9, 0], [1, 0.95, 0.95], 1);
  skull.castShadow = true;
  let faces = null;
  const h = (opts) => {
    faces = face(head, r, opts);
  };
  const hy = r * 0.9;
  // Hair is a cap set back on the skull so it never covers the face.
  const hair = (color) => ball(head, r, color, [0, hy + 0.07, -0.07], [1.06, 0.82, 0.9], 1);
  switch (char) {
    case 'lola':
      hair('#b9b4ad');
      ball(head, 0.13, '#b9b4ad', [0, hy + 0.1, -0.27]);
      h({ glasses: true, blush: true });
      prop = new THREE.Group();
      cyl(prop, 0.18, 0.18, 0.015, '#d9a441', [0, -0.05, 0], [Math.PI / 2, 0, 0], 8);
      prop.position.set(0, -0.48, 0.08);
      armL.add(prop);
      break;
    case 'totoy':
      box(head, [r * 1.6, 0.06, r * 1.4], '#2b211b', [0, hy - 0.02, -0.05]);
      h({ mustache: true });
      break;
    case 'binata':
      hair('#1d1612');
      cyl(head, r * 0.95, r * 1.0, 0.14, accent, [0, hy + 0.2, 0], undefined, 8);
      box(head, [0.25, 0.03, 0.2], accent, [0, hy + 0.16, -r - 0.05]);
      h({});
      break;
    case 'marites':
      hair('#3b2a20');
      for (let i = 0; i < 6; i += 1) {
        const a = -0.9 + (i % 3) * 0.9;
        cyl(head, 0.05, 0.05, 0.13, ['#e94b8a', '#3f8fd8', '#f7c548'][i % 3], [Math.sin(a) * 0.17, hy + 0.2 + Math.floor(i / 3) * 0.02, -0.05 + Math.cos(a) * 0.1 - Math.floor(i / 3) * 0.16], [0, 0, Math.PI / 2], 6);
      }
      h({ blush: true });
      break;
    case 'tanod':
      hair('#1d1612');
      cyl(head, r * 0.98, r * 1.02, 0.12, '#1f3c78', [0, hy + 0.2, 0], undefined, 8);
      box(head, [0.3, 0.03, 0.18], '#1f3c78', [0, hy + 0.15, r + 0.04]);
      if (captain) ball(head, 0.12, '#1d1612', [0, hy + 0.06, -0.28]);
      h({ mustache: !captain, blush: captain });
      prop = new THREE.Group();
      cyl(prop, 0.035, 0.03, 0.24, '#2b2b2b', [0, 0, 0], [Math.PI / 2, 0, 0], 6);
      cyl(prop, 0.045, 0.045, 0.04, '#fff3b0', [0, 0, 0.13], [Math.PI / 2, 0, 0], 6);
      prop.position.set(0, -0.5, 0.06);
      armL.add(prop);
      break;
    case 'bata':
      hair('#16100c');
      box(head, [r * 1.7, 0.06, 0.08], '#16100c', [0, hy + 0.12, r * 0.85]);
      h({ blush: true });
      break;
  }

  for (const g of [body, legL, legR, armL, armR, head, prop]) {
    const merged = g ? bakeChildren(g) : null;
    if (merged) outline(merged);
  }
  if (!faces) throw new Error(`No face built for ${char}`);
  const faceSet = faces;
  for (const f of Object.values(faceSet)) bakeChildren(f);
  return { root, body, legL, legR, armL, armR, head, hand, prop, faces: faceSet };
}
