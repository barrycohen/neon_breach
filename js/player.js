import {V3,clamp,lerp,rand} from './util.js';
import {game} from './state.js';
import {camera,BASE_FOV} from './render.js';
import {colliders,balls,STEP,FLOOR_Y,BOUNDS} from './world.js';
import {SFX} from './audio.js';
import {FX} from './fx.js';
import {hud} from './hud.js';
import {keys,BINDS,INVERT,freeAim,mouseX,mouseY,die} from './ui.js';

/* Player state, movement, collision response and camera feel. */

const EYE=1.62, RAD=0.42, TALL=1.82;
const player={
  pos:V3(0,0,30), vel:V3(), yaw:0, pitch:0,
  hp:100, sh:100, maxHp:100, maxSh:100,
  onGround:false, jumps:2, boosts:1, coyote:0, jbuf:0,
  dashN:2, dashCd:0, dashT:0, iFrames:0,
  grapple:null, grappleT:0,      // {x,y,z} anchor being reeled to, and how long for

  lastHit:-99, bob:0, bobAmt:0, kick:0, kickV:0, roll:0,
  shake:0, fovK:0, hurtFlash:0
};
const GRAV=31, MAXSPD=13.2, ACC=13, AIRACC=3.4, FRIC=8.6, JUMPV=11.2, DASHSPD=31;
/* Tether. The reel is an acceleration rather than a fixed speed, so a long
   pull builds pace and a short one does not fling you past the anchor. ARRIVE
   is generous because letting go slightly early and coasting the last metre
   reads better than being parked underneath the hook. */
const REEL=96, REELMAX=36, ARRIVE=1.8, GRAPPLE_MAXT=2.8, GRAPPLE_POP=4.6;
/* The winch brakes over the last few metres instead of running flat out into
   the hook. Without it the only two outcomes were both wrong: cut the speed on
   arrival and you stop short of the deck and drop down the shaft you just
   climbed, or keep it and you sail straight over the platform you aimed at. */
const BRAKE_FROM=11, BRAKE_MIN=7;

const _g=V3();
/* Attaching restores the air jump, so the tether is a route rather than a
   trade: you can still double-jump off the platform you land on. */
function setGrapple(p){ player.grapple={x:p[0],y:p[1],z:p[2]}; player.grappleT=0; player.jumps=Math.max(player.jumps,1); }
/* Two ways off the line, and they are meant to feel different. Cutting it with
   a jump keeps every bit of the speed - that is the launch. Arriving does not:
   the winch has already braked to a walking pace by then, and halving what is
   left drops the player onto the deck under the hook instead of past it. */
function releaseGrapple(kick){
  if(!player.grapple) return;
  player.grapple=null; player.grappleT=0;
  if(kick){ player.vel.y=Math.max(player.vel.y,JUMPV*0.62); return; }
  player.vel.x*=0.5; player.vel.z*=0.5;
}

function aabb(p){ return {min:V3(p.x-RAD,p.y,p.z-RAD),max:V3(p.x+RAD,p.y+TALL,p.z+RAD)}; }
function ovl(a,b){
  return a.min.x<b.max.x&&a.max.x>b.min.x&&a.min.y<b.max.y&&a.max.y>b.min.y&&a.min.z<b.max.z&&a.max.z>b.min.z;
}
function overlapAny(p){
  const b=aabb(p);
  for(let i=0;i<colliders.length;i++) if(ovl(b,colliders[i])) return true;
  return false;
}
const _was=V3();
function moveAxis(ax,d){
  if(d===0) return false;
  _was.copy(player.pos);
  player.pos[ax]+=d;
  let hit=false;
  for(let i=0;i<colliders.length;i++){
    const c=colliders[i], b=aabb(player.pos);
    if(!ovl(b,c)) continue;
    // A moving platform you were already inside (it moved into you) is not
    // something this step ran into: resolving it along the step would throw
    // you out of its far side, through whatever stood beyond.
    if(c.mover&&ax!=='y'&&ovl(aabb(_was),c)) continue;
    // A laser grid is a sheet. It stops you across its thickness, back on the
    // side you came from, and never along its length: resolved like a block, a
    // sweeping grid that caught you against a wall would throw you out past
    // its far end, through whatever is there.
    if(c.thin){
      if(ax!==c.thin) continue;
      hit=true;
      const mid=(c.min[ax]+c.max[ax])/2;
      player.pos[ax]=(player.pos[ax]-d)<mid?c.min[ax]-RAD-0.001:c.max[ax]+RAD+0.001;
      player.vel[ax]=0;
      continue;
    }
    // Already in it before this step - something put you there - is not
    // landing on it or hitting your head on it: resolved that way, it would
    // lift you out on top of whatever you were in, a wall's height in one
    // frame. Left alone, the next step sideways brings you out of it.
    if(ax==='y'&&!c.mover&&(d<0?player.pos.y-d<c.max.y-STEP:player.pos.y+TALL-d>c.min.y+STEP)) continue;
    hit=true;
    if(ax==='y'){
      if(d>0){ player.pos.y=c.min.y-TALL-0.001; }
      else { player.pos.y=c.max.y+0.001; player.onGround=true; player.jumps=2; player.boosts=1; }
      player.vel.y=0;
    }else if(ax==='x'){
      player.pos.x=d>0?c.min.x-RAD-0.001:c.max.x+RAD+0.001; player.vel.x=0;
    }else{
      player.pos.z=d>0?c.min.z-RAD-0.001:c.max.z+RAD+0.001; player.vel.z=0;
    }
  }
  return hit;
}
function moveHoriz(dx,dz){
  const ox=player.pos.x, oy=player.pos.y, oz=player.pos.z, vx=player.vel.x, vz=player.vel.z;
  const wx=ox+dx, wz=oz+dz;
  moveAxis('x',dx); moveAxis('z',dz);
  const blocked=Math.abs(player.pos.x-wx)>1e-3||Math.abs(player.pos.z-wz)>1e-3;
  if(blocked&&(player.onGround||player.coyote>0)){
    const rx=player.pos.x, ry=player.pos.y, rz=player.pos.z, rvx=player.vel.x, rvz=player.vel.z;
    player.pos.set(ox,oy+STEP,oz);
    if(!overlapAny(player.pos)){
      player.vel.x=vx; player.vel.z=vz;
      moveAxis('x',dx); moveAxis('z',dz);
      if(Math.abs(player.pos.x-wx)<1e-3&&Math.abs(player.pos.z-wz)<1e-3&&!overlapAny(player.pos)) return;
    }
    player.pos.set(rx,ry,rz); player.vel.x=rvx; player.vel.z=rvz;
  }
}
function accelerate(wx,wz,maxSpd,accel,dt){
  const cur=player.vel.x*wx+player.vel.z*wz;
  const add=maxSpd-cur;
  if(add<=0) return;
  let a=accel*maxSpd*dt;
  if(a>add) a=add;
  player.vel.x+=wx*a; player.vel.z+=wz*a;
}

function updatePlayer(dt){
  const sinY=Math.sin(player.yaw), cosY=Math.cos(player.yaw);
  const fx=-sinY, fz=-cosY, rx=cosY, rz=-sinY;
  let ix=0, iz=0;
  if(keys[BINDS.forward]) iz+=1; if(keys[BINDS.back]) iz-=1;
  if(keys[BINDS.right]) ix+=1; if(keys[BINDS.left]) ix-=1;
  let wx=fx*iz+rx*ix, wz=fz*iz+rz*ix;
  const wl=Math.hypot(wx,wz);
  if(wl>0){ wx/=wl; wz/=wl; }

  // dash
  player.dashCd-=dt;
  if(player.dashN<2&&player.dashCd<=0){ player.dashN++; player.dashCd=1.5; }
  if(player.dashT>0) player.dashT-=dt;
  if(player.iFrames>0) player.iFrames-=dt;
  if(keys._dash){
    keys._dash=false;
    if(player.dashN>0){
      player.dashN--;
      if(player.dashCd<=0) player.dashCd=1.5;
      let dx=wl>0?wx:fx, dz=wl>0?wz:fz;
      player.vel.x=dx*DASHSPD; player.vel.z=dz*DASHSPD;
      if(player.vel.y<0) player.vel.y*=0.25;
      player.dashT=0.20; player.iFrames=0.16; player.fovK=Math.min(player.fovK+9,14);
      SFX.dash();
      const fp=V3(player.pos.x,player.pos.y+0.9,player.pos.z);
      FX.burst(fp,18,0x8dff6a,7,0.3,3,V3(-dx,0,-dz),0.8);
    }
  }

  // friction / acceleration
  if(player.onGround&&player.dashT<=0&&!player.grapple){
    const sp=Math.hypot(player.vel.x,player.vel.z);
    if(sp>0.01){
      const drop=Math.max(sp,4)*FRIC*dt;
      const ns=Math.max(0,sp-drop)/sp;
      player.vel.x*=ns; player.vel.z*=ns;
    }
  }
  if(wl>0){
    if(player.onGround) accelerate(wx,wz,MAXSPD,ACC,dt);
    else accelerate(wx,wz,MAXSPD,AIRACC,dt);
  }

  // jump. Cutting the tether is what turns a reel into a launch, so a jump
  // while attached spends no air jump - it just lets go, keeping the speed.
  if(player.jbuf>0) player.jbuf-=dt;
  if(keys._jump){ keys._jump=false; player.jbuf=0.14; }
  if(player.grapple&&player.jbuf>0){ player.jbuf=0; releaseGrapple(true); }
  if(player.jbuf>0&&player.jumps>0){
    const first=player.onGround||player.coyote>0;
    player.jbuf=0; player.jumps--;
    player.vel.y=first?JUMPV:JUMPV*0.98;
    player.onGround=false; player.coyote=0;
    SFX.jump();
    if(!first){
      FX.burst(V3(player.pos.x,player.pos.y+0.15,player.pos.z),16,0x5df0ff,6,0.28,6,V3(0,-1,0),0.7);
      FX.ring(V3(player.pos.x,player.pos.y+0.2,player.pos.z),0x5df0ff,2.4,0.28);
      if(wl>0){ player.vel.x=lerp(player.vel.x,wx*MAXSPD*1.05,0.35); player.vel.z=lerp(player.vel.z,wz*MAXSPD*1.05,0.35); }
    }
  }

  // tether reel
  let grav=1;
  if(player.grapple){
    player.grappleT+=dt;
    _g.set(player.grapple.x-player.pos.x,
           player.grapple.y-(player.pos.y+EYE),
           player.grapple.z-player.pos.z);
    const dist=_g.length();
    if(dist<ARRIVE||player.grappleT>GRAPPLE_MAXT){
      // Arriving under a lip with no upward speed drops you straight back
      // down the shaft you just climbed. Pop over it.
      if(dist<ARRIVE&&player.vel.y>-1) player.vel.y=Math.max(player.vel.y,GRAPPLE_POP);
      releaseGrapple(false);
    }else{
      _g.multiplyScalar(1/dist);
      player.vel.x+=_g.x*REEL*dt; player.vel.y+=_g.y*REEL*dt; player.vel.z+=_g.z*REEL*dt;
      const cap=dist>=BRAKE_FROM?REELMAX
                :BRAKE_MIN+(REELMAX-BRAKE_MIN)*(dist/BRAKE_FROM);
      const sp=player.vel.length();
      if(sp>cap) player.vel.multiplyScalar(cap/sp);
      grav=0.25;
    }
  }

  // integrate
  player.vel.y-=GRAV*dt*(player.dashT>0?0.35:grav);
  if(player.vel.y<-42) player.vel.y=-42;
  const wasGround=player.onGround;
  player.onGround=false;
  moveHoriz(player.vel.x*dt,player.vel.z*dt);
  moveAxis('y',player.vel.y*dt);
  // Standing still, a frame of gravity has to carry you back down through the
  // millimetre a landing leaves you above the floor. At high frame rates it
  // does not, and you would count as airborne every other frame - and a moving
  // platform, which only carries someone standing on it, would slide out from
  // under you. Someone who was standing and is not going up stays down.
  if(!player.onGround&&wasGround&&player.vel.y<=0){
    const b=aabb(player.pos); b.min.y-=0.05;
    let top=-Infinity;
    for(let i=0;i<colliders.length;i++){
      const c=colliders[i];
      if(c.max.y<=player.pos.y+0.002&&c.max.y>top&&ovl(b,c)) top=c.max.y;
    }
    if(top>-Infinity){
      player.pos.y=top+0.001; player.vel.y=0;
      player.onGround=true; player.jumps=2; player.boosts=1;
    }
  }
  // Out of anything round, along its surface; high enough on it, you stand on it.
  for(let i=0;i<balls.length;i++){
    const s=balls[i]; if(!(s.r>0)) continue;
    const y=clamp(s.c.y,player.pos.y+RAD,player.pos.y+TALL-RAD);     // the nearest point of you to its middle
    _g.set(player.pos.x-s.c.x,y-s.c.y,player.pos.z-s.c.z);
    const d=_g.length(), need=s.r+RAD;
    if(d>=need||d<1e-4) continue;
    _g.multiplyScalar(1/d);
    let k=need-d;
    // under its middle, out sideways only: pushed down too, you could be
    // forced into whatever the ball rests on and out of its far side
    if(_g.y<0){
      const h=Math.hypot(_g.x,_g.z); if(h<1e-4) continue;
      k=Math.sqrt(need*need-(y-s.c.y)**2)-Math.hypot(player.pos.x-s.c.x,player.pos.z-s.c.z);
      _g.set(_g.x/h,0,_g.z/h);
    }
    // a step, so whatever stands there stops it
    moveAxis('x',_g.x*k); moveAxis('z',_g.z*k); if(_g.y>0) moveAxis('y',_g.y*k);
    const vn=player.vel.dot(_g); if(vn<0) player.vel.addScaledVector(_g,-vn);
    if(_g.y>0.6){ if(player.vel.y<0) player.vel.y=0; player.onGround=true; player.jumps=2; player.boosts=1; }
  }
  if(player.pos.y<=FLOOR_Y+0.0005){ player.pos.y=FLOOR_Y; if(player.vel.y<0) player.vel.y=0; player.onGround=true; player.jumps=2; player.boosts=1; }
  if(player.onGround){
    player.coyote=0.12;
    if(!wasGround&&player.vel.y<-14) SFX.jump();
  } else if(player.coyote>0) player.coyote-=dt;

  // arena clamp (levels are unbounded; their geometry does the containing)
  if(BOUNDS!==null){
    player.pos.x=clamp(player.pos.x,-BOUNDS+RAD,BOUNDS-RAD);
    player.pos.z=clamp(player.pos.z,-BOUNDS+RAD,BOUNDS-RAD);
  }

  // shields regen
  if(game.time-player.lastHit>3.2&&player.sh<player.maxSh){
    player.sh=Math.min(player.maxSh,player.sh+34*dt);
  }

  // free-aim: steer by pushing the cursor toward a screen edge
  if(freeAim){
    const cx=innerWidth*0.5, cy=innerHeight*0.5;
    const ex=innerWidth*0.16, ey=innerHeight*0.18;
    const dx=mouseX-cx, dy=mouseY-cy;
    if(Math.abs(dx)>cx-ex) player.yaw-=Math.sign(dx)*(Math.abs(dx)-(cx-ex))/ex*3.1*dt;
    if(Math.abs(dy)>cy-ey) player.pitch=clamp(player.pitch-Math.sign(dy)*(Math.abs(dy)-(cy-ey))/ey*1.7*dt*(INVERT?-1:1),-1.53,1.53);
  }

  // camera feel
  const spd=Math.hypot(player.vel.x,player.vel.z);
  player.bobAmt=lerp(player.bobAmt,player.onGround?clamp(spd/MAXSPD,0,1):0,dt*8);
  player.bob+=dt*spd*1.15;
  player.fovK=lerp(player.fovK,clamp((spd-8)*0.9,0,10),dt*6);
  player.roll=lerp(player.roll,-ix*0.028,dt*9);
  player.shake=Math.max(0,player.shake-dt*2.6);
  player.kickV-=player.kick*70*dt; player.kickV*=Math.pow(0.0008,dt);
  player.kick+=player.kickV*dt; player.kick*=Math.pow(0.02,dt);

  viewFromPlayer(dt);
}

/* The view, from where the player is now. main.js places it again after the
   level has moved its platforms: a platform carries its rider in updateLevel,
   after this, so a camera placed only here would show you where you stood a
   frame ago over a platform drawn where it is now, and it would shake. */
function viewFromPlayer(dt){
  const sh=player.shake;
  camera.position.set(
    player.pos.x+Math.sin(player.bob*1.0)*0.055*player.bobAmt+rand(-sh,sh)*0.35,
    player.pos.y+EYE+Math.abs(Math.sin(player.bob*0.5))*0.06*player.bobAmt+rand(-sh,sh)*0.35,
    player.pos.z+rand(-sh,sh)*0.35
  );
  camera.rotation.set(player.pitch+player.kick*0.055+rand(-sh,sh)*0.02,player.yaw,player.roll+rand(-sh,sh)*0.02);
  const targetFov=BASE_FOV+player.fovK;
  camera.fov+=(targetFov-camera.fov)*Math.min(1,dt*8);
  camera.updateProjectionMatrix();
}

const _pc=V3();
function playerCenter(out){ return out.set(player.pos.x,player.pos.y+0.95,player.pos.z); }

function damagePlayer(amount,fromPos){
  if(game.state!=='play'||player.iFrames>0||player.god) return;   // god is set by the dev tools only
  player.lastHit=game.time;
  let dmg=amount;
  if(player.sh>0){
    const a=Math.min(player.sh,dmg);
    player.sh-=a; dmg-=a;
    if(player.sh<=0){ SFX.shieldBreak(); hud.shieldBreak(); }
  }
  if(dmg>0) player.hp-=dmg;
  player.shake=Math.min(0.5,player.shake+amount*0.010);
  player.hurtFlash=Math.min(1,player.hurtFlash+amount/55);
  SFX.hurt();
  game.combo=1; game.comboT=0;
  if(player.hp<=0){ player.hp=0; die(); }
}

export {viewFromPlayer, _pc, playerCenter, EYE, RAD, TALL, player, GRAV, MAXSPD, ACC, AIRACC, FRIC, JUMPV, DASHSPD, aabb, ovl, overlapAny, moveAxis, moveHoriz, accelerate, updatePlayer, damagePlayer, setGrapple, releaseGrapple};
