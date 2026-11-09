// Tiny WebAudio synth: no asset files, created lazily after the first user gesture.
let ac = null, muted = localStorage.getItem('echo_mute') === '1';
function ctx() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } } if (ac.state === 'suspended') ac.resume(); return ac; }
function tone(f0, f1, dur, type = 'square', vol = .08, delay = 0) {
  const a = ctx(); if (!a || muted) return; const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, vol = .1, lp = 1800, delay = 0) {
  const a = ctx(); if (!a || muted) return; const n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = vol;
  s.buffer = b; s.connect(f).connect(g).connect(a.destination); s.start(a.currentTime + delay);
}
export const sfx = {
  get muted() { return muted; }, toggle() { muted = !muted; localStorage.setItem('echo_mute', muted ? '1' : '0'); return muted; },
  swing(h = 0) { noise(.09, .05, 3200); tone(300 - h * 80, 120, .09, 'triangle', .03); },
  hit(p = 1) { noise(.12, .12 * p, 900); tone(140, 50, .12, 'square', .09 * p); },
  crit() { tone(520, 1040, .08, 'square', .06); noise(.16, .14, 1500); tone(90, 40, .18, 'sawtooth', .1); },
  kill() { tone(200, 60, .25, 'sawtooth', .1); noise(.3, .12, 700); },
  hurt() { tone(180, 70, .2, 'sawtooth', .1); noise(.15, .1, 600); },
  dash() { noise(.16, .06, 2600); tone(240, 520, .12, 'sine', .04); },
  pick() { tone(660, 990, .07, 'square', .04); tone(990, 1320, .07, 'square', .03, .06); },
  craft() { tone(440, 440, .08, 'square', .05); tone(660, 660, .08, 'square', .05, .09); tone(880, 880, .16, 'square', .05, .18); },
  deny() { tone(160, 110, .14, 'square', .06); },
  click() { tone(900, 700, .03, 'square', .025); },
  bow() { tone(700, 200, .1, 'triangle', .05); noise(.06, .04, 4000); },
  level() { [523, 659, 784, 1046].forEach((f, i) => tone(f, f, .14, 'square', .05, i * .1)); },
};
