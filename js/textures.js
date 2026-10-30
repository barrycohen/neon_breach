import {THREE,clamp,rand,rint} from './util.js';
import {renderer,scene} from './render.js';

/* Procedurally drawn textures, PBR detail maps and the environment probe. */

function cnv(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function tex(c,rx,ry){
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(rx||1,ry||1);
  t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  return t;
}
function floorTex(){
  const s=512,c=cnv(s,s),x=c.getContext('2d');
  x.fillStyle='#0a1220'; x.fillRect(0,0,s,s);
  x.strokeStyle='rgba(64,168,214,.55)'; x.lineWidth=2;
  for(let i=0;i<=4;i++){const p=i*s/4;
    x.beginPath();x.moveTo(p,0);x.lineTo(p,s);x.moveTo(0,p);x.lineTo(s,p);x.stroke();}
  x.shadowColor='rgba(93,240,255,.9)'; x.shadowBlur=9;
  x.strokeStyle='rgba(150,250,255,.95)'; x.lineWidth=4;
  x.strokeRect(2,2,s-4,s-4);
  x.shadowBlur=0;
  x.fillStyle='rgba(93,240,255,.13)';
  for(let i=0;i<26;i++){const w=rand(8,44),h=rand(3,9);x.fillRect(rand(0,s-w),rand(0,s-h),w,h);}
  return tex(c,1,1);
}
function panelTex(tint){
  const s=256,c=cnv(s,s),x=c.getContext('2d');
  x.fillStyle='#151f31'; x.fillRect(0,0,s,s);
  x.fillStyle='#1e2c42';
  for(let i=0;i<s;i+=64) for(let j=0;j<s;j+=32) x.fillRect(i+2,j+2,60,28);
  x.strokeStyle=tint||'rgba(90,190,240,.4)'; x.lineWidth=1;
  for(let i=0;i<s;i+=32){x.beginPath();x.moveTo(0,i+.5);x.lineTo(s,i+.5);x.stroke();}
  x.fillStyle='rgba(93,240,255,.30)';
  for(let i=0;i<18;i++) x.fillRect(rand(0,s),rand(0,s),rand(2,10),2);
  return tex(c,1,1);
}
function glowTex(){
  const s=128,c=cnv(s,s),x=c.getContext('2d');
  const g=x.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g.addColorStop(0,'rgba(255,255,255,1)');
  g.addColorStop(.25,'rgba(255,255,255,.55)');
  g.addColorStop(.6,'rgba(255,255,255,.12)');
  g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g; x.fillRect(0,0,s,s);
  return new THREE.CanvasTexture(c);
}
function towerTex(){
  const w=64,h=256,c=cnv(w,h),x=c.getContext('2d');
  x.fillStyle='#05070f'; x.fillRect(0,0,w,h);
  for(let j=6;j<h-6;j+=9) for(let i=5;i<w-5;i+=9){
    if(Math.random()<0.34){
      x.fillStyle=Math.random()<0.7?'rgba(93,240,255,.55)':'rgba(255,63,164,.5)';
      x.fillRect(i,j,4,4);
    }
  }
  return tex(c,1,1);
}
const TEX={floor:floorTex(),panel:panelTex(),glow:glowTex(),tower:towerTex()};

const MAT={
  floor:new THREE.MeshStandardMaterial({map:TEX.floor,color:0xa8cfe4,metalness:0.14,roughness:0.46,envMapIntensity:0.42,
    emissive:0xffffff,emissiveMap:TEX.floor,emissiveIntensity:0.22}),
  wall:new THREE.MeshStandardMaterial({map:TEX.panel,color:0x8aa4c0,metalness:0.22,roughness:0.62,
    emissive:0xffffff,emissiveMap:TEX.panel,emissiveIntensity:0.20}),
  block:new THREE.MeshStandardMaterial({map:TEX.panel,color:0x9ab1cd,metalness:0.26,roughness:0.54,
    emissive:0xffffff,emissiveMap:TEX.panel,emissiveIntensity:0.22}),
  dark:new THREE.MeshLambertMaterial({color:0x141c2c}),
  neonC:new THREE.MeshBasicMaterial({color:0x5df0ff}),
  neonM:new THREE.MeshBasicMaterial({color:0xff3fa4}),
  neonA:new THREE.MeshBasicMaterial({color:0xffc24d}),
  tower:new THREE.MeshBasicMaterial({map:TEX.tower,color:0xffffff})
};
function sprite(color,size,op){
  const m=new THREE.SpriteMaterial({map:TEX.glow,color:color,blending:THREE.AdditiveBlending,
    depthWrite:false,transparent:true,opacity:op===undefined?0.9:op});
  const s=new THREE.Sprite(m); s.scale.set(size,size,1); return s;
}

function hullHeight(){
  const s=256,c=cnv(s,s),x=c.getContext('2d');
  x.fillStyle='#808080'; x.fillRect(0,0,s,s);
  // fine machining lines
  for(let y=0;y<s;y+=3){
    const v=128+rint(-9,9);
    x.fillStyle='rgb('+v+','+v+','+v+')';
    x.fillRect(0,y,s,1);
  }
  // recessed panels with a raised inner lip
  for(let i=0;i<16;i++){
    const w=rand(34,112),h=rand(26,84),px=rand(0,s-w),py=rand(0,s-h);
    const v=134+rint(-16,16);
    x.fillStyle='rgb('+v+','+v+','+v+')'; x.fillRect(px,py,w,h);
    x.strokeStyle='rgb(78,78,78)'; x.lineWidth=2.5; x.strokeRect(px,py,w,h);
    x.strokeStyle='rgb(180,180,180)'; x.lineWidth=1; x.strokeRect(px+2,py+2,w-4,h-4);
  }
  // knurled grip patches
  for(let i=0;i<3;i++){
    const px=rand(0,s-60),py=rand(0,s-60),w=rand(34,58),h=rand(30,54);
    for(let a=0;a<w;a+=4) for(let b=0;b<h;b+=4){
      x.fillStyle=((a+b)/4)%2?'rgb(168,168,168)':'rgb(96,96,96)';
      x.fillRect(px+a,py+b,3,3);
    }
  }
  // screws
  for(let i=0;i<30;i++){
    const px=rand(6,s-6),py=rand(6,s-6),r=rand(2.2,3.6);
    x.beginPath(); x.arc(px,py,r,0,6.283); x.fillStyle='rgb(92,92,92)'; x.fill();
    x.beginPath(); x.arc(px,py,r*0.5,0,6.283); x.fillStyle='rgb(190,190,190)'; x.fill();
  }
  // vents and wear scratches
  x.fillStyle='rgb(88,88,88)';
  for(let i=0;i<22;i++) x.fillRect(rand(0,s),rand(0,s),rand(12,44),2);
  x.strokeStyle='rgba(205,205,205,.55)'; x.lineWidth=1;
  for(let i=0;i<26;i++){
    const px=rand(0,s),py=rand(0,s);
    x.beginPath(); x.moveTo(px,py); x.lineTo(px+rand(-26,26),py+rand(-9,9)); x.stroke();
  }
  return c;
}
// albedo derived from the same height field, so wear lines up with relief
function albedoFromHeight(hc){
  const s=hc.width, img=hc.getContext('2d').getImageData(0,0,s,s), d=img.data;
  for(let i=0;i<d.length;i+=4){
    const h=(d[i]-128)/127;
    const v=clamp(214+h*46,120,255);
    d[i]=v*0.97; d[i+1]=v*0.99; d[i+2]=v;   // faint cool tint
  }
  const o=cnv(s,s); o.getContext('2d').putImageData(img,0,0);
  return o;
}
function normalFromHeight(hc,strength){
  const s=hc.width, ctx=hc.getContext('2d');
  const src=ctx.getImageData(0,0,s,s).data;
  const dst=ctx.createImageData(s,s), d=dst.data;
  const H=(x,y)=>src[((((y%s)+s)%s)*s+(((x%s)+s)%s))*4]/255;
  for(let y=0;y<s;y++) for(let x=0;x<s;x++){
    const nx=-(H(x+1,y)-H(x-1,y))*strength;
    const ny=-(H(x,y+1)-H(x,y-1))*strength;
    const l=Math.hypot(nx,ny,1), i=(y*s+x)*4;
    d[i]=(nx/l*0.5+0.5)*255; d[i+1]=(ny/l*0.5+0.5)*255; d[i+2]=(1/l*0.5+0.5)*255; d[i+3]=255;
  }
  const o=cnv(s,s); o.getContext('2d').putImageData(dst,0,0);
  return o;
}
function roughFromHeight(hc){
  const s=hc.width, src=hc.getContext('2d').getImageData(0,0,s,s);
  const d=src.data;
  for(let i=0;i<d.length;i+=4){
    const v=255-d[i];
    const r=clamp(88+v*0.55,0,255);
    d[i]=d[i+1]=d[i+2]=r;
  }
  const o=cnv(s,s); o.getContext('2d').putImageData(src,0,0);
  return o;
}
const _hh=hullHeight();
TEX.hullN=tex(normalFromHeight(_hh,2.4),1,1);
TEX.hullR=tex(roughFromHeight(_hh),1,1);
TEX.hullA=tex(albedoFromHeight(_hh),1,1);
const _wh=hullHeight();
TEX.wallN=tex(normalFromHeight(_wh,1.8),2,2);
TEX.wallR=tex(roughFromHeight(_wh),2,2);

/* --- environment: a tiny neon skybox, PMREM-filtered for real specular --- */
function envMapTex(){
  const faces=[];
  for(let i=0;i<6;i++){
    const s=128,c=cnv(s,s),x=c.getContext('2d');
    if(i===2){ x.fillStyle='#16294a'; x.fillRect(0,0,s,s); }
    else if(i===3){ x.fillStyle='#05070f'; x.fillRect(0,0,s,s); }
    else{
      const g=x.createLinearGradient(0,0,0,s);
      g.addColorStop(0,'#12213f'); g.addColorStop(0.44,'#276b96');
      g.addColorStop(0.52,'#6fe0f5'); g.addColorStop(0.60,'#152233'); g.addColorStop(1,'#070c16');
      x.fillStyle=g; x.fillRect(0,0,s,s);
      x.fillStyle='rgba(255,63,164,.34)'; x.fillRect(0,Math.round(s*0.40),s,3);
      x.fillStyle='rgba(93,240,255,.32)'; x.fillRect(0,Math.round(s*0.62),s,2);
    }
    faces.push(c);
  }
  const ct=new THREE.CubeTexture(faces);
  ct.needsUpdate=true;
  try{
    const pm=new THREE.PMREMGenerator(renderer);
    const t=pm.fromCubemap(ct).texture;
    pm.dispose();
    return t;
  }catch(e){ return ct; }
}
const ENV=envMapTex();

/* The boss frame. Deep red metal rather than flat paint: it takes the neon
   around it as specular, so the frame reads as a machined object catching the
   room's light instead of a coloured strip laid on the wall. Defined here
   rather than in MAT above because it needs the detail maps and the probe,
   which are built after it. */
MAT.portal=new THREE.MeshStandardMaterial({
  color:0xb51328, metalness:0.78, roughness:0.19,
  normalMap:TEX.wallN, roughnessMap:TEX.wallR,
  envMap:ENV, envMapIntensity:1.7,
  emissive:0x6b0f1c, emissiveIntensity:0.95});
scene.environment=ENV;

export {cnv, tex, floorTex, panelTex, glowTex, towerTex, TEX, MAT, sprite, hullHeight, albedoFromHeight, normalFromHeight, roughFromHeight, _hh, _wh, envMapTex, ENV};
