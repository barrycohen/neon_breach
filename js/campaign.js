import {$,store,devFlag} from './util.js';
import {game} from './state.js';
import {level,loadLevel} from './level.js';
import {player} from './player.js';
import {show,enterPlay,toMenu} from './ui.js';
import {SFX} from './audio.js';
import {hud} from './hud.js';

/* Campaign progression: the level sequence, what each one unlocks, and the
   progress that persists between sessions. */

const CAMPAIGN=[
  {id:'tutorial-1', name:'TUTORIAL 1', title:'INTAKE',  act:0,
   blurb:'Learn the basics: moving, jumping and shooting.',
   unlocks:'scatter', unlockLabel:'SCATTER'},
  {id:'tutorial-2', name:'TUTORIAL 2', title:'CONDUIT', act:0,
   blurb:'Learn more advanced movement and weapon skills.',
   unlocks:'rail', unlockLabel:'RAIL'},
  {id:'tutorial-3', name:'TUTORIAL 3', title:'VAULT',   act:0,
   blurb:'Tougher enemies, and your first warden guarding a core.',
   unlocks:null, unlockLabel:null},
  {id:'act1-1', name:'SECTOR 1-1', title:'THE SPINE', act:1,
   blurb:'The foundry&rsquo;s main transit line, and the first sector core.',
   unlocks:null, unlockLabel:null},
  {id:'act1-2', name:'SECTOR 1-2', title:'THE RESERVOIR', act:1,
   blurb:'The foundry&rsquo;s coolant reservoir, drained and sealed.',
   unlocks:'tether', unlockLabel:'TETHER'},
  {id:'act1-3', name:'SECTOR 1-3', title:'THE DISPATCH', act:1,
   blurb:'The foundry&rsquo;s dispatch floor, broken apart and still running.',
   unlocks:null, unlockLabel:null},
  {id:'act2-1', name:'SECTOR 2-1', title:'THE WELL', act:2,
   blurb:'The foundry&rsquo;s power plant, dark since the lockdown.',
   unlocks:'arc', unlockLabel:'ARC'},
  {id:'act2-2', name:'SECTOR 2-2', title:'THE DIVIDE', act:2,
   blurb:'The foundry&rsquo;s cooling plant, split by a long drop.',
   unlocks:null, unlockLabel:null},
  {id:'act2-3', name:'SECTOR 2-3', title:'THE STACKS', act:2,
   blurb:'The foundry&rsquo;s exhaust stacks, and the machine that runs the plant.',
   unlocks:null, unlockLabel:null},
  {id:'act3-1', name:'SECTOR 3-1', title:'THE CASTING FLOOR', act:3,
   blurb:'The foundry&rsquo;s heart, sealed shut in reinforced plate.',
   unlocks:'sunder', unlockLabel:'SUNDER'},
  {id:'act3-2', name:'SECTOR 3-2', title:'THE GANTRIES', act:3,
   blurb:'The foundry&rsquo;s charging hall, coming down around you.',
   unlocks:null, unlockLabel:null},
  {id:'act3-3', name:'SECTOR 3-3', title:'THE CITADEL', act:3,
   blurb:'The citadel that ordered the lockdown, and the eye that keeps it.',
   unlocks:null, unlockLabel:null}
];

const progress={done:{}, best:{}};
let current=-1, runStats=null, completeToken=0;

function loadProgress(){
  try{
    const raw=store.get('nb_campaign','');
    if(raw){
      const o=JSON.parse(raw);
      Object.assign(progress.done,o.done||{});
      Object.assign(progress.best,o.best||{});
    }
  }catch(e){}
}
function saveProgress(){ store.set('nb_campaign',JSON.stringify(progress)); }
// #unlock opens every level in the picker without touching saved progress, so
// a late level can be tested from a browser session that has cleared storage.
const UNLOCK_ALL=devFlag(/[#&]unlock/);
function isUnlocked(i){ return UNLOCK_ALL || i===0 || !!progress.done[CAMPAIGN[i-1].id]; }
function fmtTime(t){ t=Math.max(0,Math.floor(t)); return Math.floor(t/60)+':'+String(t%60).padStart(2,'0'); }

/* ---------- level select ---------- */
function renderList(){
  const el=$('campList');
  el.innerHTML=CAMPAIGN.map((L,i)=>{
    const open=isUnlocked(i), done=!!progress.done[L.id], b=progress.best[L.id];
    return `<div class="lvl${open?'':' locked'}${done?' done':''}" data-i="${i}">
      <div class="n">${L.name}</div><div class="s">${L.title}</div>
      <div class="b">${open?L.blurb:'LOCKED &mdash; clear the previous sector'}</div>
      ${b?`<div class="r">BEST ${fmtTime(b.time)} &middot; ${b.deaths} DEATHS</div>`:''}
    </div>`;
  }).join('');
  el.querySelectorAll('.lvl').forEach(d=>{
    const i=+d.dataset.i;
    if(!isUnlocked(i)) return;
    d.addEventListener('click',()=>startLevel(i));
  });
}
function openCampaign(){
  loadProgress();
  renderList();
  const cleared=CAMPAIGN.filter(L=>progress.done[L.id]).length;
  $('campSub').textContent='SECTOR DESCENT  '+cleared+' / '+CAMPAIGN.length+' CLEARED';
  show('menu',false); show('levelDone',false); show('campaign',true);
}

/* ---------- running a level ---------- */
function startLevel(i){
  if(!isUnlocked(i)) return;
  completeToken++;                 // cancel any pending summary from a previous level
  current=i;
  const L=CAMPAIGN[i];
  show('campaign',false);
  // A single-file build carries its levels with it; a served directory fetches.
  const embedded=(typeof EMBEDDED_LEVELS!=='undefined')?EMBEDDED_LEVELS[L.id]:null;
  (embedded ? Promise.resolve(embedded)
            : fetch('levels/'+L.id+'.json')
                .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }))
    .then(def=>{
      loadLevel(def,onComplete);
      runStats={t0:game.time, kills0:game.kills};
      enterPlay();
    })
    .catch(err=>{
      console.error('level load failed:',err);
      hud.banner('LOAD FAILED',L.id,true);
      openCampaign();
    });
}

function onComplete(){
  const L=CAMPAIGN[current];
  const time=game.time-runStats.t0, kills=game.kills-runStats.kills0, deaths=level.deaths;
  progress.done[L.id]=true;
  const prev=progress.best[L.id];
  if(!prev||time<prev.time) progress.best[L.id]={time, deaths};
  saveProgress();
  $('doneName').textContent=L.name+'  ·  '+L.title;
  // the last one: the campaign, not the sector
  const last=current+1>=CAMPAIGN.length;
  $('doneTitle').textContent=last?'CAMPAIGN COMPLETE':'CORE SECURED';
  $('doneTime').textContent=fmtTime(time);
  $('doneKills').textContent=kills;
  $('doneHp').textContent=Math.max(0,Math.round(player.hp));
  $('doneDeaths').textContent=deaths;
  $('doneUnlock').textContent=L.unlockLabel?(L.unlockLabel+' UNLOCKED FOR THE NEXT SECTOR'):(last?'THE LOCKDOWN IS LIFTED':'');
  $('doneNext').style.display=(current+1<CAMPAIGN.length)?'':'none';
  const token=++completeToken;
  setTimeout(()=>{
    if(token!==completeToken) return;      // a new level started in the meantime
    game.state='menu';
    SFX.fade(false);
    if(document.exitPointerLock) document.exitPointerLock();
    show('hud',false); show('levelDone',true);
  },1400);
}
function nextLevel(){
  if(current+1<CAMPAIGN.length) startLevel(current+1);
  else openCampaign();
}

function initCampaign(){
  loadProgress();
  $('campaignBtn').addEventListener('click',openCampaign);
  $('campBack').addEventListener('click',()=>{ show('campaign',false); toMenu(); });
  $('doneNext').addEventListener('click',nextLevel);
  $('doneMenu').addEventListener('click',openCampaign);
}

export {CAMPAIGN, progress, initCampaign, openCampaign, startLevel, nextLevel,
        isUnlocked, fmtTime};
