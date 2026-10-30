import {THREE,T2,R90} from './util.js';
import {P,RB,CYL,ARC,kit} from './kit.js';
import {TEX,ENV} from './textures.js';

/* Model library: enemies, weapons, and the materials they use. */

const hullMat=new THREE.MeshStandardMaterial({
  vertexColors:true, metalness:0.52, roughness:0.44,
  map:TEX.hullA, normalMap:TEX.hullN, roughnessMap:TEX.hullR,
  envMap:ENV, envMapIntensity:1.0});
hullMat.normalScale.set(0.8,0.8);
const glowMat=new THREE.MeshBasicMaterial({vertexColors:true});

/* ---------------------------------------------------------------
   enemy models: built once from dozens of primitives, welded into
   one hull mesh + one emissive mesh. Authored at radius ~1 and
   scaled to each kind's collision radius.
   --------------------------------------------------------------- */
const HULLC=0x243a52, DARKC=0x0d151f, TRIMC=0x46698c, PLATE=0x1a2839;

function modelDrone(){
  const k=kit(2.2), N=0x5df0ff;
  k.h(P.oct,HULLC,{sx:1.75,sy:1.28,sz:1.75})
   .h(P.oct,PLATE,{sx:1.02,sy:2.05,sz:1.02})
   .h(P.cyl,TRIMC,{sx:1.52,sy:0.14,sz:1.52,y:0.02})
   .h(P.sph,DARKC,{sx:0.68,sy:0.5,sz:0.68,y:-0.56})
   .h(P.cyl,TRIMC,{sx:0.075,sy:0.7,sz:0.075,y:0.88})
   .g(P.sph,N,{s:0.13,y:1.2});
  for(let i=0;i<3;i++){
    const a=i/3*T2, ca=Math.cos(a), sa=Math.sin(a), ry=R90-a;
    k.h(P.cyl,TRIMC,{sx:0.15,sy:0.66,sz:0.15,rx:R90,ry:ry,x:ca*0.74,z:sa*0.74})
     .h(P.taper,HULLC,{sx:0.48,sy:0.6,sz:0.48,rx:R90,ry:ry,x:ca*1.1,z:sa*1.1})
     .h(P.box,PLATE,{sx:0.3,sy:0.11,sz:0.44,ry:-a,x:ca*0.95,z:sa*0.95})
     .g(P.tor,N,{s:0.46,ry:ry,x:ca*1.3,z:sa*1.3})
     .g(P.cyl,N,{sx:0.3,sy:0.05,sz:0.3,rx:R90,ry:ry,x:ca*1.33,z:sa*1.33});
  }
  for(let i=0;i<7;i++){
    const a=i*2.39, r=0.28+((i*0.13)%0.42);
    k.h(P.box,TRIMC,{sx:0.1+((i*7)%3)*0.06,sy:0.07,sz:0.12+((i*5)%3)*0.05,
       ry:-a,x:Math.cos(a)*r,y:0.24,z:Math.sin(a)*r});
  }
  k.g(P.sph,0xffffff,{s:0.32});
  return k.build();
}

function modelRusher(){          // authored facing +Z, oriented by velocity
  const k=kit(2.2), N=0xff3fa4;
  k.h(P.cone,HULLC,{sx:0.88,sy:1.75,sz:0.88,rx:R90,z:0.52})
   .h(P.cyl,PLATE,{sx:0.82,sy:1.05,sz:0.82,rx:R90,z:-0.32})
   .h(P.tor,TRIMC,{s:0.92,z:0.08})
   .h(P.cyl,TRIMC,{sx:0.56,sy:0.18,sz:0.56,rx:R90,z:-0.84})
   .g(P.sph,N,{sx:0.62,sy:0.62,sz:0.72,z:-0.1})
   .g(P.cyl,N,{sx:0.46,sy:0.07,sz:0.46,rx:R90,z:-0.96})
   .g(P.tor,N,{s:0.74,z:0.62});
  for(let i=0;i<3;i++){
    const a=i/3*T2+0.6, ca=Math.cos(a), sa=Math.sin(a);
    k.h(P.box,TRIMC,{sx:0.07,sy:0.62,sz:0.8,rz:a-R90,x:ca*0.44,y:sa*0.44,z:-0.34})
     .g(P.box,N,{sx:0.03,sy:0.1,sz:0.5,rz:a-R90,x:ca*0.74,y:sa*0.74,z:-0.42});
  }
  k.g(P.sph,0xffffff,{s:0.3,z:0.1});
  return k.build();
}

function modelSentinel(){        // authored facing +Z, kept upright
  const k=kit(1.8), N=0xffc24d;
  k.h(P.ico,HULLC,{sx:1.9,sy:1.5,sz:1.8})
   .h(P.ico,PLATE,{sx:1.5,sy:1.85,sz:1.4,ry:0.6})
   .h(P.tor,TRIMC,{s:1.85,rx:R90,y:0.06})
   .h(P.cone,PLATE,{sx:1.35,sy:0.9,sz:1.35,rx:Math.PI,y:-0.78})
   .g(P.tor,N,{s:1.15,rx:R90,y:-0.92})
   .h(P.box,TRIMC,{sx:0.5,sy:0.34,sz:0.5,y:0.86});
  for(const sx of [-1,1]){
    k.h(P.cyl,PLATE,{sx:0.28,sy:1.5,sz:0.28,rx:R90,x:sx*0.52,y:-0.05,z:0.55})
     .h(P.cyl,TRIMC,{sx:0.36,sy:0.3,sz:0.36,rx:R90,x:sx*0.52,y:-0.05,z:0.2})
     .g(P.tor,N,{s:0.34,x:sx*0.52,y:-0.05,z:1.28})
     .h(P.box,HULLC,{sx:0.42,sy:0.5,sz:0.66,x:sx*1.02,y:0.42,z:-0.1})
     .g(P.box,N,{sx:0.1,sy:0.06,sz:0.44,x:sx*1.02,y:0.68,z:-0.1});
  }
  k.g(P.sph,N,{sx:0.5,sy:0.5,sz:0.4,z:0.92})
   .h(P.tor,TRIMC,{s:0.66,z:0.94})
   .g(P.sph,0xffffff,{s:0.34,z:0.2});
  return k.build();
}

function modelWarden(){
  const k=kit(1.4), N=0xff3fa4, A=0xffc24d;
  k.h(P.dod,HULLC,{s:1.9})
   .h(P.ico,PLATE,{s:2.25,ry:0.5})
   .g(P.sph,N,{s:0.95})
   .h(P.tor,TRIMC,{s:2.5,rx:R90})
   .g(P.tor,A,{s:2.2,rx:R90,y:0.5});
  for(let i=0;i<6;i++){
    const a=i/6*T2, ca=Math.cos(a), sa=Math.sin(a), ry=R90-a;
    k.h(P.taper,PLATE,{sx:0.5,sy:1.5,sz:0.5,rx:R90,ry:ry,x:ca*1.85,z:sa*1.85})
     .h(P.box,HULLC,{sx:0.85,sy:0.7,sz:0.7,ry:-a,x:ca*1.35,z:sa*1.35})
     .g(P.cyl,N,{sx:0.3,sy:0.07,sz:0.3,rx:R90,ry:ry,x:ca*2.6,z:sa*2.6});
  }
  for(const sy of [-1,1]){
    k.h(P.cone,PLATE,{sx:0.9,sy:1.3,sz:0.9,rx:sy>0?0:Math.PI,y:sy*1.9})
     .g(P.tor,A,{s:0.6,rx:R90,y:sy*2.4});
  }
  k.h(P.tor,TRIMC,{s:1.3,z:1.6})
   .g(P.cyl,A,{sx:0.85,sy:0.08,sz:0.85,rx:R90,z:1.66})
   .g(P.sph,0xffffff,{s:0.5});
  return k.build();
}

/* ---------------- weapon view models (authored pointing -Z) ---------------- */
const GUNB=0x51698a, GUND=0x27354a, GUNM=0x7d97b8;

function modelPulse(){
  const k=kit(7), N=0x5df0ff;
  // receiver + upper
  k.h(RB(0.115,0.132,0.44,0.03),GUNB,{z:-0.06})
   .h(RB(0.10,0.05,0.33,0.016),GUND,{y:0.086,z:-0.14})
   .h(RB(0.104,0.026,0.10,0.010),GUNM,{y:0.108,z:0.10})
   // handguard + vents
   .h(RB(0.096,0.10,0.30,0.032),GUND,{z:-0.37})
   .h(RB(0.03,0.104,0.03,0.012),GUNM,{z:-0.235})
   // barrel, gas block, muzzle brake
   .h(CYL(0.026,0.026,0.36,16),GUNM,{rx:R90,z:-0.54})
   .h(RB(0.052,0.055,0.05,0.014),GUND,{y:0.036,z:-0.45})
   .h(CYL(0.048,0.036,0.085,16),GUND,{rx:R90,z:-0.675})
   .h(ARC(0.046,0.009,T2,14),GUNM,{z:-0.64})
   // optic
   .h(RB(0.052,0.046,0.15,0.02),GUND,{y:0.138,z:-0.13})
   .h(CYL(0.024,0.024,0.026,14),GUNM,{rx:R90,y:0.138,z:-0.207})
   .h(RB(0.022,0.032,0.026,0.008),GUNM,{y:0.108,z:-0.07})
   // grip, trigger guard, trigger
   .h(RB(0.06,0.165,0.082,0.028),GUND,{rx:0.24,y:-0.148,z:0.035})
   .h(CYL(0.032,0.024,0.05,12),GUND,{rx:R90+0.24,y:-0.226,z:0.055})
   .h(ARC(0.046,0.011,Math.PI,14),GUNM,{rz:0,rx:0,y:-0.086,z:-0.03})
   .h(RB(0.014,0.036,0.012,0.005),GUNM,{rx:0.2,y:-0.078,z:-0.028})
   // curved magazine, two segments
   .h(RB(0.072,0.115,0.095,0.024),GUND,{rx:0.10,y:-0.112,z:-0.115})
   .h(RB(0.066,0.075,0.088,0.022),GUNM,{rx:0.30,y:-0.205,z:-0.14})
   // buffer tube + stock
   .h(CYL(0.034,0.034,0.13,14),GUNM,{rx:R90,y:0.012,z:0.15})
   .h(RB(0.072,0.092,0.17,0.032),GUNB,{z:0.235})
   .h(RB(0.05,0.028,0.13,0.012),GUND,{y:0.068,z:0.215});
  for(let i=0;i<5;i++) k.h(RB(0.104,0.014,0.018,0.005),GUNM,{y:0.112,z:-0.06-i*0.05});
  for(let i=0;i<4;i++){
    for(const sx of [-1,1])
      k.h(CYL(0.012,0.012,0.03,10),GUND,{rz:R90,x:sx*0.048,y:0.012,z:-0.30-i*0.055});
  }
  k.g(RB(0.018,0.02,0.25,0.006),N,{x:0.056,y:0.006,z:-0.30})
   .g(RB(0.018,0.02,0.25,0.006),N,{x:-0.056,y:0.006,z:-0.30})
   .g(CYL(0.019,0.019,0.008,14),N,{rx:R90,y:0.138,z:-0.222})
   .g(RB(0.04,0.018,0.026,0.006),N,{x:0.058,y:0.03,z:0.06})
   .g(ARC(0.035,0.008,T2,14),N,{z:-0.712})
   .g(RB(0.05,0.01,0.075,0.004),N,{y:-0.052,z:-0.16});
  return k.build();
}

function modelScatter(){
  const k=kit(7), N=0xff3fa4;
  k.h(RB(0.155,0.142,0.34,0.038),GUNB,{z:-0.02})
   .h(RB(0.128,0.05,0.12,0.018),GUND,{y:0.082,z:-0.05})
   // twin barrels + rib + collars
   .h(RB(0.02,0.022,0.44,0.008),GUNM,{y:0.046,z:-0.36})
   .h(RB(0.126,0.03,0.16,0.012),GUND,{y:-0.052,z:-0.14})
   // forend
   .h(RB(0.125,0.082,0.21,0.034),GUND,{y:-0.058,z:-0.31})
   // grip + guard
   .h(RB(0.066,0.168,0.09,0.03),GUND,{rx:0.26,y:-0.152,z:0.065})
   .h(CYL(0.034,0.026,0.05,12),GUND,{rx:R90+0.26,y:-0.228,z:0.088})
   .h(ARC(0.048,0.011,Math.PI,14),GUNM,{y:-0.088,z:0.0})
   .h(RB(0.014,0.036,0.012,0.005),GUNM,{rx:0.2,y:-0.08,z:0.004})
   // shell carrier + stock
   .h(CYL(0.036,0.036,0.20,14),GUNM,{rx:R90,y:-0.082,z:-0.155})
   .h(RB(0.082,0.098,0.16,0.036),GUNB,{z:0.225})
   .h(RB(0.052,0.03,0.12,0.012),GUND,{y:0.07,z:0.205});
  for(const sx of [-1,1]){
    k.h(CYL(0.042,0.042,0.46,16),GUND,{rx:R90,x:sx*0.048,y:0.012,z:-0.37})
     .h(CYL(0.05,0.044,0.055,16),GUNM,{rx:R90,x:sx*0.048,y:0.012,z:-0.585})
     .g(ARC(0.036,0.009,T2,14),N,{x:sx*0.048,y:0.012,z:-0.612})
     .g(RB(0.016,0.05,0.13,0.005),N,{x:sx*0.082,y:0.0,z:-0.04});
    for(let i=0;i<4;i++)
      k.h(CYL(0.014,0.014,0.132,10),GUNM,{rz:R90,x:0,y:-0.058,z:-0.245-i*0.048});
  }
  k.g(RB(0.10,0.016,0.05,0.005),N,{y:0.056,z:0.06})
   .g(RB(0.03,0.012,0.10,0.004),N,{y:-0.088,z:-0.30});
  return k.build();
}

function modelRail(){
  const k=kit(7), N=0xffc24d;
  k.h(RB(0.118,0.142,0.34,0.032),GUNB,{z:0.02})
   .h(RB(0.152,0.112,0.19,0.03),GUND,{y:-0.008,z:0.175})
   .h(CYL(0.024,0.024,0.94,16),GUNM,{rx:R90,z:-0.56})
   .h(RB(0.028,0.03,0.72,0.01),GUND,{y:0.054,z:-0.52})
   // scope
   .h(CYL(0.032,0.032,0.20,16),GUND,{rx:R90,y:0.122,z:-0.09})
   .h(CYL(0.038,0.032,0.03,16),GUNM,{rx:R90,y:0.122,z:-0.20})
   .h(RB(0.02,0.05,0.024,0.007),GUNM,{y:0.09,z:-0.02})
   .h(RB(0.02,0.05,0.024,0.007),GUNM,{y:0.09,z:-0.16})
   // grip + guard
   .h(RB(0.064,0.172,0.088,0.03),GUND,{rx:0.22,y:-0.152,z:0.095})
   .h(CYL(0.033,0.025,0.05,12),GUND,{rx:R90+0.22,y:-0.232,z:0.118})
   .h(ARC(0.046,0.011,Math.PI,14),GUNM,{y:-0.088,z:0.03})
   .h(RB(0.014,0.036,0.012,0.005),GUNM,{rx:0.2,y:-0.08,z:0.034})
   // muzzle + bipod stub
   .h(CYL(0.044,0.03,0.085,16),GUND,{rx:R90,z:-1.0})
   .h(CYL(0.014,0.014,0.11,10),GUNM,{rx:R90-0.7,y:-0.07,z:-0.60})
   .h(RB(0.09,0.05,0.20,0.018),GUND,{y:-0.086,z:-0.30});
  for(let i=0;i<4;i++)
    k.h(RB(0.13,0.012,0.028,0.004),GUNM,{y:0.055-i*0.028,z:0.245});
  for(let i=0;i<5;i++){
    const z=-0.26-i*0.175;
    k.h(ARC(0.062,0.017,T2,18),GUNM,{z:z})
     .g(ARC(0.042,0.011,T2,16),N,{z:z-0.02});
  }
  k.g(RB(0.02,0.022,0.60,0.006),N,{y:0.052,z:-0.55})
   .g(CYL(0.026,0.026,0.008,14),N,{rx:R90,y:0.122,z:-0.216})
   .g(CYL(0.034,0.026,0.02,16),N,{rx:R90,z:-1.045})
   .g(RB(0.10,0.022,0.055,0.006),N,{y:0.048,z:0.175});
  return k.build();
}

function modelTether(){
  // A launcher, not a rifle: a squat body, a wide muzzle ring the line pays out
  // through, and a spool on the side that reads as the thing doing the reeling.
  const k=kit(7), N=0x8dff6a;
  k.h(RB(0.148,0.156,0.30,0.034),GUNB,{z:0.03})
   .h(RB(0.126,0.118,0.16,0.028),GUND,{y:-0.012,z:0.18})
   .h(CYL(0.052,0.052,0.46,16),GUNM,{rx:R90,z:-0.30})
   // muzzle ring - the line runs out of the middle of it
   .h(ARC(0.105,0.026,T2,20),GUND,{z:-0.545})
   .g(ARC(0.078,0.016,T2,18),N,{z:-0.545})
   .h(CYL(0.030,0.030,0.10,14),GUNM,{rx:R90,z:-0.55})
   // spool, off the left side
   .h(CYL(0.088,0.088,0.052,18),GUND,{rz:R90,x:-0.125,y:0.045,z:0.05})
   .h(CYL(0.030,0.030,0.075,12),GUNM,{rz:R90,x:-0.125,y:0.045,z:0.05})
   .g(ARC(0.066,0.012,T2,16),N,{rz:R90,x:-0.152,y:0.045,z:0.05})
   // grip + guard
   .h(RB(0.062,0.168,0.086,0.03),GUND,{rx:0.22,y:-0.15,z:0.10})
   .h(ARC(0.044,0.011,Math.PI,14),GUNM,{y:-0.086,z:0.036})
   .h(RB(0.02,0.05,0.022,0.007),GUNM,{y:0.088,z:-0.03});
  // guide rollers along the top, so the eye reads a line being fed forward
  for(let i=0;i<4;i++){
    const z=-0.10-i*0.115;
    k.h(CYL(0.020,0.020,0.055,10),GUNM,{rz:R90,y:0.086,z:z})
     .g(CYL(0.010,0.010,0.06,8),N,{rz:R90,y:0.086,z:z});
  }
  k.g(RB(0.018,0.020,0.34,0.006),N,{y:0.052,z:-0.22})
   .g(RB(0.09,0.020,0.05,0.006),N,{y:0.046,z:0.18});
  return k.build();
}
function modelArc(){
  // An emitter, not a barrel: a stubby body wound with coils, and two prongs at
  // the front with the spark jumping the gap between them. The prongs are what
  // make it read as "this throws electricity" before it has fired once.
  const k=kit(7), N=0xb58cff;
  k.h(RB(0.150,0.150,0.34,0.036),GUNB,{z:0.02})
   .h(RB(0.118,0.110,0.14,0.028),GUND,{y:-0.010,z:0.20})
   .h(CYL(0.058,0.058,0.30,16),GUNM,{rx:R90,z:-0.26});
  for(let i=0;i<4;i++){               // coils wound along the barrel
    const z=-0.15-i*0.075;
    k.h(ARC(0.080,0.016,T2,18),GUND,{z:z}).g(ARC(0.080,0.007,T2,18),N,{z:z});
  }
  for(const sx of [-1,1]){            // the prongs
    k.h(RB(0.026,0.026,0.20,0.008),GUNM,{x:sx*0.052,z:-0.50,rz:sx*0.06})
     .g(P.sph,N,{s:0.030,x:sx*0.060,z:-0.60});
  }
  k.g(P.sph,0xffffff,{s:0.022,z:-0.60})        // the spark in the gap
   .h(RB(0.062,0.168,0.086,0.03),GUND,{rx:0.22,y:-0.15,z:0.10})
   .h(ARC(0.044,0.011,Math.PI,14),GUNM,{y:-0.086,z:0.036})
   .g(RB(0.018,0.020,0.30,0.006),N,{y:0.078,z:-0.08});
  return k.build();
}
function modelSunder(){
  // A breaching launcher, not a barrel: a square shroud, a fat revolving drum
  // slung under it with its chambers glowing, a flared muzzle, and heat vents on
  // top. Next to the Arc's round emitter it has to read as heavy and blunt.
  const k=kit(7), N=0xff7a2a;
  k.h(RB(0.20,0.19,0.40,0.04),GUNB,{z:0.02})                    // receiver
   .h(RB(0.15,0.13,0.14,0.03),GUND,{y:-0.01,z:0.24})            // stock block
   .h(RB(0.17,0.16,0.40,0.03),GUND,{y:0.012,z:-0.36})           // square shroud
   .h(CYL(0.11,0.13,0.10,18),GUNM,{rx:R90,y:0.012,z:-0.60})     // flared muzzle
   .h(CYL(0.07,0.07,0.02,16),GUND,{rx:R90,y:0.012,z:-0.655})
   .h(CYL(0.115,0.115,0.17,18),GUNM,{rx:R90,x:-0.09,y:-0.10,z:-0.08})  // the drum, slung low on the left where it shows
   .h(CYL(0.03,0.03,0.20,10),GUND,{rx:R90,x:-0.09,y:-0.10,z:-0.08})    // its axle
   .h(RB(0.20,0.035,0.22,0.012),GUND,{y:0.14,z:-0.05})          // carry handle
   .h(RB(0.035,0.06,0.035,0.01),GUND,{y:0.11,z:0.04})
   .h(RB(0.035,0.06,0.035,0.01),GUND,{y:0.11,z:-0.14})
   .h(RB(0.07,0.18,0.09,0.03),GUND,{rx:0.22,y:-0.18,z:0.14})    // grip
   .h(ARC(0.048,0.012,Math.PI,14),GUNM,{y:-0.11,z:0.07});
  for(let i=0;i<5;i++){                                        // the drum's chambers, glowing
    const a=i/5*T2;
    k.g(CYL(0.026,0.026,0.012,10),N,{rx:R90,x:-0.09+Math.cos(a)*0.072,y:-0.10+Math.sin(a)*0.072,z:-0.17});
  }
  for(let i=0;i<4;i++)                                         // heat vents along the shroud
    k.g(RB(0.11,0.012,0.03,0.006),N,{y:0.094,z:-0.24-i*0.075});
  k.g(ARC(0.085,0.016,T2,20),N,{y:0.012,z:-0.655})            // the bore, hot
   .g(RB(0.13,0.04,0.012,0.006),N,{y:0.03,z:0.226});           // breech glow at the back
  return k.build();
}
const GUN_BUILD=[modelPulse,modelScatter,modelRail,modelTether,modelArc,modelSunder];
function modelTurret(){          // static, authored facing +Z
  const k=kit(2.4), N=0xff3fa4;
  k.h(P.cyl,PLATE,{sx:2.1,sy:0.5,sz:2.1,y:-0.85})
   .h(P.taper,HULLC,{sx:1.7,sy:0.9,sz:1.7,y:-0.42})
   .h(P.ico,HULLC,{sx:1.5,sy:1.25,sz:1.5,y:0.28})
   .h(P.tor,TRIMC,{s:1.5,rx:R90,y:-0.55})
   .g(P.tor,N,{s:1.15,rx:R90,y:-0.62});
  for(const sx of [-1,1]){
    k.h(P.cyl,PLATE,{sx:0.24,sy:1.5,sz:0.24,rx:R90,x:sx*0.42,y:0.3,z:0.72})
     .h(P.cyl,TRIMC,{sx:0.34,sy:0.26,sz:0.34,rx:R90,x:sx*0.42,y:0.3,z:0.3})
     .g(P.tor,N,{s:0.3,x:sx*0.42,y:0.3,z:1.42});
  }
  k.g(P.sph,N,{sx:0.55,sy:0.45,sz:0.4,y:0.34,z:0.82})
   .h(P.tor,TRIMC,{s:0.72,y:0.34,z:0.84})
   .g(P.sph,0xffffff,{s:0.34,y:0.28});
  return k.build();
}
function modelLancer(){          // long-range beam platform, faces +Z
  const k=kit(2.0), N=0x9d5eff;
  k.h(P.ico,HULLC,{sx:1.1,sy:1.1,sz:2.4})
   .h(P.taper,PLATE,{sx:0.95,sy:1.6,sz:0.95,rx:-R90,z:1.15})
   .h(P.tor,TRIMC,{s:1.25,z:0.1})
   .g(P.tor,N,{s:1.0,z:0.15})
   .g(P.sph,N,{sx:0.6,sy:0.6,sz:0.45,z:1.75})
   .h(P.tor,TRIMC,{s:0.8,z:1.8});
  for(let i=0;i<4;i++){
    const a=i/4*T2+0.78;
    k.h(P.box,PLATE,{sx:0.1,sy:0.85,sz:1.1,rz:a-R90,x:Math.cos(a)*0.72,y:Math.sin(a)*0.72,z:-0.5})
     .g(P.box,N,{sx:0.05,sy:0.16,sz:0.7,rz:a-R90,x:Math.cos(a)*1.05,y:Math.sin(a)*1.05,z:-0.5});
  }
  k.g(P.sph,0xffffff,{s:0.3});
  return k.build();
}
function modelBulwark(){         // frontal shield, faces +Z
  const k=kit(1.9), N=0x5df0ff;
  k.h(P.dod,HULLC,{sx:1.5,sy:1.5,sz:1.3})
   .h(P.ico,PLATE,{s:1.75,ry:0.5})
   .h(P.box,PLATE,{sx:2.7,sy:2.5,sz:0.32,z:1.15})
   .h(P.box,TRIMC,{sx:2.9,sy:0.24,sz:0.4,y:1.15,z:1.15})
   .h(P.box,TRIMC,{sx:2.9,sy:0.24,sz:0.4,y:-1.15,z:1.15})
   .g(P.box,N,{sx:0.2,sy:2.1,sz:0.12,x:0.95,z:1.35})
   .g(P.box,N,{sx:0.2,sy:2.1,sz:0.12,x:-0.95,z:1.35})
   .g(P.tor,N,{s:0.85,z:1.4})
   .h(P.cyl,TRIMC,{sx:0.4,sy:1.1,sz:0.4,rx:R90,y:-0.1,z:0.5})
   .g(P.sph,0xffffff,{s:0.34,z:-0.2});
  for(const sy of [-1,1])
    k.h(P.taper,PLATE,{sx:0.55,sy:1.1,sz:0.55,rx:R90,y:sy*0.95,z:-1.1})
     .g(P.cyl,N,{sx:0.28,sy:0.07,sz:0.28,rx:R90,y:sy*0.95,z:-1.7});
  return k.build();
}

function modelNode(){            // shootable conduit node
  const k=kit(3), N=0xffc24d;
  k.h(P.cyl,PLATE,{sx:0.9,sy:2.4,sz:0.9})
   .h(P.tor,TRIMC,{s:1.15,rx:R90,y:0.8})
   .h(P.tor,TRIMC,{s:1.15,rx:R90,y:-0.8})
   .g(P.sph,N,{sx:0.85,sy:1.1,sz:0.85})
   .g(P.tor,N,{s:1.0,rx:R90})
   .g(P.sph,0xffffff,{s:0.4});
  return k.build();
}

function modelMite(){            // swarm unit, faces +Z
  const k=kit(1.0), N=0xff6a3d;
  k.h(P.ico,HULLC,{sx:1.0,sy:0.8,sz:1.2})
   .h(P.taper,PLATE,{sx:0.5,sy:0.9,sz:0.5,rx:-R90,z:0.85})
   .g(P.sph,N,{sx:0.42,sy:0.42,sz:0.32,z:1.05})
   .g(P.tor,N,{s:0.62,z:-0.15});
  for(const sx of [-1,1]) for(const sz of [-1,1])
    k.h(P.box,PLATE,{sx:0.12,sy:0.52,sz:0.12,rz:sx*0.5,x:sx*0.62,y:-0.34,z:sz*0.5});
  return k.build();
}
function modelWeaver(){          // shields whatever stands near it, faces +Z
  const k=kit(2.2), N=0x4de0b0;
  k.h(P.ico,HULLC,{s:1.35})
   .h(P.tor,TRIMC,{s:1.9,rx:R90})
   .g(P.tor,N,{s:1.62,rx:R90})
   .h(P.tor,TRIMC,{s:1.6,rz:R90})
   .g(P.tor,N,{s:1.35,rz:R90})
   .g(P.sph,0xffffff,{s:0.44});
  for(let i=0;i<3;i++){
    const a=i/3*T2;
    k.h(P.taper,PLATE,{sx:0.42,sy:0.9,sz:0.42,rz:a,x:Math.cos(a)*1.5,y:Math.sin(a)*1.5})
     .g(P.sph,N,{s:0.32,x:Math.cos(a)*2.0,y:Math.sin(a)*2.0});
  }
  return k.build();
}

function modelCoil(){           // drains what you have powered, hovers upright
  // A floating tesla coil: a stack of rings round a core, a crown on top, and
  // three feelers underneath that the drain beam comes out of.
  const k=kit(2.2), N=0xb58cff;
  k.h(P.cyl,HULLC,{sx:0.55,sy:2.0,sz:0.55})
   .g(P.sph,0xffffff,{s:0.38,y:1.15})
   .h(P.tor,TRIMC,{s:1.05,rx:R90,y:1.15});
  for(let i=0;i<4;i++){
    const y=0.65-i*0.42, r=1.25-i*0.16;
    k.h(P.tor,TRIMC,{s:r,rx:R90,y:y}).g(P.tor,N,{s:r*0.86,rx:R90,y:y});
  }
  for(let i=0;i<3;i++){
    const a=i/3*T2;
    k.h(P.taper,PLATE,{sx:0.22,sy:0.7,sz:0.22,x:Math.cos(a)*0.5,z:Math.sin(a)*0.5,y:-1.15,rx:Math.PI})
     .g(P.sph,N,{s:0.16,x:Math.cos(a)*0.5,z:Math.sin(a)*0.5,y:-1.5});
  }
  return k.build();
}
function modelSevere(){          // cuts tether lines and shuts anchors down
  // A spinning cutter: a flat disc with three hooked blades swept round it,
  // and a single eye underneath that the cutting beam comes out of.
  const k=kit(2.2), N=0xff4436;
  k.h(P.cyl,HULLC,{sx:1.3,sy:0.22,sz:1.3})
   .h(P.cyl,TRIMC,{sx:0.7,sy:0.5,sz:0.7,y:0.1})
   .g(P.tor,N,{s:1.05,rx:R90,y:0.02})
   .h(P.sph,DARKC,{sx:0.5,sy:0.4,sz:0.5,y:-0.2})
   .g(P.sph,N,{s:0.22,y:-0.38});
  for(let i=0;i<3;i++){
    const a=i/3*T2;
    // each blade is two plates at an angle - a hook, not a spoke
    k.h(P.box,PLATE,{sx:1.1,sy:0.06,sz:0.26,ry:-a,x:Math.cos(a)*1.05,z:Math.sin(a)*1.05})
     .h(P.box,PLATE,{sx:0.7,sy:0.06,sz:0.2,ry:-a-0.9,x:Math.cos(a+0.32)*1.55,z:Math.sin(a+0.32)*1.55})
     .g(P.box,N,{sx:0.62,sy:0.07,sz:0.05,ry:-a-0.9,x:Math.cos(a+0.36)*1.6,z:Math.sin(a+0.36)*1.6});
  }
  return k.build();
}
function modelDynamo(){          // Act II boss: a generator hanging in the air
  // A heavy core in a cage of three counter-set rings, with coil stacks above
  // and below - it should read as the machine the whole plant runs off.
  const k=kit(1.4), N=0xb58cff, W=0xffffff;
  k.h(P.ico,HULLC,{s:1.6})
   .g(P.sph,N,{s:1.05})
   .g(P.sph,W,{s:0.5});
  for(let i=0;i<3;i++){
    const r=2.1+i*0.25;
    k.h(P.tor,TRIMC,{s:r,rx:R90+i*0.9,ry:i*1.1})
     .g(P.torT,N,{s:r*0.97,rx:R90+i*0.9,ry:i*1.1});
  }
  for(const sy of [-1,1]){
    for(let i=0;i<3;i++){
      const y=sy*(1.05+i*0.34), r=0.95-i*0.18;
      k.h(P.cyl,PLATE,{sx:r,sy:0.2,sz:r,y:y}).g(P.tor,N,{s:r*0.9,rx:R90,y:y});
    }
    k.h(P.cone,HULLC,{sx:0.5,sy:0.7,sz:0.5,rx:sy>0?0:Math.PI,y:sy*2.2})
     .g(P.sph,N,{s:0.26,y:sy*2.6});
  }
  for(let i=0;i<6;i++){
    const a=i/6*T2;
    k.h(P.box,PLATE,{sx:0.22,sy:1.3,sz:0.9,ry:-a,x:Math.cos(a)*1.25,z:Math.sin(a)*1.25});
  }
  return k.build();
}
function modelBastion(){         // Act III heavy: wades the pool behind a shield, faces +Z
  // Wide and tall, legs down into the metal: shoulders, a head with one visor
  // slit, the mortar on its right arm, a white ring of heat in its chest. The
  // shield it holds is built separately (enemies.js), so it can break.
  const k=kit(1.6), N=0xff8a3a, W=0xffe0b0;
  k.h(P.dod,HULLC,{sx:1.7,sy:1.55,sz:1.35,y:0.65})                    // torso
   .h(P.box,PLATE,{sx:1.5,sy:0.6,sz:1.1,y:-0.35})                      // waist
   .h(P.box,PLATE,{sx:1.8,sy:0.45,sz:1.4,y:1.4})                       // collar
   .h(P.box,DARKC,{sx:0.8,sy:0.6,sz:0.75,y:1.85,z:0.25})               // head
   .h(P.box,TRIMC,{sx:0.9,sy:0.12,sz:0.85,y:2.18,z:0.25})
   .g(P.box,W,{sx:0.62,sy:0.13,sz:0.06,y:1.86,z:0.64});                // one visor slit
  for(const sx of [-1,1]){
    k.h(P.box,PLATE,{sx:0.85,sy:0.8,sz:1.3,x:sx*1.2,y:1.35,rz:sx*-0.3})        // pauldrons
     .h(P.box,TRIMC,{sx:0.9,sy:0.12,sz:1.35,x:sx*1.28,y:1.72,rz:sx*-0.3})
     .g(P.box,N,{sx:0.5,sy:0.06,sz:1.36,x:sx*1.2,y:1.2,rz:sx*-0.3})
     .h(P.cyl,HULLC,{sx:0.6,sy:1.5,sz:0.6,x:sx*0.6,y:-1.2})                    // legs, into the pool
     .h(P.box,PLATE,{sx:0.72,sy:0.9,sz:0.78,x:sx*0.6,y:-1.05,z:0.12})
     .h(P.cyl,DARKC,{sx:0.7,sy:0.5,sz:0.7,x:sx*0.6,y:-1.95});
  }
  // the right arm: the mortar, angled up and forward
  k.h(P.cyl,HULLC,{sx:0.42,sy:1.0,sz:0.42,x:1.55,y:0.55})
   .h(P.cyl,TRIMC,{sx:0.62,sy:1.5,sz:0.62,rx:-0.75,x:1.6,y:1.2,z:0.45})
   .g(P.tor,N,{s:0.6,rx:R90-0.75,x:1.6,y:1.75,z:0.95})
   .g(P.cyl,N,{sx:0.4,sy:0.08,sz:0.4,rx:-0.75,x:1.6,y:1.72,z:0.92});
  // the left arm, which holds the shield (the shield is its own piece, so it
  // can crack and blow apart)
  k.h(P.cyl,HULLC,{sx:0.42,sy:1.0,sz:0.42,x:-1.5,y:0.55})
   .h(P.box,TRIMC,{sx:0.5,sy:0.5,sz:0.9,x:-1.3,y:0.35,z:0.75});
  // a ring of white heat in its chest, seen only once the shield is gone
  k.g(P.tor,W,{s:0.75,y:0.75,z:0.68})
   .g(P.sph,N,{s:0.45,y:0.75,z:0.6});
  // vents across the back
  k.h(P.box,PLATE,{sx:1.3,sy:1.3,sz:0.25,y:0.65,z:-0.68});
  for(let i=0;i<3;i++) k.g(P.box,N,{sx:1.1,sy:0.12,sz:0.1,y:1.05-i*0.38,z:-0.84});
  return k.build();
}
const MODEL_BUILD={bastion:modelBastion,dynamo:modelDynamo,severer:modelSevere,coil:modelCoil,node:modelNode,mite:modelMite,weaver:modelWeaver,drone:modelDrone,rusher:modelRusher,sentinel:modelSentinel,warden:modelWarden,
                   turret:modelTurret,lancer:modelLancer,bulwark:modelBulwark};
const MODEL={};
function enemyModel(kind){
  if(!MODEL[kind]) MODEL[kind]=MODEL_BUILD[kind]();
  return MODEL[kind];
}

/* external model files: present ones replace the built-ins at load time */

export {modelNode, modelMite, modelWeaver, modelTurret, modelLancer, modelBulwark, hullMat, glowMat, HULLC, DARKC, TRIMC, PLATE, modelDrone, modelRusher, modelSentinel, modelWarden, GUNB, GUND, GUNM, modelPulse, modelScatter, modelRail, modelTether, GUN_BUILD, MODEL_BUILD, MODEL, enemyModel};
