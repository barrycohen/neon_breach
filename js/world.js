import {THREE,V3,rand} from './util.js';
import {scene} from './render.js';
import {TEX,MAT} from './textures.js';
import {projectUV} from './kit.js';

/* Colliders, ray casts and the geometry builders levels are made from. */

const HALF=42, WALLH=17, STEP=0.72;
const colliders=[];   // {min:Vector3,max:Vector3}
// round solids, {c:Vector3, r} (r 0: not there), for shapes a box can't fit
const balls=[];
const platforms=[];   // walkable tops for spawn placement
const built=[];       // everything a build added, so it can all be torn down

/* The arena has an implicit ground plane at y=0 and square bounds. Levels with a
   void have neither, so both are world state a build sets. bounds === null means
   unbounded. */
let FLOOR_Y=0, BOUNDS=HALF;
function setWorldLimits(floorY,bounds){ FLOOR_Y=floorY; BOUNDS=bounds; }
/* Rooms enemies stay inside, for a level open to space in places, where an
   enemy straying out would hold its fight open from out of reach. Each is
   [x0,x1,z0,z1], optionally with a height range [.., y0, y1] and 'fly' (drones
   only); null for none. */
let ENEMY_BOXES=null;
function setEnemyBoxes(b){ ENEMY_BOXES=b&&b.length?b:null; }

/* Track a mesh as part of the current world so clearWorld() can dispose it. */
function own(m){ built.push(m); return m; }

/* Remove the whole world: meshes, their geometry, and every collider.
   Shared materials (MAT.*) are left alone - they outlive any single level. */
function clearWorld(){
  for(let i=0;i<built.length;i++){
    const m=built[i];
    if(m.parent) m.parent.remove(m);
    if(m.geometry) m.geometry.dispose();
    if(m.material&&m.material.__perObject){
      const list=Array.isArray(m.material)?m.material:[m.material];
      for(let k=0;k<list.length;k++) list[k].dispose();
    }
  }
  built.length=0;
  colliders.length=0;
  balls.length=0;
  platforms.length=0;
}

function solid(x,y0,z,w,h,d,mat){
  const bg=new THREE.BoxGeometry(w,h,d);
  projectUV(bg,0.42);          // panel size stays constant from crate to perimeter wall
  const m=new THREE.Mesh(bg,mat||MAT.block);
  m.castShadow=true; m.receiveShadow=true;
  m.position.set(x,y0+h/2,z); scene.add(m);
  colliders.push({min:V3(x-w/2,y0,z-d/2),max:V3(x+w/2,y0+h,z+d/2)});
  return own(m);
}
// four thin bars welded into one geometry: a glowing edge, not a lid over the surface
function frameGeo(w,d,t,h){
  const parts=[[w,h,t,0,-(d-t)/2],[w,h,t,0,(d-t)/2],
               [t,h,d-t*2,-(w-t)/2,0],[t,h,d-t*2,(w-t)/2,0]];
  const pos=[],nor=[];
  for(let i=0;i<parts.length;i++){
    const q=parts[i];
    const g=new THREE.BoxGeometry(q[0],q[1],q[2]);
    g.translate(q[3],0,q[4]);
    const p=g.attributes.position.array, n=g.attributes.normal.array, ix=g.index.array;
    for(let k=0;k<ix.length;k++){
      const j=ix[k]*3;
      pos.push(p[j],p[j+1],p[j+2]); nor.push(n[j],n[j+1],n[j+2]);
    }
    g.dispose();
  }
  const out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  out.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  return out;
}
function trim(x,y,z,w,d,mat){
  // Wide-and-deep tops get an outline; long thin wall strips stay a single bar.
  // Sized exactly to the piece: any overhang would poke out through whatever
  // the piece butts against and flicker against its face.
  const g=(w>1.2&&d>1.2)?frameGeo(w,d,0.26,0.1):new THREE.BoxGeometry(w,0.1,d);
  const m=new THREE.Mesh(g,mat);
  m.position.set(x,y+0.05,z); scene.add(m); return own(m);
}
function tower(x,y0,z,w,h,d){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),MAT.tower);
  m.position.set(x,y0+h/2,z); scene.add(m); return own(m);
}
function pad(x,y,z,r,mat){
  const m=new THREE.Mesh(new THREE.RingGeometry(r*0.72,r,28),mat);
  m.rotation.x=-Math.PI/2; m.position.set(x,y+0.03,z); scene.add(m); return own(m);
}

function buildArena(){
  setWorldLimits(0,HALF); ENEMY_BOXES=null;
  // ground
  const g=new THREE.Mesh(new THREE.PlaneGeometry(300,300),MAT.floor);
  g.receiveShadow=true;
  g.rotation.x=-Math.PI/2; scene.add(own(g));
  TEX.floor.repeat.set(75,75);
  colliders.push({min:V3(-150,-4,-150),max:V3(150,0,150),ground:true});

  // perimeter walls
  const T=3;
  solid(0,0,-HALF-T/2,HALF*2+T*2,WALLH,T,MAT.wall);
  solid(0,0, HALF+T/2,HALF*2+T*2,WALLH,T,MAT.wall);
  solid(-HALF-T/2,0,0,T,WALLH,HALF*2+T*2,MAT.wall);
  solid( HALF+T/2,0,0,T,WALLH,HALF*2+T*2,MAT.wall);
  for(const s of [-1,1]){
    // the cyan runs stop short so the magenta ones own the corners; run both
    // the full span and they overlap at all four, on the same plane
    trim(0,0.02,s*(HALF-0.1),HALF*2-1.0,0.3,MAT.neonC);
    trim(s*(HALF-0.1),0.02,0,0.3,HALF*2,MAT.neonM);
    trim(0,WALLH-0.4,s*HALF,HALF*2-1.2,0.4,MAT.neonC);
    trim(s*HALF,WALLH-0.4,0,0.4,HALF*2,MAT.neonM);
  }

  // central command deck (two tiers) + step ramps
  solid(0,0,0,15,3.2,15,MAT.block); trim(0,3.2,0,15,15,MAT.neonC);
  solid(0,3.2,0,6.4,1.7,6.4,MAT.block); trim(0,4.9,0,6.4,6.4,MAT.neonM);
  platforms.push({x:0,z:0,y:4.9,r:2.4});
  const stepOff=[[0,-10.2],[0,10.2],[-10.2,0],[10.2,0]];   // butting the deck, not lapping it
  for(const [sx,sz] of stepOff){
    solid(sx,0,sz,5.4,1.6,5.4,MAT.block); trim(sx,1.6,sz,5.4,5.4,MAT.neonC);
  }

  // quadrant platforms with pylons
  for(const sx of [-1,1]) for(const sz of [-1,1]){
    const px=sx*23, pz=sz*23;
    solid(px,0,pz,11,1.7,11,MAT.block); trim(px,1.7,pz,11,11,MAT.neonM);
    solid(px+sx*2.2,1.7,pz+sz*2.2,5,1.7,5,MAT.block); trim(px+sx*2.2,3.4,pz+sz*2.2,5,5,MAT.neonC);
    platforms.push({x:px+sx*2.2,z:pz+sz*2.2,y:3.4,r:1.8});
    const pyx=px-sx*4, pyz=pz-sz*4;
    const py=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.5,11,10),MAT.dark);
    py.castShadow=true; py.receiveShadow=true;
    py.position.set(pyx,5.5,pyz); scene.add(own(py));
    colliders.push({min:V3(pyx-0.5,0,pyz-0.5),max:V3(pyx+0.5,11,pyz+0.5)});
    const halo=new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.42,0.5,8),sz>0?MAT.neonC:MAT.neonA);
    halo.position.set(px-sx*4,10.4,pz-sz*4); scene.add(own(halo));
  }

  // pillar ring
  for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2+Math.PI/8, r=33;
    const x=Math.cos(a)*r, z=Math.sin(a)*r;
    solid(x,0,z,2.8,9.5,2.8,MAT.wall);
    trim(x,9.5,z,2.8,2.8,i%2?MAT.neonM:MAT.neonC);
  }
  // scattered crates
  const crates=[[-14,-30],[14,-30],[-30,-14],[30,14],[-30,14],[30,-14],[-14,30],[14,30],
                [-8,-18],[8,18],[18,-8],[-18,8],[0,-34],[0,34],[-34,0],[34,0]];
  for(let i=0;i<crates.length;i++){
    const [x,z]=crates[i], h=(i%3===0)?3.2:1.7, w=(i%3===0)?3.4:2.6;
    solid(x,0,z,w,h,w,MAT.block);
    trim(x,h,z,w,w,i%2?MAT.neonC:MAT.neonA);
  }

  // skyline beyond the walls
  for(let i=0;i<70;i++){
    const a=Math.random()*Math.PI*2;
    const h=rand(16,84), w=rand(6,16);
    // the arena is square: clear its edge along this bearing, not a circle of fixed radius
    const edge=HALF/Math.max(Math.abs(Math.cos(a)),Math.abs(Math.sin(a)));
    const r=edge+w+rand(14,104);
    tower(Math.cos(a)*r,0,Math.sin(a)*r,w,h,w);
  }
  // distant planet + starfield
  const planet=new THREE.Mesh(new THREE.SphereGeometry(70,32,24),
    new THREE.MeshBasicMaterial({color:0x2a1140,fog:false}));
  planet.position.set(-170,90,-330); scene.add(own(planet));
  const ring=new THREE.Mesh(new THREE.RingGeometry(86,116,64),
    new THREE.MeshBasicMaterial({color:0x6b2f8f,side:THREE.DoubleSide,transparent:true,opacity:.55,fog:false}));
  ring.position.copy(planet.position); ring.rotation.set(1.15,0.4,0.2); scene.add(own(ring));
  const sg=new THREE.BufferGeometry(), sp=[];
  for(let i=0;i<900;i++){
    const a=Math.random()*Math.PI*2, e=rand(0.05,1.1), R=rand(300,450);
    sp.push(Math.cos(a)*R*Math.cos(e),Math.sin(e)*R,Math.sin(a)*R*Math.cos(e));
  }
  sg.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));
  scene.add(own(new THREE.Points(sg,new THREE.PointsMaterial({color:0x9fd8ff,size:1.6,sizeAttenuation:false,fog:false}))));
}

/* Open space round a campaign level that opens on to it: a planet and a full
   sphere of stars, since a level with a void has them under it as well as over
   it. The planet is background, not a landmark: a gas giant half in shadow,
   muted, with faint bands, a thin rim of atmosphere and a pale ring. */
const PLANET_VS=`varying vec3 vN; varying vec3 vW;
void main(){ vN=normal; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const PLANET_FS=`uniform vec3 uL; uniform vec3 uA; uniform vec3 uB; uniform vec3 uRim;
varying vec3 vN; varying vec3 vW;
void main(){
  vec3 n=normalize(vN);
  float lit=smoothstep(-0.12,0.45,dot(n,uL));
  float lat=n.y, lon=atan(n.z,n.x);
  float band=0.5+0.5*sin(lat*15.0+sin(lat*5.0+lon*1.5)*0.9);
  band=mix(band,0.5+0.5*sin(lat*41.0+lon*0.6),0.3);
  vec3 col=mix(uA,uB,band)*(0.05+0.95*lit);
  float rim=pow(1.0-max(dot(n,normalize(cameraPosition-vW)),0.0),2.5);
  col+=uRim*rim*(0.15+0.85*lit);
  gl_FragColor=vec4(col,1.0);
}`;
function ringTex(){
  const c=document.createElement('canvas'); c.width=c.height=512;
  const g=c.getContext('2d'), R=256;
  // the ring's own uv is flat across it, so concentric bands on the canvas land
  // as bands round the planet; inner edge 0.7 of the outer
  for(let r=R*0.7;r<R;r+=1){
    const f=(r-R*0.7)/(R*0.3);
    const a=0.5*Math.sin(f*Math.PI)*(0.55+0.45*Math.sin(f*38+Math.sin(f*9)*2));
    g.strokeStyle='rgba(205,200,230,'+Math.max(0,a).toFixed(3)+')'; g.lineWidth=1.5;
    g.beginPath(); g.arc(R,R,r,0,Math.PI*2); g.stroke();
  }
  return new THREE.CanvasTexture(c);
}
function addSpace(planetAt){
  // a level can put it where it sits best behind what it is about
  const PR=30, at=planetAt?new THREE.Vector3(...planetAt):new THREE.Vector3(-150,70,-330);
  const planet=new THREE.Mesh(new THREE.SphereGeometry(PR,48,32),new THREE.ShaderMaterial({
    vertexShader:PLANET_VS, fragmentShader:PLANET_FS, fog:false,
    uniforms:{uL:{value:new THREE.Vector3(0.85,0.25,0.45).normalize()},
              uA:{value:new THREE.Color(0x232c45)}, uB:{value:new THREE.Color(0x4b4866)},
              uRim:{value:new THREE.Color(0x5a78b8)}}}));
  planet.position.copy(at); scene.add(own(planet));
  const ring=new THREE.Mesh(new THREE.RingGeometry(PR*1.45,PR*2.05,96),
    new THREE.MeshBasicMaterial({map:ringTex(),side:THREE.DoubleSide,transparent:true,opacity:0.45,depthWrite:false,fog:false}));
  ring.position.copy(at); ring.rotation.set(1.2,0.35,0.25); scene.add(own(ring));
  const sg=new THREE.BufferGeometry(), sp=[];
  for(let i=0;i<1600;i++){
    const a=Math.random()*Math.PI*2, e=Math.asin(rand(-1,1)), R=rand(380,520);
    sp.push(Math.cos(a)*R*Math.cos(e),Math.sin(e)*R,Math.sin(a)*R*Math.cos(e));
  }
  sg.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));
  scene.add(own(new THREE.Points(sg,new THREE.PointsMaterial({color:0x9fd8ff,size:1.6,sizeAttenuation:false,fog:false}))));
}

/* AABB utilities -------------------------------------------------- */
function groundAt(x,z,maxY){
  // the highest top below maxY, at any height (floors below y=0 included)
  let y=-Infinity;
  for(let i=0;i<colliders.length;i++){
    const c=colliders[i];
    if(c.bed) continue;      // the bed under a pool of metal: ground to feet, not to fliers
    if(x>c.min.x&&x<c.max.x&&z>c.min.z&&z<c.max.z&&c.max.y<=maxY+0.01&&c.max.y>y) y=c.max.y;
  }
  return y===-Infinity?0:y;
}
/* True when some collider's footprint covers this spot - a level with a void has
   places where nothing does, and a dropped pickup would hang in mid-air. */
function hasGroundAt(x,z){
  for(let i=0;i<colliders.length;i++){
    const c=colliders[i];
    // a platform burst to pieces is parked 1000m down, out of the world
    if(c.max.y<-500) continue;
    if(x>c.min.x&&x<c.max.x&&z>c.min.z&&z<c.max.z) return true;
  }
  return false;
}

/* True when there is something to stand on below this height here. A column can
   have a collider in it and still nothing underneath - a gantry, the underside
   of a ledge, a lift that has gone up. */
function hasGroundBelow(x,z,maxY){
  if(FLOOR_Y>-1e8) return true;
  for(let i=0;i<colliders.length;i++){
    const c=colliders[i];
    if(c.bed) continue;
    if(x>c.min.x&&x<c.max.x&&z>c.min.z&&z<c.max.z&&c.max.y<=maxY+0.01) return true;
  }
  return false;
}

function rayBox(o,d,c){
  let t0=0,t1=Infinity;
  for(const ax of ['x','y','z']){
    const inv=1/d[ax];
    let a=(c.min[ax]-o[ax])*inv, b=(c.max[ax]-o[ax])*inv;
    if(a>b){const t=a;a=b;b=t;}
    if(a>t0) t0=a; if(b<t1) t1=b;
    if(t0>t1) return Infinity;
  }
  return t0>0.0001?t0:Infinity;
}
function rayWorld(o,d,max,pierceGrates,seeGlass){
  let best=max===undefined?Infinity:max;
  for(let i=0;i<colliders.length;i++){
    if(pierceGrates&&colliders[i].grate) continue;   // piercing rounds ignore grates
    if(seeGlass&&colliders[i].glass) continue;       // light goes through a window
    if(colliders[i].noRay) continue;                 // a laser grid stops bodies, not shots
    const t=rayBox(o,d,colliders[i]);
    if(t<best) best=t;
  }
  return best;
}
const _sv=V3();
function raySphere(o,d,c,r){
  _sv.subVectors(c,o);
  const b=_sv.dot(d), c2=_sv.lengthSq()-r*r;
  if(c2>0&&b<0) return -1;
  const disc=b*b-c2;
  if(disc<0) return -1;
  const t=b-Math.sqrt(disc);
  return t<0?0:t;
}
function pointSolid(p){
  for(let i=0;i<colliders.length;i++){
    const c=colliders[i];
    if(c.noRay) continue;            // a laser grid stops bodies, not shots - theirs or yours
    if(p.x>c.min.x&&p.x<c.max.x&&p.y>c.min.y&&p.y<c.max.y&&p.z>c.min.z&&p.z<c.max.z) return true;
  }
  return false;
}

export {balls, addSpace, setEnemyBoxes, ENEMY_BOXES, hasGroundAt, hasGroundBelow, FLOOR_Y, BOUNDS, setWorldLimits, own, clearWorld, built, HALF, WALLH, STEP, colliders, platforms, solid, frameGeo, trim, tower, pad, buildArena, groundAt, rayBox, rayWorld, _sv, raySphere, pointSolid};
