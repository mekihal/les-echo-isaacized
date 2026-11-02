// MIDI-derived ambient soundtrack synthesized locally with Web Audio.
import { MUSIC_PACK_DEFLATE_BASE64 } from './music-data.js';

const ZONES = {camp:'camp',forest:'forest',marsh:'marsh',ruins:'ruins',glacier:'glacier',rift:'rift',abyss:'abyss',obsidian:'obsidian',garden:'garden'};
const BOSSES = {echo_dragon:'boss_dragon',astral_titan:'boss_dragon',ancient_warden:'boss_garden'};
const VOLUME = 0.135, AHEAD = 0.22, TIMER_MS = 55;
const curve = (inward) => Float32Array.from({length:96},(_,i)=> inward ? Math.sin(i/95*Math.PI/2) : Math.cos(i/95*Math.PI/2));
const FADE_IN = curve(true), FADE_OUT = curve(false);

async function decodePack() {
  if (!('DecompressionStream' in window)) throw new Error('DecompressionStream is unavailable');
  const bytes = Uint8Array.from(atob(MUSIC_PACK_DEFLATE_BASE64), c=>c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  const data = new Uint8Array(await new Response(stream).arrayBuffer());
  const keys = Object.keys(ZONES).concat(['boss_dragon','boss_garden']);
  let p=0; const version=data[p++], count=data[p++];
  if(version!==1 || count!==keys.length) throw new Error('Unknown MIDI bundle version');
  const u16=()=>{const n=data[p]|(data[p+1]<<8);p+=2;return n;};
  const varint=()=>{let n=0,s=0,b;do{b=data[p++];n|=(b&127)<<s;s+=7;}while(b&128);return n>>>0;};
  const pack={};
  for(let i=0;i<count;i++){
    const duration=u16()*10, total=u16(), notes=[]; let tick=0;
    for(let j=0;j<total;j++){tick+=varint();const len=varint(),program=data[p++],note=data[p++],vel=data[p++];notes.push([tick*10,len*10,program,note,vel]);}
    pack[keys[i]]={duration,notes};
  }
  if(p!==data.length) throw new Error('MIDI bundle length mismatch');
  return pack;
}

function voice(program,note,velocity,when,duration,ctx,bus){
  const pad=[48,49,50,52,53,85,89,94,95].includes(program);
  const bell=[8,10,11,14].includes(program), bass=[32,33,34,38,39,43].includes(program);
  const brass=[57,60,61,62,29].includes(program), pluck=[7,24,25,45,46].includes(program);
  const wave=pad||brass?'triangle':bell?'sine':bass?'triangle':pluck?'triangle':program===19?'sine':'sine';
  const attack=pad ? .42 : brass ? .14 : .018, release=pad ? 1.2 : bell ? .68 : brass ? .55 : .34;
  const peak=(velocity/127)*(bass ? .07 : pad ? .042 : brass ? .032 : bell ? .047 : .039);
  const freq=440*Math.pow(2,(note-69)/12), end=when+Math.max(.07,Math.min(6,duration));
  const filter=ctx.createBiquadFilter(), env=ctx.createGain();
  filter.type='lowpass'; filter.frequency.setValueAtTime(bass?(note<48?820:1200):pad?1950:brass?2200:bell?4800:2900,when); filter.Q.value=.45;
  const a=when+Math.min(attack,Math.max(.012,(end-when)*.7)), sustain=Math.max(.0001,peak*(pad?.7:bell?.22:brass?.52:.38));
  env.gain.setValueAtTime(.0001,when); env.gain.linearRampToValueAtTime(peak,a);
  const d=Math.min(end-.015,a+(pad?.5:.24)); if(d>a+.005)env.gain.exponentialRampToValueAtTime(sustain,d);
  env.gain.setValueAtTime(sustain,end); env.gain.linearRampToValueAtTime(.0001,end+release);
  filter.connect(env).connect(bus);
  const osc=ctx.createOscillator(); osc.type=wave; osc.frequency.setValueAtTime(freq,when); osc.connect(filter); osc.start(when); osc.stop(end+release+.04);
  if(pad||brass||bell){const o=ctx.createOscillator(),g=ctx.createGain();o.type=bell?'sine':'triangle';o.frequency.setValueAtTime(freq*(bell?2:1),when);if(!bell)o.detune.setValueAtTime(pad?6:-4,when);g.gain.value=pad?.25:bell?.16:.1;o.connect(g).connect(filter);o.start(when);o.stop(end+release+.04);}
}

class Deck {
  constructor(ctx,master,reverb){this.ctx=ctx;this.gain=ctx.createGain();this.gain.gain.value=0;this.gain.connect(master);const send=ctx.createGain();send.gain.value=.16;this.gain.connect(send).connect(reverb);this.active=false;this.key=null;this.song=null;this.startAt=0;this.index=0;}
  start(key,song,when){this.key=key;this.song=song;this.startAt=when;this.index=0;this.active=true;}
  stop(){this.active=false;this.key=null;this.song=null;this.index=0;this.gain.gain.cancelScheduledValues(this.ctx.currentTime);this.gain.gain.setValueAtTime(0,this.ctx.currentTime);}
  tick(now,until){if(!this.active||!this.song)return;const notes=this.song.notes,dur=this.song.duration/1000;if(!dur||!notes.length)return;while(true){if(this.index>=notes.length){if(this.startAt+dur<=until){this.startAt+=dur;this.index=0;}else break;}const e=notes[this.index],t=this.startAt+e[0]/1000;if(t>until)break;this.index++;if(t+e[1]/1000>=now-.08)voice(e[2],e[3],e[4],Math.max(t,now+.004),e[1]/1000,this.ctx,this.gain);}}
}

class AmbientMusic {
  constructor(){this.ctx=null;this.decks=[];this.active=0;this.pack=null;this.loading=null;this.unlocked=false;this.zone=null;this.boss=null;this.target=null;this.wasBoss=false;this.pendingFade=5.4;this.fadeTimer=null;this.startTimer=null;this.transitionId=0;this.timer=null;this.muted=localStorage.getItem('echo_mute')==='1';this.master=null;}
  unlock(){if(this.unlocked){if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});return this.loading||Promise.resolve();}const C=window.AudioContext||window.webkitAudioContext;if(!C)return Promise.resolve();try{this.ctx=new C({latencyHint:'playback'});const comp=this.ctx.createDynamicsCompressor();comp.threshold.value=-22;comp.knee.value=16;comp.ratio.value=3;comp.attack.value=.025;comp.release.value=.24;this.master=this.ctx.createGain();this.master.gain.value=this.muted?0:VOLUME;const conv=this.ctx.createConvolver(),len=Math.floor(this.ctx.sampleRate*2.6),ir=this.ctx.createBuffer(2,len,this.ctx.sampleRate);for(let c=0;c<2;c++){const a=ir.getChannelData(c);for(let i=0;i<len;i++)a[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.8);}conv.buffer=ir;const wet=this.ctx.createGain();wet.gain.value=.2;conv.connect(wet).connect(this.master);this.master.connect(comp).connect(this.ctx.destination);this.decks=[new Deck(this.ctx,this.master,conv),new Deck(this.ctx,this.master,conv)];this.unlocked=true;const resume=this.ctx.resume().catch(()=>{});this.loading=decodePack().then(pack=>{this.pack=pack;if(this.target)this.fadeTo(this.target,this.pendingFade);return pack;}).catch(e=>{console.warn('[Les Echo music] Music pack could not be decoded:',e);return null;});this.timer=setInterval(()=>this.tick(),TIMER_MS);return Promise.all([resume,this.loading]);}catch(e){console.warn('[Les Echo music] Web Audio unavailable:',e);return Promise.resolve();}}
  setZone(id){if(!ZONES[id])return;this.zone=id;this.sync();}
  setBoss(kind){const next=kind&&BOSSES[kind]?kind:null;if(next===this.boss)return;this.boss=next;this.sync();}
  sync(){const next=this.boss?BOSSES[this.boss]:this.zone&&ZONES[this.zone];if(!next||next===this.target)return;const priorBoss=this.wasBoss;this.target=next;this.wasBoss=!!this.boss;this.pendingFade=this.wasBoss?3:priorBoss?4.8:5.4;if(this.unlocked&&this.pack)this.fadeTo(next,this.pendingFade);}
  fadeTo(key,seconds){
    if(!this.pack?.[key]||!this.ctx)return;
    const now=this.ctx.currentTime,matching=this.decks.findIndex(d=>d.active&&d.key===key);
    const levels=this.decks.map(d=>d.active?Math.max(0,d.gain.gain.value):0);
    const inIndex=matching>=0?matching:(levels[0]>=levels[1]?1:0),outIndex=1-inIndex;
    const out=this.decks[outIndex],inn=this.decks[inIndex];
    if(out.key===key&&out.active)return;
    if(this.fadeTimer)clearTimeout(this.fadeTimer);if(this.startTimer)clearTimeout(this.startTimer);
    const token=this.transitionId=++this.transitionId;
    const hold=param=>{const value=Math.max(0,param.value);param.cancelScheduledValues(now);param.setValueAtTime(value,now);return value;};
    const inLevel=inn.active?hold(inn.gain.gain):0;
    if(out.active)hold(out.gain.gain);
    const replacing=inn.active&&inn.key!==key;
    if(replacing)inn.gain.gain.setTargetAtTime(0,now,.05);
    const begin=()=>{
      if(token!==this.transitionId)return;
      if(replacing&&inn.active)inn.stop();
      const startAt=this.ctx.currentTime+.025;
      if(!inn.active)inn.start(key,this.pack[key],startAt);
      const outLevel=out.active?Math.max(0,out.gain.gain.value):0;
      out.gain.gain.cancelScheduledValues(this.ctx.currentTime);out.gain.gain.setValueAtTime(outLevel,this.ctx.currentTime);
      const fromIn=matching>=0?inLevel:0;
      inn.gain.gain.cancelScheduledValues(this.ctx.currentTime);inn.gain.gain.setValueAtTime(fromIn,this.ctx.currentTime);
      const inCurve=Float32Array.from(FADE_IN,v=>fromIn+(1-fromIn)*v);
      const outCurve=Float32Array.from(FADE_OUT,v=>outLevel*v);
      if(out.active)out.gain.gain.setValueCurveAtTime(outCurve,startAt,seconds);
      inn.gain.gain.setValueCurveAtTime(inCurve,startAt,seconds);
      this.active=inIndex;
      this.fadeTimer=setTimeout(()=>{if(token===this.transitionId&&this.active===inIndex)out.stop();},seconds*1000+160);
    };
    if(replacing)this.startTimer=setTimeout(begin,260);else begin();
  }
  tick(){if(!this.ctx||this.ctx.state!=='running')return;const now=this.ctx.currentTime;for(const d of this.decks)d.tick(now,now+AHEAD);}
  setMuted(muted){this.muted=!!muted;localStorage.setItem('echo_mute',this.muted?'1':'0');if(this.master&&this.ctx)this.master.gain.setTargetAtTime(this.muted?0:VOLUME,this.ctx.currentTime,.06);}
  fadeOut(seconds=.55){if(!this.ctx)return;for(const d of this.decks){d.gain.gain.cancelScheduledValues(this.ctx.currentTime);d.gain.gain.setTargetAtTime(0,this.ctx.currentTime,Math.max(.03,seconds/4));}}
}
export const music = new AmbientMusic();
