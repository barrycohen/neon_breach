/* The Authority: what the eye over Sector 3-3's citadel belongs to. Its body hangs
   in the Well on four cables from Part II on - a torso in armour, its arms
   hanging, its spine trailing below and its head turned up to the eye it has
   lost. At the crown it is hauled up the Well to stand in the mouth, gripping
   the crown's floor, and fights.

   The fight: four armour plates, one on each side of its chest. A Sunder
   charge cracks a plate and a second knocks it off; nothing else touches them.
   Behind each is a grate over a core, and only the Rail gets through a grate.
   The eye's lightning, struck beside a side it has lost, hurts it too. It
   turns its strongest side to you, slowly, so you go round it. Each plate it
   still has shoots at you when it faces you, and an arm comes down on where you
   stand when you're within its reach.

   The level gives it `authority: {hang, up, rest, deck, cables, hoist}`, and
   runs it with the `authority` action: `do: 'haul'` (up the Well to the crown)
   or `'fall'` (beaten: back down the Well). The fight itself is the boss
   `authority` (enemies.js), a record this module runs (PROXY). */
import {THREE,V3,clamp,lerp,rand,T2,devFlag} from './util.js';
import {scene} from './render.js';
import {colliders,own,rayBox} from './world.js';
import {player,damagePlayer} from './player.js';
import {FX} from './fx.js';
import {SFX} from './audio.js';
import {hullMat} from './models.js';
import {P,kit} from './kit.js';
import {PROXY,spawnBullet,damageEnemy,shieldCanvases,shieldClean,shieldImpact} from './enemies.js';
import {dropPickup} from './pickups.js';

const AU_HULL=0x2a2230, AU_PLATE=0x3a2f44, AU_DARK=0x120d16, AU_TRIM=0x5a4a66;
const AU_SEAM=0xff3fa4, AU_CORE=0xffd28a, AU_SOCKET=0xffae2a;
const AU_LOOK={fill:'#3a2f44', line:'#ff3fa4', rows:[0.12,0.88]};    // a plate's face, to crack
const AU_RISE=11;                       // seconds up the Well
// local shape, its chest's middle the origin, facing +z
const AU_CH={x:3.9, y0:-1.5, y1:4.5, z:3.9};         // (square: a plate on each side, the same way out)
const AU_PL={w:6.2, h:6.4, t:0.9, y:1.5};    // a plate: size, and its middle's height
// (up over the chest's top: lower, a shoulder stood in front of the side's core)
const AU_SH=[5.2,5.4];                    // a shoulder: out, up
const AU_ARM=[6.2,6.6];                   // upper arm, forearm
// where its hands grip the crown's floor: its front corners, clear of the cores at its sides
const AU_HAND=[6.7,6.7];
// a side's outward direction, as an angle off its front: front, right, back, left
const AU_FACES=[0,Math.PI/2,Math.PI,-Math.PI/2];

let AU=null;
const _ucol=new THREE.Color();
const _ua=V3(), _ub=V3(), _uc=V3(), _uc2=V3(), _ud=V3(), _uq=new THREE.Quaternion(), _uup=V3(0,1,0);

function auMesh(model,mat,glowMat){
  const g=new THREE.Group();
  if(model.hull){ const m=new THREE.Mesh(model.hull,mat); m.castShadow=true; g.add(m); }
  if(model.glow) g.add(new THREE.Mesh(model.glow,glowMat));
  return g;
}
// one of its chest plates, built facing +z, its middle at the origin
function plateModel(){
  const k=kit(0.6);
  k.h(P.box,AU_PLATE,{sx:AU_PL.w,sy:AU_PL.h,sz:AU_PL.t})
   .h(P.box,AU_TRIM,{sx:AU_PL.w+0.3,sy:0.5,sz:AU_PL.t+0.2,y:AU_PL.h/2-0.1})
   .h(P.box,AU_TRIM,{sx:AU_PL.w+0.3,sy:0.4,sz:AU_PL.t+0.2,y:-AU_PL.h/2+0.1})
   .h(P.box,AU_DARK,{sx:1.2,sy:1.2,sz:0.5,y:0.4,z:AU_PL.t/2+0.1})            // the gun's housing
   .g(P.cyl,AU_SEAM,{sx:0.7,sy:0.3,sz:0.7,rx:Math.PI/2,y:0.4,z:AU_PL.t/2+0.4});
  for(const sx of [-1,1]) k.h(P.box,AU_TRIM,{sx:0.35,sy:AU_PL.h-1,sz:AU_PL.t+0.15,x:sx*(AU_PL.w/2-0.1)});
  return k.build();
}
function bodyModel(){
  const k=kit(0.5);
  // the chest, wider at the shoulders; the belly; the collar
  k.h(P.box,AU_HULL,{sx:AU_CH.x*2,sy:AU_CH.y1-AU_CH.y0,sz:AU_CH.z*2,y:(AU_CH.y0+AU_CH.y1)/2})
   .h(P.box,AU_PLATE,{sx:AU_CH.x*2+0.6,sy:1.1,sz:AU_CH.z*2+0.6,y:AU_CH.y1+0.2})
   .h(P.box,AU_HULL,{sx:6,sy:3.2,sz:5.4,y:-3})
   .h(P.box,AU_TRIM,{sx:6.4,sy:0.5,sz:5.8,y:-1.6})
   .h(P.taper,AU_DARK,{sx:4.6,sy:2.4,sz:4.6,rx:Math.PI,y:-5.5})
   .h(P.box,AU_DARK,{sx:2.6,sy:1.6,sz:2.2,y:AU_CH.y1+1.4})                  // the neck
   .g(P.box,AU_SEAM,{sx:6.5,sy:0.14,sz:5.9,y:-2.2})
   .g(P.box,AU_SEAM,{sx:AU_CH.x*2+0.7,sy:0.14,sz:AU_CH.z*2+0.7,y:AU_CH.y1-0.35});
  // a grate on each side, the core behind it (only the core glows: the plate hides both)
  for(const a of AU_FACES){
    const c=Math.cos(a), s=Math.sin(a), out=(f,x)=>({x:s*f+c*x, z:c*f-s*x});
    for(let i=-2;i<=2;i++){
      const p=out(AU_CH.z+0.08,i*1.1);
      k.h(P.box,AU_DARK,{sx:Math.abs(c)>0.5?0.28:0.3,sy:5.2,sz:Math.abs(c)>0.5?0.3:0.28,x:p.x,y:AU_PL.y,z:p.z});
    }
    for(const y of [AU_PL.y-2.4,AU_PL.y+2.4]){ const p=out(AU_CH.z+0.08,0);
      k.h(P.box,AU_DARK,{sx:Math.abs(c)>0.5?5.2:0.3,sy:0.3,sz:Math.abs(c)>0.5?0.3:5.2,x:p.x,y,z:p.z}); }
  }
  // shoulders: great pauldrons, rings on top where its cables hold it
  for(const sx of [-1,1]){
    k.h(P.box,AU_PLATE,{sx:3.4,sy:2.6,sz:5,x:sx*(AU_SH[0]-0.2),y:AU_SH[1]+0.4,rz:sx*-0.3})
     .h(P.box,AU_TRIM,{sx:3.6,sy:0.4,sz:5.2,x:sx*(AU_SH[0]-0.1),y:AU_SH[1]+1.7,rz:sx*-0.3})
     .g(P.box,AU_SEAM,{sx:2.8,sy:0.12,sz:5.1,x:sx*(AU_SH[0]-0.3),y:AU_SH[1]-0.3,rz:sx*-0.3})
     .h(P.sph,AU_DARK,{s:1.8,x:sx*AU_SH[0],y:AU_SH[1]-0.2});
    for(const sz of [-1.6,1.6]) k.h(P.tor,AU_TRIM,{s:1.1,x:sx*AU_SH[0],y:AU_SH[1]+2.1,z:sz,ry:Math.PI/2});
  }
  // the head, tilted back to look up: a long skull with a crest, and an empty
  // socket where an eye would be - the one over the citadel
  const hk={rx:-0.55};
  k.h(P.box,AU_HULL,{sx:3.2,sy:2.8,sz:3.6,y:AU_CH.y1+3.1,z:0.3,...hk})
   .h(P.box,AU_PLATE,{sx:3.5,sy:0.5,sz:3.9,y:AU_CH.y1+4.5,z:0,...hk})
   .h(P.box,AU_TRIM,{sx:0.5,sy:1.2,sz:4,y:AU_CH.y1+5,z:-0.3,...hk})
   .h(P.cyl,AU_DARK,{sx:1.8,sy:0.4,sz:1.8,rx:Math.PI/2-0.55,y:AU_CH.y1+3.9,z:2.1})
   .g(P.tor,AU_SOCKET,{s:1.9,rx:-0.55,y:AU_CH.y1+3.95,z:2.2})
   .g(P.box,AU_SEAM,{sx:2.4,sy:0.1,sz:0.06,y:AU_CH.y1+2.2,z:2.05,rx:-0.55});
  // vents across its belly's back (on its chest, they stood over the back's core)
  k.h(P.box,AU_PLATE,{sx:4.6,sy:2.4,sz:0.5,y:-3.1,z:-2.95});
  for(let i=0;i<2;i++) k.g(P.box,AU_SEAM,{sx:3.8,sy:0.14,sz:0.1,y:-2.6-i*0.9,z:-3.25});
  return k.build();
}
function coreModel(){ const k=kit(1); k.g(P.sph,AU_CORE,{s:2.4}); k.g(P.tor,0xffffff,{s:2.2}); return k.build(); }
// a bone of an arm or the spine, along +y, a unit long: scaled to its length
function boneModel(w,claw){
  const k=kit(0.8);
  k.h(P.box,AU_HULL,{sx:w,sy:1,sz:w*0.85,y:0.5})
   .h(P.box,AU_TRIM,{sx:w*1.15,sy:0.08,sz:w,y:0.1})
   .g(P.box,AU_SEAM,{sx:w*1.02,sy:0.03,sz:0.06,y:0.55,z:w*0.43});
  return k.build();
}
function handModel(){
  const k=kit(0.8);
  k.h(P.box,AU_PLATE,{sx:2.2,sy:1.2,sz:2.2})
   .h(P.sph,AU_DARK,{s:1.5,y:0.6});
  for(const [x,z] of [[-0.8,1],[0,1.1],[0.8,1],[-1,-0.6],[1,-0.6]])
    k.h(P.cone,AU_TRIM,{sx:0.45,sy:1.6,sz:0.45,x,z,y:-0.9,rx:Math.PI+(z>0?-0.25:0.25)});
  k.g(P.sph,AU_SEAM,{s:0.5,y:0.2,z:1.1});
  return k.build();
}

function addAuthority(def){
  AU=null;
  if(!def) return;
  const mat=hullMat.clone(); mat.emissive=new THREE.Color(AU_SEAM); mat.emissiveIntensity=0.04;
  const glow=new THREE.MeshBasicMaterial({vertexColors:true});
  const g=new THREE.Group(); scene.add(own(g));
  const body=auMesh(bodyModel(),mat,glow); g.add(body);
  const pm=plateModel(), co=coreModel();
  const plates=AU_FACES.map((a,i)=>{
    const pivot=new THREE.Group(); pivot.rotation.y=a; g.add(pivot);
    const m=auMesh(pm,mat,glow); m.position.set(0,AU_PL.y,AU_CH.z+AU_PL.t/2); pivot.add(m);
    // its face, which cracks where each charge lands, as the Bastion's shield does
    const pl={shLook:AU_LOOK}; shieldClean(pl);
    const C=shieldCanvases(pl);
    const fm=new THREE.MeshLambertMaterial({color:0xffffff,map:C.map,emissive:0xffffff,emissiveMap:C.gmap,emissiveIntensity:1.2});
    fm.__perObject=true;
    const cr=new THREE.Mesh(new THREE.PlaneGeometry(AU_PL.w-0.1,AU_PL.h-0.1),fm); cr.position.z=AU_PL.t/2+0.012; m.add(cr);
    const coreM=new THREE.MeshBasicMaterial({color:AU_CORE}); coreM.__perObject=true;
    const core=new THREE.Mesh(co.glow,coreM); core.position.set(0,AU_PL.y,AU_CH.z-0.5); pivot.add(core);
    return {i,a,pivot,m,cr,pl,core,coreM,hp:2,off:false,chp:1,gunT:rand(0.5,2),burst:0,burstT:0};
  });
  const bone=boneModel(1.5), fore=boneModel(1.25), hand=handModel(), spine=boneModel(2.2);
  const arms=[-1,1].map(sx=>({sx, up:auMesh(bone,mat,glow), lo:auMesh(fore,mat,glow), hand:auMesh(hand,mat,glow),
                              h:V3(sx*6.2,-8,0.6), want:V3(), slam:null}));
  for(const A of arms){ g.add(A.up,A.lo,A.hand); }
  const spineM=[];
  for(let i=0;i<7;i++){ const s=auMesh(spine,mat,glow); s.scale.set(1-i*0.1,2.3,1-i*0.1); g.add(s); spineM.push(s); }
  // its cables up the Well, and the hoist line off its head
  const cab=new THREE.MeshLambertMaterial({color:0x2a3240});
  const cgeo=new THREE.CylinderGeometry(1,1,1,6);
  const cables=(def.cables||[]).map(top=>{ const m=new THREE.Mesh(cgeo,cab); scene.add(own(m)); return {top,m,r:0.18}; });
  let hoist=null;
  if(def.hoist){ const m=new THREE.Mesh(cgeo,cab); scene.add(own(m)); hoist={top:def.hoist,m,r:0.16}; }
  // what you can't walk through: its chest, head and spine. The eye's light and
  // sight pass it (`glass`): as a shadow over the Lift Hall it would have
  // changed the Dynamo fight under it. And shots (`noRay`): what they meet is
  // its shape, armour and grates and all, not this box round it
  const cols=[0,1,2].map(()=>{ const c={min:V3(),max:V3(),glass:true,noRay:true}; colliders.push(c); return c; });
  // and its arms where they come down onto the floor: a hand and its forearm
  for(const a of arms) a.cols=[0,1,2].map(()=>{ const c={min:V3(),max:V3(),glass:true,noRay:true}; colliders.push(c); return c; });
  AU={def, g, body, mat, glow, plates, arms, spineM, cables, hoist, cols,
      pos:V3(...def.hang), face:0, st:'hang', t:0, flash:0, slamT:3, e:null, rings:[], sway:0};
  auPlace('hang');
}

/* Where it is and how it holds itself for a state, all at once - a load, a
   checkpoint put back. */
function auPlace(st){
  const A=AU; A.st=st; A.t=0;
  if(st==='hang'){ A.pos.set(...A.def.hang); A.face=0; }
  else if(st==='up'){ A.pos.set(...A.def.up); }
  else if(st==='down'){ A.pos.set(...A.def.rest); }
  for(const p of A.plates) mendPlate(p);
  for(const R of A.rings) dropRing(R);
  A.rings.length=0;
  for(const a of A.arms){ a.slam=null; }
  A.g.rotation.set(0,A.face,st==='down'?0.35:0);
  auDark(st==='down');
  auPose(0,true);
}
function mendPlate(p){
  if(p.debris){ scene.remove(p.debris); p.debris=null; }
  if(p.hp!==2||p.off) shieldClean(p.pl);
  p.hp=2; p.off=false; p.chp=1; p.smokeT=0;
  if(p.m.parent!==p.pivot){ p.pivot.add(p.m); }
  p.m.position.set(0,AU_PL.y,AU_CH.z+AU_PL.t/2); p.m.rotation.set(0,0,0); p.m.visible=true;
}
function auDark(on){
  const A=AU;
  A.glow.color.setHex(on?0x221a26:0xffffff);
  for(const p of A.plates) p.coreM.color.setHex(on?0x3a2a1a:AU_CORE);
}
const auSmooth=k=>k*k*(3-2*k);

/* Each frame, whatever it is doing. */
function updateAuthority(dt){
  const A=AU; if(!A) return;
  A.t+=dt; A.sway+=dt;
  if(A.st==='rise'){
    const k=Math.min(1,A.t/AU_RISE), s=auSmooth(k), h=A.def.hang, u=A.def.up;
    A.pos.set(lerp(h[0],u[0],s),lerp(h[1],u[1],s),lerp(h[2],u[2],s));
    if(Math.random()<dt*4){ for(const c of A.cables) if(c.m.visible){ _ua.set(...c.top); FX.burst(_ua,3,0xffd090,4,0.3,2); } }
    if(k>=1){ A.st='up'; A.t=0; player.shake=Math.min(0.7,player.shake+0.5); SFX.crash();
      for(const a of A.arms){ handAt(a,_ua); FX.burst(_ua,30,0x9aa0b0,7,0.6,4); } }
  }else if(A.st==='fall'){
    if(A.t<1.4){                         // it shudders, its grip going
      const u=A.def.up; A.pos.set(u[0]+rand(-0.15,0.15),u[1]+rand(-0.1,0.1),u[2]+rand(-0.15,0.15));
      if(Math.random()<dt*12){ _ua.set(A.pos.x+rand(-5,5),A.pos.y+rand(-2,4),A.pos.z+rand(-5,5)); FX.burst(_ua,8,AU_SEAM,8,0.4,4); }
    }else{
      A.v=(A.v||0)+30*dt; A.pos.y-=A.v*dt;
      A.g.rotation.z=Math.min(0.35,A.g.rotation.z+dt*0.2);
      if(A.pos.y<=A.def.rest[1]){ A.pos.set(...A.def.rest); A.st='down'; A.t=0; A.v=0; auDark(true);
        FX.burst(A.pos,80,0x9aa0b0,18,1.2,8); FX.ring(A.pos,0xffffff,26,0.9); SFX.crash(); SFX.boom();
        const d=A.pos.distanceTo(player.pos); player.shake=Math.min(0.8,player.shake+Math.max(0,1-d/160)); }
    }
  }else if(A.st==='down'){
    if(Math.random()<dt*3){ _ua.set(A.pos.x+rand(-3,3),A.pos.y+rand(2,6),A.pos.z+rand(-3,3)); FX.burst(_ua,3,0x3a3540,2,1.6,-2); }
  }
  if(A.flash>0) A.flash-=dt;
  A.mat.emissiveIntensity=0.04+Math.max(0,A.flash)*3;
  updateRings(dt);
  auPose(dt,false);
}

/* Its arms and spine, its cables and colliders, where its body is now. */
function auPose(dt,snap){
  const A=AU, P0=A.pos;
  A.g.position.copy(P0); A.g.rotation.y=A.face;
  A.g.updateMatrixWorld(true);
  const up=A.st==='up'||(A.st==='rise'&&A.t>AU_RISE-2.5)||(A.st==='fall'&&A.t<1.4);
  for(const a of A.arms){
    if(a.slam) slamArm(a,dt);
    else if(up){ a.want.set(a.sx*AU_HAND[0],A.def.deck-P0.y+0.6,AU_HAND[1]); }
    else if(A.st==='down'){ a.want.set(a.sx*6.5,-4.2,2.5); }
    else a.want.set(a.sx*(6.2+Math.sin(A.sway*0.6+a.sx)*0.3),-8.2,0.6+Math.sin(A.sway*0.5)*0.4);
    if(snap) a.h.copy(a.want); else a.h.lerp(a.want,Math.min(1,dt*(a.slam?(a.slam.t>a.slam.warn?16:3):2.5)));
    armIK(a);
  }
  // the spine trails below, swaying; gone down the Well it lies crumpled
  let x=0, y=-6.8, z=0;
  for(let i=0;i<A.spineM.length;i++){
    const s=A.spineM[i];
    s.visible=A.st!=='down'||i<2;
    const len=2.3*(1-i*0.04);
    const dx=Math.sin(A.sway*0.7+i*0.6)*0.12*i, dz=Math.cos(A.sway*0.55+i*0.5)*0.1*i;
    s.position.set(x,y-len,z); s.rotation.set(dz*0.2,0,-dx*0.2);
    x+=dx; z+=dz; y-=len;
  }
  // colliders: chest, head, spine, in the world. Up in the crown, only the
  // chest, a little inside its turned outline: the hole round it is 12m across
  const c=A.cols, auGone=A.st==='down'||A.st==='fall'&&A.t>1.4;
  const r=A.st==='up'||A.st==='fall'?4.4:AU_CH.x+AU_PL.t;
  c[0].min.set(P0.x-r,P0.y-4.6,P0.z-r); c[0].max.set(P0.x+r,P0.y+AU_CH.y1+1,P0.z+r);
  c[1].min.set(P0.x-1.8,P0.y+AU_CH.y1+1,P0.z-1.8); c[1].max.set(P0.x+1.8,P0.y+AU_CH.y1+5,P0.z+2.2);
  c[2].min.set(P0.x-1.2,P0.y-21,P0.z-1.2); c[2].max.set(P0.x+1.2,P0.y-4.6,P0.z+1.2);
  if(auGone||A.st==='up') for(const k of (auGone?[0,1,2]:[2])){ c[k].min.y=-1000.5; c[k].max.y=-1000; }
  // its four cables run up the Well while it hangs; hauled up, they are reeled in
  const shown=A.st==='hang'||A.st==='rise'&&A.t<AU_RISE*0.72;
  A.cables.forEach((cb,k)=>{
    cb.m.visible=shown; if(!shown) return;
    const sx=k<2?-1:1, sz=k%2?1:-1;
    _ua.set(sx*AU_SH[0],AU_SH[1]+2.1,sz*1.6).applyMatrix4(A.g.matrixWorld);
    auStrut(cb.m,_ua,_ub.set(...cb.top),cb.r);
  });
  if(A.hoist){ A.hoist.m.visible=A.st==='hang';
    if(A.hoist.m.visible){ _ua.set(0,AU_CH.y1+5.2,-0.4).applyMatrix4(A.g.matrixWorld); auStrut(A.hoist.m,_ua,_ub.set(...A.hoist.top),A.hoist.r); } }
}
// a mesh a unit long along +y (cables: a cylinder about its middle) laid from a to b
function auStrut(m,a,b,r,base){
  _uc.subVectors(b,a); const L=_uc.length()||0.001; _uc.multiplyScalar(1/L);
  _uq.setFromUnitVectors(_uup,_uc); m.quaternion.copy(_uq);
  if(base){ m.position.copy(a); m.scale.set(1,L,1); }
  else{ m.position.addVectors(a,b).multiplyScalar(0.5); m.scale.set(r,L,r); }
}
// two bones from the shoulder to the hand, the elbow bent out and up
function armIK(a){
  const A=AU, S=_ua.set(a.sx*AU_SH[0],AU_SH[1]-0.6,0), H=_ub.copy(a.h);
  const d=Math.min(S.distanceTo(H),AU_ARM[0]+AU_ARM[1]-0.05), dir=_uc.subVectors(H,S).normalize();
  H.copy(S).addScaledVector(dir,d);
  const x=(AU_ARM[0]*AU_ARM[0]-AU_ARM[1]*AU_ARM[1]+d*d)/(2*d), hgt=Math.sqrt(Math.max(0,AU_ARM[0]*AU_ARM[0]-x*x));
  _ud.set(a.sx,0.8,-0.3);                                        // the elbow goes out, and up
  _ud.addScaledVector(dir,-_ud.dot(dir)).normalize();
  const E=_ud.multiplyScalar(hgt).addScaledVector(dir,x).add(S);
  // (in its own frame: they are its children)
  const Hc=_uc2.copy(H);
  auStrut(a.up,S,E,1,true); auStrut(a.lo,E,Hc,1,true);
  a.hand.position.copy(Hc);
  // solid where they reach the floor, while it holds on there: swinging down
  // on you it would shove you about, so not then
  const on=A.st==='up'&&!a.slam;
  for(let k=0;k<3;k++){
    const c=a.cols[k];
    if(!on){ c.min.set(0,-1000.5,0); c.max.set(0,-1000,0); continue; }
    const f=k===0?1:(k===1?0.68:0.38), r=k===0?1.2:0.75;
    _ua.copy(E).lerp(Hc,f).applyMatrix4(A.g.matrixWorld);
    c.min.set(_ua.x-r,_ua.y-(k===0?0.9:r),_ua.z-r); c.max.set(_ua.x+r,_ua.y+(k===0?1.3:r),_ua.z+r);
  }
}
function handAt(a,out){ return out.copy(a.h).applyMatrix4(AU.g.matrixWorld); }

/* ---------- the fight ---------- */
// the boss record: where it is, and what to do when it's hit
function auBind(e){
  const A=AU; if(!A) return;
  A.e=e; e.pos.copy(A.pos);
  for(const p of A.plates) mendPlate(p);
  // A core on each side, each a quarter of its health, so every plate has to
  // come off: through one open side alone it can't be beaten
  const per=Math.round(e.maxHp/4); e.maxHp=e.hp=per*4;
  for(const p of A.plates) p.chp=per;
  A.slamT=3; A.face=A.g.rotation.y;
}
function auGone(e){ if(AU&&AU.e===e) AU.e=null; }

// a ray in its own frame: chest, head, shoulders; each side's plate, or its grate once the plate is off
const AU_BOXES=[];
function boxesFor(){
  AU_BOXES.length=0;
  const add=(id,x0,x1,y0,y1,z0,z1)=>AU_BOXES.push({id,min:{x:x0,y:y0,z:z0},max:{x:x1,y:y1,z:z1}});
  add('hull',-AU_CH.x,AU_CH.x,-4.6,AU_CH.y1+0.8,-AU_CH.z,AU_CH.z);
  add('hull',-1.8,1.8,AU_CH.y1+0.8,AU_CH.y1+5,-1.8,2.4);
  for(const sx of [-1,1]) add('hull',Math.min(sx*AU_CH.x,sx*7.2),Math.max(sx*AU_CH.x,sx*7.2),AU_SH[1]-1,AU_SH[1]+2,-2.5,2.5);
  for(const p of AU.plates){
    const c=Math.cos(p.a), s=Math.sin(p.a), f0=p.off?AU_CH.z-0.2:AU_CH.z, f1=p.off?AU_CH.z+0.3:AU_CH.z+AU_PL.t, hw=p.off?2.7:AU_PL.w/2;
    const xs=[s*f0+c*hw, s*f0-c*hw, s*f1+c*hw, s*f1-c*hw], zs=[c*f0-s*hw, c*f0+s*hw, c*f1-s*hw, c*f1+s*hw];
    add((p.off?'g':'p')+p.i, Math.min(...xs),Math.max(...xs), AU_PL.y-(p.off?2.7:AU_PL.h/2), AU_PL.y+(p.off?2.7:AU_PL.h/2), Math.min(...zs),Math.max(...zs));
  }
  return AU_BOXES;
}
const _ulo=V3(), _uld=V3();
function toLocal(p,out){
  const c=Math.cos(AU.face), s=Math.sin(AU.face), x=p.x-AU.pos.x, z=p.z-AU.pos.z;
  return out.set(x*c-z*s,p.y-AU.pos.y,x*s+z*c);
}
function auRay(e,o,d){
  if(!AU||AU.e!==e||AU.st!=='up') return -1;
  toLocal(o,_ulo);
  const c=Math.cos(AU.face), s=Math.sin(AU.face);
  _uld.set(d.x*c-d.z*s,d.y,d.x*s+d.z*c);
  let best=Infinity, part=null;
  for(const b of boxesFor()){
    const t=rayBox(_ulo,_uld,b);
    // a plate's or grate's face sits on the chest's: the one in front wins a tie
    if(t<best-0.05||(t<best+0.05&&b.id!=='hull'&&part==='hull')){ best=t; part=b.id; }
  }
  e.part=part;
  return best===Infinity?-1:best;
}
function auHit(e,dmg,at,dir,pierce,crit){
  const A=AU; e.crit=false;
  if(e.part&&e.part.startsWith('strike')) return coreHit(A.plates[+e.part[6]],dmg);
  const where=at||e.pos;
  if(e.part&&e.part[0]==='g'){
    // through the grate to the core: only a round that pierces
    const p=A.plates[+e.part[1]];
    if(pierce&&p.chp>0){ e.crit=true; p.coreM.color.setHex(0xffffff); FX.burst(where,18,AU_CORE,9,0.4,6); return coreHit(p,dmg*1.6); }
    FX.burst(where,6,p.chp>0?AU_CORE:0x9aa0b0,4,0.2,4); FX.ring(where,AU_CORE,1.6,0.25); return 0;
  }
  // armour, or the body round it: nothing gets in
  FX.burst(where,6,e.part&&e.part[0]==='p'?AU_SEAM:0x9aa0b0,5,0.22,5); FX.ring(where,AU_SEAM,1.8,0.25);
  return 0;
}
// a core takes no more than it has left; at none, it is out
function coreHit(p,dmg){
  const A=AU; dmg=Math.min(dmg,p.chp); p.chp-=dmg; A.flash=0.18;
  if(p.chp<=0){
    p.core.getWorldPosition(_ub); FX.burst(_ub,70,0xffffff,16,0.7,8); FX.burst(_ub,40,AU_CORE,12,0.6,6); FX.ring(_ub,AU_SEAM,12,0.6);
    player.shake=Math.min(0.6,player.shake+0.35); SFX.breach(); A.flash=0.4;
  }
  return dmg;
}
// a Sunder charge bursting on it: a plate cracks, then comes off. Taken whole
// wherever it lands on it - an open grate stops a charge too.
function auSunder(e,at,direct){
  const A=AU; if(!A||A.e!==e||A.st!=='up') return false;
  toLocal(at,_ulo);
  let best=null, bd=Infinity;
  for(const p of A.plates){
    if(p.off) continue;
    const s=Math.sin(p.a), c=Math.cos(p.a);
    const f=_ulo.x*s+_ulo.z*c, x=_ulo.x*c-_ulo.z*s;                   // out from that side, and across it
    const dx=Math.max(0,Math.abs(x)-AU_PL.w/2), dy=Math.max(0,Math.abs(_ulo.y-AU_PL.y)-AU_PL.h/2), df=Math.max(0,AU_CH.z-f,f-AU_CH.z-AU_PL.t);
    const dd=Math.hypot(dx,dy,df);
    if(dd<bd){ bd=dd; best=p; }
  }
  const near=Math.max(Math.abs(_ulo.x),Math.abs(_ulo.z))<AU_CH.z+AU_PL.t+2.2&&_ulo.y>-6&&_ulo.y<AU_CH.y1+6;
  if(best&&bd<2.2){ crackPlate(best,at); return true; }
  if(direct||near){ FX.ring(at,AU_SEAM,3.4,0.35); FX.burst(at,16,0xffb070,8,0.3,5); SFX.hit(); return true; }
  return false;
}
function crackPlate(p,at){
  const A=AU;
  p.hp--;
  FX.ring(at,0xffd0a0,3.6,0.35); FX.burst(at,22,0xffb060,10,0.35,6);
  // the fracture, where the charge landed on its face
  p.m.updateMatrixWorld(true); const lp=p.m.worldToLocal(_ua.copy(at));
  shieldImpact(p.pl,lp.x/(AU_PL.w-0.1)+0.5,lp.y/(AU_PL.h-0.1)+0.5,p.hp<=0);
  if(p.hp>0){ SFX.hit(); return; }
  // off: it is torn away and falls, and the grate behind it is open
  p.off=true;
  p.m.updateMatrixWorld(true); p.m.getWorldPosition(_ua); p.m.getWorldQuaternion(_uq);
  scene.add(p.m); p.m.position.copy(_ua); p.m.quaternion.copy(_uq);
  const out=_ub.set(Math.sin(A.face+p.a),0,Math.cos(A.face+p.a));
  p.debris=p.m; p.dv=V3(out.x*7,6,out.z*7); p.dt=0; p.spin=V3(rand(-2,2),rand(-1,1),rand(-2,2));
  FX.burst(_ua,60,0xffb060,15,0.6,9); FX.burst(_ua,30,0x5a6070,12,0.8,10); FX.ring(_ua,AU_SEAM,10,0.6);
  // and spills charges for the Rail onto the floor in front of it: a plate
  // off is a grate to shoot through
  dropPickup(_ub.set(A.pos.x+out.x*9.5,A.def.deck+0.5,A.pos.z+out.z*9.5),'ammo',30);
  player.shake=Math.min(0.6,player.shake+0.35); SFX.breach();
  A.flash=0.3;
}
// the eye's lightning, where it lands: beside a side it has lost, it hurts it
function auStrike(e,k){
  const A=AU; if(!A||A.e!==e||A.st!=='up') return;
  _ua.set(k.x,A.pos.y,k.z); toLocal(_ua,_ulo);
  const ax=Math.abs(_ulo.x), az=Math.abs(_ulo.z);
  const i=az>=ax?(_ulo.z>0?0:2):(_ulo.x>0?1:3), p=A.plates[i];
  const dist=Math.max(0,Math.max(ax,az)-AU_CH.z);
  if(!p.off||p.chp<=0||dist>k.S.r+1.5) return;
  e.part='strike'+i;
  damageEnemy(e,k.S.bdmg,false,e.pos,null,1,false);
  p.core.getWorldPosition(_ub); FX.burst(_ub,40,0xffffff,12,0.5,8); FX.ring(_ub,AU_CORE,6,0.5);
}

/* What it does while it fights: turns its best side to you, shoots from
   what armour it has, and brings an arm down where you stand. */
const AU_BULLET={spd:26,dmg:11,r:0.42,color:AU_SEAM};
function updateFight(e,dt){
  const A=AU; if(!A||A.e!==e){ return; }
  e.pos.copy(A.pos);
  if(A.st!=='up'){ e.dim=true; return; }
  e.dim=!A.plates.some(p=>p.off&&p.chp>0);
  // its strongest side to you: the plate with the most left on it, or a core
  // already out (nothing there to hurt), the nearer in a tie - slower than you
  // can go round it
  const toP=Math.atan2(player.pos.x-A.pos.x,player.pos.z-A.pos.z);
  let want=A.face, best=-1, bd=Infinity;
  for(const p of A.plates){
    const score=p.off?(p.chp>0?0:3):p.hp;
    let d=toP-p.a-A.face; while(d>Math.PI) d-=T2; while(d<-Math.PI) d+=T2;
    if(score>best||score===best&&Math.abs(d)<bd){ best=score; bd=Math.abs(d); want=A.face+d; }
  }
  const turn=clamp(want-A.face,-0.42*dt,0.42*dt); A.face+=turn;
  // the plates' guns: one facing you shoots a burst
  for(const p of A.plates){
    if(p.off) continue;
    let d=toP-p.a-A.face; while(d>Math.PI) d-=T2; while(d<-Math.PI) d+=T2;
    p.gunT-=dt;
    if(p.burst>0){ p.burstT-=dt; if(p.burstT<=0){ p.burst--; p.burstT=0.2; auShoot(p); } }
    else if(p.gunT<=0&&Math.abs(d)<1.1){ p.gunT=rand(2.4,3.2); p.burst=2; p.burstT=0; }
  }
  // an arm comes down where you stand, if you're on the crown and in its reach
  A.slamT-=dt;
  const dx=player.pos.x-A.pos.x, dz=player.pos.z-A.pos.z, hd=Math.hypot(dx,dz);
  if(A.slamT<=0&&hd<22&&Math.abs(player.pos.y-A.def.deck)<5&&!A.arms.some(a=>a.slam)){
    A.slamT=rand(4.8,6.2);
    toLocal(player.pos,_ulo);
    const a=A.arms[_ulo.x<0?0:1];
    const tx=player.pos.x+player.vel.x*0.35, tz=player.pos.z+player.vel.z*0.35;
    a.slam={t:0, warn:1.25, at:V3(tx,A.def.deck,tz), ring:ringAt(tx,A.def.deck,tz,3.6)};
    SFX.creak(1.2);
  }
}
const _usp=V3(), _usd=V3();
function auShoot(p){
  p.m.updateMatrixWorld(true);
  _usp.set(0,0.4,AU_PL.t/2+0.8).applyMatrix4(p.m.matrixWorld);
  _usd.set(player.pos.x+player.vel.x*0.4-_usp.x, player.pos.y+1.2-_usp.y, player.pos.z+player.vel.z*0.4-_usp.z).normalize();
  _usd.x+=rand(-0.04,0.04); _usd.y+=rand(-0.03,0.03); _usd.z+=rand(-0.04,0.04); _usd.normalize();
  spawnBullet(_usp,_usd,AU_BULLET,1); FX.burst(_usp,5,AU_SEAM,5,0.2,2,_usd,0.8); SFX.ezap();
}
// the arm: up over its shoulder while the ring fills, then down on it
function slamArm(a,dt){
  const S=a.slam, A=AU; S.t+=dt;
  if(S.t<S.warn){ a.want.set(a.sx*(AU_SH[0]+2),AU_SH[1]+6.5,2.5); return; }
  toLocal(S.at,a.want); a.want.y=A.def.deck-A.pos.y+0.6;
  if(!S.hit&&S.t>=S.warn+0.12){
    S.hit=true; dropRing(S.ring);
    FX.burst(S.at,40,0x9aa0b0,12,0.6,6); FX.ring(S.at,AU_SEAM,9,0.45); SFX.boom();
    player.shake=Math.min(0.7,player.shake+0.3);
    // a jump clears it
    if(Math.hypot(player.pos.x-S.at.x,player.pos.z-S.at.z)<3.6&&player.pos.y<A.def.deck+1.6) damagePlayer(30,S.at);
  }
  if(S.t>S.warn+0.9) a.slam=null;
}
let _urg=null;
function ringAt(x,y,z,r){
  if(!_urg) _urg=new THREE.RingGeometry(0.86,1,40);
  const m=new THREE.MeshBasicMaterial({color:AU_SEAM,transparent:true,opacity:0.8,depthWrite:false,side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4});
  const g=new THREE.Mesh(_urg,m); g.rotation.x=-Math.PI/2; g.position.set(x,y+0.05,z); g.scale.setScalar(r); scene.add(g);
  const R={m:g,t:0}; AU.rings.push(R); return R;
}
function dropRing(R){ if(!R||!R.m.parent) return; scene.remove(R.m); R.m.material.dispose(); }
function updateRings(dt){
  for(const R of AU.rings){ R.t+=dt; R.m.material.opacity=0.5+0.4*Math.sin(R.t*24); }
  for(let i=AU.rings.length-1;i>=0;i--) if(!AU.rings[i].m.parent) AU.rings.splice(i,1);
  // a plate torn off, falling away
  for(const p of AU.plates){
    if(!p.debris) continue;
    p.dt+=dt; p.dv.y-=30*dt; p.debris.position.addScaledVector(p.dv,dt);
    p.debris.rotation.x+=p.spin.x*dt; p.debris.rotation.y+=p.spin.y*dt; p.debris.rotation.z+=p.spin.z*dt;
    if(p.dt>5){ scene.remove(p.debris); p.debris=null; }
  }
  // a core flashes white when it's hit, and settles back
  for(const p of AU.plates){
    _ucol.setHex(AU.st==='down'||p.chp<=0?0x3a2a1a:AU_CORE);
    p.coreM.color.lerp(_ucol,Math.min(1,dt*5));
    // a core that is out smokes through its grate
    if(p.chp<=0&&AU.st==='up'&&Math.random()<dt*6){ p.core.getWorldPosition(_ub); FX.burst(_ub,2,0x3a3540,2,1.4,-3); }
  }
}

PROXY.authority={bind:auBind, update:updateFight, ray:auRay, hit:auHit, sunder:auSunder, strike:auStrike, gone:auGone};

/* The level's `authority` action. */
function authorityAction(a){
  if(!AU) return;
  if(a.do==='haul'&&AU.st==='hang'){ AU.st='rise'; AU.t=0; SFX.creak(2.5); }
  else if(a.do==='fall'&&(AU.st==='up'||AU.st==='rise')){ AU.st='fall'; AU.t=0; AU.v=0; for(const R of AU.rings) dropRing(R); for(const r of AU.arms) r.slam=null; SFX.creak(1.4); }
}
// what a checkpoint keeps: where it is. Mid-haul it is photographed as up; mid-fall, down.
function authoritySnap(){ return AU?(AU.st==='rise'?'up':AU.st==='fall'?'down':AU.st):null; }
function authorityRestore(st){ if(AU&&st&&st!==AU.st) auPlace(st); else if(AU&&st==='up'){ for(const p of AU.plates) mendPlate(p); } }

export {addAuthority, updateAuthority, authorityAction, authoritySnap, authorityRestore};
if(devFlag(/debug/)) window.__au=()=>AU;
