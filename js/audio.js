import {clamp} from './util.js';

/* Synthesised audio: sound effects and the music sequencer. No asset files. */

const SFX=(function(){
  let ctx=null,master=null,sfxG=null,musG=null,noise=null,timer=null;
  let step=0,nextT=0,intensity=0,muted=false,musicOn=true;
  const BPM=140, SIXT=60/BPM/4;

  function init(){
    if(ctx) return;
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return;
    ctx=new AC();
    master=ctx.createGain(); master.gain.value=0.85; master.connect(ctx.destination);
    sfxG=ctx.createGain(); sfxG.gain.value=0.62; sfxG.connect(master);
    musG=ctx.createGain(); musG.gain.value=0.0; musG.connect(master);
    const n=ctx.sampleRate*1.0, buf=ctx.createBuffer(1,n,ctx.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<n;i++) d[i]=Math.random()*2-1;
    noise=buf;
    nextT=ctx.currentTime+0.1;
    timer=setInterval(sched,45);
  }
  function resume(){ if(ctx&&ctx.state==='suspended') ctx.resume(); }
  function env(g,t,peak,dec,atk){ atk=atk||0.004;
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(peak,t+atk);
    g.gain.exponentialRampToValueAtTime(0.0001,t+atk+dec);
  }
  function osc(type,f0,f1,dur,peak,dest,t0){
    if(!ctx) return; const t=t0||ctx.currentTime;
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(f0,t);
    if(f1!==f0) o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t+dur);
    env(g,t,peak,dur); o.connect(g); g.connect(dest||sfxG); o.start(t); o.stop(t+dur+0.06);
    return o;
  }
  function nz(dur,peak,type,f0,f1,q,dest,t0){
    if(!ctx) return; const t=t0||ctx.currentTime;
    const s=ctx.createBufferSource(); s.buffer=noise; s.loop=true;
    const f=ctx.createBiquadFilter(); f.type=type||'lowpass';
    f.frequency.setValueAtTime(f0,t);
    if(f1&&f1!==f0) f.frequency.exponentialRampToValueAtTime(Math.max(40,f1),t+dur);
    f.Q.value=q||1;
    const g=ctx.createGain(); env(g,t,peak,dur);
    s.connect(f); f.connect(g); g.connect(dest||sfxG); s.start(t); s.stop(t+dur+0.06);
  }

  // For tuning: render one effect offline, through a highpass like a laptop's
  // speakers (`hp` Hz), so it can be measured rather than guessed at.
  function render(name,dur,hp,lp){
    const oc=new OfflineAudioContext(1,Math.ceil(44100*dur),44100);
    const keep=[ctx,sfxG,noise];
    const nb=oc.createBuffer(1,44100,44100), d=nb.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    let out=oc.destination;
    if(lp){ const f=oc.createBiquadFilter(); f.type='lowpass'; f.frequency.value=lp; f.connect(out); out=f; }
    if(hp){ const f=oc.createBiquadFilter(); f.type='highpass'; f.frequency.value=hp; f.connect(out); out=f; }
    const g=oc.createGain(); g.gain.value=0.62; g.connect(out);
    ctx=oc; sfxG=g; noise=nb;
    try{ api[name](); } finally{ [ctx,sfxG,noise]=keep; }
    return oc.startRendering();
  }

  /* ---- sequencer: driving synthwave pulse ---- */
  const BASS=[0,null,0,7,null,0,null,3,0,null,0,10,null,7,null,5];
  const ARP=[12,19,24,19,15,22,24,22,12,19,24,26,15,22,27,22];
  function sched(){
    if(!ctx||!musicOn) return;
    const now=ctx.currentTime;
    while(nextT<now+0.25){ playStep(step,nextT); step=(step+1)%16; nextT+=SIXT; }
  }
  function playStep(s,t){
    const root=55;
    if(s%4===0){ osc('sine',150,42,0.16,0.9,musG,t); nz(0.05,0.35,'lowpass',700,120,1,musG,t); }
    if(s%2===1) nz(0.03,0.10+0.05*intensity,'highpass',6500,7000,1,musG,t);
    const b=BASS[s];
    if(b!==null&&b!==undefined){
      const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
      o.type='sawtooth'; o.frequency.setValueAtTime(root*Math.pow(2,b/12),t);
      f.type='lowpass'; f.frequency.setValueAtTime(320+520*intensity,t); f.Q.value=7;
      env(g,t,0.34,SIXT*1.7); o.connect(f); f.connect(g); g.connect(musG);
      o.start(t); o.stop(t+SIXT*2);
    }
    if(intensity>0.25){
      const a=ARP[s];
      osc('square',root*Math.pow(2,a/12),root*Math.pow(2,a/12),0.09,0.055*intensity,musG,t);
    }
  }

  const api={
    init,resume,render,
    setIntensity(v){ intensity=clamp(v,0,1); },
    music(on){ musicOn=on; if(musG&&ctx) musG.gain.setTargetAtTime(on&&!muted?0.30:0.0,ctx.currentTime,0.2); },
    fade(on){ if(musG&&ctx) musG.gain.setTargetAtTime(on&&musicOn&&!muted?0.30:0.0,ctx.currentTime,0.15); },
    toggleMute(){ muted=!muted; if(master) master.gain.setTargetAtTime(muted?0:0.85,ctx.currentTime,0.05); return muted; },
    pulse(){
      osc('square',300,96,0.085,0.30);                  // body
      osc('sine',148,54,0.11,0.34);                     // low thump
      nz(0.028,0.34,'bandpass',1500,650,1.7);           // transient crack
      osc('sawtooth',880,300,0.045,0.075);              // faint energy tail
    },
    scatter(){ nz(0.22,0.75,'lowpass',2600,260,1.2); osc('sine',180,44,0.20,0.6); },
    rail(){ osc('sawtooth',1500,90,0.34,0.42); nz(0.16,0.35,'bandpass',2400,600,6); osc('sine',90,40,0.4,0.35); },
    dry(){ osc('square',220,180,0.04,0.16); },
    reload(){ osc('square',300,520,0.06,0.16); setTimeout(()=>osc('square',520,300,0.05,0.14),120); },
    hit(){ osc('square',1500,1100,0.035,0.18); },
    crit(){ osc('square',2100,1500,0.05,0.24); osc('triangle',1200,2400,0.07,0.16); },
    kill(){ osc('triangle',760,1420,0.10,0.26); nz(0.10,0.22,'bandpass',1800,900,3); },
    boom(){ nz(0.55,0.85,'lowpass',1100,70,1); osc('sine',110,28,0.45,0.55); },
    hurt(){ osc('sawtooth',210,64,0.24,0.42); nz(0.16,0.30,'lowpass',900,200,1); },
    shieldBreak(){ osc('square',900,180,0.28,0.30); nz(0.3,0.3,'highpass',2200,700,2); },
    heartbeat(f){
      const g=0.10+0.10*(f||0);
      osc('sine',88,42,0.13,g);
      if(ctx) setTimeout(()=>osc('sine',76,36,0.11,g*0.7),150);
    },
    ezap(){ osc('sawtooth',420,120,0.13,0.16); },
    dash(){ nz(0.26,0.45,'bandpass',420,3200,2.2); },
    jump(){ nz(0.13,0.22,'bandpass',600,2200,2); osc('sine',300,600,0.09,0.12); },
    pickup(){ osc('triangle',680,1360,0.11,0.24); },
    spawn(){ osc('sawtooth',120,600,0.32,0.20); },
    waveUp(){ [0,4,7,12].forEach((n,i)=>osc('square',330*Math.pow(2,n/12),330*Math.pow(2,n/12),0.16,0.20,null,ctx?ctx.currentTime+i*0.09:0)); },
    death(){ osc('sawtooth',420,32,1.4,0.5); nz(1.2,0.4,'lowpass',1600,60,1); },
    // the Sunder: a deep thump with a crack on top
    sunder(){ osc('sine',120,30,0.5,0.8); nz(0.4,0.75,'lowpass',2600,90,1); osc('square',900,140,0.12,0.22); },
    // a panel giving way: groan, then the crash
    breach(){ osc('sawtooth',90,40,0.6,0.4); nz(0.7,0.7,'lowpass',1800,80,1); nz(0.25,0.4,'highpass',3000,1200,2); },
    // structure about to go: metal straining, a low groan under a creak
    creak(d){ d=d||1.2; osc('sawtooth',62,38,d,0.32); osc('square',180,120,d*0.7,0.06); nz(d,0.22,'bandpass',700,300,3); },
    // and coming down: a long crash, heavier than a panel
    crash(){ nz(1.1,0.9,'lowpass',900,50,1); osc('sine',70,22,0.9,0.7); nz(0.4,0.45,'highpass',2600,900,2); },
    // A door, opening or shutting: a pneumatic whoosh - air swept up through
    // the middle of the range and back down, swelling in and fading out, with
    // no tone in it (tones read as the start of an alarm). Two layers: the
    // breath, swept 650Hz to 2.4kHz and back to 1.3kHz, and a softer body under it.
    door(){ if(!ctx) return; const t=ctx.currentTime;
      for(const [f0,f1,f2,q,peak] of [[650,2400,1300,1.1,0.17],[300,800,450,0.8,0.1]]){
        const s=ctx.createBufferSource(); s.buffer=noise; s.loop=true;
        const f=ctx.createBiquadFilter(); f.type='bandpass'; f.Q.value=q;
        f.frequency.setValueAtTime(f0,t); f.frequency.exponentialRampToValueAtTime(f1,t+0.16);
        f.frequency.exponentialRampToValueAtTime(f2,t+0.45);
        const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(peak,t+0.06);
        g.gain.setTargetAtTime(0.0001,t+0.14,0.09);
        s.connect(f); f.connect(g); g.connect(sfxG); s.start(t); s.stop(t+0.6);
      } },
    doorShut(){ api.door(); },
    // a storm on you: a crackle, sharper once it is into your health
    storm(bleeding){ nz(0.08,bleeding?0.5:0.32,'bandpass',bleeding?4200:2600,1200,5); osc('square',bleeding?640:360,bleeding?520:300,0.05,bleeding?0.2:0.11); },
    // molten metal round your legs: a sizzle, harsher with the shield gone
    burn(bleeding){ nz(0.26,bleeding?0.42:0.28,'highpass',5600,2600,0.8); nz(0.2,bleeding?0.34:0.2,'lowpass',520,160,1); },
    // The Gaze sending: energy gathering for a breath, then let go - a thump
    // and a rush falling away as the pod comes down. It rises then falls, where
    // the strike's charge only rises, to the bolt.
    horn(){ if(!ctx) return; const t=ctx.currentTime, R=0.28;
      const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1400; lp.connect(sfxG);
      // gathering
      const s1=ctx.createBufferSource(); s1.buffer=noise; s1.loop=true;
      const f1=ctx.createBiquadFilter(); f1.type='bandpass'; f1.Q.value=2.5;
      f1.frequency.setValueAtTime(400,t); f1.frequency.exponentialRampToValueAtTime(1900,t+R);
      const g1=ctx.createGain(); g1.gain.setValueAtTime(0.0001,t); g1.gain.linearRampToValueAtTime(0.16,t+R); g1.gain.linearRampToValueAtTime(0.0001,t+R+0.05);
      s1.connect(f1); f1.connect(g1); g1.connect(sfxG); s1.start(t); s1.stop(t+R+0.1);
      const o=ctx.createOscillator(), og=ctx.createGain(); o.type='sawtooth';
      o.frequency.setValueAtTime(170,t); o.frequency.exponentialRampToValueAtTime(540,t+R);
      o.frequency.exponentialRampToValueAtTime(120,t+R+0.85);
      og.gain.setValueAtTime(0.0001,t); og.gain.linearRampToValueAtTime(0.08,t+R);
      og.gain.setTargetAtTime(0.0001,t+R+0.05,0.22);
      o.connect(og); og.connect(lp); o.start(t); o.stop(t+R+1.1);
      // let go: the thump, and the rush falling away
      osc('sine',300,90,0.2,0.18,null,t+R);
      const s2=ctx.createBufferSource(); s2.buffer=noise; s2.loop=true;
      const f2=ctx.createBiquadFilter(); f2.type='bandpass'; f2.Q.value=1.6;
      f2.frequency.setValueAtTime(2200,t+R); f2.frequency.exponentialRampToValueAtTime(350,t+R+0.95);
      const g2=ctx.createGain(); g2.gain.setValueAtTime(0.0001,t+R); g2.gain.linearRampToValueAtTime(0.22,t+R+0.03);
      g2.gain.setTargetAtTime(0.0001,t+R+0.1,0.28);
      s2.connect(f2); f2.connect(g2); g2.connect(sfxG); s2.start(t+R); s2.stop(t+R+1.3); },
    // The Gaze's lightning about to land: a charge building, held and rising
    // right up to the bolt, with ticks closing in. Unlike strikeWarn's whine it
    // is loudest at the hit, which is what matters under the eye's glare, where
    // the warning ring is hard to see.
    charge(d){ if(!ctx) return; const t=ctx.currentTime; d=d||1.0;
      const s=ctx.createBufferSource(); s.buffer=noise; s.loop=true;
      const f=ctx.createBiquadFilter(); f.type='bandpass'; f.Q.value=3;
      f.frequency.setValueAtTime(500,t); f.frequency.exponentialRampToValueAtTime(2600,t+d);
      const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.05,t+d*0.3);
      g.gain.linearRampToValueAtTime(0.3,t+d); g.gain.linearRampToValueAtTime(0.0001,t+d+0.04);
      s.connect(f); f.connect(g); g.connect(sfxG); s.start(t); s.stop(t+d+0.1);
      const o=ctx.createOscillator(), og=ctx.createGain(); o.type='sawtooth';
      o.frequency.setValueAtTime(260,t); o.frequency.exponentialRampToValueAtTime(820,t+d);
      og.gain.setValueAtTime(0.0001,t); og.gain.linearRampToValueAtTime(0.09,t+d); og.gain.linearRampToValueAtTime(0.0001,t+d+0.04);
      o.connect(og); og.connect(sfxG); o.start(t); o.stop(t+d+0.1);
      for(const k of [0,0.4,0.65,0.8,0.9,0.96]) osc('square',1480,1480,0.045,0.07,null,t+k*d); },
    // a conductor under the light: a crackle, a little lighter than a storm's
    crackle(){ nz(0.07,0.27,'bandpass',2600,1300,5); osc('square',360,300,0.045,0.07); },
    // lightning coming: a rising whine over the warning
    strikeWarn(d){ osc('sawtooth',180,1100,d||1.0,0.16); osc('sine',90,360,d||1.0,0.18); }
  };
  return api;
})();

export {SFX};
