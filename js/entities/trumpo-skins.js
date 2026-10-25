// Hand-painted lacquer and shallow shoulder decoration. All marks stay on the wooden top.
import * as THREE from 'three';

const skins = new Map();
export const TRUMPO_PAINT = {
  kidlat: { base: '#172f55', accent: '#eabe53', trim: '#dcae48', neck: '#172f55' },
  tikbalang: { base: '#794321', accent: '#c83938', trim: '#8f999e', neck: '#69391f' },
  agimat: { base: '#117a67', accent: '#dbb95b', trim: '#dbb95b', neck: '#573721' },
  diwata: { base: '#eeaebd', accent: '#652ba0', trim: '#d9b052', neck: '#652ba0' },
  bakunawa: { base: '#101e36', accent: '#39aaa9', trim: '#9bbfc0', neck: '#101e36' },
};

function polygon(g, points, fill, stroke, width = 2) {
  g.beginPath(); points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
}

function sun(g, x, y, radius, color) {
  g.save(); g.translate(x, y); g.fillStyle = color;
  for (let i = 0; i < 8; i++) {
    g.rotate(Math.PI / 4);
    polygon(g, [[-radius * .09, -radius * .48], [0, -radius], [radius * .09, -radius * .48]], color);
  }
  g.beginPath(); g.arc(0, 0, radius * .42, 0, Math.PI * 2); g.fill(); g.restore();
}

function blossom(g, x, y, radius, color = '#fff4dc') {
  g.save(); g.translate(x, y);
  for (let i = 0; i < 5; i++) {
    g.rotate(Math.PI * 2 / 5);
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(-radius * .65, -radius * .3, -radius * .65, -radius, 0, -radius);
    g.bezierCurveTo(radius * .65, -radius, radius * .65, -radius * .3, 0, 0);
    g.fillStyle = color; g.fill(); g.strokeStyle = '#d6ab54'; g.lineWidth = Math.max(1, radius * .045); g.stroke();
  }
  g.beginPath(); g.arc(0, 0, radius * .15, 0, 7); g.fillStyle = '#d6ab54'; g.fill(); g.restore();
}

/** Readable horse profile: ears, forehead, elongated muzzle, arched neck and red mane. */
function horse(g, x, y, size) {
  g.save(); g.translate(x, y); g.scale(size, size);
  g.beginPath(); g.moveTo(-.55, .87);
  g.bezierCurveTo(-.64, .46, -.5, .04, -.28, -.12);
  g.lineTo(-.35, -.58); g.lineTo(-.08, -.4); g.lineTo(.12, -.78); g.lineTo(.25, -.4);
  g.bezierCurveTo(.58, -.26, .62, -.03, .9, .16);
  g.lineTo(.73, .43); g.lineTo(.36, .34); g.lineTo(.21, .03);
  g.bezierCurveTo(.02, .25, .14, .59, .39, .87); g.closePath();
  g.fillStyle = '#d2a05d'; g.fill(); g.strokeStyle = '#422617'; g.lineWidth = .055; g.stroke();
  polygon(g, [[-.31, -.3], [-.64, -.1], [-.5, .08], [-.75, .3], [-.54, .4], [-.7, .72], [-.42, .63], [-.35, .3], [-.11, -.02]], '#c83938', '#762326', .025);
  g.beginPath(); g.arc(.33, -.15, .055, 0, 7); g.fillStyle = '#241a14'; g.fill();
  g.beginPath(); g.arc(.74, .21, .025, 0, 7); g.fill();
  g.beginPath(); g.moveTo(.41, .29); g.lineTo(.7, .36); g.strokeStyle = '#704222'; g.lineWidth = .035; g.stroke();
  g.restore();
}

function serpent(g, x, y, radius, drawHead = true) {
  g.save(); g.translate(x, y); g.lineCap = 'round';
  g.beginPath(); g.arc(0, 0, radius, -.65, Math.PI * 1.52);
  g.strokeStyle = '#b0b6a5'; g.lineWidth = radius * .28; g.stroke();
  g.strokeStyle = '#238c91'; g.lineWidth = radius * .19; g.stroke();
  for (let i = 0; i < 13; i++) {
    const a = -.5 + i * .39;
    g.save(); g.rotate(a); polygon(g, [[radius * .91, -3], [radius * 1.16, 0], [radius * .91, 4]], '#15364d'); g.restore();
  }
  if (drawHead) {
  g.save(); g.translate(Math.cos(-.65) * radius, Math.sin(-.65) * radius); g.rotate(.5);
  polygon(g, [[-radius * .16, -radius * .17], [radius * .14, -radius * .28], [radius * .4, -radius * .1], [radius * .16, radius * .2], [-radius * .16, radius * .15]], '#81beb5', '#15283e', 2);
  polygon(g, [[radius * .2, -radius * .15], [radius * .25, radius * .14], [radius * .08, -.01]], '#ffefd2');
  g.beginPath(); g.arc(0, -radius * .08, radius * .047, 0, 7); g.fillStyle = '#72f3dd'; g.fill(); g.restore();
  }
  g.restore();
}

function grain(g, w, h, dark = false) {
  g.save(); g.strokeStyle = dark ? 'rgba(235,210,151,.13)' : 'rgba(49,25,17,.12)';
  for (let i = 0; i < 64; i++) {
    g.lineWidth = .5 + (i % 4) * .3; g.beginPath();
    for (let x = 0; x <= w; x += 8) g.lineTo(x, i * h / 64 + Math.sin(x * .035 + i) * 1.2 + Math.sin(x * .009 + i) * 2);
    g.stroke();
  }
  g.restore();
}

function bodyPaint(g, id, p, form, w, h) {
  const bottom = form.profile[0][1], top = form.profile.at(-1)[1];
  const y = height => (1 - (height - bottom) / (top - bottom)) * h;
  function band(height, thickness, color) { g.fillStyle = color; g.fillRect(0, y(height), w, thickness); }
  // Uniform lacquer comes first. Wood is grain underneath, not an unpainted upper half.
  g.fillStyle = p.base; g.fillRect(0, 0, w, h);
  grain(g, w, h, id === 'kidlat' || id === 'bakunawa');
  if (id === 'kidlat') {
    for (const height of [.24, .405, .535]) {
      const cy = y(height);
      g.beginPath();
      for (let i = -1; i <= 12; i++) {
        const x = i * w / 6;
        g.lineTo(x, cy); g.lineTo(x + w / 18, cy + 24); g.lineTo(x + w / 9, cy + 12); g.lineTo(x + w / 6, cy + 36);
      }
      g.strokeStyle = p.trim; g.lineWidth = 12; g.lineJoin = 'miter'; g.stroke();
    }
  } else if (id === 'tikbalang') {
    for (let i = 0; i < 3; i++) horse(g, (i + .5) * w / 3, y(.235), 42);
    band(.34, 26, '#343c40'); band(.342, 3, '#a3a29a'); band(.31, 3, '#a3a29a');
    for (let i = 0; i < 18; i++) { g.beginPath(); g.arc((i + .5) * w / 18, y(.325), 3, 0, 7); g.fillStyle = '#c5bfa8'; g.fill(); }
    band(.19, 6, p.accent);
  } else if (id === 'agimat') {
    for (const height of [.22, .32, .41]) {
      band(height, 7, p.trim);
      for (let i = 0; i < 12; i++) polygon(g, [[i * w / 12, y(height) + 9], [(i + .5) * w / 12, y(height) + 24], [(i + 1) * w / 12, y(height) + 9]], null, p.trim, 3);
    }
    for (let i = 0; i < 3; i++) {
      const x = (i + .5) * w / 3, cy = y(.3);
      polygon(g, [[x, cy + 61], [x - 54, cy - 36], [x + 54, cy - 36]], '#146a59', p.trim, 6); sun(g, x, cy, 33, p.trim);
    }
  } else if (id === 'diwata') {
    for (let i = 0; i < 5; i++) {
      const x = (i + .5) * w / 5;
      g.beginPath(); g.moveTo(x, y(.47));
      g.bezierCurveTo(x - 80, y(.34), x - 20, y(.22), x, y(.15));
      g.bezierCurveTo(x + 20, y(.22), x + 80, y(.34), x, y(.47));
      g.fillStyle = p.accent; g.fill(); g.strokeStyle = p.trim; g.lineWidth = 3; g.stroke();
      g.beginPath(); g.moveTo(x, y(.2)); g.bezierCurveTo(x - 50, y(.25), x + 50, y(.37), x, y(.41)); g.stroke();
      blossom(g, x, y(.28 + (i % 2) * .035), 23);
    }
  } else {
    for (let i = 0; i < 3; i++) serpent(g, (i + .5) * w / 3, y(.25), 50);
    for (const height of [.2, .43]) { band(height, 5, p.trim); band(height - .008, 3, p.accent); }
  }
  // The winding neck is deliberately visible and varies with the reference.
  g.fillStyle = p.neck; g.fillRect(0, 0, w, y(form.neck));
  grain(g, w, Math.max(1, y(form.neck)), true);
  band(form.neck, 4, p.trim);
  // Small wear marks preserve the toy's wooden construction without undoing its palette.
  g.fillStyle = '#c69b60';
  for (let i = 0; i < 22; i++) { g.globalAlpha = .18; g.fillRect((i * 83) % w, y(.17 + (i % 7) * .038), 2 + i % 3, 1); }
  g.globalAlpha = 1;
}

function shoulderPaint(g, id, p, w, h) {
  const c = w / 2, s = w / 512;
  g.fillStyle = p.base; g.fillRect(0, 0, w, h); grain(g, w, h, id === 'kidlat' || id === 'bakunawa');
  g.save(); g.translate(c, c); g.scale(s, s);
  if (id === 'kidlat') {
    for (let i = 0; i < 6; i++) {
      g.save(); g.rotate(i * Math.PI / 3);
      polygon(g, [[-19, -76], [31, -147], [5, -140], [28, -221], [-43, -118], [-12, -126]], p.trim, '#f9e4a0', 2); g.restore();
    }
  } else if (id === 'tikbalang') {
    for (let i = 0; i < 3; i++) { g.save(); g.rotate(i * Math.PI * 2 / 3); horse(g, 0, -147, 75); g.restore(); }
  } else if (id === 'agimat') {
    polygon(g, [[0, -228], [197, 114], [-197, 114]], '#136b5a', p.trim, 13);
    for (let i = 0; i < 3; i++) { g.save(); g.rotate(i * Math.PI * 2 / 3); sun(g, 0, -139, 38, p.trim); g.restore(); }
  } else if (id === 'diwata') {
    for (let i = 0; i < 5; i++) {
      g.save(); g.rotate(i * Math.PI * 2 / 5);
      g.beginPath(); g.moveTo(0, -65); g.bezierCurveTo(-88, -105, -85, -196, 0, -230); g.bezierCurveTo(85, -196, 88, -105, 0, -65);
      g.fillStyle = '#fff0dc'; g.fill(); g.strokeStyle = p.trim; g.lineWidth = 4; g.stroke();
      g.beginPath(); g.moveTo(0, -84); g.bezierCurveTo(-30, -130, -22, -172, 0, -205); g.strokeStyle = '#e6a3ba'; g.lineWidth = 8; g.stroke(); g.restore();
    }
  } else {
    serpent(g, 0, 0, 176, false);
    for (let i = 0; i < 8; i++) { g.save(); g.rotate(i * Math.PI / 4); g.beginPath(); g.arc(0, -112, 22, .2, 2.5); g.strokeStyle = p.trim; g.lineWidth = 3; g.stroke(); g.restore(); }
  }
  g.restore();
}

export function trumpoSkin(id, form, shoulder = false) {
  const key = id + (shoulder ? '-shoulder' : '-body');
  if (skins.has(key)) return skins.get(key);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d'), paint = TRUMPO_PAINT[id] || TRUMPO_PAINT.kidlat;
  if (shoulder) shoulderPaint(g, id, paint, 512, 512); else bodyPaint(g, id, paint, form, 512, 512);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  if (!shoulder) texture.wrapS = THREE.RepeatWrapping;
  skins.set(key, texture); return texture;
}
