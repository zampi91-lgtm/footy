'use strict';
// Sound, all synthesised with WebAudio (as in the skate game). Starts on the first key press or click.
const Snd = {
  init() {
    if (Snd.ctx) { if (Snd.ctx.state === 'suspended') Snd.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = Snd.ctx = new AC(), buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    Snd.noise = buf; Snd.out = c.createGain(); Snd.out.gain.value = 0.6; Snd.out.connect(c.destination);
    const s = c.createBufferSource(); s.buffer = buf; s.loop = true;                 // crowd: a murmur of filtered noise
    const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 700; fl.Q.value = 0.6;
    Snd.crowdG = c.createGain(); Snd.crowdG.gain.value = 0; s.connect(fl); fl.connect(Snd.crowdG); Snd.crowdG.connect(Snd.out); s.start();
  },
  crowd(level) { if (Snd.ctx) Snd.crowdG.gain.setTargetAtTime(level, Snd.ctx.currentTime, 0.25); },
  hit(vol, freq, dur, tone) {                   // a burst of noise, with an optional falling tone for a thump
    const c = Snd.ctx; if (!c || Snd.quiet) return; const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = Snd.noise; const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(Snd.out); s.start(t, Math.random()); s.stop(t + dur);
    if (tone) { const o = c.createOscillator(), og = c.createGain(); o.type = 'square'; o.frequency.setValueAtTime(tone, t); o.frequency.exponentialRampToValueAtTime(tone / 2.5, t + 0.08); og.gain.setValueAtTime(vol * 0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.09); o.connect(og); og.connect(Snd.out); o.start(t); o.stop(t + 0.1); }
  },
  blip(f, d = 0.07, v = 0.12, at = 0, menu) { const c = Snd.ctx; if (!c || (Snd.quiet && !menu)) return; const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g); g.connect(Snd.out); o.start(t); o.stop(t + d); },
  whistle(n = 1) { for (let i = 0; i < n; i++) { Snd.blip(2350, 0.28, 0.1, i * 0.38); Snd.blip(2480, 0.28, 0.07, i * 0.38); } },
  kick(power) { Snd.hit(0.25 + 0.3 * power, 700 + 900 * power, 0.09, 130); },
  thud(v) { Snd.hit(Math.min(0.5, v / 18), 420, 0.12, 80); },
  net() { Snd.hit(0.4, 3500, 0.35); },
  menu(f = 420) { Snd.blip(f, 0.04, 0.07, 0, true); },
  trick(n) { Snd.blip(520 + 90 * Math.min(8, n), 0.06, 0.09); },
};
