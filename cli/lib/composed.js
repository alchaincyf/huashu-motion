// A score written for the film. When index.html carries <script type="text/vnd.abc" id="om-score">, the
// agent has composed the music itself (composer.js reads and performs it); this file plays that performance
// on the instruments, fits it to the picture and hands back a music track plus the sound design the score
// asks for. The rule-based styles in score.js are the fallback when there is no score.
//
// Fitting: every !mark:name! in the score lands on the timeline label `scene:name` (or `name`), or on a time
// given in OM.music({ marks: { name: seconds } }). Instruments: any voice of score.js by name (inst=piano,
// strings, horn, pizz, harp, marimba, synbass, supersaw…), and inst=drums with kit=pop|acoustic|808|cinematic|lofi|gated|chip|folk.
import { parseAbc, perform, renderPerformance } from './composer.js';
import { N, RATE, biquad, rng } from './dsp.js';
import { plate } from './fx.js';
import { hasSample, hitStereo, samplerStereo } from './samples.js';
import { SECTIONS, drum, sectioned, voice } from './score.js';

export const SCORE = /<script\b[^>]*\sid\s*=\s*["']om-score["'][^>]*>([\s\S]*?)<\/script>/i;
export const readScore = (html) => SCORE.exec(html.replace(/<!--[\s\S]*?-->/g, (c) => ' '.repeat(c.length)))?.[1] ?? null;

// recorded kits for the drum map: the pop and acoustic kits are a real kit, the 808 kit the synth percussion
const RECORDED = {
  pop: { kick: 'pk_kick', snare: 'pk_snare', hat: 'pk_hat', ohat: 'pk_ohat', crash: 'pk_crash', tom: 'pk_tom', rim: 'pk_rim', ride: 'pk_ride' },
  acoustic: { kick: 'pk_kick', snare: 'pk_snare', hat: 'pk_hat', ohat: 'pk_ohat', crash: 'pk_crash', tom: 'pk_tom', rim: 'pk_rim', ride: 'pk_ride' },
  808: { kick: 'ek_kick', snare: 'ek_snare', clap: 'ek_clap', hat: 'ek_hat', ohat: 'ek_ohat' },
};

// The bowed section: the same note twice, 4 cents and 14 ms apart and mirrored left/right, so one line
// sounds like a row of players rather than one sample.
function section(one) {
  return (f, sec, vel, r) => {
    const a = one(f, sec, vel, r), b = one(f * 1.0023, sec, vel * 0.92, r), d = N(0.014);
    const L = new Float32Array(a.L.length + d), R = new Float32Array(a.L.length + d);
    for (let i = 0; i < a.L.length; i++) { L[i] += a.L[i] * 0.75; R[i] += a.R[i] * 0.75; }
    for (let i = 0; i < b.L.length; i++) { L[i + d] += b.R[i] * 0.6; R[i + d] += b.L[i] * 0.6; }
    return { L, R };
  };
}

// The editor's moves on the finished mix (a span ends at `at`, lasts `dur`): filter opens from 250 Hz to
// full range, stop decelerates the tape to a halt, stutter loops the span's first sixteenth.
// After a stop the band stays stopped: what was still ringing (reverb tails, held pads) is silenced until the next
// note starts; otherwise the tails come back right after the halt and the stop sounds like a skip and a cut.
function edits(L, R, cues, notes = []) {
  for (const c of cues) {
    if (!['filter', 'stop', 'stutter'].includes(c.type) || !(c.dur > 0)) continue;
    const a = Math.max(0, N(c.at - c.dur)), z = Math.min(L.length, N(c.at)), n = z - a;
    if (n < 64) continue;
    for (const x of [L, R]) {
      const seg = x.slice(a, z);
      let out;
      if (c.type === 'filter') out = biquad(seg, 'lp', (u) => 250 * Math.pow(18000 / 250, u * u), 0.9);
      else if (c.type === 'stop') {
        out = new Float32Array(n);
        let pos = 0;
        for (let i = 0; i < n; i++) { const u = i / n, j = Math.floor(pos), f = pos - j; out[i] = ((seg[j] ?? 0) * (1 - f) + (seg[j + 1] ?? 0) * f) * (1 - u * u); pos += Math.max(0, 1 - u); }
        const next = notes.reduce((m, o) => (o.t > c.at + 0.02 && o.t < m ? o.t : m), Infinity);
        const back = Math.min(x.length, Number.isFinite(next) ? N(next) - N(0.004) : x.length), fadeIn = N(0.004);
        for (let i = z; i < back; i++) x[i] = 0;
        for (let i = 0; i < fadeIn && back + i < x.length; i++) x[back + i] *= i / fadeIn;
      } else {
        const len = Math.max(64, N(c.step)), fade = Math.min(96, len >> 3);
        out = new Float32Array(n);
        for (let i = 0; i < n; i++) { const k = i % len, g = Math.min(1, k / fade, (len - k) / fade); out[i] = seg[k] * g * (0.75 + 0.25 * i / n); }
      }
      x.set(out, a);
    }
  }
}

// score text + the film's timeline → { music: { L, R }, hits, perf, title, report }
export function renderComposed(text, { labels = {}, marks = {}, duration, seed = 1 }) {
  const score = parseAbc(text);
  if (!score.events.length) throw new Error('om-score has no notes');
  const align = {};
  for (const c of score.cues) {
    if (c.type !== 'mark') continue;
    const t = marks[c.name] ?? labels[`scene:${c.name}`] ?? labels[c.name];
    if (t != null) align[c.name] = Number(t);
  }
  const perf = perform(score, { start: 0.05, seed, align: Object.keys(align).length ? align : null });

  const stereo = {};
  // stereo recordings where the pack has them; bowed sections are doubled into a row of players (a solo violin is one player)
  const inst = (name) => {
    if (name in stereo) return stereo[name] || voice(name);
    let v = null;
    if (name === 'piano') v = hasSample('piano') && samplerStereo('piano', { release: true });
    else if (name === 'horn') v = hasSample('horn') && samplerStereo('horn', { release: 0.3 });
    else if (SECTIONS[name]) v = sectioned(SECTIONS[name], { release: 0.45, gain: 0.8 }, samplerStereo) || (hasSample('strings') && samplerStereo('strings', { release: 0.45, gain: 0.8 }));
    else if (['violins', 'violas', 'celli', 'basses', 'trem', 'violin'].includes(name)) v = hasSample(name) && samplerStereo(name, { release: name === 'trem' ? 0.3 : 0.45, gain: name === 'violin' ? 1 : 0.8 });
    if (v && name !== 'piano' && name !== 'horn' && name !== 'violin') v = section(v);
    stereo[name] = v || null;
    return v || voice(name);
  };
  const hits = {};
  const drumFn = (name, acoustic, kit) => { const id = RECORDED[kit]?.[name]; return (id && hasSample(id) && (hits[id] ??= hitStereo(id))) || drum(name, acoustic); };

  const n = N(duration), mk = () => ({ L: new Float32Array(n), R: new Float32Array(n) });
  const bus = { keys: mk(), pad: mk(), drums: mk(), bass: mk() };
  const add = (b, sig, t, g, pan) => {
    const o = Math.round(t * RATE), T = bus[b];
    const put = (x, side, gain) => { for (let i = Math.max(0, -o), j = o + i; i < x.length && j < n; i++, j++) T[side][j] += x[i] * gain; };
    const p = Math.max(-1, Math.min(1, pan));
    if (sig.L) { const q = p * 0.6; put(sig.L, 'L', g * (q > 0 ? 1 - q : 1)); put(sig.R, 'R', g * (q < 0 ? 1 + q : 1)); return; }
    const a = (p + 1) * Math.PI / 4; put(sig, 'L', g * Math.cos(a) * Math.SQRT2); put(sig, 'R', g * Math.sin(a) * Math.SQRT2);
  };
  const busOf = (x) => (/strings|lowstr|violin|viola|celli|basses|trem|horn|pad|warmpad|flute|erhu/.test(x.inst) ? 'pad' : /bass|sub808/.test(x.inst) ? 'bass' : 'keys');
  renderPerformance(perf, add, inst, rng(`score:${seed}`), { busOf, drumFn });

  // the room follows the film: quiet before the reveal wants space, the full band after it wants clarity
  const reveal = perf.cues.find((c) => c.type === 'hit')?.at ?? perf.cues.find((c) => c.type === 'mark' && /reveal|drop|hero/.test(c.name))?.at ?? Infinity;
  const send = { keys: 0.17, pad: 0.19, drums: 0.045, bass: 0 };
  const space = (i) => { const x = (i / RATE - reveal + 0.6) / 0.6; return x <= 0 ? 1.5 : x >= 1 ? 1 : 1.5 - 0.5 * x; };
  const L = new Float32Array(n), R = new Float32Array(n), sL = new Float32Array(n), sR = new Float32Array(n);
  for (const [k, T] of Object.entries(bus)) for (let i = 0; i < n; i++) { const w = send[k] * space(i); L[i] += T.L[i]; R[i] += T.R[i]; sL[i] += T.L[i] * w; sR[i] += T.R[i] * w; }
  plate(sL, sR, { preset: 'hall', wet: 1 });
  for (let i = 0; i < n; i++) { L[i] += sL[i]; R[i] += sR[i]; }

  edits(L, R, perf.cues, perf.notes);

  // sound design the score asks for, as ordinary effects (they go through the film's kit and ducking)
  const sfx = perf.cues.flatMap((c) => (c.type === 'hit' ? [{ name: 'impact', at: c.at, gain: 0.9 }, { name: 'subdrop', at: c.at, gain: 0.6 }]
    : c.type === 'rise' ? [{ name: 'riser', at: c.at, dur: Math.max(0.4, c.dur), gain: 0.7 }] : []));
  const fitted = perf.fit;
  const report = {
    title: score.title || 'untitled', notes: perf.notes.length, voices: score.order.map((v) => `${v}:${score.voices[v].inst}`), end: perf.end,
    marks: (fitted?.marks || []).map((m) => `${m.name} ${m.at.toFixed(2)}s`), points: perf.cues.filter((c) => c.type === 'mark').map((c) => ({ name: c.name, at: c.at })), unmatched: score.cues.filter((c) => c.type === 'mark' && align[c.name] == null).map((c) => c.name), warnings: score.warnings || [],
    stretches: fitted?.stretches || [], start: perf.start,
  };
  return { music: { L, R }, hits: sfx, perf, report };
}
