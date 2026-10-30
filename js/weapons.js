import {THREE,V3,clamp,lerp,rand} from './util.js';
import {game,enemies,anchors,conduits,pylons,storms,breaches,moltens} from './state.js';
import {camera,muzzleLight,VM_LAYER} from './render.js';
import {TEX,ENV} from './textures.js';
import {GUN_BUILD} from './models.js';
import {GUN_NAMES,LOADED_GUN,fitObject,dressMaterial} from './assets.js';
import {rayWorld,rayBox,raySphere,_sv} from './world.js';
import {damageEnemy,hitShield,PROXY} from './enemies.js';
import {player,setGrapple} from './player.js';
import {SFX} from './audio.js';
import {FX} from './fx.js';
import {hud,crossEl} from './hud.js';

/* Weapons, view models, firing and hitscan. */

const WEAPONS=[
  // falloff: full damage inside `fnear`, scaling to `fmin` at `ffar`. The pulse is the
  // camping weapon - infinite reserve, hitscan, pinpoint - so it pays the steepest tax.
  // The rail keeps full damage at any range; that is what it is for.
  {id:'pulse', name:'PULSE',  mag:36, magSize:36, reserve:Infinity, maxRes:Infinity, rate:0.075, dmg:14, pellets:1,
   spread:0.014, reload:1.05, kick:0.55, color:0x5df0ff, auto:true,  pierce:false, tw:0.045, sfx:'pulse', shake:0.02,
   fnear:15, ffar:45, fmin:0.28},
  {id:'scatter', name:'SCATTER',mag:8,  magSize:8,  reserve:36, maxRes:64, rate:0.62, dmg:12, pellets:11,
   spread:0.085, reload:1.45, kick:3.4, color:0xff3fa4, auto:false, pierce:false, tw:0.05, sfx:'scatter', shake:0.10,
   fnear:7, ffar:24, fmin:0.22},
  {id:'rail', name:'RAIL',   mag:5,  magSize:5,  reserve:18, maxRes:36, rate:0.95, dmg:150, pellets:1,
   spread:0,     reload:1.85, kick:5.2, color:0xffc24d, auto:false, pierce:true,  tw:0.11, sfx:'rail', shake:0.16},
  // The tether is a route before it is a gun. Damage is an afterthought; what it
  // does is close distance - yours to an anchor, or an enemy's to you. Infinite
  // reserve, because running dry halfway up a shaft is a death loop, not a
  // difficulty spike.
  {id:'tether', name:'TETHER', mag:10, magSize:10, reserve:Infinity, maxRes:Infinity, rate:0.55, dmg:18, pellets:1,
   spread:0, reload:0.9, kick:1.4, color:0x8dff6a, auto:false, pierce:false, tw:0.06, sfx:'pulse', shake:0.04,
   fnear:40, ffar:40, fmin:1, tether:true},
  // Arc: the chain. Hitscan into the first thing in line, then on to the nearest
  // few beyond it - the swarm gun in a fight, and the thing that powers conduits
  // out of one. Infinite reserve for the tether's reason: it is a tool, and a
  // tool that runs dry halfway through a puzzle is a soft-lock.
  {id:'arc', name:'ARC', mag:14, magSize:14, reserve:Infinity, maxRes:Infinity, rate:0.38, dmg:24, pellets:1,
   spread:0, reload:1.2, kick:1.1, color:0xb58cff, auto:false, pierce:false, tw:0.05, sfx:'pulse', shake:0.05,
   fnear:36, ffar:36, fmin:1, arc:true},
  // Sunder: a breaching charge. It bursts where it lands, and the burst breaks a
  // reinforced panel and throws whatever is near it - from every side at once,
  // so a front-plated Bulwark gets no help from its plate. Slow and scarce: a
  // tool for walls that will also do for a crowd.
  {id:'sunder', name:'SUNDER', mag:3, magSize:3, reserve:Infinity, maxRes:Infinity, rate:1.15, dmg:110, pellets:1,
   spread:0, reload:2.2, kick:7.5, color:0xff7a2a, auto:false, pierce:false, tw:0.16, sfx:'sunder', shake:0.3,
   fnear:60, ffar:60, fmin:1, sunder:true, blast:3.2, blastDmg:90, pickup:2}
];
/* How far the arc reaches and jumps. A pylon relays much further than a chain
   hops between enemies: that is what lets power be routed round a corner. */
// Five jumps, losing a tenth each: a campaign mite has 15 hp, and the last jump
// still lands 15.7, so one shot clears a cluster of five.
const ARC_RANGE=36, ARC_HOP=9, PYLON_HOP=18, ARC_HOPS=5, ARC_FADE=0.9;
/* Reach. Deliberately shorter than a dash-span so the tether opens routes the
   dash cannot rather than replacing it. */
const TETHER_RANGE=34, ANCHOR_RAD=1.5;
let curW=0, fireCd=0, reloadT=0, wantFire=false, shotBuf=0;

/* Which weapons the player is currently carrying. Levels set this from their
   loadout; picking one up in a level adds to it. */
const owned={pulse:true};
function hasWeapon(id){ return !!owned[id]; }
function weaponIndex(id){ return WEAPONS.findIndex(w=>w.id===id); }
/* The table's own reserve values are the starting ones, and play writes over
   them, so take a copy while they are still true. */
const START_AMMO=WEAPONS.map(w=>({mag:w.magSize, reserve:w.reserve}));

/* Ammo back to its starting state without touching who owns what - a campaign
   level gates weapons, so it cannot use resetWeapons, which hands over the
   whole rack. */
function resetAmmo(){
  for(let i=0;i<WEAPONS.length;i++){
    WEAPONS[i].mag=START_AMMO[i].mag;
    WEAPONS[i].reserve=START_AMMO[i].reserve;
  }
  fireCd=0; reloadT=0; wantFire=false; shotBuf=0; vmRecoil=0;
  hud.weapon=true;
}
function setLoadout(list){
  for(const k in owned) delete owned[k];
  (list&&list.length?list:['pulse']).forEach(id=>{ owned[id]=true; });
  if(!owned[WEAPONS[curW].id]) selectFirstOwned();
  hud.weapon=true;
}
function grantWeapon(id){
  if(owned[id]) return false;
  owned[id]=true;
  const i=weaponIndex(id);
  if(i>=0){ WEAPONS[i].mag=WEAPONS[i].magSize; selectWeapon(i); }
  hud.weapon=true;
  return true;
}
function selectFirstOwned(){
  for(let i=0;i<WEAPONS.length;i++) if(owned[WEAPONS[i].id]){ curW=i; break; }
  for(let k=0;k<vms.length;k++) vms[k].visible=(k===curW);
}

/* --- view models (rebuilt if external gun models load) --- */
const vmRoot=new THREE.Group();
vmRoot.position.set(0.30,-0.26,-0.55);
camera.add(vmRoot);
const vmHullMat=new THREE.MeshStandardMaterial({
  vertexColors:true, metalness:0.58, roughness:0.34,
  map:TEX.hullA, normalMap:TEX.hullN, roughnessMap:TEX.hullR,
  envMap:ENV, envMapIntensity:1.1});
vmHullMat.normalScale.set(0.9,0.9);
function buildVM(idx){
  const g=new THREE.Group();
  const m=GUN_BUILD[idx]();
  const ext=LOADED_GUN[GUN_NAMES[idx]];
  if(ext){
    const o=ext.clone(true);
    o.traverse(x=>{ if(x.isMesh){ x.material=x.material.clone(); dressMaterial(x.material); } });
    fitObject(o,m.radius||1,false);      // match authored size, keep the muzzle aligned
    g.add(o);
  }else{
    if(m.hull) g.add(new THREE.Mesh(m.hull,vmHullMat));
    if(m.glow) g.add(new THREE.Mesh(m.glow,new THREE.MeshBasicMaterial({vertexColors:true})));
  }
  const muzzle=new THREE.Object3D();
  // where each gun's muzzle sits along its barrel
  muzzle.position.set(0,0.015,{pulse:-0.67,scatter:-0.67,rail:-1.07,tether:-0.56,arc:-0.62,sunder:-0.66}[WEAPONS[idx].id]||-0.67);
  g.add(muzzle); g.userData.muzzle=muzzle;
  const flash=new THREE.Mesh(new THREE.ConeGeometry(0.11,0.26,7),
    new THREE.MeshBasicMaterial({color:0xffffff,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:0}));
  flash.rotation.x=-Math.PI/2; flash.position.copy(muzzle.position); flash.position.z-=0.1;
  g.add(flash); g.userData.flash=flash;
  g.visible=false; vmRoot.add(g);
  return g;
}
let vms=[];
function buildViewModels(){
  for(let i=0;i<vms.length;i++){ vmRoot.remove(vms[i]); }
  // one per weapon in the table
  vms=WEAPONS.map((w,i)=>buildVM(i));
  for(let i=0;i<vms.length;i++) vms[i].visible=(i===curW);
  vmRoot.traverse(o=>o.layers.set(VM_LAYER));
}
let vmRecoil=0, vmSwap=0, flashT=0;

buildViewModels();

function setFiring(down){ wantFire=!!down; if(down) shotBuf=0.22; }
function forceShot(){ fireCd=0; reloadT=0; fire(); }
function resetWeapons(){
  setLoadout(WEAPONS.map(w=>w.id));       // endless mode carries the full rack
  resetAmmo();
  curW=0;
  for(let k=0;k<vms.length;k++) vms[k].visible=(k===0);
}
function selectWeapon(i){
  if(i===curW||i<0||i>=WEAPONS.length||game.state!=='play') return;
  if(!owned[WEAPONS[i].id]) return;                 // not carrying it yet
  curW=i; reloadT=0; fireCd=Math.max(fireCd,0.16); vmSwap=1;
  for(let k=0;k<vms.length;k++) vms[k].visible=(k===i);
  SFX.reload(); hud.weapon=true;
}
function cycleWeapon(d){
  for(let n=1;n<=WEAPONS.length;n++){
    const i=(curW+d*n+WEAPONS.length*n)%WEAPONS.length;
    if(owned[WEAPONS[i].id]){ selectWeapon(i); return; }
  }
}

function startReload(){
  const w=WEAPONS[curW];
  if(reloadT>0||w.mag>=w.magSize||w.reserve<=0) return;
  reloadT=w.reload; SFX.reload(); hud.weapon=true;
}
function finishReload(){
  const w=WEAPONS[curW];
  const need=w.magSize-w.mag;
  const take=w.reserve===Infinity?need:Math.min(need,w.reserve);
  w.mag+=take;
  if(w.reserve!==Infinity) w.reserve-=take;
  hud.weapon=true;
}

function rangeScale(w,dist){
  if(!w.ffar||dist<=w.fnear) return 1;
  const t=clamp((dist-w.fnear)/(w.ffar-w.fnear),0,1);
  return lerp(1,w.fmin,t);
}

const _o=V3(),_d=V3(),_p=V3(),_e=V3(),_tmp=V3(),_dv=V3();
// where a shot meets an enemy: a sphere, or whatever shape a proxy says it is
function hitT(e,o,d){ return e.K.proxy&&PROXY[e.kind]?PROXY[e.kind].ray(e,o,d):raySphere(o,d,e.pos,e.rad); }
function shootRay(origin,dir,w,dmgMul){
  const wallT=rayWorld(origin,dir,300,!!w.pierce);
  const hits=[];
  for(let i=0;i<enemies.length;i++){
    const e=enemies[i]; if(e.dead) continue;
    const t=hitT(e,origin,dir);
    if(t>=0&&t<wallT) hits.push({t:t,e:e});
  }
  hits.sort((a,b)=>a.t-b.t);
  let endT=wallT, any=false;
  for(let i=0;i<hits.length;i++){
    const h=hits[i];
    _p.copy(dir).multiplyScalar(h.t).add(origin);
    const ct=h.e.K.proxy?-1:raySphere(origin,dir,h.e.pos,h.e.rad*0.42);
    const crit=ct>=0;
    if(h.e.K.proxy) PROXY[h.e.kind].ray(h.e,origin,dir);      // what this one hit, for its hit()
    const fall=rangeScale(w,h.t);
    damageEnemy(h.e,w.dmg*(dmgMul||1)*(crit?2.2:1)*fall,crit,_p,dir,fall,w.pierce);
    any=true;
    if(!w.pierce){ endT=h.t; break; }
  }
  if(!any||w.pierce){
    if(wallT<290){
      _p.copy(dir).multiplyScalar(wallT).add(origin);
      FX.burst(_p,5,0xbfe9ff,4.5,0.28,10,_dv.copy(dir).multiplyScalar(-1),0.55);
      // on a breach panel: an orange spark that says this needs something heavier
      for(const b of breaches){
        if(b.broken) continue; const c=b.col;
        if(_p.x>c.min.x-0.05&&_p.x<c.max.x+0.05&&_p.y>c.min.y-0.05&&_p.y<c.max.y+0.05&&_p.z>c.min.z-0.05&&_p.z<c.max.z+0.05){
          FX.ring(_p,0xff7a2a,1.1,0.2); break; }
      }
    }
  }
  return Math.min(endT,wallT<290?wallT:60);
}

function fire(){
  const w=WEAPONS[curW];
  if(reloadT>0||fireCd>0) return;
  if(w.mag<=0){ SFX.dry(); fireCd=0.25; startReload(); return; }
  w.mag--; fireCd=w.rate; hud.weapon=true;
  game.shots+=w.pellets;

  camera.getWorldDirection(_d);
  camera.getWorldPosition(_o);
  vms[curW].userData.muzzle.getWorldPosition(_e);

  if(w.tether){ fireTether(w); if(w.mag<=0) startReload(); return; }
  if(w.arc){ fireArc(w); if(w.mag<=0) startReload(); return; }
  if(w.sunder){ fireSunder(w); if(w.mag<=0) startReload(); return; }

  const spread=w.spread*(player.onGround?1:1.35)*(Math.hypot(player.vel.x,player.vel.z)>7?1.25:1);
  let far=0;
  for(let i=0;i<w.pellets;i++){
    _tmp.copy(_d);
    if(spread>0){
      _tmp.x+=rand(-spread,spread); _tmp.y+=rand(-spread,spread); _tmp.z+=rand(-spread,spread);
      _tmp.normalize();
    }
    const t=shootRay(_o,_tmp,w);
    far=Math.max(far,t);
    if(w.pellets>1||i===0){
      _p.copy(_tmp).multiplyScalar(t).add(_o);
      FX.tracer(_e,_p,w.color,w.tw,w.pellets>1?0.05:0.07);
    }
  }
  if(w.pierce){
    _p.copy(_d).multiplyScalar(far).add(_o);
    FX.tracer(_e,_p,0xffffff,w.tw*0.45,0.18);
  }

  // feedback
  player.kickV+=w.kick*8;
  player.shake=Math.min(0.6,player.shake+w.shake);
  player.yaw+=rand(-1,1)*w.kick*0.0016;
  player.pitch+=w.kick*0.0022;
  const light=w.id==='pulse';                // the pulse kicks less than everything else
  vmRecoil=Math.min(1,vmRecoil+(light?0.42:1));
  flashT=0.05;
  muzzleLight.color.setHex(w.color);
  muzzleLight.intensity=light?3.2:6.5;
  SFX[w.sfx]();
  FX.burst(_e,light?3:9,w.color,light?5:9,0.18,6,_d,0.75);

  // Scatter self-boost, once per airtime: unlimited, jump-boost-jump-boost
  // would climb as high as the ammunition lasted. A boost is spent off a
  // surface, and you get another when you touch one.
  if(w.id==='scatter'&&!player.onGround&&_d.y<-0.55&&player.boosts>0){
    player.boosts--;
    // strong enough that the boost clears a ledge a double jump cannot:
    // double jump tops out ~4.0 above the launch, this adds ~2.3 more
    player.vel.y=Math.min(player.vel.y+12,15);
    player.vel.x-=_d.x*3.6; player.vel.z-=_d.z*3.6;
  }
  if(w.mag<=0) startReload();
}

/* A bolt is a tracer broken into a few jittered segments, so it reads as
   something jumping rather than a beam. */
function bolt(a,b,color,width){
  const n=5; let px=a.x,py=a.y,pz=a.z;
  const L=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z), j=Math.min(0.9,L*0.07);
  for(let i=1;i<=n;i++){
    const f=i/n, last=i===n;
    const x=a.x+(b.x-a.x)*f+(last?0:rand(-j,j)), y=a.y+(b.y-a.y)*f+(last?0:rand(-j,j)),
          z=a.z+(b.z-a.z)*f+(last?0:rand(-j,j));
    _bA.set(px,py,pz); _bB.set(x,y,z);
    FX.tracer(_bA,_bB,color,width,0.12);
    px=x; py=y; pz=z;
  }
}
const _bA=V3(), _bB=V3(), _aF=V3(), _aD=V3();

/* The Sunder's charge: it flies to the first thing in line - body or wall - and
   bursts there. The burst hurts and throws everything within `blast` of it, and
   breaks any breach panel it touches. */
const _burstAt=V3(), _sk=V3();
/* A burst breaks a panel it can reach - not one behind a shutter or a wall it
   burst against. Clear to the panel's nearest point or its middle will do. */
const _bd=V3(), _bp=V3();
function burstReaches(c){
  for(const k of [0,1]){
    if(k===0) _bp.set(clamp(_burstAt.x,c.min.x,c.max.x),clamp(_burstAt.y,c.min.y,c.max.y),clamp(_burstAt.z,c.min.z,c.max.z));
    else _bp.set((c.min.x+c.max.x)/2,(c.min.y+c.max.y)/2,(c.min.z+c.max.z)/2);
    const len=_bd.subVectors(_bp,_burstAt).length();
    if(len<0.05) return true;
    _bd.multiplyScalar(1/len);
    const tb=rayBox(_burstAt,_bd,c);
    if(rayWorld(_burstAt,_bd,tb)>=tb-0.08) return true;
  }
  return false;
}
function fireSunder(w){
  const wallT=rayWorld(_o,_d,300);
  let t=Math.min(wallT,300), hit=null;
  // the surface of molten metal stops a charge as a floor would
  for(const h of moltens){
    if(h.off||Math.abs(_d.y)<1e-6) continue;
    const top=h.p[1]+h.s[1], th=(top-_o.y)/_d.y;
    if(th<=0||th>=t) continue;
    const hx=_o.x+_d.x*th, hz=_o.z+_d.z*th;
    if(Math.abs(hx-h.p[0])<=h.s[0]/2&&Math.abs(hz-h.p[2])<=h.s[2]/2) t=th;
  }
  for(const e of enemies){
    if(e.dead) continue;
    const et=hitT(e,_o,_d);
    if(et>=0&&et<t){ t=et; hit=e; }
  }
  if(hit&&hit.K.proxy) PROXY[hit.kind].ray(hit,_o,_d);
  _burstAt.copy(_d).multiplyScalar(Math.max(0,t-0.15)).add(_o);   // where it bursts
  // the shot, fat and orange, then the burst
  FX.tracer(_e,_burstAt,w.color,w.tw,0.12); FX.tracer(_e,_burstAt,0xffffff,w.tw*0.4,0.08);
  FX.ring(_burstAt,w.color,w.blast*2.2,0.35); FX.ring(_burstAt,0xffd0a0,w.blast*1.2,0.25);
  FX.burst(_burstAt,34,w.color,13,0.45,8); FX.burst(_burstAt,14,0xffe2c0,8,0.3,4);
  // A Bastion's shield takes the charge instead - on it, or bursting right
  // beside it: one hit of the three that break it, and nothing gets through.
  let turned=null;
  for(const e of enemies){
    if(e.dead||!e.K.proxy||!PROXY[e.kind].sunder) continue;
    if(PROXY[e.kind].sunder(e,_burstAt,e===hit)){ turned=e; break; }
  }
  if(!turned) for(const e of enemies){
    if(e.dead||!e.K.shieldHits) continue;
    if(e===hit||e.pos.distanceTo(_burstAt)-e.rad<1.8){ if(hitShield(e,_burstAt)) turned=e; break; }
  }
  // a direct hit gets no help from a plate either - it is a breaching charge
  if(hit&&hit!==turned) damageEnemy(hit,w.dmg,false,_burstAt,null,1,true);
  for(const e of enemies){
    if(e.dead||e===turned) continue;
    const d=e.pos.distanceTo(_burstAt)-e.rad;
    if(d>w.blast) continue;
    const f=1-Math.max(0,d)/w.blast;
    // no direction: a plate facing you is no help against a burst beside you
    damageEnemy(e,w.blastDmg*f,false,e.pos,null,f,false);
    _sk.copy(e.pos).sub(_burstAt).setY(0.4).normalize();
    e.vel.addScaledVector(_sk,10*f);
  }
  for(const b of breaches){
    if(b.broken) continue;
    const c=b.col;
    const dx=Math.max(c.min.x-_burstAt.x,0,_burstAt.x-c.max.x), dy=Math.max(c.min.y-_burstAt.y,0,_burstAt.y-c.max.y),
          dz=Math.max(c.min.z-_burstAt.z,0,_burstAt.z-c.max.z);
    if(Math.hypot(dx,dy,dz)<=1.2&&burstReaches(b.col)) b.breakIt(_burstAt);
  }
  player.kickV+=w.kick*8; player.shake=Math.min(0.7,player.shake+w.shake);
  player.pitch+=w.kick*0.003;
  vmRecoil=1; flashT=0.08;
  muzzleLight.color.setHex(w.color); muzzleLight.intensity=8;
  SFX.sunder();
}

/* A storm carries the Arc. A shot that passes through one powers every conduit
   inside it - walls, grates and all, since the storm is round it - so a conduit
   nobody can see is powered by waiting for a storm to cover it and shooting the
   storm. len is how far the shot travels before it meets something. */
const _sE=V3();
function stormConduct(len,w){
  for(const h of storms){
    if(!h.live) continue;
    const b=h.box;
    let t0=0, t1=len;
    for(const [o,d,lo,hi] of [[_o.x,_d.x,b.x0,b.x1],[_o.y,_d.y,b.y0,b.y1],[_o.z,_d.z,b.z0,b.z1]]){
      if(Math.abs(d)<1e-9){ if(o<lo||o>hi){ t0=1; t1=0; } continue; }
      let a=(lo-o)/d, c=(hi-o)/d; if(a>c){ const q=a; a=c; c=q; }
      t0=Math.max(t0,a); t1=Math.min(t1,c);
    }
    if(t0>t1) continue;
    _sE.copy(_d).multiplyScalar(t0+0.3).add(_o);          // where it enters the cloud
    let lit=0;
    for(const c of conduits){
      const p=c.pos;
      if(p.x<b.x0||p.x>b.x1||p.y<b.y0||p.y>b.y1||p.z<b.z0||p.z>b.z1) continue;
      bolt(_sE,p,w.color,w.tw*1.2); bolt(_sE,p,0xffffff,w.tw*0.5);
      c.power(); lit++;
    }
    if(lit){ FX.ring(_sE,w.color,5,0.35); }
  }
}

/* The chain. Whatever the aim meets first - enemy, pylon or conduit - takes the
   hit, then the arc jumps to the nearest thing it can see that it has not
   already touched. Enemies spend a hop and weaken the next jump; pylons spend
   nothing and reach further, so a line of them carries power as far as it
   runs. A conduit ends the chain - it is where the power was going - and only
   the gun or a pylon can power one: after an enemy the chain is just damage. */
function fireArc(w){
  SFX.pulse();
  player.kickV+=w.kick*8; player.shake=Math.min(0.6,player.shake+w.shake);
  vmRecoil=Math.min(1,vmRecoil+0.55);
  const wallT=rayWorld(_o,_d,ARC_RANGE);
  let first=null, ft=Math.min(wallT,ARC_RANGE);
  const consider=(obj,kind,pos,r)=>{
    const t=raySphere(_o,_d,pos,r);
    if(t>=0&&t<ft){ ft=t; first={obj,kind,pos}; }
  };
  for(const e of enemies) if(!e.dead) consider(e,'enemy',e.pos,e.rad+0.3);
  for(const p of pylons) consider(p,'pylon',p.pos,1.3);
  for(const c of conduits) consider(c,'conduit',c.pos,1.4);
  stormConduct(ft,w);
  if(!first){
    _p.copy(_d).multiplyScalar(ft).add(_o);
    bolt(_e,_p,w.color,w.tw);
    return;
  }
  const seen=new Set(); let cur=first, from=_aF.copy(_e), dmg=w.dmg, hops=0,
        grounded=first.kind==='enemy';
  for(let guard=0;guard<24&&cur;guard++){
    bolt(from,cur.pos,w.color,w.tw*(cur.kind==='pylon'?1.4:1));
    seen.add(cur.obj);
    if(cur.kind==='enemy'){
      _aD.copy(cur.pos).sub(from).normalize();
      if(cur.obj.K.proxy) cur.obj.part=null;      // (an arc meets no part of it: nothing a shot set)
      damageEnemy(cur.obj,dmg,false,cur.pos,_aD,1,false);
      hops++; dmg*=ARC_FADE;
    }else if(cur.kind==='pylon'){
      cur.obj.hit=0.4;
    }else{
      cur.obj.power();
      break;
    }
    if(hops>=ARC_HOPS) break;
    // the next link: nearest untouched thing in reach and in sight
    const reach=cur.kind==='pylon'?PYLON_HOP:ARC_HOP;
    let next=null, nd=Infinity;
    const offer=(obj,kind,pos,r)=>{
      if(seen.has(obj)) return;
      const d=pos.distanceTo(cur.pos);
      if(d>r||d>=nd) return;
      _aD.copy(pos).sub(cur.pos).multiplyScalar(1/d);
      if(rayWorld(cur.pos,_aD,d)<d-0.8) return;           // a wall in the way
      nd=d; next={obj,kind,pos};
    };
    // Power runs along the network: a pylon hands on to another pylon or a
    // conduit before it wastes itself on an enemy. Once the chain has gone
    // through an enemy it is only damage - a body does not carry power on.
    if(!grounded){
      for(const p of pylons)   offer(p,'pylon',p.pos,reach);
      for(const c of conduits) offer(c,'conduit',c.pos,reach);
    }
    if(!next) for(const e of enemies) if(!e.dead) offer(e,'enemy',e.pos,ARC_HOP);
    if(next&&next.kind==='enemy') grounded=true;
    from=_aF.copy(cur.pos); cur=next;
  }
}

/* The anchor the crosshair is currently on, or null. Same test the shot uses,
   so what lights up is exactly what a trigger pull would grab. */
function aimedAnchor(){
  camera.getWorldDirection(_d);
  camera.getWorldPosition(_o);
  const solid=rayWorld(_o,_d,TETHER_RANGE);
  let bestT=Infinity, best=null;
  for(const a of anchors){
    if(a.dead||a.off) continue;                    // cut by a Severer, or not powered yet
    _p.set(a.p[0],a.p[1],a.p[2]);
    const t=raySphere(_o,_d,_p,ANCHOR_RAD*1.6);   // a little forgiving to aim at
    if(t<0||t>TETHER_RANGE||t>solid||t>=bestT) continue;
    bestT=t; best=a;
  }
  return best;
}

/* An anchor beats an enemy at the same range: the level is built around the
   anchors, and grabbing a drone that drifted across one would drop the player
   down the shaft. */
function fireTether(w){
  const solid=rayWorld(_o,_d,TETHER_RANGE);
  let bestT=Infinity, best=null;
  for(const a of anchors){
    if(a.dead||a.off) continue;
    _p.set(a.p[0],a.p[1],a.p[2]);
    const t=raySphere(_o,_d,_p,ANCHOR_RAD);
    if(t<0||t>TETHER_RANGE||t>solid||t>=bestT) continue;
    bestT=t; best=a;
  }
  if(best){
    setGrapple(best.p); player.grapple.src=best;   // a moving anchor drags the line with it
    _p.set(best.p[0],best.p[1],best.p[2]);
    FX.tracer(_e,_p,w.color,w.tw,0.28);
    FX.ring(_p,w.color,2.2,0.4);
    SFX.waveUp();
    if(best.mesh) best.hit=0.35;
    return;
  }
  // no anchor: try to haul an enemy in
  let eT=Infinity, ent=null;
  for(const en of enemies){
    if(en.dead) continue;
    const t=raySphere(_o,_d,en.pos,en.rad+0.35);
    if(t<0||t>TETHER_RANGE||t>solid||t>=eT) continue;
    eT=t; ent=en;
  }
  _p.copy(_d).multiplyScalar(Math.min(solid,TETHER_RANGE)).add(_o);
  if(ent){
    _p.copy(ent.pos);
    // haul: fliers come easily, anything with its feet on the deck resists,
    // and an emplacement does not move at all
    _sv.subVectors(_o,ent.pos);
    const d=Math.max(1,_sv.length()); _sv.multiplyScalar(1/d);
    if(ent.K.proxy) ent.part=null;
    damageEnemy(ent,w.dmg,false,_p,_dv.copy(_sv).multiplyScalar(-1),1,false);
    const pull=ent.K.speed<=0?0:(ent.K.hover>0?15:8);
    if(pull>0){ ent.vel.x+=_sv.x*pull; ent.vel.z+=_sv.z*pull; }
    FX.burst(_p,7,w.color,7,0.2,6,_sv,0.7);
  }
  FX.tracer(_e,_p,w.color,w.tw*0.7,0.16);
  SFX.pulse();
}

function updateWeapon(dt){
  if(anchors.length){
    const lit=WEAPONS[curW].tether?aimedAnchor():null;
    for(const a of anchors) a.aim=(a===lit);
  }
  if(fireCd>0) fireCd-=dt;
  if(reloadT>0){ reloadT-=dt; if(reloadT<=0){ finishReload(); reloadT=0; } }
  const w=WEAPONS[curW];
  if(shotBuf>0) shotBuf-=dt;
  if(fireCd<=0&&reloadT<=0&&((w.auto&&wantFire)||(!w.auto&&shotBuf>0))){ shotBuf=0; fire(); }

  // view model animation
  vmRecoil=Math.max(0,vmRecoil-dt*(w.id==='pulse'?9:5.5));
  vmSwap=Math.max(0,vmSwap-dt*4.5);
  const spd=Math.hypot(player.vel.x,player.vel.z);
  const swayT=player.bob;
  const g=vms[curW];
  g.position.set(
    Math.sin(swayT*0.5)*0.014*player.bobAmt - player.roll*0.6,
    Math.abs(Math.cos(swayT*0.5))*0.012*player.bobAmt - vmSwap*0.28 - clamp(player.vel.y*0.004,-0.05,0.05),
    vmRecoil*(w.id==='rail'?0.20:0.11)
  );
  g.rotation.set(-vmRecoil*0.30-vmSwap*0.7, vmSwap*0.5, vmRecoil*0.05);
  if(reloadT>0){
    const f=1-Math.abs(reloadT/WEAPONS[curW].reload-0.5)*2;
    g.position.y-=f*0.22; g.rotation.x-=f*0.9; g.rotation.z=f*0.5;
  }
  if(flashT>0){
    flashT-=dt;
    const f=Math.max(0,flashT/0.05);
    g.userData.flash.material.opacity=f;
    g.userData.flash.scale.set(1+rand(0,0.5),1+rand(0,0.8),1);
    g.userData.flash.rotation.z=rand(0,6.28);
    muzzleLight.intensity*=Math.pow(0.0006,dt);
  }else{
    g.userData.flash.material.opacity=0;
    muzzleLight.intensity=0;
  }
  // dynamic crosshair
  const sp=4+ (WEAPONS[curW].spread*260) + spd*0.35 + vmRecoil*10 + (player.onGround?0:3);
  crossEl.style.setProperty('--sp',sp.toFixed(1)+'px');
}

export {owned, resetAmmo, hasWeapon, weaponIndex, setLoadout, grantWeapon, selectFirstOwned, setFiring, forceShot, resetWeapons, WEAPONS, curW, fireCd, reloadT, wantFire, shotBuf, vmRoot, vmHullMat, buildVM, vms, buildViewModels, vmRecoil, vmSwap, flashT, selectWeapon, cycleWeapon, startReload, finishReload, rangeScale, _o, _d, _p, _e, _tmp, _dv, shootRay, fire, updateWeapon, fireTether, aimedAnchor, TETHER_RANGE, ANCHOR_RAD};
