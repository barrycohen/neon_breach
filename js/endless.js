import {THREE,clamp,rand} from './util.js';
import {game,marks} from './state.js';
import {scene} from './render.js';
import {HALF,groundAt} from './world.js';
import {KIND,makeEnemy} from './enemies.js';
import {player} from './player.js';
import {WEAPONS} from './weapons.js';
import {SFX} from './audio.js';
import {FX} from './fx.js';
import {hud} from './hud.js';

/* Endless mode: wave composition, spawn telegraphs and pacing. */

const MGEO=new THREE.RingGeometry(0.7,1,26);

function spawnPoint(){
  let bx=0,bz=0,bd=-1;
  for(let i=0;i<12;i++){
    const a=Math.random()*Math.PI*2, r=rand(16,HALF-4);
    const x=Math.cos(a)*r, z=Math.sin(a)*r;
    const d=Math.hypot(x-player.pos.x,z-player.pos.z);
    if(d>bd){ bd=d; bx=x; bz=z; }
    if(d>22) break;
  }
  return {x:bx,z:bz};
}
function telegraph(kind){
  const p=spawnPoint();
  const gy=groundAt(p.x,p.z,3.2);
  const m=new THREE.Mesh(MGEO,new THREE.MeshBasicMaterial({color:KIND[kind].color,side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:0.9}));
  m.rotation.x=-Math.PI/2; m.position.set(p.x,gy+0.06,p.z); m.scale.setScalar(KIND[kind].rad*2.2);
  scene.add(m);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(KIND[kind].rad*0.9,KIND[kind].rad*0.9,7,10,1,true),
    new THREE.MeshBasicMaterial({color:KIND[kind].color,transparent:true,opacity:0.10,side:THREE.FrontSide,
      blending:THREE.AdditiveBlending,depthWrite:false}));
  beam.position.set(p.x,gy+3.5,p.z); scene.add(beam);
  marks.push({mesh:m,beam:beam,t:0.9,kind:kind,x:p.x,z:p.z});
  hud.threat=true;
  SFX.spawn();
}
function updateMarks(dt){
  for(let i=marks.length-1;i>=0;i--){
    const k=marks[i];
    k.t-=dt;
    const f=clamp(1-k.t/0.9,0,1);
    k.mesh.scale.setScalar(KIND[k.kind].rad*2.2*(1+Math.sin(f*9)*0.16));
    k.mesh.material.opacity=0.28+Math.abs(Math.sin(f*11))*0.42;
    k.beam.material.opacity=0.04+f*0.07;
    if(k.t<=0){
      const e=makeEnemy(k.kind,k.x,k.z);
      e.pos.y+=1.2;
      FX.ring(e.pos,KIND[k.kind].color,5,0.4);
      FX.burst(e.pos,14,KIND[k.kind].color,7,0.4,4);
      scene.remove(k.mesh); scene.remove(k.beam);
      k.mesh.material.dispose(); k.beam.geometry.dispose(); k.beam.material.dispose();
      marks.splice(i,1);
      hud.threat=true;
    }
  }
}
function waveComp(n){
  const list=[];
  let budget=5+Math.round(n*2.4)+(n%5===0?-4:0);
  let guard=0;
  while(budget>0&&guard++<200){
    const r=Math.random();
    // the campaign roster filters into the arena as the waves climb
    if(n>=8&&r<0.10&&budget>=4){ list.push('lancer'); budget-=4; }
    else if(n>=6&&r<0.18&&budget>=4){ list.push('bulwark'); budget-=4; }
    else if(n>=10&&r<0.24&&budget>=3){ list.push('turret'); budget-=3; }
    else if(n>=4&&r<0.38&&budget>=3){ list.push('sentinel'); budget-=3; }
    else if(n>=2&&r<0.70){ list.push('rusher'); budget-=1; }
    else { list.push('drone'); budget-=1; }
  }
  // shuffle so early spawns are mixed
  for(let i=list.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; const t=list[i]; list[i]=list[j]; list[j]=t; }
  if(n%5===0) list.push('warden');   // popped first: the boss leads the wave
  return list;
}
function startWave(n){
  game.wave=n;
  game.queue=waveComp(n);
  game.spawnT=0.7;
  game.inter=0;
  const boss=(n%5===0);
  hud.banner('WAVE '+n, boss?'WARDEN DETECTED':'HOSTILES INBOUND', boss);
  SFX.waveUp();
  SFX.setIntensity(clamp(0.2+n*0.09,0,1));
  hud.stats=true; hud.threat=true;
}
function updateWaves(dt){
  if(game.inter>0){
    game.inter-=dt;
    if(game.inter<=0) startWave(game.wave+1);
    return;
  }
  const cap=Math.min(9+game.wave,20);
  if(game.queue.length){
    game.spawnT-=dt;
    if(game.spawnT<=0&&(game.alive+marks.length)<cap){
      telegraph(game.queue.pop());
      game.spawnT=Math.max(0.30,1.15-game.wave*0.045)*rand(0.7,1.3);
    }
  }else if(game.alive===0&&marks.length===0){
    // wave cleared
    const bonus=500+game.wave*250;
    game.score+=bonus;
    player.sh=player.maxSh;
    player.hp=Math.min(player.maxHp,player.hp+12);
    for(let k=1;k<WEAPONS.length;k++){
      const w=WEAPONS[k]; w.reserve=Math.min(w.maxRes,w.reserve+(k===1?10:4));
    }
    hud.banner('WAVE '+game.wave+' CLEAR','+'+bonus+' &middot; SHIELDS RESTORED',false);
    hud.stats=true; hud.vitals=true; hud.weapon=true;
    SFX.waveUp(); SFX.setIntensity(0.12);
    game.inter=4.2;
  }
}

export {MGEO, spawnPoint, telegraph, updateMarks, waveComp, startWave, updateWaves};
