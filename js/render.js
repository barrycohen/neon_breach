import {THREE,$,store} from './util.js';

/* Renderer, scene, cameras, lights, post-processing chain and the draw call. */

const canvas=$('view');
const renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.setSize(innerWidth,innerHeight,false);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;

const FOG=0x060912;
const scene=new THREE.Scene();
scene.background=new THREE.Color(FOG);
// exponential gloom: near-clear at brawling range, heavy across the arena, so
// distant hostiles fade below the bloom threshold instead of glowing like beacons
const FOG_DENSITY=0.0165;
scene.fog=new THREE.FogExp2(FOG,FOG_DENSITY);

const BASE_FOV=82;
const camera=new THREE.PerspectiveCamera(BASE_FOV,innerWidth/innerHeight,0.04,900);
camera.rotation.order='YXZ';
scene.add(camera);

const hemi=new THREE.HemisphereLight(0x3d78b4,0x0a1018,0.42); scene.add(hemi);
const key=new THREE.DirectionalLight(0xbfe0ff,1.5); key.position.set(30,54,20); scene.add(key);
key.castShadow=true;
key.shadow.mapSize.set(2048,2048);
key.shadow.bias=-0.0005;
key.shadow.normalBias=0.04;
(function(sc){ sc.left=-76; sc.right=76; sc.top=76; sc.bottom=-76; sc.near=1; sc.far=220; })(key.shadow.camera);
const rim=new THREE.DirectionalLight(0xff3fa4,0.30); rim.position.set(-30,18,-26); scene.add(rim);
const muzzleLight=new THREE.PointLight(0x7ff6ff,0,14,2); muzzleLight.position.set(0.3,-0.15,-1.1); camera.add(muzzleLight);
// short-range fill so the view model never sinks into silhouette
const vmFill=new THREE.PointLight(0xbfe4ff,1.15,2.2,2); vmFill.position.set(0.45,0.28,0.25); camera.add(vmFill);

/* The weapon shares the world's depth buffer, so a wall closer than the barrel
   clips it. Put the view model on layer 1, keep it in the same scene (so it keeps
   world lighting, the env probe and bloom), and draw it in a second pass with the
   depth buffer cleared. */
const VM_LAYER=1;
const vmCam=new THREE.PerspectiveCamera(BASE_FOV,innerWidth/innerHeight,0.01,14);
vmCam.rotation.order='YXZ';
vmCam.layers.set(VM_LAYER);
// lights are gathered per camera, so they must answer to both layers
[hemi,key,rim,vmFill,muzzleLight].forEach(l=>l.layers.enable(VM_LAYER));
function syncVmCam(){
  vmCam.position.copy(camera.position);
  vmCam.quaternion.copy(camera.quaternion);
  if(vmCam.fov!==camera.fov||vmCam.aspect!==camera.aspect){
    vmCam.fov=camera.fov; vmCam.aspect=camera.aspect; vmCam.updateProjectionMatrix();
  }
}

let composer=null,bloomPass=null;
let BLOOM=store.get('nb_bloom','1')==='1';
let SHADOWS=store.get('nb_shadows','1')==='1';
const BLOOM_OK=!!(THREE.EffectComposer&&THREE.RenderPass&&THREE.UnrealBloomPass);
let MSAA=0;
if(BLOOM_OK){
  // antialias:true only covers the default framebuffer; the composer renders into
  // its own target, so it needs an explicitly multisampled one or edges stay jagged
  let rt=null;
  if(renderer.capabilities.isWebGL2&&THREE.WebGLMultisampleRenderTarget){
    const sz=new THREE.Vector2();
    renderer.getDrawingBufferSize(sz);
    rt=new THREE.WebGLMultisampleRenderTarget(sz.x,sz.y,{
      minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
      format:THREE.RGBAFormat,stencilBuffer:false});
    rt.samples=4;
    MSAA=4;
  }
  composer=new THREE.EffectComposer(renderer,rt);
  composer.addPass(new THREE.RenderPass(scene,camera));
  const vmPass=new THREE.Pass();
  vmPass.needsSwap=false;
  vmPass.render=function(r,writeBuffer,readBuffer){
    r.setRenderTarget(this.renderToScreen?null:readBuffer);
    drawViewModel(r);
  };
  composer.addPass(vmPass);
  bloomPass=new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),0.62,0.55,0.68);
  composer.addPass(bloomPass);
  composer.setSize(innerWidth,innerHeight);
}
// hidden while the camera is somewhere other than your eyes: the campaign's end
let VM_HIDDEN=false;
function setViewModelHidden(v){ VM_HIDDEN=!!v; }
/* Re-rendering the same scene would wipe the world: a Scene with a solid
   background makes WebGLBackground force a colour clear, which ignores
   autoClear. Drop the background for the weapon pass and clear depth only. */
function drawViewModel(r){
  if(VM_HIDDEN) return;
  const prevAutoClear=r.autoClear, prevBg=scene.background, prevShadow=r.shadowMap.autoUpdate;
  r.autoClear=false;
  scene.background=null;
  r.shadowMap.autoUpdate=false;   // the world pass already built it this frame
  r.clearDepth();
  r.render(scene,vmCam);
  scene.background=prevBg;
  r.autoClear=prevAutoClear;
  r.shadowMap.autoUpdate=prevShadow;
}
function setBloomFlag(v){ BLOOM=!!v&&BLOOM_OK; }
function setShadowFlag(v){ SHADOWS=!!v; }
function draw(){
  syncVmCam();
  if(BLOOM&&composer){ composer.render(); return; }
  renderer.render(scene,camera);
  drawViewModel(renderer);
}
addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight,false);
  vmCam.aspect=innerWidth/innerHeight; vmCam.updateProjectionMatrix();
  if(composer) composer.setSize(innerWidth,innerHeight);
});

export {setBloomFlag, setShadowFlag, canvas, renderer, FOG, scene, FOG_DENSITY, BASE_FOV, camera, hemi, key, rim, muzzleLight, vmFill, VM_LAYER, vmCam, syncVmCam, composer, bloomPass, BLOOM, SHADOWS, BLOOM_OK, MSAA, drawViewModel, draw, setViewModelHidden};
