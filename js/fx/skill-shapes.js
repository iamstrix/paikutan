// Reusable spell geometry. Each cast owns its materials; no per-frame geometry allocation.
import * as THREE from 'three';

export function energy(color, opacity = .8, additive = false) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false });
}
export function mesh(parent, geometry, material, position = [0, 0, 0]) {
  const m = new THREE.Mesh(geometry, material); m.position.set(...position); parent.add(m); return m;
}
export function arc(parent, radius, width, material, y = .08, sweep = Math.PI * 2) {
  const m = mesh(parent, new THREE.TorusGeometry(radius, width, 5, 48, sweep), material, [0, y, 0]);
  m.rotation.x = Math.PI / 2; return m;
}
export function ribbon(parent, count, material) {
  const geometry = new THREE.BufferGeometry(), indices = [];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 6), 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * 8), 4));
  for (let i = 0; i < count - 1; i++) { const k = i * 2; indices.push(k,k+1,k+2,k+1,k+3,k+2); }
  geometry.setIndex(indices); geometry.setDrawRange(0, 0);
  const stripMaterial = material.clone(); stripMaterial.vertexColors = true;
  const m = mesh(parent, geometry, stripMaterial); m.frustumCulled = false; return m;
}
const direction = new THREE.Vector3(), side = new THREE.Vector3(), view = new THREE.Vector3();
export function writeRibbon(mesh, points, camera, color, width, fade = 1, taper = false) {
  const p = mesh.geometry.attributes.position, c = mesh.geometry.attributes.color;
  for (let i = 0; i < points.length; i++) {
    const t = i / Math.max(1, points.length - 1);
    direction.subVectors(points[Math.min(i+1,points.length-1)],points[Math.max(0,i-1)]);
    view.subVectors(camera, points[i]); side.crossVectors(direction, view);
    if (side.lengthSq() < .000001) side.set(1,0,0); else side.normalize();
    side.multiplyScalar(width * (taper ? 1 - t * .85 : 1) * .5);
    p.setXYZ(i*2,points[i].x+side.x,points[i].y+side.y,points[i].z+side.z);
    p.setXYZ(i*2+1,points[i].x-side.x,points[i].y-side.y,points[i].z-side.z);
    const alpha = fade * (taper ? 1 - t : 1);
    c.setXYZW(i*2,color.r,color.g,color.b,alpha);c.setXYZW(i*2+1,color.r,color.g,color.b,alpha);
  }
  p.needsUpdate = c.needsUpdate = true; mesh.geometry.setDrawRange(0, Math.max(0,points.length-1)*6);
}

export function petalGeometry(length = .85, width = .28) {
  const p=[],uv=[],index=[];
  for(let i=0;i<=8;i++)for(let j=0;j<=2;j++){
    const t=i/8,v=j-1;
    p.push(v*Math.sin(t*Math.PI)*width,Math.sin(t*Math.PI)*.13+v*v*.08,-t*length);
    uv.push(j/2,t);
    if(i<8&&j<2){const k=i*3+j;index.push(k,k+3,k+1,k+1,k+3,k+4)}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;
}

export function horseSpirit(parent, low) {
  const g=new THREE.Group();parent.add(g);
  const red=energy('#e63946',.48),edge=energy('#ff9d61',.85,true),gold=energy('#ffd581',.95,true),shadow=energy('#721b37',.55);
  // One curved horse profile, extruded across its cheeks; no block-shaped head/neck.
  const profile=new THREE.Shape();profile.moveTo(.25,.1);profile.lineTo(-.05,.1);profile.bezierCurveTo(-.17,.4,-.16,.72,-.1,.98);
  profile.lineTo(-.55,1.02);profile.lineTo(-.62,1.15);profile.lineTo(-.37,1.31);profile.lineTo(-.2,1.47);profile.lineTo(-.12,1.75);profile.lineTo(-.04,1.53);profile.lineTo(.1,1.72);profile.lineTo(.17,1.4);profile.bezierCurveTo(.35,1.1,.34,.65,.25,.1);profile.closePath();
  const geometry=new THREE.ExtrudeGeometry(profile,{depth:.26,bevelEnabled:!low,bevelThickness:.012,bevelSize:.012,bevelSegments:1,curveSegments:low?5:8});geometry.rotateY(-Math.PI/2);geometry.translate(.13,0,0);
  mesh(g,geometry,red);
  // Rounded cheek/muzzle volume keeps the spirit readable head-on as it turns.
  const cheek=mesh(g,new THREE.SphereGeometry(.205,low?8:12,8),red,[0,1.32,-.18]);cheek.scale.set(1,.78,1.05);
  const nose=mesh(g,new THREE.SphereGeometry(.17,low?8:12,7),red,[0,1.13,-.46]);nose.scale.set(.85,.65,1.05);
  const jaw=mesh(g,new THREE.BoxGeometry(.23,.065,.32),shadow,[0,1.0,-.44]);
  for(const x of [-.145,.145]){
    mesh(g,new THREE.SphereGeometry(.027,8,5),gold,[x,1.38,-.19]);
  }
  const outlines=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,35),new THREE.LineBasicMaterial({color:'#ffbd76',transparent:true,opacity:.65,depthWrite:false}));g.add(outlines);
  const mane=[];
  for(let i=0;i<(low?3:5);i++){
    const r=ribbon(g,10,i%2?edge:red);mane.push({mesh:r,points:Array.from({length:10},()=>new THREE.Vector3()),index:i});
  }
  return {group:g,jaw,mane};
}

export function shieldMaterial() {
  return new THREE.ShaderMaterial({
    uniforms:{clock:{value:0},fade:{value:1},hit:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:`varying vec3 n;varying vec3 v;varying vec2 vPattern;void main(){vPattern=position.xy;vec4 mv=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform float clock;uniform float fade;uniform float hit;varying vec3 n;varying vec3 v;varying vec2 vPattern;
      void main(){float fres=pow(1.-abs(dot(normalize(n),normalize(v))),2.4);
      float scan=pow(max(0.,sin(vPattern.y*23.-clock*4.)),28.);float bars=pow(max(0.,cos(atan(vPattern.y,vPattern.x)*6.+clock*.7)),22.);
      vec3 col=mix(vec3(.12,.68,.53),vec3(1.,.8,.3),scan*.7+hit*.7);
      gl_FragColor=vec4(col,fade*(.045+fres*.57+scan*.09+bars*.045+hit*.2));
      #include <colorspace_fragment>
      }`,
  });
}

export function moonMaterial() {
  // The moving eclipse is clipped to the moon's own surface, never a separate black orb.
  return new THREE.ShaderMaterial({uniforms:{offset:{value:.8},fade:{value:1}},transparent:true,depthWrite:false,
    vertexShader:`varying vec3 moonPoint;void main(){moonPoint=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float offset;uniform float fade;varying vec3 moonPoint;void main(){
      float shadow=1.-smoothstep(.315,.33,length(moonPoint.xy-vec2(offset,0.)));
      vec3 color=mix(vec3(1.,.88,.61),vec3(.012,.027,.055),shadow);
      gl_FragColor=vec4(color,fade*.98);
      #include <colorspace_fragment>
    }`,
  });
}

export function serpentHead(parent) {
  const root=new THREE.Group();parent.add(root);
  const teal=energy('#249ca6',.9),silver=energy('#9ce8dd',.95),ivory=energy('#fff2cb',.98),dark=energy('#081c35',.95),eye=energy('#a4fff0',1,true);
  const skull=mesh(root,new THREE.SphereGeometry(.24,10,7),teal,[0,.06,.02]);skull.scale.set(1,.6,1.35);
  mesh(root,new THREE.BoxGeometry(.32,.16,.3),teal,[0,.03,-.23]);
  const jawPivot=new THREE.Group();jawPivot.position.set(0,-.035,.1);root.add(jawPivot);
  mesh(jawPivot,new THREE.BoxGeometry(.3,.075,.43),silver,[0,-.04,-.23]);
  mesh(root,new THREE.BoxGeometry(.25,.045,.25),dark,[0,-.055,-.2]);
  for(const x of [-.12,.12]){
    const fang=mesh(root,new THREE.ConeGeometry(.035,.29,6),ivory,[x,-.13,-.31]);fang.rotation.x=Math.PI-.2;
    mesh(root,new THREE.SphereGeometry(.04,8,6),eye,[x*1.7,.14,-.1]);
    const horn=mesh(root,new THREE.ConeGeometry(.07,.33,4),silver,[x*1.3,.3,.13]);horn.rotation.x=.55;horn.rotation.z=-x*2;
  }
  return {group:root,jaw:jawPivot};
}

export function serpentTube(parent, material, low) {
  const segments=low?28:48,sides=low?5:7,positions=new Float32Array((segments+1)*(sides+1)*3),normals=new Float32Array(positions.length),indices=[];
  for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1)}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.BufferAttribute(normals,3));geo.setIndex(indices);
  const body=mesh(parent,geo,material);body.frustumCulled=false;return {mesh:body,segments,sides};
}
export function updateSerpent(tube, time, growth, headOut) {
  const p=tube.mesh.geometry.attributes.position,n=tube.mesh.geometry.attributes.normal;
  for(let i=0;i<=tube.segments;i++){
    const t=i/tube.segments,angle=-1.8+time*.8+t*Math.PI*1.75*growth;
    const radius=.64+Math.sin(t*Math.PI)*.13,y=.28+t*1.25+Math.sin(time*3+t*7)*.055;
    const cx=Math.cos(angle)*radius,cz=Math.sin(angle)*radius,thickness=(.035+.085*t)*Math.min(1,growth*3);
    for(let j=0;j<=tube.sides;j++){
      const b=j/tube.sides*Math.PI*2,nx=Math.cos(angle)*Math.cos(b),ny=Math.sin(b),nz=Math.sin(angle)*Math.cos(b),k=i*(tube.sides+1)+j;
      p.setXYZ(k,cx+nx*thickness,y+ny*thickness,cz+nz*thickness);n.setXYZ(k,nx,ny,nz);
    }
    if(i===tube.segments)headOut.set(cx,y,cz);
  }
  p.needsUpdate=n.needsUpdate=true;
}
