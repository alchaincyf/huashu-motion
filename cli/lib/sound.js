// om sound — the soundtrack, synthesized from the composition itself. A headless browser loads
// index.html and reads what it declares: the scene labels (music sections), OM.sfx hits (effects),
// OM.music options and the narration words (ducking). Everything is synthesized here in plain JS —
// no samples, no network, no dependencies — and the same source always gives the same file.
// The music itself is composed in score.js (styles, products, drop, ending, motif); this file renders
// the effects in the style's kit, automates and mixes the buses and writes the master.
import { soundprintReport } from './soundprint.js';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from './browser.js';
import { openFilm } from './capture.js';
import { OmError, readSource, writeSource } from './project.js';
import { N, RATE, biquad, db, decay, drive, ensemble, glide, mix, mtof, noise, osc, partials, peakTo, reverb, reverse, rng, shape, sinp, undb } from './dsp.js';
import { CHANNELS, REVERBS, applyChain, glue, plate } from './fx.js';
import { readScore, renderComposed } from './composed.js';
import { packDir } from './samples.js';
import { DRUMS, INSTRUMENTS, MOODS, voice, drum, PRODUCTS, STYLES, deg, describe, master, pickBpm, plan, pump, renderScore } from './score.js';

export { RATE, rng, pickBpm, plan, MOODS, STYLES, PRODUCTS };
const r3 = (x) => Math.round(x * 1000) / 1000;
const PKG = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------- sound effects ----------
// Each returns { sig: mono | [L, R], lead }: the sound starts `lead` seconds before the hit time, so the
// impact (or the end of a swell) lands exactly on `at`. `o.dur` sets the length of continuous ones.

export const SFX = {
  pop: { about: 'a small element appears (note: scale degree)', fn: (o, r, key) => ({ sig: peakTo(mix([glide(key(o.note ?? 5, 5), key(o.note ?? 5, 4), 0.09, 0.035)], [decay(biquad(noise(0.006, r), 'hp', 3000), 0.002), 0.3]), 0.5), lead: 0 }) },
  tick: { about: 'tiny UI tick, a bar or row arriving', fn: (o, r) => ({ sig: peakTo(mix([partials(2600 * (o.pitch ?? 1), 0.03, [[1, 1, 0.008], [2.7, 0.4, 0.004]], 0.0005)], [decay(biquad(noise(0.01, r), 'hp', 5000), 0.002), 0.4]), 0.35), lead: 0 }) },
  click: { about: 'mouse or button click', fn: (o, r) => ({ sig: peakTo(mix([decay(biquad(noise(0.02, r), 'bp', 3200, 1.5), 0.003)], [decay(biquad(noise(0.02, r), 'bp', 2400, 1.5), 0.003), 0.6, 0.055]), 0.45), lead: 0 }) },
  whoosh: { about: 'something sweeps past (0.5 s, peaks on the hit)', fn: (o, r) => sweep(o.dur ?? 0.5, 450, 2600, 0.6, r, 0.45) },
  whip: { about: 'fast camera whip / slide-out', fn: (o, r) => sweep(o.dur ?? 0.24, 900, 4200, 0.55, r, 0.5) },
  thud: { about: 'a card or object lands on the desk', fn: (o, r) => ({ sig: peakTo(mix([glide(120 * (o.pitch ?? 1), 52, 0.22, 0.09)], [decay(biquad(noise(0.08, r), 'lp', 900), 0.025), 0.6], [decay(biquad(noise(0.03, r), 'bp', 2500, 1), 0.008), 0.18]), 0.6), lead: 0 }) },
  impact: { about: 'a title slams in (big, use once or twice)', fn: (o, r) => ({ sig: peakTo(biquad(mix([glide(95, 45, 0.9, 0.22)], [decay(biquad(noise(0.5, r), 'lp', 2400), 0.12), 0.8], [decay(biquad(noise(0.05, r), 'hp', 3000), 0.02), 0.35]), 'hp', 40), 0.8), lead: 0 }) },
  paper: { about: 'paper, a sticky note or photo slapped down', fn: (o, r) => { const s = biquad(noise(0.16, r), 'bp', 3000, 0.6); return { sig: peakTo(shape(s, (u, t) => Math.exp(-t / 0.045) * (0.6 + 0.4 * Math.sin(t * 380))), 0.45), lead: 0 }; } },
  stamp: { about: 'a rubber stamp thumps down', fn: (o, r) => ({ sig: peakTo(mix([glide(140, 60, 0.25, 0.07)], [decay(biquad(noise(0.06, r), 'bp', 1400, 0.8), 0.02), 0.9], [decay(biquad(noise(0.02, r), 'hp', 4000), 0.006), 0.3]), 0.7), lead: 0 }) },
  ding: { about: 'a bell: something is right / done (note: scale degree)', fn: (o, r, key) => ({ sig: peakTo(INSTRUMENTS.glass(key(o.note ?? 1, 6), 1.6), 0.4), lead: 0 }) },
  chime: { about: 'two rising bell notes: a reveal, the end card', fn: (o, r, key) => ({ sig: peakTo(mix([INSTRUMENTS.glass(key(1, 5), 1.4)], [INSTRUMENTS.glass(key(5, 5), 1.6), 0.9, 0.11]), 0.45), lead: 0 }) },
  sparkle: { about: 'glitter: a highlight, a star', fn: (o, r, key) => { const parts = []; for (let k = 0; k < 7; k++) parts.push([INSTRUMENTS.glass(key([1, 3, 5, 6, 8][Math.floor(r() * 5)], 6 + (r() < 0.4 ? 1 : 0)), 0.5), 0.5 - k * 0.05, k * 0.045 + r() * 0.02]); return { sig: peakTo(mix(...parts), 0.3), lead: 0 }; } },
  count: { about: 'a number counting up (dur; dense then slowing, like expo.out)', fn: (o, r) => { const dur = o.dur ?? 1.2, n = o.ticks ?? 22, parts = []; for (let k = 0; k < n; k++) { const t = (-Math.log2(1 - (k / n) * 0.999) / 10) * dur; parts.push([partials(1900 + 1300 * (k / n), 0.025, [[1, 1, 0.006], [2.4, 0.3, 0.003]], 0.0005), 0.6, t]); } return { sig: peakTo(mix(...parts), 0.3), lead: 0 }; } },
  riser: { about: 'a swell that ends on the hit (dur)', fn: (o, r) => { const dur = o.dur ?? 0.8, s = biquad(noise(dur, r), 'bp', (u) => 500 + 5000 * u * u, 0.8), t = glide(180, 720, dur, 99); return { sig: peakTo(shape(mix([s], [t, 0.15]), (u) => Math.pow(u, 2.2) * (u > 0.97 ? (1 - u) / 0.03 : 1)), 0.4), lead: dur }; } },
  draw: { about: 'a marker or pen stroke (dur) — underlines, circles', fn: (o, r) => { const dur = o.dur ?? 0.5, s = biquad(noise(dur, r), 'bp', (u) => 2600 + 900 * Math.sin(u * 19), 1.2); const w = rng(9); let g = 0.5; return { sig: peakTo(shape(s, (u) => { if ((Math.round(u * 4000) & 63) === 0) g = 0.45 + w() * 0.55; return g * Math.min(1, u / 0.06, (1 - u) / 0.1); }), 0.22), lead: 0 }; } },
  type: { about: 'keyboard typing (dur)', fn: (o, r) => { const dur = o.dur ?? 0.8, parts = []; for (let t = 0; t < dur; t += 0.06 + r() * 0.06) parts.push([decay(biquad(noise(0.03, r), 'bp', 1800 + r() * 1800, 2), 0.006), 0.5 + r() * 0.5, t]); return { sig: peakTo(mix(...parts), 0.3), lead: 0 }; } },
  boing: { about: 'a spring: a jump, a playful reaction', fn: () => { const n = N(0.5), s = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const t = i / RATE; ph += (220 + 300 * (t / 0.5) + 60 * Math.sin(t * 70) * Math.exp(-t / 0.2)) / RATE; s[i] = sinp(ph) * Math.exp(-t / 0.18); } return { sig: peakTo(s, 0.4), lead: 0 }; } },
  slide: { about: 'slide whistle falling (dur)', fn: (o) => ({ sig: peakTo(glide(1500, 320, o.dur ?? 0.35, 99, 0.01), 0.35), lead: 0 }) },
  hit: { about: 'a short punch for a hard cut on the beat (kick + click; tech montages)', fn: (o, r) => ({ sig: peakTo(mix([glide(160 * (o.pitch ?? 1), 48, 0.2, 0.06)], [decay(biquad(noise(0.03, r), 'hp', 3500), 0.006), 0.7], [decay(biquad(noise(0.08, r), 'bp', 1800, 1), 0.02), 0.35]), 0.7), lead: 0 }) },
  subdrop: { about: 'an 808 sub falling away under a drop or a big reveal (dur)', fn: (o) => ({ sig: peakTo(drive(glide(110, 30, o.dur ?? 1.4, (o.dur ?? 1.4) * 0.45), 1.3), 0.8), lead: 0 }) },
  reverse: { about: 'a reversed cymbal swelling into the hit (dur; ends on `at`)', fn: (o, r) => { const dur = o.dur ?? 1.2, x = reverse(mix([decay(biquad(noise(dur, r), 'hp', 2500), dur * 0.3)], [decay(biquad(noise(dur, r), 'bp', 7000, 0.7), dur * 0.2), 0.6])); return { sig: peakTo(x, 0.4), lead: dur }; } },
  glitch: { about: 'a digital stutter burst: a glitch cut, data corrupting, a screen switching', fn: (o, r) => { const dur = o.dur ?? 0.3, parts = []; for (let t = 0; t < dur; t += 0.018 + r() * 0.03) { const g = r() < 0.5 ? osc('square', 300 + r() * 2400, 0.012 + r() * 0.02) : biquad(noise(0.015 + r() * 0.02, r), 'bp', 1000 + r() * 6000, 2); parts.push([decay(g, 0.02), 0.4 + r() * 0.6, t]); } return { sig: peakTo(crush(mix(...parts), 3, 6), 0.4), lead: 0 }; } },
  shutter: { about: 'camera shutter: a photo, a screenshot', fn: (o, r) => ({ sig: peakTo(mix([decay(biquad(noise(0.03, r), 'bp', 2200, 1.2), 0.005)], [decay(biquad(noise(0.05, r), 'bp', 1500, 0.9), 0.012), 0.8, 0.07]), 0.5), lead: 0 }) },
};

// A noise sweep with a pan from left to right; peaks at `peak` (0..1) of its length, which is the hit.
function sweep(dur, lo, hi, peak, r, gain) {
  const s = biquad(noise(dur, r), 'bp', (u) => lo + (hi - lo) * Math.sin(Math.PI * Math.min(1, u / peak / 2 + (u > peak ? (u - peak) / (1 - peak) / 2 : 0))), 1.1);
  shape(s, (u) => (u < peak ? Math.pow(u / peak, 2) : Math.exp(-((u - peak) / (1 - peak)) * 3.5)));
  peakTo(s, gain);
  const L = new Float32Array(s.length), R = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) { const p = i / s.length; L[i] = s[i] * Math.cos(p * Math.PI / 2); R[i] = s[i] * Math.sin(p * Math.PI / 2); }
  return { sig: [L, R], lead: dur * peak };
}

// Effect kits: the same names, re-voiced to live in the music's world. A chiptune film gets 8-bit blips,
// a cinematic one braams and booms, an organic one plucks and glockenspiel; `post` colours the whole kit.
const crush = (x, keep = 4, bits = 5) => { const q = Math.pow(2, bits - 1); let h = 0; for (let i = 0; i < x.length; i++) { if (i % keep === 0) h = Math.round(x[i] * q) / q; x[i] = h; } return x; };
const sq = (f, sec, duty = 0.25, bend = null) => decay(osc('pulse', f, sec, { duty, bend }), sec * 0.6, 0.001);
export const KITS = {
  clean: {},
  chip: {
    pop: (o, r, key) => peakTo(sq(key(o.note ?? 5, 5), 0.09, 0.25, (t) => 1 + Math.min(1, t / 0.03)), 0.4),
    tick: () => peakTo(sq(1760, 0.025, 0.5), 0.3),
    click: () => peakTo(sq(1200, 0.02, 0.5), 0.35),
    ding: (o, r, key) => peakTo(mix([sq(key(o.note ?? 5, 6), 0.09)], [sq(key((o.note ?? 5) + 3, 6), 0.4), 1, 0.08]), 0.4),
    chime: (o, r, key) => peakTo(mix(...[1, 3, 5, 8, 10, 12].map((d, i) => [sq(key(d, 5), 0.12), 1, i * 0.07])), 0.4),
    sparkle: (o, r, key) => peakTo(mix(...Array.from({ length: 8 }, (_, i) => [sq(key([1, 3, 5, 8][i % 4], 6 + (i > 3)), 0.06, 0.125), 1, i * 0.035])), 0.3),
    impact: (o, r) => peakTo(mix([crush(decay(noise(0.5, r), 0.12), 6, 4)], [sq(1, 0.5, 0.5, (t) => 160 * Math.exp(-t / 0.12) + 40), 0.9]), 0.8),
    thud: () => peakTo(sq(1, 0.18, 0.5, (t) => 140 * Math.exp(-t / 0.05) + 45), 0.6),
    boing: () => peakTo(sq(1, 0.4, 0.25, (t) => 300 + 500 * Math.abs(Math.sin(t * 18)) * Math.exp(-t / 0.2)), 0.4),
    count: (o) => { const dur = o.dur ?? 1.2, n = o.ticks ?? 18, parts = []; for (let k = 0; k < n; k++) parts.push([sq(1400 + 900 * (k / n), 0.025, 0.5), 0.6, (-Math.log2(1 - (k / n) * 0.999) / 10) * dur]); return peakTo(mix(...parts), 0.3); },
    riser: (o) => { const dur = o.dur ?? 0.8; return { sig: peakTo(shape(osc('pulse', 1, dur, { duty: 0.25, bend: (t) => 200 * Math.pow(6, t / dur) * (1 + 0.03 * Math.sin(t * 60)) }), (u) => u * u), 0.35), lead: dur }; },
  },
  lofi: {
    ding: (o, r, key) => peakTo(voice('rhodes')(key(o.note ?? 1, 5), 1.6, 0.7), 0.4),
    chime: (o, r, key) => peakTo(mix([voice('rhodes')(key(1, 5), 1.6, 0.6)], [voice('rhodes')(key(5, 5), 1.8, 0.7), 0.9, 0.13]), 0.42),
    post: (x) => drive(biquad(x, 'lp', 5200), 1.3),
  },
  cinematic: {
    impact: (o, r, key) => peakTo(mix([drive(ensemble(key(1, 2), 1.8, { voices: 5, spread: 0.01, cutoff: (u) => 300 + 2000 * Math.exp(-u * 4), att: 0.01, rel: 0.6 }, r), 1.5), 0.7], [glide(80, 32, 1.6, 0.5)], [decay(biquad(noise(1.2, r), 'hp', 3000), 0.5), 0.25]), 0.85),
    thud: (o, r) => peakTo(mix([glide(90 * (o.pitch ?? 1), 40, 0.6, 0.2)], [decay(biquad(noise(0.3, r), 'lp', 600), 0.08), 0.6]), 0.65),
    whoosh: (o, r) => sweep(o.dur ?? 0.8, 250, 1800, 0.65, r, 0.5),
    riser: (o, r, key) => { const dur = o.dur ?? 1.2, s = biquad(noise(dur, r), 'bp', (u) => 300 + 4000 * u * u, 0.7), st = ensemble(key(1, 3), dur, { voices: 5, spread: 0.01, cutoff: (u) => 400 + 4000 * u, att: dur * 0.6, rel: 0.02 }, r); return { sig: peakTo(shape(mix([s, 0.7], [st, 0.6]), (u) => Math.pow(u, 1.8) * (u > 0.97 ? (1 - u) / 0.03 : 1)), 0.45), lead: dur }; },
    chime: (o, r, key) => peakTo(mix([voice('piano')(key(1, 4), 2.5, 0.7, r)], [INSTRUMENTS.glass(key(5, 5), 2), 0.6, 0.12]), 0.42),
    ding: (o, r, key) => peakTo(voice('bell')(key(o.note ?? 1, 5), 2), 0.4),
  },
  organic: {
    pop: (o, r, key) => peakTo(voice('pizz')(key(o.note ?? 5, 5), 0.3, 0.7, r), 0.45),
    tick: (o, r) => peakTo(drum('woodblock')(r, 0.6), 0.25),
    ding: (o, r, key) => peakTo(voice('glock')(key(o.note ?? 1, 6), 1.6), 0.4),
    chime: (o, r, key) => peakTo(mix(...[1, 3, 5, 8].map((d, i) => [voice('harp')(key(d, 5), 1.6, 0.6, r), 1 - i * 0.1, i * 0.06])), 0.42),
    sparkle: (o, r, key) => peakTo(mix(...Array.from({ length: 6 }, (_, i) => [voice('glock')(key([1, 3, 5, 8, 10][Math.floor(r() * 5)], 6), 0.5), 0.5, i * 0.05 + r() * 0.02])), 0.3),
    impact: (o, r, key) => peakTo(mix([DRUMS.taiko(r)], [glide(key(1, 2), key(1, 2) * 0.7, 1.2, 0.4), 0.6]), 0.85),
  },
};

function renderSfx(p, hits, track) {
  const key = (degree, oct) => mtof(deg(p, Math.round(degree) - 1, oct - 4)); // 1-based scale degree in the film's key
  const kit = KITS[p.kit] || KITS.clean;
  hits.forEach((h, i) => {
    const r = rng(`${h.name}:${i}:${h.at}`);
    let out = kit[h.name] ? kit[h.name](h, r, key) : SFX[h.name].fn(h, r, key);
    if (out instanceof Float32Array) out = { sig: out, lead: 0 };
    let { sig, lead } = out;
    if (kit.post) sig = Array.isArray(sig) ? sig.map((c) => kit.post(c)) : kit.post(sig);
    const g = h.gain ?? 1;
    const at = h.at - lead;
    if (Array.isArray(sig)) { track.add(sig[0], at, g, -1); track.add(sig[1], at, g, 1); }
    else track.add(sig, at, g, h.pan ?? 0);
  });
}

// ---------- buffers and mix ----------

export class Track {
  constructor(sec) { this.n = N(sec); this.L = new Float32Array(this.n); this.R = new Float32Array(this.n); }
  // equal-power pan; pan ±1 sends the signal to one side only
  add(sig, at, gain = 1, pan = 0) {
    const a = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4, gl = Math.cos(a) * gain * Math.SQRT2, gr = Math.sin(a) * gain * Math.SQRT2;
    const hard = Math.abs(pan) >= 1;
    let o = Math.round(at * RATE), i0 = 0;
    if (o < 0) { i0 = -o; o = 0; }
    for (let i = i0, j = o; i < sig.length && j < this.n; i++, j++) {
      if (hard) { if (pan < 0) this.L[j] += sig[i] * gain; else this.R[j] += sig[i] * gain; }
      else { this.L[j] += sig[i] * gl; this.R[j] += sig[i] * gr; }
    }
  }
  scale(g) { for (let i = 0; i < this.n; i++) { this.L[i] *= g; this.R[i] *= g; } return this; }
}

// Integrated loudness, ITU-R BS.1770-4 (K-weighting, 400 ms blocks, 75 % overlap, both gates). 48 kHz.
export function loudness(L, R) {
  const kw = (x) => {
    const st = (x, b, a) => { const o = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const y = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; o[i] = y; } return o; };
    return st(st(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]), [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
  };
  const chans = [kw(L), ...(R ? [kw(R)] : [])];
  const size = Math.round(0.4 * RATE), hop = Math.round(0.1 * RATE), blocks = [];
  for (let s = 0; s + size <= chans[0].length; s += hop) {
    let z = 0;
    for (const c of chans) { let acc = 0; for (let i = s; i < s + size; i++) acc += c[i] * c[i]; z += acc / size; }
    blocks.push(z);
  }
  const lk = (z) => -0.691 + 10 * Math.log10(Math.max(z, 1e-12));
  const abs = blocks.filter((z) => lk(z) > -70);
  if (!abs.length) return -Infinity;
  const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((z) => lk(z) > rel);
  return lk(gated.reduce((a, b) => a + b, 0) / gated.length);
}

// Look-ahead peak limiter: the gain falls before a peak arrives and recovers over ~80 ms.
export function limit(t, ceiling) {
  const la = N(0.004), rel = Math.exp(-1 / (0.08 * RATE)), n = t.n;
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(t.L[i]), Math.abs(t.R[i])); need[i] = p > ceiling ? ceiling / p : 1; }
  const minAhead = new Float32Array(n), dq = [];
  for (let i = n - 1; i >= 0; i--) { // min over [i, i + la]
    while (dq.length && need[dq[dq.length - 1]] >= need[i]) dq.pop();
    dq.push(i);
    while (dq[0] > i + la) dq.shift();
    minAhead[i] = need[dq[0]];
  }
  let g = 1;
  for (let i = 0; i < n; i++) { g = Math.min(minAhead[i], 1 - (1 - g) * rel); t.L[i] *= g; t.R[i] *= g; }
  return t;
}

// Feed-forward RMS compressor, threshold relative to the track's own peak (dB below it), soft knee-free.
function compress(t, below, ratio, att = 0.008, rel = 0.15) {
  const thr = db(peakOf(t)) + below, a = Math.exp(-1 / (att * RATE)), r = Math.exp(-1 / (rel * RATE));
  let env2 = 0, g = 1;
  for (let i = 0; i < t.n; i++) {
    const x = Math.max(Math.abs(t.L[i]), Math.abs(t.R[i])) ** 2;
    env2 = x > env2 ? x + (env2 - x) * a : x + (env2 - x) * r;
    const lvl = 10 * Math.log10(env2 + 1e-12), over = lvl - thr;
    const target = over > 0 ? undb(-over * (1 - 1 / ratio)) : 1;
    g = target < g ? target + (g - target) * a : target + (g - target) * r;
    t.L[i] *= g; t.R[i] *= g;
  }
}
// Low-end balance: if the band under 120 Hz sits above 400 Hz–2 kHz (where laptops and
// phones actually play), shelve it down by the excess (up to 8 dB) — the measured rule from sound.md.
function balanceLows(t, over = 0) {
  const n = t.n, mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (t.L[i] + t.R[i]) / 2;
  const rms = (x) => { let a = 0; for (let i = 0; i < x.length; i++) a += x[i] * x[i]; return Math.sqrt(a / x.length); };
  const excess = db(rms(biquad(mono, 'lp', 120))) - db(rms(biquad(biquad(mono, 'hp', 400), 'lp', 2000))) - over;
  if (!(excess > 0)) return 0;
  const k = 1 - undb(-Math.min(8, excess));
  for (const ch of [t.L, t.R]) { const lo = biquad(ch, 'lp', 160); for (let i = 0; i < n; i++) ch[i] -= lo[i] * k; }
  return Math.min(8, excess);
}
const peakOf = (t) => { let m = 0; for (let i = 0; i < t.n; i++) m = Math.max(m, Math.abs(t.L[i]), Math.abs(t.R[i])); return m; };

// Music ducks under narration: -10 dB while a word is spoken (gaps under 0.3 s bridged), and the
// presence band (~1–4 kHz) where speech lives is carved a further ~5 dB, so the voice sits in a hole
// in the music instead of fighting it.
function duck(t, words, depth = 10) {
  if (!words?.length) return;
  const spans = [];
  for (const w of words) { const last = spans.at(-1); if (last && w.start - last[1] < 0.3) last[1] = Math.max(last[1], w.end); else spans.push([w.start, w.end]); }
  const target = new Float32Array(t.n).fill(1), low = undb(-depth);
  for (const [a, b] of spans) for (let i = Math.max(0, N(a - 0.06)); i < Math.min(t.n, N(b + 0.12)); i++) target[i] = low;
  const att = Math.exp(-1 / (0.06 * RATE)), rel = Math.exp(-1 / (0.35 * RATE));
  const bl = biquad(t.L, 'bp', 2200, 0.6), br = biquad(t.R, 'bp', 2200, 0.6), carve = 1 - undb(-5);
  let g = 1;
  for (let i = 0; i < t.n; i++) {
    const k = target[i] < g ? att : rel; g = target[i] + (g - target[i]) * k;
    const c = carve * (1 - g) / (1 - low);
    t.L[i] = (t.L[i] - bl[i] * c) * g; t.R[i] = (t.R[i] - br[i] * c) * g;
  }
}

// Gain automation for the music bus: the breath before the drop (down to near-silence for `suck`
// seconds, straight back on the downbeat), the ending (button/stop cuts everything at `end`), and a
// short dip under every big hit so the hit reads bigger than the music around it.
const DUCK_HITS = { impact: 6, stamp: 4, thud: 3, shutter: 2, hit: 2, subdrop: 3 };
// A fader ride by section energy, like a mixer pushing the chorus: 1.0 stays, each 0.1 below it is
// −1.2 dB (a verse at 0.6 sits ~5 dB under the drop, as in a mixed record), eased over 0.15 s at the cut. Without it the bus compressor and the loudness target level
// a 0.55 verse and a 1.0 drop to within a dB of each other, and the film has no contour.
function rideEnergy(t, sections, dur) {
  const target = new Float32Array(t.n).fill(1);
  sections.forEach((s, i) => { const g = undb(-12 * (1 - Math.min(1, s.energy))); for (let j = N(s.t); j < Math.min(t.n, N(sections[i + 1]?.t ?? dur + 1)); j++) target[j] = g; });
  const k = Math.exp(-1 / (0.05 * RATE));
  let g = target[0];
  for (let i = 0; i < t.n; i++) { g = target[i] + (g - target[i]) * k; t.L[i] *= g; t.R[i] *= g; }
}
function automate(p, hits) {
  const n = N(p.duration), g = new Float32Array(n).fill(1);
  const ramp = (at, len, from, to) => { const a = N(at), m = N(len); for (let i = 0; i < m && a + i < n; i++) if (a + i >= 0) g[a + i] = Math.min(g[a + i], from + (to - from) * (i / m)); };
  const hold = (at, until, v) => { for (let i = Math.max(0, N(at)); i < Math.min(n, N(until)); i++) g[i] = Math.min(g[i], v); };
  if (p.drop != null) { ramp(p.drop - p.suck, 0.03, 1, 0.03); hold(p.drop - p.suck + 0.03, p.drop - 0.003, 0.03); }
  if (p.end != null) { const len = p.ending === 'stop' ? 0.02 : 0.012; ramp(p.end, len, 1, 0); hold(p.end + len, p.duration + 1, 0); }
  for (const h of hits) {
    const d = DUCK_HITS[h.name];
    if (!d) continue;
    const low = undb(-d * Math.min(1.5, h.gain ?? 1));
    ramp(h.at - 0.01, 0.01, 1, low); hold(h.at, h.at + 0.08, low); ramp(h.at + 0.08, 0.3, low, 1);
  }
  return g;
}
// The mix, the way an engineer sets it up: each family through its own insert chain (EQ that keeps
// everything but bass and kick out of the low end, chorus and width on keys and pads, tempo delays on
// leads and plucks, drive on drums and bass), all sharing ONE reverb on a send so the band sits in one
// room, then a gentle glue compressor on the whole. Keys that are acoustic instruments skip the chorus.
const ACOUSTIC_KEYS = /piano|guitar|uke|pizz|strings|harp|guzheng/;
function mixBuses(p, bus, fxm, out) {
  const space = REVERBS[p.S.space || (p.kit === 'cinematic' || p.style.startsWith('ambient') ? 'hall' : p.kit === 'chip' ? 'room' : 'plate')];
  const sendL = new Float32Array(out.n), sendR = new Float32Array(out.n);
  const keysName = p.S.comp?.[0]?.[0] || '';
  const chainOf = { drums: CHANNELS.drums, bass: CHANNELS.bass, pad: CHANNELS.pad, lead: CHANNELS.lead, arp: CHANNELS.pluck,
    keys: ACOUSTIC_KEYS.test(keysName) ? [{ fx: 'eq', bands: [{ type: 'hp', f: 90 }, { type: 'peak', f: 280, gain: -1.5, q: 1 }] }, { fx: 'plate', wet: 0.16 }] : CHANNELS.keys };
  const room = (p.S.reverb?.[0] ?? 0.14) / 0.14; // the style's taste for space scales every send
  const run = (t, chain) => {
    const inserts = chain.filter((x) => x.fx !== 'plate'), send = chain.filter((x) => x.fx === 'plate').reduce((a, x) => a + (x.wet ?? 0.2), 0) * room;
    applyChain(t.L, t.R, inserts, { bpm: p.bpm });
    for (let i = 0; i < out.n; i++) { out.L[i] += t.L[i]; out.R[i] += t.R[i]; sendL[i] += t.L[i] * send; sendR[i] += t.R[i] * send; }
  };
  for (const [k, t] of Object.entries(bus)) run(t, chainOf[k] || []);
  run(fxm, [{ fx: 'eq', bands: [{ type: 'hp', f: 40 }] }, { fx: 'plate', wet: 0.15 }]);
  const dryL = sendL.slice(), dryR = sendR.slice();
  plate(sendL, sendR, { ...space, wet: 1 });
  for (let i = 0; i < out.n; i++) { out.L[i] += (sendL[i] - dryL[i]) * 1.8; out.R[i] += (sendR[i] - dryR[i]) * 1.8; }
  glue(out.L, out.R, { ...CHANNELS.bus[0] });
}

// A low-pass that opens from ~700 Hz to fully open between `from` and `to` (seconds): the classic build.
function buildSweep(t, from, to) {
  if (!(to > from) || from < 0) return;
  const n = t.n, fc = (u) => { const tt = u * n / RATE; if (tt < from || tt > to + 0.05) return 20000; const x = Math.min(1, (tt - from) / (to - from)); return 700 * Math.pow(20000 / 700, x * x); };
  t.L.set(biquad(t.L, 'lp', fc, 0.9)); t.R.set(biquad(t.R, 'lp', fc, 0.9));
}
const applyGain = (t, g) => { for (let i = 0; i < t.n; i++) { t.L[i] *= g[i]; t.R[i] *= g[i]; } };

export function toWav(t) {
  const n = t.n, buf = Buffer.alloc(44 + n * 4), r = rng(1);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  const q = (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767 + (r() - r()))));
  for (let i = 0; i < n; i++) { buf.writeInt16LE(q(t.L[i]), 44 + i * 4); buf.writeInt16LE(q(t.R[i]), 46 + i * 4); }
  return buf;
}

// 16-bit / 32-bit-float PCM WAV → mono Float32 at its own rate (enough to measure a narration's level).
export function readWav(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF') return null;
  let p = 12, fmt = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4), body = p + 8;
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(body), ch: b.readUInt16LE(body + 2), rate: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
    if (id === 'data' && fmt) {
      const bytes = fmt.bits / 8, frames = Math.floor(Math.min(size, b.length - body) / (bytes * fmt.ch)), o = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let s = 0;
        for (let c = 0; c < fmt.ch; c++) {
          const at = body + (i * fmt.ch + c) * bytes;
          s += fmt.tag === 3 && bytes === 4 ? b.readFloatLE(at) : bytes === 2 ? b.readInt16LE(at) / 32768 : bytes === 3 ? b.readIntLE(at, 3) / 8388608 : bytes === 4 ? b.readInt32LE(at) / 2147483648 : 0;
        }
        o[i] = s / fmt.ch;
      }
      return { rate: fmt.rate, data: o };
    }
    p = body + size + (size & 1);
  }
  return null;
}

// ---------- reading the composition ----------

// The browser lookup lives in browser.js (an installed Chrome first, nothing downloaded); kept exported from here for callers.
export { findChrome };

// Load the page in Chrome (the same engine as the render: variables at their defaults, fonts and ready promises
// awaited) and read the timeline back: labels, OM.sfx hits, OM.music options. `html` is the text about to be
// written, which may be newer than the file on disk. `page`: a page that already has index.html loaded and not yet
// seeked (om render lends one of its browsers) — read it instead of opening another.
export async function probe(project, html, page = null) {
  let film = page;
  if (!film) {
    try { film = await openFilm(project.index, { html, lenient: true, video: 'seek' }); }
    catch (e) { throw e instanceof OmError ? e : new OmError(`could not read the timeline from index.html (${e.message})`); }
  }
  try {
    const out = JSON.parse(await film.evaluate(`JSON.stringify((() => { const o = { errors: [] }; try { const k = Object.keys(window.__timelines || {}); const tl = k.length && window.__timelines[k[0]]; if (tl) { o.id = k[0]; o.duration = tl.duration(); o.labels = tl.labels; } const s = window.__om && window.__om.sound && window.__om.sound(); if (s) { o.hits = s.hits; o.music = s.music; } } catch (e) { o.errors.push(String(e.message)); } return o; })())`));
    out.errors.push(...film.errors);
    if (!(out.duration > 0)) throw new OmError(`index.html has no timeline in window.__timelines${out.errors.length ? ` — the page threw: ${out.errors[0]}` : ''}`);
    return out;
  } finally { if (!page) await film.close(); }
}

const CUES = /<script\b[^>]*\sid\s*=\s*["']om-cues["'][^>]*>([\s\S]*?)<\/script>/i;
const VOICE = /<audio\b[^>]*\sid\s*=\s*["']om-voice["'][^>]*>/i;
const SOUND = /<audio\b[^>]*\sid\s*=\s*["']om-sound["'][^>]*>(?:\s*<\/audio>)?/i;
const ROOT = /<([a-z][\w-]*)\b[^>]*\sdata-composition-id\s*=\s*["'][^"']+["'][^>]*>/i;

export const hasSound = (html) => SOUND.test(html.replace(/<!--[\s\S]*?-->/g, ''));

function attrs(tag) {
  const out = {};
  const inner = (/^<[\w-]+((?:[^>"']|"[^"]*"|'[^']*')*)>/.exec(tag)?.[1] || '').replace(/\/$/, '');
  for (const m of inner.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) out[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

// <audio id="om-sound"> right after the root's opening tag; the user's own attributes (volume…) are kept.
export function applySound(html, { src, duration, off = false }) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, (c) => ' '.repeat(c.length));
  const old = SOUND.exec(clean);
  if (off) return old ? html.slice(0, old.index) + html.slice(old.index + old[0].length).replace(/^\n\s*/, '\n') : html;
  const prev = old ? attrs(html.slice(old.index, old.index + old[0].length)) : {};
  const a = { id: 'om-sound', src, 'data-start': prev['data-start'] ?? '0', 'data-duration': String(r3(duration)), 'data-track-index': prev['data-track-index'] ?? '8', 'data-volume': prev['data-volume'] ?? '1' };
  for (const [k, v] of Object.entries(prev)) if (!(k in a)) a[k] = v;
  const tag = `<audio ${Object.entries(a).map(([k, v]) => `${k}="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join(' ')}></audio>`;
  if (old) return html.slice(0, old.index) + tag + html.slice(old.index + old[0].length);
  const root = ROOT.exec(clean);
  if (!root) throw new OmError('index.html has no root element with data-composition-id');
  const at = root.index + root[0].length;
  return html.slice(0, at) + `\n  ${tag}` + html.slice(at);
}

// Projects made with an older runtime (before OM.sfx, or before OM.vars typed its values) get vendor/om.js (and the clip engine)
// refreshed from this package when they lack the marker. The old copies go to .om/vendor-backup.
export function refreshRuntime(project, log) {
  const pairs = [['runtime/om.js', 'vendor/om.js', 'arrive typed as declared'], ['runtime/clip/clip.js', 'vendor/clip/clip.js', 'C.SFX']];
  for (const [from, to, marker] of pairs) {
    const target = join(project.root, to);
    if (!existsSync(target) || readFileSync(target, 'utf8').includes(marker)) continue;
    const backup = join(project.om, 'vendor-backup');
    mkdirSync(backup, { recursive: true });
    copyFileSync(target, join(backup, `${to.replace(/[\\/]/g, '_')}.${Date.now()}`));
    copyFileSync(join(PKG, from), target);
    log(`updated  ${to} to the current runtime (old copy in .om/vendor-backup)`);
  }
}

// ---------- the command ----------

export const SFX_HELP = () => Object.entries(SFX).map(([k, v]) => `  ${k.padEnd(8)} ${v.about}`).join('\n');

// The whole soundtrack from a probe (what index.html declares): score, effects, automation, mix, master.
// With `score` (the om-score ABC text) the music is the agent's composition, fitted to the picture; otherwise
// score.js composes it from the style.
export function mixdown(p0, { voiced = false, words = [], voiceLufs = null, musicOff = false, score = null } = {}) {
  let p;
  try { p = plan({ ...p0, voice: voiced }); } catch (e) { throw new OmError(e.message); }
  const hits = (p0.hits || []).filter((h) => h.at <= p.duration + 0.5);
  const unknown = [...new Set(hits.filter((h) => !SFX[h.name]).map((h) => h.name))];
  if (unknown.length) throw new OmError(`unknown sound effect${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')} — available: ${Object.keys(SFX).join(', ')}`);
  const musicOn = !(p0.music?.off || musicOff);

  const music = new Track(p.duration), fxm = new Track(p.duration);
  let trackInfo = null, composed = null;
  if (musicOn && score) {
    try { composed = renderComposed(score, { labels: p0.labels, marks: p0.music?.marks, duration: p.duration, seed: p.seed }); } catch (e) { throw new OmError(`om-score: ${e.message}`); }
    if (!p0.music?.kit) p.kit = 'cinematic'; // a written score's hits and risers are orchestral by default
    hits.push(...composed.hits);
    music.L.set(composed.music.L); music.R.set(composed.music.R);
    applyGain(music, automate({ ...p, drop: null, end: null }, hits)); // the score writes its own breaths and endings; big hits still duck it
    if (composed.perf.end > p.duration - 0.3) { const f = Math.min(1.2, p.duration * 0.1); for (let i = 0; i < music.n; i++) { const g = Math.min(1, (p.duration - i / RATE) / f); music.L[i] *= g; music.R[i] *= g; } }
    balanceLows(music);
    duck(music, words);
  } else if (musicOn) {
    const r = rng(`music:${p.style}:${p.seed}:${p.bpm}`);
    const bus = Object.fromEntries(['pad', 'bass', 'drums', 'keys', 'arp', 'lead'].map((k) => [k, new Track(p.duration)]));
    const { kicks } = renderScore(p, { music, ...bus, fx: fxm }, r);
    pump(bus.pad, kicks, p.S.pump || 0, p.B);
    pump(bus.bass, kicks, 0.5, p.B, 0.35); // the bass steps aside for the kick, so the low end is one punch, not mud
    // the per-family insert chains + shared reverb lost blind comparisons to the plain sum (2026-10-17); opt in while it is tuned
    if (process.env.OM_MIX === 'chains') mixBuses(p, bus, fxm, music);
    else {
      for (const t of [...Object.values(bus), fxm]) for (let i = 0; i < music.n; i++) { music.L[i] += t.L[i]; music.R[i] += t.R[i]; }
      const [wet, size] = p.S.reverb || [0.12, 1];
      reverb(music.L, music.R, wet, size);
    }
    if (p.drop != null) buildSweep(music, p.drop - 2 * 4 * p.B, p.drop - p.suck); // the build opens up from muffled to bright
    rideEnergy(music, p.sections, p.duration); // more layers alone don't read as louder once the master is levelled
    applyGain(music, automate(p, hits));
    const fade = p.end != null ? 0 : Math.min(1.2, p.duration * 0.1);
    for (let i = 0; i < music.n; i++) { const t = i / RATE, g = Math.min(1, t / 0.03, fade ? (p.duration - t) / fade : 1); music.L[i] *= g; music.R[i] *= g; }
    master(p, music.L, music.R, r);
    balanceLows(music);
    duck(music, words);
  }
  const fx = new Track(p.duration);
  renderSfx(p, hits, fx);
  const [mw, ms] = (musicOn && p.S.reverb) || [0.12, 1];
  reverb(fx.L, fx.R, Math.max(0.08, mw * 0.6), ms); // the effects live in the music's room

  // Levels. Alone: music at -18 LUFS, effects on top, master normalized to -14 LUFS (where social feeds normalize). Under narration
  // the bed sits ~12 LU below the voice so speech stays clear.
  const musicTarget = voiced ? (voiceLufs != null && isFinite(voiceLufs) ? voiceLufs - 12 : -28) : -18;
  const ml = musicOn ? loudness(music.L, music.R) : -Infinity;
  if (isFinite(ml)) music.scale(undb(musicTarget - ml));
  const fxGain = undb(voiced ? musicTarget + 18 + 4 : -2); // effects were levelled against a -18 LUFS bed; a little hotter under a voice
  const out2 = new Track(p.duration);
  for (let i = 0; i < out2.n; i++) { out2.L[i] = music.L[i] + fx.L[i] * fxGain; out2.R[i] = music.R[i] + fx.R[i] * fxGain; }
  out2.L = biquad(out2.L, 'hp', 30); out2.R = biquad(out2.R, 'hp', 30); // no sub rumble: speakers can't play it, limiters choke on it
  compress(out2, -16, 2.5); // glue: one gentle bus compressor before the level is set, so peaky films still reach it
  if (!voiced) { const l = loudness(out2.L, out2.R); if (isFinite(l)) out2.scale(undb(-14 - l)); }
  limit(out2, undb(-1.5));
  const finalLufs = loudness(out2.L, out2.R), peak = db(peakOf(out2));

  return { p, hits, out2, finalLufs, peak, musicOn, musicTarget, trackInfo, composed: composed?.report || null };
}

export const LIST = () => [
  `Effects for OM.sfx(name, at, { gain, pan, pitch, note, dur }):\n${SFX_HELP()}`,
  `\nProducts for OM.music({ product }) — three directions each, picked by the film's seed (brand or id); variant: 0–2 or seed: n to choose or reroll:`,
  ...Object.entries(PRODUCTS).map(([k, v]) => `  ${k.padEnd(10)} ${v.about.padEnd(36)} ${v.styles.join(' · ')}`),
  `\nStyles for OM.music({ style }) (style:variant where listed):`,
  ...Object.entries(STYLES).map(([k, v]) => `  ${k.padEnd(10)} ${v.about}${v.variants ? `  [${Object.keys(v.variants).join(', ')}]` : ''}`),
  `\nStructure: drop: 'sceneId' | seconds (a breath, then the full band) · ending: 'ring' | 'button' | 'stop' (+ end: seconds) · motif: [degrees] · brand: 'Name' · energy: { sceneId: 0..1 }`,
  `Legacy moods (mallet style): ${Object.keys(MOODS).join(', ')}`,
].join('\n');

// The source of every module the soundtrack is computed by (sound.js and what it imports, minus the browser side,
// which only reads the timeline): a change there makes the next run rebuild instead of reusing an old wav.
const BROWSER_SIDE = new Set(['browser.js', 'capture.js', 'cdp.js', 'project.js']);
function soundCode(dir, file = 'sound.js', seen = new Map()) {
  if (seen.has(file) || BROWSER_SIDE.has(file)) return [...seen.values()];
  const text = readFileSync(join(dir, file), 'utf8');
  seen.set(file, text);
  for (const m of text.matchAll(/from\s+['"]\.\/([\w-]+\.js)['"]/g)) soundCode(dir, m[1], seen);
  return [...seen.values()];
}

export async function sound(project, opts = {}, log = () => {}) {
  const t0 = Date.now();
  if (opts.list) return LIST();
  let { html, token } = readSource(project);
  if (opts.off) {
    const out = applySound(html, { off: true });
    if (out !== html) writeSource(project, out, token, 'om sound --off');
    return 'sound    removed <audio id="om-sound"> — the film is silent (assets/sound.wav is kept)';
  }
  refreshRuntime(project, log);
  const p0 = await probe(project, html, opts.page);
  if (p0.errors?.length) log(`warning  the page reported: ${p0.errors.slice(0, 3).join(' | ')}`);
  const cues = CUES.exec(html);
  let words = [];
  try { words = cues ? JSON.parse(cues[1]).words || [] : []; } catch { /* no words */ }
  const voiceTag = VOICE.exec(html);
  const voiceFile = voiceTag ? join(project.root, attrs(voiceTag[0]).src || 'assets/voice.wav') : null;
  let voiceLufs = null;
  if (voiceFile && existsSync(voiceFile)) {
    const w = readWav(voiceFile);
    if (w && w.rate === RATE) voiceLufs = loudness(w.data, null) + 3; // a mono voice plays on both speakers: +3 LU over one channel
  }
  // The soundtrack is a pure function of what the page declares, the score, the voice, the sample pack and this code:
  // when none of them changed since the last run, assets/sound.wav is already the answer (a render calls this every time).
  const LIB = dirname(fileURLToPath(import.meta.url));
  const stamp = (f) => { try { const st = statSync(f); return `${st.size}:${st.mtimeMs}`; } catch { return null; } };
  const key = createHash('sha256').update(JSON.stringify({
    p0: { ...p0, errors: undefined }, words, score: readScore(html), voiced: !!voiceTag, voice: voiceFile && stamp(voiceFile), music: opts.music || null,
    pack: process.env.OM_SAMPLES === 'off' ? 'off' : stamp(join(packDir(), 'manifest.json')),
    code: soundCode(LIB),
  })).digest('hex');
  const assets = join(project.root, 'assets'), wav = join(assets, 'sound.wav'), memo = join(project.om, 'sound.json');
  if (!opts.fresh) {
    let m = null;
    try { m = JSON.parse(readFileSync(memo, 'utf8')); } catch { /* first run */ }
    if (m && m.key === key && stamp(wav) === m.wav) {
      const fresh = readSource(project);
      const out = applySound(fresh.html, { src: 'assets/sound.wav', duration: m.duration });
      if (out !== fresh.html) { writeSource(project, out, fresh.token, 'om sound'); opts.onWrite?.(); }
      return m.report.replace(/^took .*$/m, `took     ${((Date.now() - t0) / 1000).toFixed(1)}s — nothing changed since the last run, assets/sound.wav reused (--fresh rebuilds it)`);
    }
  }
  const { p, hits, out2, finalLufs, peak, musicOn, musicTarget, trackInfo, composed } = mixdown(p0, { voiced: !!voiceTag, words, voiceLufs, musicOff: opts.music === 'off', score: readScore(html) });
  mkdirSync(assets, { recursive: true });
  writeFileSync(wav, toWav(out2));
  const fresh = readSource(project);
  const out = applySound(fresh.html, { src: 'assets/sound.wav', duration: p.duration });
  if (out !== fresh.html) { writeSource(project, out, fresh.token, 'om sound'); opts.onWrite?.(); }

  const counts = {};
  for (const h of hits) counts[h.name] = (counts[h.name] || 0) + 1;
  const lines = [
    `sound    ${join(assets, 'sound.wav')}  ${p.duration.toFixed(2)}s  ${finalLufs.toFixed(1)} LUFS, peak ${peak.toFixed(1)} dBFS`,
    !musicOn ? 'music    off' : composed ? `music    om-score "${composed.title}" · ${composed.notes} notes · ${composed.voices.join(' ')} · ends ${composed.end.toFixed(2)}s`
      : `music    ${trackInfo || describe(p)} · ${p.sections.length} section${p.sections.length > 1 ? 's' : ''} (${p.sections.map((s) => `${s.id}${s.drop ? '◆' : ''}:${s.energy.toFixed(1)}`).join(' ')})`,
  ];
  if (composed) {
    try { lines.push(...soundprintReport(project.root, readScore(html)).lines); } catch { /* a score the print cannot read still plays */ }
    lines.push(`fit      ${composed.marks.length ? `marks on the picture: ${composed.marks.join(' · ')}` : 'no !mark:name! matched a scene label — the score plays from the start at its written tempo'}${composed.unmatched.length ? ` · unmatched: ${composed.unmatched.join(', ')}` : ''}`);
    if (composed.stretches.length) lines.push(`tempo    ${composed.stretches.map((x) => `${x.from}→${x.to} ${x.qpm.toFixed(1)} bpm (${x.bend >= 0 ? '+' : ''}${(x.bend * 100).toFixed(1)}%)`).join(' · ')}${composed.stretches.some((x) => Math.abs(x.bend) > 0.08) ? ' — a stretch bent more than 8 %: add or remove bars there instead' : ''}`);
    for (const w of (composed.warnings || []).slice(0, 6)) lines.push(`warning  score: ${w}`);
    if ((composed.warnings || []).length > 6) lines.push(`warning  score: … and ${composed.warnings.length - 6} more bars that do not add up`);
    if (composed.end > p.duration + 0.3) lines.push(`warning  the score runs to ${composed.end.toFixed(2)}s, past the film's end (${p.duration.toFixed(2)}s); it is faded out`);
  }
  if (musicOn && !trackInfo && !composed) {
    lines.push(`shape    ${p.drop != null ? `drop at ${p.drop.toFixed(2)}s after a ${p.suck.toFixed(2)}s breath · ` : 'no drop (OM.music({ drop: \'sceneId\' }) gives the hero moment a breath and the full band) · '}ending ${p.ending}${p.end != null ? ` at ${p.end.toFixed(2)}s` : ''} · motif ${p.motif.d.map((d) => d + 1).join('-')} · effects kit ${p.kit}`);
    if (p.product) lines.push(`options  ${p.product}: ${PRODUCTS[p.product].styles.map((s, i) => (i === p.choice ? `[${s}]` : s)).join(' · ')} — variant: n picks another, seed: n rerolls key/loop/motif`);
  }
  if (musicOn && !composed && p.sections.length > 1) lines.push(`grid     every scene starts its music on its cut; the beat bends by up to ${Math.round(p.gridError * 1000)} ms there${p.gridError > 0.06 ? ' — OM.music({ bpm }) + OM.beat(n) keeps the pulse steady across cuts' : ''}`);
  // the energy curve you can't hear: loudness of each stretch between the score's marks (or the scenes)
  if (musicOn) {
    const pts = (composed ? composed.points : p.sections.map((x) => ({ name: x.id, at: x.t }))).filter((x) => x.at >= 0 && x.at < p.duration).sort((a, b) => a.at - b.at);
    if (!pts.length || pts[0].at > 0.5) pts.unshift({ name: 'start', at: 0 });
    const lv = pts.map((x, i) => { const a = N(x.at), z = Math.min(out2.n, N(pts[i + 1]?.at ?? p.duration)); let e = 0; for (let j = a; j < z; j++) e += (out2.L[j] * out2.L[j] + out2.R[j] * out2.R[j]) / 2; return { name: x.name, db: 10 * Math.log10(e / Math.max(1, z - a) + 1e-12) }; });
    const body = lv.length > 2 ? lv.slice(0, -1) : lv; // the last stretch is the ending ringing out
    const flat = body.length >= 3 && Math.max(...body.map((x) => x.db)) - Math.min(...body.map((x) => x.db)) < 3;
    lines.push(`energy   ${lv.map((x) => `${x.name} ${x.db.toFixed(1)}`).join(' · ')} dB RMS${flat ? ' — flat: every stretch within 3 dB, the film has no contour; give it a stop and a peak (rhythm.md)' : ' — should rise in steps, dip at the stop and peak at the drop (rhythm.md)'}`);
  }
  lines.push(hits.length ? `effects  ${hits.length} hits: ${Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(', ')}` : 'effects  none — mark the moments that land with OM.sfx(name, at) (om sound --list); a film without hits sounds like a slideshow');
  if (voiceTag) lines.push(`voice    music ducked −10 dB and carved around 2 kHz under ${words.length} words; bed ${musicTarget.toFixed(1)} LUFS${voiceLufs != null ? ` (voice ${voiceLufs.toFixed(1)})` : ''}`);
  lines.push(`took     ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  mkdirSync(project.om, { recursive: true });
  writeFileSync(memo, JSON.stringify({ key, wav: stamp(wav), duration: p.duration, report: lines.join('\n') }));
  return lines.join('\n');
}
