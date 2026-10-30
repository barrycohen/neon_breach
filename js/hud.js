import {$,clamp} from './util.js';
import {game,marks,enemies} from './state.js';
import {player} from './player.js';
import {WEAPONS,curW,reloadT,owned} from './weapons.js';
import {SFX} from './audio.js';

/* Heads-up display and survival warnings. */

const crossEl=$('cross');
const hud={
  stats:true,threat:true,vitals:true,weapon:true,
  hm:0,hmCrit:false,feedRows:[],
  hitmark(crit,strength){ this.hm=0.24; this.hmCrit=crit; this.hmS=strength===undefined?1:strength; },
  hmS:1,
  sbT:0, hbT:0, alertKey:'', briefUntil:0, CPX:2.4,
  shieldBreak(){ this.sbT=1.0; },
  feed(name,combo){
    this.feedRows.unshift({t:2.6,txt:name+(combo>1?' <span class="k">x'+combo+'</span>':'')});
    if(this.feedRows.length>4) this.feedRows.pop();
    this.feedDirty=true;
  },
  countdown(txt){ $('countdown').textContent=txt||''; },
  /* One slot per key the level defines, lit once it is carried. Shows the
     empty ones too, so the panel says how many the level wants. */
  setKeys(list){
    const el=$('keys'); if(!el) return;
    el.innerHTML=(list||[]).map(k=>{
      const hex='#'+(k.hex>>>0).toString(16).padStart(6,'0');
      return `<i class="${k.held?'on':''}" style="--kc:${hex}" title="${k.colour}">`
           + String(k.colour).charAt(0).toUpperCase() + '</i>';
    }).join('');
  },
  prompt(txt,colour){
    const el=$('doorPrompt');
    if(!txt){ el.style.opacity=0; return; }
    if(el.textContent!==txt){ el.textContent=txt; el.style.color=colour||'#5df0ff'; }
    el.style.opacity=1;
  },
  setLevel(name,sub){ $('levelName').textContent=name||''; $('levelSub').textContent=sub||''; },
  /* Banners live in the HUD, and hiding the HUD cancels their animation, so
     showing it again would replay the last one from the start. Cleared on
     unload, and whenever a briefing covers the screen. */
  clearBanners(){ for(const id of ['banner','bannerQuiet']) $(id).classList.remove('show'); },
  brief(title,sub){
    this.clearBanners();
    $('briefTitle').textContent=this.keys(title||'',false);
    $('briefSub').innerHTML=this.keys(sub||'',true);
    $('briefGo').style.opacity=0;
    $('brief').classList.remove('hidden');
    // wall clock, not simulation time: a briefing must be dismissable even if the
    // frame loop never reaches hud.update() in this state
    this.briefUntil=performance.now()+350;
    setTimeout(()=>{ if(game.state==='brief') $('briefGo').style.opacity=1; },360);
    game.state='brief';
    if(document.exitPointerLock) document.exitPointerLock();
  },
  endBrief(force){
    if(game.state!=='brief') return false;
    if(!force&&performance.now()<this.briefUntil) return false;
    $('brief').classList.add('hidden');
    $('briefGo').style.opacity=0;
    game.state='play';
    return true;
  },
  /* Level text names actions, not keys: "{dash}" resolves to whatever the
     player has bound to dash. ui.js installs the resolver, because hud cannot
     import it back without a cycle. Unresolved, a token falls back to the
     action's own name rather than vanishing. */
  keyName:null,
  keys(txt,markup){
    if(typeof txt!=='string'||txt.indexOf('{')<0) return txt;
    return txt.replace(/\{([a-z][a-z0-9]*)\}/gi,(m,act)=>{
      const k=this.keyName?this.keyName(act):null;
      const label=k||act.toUpperCase();
      return markup?'<b>'+label+'</b>':label;
    });
  },
  banner(title,sub,danger,quiet){
    if(game.state==='brief') return;     // under a briefing: nobody can read it
    // Quiet notices (a checkpoint) have their own line lower down, so one
    // can't wipe a big banner raised in the same moment.
    if(quiet){
      const q=$('bannerQuiet');
      $('bqTitle').textContent=this.keys(title,false);
      $('bqSub').innerHTML=this.keys(sub||'',true);
      q.classList.remove('show'); void q.offsetWidth; q.classList.add('show');
      return;
    }
    const b=$('banner');
    $('bannerTitle').textContent=this.keys(title,false);
    $('bannerSub').innerHTML=this.keys(sub||'',true);
    b.classList.toggle('danger',!!danger);
    b.classList.remove('quiet');
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  },
  update(dt){

    // compass: bearing 0 is -z, and yaw turns anticlockwise seen from above,
    // so east (+x) sits at -90 degrees of yaw.
    if(!this._cmp){
      const tape=$('compassTape'); let html='';
      const NAME={0:'N',45:'NE',90:'E',135:'SE',180:'S',225:'SW',270:'W',315:'NW'};
      for(let turn=0;turn<3;turn++) for(let a=0;a<360;a+=15){
        const x=(turn*360+a)*this.CPX;
        const n=NAME[a];
        html += n ? '<b class="'+(n.length>1?'sub':'')+'" style="left:'+x+'px">'+n+'</b>'
                  : '<i style="left:'+x+'px"></i>';
      }
      tape.innerHTML=html; this._cmp=tape;
    }
    {
      let bearing=(-player.yaw)*180/Math.PI % 360;
      if(bearing<0) bearing+=360;
      if(Math.abs(bearing-this._bear)>0.15||this._bear===undefined){
        this._bear=bearing;
        this._cmp.style.transform='translateX('+(170-(bearing+360)*this.CPX)+'px)';
      }
    }
    if(this._arena!==!!game.arenaLocked){
      this._arena=!!game.arenaLocked; $('arenaTag').hidden=!this._arena;
    }
    const holdP=game.holdPct===undefined?-1:game.holdPct;
    if(this._hold!==holdP){
      this._hold=holdP; $('powerTag').hidden=holdP<0;
      if(holdP>=0) $('powerTag').lastChild.textContent=holdP+'%';
    }
    if(this._lv!==game.inLevel){
      // a wave count means nothing in a campaign level - that is an
      // endless-arena idea, and "WAVE 0" just sits there looking broken
      this._lv=game.inLevel; $('waveRow').hidden=!!game.inLevel;
      $('levelTag').hidden=!game.inLevel;
    }
    if(this.stats||this._sc!==game.score||this._wv!==game.wave){
      $('score').textContent=game.score.toLocaleString();
      $('waveN').textContent=game.wave;
      this._sc=game.score; this._wv=game.wave; this.stats=false;
    }
    // an arena gate waits on its own spawns, so that is the number to show -
    // anything else has the player hunting stragglers that do not hold it
    const rem=(game.gate>=0?game.gate:game.alive)+marks.length+game.queue.length;
    if(this.threat||this._rem!==rem){
      $('left').textContent=rem;
      this._rem=rem; this.threat=false;
    }
    const hp=Math.max(0,Math.round(player.hp)), sh=Math.max(0,Math.round(player.sh));
    if(this.vitals||this._hp!==hp||this._sh!==sh){
      this._hp=hp; this._sh=sh;
      $('hpn').textContent=hp; $('shn').textContent=sh;
      $('hpbar').style.width=(hp/player.maxHp*100)+'%';
      $('shbar').style.width=(sh/player.maxSh*100)+'%';
      $('hpbar').parentNode.classList.toggle('low',hp<45);
      $('shbar').parentNode.classList.toggle('empty',sh<=0);
      this.vitals=false;
    }
    if(this.weapon){
      const w=WEAPONS[curW];
      $('wname').textContent=w.name;
      $('mag').textContent=w.mag;
      $('mag').classList.toggle('dry',w.mag===0);
      $('res').innerHTML='/ '+(w.reserve===Infinity?'&#8734;':w.reserve);
      $('reloading').classList.toggle('hidden',reloadT<=0);
      let h='';
      for(let i=0;i<WEAPONS.length;i++){
        const ww=WEAPONS[i];
        if(!owned[ww.id]) continue;                 // not carrying it
        const cls=i===curW?'on':((ww.mag+ (ww.reserve===Infinity?1:ww.reserve))<=0?'empty':'');
        h+='<span class="'+cls+'">'+(i+1)+' '+ww.name+'</span>';
      }
      $('wlist').innerHTML=h;
      this.weapon=false;
    }
    if(this.feedDirty){
      $('feed').innerHTML=this.feedRows.map(r=>'<div style="opacity:'+clamp(r.t/1.2,0,1).toFixed(2)+'">'+r.txt+'</div>').join('');
      this.feedDirty=false;
    }
    for(let i=this.feedRows.length-1;i>=0;i--){
      this.feedRows[i].t-=dt;
      if(this.feedRows[i].t<=0){ this.feedRows.splice(i,1); this.feedDirty=true; }
      else if(this.feedRows[i].t<1.2) this.feedDirty=true;
    }
    // boss bar: anything whose kind names itself a boss gets one
    const bosses=[];
    for(let i=0;i<enemies.length;i++)
      if(enemies[i].K.boss&&!enemies[i].dead&&!enemies[i].dormant) bosses.push(enemies[i]);
    if(bosses.length){
      $('bossbar').classList.remove('hidden');
      if(this._bossN!==bosses.length){
        this._bossN=bosses.length;
        $('bossbars').innerHTML=bosses.map(()=>'<span><i></i></span>').join('');
        this._bsegs=Array.prototype.slice.call($('bossbars').children);
        const nm=bosses[0].K.boss;
        $('bosslabel').innerHTML=(bosses.length>1?bosses.length+' '+nm+'S':nm)+
                                 ' &middot; SECTOR CORE';
      }
      for(let i=0;i<bosses.length;i++){
        const b=bosses[i], seg=this._bsegs[i];
        seg.firstChild.style.width=clamp(b.hp/b.maxHp*100,0,100)+'%';
        // a shielded boss's bar is dimmed: shooting it now does nothing
        seg.style.opacity=((b.K.shielded&&!(b.exposed>0))||(b.K.shieldHits&&!(b.cracked>0))||b.dim)?0.35:1;
      }
    }else{ $('bossbar').classList.add('hidden'); this._bossN=0; }
    // dash pips
    const pips=$('dashpips').children;
    for(let i=0;i<pips.length;i++) pips[i].classList.toggle('rdy',i<player.dashN);
    // hitmarker
    if(this.hm>0){
      this.hm-=dt;
      const el=$('hitmark');
      el.style.opacity=clamp(this.hm/0.24,0,1)*(0.4+0.6*this.hmS);   // weak at range
      el.classList.toggle('crit',this.hmCrit);
      el.style.transform='scale('+(1.5-clamp(this.hm/0.24,0,1)*0.5)+')';
    }else $('hitmark').style.opacity=0;
    // combo
    const c=$('combo');
    if(game.combo>1){ c.classList.add('on'); c.textContent='x'+game.combo+' COMBO'; }
    else c.classList.remove('on');
    // ---- survival warnings ----
    const alive=game.state==='play';
    const shieldsDown=alive&&player.sh<=0.5;
    const critical=alive&&player.hp<45;

    // red edges ramp from 45 integrity down to zero, pulsing faster as it falls
    const lowF=critical?clamp(1-player.hp/45,0,1):0;
    const rate=4.5+lowF*9;
    const lowPulse=lowF>0?(0.16+lowF*0.46)*(0.72+0.28*Math.sin(game.time*rate)):0;
    player.hurtFlash=Math.max(0,player.hurtFlash-dt*2.2);
    $('vig').style.opacity=clamp(player.hurtFlash*0.8+lowPulse,0,1);
    $('dmgflash').style.opacity=clamp(player.hurtFlash*0.55,0,0.6);

    // violet edges the moment shields drop, then a steady reminder while they are down
    if(this.sbT>0) this.sbT-=dt;
    // four decaying strobes: movement registers where a slow fade does not
    const sbF=clamp(this.sbT,0,1);
    const breakFlash=sbF>0?sbF*0.88*(0.55+0.45*Math.cos(this.sbT*Math.PI*7)):0;
    const downGlow=(shieldsDown&&!critical)?(0.15+0.06*Math.sin(game.time*3.4)):0;
    $('vigShield').style.opacity=clamp(Math.max(breakFlash,downGlow),0,1);

    // contextual text, kept beside the bars rather than over the crosshair
    // in a storm the shield is being eaten, which is worth saying before it is gone
    const key=critical?'crit':(game.inStorm&&alive?'storm':(shieldsDown?'shield':''));
    if(key!==this.alertKey){
      this.alertKey=key;
      const el=$('vitalAlert');
      el.textContent=key==='crit'?'INTEGRITY CRITICAL':(key==='storm'?'STORM · SHIELD DRAINING':(key==='shield'?'SHIELDS DOWN':''));
      el.className=key?('on pulse '+key):'';
    }

    // quiet heartbeat once integrity is critical, quickening as it drops
    if(critical){
      this.hbT-=dt;
      if(this.hbT<=0){ SFX.heartbeat(lowF); this.hbT=0.78-lowF*0.36; }
    }else this.hbT=0;
  }
};

export {crossEl, hud};
