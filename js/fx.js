import {THREE,V3,lerp,rand} from './util.js';
import {scene,camera} from './render.js';
import {TEX} from './textures.js';
import {SFX} from './audio.js';

/* Particles, tracers and shockwave rings. */

const FX=(function(){
  const N=1600;
  const pos=new Float32Array(N*3), col=new Float32Array(N*3), base=new Float32Array(N*3);
  const vel=new Float32Array(N*3), life=new Float32Array(N), tot=new Float32Array(N), grv=new Float32Array(N);
  let head=0;
  for(let i=0;i<N;i++){ pos[i*3+1]=-9999; }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.BufferAttribute(col,3));
  const pts=new THREE.Points(geo,new THREE.PointsMaterial({
    size:0.36,map:TEX.glow,vertexColors:true,blending:THREE.AdditiveBlending,
    depthWrite:false,transparent:true,sizeAttenuation:true}));
  pts.frustumCulled=false; scene.add(pts);
  const C=new THREE.Color();

  function burst(p,n,color,spd,ttl,gravity,dir,cone){
    C.set(color);
    for(let k=0;k<n;k++){
      const i=head; head=(head+1)%N;
      let vx=rand(-1,1),vy=rand(-1,1),vz=rand(-1,1);
      const l=Math.hypot(vx,vy,vz)||1; vx/=l; vy/=l; vz/=l;
      if(dir){ vx=lerp(vx,dir.x,cone||0.6); vy=lerp(vy,dir.y,cone||0.6); vz=lerp(vz,dir.z,cone||0.6); }
      const s=spd*rand(0.35,1.25);
      pos[i*3]=p.x; pos[i*3+1]=p.y; pos[i*3+2]=p.z;
      vel[i*3]=vx*s; vel[i*3+1]=vy*s; vel[i*3+2]=vz*s;
      const j=rand(0.75,1.25);
      base[i*3]=C.r*j; base[i*3+1]=C.g*j; base[i*3+2]=C.b*j;
      col[i*3]=C.r*j; col[i*3+1]=C.g*j; col[i*3+2]=C.b*j;
      life[i]=tot[i]=ttl*rand(0.6,1.15); grv[i]=gravity===undefined?12:gravity;
    }
  }
  function update(dt){
    for(let i=0;i<N;i++){
      if(life[i]<=0) continue;
      life[i]-=dt;
      const i3=i*3;
      if(life[i]<=0){ pos[i3+1]=-9999; col[i3]=col[i3+1]=col[i3+2]=0; continue; }
      vel[i3+1]-=grv[i]*dt;
      pos[i3]+=vel[i3]*dt; pos[i3+1]+=vel[i3+1]*dt; pos[i3+2]+=vel[i3+2]*dt;
      if(pos[i3+1]<0.06){ pos[i3+1]=0.06; vel[i3+1]*=-0.34; vel[i3]*=0.7; vel[i3+2]*=0.7; }
      const f=life[i]/tot[i], ff=f*f;
      col[i3]=base[i3]*ff; col[i3+1]=base[i3+1]*ff; col[i3+2]=base[i3+2]*ff;
    }
    geo.attributes.position.needsUpdate=true;
    geo.attributes.color.needsUpdate=true;
  }

  /* tracers */
  const TN=26, tracers=[];
  const tgeo=new THREE.BoxGeometry(1,1,1);
  for(let i=0;i<TN;i++){
    const m=new THREE.Mesh(tgeo,new THREE.MeshBasicMaterial({color:0x5df0ff,
      blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:0}));
    m.visible=false; m.frustumCulled=false; scene.add(m);
    tracers.push({m:m,t:0,ttl:0.07});
  }
  let th=0;
  const _a=V3(),_b=V3();
  function tracer(from,to,color,w,ttl){
    const tr=tracers[th]; th=(th+1)%TN;
    _a.copy(from); _b.copy(to);
    const len=_a.distanceTo(_b); if(len<0.05) return;
    tr.m.position.copy(_a).add(_b).multiplyScalar(0.5);
    tr.m.lookAt(_b);
    tr.m.scale.set(w||0.055,w||0.055,len);
    tr.m.material.color.set(color||0x5df0ff);
    tr.m.visible=true; tr.ttl=ttl||0.07; tr.t=tr.ttl;
  }
  function updTracers(dt){
    for(let i=0;i<TN;i++){
      const tr=tracers[i];
      if(tr.t<=0) continue;
      tr.t-=dt;
      if(tr.t<=0){ tr.m.visible=false; tr.m.material.opacity=0; continue; }
      tr.m.material.opacity=tr.t/tr.ttl;
    }
  }

  /* shockwave rings */
  const RN=10, rings=[]; let rh=0;
  const rgeo=new THREE.RingGeometry(0.62,1,26);
  for(let i=0;i<RN;i++){
    const m=new THREE.Mesh(rgeo,new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:0}));
    m.visible=false; scene.add(m); rings.push({m:m,t:0,ttl:.4,s:1});
  }
  function ring(p,color,size,ttl){
    const r=rings[rh]; rh=(rh+1)%RN;
    r.m.position.copy(p); r.m.material.color.set(color);
    r.m.visible=true; r.ttl=ttl||0.4; r.t=r.ttl; r.s=size||3; r.m.scale.set(0.2,0.2,0.2);
    return r;
  }
  function updRings(dt){
    for(let i=0;i<RN;i++){
      const r=rings[i]; if(r.t<=0) continue;
      r.t-=dt;
      if(r.t<=0){ r.m.visible=false; continue; }
      const f=1-r.t/r.ttl, s=0.2+f*r.s;
      r.m.scale.set(s,s,s);
      r.m.material.opacity=(1-f)*0.85;
      r.m.quaternion.copy(camera.quaternion);
    }
  }
  /* Smoke: soft dark puffs that rise, swell and thin out. Additive points
     can't be dark, so these are sprites blended over what is behind them. */
  const SN=140, puffs=[]; let sh=0;
  for(let i=0;i<SN;i++){
    const m=new THREE.Sprite(new THREE.SpriteMaterial({map:TEX.glow,color:0x2a2630,transparent:true,depthWrite:false,opacity:0,fog:false}));
    m.visible=false; scene.add(m); puffs.push({m,t:0,ttl:1,s0:1,s1:2,v:V3()});
  }
  function smoke(p,size,ttl,color,rise){
    const q=puffs[sh]; sh=(sh+1)%SN;
    q.m.position.copy(p); q.m.material.color.set(color||0x2a2630); q.m.visible=true;
    q.ttl=q.t=ttl||3; q.s0=size||2; q.s1=(size||2)*3; q.v.set(rand(-0.6,0.6),rise||3,rand(-0.6,0.6));
    q.m.material.rotation=rand(0,6.28);
  }
  function updSmoke(dt){
    for(const q of puffs){
      if(q.t<=0) continue;
      q.t-=dt;
      if(q.t<=0){ q.m.visible=false; continue; }
      const f=1-q.t/q.ttl;
      q.m.position.addScaledVector(q.v,dt);
      const s=q.s0+(q.s1-q.s0)*f; q.m.scale.set(s,s,1);
      q.m.material.opacity=Math.min(1,f*5)*(1-f*f)*0.9;
    }
  }
  function reset(){
    for(const q of puffs){ q.t=0; q.m.visible=false; }
    for(let i=0;i<N;i++){ life[i]=0; pos[i*3+1]=-9999; col[i*3]=col[i*3+1]=col[i*3+2]=0; }
    geo.attributes.position.needsUpdate=geo.attributes.color.needsUpdate=true;
    for(const t of tracers){ t.t=0; t.m.visible=false; }
    for(const r of rings){ r.t=0; r.m.visible=false; }
  }
  return {burst,tracer,ring,smoke,reset,update(dt){update(dt);updTracers(dt);updRings(dt);updSmoke(dt);}};
})();

function explode(p,color,scale){
  FX.burst(p,Math.round(26*(scale||1)),color,10*(scale||1),0.55,10);
  FX.burst(p,Math.round(12*(scale||1)),0xffffff,15*(scale||1),0.22,4);
  FX.ring(p,color,4*(scale||1),0.32);
  SFX.boom();
}

export {FX, explode};
