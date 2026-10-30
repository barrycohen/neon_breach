/* The campaign's end, after Sector 3-3's last core is taken. High over the
   tower, above the eye, two rings of empty places turn about an empty middle,
   all through the level: the eye guards where the cores go. As the last core
   is taken the eight you have brought back rise out of you one by one,
   each lighting as it reaches its place, and the last flies to the middle.
   The rings stand up and spin, and the camera pulls out from
   you and goes round the citadel while the lockdown lifts: the magenta trim
   fades and every sealed door opens, the causeway's spans slide back out, and
   the ring's cores fly out one by one to the dark stations far out round the
   citadel, each lighting the one it reaches as the camera comes round to face
   it. Coming back round to look across the crown at the dead eye, the camera
   closes in as a beacon rises out of the Authority's well, and the last core,
   yours, flies down and lights it. Then the campaign is complete.

   The level gives it `ending: {cores, beacon, around, endAng, stations, spans}`:
     cores     [x,y,z] the rings' middle
     beacon    [x,y,z] the beacon's lamp, once risen (it comes up from 46m below)
     around    [x,y,z] what the camera goes round
     endAng    where the camera stops: its bearing from `around` (0: south)
     stations  [[x,y,z], ...] where each station hangs, dark till its core comes
     spans     actions run as the spans go out (the level's own platforms) */
import {THREE,V3,clamp,lerp,T2,devFlag} from './util.js';
import {scene,camera,setViewModelHidden} from './render.js';
import {own} from './world.js';
import {player} from './player.js';
import {game} from './state.js';
import {FX} from './fx.js';
import {SFX} from './audio.js';
import {MAT,sprite} from './textures.js';
import {hullMat} from './models.js';
import {shutEye} from './gaze.js';

const EN_LIT=0x8dff6a, EN_EMPTY=0x2a3a30;
const ST_DARK=0x15201c, ST_HULL=0x1c2430;
let EN_FORM=null, EN_BEACON=null, EN=null, STATIONS=[], EN_GEO=null;
const _ev=V3(), _ew=V3(), _ec=new THREE.Color();

/* A core as you pick one up: two rings round a glowing block, its glow about it. */
function enCore(sc,lit){
  const g=new THREE.Group();
  g.add(new THREE.Mesh(EN_GEO.hull,hullMat));
  // out of the fog, their glow, so they still show from the camera far out
  // round the citadel
  const gm=new THREE.MeshBasicMaterial({color:lit?EN_LIT:EN_EMPTY,fog:false}); gm.__perObject=true;
  g.add(new THREE.Mesh(EN_GEO.glow,gm));
  const s=sprite(EN_LIT,2.2,lit?0.5:0); s.material.__perObject=true; s.material.fog=false; g.add(s);
  g.scale.setScalar(sc); g.userData={gm,s};
  return g;
}
function enLightCore(c,on){ c.userData.gm.color.setHex(on?EN_LIT:EN_EMPTY); c.userData.s.material.opacity=on?0.5:0; }

/* A station: a hub on a mast, a great ring round it on spokes, windows round
   the ring, dishes and a beacon - all dark, its ring still, till its core
   reaches it. Built big: they hang 300m out. */
function station(p,k){
  const g=new THREE.Group(); g.position.set(p[0],p[1],p[2]); g.scale.setScalar(1.6);
  const hull=new THREE.MeshLambertMaterial({color:ST_HULL,fog:false}); hull.__perObject=true;
  const glow=new THREE.MeshBasicMaterial({color:ST_DARK,fog:false}); glow.__perObject=true;
  const add=(geo,mat,x,y,z,rx,ry,rz)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(x||0,y||0,z||0); m.rotation.set(rx||0,ry||0,rz||0); g.add(m); return m; };
  add(new THREE.SphereGeometry(5,18,12),hull);
  add(new THREE.CylinderGeometry(0.9,0.9,34,10),hull);                  // the mast through it
  add(new THREE.CylinderGeometry(2.2,3.4,4,10),hull,0,-17);            // its foot
  add(new THREE.ConeGeometry(1.4,6,10),hull,0,20);                     // its spire
  const ringG=new THREE.Group(); ringG.rotation.set(0.32*(k%2?1:-1),k*0.7,0); g.add(ringG);
  const r=new THREE.Mesh(new THREE.TorusGeometry(18,1.8,10,48),hull); r.rotation.x=Math.PI/2; ringG.add(r);
  const band=new THREE.Mesh(new THREE.TorusGeometry(18,0.5,6,48),glow); band.rotation.x=Math.PI/2; band.position.y=1.7; ringG.add(band);
  for(let i=0;i<4;i++){ const sp=new THREE.Mesh(new THREE.BoxGeometry(36,0.9,0.9),hull); sp.rotation.y=i*Math.PI/4; ringG.add(sp); }
  // windows round the ring's outside
  for(let i=0;i<16;i++){
    const a=i/16*T2, w=new THREE.Mesh(new THREE.BoxGeometry(0.4,1.2,2.4),glow);
    w.position.set(Math.cos(a)*19.9,0,Math.sin(a)*19.9); w.rotation.y=-a; ringG.add(w);
  }
  // dishes on the mast, and the beacon on its tip
  for(const s of [-1,1]) add(new THREE.SphereGeometry(3.4,14,8,0,T2,0,1.1),hull,s*4.5,9,0,0,0,s*1.2);
  add(new THREE.SphereGeometry(1.4,12,10),glow,0,23.5);
  const halo=sprite(EN_LIT,60,0); halo.material.__perObject=true; halo.material.fog=false; halo.position.y=23.5; g.add(halo);
  const halo2=sprite(EN_LIT,120,0); halo2.material.__perObject=true; halo2.material.fog=false; g.add(halo2);
  scene.add(own(g));
  return {g,ringG,glow,halo,halo2,lit:0,on:false,spin:k,p:V3(p[0],p[1],p[2])};
}

/* The places for the cores high over the tower, dark till the end: an inner
   ring of four and an outer ring of four, lying near flat to be seen from below, each on its own tilt and
   turning its own way, round the empty middle your core goes to. A thin
   glowing hoop under each ring's cores. Big: they hang 75m over the crown. */
function enFormation(p){
  const g=new THREE.Group(); g.position.set(p[0],p[1],p[2]); g.scale.setScalar(1.8); scene.add(own(g));
  const hoopM=new THREE.MeshBasicMaterial({color:EN_LIT,transparent:true,opacity:0.35,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  hoopM.__perObject=true;
  const rings=[], cores=[];
  for(const [k,rad,w,tl] of [[0,4.2,0.42,0.32],[1,7.4,-0.27,-0.3]]){
    const tilt=new THREE.Group(); tilt.rotation.x=tl; g.add(tilt);
    const spin=new THREE.Group(); tilt.add(spin);
    spin.add(new THREE.Mesh(new THREE.TorusGeometry(rad,0.06,6,72),hoopM));
    for(let i=0;i<4;i++){
      const a=(i+k*0.5)/4*T2, c=enCore(2.4,false); c.userData.s.scale.setScalar(3.2);
      c.position.set(Math.cos(a)*rad,Math.sin(a)*rad,0); c.rotation.y=i; spin.add(c); cores.push({c,gone:false});
    }
    rings.push({tilt,spin,w,tl:tl-Math.PI/2});
  }
  // the middle, empty: rings with a dark block, till your core comes
  const mid=enCore(2.4,false); g.add(mid);
  return {g,rings,cores,mid,hoopM,fast:0,face:0,t:0};
}
/* The beacon: a mast with a lamp in a core's rings, down in the well till the
   end. Lit, a shaft of light goes up from it into the sky. */
function enBeacon(p){
  const g=new THREE.Group(); g.position.set(p[0],p[1]-46,p[2]); g.visible=false; scene.add(own(g));
  const add=(geo,y)=>{ const m=new THREE.Mesh(geo,hullMat); m.position.y=y; g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.7,1.2,44,12),-24);                 // the mast
  add(new THREE.CylinderGeometry(2.6,0.9,1.4,16),-2.6);               // the dish the lamp sits in
  const lamp=enCore(3.2,false); g.add(lamp);
  const shaftM=new THREE.MeshBasicMaterial({color:EN_LIT,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,side:THREE.DoubleSide});
  shaftM.__perObject=true;
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(1.1,2.6,400,20,1,true),shaftM); shaft.position.y=201; g.add(shaft);
  const halo=sprite(EN_LIT,26,0); halo.material.__perObject=true; halo.material.fog=false; g.add(halo);
  return {g,lamp,shaftM,halo,top:p[1],lit:0,on:false};
}
/* Built with the level, from the level's core model: the rings are seen all
   through the last fight. */
function addEnding(def,coreGeo){
  EN_FORM=null; EN_BEACON=null; EN=null; STATIONS=[];
  if(!def) return;
  EN_GEO=coreGeo;
  EN_FORM=enFormation(def.cores); EN_FORM.def=def;
  if(def.beacon) EN_BEACON=enBeacon(def.beacon);
  (def.stations||[]).forEach((p,k)=>STATIONS.push(station(p,k)));
}
/* Every frame, in play and in the ending: the rings turning. In the ending
   they stand up and turn to the camera (`face`), and spin up (`fast`): left
   flat, the camera going round would see them edge on. */
function spinCores(dt){
  if(!EN_FORM) return;
  const F=EN_FORM; F.t+=dt;
  for(const R of F.rings){
    R.spin.rotation.z+=R.w*dt*(1+3*F.fast);
    R.tilt.rotation.x=lerp(R.tl+0.08*Math.sin(F.t*0.37+R.w*7),(R.tl+Math.PI/2)*0.5,F.face);
  }
  if(F.face>0){
    let d=Math.atan2(camera.position.x-F.g.position.x,camera.position.z-F.g.position.z)-F.g.rotation.y;
    d=Math.atan2(Math.sin(d),Math.cos(d)); F.g.rotation.y+=d*Math.min(1,dt*4)*F.face;
  }
  for(const q of F.cores) q.c.rotation.y+=dt*1.1;
  F.mid.rotation.y+=dt*1.1;
}

/* Everything below runs on a clock from the core's taking. */
const EN_RISE=0.2, EN_GAP=0.4, EN_UP=2.6;         // your eight cores, out of you one by one, each up to its place
const EN_GO=3.6, EN_SEAT=6.6;                     // the last, yours, up to the middle
const EN_IN=EN_SEAT-3;                            // how much later than that the rest starts
const EN_V=T2/16, EN_ACC=4, EN_DEC=6, EN_T0=2.5+EN_IN;         // the turn: up to a turn in 16s, slowing to a stop where it ends
const EN_FLY=1.8;                                 // a core's flight out to its station
const EN_CLOSE=7;                                 // the closing in, over the turn's last seconds
function startEnding(done,runActions,openAll){
  if(!EN_FORM) return false;
  const D=EN_FORM.def, A=D.around, c=camera.position;
  const ang=Math.atan2(c.x-A[0],c.z-A[2]);
  // Round once, and on to where it looks across the crown at the eye (all
  // but the last bit of a turn at least, so each station comes round)
  let sweep=(((D.endAng||0)-ang)%T2+T2)%T2;
  while(sweep<T2-0.6) sweep+=T2;
  const tc=sweep/EN_V-(EN_ACC+EN_DEC)/2;
  _ev.set(0,0,-20).applyQuaternion(camera.quaternion).add(c);
  // yours last: the inner and outer rings by turns
  const rise=[0,4,1,5,2,6,3,7].map((n,i)=>({q:EN_FORM.cores[n],at:EN_RISE+i*EN_GAP,a:i*T2*3/8,m:null}));
  EN={t:0, done, runActions, openAll, fired:{}, rise, core:enCore(1.3,true), from:V3(player.pos.x,player.pos.y+1.4,player.pos.z),
      cam:c.clone(), ang0:ang, ang, sweep, tc, te:EN_T0+EN_ACC+tc+EN_DEC, look0:_ev.clone(), look:V3(),
      trim:MAT.neonM.color.clone(), mags:[], flights:[], todo:STATIONS.map((st,i)=>i)};
  // every magenta in the level, the far pieces' own copies of the trim included
  const seen=new Set();
  scene.traverse(o=>{ const m=o.material; if(!m||Array.isArray(m)||seen.has(m)||!m.color||m.color.getHex()!==0xff3fa4) return;
    seen.add(m); EN.mags.push(m); });
  game.state='ending';
  setViewModelHidden(true);
  return true;
}
function enOnce(k,f){ if(!EN.fired[k]){ EN.fired[k]=true; f(); } }
const enSmooth=k=>{ k=clamp(k,0,1); return k*k*(3-2*k); };
// how far round the camera has gone by t: speeding up, steady, slowing to a stop
function enTurned(t){
  let u=t-EN_T0; if(u<=0) return 0;
  if(u<EN_ACC) return EN_V*u*u/(2*EN_ACC);
  let s=EN_V*EN_ACC/2; u-=EN_ACC;
  if(u<EN.tc) return s+EN_V*u;
  s+=EN_V*EN.tc; u=Math.min(u-EN.tc,EN_DEC);
  return s+EN_V*(u-u*u/(2*EN_DEC));
}

function updateEnding(dt){
  if(!EN) return;
  EN.t+=dt; const t=EN.t, F=EN_FORM, D=F.def, te=EN.te;
  // the eight cores you brought back, out of you and up, each to its place
  // in the rings (which turn under them: they chase it), lighting it
  for(const r of EN.rise){
    if(t<r.at||r.done) continue;
    if(!r.m){ r.m=enCore(1.3,true); scene.add(r.m); r.m.position.copy(EN.from); FX.ring(EN.from,EN_LIT,2,0.3); }
    const k=Math.min(1,(t-r.at)/EN_UP);
    r.q.c.getWorldPosition(_ew);
    enRise(r.m,_ew,k,r.a,dt);
    if(k<1) continue;
    r.done=true; scene.remove(r.m); enLightCore(r.q.c,true);
    FX.ring(_ew,EN_LIT,4,0.4); FX.burst(_ew,16,EN_LIT,6,0.4,2); SFX.pickup();
  }
  // and yours, last, to the rings' middle
  F.mid.getWorldPosition(_ew);
  if(t>=EN_GO&&t<EN_SEAT){
    if(!EN.core.parent){ scene.add(EN.core); EN.core.position.copy(EN.from); FX.ring(EN.from,0xffffff,3,0.4); }
    enRise(EN.core,_ew,(t-EN_GO)/(EN_SEAT-EN_GO),0,dt);
  }
  if(t>=EN_SEAT) enOnce('seat',()=>{
    scene.remove(EN.core); enLightCore(F.mid,true);
    FX.ring(_ew,0xffffff,10,0.7); FX.burst(_ew,50,EN_LIT,12,0.6,4); SFX.waveUp();
  });
  // the rings stand up and spin up, every core flaring
  if(t>=EN_SEAT){
    F.face=enSmooth((t-EN_SEAT)/3); F.fast=enSmooth((t-EN_SEAT)/4);
    // a flare, and then a glow that grows as the camera pulls away
    const fl=Math.max(0,1-(t-EN_SEAT)*0.4), far=1+1.1*F.fast;
    for(const q of [...F.cores.filter(q=>!q.gone).map(q=>q.c),F.mid]){
      q.userData.s.material.opacity=Math.min(1,0.65+fl*1.2); q.userData.s.scale.setScalar(3.2*(1+fl)*far); }
    if(!EN.fired.last) F.hoopM.opacity=0.35+0.3*F.fast;
  }
  // the magenta trim fades, and every sealed door opens
  if(t>=5+EN_IN) enOnce('doors',()=>{ EN.openAll(); SFX.door(); });
  if(t>=5+EN_IN&&t<9.1+EN_IN){ const k=enSmooth((t-5-EN_IN)/4); for(const m of EN.mags) m.color.copy(EN.trim).lerp(_ec.setHex(0x2a2430),k); }
  // the causeway's spans go out again
  if(t>=7+EN_IN) enOnce('spans',()=>{ EN.runActions(D.spans||[]); });
  enCam(t,dt);
  // A core goes out to each station as the camera comes round to face it, so
  // each lighting is seen. Any the turn missed go as it closes in.
  if(t>=4+EN_IN){
    const A=D.around, facing=EN.ang+Math.PI, late=t>=te-EN_CLOSE;
    for(let n=EN.todo.length-1;n>=0;n--){
      const i=EN.todo[n], st=STATIONS[i];
      let d=Math.atan2(st.p.x-A[0],st.p.z-A[2])-facing; d=((d%T2)+T2)%T2;   // how far ahead of where the camera faces
      if(!late&&(d>EN_V*EN_FLY*1.3||d<EN_V*EN_FLY*0.4)) continue;
      EN.todo.splice(n,1); enLaunch(i);
    }
  }
  // the beacon comes up out of the well, and your core goes down to it
  const B=EN_BEACON;
  if(B&&t>=te-10){ B.g.visible=true; B.g.position.y=B.top-46*(1-enSmooth((t-(te-10))/4.5)); }
  if(B&&t>=te-4.5) enOnce('last',()=>{
    F.mid.getWorldPosition(_ev); enLightCore(F.mid,false); F.mid.visible=false;
    const m=enCore(3,true); m.userData.s.scale.setScalar(6); scene.add(m); m.position.copy(_ev);
    EN.flights.push({m,from:_ev.clone(),to:V3(B.g.position.x,B.top,B.g.position.z),t:0,dur:2.6,arc:6,beacon:true});
    FX.ring(_ev,EN_LIT,6,0.5); SFX.pickup();
  });
  for(let n=EN.flights.length-1;n>=0;n--){
    const f=EN.flights[n]; f.t+=dt;
    const k=Math.min(1,f.t/f.dur), e=k*k*(3-2*k);
    _ev.copy(f.m.position);
    f.m.position.lerpVectors(f.from,f.to,e); f.m.position.y+=Math.sin(k*Math.PI)*f.arc;
    f.m.rotation.y+=dt*4;
    FX.tracer(_ev,f.m.position,EN_LIT,0.9,0.5);
    if(k<1) continue;
    scene.remove(f.m); EN.flights.splice(n,1);
    if(f.beacon) enLightBeacon(); else enLightStation(f.i);
  }
  // with all of them gone, the hoops fade
  if(EN.fired.last){ const k=enSmooth((t-(te-4.5))/2.5); F.hoopM.opacity=0.35*(1-k); if(k>=1) F.g.visible=false; }
  for(const st of STATIONS) if(st.on){
    st.lit=Math.min(1,st.lit+dt*0.9);
    st.glow.color.setHex(ST_DARK).lerp(_ec.setHex(EN_LIT),st.lit);
    st.halo.material.opacity=0.9*st.lit; st.halo2.material.opacity=0.35*st.lit*(1+0.2*Math.sin(t*3+st.spin));
    st.ringG.rotation.y+=dt*0.12*st.lit;
  }
  if(B&&B.on){
    B.lit=Math.min(1,B.lit+dt*0.7);
    B.shaftM.opacity=0.32*B.lit*(1+0.12*Math.sin(t*4));
    B.halo.material.opacity=0.9*B.lit; B.halo.scale.setScalar(26*(1+0.08*Math.sin(t*3)));
    B.lamp.rotation.y+=dt*1.5;
  }
  // and the eye, dimming, closes for the last time
  if(t>=te-1) shutEye(enSmooth((t-(te-1))/3));
  if(t>=te+3.5) enOnce('done',()=>{ const d=EN.done; d&&d(); });
}
/* A core from you up to `to` (k from 0 to 1): it winds out round you from
   its own side `a` as it climbs, and grows to the rings' size. */
function enRise(m,to,k,a,dt){
  const e=enSmooth(k), w=Math.sin(Math.min(1,k*1.3)*Math.PI)*5, b=a+k*Math.PI*1.5;
  m.position.lerpVectors(EN.from,to,e);
  m.position.x+=Math.cos(b)*w; m.position.z+=Math.sin(b)*w; m.position.y+=Math.sin(k*Math.PI)*8;
  m.rotation.y+=dt*3; m.scale.setScalar(lerp(1.3,2.4*1.8,e));
  if(Math.random()<dt*30) FX.burst(m.position,2,EN_LIT,2,0.4,0);
}
// one of the ring's cores, out to station i: the one nearest it goes
function enLaunch(i){
  const F=EN_FORM, to=STATIONS[i].p;
  let best=null, bd=Infinity;
  for(const q of F.cores) if(!q.gone){ q.c.getWorldPosition(_ev); const d=_ev.distanceToSquared(to); if(d<bd){ bd=d; best=q; } }
  const from=V3();
  if(best){ best.c.getWorldPosition(from); best.gone=true; best.c.visible=false; }
  else F.g.getWorldPosition(from);
  const m=enCore(4,true); m.userData.s.scale.setScalar(10); scene.add(m); m.position.copy(from);
  EN.flights.push({i,m,from,to:to.clone(),t:0,dur:EN_FLY,arc:40});
  FX.ring(from,EN_LIT,5,0.4); SFX.pickup();
}
function enLightStation(i){
  const st=STATIONS[i]; st.on=true;
  FX.ring(st.p,EN_LIT,60,1.2); FX.burst(st.p,60,EN_LIT,30,1.2,0); SFX.waveUp();
}
function enLightBeacon(){
  const B=EN_BEACON; B.on=true; enLightCore(B.lamp,true);
  _ev.set(B.g.position.x,B.top,B.g.position.z);
  FX.ring(_ev,0xffffff,24,0.9); FX.ring(_ev,EN_LIT,40,1.4); FX.burst(_ev,90,EN_LIT,22,1,6);
  SFX.waveUp(); SFX.boom();
}
/* Out from where you stand, then up and round the citadel, a turn and a bit,
   closing in at the end on the crown, the beacon and the eye. */
function enCam(t,dt){
  const D=EN_FORM.def, A=D.around, te=EN.te;
  EN.ang=EN.ang0+enTurned(t);
  const k=enSmooth((t-1.5)/(7+EN_IN)), cl=enSmooth((t-(te-EN_CLOSE))/EN_CLOSE);
  const r0=Math.hypot(EN.cam.x-A[0],EN.cam.z-A[2]);
  let rad=lerp(r0+6*enSmooth(t/2),175,k), hgt=lerp(EN.cam.y+5*enSmooth(t/2),A[1]+80,k);
  const bt=EN_BEACON?EN_BEACON.top:A[1];
  rad=lerp(rad,50,cl); hgt=lerp(hgt,bt+8,cl);
  camera.position.set(A[0]+Math.sin(EN.ang)*rad,hgt,A[2]+Math.cos(EN.ang)*rad);
  // from where you were looking to the rings, then the citadel, then the beacon
  EN.look.lerpVectors(EN.look0,_ev.set(...D.cores),enSmooth(t/1.4));
  EN.look.lerp(_ew.set(A[0],A[1]+10,A[2]),enSmooth((t-3.5-EN_IN)/5));
  EN.look.lerp(_ew.set(A[0],bt-7,A[2]-3),cl);           // between the beacon and the eye
  camera.lookAt(EN.look);
  camera.fov+=(70-camera.fov)*Math.min(1,dt*2); camera.updateProjectionMatrix();
}
// leaving the level: the trim it faded is everyone's, and the gun comes back
function endEnding(){
  if(EN){ for(const m of EN.mags) m.color.copy(EN.trim); if(EN.core.parent) EN.core.parent.remove(EN.core);
    for(const f of EN.flights) scene.remove(f.m); for(const r of EN.rise) if(r.m) scene.remove(r.m); }
  EN=null; setViewModelHidden(false);
}

export {addEnding, startEnding, updateEnding, spinCores, endEnding};
if(devFlag(/debug/)){ window.__en=()=>EN; window.__enUpd=updateEnding; window.__form=()=>EN_FORM; }
