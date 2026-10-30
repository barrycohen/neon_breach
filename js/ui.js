import {$,V3,clamp,store} from './util.js';
import {game,marks,enemies,bullets,pickups} from './state.js';
import {canvas,renderer,scene,BLOOM,BLOOM_OK,SHADOWS,setBloomFlag,setShadowFlag} from './render.js';
import {player} from './player.js';
import {WEAPONS,selectWeapon,cycleWeapon,startReload,resetWeapons,setFiring} from './weapons.js';
import {disposeEnemy,killBullet} from './enemies.js';
import {startWave} from './endless.js';
import {SFX} from './audio.js';
import {FX,explode} from './fx.js';
import {hud} from './hud.js';
import {level,spawnPlayer,respawn,unloadLevel} from './level.js';
import {buildArena} from './world.js';

/* Input, key bindings, menus and flow control. */

const keys={};
let freeAim=false, mouseX=innerWidth*0.5, mouseY=innerHeight*0.5;
function enableFreeAim(){
  if(freeAim) return;
  freeAim=true;
  mouseX=innerWidth*0.5; mouseY=innerHeight*0.5;   // neutral until the cursor actually moves
  $('aimhint').classList.remove('hidden');
  setTimeout(()=>$('aimhint').classList.add('hidden'),9000);
}
/* --- rebindable controls --- */
const ACTIONS=[
  {id:'forward',label:'MOVE FORWARD'},{id:'back',label:'MOVE BACK'},
  {id:'left',label:'STRAFE LEFT'},{id:'right',label:'STRAFE RIGHT'},
  {id:'jump',label:'JUMP / DOUBLE'},{id:'dash',label:'DASH THRUSTER'},
  {id:'reload',label:'RELOAD'},{id:'cycle',label:'NEXT WEAPON'},
  ...WEAPONS.map((w,i)=>({id:'weapon'+(i+1),label:'WEAPON '+(i+1)+'  '+w.name})),
  {id:'invert',label:'INVERT MOUSE Y'},{id:'mute',label:'MUTE'},{id:'fps',label:'FPS COUNTER'}
];
const PRESETS={
  WASD:{forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',jump:'Space',dash:'ShiftLeft',
        reload:'KeyR',cycle:'KeyQ',
        invert:'KeyI',mute:'KeyM',fps:'F3'},
  ESDF:{forward:'KeyE',back:'KeyD',left:'KeyS',right:'KeyF',jump:'Space',dash:'KeyA',
        reload:'KeyR',cycle:'KeyW',
        invert:'KeyI',mute:'KeyM',fps:'F3'}
};
// Digit1..N, one per weapon, added to both presets
for(const P of Object.values(PRESETS))
  WEAPONS.forEach((w,i)=>{ P['weapon'+(i+1)]='Digit'+(i+1); });
let BINDS=Object.assign({},PRESETS.WASD);
let ACTION_OF={};
(function(){
  try{
    const raw=store.get('nb_binds','');
    if(raw){
      const o=JSON.parse(raw);
      for(const a of ACTIONS) if(typeof o[a.id]==='string') BINDS[a.id]=o[a.id];
    }
  }catch(e){}
})();
function keyLabel(code){
  if(!code) return '--';
  if(code==='Space') return 'SPACE';
  if(code.indexOf('Key')===0) return code.slice(3);
  if(code.indexOf('Digit')===0) return code.slice(5);
  if(code.indexOf('Numpad')===0) return 'NUM '+code.slice(6);
  if(code.indexOf('Arrow')===0) return code.slice(5).toUpperCase();
  // ShiftLeft reads better as SHIFT than as SHIFT L; only mark the right-hand
  // one, which is the unusual choice
  if(/^(Shift|Control|Alt|Meta)Left$/.test(code)) return code.replace('Left','').replace('Control','CTRL').toUpperCase();
  if(/^(Shift|Control|Alt|Meta)Right$/.test(code)) return 'R '+code.replace('Right','').replace('Control','CTRL').toUpperCase();
  return code.replace('Left',' L').replace('Right',' R').toUpperCase();
}
function rebuildBinds(){
  ACTION_OF={};
  for(const a of ACTIONS){ const c=BINDS[a.id]; if(c) ACTION_OF[c]=a.id; }
  // briefings ask for the key by action, so rebinding changes what they say
  hud.keyName=id=>BINDS[id]?keyLabel(BINDS[id]):null;
  store.set('nb_binds',JSON.stringify(BINDS));
  renderBindUI();
}
function presetName(){
  for(const n in PRESETS){
    let same=true;
    for(const a of ACTIONS) if(PRESETS[n][a.id]!==BINDS[a.id]){ same=false; break; }
    if(same) return n;
  }
  return 'CUSTOM';
}
function applyPreset(n){
  if(!PRESETS[n]) return;
  for(const a of ACTIONS) BINDS[a.id]=PRESETS[n][a.id];
  rebuildBinds();
}
let listenFor=null;
function renderBindUI(){
  const grid=$('bindGrid');
  if(grid){
    let h='';
    for(const a of ACTIONS)
      h+='<div class="bindRow"><span>'+a.label+'</span>'+
         '<button data-act="'+a.id+'">'+keyLabel(BINDS[a.id])+'</button></div>';
    grid.innerHTML=h;
    const used={};
    for(const a of ACTIONS){ const c=BINDS[a.id]; used[c]=(used[c]||0)+1; }
    grid.querySelectorAll('button').forEach(b=>{
      if(used[BINDS[b.dataset.act]]>1) b.classList.add('dupe');
      b.addEventListener('click',()=>{
        listenFor=b.dataset.act;
        grid.querySelectorAll('button').forEach(x=>x.classList.remove('listening'));
        b.classList.add('listening'); b.textContent='PRESS KEY';
        $('bindWarn').textContent='';
      });
    });
    let dupe=false;
    for(const c in used) if(used[c]>1) dupe=true;
    $('bindWarn').textContent=dupe?'TWO ACTIONS SHARE A KEY':'';
  }
  const sum=$('ctrlSummary');
  if(sum){
    const rows=[
      [keyLabel(BINDS.forward)+keyLabel(BINDS.left)+keyLabel(BINDS.back)+keyLabel(BINDS.right),'MOVE'],
      [keyLabel(BINDS.jump),'JUMP / DOUBLE JUMP'],
      [keyLabel(BINDS.dash),'DASH THRUSTER'],
      ['MOUSE','AIM &middot; LMB FIRE'],
      ['1 2 3 / WHEEL','WEAPON'],
      [keyLabel(BINDS.reload),'RELOAD'],
      ['ESC','PAUSE'],
      [keyLabel(BINDS.mute),'MUTE'],
      [presetName(),'LAYOUT']
    ];
    sum.innerHTML=rows.map(r=>'<div><k>'+r[0]+'</k><v>'+r[1]+'</v></div>').join('');
  }
}
let controlsFrom='menu';
function openControls(from){
  controlsFrom=from; listenFor=null;
  show(from,false); show('controls',true); renderBindUI();
}
function closeControls(){
  listenFor=null;
  show('controls',false); show(controlsFrom,true);
}

let SENS=parseFloat(store.get('nb_sens','1'))||1;
let INVERT=store.get('nb_invert','0')==='1';
function setBloom(v){
  setBloomFlag(v);
  const BLOOM=!!v&&BLOOM_OK;
  store.set('nb_bloom',BLOOM?'1':'0');
  $('bloom').checked=$('bloom2').checked=BLOOM;
  $('bloomv').textContent=$('bloomv2').textContent=BLOOM?'ON':'OFF';
}
let SHOWFPS=store.get('nb_fps','0')==='1';
function setFps(v){
  SHOWFPS=!!v;
  store.set('nb_fps',SHOWFPS?'1':'0');
  $('fpsc').checked=$('fpsc2').checked=SHOWFPS;
  $('fpsv').textContent=$('fpsv2').textContent=SHOWFPS?'ON':'OFF';
  $('pFps').classList.toggle('hidden',!SHOWFPS);
}
function setShadows(v){
  setShadowFlag(v);
  const SHADOWS=!!v;
  store.set('nb_shadows',SHADOWS?'1':'0');
  $('shad').checked=$('shad2').checked=SHADOWS;
  $('shadv').textContent=$('shadv2').textContent=SHADOWS?'ON':'OFF';
  if(renderer.shadowMap.enabled!==SHADOWS){
    renderer.shadowMap.enabled=SHADOWS;
    // toggling shadow maps changes the shader defines, so programs must rebuild
    scene.traverse(o=>{
      if(!o.material) return;
      const list=Array.isArray(o.material)?o.material:[o.material];
      for(let i=0;i<list.length;i++) list[i].needsUpdate=true;
    });
  }
}
function setInvert(v){
  INVERT=!!v;
  store.set('nb_invert',INVERT?'1':'0');
  $('invert').checked=$('invert2').checked=INVERT;
  $('invertv').textContent=$('invertv2').textContent=INVERT?'ON':'OFF';
}
function setSens(v){
  SENS=clamp(v,0.2,3.2);
  store.set('nb_sens',SENS);
  $('sens').value=Math.round(SENS*100); $('sens2').value=Math.round(SENS*100);
  $('sensv').textContent=SENS.toFixed(2); $('sensv2').textContent=SENS.toFixed(2);
}
$('sens').addEventListener('input',e=>setSens(e.target.value/100));
$('sens2').addEventListener('input',e=>setSens(e.target.value/100));
$('invert').addEventListener('change',e=>setInvert(e.target.checked));
$('invert2').addEventListener('change',e=>setInvert(e.target.checked));
$('bloom').addEventListener('change',e=>setBloom(e.target.checked));
$('bloom2').addEventListener('change',e=>setBloom(e.target.checked));
$('shad').addEventListener('change',e=>setShadows(e.target.checked));
$('shad2').addEventListener('change',e=>setShadows(e.target.checked));
$('fpsc').addEventListener('change',e=>setFps(e.target.checked));
$('fpsc2').addEventListener('change',e=>setFps(e.target.checked));
$('ctrlBtn').addEventListener('click',()=>openControls('menu'));
$('ctrlBtn2').addEventListener('click',()=>openControls('pause'));
$('ctrlBack').addEventListener('click',closeControls);
document.querySelectorAll('[data-preset]').forEach(b=>
  b.addEventListener('click',()=>applyPreset(b.dataset.preset)));

addEventListener('keydown',e=>{
  if(game.state==='brief'){
    // A held key auto-repeats, and a repeat must not dismiss a briefing that
    // popped up while you were walking. Only a fresh press counts.
    if(e.repeat&&e.code!=='Escape'){ e.preventDefault(); return; }
    // The press that dismisses it is still a held key, so holding forward to
    // clear a briefing walks you on when it goes. Only the held state - it does
    // not also jump, dash or change weapon.
    if(e.code!=='Escape') keys[e.code]=true;
    // Escape always works, so a briefing can never trap the player
    if(hud.endBrief(e.code==='Escape')) lock();
    e.preventDefault();
    return;
  }
  // rebinding captures the next key press
  if(listenFor){
    e.preventDefault();
    if(e.code!=='Escape'){ BINDS[listenFor]=e.code; }
    listenFor=null; rebuildBinds();
    return;
  }
  const act=ACTION_OF[e.code];
  if(e.repeat){ if(act!=='jump') return; }
  keys[e.code]=true;
  if(act==='jump'){ keys._jump=true; e.preventDefault(); }
  if(act==='dash') keys._dash=true;
  if(act==='reload'){ if(game.state==='dead') restart(); else startReload(); }
  if(act&&act.indexOf('weapon')===0){   // act is undefined for unbound keys
    const n=parseInt(act.slice(6),10);
    if(n>=1&&n<=WEAPONS.length) selectWeapon(n-1);
  }
  if(act==='cycle') cycleWeapon(1);
  if(act==='fps'){ setFps(!SHOWFPS); e.preventDefault(); }
  if(act==='invert'){ setInvert(!INVERT); hud.banner('INVERT Y '+(INVERT?'ON':'OFF'),'',false); }
  if(act==='mute'){ const m=SFX.toggleMute(); hud.banner(m?'AUDIO OFF':'AUDIO ON','',false); }
  if(e.code==='Escape'){
    if(!$('controls').classList.contains('hidden')) closeControls();
    else if(game.state==='play') pause();
  }
});
addEventListener('keyup',e=>{ keys[e.code]=false; });
addEventListener('blur',()=>{ for(const k in keys) keys[k]=false; if(game.state==='play') pause(); });

addEventListener('mousedown',e=>{
  if(game.state==='brief'){ if(hud.endBrief()) lock(); return; }
  if(game.state!=='play') return;
  if(e.button===0){ setFiring(true); }
  if(e.button===2){ cycleWeapon(1); }
});
addEventListener('mouseup',e=>{ if(e.button===0) setFiring(false); });
addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('wheel',e=>{ if(game.state==='play') cycleWeapon(e.deltaY>0?1:-1); },{passive:true});
addEventListener('mousemove',e=>{
  mouseX=e.clientX; mouseY=e.clientY;
  if(game.state!=='play') return;
  if(document.pointerLockElement!==canvas&&!freeAim) return;
  const s=SENS*0.0016;
  player.yaw-=(e.movementX||0)*s;
  player.pitch-=(e.movementY||0)*s*(INVERT?-1:1);
  player.pitch=clamp(player.pitch,-1.53,1.53);
});
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===canvas){ freeAim=false; $('aimhint').classList.add('hidden'); return; }
  if(game.state==='play'&&!freeAim) pause();
});
$('controls').addEventListener('click',e=>{ if(e.target.id==='controls') closeControls(); });
document.addEventListener('pointerlockerror',enableFreeAim);

function lock(){
  try{ const p=canvas.requestPointerLock&&canvas.requestPointerLock(); if(p&&p.catch) p.catch(()=>{}); }catch(e){}
}
function show(id,on){ $(id).classList.toggle('hidden',!on); }

function enterPlay(){
  game.state='play';
  ['menu','over','pause','campaign','levelDone','controls'].forEach(id=>show(id,false));
  show('hud',true);
  SFX.init(); SFX.resume(); SFX.music(true); SFX.fade(true);
  lock();
}
function toMenu(){
  game.state='menu';
  unloadLevel();
  ['hud','over','pause','campaign','levelDone','controls'].forEach(id=>show(id,false));
  show('menu',true);
  SFX.fade(false);
  if(document.exitPointerLock) document.exitPointerLock();
}
function beginRun(){
  unloadLevel();
  buildArena();
  resetRun();
  enterPlay();
  setTimeout(()=>{ if(game.state==='play'&&document.pointerLockElement!==canvas) enableFreeAim(); },500);
  startWave(1);
}
function pause(){
  if(game.state!=='play') return;
  game.state='paused';
  setFiring(false);
  show('pause',true);
  SFX.fade(false);
  if(document.exitPointerLock) document.exitPointerLock();
}
function resume(){
  if(game.state!=='paused') return;
  game.state='play';
  show('pause',false);
  SFX.resume(); SFX.fade(true);
  lock();
}
function die(){
  if(game.state==='dead') return;
  if(level.loaded){                      // campaign: fall back to the last checkpoint
    level.deaths++;
    SFX.death();
    player.hurtFlash=1;
    explode(V3(player.pos.x,player.pos.y+1,player.pos.z),0xff4d5e,1.6);
    respawn();
    hud.banner('RECOVERED','CHECKPOINT RESTORED',true);
    return;
  }
  game.state='dead';
  setFiring(false);
  SFX.death(); SFX.fade(false); SFX.setIntensity(0);
  explode(V3(player.pos.x,player.pos.y+1,player.pos.z),0xff4d5e,2.2);
  player.shake=0.8;
  const best=Math.max(parseInt(store.get('nb_best','0'),10)||0,game.score);
  store.set('nb_best',best);
  $('best').textContent=best.toLocaleString();
  $('oScore').textContent=game.score.toLocaleString();
  $('oWave').textContent=Math.max(0,game.wave-1);
  $('oKills').textContent=game.kills;
  $('oAcc').textContent=(game.shots?Math.round(game.hits/game.shots*100):0)+'%';
  $('oCombo').textContent='x'+game.bestCombo;
  const t=Math.floor(game.time);
  $('oTime').textContent=Math.floor(t/60)+':'+String(t%60).padStart(2,'0');
  $('overSub').textContent=game.score>=best?'NEW PERSONAL BEST':'SYSTEMS OFFLINE';
  setTimeout(()=>{ if(game.state==='dead') show('over',true); },900);
  if(document.exitPointerLock) document.exitPointerLock();
}
function restart(){ beginRun(); }

function resetRun(){
  for(let i=enemies.length-1;i>=0;i--) disposeEnemy(enemies[i]);
  enemies.length=0;
  for(let i=bullets.length-1;i>=0;i--) killBullet(bullets[i],i);
  for(let i=pickups.length-1;i>=0;i--){
    const pk=pickups[i];
    scene.remove(pk.mesh);
    if(pk.mats) for(let k=0;k<pk.mats.length;k++) pk.mats[k].dispose();
    pickups.splice(i,1);
  }
  for(let i=marks.length-1;i>=0;i--){
    scene.remove(marks[i].mesh); scene.remove(marks[i].beam);
    marks[i].mesh.material.dispose(); marks[i].beam.geometry.dispose(); marks[i].beam.material.dispose();
  }
  marks.length=0;
  FX.reset();
  game.wave=0; game.queue.length=0; game.alive=0; game.spawnT=0; game.inter=0;
  game.score=0; game.combo=1; game.comboT=0; game.bestCombo=1;
  game.kills=0; game.shots=0; game.hits=0; game.time=0;
  if(level.loaded){ spawnPlayer(level.spawn.p,level.spawn.yaw); }
  else { player.pos.set(0,0,30); player.vel.set(0,0,0); player.yaw=0; player.pitch=0; }
  player.hp=player.maxHp; player.sh=player.maxSh;
  player.dashN=2; player.dashCd=0; player.dashT=0; player.iFrames=0;
  player.jumps=2; player.boosts=1; player.shake=0; player.kick=0; player.kickV=0; player.hurtFlash=0;
  player.lastHit=-99;
  resetWeapons();
  keys._dash=false; keys._jump=false;
  hud.feedRows.length=0; hud.feedDirty=true;
  hud.sbT=0; hud.hbT=0; hud.alertKey='';
  $('vitalAlert').className=''; $('vitalAlert').textContent='';
  $('vigShield').style.opacity=0;
  hud.stats=hud.threat=hud.vitals=hud.weapon=true;
}

$('startBtn').addEventListener('click',beginRun);
$('againBtn').addEventListener('click',beginRun);
$('resumeBtn').addEventListener('click',resume);
$('abortBtn').addEventListener('click',toMenu);
$('pause').addEventListener('click',e=>{ if(e.target.id==='pause') resume(); });

export {enterPlay, toMenu, keys, freeAim, mouseX, mouseY, enableFreeAim, ACTIONS, PRESETS, BINDS, ACTION_OF, keyLabel, rebuildBinds, presetName, applyPreset, listenFor, renderBindUI, controlsFrom, openControls, closeControls, SENS, INVERT, setBloom, SHOWFPS, setFps, setShadows, setInvert, setSens, lock, show, beginRun, pause, resume, die, restart, resetRun};
