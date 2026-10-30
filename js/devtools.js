import {$} from './util.js';
import {game} from './state.js';
import {player} from './player.js';
import {level, refreshKeys} from './level.js';
import {WEAPONS, setLoadout, resetAmmo} from './weapons.js';
import {hud} from './hud.js';

/* Development tools: a teleport list, god mode and one-shot kills, so a room at the far
   end of a level can be looked at without playing the whole level to reach it.
   This module never reaches production - build.py refuses to emit it, and
   strips the call below - so nothing here has to be safe for players. */

let panel=null, open=false;

/* Everywhere worth jumping to, read off whatever level is loaded. */
function stops(){
  const out=[];
  if(level.spawn) out.push({label:'spawn', p:level.spawn.p});
  level.checkpoints.forEach((c,i)=>out.push({label:'checkpoint '+(i+1), p:c.p}));
  level.keys.forEach(k=>out.push({label:k.colour+' key', p:k.p}));
  level.weapons.forEach(w=>out.push({label:w.id+' pickup', p:w.p}));
  level.doors.forEach(d=>out.push({label:(d.boss?'BOSS door ':'door ')+d.id,
                                   p:[d.mesh.position.x, d.base, d.mesh.position.z]}));
  level.nodes.forEach((n,i)=>out.push({label:'conduit '+(i+1), p:[n.e.pos.x,n.e.pos.y,n.e.pos.z]}));
  if(level.goal) out.push({label:'the core', p:level.goal.p});
  return out;
}

function goTo(p){
  player.pos.set(p[0], p[1]+0.2, p[2]);
  player.vel.set(0,0,0);
  player.onGround=false; player.jumps=2; player.boosts=1;
  player.iFrames=1.2;                       // do not arrive mid-fight and die
  if(game.state==='brief') game.state='play';
  hud.vitals=true;
}

function style(){
  if($('devcss')) return;
  const s=document.createElement('style'); s.id='devcss';
  s.textContent=`#devpanel{position:fixed;left:12px;top:12px;z-index:60;max-height:88vh;overflow:auto;
    background:rgba(6,10,20,.93);border:1px solid #ff4d5e;border-radius:6px;padding:10px 12px;
    font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#cfe8ff;min-width:210px}
  #devpanel h4{margin:0 0 6px;font:700 11px/1.4 ui-monospace,monospace;letter-spacing:.18em;color:#ff4d5e}
  #devpanel button{display:block;width:100%;text-align:left;margin:1px 0;padding:3px 6px;cursor:pointer;
    background:rgba(93,240,255,.07);border:1px solid rgba(93,240,255,.25);border-radius:3px;
    color:#cfe8ff;font:12px/1.4 ui-monospace,monospace}
  #devpanel button:hover{background:rgba(93,240,255,.18)}
  #devpanel .row{display:flex;gap:6px;margin:6px 0}
  #devpanel .row button{width:auto;flex:1}
  #devpanel .on{border-color:#8dff6a;color:#8dff6a}
  #devpanel .hint{opacity:.55;margin-top:8px;font-size:11px}`;
  document.head.appendChild(s);
}

function draw(){
  panel.innerHTML='';
  const h=document.createElement('h4');
  h.textContent='DEV · '+(level.name||'arena');
  panel.appendChild(h);

  const row=document.createElement('div'); row.className='row';
  const god=document.createElement('button');
  god.textContent=player.god?'GOD: ON':'GOD: off';
  if(player.god) god.className='on';
  god.onclick=()=>{ player.god=!player.god; if(player.god){player.hp=player.maxHp;player.sh=player.maxSh;hud.vitals=true;} draw(); };
  const kit=document.createElement('button');
  kit.textContent='ALL KEYS + GUNS';
  kit.onclick=()=>{
    setLoadout(WEAPONS.map(w=>w.id)); resetAmmo();
    level.keys.forEach(k=>{ level.held[k.colour]=true; });
    refreshKeys();            // or the rack stays dark and it looks like nothing happened
    hud.weapon=true; draw();
  };
  // Every hit kills, through plates and weaves alike - for replaying a level to
  // look at something, without winning every fight on the way to it again.
  const one=document.createElement('button');
  one.textContent=player.oneShot?'1-SHOT: ON':'1-SHOT: off';
  if(player.oneShot) one.className='on';
  one.onclick=()=>{ player.oneShot=!player.oneShot; draw(); };
  row.appendChild(god); row.appendChild(one); row.appendChild(kit); panel.appendChild(row);

  for(const s of stops()){
    const b=document.createElement('button');
    b.textContent=s.label+'  ('+s.p.map(v=>Math.round(v)).join(', ')+')';
    b.onclick=()=>goTo(s.p);
    panel.appendChild(b);
  }
  const hint=document.createElement('div'); hint.className='hint';
  hint.textContent='F2 closes · dev build only';
  panel.appendChild(hint);
}

function toggle(){
  style();
  if(!panel){ panel=document.createElement('div'); panel.id='devpanel'; document.body.appendChild(panel); }
  open=!open;
  panel.style.display=open?'block':'none';
  if(open) draw();
}

function initDevTools(){
  window.addEventListener('keydown',e=>{
    if(e.code==='F2'){ e.preventDefault(); toggle(); }
  });
  console.info('dev tools: F2 for teleport, god mode and one-shot kills (not present in the built game)');
}

export {initDevTools};
