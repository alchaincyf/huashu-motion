import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHANNELS, REVERBS, applyChain, chorus, chorusMono, delay, eq, glue, plate, saturate, transientShape, widen } from '../cli/lib/fx.js';
import { RATE } from '../cli/lib/dsp.js';

const sine = (f, sec, a = 0.5) => Float32Array.from({ length: Math.round(sec * RATE) }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / RATE));
const rms = (x, from = 0) => { let s = 0; for (let i = from; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / (x.length - from)); };
const dB = (x) => 20 * Math.log10(x);
const gainAt = (fn, f) => { const x = sine(f, 1.5), y = fn(x.slice()); const k = Math.round(0.75 * RATE); return dB(rms(y, k) / rms(x, k)); };
// deterministic noise, so a failure reproduces
const noiseBuf = (sec, a = 0.3) => { let s = 12345; return Float32Array.from({ length: Math.round(sec * RATE) }, () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return a * (s / 2147483648 - 1); }); };

// impulse response of the wet path only (dry impulse removed)
function ir(preset, extra = {}) {
  const n = Math.round((REVERBS[preset].decay * 1.6 + 0.5) * RATE), L = new Float32Array(n), R = new Float32Array(n);
  L[0] = 1; plate(L, R, { preset, wet: 1, ...extra }); L[0] -= 1;
  return [L, R];
}
// Schroeder backward integration, T20 (-5..-25 dB) x 3
function rt60(x) {
  const e = new Float64Array(x.length); let a = 0;
  for (let i = x.length - 1; i >= 0; i--) { a += x[i] * x[i]; e[i] = a; }
  let i5 = 0, i25 = 0;
  for (let i = 0; i < x.length; i++) { const d = 10 * Math.log10(e[i] / e[0]); if (!i5 && d < -5) i5 = i; if (d < -25) { i25 = i; break; } }
  return (3 * (i25 - i5)) / RATE;
}

test('plate: measured RT60 within 20% of decay for room / plate / hall', (t) => {
  for (const p of Object.keys(REVERBS)) {
    const [L, R] = ir(p), m = L.map((v, i) => v + R[i]), got = rt60(m), want = REVERBS[p].decay;
    t.diagnostic(`${p}: RT60 ${got.toFixed(2)} s vs ${want} s (${(((got - want) / want) * 100).toFixed(1)}%)`);
    assert.ok(Math.abs(got - want) / want < 0.2, `${p}: ${got} vs ${want}`);
  }
});

test('plate: tail is dense and smooth (no ringing, no discrete echoes after 50 ms) and decorrelated L/R', (t) => {
  for (const p of Object.keys(REVERBS)) {
    const [L, R] = ir(p), blk = Math.round(0.005 * RATE), db = [];
    for (let s = Math.round(0.05 * RATE); s + blk < L.length; s += blk) {
      let e = 0; for (let i = s; i < s + blk; i++) e += L[i] * L[i] + R[i] * R[i];
      db.push(10 * Math.log10(e / blk + 1e-20));
    }
    // fit a line until 40 dB below the start, then take the RMS deviation of 5 ms energies around it
    // (start at the loudest block: a hall is still building up at 50 ms)
    const pk = db.indexOf(Math.max(...db)), top = db[pk], k = db.findIndex((v, i) => i > pk && v < top - 40), y = db.slice(pk, k > 0 ? k : db.length), n = y.length;
    const mx = (n - 1) / 2, my = y.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0; y.forEach((v, i) => { sxy += (i - mx) * (v - my); sxx += (i - mx) ** 2; });
    const b = sxy / sxx, a = my - b * mx, dev = Math.sqrt(y.reduce((s, v, i) => s + (v - (a + b * i)) ** 2, 0) / n);
    // L/R correlation over the tail
    let lr = 0, ll = 0, rr = 0; for (let i = Math.round(0.05 * RATE); i < L.length; i++) { lr += L[i] * R[i]; ll += L[i] * L[i]; rr += R[i] * R[i]; }
    const corr = lr / Math.sqrt(ll * rr);
    t.diagnostic(`${p}: envelope deviation ${dev.toFixed(2)} dB over ${n} blocks, L/R corr ${corr.toFixed(3)}`);
    assert.ok(dev < 2.5, `${p}: envelope ripple ${dev} dB`);
    assert.ok(Math.abs(corr) < 0.3, `${p}: L/R correlation ${corr}`);
  }
});

test('plate: no NaN, silence in = silence out, dry untouched when wet=0', () => {
  const L = new Float32Array(48000), R = new Float32Array(48000);
  plate(L, R, { preset: 'hall' });
  assert.ok(L.every((v) => v === 0) && R.every((v) => v === 0));
  const x = noiseBuf(1), a = x.slice(), b = x.slice();
  plate(a, b, { preset: 'plate', wet: 0 });
  assert.deepEqual(a, x);
  const c = x.slice(), d = noiseBuf(1, 0.9); plate(c, d, { preset: 'hall', wet: 1, damp: 0 });
  assert.ok(c.every(Number.isFinite) && d.every(Number.isFinite));
});

test('eq: peak and shelf gain at the centre frequency within 0.5 dB', (t) => {
  for (const [f, g] of [[1000, 6], [250, -5], [4000, 8]]) {
    const got = gainAt((x) => eq(x, [{ type: 'peak', f, gain: g, q: 1 }]), f);
    t.diagnostic(`peak ${f} Hz ${g} dB -> ${got.toFixed(2)}`);
    assert.ok(Math.abs(got - g) < 0.5, `peak ${f}: ${got}`);
  }
  // RBJ shelf: corner is at half the dB gain; the plateau is reached well past it
  for (const [type, f, g, far] of [['lowshelf', 200, 6, 30], ['highshelf', 6000, -6, 20000]]) {
    const mid = gainAt((x) => eq(x, [{ type, f, gain: g }]), f), plateau = gainAt((x) => eq(x, [{ type, f, gain: g }]), far);
    t.diagnostic(`${type} ${f} Hz ${g} dB: corner ${mid.toFixed(2)} (want ${g / 2}), plateau ${plateau.toFixed(2)}`);
    assert.ok(Math.abs(mid - g / 2) < 0.5, `${type} corner ${mid}`);
    assert.ok(Math.abs(plateau - g) < 0.5, `${type} plateau ${plateau}`);
  }
});

test('eq: hp / lp are -3 dB at the cutoff (12 and 24 dB/oct) and 24 is steeper', (t) => {
  for (const type of ['hp', 'lp']) for (const order of [12, 24]) {
    const f = type === 'hp' ? 100 : 5000, got = gainAt((x) => eq(x, [{ type, f, order }]), f);
    t.diagnostic(`${type} ${order} dB/oct @ ${f}: ${got.toFixed(2)} dB`);
    assert.ok(Math.abs(got + 3.01) < 0.4, `${type} ${order}: ${got}`);
  }
  const a = gainAt((x) => eq(x, [{ type: 'hp', f: 100, order: 12 }]), 50), b = gainAt((x) => eq(x, [{ type: 'hp', f: 100, order: 24 }]), 50);
  assert.ok(b < a - 6, `an octave below: 12 dB ${a.toFixed(1)}, 24 dB ${b.toFixed(1)}`);
});

test('glue: reduces a loud signal, converges to the ratio, leaves a quiet one alone', (t) => {
  // sine peak 0.5 -> -9.03 dB RMS; threshold -21 dB, ratio 4 -> expect -21 + 12/4 = -18 dB RMS
  const mk = () => { const x = sine(220, 3, 0.5); return [x, x.slice()]; };
  const [L, R] = mk(); glue(L, R, { threshold: -21, ratio: 4, attack: 10, release: 100, knee: 0 });
  const k = 2 * RATE, out = dB(rms(L, k)), inn = dB(rms(sine(220, 3, 0.5), k));
  t.diagnostic(`in ${inn.toFixed(2)} dB, out ${out.toFixed(2)} dB, expected -18.0`);
  assert.ok(out < inn - 5);
  assert.ok(Math.abs(out + 18) < 0.7, `out ${out}`);
  assert.deepEqual(L, R); // stereo-linked: identical channels get identical gain
  const [q1, q2] = [sine(220, 2, 0.02), sine(220, 2, 0.02)], ref = q1.slice();
  glue(q1, q2, { threshold: -21, ratio: 4, knee: 6 });
  assert.ok(Math.abs(dB(rms(q1) / rms(ref))) < 0.05);
  // makeup applies
  const [m1, m2] = [sine(220, 1, 0.01), sine(220, 1, 0.01)];
  glue(m1, m2, { threshold: 0, makeup: 6 });
  assert.ok(Math.abs(dB(rms(m1, 24000) / rms(sine(220, 1, 0.01), 24000)) - 6) < 0.1);
});

test('widen: a 100 Hz tone keeps its L-R difference, highs get wider, amount 1 is identity', (t) => {
  const mkSide = (f) => { const a = sine(f, 1, 0.3), b = sine(f, 1, 0.1); const L = a.map((v, i) => v + b[i] * 0.5), R = a.map((v, i) => v - b[i] * 0.5); return [L, R]; };
  const diff = (L, R) => { const d = L.map((v, i) => v - R[i]); return rms(d, 24000); };
  let [L, R] = mkSide(100); const d0 = diff(L, R); widen(L, R, 2);
  const d1 = diff(L, R); t.diagnostic(`100 Hz L-R rms ${d0.toFixed(4)} -> ${d1.toFixed(4)} (${((d1 / d0 - 1) * 100).toFixed(1)}%)`);
  assert.ok(Math.abs(d1 / d0 - 1) < 0.05);
  [L, R] = mkSide(2000); const h0 = diff(L, R); widen(L, R, 2);
  const h1 = diff(L, R); t.diagnostic(`2 kHz L-R rms ${h0.toFixed(4)} -> ${h1.toFixed(4)}`);
  assert.ok(Math.abs(h1 / h0 - 2) < 0.1);
  const [A, B] = mkSide(2000), A0 = A.slice(); widen(A, B, 1);
  assert.deepEqual(A, A0);
  // mid is untouched
  const [C, D] = mkSide(3000), m0 = C.map((v, i) => v + D[i]); widen(C, D, 1.7);
  assert.ok(C.every((v, i) => Math.abs(v + D[i] - m0[i]) < 1e-5));
});

test('saturate: adds even and odd harmonics, level-matched, silent in = silent out, tone darkens', (t) => {
  const x = sine(220, 1, 0.4), y = saturate(x.slice(), { drive: 0.7, mix: 1, tone: 1 });
  const bin = (s, f) => { let re = 0, im = 0; const w = 2 * Math.PI * f / RATE; for (let i = 12000; i < 36000; i++) { re += s[i] * Math.cos(w * i); im += s[i] * Math.sin(w * i); } return Math.hypot(re, im) / 12000; };
  const h2 = bin(y, 440), h3 = bin(y, 660), f1 = bin(y, 220);
  t.diagnostic(`H2 ${dB(h2 / f1).toFixed(1)} dB, H3 ${dB(h3 / f1).toFixed(1)} dB, level change ${dB(rms(y, 12000) / rms(x, 12000)).toFixed(2)} dB`);
  assert.ok(h2 / f1 > 0.01 && h3 / f1 > 0.01, 'both harmonics present');
  assert.ok(Math.abs(dB(rms(y, 12000) / rms(x, 12000))) < 1, 'level matched');
  assert.ok(saturate(new Float32Array(4800)).every((v) => v === 0));
  const bright = saturate(sine(220, 1, 0.4), { drive: 0.9, tone: 1 }), dark = saturate(sine(220, 1, 0.4), { drive: 0.9, tone: 0 });
  assert.ok(bin(dark, 1980) < bin(bright, 1980) * 0.5, 'tone=0 cuts the 9th harmonic');
  // small signal passes nearly linearly (mix 1) when drive is low
  const q = sine(220, 1, 0.01), r = saturate(q.slice(), { drive: 0.05, tone: 1 });
  assert.ok(Math.abs(dB(rms(r, 12000) / rms(q, 12000))) < 0.5);
});

test('delay: echoes land on time, ping-pong alternates sides, feedback decays and gets darker', () => {
  const n = 2 * RATE, L = new Float32Array(n), R = new Float32Array(n); L[0] = 1; R[0] = 1;
  delay(L, R, { time: 0.25, feedback: 0.5, pingpong: true, lp: 3000, wet: 1 });
  const D = 0.25 * RATE, peak = (X, c) => { let m = 0, k = 0; for (let i = c - 400; i < c + 400; i++) if (Math.abs(X[i]) > m) { m = Math.abs(X[i]); k = i; } return [m, k]; };
  const [a1, k1] = peak(L, D), [b1] = peak(R, D), [a2] = peak(L, 2 * D), [b2, k2] = peak(R, 2 * D);
  assert.ok(a1 > 0.2 && b1 < 0.01 && a2 < 0.01 && b2 > 0.05, `L1 ${a1} R1 ${b1} L2 ${a2} R2 ${b2}`);
  assert.ok(Math.abs(k1 - D) < 200 && Math.abs(k2 - 2 * D) < 400);
  assert.ok(b2 < a1);
  const S = new Float32Array(n); S[0] = 0.5; const T = S.slice();
  delay(S, T, { time: 0.1, feedback: 0.4, pingpong: false, wet: 1 });
  assert.ok(S.every(Number.isFinite) && S[4800] > 0 && T[4800] > 0);
  assert.ok(Math.abs(S[0] - 0.5) < 1e-9, 'dry untouched');
});

test('chorus: mono in gives decorrelated stereo, mix 0 is dry, pitch stays centred, no NaN', (t) => {
  const x = sine(440, 1, 0.4), [L, R] = chorusMono(x);
  const d = L.map((v, i) => v - R[i]);
  assert.ok(rms(d, 24000) > 0.02, 'wide');
  assert.deepEqual(x, sine(440, 1, 0.4), 'input untouched');
  assert.ok(Math.abs(dB(rms(L, 24000) / rms(x, 24000))) < 3, 'level held');
  const a = sine(300, 0.5), b = a.slice(), a0 = a.slice(); chorus(a, b, { mix: 0 });
  assert.deepEqual(a, a0);
  assert.ok(L.every(Number.isFinite) && R.every(Number.isFinite));
  assert.ok(chorusMono(new Float32Array(4800)).every((c) => c.every((v) => v === 0)));
});

test('transientShape: attack>0 lifts the hit relative to the tail; sustain>0 lifts the tail; 0/0 is ~transparent', () => {
  const hit = () => { const x = new Float32Array(RATE); for (let k = 0; k < 4; k++) for (let i = 0; i < 11000; i++) x[k * 12000 + i] = 0.8 * Math.exp(-i / 2500) * Math.sin(i * 0.1); return x; };
  const peakIn = (x, k) => { let m = 0; for (let i = k * 12000; i < k * 12000 + 300; i++) m = Math.max(m, Math.abs(x[i])); return m; };
  const tail = (x, k) => rms(x.slice(k * 12000 + 6000, k * 12000 + 9000));
  const base = hit(), up = transientShape(hit(), { attack: 1, sustain: 0 }), sus = transientShape(hit(), { attack: 0, sustain: 1 }), flat = transientShape(hit(), { attack: 0, sustain: 0 });
  assert.ok(peakIn(up, 2) / tail(up, 2) > (peakIn(base, 2) / tail(base, 2)) * 1.3);
  assert.ok(tail(sus, 2) / peakIn(sus, 2) > (tail(base, 2) / peakIn(base, 2)) * 1.3);
  assert.ok(Math.abs(dB(rms(flat) / rms(base))) < 0.01, '0/0 leaves the level alone');
});

test('everything: no NaN on loud noise, silence stays silent, all chains work on mono and stereo', () => {
  for (const [name, chain] of Object.entries(CHANNELS)) {
    const [L, R] = applyChain(new Float32Array(48000), null, chain, { bpm: 120 });
    assert.ok(L.every((v) => v === 0) && R.every((v) => v === 0), `${name} silence`);
    const x = noiseBuf(2, 0.9), [a, b] = applyChain(x.slice(), x.slice().reverse(), chain, { bpm: 120 });
    assert.ok(a.every(Number.isFinite) && b.every(Number.isFinite), `${name} finite`);
    assert.ok(a.some((v) => v !== 0));
  }
  assert.throws(() => applyChain(new Float32Array(10), null, [{ fx: 'nope' }]));
});

test('applyChain: bass chain stays dry and centred; keys chain widens a mono source', () => {
  const bass = sine(55, 1, 0.5), [bl, br] = applyChain(bass.slice(), null, CHANNELS.bass);
  assert.ok(rms(bl.map((v, i) => v - br[i])) < 1e-6, 'bass stays mono');
  const keys = sine(440, 1, 0.3), [kl, kr] = applyChain(keys.slice(), null, CHANNELS.keys);
  assert.ok(rms(kl.map((v, i) => v - kr[i]), 24000) > 0.01, 'keys get stereo');
});

test('performance: 30 s stereo plate < 1.5 s, one channel chain < 1 s', (t) => {
  // CPU time, best of three: the cost of the computation, not how long a busy machine (the test files run in parallel) kept it waiting
  const mk = () => { const L = noiseBuf(30, 0.3), R = noiseBuf(30, 0.3); return [L, R]; };
  const best = (fn) => { let m = Infinity; for (let k = 0; k < 3; k++) { const [L, R] = mk(), c0 = process.cpuUsage(); fn(L, R); const c = process.cpuUsage(c0); m = Math.min(m, (c.user + c.system) / 1000); } return m; };
  const tp = best((L, R) => plate(L, R, { preset: 'hall' }));
  t.diagnostic(`plate hall 30 s: ${tp.toFixed(0)} ms`);
  assert.ok(tp < 1500, `plate took ${tp} ms`);
  for (const name of Object.keys(CHANNELS)) {
    const tc = best((L, R) => applyChain(L, R, CHANNELS[name], { bpm: 110 }));
    t.diagnostic(`chain ${name} 30 s: ${tc.toFixed(0)} ms`);
    assert.ok(tc < 1000, `${name} took ${tc} ms`);
  }
});
