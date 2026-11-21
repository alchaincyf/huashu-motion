// om beats — find the pulse of a piece of music someone else made (their own track, an AI-generated one), so
// scene cuts can sit on real beats instead of a synthesized grid. Pure JS, no dependencies; ffmpeg is only
// used to decode. Method: spectral-flux onset envelope (3 bands, bass weighted, hop 10 ms) → autocorrelation
// for the period → Ellis (2007) dynamic-programming beat tracker for the phase → a robust line fit through the
// tracked beats (sub-frame accuracy, drift-free tempo) → downbeat from bass accent + energy rise on 4 phases →
// bar-level loudness for sections and drops.
//
// analyzeFile(file) / analyze(pcm) returns (all times in seconds from the start of the audio):
//   {
//     bpm,         // fitted over the whole track (not an integer, e.g. 127.98); a steady tempo comes out to ~0.01 bpm
//     confidence,  // 0–1; < 0.3 means "no clear pulse": bpm/beats/downbeats are a best guess, trust `sections`;
//                  // lowered (at most by half) when another count of the pulse (3:4, 4:3, 2:3, 3:2) fits about as well
//     alternatives: [{ ratio, bpm, score, onset, bars, matched, residualMs, steady }],  // other counts, score relative to `bpm` (1 = as good)
//     fit,         // { method: 'steady' | 'tracked', residualMs, driftMs, matched, … }: one straight line through the
//                  // onsets (residual in ms, worst 30 s window's offset) or, when the tempo moves, per-beat tracking
//     bars,        // how the bar line was chosen: { basis: 'chords' | 'accent', chordContrast, … }
//     beats: [t],      // every beat, regular grid when the tempo is steady, raw tracker output when it drifts
//     downbeats: [t],  // first beat of each bar, 4/4 assumed (every 4th entry of `beats`), where the chords change
//     sections: [{ start, end, energy }],  // loudness segments cut on bar lines (4 s blocks when no pulse); energy 0–1, 1 = loudest
//     drops: [{ t, score }],  // up to 3 candidates, t on a downbeat, score 0–1 = size of the energy jump, best first
//     end,         // where the music really stops (last point above the silence threshold)
//     duration,    // length of the decoded file
//   }
import { spawnSync } from 'node:child_process';
import { OmError } from './project.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const r3 = (x) => Math.round(x * 1000) / 1000;

// ---------- decode ----------

// Any audio/video file → { L, R, rate, duration } (Float32Array per channel, mono sources are duplicated).
export function decode(file, rate = 48000, tempo = 1) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-vn', ...(tempo !== 1 ? ['-af', `atempo=${tempo}`] : []), '-f', 'f32le', '-ac', '2', '-ar', String(rate), '-'], { maxBuffer: Infinity });
  if (r.error) {
    if (r.error.code === 'ENOENT') throw new OmError('ffmpeg not found — install it (macOS: brew install ffmpeg) to decode music files');
    throw new OmError(`ffmpeg failed to start: ${r.error.message}`);
  }
  if (r.status !== 0) throw new OmError(`ffmpeg could not decode ${file}: ${String(r.stderr).trim().split('\n').pop() || 'exit ' + r.status}`);
  const n = Math.floor(r.stdout.length / 8);
  if (!n) throw new OmError(`${file} decoded to no audio`);
  const buf = new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + n * 8)); // copy → 4-byte aligned
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = buf[2 * i]; R[i] = buf[2 * i + 1]; }
  return { L, R, rate, duration: n / rate };
}

// ---------- beatAt (self-contained and pure on purpose: the browser runtime inlines it) ----------

// Time of beat n (0-based, fractional n interpolates linearly). Outside the list the nearest beat length is
// extended, so beatAt(beats, -1) is one beat before the first and beatAt(beats, len + 3) is past the last.
export function beatAt(beats, n) {
  const last = beats.length - 1;
  if (last < 0) return NaN;
  if (last === 0) return beats[0];
  if (n <= 0) return beats[0] + n * (beats[1] - beats[0]);
  if (n >= last) return beats[last] + (n - last) * (beats[last] - beats[last - 1]);
  const i = Math.floor(n);
  return beats[i] + (n - i) * (beats[i + 1] - beats[i]);
}

// ---------- FFT ----------

function makeFFT(n) {
  const bits = Math.log2(n), rev = new Uint32Array(n), cs = new Float64Array(n / 2), sn = new Float64Array(n / 2);
  for (let i = 0; i < n; i++) { let x = i, y = 0; for (let b = 0; b < bits; b++) { y = (y << 1) | (x & 1); x >>= 1; } rev[i] = y; }
  for (let i = 0; i < n / 2; i++) { cs[i] = Math.cos((2 * Math.PI * i) / n); sn[i] = -Math.sin((2 * Math.PI * i) / n); }
  return (re, im) => {
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let s = 0; s < n; s += size) {
        for (let k = 0, w = 0; k < half; k++, w += step) {
          const a = s + k, b = a + half;
          const tr = re[b] * cs[w] - im[b] * sn[w], ti = re[b] * sn[w] + im[b] * cs[w];
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
  };
}

// ---------- onset features ----------

const WIN = 512; // at ~12 kHz = 43 ms; 23 Hz bins, so the bass band (bins 1–6) resolves a kick
const BANDS = [[1, 7], [7, 33], [33, 256]]; // bass 23–140 Hz, mid to ~750 Hz, highs to 6 kHz
const BAND_W = [2, 1, 1]; // the kick decides where the beat is, hats only add
// Flux peaks sit this much before the acoustic onset (log compression fires as soon as the hit enters the
// window tail); measured on synthetic drums with known onsets.
const FLUX_LEAD = 0.009;

// Decimate to ~12 kHz, STFT with hop 10 ms, log-magnitude half-wave flux per band, plus raw bass magnitude
// (linear, so accents survive) and block RMS at the full rate.
function features({ L, R, rate }, perSec = 100) {
  const D = Math.max(1, Math.round(rate / 12000)), r2 = rate / D, hop = Math.round(r2 / perSec), n = L.length;
  const m = Math.floor(n / D), y = new Float32Array(m);
  let ss = 0;
  for (let i = 0; i < m; i++) { let s = 0; for (let k = 0; k < D; k++) s += L[i * D + k] + R[i * D + k]; y[i] = s / (2 * D); ss += y[i] * y[i]; }
  const gain = ss > 1e-12 ? 0.1 / Math.sqrt(ss / m) : 1;
  const nF = Math.floor(m / hop) + 1, fft = makeFFT(WIN);
  const hann = new Float64Array(WIN);
  for (let i = 0; i < WIN; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / WIN);
  const re = new Float64Array(WIN), im = new Float64Array(WIN), prev = new Float64Array(WIN / 2 + 1), cur = new Float64Array(WIN / 2 + 1);
  const flux = BANDS.map(() => new Float32Array(nF)), bass = new Float32Array(nF), bandLo = new Float32Array(nF), bandHi = new Float32Array(nF);
  for (let f = 0; f < nF; f++) {
    const s0 = f * hop - WIN / 2;
    for (let i = 0; i < WIN; i++) { const j = s0 + i; re[i] = j >= 0 && j < m ? y[j] * hann[i] : 0; im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < WIN / 2; k++) {
      const a = Math.hypot(re[k], im[k]) / (WIN / 2) * gain;
      cur[k] = Math.log1p(1000 * a);
      if (k < 7) { bass[f] += a; bandLo[f] += a * a; } else if (k >= 107) bandHi[f] += a * a; // < 160 Hz and > 2.5 kHz, as power
    }
    for (let k = 1; k < WIN / 2; k++) {
      // SuperFlux (Böck 2013): compare with the max of the neighbouring bins of the previous frame, so a
      // sustained chord whose partials beat against each other does not read as a stream of onsets
      const d = cur[k] - Math.max(prev[k - 1], prev[k], prev[k + 1]);
      if (f > 1 && d > 0) for (let b = 0; b < BANDS.length; b++) if (k >= BANDS[b][0] && k < BANDS[b][1]) { flux[b][f] += d; break; }
    }
    prev.set(cur);
  }
  // loudness: RMS per hop-sized block of the original-rate mono mix
  const hopF = hop * D, nB = Math.ceil(n / hopF), rms = new Float32Array(nB);
  for (let b = 0; b < nB; b++) {
    let s = 0; const a = b * hopF, e = Math.min(n, a + hopF);
    for (let i = a; i < e; i++) { const v = 0.5 * (L[i] + R[i]); s += v * v; }
    rms[b] = Math.sqrt(s / Math.max(1, e - a));
  }
  return { hopSec: hop / r2, nF, flux, bass, bandLo, bandHi, rms, blockSec: hopF / rate };
}

// onset strength envelope: bands normalized by their own mean, bass-weighted sum, local mean removed.
function envelope(flux, nF, hopSec) {
  const e = new Float32Array(nF);
  flux.forEach((fl, b) => {
    let mean = 0; for (let i = 0; i < nF; i++) mean += fl[i]; mean /= nF;
        const k = BAND_W[b] / (mean + 0.1); // absolute floor (drums sit at 0.25–2 per band, a steady chord at <0.06): an empty band stays quiet instead of being normalized up to noise
    for (let i = 0; i < nF; i++) e[i] += fl[i] * k;
  });
  const w = Math.max(3, Math.round(0.1 / hopSec)), pre = new Float64Array(nF + 1);
  for (let i = 0; i < nF; i++) pre[i + 1] = pre[i] + e[i];
  const o = new Float32Array(nF);
  for (let i = 0; i < nF; i++) {
    const a = Math.max(0, i - w), b = Math.min(nF, i + w + 1);
    o[i] = Math.max(0, e[i] - (pre[b] - pre[a]) / (b - a));
  }
  return o;
}

// ---------- tempo ----------

// unbiased, normalized autocorrelation for lags 0..maxLag (frames)
function acorr(x, maxLag) {
  const n = x.length, out = new Float64Array(maxLag + 1);
  let m = 0; for (let i = 0; i < n; i++) m += x[i]; m /= n;
  x = x.map((v) => v - m); // without this the non-negative envelope's DC term makes every lag look periodic
  for (let l = 0; l <= maxLag; l++) { let s = 0; for (let i = 0; i + l < n; i++) s += x[i] * x[i + l]; out[l] = s / Math.max(1, n - l); }
  const z = out[0] || 1;
  for (let l = 0; l <= maxLag; l++) out[l] /= z;
  return out;
}
const at = (a, x) => { if (x <= 0) return a[0]; if (x >= a.length - 1) return a[a.length - 1]; const i = Math.floor(x); return a[i] + (a[i + 1] - a[i]) * (x - i); };

// Period (frames, fractional) of the beat. Candidates 60–240 bpm scored by autocorrelation plus its
// harmonics (a real beat repeats at 2× and 4× too) with a broad prior around 120; folded into 70–180;
// above 150 a double-time mistake is checked against bass periodicity and onset periodicity.
function tempo(env, bassEnv, hopSec) {
  const maxLag = Math.round(4 * 60 / 60 / hopSec) + 2, ac = acorr(env, maxLag), acB = acorr(bassEnv, maxLag);
  const lag = (bpm) => 60 / bpm / hopSec;
  let best = null;
  for (let bpm = 60; bpm <= 240; bpm += 0.5) {
    const L = lag(bpm);
    const s = (at(ac, L) + 0.5 * at(ac, 2 * L) + 0.25 * at(ac, 4 * L)) * Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 1.2, 2));
    if (!best || s > best.s) best = { s, bpm };
  }
  let bpm = best.bpm;
  while (bpm > 180) bpm /= 2;
  while (bpm < 70) bpm *= 2;
  if (bpm > 150) {
    const L = lag(bpm), on = at(ac, L) / Math.max(1e-6, at(ac, 2 * L)), lo = at(acB, L) / Math.max(1e-6, at(acB, 2 * L));
    if (Math.min(on, lo) < 0.75 || (on + lo) / 2 < 0.8) bpm /= 2; // the kick/accent period is the slower one
  }
  const L = lag(bpm);
  return { period: L, acf: Math.max(at(ac, L), at(ac, 2 * L)) };
}

// ---------- beat tracking (Ellis 2007) ----------

function track(env, P, tight = 100) {
  const n = env.length, score = new Float64Array(n), from = new Int32Array(n).fill(-1);
  const lo = Math.max(1, Math.round(P / 2)), hi = Math.round(P * 2), pen = new Float64Array(hi + 1);
  for (let t = lo; t <= hi; t++) pen[t] = tight * Math.pow(Math.log(t / P), 2);
  for (let t = 0; t < n; t++) {
    let best = 0, bi = -1;
    for (let k = lo; k <= hi && k <= t; k++) { const v = score[t - k] - pen[k]; if (v > best) { best = v; bi = t - k; } }
    score[t] = env[t] + best; from[t] = bi;
  }
  let t = n - 1;
  for (let k = n - 1; k >= Math.max(0, n - Math.round(P)); k--) if (score[k] > score[t]) t = k;
  const out = [];
  for (; t >= 0; t = from[t]) { out.push(t); if (from[t] < 0) break; }
  return out.reverse();
}

// local peak of env near frame b, refined to a fraction of a frame
function peakNear(env, b, r = 2) {
  let p = b;
  for (let i = Math.max(0, b - r); i <= Math.min(env.length - 1, b + r); i++) if (env[i] > env[p]) p = i;
  if (p <= 0 || p >= env.length - 1) return p;
  const a = env[p - 1], c = env[p], d = env[p + 1], den = a - 2 * c + d;
  return den < 0 ? p + clamp(0.5 * (a - d) / den, -0.5, 0.5) : p;
}

// Global grid t = (ph + k·p)·hop: scan period (±3 % around the autocorrelation estimate) and phase for the
// grid whose beats sit on the highest envelope, then polish. This is what pins the phase to the kick when an
// intro has only off-beat hats, and gives a drift-free tempo. `quality` = envelope at the beats / average.
function comb(x, P) {
  const n = x.length, s = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) s[i] = 0.25 * (x[i - 1] ?? x[i]) + 0.5 * x[i] + 0.25 * (x[i + 1] ?? x[i]);
  const score = (p, ph) => { let v = 0, c = 0; for (let t = ph; t < n - 1; t += p) { const i = t | 0; v += s[i] + (s[i + 1] - s[i]) * (t - i); c++; } return v / Math.max(1, c); };
  let best = { v: -1, p: P, ph: 0 };
  for (let r = -0.03; r <= 0.0301; r += 0.0002) for (let ph = 0; ph < P * (1 + r); ph += 0.5) { const p = P * (1 + r), v = score(p, ph); if (v > best.v) best = { v, p, ph }; }
  const c = best;
  for (let r = -0.0004; r <= 0.00041; r += 0.00002) for (let d = -0.75; d <= 0.751; d += 0.1) { const p = c.p * (1 + r), ph = c.ph + d, v = ph >= 0 ? score(p, ph) : -1; if (v > best.v) best = { v, p, ph }; }
  let mean = 0; for (let i = 0; i < n; i++) mean += x[i]; mean /= n;
  return { p: best.p, ph: best.ph, quality: best.v / Math.max(1e-9, mean) };
}

// ---------- fine fit of a steady tempo ----------

// Generated and sequenced music is mostly a fixed tempo, often a whole or almost whole number of bpm. The grid from `comb`
// is good to a fraction of a percent, which is 50–150 ms by the end of a track. This refits it on a 2.7 ms onset envelope:
// scan period and phase for the grid that sits on the most onset energy, then least squares through the onset peaks
// found near each grid beat (outliers dropped), and compare 30 s windows with the global line. `steady` says the single line
// explains the track (every window within 15 ms of it); when it does not, the caller falls back to per-beat tracking.
// All times are in seconds on the envelope's own clock (add FLUX_LEAD for the acoustic onset).
function fitSteady(x, hopSec, P0, end, span = 0.025) {
  const n = x.length, s = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) s[i] = 0.25 * (x[i - 1] ?? x[i]) + 0.5 * x[i] + 0.25 * (x[i + 1] ?? x[i]);
  const last = Math.min(n - 2, Math.floor(end / hopSec));
  const score = (p, ph) => { let v = 0, c = 0; for (let t = ph; t < last; t += p) { if (t < 0) continue; const i = t | 0; v += s[i] + (s[i + 1] - s[i]) * (t - i); c++; } return v / Math.max(1, c); };
  const P = P0 / hopSec; // frames per beat
  let best = { v: -1, p: P, ph: 0 };
  for (let r = -span; r <= span * 1.0004; r += span / 62.5) for (let ph = 0; ph < P; ph += 1) { const p = P * (1 + r), v = score(p, ph); if (v > best.v) best = { v, p, ph }; }
  for (let r = -0.0005; r <= 0.00051; r += 0.00004) for (let d = -1.5; d <= 1.501; d += 0.25) { const p = best.p * (1 + r), ph = best.ph + d, v = ph >= 0 ? score(p, ph) : -1; if (v > best.v) best = { v, p, ph }; }
  // onset peaks near the grid, then a robust weighted line fit t = ph + k p
  let line = { p: best.p, ph: best.ph };
  let pts = [], res = [];
  const win = Math.max(2, Math.min(Math.round(0.05 / hopSec), Math.floor(best.p / 8)));
  for (let pass = 0; pass < 4; pass++) {
    pts = [];
    for (let k = 0; line.ph + k * line.p < last; k++) {
      const c = Math.round(line.ph + k * line.p);
      let m = Math.max(0, c - win);
      for (let i = m; i <= Math.min(n - 2, c + win); i++) if (x[i] > x[m]) m = i;
      if (m <= 0 || m >= n - 1 || x[m] < 1.0) continue; // x is in standard deviations: a real hit stands clear of the background
      const a = x[m - 1], b = x[m], d = x[m + 1], den = a - 2 * b + d;
      pts.push({ k, t: den < 0 ? m + clamp(0.5 * (a - d) / den, -0.5, 0.5) : m, w: Math.min(4, b) });
    }
    if (pts.length < 8) break;
    // weighted least squares of t on k, then drop the worst until everything is within 2.5 sigma (at least 15 ms)
    const fit = (q) => { let sw = 0, sk = 0, st = 0, skk = 0, skt = 0; for (const o of q) { sw += o.w; sk += o.w * o.k; st += o.w * o.t; skk += o.w * o.k * o.k; skt += o.w * o.k * o.t; } const den = sw * skk - sk * sk, p = (sw * skt - sk * st) / den; return { p, ph: (st - p * sk) / sw }; };
    let use = pts, f = fit(use);
    for (let it = 0; it < 5; it++) {
      const r = use.map((o) => o.t - (f.ph + o.k * f.p)), sd = Math.sqrt(r.reduce((a, v) => a + v * v, 0) / r.length), lim = Math.max(0.015 / hopSec, 2.5 * sd);
      const keep = use.filter((_, i) => Math.abs(r[i]) <= lim);
      if (keep.length === use.length || keep.length < 8) break;
      use = keep; f = fit(use);
    }
    line = f; pts = use;
  }
  if (pts.length < 8) return null;
  res = pts.map((o) => (o.t - (line.ph + o.k * line.p)) * hopSec);
  const rms = Math.sqrt(res.reduce((a, v) => a + v * v, 0) / res.length);
  // local offsets: mean residual in 30 s windows
  let maxLocal = 0;
  for (let t0 = 0; t0 < end; t0 += 30) {
    const w = pts.filter((o) => { const t = (line.ph + o.k * line.p) * hopSec; return t >= t0 && t < t0 + 30; });
    if (w.length < 6) continue;
    const m = w.reduce((a, o) => a + (o.t - (line.ph + o.k * line.p)) * hopSec, 0) / w.length;
    maxLocal = Math.max(maxLocal, Math.abs(m));
  }
  const total = Math.max(1, Math.floor((last - line.ph) / line.p));
  return { period: line.p * hopSec, phase: line.ph * hopSec, rms, maxLocal, matched: pts.length / total, steady: maxLocal <= 0.015 && rms <= 0.018 && pts.length / total >= 0.25, shiftScore: (sec) => score(line.p, line.ph + sec / hopSec) };
}

const FINE_HOP = 32 / 12000; // seconds: a 32-sample hop at the 12 kHz analysis rate (2.67 ms)
// normalized onset envelope at FINE_HOP, for the first `len` seconds
function fineEnv(L, R, rate, len) {
  const F = features({ L, R, rate }, 375), n = Math.min(F.nF, Math.ceil(len / F.hopSec) + 1);
  const e = envelope(F.flux, F.nF, F.hopSec).subarray(0, n);
  let m = 0; for (let i = 0; i < n; i++) m += e[i]; m /= n;
  let sd = 0; for (let i = 0; i < n; i++) sd += (e[i] - m) ** 2;
  sd = Math.sqrt(sd / n) || 1;
  return e.map((v) => v / sd);
}

// ---------- harmony: where the chords change ----------

const MEDIAN = 9, CHROMA_WIN = 2048, CHROMA_HOP = 256; // at 12 kHz: 5.9 Hz bins, a frame every 21 ms
// Pitch-class energy per frame (12 values, summed to 1), from 100–1600 Hz where chords and bass lines live, and the
// novelty of it: how different the 0.2 s after a moment sounds from the 0.2 s before. A chord changes on a bar line far
// more often than on any other beat, which is what decides where the bars are when the drums cannot (a kick that
// is strongest on beat 2, a 16th-note groove).
function harmony({ L, R, rate }) {
  const D = Math.max(1, Math.round(rate / 12000)), r2 = rate / D, m = Math.floor(L.length / D), y = new Float32Array(m);
  for (let i = 0; i < m; i++) { let s = 0; for (let k = 0; k < D; k++) s += L[i * D + k] + R[i * D + k]; y[i] = s / (2 * D); }
  const nF = Math.floor(m / CHROMA_HOP) + 1, fft = makeFFT(CHROMA_WIN), hann = new Float64Array(CHROMA_WIN);
  for (let i = 0; i < CHROMA_WIN; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / CHROMA_WIN);
  const pc = new Int8Array(CHROMA_WIN / 2).fill(-1);
  for (let k = 1; k < CHROMA_WIN / 2; k++) { const f = (k * r2) / CHROMA_WIN; if (f >= 130 && f <= 1600) pc[k] = (((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12); }
  const C = new Float32Array(nF * 12), re = new Float64Array(CHROMA_WIN), im = new Float64Array(CHROMA_WIN);
  for (let f = 0; f < nF; f++) {
    const s0 = f * CHROMA_HOP - CHROMA_WIN / 2;
    for (let i = 0; i < CHROMA_WIN; i++) { const j = s0 + i; re[i] = j >= 0 && j < m ? y[j] * hann[i] : 0; im[i] = 0; }
    fft(re, im);
    let tot = 0;
    for (let k = 1; k < CHROMA_WIN / 2; k++) if (pc[k] >= 0) { const a = Math.sqrt(Math.hypot(re[k], im[k])); C[f * 12 + pc[k]] += a; tot += a; }
    if (tot > 0) for (let c = 0; c < 12; c++) C[f * 12 + c] /= tot;
  }
  // a drum hit smears the chroma for a few frames and is gone; a chord change is a step that stays. A running median over ~0.2 s
  // removes the first and keeps the second.
  const med = new Float32Array(C.length), win = new Float32Array(MEDIAN);
  for (let c = 0; c < 12; c++) for (let f = 0; f < nF; f++) {
    for (let k = 0; k < MEDIAN; k++) win[k] = C[Math.min(nF - 1, Math.max(0, f + k - (MEDIAN >> 1))) * 12 + c];
    med[f * 12 + c] = win.slice().sort()[MEDIAN >> 1];
  }
  C.set(med);
  const w = 8, nov = new Float32Array(nF), hopSec = CHROMA_HOP / r2;
  const mean = (a, b) => { const o = new Float64Array(12); for (let f = a; f < b; f++) if (f >= 0 && f < nF) for (let c = 0; c < 12; c++) o[c] += C[f * 12 + c]; return o; };
  const cos = (a, b) => { let d = 0, x = 0, z = 0; for (let c = 0; c < 12; c++) { d += a[c] * b[c]; x += a[c] * a[c]; z += b[c] * b[c]; } return x > 0 && z > 0 ? d / Math.sqrt(x * z) : 1; };
  for (let f = w; f < nF - w; f++) nov[f] = 1 - cos(mean(f - w, f), mean(f, f + w));
  let total = 0; for (let f = w; f < nF - w; f++) total += nov[f];
  return { nov, hopSec, nF, C, mean: total / Math.max(1, nF - 2 * w) };
}
// novelty at time t (seconds): the boundary between frame f-1 and f sits half a frame before frame f's centre
const novAt = (H, t) => { const x = t / H.hopSec + 0.5; if (x <= 0 || x >= H.nF - 1) return 0; const i = Math.floor(x); return H.nov[i] + (H.nov[i + 1] - H.nov[i]) * (x - i); };

// How often the chords change, as a list of periods (seconds, with weights): the peaks of the chord-change novelty's autocorrelation.
// A progression repeats every 2, 4, 8 bars, so the strong periods are whole multiples of the half bar of the right count and
// not of a wrong one (a dotted-eighth echo at 4:3 of the beat has a bar 3/4 as long, and the progression does not divide into it).
function chordPeriods(H, end) {
  const a = Math.ceil(3 / H.hopSec), b = Math.min(H.nF - 1, Math.floor((end - 1) / H.hopSec)), n = b - a;
  if (n < 400) return [];
  const x = new Float64Array(n); let mu = 0;
  for (let i = 0; i < n; i++) mu += H.nov[a + i]; mu /= n;
  for (let i = 0; i < n; i++) x[i] = H.nov[a + i] - mu;
  let e0 = 0; for (let i = 0; i < n; i++) e0 += x[i] * x[i];
  if (e0 <= 0) return [];
  const lo = Math.ceil(0.6 / H.hopSec), hi = Math.min(n >> 1, Math.floor(40 / H.hopSec)), acf = new Float64Array(hi + 2);
  for (let k = lo - 1; k <= hi + 1; k++) { let s = 0; for (let i = 0; i + k < n; i++) s += x[i] * x[i + k]; acf[k] = s / e0 * (n / (n - k)); }
  const peaks = [];
  for (let k = lo; k <= hi; k++) if (acf[k] > 0.05 && acf[k] >= acf[k - 1] && acf[k] > acf[k + 1]) peaks.push({ t: k * H.hopSec, w: acf[k] });
  peaks.sort((p, q) => q.w - p.w);
  const out = [];
  for (const p of peaks) if (out.length < 8 && out.every((o) => Math.abs(o.t - p.t) > 0.25)) out.push(p);
  return out;
}
// 1 when every strong period is a whole number of `g` seconds, about 0.25 when they fall between
const periodFit = (periods, g) => { let w = 0, s = 0; for (const p of periods) { w += p.w; s += p.w * (1 + Math.cos((2 * Math.PI * p.t) / g)) / 2; } return w > 0 ? s / w : 0.5; };

// ---------- the map of the track: one row per bar, then segments ----------

const KEY_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], KEY_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const cosine = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x > 0 && y > 0 ? d / Math.sqrt(x * y) : 0; };
const rot = (v, k) => v.map((_, i) => v[(i - k + 12) % 12]);
export const chromaCosine = cosine;

// Krumhansl–Schmuckler key of a 12-vector
function keyOf(chroma) {
  let best = null;
  for (let r = 0; r < 12; r++) for (const [mode, prof] of [['major', KEY_MAJOR], ['minor', KEY_MINOR]]) {
    const c = cosine(chroma, rot(prof, r));
    if (!best || c > best.c) best = { c, root: r, mode };
  }
  return { root: NOTE[best.root], rootIndex: best.root, mode: best.mode, chord: NOTE[best.root] + (best.mode === 'minor' ? 'm' : '') };
}
// the triad (major or minor) a 12-vector sounds most like
function chordOf(chroma) {
  let best = null, second = -1;
  for (let r = 0; r < 12; r++) for (const mode of ['major', 'minor']) {
    const t = new Array(12).fill(0); t[r] = 1; t[(r + (mode === 'minor' ? 3 : 4)) % 12] = 1; t[(r + 7) % 12] = 1;
    const c = cosine(chroma, t);
    if (!best || c > best.c) { if (best) second = Math.max(second, best.c); best = { c, root: r, mode }; } else second = Math.max(second, c);
  }
  return { name: NOTE[best.root] + (best.mode === 'minor' ? 'm' : ''), conf: r3(best.c - second), fit: r3(best.c) };
}

// Per bar (between consecutive downbeats): loudness, brightness, low end, the chord, chroma of the head and the tail half
// (what a cut into or out of the bar sounds like); then the bars grouped into segments (intro / build / breakdown / main / outro / verse)
// with an energy grade, and the bars that can end a film (the tonic chord, followed by a decay or by the end).
// All the numbers a re-arrangement needs, so a track is analysed once and cut many ways.
function buildBarMap({ F, H, downbeats, end, ms, beatLen }) {
  if (downbeats.length < 3) return null;
  const edges = downbeats.filter((t) => t < end - 0.2);
  edges.push(Math.min(end, edges.at(-1) + 4 * beatLen));
  const bars = [], hop = H.hopSec, mean12 = new Float64Array(12);
  const chromaOver = (a, b) => { const o = new Float64Array(12); let n = 0; for (let f = Math.max(0, Math.round(a / hop)); f < Math.min(H.nF, Math.round(b / hop)); f++) { for (let c = 0; c < 12; c++) o[c] += H.C[f * 12 + c]; n++; } return n ? Array.from(o, (v) => v / n) : o.map(() => 0); };
  const bandOver = (arr, a, b) => { let s = 0, n = 0; for (let f = Math.max(0, Math.floor(a / F.hopSec)); f < Math.min(F.nF, Math.ceil(b / F.hopSec)); f++) { s += arr[f]; n++; } return n ? s / n : 0; };
  const dB = (x) => 10 * Math.log10(x + 1e-12);
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = edges[i], b = edges[i + 1], m = (a + b) / 2, all = chromaOver(a, b);
    for (let c = 0; c < 12; c++) mean12[c] += all[c];
    const ch = chordOf(all);
    bars.push({ i, start: r3(a), end: r3(b), db: r3(dB(ms(a, b))), dbIn: r3(dB(ms(a, Math.min(b, a + 1)))), dbOut: r3(dB(ms(Math.max(a, b - 1), b))), atk: r3(dB(ms(a, Math.min(b, a + 0.12))) - dB(ms(Math.min(b, a + 0.3), b))), hf: r3(dB(bandOver(F.bandHi, a, b))), lf: r3(dB(bandOver(F.bandLo, a, b))), chord: ch.name, chordFit: ch.fit, chroma: Array.from(all, (v) => r3(v)), head: chromaOver(a, m).map(r3), tail: chromaOver(m, b).map(r3) });
  }
  const key = keyOf(Array.from(mean12));
  // how much the track's loudness moves at all: a flat track (a few dB between its quietest and loudest bars) has no shape to re-cut
  const dbs = bars.map((x) => x.db).sort((a, b) => a - b), q = (f) => dbs[Math.min(dbs.length - 1, Math.floor(f * dbs.length))];
  const dynamics = { rangeDb: r3(q(0.98) - q(0.1)), quietBars: bars.filter((x) => x.db < q(0.98) - 6).length };
  // normalized loudness / brightness (0–1 between the 10th and 98th percentile of the track's bars) and their mix
  const pct = (xs, p) => { const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const nz = (k) => { const v = bars.map((x) => x[k]), lo = pct(v, 0.1), hi = Math.max(lo + 1e-6, pct(v, 0.98)); return v.map((x) => clamp((x - lo) / (hi - lo))); };
  const eL = nz('db'), eH = nz('hf');
  // the home chord: what the key finder says, or the chord most bars sit on (dense mixes flatten the chroma, so either may be the one)
  const tally = {}; for (const x of bars) tally[x.chord] = (tally[x.chord] || 0) + 1;
  const common = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0], home = new Set([key.chord, common]);
  bars.forEach((x, j) => { x.e = r3(0.65 * eL[j] + 0.35 * eH[j]); x.tonic = home.has(x.chord); });
  // segments: a bar joins the running segment unless it is more than 0.18 away from the segment's mean (and the segment has 2 bars)
  const segs = [];
  for (const x of bars) {
    const cur = segs.at(-1), mean = cur ? cur.sum / cur.n : 0;
    if (!cur || (Math.abs(x.e - mean) > 0.18 && cur.n >= 2)) segs.push({ from: x.i, to: x.i + 1, sum: x.e, n: 1 }); else { cur.to = x.i + 1; cur.sum += x.e; cur.n++; }
  }
  const grade = (e) => (e < 0.35 ? 0 : e < 0.6 ? 1 : e < 0.85 ? 2 : 3);
  const top = Math.max(...segs.map((q) => q.sum / q.n));
  const out = segs.map((q, k) => {
    const e = q.sum / q.n, prev = segs[k - 1] && segs[k - 1].sum / segs[k - 1].n, next = segs[k + 1] && segs[k + 1].sum / segs[k + 1].n;
    const slope = q.n >= 2 ? bars[q.to - 1].e - bars[q.from].e : 0;
    let label = grade(e) >= 2 ? 'main' : 'verse';
    if (k === 0 && next != null && grade(e) <= 1 && next > e) label = 'intro';
    else if (k === segs.length - 1 && k > 0 && e < 0.6 * top) label = 'outro';
    else if (next != null && next > e + 0.12 && slope > 0.12 && grade(e) <= 2) label = 'build';
    else if (prev != null && next != null && e < prev - 0.15 && e < next - 0.1) label = 'breakdown';
    return { from: q.from, to: q.to, start: bars[q.from].start, end: bars[q.to - 1].end, label, grade: grade(e), energy: r3(e) };
  });
  // bars that can end a film: the tonic chord, then a decay (the next bar at least 0.12 quieter) or the end of the music
  const closers = [];
  bars.forEach((x, j) => {
    if (!x.tonic) return;
    const nxt = bars[j + 1], decay = nxt ? x.e - nxt.e : 0.4;
    if (!nxt || decay >= 0.12) closers.push({ bar: j, score: r3(0.5 + 0.5 * clamp(decay / 0.4, 0, 1)) });
  });
  for (const x of bars) { delete x.chordFit; }
  // lifts: a segment that starts at least 0.15 above the one before it. The bar before is its pickup (fill), kept with it by any re-cut.
  const lifts = [];
  out.forEach((g, k) => { if (k > 0 && g.energy - out[k - 1].energy >= 0.15) lifts.push({ bar: g.from, step: r3(g.energy - out[k - 1].energy), pickup: g.from - 1 }); });
  // the opening: the track's own first bars, up to where its first segment ends (at least 2 bars)
  const opening = { bars: Math.max(2, Math.min(8, out[0].to)), label: out[0].label };
  // the ending: how the music stops. body = the loud half of the track; the last bars are compared with it.
  const body = q(0.75), last = bars.length - 1;
  // how long the music takes to die: from the end of the last bar within 8 dB of the body to the end of the music
  const loudBar = Math.max(0, bars.findLastIndex((x) => x.db >= body - 8)), tLoud = Math.min(end, bars[loudBar].end), decaySec = r3(end - tLoud);
  const strong = (() => { const lim = Math.max(...bars.slice(Math.max(0, last - 14)).map((x) => x.db)) - 6; for (let j = Math.min(last, loudBar); j >= 0; j--) if (bars[j].db >= lim && bars[j].atk > 1) return j; return loudBar; })();
  let type = 'cadence';
  if (decaySec < 0.6) type = 'hard stop'; else if (decaySec > 6) type = 'fade'; else if (!bars[strong].tonic) type = 'ring-out';
  // a natural ending starts where the closing phrase does: a fade, at the bar before it begins; otherwise four bars before the last loud one
  const loud3 = Math.max(0, bars.findLastIndex((x) => x.db >= body - 3)); // a natural ending must start at the level the music plays at
  const startBar = Math.max(opening.bars, type === 'fade' ? loud3 : loud3 - 3);
  const ending = { type, decaySec, loudUntil: r3(tLoud), bodyDb: r3(body), lastStrong: strong, lastStrongChord: bars[strong].chord, startBar, seconds: r3(end - bars[startBar].start) };
  return { key: { chord: key.chord, root: key.root, mode: key.mode, common }, dynamics, bars, segments: out, closers, lifts, opening, ending };
}

// ---------- analysis ----------

// Where the music stops. Active = RMS above -55 dBFS; gaps under 0.4 s do not split it. When the last active stretch is short
// (≤ 4 s), follows a silence of at least 1 s, and is at least 12 dB under the loudest part of what comes before it, it is a
// separate piece (a spoken label), not the end of the music; the music ends where the stretch before it does.
function musicEnd(rms, blockSec, duration) {
  const act = []; let cur = null;
  for (let b = 0; b < rms.length; b++) if (rms[b] > 0.0018) { const t0 = b * blockSec, t1 = (b + 1) * blockSec; if (cur && t0 - cur.b < 0.4) { cur.b = t1; cur.peak = Math.max(cur.peak, rms[b]); } else { cur = { a: t0, b: t1, peak: rms[b] }; act.push(cur); } }
  if (!act.length) return { end: 0, tail: null };
  const peakOf = (xs) => Math.max(...xs.map((x) => x.peak));
  let k = act.length - 1;
  while (k > 0) {
    const t = act[k], before = act.slice(0, k), body = before.reduce((a, x) => (x.b - x.a > a.b - a.a ? x : a), before[0]);
    const gap = t.a - act[k - 1].b, lower = 20 * Math.log10(peakOf(before) / t.peak);
    if (t.b - t.a <= 4 && gap >= 1 && lower >= 12 && body.b - body.a >= 8) k--; else break;
  }
  // a click after the music has died (a few ms of encoder noise, 20 dB or more under it) is not music either
  while (k > 0 && act[k].b - act[k].a < 0.3 && 20 * Math.log10(peakOf(act.slice(0, k)) / act[k].peak) >= 20) k--;
  const end = r3(Math.min(duration, act[k].b));
  return { end, tail: k < act.length - 1 ? { from: r3(act[k + 1].a), to: r3(act.at(-1).b), gapSec: r3(act[k + 1].a - act[k].b), dbBelow: Math.round(20 * Math.log10(peakOf(act.slice(0, k + 1)) / peakOf(act.slice(k + 1)))) } : null };
}

// opts.bpm: the tempo is known (the grid's period is fitted within 1 % of it, the phase freely)
export function analyze({ L, R, rate }, opts = {}) {
  const duration = L.length / rate, F = features({ L, R, rate }), { hopSec, nF } = F;
  // end of the music: last block above -55 dBFS RMS
  // Platforms append a short spoken label after the music ("generated by AI"): a quiet gap, then about two seconds of speech 15–25 dB
  // under the music. That is not music: `end` is where the music stops, and everything after the gap is reported as `tail` and
  // never reaches a film (looping, the closing fade, re-cutting and the beat map all stop at `end`).
  const { end, tail } = musicEnd(F.rms, F.blockSec, duration);
  const nUse = Math.max(8, Math.min(nF, Math.ceil(end / hopSec) + 1));
  const env = envelope(F.flux, nF, hopSec).subarray(0, nUse);
  const bassEnv = envelope([F.flux[0]], nF, hopSec).subarray(0, nUse);
  let sd = 0, mean = 0;
  for (let i = 0; i < nUse; i++) mean += env[i];
  mean /= nUse;
  for (let i = 0; i < nUse; i++) sd += (env[i] - mean) ** 2;
  sd = Math.sqrt(sd / nUse) || 1;
  const x = env.map((v) => v / sd);

  // tempo from the autocorrelation, phase and exact period from the comb; the DP tracker (Ellis) is what we
  // fall back to when the tempo wanders and no single grid fits
  const tp = tempo(x, bassEnv, hopSec), cb = comb(x, tp.period);
  const fr = track(x, tp.period), ts = fr.map((b) => peakNear(x, b) * hopSec + FLUX_LEAD);
  // the grid holds when it sits on a clearly stronger envelope than chance, or when the tracker agrees with it
  const agree = ts.filter((t) => { const r = (((t - cb.ph * hopSec) % (cb.p * hopSec)) + cb.p * hopSec) % (cb.p * hopSec); return Math.min(r, cb.p * hopSec - r) < 0.04; }).length / Math.max(1, ts.length);
  let beats, period, fit = null;
  const gridOK = cb.quality >= 8 || (cb.quality >= 1.5 && agree >= 0.8);
  const xf = fineEnv(L, R, rate, nUse * hopSec), H = harmony({ L, R, rate });
  const forced = opts.bpm > 0 ? Number(opts.bpm) : null; // the user knows the tempo: fit the phase (and the last percent of the period) to it
  // refit the grid on a finer envelope (see fitSteady); a track the single line does not explain is tracked beat by beat
  let st = fitSteady(xf, FINE_HOP, forced ? 60 / forced : gridOK ? cb.p * hopSec : tp.period * hopSec, end, forced ? 0.01 : 0.025);

  // Is this the right count? A grid at 3:4 or 4:3 of the pulse (a dotted-eighth echo, a triplet layer) fits the onsets as
  // well as the beat does. Each candidate tempo is refitted and scored on three things: how much onset energy its grid sits
  // on, and how sharply the chords change on ITS bar lines (peak to mean of the chord-change novelty folded at its bar
  // period; a wrong count smears it). The three multiply into `score`. 2:1 and 1:2 (the same pulse counted twice as fast or
  // slow) are listed but never chosen: that is a matter of feel, not of fit.
  const fold = (per) => { const nb = 24, b = new Float64Array(nb), c = new Float64Array(nb); for (let t = 4; t < end - 2; t += 0.01) { const k = Math.floor(((t % per) / per) * nb); b[k] += novAt(H, t); c[k]++; } const v = Array.from(b, (q, i) => q / (c[i] || 1)), m = v.reduce((a, q) => a + q, 0) / nb; return m > 0 ? Math.max(...v) / m : 1; };
  const P = chordPeriods(H, end); // when the chords change: periods that are whole multiples of the right half bar
  const table = (period0, ratios) => ratios.map(([name, r]) => {
    const bpm0 = (60 / period0) * r;
    if (bpm0 < 55 || bpm0 > 200) return null;
    const c = r === 1 ? st : fitSteady(xf, FINE_HOP, 60 / bpm0, end);
    if (!c) return null;
    const q = c.shiftScore(0), ch = fold((4 * 60) / (60 / c.period)), pf = P.length ? periodFit(P, 2 * c.period) : 1, score = q * ch * pf * (c.steady ? 1 : 0.5);
    return { ratio: name, st: c, bpm: Math.round((60 / c.period) * 100) / 100, onset: r3(q), bars: r3(ch), chords: r3(pf), matched: r3(c.matched), residualMs: Math.round(c.rms * 10000) / 10, steady: c.steady, score };
  }).filter(Boolean);
  const SAME = [['1', 1]], FAMILY = [['1:2', 0.5], ['2:1', 2], ['3:4', 0.75], ['4:3', 4 / 3], ['2:3', 2 / 3], ['3:2', 1.5]];
  const SWITCH = 2.25; // a 3:2-type candidate must score this many times the pulse found first. On the ten reference tracks (human-annotated beats from two models) every value from 1.0 to about 5 gives the same, correct answer: no wrong candidate scores above 0.48 of the right count, the two right switches score above 2.25 by a wide margin (see the margins in test/refpack.test.js)
  let alternatives = [], ambiguity = 0, switchedFrom = null;
  if (st && st.steady && !forced) {
    let rows = table(st.period, [...SAME, ...FAMILY]);
    const base = rows.find((r) => r.ratio === '1'), win = rows.filter((r) => /^[234]:[234]$/.test(r.ratio) && r.ratio !== '2:2' && r.steady && r.score >= SWITCH * base.score).sort((a, b) => b.score - a.score)[0];
    if (win) { st = win.st; rows = table(st.period, [...SAME, ...FAMILY]); }
    const me = rows.find((r) => r.ratio === '1');
    alternatives = rows.filter((r) => r.ratio !== '1' && r.score >= 0.25 * me.score).sort((a, b) => b.score - a.score).slice(0, 4).map((r) => ({ ratio: r.ratio, bpm: r.bpm, score: r3(r.score / me.score), onset: r.onset, bars: r.bars, chords: r.chords, matched: r.matched, residualMs: r.residualMs, steady: r.steady }));
    ambiguity = Math.max(0, ...alternatives.filter((r) => /^[234]:[234]$/.test(r.ratio) && r.steady).map((r) => r.score));
    switchedFrom = win ? base.bpm : null;
  }
  if (st) fit = { method: st.steady || forced ? 'steady' : 'tracked', residualMs: Math.round(st.rms * 10000) / 10, driftMs: Math.round(st.maxLocal * 10000) / 10, matched: r3(st.matched), ...(forced ? { forcedBpm: forced } : {}), ...(switchedFrom ? { switchedFrom } : {}) };
  const useLine = st ? (forced ? true : st.steady && (gridOK || st.matched >= 0.3)) : gridOK;
  if (useLine) {
    const p = st ? st.period : cb.p * hopSec, ph = (((st ? st.phase : cb.ph * hopSec) % p) + p) % p;
    period = p; beats = [];
    for (let k = 0; ph + k * p <= end + 1e-9; k++) beats.push(r3(ph + k * p + FLUX_LEAD));
  } else {
    beats = ts.map(r3).filter((v) => v <= end + 1e-9);
    period = ts.length > 1 ? (ts.at(-1) - ts[0]) / (ts.length - 1) : tp.period * hopSec;
  }
  // A 16th-note groove has equal hits at four places in every beat; the strongest is not always the beat. Where several
  // places are about as strong, the chord changes decide (they happen on bar lines).
  const nov = (t) => (novAt(H, t - 0.03) + novAt(H, t) + novAt(H, t + 0.03)) / 3;
  const barTable = (bs) => { const v = [0, 0, 0, 0], c = [0, 0, 0, 0]; bs.forEach((t, i) => { if (t > 1 && t < end - 1) { v[i % 4] += nov(t); c[i % 4]++; } }); return v.map((x, j) => (c[j] ? x / c[j] : 0)); };
  let shifted = 0;
  if (useLine && st) {
    const base = st.shiftScore(0), grids = [];
    for (const q of [1, 3]) if (st.shiftScore((q * st.period) / 4) >= 0.7 * base) grids.push(q); // a 16th early or late; the 8th-note offbeat is a groove, not an error
    if (grids.length) {
      const make = (q) => { const p = period, ph0 = (beats[0] - FLUX_LEAD + (q * p) / 4) % p, o = []; for (let k = 0; ph0 + k * p <= end + 1e-9; k++) o.push(r3(ph0 + k * p + FLUX_LEAD)); return o; };
      const top = (bs) => Math.max(...barTable(bs));
      let bestQ = 0, bestV = top(beats);
      for (const q of grids) { const v = top(make(q)); if (v > bestV * 1.3) { bestV = v; bestQ = q; } }
      if (bestQ) { beats = make(bestQ); shifted = bestQ; }
    }
  }
  const bpm = Math.round(60 / period * 100) / 100;

  // confidence: periodic (autocorrelation) × beats land on real onsets × onsets stand out from the background
  let hit = 0, atBeat = 0;
  for (const t of beats) { const f = Math.round((t - FLUX_LEAD) / hopSec); if (f < 0 || f >= nUse) continue; let m = 0; for (let i = Math.max(0, f - 2); i <= Math.min(nUse - 1, f + 2); i++) m = Math.max(m, x[i]); atBeat += m; if (m > 1.5) hit++; }
  const nb = Math.max(1, beats.filter((t) => t < end).length);
  const c1 = clamp((tp.acf - 0.1) / 0.4), c2 = clamp(hit / nb / 0.6), c3 = clamp((atBeat / nb - 1.5) / 3);
  // absolute gate: normalizing by the std would turn the numerical fuzz of a steady pad into "rhythm"
  const c4 = clamp((mean - 0.3) / 0.6);
  // a count that another tempo explains about as well is a count to doubt (see `alternatives`)
  const confidence = r3(Math.cbrt(c1 * c2 * c3) * c4 / Math.min(2, 1 + Math.max(0, ambiguity - 0.7)));
  const clear = confidence >= 0.3;

  // mean square over [a, b) seconds from the 10 ms blocks, edge blocks weighted by overlap
  const ms = (a, b) => {
    const A = a / F.blockSec, B = Math.max(A + 1e-6, b / F.blockSec); let s = 0, w = 0;
    for (let k = Math.floor(A); k < Math.min(Math.ceil(B), F.rms.length); k++) { const o = Math.min(B, k + 1) - Math.max(A, k); s += F.rms[k] * F.rms[k] * o; w += o; }
    return s / (w || 1);
  };

  // downbeat: of the 4 beat phases, the one with the strongest bass hit + energy rise
  const beatE = beats.map((t, i) => Math.sqrt(ms(t, beats[i + 1] ?? t + period)));
  const bassAt = beats.map((t) => { const f = Math.round((t - FLUX_LEAD) / hopSec); let s = 0; for (let i = Math.max(0, f - 1); i <= Math.min(nF - 1, f + 6); i++) s += F.bass[i]; return s; });
  const meanOf = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length) || 1;
  const bm = meanOf(bassAt), em = meanOf(beatE);
  const phase = [0, 0, 0, 0];
  beats.forEach((_, i) => { phase[i % 4] += bassAt[i] / bm + 0.5 * Math.max(0, (beatE[i] - (beatE[i - 1] ?? beatE[i])) / em); });
  // the bar line: where the chords change, confirmed by the drums' own accent; a track whose harmony does not move
  // (a drone, a loop) falls back to the accent alone
  const hs = barTable(beats), hm = meanOf(hs), am = meanOf(phase), hn = hs.map((v) => v / (hm || 1)), an = phase.map((v) => v / am);
  // clear when one phase's chord change stands out from the next best (a snare on 2 and 4 smears the chroma on two phases, so two
  // phases high is the drums, not the chords) and from the track's usual amount of change
  const hsSorted = [...hs].sort((a, b) => b - a), chordsClear = hm > 0 && hsSorted[0] >= 1.4 * hsSorted[1] && hsSorted[0] >= 1.5 * H.mean;
  const total = hn.map((v, j) => (chordsClear ? 2 * v : 0) + an[j]);
  let ph = 0;
  for (let p = 1; p < 4; p++) if (total[p] > total[ph] * 1.0001) ph = p;
  const bars = { basis: chordsClear ? 'chords' : 'accent', chordContrast: r3(Math.max(...hn) / Math.max(1e-9, (hn.reduce((a, v) => a + v, 0) - Math.max(...hn)) / 3)), accentPhase: phase.indexOf(Math.max(...phase)), phase: ph };
  const downbeats = beats.filter((_, i) => i % 4 === ph);

  // bars (or 4 s blocks without a pulse) → loudness → sections and drops
  let edges;
  if (clear && downbeats.length >= 2) {
    edges = [0, ...downbeats.filter((t) => t > 0.05 && t < end - 0.05), end];
  } else {
    edges = []; for (let t = 0; t < end - 1e-9; t += 4) edges.push(t);
    edges.push(end);
  }
  edges = edges.filter((t, i) => i === 0 || t - edges[i - 1] > 0.05);
  const barRms = [];
  for (let i = 0; i + 1 < edges.length; i++) barRms.push(Math.sqrt(ms(edges[i], edges[i + 1])));
  const top = Math.max(1e-9, ...barRms), e01 = barRms.map((v) => v / top);
  // a new section starts when a bar is > 2.5 dB away from the running section; sections are >= 2 bars
  const sections = [];
  let cur = null;
  e01.forEach((e, i) => {
    const d = edges[i + 1] - edges[i];
    const dbd = cur ? Math.abs(20 * Math.log10((e + 1e-6) / (cur.sum / cur.dur + 1e-6))) : 0;
    if (!cur || (dbd > 2.5 && cur.n >= 2)) { cur = { start: edges[i], end: edges[i + 1], sum: e * d, dur: d, n: 1 }; sections.push(cur); }
    else { cur.end = edges[i + 1]; cur.sum += e * d; cur.dur += d; cur.n++; }
  });
  const sec = sections.map((s) => ({ start: r3(s.start), end: r3(s.end), e: s.sum / s.dur }));
  const smax = Math.max(1e-9, ...sec.map((s) => s.e));
  const outSections = sec.map((s) => ({ start: s.start, end: s.end, energy: r3(s.e / smax) }));

  const cand = [];
  for (let i = 1; i < e01.length; i++) {
    const before = i > 1 ? 0.5 * (e01[i - 1] + e01[i - 2]) : e01[0];
    cand.push({ t: r3(edges[i]), score: r3(clamp(e01[i] - before)) });
  }
  cand.sort((a, b) => b.score - a.score);
  const drops = [];
  for (const c of cand) {
    if (c.score < 0.05 || drops.length >= 3) break;
    if (drops.every((d) => Math.abs(d.t - c.t) > 4 * period * 1.5)) drops.push(c);
  }
  let map = null;
  try { if (downbeats.length >= 3) map = buildBarMap({ F, H, downbeats, end, ms, beatLen: period }); } catch { map = null; }
  return { bpm, confidence, alternatives, map, ...(tail ? { tail } : {}), fit: fit && { ...fit, shiftedSixteenths: shifted }, bars, beats, downbeats, sections: outSections, drops, end, duration: r3(duration) };
}

export const analyzeFile = (file, opts) => analyze(decode(file), opts);

// for the regression scripts and tests that look inside (not part of the API)
export const _internals = { chordPeriods, periodFit, harmony, novAt, features, envelope, fitSteady, fineEnv, FINE_HOP, FLUX_LEAD };
