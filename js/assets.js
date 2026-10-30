import {THREE} from './util.js';
import {TEX,ENV} from './textures.js';
import {GUN_BUILD,enemyModel} from './models.js';

/* External glTF assets - loading, export, and fitting models to gameplay hitboxes. */

// give loaded glTF materials the same surface treatment, unless they brought their own
function dressMaterial(m){
  if(!m||m.isMeshBasicMaterial) return;
  if(!m.map) m.map=TEX.hullA;
  if(!m.normalMap){ m.normalMap=TEX.hullN; if(m.normalScale) m.normalScale.set(0.8,0.8); }
  if(!m.roughnessMap) m.roughnessMap=TEX.hullR;
  if(!m.envMap){ m.envMap=ENV; m.envMapIntensity=1.05; }
  m.needsUpdate=true;
}

const MODEL_FILES={
  drone:'assets/drone.glb',
  rusher:'assets/rusher.glb',
  sentinel:'assets/sentinel.glb',
  warden:'assets/warden.glb'
};
const GUN_FILES={
  pulse:'assets/pulse.glb',
  scatter:'assets/scatter.glb',
  rail:'assets/rail.glb'
};
const GUN_NAMES=['pulse','scatter','rail','tether','arc','sunder'];
const LOADED={}, LOADED_GUN={};


// scale any object - built-in or authored in Blender - onto the gameplay hitbox
function fitObject(obj,targetRadius,recenter){
  obj.scale.setScalar(1); obj.position.set(0,0,0);
  obj.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(obj);
  if(box.isEmpty()) return 1;
  const sph=box.getBoundingSphere(new THREE.Sphere());
  const s=targetRadius/(sph.radius||1);
  obj.scale.setScalar(s);
  if(recenter!==false) obj.position.set(-sph.center.x*s,-sph.center.y*s,-sph.center.z*s);
  return s;
}

function loadAssets(done){
  let settled=false;
  const report=done;                                          // keep the real callback separate
  const once=(n,r)=>{ if(settled) return; settled=true; report(n,r); };
  setTimeout(()=>once(0,'BUILT-IN MODELS'),6000);              // never strand the player on a hung fetch
  if(!THREE.GLTFLoader){ once(0,'BUILT-IN MODELS'); return; }
  const jobs=[];
  for(const n in MODEL_FILES) jobs.push({n:n,url:MODEL_FILES[n],into:LOADED});
  for(const n in GUN_FILES) jobs.push({n:n,url:GUN_FILES[n],into:LOADED_GUN});
  let left=jobs.length, ok=0;
  if(!left){ once(0,'BUILT-IN MODELS'); return; }
  const loader=new THREE.GLTFLoader();
  const finish=()=>{
    if(--left>0) return;
    once(ok,ok?(ok+'/'+jobs.length+' EXTERNAL MODELS'):'BUILT-IN MODELS');
  };
  jobs.forEach(j=>{
    try{
      loader.load(j.url,g=>{ j.into[j.n]=g.scene; ok++; finish(); },undefined,()=>finish());
    }catch(err){ finish(); }
  });
}

// round-trip the built-ins out to .glb so they can be edited in Blender and dropped back in
function exportGLB(name){
  return new Promise((resolve,reject)=>{
    if(!THREE.GLTFExporter){ reject(new Error('GLTFExporter not loaded (open with #debug)')); return; }
    const gi=['pulse','scatter','rail'].indexOf(name);
    const M=gi>=0?GUN_BUILD[gi]():enemyModel(name);
    const grp=new THREE.Group();
    if(M.hull) grp.add(new THREE.Mesh(M.hull,new THREE.MeshStandardMaterial({
      vertexColors:true,metalness:0.52,roughness:0.44,name:'hull'})));
    if(M.glow) grp.add(new THREE.Mesh(M.glow,new THREE.MeshBasicMaterial({
      vertexColors:true,name:'emissive'})));   // unlit: matches the in-engine glow pass
    grp.name=name;
    new THREE.GLTFExporter().parse(grp,buf=>{
      const bytes=new Uint8Array(buf);
      let bin='';
      for(let i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]);
      resolve(btoa(bin));
    },{binary:true});
  });
}
function downloadGLB(name){
  exportGLB(name).then(b64=>{
    const bytes=atob(b64), arr=new Uint8Array(bytes.length);
    for(let i=0;i<bytes.length;i++) arr[i]=bytes.charCodeAt(i);
    const url=URL.createObjectURL(new Blob([arr],{type:'model/gltf-binary'}));
    const a=document.createElement('a');
    a.href=url; a.download=name+'.glb'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  }).catch(e=>console.warn(e.message));
}

export {dressMaterial, MODEL_FILES, GUN_FILES, GUN_NAMES, LOADED, LOADED_GUN, fitObject, loadAssets, exportGLB, downloadGLB};
