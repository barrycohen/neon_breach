/* Neon Breach - entry point: wires the modules together and drives the frame loop. */
import {DEV,devFlag,THREE,$,clamp,lerp,rand,store} from './util.js';
import {game,marks,enemies,bullets,pickups,anchors} from './state.js';
import {renderer,scene,camera,vmCam,draw,BASE_FOV,BLOOM,BLOOM_OK,SHADOWS} from './render.js';
import {MAT} from './textures.js';
import {mergeGeos} from './kit.js';
import {GUN_BUILD,enemyModel} from './models.js';
import {MODEL_FILES,GUN_FILES,LOADED,LOADED_GUN,loadAssets,fitObject,exportGLB,downloadGLB} from './assets.js';
import {colliders,buildArena,clearWorld,rayWorld, hasGroundAt} from './world.js';
import {level,loadLevel,unloadLevel,updateLevel,updateRespawn,clearEntities,respawn, runActions, setCheckpoint} from './level.js';
import {updateEnding} from './ending.js';
import {conduits,pylons,breaches} from './state.js';
import {initCampaign,openCampaign,startLevel,CAMPAIGN,progress} from './campaign.js';
import {FX} from './fx.js';
import {SFX} from './audio.js';
import {player,updatePlayer,viewFromPlayer,damagePlayer,setGrapple,releaseGrapple} from './player.js';
import {WEAPONS,curW,updateWeapon,fire,forceShot,selectWeapon,buildViewModels,vms,rangeScale,hasWeapon,owned,setLoadout,fireTether,TETHER_RANGE} from './weapons.js';
import {makeEnemy,killEnemy,damageEnemy,updateEnemies,updateBullets,visualRadius, enemyShoot,weaverOver} from './enemies.js';
import {dropPickup,pickupModel,updatePickups} from './pickups.js';
import {startWave,updateWaves,updateMarks,waveComp} from './endless.js';
import {hud} from './hud.js';
import {show,beginRun,enterPlay,setSens,setInvert,setBloom,setShadows,setFps,rebuildBinds,SENS,INVERT,SHOWFPS,BINDS,keys} from './ui.js';
import {initDevTools} from './devtools.js';

/* World selection. Endless mode builds the arena; #level=<id> loads a level
   directly instead (the campaign screen loads them the same way). */
const levelParam=DEV?/[#&]level=([\w-]+)/.exec(location.hash):null;
if(levelParam){
  // #level=<id> jumps straight into any level, campaign progress ignored. The
  // single-file build has its levels embedded; a served tree fetches them.
  const id=levelParam[1];
  const embedded=(typeof EMBEDDED_LEVELS!=='undefined')?EMBEDDED_LEVELS[id]:null;
  (embedded ? Promise.resolve(embedded)
            : fetch('levels/'+id+'.json')
                .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }))
    .then(def=>{ loadLevel(def); enterPlay(); })
    .catch(err=>{
      // say so on screen: a silent fall back to the arena looks like the level
      // loaded and then behaved oddly
      console.error('level load failed:',err.message);
      buildArena();
      hud.banner('LEVEL NOT FOUND',String(id),true);
    });
}else{
  buildArena();
}

let last=performance.now();
let fpsAcc=0,fpsN=0;
function frame(t){
  requestAnimationFrame(frame);
  const raw=(t-last)/1000; last=t;
  let dt=raw;
  if(dt>0.05) dt=0.05;
  if(SHOWFPS&&raw>0){
    fpsAcc+=raw; fpsN++;
    if(fpsAcc>=0.35){
      const f=fpsN/fpsAcc;
      $('fpsval').textContent=Math.round(f);
      $('fpsms').textContent='\u00b7 '+(fpsAcc/fpsN*1000).toFixed(1)+' ms';
      // where you are standing, so a report of "it flickers here" has coordinates
      $('fpspos').textContent=' \u00b7 '+player.pos.x.toFixed(1)+', '
        +player.pos.y.toFixed(1)+', '+player.pos.z.toFixed(1);
      const el=$('pFps');
      el.classList.toggle('warn',f<50&&f>=30);
      el.classList.toggle('bad',f<30);
      fpsAcc=0; fpsN=0;
    }
  }

  if(game.state==='play'){
    game.time+=dt;
    if(game.comboT>0){
      game.comboT-=dt;
      if(game.comboT<=0) game.combo=1;
    }
    updatePlayer(dt);
    updateWeapon(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updatePickups(dt);
    updateMarks(dt);
    if(level.loaded) updateLevel(dt); else updateWaves(dt);
    viewFromPlayer(0);              // after the platforms have carried you
    hud.update(dt);
    FX.update(dt);
    SFX.setIntensity(clamp(0.15+game.alive*0.09+game.wave*0.03,0,1));
  }else{
    // idle drift so menus still feel alive
    if(game.state==='respawn') updateRespawn(dt);
    // the campaign's end: the level goes on round the camera, you stand still
    if(game.state==='ending'){ game.time+=dt; updateLevel(dt); updateEnding(dt); }
    hud.update(dt);
    if(game.state==='menu'){
      const a=t*0.00006;
      camera.position.set(Math.cos(a)*34,9+Math.sin(a*2)*2,Math.sin(a)*34);
      camera.lookAt(0,4,0);
      camera.fov=BASE_FOV; camera.updateProjectionMatrix();
    }
    FX.update(dt);
    if(game.state==='dead'){
      updateBullets(dt); updateEnemies(dt);
      player.shake=Math.max(0,player.shake-dt*0.9);
      camera.position.set(
        player.pos.x+rand(-player.shake,player.shake)*0.4,
        lerp(camera.position.y,player.pos.y+0.65,dt*2),
        player.pos.z+rand(-player.shake,player.shake)*0.4);
      camera.rotation.z=lerp(camera.rotation.z,0.42,dt*1.6);
    }
  }
  draw();
}

/* boot */
initCampaign();
setSens(SENS);
setInvert(INVERT);
setBloom(BLOOM);
setShadows(SHADOWS);
setFps(SHOWFPS);
rebuildBinds();
if(!BLOOM_OK){ $('bloomRow').classList.add('hidden'); $('bloomRow2').classList.add('hidden'); }
$('best').textContent=(parseInt(store.get('nb_best','0'),10)||0).toLocaleString();
if(matchMedia&&matchMedia('(pointer:coarse)').matches){
  $('menu').querySelector('.mfoot').innerHTML='KEYBOARD + MOUSE REQUIRED &middot; DESKTOP ONLY';
}
$('startBtn').disabled=true;
$('startBtn').textContent='LOADING';
loadAssets((n,report)=>{
  if(n) buildViewModels();      // swap in any gun models that loaded
  $('startBtn').disabled=false;
  $('startBtn').textContent='ENDLESS ARENA';
  $('assetNote').textContent=report;
});

if(devFlag(/debug/)){
  const ex=document.createElement('script');
  ex.src='vendor/three/GLTFExporter.js';
  document.head.appendChild(ex);
  window.__nb={game,player,enemies,bullets,pickups,marks,WEAPONS,colliders,
    beginRun,startWave,makeEnemy,killEnemy,enemyShoot,updateEnemies,updateBullets,damagePlayer,fire,selectWeapon,hud,FX,SFX,
    exportGLB,downloadGLB,LOADED,LOADED_GUN,MODEL_FILES,GUN_FILES,enemyModel,GUN_BUILD,
    fitObject,loadAssets,buildViewModels,vms:()=>vms,renderer,scene,camera,colliders,BINDS,mergeGeos,
    dropPickup,pickupModel,pickups,visualRadius,vmCamAspect:()=>vmCam.aspect.toFixed(3),
    rangeScale,forceShot:()=>forceShot(),MAT,hasGroundAt,
    level,loadLevel,unloadLevel,updateLevel,runActions,respawn,clearEntities,clearWorld,buildArena,
    CAMPAIGN,progress,openCampaign,startLevel,damageEnemy,hasWeapon,owned,setLoadout,
    waveCompTest:w=>waveComp(w),
    updatePlayer,viewFromPlayer,keys,curWTest:()=>curW,updateWeaponTest:dt=>updateWeapon(dt),setGrapple,releaseGrapple,anchors,fireTether,TETHER_RANGE,weaverOver,
    conduitsList:()=>conduits, breachList:()=>breaches, pylons, setCheckpointForTest:i=>setCheckpoint(i),
    vmsMuzzleZ:i=>vms[i]&&vms[i].userData.muzzle.position.z,
    rayWorldTest:(o,d,pierce)=>rayWorld(new THREE.Vector3(o.x,o.y,o.z),new THREE.Vector3(d.x,d.y,d.z),300,pierce)};
}
show('loading',false);
requestAnimationFrame(frame);

initDevTools();   // stripped from the built game by build.py
