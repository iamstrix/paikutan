// Animated mythic skills in game-world units. Rendering only: the simulation owns damage/durations.
import * as THREE from 'three';
import { Particles } from './particles.js';
import { energy, mesh, arc, ribbon, writeRibbon, petalGeometry, horseSpirit, shieldMaterial, moonMaterial, serpentHead, serpentTube, updateSerpent } from './skill-shapes.js';

const TAU=Math.PI*2, clamp=THREE.MathUtils.clamp;
const COLORS={kidlat:'#ffd23f',tikbalang:'#ff4c50',agimat:'#edcd74',diwata:'#f6bded',bakunawa:'#5bdad0'};
const smooth=t=>{const k=clamp(t,0,1);return k*k*(3-2*k)};
const color=new THREE.Color();

function build(id,low){
  const root=new THREE.Group();root.visible=false;root.name=id+'-skill';
  const m={id,root,active:false,t:0,endT:null,followSlot:-1,owner:-1,lastX:0,lastZ:0,heading:0,seen:false,emitT:0,camera:new THREE.Vector3()};
  const white=energy('#fff4ce',.95,true),gold=energy(COLORS[id],.8,true),soft=energy(COLORS[id],.3);
  if(id==='kidlat'){
    m.storm=arc(root,.5,.09,energy('#172c58',.75),3.2);m.stormGlow=arc(root,.52,.025,gold,3.18);
    m.target=arc(root,.72,.018,gold,.04,TAU*.88);
    m.waves=[arc(root,1,.035,gold,.08),arc(root,1,.02,white,.1)];
    m.bolts=Array.from({length:low?3:5},(_,i)=>({mesh:ribbon(root,14,energy('#ffffff',i===0?.95:.55,true)),points:Array.from({length:14},()=>new THREE.Vector3()),index:i}));
    m.cracks=Array.from({length:low?4:7},(_,i)=>({mesh:ribbon(root,5,energy('#ffffff',.9,true)),points:Array.from({length:5},()=>new THREE.Vector3()),index:i}));
  }else if(id==='tikbalang'){
    m.horse=horseSpirit(root,low);m.horse.group.position.y=.12;
    m.history=[];m.trail=ribbon(root,24,energy('#ffffff',.65,true));
    m.hooves=Array.from({length:low?6:10},()=>({mesh:arc(root,.12,.025,gold,.06,Math.PI*1.55),x:0,z:0,age:10}));
    m.slam=arc(root,1,.045,gold,.07);m.slam.visible=false;m.stompT=10;
  }else if(id==='agimat'){
    m.dome=mesh(root,new THREE.SphereGeometry(.83,low?16:28,low?10:18),shieldMaterial(),[0,.52,0]);
    m.orbits=[arc(root,.86,.022,gold,.55,TAU*.83),arc(root,.88,.016,white,.55,TAU*.78)];
    m.medallions=[];
    for(let i=0;i<3;i++){
      const g=new THREE.Group();root.add(g);
      const shape=new THREE.Shape();shape.moveTo(0,.19);shape.lineTo(-.165,-.095);shape.lineTo(.165,-.095);shape.closePath();
      mesh(g,new THREE.ExtrudeGeometry(shape,{depth:.025,bevelEnabled:false}),gold);
      mesh(g,new THREE.SphereGeometry(.043,10,7),white,[0,0,.03]);m.medallions.push(g);
    }
    m.hitT=10;m.ripple=arc(root,.2,.025,white,.6,TAU*.8);m.ripple.visible=false;
    m.castRing=arc(root,1,.035,gold,.07);
  }else if(id==='diwata'){
    m.bloom=new THREE.Group();root.add(m.bloom);m.bloom.position.y=.16;
    m.petals=[];
    const pink=energy('#e99cbe',.72),cream=energy('#fff4db',.85),violet=energy('#9e56df',.52);
    for(let layer=0;layer<2;layer++)for(let i=0;i<(layer?5:8);i++){
      const hinge=new THREE.Group(),a=i*TAU/(layer?5:8)+layer*.4;hinge.position.set(Math.sin(a)*.29,layer*.14,Math.cos(a)*.29);hinge.rotation.y=a+Math.PI;
      const p=mesh(hinge,petalGeometry(layer?.68:.92,layer?.22:.32),layer?cream:pink);m.bloom.add(hinge);m.petals.push({hinge,mesh:p,layer});
    }
    m.pearl=mesh(root,new THREE.SphereGeometry(.14,low?10:18,12),white,[0,1,0]);m.pearlRing=arc(root,.22,.012,gold,1);
    m.helix=Array.from({length:2},(_,i)=>({mesh:ribbon(root,20,energy('#ffffff',.7,true)),points:Array.from({length:20},()=>new THREE.Vector3()),index:i}));
    m.loose=Array.from({length:low?5:9},(_,i)=>({mesh:mesh(root,petalGeometry(.18,.065),i%2?violet:cream),index:i}));
    m.wave=arc(root,1,.025,gold,.06);
  }else{
    m.tube=serpentTube(root,energy('#208a9c',.8),low);m.head=serpentHead(root);m.headPoint=new THREE.Vector3();
    m.moonRig=new THREE.Group();m.moonRig.position.y=1.55;root.add(m.moonRig);
    m.moon=mesh(m.moonRig,new THREE.SphereGeometry(.32,low?16:24,16),moonMaterial());
    m.corona=mesh(m.moonRig,new THREE.TorusGeometry(.35,.022,6,48),gold,[0,0,.04]);
    m.arrows=[arc(root,.71,.025,gold,.08,Math.PI*1.4),arc(root,.86,.014,soft,.09,Math.PI*1.4)];
    m.arrowheads=m.arrows.map((_,i)=>{const a=mesh(root,new THREE.ConeGeometry(.09,.2,3),gold,[0,.09,0]);a.rotation.x=Math.PI/2;return a});
    m.fins=Array.from({length:low?5:8},()=>mesh(root,new THREE.ConeGeometry(.06,.2,3),gold));
  }
  // Separate material instances let one wave/hoof/petal fade without dimming its siblings.
  m.materials=[];const originals=new Set();root.traverse(o=>{if(o.material){originals.add(o.material);o.material=o.material.clone();o.renderOrder=4;m.materials.push({material:o.material,alpha:o.material.opacity})}});originals.forEach(material=>material.dispose());
  return m;
}

export class SkillEffects {
  constructor({low=false,rng=Math.random}={}){
    this.low=low;this.rng=rng;this.group=new THREE.Group();this.group.name='animated-skills';this.states=new Map();this.time=0;this.camera=new THREE.Vector3();
    this.sparks=new Particles('spark',low?160:360);this.sparks.points.renderOrder=4;this.group.add(this.sparks.points);
    this.pool=[];for(const id of Object.keys(COLORS))for(let i=0;i<2;i++){const m=build(id,low);this.pool.push(m);this.group.add(m.root)}
  }
  track(slot,state){
    this.states.set(slot,state);if(!state.alive||!state.launched)return;
    // A phone reconnecting mid-skill still gets the active shield/curse/stampede.
    const ensure=(id,owner)=>{
      if(this.pool.some(m=>m.active&&m.endT===null&&m.id===id&&m.followSlot===slot))return;
      const m=this.cast(id,{slot:owner,target:slot,x:state.x,z:state.z,tx:state.x,tz:state.z});m.t=.25;m.seen=true;
    };
    if(state.shield)ensure('agimat',slot);
    if(state.invert)ensure('bakunawa',1-slot);
    if(state.dash&&state.top==='tikbalang')ensure('tikbalang',slot);
  }
  burst(x,y,z,id,n=18){this.sparks.emit(x,y,z,{n:this.low?Math.ceil(n*.5):n,color:COLORS[id],speed:.9,up:1.15,life:.7,size:.055,grow:.25,gravity:.7},this.rng)}
  cast(id,{slot=0,target=1,x=0,z=0,tx=x,tz=z}={}){
    const list=this.pool.filter(m=>m.id===id);if(!list.length)return;
    const m=list.find(m=>m.active&&m.owner===slot)||list.find(m=>!m.active)||list.reduce((a,b)=>a.t>b.t?a:b);
    m.active=true;m.root.visible=true;m.t=0;m.endT=null;m.seen=false;m.owner=slot;m.emitT=0;
    m.followSlot=id==='bakunawa'?target:id==='kidlat'?-1:slot;
    const strike=id==='kidlat'||id==='bakunawa';m.root.position.set(strike?tx:x,0,strike?tz:z);
    m.lastX=m.root.position.x;m.lastZ=m.root.position.z;m.heading=Math.atan2(x-tx,z-tz);
    if(m.history){m.history.length=0;m.trailT=0;m.stompT=10;m.trail.geometry.setDrawRange(0,0);m.hooves.forEach(h=>{h.age=10;h.stamp=-1})}
    if(id==='agimat')m.hitT=10;
    this.burst(m.root.position.x,.4,m.root.position.z,id);return m;
  }
  hit(x,z,intensity=.6){
    for(const m of this.pool)if(m.active&&m.id==='agimat'&&m.endT===null&&Math.hypot(m.root.position.x-x,m.root.position.z-z)<1.5){m.hitT=0;m.hitStrength=clamp(intensity,0,1)}
  }
  hitTarget(slot){for(const m of this.pool)if(m.active&&m.id==='agimat'&&m.followSlot===slot){m.hitT=0;m.hitStrength=1}}
  stomp(slot){for(const m of this.pool)if(m.active&&m.id==='tikbalang'&&m.owner===slot){m.stompT=0;m.endT=0;this.burst(m.root.position.x,.2,m.root.position.z,'tikbalang',28)}}
  stop(m,immediate=false){if(immediate){m.active=false;m.root.visible=false}else if(m.endT===null)m.endT=0}
  cancel(slot){for(const m of this.pool)if(m.active&&(m.owner===slot||m.followSlot===slot))this.stop(m,true);this.states.delete(slot)}
  fade(m,alpha){m.fade=alpha;for(const {material,alpha:base} of m.materials){if(material.isShaderMaterial&&material.uniforms.fade)material.uniforms.fade.value=alpha;else material.opacity=base*alpha}}
  reset(){
    for(const m of this.pool){m.active=false;m.root.visible=false;m.endT=null;if(m.history)m.history.length=0}
    this.states.clear();this.sparks.life.fill(0);this.sparks.alpha.fill(0);this.sparks.pos.fill(-999);
    this.sparks.points.geometry.attributes.alpha.needsUpdate=true;this.sparks.points.geometry.attributes.position.needsUpdate=true;
  }
  dispose(){
    this.reset();const geometries=new Set(),materials=new Set();this.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material)});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.sparks.material.uniforms.map.value.dispose();this.group.removeFromParent();
  }
  update(dt,camera,viewportHeight){
    dt=clamp(dt,0,.1);this.time+=dt;camera.getWorldPosition(this.camera);
    this.sparks.update(dt,viewportHeight/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)));
    for(const m of this.pool){
      if(!m.active)continue;m.t+=dt;
      const state=this.states.get(m.followSlot);
      if(m.followSlot>=0&&state){
        if(!state.alive||!state.launched){this.stop(m,true);continue}
        const dx=state.x-m.lastX,dz=state.z-m.lastZ;
        if(m.id==='tikbalang'&&Math.hypot(dx,dz)>.001){const angle=Math.atan2(-dx,-dz);m.heading+=Math.atan2(Math.sin(angle-m.heading),Math.cos(angle-m.heading))*(1-Math.exp(-dt*16))}
        m.root.position.set(state.x,state.y||0,state.z);m.lastX=state.x;m.lastZ=state.z;
        const flag=m.id==='tikbalang'?'dash':m.id==='agimat'?'shield':m.id==='bakunawa'?'invert':null;
        if(flag){if(state[flag])m.seen=true;else if(m.seen||m.t>.22)this.stop(m)}
      }
      const life=m.id==='kidlat'?1.1:m.id==='diwata'?1.85:6;
      if(m.t>=life)this.stop(m);
      if(m.endT!==null)m.endT+=dt;
      const endDuration=m.id==='tikbalang'?.6:.23;
      const alpha=Math.min(1,m.t/.08)*(m.endT===null?1:Math.max(0,1-m.endT/endDuration));
      this.fade(m,alpha);m.camera.copy(this.camera).sub(m.root.position);
      if(alpha<=0&&m.endT!==null){this.stop(m,true);continue}
      if(m.id==='kidlat')this.kidlat(m);else if(m.id==='tikbalang')this.tikbalang(m,dt);else if(m.id==='agimat')this.agimat(m,dt);else if(m.id==='diwata')this.diwata(m);else this.bakunawa(m,camera);
      if(m.id!=='kidlat'&&m.endT===null){m.emitT+=dt;if(m.emitT>=.09){m.emitT%=.09;this.burst(m.root.position.x,.3,m.root.position.z,m.id,2)}}
    }
  }
  kidlat(m){
    const t=m.t,impact=clamp((t-.025)/.26,0,1),boltAlpha=Math.max(0,1-(t-.04)/.42);
    m.storm.visible=m.stormGlow.visible=t<.65;m.storm.rotation.z=t*4;m.stormGlow.rotation.z=-t*6;
    m.storm.scale.setScalar(.45+Math.sin(Math.min(t/.3,1)*Math.PI/2)*.8);m.stormGlow.scale.copy(m.storm.scale);
    m.target.rotation.z=-t*5;m.target.scale.setScalar(t<.06?1-t*6:1+impact*.55);m.target.material.opacity*=Math.max(0,1-t/1.1);
    m.waves.forEach((w,i)=>{const p=clamp((t-.035-i*.04)/.48,0,1);w.scale.setScalar(.25+p*(i?1.25:1.65));w.material.opacity*=1-p;w.visible=p>0&&p<1});
    for(const b of m.bolts){
      b.mesh.visible=t<.5&&t>.02;
      const branch=b.index>1,height=branch?1.9:3.15,offset=(b.index-2)*.26;
      for(let i=0;i<b.points.length;i++){
        const k=i/(b.points.length-1),jitter=Math.sin(i*5.7+t*39+b.index)*Math.sin(k*Math.PI)*.2;
        b.points[i].set(branch?offset*(1-k)+jitter:jitter, .35+height*(1-k),Math.cos(i*4.1+t*28+b.index)*Math.sin(k*Math.PI)*.13);
      }
      color.set(b.index===0?'#fff9dd':'#ffd23f');writeRibbon(b.mesh,b.points,m.camera,color,b.index===0?.065:branch?.055:.19,boltAlpha);
    }
    for(const c of m.cracks){
      c.mesh.visible=t>.04&&t<.9;const angle=c.index*TAU/m.cracks.length;
      c.points.forEach((p,i)=>{const r=i/4*(.5+impact*.9),a=angle+(i%2?.13:-.07);p.set(Math.cos(a)*r,.035,Math.sin(a)*r)});
      color.set('#ffd95f');writeRibbon(c.mesh,c.points,m.camera,color,.045,Math.max(0,1-t/.9),true);
    }
  }
  tikbalang(m,dt){
    const age=m.t,run=m.endT===null,beat=Math.sin(age*18);
    m.horse.group.rotation.y=m.heading;m.horse.group.position.y=.12+Math.abs(beat)*.15;
    m.horse.group.rotation.x=beat*.07;m.horse.group.scale.setScalar(.78+.15*smooth(age/.16));m.horse.jaw.rotation.x=.1+Math.max(0,beat)*.13;
    // Mane strips stream backward and whip as the spirit gallops.
    for(const mane of m.horse.mane){
      mane.points.forEach((p,i)=>{const k=i/9;p.set((mane.index-2)*.055+Math.sin(age*11+k*7+mane.index)*k*.15,1.45-k*.9+Math.sin(age*9+k*6)*k*.08,.1+k*1.1)});
      // Horse-local camera, since the body follows and turns with actual movement.
      const cam=m.camera.clone().sub(m.horse.group.position).applyAxisAngle(new THREE.Vector3(0,1,0),-m.heading);
      color.set(mane.index%2?'#ffbc73':'#ff3b58');writeRibbon(mane.mesh,mane.points,cam,color,.16,.8,true);
    }
    m.trailT+=dt;if(m.trailT>=.025){m.trailT%=.025;m.history.unshift(new THREE.Vector3(m.root.position.x,.09,m.root.position.z));if(m.history.length>24)m.history.pop()}
    const relative=m.history.map(p=>new THREE.Vector3(p.x-m.root.position.x,p.y,p.z-m.root.position.z));
    color.set('#f34a5c');writeRibbon(m.trail,relative,m.camera,color,.55,m.fade,true);
    const printIndex=Math.floor(age/.095),print=m.hooves[printIndex%m.hooves.length];
    if(run&&print.stamp!==printIndex){print.stamp=printIndex;print.age=0;const side=printIndex%2?1:-1;print.x=m.root.position.x+Math.cos(m.heading)*.27*side;print.z=m.root.position.z-Math.sin(m.heading)*.27*side;print.heading=m.heading}
    for(const h of m.hooves){h.age+=dt;h.mesh.visible=h.age<.65;h.mesh.position.set(h.x-m.root.position.x,.055,h.z-m.root.position.z);h.mesh.rotation.z=-h.heading;h.mesh.material.opacity*=Math.max(0,1-h.age/.65)}
    m.stompT+=dt;m.slam.visible=m.stompT<.55;if(m.slam.visible){const k=m.stompT/.55;m.slam.scale.setScalar(.3+k*1.7);m.slam.material.opacity*=1-k;m.horse.group.position.y=.65*(1-smooth(k*3))}
  }
  agimat(m,dt){
    m.hitT+=dt;const hit=Math.max(0,1-m.hitT/.42);
    m.dome.material.uniforms.clock.value=m.t;m.dome.material.uniforms.hit.value=hit;
    const size=.2+.8*smooth(m.t/.2);m.dome.scale.setScalar(size*(1+hit*.055));
    m.orbits.forEach((o,i)=>{o.rotation.set(Math.PI/2+(i?-.4:.35)*Math.sin(m.t*.7),m.t*(i?-.7:.8),m.t*(i?-.8:.7));o.scale.setScalar(size)});
    m.medallions.forEach((g,i)=>{const a=i*TAU/3+m.t*.9;g.position.set(Math.cos(a)*.83,.65+Math.sin(m.t*2+i)*.16,Math.sin(a)*.83);g.rotation.y=-a+Math.PI/2;g.rotation.z=Math.sin(m.t*2+i)*.12;g.scale.setScalar(size)});
    m.castRing.visible=m.t<.65;m.castRing.scale.setScalar(.2+smooth(m.t/.65)*1.2);m.castRing.material.opacity*=Math.max(0,1-m.t/.65);
    m.ripple.visible=hit>0;m.ripple.scale.setScalar(1+(1-hit)*3.5);m.ripple.rotation.z=m.t*5;m.ripple.material.opacity*=hit;
  }
  diwata(m){
    const t=m.t,opening=smooth(t/.6),finish=smooth((t-1.1)/.7);
    m.bloom.rotation.y=t*.55;m.bloom.scale.setScalar((.45+.55*opening)*(1-finish*.35));
    m.petals.forEach(({mesh:p,layer})=>{p.rotation.x=1.36-opening*(layer?1.05:1.22)+finish*.45;p.material.opacity*=1-finish});
    const pearlScale=(.3+.7*smooth(t/.3))*(1-finish);m.pearl.scale.setScalar(pearlScale);m.pearl.position.y=.65+opening*.65+t*.23;
    m.pearlRing.position.y=m.pearl.position.y;m.pearlRing.rotation.z=t*4;m.pearlRing.scale.setScalar(pearlScale);
    for(const h of m.helix){
      h.points.forEach((p,i)=>{const k=i/19,a=k*TAU*1.2+t*3+h.index*Math.PI,r=.56+Math.sin(k*Math.PI)*.14;p.set(Math.cos(a)*r,.15+k*1.55,Math.sin(a)*r)});
      color.set(h.index?'#ac68f1':'#ffcbde');writeRibbon(h.mesh,h.points,m.camera,color,.11,(1-finish)*.8);
    }
    m.loose.forEach(({mesh:p,index:i})=>{const a=i*2.4+t*1.8,r=.5+t*.4;p.position.set(Math.cos(a)*r,.3+(i%3)*.15+t*.6,Math.sin(a)*r);p.rotation.set(t*2+i,a,t+i);p.material.opacity*=1-finish});
    m.wave.scale.setScalar(.2+opening*1.2);m.wave.material.opacity*=Math.max(0,1-t/1.2);
  }
  bakunawa(m,camera){
    const t=m.t,growth=.12+.88*smooth(t/.65),bite=smooth((t-.5)/.45),bodyFade=1-smooth((t-1.05)/.55);
    updateSerpent(m.tube,t,growth,m.headPoint);m.tube.mesh.material.opacity*=bodyFade;
    m.head.group.position.copy(m.headPoint);m.head.group.rotation.y=Math.atan2(m.headPoint.x,m.headPoint.z);m.head.group.scale.setScalar(.78+.22*growth);m.head.jaw.rotation.x=-.55*(1-bite);
    m.head.group.visible=bodyFade>0;m.head.group.traverse(o=>{if(o.material)o.material.opacity*=bodyFade});
    m.moonRig.quaternion.copy(camera.quaternion);m.moonRig.position.y=1.55+Math.sin(t*1.8)*.06;
    m.moonRig.scale.setScalar(t<1.5?1:1-smooth((t-1.5)/.45)*.42);
    m.moon.material.uniforms.offset.value=.8*(1-bite);m.corona.rotation.z=-t*1.1;m.corona.scale.setScalar(1+.05*Math.sin(t*4));
    m.arrows.forEach((a,i)=>{const angle=t*(i?1.4:-1.8)+i*Math.PI;a.rotation.z=angle;a.material.opacity*=.6+.2*Math.sin(t*3+i);const head=m.arrowheads[i],r=i?.86:.71;head.position.set(Math.cos(-angle)*r,.08,Math.sin(-angle)*r);head.rotation.z=-angle-Math.PI/2});
    m.fins.forEach((f,i)=>{const k=(i+.5)/m.fins.length,a=-1.8+t*.8+k*Math.PI*1.75*growth,r=.7+Math.sin(k*Math.PI)*.13;f.position.set(Math.cos(a)*r,.32+k*1.25,Math.sin(a)*r);f.rotation.z=.4;f.material.opacity*=bodyFade});
  }
}
