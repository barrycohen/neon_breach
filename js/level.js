import {THREE,V3,clamp,rand,T2} from './util.js';
import {game,enemies,bullets,pickups,anchors,conduits,pylons,storms,breaches,moltens,holes,voids,levelFlags} from './state.js';
import {scene,camera,setViewModelHidden} from './render.js';
import {MAT,sprite,cnv} from './textures.js';
import {kit,RB,ARC} from './kit.js';
import {hullMat} from './models.js';
import {colliders,solid,trim,own,clearWorld,setWorldLimits,groundAt,rayWorld,addSpace,setEnemyBoxes,ENEMY_BOXES} from './world.js';
import {player,damagePlayer,releaseGrapple,EYE,RAD,TALL,moveAxis,aabb,ovl} from './player.js';
import {makeEnemy,disposeEnemy,killBullet,clearStrikes,killEnemy,resetTold,setStrikeHook,bogEnemy,proofShield} from './enemies.js';
import {WEAPONS,setLoadout,grantWeapon,weaponIndex,owned, resetAmmo} from './weapons.js';
import {SFX} from './audio.js';
import {addGaze,updateGaze,resetGazeTold,gazeCfg,setGaze,clearPods,throwPod} from './gaze.js';
import {addAuthority,updateAuthority,authorityAction,authoritySnap,authorityRestore} from './authority.js';
import {addEnding,startEnding,endEnding,spinCores} from './ending.js';
import {dropPickup} from './pickups.js';
import {FX,explode} from './fx.js';
import {hud} from './hud.js';

/* Campaign levels: turns a level definition into geometry, colliders and
   entities, runs its doors, hazards, platforms, fights and scripted actions
   each frame, keeps checkpoints, and takes it all apart again cleanly. */

const LOCK_COLOUR = {amber:0xffc24d, cyan:0x5df0ff, magenta:0xff3fa4, lime:0x8dff6a,
  // a door the level opens - a fight, a relay - is white, so it never reads as
  // a key door whose key you have not found
  script:0xdfe7f2};

const level = {
  def:null, name:'', act:0,
  spawn:{p:[0,0,30], yaw:0},
  doors:[], keys:[], checkpoints:[], triggers:[], hazards:[], pickupDefs:[], shelters:[],
  goal:null, weapons:[], nodes:[], panels:[], anchors:anchors, movers:[], cages:[], held:{}, cp:-1, cpState:null, deaths:0,
  arena:null, respawnT:0, seenBriefs:{}, loaded:false, complete:false, racks:[],
  placed:[], killed:[], groups:new Map(), waves:[], deathWatch:[], counts:{},
  falls:[], riders:[], cables:[], dropper:null, dropping:[], sinking:[], loads:[], timers:[], deliveries:[], wrecks:[], podDrops:[],
  onComplete:null
};

/* ---------- shared entity geometry, built once ---------- */
let ENT=null;
function entGeo(){
  if(ENT) return ENT;
  const k=kit(4);
  k.h(RB(0.34,0.34,0.34,0.09),0x1b2a3c).g(ARC(0.30,0.035,T2,16),0xffffff,{rx:Math.PI/2});
  ENT={
    key:  kit(4).h(RB(0.20,0.42,0.09,0.04),0x25313f)
                .g(RB(0.11,0.11,0.12,0.03),0xffffff,{y:0.15})
                .g(RB(0.07,0.16,0.11,0.02),0xffffff,{y:-0.13}).build(),
    core: kit(3).h(ARC(0.46,0.05,T2,20),0x2b3a4e,{rx:Math.PI/2})
                .h(ARC(0.34,0.04,T2,18),0x2b3a4e,{rz:Math.PI/2})
                .g(RB(0.26,0.26,0.26,0.07),0xffffff).build(),
    // reads as a gun on a rack: body, barrel, grip, and a ring under it. The
    // point is only that it cannot be mistaken for the core at a distance.
    gun:  kit(3.4).h(RB(0.46,0.17,0.18,0.04),0x25313f)
                  .h(RB(0.30,0.08,0.09,0.02),0x2b3a4e,{x:-0.35})
                  .h(RB(0.11,0.21,0.13,0.03),0x25313f,{x:0.15,y:-0.16,rz:0.28})
                  .g(RB(0.34,0.05,0.07,0.02),0xffffff,{y:0.12})
                  .g(ARC(0.40,0.035,T2,20),0xffffff,{rx:Math.PI/2,y:-0.30}).build(),
    pad:  new THREE.RingGeometry(0.85,1.15,26),
    // an anchor reads as a fixture, not a pickup: a ring on a stalk, so it
    // is legible against a wall from across a shaft
    anchor: kit(3).h(ARC(0.52,0.07,T2,20),0x2b3a4e,{rx:Math.PI/2})
                  .h(RB(0.16,0.16,0.5,0.04),0x25313f,{z:-0.3})
                  .g(ARC(0.38,0.05,T2,18),0xffffff,{rx:Math.PI/2}).build(),
    // A conduit: a squat post with a wound head and a core that lights when it
    // is powered. Squat so it cannot be mistaken for a pylon.
    conduit: kit(3).h(RB(0.36,0.62,0.36,0.05),0x25313f,{y:-0.30})
                   .h(ARC(0.34,0.055,T2,20),0x2b3a4e,{rx:Math.PI/2,y:0.10})
                   .h(ARC(0.34,0.055,T2,20),0x2b3a4e,{rx:Math.PI/2,y:0.34})
                   .g(RB(0.20,0.20,0.20,0.07),0xffffff,{y:0.22}).build(),
    // A pylon: a tall mast with a ring at the top - the relay, and tall so a
    // line of them reads as a line from across a room.
    pylon: kit(3).h(RB(0.12,1.30,0.12,0.03),0x25313f,{y:-0.35})
                 .h(ARC(0.26,0.045,T2,18),0x2b3a4e,{rx:Math.PI/2,y:0.34})
                 .g(ARC(0.18,0.035,T2,16),0xffffff,{rx:Math.PI/2,y:0.34}).build()
  };
  return ENT;
}

/* ---------- build helpers ---------- */
// heat: the glow of metal far past red - a furnace's seams, not a lamp
const HEAT_MAT=new THREE.MeshBasicMaterial({color:0xff5a14});
// `neon` and its colours: a piece that is all glow - an edge strip under
// something only ever seen from below, where a top trim never shows
function pieceMat(name){
  return name==='wall'?MAT.wall : name==='dark'?MAT.dark : name==='heat'?HEAT_MAT :
         name==='neonA'?MAT.neonA : name==='neonC'?MAT.neonC : name==='neonM'?MAT.neonM : MAT.block;
}
function trimMat(name){
  return name==='magenta'?MAT.neonM : name==='amber'?MAT.neonA : MAT.neonC;
}
/* A neon arrow, pointing up its texture: one canvas, a material per trim colour,
   shared across levels like the trim's own. */
let arrowTex=null; const arrowMats={};
function arrowMat(name){
  if(arrowMats[name]) return arrowMats[name];
  if(!arrowTex){
    const c=cnv(256,256), x=c.getContext('2d');
    x.beginPath();
    x.moveTo(128,22); x.lineTo(226,120); x.lineTo(166,120); x.lineTo(166,234);
    x.lineTo(90,234); x.lineTo(90,120); x.lineTo(30,120); x.closePath();
    x.fillStyle='rgba(255,255,255,0.22)'; x.fill();
    x.lineJoin='round'; x.strokeStyle='#fff'; x.shadowColor='#fff';
    x.shadowBlur=18; x.lineWidth=14; x.stroke(); x.shadowBlur=0; x.lineWidth=8; x.stroke();
    arrowTex=new THREE.CanvasTexture(c);
  }
  return arrowMats[name]=new THREE.MeshBasicMaterial({map:arrowTex,color:trimMat(name).color,
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
}

/* `far`: a piece the fog never hides - a landmark that has to be seen from
   the far end of a level, like 3-3's citadel at the end of its causeway. */
const farMats=new Map();
function farMat(m,far){
  if(!far||!m) return m;
  if(!farMats.has(m)){ const f=m.clone(); f.fog=false; farMats.set(m,f); }
  return farMats.get(m);
}

function buildPiece(g){
  if(!g||!g.p||!g.s){ console.warn('level: skipping malformed geometry entry',g); return; }
  const [x,y,z]=g.p, [w,h,d]=g.s;
  if(g.grate){ buildGrate(x,y,z,w,h,d); return; }
  if(g.window){ buildWindow(x,y,z,w,h,d,g); return; }
  if(g.breach){ buildBreach(g); return; }
  // A piece riding a platform - the crane's beam, its trolley - goes where the
  // platform goes. Most are only to look at (`nocol`): no collider to stand on.
  // A piece in a fall group comes down with it, collider and all.
  if(g.on||g.fall||g.nocol){
    const m=solid(x,y,z,w,h,d,farMat(pieceMat(g.mat),g.far));
    let col=colliders[colliders.length-1];
    if(g.walk) col.walk=true;
    if(g.nocol){ colliders.pop(); col=null; m.castShadow=false; }
    const tm=g.trim?trim(x,y+h,z,w,d,farMat(trimMat(g.trim),g.far)):null;
    const part={m, tm, col, base:[x,y,z], h};
    // `flat`: across with it, never up or down - the trolley on the beam over a
    // cradle let down on its cables
    if(g.on) level.riders.push({...part, on:g.on, flat:!!g.flat, keep:!!g.keep});
    else if(g.fall){ const f=fallById(g.fall); if(f) f.parts.push(part); }
    return;
  }
  // A piece with an id is a panel the level can pull: it sinks into the floor
  // and stops being solid. Built as its own thing rather than a wall slab: a
  // wall's trim is a separate mesh that would stay hanging in the air when the
  // panel dropped, and a slab's top face would flicker against the lintel.
  if(g.id){
    const grp=buildPanelMesh(x,y,z,w,h,d);
    colliders.push({min:V3(x-w/2,y,z-d/2),max:V3(x+w/2,y+h,z+d/2)});
    level.panels.push({id:g.id, mesh:grp, col:colliders[colliders.length-1],
                       y0:y, h:h, t:0, open:false});
    return;
  }
  const sm=solid(x,y,z,w,h,d,farMat(pieceMat(g.mat),g.far));
  // floor, as opposed to cover or wall: what the Gaze's light is aimed at
  if(g.walk) colliders[colliders.length-1].walk=true;
  // `lightThru`: solid to you, but the eye's light and sight pass it as they
  // pass glass (the Authority's body, hanging over a fight it must not shade)
  if(g.lightThru){ colliders[colliders.length-1].glass=true; if(sm) sm.castShadow=false; }
  if(g.wide) colliders[colliders.length-1].wide=true;   // a floor, though small: a lob doesn't cover it whole
  if(g.bed) colliders[colliders.length-1].bed=true;   // under molten metal: you wade on it, nothing hovers over it
  if(g.trim) trim(x,y+h,z,w,d,farMat(trimMat(g.trim),g.far));
  if(g.vent) buildVent(x,y+h,z,w,d);
}

/* A breach panel: reinforced plate that only a Sunder charge breaks. It has to
   read as different from wall at a glance - dark plate, a hazard border, and
   cracks glowing the Sunder's orange, as if it is already half split. When it
   goes it throws chunks, and runs its `do`. Broken stays broken: a wall you
   blew out is your work, like a key, and a death does not put it back. */
let BREACH_TEX=null;
function breachTex(){
  if(BREACH_TEX) return BREACH_TEX;
  // A patch bolted over a hole: plates with seams between them, heat leaking
  // orange through the seams, and fine stress cracks starting at the plates'
  // corners.
  const S=512, mk=()=>{ const c=document.createElement('canvas'); c.width=c.height=S; return c; };
  const base=mk(), glow=mk(), b=base.getContext('2d'), gl=glow.getContext('2d');
  b.fillStyle='#26282f'; b.fillRect(0,0,S,S);
  gl.fillStyle='#000'; gl.fillRect(0,0,S,S);
  const B=34, N=3, cell=(S-2*B)/N;
  // the plates, each a slightly different shade, with a little speckle
  for(let i=0;i<N;i++) for(let j=0;j<N;j++){
    const x=B+i*cell, y=B+j*cell, v=36+Math.round(rand(-6,6));
    b.fillStyle='rgb('+v+','+(v+2)+','+(v+9)+')'; b.fillRect(x+3,y+3,cell-6,cell-6);
    for(let q=0;q<120;q++){ b.fillStyle='rgba(0,0,0,'+rand(0.05,0.18).toFixed(2)+')'; b.fillRect(x+rand(4,cell-6),y+rand(4,cell-6),2,2); }
    b.fillStyle='rgba(255,255,255,0.05)'; b.fillRect(x+3,y+3,cell-6,3);               // a lit top edge
    b.fillStyle='#4a4e5a'; for(const [rx,ry] of [[10,10],[cell-10,10],[10,cell-10],[cell-10,cell-10]]){ b.beginPath(); b.arc(x+rx,y+ry,4,0,T2); b.fill(); }
  }
  // the seams: dark in the plate; heat seeps through them here and there, in
  // patches that fade at their ends - lit full length, they read as laser beams
  b.fillStyle='#0c0d11';
  for(let i=0;i<=N;i++){ const p=B+i*cell; b.fillRect(p-3,B,6,S-2*B); b.fillRect(B,p-3,S-2*B,6); }
  gl.shadowColor='#ff6a1a'; gl.shadowBlur=8;
  const seep=(x0,y0,x1,y1)=>{
    const g=gl.createLinearGradient(x0,y0,x1,y1);
    g.addColorStop(0,'rgba(255,120,40,0)'); g.addColorStop(0.5,'rgba(255,120,40,'+rand(0.45,0.8).toFixed(2)+')'); g.addColorStop(1,'rgba(255,120,40,0)');
    gl.strokeStyle=g; gl.lineWidth=2.5; gl.beginPath(); gl.moveTo(x0,y0); gl.lineTo(x1,y1); gl.stroke();
  };
  for(let i=1;i<N;i++){
    const p=B+i*cell;
    for(let q=0;q<3;q++){
      if(Math.random()<0.4) continue;
      const a=B+rand(0,S-2*B-60), l=rand(30,90);
      seep(p,a,p,a+l); 
      const c=B+rand(0,S-2*B-60), m=rand(30,90);
      seep(c,p,c+m,p);
    }
  }
  // stress cracks: fine, short, branching out from a few of the inner corners
  const crack=(x,y,a,len,w,depth)=>{
    for(const ctx of [b,gl]){ ctx.lineWidth=ctx===gl?w*0.8:w; }
    let px=x, py=y;
    for(let q=0;q<len;q++){
      const nx=px+Math.cos(a)*rand(6,12), ny=py+Math.sin(a)*rand(6,12);
      b.strokeStyle='#08090c'; b.beginPath(); b.moveTo(px,py); b.lineTo(nx,ny); b.stroke();
      gl.strokeStyle='rgba(255,110,40,0.75)'; gl.beginPath(); gl.moveTo(px,py); gl.lineTo(nx,ny); gl.stroke();
      px=nx; py=ny; a+=rand(-0.5,0.5);
      if(depth<2&&Math.random()<0.18) crack(px,py,a+rand(-1,1),Math.floor(len*0.5),w*0.7,depth+1);
    }
  };
  gl.shadowBlur=4;
  for(const [ci,cj] of [[1,1],[2,1],[1,2],[2,2]]){
    if(Math.random()<0.35) continue;
    const x=B+ci*cell, y=B+cj*cell;
    for(let k=0;k<3;k++) crack(x,y,rand(0,T2),Math.floor(rand(4,9)),2,0);
  }
  gl.shadowBlur=0;
  // the hazard border, narrower
  b.save(); b.beginPath(); b.rect(0,0,S,S); b.rect(22,22,S-44,S-44); b.clip('evenodd');
  for(let i=-S;i<S*2;i+=44){ b.fillStyle='#c76a1c'; b.beginPath(); b.moveTo(i,0); b.lineTo(i+22,0); b.lineTo(i+22-S,S); b.lineTo(i-S,S); b.fill(); }
  b.restore();
  BREACH_TEX={map:new THREE.CanvasTexture(base), glow:new THREE.CanvasTexture(glow)};
  return BREACH_TEX;
}
// a conductor's housing: dark plate banded in amber, a white band at its top
let CONDUCTOR_MAT=null;
function conductorMat(){
  if(CONDUCTOR_MAT) return CONDUCTOR_MAT;
  const S=128, c=document.createElement('canvas'); c.width=c.height=S;
  const g=c.getContext('2d');
  g.fillStyle='#262230'; g.fillRect(0,0,S,S);
  g.fillStyle='#ffae2a'; for(const y of [34,62,90]) g.fillRect(0,y,S,8);
  g.fillStyle='#fff1d6'; g.fillRect(0,4,S,12);
  g.strokeStyle='#14111a'; g.lineWidth=6; g.strokeRect(3,3,S-6,S-6);
  const e=document.createElement('canvas'); e.width=e.height=S;
  const h=e.getContext('2d'); h.fillStyle='#000'; h.fillRect(0,0,S,S);
  h.fillStyle='#ff9a1a'; for(const y of [34,62,90]) h.fillRect(0,y,S,8);
  h.fillStyle='#fff1d6'; h.fillRect(0,4,S,12);
  CONDUCTOR_MAT=new THREE.MeshLambertMaterial({map:new THREE.CanvasTexture(c), emissive:0xffffff,
    emissiveMap:new THREE.CanvasTexture(e), emissiveIntensity:0.9});
  return CONDUCTOR_MAT;
}
const debris=[];
const SHUT_MAT=new THREE.MeshLambertMaterial({color:0x3a4250});
let fromPanel=0;                       // inside a panel's `do`: what it spawns is the panel's
let fromPhase=0;                       // inside a boss phase's: the phase runs again after a death, so is its
function buildBreach(g){
  const [x,y,z]=g.p, [w,h,d]=g.s;
  const T=breachTex();
  const mat=new THREE.MeshLambertMaterial({map:T.map, emissive:0xff6a1a, emissiveMap:T.glow, emissiveIntensity:1});
  mat.__perObject=true;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  mesh.position.set(x,y+h/2,z); scene.add(own(mesh));
  const col={min:V3(x-w/2,y,z-d/2),max:V3(x+w/2,y+h,z+d/2),breach:true};
  colliders.push(col);
  const rec={g, mesh, mat, col, broken:false, do:g.do||[], id:g.id||null, ph:Math.random()*T2,
             on:g.on||null, base:[x,y,z],        // a panel can ride a platform
             shut:!!g.shut};
  // Shut: plain steel, and nothing breaks it, until an `expose` names it.
  if(rec.shut) mesh.material=SHUT_MAT;
  // A conductor: a housing with a lightning rod on it, in the amber and white
  // of the spires that hold the eye up. Nothing you carry breaks it - only the
  // Gaze's own lightning, so the way to it is to bring the eye down on it.
  if(g.conductor){
    rec.conductor=true;
    mesh.material=conductorMat(); rec.mat=mesh.material;
    const rodH=g.rod||3.2;
    const rod=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.16,rodH,8),MAT.neonA||mesh.material);
    rod.position.y=h/2+rodH/2; mesh.add(rod); rec.rodParts=[rod];
    for(const f of [0.3,0.62]){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(0.34,0.06,6,18),rod.material);
      ring.rotation.x=Math.PI/2; ring.position.y=h/2+rodH*f; mesh.add(ring); rec.rodParts.push(ring);
    }
    const ballM=new THREE.MeshBasicMaterial({color:0xfff4dc}); ballM.__perObject=true;
    const ball=new THREE.Mesh(new THREE.SphereGeometry(0.38,14,10),ballM);
    ball.position.y=h/2+rodH+0.2; mesh.add(ball);
    const glow=sprite(0xffd090,3.2,0.55); glow.material.__perObject=true; ball.add(glow);
    rec.tip=ball; rec.tipGlow=glow;
    conductorLook(rec);
  }
  // and when one is lit, a glow round it, so it can be picked out far off
  if(rec.shut&&!rec.conductor){ rec.halo=sprite(0xff7a2a,Math.min(16,Math.max(w,h,d)*7),0); rec.halo.material.__perObject=true; rec.halo.visible=false; mesh.add(rec.halo); }
  rec.breakIt=at=>breakPanel(rec,at);
  rec.strikeIt=at=>breakPanel(rec,at,true);
  // a boss panel in a floor: framed in the boss rooms' red metal, the way in
  if(g.boss){
    const T=0.5, fy=y+h;
    // lapped 3cm over the panel: flush with its edge, its inner faces shared a
    // plane with the floor's neon rim there, and the two flickered all round it
    const e=0.03;
    for(const [fx,fz,fw,fd] of [[x,z-d/2-T/2+e/2,w+T*2,T+e],[x,z+d/2+T/2-e/2,w+T*2,T+e],
                                [x-w/2-T/2+e/2,z,T+e,d-2*e],[x+w/2+T/2-e/2,z,T+e,d-2*e]]){
      const m=new THREE.Mesh(new THREE.BoxGeometry(fw,0.18,fd),MAT.portal);
      m.position.set(fx,fy+0.09,fz); scene.add(own(m));
    }
  }
  breaches.push(rec);
}
// A conductor still shut is dead steel: grey housing, grey rod, its tip dark.
const ROD_OFF=new THREE.MeshLambertMaterial({color:0x4a5060});
function conductorLook(b){
  if(!b.conductor) return;
  const off=!!b.shut;
  b.mesh.material=off?SHUT_MAT:b.mat;
  for(const m of b.rodParts) m.material=off?ROD_OFF:(MAT.neonA||b.mat);
  b.tip.material.color.setHex(off?0x3a3f4a:0xfff4dc);
  b.tipGlow.visible=!off;
}
function breakPanel(b,at,struck){
  if(b.broken) return;
  if(b.shut||(b.conductor&&!struck)){                          // a charge on plain steel: sparks, and nothing
    const c=b.col; _v.set((c.min.x+c.max.x)/2,(c.min.y+c.max.y)/2,(c.min.z+c.max.z)/2);
    FX.burst(at||_v,14,0xffd0a0,7,0.25,3); SFX.hit(); return;
  }
  b.broken=true; b.mesh.visible=false;
  const i=colliders.indexOf(b.col); if(i>=0) colliders.splice(i,1);
  const c=b.col, cx=(c.min.x+c.max.x)/2, cy=(c.min.y+c.max.y)/2, cz=(c.min.z+c.max.z)/2;
  const sx=c.max.x-c.min.x, sy=c.max.y-c.min.y, sz=c.max.z-c.min.z;
  // chunks, thrown away from where the charge burst
  const n=Math.min(26,Math.max(10,Math.round(sx*sy*sz*1.5+sx*sy+sy*sz)));
  for(let k=0;k<n;k++){
    const m=new THREE.Mesh(new THREE.BoxGeometry(rand(0.2,0.6),rand(0.2,0.6),rand(0.1,0.3)),b.mat);
    m.position.set(cx+rand(-sx/2,sx/2),cy+rand(-sy/2,sy/2),cz+rand(-sz/2,sz/2));
    const v=V3(m.position.x-(at?at.x:cx),m.position.y-(at?at.y:cy)+1,m.position.z-(at?at.z:cz)).normalize().multiplyScalar(rand(5,11));
    scene.add(m); debris.push({m,v,t:rand(1.6,2.6),spin:V3(rand(-8,8),rand(-8,8),rand(-8,8))});
  }
  _v.set(cx,cy,cz);
  FX.burst(_v,40,0xff7a2a,12,0.5,8); FX.burst(_v,20,0x9aa0b0,9,0.6,10); FX.ring(_v,0xff7a2a,Math.max(sx,sy,sz)*1.6,0.45);
  SFX.breach(); player.shake=Math.min(0.7,player.shake+0.25);
  fromPanel++; try{ runActions(b.do); } finally{ fromPanel--; }
}
function mendPanel(b){
  b.broken=false; b.mesh.visible=true;
  if(colliders.indexOf(b.col)<0) colliders.push(b.col);
}
function updateDebris(dt){
  for(let i=debris.length-1;i>=0;i--){
    const k=debris[i]; k.t-=dt;
    if(k.t<=0){ scene.remove(k.m); k.m.geometry.dispose(); debris.splice(i,1); continue; }
    // a piece waiting for the blast to reach it holds still, then goes with one
    if(k.wait>0){ k.wait-=dt; if(k.wait>0) continue; if(k.boom) chunkBlast(k.m.position,k.boom>1); }
    k.v.y-=22*dt; k.m.position.addScaledVector(k.v,dt);
    k.m.rotation.x+=k.spin.x*dt; k.m.rotation.y+=k.spin.y*dt; k.m.rotation.z+=k.spin.z*dt;
    if(k.burn&&Math.random()<dt*14) fireball(k.m.position,rand(2.5,4.5),0.7,0xff7a2a);
  }
  updateFireballs(dt);
}
function chunkBlast(p,loud){
  FX.burst(p,26,0xff7a2a,11,0.55,9); FX.burst(p,10,0xffffff,14,0.22,4); FX.ring(p,0xff7a2a,5,0.35);
  fireball(p,14,0.8,0xff6a2a); fireball(p,6,0.3,0xfff0d0);
  if(loud) SFX.boom();
}
/* A fireball: a glow that swells and fades. The sparks of a burst are a third
   of a metre across, too small to read from far off; this is what does. */
const fireballs=[];
function fireball(p,size,life,color){
  const m=sprite(color,size,1); m.position.copy(p); m.material.fog=false; scene.add(m);
  fireballs.push({m,size,life,t:0});
}
function updateFireballs(dt){
  for(let i=fireballs.length-1;i>=0;i--){
    const f=fireballs[i]; f.t+=dt; const k=f.t/f.life;
    if(k>=1){ scene.remove(f.m); f.m.material.dispose(); fireballs.splice(i,1); continue; }
    f.m.scale.setScalar(f.size*(0.45+0.55*Math.min(1,f.t/0.12))*(1+0.35*k));
    f.m.material.opacity=Math.pow(1-k,1.5);
  }
}

/* ---------- things that fall ----------
   3-2 is about the structure coming down. A fall is a group of geometry pieces
   (`fall: id` on each, the group in def.falls) that, when a `fall` action names
   it, shudders for `warn` seconds and then drops `dy` - straight down, under
   gravity, braking over the last `brake` metres if it has one - and stays where
   it lands, which from then on is floor. Whoever is standing on it rides it
   down. `jolt` shakes it without letting go: the first of two clamps.
   A death puts back what fell since the checkpoint, as it mends panels. */
const FALL_G=30;
function fallById(id){ return level.falls.find(f=>f.id===id)||null; }
function placeFall(f,shake){
  // while it shudders its trim blinks: amber, going
  const blink=f.state==='warn'?Math.sin(f.t*26)>0:true;
  for(const p of f.parts){
    if(p.tm) p.tm.visible=blink;
    const [x,y,z]=p.base, sx=shake?rand(-shake,shake):0, sz=shake?rand(-shake,shake):0, sy=shake?rand(-shake,shake)*0.5:0;
    p.m.position.set(x+sx,y+p.h/2+f.off+sy,z+sz);
    if(p.tm) p.tm.position.set(x+sx,y+p.h+0.05+f.off+sy,z+sz);
    if(p.col){ p.col.min.y=y+f.off; p.col.max.y=y+p.h+f.off; }
  }
  for(const c of level.checkpoints) if(c.fall===f.id) c.mesh.position.y=c.p[1]+0.05+f.off;
}
// scrap the crane threw on to a floor goes down with it
function takeLoads(f){
  for(let i=level.loads.length-1;i>=0;i--){
    const L=level.loads[i], c=L.col, cx=(c.min.x+c.max.x)/2, cz=(c.min.z+c.max.z)/2;
    if(!f.parts.some(p=>p.col&&cx>p.col.min.x&&cx<p.col.max.x&&cz>p.col.min.z&&cz<p.col.max.z&&Math.abs(c.min.y-p.col.max.y)<0.2)) continue;
    f.parts.push({m:L.m, tm:null, col:c, base:[cx,c.min.y-f.off,cz], h:c.max.y-c.min.y, load:true});
    level.loads.splice(i,1);
  }
}
function dropLoadsOf(f){
  for(let i=f.parts.length-1;i>=0;i--){ const p=f.parts[i]; if(!p.load) continue;
    scene.remove(p.m); p.m.geometry.dispose(); const k=colliders.indexOf(p.col); if(k>=0) colliders.splice(k,1); f.parts.splice(i,1); }
}
function resetFall(f){ dropLoadsOf(f); f.state='up'; f.off=0; f.v=0; f.t=0; f.jolt=0; placeFall(f,0); }
function finishFall(f){ f.state='down'; f.off=f.dy; f.v=0; placeFall(f,0); }
// dust off it where it is, and on landing a crash - a splash of metal if it came down in a pool
function fallDust(x,y,z,n){ _v.set(x,y,z); FX.burst(_v,n,0x9aa0b0,5,0.7,2); }
function crashAt(x,y,z,w,d){
  _v.set(x,y,z);
  // sized to the piece, but only so far
  const R=Math.min(7,Math.max(w,d)*0.6);
  FX.burst(_v,40,0x9aa0b0,12,0.8,6); FX.ring(_v,0xc8ccd8,R,0.5);
  for(const h of moltens){
    if(h.off) continue;
    const top=h.p[1]+h.s[1];
    if(Math.abs(x-h.p[0])<h.s[0]/2+w/2&&Math.abs(z-h.p[2])<h.s[2]/2+d/2&&y<top+2){
      _v.set(x,top+0.3,z); FX.burst(_v,50,0xff8a30,14,0.7,9); FX.ring(_v,0xff8a30,R*1.3,0.5); break;
    }
  }
  SFX.crash();
  const dd=Math.hypot(player.pos.x-x,player.pos.y-y,player.pos.z-z);
  player.shake=Math.min(0.8,player.shake+Math.max(0,0.7-dd/80));
}
function updateFalls(dt){
  for(const f of level.falls){
    if(f.jolt>0){ f.jolt-=dt; placeFall(f,f.jolt>0?0.12*Math.min(1,f.jolt*2):0);
      if(Math.random()<dt*14){ const p=f.parts[(Math.random()*f.parts.length)|0]; if(p) fallDust(p.base[0]+rand(-2,2),p.base[1],p.base[2]+rand(-2,2),4); } }
    if(f.state==='up'||f.state==='down') continue;
    const prev=f.off;
    if(f.state==='warn'){
      f.t+=dt;
      placeFall(f,0.05+0.1*Math.min(1,f.t/f.warn));
      if(Math.random()<dt*20){ const p=f.parts[(Math.random()*f.parts.length)|0]; if(p) fallDust(p.base[0]+rand(-3,3),p.base[1]+f.off,p.base[2]+rand(-3,3),5); }
      if(f.t>=f.warn){ f.state='drop'; f.v=0; takeLoads(f); }
      continue;
    }
    f.v+=FALL_G*dt;
    const rem=f.off-f.dy;
    if(f.brake&&rem<f.brake) f.v=Math.min(f.v,Math.sqrt(2*16*rem)+1.2);
    f.off=Math.max(f.dy,f.off-f.v*dt);
    const delta=f.off-prev;
    // carry whoever stands on it: they ride it down
    if(player.onGround){
      for(const p of f.parts){
        if(!p.col) continue;
        const c=p.col, top=c.max.y-delta;
        if(player.pos.x>c.min.x-RAD&&player.pos.x<c.max.x+RAD&&player.pos.z>c.min.z-RAD&&player.pos.z<c.max.z+RAD&&
           Math.abs(player.pos.y-top)<0.35){ player.pos.y+=delta; break; }
      }
    }
    placeFall(f,0);
    // ...and whoever it comes down on goes up on top of it, not inside it.
    for(const p of f.parts){
      if(!p.col) continue;
      const c=p.col;
      if(player.pos.x>c.min.x&&player.pos.x<c.max.x&&player.pos.z>c.min.z&&player.pos.z<c.max.z&&
         player.pos.y<c.max.y-0.01&&player.pos.y+TALL>c.min.y){
        player.pos.y=c.max.y; if(player.vel.y<0) player.vel.y=0;
      }
    }
    if(f.off<=f.dy){
      f.state='down';
      // one crash for the group, where most of it is
      let sx=0,sy=0,sz=0,n=0,x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
      for(const p of f.parts){ if(!p.col) continue; const c=p.col;
        sx+=(c.min.x+c.max.x)/2; sy+=c.min.y; sz+=(c.min.z+c.max.z)/2; n++;
        x0=Math.min(x0,c.min.x); x1=Math.max(x1,c.max.x); z0=Math.min(z0,c.min.z); z1=Math.max(z1,c.max.z); }
      if(n) crashAt(sx/n,sy/n,sz/n,x1-x0,z1-z0);
    }
  }
}
/* The Armoury's plates: iron over a drop. The eye's lightning cracks the one
   it lands on. A cracked plate still holds you, but not the Bastion: over one,
   it crashes through to its waist, its armour burst, and is held there; the
   plate is gone, and it keeps out of the hole after. */
let CRACK_TEX=null;
function crackTex(){
  if(CRACK_TEX) return CRACK_TEX;
  const c=cnv(256,256), x=c.getContext('2d');
  x.lineCap='round'; x.lineJoin='round';
  const branch=(px,py,a,len,w,depth)=>{
    x.lineWidth=w; x.beginPath(); x.moveTo(px,py);
    let cx=px, cy=py;
    for(let i=0;i<5;i++){ a+=rand(-0.6,0.6); cx+=Math.cos(a)*len/5; cy+=Math.sin(a)*len/5; x.lineTo(cx,cy); }
    x.stroke();
    if(depth>0) for(let k=0;k<2;k++) branch(cx,cy,a+rand(-1,1),len*0.6,w*0.6,depth-1);
  };
  for(const [col,blur,w] of [['rgba(255,110,40,0.9)',14,7],['#ffd9a0',0,2.5]]){
    x.strokeStyle=col; x.shadowColor='#ff6a20'; x.shadowBlur=blur;
    for(let k=0;k<6;k++) branch(128,128,k*Math.PI/3+0.3,90,w,2);
  }
  CRACK_TEX=new THREE.CanvasTexture(c);
  return CRACK_TEX;
}
function addCrack(mesh,w,h,d){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w*0.94,d*0.94),
    new THREE.MeshBasicMaterial({map:crackTex(),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
                                 polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  m.rotation.x=-Math.PI/2; m.position.y=h/2+0.02; m.rotation.z=rand(0,T2); m.visible=false;
  mesh.add(m);
  return m;
}
function crackLook(m,on){ m.cracked=on; m.plate.visible=on; }
// where the lightning landed: the plate it landed on cracks
function crackAt(k){
  for(const m of level.movers){
    if(!m.plate||m.fallen||m.fall||m.cracked) continue;
    const [w,h,d]=m.s;
    if(Math.abs(k.x-m.at.x)>w/2||Math.abs(k.z-m.at.z)>d/2||Math.abs(k.y-(m.at.y+h))>2) continue;
    crackLook(m,true);
    _v.set(k.x,m.at.y+h+0.2,k.z); FX.burst(_v,24,0xff8a3a,8,0.4,5); SFX.crackle();
  }
}
setStrikeHook(crackAt);
function plateHoles(){
  holes.length=0;
  for(const m of level.movers){
    if(!m.plate||!(m.fallen||m.fall)) continue;
    const [w,,d]=m.s, x=m.p0[0], z=m.p0[2];
    holes.push({x0:x-w/2, x1:x+w/2, z0:z-d/2, z1:z+d/2});
  }
}
const BOG_T=6;
function updatePlates(dt){
  for(const m of level.movers){
    if(!m.plate) continue;
    // Over a hole already open, what rides the plates falls in just as it does
    // through a cracked one. Hovering on, it sank out of the room (the tank's bed
    // is no floor to what hovers) and died where nobody saw it. (Not while it is
    // still climbing out of the hole it last fell through.)
    if(m.fallen){
      const [w,h,d]=m.s, x=m.p0[0], z=m.p0[2];
      for(const e of enemies){
        if(e.dead||e.dormant||e.bog||!e.rides||e.bogFloor!==undefined) continue;
        if(Math.abs(e.pos.x-x)>w/2+0.05||Math.abs(e.pos.z-z)>d/2+0.05) continue;
        bogEnemy(e,x,z,m.p0[1]+h,BOG_T); m.holeT=0;
      }
    }
    // `refill`: that long after the hole is clear, a new plate is hoisted up out
    // of the tank into it - but only while more than `spare` holes are open:
    // with every plate gone the fight could never be won.
    if(m.fallen&&m.refill){
      if(level.movers.filter(q=>q.plate&&q.fallen).length<=m.spare){ m.holeT=0; continue; }
      const [w,,d]=m.s, x=m.p0[0], z=m.p0[2];
      // (over it, not beside it: the Bastion waiting at its edge must not keep it open)
      const busy=enemies.some(e=>!e.dead&&(e.bog||Math.abs(e.pos.x-x)<w/2&&Math.abs(e.pos.z-z)<d/2));
      m.holeT=busy?0:(m.holeT||0)+dt;
      if(m.holeT>=m.refill) refillPlate(m);
      continue;
    }
    if(!m.cracked||m.fallen||m.fall) continue;
    const [w,h,d]=m.s;
    for(const e of enemies){
      if(e.dead||e.dormant||e.bog||!e.K.shieldHits) continue;
      if(Math.abs(e.pos.x-m.at.x)>w/2-1||Math.abs(e.pos.z-m.at.z)>d/2-1) continue;
      runActions([{a:'fall', mover:m.id, to:[m.at.x,-1000,m.at.z], warn:0.15, shatter:[m.at.x,m.at.z]}]);
      bogEnemy(e,m.at.x,m.at.z,m.at.y+h,BOG_T);
      plateHoles(); m.holeT=0;
      // a briefing, which stops the game: a banner mid-fight goes unread
      // (none for the quench: the Armoury's own briefing covers it)
      if(!level.seenBriefs.plateFell){ level.seenBriefs.plateFell=true;
        if(!e.quench) hud.brief('THROUGH THE FLOOR','Everything hurts it while it is stuck.'); }
      break;
    }
  }
}
function refillPlate(m){
  const p=m.p0;
  m.fallen=false; m.fall=null; m.shk=null; m.holeT=0;
  m.p=[p[0],p[1]-6,p[2]]; m.to=p.slice(); m.t=0; m.phase=0; m.period=5; m.once=true; m.then=null;
  m.running=true; m.stopped=false;
  m.mesh.visible=true; if(m.tm) m.tm.visible=true;
  crackLook(m,false); placeMover(m); plateHoles();
  // (silent: a rising sound reads as picking something up)
  _v.set(p[0],p[1],p[2]); FX.burst(_v,40,0xe8f6ff,10,1.2,-4);
}
/* A platform can fall too: `fall` with `mover` and `to`. It stops whatever it
   was doing, slides over the warning to above `to`, shuddering, then drops onto
   it - 3-2's cradle, coming down with the core when its last clamp goes. What
   rides it comes too. */
function moverFall(m,dt){
  const F=m.fall; F.t+=dt;
  let nx,ny,nz; m.shk=null;
  if(!F.drop){
    const k=Math.min(1,F.t/F.warn), e=k*k*(3-2*k);
    nx=F.from[0]+(F.to[0]-F.from[0])*e; nz=F.from[2]+(F.to[2]-F.from[2])*e; ny=F.from[1];
    const a=0.04+0.14*k; m.shk=[rand(-a,a),rand(-a,a)*0.5,rand(-a,a)];
    if(F.t>=F.warn){ takeRiders(m); if(F.shatter){ shatterMover(m,F); return; } F.drop=true; F.v=0; }
  }else{
    F.v+=FALL_G*dt; nx=F.to[0]; nz=F.to[2]; ny=Math.max(F.to[1],m.at.y-F.v*dt);
  }
  const [w,h,d]=m.s;
  m.at.set(nx,ny,nz);
  const s=m.shk||[0,0,0];
  m.mesh.position.set(nx+s[0],ny+h/2+s[1],nz+s[2]);
  if(m.tm) m.tm.position.set(nx+s[0],ny+h+0.05+s[1],nz+s[2]);
  m.col.min.set(nx-w/2,ny,nz-d/2); m.col.max.set(nx+w/2,ny+h,nz+d/2);
  if(F.drop&&ny<=F.to[1]){
    m.p=F.to.slice(); m.to=F.to.slice(); m.t=0; m.phase=0; m.once=true; m.then=null;
    m.fall=null; m.fallen=true; m.shk=null;
    crashAt(nx,ny,nz,Math.max(w,6),Math.max(d,6));
  }
}
/* What stands on a platform as it goes goes down with it, rather than being
   left hovering where it was, out of reach. (Not what flies.) */
function takeRiders(m){
  const [w,h,d]=m.s, top=m.at.y+h;
  for(const e of enemies.slice()){
    if(e.dead||e.K.boss||e.kind==='node'||e.kind==='drone'||e.dormant) continue;
    if(Math.abs(e.pos.x-m.at.x)>w/2+e.rad||Math.abs(e.pos.z-m.at.z)>d/2+e.rad) continue;
    if(e.pos.y<top-0.5||e.pos.y>top+(e.K.hover||1)+2.5) continue;
    killEnemy(e,false);
  }
}
/* `topple` (dir [x,z]): it goes over at its foot, falling away that way, and
   breaks up as it goes down - 3-3's spires, each one's conductor broken. Gone
   for good as it starts: a checkpoint after has it gone, one before has it
   standing. */
const _tq=new THREE.Quaternion(), _ta=V3(), _tc=V3();
function startTopple(m,dir){
  if(m.topple||m.fallen) return;
  const [w,h,d]=m.s, L=Math.hypot(dir[0],dir[1])||1;
  const T=m.topple={t:0, v:0, drop:0, dx:dir[0]/L, dz:dir[1]/L, x:m.at.x, y:m.at.y, z:m.at.z};
  T.px=T.x+T.dx*w/2; T.pz=T.z+T.dz*d/2;
  m.running=false; m.stopped=true; m.fallen=true; m.shattered=true;
  const gone=[T.x,-1000,T.z]; m.p=gone.slice(); m.to=gone.slice(); m.t=0; m.phase=0; m.once=true; m.then=null;
  m.col.min.y=-1000.5; m.col.max.y=-1000;
  for(let k=0;k<6;k++){ _tc.set(T.x,T.y+h*k/6,T.z); FX.burst(_tc,14,0xffc24d,8,0.6,4); }
  SFX.creak(1.6); SFX.crash();
}
function toppleStep(m,dt){
  const T=m.topple, [w,h,d]=m.s; T.t+=dt;
  const th=Math.min(1.75,0.6*T.t*T.t);
  if(th>=1.75){ T.v+=30*dt; T.drop+=T.v*dt; }
  _ta.set(T.dz,0,-T.dx); _tq.setFromAxisAngle(_ta,th);
  _tc.set(T.x-T.px,h/2,T.z-T.pz).applyQuaternion(_tq);
  m.mesh.quaternion.copy(_tq); m.mesh.position.set(T.px+_tc.x,T.y+_tc.y-T.drop,T.pz+_tc.z);
  if(m.tm){ _tc.set(T.x-T.px,h+0.05,T.z-T.pz).applyQuaternion(_tq); m.tm.quaternion.copy(_tq); m.tm.position.set(T.px+_tc.x,T.y+_tc.y-T.drop,T.pz+_tc.z); }
  if(Math.random()<dt*20){ _tc.set(T.px,T.y,T.pz).addScaledVector(_ta.set(T.dx,0,T.dz),Math.random()*h*Math.sin(th)); _tc.y+=Math.random()*h*Math.cos(th)-T.drop;
    FX.burst(_tc,4,0xffc24d,5,0.5,3); }
  if(T.t>4.2){ FX.burst(m.mesh.position,60,0x9aa0b0,20,1.2,8); fireball(m.mesh.position,20,0.8,0xff5a1a);
    m.mesh.visible=false; if(m.tm) m.tm.visible=false; m.topple=null; }
}
/* `shatter` [x,z] on a fall: it never drops whole. It bursts where it was
   struck, a chain of blasts runs out along it from there, and it goes down in
   pieces, tumbling away into the void (3-3's second span, which the eye breaks
   as it comes out to you). Gone for good: what is left is far below, out of
   reach. */
function shatterMover(m,F){
  const [w,h,d]=m.s, x=m.at.x, y=m.at.y, z=m.at.z, sx=F.shatter[0], sz=F.shatter[1];
  m.mesh.visible=false; if(m.tm) m.tm.visible=false; m.shattered=true;
  const to=[F.to[0],-1000,F.to[2]];
  m.p=to.slice(); m.to=to.slice(); m.t=0; m.phase=0; m.once=true; m.then=null;
  m.fall=null; m.fallen=true; m.shk=null;
  placeMover(m);
  const long=d>=w, L=long?d:w, C=long?w:d, n=Math.max(3,Math.round(L/7)), seg=L/n;
  let q=0;
  for(let i=0;i<n;i++){
    const u=-L/2+seg*(i+0.5);
    for(const side of [-1,1]){
      const cw=C/2*rand(0.82,1), cl=seg*rand(0.8,1);
      const piece=new THREE.Mesh(long?new THREE.BoxGeometry(cw,h,cl):new THREE.BoxGeometry(cl,h,cw),m.mesh.material);
      const px=x+(long?side*C/4:u), pz=z+(long?u:side*C/4);
      piece.position.set(px,y+h/2,pz);
      const away=V3(px-sx,0,pz-sz), dist=away.length(); away.normalize().multiplyScalar(rand(3,8));
      away.x+=long?side*rand(2,5):0; away.z+=long?0:side*rand(2,5); away.y=rand(3,9)*Math.max(0.3,1-dist/60);
      // the blast runs out along it at 60m/s; one in three pieces flashes as it
      // goes, and one in two of those booms
      const wait=dist/60, boom=side>0&&i%2===0?(q++%2===0?2:1):0;
      scene.add(piece);
      debris.push({m:piece,v:away,t:wait+rand(5,6.5),wait,boom,burn:boom>0||Math.random()<0.4,spin:V3(rand(-1.2,1.2),rand(-0.6,0.6),rand(-1.2,1.2))});
    }
  }
  _v.set(sx,y+h,sz); explode(_v,0xff7a2a,2.4); FX.ring(_v,0xffe0a0,16,0.55); SFX.crash();
  fireball(_v,34,1.1,0xff5a1a); fireball(_v,16,0.4,0xfff4e0);
  const dd=Math.hypot(player.pos.x-sx,player.pos.z-sz);
  player.shake=Math.min(0.8,player.shake+Math.max(0.15,0.7-dd/90));
}
/* A platform finished for good: `wreck`. 3-2's crane, its last clamp broken -
   the beam shudders, lets go of its north rail and swings down off the south
   one, then that goes too and it falls, drifting to `x`, into the slag: one end,
   then the other, and it lies there half under. What rides it, and what rides
   `flat` along it off another platform (the trolley), goes with it; the small
   pieces break off as it lands and go under. Only to look at while it falls;
   once it lies still the beam is solid, so it is never something you walk
   through. Nothing puts it back. */
const _wv=V3();
function startWreck(a){
  const m=level.movers.find(q=>q.id===a.mover);
  if(!m||m.wreck) return;
  m.wreck=true; m.running=false; m.stopped=true; m.fall=null; m.shk=null;
  const unCol=c=>{ const i=c?colliders.indexOf(c):-1; if(i>=0) colliders.splice(i,1); };
  unCol(m.col);
  const [w,h,d]=m.s, L=d;
  const g=new THREE.Group();
  g.position.set(m.at.x,m.at.y+h/2,m.at.z+L/2);       // the pivot: the beam's south end, on its rail
  scene.add(own(g));
  const keep=[m.mesh,m.tm], bits=[];
  for(const r of level.riders){
    if(!(r.on===a.mover||(a.flat&&r.on===a.flat&&r.flat))) continue;
    r.wreck=true; unCol(r.col);
    // what runs the length of the beam stays with it; the rest breaks off
    const box=new THREE.Box3().setFromObject(r.m), sz=box.getSize(_wv);
    const long=r.keep||Math.max(sz.x,sz.z)>L*0.5;     // `keep`: the core's plinth
    (long?keep:bits).push(r.m,r.tm);
  }
  // nothing is turned yet, so into the group is just an offset
  for(const o of keep.concat(bits)) if(o){ o.position.sub(g.position); g.add(o); }
  // `with`: what hangs off it on cables (the hoist) - the cables go, and it
  // drops straight down ahead of the beam
  const drop=[];
  for(const id of a.with||[]){
    const q=level.movers.find(v=>v.id===id); if(!q||q.wreck) continue;
    q.wreck=true; q.running=false; q.stopped=true; q.fall=null; unCol(q.col);
    drop.push(q.mesh,q.tm);
    for(const r of level.riders) if(r.on===id&&!r.flat){ r.wreck=true; unCol(r.col); drop.push(r.m,r.tm); }
  }
  // a core riding the beam rides it down, and lies on it where it lands
  const G=level.goal;
  if(G&&!G.taken&&G.on===a.mover){ G.wreckAt=V3(G.p[0],G.p[1],G.p[2]).sub(g.position); }
  // `wait`: not while that platform is still coming down - the cradle under it.
  // `then`: once it has landed - the core's cage opening
  level.wrecks.push({g, m, L, w, h, t:0, stage:-1, th:0, om:0, v:0, wait:a.wait||null, then:a.then||null, thenDone:false,
                     x0:g.position.x, xT:a.x===undefined?g.position.x:a.x, floor:a.floor===undefined?0:a.floor,
                     bits:bits.filter(Boolean).map(o=>({o, v:V3(), spin:V3(), loose:false, top:0}))
                       .concat(drop.filter(Boolean).map(o=>({o, v:V3(), spin:V3(), loose:true, top:0})))});
  if(G&&G.wreckAt) G.wreck=level.wrecks[level.wrecks.length-1];
  SFX.creak(1.2);
}
function wreckEnd(W,zl,out){       // a point along the beam, in the world
  W.g.updateMatrixWorld(true);
  return W.g.localToWorld(out.set(0,0,zl));
}
function updateWrecks(dt){
  for(const W of level.wrecks){
    if(W.stage===5) continue;
    const g=W.g;
    // and not with cages still hanging off it, on their way back up
    if(W.stage===-1){ const wm=W.wait&&level.movers.find(q=>q.id===W.wait); if(wm&&wm.fall) continue;
      if(level.deliveries.some(d=>(d.a.movers||[]).includes(W.m.id)&&d.st!=='wait'&&d.st!=='come')) continue; W.stage=0; W.t=0; }
    W.t+=dt;
    // 0: it shudders, sparking at the north rail
    if(W.stage===0){
      if(!W.rest) W.rest=g.position.clone();
      g.position.set(W.rest.x+rand(-0.12,0.12),W.rest.y+rand(-0.06,0.06),W.rest.z+rand(-0.12,0.12));
      if(Math.random()<dt*30){ wreckEnd(W,-W.L,_v); FX.burst(_v,4,0xffc24d,8,0.4,-6); }
      if(W.t>1.1){ g.position.copy(W.rest); W.stage=1; SFX.crash(); wreckEnd(W,-W.L,_v); FX.burst(_v,40,0xffc24d,12,0.6,-8); }
      continue;
    }
    // 1: off the north rail, swinging down from the south one
    if(W.stage===1){
      W.om+=1.1*dt; W.th+=W.om*dt; g.rotation.x=-W.th;
      if(Math.random()<dt*20){ _v.copy(g.position); FX.burst(_v,3,0xffc24d,6,0.4,-6); }
      if(W.th>0.42){ W.stage=2; SFX.crash(); FX.burst(g.position,40,0xffc24d,12,0.6,-8);
        W.T=Math.sqrt(2*Math.max(1,g.position.y-W.floor)/FALL_G); W.vx=(W.xT-g.position.x)/W.T; }
      continue;
    }
    // 2: and off the south one: down it comes, still turning, until the north end hits
    if(W.stage===2||W.stage===3){
      W.v+=FALL_G*dt; g.position.y-=W.v*dt;
      if(Math.abs(g.position.x-W.xT)>0.05) g.position.x+=Math.sign(W.xT-g.position.x)*Math.min(Math.abs(W.vx)*dt,Math.abs(W.xT-g.position.x));
      if(W.stage===2){
        W.th+=W.om*dt*0.5; g.rotation.x=-W.th;
        wreckEnd(W,-W.L,_v);
        if(_v.y<=W.floor){ W.stage=3; crashAt(_v.x,W.floor,_v.z,6,6); W.v*=0.7;
          // the small pieces break off and go flying
          g.updateMatrixWorld(true);
          for(const b of W.bits){ scene.attach(b.o); b.loose=true;
            b.v.set(rand(-6,6),rand(5,11),rand(-6,6)); b.spin.set(rand(-3,3),rand(-3,3),rand(-3,3)); } }
      }else{
        // its north end in the slag: the south comes down after it
        const k=Math.max(0,Math.min(1,(g.position.y-W.floor)/W.L));
        W.th=Math.asin(k); g.rotation.x=-W.th;
        if(g.position.y<=W.floor){ g.position.y=W.floor; W.th=0; g.rotation.x=0; W.stage=4; W.t=0;
          crashAt(g.position.x,W.floor,g.position.z,6,6); player.shake=Math.min(0.9,player.shake+0.5);
          if(W.then&&!W.thenDone){ W.thenDone=true; runActions(W.then); } }
      }
    }
    // 4: lying in it, settling half under, a little over on its side
    if(W.stage===4){
      const k=Math.min(1,W.t/3), e=k*(2-k);
      g.position.y=W.floor-0.4*e; g.rotation.z=0.08*e;
      if(Math.random()<dt*8){ _v.set(g.position.x+rand(-2,2),W.floor+0.3,g.position.z-rand(0,W.L)); FX.burst(_v,3,0xff8a30,4,0.5,3); }
      if(k>=1){ W.stage=5;
        // solid now: the beam where it lies
        const hw=W.w/2+0.1, x=g.position.x, y=g.position.y, z1=g.position.z, z0=z1-W.L;
        colliders.push({min:V3(x-hw,y-W.h/2,z0),max:V3(x+hw,y+W.h/2,z1)}); }
    }
  }
  // the broken-off pieces: up, over, and down into the metal
  for(const W of level.wrecks) for(const b of W.bits){
    if(!b.loose||b.gone) continue;
    if(!b.sinking){
      b.v.y-=FALL_G*dt; b.o.position.addScaledVector(b.v,dt);
      b.o.rotation.x+=b.spin.x*dt; b.o.rotation.y+=b.spin.y*dt; b.o.rotation.z+=b.spin.z*dt;
      if(b.o.position.y<=W.floor&&b.v.y<0){ b.sinking=true; _v.set(b.o.position.x,W.floor+0.3,b.o.position.z);
        FX.burst(_v,30,0xff8a30,10,0.6,8); }
    }else{
      b.o.position.y-=dt*0.8;
      if(b.o.position.y<W.floor-4){ b.gone=true; b.o.visible=false; }
    }
  }
}
/* What rides a platform, and the cables strung between things: drawn where
   they are each frame. A cable cut - the fall it holds up has let go, the
   platform it holds has fallen - is gone. */
const _cA=V3(), _cB=V3(), _cUp=V3(0,1,0), _cQ=new THREE.Quaternion();
function cableEnd(p,on,flat,out){
  out.set(p[0],p[1],p[2]);
  if(on){ const m=level.movers.find(x=>x.id===on);
    if(m){ out.x+=m.at.x-m.p0[0]; if(!flat) out.y+=m.at.y-m.p0[1]; out.z+=m.at.z-m.p0[2];
      if(m.shk){ out.x+=m.shk[0]; if(!flat) out.y+=m.shk[1]; out.z+=m.shk[2]; } } }
  return out;
}
const _cCol=new THREE.Color(), _cCol2=new THREE.Color(); let _cDt=0;
function updateRiders(dt){
  _cDt=dt||0;
  for(const r of level.riders){
    const m=r.mv||(r.mv=level.movers.find(x=>x.id===r.on));
    if(!m||r.wreck) continue;
    const dx=m.at.x-m.p0[0], dy=r.flat?0:m.at.y-m.p0[1], dz=m.at.z-m.p0[2], s=m.shk||[0,0,0];
    const [x,y,z]=r.base;
    r.m.position.set(x+dx+s[0],y+r.h/2+dy+s[1],z+dz+s[2]);
    if(r.tm) r.tm.position.set(x+dx+s[0],y+r.h+0.05+dy+s[1],z+dz+s[2]);
    if(r.col){ const hw=(r.col.max.x-r.col.min.x)/2, hd=(r.col.max.z-r.col.min.z)/2;
      r.col.min.set(x+dx-hw,y+dy,z+dz-hd); r.col.max.set(x+dx+hw,y+r.h+dy,z+dz+hd); }
  }
  for(const c of level.cables){
    let cut=false;
    if(c.cut&&c.cut.fall){ const f=fallById(c.cut.fall); cut=!!f&&(f.state==='drop'||f.state==='down'); }
    if(c.cut&&c.cut.mover){ const m=level.movers.find(x=>x.id===c.cut.mover); cut=!!m&&(m.fallen||(m.fall&&m.fall.drop)||m.wreck); }
    c.mesh.visible=!cut;
    if(cut) continue;
    if(c.lit){
      const want=cableLive(c)?1:0;
      if(c.glow!==want){ c.glow+=Math.sign(want-c.glow)*Math.min(Math.abs(want-c.glow),_cDt*3);
        _cCol.setHex(CABLE_DARK).lerp(_cCol2.setHex(c.litCol),c.glow); c.mat.color.copy(_cCol); }
      // power running along it: a spark now and then
      if(c.glow>0.9&&Math.random()<_cDt*3){ cableEnd(c.a,c.aOn,c.aFlat,_cA); cableEnd(c.b,c.bOn,c.bFlat,_cB);
        _cA.lerp(_cB,Math.random()); FX.burst(_cA,2,c.litCol,2,0.3,0); }
    }
    cableEnd(c.a,c.aOn,c.aFlat,_cA); cableEnd(c.b,c.bOn,c.bFlat,_cB);
    const len=_cA.distanceTo(_cB)||0.01;
    c.mesh.position.copy(_cA).add(_cB).multiplyScalar(0.5);
    c.mesh.scale.set(1,len,1);
    _cB.sub(_cA).multiplyScalar(1/len);
    _cQ.setFromUnitVectors(_cUp,_cB); c.mesh.quaternion.copy(_cQ);
  }
}
let CABLE_GEO=null;
const CABLE_MAT=new THREE.MeshLambertMaterial({color:0x2a3240});
function addCable(c){
  if(!CABLE_GEO) CABLE_GEO=new THREE.CylinderGeometry(1,1,1,6);
  const r=c.r||0.07;
  const mesh=new THREE.Mesh(CABLE_GEO,CABLE_MAT);
  // the radius rides in the geometry's x/z scale; y is the length, set each frame
  const g=new THREE.Group(); mesh.scale.set(r,1,r); g.add(mesh); scene.add(own(g));
  // `aFlat`/`bFlat`: that end follows its platform across, not up or down
  // `lit`: it carries power, and glows while it does - {conduit: id} while that
  // conduit is live, {live: id} while that conductor is (unshut, unbroken), so
  // a chain of pylons shows what it has powered.
  let mat=null;
  if(c.lit){ mat=new THREE.MeshBasicMaterial({color:CABLE_DARK}); mat.__perObject=true; mesh.material=mat; }
  level.cables.push({a:c.a, b:c.b, aOn:c.aOn||null, bOn:c.bOn||null, aFlat:!!c.aFlat, bFlat:!!c.bFlat, cut:c.cut||null, mesh:g,
                     lit:c.lit||null, mat, litCol:c.litCol?LOCK_COLOUR[c.litCol]||CABLE_LIT:CABLE_LIT, glow:0});
}
const CABLE_DARK=0x2a3240, CABLE_LIT=0xffc24d;
function cableLive(c){
  if(c.lit.conduit){ const q=conduits.find(x=>x.id===c.lit.conduit); return !!q&&q.powered; }
  if(c.lit.live){ const b=breaches.find(x=>x.id===c.lit.live); return !!b&&!b.broken&&!b.shut; }
  return false;
}
/* The crane's scrap: while `drops` is on, a load is thrown from the platform
   `from` every so often at where you are heading, inside `box`. A ring fills
   on the ground where it will land; anyone under it is hit, and where it lands
   on the floor it stays - cover, a step - up to `max` of them. One that lands
   on another, or past the cap, breaks up. Never inside the `avoid` circles: the
   core's cage, the door. */
const _dRing=new THREE.RingGeometry(0.86,1,40), _dDisc=new THREE.CircleGeometry(1,40);
const DROP_C=0xffc24d;
function dropLoad(D){
  const m=level.movers.find(x=>x.id===D.from);
  if(!m) return;
  const [bx0,bx1,bz0,bz1]=D.box, [w,h,d]=D.s, mg=Math.max(w,d)/2+0.4;
  const lead=rand(0.3,0.8)*D.warn;
  let tx=clamp(player.pos.x+player.vel.x*lead,bx0+mg,bx1-mg), tz=clamp(player.pos.z+player.vel.z*lead,bz0+mg,bz1-mg);
  for(const [ax,az,ar] of D.avoid||[]){
    const dx=tx-ax, dz=tz-az, dd=Math.hypot(dx,dz);
    if(dd<ar+mg){ const k=(ar+mg)/(dd||1); tx=clamp(ax+(dd?dx:1)*k,bx0+mg,bx1-mg); tz=clamp(az+(dd?dz:0)*k,bz0+mg,bz1-mg); }
  }
  const y=groundAt(tx,tz,D.floor+30);
  const shatter=Math.abs(y-D.floor)>0.3||level.loads.length>=(D.max||10);
  // `opens`: panels that take a charge only while it throws - the crane's
  // clamps, open as the hoist lets go, for `open` seconds
  // One at a time, the one nearest you, so they can't all go in a single volley.
  if(D.opens){
    let best=null, bd=Infinity;
    for(const b of breaches){ if(b.broken||!D.opens.includes(b.id)) continue;
      const d=b.mesh.position.distanceTo(player.pos); if(d<bd){ bd=d; best=b; } }
    if(best){ D.openT=D.open||1.6; if(best.shut){ best.shut=false; best.mesh.material=best.mat; }
      FX.burst(best.mesh.position,12,0xff7a2a,5,0.35,3); FX.ring(best.mesh.position,0xff7a2a,3,0.3); }
  }
  const r=Math.hypot(w,d)/2+0.6;
  const ringM=new THREE.MeshBasicMaterial({color:DROP_C,transparent:true,opacity:0.8,depthWrite:false,side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4});
  const discM=ringM.clone(); discM.opacity=0.22;
  const ring=new THREE.Mesh(_dRing,ringM), disc=new THREE.Mesh(_dDisc,discM);
  for(const q of [ring,disc]){ q.rotation.x=-Math.PI/2; q.position.set(tx,y+0.05,tz); scene.add(q); }
  ring.scale.setScalar(r); disc.scale.setScalar(0.01);
  const blk=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),MAT.block);
  const o=[m.at.x,m.at.y-1,m.at.z];
  blk.position.set(o[0],o[1],o[2]); scene.add(blk);
  level.dropping.push({x:tx,y,z:tz,t:0,r,ring,disc,blk,o,shatter,spin:V3(rand(-2,2),rand(-2,2),rand(-2,2))});
  SFX.creak(0.6);
}
function killDrop(k){ for(const q of [k.ring,k.disc]){ if(!q) continue; scene.remove(q); q.material.dispose(); }
  if(k.blk){ scene.remove(k.blk); k.blk.geometry.dispose(); } }
function clearLoads(){
  for(const k of level.dropping) killDrop(k);
  level.dropping.length=0;
  for(const k of level.sinking) killDrop(k);
  level.sinking.length=0;
  for(const L of level.loads){ scene.remove(L.m); L.m.geometry.dispose(); const i=colliders.indexOf(L.col); if(i>=0) colliders.splice(i,1); }
  level.loads.length=0;
}
// the burning metal under a spot, if there is any, near enough this height
function moltenUnder(x,z,y){
  for(const h of moltens){
    if(h.off) continue;
    if(Math.abs(x-h.p[0])<h.s[0]/2&&Math.abs(z-h.p[2])<h.s[2]/2&&y<h.p[1]+h.s[1]+0.5) return h;
  }
  return null;
}
// A block stays only on the floor it was thrown at, still there, under all of
// it, with nothing else where it would stand.
function landsWhole(k,D,w,h,d){
  const top=D.floor+30, y=groundAt(k.x,k.z,top);
  if(Math.abs(y-D.floor)>0.3||Math.abs(y-k.y)>0.05) return false;
  const iw=w/2-0.3, id=d/2-0.3;
  for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]])
    if(Math.abs(groundAt(k.x+sx*iw,k.z+sz*id,y+0.5)-y)>0.15) return false;
  const lo=V3(k.x-w/2+0.05,y+0.05,k.z-d/2+0.05), hi=V3(k.x+w/2-0.05,y+h-0.05,k.z+d/2-0.05);
  for(const c of colliders) if(c.min.x<hi.x&&c.max.x>lo.x&&c.min.y<hi.y&&c.max.y>lo.y&&c.min.z<hi.z&&c.max.z>lo.z) return false;
  return true;
}
function updateSinking(dt){
  for(let i=level.sinking.length-1;i>=0;i--){
    const k=level.sinking[i]; k.sinkT+=dt;
    k.blk.position.y-=dt*(0.6+k.sinkT*0.8);
    if(Math.random()<dt*12){ _v.set(k.x+rand(-1,1),k.top+0.2,k.z+rand(-1,1)); FX.burst(_v,2,0xff8a30,3,0.5,3); }
    if(k.blk.position.y<k.top-3){ killDrop(k); level.sinking.splice(i,1); }
  }
}
/* A fight that is still coming: anything in these actions that brings enemies
   in, however deep. */
function holdsFight(list){
  for(const x of list||[]){
    if(!x) continue;
    if(Array.isArray(x)){ if(holdsFight(x)) return true; continue; }
    if(x.a==='spawn'||x.a==='deliver'||x.a==='pods') return true;
    if(x.do&&holdsFight(x.do)) return true;
  }
  return false;
}
function updateTimers(dt){
  for(let i=level.timers.length-1;i>=0;i--){
    const x=level.timers[i];
    x.t-=dt;
    if(x.t>0) continue;
    level.timers.splice(i,1);
    if(x.panel) fromPanel++; if(x.phase) fromPhase++;
    try{ if(x.fn) x.fn(); else runActions(x.do,x.owner); } finally{ if(x.panel) fromPanel--; if(x.phase) fromPhase--; }
  }
}

/* The crane brings them. `deliver` sends the crane (and whatever hangs off the
   same run - `movers`, the first being the beam the cages hang from) over to
   the drops' x, lets a cage down on cables to each drop, opens it, and takes
   the empty cages back up before going back to what it was doing. What is in
   the cages counts as the fight's from the start: its groups exist, held, so a
   fight cannot be won in the lull while they are on their way. A death clears
   it all, and what was coming is simply there. */
const CAGE_W=3.4, CAGE_H=3.0, CRANE_V=11, CAGE_V=9;
let CAGE_GEO=null;
function buildCage(){
  if(!CAGE_GEO) CAGE_GEO={plate:new THREE.BoxGeometry(CAGE_W,0.3,CAGE_W), bar:new THREE.BoxGeometry(0.14,CAGE_H-0.6,0.14),
                          edge:new THREE.BoxGeometry(CAGE_W+0.1,0.22,0.22)};
  const g=new THREE.Group(), bars=new THREE.Group();
  const floor=new THREE.Mesh(CAGE_GEO.plate,MAT.block), roof=new THREE.Mesh(CAGE_GEO.plate,MAT.block);
  floor.position.y=0.15; roof.position.y=CAGE_H-0.15; g.add(floor,roof);
  // glowing edges top and bottom: seen from under it as it comes down, and from above
  for(const y of [0.02,CAGE_H+0.02]) for(let k=0;k<4;k++){
    const e=new THREE.Mesh(CAGE_GEO.edge,MAT.neonA);
    const o=CAGE_W/2*(k<2?1:-1);
    if(k%2){ e.rotation.y=Math.PI/2; e.position.set(o,y,0); } else e.position.set(0,y,o);
    g.add(e);
  }
  const n=4;
  for(let side=0;side<4;side++) for(let i=0;i<n;i++){
    const b=new THREE.Mesh(CAGE_GEO.bar,MAT.neonA);
    const u=-CAGE_W/2+0.1+(CAGE_W-0.2)*i/(n-1), o=CAGE_W/2-0.07;
    b.position.set(side<2?u:(side===2?o:-o), 0, side<2?(side?o:-o):u);
    bars.add(b);
  }
  bars.position.y=0.3; g.add(bars);
  // the bars stand from the floor up, so they can sink back into it
  for(const b of bars.children) b.position.y=(CAGE_H-0.6)/2;
  scene.add(own(g));
  return {g,bars,cables:[0,1].map(()=>{ if(!CABLE_GEO) CABLE_GEO=new THREE.CylinderGeometry(1,1,1,6);
    const c=new THREE.Mesh(CABLE_GEO,CABLE_MAT); c.scale.set(0.07,1,0.07); scene.add(own(c)); return c; })};
}
function disposeCage(c){ scene.remove(c.g); for(const k of c.cables) scene.remove(k); }
function startDelivery(a,owner){
  const trig=a.join&&level.arena&&!level.arena.done?level.arena.owner:(owner||null);
  const groups=[];
  for(const dr of a.drops||[]) for(const spec of dr.enemies||[]){
    let grp=level.groups.get(spec);
    if(!grp){ grp={spec, want:(spec.n||1), killed:0, ents:[], trig, loose:fromPanel>0||fromPhase>0};
              level.groups.set(spec,grp); }
    grp.hold=true; groups.push(grp);
  }
  level.deliveries.push({a, groups, owner:owner||null, st:'wait', t:0, cages:[]});
  hud.threat=true;
}
function borrowMover(m,to){
  if(!m.borrowed) m.borrowed={p:m.p.slice(), to:m.to.slice(), t:m.t, phase:m.phase||0, period:m.period, once:m.once,
                              then:m.then||null, running:m.running, stopped:!!m.stopped, at:[m.at.x,m.at.y,m.at.z]};
  const T=Math.max(1.2,Math.hypot(to[0]-m.at.x,to[1]-m.at.y,to[2]-m.at.z)/CRANE_V);
  m.p=[m.at.x,m.at.y,m.at.z]; m.to=to.slice(); m.t=0; m.phase=0; m.once=true; m.period=2*T;
  m.then=null; m.running=true; m.stopped=false;
}
function returnMover(m){
  const b=m.borrowed; if(!b) return;
  // Sent somewhere when it was called away: it goes on to there, not back to
  // where it was called from.
  if(b.once&&!b.stopped){ b.at=b.to.slice(); b.t=b.period*(0.5-(b.phase||0)); }
  const T=Math.max(1.2,Math.hypot(b.at[0]-m.at.x,b.at[1]-m.at.y,b.at[2]-m.at.z)/CRANE_V);
  m.p=[m.at.x,m.at.y,m.at.z]; m.to=b.at.slice(); m.t=0; m.phase=0; m.once=true; m.period=2*T;
  m.then={restore:b}; m.running=true; m.stopped=false;
}
function letOut(d){
  if(d.out) return;
  d.out=true;
  for(const grp of d.groups){ grp.hold=false; spawnGroup(grp); }
  SFX.spawn(); hud.threat=true;
}
/* The Gaze's garrison: each drop a pod thrown from the eye to where it lands,
   bursting into what it carries. Until it lands, its groups are held - the
   fight waits on them, as on the crane's cages. */
function startPods(a,owner){
  const trig=a.join&&level.arena&&!level.arena.done?level.arena.owner:(owner||null);
  const h=level.hazards.find(x=>x.t==='gaze'&&(!a.gaze||x.id===a.gaze));
  (a.drops||[]).forEach((dr,i)=>{
    const groups=[];
    for(const spec of dr.enemies||[]){
      const sp={...spec, p:spec.p||dr.at};
      let grp=level.groups.get(spec);
      if(!grp){ grp={spec:sp, want:(sp.n||1), killed:0, ents:[], trig, loose:fromPanel>0||fromPhase>0};
                level.groups.set(spec,grp); }
      grp.hold=true; groups.push(grp);
    }
    const d={groups, owner:owner||null};
    level.podDrops.push(d);
    const land=()=>{ const k=level.podDrops.indexOf(d); if(k<0) return; level.podDrops.splice(k,1);
                     for(const grp of groups){ grp.hold=false; spawnGroup(grp); } hud.threat=true; };
    level.timers.push({t:(a.first||0)+i*(a.gap===undefined?0.7:a.gap), do:[], fn:()=>{
      if(h&&!h.off) throwPod(h,dr.at,land); else land(); }, owner:owner||null});
  });
}
function clearDeliveries(){
  for(const d of level.deliveries){
    for(const c of d.cages) disposeCage(c);
    for(const grp of d.groups) grp.hold=false;
  }
  level.deliveries.length=0;
  for(const d of level.podDrops) for(const grp of d.groups) grp.hold=false;
  level.podDrops.length=0;
  for(const m of level.movers) m.borrowed=null;
}
const smooth=k=>k*k*(3-2*k);
// each at the share k of the way from the crane down to its drop
function placeCages(d,k,hang){
  d.cages.forEach((c,i)=>{
    const at=d.a.drops[i].at, y=d.y0+(at[1]-d.y0)*k;
    c.g.position.set(at[0],y,at[2]);
    const top=y+CAGE_H, hy=hang?hang.at.y:(d.a.cable!==undefined?d.a.cable:d.a.top!==undefined?d.a.top:top+20);   // `cable`: where its cables go up to
    c.cables.forEach((k,j)=>{
      const len=Math.max(0.05,hy-top);
      k.scale.y=len; k.position.set(at[0]+(j?1.1:-1.1),top+len/2,at[2]);
    });
  });
}
function updateDeliveries(dt){
  const d=level.deliveries[0];
  if(!d) return;
  const ms=(d.a.movers||[]).map(id=>level.movers.find(m=>m.id===id)).filter(Boolean);
  const hang=ms[0]||null, drops=d.a.drops||[];
  if(!drops.length){ level.deliveries.shift(); return; }
  const x=drops[0].at[0];
  if(d.st==='wait'){
    // `lift`: what hangs off the beam goes up to where it started, out of the
    // cages' way
    ms.forEach((m,i)=>borrowMover(m,i&&d.a.lift?[x,m.p0[1],m.p0[2]]:[x,m.at.y,m.at.z]));
    d.st='come';
    return;
  }
  if(d.st==='come'){
    if(ms.some(m=>!(m.once&&!m.then&&m.t/m.period+(m.phase||0)>=0.5-1e-6))) return;
    // `top`, with no crane: let down from a fixed hoist - 3-2's hopper roof
    d.y0=(hang?hang.at.y:(d.a.top!==undefined?d.a.top:60))-0.3-CAGE_H;
    d.T=Math.max(1.5,(d.y0-Math.min(...drops.map(q=>q.at[1])))/CAGE_V);
    d.cages=drops.map(()=>buildCage());
    d.st='lower'; d.t=0; SFX.creak(d.T);
  }
  if(d.st==='lower'){
    d.t+=dt;
    placeCages(d,smooth(Math.min(1,d.t/d.T)),hang);
    if(d.t>=d.T){
      d.st='open'; d.t=0;
      for(const q of drops){ fallDust(q.at[0],q.at[1]+0.3,q.at[2],14); _v.set(q.at[0],q.at[1]+0.2,q.at[2]); FX.ring(_v,0xffc24d,3.4,0.4); }
      SFX.crash();
    }
    return;
  }
  if(d.st==='open'){
    d.t+=dt;
    // the bars go down into the floor, and out they come
    for(const c of d.cages) c.bars.scale.y=Math.max(0.02,1-d.t/0.45);
    if(d.t>=0.3) letOut(d);
    if(d.t>=1.4){ d.st='raise'; d.t=0; }
    return;
  }
  if(d.st==='raise'){
    d.t+=dt;
    placeCages(d,1-smooth(Math.min(1,d.t/d.T)),hang);
    if(d.t>=d.T){
      for(const c of d.cages) disposeCage(c);
      d.cages=[];
      for(const m of ms) returnMover(m);
      level.deliveries.shift();
      // `then`: what comes once the cages are back up - the cradle let down
      if(d.a.then) runActions(d.a.then,d.owner);
    }
  }
}
function updateDrops(dt){
  const D=level.dropper;
  for(let i=level.dropping.length-1;i>=0;i--){
    const k=level.dropping[i]; k.t+=dt;
    const W=D?D.warn:1.6, f=Math.min(1,k.t/W);
    k.disc.scale.setScalar(Math.max(0.01,k.r*f));
    k.ring.material.opacity=0.55+0.4*Math.sin(k.t*30);
    const [w,h,d]=D?D.s:[3,2,3];
    // out and down: thrown from the cradle, falling the last of the way
    k.blk.position.set(k.o[0]+(k.x-k.o[0])*f, k.o[1]+(k.y+h/2-k.o[1])*f*f+Math.sin(f*Math.PI)*3, k.o[2]+(k.z-k.o[2])*f);
    k.blk.rotation.set(k.spin.x*(1-f),k.spin.y*(1-f),k.spin.z*(1-f));
    if(k.t<W) continue;
    level.dropping.splice(i,1);
    _v.set(k.x,k.y+0.3,k.z);
    FX.ring(_v,DROP_C,k.r*2.2,0.4); FX.burst(_v,30,0x9aa0b0,10,0.6,6); FX.burst(_v,12,0xffd0a0,7,0.3,4);
    SFX.crash(); player.shake=Math.min(0.7,player.shake+0.2);
    const under=Math.abs(player.pos.x-k.x)<w/2+0.6&&Math.abs(player.pos.z-k.z)<d/2+0.6&&player.pos.y<k.y+h+0.5;
    if(under) damagePlayer(D?D.dmg:35,_v);
    // Whether it stays is settled where it lands, not where it was thrown: the
    // spot may be taken, or the floor gone, by the time it gets there.
    const pool=D&&moltenUnder(k.x,k.z,k.y);
    if(k.shatter||!D||!landsWhole(k,D,w,h,d)){
      // into the metal it goes down slowly, glowing, rather than vanishing as it touched
      if(pool&&k.blk){ for(const q of [k.ring,k.disc]){ scene.remove(q); q.material.dispose(); } k.ring=k.disc=null;
        _v.set(k.x,pool.p[1]+pool.s[1]+0.2,k.z); FX.burst(_v,40,0xff8a30,10,0.6,8);
        k.blk.rotation.set(rand(-0.3,0.3),rand(-1,1),rand(-0.3,0.3)); k.sinkT=0; k.top=pool.p[1]+pool.s[1];
        level.sinking.push(k); continue; }
      for(let j=0;j<10;j++){ FX.burst(_v,2,0x9aa0b0,8,0.8,6); } killDrop(k); continue; }
    // it stays: a block on the floor, from now on cover and a step
    for(const q of [k.ring,k.disc]){ scene.remove(q); q.material.dispose(); }
    k.blk.rotation.set(0,0,0); k.blk.position.set(k.x,k.y+h/2,k.z);
    const col={min:V3(k.x-w/2,k.y,k.z-d/2),max:V3(k.x+w/2,k.y+h,k.z+d/2)};
    colliders.push(col);
    level.loads.push({m:k.blk,col});
    // whoever it came down on is on top of it now, not inside it
    if(under&&player.pos.y<k.y+h){ player.pos.y=k.y+h+0.01; player.vel.y=0; }
    if(i>level.dropping.length) break;            // a death cleared the list
  }
  if(D&&D.opens&&D.openT>0){ D.openT-=dt;
    if(D.openT<=0) for(const b of breaches) if(!b.broken&&D.opens.includes(b.id)){ b.shut=true; b.mesh.material=SHUT_MAT; } }
  if(!D||!D.on||game.state!=='play') return;
  D.t-=dt;
  if(D.t>0) return;
  D.t=D.every*rand(0.85,1.15);
  dropLoad(D);
}

/* A charge rack: Sunder charges stacked in a frame, glowing. Standing at one
   fills the Sunder - so a level can ask for a breach anywhere it has one, and
   never leave you a charge short of the way on. */
function addRack(r){
  const [x,y,z]=r.p, g=new THREE.Group();
  const frame=new THREE.MeshLambertMaterial({color:0x2c2f38});
  const hot=new THREE.MeshBasicMaterial({color:0xff7a2a});
  frame.__perObject=hot.__perObject=true;
  const base=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.3,0.8),frame); base.position.y=0.15; g.add(base);
  for(const sx of [-0.7,0.7]){ const post=new THREE.Mesh(new THREE.BoxGeometry(0.12,1.4,0.12),frame); post.position.set(sx,0.85,0); g.add(post); }
  const top=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.12,0.5),frame); top.position.y=1.55; g.add(top);
  const shell=new THREE.CylinderGeometry(0.11,0.11,0.5,10);
  const cells=[];
  for(let i=0;i<4;i++){ const c=new THREE.Mesh(shell,hot); c.position.set(-0.45+i*0.3,0.6,0); g.add(c); cells.push(c); }
  g.position.set(x,y,z); if(r.yaw) g.rotation.y=r.yaw;
  scene.add(own(g));
  colliders.push({min:V3(x-0.8,y,z-0.4),max:V3(x+0.8,y+1.6,z+0.4)});
  return {p:r.p, g, hot, cells, cd:0};
}
function updateRacks(dt){
  const si=weaponIndex('sunder');
  for(const r of level.racks){
    r.cd-=dt;
    r.hot.color.setHex(0xff7a2a); r.cells.forEach((c,i)=>{ c.scale.y=0.9+Math.sin(game.time*3+i)*0.08; });
    if(si<0||!owned.sunder||r.cd>0) continue;
    if(Math.hypot(player.pos.x-r.p[0],player.pos.z-r.p[2])>2.4||Math.abs(player.pos.y-r.p[1])>2) continue;
    const w=WEAPONS[si];
    if(w.mag>=w.magSize&&w.reserve>=w.maxRes) continue;
    w.mag=w.magSize; w.reserve=w.maxRes; hud.weapon=true; r.cd=1.5;
    SFX.pickup(); FX.ring(_v.set(r.p[0],r.p[1]+0.8,r.p[2]),0xff7a2a,3,0.4);
    if(!level.seenBriefs['CHARGE RACK']){ level.seenBriefs['CHARGE RACK']=true; hud.banner('CHARGE RACK','Fills the Sunder.',false); }
  }
}

/* Molten metal, in a pool: a tiling texture of dark cooled crust broken by
   bright veins, drifting slowly, with a second glowing layer over it drifting
   the other way so the surface shimmers, and embers rising off it. The noise
   is periodic, so it tiles without seams. */
const LAVA_TEX={};
/* `cold`: the same, in the colours of the Armoury's quench - dark water with
   pale light moving in it, where the Bastion, made of molten metal, is hurt */
function lavaTex(cold){
  const key=cold?'cold':'hot';
  if(LAVA_TEX[key]) return LAVA_TEX[key];
  const N=256, P=8;
  const lat=(seed)=>{ const g=[]; for(let i=0;i<P*P;i++) g.push(rand(0,1)); return g; };
  const noise=(g,x,y,per)=>{          // value noise on a per-period lattice, smoothstepped
    const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
    const sx=xf*xf*(3-2*xf), sy=yf*yf*(3-2*yf);
    const at=(a,b)=>g[((b%per+per)%per)*P+((a%per+per)%per)];
    return (at(xi,yi)*(1-sx)+at(xi+1,yi)*sx)*(1-sy)+(at(xi,yi+1)*(1-sx)+at(xi+1,yi+1)*sx)*sy;
  };
  const fbm=(gs,u,v)=>{ let a=0,amp=0.5,tot=0; for(let o=0;o<3;o++){ const per=2<<o; a+=amp*noise(gs[o],u*per,v*per,per); tot+=amp; amp*=0.5; } return a/tot; };
  const ga=[lat(),lat(),lat()], gb=[lat(),lat(),lat()];
  const stops=cold?[[0,[6,16,28]],[0.35,[14,48,74]],[0.6,[40,120,170]],[0.82,[130,210,245]],[1,[230,250,255]]]
                  :[[0,[60,10,2]],[0.35,[140,30,6]],[0.6,[255,90,20]],[0.82,[255,170,70]],[1,[255,240,190]]];
  const col=t=>{ for(let k=1;k<stops.length;k++) if(t<=stops[k][0]){ const [t0,c0]=stops[k-1], [t1,c1]=stops[k], f=(t-t0)/(t1-t0);
      return c0.map((c,i)=>Math.round(c+(c1[i]-c)*f)); } return stops[stops.length-1][1]; };
  const mk=()=>{ const c=document.createElement('canvas'); c.width=c.height=N; return c; };
  const base=mk(), over=mk(), bd=base.getContext('2d').createImageData(N,N), od=over.getContext('2d').createImageData(N,N);
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){
    const u=x/N, v=y/N;
    const crust=fbm(ga,u,v), vein=1-Math.abs(fbm(gb,u,v)*2-1);
    const t=Math.min(1,0.12+crust*0.5+Math.pow(vein,9)*0.75);
    const c=col(t), k=(y*N+x)*4;
    bd.data[k]=c[0]; bd.data[k+1]=c[1]; bd.data[k+2]=c[2]; bd.data[k+3]=255;
    const g=Math.pow(vein,10)*255;
    if(cold){ od.data[k]=Math.round(150+g*0.35); od.data[k+1]=230; od.data[k+2]=255; }
    else{ od.data[k]=255; od.data[k+1]=Math.round(150+g*0.35); od.data[k+2]=60; }
    od.data[k+3]=Math.round(g*0.35);
  }
  base.getContext('2d').putImageData(bd,0,0); over.getContext('2d').putImageData(od,0,0);
  return LAVA_TEX[key]={base,over};
}
function addMolten(h){
  const [x,y,z]=h.p, [w,hh,d]=h.s;
  const LT=lavaTex(h.cold), tile=9;
  const tex=c=>{ const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(w/tile,d/tile); return t; };
  const mat=new THREE.MeshBasicMaterial({color:0xffffff, map:tex(LT.base)});
  mat.__perObject=true;
  const grp=new THREE.Group(); scene.add(own(grp)); h.grp=grp;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),mat);
  m.rotation.x=-Math.PI/2; m.position.set(x,y+hh,z); grp.add(m);
  // the glow over it, drifting the other way
  const om=new THREE.MeshBasicMaterial({map:tex(LT.over),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
  om.__perObject=true; om.map.repeat.multiplyScalar(0.7);
  const o=new THREE.Mesh(new THREE.PlaneGeometry(w,d),om);
  o.rotation.x=-Math.PI/2; o.position.set(x,y+hh+0.02,z); grp.add(o);
  h.mat=mat; h.over=om; h.ph=0;
  grp.visible=!h.off;
  moltens.push(h);
}

/* A fall of metal: a sheet of it pouring over an edge, `p` its foot's middle,
   `s` [width, height], spanning x (`across:'z'` to span z). Nothing to stand
   in - it is over a pit - just the metal going somewhere. Off, it thins away. */
function addCascade(h){
  const [x,y,z]=h.p, [w,hh]=h.s, LT=lavaTex(), tile=9;
  const tex=c=>{ const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(w/tile,hh/tile*0.5); return t; };
  const mat=new THREE.MeshBasicMaterial({color:0xffffff, map:tex(LT.base), side:THREE.DoubleSide, transparent:true, fog:false});
  mat.__perObject=true;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,hh),mat);
  m.position.set(x,y+hh/2,z); if(h.across==='z') m.rotation.y=Math.PI/2;
  scene.add(own(m)); h.mesh=m; h.mat=mat; h.fade=h.off?0:1;
}
function updateCascade(h,dt){
  h.fade+=((h.off?0:1)-h.fade)*Math.min(1,dt*1.5);
  h.mat.opacity=h.fade; h.mesh.visible=h.fade>0.02;
  if(!h.mesh.visible) return;
  h.mat.map.offset.y+=dt*0.9;                 // pouring down
  const br=0.95+Math.sin(game.time*2.1)*0.05; h.mat.color.setRGB(br,br,br);
  const [x,y,z]=h.p, [w]=h.s;
  if(Math.random()<dt*w*0.3*h.fade){
    const u=rand(-w/2,w/2);
    if(h.across==='z') _v.set(x,y+0.3,z+u); else _v.set(x+u,y+0.3,z);
    FX.burst(_v,4,0xff8a30,5,0.6,-2);
  }
}

/* A storm vent in the floor: a rim, a well of violet glow, and slats across it.
   Laid on top of the slab it stands on, so it reads as where the storm comes from. */
const VENT_SLAT=0x1d1830, VENT_RIM=0x3d3460, VENT_GLOW=0x7448e0;
function buildVent(x,top,z,w,d){
  const rimM=new THREE.MeshLambertMaterial({color:VENT_RIM});
  const slatM=new THREE.MeshLambertMaterial({color:VENT_SLAT});
  const glowM=new THREE.MeshBasicMaterial({color:VENT_GLOW,transparent:true,opacity:0.6,depthWrite:false,blending:THREE.AdditiveBlending,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
  for(const m of [rimM,slatM,glowM]) m.__perObject=true;
  // the glow, just over the slab, under everything else
  const gl=new THREE.Mesh(new THREE.PlaneGeometry(w*0.9,d*0.9),glowM);
  gl.rotation.x=-Math.PI/2; gl.position.set(x,top+0.01,z); scene.add(own(gl));
  // a raised rim round it
  const r=0.35, rh=0.14;
  for(const [rx,rz,rw,rd] of [[x,z-d/2+r/2,w,r],[x,z+d/2-r/2,w,r],[x-w/2+r/2,z,r,d-2*r],[x+w/2-r/2,z,r,d-2*r]]){
    const m=new THREE.Mesh(new THREE.BoxGeometry(rw,rh,rd),rimM);
    m.position.set(rx,top+rh/2,rz); scene.add(own(m));
  }
  // slats across the short way, a hand apart
  const n=Math.max(4,Math.round((d-2*r)/1.0)), geo=new THREE.BoxGeometry(w-2*r,0.08,0.2);
  for(let i=0;i<n;i++){
    const m=new THREE.Mesh(geo,slatM);
    m.position.set(x,top+0.07,z-d/2+r+(i+0.5)*(d-2*r)/n); scene.add(own(m));
  }
}

/* A panel has to read as a fitted plate rather than as wall, or a player has no
   way of knowing which piece of the room is meant to move. Amber, because amber
   already means "this moves" everywhere else in the campaign: a dark slab, an
   amber border, and ribs across both faces.

   The slab runs taller than its opening so its top edge is buried in the lintel.
   Flush, those two faces are coplanar across the whole span and flicker. */
function buildPanelMesh(x,y,z,w,h,d){
  const turn = w < d;                       // a panel in a wall that faces x
  if(turn){ const t=w; w=d; d=t; }
  const g=new THREE.Group();
  const lit=new THREE.MeshBasicMaterial({color:0xffc24d});
  lit.__perObject=true;
  // Exactly the opening, no overlap: run up into the lintel, its side faces
  // would sit inside that wall in the same planes, two outward faces fighting
  // over a sliver along the top edge. Flush, every face it has is pressed back
  // to back against the piece it meets, which never fights.
  const slab=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),MAT.dark);
  slab.castShadow=true; slab.receiveShadow=true;
  g.add(slab);
  // The border sits a few centimetres inside the opening. Flush, the top bar's
  // upper face would land in the same plane as the underside of whatever is
  // above the opening, and flicker.
  const fr=Math.min(0.2,Math.min(w,h)*0.12), in_=0.04, face=d/2+0.03;
  for(const sy of [-1,1]){
    const b=new THREE.Mesh(new THREE.BoxGeometry(w-in_*2,fr,d*1.05),lit);
    b.position.set(0,sy*(h/2-fr/2-in_),0); g.add(b);
  }
  for(const sx of [-1,1]){
    const b=new THREE.Mesh(new THREE.BoxGeometry(fr,h-fr*2-in_*2,d*1.05),lit);
    b.position.set(sx*(w/2-fr/2-in_),0,0); g.add(b);
  }
  // Braced corner to corner rather than barred across: bars would read as a grate.
  const ang=Math.atan2(h,w), len=Math.hypot(w,h)*0.78, rib=Math.min(0.14,Math.min(w,h)*0.09);
  for(const sd of [-1,1]) for(const sz of [-1,1]){
    const r=new THREE.Mesh(new THREE.BoxGeometry(len,rib,0.05),lit);
    r.position.set(0,0,sz*face); r.rotation.z=sd*ang; g.add(r);
  }
  g.position.set(x,y+h/2,z);
  if(turn) g.rotation.y=Math.PI/2;
  scene.add(own(g));
  return g;
}

function setPanel(p,open,instant){
  p.open=open;
  if(!open){
    p.t=0; p.mesh.position.y=p.y0+p.h/2; p.mesh.visible=true;
    if(colliders.indexOf(p.col)<0) colliders.push(p.col);
  } else if(instant){
    p.t=1; p.mesh.visible=false;
    const i=colliders.indexOf(p.col); if(i>=0) colliders.splice(i,1);
  } else {
    SFX.waveUp();
  }
}

/* A grate: slats with gaps you can see and shoot through, backed by a single
   collider flagged as a grate - solid to bodies, transparent to piercing
   rounds. Which way it faces is read from its own box: the short horizontal
   side is the thickness, and the long one is the span. */
function buildGrate(x,y,z,w,h,d){
  const thinX=w<d;
  const th=thinX?w:d, span=thinX?d:w;
  const n=Math.max(3,Math.round(h/0.62));
  const barMat=new THREE.MeshBasicMaterial({color:0xffc24d});
  barMat.__perObject=true;
  const bar=thinX?new THREE.BoxGeometry(th,0.11,span):new THREE.BoxGeometry(span,0.11,th);
  for(let i=0;i<n;i++){
    const m=new THREE.Mesh(bar,barMat);
    m.position.set(x,y+(i+0.5)*(h/n),z);
    scene.add(own(m));
  }
  // end posts, at the two ends of the span - narrow, not the full opening
  const post=thinX?new THREE.BoxGeometry(th*1.2,h,0.16):new THREE.BoxGeometry(0.16,h,th*1.2);
  for(const sn of [-1,1]){
    const m=new THREE.Mesh(post,barMat);
    if(thinX) m.position.set(x,y+h/2,z+sn*(span/2-0.08));
    else      m.position.set(x+sn*(span/2-0.08),y+h/2,z);
    scene.add(own(m));
  }
  colliders.push({min:V3(x-w/2,y,z-d/2),max:V3(x+w/2,y+h,z+d/2),grate:true});
}

/* A window: a faint pane of glass in a dark frame, with mullions. Solid to
   bodies and shots alike. */
function buildWindow(x,y,z,w,h,d,g){
  if(h<w&&h<d){ buildSkylight(x,y,z,w,h,d,g||{}); return; }
  const thinX=w<d;
  const th=thinX?w:d, span=thinX?d:w;
  const pane=new THREE.MeshBasicMaterial({color:0x7fd8ff,transparent:true,opacity:0.07,depthWrite:false,side:THREE.DoubleSide});
  pane.__perObject=true;
  const glass=new THREE.Mesh(thinX?new THREE.PlaneGeometry(span,h):new THREE.PlaneGeometry(span,h),pane);
  glass.position.set(x,y+h/2,z); if(thinX) glass.rotation.y=Math.PI/2;
  scene.add(own(glass));
  const frameM=new THREE.MeshLambertMaterial({color:0x1b2233});
  frameM.__perObject=true;
  const n=Math.max(1,Math.round(span/3.5));          // mullions every 3-4m, and the two ends
  for(let i=0;i<=n;i++){
    const a=-span/2+span*i/n, inset=i===0?0.09:(i===n?-0.09:0);
    const m=new THREE.Mesh(thinX?new THREE.BoxGeometry(th*0.8,h,0.18):new THREE.BoxGeometry(0.18,h,th*0.8),frameM);
    if(thinX) m.position.set(x,y+h/2,z+a+inset); else m.position.set(x+a+inset,y+h/2,z);
    scene.add(own(m));
  }
  for(const yy of [y+0.09,y+h-0.09]){                 // sill and head
    const m=new THREE.Mesh(thinX?new THREE.BoxGeometry(th*0.8,0.18,span):new THREE.BoxGeometry(span,0.18,th*0.8),frameM);
    m.position.set(x,yy,z); scene.add(own(m));
  }
  colliders.push({min:V3(x-w/2,y,z-d/2),max:V3(x+w/2,y+h,z+d/2),glass:true});
}

/* Glass laid flat: a roof you look up through, ribbed in dark frames both
   ways. 3-3's Lift Hall, which the eye watches through from the top of the
   Well. */
function buildSkylight(x,y,z,w,h,d,g){
  const pane=new THREE.MeshBasicMaterial({color:0x7fd8ff,transparent:true,opacity:0.06,depthWrite:false,side:THREE.DoubleSide});
  pane.__perObject=true;
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(w,d),pane);
  glass.rotation.x=-Math.PI/2; glass.position.set(x,y+h/2,z); scene.add(own(glass));
  const frameM=new THREE.MeshLambertMaterial({color:0x1b2233});
  frameM.__perObject=true;
  // `rib` [spacing, x, z]: the ribs on one grid through that point, so a roof
  // laid in pieces lines up across them. Spaced per piece, the Lift Hall's
  // three panes' ribs didn't meet.
  const lines=(a0,a1,o,sp)=>{ const out=[]; for(let k=Math.ceil((a0-o)/sp+0.05);o+k*sp<a1-0.05*sp;k++) out.push(o+k*sp); return out; };
  const xs=g.rib?lines(x-w/2,x+w/2,g.rib[1],g.rib[0]):[...Array(Math.max(1,Math.round(w/4))-1)].map((_,i)=>x-w/2+w*(i+1)/Math.max(1,Math.round(w/4)));
  const zs=g.rib?lines(z-d/2,z+d/2,g.rib[2],g.rib[0]):[...Array(Math.max(1,Math.round(d/4))-1)].map((_,i)=>z-d/2+d*(i+1)/Math.max(1,Math.round(d/4)));
  for(const rx of xs){ const m=new THREE.Mesh(new THREE.BoxGeometry(0.22,h*0.8,d),frameM);
    m.position.set(rx,y+h/2,z); scene.add(own(m)); }
  for(const rz of zs){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h*0.8,0.22),frameM);
    m.position.set(x,y+h/2,rz); scene.add(own(m)); }
  // `walk`: a glass floor, and the eye's light lands on it, not on what is under it
  colliders.push({min:V3(x-w/2,y,z-d/2),max:V3(x+w/2,y+h,z+d/2),glass:true,walk:!!g.walk});
}

/* A moving skylight: the pane and its ribs in one group, centred where a mover's
   mesh is, and its collider pushed last for the mover to carry. `rib` [spacing,
   x, z] lays the ribs on a world grid where it stands at the end of its run. */
function glassSlab(x,y,z,w,h,d,rib){
  const grp=new THREE.Group();
  const pane=new THREE.MeshBasicMaterial({color:0x7fd8ff,transparent:true,opacity:0.06,depthWrite:false,side:THREE.DoubleSide});
  pane.__perObject=true;
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(w,d),pane);
  glass.rotation.x=-Math.PI/2; grp.add(glass);
  const frameM=new THREE.MeshLambertMaterial({color:0x1b2233});
  frameM.__perObject=true;
  const sp=rib?rib[0]:4, ox=rib?rib[1]:x, oz=rib?rib[2]:z;
  for(let k=Math.ceil((x-w/2-ox)/sp+0.05);ox+k*sp<x+w/2-0.05*sp;k++){
    const m=new THREE.Mesh(new THREE.BoxGeometry(0.22,h*0.8,d),frameM); m.position.x=ox+k*sp-x; grp.add(m); }
  for(let k=Math.ceil((z-d/2-oz)/sp+0.05);oz+k*sp<z+d/2-0.05*sp;k++){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h*0.8,0.22),frameM); m.position.z=oz+k*sp-z; grp.add(m); }
  // and a frame round its edge, so a pane sliding out reads as a thing that moves
  for(const [ex,ez,ew,ed] of [[0,-d/2+0.15,w,0.3],[0,d/2-0.15,w,0.3],[-w/2+0.15,0,0.3,d],[w/2-0.15,0,0.3,d]]){
    const m=new THREE.Mesh(new THREE.BoxGeometry(ew,h*0.9,ed),frameM); m.position.set(ex,0,ez); grp.add(m); }
  grp.position.set(x,y+h/2,z); scene.add(own(grp));
  colliders.push({min:V3(x-w/2,y,z-d/2),max:V3(x+w/2,y+h,z+d/2)});
  return grp;
}
/* The same, standing up: a window that moves. Mullions every 3-4m, a sill and
   a head, built about its middle so the platform code can carry it. */
function glassWall(x,y,z,w,h,d){
  const grp=new THREE.Group();
  const thinX=w<d, th=thinX?w:d, span=thinX?d:w;
  const pane=new THREE.MeshBasicMaterial({color:0x7fd8ff,transparent:true,opacity:0.07,depthWrite:false,side:THREE.DoubleSide});
  pane.__perObject=true;
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(span,h),pane);
  if(thinX) glass.rotation.y=Math.PI/2;
  grp.add(glass);
  const frameM=new THREE.MeshLambertMaterial({color:0x1b2233});
  frameM.__perObject=true;
  const n=Math.max(1,Math.round(span/3.5));
  for(let i=0;i<=n;i++){
    const a=-span/2+span*i/n, inset=i===0?0.09:(i===n?-0.09:0);
    const m=new THREE.Mesh(thinX?new THREE.BoxGeometry(th*0.8,h,0.18):new THREE.BoxGeometry(0.18,h,th*0.8),frameM);
    if(thinX) m.position.z=a+inset; else m.position.x=a+inset;
    grp.add(m);
  }
  for(const yy of [-h/2+0.09,h/2-0.09]){
    const m=new THREE.Mesh(thinX?new THREE.BoxGeometry(th*0.8,0.18,span):new THREE.BoxGeometry(span,0.18,th*0.8),frameM);
    m.position.y=yy; grp.add(m);
  }
  grp.position.set(x,y+h/2,z); scene.add(own(grp));
  colliders.push({min:V3(x-w/2,y,z-d/2),max:V3(x+w/2,y+h,z+d/2)});
  return grp;
}
/* A fence that is live while it is up: the glass crackles, and touching it
   stings and throws you back off it, so a roof's edge is never a safe place to
   skirt along. `shock` is the damage of a touch. */
const SHOCK=0xc9b8ff;
function shockRig(mesh,mv){
  const pane=mesh.children[0], frame=mesh.children[1].material;
  return {dmg:mv.shock, cool:0, up:mv.to[1], pane, frame, base:pane.material.color.getHex(), op:pane.material.opacity};
}
const _fa=V3(), _fb=V3();
function updateShocks(dt){
  for(const m of level.movers){
    const S=m.shock; if(!S) continue;
    S.cool-=dt;
    const [w,h,d]=m.s, x=m.at.x, z=m.at.z, top=m.at.y+h;
    const live=top-S.up>1.5;              // standing clear of the deck it rings
    // its frame burns while it is live, so it never reads as plain glass
    S.pane.material.color.setHex(live?SHOCK:S.base);
    S.pane.material.opacity=live?0.1+Math.random()*0.05:S.op;
    S.frame.emissive.setHex(live?SHOCK:0); if(live) S.frame.emissive.multiplyScalar(0.55+Math.random()*0.2);
    if(!live) continue;
    const thinX=w<d, span=thinX?d:w, y0=Math.max(m.at.y,S.up);
    // forks of lightning crawling over the glass, kept in its plane
    if(Math.random()<dt*span*0.15){
      const a=rand(-span/2,span/2), b=clamp(a+rand(-5,5),-span/2,span/2);
      const ya=rand(y0+0.3,top-0.3), yb=rand(y0+0.3,top-0.3);
      let pa=a, py=ya;
      for(let i=1;i<=5;i++){
        const f=i/5, j=i<5?0.8:0, qa=a+(b-a)*f+rand(-j,j), qy=ya+(yb-ya)*f+rand(-j,j);
        if(thinX){ _fa.set(x,py,z+pa); _fb.set(x,qy,z+qa); } else { _fa.set(x+pa,py,z); _fb.set(x+qa,qy,z); }
        FX.tracer(_fa,_fb,SHOCK,0.08,0.12);
        pa=qa; py=qy;
      }
    }
    // touching it: the collider stops you at its face, so this is contact
    const pp=player.pos;
    const gap=thinX?Math.abs(pp.x-x)-w/2:Math.abs(pp.z-z)-d/2;
    const along=thinX?Math.abs(pp.z-z)<=d/2+RAD:Math.abs(pp.x-x)<=w/2+RAD;
    if(S.cool<=0&&along&&gap<=RAD+0.12&&pp.y+TALL>y0&&pp.y<top){
      player.iFrames=0;                     // a dash does not carry you through the sting
      damagePlayer(S.dmg,null); S.cool=0.6;
      if(player.grapple) releaseGrapple(false);
      const out=thinX?Math.sign(pp.x-x)||1:Math.sign(pp.z-z)||1;
      if(thinX) player.vel.x=out*10; else player.vel.z=out*10;
      player.vel.y=Math.max(player.vel.y,5);
      FX.burst(pp,14,SHOCK,7,0.3,6); SFX.ezap(); SFX.crackle();
    }
  }
}

function marker(geoSet,colour,p,scale){
  const grp=new THREE.Group();
  const hull=new THREE.Mesh(geoSet.hull,hullMat.clone());
  hull.material.__perObject=true;
  hull.castShadow=true;
  grp.add(hull);
  const glow=new THREE.Mesh(geoSet.glow,new THREE.MeshBasicMaterial({color:colour}));
  glow.material.__perObject=true;
  grp.add(glow);
  const halo=sprite(colour,1.5,0.4); halo.material.__perObject=true; grp.add(halo);
  grp.position.set(p[0],p[1],p[2]);
  if(scale) grp.scale.setScalar(scale);
  scene.add(own(grp));
  return grp;
}

/* ---------- doors ---------- */
/* A door has to read as a door at a glance, so it gets its own look: a dark leaf,
   a lit frame in the lock colour, and chevrons pointing at the opening. */
/* Marks the way into a room that seals behind you: posts either side of the
   opening and a beam across its head, set proud of the wall. It frames the
   opening rather than decorating a door, so it reads the same whether a door
   hangs there or the way is simply open. */
function addPortalFrame(p,size){
  const [x,y,z]=p, [w,h,d]=size;
  // Deep red metal: nothing else in the palette is red, and being lit rather
  // than unlit it catches the neon around it instead of reading as flat paint.
  const mat=MAT.portal;
  const g=new THREE.Group();
  // Set into the wall by a few centimetres: flush, the frame's inner faces land
  // in the plane of the opening itself and the two fight all the way round.
  // Broad, because on metal a wide face is where the light and reflections
  // show, so the frame reads as a machined surround.
  const T=0.62, out=Math.min(w,d)+0.5, IN=0.07;
  const wide=w>=d;
  const span=wide?w:d;
  for(const s2 of [-1,1]){
    const post=new THREE.Mesh(wide?new THREE.BoxGeometry(T,h+T,out)
                                  :new THREE.BoxGeometry(out,h+T,T),mat);
    if(wide) post.position.set(s2*(span/2+T/2+IN),h/2,0);
    else     post.position.set(0,h/2,s2*(span/2+T/2+IN));
    g.add(post);
  }
  const head=new THREE.Mesh(wide?new THREE.BoxGeometry(span+T*2+IN*2,T,out)
                                :new THREE.BoxGeometry(out,T,span+T*2+IN*2),mat);
  head.position.y=h+T/2+IN; g.add(head);
  g.position.set(x,y,z);
  scene.add(own(g));
  return g;
}
function buildDoorMesh(x,y,z,w,h,dp,colour){
  // A door's thin axis is its depth. In a wall that faces x the opening runs
  // along z, so the slab arrives with width and depth swapped and draws as a
  // squat block with its chevrons on the wrong faces. Build it the right way
  // round and turn it. The collider uses the raw size and is unaffected.
  const turn = w < dp;
  if(turn){ const t=w; w=dp; dp=t; }
  const g=new THREE.Group();
  const lit=new THREE.MeshBasicMaterial({color:colour});
  lit.__perObject=true;
  const leaf=new THREE.Mesh(new THREE.BoxGeometry(w,h,dp),MAT.dark);
  leaf.castShadow=true; leaf.receiveShadow=true;
  g.add(leaf);
  // The frame stands proud of the leaf. Sitting it flush put the bar's outer
  // face in the same plane as the leaf's, and two coplanar surfaces flicker
  // against each other as the camera moves.
  const fr=0.22, prd=0.04, dz=dp/2+0.06;
  for(const sy of [-1,1]){
    const bar=new THREE.Mesh(new THREE.BoxGeometry(w,fr,dp*1.1),lit);
    bar.position.set(0,sy*(h/2-fr/2+prd),0); g.add(bar);
  }
  for(const sx of [-1,1]){
    const bar=new THREE.Mesh(new THREE.BoxGeometry(fr,h,dp*1.1),lit);
    bar.position.set(sx*(w/2-fr/2+prd),0,0); g.add(bar);
  }
  // split line down the middle plus chevrons either side of it
  const split=new THREE.Mesh(new THREE.BoxGeometry(0.1,h-fr*2,dp*1.15),lit);
  g.add(split);
  for(const sz of [-1,1]) for(let i=0;i<3;i++){
    for(const sx of [-1,1]){
      const c=new THREE.Mesh(new THREE.BoxGeometry(w*0.20,0.1,0.08),lit);
      c.position.set(sx*w*0.24, (i-1)*h*0.22, sz*dz);
      c.rotation.z=sx*0.5;
      g.add(c);
    }
  }
  g.position.set(x,y+h/2,z);
  if(turn) g.rotation.y=Math.PI/2;
  scene.add(own(g));
  return {group:g, lit};
}

function addDoor(d){
  const [x,y,z]=d.p, [w,h,dp]=d.s;
  const colour=LOCK_COLOUR[d.lock||'script']||0x5df0ff;
  const built=buildDoorMesh(x,y,z,w,h,dp,colour);
  if(d.boss) addPortalFrame(d.p,d.s);
  const mesh=built.group;
  // The slab is drawn 1.2 deep so its faces stand proud of the wall's; its
  // collider is the wall's 1.0, or the 10cm standing proud under the wall above
  // would be a ledge to climb on.
  const ix=w<dp?Math.min(0.1,(w-0.6)/2):0, iz=w<dp?0:Math.min(0.1,(dp-0.6)/2);
  colliders.push({min:V3(x-w/2+Math.max(0,ix),y,z-dp/2+Math.max(0,iz)),
                  max:V3(x+w/2-Math.max(0,ix),y+h,z+dp/2-Math.max(0,iz))});
  const bar={position:{y:0},material:built.lit,visible:true};   // kept for the open animation
  const rec={id:d.id, lock:d.lock||'script', mesh, bar, colour, lit:built.lit, boss:!!d.boss,
             collider:colliders[colliders.length-1], open:false, t:0, base:y, h};
  level.doors.push(rec);
  if(d.lamps) addLamps(rec,d);
  if(d.open){ openDoor(rec,true); rec.t=1; }      // starts open, for doors a trigger seals
  return rec;
}
/* A door that more than one thing has to open wears a row of lamps over it, one
   per thing, dark until that thing is done. The door opens with the last one,
   and until then it is plain how much is left. Lamps sit on both faces of the
   wall, proud of it. */
const LAMP_OFF=0x4a2430, LAMP_ON=0x8dff6a;
// `lamps` as a list of key colours: each lamp is its key's colour, dim till
// that key is taken - a door three keys open says which three
function lampHex(rec,i,on){
  const c=rec.lampCols&&rec.lampCols[i];
  if(!c) return on?LAMP_ON:LAMP_OFF;
  const k=LOCK_COLOUR[c]||LAMP_ON;
  return on?k:new THREE.Color(k).multiplyScalar(0.16).getHex();
}
function addLamps(rec,d){
  const [x,y,z]=d.p, [w,h,dp]=d.s, n=Array.isArray(d.lamps)?d.lamps.length:d.lamps;
  rec.lampCols=Array.isArray(d.lamps)?d.lamps:null;
  const along=w<dp?'z':'x', out=along==='z'?'x':'z';
  const wallHalf=(d.wall||1)/2, gap=1.5, g=new THREE.Group();
  rec.lamps=[]; rec.lampsOn=0; rec.lampsNeed=n;
  for(let i=0;i<n;i++){
    const mat=new THREE.MeshBasicMaterial({color:lampHex(rec,i,false)});
    mat.__perObject=true;
    const u=(i-(n-1)/2)*gap;
    for(const side of [-1,1]){
      const box=new THREE.Mesh(out==='x'?new THREE.BoxGeometry(0.22,1.0,1.0)
                                        :new THREE.BoxGeometry(1.0,1.0,0.22),MAT.dark);
      const lamp=new THREE.Mesh(out==='x'?new THREE.BoxGeometry(0.1,0.62,0.62)
                                         :new THREE.BoxGeometry(0.62,0.62,0.1),mat);
      const o1=side*(wallHalf+0.11), o2=side*(wallHalf+0.27);
      box.position[along]=u; box.position[out]=o1;
      lamp.position[along]=u; lamp.position[out]=o2;
      g.add(box,lamp);
    }
    rec.lamps.push(mat);
  }
  g.position.set(x,y+h+1.3,z);
  scene.add(own(g));
  rec.lampGroup=g;
}
function setLamps(rec,on,quiet){
  rec.lampsOn=Math.min(on,rec.lampsNeed);
  rec.lamps.forEach((m,i)=>m.color.setHex(lampHex(rec,i,i<rec.lampsOn)));
  if(!quiet&&on>0){
    const p=rec.lampGroup.position;
    FX.ring(p,lampHex(rec,rec.lampsOn-1,true),2.5,0.4); SFX.reload();
  }
}
function openDoor(rec,quiet){   // quiet: put back by a respawn, or built open
  if(rec.open) return;
  if(rec.lit) rec.lit.color.setHex(0x8dff6a);      // green once released
  rec.open=true; rec.t=0;
  const i=colliders.indexOf(rec.collider);
  if(i>=0) colliders.splice(i,1);
  if(!quiet) SFX.door();
  FX.ring(rec.mesh.position,rec.colour,4,0.5);
}
function sealDoor(rec,quiet){
  if(!rec.open) return;
  if(rec.lit) rec.lit.color.setHex(rec.colour);
  rec.open=false; rec.t=0;
  colliders.push(rec.collider);
  if(!quiet) SFX.doorShut();
}
/* A keyed door the eye seals is fused: its lock burnt out, cooling red, so it
   is plain that the key you hold no longer opens it. */
const FUSED=0xb8321a;
function fuseLook(rec){
  rec.fused=!!(rec.sealed&&!rec.open&&rec.lock!=='script');
  if(rec.lit&&!rec.open) rec.lit.color.setHex(rec.fused?FUSED:rec.colour);
}
/* A burner: a damage volume with a vent you can see, a tell before it fires
   and a column of flame while it does, so the damage never comes from nothing. */
function addBurner(h){
  const [x,y,z]=h.p, [w,hh,d]=h.s;
  const g=new THREE.Group();
  // A dark mouth laid flush reads as a hole in the deck; a raised slab reads as
  // a mat dropped on top of it. The mouth covers the damage footprint, so what
  // you can see is what will burn you.
  const mouthMat=new THREE.MeshBasicMaterial({color:0x0a0e16});
  mouthMat.__perObject=true;
  const mouth=new THREE.Mesh(new THREE.PlaneGeometry(w*0.94,d*0.94),mouthMat);
  mouth.rotation.x=-Math.PI/2; mouth.position.y=0.015; g.add(mouth);
  // a shallow lip around the opening, so it has an edge to be cut into
  const lipMat=new THREE.MeshBasicMaterial({color:0x333d4d});
  lipMat.__perObject=true;
  for(const [sx,sz,lw,ld] of [[0,-1,w,0.22],[0,1,w,0.22],[-1,0,0.22,d],[1,0,0.22,d]]){
    const l=new THREE.Mesh(new THREE.BoxGeometry(lw,0.09,ld),lipMat);
    l.position.set(sx*(w*0.47),0.045,sz*(d*0.47)); g.add(l);
  }
  // narrow slats, cold steel until the vent starts to wind up
  const bars=new THREE.MeshBasicMaterial({color:0x46516a});
  bars.__perObject=true;
  for(let i=0;i<9;i++){
    const b=new THREE.Mesh(new THREE.BoxGeometry(w*0.88,0.06,d*0.035),bars);
    b.position.set(0,0.05,(i/8-0.5)*d*0.84); g.add(b);
  }
  // an outer plume with a brighter core reads as a jet; one big translucent
  // box reads as a pane of orange glass
  const flameMat=new THREE.MeshBasicMaterial({color:0xff8a3a,transparent:true,
    opacity:0,depthWrite:false,side:THREE.DoubleSide});
  flameMat.__perObject=true;
  const coreMat=new THREE.MeshBasicMaterial({color:0xffe07a,transparent:true,
    opacity:0,depthWrite:false,side:THREE.DoubleSide});
  coreMat.__perObject=true;
  const col=new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w,d)*0.42,Math.min(w,d)*0.30,hh,10,1,true),flameMat);
  const core=new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w,d)*0.20,Math.min(w,d)*0.13,hh,8,1,true),coreMat);
  col.position.y=hh/2; core.position.y=hh/2; g.add(col); g.add(core);
  // Sit it on the floor. The damage volume usually reaches below the deck, and
  // placing the grille at the bottom of it buried the whole vent - grille,
  // warning and all - two metres under the floor it is cut into.
  const deck=groundAt(x,z,y+hh/2);
  g.position.set(x,deck+0.01,z);
  scene.add(own(g));
  h.flame=col; h.core=core; h.flameMat=flameMat; h.coreMat=coreMat; h.bars=bars; h.mouthMat=mouthMat; h.h=hh;
}
/* A laser grid: a sheet of beams across a way through, stretched between two
   emitters. Timed ones cycle - off, a flicker of warning, on - and the gap is
   the way past. One with no period is on until something cuts its power. The
   thin axis of its box is the one you cross. */
const LASER=0xff2a4a;
function addLaser(h){
  const [x,y,z]=h.p, [w,hh,d]=h.s;
  const alongX=w>=d, span=alongX?w:d;
  const g=new THREE.Group();
  const beamMat=new THREE.MeshBasicMaterial({color:LASER,transparent:true,opacity:0,depthWrite:false});
  beamMat.__perObject=true;
  const sheetMat=new THREE.MeshBasicMaterial({color:LASER,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
  sheetMat.__perObject=true;
  const n=Math.max(2,Math.round((hh-0.4)/0.5));
  for(let i=0;i<n;i++){
    const b=new THREE.Mesh(new THREE.BoxGeometry(span-0.5,0.05,0.05),beamMat);
    b.position.y=0.3+i*(hh-0.5)/(n-1); g.add(b);
  }
  const sheet=new THREE.Mesh(new THREE.PlaneGeometry(span-0.5,hh-0.2),sheetMat);
  sheet.position.y=hh/2; g.add(sheet);
  // the emitters: dark posts with a strip that shows the state even when off
  const stripMat=new THREE.MeshBasicMaterial({color:0x4a1520});
  stripMat.__perObject=true;
  for(const sgn of [-1,1]){
    const post=new THREE.Mesh(new THREE.BoxGeometry(0.24,hh,0.5),MAT.dark);
    post.position.set(sgn*(span/2-0.12),hh/2,0); g.add(post);
    const strip=new THREE.Mesh(new THREE.BoxGeometry(0.06,hh-0.3,0.2),stripMat);
    strip.position.set(sgn*(span/2-0.27),hh/2,0); g.add(strip);
  }
  g.position.set(x,y,z);
  if(!alongX) g.rotation.y=Math.PI/2;
  scene.add(own(g));
  h.beamMat=beamMat; h.sheetMat=sheetMat; h.stripMat=stripMat; h.alongX=alongX; h.phase=h.phase||0;
  h.g=g; h.cur=[x,y,z]; h.st=h.sweepPhase||0;
  // Solid while it is on, so it can't be run or dashed through.
  const t=0.3;
  h.col={min:V3(alongX?x-w/2:x-t/2, y, alongX?z-t/2:z-d/2),
         max:V3(alongX?x+w/2:x+t/2, y+hh, alongX?z+t/2:z+d/2), noRay:true,
         // it only stops you across its thickness: see moveAxis
         thin:alongX?'z':'x'};
  h.solid=false;
}
/* The mark over a straggler: a red glow drawn over everything, riding on the
   enemy's own mesh so it goes wherever the enemy goes, death and restore included.
   It shows only while there is no clear line between you and the enemy - over one
   you can already see it would be clutter. Grates are seen through. */
const _tgO=V3(), _tgD=V3();
function inSight(e){
  _tgO.set(player.pos.x,player.pos.y+EYE,player.pos.z);
  for(const lift of [0,e.rad*0.8]){
    _tgD.set(e.pos.x-_tgO.x,e.pos.y+lift-_tgO.y,e.pos.z-_tgO.z);
    const d=_tgD.length()||0.001; _tgD.multiplyScalar(1/d);
    if(rayWorld(_tgO,_tgD,d,true)>=d-e.rad) return true;
  }
  return false;
}
function tagLast(e,want,dt){
  if(want&&!e.tag&&e.mesh){
    e.tag=sprite(0xff3f5a,1.5,0.95); e.tag.material.depthTest=false; e.tag.renderOrder=999;
    e.mesh.add(e.tag); e.tagA=inSight(e)?0:0.95; e.tagT=0;
  }
  if(!e.tag) return;
  if(!want){ if(e.tag.parent) e.tag.parent.remove(e.tag); e.tag.material.dispose(); e.tag=null; return; }
  // a few looks a second is plenty, and it fades rather than blinks at a doorway
  if((e.tagT-=dt||0)<=0){ e.tagT=0.15; e.tagHid=!inSight(e); }
  const to=e.tagHid?0.95:0;
  e.tagA+=clamp(to-e.tagA,-(dt||0)*3,(dt||0)*3);
  e.tag.material.opacity=e.tagA; e.tag.visible=e.tagA>0.01;
  const sc=e.mesh.scale, k=1+0.2*Math.sin(game.time*6);
  e.tag.position.set(0,(e.rad+1.1)/(sc.y||1),0);
  e.tag.scale.set(1.5*k/(sc.x||1),1.5*k/(sc.y||1),1);
}
/* A storm is the plant venting its charge: a haze that drains your shield while
   you stand in it, and your health once the shield is gone - and holds the
   shield down so it cannot come back until you are out.

   It is drawn as a cloud, not a box: soft puffs drifting inside its volume and
   spilling a little past it, forks of lightning crawling through, and a glow
   where it lies on the floor - never a lit box, which would read as a cuboid
   sliding about and flicker against the floor.

   What it can do, all optional:
     sweep, period     drift through an offset and back
     rise:[h0,h1]      its top rises and falls between two heights, over period
     riseT             with rise: when switched on, climb from h0 to h1 once
     cycle:{period,duty,phase}  erupt from its vent on a beat, stirring first
     off               switched off (the `hazard` action, or a valve conduit)
   A conduit's `hazards:{on:[],off:[]}` switches storms while it is powered.
   Level `shelters` are boxes no storm reaches into. */
const STORM=0x9a6bff;
let STORM_PUFF_TEX=null, STORM_GLOW_TEX=null;
function stormPuffTex(){
  if(STORM_PUFF_TEX) return STORM_PUFF_TEX;
  const s=128, c=document.createElement('canvas'); c.width=c.height=s;
  const x=c.getContext('2d'), m=s/2;
  // a soft blot with a few lumps in it, so overlapping puffs do not read as discs
  for(let k=0;k<7;k++){
    const a=rand(0,T2), r=k?rand(8,22):0, cx=m+Math.cos(a)*r, cy=m+Math.sin(a)*r, rr=k?rand(22,36):m;
    const g=x.createRadialGradient(cx,cy,0,cx,cy,rr);
    g.addColorStop(0,'rgba(255,255,255,'+(k?0.28:0.55)+')'); g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g; x.fillRect(0,0,s,s);
  }
  STORM_PUFF_TEX=new THREE.CanvasTexture(c);
  return STORM_PUFF_TEX;
}
function stormGlowTex(){
  if(STORM_GLOW_TEX) return STORM_GLOW_TEX;
  // a rectangle that fades out over its outer fifth on every side
  const s=128, c=document.createElement('canvas'); c.width=c.height=s;
  const x=c.getContext('2d'), img=x.createImageData(s,s);
  for(let j=0;j<s;j++) for(let i=0;i<s;i++){
    const e=Math.min(i,j,s-1-i,s-1-j)/(s*0.2), a=Math.min(1,e);
    const k=(j*s+i)*4; img.data[k]=img.data[k+1]=img.data[k+2]=255; img.data[k+3]=Math.round(255*a*a);
  }
  x.putImageData(img,0,0);
  STORM_GLOW_TEX=new THREE.CanvasTexture(c);
  return STORM_GLOW_TEX;
}
function inShelter(x,y,z){
  for(const b of level.shelters)
    if(x>b.x0&&x<b.x1&&y>b.y0&&y<b.y1&&z>b.z0&&z<b.z1) return true;
  return false;
}
function addStorm(h){
  const [x,y,z]=h.p, [w,hh,d]=h.s;
  const top=h.rise?Math.max(h.rise[0],h.rise[1]):hh;
  h.hmax=top;
  const g=new THREE.Group();
  // the cloud: puffs scattered through the volume, none inside a shelter
  const n=Math.max(18,Math.min(320,Math.round(w*top*d/22)));
  const size=Math.max(3.2,Math.min(10,Math.min(w,d,top)*0.75));
  // centres kept in from the sides, so a puff in a duct does not cut a hard
  // line where it meets the wall
  const ix=Math.max(0.4,w/2-size*0.38), iz=Math.max(0.4,d/2-size*0.38);
  const base=[], ph=[];
  for(let k=0,tries=0;k<n&&tries<n*6;tries++){
    const px=rand(-ix,ix), py=rand(0.15,0.95)*top, pz=rand(-iz,iz);
    if(!h.sweep&&inShelter(x+px,y+py,z+pz)) continue;
    base.push(px,py,pz); ph.push(rand(0,T2)); k++;
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(base.slice(),3));
  const puffMat=new THREE.PointsMaterial({map:stormPuffTex(),color:STORM,size,sizeAttenuation:true,
    transparent:true,opacity:0.3,depthWrite:false});
  puffMat.__perObject=true;
  const pts=new THREE.Points(geo,puffMat); pts.frustumCulled=false;
  g.add(pts);
  // and a few bright cores in it, glowing - sparse, or they burn out to white
  const glowMat=new THREE.PointsMaterial({map:stormPuffTex(),color:0xc9a8ff,size:size*0.55,sizeAttenuation:true,
    transparent:true,opacity:0.3,depthWrite:false,blending:THREE.AdditiveBlending});
  glowMat.__perObject=true;
  const cgeo=new THREE.BufferGeometry();
  cgeo.setAttribute('position',geo.getAttribute('position'));     // the same puffs, drifting together
  cgeo.setDrawRange(0,Math.max(3,Math.min(16,Math.round(base.length/3/14))));
  const cores=new THREE.Points(cgeo,glowMat); cores.frustumCulled=false;
  g.add(cores);
  // where it lies on the floor: a soft-edged glow, pushed forward in depth so it
  // never fights the floor it lies on
  let floorMat=null;
  if(h.glow!==false){
    floorMat=new THREE.MeshBasicMaterial({color:STORM,map:stormGlowTex(),transparent:true,opacity:0.3,
      depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4});
    floorMat.__perObject=true;
    const fl=new THREE.Mesh(new THREE.PlaneGeometry(w*1.08,d*1.08),floorMat);
    fl.rotation.x=-Math.PI/2; fl.position.y=0.02; g.add(fl);
  }
  g.position.set(x,y,z);
  scene.add(own(g));
  h.group=g; h.pts=pts; h.cores=cores; h.glowMat=glowMat; h.puffMat=puffMat; h.floorMat=floorMat; h.base=base; h.ph=ph;
  h.phase=h.phase||0; h.at=V3(x,y,z); h.ch=h.rise?h.rise[0]:hh; h.k=1; h.riseAt=0;
  h.box={x0:0,x1:0,y0:0,y1:0,z0:0,z1:0}; h.live=false;
  storms.push(h);
}
/* A fork of lightning: a jagged run of short bolts from a to b. */
const _za=V3(), _zb=V3();
function zap(a,b,color,w,ttl){
  const n=5; _za.copy(a);
  for(let i=1;i<=n;i++){
    const f=i/n, j=i<n?1.1:0;
    _zb.set(a.x+(b.x-a.x)*f+rand(-j,j), a.y+(b.y-a.y)*f+rand(-j*0.5,j*0.5), a.z+(b.z-a.z)*f+rand(-j,j));
    FX.tracer(_za,_zb,color,w,ttl);
    _za.copy(_zb);
  }
}
/* A blast mark on the floor where a scatter jump is meant to go: a scorch with
   streaks thrown outward and a few flecks still glowing in the Scatter's
   colour. It says "someone boosted from here" without a word. Drawn just off the floor and
   pushed forward in depth, so it never fights the deck it lies on. */
let BLAST_TEX=null;
function blastTex(){
  if(BLAST_TEX) return BLAST_TEX;
  const s=256, c=document.createElement('canvas'); c.width=c.height=s;
  const x=c.getContext('2d'), m=s/2;
  const g=x.createRadialGradient(m,m,0,m,m,m);
  g.addColorStop(0,'rgba(8,4,10,.92)'); g.addColorStop(.35,'rgba(14,6,16,.7)');
  g.addColorStop(.7,'rgba(20,8,20,.25)'); g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g; x.fillRect(0,0,s,s);
  // streaks thrown out from the middle
  x.lineCap='round';
  for(let i=0;i<26;i++){
    const a=i/26*T2+rand(-0.1,0.1), r0=rand(10,24), r1=rand(56,118);
    x.strokeStyle='rgba(6,2,8,'+rand(0.45,0.85).toFixed(2)+')'; x.lineWidth=rand(2,6);
    x.beginPath(); x.moveTo(m+Math.cos(a)*r0,m+Math.sin(a)*r0); x.lineTo(m+Math.cos(a)*r1,m+Math.sin(a)*r1); x.stroke();
  }
  // hot flecks, still glowing
  for(let i=0;i<30;i++){
    const a=rand(0,T2), r=rand(14,70);
    x.fillStyle='rgba(255,90,190,'+rand(0.3,0.8).toFixed(2)+')';
    x.fillRect(m+Math.cos(a)*r,m+Math.sin(a)*r,rand(1.5,3.5),rand(1.5,3.5));
  }
  BLAST_TEX=new THREE.CanvasTexture(c);
  return BLAST_TEX;
}
function addBlastMark(mk){
  const [x,y,z]=mk.p, r=mk.r||1.6;
  const g=new THREE.Group();
  const scorch=new THREE.MeshBasicMaterial({map:blastTex(),transparent:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  scorch.__perObject=true;
  const s=new THREE.Mesh(new THREE.PlaneGeometry(r*2.4,r*2.4),scorch);
  s.rotation.x=-Math.PI/2; s.rotation.z=rand(0,T2); g.add(s);
  g.position.set(x,y+0.03,z);
  scene.add(own(g));
}
/* A cage that opens on power held: a ring of segments round its foot, lit one
   by one as the charge builds, so the room says how far there is to go. */
const HOLD_SEGS=16;
function addHoldRing(goal,r){
  const g=new THREE.Group(), mats=[];
  for(let i=0;i<HOLD_SEGS;i++){
    const m=new THREE.MeshBasicMaterial({color:0x2a2240}); m.__perObject=true;
    const a=i/HOLD_SEGS*T2;
    const b=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.18,0.35),m);
    b.position.set(Math.cos(a)*(r+0.9),0.1,Math.sin(a)*(r+0.9)); b.rotation.y=-a+Math.PI/2;
    g.add(b); mats.push(m);
  }
  g.position.set(goal.p[0],groundAt(goal.p[0],goal.p[2],goal.p[1])+0.02,goal.p[2]);
  scene.add(own(g));
  goal.ring=mats; goal.holdT=0; goal.armed=false;
}
function refreshKeys(){
  hud.setKeys(level.keys.map(k=>({colour:k.colour, hex:k.hex, held:!!level.held[k.colour]})));
}
function doorById(id){ return level.doors.find(d=>d.id===id)||null; }

/* ---------- cages: a locked artifact you have to earn ---------- */
/* The cage over a sealed core: stood on the floor under the core, so the core
   is inside it rather than sitting on its bottom rim. Thick collars top and
   bottom that the bars end inside (thin bars pushed through thin rings read as
   badly drawn), a ring halfway up, and a dome of ribs over the top. */
function addCage(p,r,h,hex){
  const grp=new THREE.Group();
  const bars=[];
  const mat=new THREE.MeshLambertMaterial({color:new THREE.Color(hex||0xff3fa4).multiplyScalar(0.45), emissive:hex||0xff3fa4, emissiveIntensity:0.9});
  mat.__perObject=true;
  const N=12, COL=0.16, BAR=0.06;
  const barGeo=new THREE.CylinderGeometry(BAR,BAR,h-2*COL,8);
  for(let i=0;i<N;i++){
    const a=i/N*T2;
    const bar=new THREE.Mesh(barGeo,mat);
    bar.position.set(Math.cos(a)*r,h/2,Math.sin(a)*r);
    grp.add(bar);
    // colliders are wider than the bars so no gap is player-sized
    const cw=Math.max(0.9, 2.2*r*Math.sin(Math.PI/N));
    bars.push({min:V3(p[0]+Math.cos(a)*r-cw/2,p[1],p[2]+Math.sin(a)*r-cw/2),
               max:V3(p[0]+Math.cos(a)*r+cw/2,p[1]+h,p[2]+Math.sin(a)*r+cw/2)});
  }
  bars.push({min:V3(p[0]-r-0.6,p[1]+h,p[2]-r-0.6),           // lid: no dropping in
             max:V3(p[0]+r+0.6,p[1]+h+0.5,p[2]+r+0.6)});
  for(const b of bars) colliders.push(b);
  for(const [y,t] of [[COL,COL],[h-COL,COL],[h/2,0.07]]){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(r,t,8,40),mat);
    ring.rotation.x=Math.PI/2; ring.position.y=y; grp.add(ring);
  }
  // the dome: ribs from the top collar up over the core to a cap
  const rib=new THREE.TorusGeometry(r,0.06,6,28,Math.PI);
  for(let i=0;i<4;i++){
    const m=new THREE.Mesh(rib,mat);
    m.scale.set(1,0.5,1); m.rotation.y=i*Math.PI/4; m.position.y=h-COL; grp.add(m);
  }
  const cap=new THREE.Mesh(new THREE.SphereGeometry(0.22,10,8),mat);
  cap.position.y=h-COL+r*0.5; grp.add(cap);
  grp.position.set(p[0],p[1],p[2]);
  scene.add(own(grp));
  const rec={grp, mat, open:false, r, h, p, bars};
  level.cages.push(rec);
  return rec;
}
/* Nothing may be inside a closed cage. An enemy sealed in there cannot be shot,
   and if the arena is watching it the gate never opens - the level soft-locks. */
function cageClear(x,z,y,margin){
  for(const c of level.cages){
    if(c.open) continue;
    if(y!==undefined&&(y<c.p[1]-1||y>c.p[1]+c.h+1.5)) continue;
    const keep=c.r+(margin||1.6);
    const dx=x-c.p[0], dz=z-c.p[2], d=Math.hypot(dx,dz);
    if(d>=keep) continue;
    const ang=d>0.001?Math.atan2(dz,dx):rand(0,T2);
    x=c.p[0]+Math.cos(ang)*keep; z=c.p[2]+Math.sin(ang)*keep;
  }
  return [x,z];
}
function openCage(c){
  if(c.open) return;
  c.open=true; c.grp.visible=false;
  for(const b of c.bars){ const i=colliders.indexOf(b); if(i>=0) colliders.splice(i,1); }
  // a key's cage: just the key free
  if(c.key){ SFX.waveUp(); FX.ring(c.grp.position,c.key.hex,6,0.7); return; }
  if(level.goal) level.goal.locked=false;
  SFX.waveUp();
  FX.ring(c.grp.position,0x8dff6a,6,0.7);
  hud.banner('CORE UNSEALED','',false);   // the cage is what opened
}
function closeCage(c){
  c.open=false; c.grp.visible=true;
  for(const b of c.bars) if(colliders.indexOf(b)<0) colliders.push(b);
  if(level.goal) level.goal.locked=true;
}

/* ---------- loading ---------- */
/* Everything spawned during play, as opposed to built by the level. */
function clearEntities(){
  clearStrikes(); level.deathWatch.length=0;
  // Marked dead as well as put away: a mite that bursts on you and kills you is
  // swept up by the respawn and then counted dead itself, and the hostile count
  // read -1.
  for(let i=enemies.length-1;i>=0;i--){ disposeEnemy(enemies[i]); enemies[i].dead=true; }
  enemies.length=0;
  // the Severers that cut them are gone, so the anchors come back
  for(const a of anchors){ a.dead=false; a.by=null; a.threat=0; }
  for(let i=bullets.length-1;i>=0;i--) killBullet(bullets[i],i);
  for(let i=pickups.length-1;i>=0;i--){
    const pk=pickups[i];
    scene.remove(pk.mesh);
    if(pk.mats) pk.mats.forEach(m=>m.dispose());
  }
  pickups.length=0;
  game.alive=0;
}

function unloadLevel(){
  endEnding();
  setEnemyBoxes(null);
  game.inLevel=false;
  game.gate=-1;
  hud.setKeys([]);
  clearWorld();
  level.doors.length=0; level.keys.length=0; level.checkpoints.length=0;
  level.weapons.length=0; level.nodes.length=0; anchors.length=0; level.movers.length=0;
  conduits.length=0; pylons.length=0; storms.length=0; moltens.length=0; holes.length=0; voids.length=0; level.shelters.length=0; level.valved=undefined;
  level.counts={}; level.racks=[];
  clearLoads(); level.dropper=null; level.wrecks.length=0; level.falls.length=0; level.riders.length=0; level.cables.length=0;
  clearDeliveries(); level.timers.length=0;
  breaches.length=0; for(const k of debris){ scene.remove(k.m); k.m.geometry.dispose(); } debris.length=0;
  for(const f of fireballs){ scene.remove(f.m); f.m.material.dispose(); } fireballs.length=0;
  level.panels.length=0;
  level.triggers.length=0; level.hazards.length=0; level.pickupDefs.length=0;
  level.placed.length=0; level.killed.length=0; level.groups.clear();   // fresh attempt
  level.goal=null; level.held={}; level.cp=-1; level.cpState=null; level.cpYaw=undefined;
  level.arena=null; game.arenaLocked=false; level.waves=[]; game.holdPct=-1;
  level.loaded=false; level.complete=false; level.deaths=0;
  level.arena=null; level.respawnT=0; level.cages.length=0; level.seenBriefs={}; resetTold(); resetGazeTold(); hud.clearBanners();
  clearEntities();
}

/* Dealt by lot: a level can leave some things to chance, so that a search is a
   search every time. def.shuffle is a list of {slots, items} - names, as many
   items as slots, repeats allowed - and each slot draws one item. Then anything
   in the level marked when:[slot, [items]] is kept only where that slot drew one
   of those items, and a piece with deal:slot takes the `do` its draw names in
   its `dos`. `#deal=0` in the URL deals in the order written (for testing). */
const DEAL_FIXED=/[#&]deal=0/.test(location.hash);
function dealLevel(def){
  if(!def.shuffle) return def;
  const drawn={};
  for(const sh of def.shuffle){
    const it=sh.items.slice();
    if(!DEAL_FIXED) for(let i=it.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [it[i],it[j]]=[it[j],it[i]]; }
    sh.slots.forEach((n,i)=>{ drawn[n]=it[i]; });
  }
  const keep=x=>!(x&&typeof x==='object'&&x.when)||x.when[1].includes(drawn[x.when[0]]);
  const take=x=>(x&&typeof x==='object'&&x.deal&&x.dos)?{...x, do:x.dos[drawn[x.deal]]||[]}:x;
  const out={...def, dealt:drawn};
  for(const k of Object.keys(def)) if(Array.isArray(def[k])&&k!=='shuffle') out[k]=def[k].filter(keep).map(take);
  return out;
}

function loadLevel(def,onComplete,opts){
  opts=opts||{};
  unloadLevel();
  def=dealLevel(def);
  game.inLevel=true;
  level.def=def;
  level.name=def.name||def.id||'UNNAMED';
  hud.setLevel(level.name, def.subtitle||'');
  level.act=def.act||0;
  level.spawn=def.spawn||{p:[0,0,0],yaw:0};
  level.onComplete=onComplete||null;

  setWorldLimits(def.floor===false ? -1e9 : (def.floorY||0),
                 def.bounds===undefined ? null : def.bounds);
  setEnemyBoxes(def.enemyBoxes||null);
  levelFlags.dronesFly=!!def.dronesFly;
  if(def.space) addSpace(def.planet);
  if(def.floor!==false){
    const size=def.floorSize||300;
    const f=new THREE.Mesh(new THREE.PlaneGeometry(size,size),MAT.floor);
    f.receiveShadow=true; f.rotation.x=-Math.PI/2;
    f.position.y=def.floorY===undefined?0:def.floorY;
    scene.add(own(f));
    colliders.push({min:V3(-size/2,f.position.y-4,-size/2),max:V3(size/2,f.position.y,size/2),ground:true});
  }
  setLoadout(def.loadout||['pulse']);
  for(const f of def.falls||[])
    level.falls.push({id:f.id, dy:f.dy, warn:f.warn===undefined?1.2:f.warn, brake:f.brake||0,
                      parts:[], state:'up', off:0, v:0, t:0, jolt:0});
  for(const g of def.geometry||[]) buildPiece(g);
  for(const d of def.doors||[]) addDoor(d);

  const E=entGeo();
  for(const k of def.keys||[]){
    const colour=LOCK_COLOUR[k.colour]||0xffc24d;
    level.keys.push({colour:k.colour, hex:colour, p:k.p.slice(), taken:false, do:k.do||null,
                     on:k.on||null, off:k.off||[0,2,0],
                     mesh:marker(E.key,colour,k.p,1)});
    // in a cage, which an `uncage` naming its colour opens: 3-3's amber key,
    // held until the Gaze's lightning breaks the conductor beside it
    if(k.cage){ const K=level.keys[level.keys.length-1], [r,h]=k.cage;
                K.cageRec=addCage([k.p[0],k.p[1]-1.2,k.p[2]],r,h,colour); K.cageRec.key=K; }
  }
  refreshKeys();
  placeEntities(def);
  for(const mv of def.movers||[]){
    if(mv.ghost) continue;         // the validator's stand-in for where a crane runs
    const [x,y,z]=mv.p, [w,h,d]=mv.s;
    // `glass`: a pane in a ribbed frame you see down through, walked on like a
    // skylight with `walk` - 3-3's roof slid over the Armoury once it is won
    // Upright, it is a wall of glass: 3-3's fences round a roof while its fight is on
    const wall=mv.glass&&h>Math.min(w,d);
    const mesh=wall?glassWall(x,y,z,w,h,d):mv.glass?glassSlab(x,y,z,w,h,d,mv.rib):solid(x,y,z,w,h,d,farMat(pieceMat(mv.mat),mv.far));
    // the collider solid() just pushed is the one this platform carries around
    const col=colliders[colliders.length-1];
    col.mover=true;
    // (3-3's spires: you can't walk through them, but the eye sees past them)
    if(mv.lightThru){ col.glass=true; mesh.castShadow=false; }
    if(mv.glass){ col.glass=true; col.walk=!wall; }
    if(mv.plate||mv.wide) col.wide=true;
    const tm=mv.trim?trim(x,y+h,z,w,d,farMat(trimMat(mv.trim),mv.far)):null;
    level.movers.push({id:mv.id||('m'+level.movers.length),
                       p:mv.p.slice(), to:mv.to.slice(), s:mv.s.slice(),
                       period:mv.period||6, phase:mv.phase||0, t:0,
                       running:mv.start!==false, once:!!mv.once, dwell:mv.dwell||0, mesh, col, tm, at:V3(x,y,z), p0:mv.p.slice(), wall,
                       clip:mv.clip, shock:mv.shock?shockRig(mesh,mv):null,
                       plate:mv.plate?addCrack(mesh,w,h,d):null, cracked:false, refill:mv.refill||0, spare:mv.spare||0});
    if(mv.clip!==undefined) setMover(level.movers[level.movers.length-1],x,y,z);
  }
  for(const c of def.cables||[]) addCable(c);
  // Conduits: dark until an arc reaches one, then powered until a Coil drains
  // it. A conduit drives the lifts it names for as long as it is live - they run
  // while it is powered and stop where they are when it is not - and runs its
  // `do` once, the first time it comes on. Its `bridges` are drawbridges: let
  // down (to their `to`) while it is live, and hauled back up when a Coil
  // drains it.
  for(const c of def.conduits||[]){
    const m=marker(E.conduit,ARC_DARK,c.p,1.6);
    const rec={id:c.id||'', p:c.p, pos:V3(c.p[0],c.p[1],c.p[2]), mesh:m,
               glow:m.children[1], halo:m.children[2], lifts:c.lifts||[], grids:c.grids||[], bridges:c.bridges||[], do:c.do||[],
               discharge:!!c.discharge, chargeT:0, hz:c.hazards||null,
               // off: dead to the arc till a `conduit` action wakes it, so it
               // can't be powered early from somewhere it can be seen
               powered:false, fired:false, hit:0, off:!!c.off};
    rec.power=()=>powerConduit(rec);
    rec.drain=()=>drainConduit(rec);
    conduits.push(rec);
  }
  for(const q of def.pylons||[]){
    if(q.ghost) continue;          // the validator's stand-in for a pylon a platform carries
    // Big and bright: a pylon is the whole of a puzzle, and has to be seen from
    // across a dark yard.
    const m=marker(E.pylon,ARC_LIT,q.p,2.6);
    pylons.push({p:q.p, pos:V3(q.p[0],q.p[1],q.p[2]), mesh:m, halo:m.children[2], hit:0, ph:Math.random()*6.28,
                 on:q.on||null});
  }
  for(const a of def.anchors||[]){
    if(a.ghost) continue;          // the validator's stand-in for an anchor a platform carries
    const m=marker(E.anchor,0x8dff6a,a.p,1.7);
    const halo=sprite(0x8dff6a,7.0,0.30); halo.material.__perObject=true; m.add(halo);
    // a beacon: a line of light down from it, to be found through a storm
    let beacon=null;
    if(a.beacon){
      const bm=new THREE.MeshBasicMaterial({color:0x8dff6a,transparent:true,opacity:0.35,depthWrite:false,blending:THREE.AdditiveBlending});
      bm.__perObject=true;
      beacon=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,a.beacon,6),bm);
      beacon.position.set(a.p[0],a.p[1]-a.beacon/2,a.p[2]); scene.add(own(beacon));
    }
    anchors.push({p:a.on?[...a.p]:a.p, base:a.p, on:a.on||null, mesh:m, halo:halo, glow:m.children[1].material, beacon,
                  hit:0, ph:Math.random()*6.28,
                  dead:false, by:null, threat:0, hold:a.hold||null, id:a.id||null, off:!!a.off});
  }
  for(const w of def.weapons||[]){
    const i=weaponIndex(w.id);
    level.weapons.push({id:w.id, p:w.p, taken:false, brief:w.brief||null, do:w.do||null,
                        mesh:marker(E.gun, 0xff3fa4, w.p, 1.0)});
  }
  for(const c of def.checkpoints||[]){
    const m=new THREE.Mesh(E.pad,new THREE.MeshBasicMaterial({
      color:0x5df0ff,side:THREE.DoubleSide,transparent:true,opacity:0.35}));
    m.material.__perObject=true;
    m.rotation.x=-Math.PI/2; m.position.set(c.p[0],c.p[1]+0.05,c.p[2]);
    scene.add(own(m));
    m.visible=false;
    // `fall`: it stands on a piece that falls, and goes down with it, not left in the air
    level.checkpoints.push({p:c.p, mesh:m, reached:false, fall:c.fall||null});
  }
  for(const t of def.triggers||[])
    level.triggers.push({...t, fired:false});
  // shelters first: a storm leaves its puffs out of them as it is built
  for(const b of def.shelters||[]){
    const [sx,sy,sz]=b.p, [sw,sh,sd]=b.s;
    level.shelters.push({x0:sx-sw/2,x1:sx+sw/2,y0:sy,y1:sy+sh,z0:sz-sd/2,z1:sz+sd/2});
  }
  // charge racks: stand at one and the Sunder is full again
  for(const r of def.racks||[]) level.racks.push(addRack(r));
  for(const h of def.hazards||[]){
    const rec={...h, off0:!!h.off};
    if(rec.t==='molten') addMolten(rec);
    if(rec.t==='burner') addBurner(rec);
    if(rec.t==='laser') addLaser(rec);
    if(rec.t==='storm') addStorm(rec);
    if(rec.t==='cascade') addCascade(rec);
    if(rec.t==='void') voids.push(rec);
    if(rec.t==='gaze'){
      addGaze(rec);
      // what its light sends down the beam joins the fight that is running; a
      // death forgets them, like what a panel let out
      rec.send=(specs,at)=>{
        const n0=enemies.length, list=specs.map(q=>({...q, p:at, fixed:true}));
        runActions([{a:'spawn', join:true, enemies:list}]);
        for(const q of list){ const g=level.groups.get(q); if(g) g.loose=true; }
        for(let i=n0;i<enemies.length;i++) enemies[i].gazeSent=rec;
      };
      rec.sentAlive=()=>enemies.filter(e=>!e.dead&&e.gazeSent===rec).length;
      // It backs up the garrison, and stops once the last of it is down, so a
      // fight can end: in a sealed fight that is the fight's own enemies, and
      // out of one, whatever else is still alive that it did not send.
      rec.sendOK=()=>{ if(level.podDrops.length>0) return true;
        const a=level.arena, list=a&&!a.done?a.watch:enemies;
        return list.some(e=>!e.dead&&e.kind!=='node'&&e.gazeSent!==rec); };
    }
    level.hazards.push(rec);
  }
  // Sector 3-3's finale: the Authority's body, and what the campaign's ending lights
  addAuthority(def.authority||null);
  endEnding(); addEnding(def.ending||null,E.core);
  if(def.goal){
    level.goal={...def.goal, mesh:marker(E.core,0x8dff6a,def.goal.p,1.3), taken:false,
                locked:!!def.goal.locked};
    // `hidden`: not there at all till it is unsealed
    if(def.goal.hidden) level.goal.mesh.visible=false;
    if(def.goal.locked&&def.goal.cage!==0){
      // The cage stands on whatever the core floats over, just clear of it (so
      // a platform's glowing edge doesn't cut through its bottom collar), and
      // narrows to fit where the core is near the edge of a deck rather than
      // hanging its rim out over the drop.
      const gp=def.goal.p, gy=groundAt(gp[0],gp[2],gp[1]);
      const base=gp[1]-gy<4.5?gy:gp[1]-1.8;
      const fits=rr=>{ for(let k=0;k<16;k++){ const a=k/16*T2;
        if(groundAt(gp[0]+Math.cos(a)*(rr+0.2),gp[2]+Math.sin(a)*(rr+0.2),gp[1])<base-0.05) return false; } return true; };
      let r=def.goal.cage||2.2;
      while(r>1.3&&!fits(r)) r-=0.1;
      if(!fits(r)) r=def.goal.cage||2.2;
      level.goal.cageRec=addCage([gp[0],base+0.08,gp[2]], r, def.goal.cageH||4);
    }
    if(def.goal.hold) addHoldRing(level.goal, def.goal.cage||2.2);
  }
  for(const mk of def.marks||[]) addBlastMark(mk);
  // A sign: a trim outline stood on a wall face rather than lying on a top, for
  // somewhere to look that has no edge of its own to trim - 3-1's grid alcove
  // that leads on, marked on its back wall where you see it from the floor.
  for(const sg of def.signs||[]){
    // An arrow painted on a face: s is [width, height], p just proud of the face.
    // Up says "climb this", for a way up a new player might not find.
    if(sg.arrow){
      const m=new THREE.Mesh(new THREE.PlaneGeometry(sg.s[0],sg.s[1]),arrowMat(sg.trim||'amber'));
      m.position.set(sg.p[0],sg.p[1],sg.p[2]);
      // arrow: 'up', 'down', or the way along the face it points in the world -
      // '+x'/'-x' on a z face, '+z'/'-z' on an x face. Not left/right: that flips
      // with the side you see it from.
      const X=sg.face==='x', h=Math.PI/2;
      const turn=X?{'+z':h,'-z':-h}:{'+x':-h,'-x':h};
      m.rotation.set(0,X?h:0,sg.arrow==='down'?Math.PI:(turn[sg.arrow]||0));
      scene.add(m); own(m); continue;
    }
    // s: [height, width along z] on an x face; [width along x, height] on a z face
    const [a,b]=sg.s, m=trim(0,0,0,a,b,trimMat(sg.trim||'amber'));
    m.position.set(sg.p[0],sg.p[1],sg.p[2]);
    if(sg.face==='x') m.rotation.z=Math.PI/2; else m.rotation.x=Math.PI/2;
  }

  level.loaded=true;
  // Loading a level is a fresh attempt at it, so it starts whole. Only respawn
  // takes vitals from the checkpoint - it restores after spawning, so this does
  // not disturb it.
  player.hp=player.maxHp; player.sh=player.maxSh;
  resetAmmo();
  spawnPlayer(level.spawn.p,level.spawn.yaw);
  // A level with its own opening briefing names itself there; showing the name
  // banner as well means the player reads it twice before moving.
  if(!opts.quiet && !def.quietLoad) hud.banner(level.name, def.subtitle||'', false);
  return level;
}

/* Entities the level places directly, as opposed to trigger spawns. Respawning
   wipes the field, so these have to be put back or a turret - or worse, a conduit
   node - would be gone for the rest of the run. */
function placeEntities(def){
  level.nodes.length=0;
  for(const n of def.nodes||[]){
    const ent=makeEnemy('node', n.p[0], n.p[2], n.p[1], n.yaw||0);
    // a node usually sits in a sealed alcove where no scene light reaches, so it
    // has to light itself or the player simply cannot see what to shoot
    if(ent.glow){ ent.glow.scale.setScalar(3.0); ent.glow.material.opacity=0.6; }
    const lamp=new THREE.PointLight(0xffc24d,3.0,16,2);
    lamp.position.set(0,0.3,0);
    ent.mesh.add(lamp);
    ent.lamp=lamp;
    const rec={e:ent, do:n.do||[], fired:false, label:n.label||'',
               id:n.id||'', shown:true};
    if(n.hidden) hideNode(rec);
    level.nodes.push(rec);
  }
  // Anything already killed this run stays dead. Replaying a checkpoint should
  // cost you the ground you lost, not the fights you already won.
  level.placed.length=0;
  (def.enemies||[]).forEach((e,i)=>{
    if(level.killed[i]) return;
    const ent=makeEnemy(e.kind, e.p[0], e.p[2], e.p[1], e.yaw);
    level.placed.push({e:ent, slot:i});
  });
}

/* A node the level has not revealed yet is out of `enemies` altogether - not
   drawn, not shootable, not there. Cheaper and more honest than a flag every
   raycast would have to remember to test. Used to keep a conduit out of sight
   until the fight in front of it is over, so the room asks one thing at a time. */
function hideNode(rec){
  rec.shown=false; rec.e.mesh.visible=false;
  const i=enemies.indexOf(rec.e); if(i>=0) enemies.splice(i,1);
}
function showNode(rec){
  if(rec.shown||rec.e.dead) return;
  rec.shown=true; rec.e.mesh.visible=true;
  if(enemies.indexOf(rec.e)<0) enemies.push(rec.e);
}

/* ---------- the Arc's fixtures ---------- */
const ARC_LIT=0xb58cff, ARC_DARK=0x3a2d57;
const DISCHARGE_T=1.2, EXPOSED_T=7, FED_LIT=0xe9dcff;
function powerConduit(c){
  if(c.powered||c.off) return;
  c.powered=true; c.hit=0.6;
  c.glow.material.color.setHex(ARC_LIT);
  FX.ring(c.pos,ARC_LIT,3.2,0.5); SFX.waveUp();
  if(!c.fired){ c.fired=true; runActions(c.do); }
}
function drainConduit(c){
  if(!c.powered||c.fed) return;       // a generator feeds it now: nothing drains it
  c.powered=false;
  c.glow.material.color.setHex(ARC_DARK);
  FX.burst(c.pos,10,ARC_LIT,6,0.3,6); SFX.hit();
}

/* ---------- player placement, checkpoints, respawn ---------- */
function spawnPlayer(p,yaw){
  player.pos.set(p[0],p[1],p[2]);
  player.vel.set(0,0,0); releaseGrapple(false);
  player.yaw=yaw||0; player.pitch=0;
  player.dashN=2; player.dashCd=0; player.dashT=0; player.iFrames=0.4;
  player.jumps=2; player.boosts=1; player.shake=0; player.kick=0; player.kickV=0; player.hurtFlash=0;
}
function snapshot(){
  return {hp:player.hp, sh:player.sh,
          ammo:WEAPONS.map(w=>({mag:w.mag, reserve:w.reserve})),
          held:{...level.held}, owned:{...owned},
          doors:level.doors.map(d=>d.open),
          sealed:level.doors.map(d=>!!d.sealed),
          lamps:level.doors.map(d=>d.lamps?d.lampsOn:0),
          triggers:level.triggers.map(t=>t.fired),
          keys:level.keys.map(k=>k.taken),
          weapons:level.weapons.map(w=>w.taken),
          nodes:level.nodes.map(n=>n.fired),
          nodesShown:level.nodes.map(n=>n.shown),
          panels:level.panels.map(p=>p.open),
          breaches:breaches.map(b=>b.broken),
          shut:breaches.map(b=>!!b.shut),
          falls:level.falls.map(f=>f.state==='up'?0:1),
          fallDy:level.falls.map(f=>f.dy),       // sunk further since, by a `more`
          timers:level.timers.map(x=>({...x})),
          // what a delivery under way would do once it was done: a death clears
          // the delivery, so its consequences are kept here
          thens:level.deliveries.filter(d=>d.a.then).map(d=>({list:d.a.then, owner:d.owner}))
                .concat(level.wrecks.filter(W=>W.then&&!W.thenDone).map(W=>({list:W.then, owner:null}))),
          dropper:level.dropper?{...level.dropper}:null,
          hazardsOff:level.hazards.map(h=>!!h.off),
          boxes:ENEMY_BOXES,            // an `enemyBoxes` action can swap them
          gazes:level.hazards.map(h=>h.t==='gaze'?gazeCfg(h):null),
          anchorsOff:anchors.map(a=>!!a.off),
          beaconsOff:anchors.map(a=>!!a.beaconOff),   // a fight's phase hides some, and a death undoes it
          conduits:conduits.map(c=>[c.powered,c.fired,!!c.fed,!!c.off]),
          cracked:level.movers.map(m=>m.cracked),
          waves:level.waves.map(w=>({...w})),
          // a platform's whole run, not just whether it is going: a phase can send one on
          // one falling is photographed as down: it will be by the time anyone respawns
          movers:level.movers.map(m=>{
            if(m.fall) return {r:false, stopped:true, p:m.fall.to.slice(), to:m.fall.to.slice(), t:0, period:m.period, once:true, then:null, fallen:true};
            // borrowed to bring a cage over: what it was doing before, which a respawn goes back to
            const v=m.borrowed||m;
            return {r:v.running, stopped:!!v.stopped, p:v.p.slice(), to:v.to.slice(), t:v.t, phase:v.phase||0, period:v.period, once:v.once, then:v.then||null, fallen:!!m.fallen}; }),
          counts:Object.assign({},level.counts),
          shown:level.checkpoints.map(c=>c.reached),
          arena:level.arena&&!level.arena.done
                ?level.triggers.indexOf(level.arena.owner):-1,
          // what was dead at the checkpoint, so restoring puts back exactly
          // what was standing then - no more, no less
          killedSlots:[...level.killed],
          groups:[...level.groups.entries()].map(([spec,g])=>({spec,killed:g.killed,awake:!!g.awake,
                                                              phaseDone:g.phaseDone?g.phaseDone.slice():null})),
          cages:level.cages.map(c=>c.open),
          authority:authoritySnap(),
          goalLocked:level.goal?!!level.goal.locked:false,
          goalHold:level.goal?[!!level.goal.armed,level.goal.holdT||0]:null};
}
function restore(s){
  if(!s) return;
  clearDeliveries();
  if(s.boxes!==undefined) setEnemyBoxes(s.boxes);
  player.hp=s.hp; player.sh=s.sh;
  for(let i=0;i<WEAPONS.length;i++){
    WEAPONS[i].mag=s.ammo[i].mag;
    WEAPONS[i].reserve=s.ammo[i].reserve;
  }
  // Weapons and keys are never taken back. A checkpoint photographs the level,
  // not the player's kit: rolled back, a death would take a pickup off you and
  // stand it back where it was, to be fetched again.
  level.held={...s.held, ...level.held};
  refreshKeys();
  setLoadout(Object.keys({...(s.owned||{}), ...owned}));
  // roll the level itself back to how it stood at the checkpoint
  if(s.doors) level.doors.forEach((d,i)=>{
    d.sealed=s.sealed?!!s.sealed[i]:false;
    if(s.doors[i]) openDoor(d,true); else sealDoor(d,true);
    fuseLook(d);
    if(d.lamps) setLamps(d,s.lamps?s.lamps[i]:0,true);
  });
  if(s.triggers) level.triggers.forEach((t,i)=>{ t.fired=!!s.triggers[i]; });
  // keys taken since this photograph: kept, and so is what taking them did
  const since=level.keys.filter((k,i)=>k.taken&&!(s.keys&&s.keys[i]));
  const sinceW=level.weapons.filter((w,i)=>w.taken&&!(s.weapons&&s.weapons[i]));
  if(s.keys) level.keys.forEach((k,i)=>{ k.taken=k.taken||!!s.keys[i]; k.mesh.visible=!k.taken; });
  if(s.weapons) level.weapons.forEach((w,i)=>{ w.taken=w.taken||!!s.weapons[i]; w.mesh.visible=!w.taken; });
  if(s.groups){
    const was=new Map(s.groups.map(r=>[r.spec,r]));
    // a group that did not exist at the checkpoint owes its full complement;
    // one that was still asleep then goes back to sleep
    for(const [spec,g] of level.groups){ const r=was.get(spec);
      // let loose since by nothing a trigger owns - a panel, a relay: whatever
      // did it is rolled back below and does it again, so nothing is owed now
      if(!r&&(!g.trig||g.loose)){ level.groups.delete(spec); continue; }
      g.killed=r?r.killed:0; g.awake=!!(r&&r.awake);
      // a boss's phases run again from where the checkpoint stood: the islands
      // one sank are back up, so it has to sink them again
      if(g.phaseDone) g.phaseDone=r&&r.phaseDone?r.phaseDone.slice():[]; }
  }
  // Panels broken since the photograph stand again: left broken, everything
  // they let loose would come at once, with nothing holding it back.
  if(s.breaches) breaches.forEach((b,i)=>{ if(b.broken&&!s.breaches[i]) mendPanel(b); });
  if(s.shut) breaches.forEach((b,i)=>{ b.shut=!!s.shut[i]; b.mesh.material=b.shut?SHUT_MAT:b.mat; conductorLook(b); });
  // what fell since stands again; what had fallen stays down
  if(s.fallDy) level.falls.forEach((f,i)=>{ if(s.fallDy[i]!==undefined) f.dy=s.fallDy[i]; });
  if(s.falls) level.falls.forEach((f,i)=>{ if(!s.falls[i]) resetFall(f); else if(f.state!=='down'||f.off!==f.dy) finishFall(f); });
  // (a pod still to be thrown is not: its enemies come back with their group)
  level.timers=(s.timers||[]).filter(x=>!x.fn).map(x=>({...x}));
  clearLoads();
  level.dropper=s.dropper?{...s.dropper, t:2}:null;
  if(s.nodes) level.nodes.forEach((n,i)=>{
    n.fired=!!s.nodes[i];
    if(n.fired&&n.e&&!n.e.dead){ disposeEnemy(n.e); n.e.dead=true;   // already cut
      const k=enemies.indexOf(n.e); if(k>=0) enemies.splice(k,1); }
  });
  if(s.nodesShown) level.nodes.forEach((n,i)=>{
    if(n.e&&!n.e.dead) (s.nodesShown[i]?showNode:hideNode)(n); });
  if(s.panels) level.panels.forEach((p,i)=>setPanel(p,!!s.panels[i],true));
  if(s.hazardsOff) level.hazards.forEach((h,i)=>{ h.off=!!s.hazardsOff[i]; h.lv=h.off?0:1; });
  if(s.gazes) level.hazards.forEach((h,i)=>{ if(s.gazes[i]){ setGaze(h,s.gazes[i]); clearPods(h); } });
  if(s.anchorsOff) anchors.forEach((a,i)=>{ a.off=!!s.anchorsOff[i]; });
  anchors.forEach((a,i)=>{ a.beaconOff=!!(s.beaconsOff&&s.beaconsOff[i]); });
  if(s.conduits) conduits.forEach((c,i)=>{
    const [on,fired,fed,off]=s.conduits[i]||[false,false,false,false];
    c.fired=!!fired; c.powered=!!on; c.fed=!!fed; c.off=!!off;
    c.glow.material.color.setHex(c.fed?FED_LIT:(c.powered?ARC_LIT:ARC_DARK)); });
  level.waves=(s.waves||[]).map(w=>({...w, t:w.every*0.5}));
  if(s.counts) level.counts=Object.assign({},s.counts);
  if(s.movers) level.movers.forEach((m,i)=>{
    const v=s.movers[i];
    if(typeof v!=='object'||v===null){ m.running=!!v; return; }
    m.running=v.r; m.stopped=!!v.stopped; m.p=v.p.slice(); m.to=v.to.slice(); m.t=v.t; m.period=v.period; m.once=v.once; m.then=v.then||null;
    m.phase=v.phase||0; m.borrowed=null; m.aboard=null;
    m.fall=null; m.fallen=!!v.fallen; m.shk=null;
    if(m.topple||m.mesh.quaternion.w<0.9999){ m.topple=null; m.mesh.quaternion.identity(); if(m.tm) m.tm.quaternion.identity(); }
    placeMover(m);
    // one that burst since the checkpoint is whole again (one under its
    // `clip` stays hidden: placing it said so)
    if(m.clip===undefined){ m.mesh.visible=!(m.fallen&&m.shattered); if(m.tm) m.tm.visible=m.mesh.visible; }
    if(m.plate) crackLook(m,!!(s.cracked&&s.cracked[i]));
  });
  plateHoles();
  if(s.shown) level.checkpoints.forEach((c,i)=>{
    c.reached=!!s.shown[i]; c.mesh.visible=c.reached; });
  if(s.cages) level.cages.forEach((c,i)=>{ if(s.cages[i]) openCage(c); else closeCage(c); });
  authorityRestore(s.authority);
  // the charge is part of the photograph, armed and all
  if(level.goal){ level.goal.locked=s.goalLocked;
    if(level.goal.hidden) level.goal.mesh.visible=!level.goal.locked;
    // a wreck is never put back, so nor is what its landing unlocked
    if(level.goal.wreck&&level.goal.wreck.thenDone&&!level.goal.cageRec) level.goal.locked=false;
    const gh=s.goalHold||[false,0]; level.goal.armed=gh[0]; level.goal.holdT=gh[1]; }
  // Re-arm the fight if the checkpoint was taken while it was still running,
  // so finishing it after a death still opens what it should.
  level.arena=null;
  if(s.arena>=0){
    const t=level.triggers[s.arena];
    const act=t&&(t.do||[]).find(x=>x.a==='arena');
    if(act) level.arena={done:false, grace:0.6, watch:[], left:-1, quiet:!!act.quiet, need:act.need||null,
                         seen:new Set(enemies), onClear:act.onClear||[], owner:t};
  }
  for(const x of s.thens||[]) runActions(x.list,x.owner);
  // A key survives a death, so its consequences have to as well: rolling the
  // level back undoes what picking it up did, while the key stays in hand and
  // can't be picked up again. Replay the state changes, not the fanfare. A
  // weapon picked up since works the same way.
  for(const k of [...since, ...sinceW])
    runActions((k.do||[]).filter(a=>a.a!=='banner'&&a.a!=='brief'&&a.a!=='checkpoint'));
  hud.vitals=true; hud.weapon=true;
}
/* Checkpoints are not a sequence: the array index is storage order, not
   progress. They are only ever set by a `checkpoint` action - the level says
   when a run is worth saving, never standing somewhere. */
// Where a pad stands now: one on a piece that falls goes down with it.
function padY(c){
  const f=c.fall?fallById(c.fall):null;
  return c.p[1]+(f?f.off:0);
}
// `hp`: saved with at least this share of your health, for one taken mid-fight
// (a wave won, the next on a clock) that would otherwise put you back into it
// on whatever you had.
function setCheckpoint(i,hpFloor){
  const c0=level.checkpoints[i];
  if(!c0) return;
  level.cp=i;
  level.cpYaw=player.yaw;            // the way you were looking, for when nothing is in sight
  // Lit before the photograph, not after: the snapshot records which pads are
  // lit, and this one must be.
  c0.reached=true; c0.mesh.visible=true;
  c0.mesh.material.color.setHex(0x8dff6a); c0.mesh.material.opacity=0.6;
  level.cpState=snapshot();          // resources are part of the checkpoint
  if(hpFloor) level.cpState.hp=Math.max(level.cpState.hp,player.maxHp*hpFloor);
  SFX.pickup();
  hud.banner('CHECKPOINT','',false,true);   // quiet: it fires mid-run, repeatedly
}
function voidDeath(){
  level.deaths++;
  SFX.death();
  player.hurtFlash=1;
  FX.ring(player.pos,0xff4d5e,6,0.5);
  respawn();
  hud.banner('RECOVERED','CHECKPOINT RESTORED',true);
}
function respawn(){
  game.respawns=(game.respawns||0)+1;    // tells a loop over enemies that the list it was walking is gone
  // Enemies swept up by the respawn were not killed, so drop the references
  // without counting them - otherwise dying would clear every fight you walked
  // past, which is a faster way through the level than fighting.
  for(const grp of level.groups.values()) grp.ents.length=0;
  clearEntities();                       // nothing left shooting while you reappear
  // placeEntities reads the kill ledger, so roll that back before it runs
  if(level.cpState&&level.cpState.killedSlots){
    level.killed.length=0;
    level.cpState.killedSlots.forEach((v,i)=>{ level.killed[i]=v; });
  }
  if(level.def) placeEntities(level.def);
  const c=level.checkpoints[level.cp];
  spawnPlayer(c?c.p:level.spawn.p, level.spawn.yaw);
  restore(level.cpState);
  // a pad on a piece that has fallen is where the piece is now, not where it hung
  if(c&&c.fall) player.pos.y=padY(c);
  respawnGroups();                       // whatever you did not kill is still there
  faceThreat();
  player.hp=Math.max(player.hp,1);
  player.hurtFlash=0; player.shake=0;    // clear the death wash
  hud.vitals=true;
  level.respawnT=3.2;                    // 3-2-1 before control returns
  game.state='respawn';
  placeCamera();                         // show the checkpoint, not where you died
}
/* Put the camera on the player without running the whole movement step. */
function placeCamera(){
  camera.position.set(player.pos.x,player.pos.y+1.62,player.pos.z);
  camera.rotation.set(player.pitch,player.yaw,0);
  camera.fov=75; camera.updateProjectionMatrix();
}
function updateRespawn(dt){
  if(level.respawnT<=0) return;
  level.respawnT-=dt;
  placeCamera();
  const n=Math.ceil(level.respawnT-0.2);
  hud.countdown(n>0?String(n):'GO');
  player.vel.set(0,0,0); releaseGrapple(false);
  if(level.respawnT<=0){
    hud.countdown('');
    game.state='play';
    player.iFrames=1.2;
  }
}

/* ---------- per-frame ---------- */
const _v=V3(), _v2=V3();
/* Move the player out of a laser grid's way through the world's collision, not
   by setting the position: set straight, a sweeping grid shoved someone hugging
   the wall into it, and the collision then lifted them out on top - onto the
   cutting floor's roof. The grid's own collider is left out of the move. False
   when something stopped the player short. */
function shoveFromGrid(h,want){
  const ax=h.alongX?'z':'x';
  const i=colliders.indexOf(h.col); if(i>=0) colliders.splice(i,1);
  moveAxis(ax,want-player.pos[ax]);
  if(i>=0) colliders.push(h.col);
  return Math.abs(player.pos[ax]-want)<0.05;
}

/* Put a platform where its run says it is now, and carry its collider, mesh
   and trim there - for a checkpoint putting one back mid-run. */
/* Where along its run a platform is, 0..1. One with a `dwell` waits that long
   at each end - a carrier you breach your way out of at the far end has to
   still be there when you have. */
function moverK(m){
  let f=m.t/m.period+m.phase;
  if(m.dwell&&!m.once){
    const P=m.period, C=P+2*m.dwell, u=(((f*P)%C)+C)%C;
    f=u<P/2?u/P : u<P/2+m.dwell?0.5 : u<P+m.dwell?(u-m.dwell)/P : 0;
  }
  return 0.5-0.5*Math.cos(Math.PI*2*f);
}
function placeMover(m){
  if(m.wreck) return;
  const k=moverK(m);
  const nx=m.p[0]+(m.to[0]-m.p[0])*k, ny=m.p[1]+(m.to[1]-m.p[1])*k, nz=m.p[2]+(m.to[2]-m.p[2])*k;
  const [w,h,d]=m.s;
  m.at.set(nx,ny,nz); setMover(m,nx,ny,nz);
}
/* Mesh, trim and collider to where a platform now is. `clip`: nothing of it is
   there below that height - 3-3's fences round the crown landing, which has
   nothing under it to park them in, rise out of its edge from nowhere, and its
   lifts back up from Parts I and II lie hidden under the floor till they run. */
function setMover(m,nx,ny,nz){
  const [w,h,d]=m.s;
  if(m.clip!==undefined){
    const y0=Math.max(ny,m.clip), hh=Math.max(0,ny+h-y0);
    m.mesh.visible=hh>0.02;
    m.mesh.scale.y=Math.max(hh/h,1e-3); m.mesh.position.set(nx,y0+hh/2,nz);
    if(m.tm){ m.tm.visible=m.mesh.visible; m.tm.position.set(nx,ny+h+0.05,nz); }
    m.col.min.set(nx-w/2,y0,nz-d/2); m.col.max.set(nx+w/2,y0+hh,nz+d/2);
    // all of it hidden: out of the world, not a sheet with no thickness at
    // the clip that anything could take for a floor
    if(!m.mesh.visible){ m.col.min.y=-1000.5; m.col.max.y=-1000; }
    return;
  }
  m.mesh.position.set(nx,ny+h/2,nz);
  if(m.tm) m.tm.position.set(nx,ny+h+0.05,nz);
  m.col.min.set(nx-w/2,ny,nz-d/2); m.col.max.set(nx+w/2,ny+h,nz+d/2);
}

function updateLevel(dt){
  updateDebris(dt); updateRacks(dt);
  if(level.loaded&&game.state==='play'){ updateFalls(dt); updateDrops(dt); updateSinking(dt); updateDeliveries(dt); updateTimers(dt); updateWrecks(dt); updatePlates(dt); }
  for(const b of breaches) if(!b.broken){
    b.mat.emissiveIntensity=0.75+Math.sin(game.time*2.2+b.ph)*0.25;
    if(b.halo){ b.halo.visible=!b.shut; b.halo.material.opacity=0.75+Math.sin(game.time*6)*0.25;
      // and a ring off it every second, to catch the eye across the room
      if(!b.shut&&Math.floor(game.time)!==b.ringT){ b.ringT=Math.floor(game.time); b.mesh.getWorldPosition(_v); FX.ring(_v,0xff7a2a,5,0.6); } }
  }
  if(!level.loaded||game.state!=='play'&&game.state!=='ending') return;
  updateAuthority(dt); spinCores(dt);

  // doors slide up out of the way
  for(const d of level.doors){
    d.t=Math.min(1,d.t+dt*2.2);
    const lift=d.open?d.t:1-d.t;
    d.mesh.position.y=d.base+d.h/2+lift*d.h*1.05;
    d.mesh.visible=lift<0.99;
  }

  // keys
  for(const k of level.keys){
    if(k.taken) continue;
    // a key can ride a platform, which makes taking it an interception rather
    // than a walk - its position is wherever the track has carried it to
    if(k.on){
      const m=level.movers.find(v=>v.id===k.on);
      if(m){ k.p[0]=m.at.x+k.off[0]; k.p[1]=m.at.y+k.off[1]; k.p[2]=m.at.z+k.off[2]; }
    }
    k.mesh.rotation.y+=dt*1.8;
    k.mesh.position.set(k.p[0], k.p[1]+Math.sin(game.time*2.2)*0.14, k.p[2]);
    if(k.cageRec&&!k.cageRec.open) continue;
    if(_v.set(k.p[0],k.p[1],k.p[2]).distanceTo(player.pos)<1.7){
      k.taken=true; k.mesh.visible=false;
      level.held[k.colour]=true;
      SFX.pickup();
      FX.ring(k.mesh.position,k.hex,3,0.4);
      hud.banner(String(k.colour).toUpperCase()+' KEY','',false);
      refreshKeys();
      // A key can carry its own actions, so the fight it starts is hung on
      // taking it rather than on a volume standing somewhere nearby.
      if(k.do) runActions(k.do);
    }
  }

  // conduit nodes: shoot one and it runs its actions
  for(const n of level.nodes){
    if(n.fired||!n.e.dead) continue;
    n.fired=true;
    SFX.waveUp();
    if(n.label) hud.banner(n.label,'',false);
    runActions(n.do);
  }

  // Valves: a conduit's `hazards:{on,off}` holds those storms (or grids) on or
  // off for as long as it is powered. Anything a valve switches sits in its own
  // starting state otherwise, and a later valve in the list wins over an
  // earlier one - so two valves can pass one storm back and forth between ducts.
  if(level.valved===undefined){
    level.valved=new Set();
    for(const c of conduits) for(const k of ['on','off']) for(const id of (c.hz&&c.hz[k])||[]) level.valved.add(id);
  }
  if(level.valved.size){
    for(const h of level.hazards) if(h.id&&level.valved.has(h.id)) h.off=h.off0;
    for(const c of conduits){
      if(!c.powered||!c.hz) continue;
      for(const id of c.hz.on||[]){ const h=level.hazards.find(x=>x.id===id); if(h) h.off=false; }
      for(const id of c.hz.off||[]){ const h=level.hazards.find(x=>x.id===id); if(h) h.off=true; }
    }
  }

  // Conduits drive their lifts. A lift wired to a conduit runs exactly while the
  // conduit is live, so a Coil draining it stops the lift where it is.
  for(const c of conduits){
    for(const id of c.lifts){ const m=level.movers.find(x=>x.id===id); if(m&&!m.stopped) m.running=c.powered; }
    for(const id of c.bridges){ const m=level.movers.find(x=>x.id===id); if(m) m.heldBy=c; }
    // and a grid it feeds is down for as long as it is live - a Coil that
    // drains it brings the grid back
    for(const id of c.grids){ const h=level.hazards.find(x=>x.id===id); if(h) h.cut=c.powered; }
    // A discharge conduit, once live, winds up and then throws its charge into
    // the nearest shielded machine it can see, knocking the shield down. It is
    // spent doing it, so it goes dark and can be powered again. A Coil that
    // drains it first wastes the charge.
    if(c.discharge){
      if(!c.powered){ c.chargeT=0; }
      else{
        let tgt=null, bd=46;
        for(const e of enemies){
          if(e.dead||!e.K.shielded) continue;
          const d=e.pos.distanceTo(c.pos); if(d>=bd) continue;
          _v.copy(e.pos).sub(c.pos).multiplyScalar(1/d);
          if(rayWorld(c.pos,_v,d,true)<d-e.rad) continue;     // through grates: a caged conduit still throws
          bd=d; tgt=e;
        }
        if(tgt){
          c.chargeT+=dt;
          const k=Math.min(1,c.chargeT/DISCHARGE_T);
          FX.tracer(c.pos,tgt.pos,ARC_LIT,0.02+0.08*k,0.05);
          if(c.chargeT>=DISCHARGE_T){
            c.chargeT=0;
            FX.tracer(c.pos,tgt.pos,0xffffff,0.3,0.25);
            FX.tracer(c.pos,tgt.pos,ARC_LIT,0.55,0.35);
            FX.ring(tgt.pos,ARC_LIT,12,0.6); FX.burst(tgt.pos,30,0xe0d0ff,12,0.5,4);
            SFX.rail(); SFX.boom();
            tgt.exposed=EXPOSED_T;
            hud.banner('SHIELD DOWN','',false,true);
            drainConduit(c);
          }
        }
      }
    }
    // dead is dim, not invisible - a dead conduit has to be spotted to be used
    const k=c.powered?0.55+Math.sin(game.time*5+c.pos.x)*0.15:0.28+Math.sin(game.time*1.5+c.pos.z)*0.06;
    c.halo.material.opacity=c.hit>0?0.9:k;
    c.halo.scale.setScalar(c.powered?1.3+c.hit:0.7);
    c.mesh.rotation.y+=dt*(c.powered?1.6:0.15);
    if(c.hit>0) c.hit-=dt;
  }
  for(const q of pylons){
    const pulse=0.62+Math.sin(game.time*2.4+q.ph)*0.14;
    q.halo.material.opacity=q.hit>0?1:pulse;
    q.halo.scale.setScalar(q.hit>0?4.2:3.2);
    q.mesh.rotation.y+=dt*0.6;
    if(q.hit>0) q.hit-=dt;
  }

  // Moving platforms. They ease at each end rather than running at a constant
  // speed: a platform that stops dead is a platform you fall off.
  for(const m of level.movers){
    if(m.wreck) continue;
    if(m.aboard&&player.onGround&&Math.abs(player.pos.x-m.at.x)<m.s[0]/2&&Math.abs(player.pos.z-m.at.z)<m.s[2]/2
       &&Math.abs(player.pos.y-(m.at.y+m.s[1]))<0.4){
      const go=m.aboard; m.aboard=null; m.running=true; SFX.waveUp(); runActions(go.do,go.owner);
    }
    if(m.fall){ moverFall(m,dt); continue; }
    if(m.topple){ toppleStep(m,dt); continue; }
    // a drawbridge: down while its conduit is live, up again when it is not
    if(m.heldBy){
      const t0=m.t; m.once=true; m.phase=0;
      m.t=clamp(m.t+(m.heldBy.powered?dt:-dt),0,m.period/2);
      if(m.t===t0) continue;
    }else{
      if(!m.running) continue;      // a dead track is scenery until something starts it
      m.t+=dt;
      // one that goes once stops at the far end of its run
      if(m.once&&m.t/m.period+m.phase>=0.5) m.t=(0.5-m.phase)*m.period;
    }
    const k=moverK(m);
    let nx=m.p[0]+(m.to[0]-m.p[0])*k,
        ny=m.p[1]+(m.to[1]-m.p[1])*k,
        nz=m.p[2]+(m.to[2]-m.p[2])*k;
    // A platform coming down waits while someone is under it, rather than
    // landing on them and throwing them out wherever is nearest. It waits with
    // a metre to spare over their head, room to step up out of the pit the
    // lift rests in.
    if(ny<m.at.y){
      const [w0,,d0]=m.s;
      if(player.pos.x>nx-w0/2-RAD&&player.pos.x<nx+w0/2+RAD&&player.pos.z>nz-d0/2-RAD&&player.pos.z<nz+d0/2+RAD&&
         player.pos.y<m.at.y-0.2&&player.pos.y+TALL+1.1>ny){
        m.t-=dt; nx=m.at.x; ny=m.at.y; nz=m.at.z;
      }
    }
    const dx=nx-m.at.x, dy=ny-m.at.y, dz=nz-m.at.z;
    m.at.set(nx,ny,nz);
    // there: if it has somewhere to go next, it sets off from here
    if(m.once&&m.then&&m.t/m.period+m.phase>=0.5-1e-6){
      const th=m.then;
      // back from bringing a cage over: on with the run it was on, from where it left it
      if(th.restore){ const b=th.restore;
        m.p=b.p.slice(); m.to=b.to.slice(); m.t=b.t; m.phase=b.phase; m.period=b.period; m.once=b.once;
        m.then=b.then; m.running=b.running; m.stopped=b.stopped; m.borrowed=null; }
      else{ m.then=th.then||null;
        m.p=[nx,ny,nz]; m.to=th.to.slice(); m.t=0; m.phase=0; m.once=!th.loop;
        if(th.period) m.period=th.period; }
    }
    const [w,h,d]=m.s;
    setMover(m,nx,ny,nz);
    // carry whoever is standing on it. updatePlayer has already run this frame
    // against the old position, so the rider is moved to match rather than
    // being left behind by a platform that slid out from under them.
    const top=ny+h;
    // a wall rising into you shoves you off to the side you are on, across its thickness
    if(m.wall&&dy>0&&ovl(aabb(player.pos),m.col)){
      if(w<d) player.pos.x=player.pos.x<nx?nx-w/2-RAD-0.01:nx+w/2+RAD+0.01;
      else player.pos.z=player.pos.z<nz?nz-d/2-RAD-0.01:nz+d/2+RAD+0.01;
    }
    // (not a wall: that pushes you aside, rather than catching you on its head)
    const over=!m.wall&&player.pos.x>nx-w/2-RAD&&player.pos.x<nx+w/2+RAD&&player.pos.z>nz-d/2-RAD&&player.pos.z<nz+d/2+RAD;
    if(player.onGround&&Math.abs(player.pos.y-top)<0.35&&over){
      // Up with it, then across through the world's collision, so a rider at
      // the edge is stopped by what the platform passes rather than carried
      // into it. Stopped short, they slide off: the platform goes on under them.
      player.pos.y+=dy;
      const vx=player.vel.x, vz=player.vel.z;
      moveAxis('x',dx); moveAxis('z',dz);
      player.vel.x=vx; player.vel.z=vz;
    }else if(over&&dy>0&&player.pos.y<top&&player.pos.y>=top-dy-0.35){
      // Rising into someone in the air - a jump off a lift on its way up comes
      // down onto it a little lower than it now is. Catch them on top. Left
      // overlapping, the next step resolved them sideways out of the far side
      // of the platform, through the shaft wall and onto the roof.
      player.pos.y=top+0.001; player.vel.y=Math.max(0,player.vel.y); player.onGround=true;
    }
  }

  updateRiders(dt);
  updateShocks(dt);
  // So can a breach panel, collider and all
  for(const b of breaches){
    if(!b.on||b.broken) continue;
    const m=b.mv||(b.mv=level.movers.find(x=>x.id===b.on));
    if(!m) continue;
    const nx=b.base[0]+m.at.x-m.p0[0], ny=b.base[1]+m.at.y-m.p0[1], nz=b.base[2]+m.at.z-m.p0[2];
    const [w,h,d]=b.g.s;
    b.mesh.position.set(nx,ny+h/2,nz);
    b.col.min.set(nx-w/2,ny,nz-d/2); b.col.max.set(nx+w/2,ny+h,nz+d/2);
  }
  // So can an anchor - and a line reeling you in follows it as it goes.
  for(const a of anchors){
    if(!a.on) continue;
    const m=a.mv||(a.mv=level.movers.find(x=>x.id===a.on));
    if(!m) continue;
    // from where the platform was built: a `move` resets its run's start
    for(let k=0;k<3;k++) a.p[k]=[m.at.x,m.at.y,m.at.z][k]+a.base[k]-m.p0[k];
    a.mesh.position.set(a.p[0],a.p[1],a.p[2]);
    if(player.grapple&&player.grapple.src===a){ player.grapple.x=a.p[0]; player.grapple.y=a.p[1]; player.grapple.z=a.p[2]; }
  }
  // A pylon can ride a mover: it keeps its offset from where the mover starts,
  // so a line of them only joins up when the moving one swings into reach.
  for(const q of pylons){
    if(!q.on) continue;
    const m=q.mv||(q.mv=level.movers.find(x=>x.id===q.on));
    if(!m) continue;
    q.pos.set(m.at.x+q.p[0]-m.p0[0], m.at.y+q.p[1]-m.p0[1], m.at.z+q.p[2]-m.p0[2]);
    q.mesh.position.copy(q.pos);
  }

  // anchors, and the line to the one being reeled on. The rope is redrawn
  // every frame rather than kept as a mesh - a tracer already stretches
  // between two points, and the player is moving fast enough that a stale
  // one would lag visibly behind the hand.
  // An anchor tagged `hold` is dark for as long as a Severer spawned to hold
  // it is alive, from the moment it turns up - so there is no race to get
  // across before it gets there. It comes back the moment the last one dies.
  for(const a of anchors){
    if(!a.hold) continue;
    let holder=null;
    for(const e of enemies) if(!e.dead&&e.holds===a.hold){ holder=e; break; }
    if(holder){ a.dead=true; a.by=holder; }
    else if(a.dead&&(!a.by||a.by.dead||a.by.holds===a.hold)){
      a.dead=false; a.by=null; a.hit=0.6; FX.ring(_v.set(a.p[0],a.p[1],a.p[2]),0x8dff6a,3,0.5);
    }
  }
  for(const a of anchors){
    if(a.beacon){ a.beacon.visible=!a.off&&!a.dead&&!a.beaconOff; a.beacon.material.opacity=0.28+Math.sin(game.time*4+a.ph)*0.1; }
    // Not powered yet: there to be seen, dark and still, a faint cold halo
    if(a.off){
      a.glow.color.setHex(0x1c2a34); a.halo.material.color.setHex(0x5d8aa0);
      a.halo.material.opacity=0.10; a.halo.scale.setScalar(0.7); a.mesh.scale.setScalar(0.85);
      continue;
    }
    // Cut by a Severer: dark, still, a dim red halo - and while one is cutting
    // it, it flickers between the two so you can see it going.
    if(a.dead){
      a.glow.color.setHex(0x3a1414); a.halo.material.color.setHex(0xff4436);
      a.halo.material.opacity=0.14; a.halo.scale.setScalar(0.8); a.mesh.scale.setScalar(0.85);
      continue;
    }
    const cut=a.threat>0&&Math.sin(game.time*(20+a.threat*30))>0;
    a.glow.color.setHex(cut?0xff4436:0x8dff6a); a.halo.material.color.setHex(cut?0xff4436:0x8dff6a);
    a.threat=Math.max(0,(a.threat||0)-dt*2);
    a.mesh.rotation.z+=dt*(a.aim?3.2:0.8);
    const pulse=0.78+Math.sin(game.time*2.2+a.ph)*0.22;
    // three states, and they have to be tellable apart across a shaft:
    // idle, under the crosshair, and just grabbed
    const lit=a.aim?0.85:0.30, k=a.aim?1.35:1;
    a.halo.material.opacity=(a.hit>0?0.75:lit)*pulse;
    a.halo.scale.setScalar(pulse*(a.hit>0?1.6:k));
    a.mesh.scale.setScalar(a.hit>0?1+a.hit*0.9:k);
    if(a.hit>0) a.hit-=dt;
  }
  if(player.grapple){
    _v.set(player.grapple.x,player.grapple.y,player.grapple.z);
    _v2.set(player.pos.x,player.pos.y+EYE*0.72,player.pos.z);
    FX.tracer(_v2,_v,0x8dff6a,0.05,0.06);
  }

  // weapon pickups
  for(const w of level.weapons){
    if(w.taken) continue;
    w.mesh.rotation.y+=dt*1.4;
    w.mesh.position.y=w.p[1]+Math.sin(game.time*1.9)*0.16;
    if(_v.set(w.p[0],w.p[1],w.p[2]).distanceTo(player.pos)<2){
      w.taken=true; w.mesh.visible=false;
      const isNew=grantWeapon(w.id);
      const i=weaponIndex(w.id);
      SFX.waveUp();
      FX.ring(w.mesh.position, i>=0?WEAPONS[i].color:0x5df0ff, 5, 0.6);
      if(w.brief&&!level.seenBriefs[w.brief.title]){
        level.seenBriefs[w.brief.title]=true;
        hud.brief(w.brief.title, w.brief.sub);
      }else{
        hud.banner((i>=0?WEAPONS[i].name:w.id.toUpperCase())+' ACQUIRED',
                   isNew?'NEW WEAPON ONLINE':'RESUPPLIED', false);
      }
      if(w.do) runActions(w.do);
    }
  }

  // The kill ledger has to settle before a checkpoint can photograph it. Run
  // the other way round, a kill and a checkpoint landing on the same frame get
  // saved as "still alive", and dying then undoes that kill.
  settleKills();

  // A boss spawn can carry phases: each runs its actions once, the first time
  // the boss's health falls to that fraction.
  for(const grp of level.groups.values()){
    for(const e of grp.ents){
      if(e.dead||!e.phases) continue;
      const f=e.hp/e.maxHp;
      e.phases.forEach((ph,i)=>{
        if(grp.phaseDone[i]||f>ph.at) return;
        grp.phaseDone[i]=true;
        // as part of the fight it is in now - woken by the foot, not the
        // trigger that set it wading at the start of the level
        fromPhase++; try{ runActions(ph.do||[],grp.awake?grp.wakeTrig:grp.trig); } finally{ fromPhase--; }
      });
    }
  }

  // checkpoints
  // the HUD needs to know a room is holding something shut, not just that there
  // are hostiles in it
  // a quiet arena only watches for the fight's end, to save a checkpoint after
  // it: nothing is shut, so nothing says LOCKED
  game.arenaLocked=!!(level.arena&&!level.arena.done&&!level.arena.quiet);

  for(let i=0;i<level.checkpoints.length;i++)
    level.checkpoints[i].mesh.rotation.z+=dt*0.6;

  // panels sinking out of the way. The collider goes when the slab is all the
  // way down, so nothing is ever shot through a wall that is still standing.
  for(const p of level.panels){
    if(!p.open||p.t>=1) continue;
    p.t=Math.min(1,p.t+dt/0.8);
    const e=p.t*p.t*(3-2*p.t);
    p.mesh.position.y=p.y0+p.h/2-e*(p.h+0.3);
    if(p.t>=1){ p.mesh.visible=false;
                const i=colliders.indexOf(p.col); if(i>=0) colliders.splice(i,1); }
  }

  // hazards
  let inStorm=false, inMolten=false;
  for(const h of level.hazards){
    if(h.t==='void'){
      // the void costs you the checkpoint, not the run. With a `box`
      // [x0,x1,z0,z1], only over that. (`enemies`: theirs alone - where you
      // can land and climb back, what falls there is still out of its fight)
      if(h.off||h.enemies) continue;
      if(player.pos.y<h.below&&(!h.box||player.pos.x>h.box[0]&&player.pos.x<h.box[1]&&player.pos.z>h.box[2]&&player.pos.z<h.box[3])) voidDeath();
    }else if(h.t==='cascade'){ updateCascade(h,dt);
    }else if(h.t==='molten'){
      const [x,y,z]=h.p, [w,hh,d]=h.s;
      // switched off, it drains away rather than vanishing
      if(h.grp){
        if(h.off){
          h.lv=0;
          if(h.grp.visible){ h.sink=(h.sink||0)+dt; h.grp.position.y=-h.sink; if(h.sink>=1.5) h.grp.visible=false; }
          continue;
        }
        if(h.sink){ h.sink=0; h.grp.position.y=0; }
        h.grp.visible=true;
      }else if(h.off) continue;
      // switched on with `riseFrom`, it rises from that height to its own over
      // `riseT` seconds - a pour you watch fill the room, not one that appears
      let lift=0;
      if(h.riseFrom!==undefined){
        h.lv=Math.min(1,(h.lv||0)+dt/(h.riseT||6));
        const e=h.lv*h.lv*(3-2*h.lv);
        lift=(h.riseFrom-(y+hh))*(1-e);
        if(h.grp) h.grp.position.y=lift;
      }
      // it flows: the crust drifts one way, the glow over it another, and the
      // whole surface breathes a little brighter and darker
      h.mat.map.offset.x+=dt*0.012; h.mat.map.offset.y+=dt*0.006;
      h.over.map.offset.x-=dt*0.02; h.over.map.offset.y+=dt*0.011;
      const br=0.92+Math.sin(game.time*1.3+x)*0.08;
      h.mat.color.setRGB(br,br,br);
      if(Math.random()<dt*w*d*0.004){ _v.set(x+rand(-w/2,w/2),y+hh+lift+0.2,z+rand(-d/2,d/2));
        if(h.cold) FX.burst(_v,2,0xd8eeff,2,1.4,-2.5); else FX.burst(_v,3,0xff8a30,3,0.6,-2); }
      if(Math.abs(player.pos.x-x)<w/2&&Math.abs(player.pos.z-z)<d/2&&player.pos.y<y+hh+lift+0.3&&player.pos.y>y-2){
        // a pool you wade in burns fast rather than killing outright: long
        // enough to get to an anchor and reel out
        if(h.burn){
          inMolten=true;
          if(!player.god){
            player.lastHit=game.time;
            let b=h.burn*dt;
            if(player.sh>0){ const a=Math.min(player.sh,b); player.sh-=a; b-=a; }
            if(b>0){ player.hp-=b; if(player.hp<=0){ player.hp=0.01; player.iFrames=0; damagePlayer(1,null); } }
            player.hurtFlash=Math.min(1,player.hurtFlash+dt*2); hud.vitals=true;
          }
          if(Math.random()<dt*20){ _v.set(player.pos.x+rand(-0.6,0.6),y+hh,player.pos.z+rand(-0.6,0.6)); FX.burst(_v,2,0xff8a30,4,0.4,-3); }
        }else voidDeath();
      }
      // What goes into burning metal burns up (not what wades it on purpose),
      // rather than holding a fight shut where nobody can reach it.
      if(h.burn) for(const e of enemies){
        if(e.dead||e.kind==='node'||e.K.boss||e.dormant) continue;
        if(Math.abs(e.pos.x-x)>=w/2||Math.abs(e.pos.z-z)>=d/2) continue;
        // `kill`: a pit, not a pool - anything under this height in it is gone at once
        if(h.kill!==undefined&&e.pos.y<h.kill){ killEnemy(e,false); continue; }
        if(e.wadeY!==undefined) continue;
        if(e.pos.y<y+hh+lift+0.3&&e.pos.y>y-2){
          e.hp-=h.burn*dt; e.hitT=Math.max(e.hitT,0.05);
          if(e.hp<=0) killEnemy(e,false);
        }
      }
    }else if(h.t==='gaze'){
      updateGaze(h,dt);
    }else if(h.t==='storm'){
      h.phase+=dt;
      const sw=h.sweep, per=h.period||12;
      const k=sw?Math.sin(h.phase/per*T2):0;
      h.at.set(h.p[0]+(sw?sw[0]*k:0), h.p[1]+(sw?sw[1]*k:0), h.p[2]+(sw?sw[2]*k:0));
      h.group.position.copy(h.at);
      // how high it stands: a tide, a one-off rise, or a vent's eruption
      let frac=1, stir=false;
      if(h.rise&&h.riseT){
        h.riseAt=h.off?0:Math.min(h.riseT,h.riseAt+dt);
        const f=h.riseAt/h.riseT, e=f*f*(3-2*f);
        h.ch=h.rise[0]+(h.rise[1]-h.rise[0])*e;
      }else if(h.rise){
        const f=0.5-0.5*Math.cos(h.phase/per*T2);
        h.ch=h.rise[0]+(h.rise[1]-h.rise[0])*f;
      }else h.ch=h.s[1];
      if(h.cycle){
        const cp=h.cycle.period, du=h.cycle.duty||cp/2;
        const c=(((h.phase+(h.cycle.phase||0))%cp)+cp)%cp;
        if(c<du) frac=Math.min(1,c/0.6);                       // erupting, quickly
        else if(c>cp-1.4){ frac=0; stir=true; }                // stirring: it is coming
        else frac=Math.max(0,1-(c-du)/0.5);                    // falling back
      }
      const ch=h.ch*frac;
      const on=!h.off&&ch>0.4;
      h.live=on;
      const [w,,d]=h.s;
      h.box.x0=h.at.x-w/2; h.box.x1=h.at.x+w/2; h.box.z0=h.at.z-d/2; h.box.z1=h.at.z+d/2;
      h.box.y0=h.at.y; h.box.y1=h.at.y+ch;
      h.group.visible=!h.off&&(on||stir);
      if(h.off) continue;
      // A storm marked `harms` works on enemies too: it burns them, and the
      // weave does nothing for one standing in it (3-1's vent floor - the more
      // vents you open, the easier the fight and the harder the crossing)
      if(h.harms&&on){
        const dps=h.harms===true?30:h.harms;
        for(const e of enemies){
          if(e.dead||e.dormant||e.K.shielded||e.K.shieldHits||e.kind==='node') continue;
          if(e.pos.x<h.box.x0||e.pos.x>h.box.x1||e.pos.z<h.box.z0||e.pos.z>h.box.z1||e.pos.y<h.box.y0||e.pos.y>h.box.y1+2) continue;
          e.stormT=0.25; e.hp-=dps*dt; e.hitT=Math.max(e.hitT,0.05);
          if(e.hp<=0) killEnemy(e,true);
        }
      }
      // the cloud: drifting puffs, squashed to its height
      const pa=h.pts.geometry.attributes.position, b=h.base, t=game.time;
      for(let q=0,n=pa.count;q<n;q++){
        const o=h.ph[q];
        pa.array[q*3]=b[q*3]+Math.sin(t*0.6+o)*0.7;
        pa.array[q*3+1]=b[q*3+1]+Math.sin(t*0.9+o*1.7)*0.4;
        pa.array[q*3+2]=b[q*3+2]+Math.cos(t*0.5+o)*0.7;
      }
      pa.needsUpdate=true;
      h.pts.scale.y=h.cores.scale.y=Math.max(0.05,(stir?0.12:ch/h.hmax));
      h.glowMat.opacity=stir?0.08:0.17+Math.sin(t*3.1+h.p[2])*0.05;
      const fl=Math.sin(t*9+h.p[0])*0.06;
      h.puffMat.opacity=stir?0.12+Math.random()*0.08:0.24+fl*0.5;
      if(h.floorMat) h.floorMat.opacity=stir?0.12+Math.random()*0.1:0.26+fl;
      if(!on){ if(stir&&Math.random()<dt*6){ _v.set(h.at.x+rand(-w/2,w/2)*0.8,h.at.y+0.3,h.at.z+rand(-d/2,d/2)*0.8); FX.burst(_v,4,0xd8c4ff,4,0.25,0); } continue; }
      // crackle: sparks through the cloud, and forks of lightning
      if(Math.random()<dt*w*d*0.02){
        _v.set(h.at.x+rand(-w/2,w/2),h.at.y+rand(0.5,ch),h.at.z+rand(-d/2,d/2));
        FX.burst(_v,3,0xd8c4ff,3,0.25,0);
      }
      if(Math.random()<dt*(0.8+w*d*ch*0.0004)){
        _v.set(h.at.x+rand(-w/2,w/2)*0.9,h.at.y+ch*rand(0.5,0.95),h.at.z+rand(-d/2,d/2)*0.9);
        _v2.set(_v.x+rand(-5,5),h.at.y+rand(0.1,ch*0.4),_v.z+rand(-5,5));
        _v2.x=clamp(_v2.x,h.box.x0,h.box.x1); _v2.z=clamp(_v2.z,h.box.z0,h.box.z1);
        zap(_v,_v2,0xe6dcff,0.06,0.1);
      }
      if(player.pos.x>=h.box.x0&&player.pos.x<=h.box.x1&&player.pos.z>=h.box.z0&&player.pos.z<=h.box.z1&&
         player.pos.y+1<h.box.y1&&player.pos.y+1>h.box.y0&&!inShelter(player.pos.x,player.pos.y+1,player.pos.z)){
        inStorm=true;
        if(!player.god){
          player.lastHit=game.time;            // no shield regen while it is on you
          const drain=(h.drain||60)*dt;
          if(player.sh>0) player.sh=Math.max(0,player.sh-drain);
          else{
            player.hp-=(h.bleed||16)*dt;
            if(player.hp<=0){ player.hp=0.01; player.iFrames=0; damagePlayer(1,null); }
          }
          hud.vitals=true;
        }
      }
    }else if(h.t==='laser'){
      h.phase+=dt;
      let on, warn=false;
      if(h.cut||h.off) on=false;
      else if(!h.period) on=true;
      else{
        const cyc=((h.phase%h.period)+h.period)%h.period, duty=h.duty||h.period/2;
        on=cyc<duty; warn=!on&&cyc>h.period-0.6;
      }
      const flick=Math.sin(game.time*47)*0.5+0.5;
      h.beamMat.opacity=on?0.95:(warn?0.15+flick*0.3:0);
      h.sheetMat.opacity=on?0.09:0;
      h.stripMat.color.setHex(on?LASER:(warn?(flick>0.5?LASER:0x4a1520):0x4a1520));
      h.cool=(h.cool||0)-dt;
      // A sweeping grid travels along its track (`sweep`, an offset it swings
      // through over `sweepPeriod`), carrying its collider with it.
      let pushDir=0;
      if(h.sweep){
        h.st+=dt;
        const k=Math.sin(h.st/(h.sweepPeriod||8)*T2), was=h.cur.slice();
        h.cur=[h.p[0]+h.sweep[0]*k, h.p[1]+h.sweep[1]*k, h.p[2]+h.sweep[2]*k];
        h.g.position.set(h.cur[0],h.cur[1],h.cur[2]);
        const [w0,hh0,d0]=h.s, t0=0.3;
        h.col.min.set(h.alongX?h.cur[0]-w0/2:h.cur[0]-t0/2, h.cur[1], h.alongX?h.cur[2]-t0/2:h.cur[2]-d0/2);
        h.col.max.set(h.alongX?h.cur[0]+w0/2:h.cur[0]+t0/2, h.cur[1]+hh0, h.alongX?h.cur[2]+t0/2:h.cur[2]+d0/2);
        pushDir=h.alongX?Math.sign(h.cur[2]-was[2]):Math.sign(h.cur[0]-was[0]);
      }
      const [x,y,z]=h.cur||h.p, [w,hh,d]=h.s;
      const side=h.alongX?Math.sign(player.pos.z-z)||1:Math.sign(player.pos.x-x)||1;
      const inY=player.pos.y+1.8>y&&player.pos.y<y+hh;
      const span=h.alongX?Math.abs(player.pos.x-x)<=w/2:Math.abs(player.pos.z-z)<=d/2;
      const gap=h.alongX?Math.abs(player.pos.z-z):Math.abs(player.pos.x-x);
      if(on&&!h.solid){
        // lighting up on top of someone puts them out on the side they were nearer
        if(inY&&span&&gap<0.15+0.42){
          shoveFromGrid(h,(h.alongX?z:x)+side*(0.15+0.44));
          h.cool=0;
        }
        colliders.push(h.col); h.solid=true;
      }else if(!on&&h.solid){
        const i=colliders.indexOf(h.col); if(i>=0) colliders.splice(i,1); h.solid=false;
      }
      // a moving grid that runs into you shoves you along ahead of it
      if(on&&pushDir&&inY&&span&&gap<0.15+0.43){
        const at=h.alongX?z:x;
        if(!shoveFromGrid(h,at+pushDir*(0.15+0.45))){
          // pinned against a wall it cannot shove you through: it passes over
          // you instead, and stings on the way
          if(h.alongX) player.pos.z=at-pushDir*(0.15+0.45); else player.pos.x=at-pushDir*(0.15+0.45);
          h.cool=0;
        }
      }
      // touching it: the collider stops you at its face, so this is contact
      if(on&&h.cool<=0&&inY&&span&&gap<=0.15+0.42+0.12){
        player.iFrames=0;                     // a dash does not carry you through the sting
        damagePlayer(h.dmg||30,null); h.cool=0.6;
        // thrown back out the side you came in, and off any line you were on
        if(player.grapple) releaseGrapple(false);
        // (the side as it is now: a grid that passed over you throws you on back)
        const out=h.alongX?Math.sign(player.pos.z-z)||side:Math.sign(player.pos.x-x)||side;
        if(h.alongX) player.vel.z=out*10; else player.vel.x=out*10;
        player.vel.y=Math.max(player.vel.y,5);
        FX.burst(player.pos,14,LASER,7,0.3,6); SFX.rail();
      }
    }else if(h.t==='burner'){
      h.phase=(h.phase||0)+dt;
      const per=h.period||2.4, duty=h.duty||1.1;
      const cyc=h.phase%per;
      const on=cyc<duty;
      const warn=!on&&cyc>per-0.7;          // it tells you before it lights
      if(h.flameMat){
        const flick=Math.sin(game.time*38)*0.09+Math.sin(game.time*23.7)*0.05;
        h.flameMat.opacity=on?0.40+flick:(warn?0.22+flick*0.5:0);
        h.coreMat.opacity =on?0.72+flick:(warn?0.14:0);
        h.flameMat.color.setHex(on?0xffb054:0xff6a2a);
        const k=on?1:(warn?0.22:0.04);        // it swells before it lights
        h.flame.scale.set(1+flick*0.5,k,1+flick*0.5); h.flame.position.y=h.h*0.5*k;
        h.core.scale.set(1-flick*0.4,k*0.92,1-flick*0.4); h.core.position.y=h.h*0.46*k;
        // the shaft lights before the slats do, and the slats before the flame
        h.mouthMat.color.setHex(on?0xffc06a:(warn?0x5a2a10:0x0a0e16));
        h.bars.color.setHex(on?0xffe6b0:(warn?0xff8a3a:0x46516a));
      }
      if(on&&inVol(player.pos,h.p,h.s)&&(h.cool||0)<=0){
        damagePlayer(h.dmg||26,null); h.cool=0.7;
      }
      h.cool=(h.cool||0)-dt;
    }
  }

  game.inStorm=inStorm;
  // and say so out loud, not just on the HUD
  if(inStorm&&!player.god){
    level.stormSnd=(level.stormSnd||0)-dt;
    if(level.stormSnd<=0){ SFX.storm(player.sh<=0); level.stormSnd=player.sh>0?0.42:0.22; }
  }else level.stormSnd=0;
  // and the metal, the same way
  if(inMolten&&!player.god){
    level.burnSnd=(level.burnSnd||0)-dt;
    if(level.burnSnd<=0){ SFX.burn(player.sh<=0); level.burnSnd=player.sh>0?0.24:0.16; }
  }else level.burnSnd=0;

  // triggers
  for(const t of level.triggers){
    if(t.fired||t.on!=='enter') continue;
    if(!inVol(player.pos,t.vol.p,t.vol.s)) continue;
    // a trigger can wait on the room being cleared, so a briefing about what
    // comes next doesn't land in the middle of the fight before it
    if(t.need==='clear'){ if(game.alive>0) continue; }
    // ...or on a conduit having been fed - somewhere to save only once it has
    else if(t.need&&t.need.fed){ const c=conduits.find(x=>x.id===t.need.fed); if(!c||!c.fed) continue; }
    // ...or on something counted - a fight won - and, with `shield`, on you
    // having your breath back (a carrier that waits for you to be aboard and
    // recovered before it takes you on to the next wave)
    else if(t.need&&t.need.count){
      if(!(level.counts[t.need.count]>0)) continue;
      if(t.need.shield&&player.sh<player.maxSh) continue;
      // ...and, with `clear`, on nothing left alive in the trigger's own
      // volume (not level-wide: stragglers elsewhere don't hold it shut)
      if(t.need.clear&&enemies.some(e=>!e.dead&&!e.dormant&&e.kind!=='node'&&inVol(e.pos,t.vol.p,t.vol.s))) continue;
      // ...nor while the crane is still bringing some in
      if(t.need.clear&&(level.deliveries.length||level.podDrops.length)) continue;
    }
    // ...or on the player holding the tool the far side needs: a gate that
    // shuts the way back must never shut on someone who cannot go forward.
    // A key colour works the same way: a room fills as you arrive at its door
    // holding the key, not while you are still looking for it.
    else if(t.need&&!owned[t.need]&&!level.held[t.need]) continue;
    t.fired=true;
    runActions(t.do||[],t);
  }


  // ...and anything that drifts into one gets put back outside
  for(const e of enemies){
    if(e.dead||e.kind==='node') continue;
    const [ex,ez]=cageClear(e.pos.x,e.pos.z,e.pos.y,1.6);
    if(ex!==e.pos.x||ez!==e.pos.z){
      e.pos.x=ex; e.pos.z=ez; e.mesh.position.copy(e.pos);
    }
  }

  // arena beat: hold the room until everything is down
  game.gate=-1;
  if(level.arena&&!level.arena.done){
    const a=level.arena;
    a.grace-=dt;
    // Adopt late arrivals that belong to this fight: the owning trigger's own
    // spawns, and anything they summon. Not everything new: a fight woken
    // somewhere else in the level must not hold this room's gate shut.
    for(const e of enemies){
      if(e.dead||e.kind==='node'||a.seen.has(e)) continue;
      a.seen.add(e);
      if(e.trig===a.owner) a.watch.push(e);
    }
    const left=a.watch.filter(e=>!e.dead).length;
    game.gate=left;
    if(a.left!==left){ a.left=left; hud.threat=true; }
    // The last one or two holding a fight shut are marked, through walls, while
    // they are out of sight, so a locked room with nothing in sight never
    // leaves you hunting.
    const lastFew=left<=2&&a.watch.length>2;
    for(const e of a.watch) tagLast(e,lastFew&&!e.dead&&!e.K.boss,dt);
    // A fight that is still sending waves is not over, however empty the room
    // is between them.
    const coming=level.waves.some(w=>w.owner===a.owner)
               ||level.deliveries.some(d=>d.groups.some(g=>g.trig===a.owner))
               ||level.podDrops.some(d=>d.groups.some(g=>g.trig===a.owner))
               ||level.timers.some(x=>x.holds&&x.owner===a.owner)
               // ...nor while a pod the eye sent down its beam is still in the air
               ||level.hazards.some(h=>h.t==='gaze'&&h.pods&&h.pods.some(p=>!p.thrown));
    // ...nor is one waiting on a conduit, which brings out the last of it
    const need=a.need&&a.need.powered&&conduits.find(c=>c.id===a.need.powered);
    // ...or on panels still to be broken: what is behind them is part of the fight
    const sealedIn=a.need&&a.need.breached&&a.need.breached.some(id=>{ const b=breaches.find(x=>x.id===id); return b&&!b.broken; });
    if(left<=0&&a.grace<=0&&!coming&&!(need&&!need.fired)&&!sealedIn){
      a.done=true;
      runActions(a.onClear||[]);
    }
  }

  // A keyed door opens as you reach it, not the moment the key is pocketed:
  // the door is the thing that acknowledges the key.
  for(const d of level.doors){
    if(d.open||d.sealed) continue;
    if(!d.lock||d.lock==='script'||!level.held[d.lock]) continue;
    const dp=d.mesh.position;
    if(Math.hypot(player.pos.x-dp.x,player.pos.z-dp.z)>7) continue;   // opens before you walk into it
    if(Math.abs(player.pos.y+0.9-dp.y)>6) continue;
    openDoor(d);
  }

  // locked-door prompt
  let prompt=null, promptCol=null, promptDot=-1;
  const fx=-Math.sin(player.yaw), fz=-Math.cos(player.yaw);
  for(const d of level.doors){
    if(d.open) continue;
    const dp=d.mesh.position;
    const dx=dp.x-player.pos.x, dz=dp.z-player.pos.z;
    const flat=Math.hypot(dx,dz);
    if(flat>8) continue;
    if(Math.abs(player.pos.y+0.9-dp.y)>6) continue;
    // you have to be looking at it - otherwise it nags all through a fight
    const facing=flat<1.2?1:(dx*fx+dz*fz)/flat;
    if(facing<0.6) continue;
    if(facing<promptDot) continue;          // prefer whichever door you face most
    promptDot=facing;
    // a lockdown overrides the key: the door is shut because the room is hot,
    // and 'AMBER KEY REQUIRED' would be a lie when you are holding the key
    if(d.sealed||d.lock==='script'){
      prompt=d.fused?'FUSED SHUT':d.lamps&&!d.sealed?'SEALED · '+d.lampsOn+' OF '+d.lampsNeed:'SEALED';
      promptCol='#ff4d5e';
    }else if(d.lock&&!level.held[d.lock]){
      prompt=String(d.lock).toUpperCase()+' KEY REQUIRED';
      promptCol='#'+new THREE.Color(d.colour).getHexString();
    }else{
      prompt=null;
    }
  }
  hud.prompt(prompt,promptCol);

  // waves: enemies that keep arriving until something is done
  for(let i=level.waves.length-1;i>=0;i--){
    const w=level.waves[i], u=w.until;
    const done=u==='cage'?(level.cages.some(c=>!c.key)&&level.cages.every(c=>c.open||c.key))
             :(u&&u.fed)?!!(conduits.find(c=>c.id===u.fed)||{}).fed:false;
    if(done){ level.waves.splice(i,1); continue; }
    w.t-=dt;
    if(w.t>0) continue;
    // a cap on what a fight can have up at once: fall behind and the waves
    // wait for you rather than piling up without end
    const up=enemies.reduce((n,e)=>n+(!e.dead&&e.trig===w.owner&&w.owner?1:0),0);
    if(up>=(w.cap||12)){ w.t=2; continue; }
    w.t=w.every;
    for(const s of w.specs) for(let k=0;k<(s.n||1);k++){
      const [sx,sz]=cageClear(s.p[0]+rand(-2,2),s.p[2]+rand(-2,2),s.p[1],2.2);
      const e=makeEnemy(s.kind,sx,sz,s.fixed?s.p[1]:undefined,s.yaw,s.p[1]);
      e.trig=w.owner;
    }
    SFX.spawn(); hud.threat=true;
  }

  // A cage held shut until its conduits are all live at once: the charge builds
  // while they are, and bleeds away (slower) while any one is out.
  const G=level.goal;
  game.holdPct=-1;
  // Armed by the fight that owns the room - and while that fight is running it
  // counts whatever happened to the flag, so a respawn can never leave the
  // conduits lit and the cage deaf to them.
  const fightOn=!!(level.arena&&!level.arena.done&&level.arena.owner&&
                   (level.arena.owner.do||[]).some(a=>a.a==='arm'));
  if(G&&G.hold&&G.locked&&(G.armed||fightOn)){
    const cs=G.hold.conduits.map(id=>conduits.find(c=>c.id===id)).filter(Boolean);
    const live=cs.length&&cs.every(c=>c.powered);
    G.holdT=live?G.holdT+dt:Math.max(0,G.holdT-dt*0.35);
    const f=Math.min(1,G.holdT/G.hold.need);
    const lit=Math.floor(f*HOLD_SEGS+1e-6);
    G.ring.forEach((m,i)=>m.color.setHex(i<lit?(live?0xb58cff:0x7a5cc0):0x2a2240));
    // and a line from each live conduit to the cage while it charges
    if(live&&Math.random()<dt*20){ const c=cs[(Math.random()*cs.length)|0];
      _v.set(G.p[0],G.p[1],G.p[2]); FX.tracer(c.pos,_v,0xb58cff,0.04,0.08); }
    game.holdPct=Math.round(f*100);
    if(f>=1){ G.armed=false; runActions([{a:'uncage'}]); }
  }

  // goal
  for(let i=level.deathWatch.length-1;i>=0;i--){
    const e=level.deathWatch[i];
    if(!e.dead) continue;
    level.deathWatch.splice(i,1);
    runActions(e.onDeath,e.trig);
  }
  if(level.goal&&!level.goal.taken){
    // a core can ride a platform: it keeps its offset from where the platform starts
    if(level.goal.wreck){
      const W=level.goal.wreck; W.g.updateMatrixWorld(true);
      W.g.localToWorld(_v.copy(level.goal.wreckAt));
      level.goal.p=[_v.x,_v.y,_v.z];
      level.goal.mesh.position.x=_v.x; level.goal.mesh.position.z=_v.z;
    }
    else if(level.goal.on){
      const m=level.goal.mv||(level.goal.mv=level.movers.find(x=>x.id===level.goal.on));
      if(m){ const b=level.goal.base||(level.goal.base=level.goal.p.slice());
        const np=[m.at.x+b[0]-(level.goal.m0||(level.goal.m0=m.p.slice()))[0], m.at.y+b[1]-level.goal.m0[1], m.at.z+b[2]-level.goal.m0[2]];
        // its cage goes with it while it is shut
        const cg=level.goal.cageRec;
        if(cg&&!cg.open){
          const dx=np[0]-level.goal.p[0], dy=np[1]-level.goal.p[1], dz=np[2]-level.goal.p[2];
          if(dx||dy||dz){ cg.grp.position.x+=dx; cg.grp.position.y+=dy; cg.grp.position.z+=dz;
            for(const bb of cg.bars){ bb.min.x+=dx; bb.min.y+=dy; bb.min.z+=dz; bb.max.x+=dx; bb.max.y+=dy; bb.max.z+=dz; }
            cg.p=[cg.p[0]+dx,cg.p[1]+dy,cg.p[2]+dz]; }
        }
        level.goal.p=np;
        level.goal.mesh.position.x=level.goal.p[0]; level.goal.mesh.position.z=level.goal.p[2]; }
    }
    level.goal.mesh.rotation.y+=dt*1.1;
    level.goal.mesh.position.y=level.goal.p[1]+Math.sin(game.time*1.6)*0.2;
    if(!level.goal.locked&&
       _v.set(level.goal.p[0],level.goal.p[1],level.goal.p[2]).distanceTo(player.pos)<2.2){
      level.goal.taken=true; level.goal.mesh.visible=false;
      level.complete=true;
      explode(_v,0x8dff6a,2);
      // the campaign's last: it goes to the board, and the lockdown lifts round you first
      // (the gun stays hidden: you can't move, so it would only stand there)
      const fin=()=>{ if(level.onComplete) level.onComplete(level);
        else{ game.state='play'; setViewModelHidden(false); hud.banner('CORE SECURED',level.name+' COMPLETE',false); } };
      const openAll=()=>{ for(const d of level.doors){ d.sealed=false; openDoor(d,true); } };
      if(level.def&&level.def.ending&&startEnding(fin,list=>runActions(list),openAll)){ const el=document.getElementById('hud'); if(el) el.classList.add('hidden'); }
      else{ hud.banner('CORE SECURED',level.name+' COMPLETE',false);
        if(level.onComplete) level.onComplete(level); }
    }
  }
}

// the kill ledger, brought up to date with who is dead
function settleKills(){
  for(const q of level.placed) if(q.e.dead) level.killed[q.slot]=true;
  for(const grp of level.groups.values())
    for(let i=grp.ents.length-1;i>=0;i--)
      if(grp.ents[i].dead){ grp.killed++; grp.ents.splice(i,1); }
}

function inVol(p,c,s){
  return Math.abs(p.x-c[0])<=s[0]/2 && Math.abs(p.y+0.9-c[1])<=s[1]/2 && Math.abs(p.z-c[2])<=s[2]/2;
}

/* Spawns whatever a group still owes: what it wanted, less what the player has
   actually killed. Dying re-runs this, so skipping a fight and then dying does
   not clear the fight. */
function spawnGroup(grp){
  if(grp.hold) return;                   // still on its way down in the crane's cage
  const s=grp.spec;
  const n=Math.max(0, grp.want - grp.killed - grp.ents.length);
  for(let i=0;i<n;i++){
    const sy=s.fixed?s.p[1]:undefined;
    // a fixed emplacement sits exactly where it was placed; scattering it
    // by a couple of metres walks it off the ledge it was put on
    const jx=s.fixed?0:rand(-2,2), jz=s.fixed?0:rand(-2,2);
    const [sx,sz]=cageClear(
      s.p?s.p[0]+jx:player.pos.x+rand(-8,8),
      s.p?s.p[2]+jz:player.pos.z+rand(-8,8), s.p?s.p[1]:undefined, 2.2);
    const ent=makeEnemy(s.kind,sx,sz,sy,s.yaw,
                        s.p?s.p[1]:player.pos.y+2);
    ent.trig=grp.awake?grp.wakeTrig:grp.trig;      // which fight this belongs to, for arena adoption
    // a boss you are meant to see long before you fight it: walking its rounds,
    // not counted as a hostile, until a `wake` puts it in the fight
    if(s.dormant&&!grp.awake){ ent.dormant=true; ent.patrol=s.patrol||null; game.alive--; }
    if(s.holds) ent.holds=s.holds;   // a Severer spawned to hold anchors dark
    if(s.y!==undefined) ent.fixY=s.y;   // a height to hold whatever is below - the Bastion wading its pool
    if(s.wade!==undefined) ent.wadeY=s.wade;   // the surface it wades in: no hover bob, a ripple at the waterline
    if(s.pin) ent.pinned=true;          // held where it was put
    if(s.v) ent.vel.set(s.v[0],s.v[1]||0,s.v[2]);   // out of a hatch: shoved into the room, not left in its mouth
    // things that happen the moment this one dies - 2-3's storm ends with its Dynamo
    if(s.onDeath){ ent.onDeath=s.onDeath; level.deathWatch.push(ent); }
    if(s.phases){ ent.phases=s.phases; grp.phaseDone=grp.phaseDone||[]; ent.grp=grp; }
    // an act boss is the same kind as the one in a tutorial, just harder
    if(s.hpMul){ ent.hp=Math.round(ent.hp*s.hpMul); ent.maxHp=ent.hp; }
    // 3-3's Armoury Bastion: it comes for you (`range`), floats on the plates
    // (`rides`), its red shield turns the Sunder (`proof`), and the quench under
    // the floor costs it a share of its health each time it goes in (`quench`)
    if(s.range!==undefined) ent.range=s.range;
    if(s.rides) ent.rides=true;
    if(s.proof) proofShield(ent);
    if(s.quench) ent.quench=s.quench;
    // A boss arena is bigger than a corridor, and a weave sized for a corridor
    // covers none of it. A spawn can widen its own, harden it, or keep it to
    // the Severers holding particular anchors.
    if((s.weaveR||s.weaveCut||s.weaveHolds)&&ent.K.weave)
      ent.K=Object.assign(Object.create(ent.K),
                          {weave:{r:s.weaveR||ent.K.weave.r, cut:s.weaveCut||ent.K.weave.cut,
                                  holds:s.weaveHolds||null}});
    grp.ents.push(ent);
  }
}
/* Come back looking at the nearest thing you can see that wants you dead, or,
   with nothing in sight, the way you were facing when the checkpoint was set -
   never at a wall with the fight off to one side. */
const _fo=new THREE.Vector3(), _fd=new THREE.Vector3();
function faceThreat(){
  _fo.set(player.pos.x, player.pos.y+EYE, player.pos.z);
  let best=null, bd=80;                    // a long corridor is still in sight
  for(const e of enemies){
    if(e.dead||e.kind==='node'||e.dormant) continue;
    _fd.subVectors(e.pos,_fo); const d=_fd.length();
    if(d>=bd) continue;
    _fd.multiplyScalar(1/d);
    if(rayWorld(_fo,_fd,d)<d-0.6) continue;              // behind a wall
    best=e; bd=d;
  }
  if(best) player.yaw=Math.atan2(-(best.pos.x-player.pos.x), -(best.pos.z-player.pos.z));
  else if(level.cpYaw!==undefined) player.yaw=level.cpYaw;
  player.pitch=0;
}
function respawnGroups(){
  for(const [spec,grp] of level.groups){
    // a trigger the checkpoint rolled back will fire again on its own
    if(grp.trig && !grp.trig.fired){ level.groups.delete(spec); continue; }
    spawnGroup(grp);
  }
}
function runActions(list,owner){
  // an arena declared in this batch adopts everything the batch spawns
  for(const a of list) if(a.a==='arena')
    level.arena={done:false, grace:0.6, watch:[], left:-1, quiet:!!a.quiet, need:a.need||null,
                 // everything already on the map is somebody else's problem;
                 // anything that turns up from here on holds the gate
                 seen:new Set(enemies), onClear:a.onClear||[], owner:owner||null};
  for(const a of list){
    if(a.a==='arena') continue;
    // (`quiet`: one far off, out of sight - 3-3's maze doors, opened during the lift ride)
    if(a.a==='open'){ const d=doorById(a.door); if(d){ d.sealed=false; openDoor(d,!!a.quiet); } }
    else if(a.a==='seal'){ const d=doorById(a.door); if(d){ sealDoor(d); d.sealed=true; fuseLook(d);
      if(d.fused) FX.ring(d.mesh.position,FUSED,5,0.6); } }
    else if(a.a==='lamp'){
      const d=doorById(a.door);
      if(d&&d.lamps){
        setLamps(d,d.lampsOn+1);
        const done=d.lampsOn>=d.lampsNeed;
        if(a.banner) hud.banner(a.banner+(done?' OPEN':' · '+d.lampsOn+' OF '+d.lampsNeed),'',false);
        if(done){ d.sealed=false; openDoor(d); }
      }
    }
    else if(a.a==='spawn'){
      for(const spec of a.enemies||[]){
        let grp=level.groups.get(spec);
        // `join` puts these in the fight already running, so a room's lock
        // waits on reinforcements a later trigger brings in as well
        const trig=a.join&&level.arena&&!level.arena.done?level.arena.owner:(owner||null);
        // `loose`: let out by a panel - joined to the fight, but a death mends
        // the panel, and breaking it again lets them out again
        if(!grp){ grp={spec, want:(spec.n||1), killed:0, ents:[], trig, loose:fromPanel>0||fromPhase>0};
                  level.groups.set(spec,grp); }
        spawnGroup(grp);
      }
    }
    // send the boss somewhere: a height to hold, and how often it strikes
    else if(a.a==='boss'){
      for(const e of enemies){
        if(e.dead||!e.K.boss) continue;
        if(a.y!==undefined) e.fixY=a.y;
        if(a.strike) e.strikeK=Object.assign({},e.K.strike||{},a.strike);
        if(a.summon===false) e.noSummon=true;
      }
    }
    // wake what has been walking its rounds: into this fight, counted, and after you
    else if(a.a==='wake'){
      for(const grp of level.groups.values()){
        if(!grp.spec.dormant||grp.awake||(a.kind&&grp.spec.kind!==a.kind)) continue;
        grp.awake=true; grp.wakeTrig=owner||null;
        for(const e of grp.ents){
          if(e.dead||!e.dormant) continue;
          e.dormant=false; e.trig=owner||null; game.alive++;
          if(level.arena&&level.arena.seen) level.arena.seen.delete(e);
        }
      }
    }
    // hide (or show) anchors' beacons: the lower floor's lines would hide the next floor's
    else if(a.a==='beacons'){
      for(const q of anchors) if(q.id&&(a.ids||[]).includes(q.id)) q.beaconOff=a.on===false;
    }
    // send a platform on from where it stands, once: a core rising a floor a phase
    else if(a.a==='move'){
      const m=level.movers.find(x=>x.id===a.mover);
      // `hold`: a platform still parked takes the new route but waits to be started
      if(m){ m.p=[m.at.x,m.at.y,m.at.z]; m.to=a.to.slice(); m.t=0; m.phase=0; m.once=true; m.running=a.hold?m.running:true;
             if(a.period) m.period=a.period;
             m.then=a.then||null; }      // where it goes once it gets there: {to, period, loop}
    }
    // stop a platform for good, whatever drives it - the pour shuts the press line down
    else if(a.a==='stop'){ const m=level.movers.find(x=>x.id===a.mover); if(m){ m.running=false; m.stopped=true; } }
    // only if a panel was broken - a storm you let out on the way in, waiting
    else if(a.a==='if'){
      const b=breaches.find(x=>x.id===a.broken);
      if(b&&b.broken) runActions(a.do||[],owner);
    }
    // count something done, in any order: the nth time runs the nth list
    else if(a.a==='count'){
      const n=level.counts[a.id]=(level.counts[a.id]||0)+1;
      const list=(a.do||[])[n-1];
      if(list) runActions(list,owner);
    }
    // health or ammo laid down somewhere, and left a while
    else if(a.a==='drop'){
      for(let i=0;i<(a.hp||0);i++) dropPickup(V3(a.p[0],a.p[1],a.p[2]),'hp',a.life||60);
      for(let i=0;i<(a.ammo||0);i++) dropPickup(V3(a.p[0],a.p[1],a.p[2]),'ammo',a.life||60);
    }
    else if(a.a==='banner') hud.banner(a.title||'', a.sub||'', !!a.danger);
    else if(a.a==='brief'){
      // second time through (after a respawn) it becomes a banner, not a wall
      // (`key` keeps apart two briefs with one title, as 2-3's two STORM RISINGs)
      const k=a.key||a.title;
      if(level.seenBriefs[k]) hud.banner(a.title||'', a.sub2||'', !!a.danger);
      else { level.seenBriefs[k]=true; hud.brief(a.title||'', a.sub||''); }
    }
    else if(a.a==='start'){
      // `aboard`: it waits for you to be standing on it, then goes, and runs
      // its `do` - a lift that must not leave without you
      if(a.aboard){ const m=level.movers.find(x=>x.id===a.mover); if(m&&!m.running) m.aboard={do:a.do||[], owner:owner||null}; }
      else{
        for(const m of level.movers)
          if(!a.mover||m.id===a.mover){ m.running=true; }
        SFX.waveUp();
        if(a.do) runActions(a.do,owner);
      }
    }
    else if(a.a==='checkpoint'){
      // Saves the run on a pad, named by position. This is the only way a
      // checkpoint is ever set: pads are markers, not switches, so one cannot
      // be taken early, out of order, or in the middle of the fight it is
      // supposed to mean the end of. Of the pads at that x,z, the nearest in
      // height (two can be stacked).
      let i=-1, best=Infinity;
      level.checkpoints.forEach((c,k)=>{
        if(Math.abs(c.p[0]-a.p[0])>=2||Math.abs(c.p[2]-a.p[2])>=2) return;
        const dy=Math.abs(padY(c)-a.p[1]);
        if(dy<best){ best=dy; i=k; }
      });
      // A quiet arena behind you is forgotten once you save further on: its
      // checkpoint, arriving late, would move the respawn back to where it was.
      if(i>=0&&level.arena&&level.arena.quiet&&!level.arena.done&&level.arena.owner!==owner)
        level.arena=null;
      if(i>=0) setCheckpoint(i,a.hp);
    }
    else if(a.a==='reveal'){
      if(a.node){ const rec=level.nodes.find(x=>x.id===a.node); if(rec) showNode(rec); }
      if(a.panel){ const p=level.panels.find(x=>x.id===a.panel); if(p&&!p.open) setPanel(p,true); }
    }
    else if(a.a==='uncage'&&a.key){ for(const c of level.cages) if(c.key&&c.key.colour===a.key) openCage(c); }
    else if(a.a==='uncage'){ level.cages.forEach(c=>{ if(!c.key) openCage(c); });
      // a core locked with no cage round it - 3-2's, out of reach on the crane till it falls
      if(level.goal&&level.goal.locked&&!level.goal.cageRec){ level.goal.locked=false; level.goal.mesh.visible=true; SFX.waveUp();
        FX.ring(level.goal.mesh.position,0x8dff6a,6,0.7); hud.banner('CORE UNSEALED','',false); } }
    // a generator back on feeds a conduit for good: lit, and past a Coil's reach
    else if(a.a==='conduit'){ const c=conduits.find(x=>x.id===a.id); if(c) c.off=!a.on; }
    else if(a.a==='feed'){
      const c=conduits.find(x=>x.id===a.conduit);
      if(c){ if(!c.powered) powerConduit(c); c.fed=true; c.glow.material.color.setHex(FED_LIT);
             FX.ring(c.pos,FED_LIT,6,0.7); }
    }
    // enemies that keep coming, every so often, until something is done
    // later: the rest of a fight on a clock - 3-2's hopper panels going one at a time mid-wave
    else if(a.a==='after'){
      level.timers.push({t:a.t||1, do:a.do||[], owner:owner||null, holds:holdsFight(a.do), panel:fromPanel>0, phase:fromPhase>0});
    }
    // the crane brings it: over, a cage let down on cables, and out they come
    else if(a.a==='deliver') startDelivery(a,owner);
    else if(a.a==='pods') startPods(a,owner);
    else if(a.a==='wreck') startWreck(a);
    else if(a.a==='waves'){
      level.waves.push({every:a.every||12, t:a.first===undefined?(a.every||12):a.first,
                        specs:a.enemies||[], until:a.until||null, owner:owner||null});
    }
    // the fight has started: from now on holding the conduits counts
    else if(a.a==='arm'){ if(level.goal) level.goal.armed=true; }
    // power anchors up - a relay lighting the quick way home
    else if(a.a==='anchors'){
      for(const q of anchors) if(q.id&&(a.ids||[]).includes(q.id)){
        if(a.off){ q.off=true;                        // a crane taking its anchor away
          const g=player.grapple; if(g&&Math.hypot(g.x-q.p[0],g.y-q.p[1],g.z-q.p[2])<1) releaseGrapple(false);
          continue; }
        if(!q.off) continue;
        q.off=false; q.hit=0.8; FX.ring(_v.set(q.p[0],q.p[1],q.p[2]),0x8dff6a,4,0.6);
      }
    }
    // bring something down: a fall group (`id`), or a platform (`mover`, onto `to`)
    else if(a.a==='fall'){
      if(a.mover){
        const m=level.movers.find(x=>x.id===a.mover);
        if(m&&!m.fall&&!m.fallen){ m.fall={t:0, warn:a.warn||1.5, from:[m.at.x,m.at.y,m.at.z], to:a.shatter?[m.at.x,a.to[1],m.at.z]:a.to.slice(), v:0, drop:false, shatter:a.shatter||null};
          m.running=false; m.stopped=true; SFX.creak(m.fall.warn);
          if(m.plate) plateHoles(); }       // a hole the Bastion knows about, however it was made
      }else{
        const f=fallById(a.id);
        // `more`: one already down goes further - an island sinking under the slag
        if(f&&a.more&&f.state==='down'){
          f.dy+=a.more; f.state='warn'; f.t=0; if(a.warn) f.warn=a.warn; SFX.creak(f.warn);
        }
        else if(f&&f.state==='up'){
          if(a.jolt){ f.jolt=0.8; SFX.creak(0.8); }
          else{ f.state='warn'; f.t=0; f.jolt=0; SFX.creak(f.warn); }
        }
      }
    }
    // clamps that were plain steel take a charge now
    else if(a.a==='expose'){
      for(const b of breaches) if(b.id&&(a.ids||[]).includes(b.id)&&b.shut){
        b.shut=false; b.mesh.material=b.mat; conductorLook(b);
        FX.ring(b.mesh.position,0xff7a2a,4,0.5); FX.burst(b.mesh.position,16,0xff7a2a,6,0.4,3);
        if(b.conductor){ b.tip.getWorldPosition(_v); FX.ring(_v,0xffd090,5,0.6); FX.burst(_v,24,0xffe2a8,8,0.4,4); SFX.crackle(); }
      }
    }
    // the crane's scrap, on and off
    else if(a.a==='drops'){
      if(a.on===false){ if(level.dropper) level.dropper.on=false; }
      // a new setting shuts what the old one had open
      else{ const {a:_a, on:_on, ...cfg}=a, was=level.dropper;
            if(was&&was.opens) for(const b of breaches) if(!b.broken&&was.opens.includes(b.id)){ b.shut=true; b.mesh.material=SHUT_MAT; }
            level.dropper={...cfg, on:true, t:a.first===undefined?2.5:a.first, openT:0}; }
    }
    // switch a storm or a grid on or off - a boss phase floods the floor
    else if(a.a==='hazard'){
      for(const h of level.hazards) if(h.id===a.id) h.off=!a.on;
    }
    // the rooms enemies are kept in, all of them at once (a floor gone: only
    // what is left of it)
    else if(a.a==='enemyBoxes') setEnemyBoxes(a.boxes);
    // the Authority: hauled up the Well to the crown, or beaten and falling
    else if(a.a==='authority') authorityAction(a);
    else if(a.a==='topple'){ const m=level.movers.find(x=>x.id===a.mover); if(m) startTopple(m,a.dir||[1,0]); }
    // everything that fights you goes at once: a boss taking its garrison with it
    else if(a.a==='killall'){
      for(const e of enemies.slice()) if(!e.dead&&e.kind!=='node'){ FX.ring(e.pos,0xffae2a,4,0.5); killEnemy(e,false); }
      // and what was still on its way, in pods not yet thrown or landed
      // (their groups owe nothing now)
      level.timers=level.timers.filter(x=>!x.fn);
      for(const d of level.podDrops) for(const grp of d.groups){ grp.hold=false; grp.killed=grp.want; }
      level.podDrops.length=0;
      for(const h of level.hazards) if(h.t==='gaze') clearPods(h);
      // counted now, so a checkpoint after it in the same list has them dead
      settleKills();
    }
    // the Gaze turns its attention: a new sweep, faster, sending things
    else if(a.a==='gaze'){
      for(const h of level.hazards) if(h.t==='gaze'&&(!a.id||h.id===a.id)) setGaze(h,a);
    }

  }
}

export {level, loadLevel, unloadLevel, updateLevel, runActions, refreshKeys, updateRespawn, clearEntities, placeEntities, respawn, voidDeath, spawnPlayer,
        addCage, openCage, closeCage,
        openDoor, sealDoor, doorById, snapshot, restore, setCheckpoint, LOCK_COLOUR};
