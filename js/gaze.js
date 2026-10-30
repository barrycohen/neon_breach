/* The Gaze: Sector 3-3's searchlight, the Authority watching from its citadel.

   An eye throws a cone of light down onto the level, and its pool sweeps a set
   path. Let it rest on you - in the cone, with nothing between you and the eye -
   and it reddens and follows you; held there for `lock` seconds, it calls the
   Dynamo's lightning on the spot you are standing on. Cover is anything that
   breaks the line from the eye. Outrunning it works too: it follows slower than
   you run, so it is standing still that it punishes.

   A hazard (`t:'gaze'`), so `hazard` actions switch it and checkpoints keep
   whether it is on:
     p       the eye
     path    [[x,z],...] ground points the pool sweeps along and back
     period  seconds for one sweep there and back
     r       the pool's radius on the ground (the cone widens to it)
     lock    seconds on you before it strikes
     cool    seconds after a strike before it can lock again
     follow  how fast the pool chases you, m/s
     strike  {warn, r, dmg} - the ring and the hit, as a boss's
     brief   {title, sub} - said the first time it locks on you, once a level
     eyeR    the eye's radius
     tethers [[x,y,z],...] spire tips that hold it up: arcs crackle from each
             to the rings it turns in
     asleep  while it is off, the eye is there but shut: dark, the rings still.
             Switched on, it wakes - the iris lights, the rings start to turn,
             the beam comes down - over a couple of seconds
     sends   {kind, n, max}: as well as the strike, each lock sends n of them
             down its beam from the eye, while fewer than max it sent are alive
     bdmg    what its lightning does to a boss in the ring (0: nothing); a
             shielded one only while its shield is down
     hunt    no path: it comes after you wherever you are, at `follow`. Cover
             still hides you, and it waits beside it

   Its lightning strikes whatever is in the ring: enemies as well as you, and
   the conductors (breach panels marked `conductor`) that nothing else breaks.

   The `gaze` action changes any of path, period, r, lock, cool, follow, sends,
   hunt and lightI as a level goes on, and checkpoints keep what was last set.
   It can also make it act once: `send` (a pod now, down the beam where it
   rests: true, or {kind, n}) and `strikeAt` ([x,y,z], its lightning there).

   The light is a real spotlight, shadows and all: it lands on whatever it
   lands on, and every post throws a shadow you can see and hide in. The cone
   is only the beam you see in the air. It is aimed at the floor - pieces marked
   `walk`, and platforms - never at cover, or it would jump up onto every post
   it passed. */
import {THREE,V3,clamp,rand,T2} from './util.js';
import {scene} from './render.js';
import {sprite} from './textures.js';
import {own,groundAt,hasGroundAt,rayWorld,raySphere,colliders,balls,ENEMY_BOXES} from './world.js';
import {player,playerCenter,damagePlayer} from './player.js';
import {callStrike,strikesTold,PROXY} from './enemies.js';
import {breaches} from './state.js';
import {SFX} from './audio.js';
import {hud} from './hud.js';
import {FX} from './fx.js';

// amber at rest, red when it has you; its light a warm white
const IRIS=new THREE.Color(0xffae2a), CALM=new THREE.Color(0xffd28a), HOT=new THREE.Color(0xff2a3a);
let gazeIrisTex=null;
const BEAM_VS=`varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vW;
void main(){ vUv=uv; vW=(modelMatrix*vec4(position,1.0)).xyz;
  vec4 mv=modelViewMatrix*vec4(position,1.0); vV=-mv.xyz; vN=normalMatrix*normal; gl_Position=projectionMatrix*mv; }`;
const BEAM_FS=`uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
uniform vec4 uFl[8]; uniform float uFlY[8]; uniform float uPoolY; uniform vec3 uEye; uniform vec3 uAxis;
varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vW;
float hsh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float nse(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hsh(i),hsh(i+vec2(1.0,0.0)),f.x),mix(hsh(i+vec2(0.0,1.0)),hsh(i+vec2(1.0,1.0)),f.x),f.y); }
// round the cone without a seam where its u wraps from 1 back to 0
float dust(float u,float v){
  vec2 a=vec2(u*24.0,v*60.0-uTime*0.6), b=vec2((u-1.0)*24.0,v*60.0-uTime*0.6);
  float n=mix(nse(a),nse(b),smoothstep(0.85,1.0,u));
  vec2 c=vec2(u*9.0,v*16.0+uTime*0.05), d=vec2((u-1.0)*9.0,v*16.0+uTime*0.05);
  return 0.5*n+0.5*mix(nse(c),nse(d),smoothstep(0.85,1.0,u));
}
void main(){
  // Under a floor it is gone: what is in a floor's shadow, seen from the eye,
  // the floor stopped. Only light that went past an edge goes on down.
  for(int i=0;i<8;i++){
    if(vW.y<uFlY[i]){
      vec2 q=uEye.xz+(vW.xz-uEye.xz)*((uEye.y-uFlY[i])/(uEye.y-vW.y));
      if(q.x>uFl[i].x&&q.x<uFl[i].y&&q.y>uFl[i].z&&q.y<uFl[i].w) discard;
    }
  }
  // and what went past an edge fades out a little below it, rather than
  // hanging down into space as a long wedge
  float below=1.0-smoothstep(0.0,3.5,uPoolY-vW.y);
  float facing=abs(dot(normalize(vN),normalize(vV)));
  // Looked at along its length - from where it lands, or from behind the eye -
  // you see through the most haze of all, though every wall of the cone is
  // edge on, so it is not shaded by facing alone.
  float along=abs(dot(normalize(vW-cameraPosition),uAxis));
  // Stood in it, the haze right round you fades, so the ring of a strike
  // filling at your feet stays visible. And it is softer at its foot than its head.
  float near=smoothstep(3.0,22.0,length(vW-cameraPosition));
  float a=uOpacity*near*below*max(pow(facing,1.8),0.55*pow(along,10.0))*mix(0.22,1.0,vUv.y)*(0.6+0.8*dust(vUv.x,vUv.y));
  gl_FragColor=vec4(uColor*a,1.0);
}`;
// The iris, laid on a cap of the ball: the canvas's top row is the middle of
// the eye and its bottom row the cap's rim, and across is round the eye. Hot
// round the pupil, fibres running out, a dark ring at the edge. Grey, so the
// material's colour can take it from amber to red.
function gazeIris(){
  const c=document.createElement('canvas'); c.width=256; c.height=128;
  const g=c.getContext('2d');
  const gr=g.createLinearGradient(0,0,0,128);
  gr.addColorStop(0,'#fff'); gr.addColorStop(0.3,'#e8e8e8'); gr.addColorStop(0.7,'#9a9a9a');
  gr.addColorStop(0.86,'#4a4a4a'); gr.addColorStop(1,'#101010');
  g.fillStyle=gr; g.fillRect(0,0,256,128);
  for(let i=0;i<140;i++){
    const x=Math.random()*256, y0=10+Math.random()*30, y1=70+Math.random()*40;
    g.strokeStyle=Math.random()<0.5?'rgba(255,255,255,0.35)':'rgba(0,0,0,0.3)';
    g.lineWidth=0.8+Math.random()*1.6; g.beginPath(); g.moveTo(x,y0); g.lineTo(x+(Math.random()-0.5)*8,y1); g.stroke();
  }
  return new THREE.CanvasTexture(c);
}
let gazeTold=false;
let liveGaze=null;          // the eye the level has: the boss record of it, once it is loose, finds it here
function resetGazeTold(){ gazeTold=false; }

function addGaze(h){
  h.r=h.r||5; h.lock=h.lock||1.0; h.cool=h.cool||2.2; h.follow=h.follow||8; h.period=h.period||14;
  h.S={warn:1.1, r:2.8, dmg:24, all:true, ...(h.strike||{})};
  h.eye=V3(h.p[0],h.p[1],h.p[2]);
  h.aim=V3(); pathAt(h,0,h.aim);
  h.st='sweep'; h.lt=0; h.tt=0; h.heat=0; h.wake=h.off?0:1; h.pods=[]; h.flare=0;
  h.hunt=!!h.hunt; h.sends=h.sends||null;         // so a checkpoint keeps them off too
  const g=new THREE.Group();
  // The eye, turned to look where its light falls. A dark ball half sunk in its
  // housing, an amber iris with a slit pupil, a socket ring round it, and a
  // glow that carries it across the level: something watching, not a lighthouse.
  const R=h.R=h.R0=h.eyeR||3;
  h.mode='held'; h.extra=[]; liveGaze=h;
  // what you can't walk through once it lies dead on the crown
  h.deadCol={min:V3(0,-1000.5,0),max:V3(0,-1000,0)}; colliders.push(h.deadCol);
  h.ball={c:V3(),r:0}; balls.push(h.ball);           // and what you bump against: the ball itself
  if(!gazeIrisTex) gazeIrisTex=gazeIris();
  const eyeG=new THREE.Group(); eyeG.position.copy(h.eye); g.add(eyeG);
  // It hangs in the air, held in three rings that turn slowly about it, each on
  // its own axis: a machine's eye in a gimbal, not one set in a wall.
  const rings=[];
  const ringM=new THREE.MeshBasicMaterial({color:0x2e2533,fog:false});
  const ringGlow=new THREE.MeshBasicMaterial({color:IRIS.clone(),fog:false}); ringGlow.__perObject=true;
  for(const [k,rr] of [[0,1.45],[1,1.72],[2,2.0]]){
    const ring=new THREE.Group();
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(R*rr,R*0.07,8,64),ringM));
    // a fine bright line round its inside edge
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(R*(rr-0.075),R*0.018,6,64),ringGlow));
    ring.position.copy(h.eye); ring.rotation.set(rand(0,T2),rand(0,T2),rand(0,T2));
    ring.userData.spin=[[0.21,0.05,0],[0,0.17,0.07],[0.06,0,-0.13]][k];
    g.add(ring); rings.push(ring);
  }
  eyeG.add(new THREE.Mesh(new THREE.SphereGeometry(R,32,22),new THREE.MeshBasicMaterial({color:0x120a0e,fog:false})));
  const irisM=new THREE.MeshBasicMaterial({color:IRIS.clone(),map:gazeIrisTex,fog:false});
  irisM.__perObject=true;
  const ig=new THREE.SphereGeometry(R*1.012,40,12,0,T2,0,0.68); ig.rotateX(Math.PI/2);
  eyeG.add(new THREE.Mesh(ig,irisM));
  const pupil=new THREE.Mesh(new THREE.CircleGeometry(R*0.2,28),new THREE.MeshBasicMaterial({color:0x050203,fog:false}));
  pupil.position.z=R*1.03; eyeG.add(pupil);
  const sock=new THREE.Mesh(new THREE.TorusGeometry(R*0.66,R*0.09,10,40),new THREE.MeshBasicMaterial({color:0x2a1a14,fog:false}));
  sock.position.z=R*0.76; eyeG.add(sock);
  // lids, for the very end: back out of sight behind it till they close over
  // its eye (an upper and a lower, each half a shell)
  const lidM=new THREE.MeshBasicMaterial({color:0x1c1418,fog:false,side:THREE.DoubleSide});
  const lg=new THREE.SphereGeometry(R*1.12,32,10,0,T2,0,Math.PI/2);
  const lids=[new THREE.Mesh(lg,lidM),new THREE.Mesh(lg.clone().rotateX(Math.PI),lidM)];
  for(const l of lids){ l.visible=false; eyeG.add(l); }
  // the glow sits behind the iris, at the ball's middle: the ball hides its
  // heart and it rims the eye, rather than washing it out
  const halo=sprite(IRIS.getHex(),R*4.5,0.6); halo.material.__perObject=true; halo.material.fog=false;
  eyeG.add(halo);
  // the beam: an open cone, narrow at the origin (the eye) and a unit wide one
  // unit along +z, which is the way lookAt points it
  const cg=new THREE.CylinderGeometry(0.08,1,1,28,1,true);
  cg.translate(0,-0.5,0); cg.rotateX(-Math.PI/2);
  // Shaded as light in haze: brightest down its middle, where you look through
  // the most of it, soft at its edges, stronger towards the eye, with dust
  // drifting down it.
  const beamM=new THREE.ShaderMaterial({vertexShader:BEAM_VS, fragmentShader:BEAM_FS,
    uniforms:{uColor:{value:CALM.clone()}, uOpacity:{value:0.6}, uTime:{value:0},
              uFl:{value:[0,1,2,3,4,5,6,7].map(()=>new THREE.Vector4())}, uFlY:{value:[0,1,2,3,4,5,6,7].map(()=>-1e6)}, uPoolY:{value:-1e6},
              uEye:{value:h.eye.clone()}, uAxis:{value:V3(0,-1,0)}},
    transparent:true, depthWrite:false, side:THREE.DoubleSide, blending:THREE.AdditiveBlending, fog:false});
  beamM.__perObject=true;
  const beam=new THREE.Mesh(cg,beamM); beam.position.copy(h.eye); beam.frustumCulled=false; g.add(beam);
  // the light itself. Switched off by its intensity, never by hiding it: a
  // light coming and going changes every material's shader
  const spot=new THREE.SpotLight(CALM.getHex(),0,0,0.1,0.45,0);
  spot.castShadow=true; spot.shadow.mapSize.set(1024,1024);
  spot.shadow.bias=-0.00005; spot.shadow.normalBias=0.02;
  g.add(spot); g.add(spot.target);
  scene.add(own(g));
  Object.assign(h,{grp:g,eyeG,irisM,pupil,halo,beam,beamM,spot,rings,ringGlow,lids});
  placeBeam(h);
}

// where along its path the pool is at time t: there and back once a period,
// easing at each end like a platform
function pathAt(h,t,out){
  const P=h.path, n=P.length-1;
  if(n<=0){ out.set(P[0][0],0,P[0][1]); return out; }
  const u=(1-Math.cos(t/h.period*T2))/2*n;
  const i=Math.min(n-1,Math.floor(u)), f=u-i;
  out.set(P[i][0]+(P[i+1][0]-P[i][0])*f,0,P[i][1]+(P[i+1][1]-P[i][1])*f);
  return out;
}

const _gpc=V3(), _gzgd=V3(), _gw=V3(), _gtgt=V3(), _gza=V3(), _gzb=V3(), _gzc=V3();
// the floor under a point: walked-on pieces and platforms, not cover or walls
let floorHit=null;          // the piece floorAt found, if it found one
function floorAt(x,z,maxY){
  let y=-Infinity; floorHit=null;
  for(const c of colliders){
    if(!(c.walk||c.mover)||c.bed||c.max.y<-500) continue;      // (a hidden platform is parked 1000m down)
    if(x>c.min.x&&x<c.max.x&&z>c.min.z&&z<c.max.z&&c.max.y<=maxY&&c.max.y>y){ y=c.max.y; floorHit=c; }
  }
  return y===-Infinity?groundAt(x,z,maxY):y;
}
// Where its light lands here: the top floor - or, near someone under a glass
// roof (`under`), their floor below it. The light passes glass, so it lands
// where they stand rather than on the glass far over their head.
function poolY(h,x,z){
  const y=floorAt(x,z,h.eye.y-0.5);
  if(h.under&&floorHit&&floorHit.glass&&player.pos.y<y-1)
    return floorAt(x,z,player.pos.y+0.5);
  return y;
}
// Is the player under glass, near where its light is? Further off to stop than
// to start, so it can't flicker at the edge.
function underGlass(h){
  const gy=floorAt(player.pos.x,player.pos.z,h.eye.y-0.5);
  if(!(floorHit&&floorHit.glass&&player.pos.y<gy-1)) return false;
  return Math.hypot(player.pos.x-h.aim.x,player.pos.z-h.aim.z)<h.r+(h.under?8:2);
}
// Can the light reach this bit of floor - nothing big between the eye and the
// middle or any edge of where it would land? Cover standing on the floor is
// fine: the beam passes it, and it throws a shadow. The tower under the eye, or
// a wall the beam would shine through, is not.
function beamClear(h,x,z){
  if(!hasGroundAt(x,z)) return false;       // over the void: it would end in mid-air
  const y=poolY(h,x,z);
  _gza.set(x,y,z).sub(h.eye); const len=_gza.length(); _gza.multiplyScalar(1/len);
  const sinE=Math.max(0.2,-_gza.y), fl=Math.hypot(_gza.x,_gza.z)||1, ax=_gza.x/fl, az=_gza.z/fl;
  const r=h.r, along=r/sinE;
  for(const [ox,oz] of [[0,0],[-az*r,ax*r],[az*r,-ax*r],[ax*along,az*along],[-ax*along,-az*along]]){
    _gzb.set(x+ox,y,z+oz).sub(h.eye); const l=_gzb.length(); _gzb.multiplyScalar(1/l);
    // (through glass)
    if(rayWorld(h.eye,_gzb,l,false,true)<l-6) return false;
  }
  return true;
}
function placeBeam(h){
  // over the void (on its way back across a gap) it shines on down into it
  const gy=hasGroundAt(h.aim.x,h.aim.z)?poolY(h,h.aim.x,h.aim.z):(floorHit=null,-160);
  const u=h.beamM.uniforms;
  h.aim.y=gy;
  beamFloors(h,u);
  _gzgd.subVectors(h.aim,h.eye); const len=_gzgd.length(); _gzgd.multiplyScalar(1/len);
  if(!h.extraOf&&h.mode!=='dead') h.eyeG.lookAt(h.aim);
  u.uAxis.value.copy(_gzgd);
  h.beam.position.copy(h.eye).addScaledVector(_gzgd,h.R*0.9);
  h.beam.lookAt(h.aim);
  // The cone runs on just far enough that all of its end is under the ground,
  // which hides it: cut off at the pool, its square end would stand up out of
  // the floor at a slant; run on much further, it would throw a wedge out past
  // the deck's edge. Its width at the pool is still r.
  const sinE=Math.max(0.2,-_gzgd.y), cosE=Math.sqrt(1-sinE*sinE);
  const L=len+h.r*1.4*cosE/sinE+1, k=h.r/(0.08+0.92*(len-h.R*0.9)/L);
  h.beam.scale.set(k,k,L);
  if(!h.spot) return;
  h.spot.position.copy(h.beam.position);
  h.spot.target.position.copy(h.aim);
  h.spot.angle=Math.atan2(h.r,len-h.R*0.9)*1.15;
  // The shadow camera spans only the last stretch of the beam, where things
  // stand to cast shadows: spanning the whole beam, its depth would be too
  // coarse where the light lands, and shadows would come detached from their
  // posts. (distance 0 lets this far stand.)
  const sc=h.spot.shadow.camera;
  sc.near=Math.max(4,len-h.R-40); sc.far=len+25; sc.updateProjectionMatrix();
}

// The floors the end of the cone could pass under: the one it lands on, then
// those round the pool, up to eight, nearest first. Each cuts away the beam in
// its shadow.
const _bf=[];
function beamFloors(h,u){
  const R=h.r*3+6, ax=h.aim.x, az=h.aim.z;
  _bf.length=0;
  for(const c of colliders){
    if(!(c.walk||c.mover)||c.bed||c.max.y>h.eye.y-1||c.max.y<-500) continue;
    if(c.glass&&c.max.y>h.aim.y+0.5) continue;      // glass over the pool: the light goes on through
    if(c.max.x<ax-R||c.min.x>ax+R||c.max.z<az-R||c.min.z>az+R) continue;
    const dx=Math.max(c.min.x-ax,0,ax-c.max.x), dz=Math.max(c.min.z-az,0,az-c.max.z);
    _bf.push([dx*dx+dz*dz,c]);
  }
  _bf.sort((a,b)=>(a[1]===floorHit?-1:a[0])-(b[1]===floorHit?-1:b[0]));
  for(let i=0;i<8;i++){
    const c=_bf[i]&&_bf[i][1];
    if(c){ u.uFl.value[i].set(c.min.x,c.max.x,c.min.z,c.max.z); u.uFlY.value[i]=c.max.y-0.02; }
    else u.uFlY.value[i]=-1e6;
  }
  u.uEye.value.copy(h.eye); u.uPoolY.value=h.aim.y-0.02;
}
// in the cone, and nothing in the way
function seesPlayer(h){
  playerCenter(_gpc);
  _gzgd.subVectors(h.aim,h.eye); const la=_gzgd.length(); _gzgd.multiplyScalar(1/la);
  _gw.subVectors(_gpc,h.eye); const lp=_gw.length(); _gw.multiplyScalar(1/lp);
  if(_gzgd.dot(_gw)<Math.cos(Math.atan2(h.r,la))) return false;
  return rayWorld(h.eye,_gw,lp,false,true)>=lp-0.4;
}

// The eye shut: there, dark, still, no beam and no light
const SHUT=new THREE.Color(0x1a0d06), EMBER=new THREE.Color(0x5a2408), EMBER_HOT=new THREE.Color(0xa8461a);   // (dead: its iris a cooling ember, glowing on and off)
function sleepLook(h){
  h.grp.visible=true; h.beam.visible=false; h.spot.intensity=0; h.halo.visible=false;
  h.irisM.color.copy(SHUT); h.ringGlow.color.copy(SHUT); h.pupil.scale.set(0.5,1.5,1);
}

function updateGaze(h,dt){
  if(h.off){
    if(h.asleep){ if(h.wake>0||h.beam.visible||!h.grp.visible) sleepLook(h); h.wake=0; }
    else if(h.grp.visible){ h.grp.visible=false; h.spot.intensity=0; }
    h.st='sweep'; h.heat=0; clearPods(h,true);
    for(const b of h.extra||[]){ b.beam.visible=false; b.disc.visible=false; }
    return;
  }
  h.grp.visible=true; h.halo.visible=true;
  if(h.mode==='dying'||h.mode==='dead'){ deadStep(h,dt); return; }
  // waking: everything comes up together over a couple of seconds
  const w0=h.wake; h.wake=Math.min(1,h.wake+dt/2.4);
  const wk=h.wake*h.wake*(3-2*h.wake);
  if(h.mode==='held') for(const ring of h.rings){ const w=ring.userData.spin; ring.rotation.x+=w[0]*dt*wk; ring.rotation.y+=w[1]*dt*wk; ring.rotation.z+=w[2]*dt*wk; }
  if(w0===0&&h.wake>0){ SFX.strikeWarn(2.2); }
  updatePods(h,dt);
  // what holds it up: now and then an arc from a spire's tip to the outer ring
  if(h.mode==='held') for(const t of h.tethers||[]){
    if(Math.random()>dt*5*wk) continue;
    _gza.set(t[0],t[1],t[2]); _gzb.subVectors(_gza,h.eye).normalize().multiplyScalar(h.R*2).add(h.eye);
    let px=_gza.x,py=_gza.y,pz=_gza.z;
    for(let q=1;q<=6;q++){
      const f=q/6, j=q<6?0.9:0;
      _gzc.set(px,py,pz);
      px=_gza.x+(_gzb.x-_gza.x)*f+rand(-j,j); py=_gza.y+(_gzb.y-_gza.y)*f+rand(-j,j); pz=_gza.z+(_gzb.z-_gza.z)*f+rand(-j,j);
      _gzgd.set(px,py,pz); FX.tracer(_gzc,_gzgd,q%2?0xffd090:0xffffff,0.12,0.09);
    }
  }
  if(h.mode==='dropping'){ dropStep(h,dt); return; }
  if(h.mode==='loose') flyStep(h,dt);
  // its other beams, while the level wants them
  while((h.extra||(h.extra=[])).length<(h.beams||0)) addBeam(h,h.extra.length);
  updateBeam(h,dt,wk);
  let heat=h.heat, flare=h.flare;
  h.extra.forEach((b,k)=>{
    const on=k<(h.beams||0);
    b.beam.visible=on; b.disc.visible=on;
    if(on){ updateBeam(b,dt,wk); heat=Math.max(heat,b.heat); flare=Math.max(flare,b.flare); }
    else{ b.st='return'; b.aim.copy(h.aim); }
  });
  h.irisM.color.copy(IRIS).lerp(HOT,heat); h.irisM.color.lerp(SHUT,1-wk); h.halo.material.color.copy(h.irisM.color);
  h.halo.material.opacity=0.6*wk+0.4*flare;
  h.halo.scale.setScalar(h.R0*4.5*(1+flare*1.4));
  h.ringGlow.color.copy(h.irisM.color);
  // the pupil narrows to a slit as it fixes on you
  h.pupil.scale.set(0.5-0.32*heat,1.5,1);
}

/* One beam: its pool sweeping, finding you, locking on and striking - or,
   torn loose with no lightning left, burning you where it holds you
   (`burn`, a second). The eye's own beam is the one with the light; any others
   (`beams`) are cones with a glow where they land, and come at where you are
   heading rather than where you are. */
function updateBeam(h,dt,wk){
  const main=!h.extraOf;
  h.beam.visible=true;
  // its sweep waits while it is off its path, and picks up where it broke off
  if(h.st==='sweep') h.tt+=dt;
  // `calm`: busy elsewhere (a scripted strike), it doesn't lock on
  h.under=underGlass(h);
  const sees=!h.calm&&h.wake>=1&&player.hp>0&&seesPlayer(h);
  const lock=h.lock*(main?1:1.35);
  if(h.st==='sweep'||h.st==='return'){
    if(sees){
      h.st='lock'; h.lt=0; SFX.strikeWarn(lock);
      if(!gazeTold&&h.brief){ gazeTold=true; strikesTold(); hud.brief(h.brief.title,h.brief.sub); }
    }
  }
  if(h.st==='lock'){
    h.lt+=sees?dt:-dt*1.5;
    if(h.lt<=0){ h.st='return'; h.lt=0; }
    else if(h.lt>=lock){
      if(h.burn){ h.st='burn'; h.lt=2.6; h.flare=1; SFX.burn(true); }
      else{ callStrike({strikeK:h.S},true); sendDown(h); h.st='cool'; h.lt=h.cool; }
    }
  }else if(h.st==='burn'){
    // its light burns now: where it holds you, you burn, and it follows
    h.lt-=dt;
    if(sees){ h.burnAcc=(h.burnAcc||0)+h.burn*dt;
      if(h.burnAcc>=6){ h.burnAcc-=6; damagePlayer(6,h.eye); }
      if(Math.random()<dt*20){ playerCenter(_gpc); FX.burst(_gpc,3,0xffb060,4,0.3,-3); } }
    if(Math.random()<dt*14){ _gza.set(h.aim.x+rand(-h.r,h.r)*0.7,h.aim.y+0.1,h.aim.z+rand(-h.r,h.r)*0.7); FX.burst(_gza,2,0xff8a3a,3,0.4,-4); }
    if(Math.floor(h.lt*4)!==Math.floor((h.lt+dt)*4)) SFX.burn(sees);
    if(h.lt<=0){ h.st='cool'; h.lt=h.cool; }
  }else if(h.st==='cool'){
    h.lt-=dt; if(h.lt<=0) h.st='return';
  }
  // where the pool is going: after you while it has you, back to its path after
  pathAt(h,h.tt,_gtgt);
  if(h.st==='lock'||h.st==='burn'||h.hunt){
    _gtgt.set(player.pos.x,0,player.pos.z);
    // The others don't come at you: each waits on another floor near your
    // height, so crossing to it is crossing into one (rather than every beam
    // sitting in the same pool and striking as one).
    if(!main&&h.st!=='lock'&&h.st!=='burn'){
      h.orb=(h.orb||0)+dt*0.6;
      h.pickT=(h.pickT||0)-dt;
      if(h.pickT<=0){ h.pickT=0.5; h.pick=otherFloor(h.k); }
      if(h.pick) _gtgt.set(h.pick.x+Math.cos(h.orb)*1.5,0,h.pick.z+Math.sin(h.orb)*1.5);
    }
  }
  // and it only goes where its light can get to: wherever the beam would pass
  // through the tower under it, or a wall, it stops at the edge
  // On its sweep it keeps to the path. Across floor it can't light cleanly -
  // in a wall's or a platform's shadow - it carries on, its cone faded, rather
  // than sitting still and looking stuck. At a gap it waits at the edge (for a
  // span to come under it), and goes on without jumping the gap.
  if(h.st==='sweep'&&!h.hunt){
    const dx=_gtgt.x-h.aim.x, dz=_gtgt.z-h.aim.z, d=Math.hypot(dx,dz), step=Math.max(h.follow*2,20)*dt;
    const nx=d<=step?_gtgt.x:h.aim.x+dx/d*step, nz=d<=step?_gtgt.z:h.aim.z+dz/d*step;
    const clear=beamClear(h,nx,nz);
    if(clear||hasGroundAt(nx,nz)) h.aim.set(nx,0,nz);
    h.crossing=!clear&&!beamClear(h,h.aim.x,h.aim.z);
  }
  else if(h.st!=='cool'){
    // far off, it swings across to you quickly; close, it closes at its own pace
    const dx=_gtgt.x-h.aim.x, dz=_gtgt.z-h.aim.z, d=Math.hypot(dx,dz)||0.001,
          step=h.follow*dt*(h.st==='return'?1.5:1)*(h.hunt&&d>30?3:1)*(main?1:0.85);
    const nx=d<=step?_gtgt.x:h.aim.x+dx/d*step, nz=d<=step?_gtgt.z:h.aim.z+dz/d*step;
    // After you, it passes over whatever is between - a gap, a wall's shadow -
    // on its way to where you can be seen, and never comes to rest where you
    // can't. (The light itself is stopped by what is in the way: it casts
    // shadows. Only the cone is faded while it crosses.)
    const chasing=h.hunt||h.st==='lock'||h.st==='burn';
    const clear=beamClear(h,nx,nz);
    const ok=clear||(h.st==='return'&&!h.hunt)||(chasing&&beamClear(h,_gtgt.x,_gtgt.z));
    if(ok){ h.aim.set(nx,0,nz); h.crossing=!clear; h.pace=0; if(d<=step&&h.st==='return') h.st='sweep'; }
    else if(h.hunt){ if(h.st==='return') h.st='sweep'; if(d>h.r) seekEdge(h,dx/d,dz/d,d,step,dt); }
  }
  placeBeam(h);
  // it reddens as it locks on, and stays hot through the strike
  h.flare=Math.max(0,h.flare-dt*1.2);
  const want=Math.max(h.flare,h.st==='lock'?clamp(0.35+h.lt/lock*0.65,0,1):(h.st==='burn'?1:(h.st==='cool'?0.6:0)));
  h.heat+=(want-h.heat)*Math.min(1,dt*8);
  const bc=h.beamM.uniforms.uColor.value; bc.copy(CALM).lerp(HOT,h.heat);
  h.beamM.uniforms.uTime.value+=dt;
  // Faded across shade on a patrol, so it is seen to carry on; on its way to
  // somewhere new, out, so it never shines through what is in the way.
  h.cross=(h.cross||0)+((h.crossing?(h.st==='return'?1:0.8):0)-(h.cross||0))*Math.min(1,dt*10);
  // Over the void there is nothing for it to land on, and a beam run on down
  // would pass through whatever is beyond. There it goes out, and comes back on
  // what it finds.
  h.lost=(h.lost||0)+((hasGroundAt(h.aim.x,h.aim.z)?0:1)-(h.lost||0))*Math.min(1,dt*8);
  const op=(h.beamOp||0.6)*wk*(1-h.cross)*(1-h.lost);
  h.beamM.uniforms.uOpacity.value=op*(1+h.heat*0.5+(h.st==='lock'?Math.sin(h.lt*30)*0.2:0));
  if(main){
    // dimmer on the floor the nearer you are to its pool, so a strike's ring
    // at your feet isn't burned out to white
    const pd=Math.hypot(player.pos.x-h.aim.x,player.pos.z-h.aim.z), dim=0.3+0.7*clamp((pd-h.r)/18,0,1);
    h.spot.color.copy(bc); h.spot.intensity=(h.lightI||6)*wk*dim*(1-h.lost);
  }else{
    h.disc.position.set(h.aim.x,h.aim.y+0.06,h.aim.z); h.disc.scale.setScalar(h.r);
    h.disc.material.color.copy(bc); h.disc.material.opacity=0.22*op/0.6*(1-h.cross);
  }
  if(h.wake>=1) sparkConductors(h,dt);
}

// a floor near your height but not the one you're on, the kth nearest:
// somewhere for another beam to wait
const _of=[];
function otherFloor(k){
  _of.length=0;
  // in the same room as you (the level's enemy boxes): not over a wall
  const py=player.pos.y+1, B=ENEMY_BOXES&&ENEMY_BOXES.find(b=>player.pos.x>b[0]&&player.pos.x<b[1]&&player.pos.z>b[2]&&player.pos.z<b[3]&&
                                                              (b.length<=4||(py>b[4]&&py<b[5])));
  for(const c of colliders){
    if(!(c.walk||c.mover)||c.bed||c.max.y<player.pos.y-3||c.max.y>player.pos.y+3) continue;
    if((c.max.x-c.min.x)*(c.max.z-c.min.z)<16) continue;
    if(player.pos.x>c.min.x&&player.pos.x<c.max.x&&player.pos.z>c.min.z&&player.pos.z<c.max.z) continue;
    const x=(c.min.x+c.max.x)/2, z=(c.min.z+c.max.z)/2, d=Math.hypot(x-player.pos.x,z-player.pos.z);
    if(B&&!(x>B[0]&&x<B[1]&&z>B[2]&&z<B[3])) continue;
    if(d>7&&d<32) _of.push({x,z,d});
  }
  _of.sort((a,b)=>a.d-b.d);
  return _of[k]||_of[0]||null;
}
// another beam from the same eye: its own pool, sharing the eye's settings
function addBeam(h,k){
  const b=Object.create(h);
  Object.assign(b,{extraOf:h, k, pick:null, pickT:0, aim:h.aim.clone(), st:'return', lt:0, tt:0, heat:0, flare:0, cross:0, lost:0, crossing:false,
                   under:false, pace:0, paced:0, seekT:0, burnAcc:0, spot:null, lead:0.8+0.7*k});
  b.beamM=h.beamM.clone(); b.beamM.__perObject=true;
  b.beam=new THREE.Mesh(h.beam.geometry,b.beamM); b.beam.frustumCulled=false; h.grp.add(b.beam);
  const dm=new THREE.MeshBasicMaterial({color:CALM.clone(),transparent:true,opacity:0.2,depthWrite:false,
    blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  dm.__perObject=true;
  b.disc=new THREE.Mesh(new THREE.CircleGeometry(1,40),dm); b.disc.rotation.x=-Math.PI/2; h.grp.add(b.disc);
  h.extra.push(b);
}

/* Torn loose (`drop`): its spires gone, it falls, sheds its rings and the
   housing round it, and catches itself over the crown - smaller, and free. Then
   it flies (`fly`: {c, rx, rz, period}), round the crown. */
const LOOSE=0.5;
function flyPos(h,t,out){
  const F=h.fly||{c:[h.p[0],h.p[1]-30,h.p[2]],rx:8,rz:4,period:20}, a=t/F.period*T2;
  return out.set(F.c[0]+Math.cos(a)*F.rx, F.c[1]+Math.sin(t*0.8)*1.2, F.c[2]+Math.sin(a)*F.rz);
}
function startDrop(h){
  h.mode='dropping'; h.dropT=0; h.st='cool'; h.lt=3; h.heat=1;
  h.ringFall=h.rings.map(()=>({v:V3(rand(-5,5),rand(2,6),rand(-5,5)), s:V3(rand(-1.5,1.5),rand(-1.5,1.5),rand(-1.5,1.5))}));
  SFX.crash(); SFX.boom(); player.shake=Math.min(0.8,player.shake+0.5);
}
function dropStep(h,dt){
  h.dropT+=dt; const t=h.dropT;
  h.beam.visible=false; h.spot.intensity=0; for(const b of h.extra||[]){ b.beam.visible=false; b.disc.visible=false; }
  h.rings.forEach((r,i)=>{ const f=h.ringFall[i]; f.v.y-=30*dt; r.position.addScaledVector(f.v,dt);
    r.rotation.x+=f.s.x*dt; r.rotation.y+=f.s.y*dt; r.rotation.z+=f.s.z*dt; if(t>5) r.visible=false; });
  // it drops, then catches itself
  flyPos(h,0,_gza);
  const k=t<1.5?0.8*(t/1.5)*(t/1.5):0.8+0.2*Math.min(1,(t-1.5)/1.2);
  h.eye.lerpVectors(h.eye0,_gza,k); h.eyeG.position.copy(h.eye);
  // and sheds its housing
  if(t>=1.5&&!h.shed){ h.shed=true; FX.burst(h.eye,90,0x3a3040,18,1.2,10); FX.burst(h.eye,50,0xffae2a,14,0.6,6);
    FX.ring(h.eye,0xffae2a,30,0.8); SFX.breach(); player.shake=Math.min(0.8,player.shake+0.4); }
  h.eyeG.scale.setScalar(t<1.5?1:LOOSE);
  h.irisM.color.copy(HOT); h.halo.material.color.copy(HOT); h.halo.material.opacity=0.8;
  if(t>=3){ h.shed=false; h.dropT=0; looseLook(h); h.st='return'; h.flyT=0; }
}
function looseLook(h){
  h.mode='loose'; h.R=h.R0*LOOSE; h.eyeG.scale.setScalar(LOOSE);
  for(const r of h.rings) r.visible=false;
}
function flyStep(h,dt){
  h.flyT=(h.flyT||0)+dt;
  flyPos(h,h.flyT,_gza); h.eye.lerp(_gza,Math.min(1,dt*2)); h.eyeG.position.copy(h.eye);
}
/* Beaten (`die`: where it falls to): down onto the crown, dark, smoking, its
   iris still faintly glowing. Down, it turns its eye to `face` ([x,y,z]: where
   the ending's camera stops), and at the very end its lids close over it
   (`shut`, 0..1, from the ending). */
const _gzObj=new THREE.Object3D();
function shutEye(k){ if(liveGaze) liveGaze.shut=k; }
function deadStep(h,dt){
  h.beam.visible=false; h.spot.intensity=0; h.halo.visible=false;
  for(const b of h.extra||[]){ b.beam.visible=false; b.disc.visible=false; }
  for(const r of h.rings) r.visible=false;
  // pods still on their way burst where they are, with nothing in them
  for(const p of h.pods) FX.burst(p.m.position,20,0xff6a4a,8,0.4,4);
  if(h.pods.length) clearPods(h);
  const sh=h.shut||0; h.deadT=(h.deadT||0)+dt;
  h.irisM.color.copy(EMBER).lerp(EMBER_HOT,0.5+0.5*Math.sin(h.deadT*1.4)).lerp(SHUT,sh); h.pupil.scale.set(0.5,1.5,1);
  h.lids.forEach((l,i)=>{ l.visible=true; l.rotation.x=(i?1:-1)*Math.PI/3*(1-sh); });
  const R=h.rest;
  if(h.mode==='dying'){
    h.dieV=(h.dieV||0)+30*dt; h.eye.y-=h.dieV*dt;
    h.eye.x+=(R[0]-h.eye.x)*Math.min(1,dt*3); h.eye.z+=(R[2]-h.eye.z)*Math.min(1,dt*3);
    h.eyeG.rotation.x+=dt*2;
    if(Math.random()<dt*30) FX.burst(h.eye,3,0xff8a3a,4,0.5,-2);
    if(h.eye.y<=R[1]){ h.eye.set(R[0],R[1],R[2]); h.mode='dead'; h.dieV=0; deadSolid(h);
      FX.burst(h.eye,80,0x9aa0b0,16,1.2,8); FX.ring(h.eye,0xffae2a,22,0.8); SFX.crash(); SFX.boom();
      player.shake=Math.min(0.9,player.shake+0.6); }
  }else{
    if(h.face){ faceAt(h); h.eyeG.quaternion.slerp(_gzObj.quaternion,Math.min(1,dt*1.2)); }
    // smoke pouring off it, and embers, a column of it up into the dark
    const R0=h.R0*LOOSE;
    if(Math.random()<dt*28){ _gza.set(h.eye.x+rand(-R0,R0)*0.6,h.eye.y+R0*rand(0.2,0.8),h.eye.z+rand(-R0,R0)*0.6);
      FX.smoke(_gza,rand(3.5,6),rand(5,8),Math.random()<0.5?0x141216:0x2e2a34,rand(3,6)); }
    if(Math.random()<dt*8){ _gza.set(h.eye.x+rand(-R0,R0)*0.7,h.eye.y+rand(-0.5,1)*R0,h.eye.z+rand(-R0,R0)*0.7); FX.burst(_gza,2,0xff8a3a,3,0.9,-2); }
  }
  h.eyeG.position.copy(h.eye);
}
// the way it turns to look at `face`, in _gzObj
function faceAt(h){ _gzObj.position.copy(h.eye); _gzObj.lookAt(h.face[0],h.face[1],h.face[2]); }
// solid: the ball for you (player.js), and a box well inside it for shots and the rest
function deadSolid(h){ const R=h.R0*LOOSE, r=R*0.6; h.deadCol.min.set(h.eye.x-r,h.eye.y-r,h.eye.z-r); h.deadCol.max.set(h.eye.x+r,h.eye.y+r,h.eye.z+r);
  h.ball.c.copy(h.eye); h.ball.r=R; }
// a mode put back by a checkpoint: as it was, at once
function applyMode(h){
  h.deadCol.min.set(0,-1000.5,0); h.deadCol.max.set(0,-1000,0); h.ball.r=0;
  h.shut=0; for(const l of h.lids) l.visible=false;
  h.eye0=h.eye0||h.eye.clone();
  if(h.mode==='dropping') h.mode='loose';
  if(h.mode==='dying') h.mode='dead';
  if(h.mode==='loose'){ looseLook(h); flyPos(h,h.flyT||0,h.eye); }
  else if(h.mode==='dead'){ looseLook(h); h.mode='dead'; h.eye.set(h.rest[0],h.rest[1],h.rest[2]); deadSolid(h);
    if(h.face){ faceAt(h); h.eyeG.quaternion.copy(_gzObj.quaternion); } }
  else{ h.mode='held'; h.R=h.R0; h.eye.copy(h.eye0); h.eyeG.scale.setScalar(1); h.eyeG.rotation.set(0,0,0);
    h.rings.forEach(r=>{ r.visible=true; r.position.copy(h.eye); }); }
  h.eyeG.position.copy(h.eye);
}
// a spire's arc gone (`cut`: [x,z] of the spire)
function cutTether(h,at){
  let bi=-1, bd=Infinity;
  (h.tethers||[]).forEach((t,i)=>{ const d=Math.hypot(t[0]-at[0],t[2]-at[1]); if(d<bd){ bd=d; bi=i; } });
  if(bi<0) return;
  const t=h.tethers[bi]; h.tethers=h.tethers.filter((_,i)=>i!==bi);
  _gza.set(t[0],t[1],t[2]); FX.burst(_gza,60,0xffd090,16,0.8,8); FX.ring(_gza,0xffffff,12,0.6);
  FX.tracer(_gza,h.eye,0xffffff,0.3,0.3); SFX.crackle(); SFX.boom(); h.flare=1;
}

/* Hunting you where it can't light you - in the tower's shadow - it feels its
   way along the edge of what it can light, towards the spot nearest you, and
   paces there, rather than stopping dead. (A few tries a second, not every
   frame: each is five rays.) */
function seekEdge(h,ux,uz,d,step,dt){
  h.seekT=(h.seekT||0)-dt;
  if(h.seekT>0) return;
  h.seekT=0.1; step=Math.max(step,h.follow*0.1);
  for(const a of [0.6,-0.6,1.2,-1.2]){
    const c=Math.cos(a), s=Math.sin(a), qx=h.aim.x+(ux*c-uz*s)*step, qz=h.aim.z+(ux*s+uz*c)*step;
    if(Math.hypot(player.pos.x-qx,player.pos.z-qz)<d-step*0.2&&beamClear(h,qx,qz)){ h.aim.set(qx,0,qz); h.pace=0; return; }
  }
  // nowhere nearer: to and fro along the edge, turning back at a wall or after a few metres
  if(!h.pace){ h.pace=Math.random()<0.5?1:-1; h.paced=0; }
  const qx=h.aim.x-uz*step*h.pace*0.6, qz=h.aim.z+ux*step*h.pace*0.6;
  if(h.paced<6&&beamClear(h,qx,qz)){ h.aim.set(qx,0,qz); h.paced+=step*0.6; }
  else{ h.pace=-h.pace; h.paced=-6; }
}

/* A conductor under the light crackles: arcs off its rod's tip, and the tip
   flares. Where nothing else says what it is for, this does. */
let crackleT=0;
function sparkConductors(h,dt){
  crackleT-=dt;
  for(const b of breaches){
    if(!b.conductor||b.broken||!b.tip||b.shut) continue;
    const c=b.col, cx=(c.min.x+c.max.x)/2, cz=(c.min.z+c.max.z)/2;
    const lit=Math.hypot(cx-h.aim.x,cz-h.aim.z)<h.r+1;
    b.tipGlow.material.opacity+=((lit?1:0.45)-b.tipGlow.material.opacity)*Math.min(1,dt*6);
    if(!lit) continue;
    b.tip.getWorldPosition(_gza);
    if(Math.random()<dt*14){
      _gzb.set(_gza.x+rand(-2.2,2.2),_gza.y-rand(0.5,3),_gza.z+rand(-2.2,2.2));
      let px=_gza.x,py=_gza.y,pz=_gza.z;
      for(let q=1;q<=4;q++){
        const f=q/4, j=q<4?0.35:0;
        _gzc.set(px,py,pz);
        px=_gza.x+(_gzb.x-_gza.x)*f+rand(-j,j); py=_gza.y+(_gzb.y-_gza.y)*f+rand(-j,j); pz=_gza.z+(_gzb.z-_gza.z)*f+rand(-j,j);
        _gpc.set(px,py,pz); FX.tracer(_gzc,_gpc,q%2?0xffe2a8:0xffffff,0.08,0.08);
      }
    }
    if(crackleT<=0){ crackleT=rand(0.18,0.32); SFX.crackle(); }
  }
}

/* What it sends: a glowing pod shot down the beam from the eye, that bursts
   into what it carries a little way short of where the light lands - you see
   them come, every time, from the thing watching you. `h.send(specs, at)` is
   the level's: it puts them in the fight that is running. */
// A send is an event: the eye flares hot, a horn sounds, and the pod is big,
// red and trailing all the way down, so you see where the drones come from.
function sendDown(h,force){
  const S=force||h.sends; if(!S||!h.send) return;
  if(!force&&h.sentAlive&&h.sentAlive()>=(S.max||4)) return;
  if(!force&&h.sendOK&&!h.sendOK()) return;
  const to=V3().subVectors(h.eye,h.aim).normalize().multiplyScalar(S.short||14).add(h.aim);
  // over the deck you are on, never off its edge: they hover where they land.
  // And at your height, a little over your head, however far off its beam is.
  if(ENEMY_BOXES){
    const py=player.pos.y+1;
    // Where you stand is out of every box, the nearest at your height: left
    // unclamped, the spot up the beam could fall in another deck's box
    let b=ENEMY_BOXES.find(b=>player.pos.x>b[0]&&player.pos.x<b[1]&&player.pos.z>b[2]&&player.pos.z<b[3]&&
                               (b.length<=4||(py>b[4]&&py<b[5])));
    if(!b){ let bd=Infinity;
      for(const q of ENEMY_BOXES){ if(q.length>4&&(py<q[4]||py>q[5])) continue;
        const d=Math.hypot(clamp(player.pos.x,q[0],q[1])-player.pos.x,clamp(player.pos.z,q[2],q[3])-player.pos.z);
        if(d<bd){ bd=d; b=q; } } }
    if(b){
      to.x=clamp(to.x,Math.min(b[0]+2,(b[0]+b[1])/2),Math.max(b[1]-2,(b[0]+b[1])/2));
      to.z=clamp(to.z,Math.min(b[2]+2,(b[2]+b[3])/2),Math.max(b[3]-2,(b[2]+b[3])/2));
      to.y=clamp(to.y,player.pos.y+2,player.pos.y+6);
      if(b.length>4) to.y=clamp(to.y,b[4]+1,b[5]-1);
    }
  }
  const from=h.eye.clone(), m=sprite(0xff4a3a,7,1); m.material.__perObject=true; m.material.fog=false;
  const core=sprite(0xffe0c0,2.6,1); core.material.__perObject=true; core.material.fog=false; m.add(core);
  m.position.copy(from); h.grp.add(m);
  h.pods.push({from,to,m,core,t:0,dur:S.dur||1.6,land:()=>h.send([{kind:S.kind||'drone', n:S.n||2}],[to.x,to.y,to.z])});
  h.flare=1; horn();
}
// one call for a volley, not one a pod
let hornAt=-1e9;
function horn(){ const t=performance.now(); if(t-hornAt>2500){ hornAt=t; SFX.horn(); } }
// One thrown at a spot, not down the beam: the level's `pods`, its garrison
// sent where it wants them. `land` is called when it bursts.
function throwPod(h,at,land){
  const to=V3(at[0],at[1],at[2]), from=h.eye.clone();
  const m=sprite(0xff4a3a,7,1); m.material.__perObject=true; m.material.fog=false;
  const core=sprite(0xffe0c0,2.6,1); core.material.__perObject=true; core.material.fog=false; m.add(core);
  m.position.copy(from); h.grp.add(m);
  h.pods.push({from,to,m,core,t:0,dur:Math.max(1.4,from.distanceTo(to)/150),land,thrown:true});
  h.flare=1; horn();
}
function updatePods(h,dt){
  for(let i=h.pods.length-1;i>=0;i--){
    const p=h.pods[i]; p.t+=dt;
    const f=Math.min(1,p.t/p.dur), e=f*f;
    _gzc.copy(p.m.position); p.m.position.lerpVectors(p.from,p.to,e);
    FX.tracer(_gzc,p.m.position,0xff6a4a,0.7,0.6);
    if(Math.random()<dt*40) FX.burst(p.m.position,2,0xff8a5a,3,0.5,0);
    if(f<1) continue;
    FX.burst(p.to,40,0xff6a4a,11,0.5,6); FX.ring(p.to,0xff4a3a,9,0.6); SFX.spawn&&SFX.spawn();
    p.land();
    h.grp.remove(p.m); p.m.material.dispose(); p.core.material.dispose(); h.pods.splice(i,1);
  }
}
// `land`: what a thrown pod carries still arrives (the eye shut mid-throw);
// a death's restore throws them all away
function clearPods(h,land){ for(const p of h.pods){ if(land&&p.thrown) p.land(); h.grp.remove(p.m); p.m.material.dispose(); p.core.material.dispose(); } h.pods.length=0; }

// what a `gaze` action may change, and so what a checkpoint keeps
const GAZE_CFG=['path','period','r','lock','cool','follow','sends','hunt','lightI','calm','bdmg','beams','tethers','burn','fly','mode','rest','face'];
function gazeCfg(h){ const o={}; for(const k of GAZE_CFG) if(h[k]!==undefined) o[k]=h[k]; return o; }
function setGaze(h,cfg){
  const was=h.path;
  for(const k of GAZE_CFG) if(cfg[k]!==undefined) h[k]=cfg[k];
  h.S.bdmg=h.bdmg||0;            // what its lightning does to a boss: nothing, unless a fight says
  // a new path: it makes its way over to it from where it is
  if(cfg.path&&cfg.path!==was){ h.tt=0; if(h.st==='sweep') h.st='return'; }
  // once, now: a pod down the beam, or its lightning on a spot it was sent to
  if(cfg.send&&!h.off) sendDown(h,cfg.send===true?(h.sends||{kind:'drone',n:2}):cfg.send);
  if(cfg.strikeAt&&!h.off){ callStrike({strikeK:h.S},true,cfg.strikeAt); h.flare=1; }
  // the finale: a spire's arc cut, the eye torn loose, the eye beaten
  if(cfg.cut) cutTether(h,cfg.cut);
  if(cfg.drop&&h.mode==='held'){ h.eye0=h.eye0||h.eye.clone(); startDrop(h); }
  else if(cfg.die){ h.rest=cfg.die.slice(); h.mode='dying'; h.dieV=0; }
  else if(cfg.mode!==undefined) applyMode(h);
}

/* The eye, torn loose: the boss record (enemies.js) is this module's. A shot
   meets the ball; only a round that pierces, on its pupil - which looks where
   its light lands - gets in. So you stand at the edge of its light, or in it. */
const _ep=V3(), _ef=V3();
PROXY.eye={
  bind(e){ e.gz=liveGaze; if(e.gz) e.pos.copy(e.gz.eye); },
  update(e,dt){ if(e.gz) e.pos.copy(e.gz.eye); e.dim=false; },
  ray(e,o,d){
    const h=e.gz; if(!h||h.mode!=='loose'){ e.part=null; return -1; }
    const t=raySphere(o,d,h.eye,h.R);
    if(t<0){ e.part=null; return -1; }
    _ep.copy(d).multiplyScalar(t).add(o).sub(h.eye).normalize();
    _ef.subVectors(h.aim,h.eye).normalize();
    e.part=_ep.dot(_ef)>Math.cos(0.42)?'pupil':'ball';
    return t;
  },
  hit(e,dmg,at,dir,pierce){
    e.crit=false;
    const h=e.gz;
    if(e.part==='pupil'&&pierce){ e.crit=true; if(h) h.flare=1; FX.burst(at||e.pos,24,0xffffff,10,0.4,6); return dmg*1.5; }
    FX.burst(at||e.pos,6,0xffae2a,5,0.22,5); FX.ring(at||e.pos,0xffae2a,1.8,0.25);
    return 0;
  }
};

if(location.hash.indexOf("debug")>=0) window.__gazeBeamClear=(h,x,z)=>beamClear(h,x,z);
export {shutEye, addGaze, updateGaze, resetGazeTold, gazeCfg, setGaze, clearPods, throwPod};
