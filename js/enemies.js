import {THREE,V3,clamp,lerp,rand,T2} from './util.js';
import {game,enemies,bullets,conduits,anchors,breaches,holes,voids,levelFlags} from './state.js';
import {scene} from './render.js';
import {sprite} from './textures.js';
import {hullMat,enemyModel} from './models.js';
import {LOADED,fitObject,dressMaterial} from './assets.js';
import {colliders,HALF,WALLH,BOUNDS,ENEMY_BOXES,FLOOR_Y,groundAt,hasGroundAt,hasGroundBelow,rayWorld,pointSolid} from './world.js';
import {player,damagePlayer,playerCenter,_pc,releaseGrapple,EYE} from './player.js';
import {dropPickup} from './pickups.js';
import {SFX} from './audio.js';
import {FX,explode} from './fx.js';
import {hud} from './hud.js';

/* Enemy types, steering, damage and their projectiles. */

const KIND={
  drone:{hp:48,rad:0.8,speed:10.5,accel:30,range:13,hover:2.6,score:100,color:0x5df0ff,
    fire:1.45,burst:1,bullet:{spd:31,dmg:11,r:0.24,color:0x5df0ff},spread:0.05,lead:0.7,drop:0.30},
  rusher:{hp:36,rad:0.75,speed:16.5,accel:40,range:0,hover:1.2,score:130,color:0xff3fa4,
    contact:26,suicide:true,drop:0.22},
  sentinel:{hp:210,rad:1.3,speed:6.2,accel:18,range:19,hover:3.6,score:340,color:0xffc24d,
    fire:2.3,burst:3,bullet:{spd:25,dmg:15,r:0.38,color:0xffc24d},spread:0.03,lead:1.0,drop:0.85},
  warden:{hp:1100,rad:2.7,speed:8.4,accel:20,range:16,hover:4.4,score:3000,color:0xff3fa4,boss:'WARDEN',
    fire:2.5,burst:1,bullet:{spd:22,dmg:17,r:0.45,color:0xff3fa4},spread:0.04,lead:0.9,drop:1},

  // shootable switch: harmless, static, and something has to reach it
  node:{hp:30,rad:0.7,speed:0,accel:0,range:0,hover:0,score:0,color:0xffc24d,
    fixed:true,drop:0},

  // static emplacement: no movement, so the geometry around it is the puzzle
  turret:{hp:150,rad:1.15,speed:0,accel:0,range:26,hover:0,score:260,color:0xff3fa4,
    fixed:true,fire:1.9,burst:4,bullet:{spd:34,dmg:9,r:0.22,color:0xff3fa4},spread:0.016,lead:1.35,drop:0.5},

  // long-range beam: charges, telegraphs, then hits hard. Punishes standing still.
  lancer:{hp:120,rad:1.05,speed:5.5,accel:14,range:30,hover:3.8,score:320,color:0x9d5eff,
    beam:{dmg:34,charge:1.5},fire:3.4,drop:0.6},

  // swarm: individually trivial, collectively a wall of contact damage. The
  // answer is the Scatter, which is why it arrives in the level that hands it
  // a room full of them.
  mite:{hp:20,rad:0.46,speed:19.5,accel:52,range:0,hover:1.0,score:60,color:0xff6a3d,
    contact:7,bite:0.9,drop:0.10},

  // support: everything inside its weave takes a fraction of the damage. It
  // never has to be the biggest thing in the room to change how the room is
  // fought - it just has to be killed first.
  weaver:{hp:430,rad:1.6,speed:7.2,accel:18,range:21,hover:4.2,score:900,color:0x4de0b0,
    weave:{r:26,cut:0.88},
    fire:2.8,burst:2,bullet:{spd:24,dmg:13,r:0.32,color:0x4de0b0},spread:0.035,lead:0.9,drop:0.9},

  // undoes: seeks out whatever you have powered and drains it. `drainer` is how
  // long it takes to put a conduit out; it still shoots when there is nothing
  // to drain, so an empty room with a Coil in it is still a fight.
  coil:{hp:170,rad:1.1,speed:7.2,accel:16,range:14,hover:3.4,score:420,color:0xb58cff,
    drainer:0.5,fire:2.2,burst:1,bullet:{spd:22,dmg:10,r:0.3,color:0xb58cff},spread:0.05,lead:0.8,drop:0.6},
  // contests the tether: shuts down the anchor you are about to need, and cuts
  // the line if it can see it while you are on it. An anchor it shut comes back
  // when it dies - so, like the Coil, the answer is to kill it first.
  severer:{hp:140,rad:1.0,speed:11,accel:26,range:16,hover:3.6,score:450,color:0xff4436,
    severs:{anchorR:14,lineR:16,kill:0.5,cut:0.5},
    fire:2.1,burst:2,bullet:{spd:28,dmg:9,r:0.26,color:0xff4436},spread:0.045,lead:0.9,drop:0.6},
  // Act II's boss: a generator that cannot be hurt while its shield is up. A
  // conduit powered near it discharges into it and drops the shield for a few
  // seconds; the Coils it calls go for those conduits first.
  dynamo:{hp:3200,rad:2.9,speed:4.2,accel:9,range:20,hover:8,score:6000,color:0xb58cff,boss:'DYNAMO',
    shielded:true,summon:{kind:'coil',n:2,every:15},
    // lightning: a ring under your feet, and a second later the strike - nowhere
    // is safe to stand still, a ledge least of all
    strike:{every:3.4,warn:1.1,r:2.8,dmg:24},
    fire:1.7,burst:3,bullet:{spd:24,dmg:12,r:0.42,color:0xb58cff},spread:0.05,lead:0.9,drop:1},
  // Act III's heavy: wades the molten pool behind a shield that turns away
  // every round. Three Sunder hits break it, cracking further with each; then
  // it reels, open to everything, until it pours itself a new one out of the
  // metal. It lobs molten shot that covers whatever platform you stand on, so
  // you can never stay on one.
  bastion:{hp:4000,rad:4.6,speed:4.4,accel:9,range:22,hover:5.6,score:5000,color:0xff8a3a,boss:'BASTION',
    shieldHits:{hits:3,down:4.2,rebuild:1.2},turn:0.9,
    lob:{every:2.8,warn:1.6,r:3,dmg:40},drop:1},
  bulwark:{hp:240,rad:1.5,speed:6.8,accel:20,range:9,hover:2.4,score:380,color:0x5df0ff,
    shield:0.25,turn:1.1,fire:2.0,burst:2,bullet:{spd:26,dmg:14,r:0.3,color:0x5df0ff},spread:0.028,lead:1.1,drop:0.8},
  // 3-3's last boss, in two bodies: the Authority's own, hauled up the Well to
  // the crown, and its eye once it is torn loose. Each is drawn and run by its
  // own module (`proxy`): what is hit, how, and what it does - this is only
  // the record the fight, the boss bar and the guns see.
  authority:{hp:3700,rad:6,speed:0,accel:0,range:0,hover:0,score:12000,color:0xff3fa4,boss:'AUTHORITY',
    fixed:true,proxy:true,drop:1},
  eye:{hp:1600,rad:4,speed:0,accel:0,range:0,hover:0,score:15000,color:0xffae2a,boss:'THE EYE',
    fixed:true,proxy:true,drop:1}
};
/* What runs a `proxy` kind, filled in by its module: bind(e) as it is made,
   update(e,dt), ray(e,o,d) -> distance or -1 (and what it hit, kept on e),
   hit(e,dmg,at,dir,pierce) -> the damage that gets through, sunder(e,at) ->
   true if a charge was taken by its armour, strike(e,k) for the eye's
   lightning, and gone(e) as it is taken away. */
const PROXY={};
const GEO={
  core:new THREE.SphereGeometry(1,10,8),
  ring:new THREE.TorusGeometry(1,0.07,6,18)
};

/* nearY is the height the spawn was authored at. Without it the ground search
   only looks near y=0, so anything spawned on a raised floor - a foundry, a
   catwalk - resolves to the ground under the level and hovers there. */
function spawnY(K,x,z,nearY){
  const top=nearY===undefined?3:nearY+2.5;
  // over nothing, spawn at the height it was asked for rather than under the level
  if(!hasGroundBelow(x,z,top)) return (nearY===undefined?0:nearY)+K.hover;
  return K.hover+groundAt(x,z,top);
}
function makeEnemy(kind,x,z,fixedY,faceYaw,nearY){
  const K=KIND[kind];
  const e={
    kind:kind,K:K,dead:false,rad:K.rad,
    hp:Math.round(K.hp*(kind==='warden'?(0.55+game.wave*0.12):(0.75+game.wave*0.09))),
    pos:V3(x,fixedY!==undefined?fixedY:spawnY(K,x,z,nearY),z),vel:V3(),
    fireT:rand(0.6,1.8),burst:0,burstT:0,strafe:Math.random()<0.5?1:-1,strafeT:rand(1,2.6),
    hitT:0,spin:rand(0,6.28),bob:rand(0,6.28),phase:0,spiral:0,summoned:0,
    charge:0,beamT:0,face:faceYaw,
    mesh:new THREE.Group()
  };
  e.maxHp=e.hp;
  e.flashMats=[]; e.flashBase=[];
  if(K.proxy){
    e.mesh.position.copy(e.pos); scene.add(e.mesh); e.visR=K.rad; e.lead=1;
    enemies.push(e); game.alive++;
    if(PROXY[kind]) PROXY[kind].bind(e);
    return e;
  }
  if(LOADED[kind]){
    const obj=LOADED[kind].clone(true);
    obj.traverse(o=>{
      if(!o.isMesh) return;
      o.castShadow=true;
      o.material=o.material.clone();
      dressMaterial(o.material);
      if(o.material.emissive&&o.material.emissive.getHex()===0){
        o.material.emissive=new THREE.Color(K.color);
        o.material.emissiveIntensity=0.10;
      }
      e.flashMats.push(o.material);
      e.flashBase.push(o.material.emissiveIntensity===undefined?0:o.material.emissiveIntensity);
    });
    e.fit=fitObject(obj,K.rad*1.06,true);
    e.body=obj; e.mesh.add(obj);
  }else{
    const M=enemyModel(kind);
    const bm=hullMat.clone();
    bm.emissive=new THREE.Color(K.color); bm.emissiveIntensity=0.10;
    const fit=K.rad/(M.radius||1)*1.06;   // visual silhouette matches the hitbox
    e.fit=fit;
    const body=new THREE.Mesh(M.hull,bm);
    body.scale.setScalar(fit);
    body.castShadow=true;
    e.body=body; e.mesh.add(body);
    e.flashMats.push(bm); e.flashBase.push(0.10);
    const gm=new THREE.Mesh(M.glow,new THREE.MeshBasicMaterial({vertexColors:true}));
    gm.scale.setScalar(fit);
    e.glowMesh=gm; e.mesh.add(gm);
  }
  const core=new THREE.Mesh(GEO.core,new THREE.MeshBasicMaterial({color:0xffffff}));
  core.scale.setScalar(K.rad*0.2); e.mesh.add(core); e.core=core;
  const gl=sprite(K.color,K.rad*2.1,0.30); e.mesh.add(gl); e.glow=gl;
  if(kind!=='rusher'){
    const r=new THREE.Mesh(GEO.ring,new THREE.MeshBasicMaterial({color:K.color}));
    r.scale.setScalar(K.rad*1.0); e.mesh.add(r); e.ring=r;
  }
  if(K.shielded){
    // the shield is a shell you can see, and it goes when the shield does
    const sm=new THREE.MeshBasicMaterial({color:K.color,transparent:true,opacity:0.18,
      depthWrite:false,blending:THREE.AdditiveBlending});
    const sh=new THREE.Mesh(new THREE.SphereGeometry(K.rad*1.45,24,16),sm);
    e.mesh.add(sh); e.shell=sh; e.exposed=0; e.sumT=(K.summon?K.summon.every*0.6:0);
  }
  if(K.shieldHits) buildShield(e);
  if(kind==='warden'){
    const r2=new THREE.Mesh(GEO.ring,new THREE.MeshBasicMaterial({color:0xffc24d}));
    r2.scale.setScalar(K.rad*0.78); r2.rotation.x=1.2; e.mesh.add(r2); e.ring2=r2;
  }
  e.mesh.position.copy(e.pos);
  e.visR=visualRadius(e.mesh)*1.10;   // margin so nothing grazes a surface
  scene.add(e.mesh);
  // how well this one reads your movement - a squad should not all miss the
  // same way, or you learn one dodge and it works on all of them
  e.lead=rand(0.45,1.3)*(K.lead!==undefined?K.lead:1);
  enemies.push(e);
  // a conduit node is a shootable fixture, not a hostile - counting it leaves
  // the player hunting a threat that does not exist
  if(kind!=='node') game.alive++;
  return e;
}

// widest drawn geometry, measured from the enemy's own origin. Sprites are
// billboards and excluded; rings and any loaded glTF child are included.
const _vrSph=new THREE.Sphere(), _vrInv=new THREE.Matrix4();
function visualRadius(root){
  root.updateMatrixWorld(true);
  _vrInv.copy(root.matrixWorld).invert();
  let r=0;
  root.traverse(o=>{
    if(!o.isMesh||!o.geometry) return;
    if(!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    if(!o.geometry.boundingSphere) return;
    // through the full parent chain, then back into the enemy's own space -
    // a loaded glTF nests its meshes under a scaled root, so local scale alone lies
    _vrSph.copy(o.geometry.boundingSphere);
    _vrSph.applyMatrix4(o.matrixWorld);
    _vrSph.applyMatrix4(_vrInv);
    r=Math.max(r,_vrSph.center.length()+_vrSph.radius);
  });
  return r;
}

const _to=V3(),_side=V3(),_sep=V3(),_edv=V3(),_aim=V3(),_sh=V3();
function pushOutSolids(e){
  const r=e.visR;   // measured silhouette, so rings stay clear of walls
  for(let i=0;i<colliders.length;i++){
    const c=colliders[i];
    // the arena's ground slab
    if(c.ground) continue;
    if(e.pos.y+e.rad*0.5<c.min.y||e.pos.y-e.rad*0.5>c.max.y) continue;
    if(e.pos.x+r<c.min.x||e.pos.x-r>c.max.x||e.pos.z+r<c.min.z||e.pos.z-r>c.max.z) continue;
    const dxL=e.pos.x+r-c.min.x, dxR=c.max.x-(e.pos.x-r);
    const dzL=e.pos.z+r-c.min.z, dzR=c.max.z-(e.pos.z-r);
    const m=Math.min(dxL,dxR,dzL,dzR);
    // Under a ceiling it has risen into, it goes back down: out sideways by
    // the shortest way could throw it through a wall, out of reach. (Only
    // down: up would lift things over the walls holding them in.) Not a boss,
    // which the level sends up through floors on purpose.
    if(e.pos.y<c.min.y&&!e.K.boss){
      const dyB=e.pos.y+e.rad*0.5-c.min.y;
      if(dyB<m){ e.pos.y=c.min.y-e.rad*0.5; if(e.vel.y>0) e.vel.y=0; continue; }
    }
    if(m===dxL){ e.pos.x=c.min.x-r; if(e.vel.x>0) e.vel.x=0; }
    else if(m===dxR){ e.pos.x=c.max.x+r; if(e.vel.x<0) e.vel.x=0; }
    else if(m===dzL){ e.pos.z=c.min.z-r; if(e.vel.z>0) e.vel.z=0; }
    else { e.pos.z=c.max.z+r; if(e.vel.z<0) e.vel.z=0; }
  }
}

/* The nearest live conduit a Coil can see and go and drain. It has to see it,
   or it would press itself against a wall trying to reach one beyond. */
function nearestPowered(p){
  let best=null, bd=70*70;
  for(const c of conduits){
    if(!c.powered||c.fed) continue;          // fed: nothing to drain
    const d2=(c.p[0]-p.x)**2+(c.p[2]-p.z)**2;
    if(d2>=bd) continue;
    _cv.set(c.p[0]-p.x,c.p[1]-p.y,c.p[2]-p.z);
    const d=_cv.length(); if(d<0.01){ bd=d2; best=c; continue; }
    _cv.multiplyScalar(1/d);
    // through grates: a caged conduit is still drained - the cage keeps your
    // shots out, not a Coil's beam
    if(rayWorld(p,_cv,d,true)<d-1.5) continue;
    bd=d2; best=c;
  }
  return best;
}
const _cv=V3();

/* What a Severer is going after: the tether line if the player is on one and
   it is near enough, otherwise the live anchor nearest the player - the one
   they are about to need. Job objects live on the enemy so nothing is
   allocated per frame. */
const _sa=V3(), _sb=V3(), _sp=V3();
function severJob(e){
  const S=e.K.severs;
  if(player.grapple){
    _sa.set(player.pos.x,player.pos.y+EYE*0.72,player.pos.z);
    _sb.set(player.grapple.x,player.grapple.y,player.grapple.z);
    _sp.subVectors(_sb,_sa);
    const L2=_sp.lengthSq()||1;
    const t=clamp(((e.pos.x-_sa.x)*_sp.x+(e.pos.y-_sa.y)*_sp.y+(e.pos.z-_sa.z)*_sp.z)/L2,0,1);
    const j=e.jobL||(e.jobL={kind:'line',pt:V3(),key:'line'});
    j.pt.copy(_sp).multiplyScalar(t).add(_sa);
    if(j.pt.distanceTo(e.pos)<S.lineR*1.4) return j;
  }
  // Holding: sit between the anchor and the player, where it can be shot.
  if(e.holds){
    let a=null, bd=Infinity;
    for(const q of anchors){
      if(q.hold!==e.holds) continue;
      const dp=Math.hypot(q.p[0]-player.pos.x,q.p[2]-player.pos.z);
      if(dp<bd){ bd=dp; a=q; }
    }
    if(!a) return null;
    const j=e.jobH||(e.jobH={kind:'hold',pt:V3(),key:'hold',a:null});
    const dx=player.pos.x-a.p[0], dz=player.pos.z-a.p[2], d=Math.hypot(dx,dz)||1, k=Math.min(7,d*0.5)/d;
    j.a=a; j.pt.set(a.p[0]+dx*k,a.p[1],a.p[2]+dz*k);
    return j;
  }
  // Otherwise only an anchor the player could use from where they are: one out
  // of their sight would hide the Severer up there with it, out of reach.
  let a=e.sevA;
  if(a&&(a.dead||!grabbable(a))) a=null;
  if(!a){
    let bd=Infinity;
    for(const q of anchors){
      if(q.dead) continue;
      const dp=Math.hypot(q.p[0]-player.pos.x,q.p[1]-player.pos.y,q.p[2]-player.pos.z);
      if(dp>=bd||!grabbable(q)) continue;
      bd=dp; a=q;
    }
  }
  e.sevA=a;
  if(!a) return null;
  const j=e.jobA||(e.jobA={kind:'anchor',pt:V3(),key:null,a:null});
  j.a=a; j.key=a; j.pt.set(a.p[0],a.p[1],a.p[2]);
  return j;
}
/* In tether range of where the player is, and in sight standing or jumping. */
const _ga=V3(), _gd=V3();
function grabbable(q){
  for(const lift of [EYE,EYE+5.9]){
    _ga.set(player.pos.x,player.pos.y+lift,player.pos.z);
    _gd.set(q.p[0]-_ga.x,q.p[1]-_ga.y,q.p[2]-_ga.z);
    const d=_gd.length(); if(d>36) continue;
    _gd.multiplyScalar(1/d);
    if(rayWorld(_ga,_gd,d)>=d-0.9) return true;
  }
  return false;
}
/* The cut itself: a beam that thickens while it charges, from as close as the
   Severer can get with a clear line. Moving out of reach, or breaking the line
   of sight, bleeds the charge off rather than resetting it. */
function updateSever(e,dt){
  const S=e.K.severs, j=e.job;
  // the hold is a beam you can see, so a dark anchor always says who has it
  if(e.holds) for(const a of anchors) if(a.hold===e.holds){
    _sb.set(a.p[0],a.p[1],a.p[2]);
    FX.tracer(e.pos,_sb,e.K.color,0.03+Math.sin(game.time*9)*0.01,0.05);
  }
  if(!j||j.kind==='hold'){ e.sevT=0; return; }
  _sp.subVectors(j.pt,e.pos);
  const d=_sp.length()||0.001;
  const reach=j.kind==='line'?S.lineR:S.anchorR;
  _sp.multiplyScalar(1/d);
  if(d>reach||rayWorld(e.pos,_sp,d)<d-0.9){ e.sevT=Math.max(0,(e.sevT||0)-dt*2); return; }
  if(e.sevKey!==j.key){ e.sevKey=j.key; e.sevT=0; }
  const need=j.kind==='line'?S.cut:S.kill;
  e.sevT=(e.sevT||0)+dt;
  const k=Math.min(1,e.sevT/need);
  FX.tracer(e.pos,j.pt,e.K.color,0.02+0.07*k,0.05);
  if(j.kind==='anchor') j.a.threat=Math.max(j.a.threat||0,k);
  if(e.sevT<need) return;
  e.sevT=0;
  FX.tracer(e.pos,j.pt,0xffd0c8,0.14,0.2);
  FX.burst(j.pt,16,e.K.color,8,0.3,6);
  SFX.rail();
  if(j.kind==='line') releaseGrapple(false);
  else killAnchor(j.a,e);
}
/* An anchor a Severer has cut is dark and cannot be grabbed until that Severer
   dies. Anyone on the line to it when it goes comes off. */
function killAnchor(a,by){
  a.dead=true; a.by=by; a.threat=0;
  if(player.grapple&&player.grapple.x===a.p[0]&&player.grapple.y===a.p[1]&&player.grapple.z===a.p[2])
    releaseGrapple(false);
}
function reviveAnchors(by){
  for(const a of anchors){
    if(!a.dead||(by&&a.by!==by)) continue;
    a.dead=false; a.by=null; a.hit=0.6;
    FX.ring(V3(a.p[0],a.p[1],a.p[2]),0x8dff6a,3,0.5);
  }
}

/* Aim wanders shot to shot. Everything firing at where you stand right now is
   one dodge for the whole game - strafing sideways beats every shot in it. So
   each shooter has its own habit of leading, and each shot varies around that:
   some cut across your path, some trail behind you, some are dead on. */
function enemyShoot(e,dirOverride,spdMul){
  const B=e.K.bullet; if(!B) return;
  playerCenter(_aim);
  const dist=_aim.distanceTo(e.pos);
  const speed=B.spd*(spdMul||1);
  const flight=dist/Math.max(4,speed);
  const lead=(e.lead||0.75)*rand(0.3,1.55);
  _aim.x+=player.vel.x*flight*lead;
  _aim.z+=player.vel.z*flight*lead;
  _sh.copy(_aim).sub(e.pos).normalize();
  _sh.y+=0.02;
  const sp=e.K.spread!==undefined?e.K.spread:0.03;
  _sh.x+=rand(-sp,sp); _sh.y+=rand(-sp,sp)*0.6; _sh.z+=rand(-sp,sp);
  _sh.normalize();
  const d=dirOverride?dirOverride.clone().normalize():_sh;
  spawnBullet(e.pos,d,B,spdMul||1);
  FX.burst(e.pos,4,B.color,5,0.2,2,d,0.8);
  SFX.ezap();
  if(dist>0) e.vel.addScaledVector(d,-1.2);
}

/* The weave, drawn. Redrawn on a slow beat rather than every frame: the links
   only have to say which enemies are covered, and a full-rate line to every
   member of a swarm is a screenful of rope.

   One line per shielded enemy, to the weaver that is actually shielding it -
   the same one damageEnemy asks weaverOver for. One line is also the
   instruction: that is the one to kill.

   And only for an enemy the player is near enough to be fighting. The line
   answers "why is this thing not taking damage", which nobody asks about a dot
   at the far end of a long hall. */
const LINK_SHOW=50, LINK_SHOW2=LINK_SHOW*LINK_SHOW, LINK_MAX=12;
let weaveDraw=0;
function drawWeaves(dt){
  weaveDraw-=dt;
  if(weaveDraw>0) return;
  weaveDraw=0.14;
  playerCenter(_pc);
  let drawn=0;
  for(let j=0;j<enemies.length&&drawn<LINK_MAX;j++){
    const e=enemies[j];
    if(e.dead||e.K.weave||e.stormT>0) continue;
    const px=_pc.x-e.pos.x, py=_pc.y-e.pos.y, pz=_pc.z-e.pos.z;
    if(px*px+py*py+pz*pz>LINK_SHOW2) continue;
    const w=weaverOver(e);
    if(!w) continue;
    FX.tracer(w.pos,e.pos,w.K.color,w.weaveT>0?0.045:0.025,0.16);
    drawn++;
  }
  for(let i=0;i<enemies.length;i++){
    const w=enemies[i];
    if(w.K.weave&&w.weaveT>0) w.weaveT-=0.14;
  }
}

/* Lightning strikes. A boss with K.strike marks the ground under the player
   with a ring, which fills as the strike comes; then a fork comes down on it.
   Anyone still inside takes the hit. */
const strikes=[];
let strikeTold=false;
// once per level, not once per session
function resetTold(){ strikeTold=false; }
// something else has already said it - the Gaze's own brief: a boss's first
// ring mustn't stop the fight to say it again
function strikesTold(){ strikeTold=true; }
// what else a landed strike does, for the level to say (floor plates crack)
let strikeHook=null;
function setStrikeHook(f){ strikeHook=f; }
const STRIKE_C=0xe6dcff;
let _rgeo=null, _dgeo=null;
// `at`: somewhere other than under the player - the Gaze striking what it was told to
function callStrike(e,quiet,at){
  const S=e.strikeK||e.K.strike;
  const px=at?at[0]:player.pos.x, pz=at?at[2]:player.pos.z;
  const y=at?at[1]:player.onGround?player.pos.y:groundAt(player.pos.x,player.pos.z,player.pos.y+0.5);
  if(!_rgeo){ _rgeo=new THREE.RingGeometry(0.86,1,40); _dgeo=new THREE.CircleGeometry(1,40); }
  const ringM=new THREE.MeshBasicMaterial({color:STRIKE_C,transparent:true,opacity:0.8,depthWrite:false,
    side:THREE.DoubleSide,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4});
  const discM=ringM.clone(); discM.opacity=0.25;
  const ring=new THREE.Mesh(_rgeo,ringM), disc=new THREE.Mesh(_dgeo,discM);
  for(const m of [ring,disc]){ m.rotation.x=-Math.PI/2; m.position.set(px,y+0.04,pz); scene.add(m); }
  ring.scale.setScalar(S.r); disc.scale.setScalar(0.01);
  strikes.push({x:px,y,z:pz,t:0,S,ring,disc,from:e});
  // the Gaze's has its own charge: the whine is lost under the light
  if(quiet) SFX.charge(S.warn); else SFX.strikeWarn(S.warn);
  // the first time, say what the ring means - in a briefing, which stops the
  // fight: a banner mid-fight goes unread (the Gaze says its own piece the
  // first time it locks on, and is quiet here)
  if(!strikeTold&&!quiet){ strikeTold=true; hud.brief('LIGHTNING','The ring under you is struck a moment later.'); }
}
/* Molten shot: the same ring on the ground, filling as the shot comes, but the
   shot is a glob you can watch arc in from the Bastion - and it is aimed where
   you are heading, so standing still and running straight both get hit. */
const LOB_C=0xff8a3a;
let _gGeo=null, _domeGeo=null;
/* The platform under the player, if they are on (or just above) one: a
   collider under their feet with a small footprint. */
function platformUnder(){
  let best=null;
  for(const c of colliders){
    if(c.bed||c.grate||c.wide) continue;    // a floor, not a platform
    if(player.pos.x<=c.min.x||player.pos.x>=c.max.x||player.pos.z<=c.min.z||player.pos.z>=c.max.z) continue;
    if(c.max.y>player.pos.y+0.3||c.max.y<player.pos.y-4) continue;
    if((c.max.x-c.min.x)*(c.max.z-c.min.z)>400) continue;
    if(!best||c.max.y>best.max.y) best=c;
  }
  return best;
}
function callLob(e){
  const S=e.K.lob;
  let tx,tz,y,r=S.r;
  // On a platform, the shot covers the whole of it: you cannot dodge it by
  // stepping to the far edge, only by leaving. In the air, it goes where you
  // are heading.
  const plat=platformUnder();
  if(plat){
    tx=(plat.min.x+plat.max.x)/2; tz=(plat.min.z+plat.max.z)/2; y=plat.max.y;
    // over a double jump from its far corner too: on a platform there is no
    // dodging it but leaving
    r=Math.hypot(plat.max.x-plat.min.x,plat.max.z-plat.min.z)/2+3;
  }else{
    const lead=rand(0.4,1.0)*S.warn;
    tx=player.pos.x+player.vel.x*lead; tz=player.pos.z+player.vel.z*lead;
    y=groundAt(tx,tz,player.pos.y+1.5);
  }
  if(!_rgeo){ _rgeo=new THREE.RingGeometry(0.86,1,40); _dgeo=new THREE.CircleGeometry(1,40); }
  if(!_gGeo) _gGeo=new THREE.SphereGeometry(0.55,10,8);
  const ringM=new THREE.MeshBasicMaterial({color:LOB_C,transparent:true,opacity:0.8,depthWrite:false,
    side:THREE.DoubleSide,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4});
  const discM=ringM.clone(); discM.opacity=0.25;
  const ring=new THREE.Mesh(_rgeo,ringM), disc=new THREE.Mesh(_dgeo,discM);
  for(const m of [ring,disc]){ m.rotation.x=-Math.PI/2; m.position.set(tx,y+0.04,tz); scene.add(m); }
  ring.scale.setScalar(r); disc.scale.setScalar(0.01);
  const glob=new THREE.Mesh(_gGeo,new THREE.MeshBasicMaterial({color:0xffb060}));
  glob.add(sprite(LOB_C,3.2,0.8)); glob.position.copy(e.pos); scene.add(glob);
  // the blast is a dome, not a disc: jumping on the spot does not clear it
  if(!_domeGeo) _domeGeo=new THREE.SphereGeometry(1,32,12,0,T2,0,Math.PI/2);
  const dome=new THREE.Mesh(_domeGeo,new THREE.MeshBasicMaterial({color:LOB_C,transparent:true,opacity:0.06,
    depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));
  dome.position.set(tx,y,tz); dome.scale.setScalar(r); scene.add(dome);
  strikes.push({x:tx,y,z:tz,t:0,S,r,ring,disc,from:e,glob,dome,ox:e.pos.x,oy:e.pos.y+1.5,oz:e.pos.z});
  FX.burst(e.pos,10,LOB_C,6,0.3,4); SFX.strikeWarn(S.warn);
}
const _s1=V3(), _s2=V3(), _s3=V3(), _s4=V3();
function updateStrikes(dt){
  for(let i=strikes.length-1;i>=0;i--){
    const k=strikes[i]; k.t+=dt;
    const f=Math.min(1,k.t/k.S.warn);
    k.disc.scale.setScalar(Math.max(0.01,(k.r||k.S.r)*f));
    k.ring.material.opacity=0.55+0.4*Math.sin(k.t*30);
    if(k.glob){
      if(k.hit){
        // the blast: the dome flashes and swells, then goes
        const g=(k.t-k.S.warn)/0.3;
        k.dome.scale.setScalar(k.r*(1+g*0.15)); k.dome.material.opacity=0.5*(1-g);
        if(g>=1) killStrike(i);
        continue;
      }
      // up and over: a parabola from the Bastion to the ring, the dome filling in
      k.glob.position.set(k.ox+(k.x-k.ox)*f, k.oy+(k.y-k.oy)*f+Math.sin(f*Math.PI)*14, k.oz+(k.z-k.oz)*f);
      k.dome.material.opacity=0.05+0.2*f*f+(f>0.75?Math.sin(k.t*40)*0.05:0);
      if(Math.random()<dt*30) FX.burst(k.glob.position,1,LOB_C,1.5,0.4,-1);
      if(k.t<k.S.warn) continue;
      k.hit=true; k.glob.visible=false; k.ring.visible=false; k.disc.visible=false;
      _s3.set(k.x,k.y+0.3,k.z);
      FX.ring(_s3,LOB_C,k.r*2.4,0.4); FX.burst(_s3,30,LOB_C,10,0.5,7); FX.burst(_s3,12,0xffe0b0,6,0.3,4);
      SFX.boom();
      // anywhere inside the dome - a jump on the spot is still inside it
      if(Math.hypot(player.pos.x-k.x,player.pos.y+0.9-k.y,player.pos.z-k.z)<k.r)
        damagePlayer(k.S.dmg,_s3);
      if(i>strikes.length) break;          // that was a death, and the list is gone
      continue;
    }
    if(k.t<k.S.warn) continue;
    // the strike: a fork down from high above, and the hit
    _s1.set(k.x+rand(-2,2),k.y+34,k.z+rand(-2,2)); _s3.set(k.x,k.y+0.1,k.z);
    let px=_s1.x,py=_s1.y,pz=_s1.z;
    for(let q=1;q<=7;q++){
      const g=q/7, j=q<7?1.6:0;
      _s2.set(px,py,pz);
      px=_s1.x+(_s3.x-_s1.x)*g+rand(-j,j); py=_s1.y+(_s3.y-_s1.y)*g; pz=_s1.z+(_s3.z-_s1.z)*g+rand(-j,j);
      _s4.set(px,py,pz); FX.tracer(_s2,_s4,0xffffff,0.22,0.18);
    }
    FX.ring(_s3,STRIKE_C,k.S.r*2.6,0.4); FX.burst(_s3,26,STRIKE_C,10,0.4,6);
    SFX.boom();
    killStrike(i);
    // The Gaze's lightning hits whatever is in the ring, not just you: enemies,
    // and the conductors nothing else can break
    if(k.S.all) strikeAll(k);
    if(strikeHook) strikeHook(k);
    if(Math.hypot(player.pos.x-k.x,player.pos.z-k.z)<k.S.r&&Math.abs(player.pos.y-k.y)<2.6)
      damagePlayer(k.S.dmg,_s3);
    if(i>strikes.length) break;          // that was a death, and the list is gone
  }
}
function strikeAll(k){
  for(const e of enemies){
    if(e.dead) continue;
    if(e.K.proxy){ if(k.S.bdmg&&PROXY[e.kind]&&PROXY[e.kind].strike) PROXY[e.kind].strike(e,k); continue; }
    // a boss only where the level says (`bdmg`), and a shielded one only
    // while its shield is down: then bringing the eye down on it is the play
    if(e.K.boss&&(!k.S.bdmg||e.K.shielded&&!(e.exposed>0))) continue;
    const dy=e.pos.y-k.y;
    if(dy<-1||dy>e.K.hover+2.5||Math.hypot(e.pos.x-k.x,e.pos.z-k.z)>k.S.r+e.K.rad) continue;
    damageEnemy(e,e.K.boss?k.S.bdmg:(k.S.edmg||200),false,e.pos,null,1,false);
  }
  for(const b of breaches){
    if(b.broken||!b.conductor) continue;
    const c=b.col;
    const dx=Math.max(c.min.x-k.x,0,k.x-c.max.x), dz=Math.max(c.min.z-k.z,0,k.z-c.max.z);
    if(Math.hypot(dx,dz)<=k.S.r+0.6&&k.y>c.min.y-3&&k.y<c.max.y+2){ _s3.set(k.x,k.y,k.z); b.strikeIt(_s3); }
  }
}
function killStrike(i){
  const k=strikes[i];
  if(k.glob){ scene.remove(k.glob); k.glob.material.dispose(); k.glob.children[0].material.dispose(); }
  if(k.dome){ scene.remove(k.dome); k.dome.material.dispose(); }
  for(const m of [k.ring,k.disc]){ scene.remove(m); m.material.dispose(); }
  strikes.splice(i,1);
}
function clearStrikes(){ for(let i=strikes.length-1;i>=0;i--) killStrike(i); }

function updateEnemies(dt){
  playerCenter(_pc);
  drawWeaves(dt);
  updateStrikes(dt);
  // A bite can kill the player, and in a campaign dying respawns on the spot,
  // clearing and refilling this list under the loop. Stop when that happens.
  const life=game.respawns;
  for(let i=enemies.length-1;i>=0;i--){
    if(game.respawns!==life) break;
    const e=enemies[i]; if(e.dead) continue;
    const K=e.K;
    if(K.proxy){ if(PROXY[e.kind]) PROXY[e.kind].update(e,dt); continue; }
    _to.copy(_pc).sub(e.pos);
    const dist=_to.length()||0.001;
    _to.multiplyScalar(1/dist);
    const los=rayWorld(e.pos,_to,dist)>=dist-0.2;

    if(!K.fixed&&!e.pinned){            // emplacements never move, nor anything pinned
      e.wantY=undefined;
      e.strafeT-=dt;
      if(e.strafeT<=0){ e.strafe*=-1; e.strafeT=rand(1.1,2.8); }
      _side.set(-_to.z,0,_to.x).multiplyScalar(e.strafe);

      let ax=0,az=0;
      if(e.dormant){
        // not in the fight yet: walking its rounds, paying you no attention
        const pts=e.patrol||[];
        if(pts.length){
          const pt=pts[e.pi||0], dx=pt[0]-e.pos.x, dz=pt[1]-e.pos.z, d=Math.hypot(dx,dz)||0.001;
          if(d<2.5) e.pi=((e.pi||0)+1)%pts.length;
          ax=dx/d; az=dz/d;
        }
      }else if(e.bog){
        // through a plate to its waist: held in the hole till it hauls itself out
        e.bog.t-=dt; e.vel.set(0,0,0);
        if(e.quenchT>0&&Math.random()<dt*30){
          _rg.set(e.pos.x+rand(-1,1)*e.rad,e.bog.y-e.rad*0.6,e.pos.z+rand(-1,1)*e.rad);
          FX.burst(_rg,2,0xe8f6ff,3,1.3,-4,_up,0.85);
        }
        e.pos.x+=(e.bog.x-e.pos.x)*Math.min(1,dt*6); e.pos.z+=(e.bog.z-e.pos.z)*Math.min(1,dt*6);
        if(e.bog.t<=0) e.bog=null;
      }else if(e.cracked>0){
        // cracked open: it reels, and stands there to be hit
      }else if(K.contact){
        // anything that hurts by touching closes; only a suicide kind spends
        // itself doing it, the rest bite on a cooldown and stay in the fight
        ax=_to.x; az=_to.z;
        if(!los){ ax+=_side.x*0.5; az+=_side.z*0.5; }
        e.bite=(e.bite||0)-dt;
        if(dist<K.rad+1.35){
          if(K.suicide){
            damagePlayer(K.contact,e.pos);
            explode(e.pos,K.color,1.1);
            killEnemy(e,false); continue;
          }
          if(e.bite<=0){
            damagePlayer(K.contact,e.pos);
            e.bite=K.bite||0.75;
            FX.burst(e.pos,5,K.color,5,0.2,6);
            // bounce off, or the swarm parks inside the player and the bites
            // all land on the same frame
            e.vel.x-=_to.x*9; e.vel.z-=_to.z*9;
          }
        }
      }else if(K.severs&&(e.job=severJob(e))){
        // hang off the thing it is cutting, close enough to reach it and at
        // its height - over a chasm there is no floor to hover above
        const tp=e.job.pt, line=e.job.kind==='line';
        const dx=tp.x-e.pos.x, dz=tp.z-e.pos.z, d=Math.hypot(dx,dz)||0.001;
        const want=line?9:(e.job.kind==='hold'?1.5:6);
        const push=d>want+2?1:(d<want-2?-0.6:0);
        ax=dx/d*push+_side.x*0.5; az=dz/d*push+_side.z*0.5;
        e.wantY=tp.y+(line?2.5:1.5);
      }else if(K.drainer&&(e.drainOn=nearestPowered(e.pos))){
        // go and stand over it, then drain it: the beam is the warning, and it
        // takes long enough that killing the Coil first is a real option
        const c=e.drainOn;
        const dx=c.p[0]-e.pos.x, dz=c.p[2]-e.pos.z, d=Math.hypot(dx,dz)||0.001;
        const push=d>4.5?1:(d<2.5?-0.6:0);
        ax=dx/d*push+_side.x*0.25; az=dz/d*push+_side.z*0.25;
        if(d<8){
          e.drainT=(e.drainT||0)+dt;
          FX.tracer(e.pos,c.pos,K.color,0.035+0.05*(e.drainT/K.drainer),0.05);
          c.hit=Math.max(c.hit,0.1);
          if(e.drainT>=K.drainer){ c.drain(); e.drainT=0; }
        }else e.drainT=0;
      }else{
        e.drainT=0;
        const want=e.range!==undefined?e.range:K.range;     // a spawn can bring it closer
        const push=(dist<want*0.8)?-1:(dist>want*1.15?1:0);
        ax=_to.x*push+_side.x*0.85;
        az=_to.z*push+_side.z*0.85;
        if(!los){ ax+=_to.x*0.9; az+=_to.z*0.9; }
        if(e.kind==='warden'&&e.phase===1){ ax=_to.x*1.6; az=_to.z*1.6; }
      }
      // Enemies are deliberately allowed over a void: following the player
      // across a gap is most of what makes a fight around an island read as one.
      // separation
      for(let j=0;j<enemies.length;j++){
        if(j===i) continue; const o=enemies[j]; if(o.dead) continue;
        _sep.copy(e.pos).sub(o.pos);
        const d2=_sep.lengthSq(), rr=(e.rad+o.rad)*1.35;
        if(d2<rr*rr&&d2>0.001){
          const inv=1/Math.sqrt(d2);
          ax+=_sep.x*inv*1.5; az+=_sep.z*inv*1.5;
        }
      }
      // the way round a hole it will not cross, rather than pressing against its edge
      if(K.shieldHits&&holes.length&&(ax||az)){
        const al0=Math.hypot(ax,az), ux=ax/al0, uz=az/al0, ahead=e.rad+3;
        if(holeAhead(e,ux,uz,ahead)){
          for(const turn of [0.6,-0.6,1.1,-1.1,1.6,-1.6]){
            const c=Math.cos(turn), sn=Math.sin(turn), vx=ux*c-uz*sn, vz=ux*sn+uz*c;
            if(!holeAhead(e,vx,vz,ahead)){ ax=vx*al0; az=vz*al0; break; }
          }
        }
      }
      const al=Math.hypot(ax,az);
      if(al>0.001){ ax/=al; az/=al;
        e.vel.x+=ax*K.accel*dt; e.vel.z+=az*K.accel*dt;
      }
      const sp=Math.hypot(e.vel.x,e.vel.z), maxS=K.speed*(1+game.wave*0.012)*(e.dormant?0.45:1);
      if(sp>maxS){ e.vel.x*=maxS/sp; e.vel.z*=maxS/sp; }
      e.vel.x*=Math.pow(0.15,dt); e.vel.z*=Math.pow(0.15,dt);

      e.pos.x+=e.vel.x*dt; e.pos.z+=e.vel.z*dt;
      if(BOUNDS!==null){
        e.pos.x=clamp(e.pos.x,-BOUNDS+e.visR,BOUNDS-e.visR);
        e.pos.z=clamp(e.pos.z,-BOUNDS+e.visR,BOUNDS-e.visR);
      }
      // out of every room it may be in: back into the nearest
      if(ENEMY_BOXES){
        let best=null, bd=Infinity;
        for(const b of ENEMY_BOXES){
          // A box with heights [.., y0, y1] holds only what is between them, so
          // decks stacked up a shaft each keep their own.
          if(b.length>4&&(e.pos.y<b[4]||e.pos.y>b[5])) continue;
          if(b[6]==='fly'&&e.kind!=='drone') continue;     // the open air of a shaft: only drones
          const cx=clamp(e.pos.x,b[0]+e.rad,b[1]-e.rad), cz=clamp(e.pos.z,b[2]+e.rad,b[3]-e.rad);
          const d=Math.hypot(cx-e.pos.x,cz-e.pos.z);
          if(d<bd){ bd=d; best=[cx,cz]; }
          if(d===0) break;
        }
        if(best&&bd>0){ e.pos.x=best[0]; e.pos.z=best[1]; }
      }
      if(!e.bog) pushOutSolids(e);          // stuck in its hole, the plates round it would shove it about
      if(K.shieldHits&&!e.bog) keepOutOfHoles(e,dt);
      // hover above whatever is below
      e.bob+=dt*2.2;
      // Over a chasm there is nothing below, and groundAt answers 0, which would
      // walk enemies down under the level. With no floor beneath, hold the
      // altitude instead.
      const solidBelow=hasGroundBelow(e.pos.x,e.pos.z,e.pos.y+2.5);
      const gy=groundAt(e.pos.x,e.pos.z,e.pos.y+2.5);
      let ty=solidBelow ? gy+K.hover+Math.sin(e.bob)*0.22+(e.kind==='rusher'?0:0.15)
                          : (e.wantY!==undefined?e.wantY:e.pos.y);
      // a boss a phase has sent somewhere holds that height, whatever is below
      if(e.fixY!==undefined) ty=e.fixY+(e.wadeY!==undefined?0:Math.sin(e.bob)*0.3);
      // a drone over a floor far below you comes up to you rather than sinking
      // out of reach (over nothing at all it holds its height)
      else if(levelFlags.dronesFly&&e.kind==='drone'&&solidBelow&&player.pos.y-gy>8)
        ty=Math.max(gy+K.hover, player.pos.y+2.2+Math.sin(e.bob)*0.4);
      // and a Severer at work holds the height of what it is cutting
      if(K.severs&&e.job&&e.wantY!==undefined) ty=e.wantY;
      if(e.bog) ty=e.bog.y;
      // what rides the plates, over a hole (or right on its edge): the level's
      // plate update drops it in; till then it holds its height
      else if(e.rides&&e.bogFloor===undefined&&holes.some(h=>e.pos.x>h.x0-0.1&&e.pos.x<h.x1+0.1&&e.pos.z>h.z0-0.1&&e.pos.z<h.z1+0.1)) ty=e.pos.y;
      // climbing out, it keeps to the floor's height, not the hole's
      else if(e.bogFloor!==undefined){ if(inHole(e)) ty=e.bogFloor+K.hover; else e.bogFloor=undefined; }
      e.pos.y=lerp(e.pos.y,ty,Math.min(1,dt*(e.kind==='rusher'?9:4)));
      // Never inside anything: back to the last place it was clear. (Not a
      // boss, which the level sends up through floors on purpose.) Held there
      // for 2s - the room's limits pulling it one way, a wall pushing it back -
      // it is removed, not left to hold its fight shut half inside a wall.
      if(!K.boss&&!e.bog){
        if(!pointSolid(e.pos)){ (e.free||(e.free=V3())).copy(e.pos); e.stuckT=0; }
        else{
          if(e.free){ e.pos.copy(e.free); e.vel.x=0; e.vel.z=0; }
          e.stuckT=(e.stuckT||0)+dt;
          if(e.stuckT>2){ killEnemy(e,false); continue; }
        }
      }
      // Over the edge into a kill zone, it dies as you would, rather than
      // holding its fight shut from somewhere out of reach.
      for(const h of voids){
        if(h.off||e.pos.y-K.hover>=h.below) continue;
        if(h.box&&!(e.pos.x>h.box[0]&&e.pos.x<h.box[1]&&e.pos.z>h.box[2]&&e.pos.z<h.box[3])) continue;
        killEnemy(e,false); break;
      }
      if(e.dead) continue;
    }


    if(K.severs) updateSever(e,dt);
    if(e.rides) rideGlow(e,dt);
    if(e.stormT>0) e.stormT-=dt;
    if(K.shielded){
      if(e.exposed>0) e.exposed-=dt;
      const up=!(e.exposed>0);
      e.shell.visible=up||Math.sin(game.time*30)>0.6&&e.exposed<1.2;   // flickers back
      e.shell.material.opacity=0.16+Math.sin(game.time*4)*0.04;
      // lightning: once it is fighting, a strike every so often wherever you are
      const S=e.strikeK||K.strike;
      if(S&&game.state==='play'){
        e.strikeT=(e.strikeT===undefined?S.every:e.strikeT)-dt;
        if(e.strikeT<=0){ e.strikeT=S.every; callStrike(e); }
      }
      if(K.summon&&!e.noSummon){
        e.sumT-=dt;
        if(e.sumT<=0){
          e.sumT=K.summon.every;
          for(let k=0;k<K.summon.n;k++){
            const [sx,sz]=summonSpot(e,6);
            const c=makeEnemy(K.summon.kind,sx,sz,undefined,undefined,e.pos.y-K.hover);
            c.trig=e.trig;       // part of the same fight
          }
          FX.ring(e.pos,K.color,10,0.6); SFX.spawn(); hud.threat=true;
        }
      }
    }

    // charged beam: locks a point, shows the line, fires there a moment later
    if(K.beam){
      if(los&&dist<K.range*1.25){
        if(e.charge<=0){ e.aim=e.aim||V3(); e.aim.copy(_pc); }
        e.charge+=dt;
        FX.tracer(e.pos,e.aim,0x9d5eff,0.02+0.03*(e.charge/K.beam.charge),0.06);
        if(e.charge>=K.beam.charge){
          e.charge=0;
          FX.tracer(e.pos,e.aim,0xd9b6ff,0.16,0.22);
          FX.burst(e.aim,14,0x9d5eff,7,0.35,6);
          SFX.rail();
          playerCenter(_pc);
          if(_pc.distanceTo(e.aim)<2.2) damagePlayer(K.beam.dmg,e.pos);   // moved = missed
        }
      }else e.charge=Math.max(0,e.charge-dt*1.6);
    }

    if(e.cracked>0){
      e.cracked-=dt;
      if(Math.random()<dt*14) FX.burst(e.pos,2,0xffb060,4,0.3,3);
    }
    // molten shot, lobbed at where you are heading - not while it reels
    if(K.lob&&!e.dormant&&game.state==='play'){
      e.lobT=(e.lobT===undefined?K.lob.every:e.lobT)-dt;
      if(e.lobT<=0&&dist<60&&!(e.cracked>0)){ e.lobT=K.lob.every*rand(0.85,1.15); callLob(e); }
    }
    // shooting
    if(K.bullet&&!e.dormant){
      e.fireT-=dt;
      if(e.burst>0){
        e.burstT-=dt;
        if(e.burstT<=0){ e.burst--; e.burstT=0.16; if(los) enemyShoot(e); }
      }else if(e.fireT<=0&&los&&dist<K.range*2.2){
        e.fireT=K.fire*rand(0.8,1.25)/(1+game.wave*0.02);
        if(e.kind==='warden'){
          e.spiral+=0.7;
          for(let k=0;k<10;k++){
            const a=e.spiral+k*Math.PI*2/10;
            enemyShoot(e,V3(Math.cos(a),0.02,Math.sin(a)),0.8);
          }
          e.phase=e.phase===1?0:1;
        }else{
          e.burst=(K.burst||1); e.burstT=0;
        }
      }
    }
    if(e.kind==='warden'){
      const frac=e.hp/e.maxHp;
      if((frac<0.66&&e.summoned<1)||(frac<0.33&&e.summoned<2)){
        e.summoned++;
        // a summon appears in the room the warden is fighting in
        for(let k=0;k<3;k++){
          let [sx,sz]=summonSpot(e,5);
          if(BOUNDS!==null){ sx=clamp(sx,-BOUNDS+3,BOUNDS-3); sz=clamp(sz,-BOUNDS+3,BOUNDS-3); }
          // a summon belongs to whatever fight its summoner belongs to
          const c=makeEnemy('drone',sx,sz,undefined,undefined,e.pos.y); c.trig=e.trig;
          // and holds the height its summoner holds, whatever is below
          if(e.fixY!==undefined&&e.wadeY===undefined){ c.fixY=e.fixY-K.hover+c.K.hover; c.pos.y=c.fixY; }
        }
        hud.threat=true;
        FX.ring(e.pos,0xff3fa4,9,0.5); SFX.spawn();
      }
    }

    // visuals
    e.spin+=dt*(e.kind==='rusher'?7:(e.kind==='severer'?9:2.2));
    e.mesh.position.copy(e.pos);
    if(e.kind==='rusher'){
      const vl=Math.hypot(e.vel.x,e.vel.z);
      if(vl>0.4){ e.face=Math.atan2(e.vel.x,e.vel.z); }
      else if(e.face===undefined) e.face=Math.atan2(_to.x,_to.z);
      e.mesh.rotation.set(0,e.face,e.spin);
      e.mesh.rotateX(clamp(-e.vel.y*0.05,-0.5,0.5));
    }else if(e.kind==='drone'){
      e.mesh.rotation.set(Math.sin(e.bob*0.6)*0.12,e.spin,Math.cos(e.bob*0.5)*0.1);
    }else{
      const want=e.dormant&&Math.hypot(e.vel.x,e.vel.z)>0.3?Math.atan2(e.vel.x,e.vel.z):Math.atan2(_to.x,_to.z);
      if(e.face===undefined) e.face=want;
      let d=want-e.face;
      while(d>Math.PI) d-=T2; while(d<-Math.PI) d+=T2;
      // rad/s, capped: a shield is only interesting if you can get behind it
      const rate=(K.turn!==undefined?K.turn:6)*dt;
      e.face+=clamp(d,-rate,rate);
      if(e.wadeY!==undefined){
        // wading: no hover, just the sway of its stride while it moves, and a
        // ring of disturbed metal round its legs at the surface
        const sp=Math.min(1,Math.hypot(e.vel.x,e.vel.z)/K.speed);
        e.walkT=(e.walkT||0)+dt*(1.5+sp*3);
        e.mesh.rotation.set(0,e.face,Math.sin(e.walkT)*0.045*sp);
        if(e.ring){ e.ring.position.y=e.wadeY-e.pos.y+0.08; }
      }else e.mesh.rotation.set(0,e.face,Math.sin(e.bob*0.7)*0.06);
    }
    if(e.ring){ e.ring.rotation.x=Math.PI/2; e.ring.rotation.z=e.spin*1.6;
      if(e.wadeY!==undefined) e.ring.scale.setScalar(K.rad*0.62*(1+Math.sin(game.time*2.4)*0.06)); }
    if(e.ring2) e.ring2.rotation.z=-e.spin*2.1;
    if(e.hitT>0){
      e.hitT-=dt;
      const f=Math.max(0,e.hitT/0.12);
      for(let m=0;m<e.flashMats.length;m++) e.flashMats[m].emissiveIntensity=e.flashBase[m]+f*1.9;
      e.glow.material.opacity=0.30+f*0.7;
      e.glow.scale.setScalar(K.rad*2.1*(1+f*0.4));
    }
    // cracked armour glows molten through its seams, for as long as it is open
    if(K.shieldHits){
      if(!(e.hitT>0)){
        const c=e.cracked>0?0.35+Math.sin(game.time*12)*0.15:0;
        for(let m=0;m<e.flashMats.length;m++) e.flashMats[m].emissiveIntensity=e.flashBase[m]+c;
      }
      updateShield(e);
    }
    if(e.core) e.core.scale.setScalar(K.rad*0.2*(1+Math.sin(game.time*6+e.bob)*0.12));
    if(e.kind==='rusher'&&Math.random()<dt*22)
      FX.burst(e.pos,1,0xff3fa4,1.2,0.35,1.5);
  }
}

/* The Bastion is too heavy for a cracked plate: over one, it goes through to
   its waist, shield and all burst, and is stuck there a few seconds, open to
   everything. Then it hauls itself out, and keeps off the hole after. */
function bogEnemy(e,x,z,floorY,t){
  e.bog={t, x, z, y:floorY+e.K.hover-3.6}; e.bogFloor=floorY;
  e.cracked=t; e.lobT=Math.max(e.lobT||0,1.5);
  const sm=e.shieldMesh;
  if(sm){ sm.visible=false; shieldClean(e); e.shieldHP=0; }
  _sh.set(x,floorY,z);
  FX.ring(_sh,0xff8a3a,e.rad*4.5,0.6); FX.burst(_sh,60,0xffb060,16,0.7,10); FX.burst(_sh,30,0x5a6070,12,0.8,10);
  player.shake=Math.min(0.8,player.shake+0.45); SFX.breach();
  // `quench`: what it drops into is the Armoury's quench tank, cold, and it
  // lives in molten metal. It costs it that share of its health, and it
  // steams the whole time it is in there
  if(e.quench){
    e.quenchT=t;
    FX.burst(_sh,70,0xe8f6ff,14,1.4,-5,_up,0.7); FX.ring(_sh,0xbfeaff,e.rad*5,0.8);
    damageEnemy(e,Math.round(e.maxHp*e.quench),false,e.pos,null,1,false);
  }
}
const _up=V3(0,1,0);
/* The Armoury's red shield: the Sunder only rings off it. Only the quench
   breaks it. */
function proofShield(e){
  e.proof=true;
  const sm=e.shieldMesh; if(!sm) return;
  sm.material.color.setHex(0xff6a5a); sm.material.emissive.setHex(0xff3524);
}
/* What it floats on, shown: it rides the plates' charge, a glow on the plate
   under it and arcs down to it now and then. Over a cracked plate there is
   nothing to hold it up. */
function rideGlow(e,dt){
  if(!e.field){
    const m=new THREE.Mesh(new THREE.CircleGeometry(e.rad*1.1,40),
      new THREE.MeshBasicMaterial({color:0xff9a30,transparent:true,opacity:0.5,depthWrite:false,
        blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));
    m.rotation.x=-Math.PI/2; scene.add(m); e.field=m;
  }
  const f=e.field, gy=groundAt(e.pos.x,e.pos.z,e.pos.y);
  f.visible=!e.bog&&e.pos.y-gy<e.K.hover+3;
  f.position.set(e.pos.x,gy+0.06,e.pos.z);
  f.material.opacity=0.42+Math.sin(game.time*9+e.bob)*0.1;
  if(f.visible&&Math.random()<dt*7){
    const a=rand(0,T2), r=rand(0.3,0.9)*e.rad;
    _sh.set(e.pos.x+Math.cos(a)*r*0.5,e.pos.y-e.rad*0.4,e.pos.z+Math.sin(a)*r*0.5);
    _rg.set(e.pos.x+Math.cos(a)*r,gy+0.1,e.pos.z+Math.sin(a)*r);
    FX.tracer(_sh,_rg,0xffb060,0.08,0.09);
  }
}
const _rg=V3();
function inHole(e){
  const m=e.rad*0.6;
  return holes.some(h=>e.pos.x>h.x0-m&&e.pos.x<h.x1+m&&e.pos.z>h.z0-m&&e.pos.z<h.z1+m);
}
// out of any hole it has made, at a walk: climbing out, not teleporting
function keepOutOfHoles(e,dt){
  const m=e.rad*0.6;
  for(const h of holes){
    if(e.pos.x<=h.x0-m||e.pos.x>=h.x1+m||e.pos.z<=h.z0-m||e.pos.z>=h.z1+m) continue;
    const dl=e.pos.x-(h.x0-m), dr=(h.x1+m)-e.pos.x, dn=e.pos.z-(h.z0-m), ds=(h.z1+m)-e.pos.z;
    const k=Math.min(dl,dr,dn,ds), step=Math.min(k,dt*K_CLIMB);
    if(k===dl){ e.pos.x-=step; if(e.vel.x>0) e.vel.x=0; }
    else if(k===dr){ e.pos.x+=step; if(e.vel.x<0) e.vel.x=0; }
    else if(k===dn){ e.pos.z-=step; if(e.vel.z>0) e.vel.z=0; }
    else { e.pos.z+=step; if(e.vel.z<0) e.vel.z=0; }
  }
}
const K_CLIMB=5;
function holeAhead(e,ux,uz,ahead){
  for(const f of [0.5,1]){
    const x=e.pos.x+ux*ahead*f, z=e.pos.z+uz*ahead*f;
    if(holes.some(h=>x>h.x0&&x<h.x1&&z>h.z0&&z<h.z1)) return true;
  }
  return false;
}

function disposeEnemy(e){
  if(e.K.proxy&&PROXY[e.kind]&&PROXY[e.kind].gone) PROXY[e.kind].gone(e);
  scene.remove(e.mesh);
  if(e.flashMats) for(let i=0;i<e.flashMats.length;i++) e.flashMats[i].dispose();
  if(e.core) e.core.material.dispose();
  if(e.glow) e.glow.material.dispose();
  if(e.glowMesh) e.glowMesh.material.dispose();
  if(e.shc){ e.shc.map.dispose(); e.shc.gmap.dispose(); e.shieldMesh.material.dispose(); }
  if(e.field){ scene.remove(e.field); e.field.geometry.dispose(); e.field.material.dispose(); }
}

/* Where a summoner puts what it summons: r metres off in some direction it can
   see clear along, with a margin, over ground - or on itself. Never through a
   wall, outside the level. */
const _ss=V3();
function summonSpot(e,r){
  for(let k=0;k<10;k++){
    const a=Math.random()*T2;
    _ss.set(Math.cos(a),0,Math.sin(a));
    if(rayWorld(e.pos,_ss,r+1.5)<r+1.5) continue;
    const sx=e.pos.x+_ss.x*r, sz=e.pos.z+_ss.z*r;
    if(hasGroundAt(sx,sz)) return [sx,sz];
  }
  return [e.pos.x,e.pos.z];
}

/* The nearest live weaver covering this one, if any. Linear over the enemy
   list, which is fine at the counts a room holds - and a weaver inside another
   weaver's radius is deliberately not shielded, or a pair of them would be
   unkillable. */
function weaverOver(e){
  // Nearest, not first found, so the shield comes from the weaver the line on
  // screen points at.
  let best=null, bd=Infinity;
  for(let i=0;i<enemies.length;i++){
    const w=enemies[i];
    if(w.dead||!w.K.weave||w===e) continue;
    // a weaver set to guard particular Severers covers those and nothing else
    if(w.K.weave.holds&&!w.K.weave.holds.includes(e.holds)) continue;
    const dx=w.pos.x-e.pos.x, dy=w.pos.y-e.pos.y, dz=w.pos.z-e.pos.z;
    const d2=dx*dx+dy*dy+dz*dz;
    if(d2<=w.K.weave.r*w.K.weave.r&&d2<bd){ bd=d2; best=w; }
  }
  return best;
}

function damageEnemy(e,dmg,crit,at,dir,strength,pierce){
  if(e.dead) return;
  if(player.oneShot) dmg=e.hp*1e6+1e6;   // set by the dev tools only; survives any plate or weave
  else if(e.K.proxy){
    // (what the shot just met, if a shot: an arc or a blast leaves it unset)
    dmg=PROXY[e.kind]?PROXY[e.kind].hit(e,dmg,at,dir,pierce,crit):dmg; e.part=null;
    if(!(dmg>0)){ hud.hitmark(false,0.15); return; }
    crit=!!e.crit;
  }
  else if(e.K.shielded&&!(e.exposed>0)){
    // nothing gets through the shield: say so where it lands
    FX.ring(at||e.pos,e.K.color,2.2,0.3); FX.burst(at||e.pos,5,0xe0d0ff,4,0.2,4);
    hud.hitmark(false,0.15);
    return;
  }
  else if(e.dormant||(e.K.shieldHits&&!(e.cracked>0))){
    // not in the fight yet, or behind its shield: only Sunder hits on the shield
    // count (hitShield); every other round sparks off
    FX.burst(at||e.pos,6,0xffb060,5,0.22,5); FX.ring(at||e.pos,0xffb060,1.8,0.25);
    hud.hitmark(false,0.15);
    return;
  }
  if(e.K.shield&&dir&&e.face!==undefined){
    // model faces +Z, so forward is (sin face, 0, cos face)
    const fx=Math.sin(e.face), fz=Math.cos(e.face);
    if(-(dir.x*fx+dir.z*fz)>0.45){
      // a piercing round punches the plate; everything else splashes off it
      dmg*=pierce?Math.max(e.K.shield,0.55):e.K.shield;
      crit=false;
      FX.burst(at||e.pos,pierce?6:9,0x9fe8ff,pierce?4:6,0.28,5);
      FX.ring(at||e.pos,0x9fe8ff,pierce?1.6:2.6,0.32);   // reads as a plate, not a miss
      SFX.hit();
    }
  }
  // A weave cuts the damage of everything inside it. The visible link between
  // weaver and shielded is what makes this fair: the answer is always on
  // screen, so being shot at through a weave reads as "kill that one first"
  // rather than as a bullet-sponge.
  if(!e.K.weave&&!(e.stormT>0)){       // a storm it stands in strips the weave
    const w=weaverOver(e);
    if(w){
      dmg*=1-w.K.weave.cut;
      crit=false;
      FX.ring(at||e.pos,w.K.color,e.rad*1.9,0.26);
      w.weaveT=0.3;
    }
  }
  e.hp-=dmg; e.hitT=0.12;
  game.hits++;
  FX.burst(at||e.pos,crit?9:5,crit?0xffffff:e.K.color,crit?8:5.5,0.25,8,dir?_edv.copy(dir).multiplyScalar(-1):null,0.5);
  if(dir){ e.vel.addScaledVector(dir,dmg*0.012); }
  hud.hitmark(crit,strength);
  if(crit) SFX.crit(); else SFX.hit();
  if(e.hp<=0) killEnemy(e,true);
}

/* The Bastion's shield: a slab held in front, with molten seams that crack a
   little further with each Sunder hit and blow apart on the last. Its cracks
   are drawn where each charge lands. Every shield has its own pair of canvases
   - the plate, and its glow - redrawn clean when it is poured anew. A hit is an
   impact: a dent, then fractures running out of it, jagged, tapering and
   splitting as they go. */
const SH_S=512;
// `look`: another face to crack the same way - the Authority's armour plates,
// dark with a magenta seam - {fill, line, rows}
const SHIELD_BASE={};
function shieldBase(look){
  const key=look?look.fill+look.line:'bastion';
  if(SHIELD_BASE[key]) return SHIELD_BASE[key];
  const mk=()=>{ const c=document.createElement('canvas'); c.width=c.height=SH_S; return c; };
  const base=mk(), glow=mk(), b=base.getContext('2d'), gl=glow.getContext('2d');
  b.fillStyle=look?look.fill:'#5a6a80'; b.fillRect(0,0,SH_S,SH_S);
  for(let q=0;q<1400;q++){ b.fillStyle='rgba(255,255,255,'+rand(0.01,0.05).toFixed(3)+')'; b.fillRect(rand(0,SH_S),rand(0,SH_S),rand(8,40),1); }
  for(let q=0;q<900;q++){ b.fillStyle='rgba(0,0,0,'+rand(0.03,0.1).toFixed(3)+')'; b.fillRect(rand(0,SH_S),rand(0,SH_S),2,2); }
  gl.fillStyle='#000'; gl.fillRect(0,0,SH_S,SH_S);
  gl.strokeStyle=look?look.line:'#ff8a3a'; gl.lineWidth=18; gl.strokeRect(9,9,SH_S-18,SH_S-18);
  gl.lineWidth=8;
  if(look) for(const y of look.rows){ gl.beginPath(); gl.moveTo(SH_S*0.08,y*SH_S); gl.lineTo(SH_S*0.92,y*SH_S); gl.stroke(); }
  else for(const x of [0.3,0.5,0.7]){ gl.beginPath(); gl.moveTo(x*SH_S,SH_S*0.08); gl.lineTo(x*SH_S,SH_S*0.92); gl.stroke(); }
  SHIELD_BASE[key]={base,glow}; return SHIELD_BASE[key];
}
function shieldCanvases(e){
  if(!e.shc){
    const mk=()=>{ const c=document.createElement('canvas'); c.width=c.height=SH_S; return c; };
    const base=mk(), glow=mk();
    e.shc={base,glow,map:new THREE.CanvasTexture(base),gmap:new THREE.CanvasTexture(glow)};
  }
  return e.shc;
}
function shieldClean(e){
  const C=shieldCanvases(e), B=shieldBase(e.shLook);
  C.base.getContext('2d').drawImage(B.base,0,0); C.glow.getContext('2d').drawImage(B.glow,0,0);
  C.map.needsUpdate=true; C.gmap.needsUpdate=true;
}
function shieldImpact(e,u,v,big){
  const C=shieldCanvases(e), b=C.base.getContext('2d'), gl=C.glow.getContext('2d');
  const x=clamp(u,0.06,0.94)*SH_S, y=(1-clamp(v,0.06,0.94))*SH_S;
  const segs=[];
  const fracture=(px,py,a,len,w,depth)=>{
    const n=Math.max(3,Math.round(len/14));
    for(let k=0;k<n;k++){
      a+=rand(-0.35,0.35);
      const st=len/n, nx=px+Math.cos(a)*st, ny=py+Math.sin(a)*st, ww=w*(1-k/n*0.75);
      segs.push([px,py,nx,ny,ww]);
      if(depth<2&&Math.random()<0.18) fracture(nx,ny,a+rand(0.5,0.9)*(Math.random()<0.5?-1:1),len*rand(0.3,0.5),ww*0.7,depth+1);
      px=nx; py=ny;
      if(px<18||px>SH_S-18||py<18||py>SH_S-18) break;
    }
  };
  const rg=b.createRadialGradient(x,y,0,x,y,36); rg.addColorStop(0,'rgba(0,0,0,0.55)'); rg.addColorStop(1,'rgba(0,0,0,0)');
  b.fillStyle=rg; b.beginPath(); b.arc(x,y,36,0,T2); b.fill();
  const gg=gl.createRadialGradient(x,y,0,x,y,24); gg.addColorStop(0,'rgba(255,220,160,1)'); gg.addColorStop(1,'rgba(255,120,40,0)');
  gl.fillStyle=gg; gl.beginPath(); gl.arc(x,y,24,0,T2); gl.fill();
  const arms=big?7:6, len=big?200:160, a0=rand(0,T2);
  for(let k=0;k<arms;k++) fracture(x,y,a0+k*T2/arms+rand(-0.3,0.3),len*rand(0.6,1.2),big?6:5,0);
  b.lineCap=gl.lineCap='round';
  for(const [x0,y0,x1,y1,ww] of segs){ b.strokeStyle='#0d0f14'; b.lineWidth=ww*2.2; b.beginPath(); b.moveTo(x0,y0); b.lineTo(x1,y1); b.stroke(); }
  for(const [x0,y0,x1,y1,ww] of segs){ gl.strokeStyle='#ffb070'; gl.lineWidth=Math.max(1,ww*0.8); gl.beginPath(); gl.moveTo(x0,y0); gl.lineTo(x1,y1); gl.stroke(); }
  C.map.needsUpdate=true; C.gmap.needsUpdate=true;
}
function buildShield(e){
  const f=e.fit||1;
  shieldClean(e);
  const C=shieldCanvases(e);
  const mat=new THREE.MeshLambertMaterial({color:0xffffff, map:C.map, emissive:0xffffff, emissiveMap:C.gmap, emissiveIntensity:1.2});
  const m=new THREE.Mesh(new THREE.BoxGeometry(2.7*f,3.1*f,0.34*f),mat);
  m.position.set(-0.2*f,0.35*f,1.3*f);
  e.mesh.add(m); e.shieldMesh=m; e.shieldHP=e.K.shieldHits.hits;
}
/* A Sunder charge on or right beside the shield: one hit of three. Returns
   true when it was turned (the shield was up), so the charge does no harm. */
let shieldTold=false;
function hitShield(e,at){
  if(e.dormant) return true;
  if(e.cracked>0) return false;                // it is down: the charge lands
  if(e.proof){
    FX.ring(at,0xff4a3a,3.8,0.35); FX.burst(at,22,0xff7a5a,10,0.3,6); SFX.hit();
    return true;
  }
  e.shieldHP--;
  const sm=e.shieldMesh;
  if(e.shieldHP>0){
    // the impact goes where the charge landed on its face
    e.mesh.updateMatrixWorld(true);
    const lp=sm.worldToLocal(_sh.copy(at)), gp=sm.geometry.parameters;
    shieldImpact(e,lp.x/gp.width+0.5,lp.y/gp.height+0.5,e.shieldHP===1);
    FX.ring(at,0xffd0a0,3.4,0.35); FX.burst(at,16,0xffb060,8,0.35,6); SFX.hit();
    return true;
  }
  // the third: it blows apart, and the Bastion reels with nothing in front of it.
  // (The one that grows back is whole: its maps are set now, while it is gone.)
  e.cracked=e.K.shieldHits.down; sm.visible=false;
  shieldClean(e);
  _sh.set(0,0,0); sm.getWorldPosition(_sh);
  FX.ring(_sh,0xff8a3a,e.rad*4,0.55); FX.burst(_sh,50,0xffb060,14,0.6,9); FX.burst(_sh,24,0x5a6070,10,0.7,10);
  player.shake=Math.min(0.6,player.shake+0.3); SFX.breach();
  if(!shieldTold){ shieldTold=true; hud.banner('SHIELD DOWN','Everything hurts it until it pours a new one.'); }
  return true;
}
/* Down, then poured anew out of the metal: for the last moments of the window
   it grows back glowing, so the end of the opening can be seen coming. */
function updateShield(e){
  const sm=e.shieldMesh, S=e.K.shieldHits;
  if(!sm) return;
  if(!(e.cracked>0)){
    if(!sm.visible||e.shieldHP<=0){ sm.visible=true; e.shieldHP=S.hits; sm.scale.set(1,1,1); sm.material.emissiveIntensity=1.2; }
    return;
  }
  if(e.cracked<S.rebuild){
    const k=1-e.cracked/S.rebuild;
    sm.visible=true; sm.scale.set(1,Math.max(0.02,k),1);
    sm.material.emissiveIntensity=1.2+3*(1-k);
    if(Math.random()<0.5) FX.burst(e.pos,1,0xff8a3a,3,0.4,2);
  }
}

function killEnemy(e,byPlayer){
  if(e.dead) return;
  e.dead=true; if(e.kind!=='node'&&!e.dormant) game.alive--;
  disposeEnemy(e);
  if(e.K.severs) reviveAnchors(e);
  const idx=enemies.indexOf(e); if(idx>=0) enemies.splice(idx,1);
  explode(e.pos,e.K.color,e.kind==='warden'?3.2:(e.K.proxy?4:(e.kind==='sentinel'?1.6:1)));
  if(e.kind==='warden'){ player.shake=Math.min(0.9,player.shake+0.6); FX.ring(e.pos,0xffffff,22,0.9); }
  if(byPlayer){
    game.kills++;
    game.combo=Math.min(99,game.combo+1);
    game.comboT=4.2;
    game.bestCombo=Math.max(game.bestCombo,game.combo);
    game.score+=Math.round(e.K.score*game.combo*(1+game.wave*0.05));
    SFX.kill();
    hud.feed(e.kind.toUpperCase(),game.combo);
    hud.stats=true;
  }
  // drops
  const dr=e.K.drop*(player.hp<55?1.5:1);
  if(Math.random()<dr) dropPickup(e.pos, Math.random()<(player.hp<70?0.45:0.28)?'hp':'ammo');
  if(e.kind==='warden'){ for(let i=0;i<5;i++) dropPickup(e.pos,i%2?'hp':'ammo'); }
  hud.threat=true;
}

const BGEO=new THREE.SphereGeometry(1,8,6);
function spawnBullet(p,dir,B,spdMul){
  const m=new THREE.Mesh(BGEO,new THREE.MeshBasicMaterial({color:B.color}));
  m.scale.setScalar(B.r);
  const g=sprite(B.color,B.r*7,0.75); m.add(g);
  m.position.copy(p);
  scene.add(m);
  bullets.push({mesh:m,pos:m.position,vel:dir.clone().multiplyScalar(B.spd*(spdMul||1)),
    dmg:B.dmg,r:B.r,life:6,color:B.color});
}
function killBullet(b,i){
  scene.remove(b.mesh); b.mesh.material.dispose();
  if(b.mesh.children[0]) b.mesh.children[0].material.dispose();
  bullets.splice(i,1);
}
function updateBullets(dt){
  playerCenter(_pc);
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];
    b.life-=dt;
    b.pos.addScaledVector(b.vel,dt);
    b.mesh.scale.setScalar(b.r*(1+Math.sin(game.time*30)*0.12));
    // The arena is 42m half-width with a 17m ceiling; a level is neither, so
    // only the arena culls rounds against its box.
    const gone = BOUNDS===null
      ? (b.pos.y<FLOOR_Y-40||b.pos.y>500)          // in a level, life and geometry stop a round
      : (Math.abs(b.pos.x)>HALF+2||Math.abs(b.pos.z)>HALF+2||b.pos.y<0.05||b.pos.y>WALLH);
    if(b.life<=0||gone){
      FX.burst(b.pos,3,b.color,3,0.2,6); killBullet(b,i); continue;
    }
    if(pointSolid(b.pos)){
      FX.burst(b.pos,6,b.color,4.5,0.25,8); killBullet(b,i); continue;
    }
    if(b.pos.distanceToSquared(_pc)< (b.r+0.55)*(b.r+0.55)){
      damagePlayer(b.dmg,b.pos);
      // that one killed you: the respawn has swept every round away already
      if(bullets[i]!==b) return;
      FX.burst(b.pos,8,b.color,6,0.25,6);
      killBullet(b,i); continue;
    }
  }
}

export {PROXY, callLob, shieldCanvases, shieldClean, shieldImpact, resetTold, strikesTold, setStrikeHook, bogEnemy, proofShield, hitShield, callStrike, clearStrikes, reviveAnchors, KIND, GEO, makeEnemy, weaverOver, drawWeaves, _vrSph, _vrInv, visualRadius, _to, _side, _sep, pushOutSolids, playerCenter, enemyShoot, updateEnemies, disposeEnemy, damageEnemy, killEnemy, BGEO, spawnBullet, killBullet, updateBullets};
