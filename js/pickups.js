import {THREE,V3,clamp,lerp,rand,T2,R90} from './util.js';
import {pickups} from './state.js';
import {scene} from './render.js';
import {sprite} from './textures.js';
import {kit,RB,CYL,ARC} from './kit.js';
import {hullMat} from './models.js';
import {BOUNDS,groundAt,hasGroundAt,hasGroundBelow} from './world.js';
import {player,playerCenter,_pc} from './player.js';
import {WEAPONS} from './weapons.js';
import {SFX} from './audio.js';
import {FX} from './fx.js';
import {hud} from './hud.js';

/* Health and ammo drops. */

const PICK_MODEL={};
function pickupModel(type){
  if(PICK_MODEL[type]) return PICK_MODEL[type];
  const k=kit(4);
  if(type==='hp'){
    const G=0x8dff6a;
    k.h(RB(0.46,0.46,0.17,0.09),0x16301f)          // casing
     .h(ARC(0.30,0.026,T2,16),0x2c5c3c)
     .g(RB(0.34,0.115,0.20,0.03),G)                // cross bar
     .g(RB(0.115,0.34,0.20,0.03),G);               // cross upright
  }else{
    const A=0xffc24d;
    k.h(CYL(0.17,0.17,0.44,14),0x2c2412)           // cell body
     .h(CYL(0.115,0.115,0.075,12),0x5a4a20,{y:0.25})
     .g(ARC(0.175,0.03,T2,14),A,{rx:R90,y:0.11})   // bands
     .g(ARC(0.175,0.03,T2,14),A,{rx:R90,y:-0.11})
     .g(CYL(0.085,0.085,0.05,12),A,{y:0.285})      // terminal
     .g(RB(0.05,0.24,0.05,0.015),A,{x:0.16});      // charge strip
  }
  PICK_MODEL[type]=k.build();
  return PICK_MODEL[type];
}
function dropPickup(p,type,life){
  // Scatter, then check where it actually landed (the arena clamp comes first,
  // so the void check sees the final spot).
  let dx=p.x+rand(-1,1), dz=p.z+rand(-1,1);
  if(BOUNDS!==null){ dx=clamp(dx,-BOUNDS+2,BOUNDS-2); dz=clamp(dz,-BOUNDS+2,BOUNDS-2); }
  if(!hasGroundAt(dx,dz)){
    dx=p.x; dz=p.z;                                  // no room to scatter: drop on the spot
    if(!hasGroundAt(dx,dz)){
      // a drop over the void is a drop you can never take
      if(hasGroundAt(player.pos.x,player.pos.z)){ dx=player.pos.x; dz=player.pos.z; }
      else return;
    }
  }
  const color=type==='hp'?0x8dff6a:0xffc24d;
  const M=pickupModel(type);
  const m=new THREE.Group();
  const hm=new THREE.Mesh(M.hull,hullMat.clone());
  hm.castShadow=true;
  m.add(hm);
  const gm=new THREE.Mesh(M.glow,new THREE.MeshBasicMaterial({vertexColors:true}));
  m.add(gm);
  m.position.set(dx,Math.max(0.9,p.y),dz);
  const g=sprite(color,1.5,0.42); m.add(g);
  scene.add(m);
  pickups.push({mesh:m,pos:m.position,type:type,color:color,t:0,life:life||26,mats:[hm.material,gm.material,g.material]});
}
const _pkv=V3();
function updatePickups(dt){
  playerCenter(_pc);
  for(let i=pickups.length-1;i>=0;i--){
    const p=pickups[i];
    p.t+=dt; p.life-=dt;
    const gy=(hasGroundBelow(p.pos.x,p.pos.z,p.pos.y+1)?groundAt(p.pos.x,p.pos.z,p.pos.y+1):p.pos.y-0.85)+0.85;
    p.pos.y=lerp(p.pos.y,gy+Math.sin(p.t*2.4)*0.18,Math.min(1,dt*4));
    p.mesh.rotation.y+=dt*2.4; p.mesh.rotation.x+=dt*1.3;
    if(p.life<3) p.mesh.visible=Math.sin(p.life*22)>0;
    const d=p.pos.distanceTo(_pc);
    if(d<6.5) p.pos.addScaledVector(_pkv.copy(_pc).sub(p.pos).normalize(),dt*(9-d));
    if(d<1.5||p.life<=0){
      if(p.life>0){
        if(p.type==='hp'){
          player.hp=Math.min(player.maxHp,player.hp+28); hud.vitals=true;
        }else{
          for(let k=1;k<WEAPONS.length;k++){
            const w=WEAPONS[k];
            w.reserve=Math.min(w.maxRes,w.reserve+(w.pickup||(k===1?12:5)));
          }
          hud.weapon=true;
        }
        SFX.pickup();
        FX.ring(p.pos,p.color,2.6,0.3);
        FX.burst(p.pos,10,p.color,5,0.3,4);
      }
      scene.remove(p.mesh);
      if(p.mats) for(let k=0;k<p.mats.length;k++) p.mats[k].dispose();
      pickups.splice(i,1);
    }
  }
}

export {PICK_MODEL, pickupModel, dropPickup, updatePickups};
