// Small carved / applied details. These follow the wooden shoulder; no projecting blade rings.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function shoulderY(radius, form) {
  const r = Math.min(radius, form.radius - .0001);
  let y = form.profile[0][1];
  for (let i = 1; i < form.profile.length; i++) {
    const [ar, ay] = form.profile[i - 1], [br, by] = form.profile[i];
    if (r < Math.min(ar, br) || r > Math.max(ar, br) || ar === br) continue;
    y = Math.max(y, ay + (by - ay) * (r - ar) / (br - ar));
  }
  return y;
}

/** Conforming shoulder skin: a curved piece of the top, not a floating horizontal disc. */
export function shoulderGeometry(form, low) {
  const sides = low ? 24 : 48, rows = 8;
  const positions = [], uv = [], index = [];
  const inner = form.neckRadius * 1.04, outer = form.radius * .994;
  for (let row = 0; row <= rows; row++) {
    const r = inner + (outer - inner) * row / rows;
    for (let i = 0; i <= sides; i++) {
      const a = i * Math.PI * 2 / sides, x = Math.cos(a) * r, z = Math.sin(a) * r;
      positions.push(x, shoulderY(r, form) + .0012, z);
      uv.push(.5 + x / .5, .5 - z / .5);
      if (row < rows && i < sides) {
        const k = row * (sides + 1) + i, n = k + sides + 1;
        index.push(k, k + 1, n, k + 1, n + 1, n);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index); geometry.computeVertexNormals(); return geometry;
}

export function buildTrumpoRelief(id, form, paint, low) {
  const group = new THREE.Group(), buckets = new Map();
  const brass = new THREE.MeshStandardMaterial({ color: paint.trim, metalness: .55, roughness: .44 });
  const iron = new THREE.MeshStandardMaterial({ color: '#535e63', metalness: .65, roughness: .48 });
  const cord = new THREE.MeshStandardMaterial({ color: id === 'tikbalang' ? '#ba3034' : '#899f94', roughness: .95 });
  const jade = new THREE.MeshStandardMaterial({ color: '#3b9b9d', metalness: .18, roughness: .5 });
  const ivory = new THREE.MeshStandardMaterial({ color: '#fff0d2', roughness: .4 });
  const eye = new THREE.MeshStandardMaterial({ color: '#74efe0', emissive: '#3ab9b5', emissiveIntensity: .6, roughness: .4 });
  const shadow = new THREE.MeshStandardMaterial({ color: '#071322', roughness: .8 });
  function add(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    geometry.applyMatrix4(matrix);
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(geometry);
  }
  function torus(r, tube, y, material = brass) {
    add(new THREE.TorusGeometry(r, tube, low ? 4 : 6, low ? 24 : 40), material, [0, y, 0], [Math.PI / 2, 0, 0]);
  }
  torus(form.neckRadius + .002, .003, form.neck + .004);
  torus(form.neckRadius + .001, .003, form.height - .012);
  torus(.024, .003, .106, id === 'tikbalang' ? iron : brass);
  // A fine turned rim separates shoulder paint from the belly without enlarging the toy.
  const rimY = form.profile.find(([r]) => r === form.radius)[1];
  if (id !== 'tikbalang') torus(form.radius + .0005, .0017, rimY);

  if (id === 'tikbalang' || id === 'bakunawa') {
    const points = [], turns = id === 'tikbalang' ? 5 : 3;
    const segments = low ? turns * 12 : turns * 20;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments, a = t * Math.PI * 2 * turns;
      points.push(new THREE.Vector3(Math.cos(a) * (form.neckRadius + .004), form.neck + .018 + t * (form.height - form.neck - .04), Math.sin(a) * (form.neckRadius + .004)));
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, .0038, low ? 4 : 5, false), cord);
  }

  if (id === 'tikbalang') {
    // A narrow metal rim follows the rounded wooden belly. Its studs are flush, not teeth.
    add(new THREE.CylinderGeometry(.237, .236, .031, low ? 24 : 40, 1, true), iron, [0, .323, 0]);
    torus(.237, .0025, .339, brass); torus(.236, .0025, .307, brass);
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      add(new THREE.SphereGeometry(.0045, 6, 4), brass, [Math.cos(a) * .238, .323, Math.sin(a) * .238]);
    }
  } else if (id === 'agimat') {
    // Three small pendant charms at the shoulder, with visibly separate chain links.
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      const hook = new THREE.CatmullRomCurve3([new THREE.Vector3(Math.sin(a) * .064, .442, Math.cos(a) * .064),new THREE.Vector3(Math.sin(a) * .11, .478, Math.cos(a) * .11),new THREE.Vector3(Math.sin(a) * .156, .461, Math.cos(a) * .156)]);
      add(new THREE.TubeGeometry(hook, 10, .0018, 4, false), brass);
      for (const y of [.456, .438]) add(new THREE.TorusGeometry(.0105, .0026, 4, 10), brass, [Math.sin(a) * .156, y, Math.cos(a) * .156], [0, a, 0]);
      const pos = [Math.sin(a) * .16, .409, Math.cos(a) * .16];
      add(new THREE.CylinderGeometry(.024, .024, .004, 12), brass, pos, [Math.PI / 2, 0, -a]);
      add(new THREE.CylinderGeometry(.018, .018, .0045, 12), jade, [pos[0]+Math.sin(a)*.003,pos[1],pos[2]+Math.cos(a)*.003], [Math.PI / 2, 0, -a]);
      // Raised eight-ray sun on the jade inset, facing out from the body.
      add(new THREE.SphereGeometry(.006, 8, 5), brass, [pos[0]+Math.sin(a)*.007,pos[1],pos[2]+Math.cos(a)*.007]);
      for(let j=0;j<8;j++){
        const angle=j*Math.PI/4, dx=Math.cos(angle)*.011;
        add(new THREE.SphereGeometry(.0026,4,3),brass,[pos[0]+Math.cos(a)*dx+Math.sin(a)*.007,pos[1]+Math.sin(angle)*.011,pos[2]-Math.sin(a)*dx+Math.cos(a)*.007]);
      }
    }
  } else if (id === 'diwata') {
    // Pearl at the winding peg; the five large petals remain painted on the shoulder.
    add(new THREE.SphereGeometry(.012, 10, 7), ivory, [0, form.height + .003, 0], [0, 0, 0], [1, .65, 1]);
  } else if (id === 'bakunawa') {
    // Low-relief serpent physically follows the wood instead of becoming an outer attack ring.
    const points = [], start = -.55, sweep = Math.PI * 1.62;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = start + t * sweep, r = .166 + .019 * Math.sin(t * Math.PI);
      points.push(new THREE.Vector3(Math.cos(a) * r, shoulderY(r, form) + .010, Math.sin(a) * r));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const segments = low ? 28 : 48;
    const coil = new THREE.TubeGeometry(curve, segments, .013, low ? 5 : 7, false);
    const p = coil.attributes.position, radial = low ? 5 : 7;
    for (let row = 0; row <= segments; row++) {
      const center = curve.getPointAt(row / segments), taper = .25 + .75 * Math.min(1, (1 - row / segments) * 4);
      for (let j = 0; j <= radial; j++) {
        const k = row * (radial + 1) + j;
        p.setXYZ(k, center.x + (p.getX(k) - center.x) * taper, center.y + (p.getY(k) - center.y) * taper, center.z + (p.getZ(k) - center.z) * taper);
      }
    }
    coil.computeVertexNormals(); add(coil, jade);
    const end = points[0], tangent = curve.getTangent(0).negate(), angle = Math.atan2(-tangent.x, -tangent.z);
    const head = new THREE.Matrix4().compose(end, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle), new THREE.Vector3(1, 1, 1));
    function headPart(geometry, material, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
      const local = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
      geometry.applyMatrix4(head.clone().multiply(local)); add(geometry, material);
    }
    function jaw(points, depth) {
      const shape=new THREE.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
      const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false});geometry.rotateX(-Math.PI/2);return geometry;
    }
    headPart(jaw([[-.025,.012],[-.032,-.01],[-.022,-.03],[-.022,-.055],[-.007,-.049],[0,-.025],[.007,-.049],[.022,-.055],[.022,-.03],[.032,-.01],[.025,.012]],.013),jade,[0,.018,0]);
    headPart(jaw([[-.02,.004],[-.023,-.032],[0,-.061],[.023,-.032],[.02,.004]],.005),brass,[0,-.009,0]);
    headPart(new THREE.BoxGeometry(.035,.013,.037),shadow,[0,.006,-.027]);
    for (const x of [-.017, .017]) {
      headPart(new THREE.ConeGeometry(.0045, .033, 5), ivory, [x,.005,-.052], [-2.2, 0, 0]);
      headPart(new THREE.SphereGeometry(.0048, 8, 5), eye, [x * 1.25, .034, -.016]);
      headPart(new THREE.ConeGeometry(.0065,.025,4),brass,[x,.04,.006],[-.5,0,x*10]);
      headPart(new THREE.BoxGeometry(.005,.003,.022),brass,[x,.034,-.026],[0,x*12,x*8]);
    }
    for (let i = 0; i < 8; i++) {
      const v = curve.getPointAt(.15 + i * .095);
      add(new THREE.ConeGeometry(.007, .017, 3), brass, [v.x, v.y + .014, v.z], [0, i * .7, .25]);
    }
  }

  for (const [material, geometries] of buckets) {
    const plain = geometries.map(g => g.index ? g.toNonIndexed() : g);
    group.add(new THREE.Mesh(mergeGeometries(plain), material));
    geometries.forEach(g => g.dispose()); plain.forEach((g, i) => { if (g !== geometries[i]) g.dispose(); });
  }
  for (const material of [brass, iron, cord, jade, ivory, eye, shadow]) if (!buckets.has(material)) material.dispose();
  group.name = `${id}-carved-detail`; group.traverse(o => { if (o.isMesh) o.castShadow = true; }); return group;
}
