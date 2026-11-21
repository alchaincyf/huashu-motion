import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze, beatAt, decode } from '../cli/lib/beats.js';
import { chordSong, song as fixtureSong } from './music-fixture.js';

const RATE = 48000;
// own noise source and 16-bit wav writer: this test must not depend on the sound module
const rng = (seed) => { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };
function toWav({ n, L, R }) {
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(L[i] * 32767), 44 + i * 4); b.writeInt16LE(Math.round(R[i] * 32767), 46 + i * 4); }
  return b;
}
const hasFfmpeg = !spawnSync('ffmpeg', ['-version']).error;

// ---------- tiny drum machine ----------

function kick(buf, t, vel) {
  const r = Math.round(t * RATE), n = Math.round(0.35 * RATE);
  for (let i = 0; i < n && r + i < buf.length; i++) {
    const s = i / RATE, ph = 2 * Math.PI * (45 * s + (110 - 45) * 0.04 * (1 - Math.exp(-s / 0.04)));
    buf[r + i] += vel * Math.sin(ph) * Math.exp(-s / 0.12);
  }
}
function noiseHit(buf, t, vel, tau, rand) { // hi-passed noise: first difference
  const r = Math.round(t * RATE), n = Math.round(tau * 6 * RATE);
  let prev = 0;
  for (let i = 0; i < n && r + i < buf.length; i++) { const w = rand() * 2 - 1; buf[r + i] += vel * (w - prev) * 0.5 * Math.exp(-i / RATE / tau); prev = w; }
}
function pad(buf, from, to, vel, ramp = 1) { // slow chord, steady
  for (let i = Math.round(from * RATE); i < Math.min(buf.length, Math.round(to * RATE)); i++) {
    const s = i / RATE, fade = Math.min(1, (i - from * RATE) / (ramp * RATE), (to * RATE - i) / (ramp * RATE));
    buf[i] += vel * fade * (Math.sin(2 * Math.PI * 220 * s) + Math.sin(2 * Math.PI * 277.18 * s) + Math.sin(2 * Math.PI * 329.63 * s)) / 3;
  }
}
const stereo = (m) => ({ L: m, R: Float32Array.from(m, (v) => v * 0.98), rate: RATE });

// 4/4 house-ish: 8 bars of hat+pad (quiet), then full drums. Truth beat k at t0 + k·60/bpm, bar starts every 4th.
const T0 = 0.1;
function song(bpm, bars = 20, intro = 8) {
  const beat = 60 / bpm, dur = T0 + bars * 4 * beat + 1.5, buf = new Float32Array(Math.round(dur * RATE)), rand = rng(bpm);
  pad(buf, 0, dur, 0.08, 0.05);
  for (let k = 0; k < bars * 4; k++) {
    const t = T0 + k * beat, full = k >= intro * 4;
    noiseHit(buf, t + beat / 2, full ? 0.25 : 0.1, 0.02, rand); // hat on the off-beat
    if (full) {
      kick(buf, t, k % 4 === 0 ? 0.9 : 0.65);
      if (k % 4 === 1 || k % 4 === 3) noiseHit(buf, t, 0.35, 0.06, rand); // snare
    }
  }
  return { pcm: stereo(buf), bpm, beat, bars, intro };
}
// distance of every t to the nearest point of the lattice t0 + k·step
const latticeDev = (ts, t0, step) => ts.map((t) => { const r = (((t - t0) % step) + step) % step; return Math.min(r, step - r); });
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

for (const bpm of [100, 128, 90]) {
  test(`analyze: ${bpm} bpm drums with a quiet intro`, () => {
    const s = song(bpm), r = analyze(s.pcm);
    const dev = latticeDev(r.beats, T0, s.beat);
    console.log(`  ${bpm}: bpm ${r.bpm} conf ${r.confidence} beat dev ${(mean(dev) * 1000).toFixed(1)}ms max ${(Math.max(...dev) * 1000).toFixed(1)}ms drop ${JSON.stringify(r.drops[0])} sections ${JSON.stringify(r.sections)}`);
    assert.ok(Math.abs(r.bpm - bpm) < 1, `bpm ${r.bpm}`);
    assert.ok(r.confidence > 0.5, `confidence ${r.confidence}`);
    assert.ok(mean(dev) < 0.015, `mean beat deviation ${mean(dev)}`);
    const bar9 = T0 + s.intro * 4 * s.beat;
    assert.ok(Math.abs(r.drops[0].t - bar9) <= s.beat, `drop at ${r.drops[0].t}, bar 9 at ${bar9}`);
    // downbeats are the true bar starts (every 4th truth beat), not some other phase
    assert.ok(Math.max(...latticeDev(r.downbeats, T0, 4 * s.beat)) < 0.03, 'downbeat phase');
    assert.ok(r.downbeats.length >= s.bars - 1);
    // two sections split at bar 9, the second louder
    assert.ok(r.sections.length >= 2);
    assert.ok(Math.abs(r.sections[1].start - bar9) <= s.beat);
    assert.ok(r.sections[0].energy < 0.5 && r.sections[1].energy === 1);
    assert.ok(Math.abs(r.end - (T0 + s.bars * 4 * s.beat)) < 1.6);
  });
}

test('analyze: 175 bpm trap with half-time feel gives 175 or 87.5 on a consistent grid', () => {
  const bpm = 175, beat = 60 / bpm, bars = 24, buf = new Float32Array(Math.round((T0 + bars * 4 * beat + 1.5) * RATE)), rand = rng(7);
  pad(buf, 0, buf.length / RATE, 0.05);
  for (let k = 0; k < bars * 4 * 2; k++) { // 8ths at 175, with a roll on the last beat of every bar
    const t = T0 + k * beat / 2, inBar = k % 8;
    noiseHit(buf, t, inBar % 2 ? 0.12 : 0.2, 0.012, rand);
    if (inBar >= 6) noiseHit(buf, t + beat / 4, 0.12, 0.01, rand);
  }
  for (let b = 0; b < bars; b++) { kick(buf, T0 + b * 4 * beat, 0.9); noiseHit(buf, T0 + (b * 4 + 2) * beat, 0.5, 0.07, rand); }
  const r = analyze(stereo(buf));
  const half = Math.abs(r.bpm - 87.5) < 1, full = Math.abs(r.bpm - 175) < 1.5;
  const dev = latticeDev(r.beats, T0, half ? 2 * beat : beat);
  console.log(`  175 trap: bpm ${r.bpm} conf ${r.confidence} beat dev ${(mean(dev) * 1000).toFixed(1)}ms max ${(Math.max(...dev) * 1000).toFixed(1)}ms`);
  assert.ok(half || full, `bpm ${r.bpm}`);
  assert.ok(mean(dev) < 0.02, `mean beat deviation ${mean(dev)}`);
});

test('analyze: a drifting tempo falls back to the tracker and still lands on the kicks', () => {
  const buf = new Float32Array(Math.round(62 * RATE)), rand = rng(3), kicks = [];
  for (let t = 0.2, bpm = 100; t < 58; bpm += 0.4 * 60 / bpm) { kick(buf, t, 0.8); noiseHit(buf, t + 30 / bpm, 0.15, 0.02, rand); kicks.push(t); t += 60 / bpm; } // 100 → ~125 bpm
  const r = analyze(stereo(buf));
  const dev = r.beats.map((b) => Math.min(...kicks.map((k) => Math.abs(k - b))));
  console.log(`  drift: bpm ${r.bpm} conf ${r.confidence} beats ${r.beats.length}/${kicks.length} mean dev ${(mean(dev) * 1000).toFixed(1)}ms max ${(Math.max(...dev) * 1000).toFixed(1)}ms`);
  assert.ok(r.beats.length >= kicks.length - 3 && r.beats.length <= kicks.length + 3);
  assert.ok(mean(dev) < 0.03, `mean deviation ${mean(dev)}`);
  assert.equal(r.fit.method, 'tracked', 'a tempo that moves is not fitted with one line');
  assert.deepEqual(r.alternatives, []);
});

test('analyze: a pad with no percussion has no pulse but still gets energy sections', () => {
  const buf = new Float32Array(30 * RATE);
  pad(buf, 0, 12, 0.3);
  pad(buf, 12, 30, 0.6); // louder from 12 s
  const r = analyze(stereo(buf));
  console.log(`  pad: conf ${r.confidence} sections ${JSON.stringify(r.sections)}`);
  assert.ok(r.confidence < 0.3, `confidence ${r.confidence}`);
  assert.ok(r.sections.length >= 1 && r.sections.every((s) => s.energy >= 0 && s.energy <= 1 && s.end > s.start));
  assert.ok(Math.abs(r.end - 30) < 1.1);
});

test('analyze: silence and tiny inputs do not throw', () => {
  const r = analyze(stereo(new Float32Array(RATE)));
  assert.equal(r.end, 0);
  assert.ok(r.confidence < 0.3);
});

test('beatAt interpolates fractional beats and extrapolates with the nearest beat length', () => {
  const beats = [1, 2, 3.5, 5];
  assert.equal(beatAt(beats, 0), 1);
  assert.equal(beatAt(beats, 2), 3.5);
  assert.equal(beatAt(beats, 0.5), 1.5);
  assert.equal(beatAt(beats, 1.5), 2.75);
  assert.equal(beatAt(beats, 3), 5);
  assert.equal(beatAt(beats, 5), 5 + 2 * 1.5); // last beat length 1.5
  assert.equal(beatAt(beats, -2), 1 - 2 * 1); // first beat length 1
  assert.equal(beatAt([4], 3), 4);
});

test('decode: ffmpeg round-trips a synthesized wav', { skip: !hasFfmpeg && 'ffmpeg not installed' }, () => {
  const n = RATE, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / RATE); R[i] = 0.25 * Math.sin(2 * Math.PI * 660 * i / RATE); }
  const dir = mkdtempSync(join(tmpdir(), 'om-beats-')), file = join(dir, 'tone.wav');
  writeFileSync(file, toWav({ n, L, R }));
  const d = decode(file);
  assert.equal(d.rate, RATE);
  assert.ok(Math.abs(d.duration - 1) < 0.01);
  let err = 0;
  for (let i = 1000; i < 2000; i++) err = Math.max(err, Math.abs(d.L[i] - L[i]), Math.abs(d.R[i] - R[i]));
  assert.ok(err < 1e-3, `max sample error ${err}`);
  assert.throws(() => decode(join(dir, 'missing.wav')), /could not decode/);
});

// ---------- a steady tempo is fitted over the whole track; the count and the bar line are checked ----------

const lattice = (ts, t0, step) => ts.map((t) => { const r = (((t - t0) % step) + step) % step; return Math.min(r, step - r); });

test('analyze: a steady tempo that is not a whole number drifts less than 10 ms over two minutes', () => {
  for (const bpm of [117.37, 120, 99.6]) {
    const s = fixtureSong({ bpm, bars: Math.round(120 / (4 * 60 / bpm)) }), r = analyze(s);
    const dev = lattice(r.beats, s.t0, s.beat);
    console.log(`  ${bpm}: bpm ${r.bpm} residual ${r.fit.residualMs}ms drift ${r.fit.driftMs}ms beats ${r.beats.length} max dev ${(Math.max(...dev) * 1000).toFixed(1)}ms`);
    assert.equal(r.fit.method, 'steady');
    assert.ok(Math.abs(r.bpm - bpm) < 0.02, `bpm ${r.bpm}`);
    assert.ok(Math.max(...dev) < 0.01, `worst beat ${Math.max(...dev) * 1000} ms off its lattice`);
    assert.ok(r.fit.residualMs < 10 && r.fit.driftMs < 10);
    assert.ok(r.beats.at(-1) - r.beats[0] > 110, 'the grid runs the whole track');
  }
});

test('analyze: a dotted-eighth layer that makes the pulse look 4:3 too fast is counted back to the beat, with the other count listed', () => {
  const s = chordSong({ bpm: 92, echo: true, echoGain: 0.35, padGain: 0.4 }), r = analyze(s);
  console.log(`  echo: bpm ${r.bpm} from ${r.fit.switchedFrom} conf ${r.confidence} alts ${r.alternatives.map((a) => `${a.ratio} ${a.bpm} ${a.score}`).join(', ')}`);
  assert.ok(Math.abs(r.bpm - 92) < 0.1, `bpm ${r.bpm}`);
  assert.ok(Math.abs(r.fit.switchedFrom - 122.67) < 0.2, `first estimate ${r.fit.switchedFrom}`);
  const back = r.alternatives.find((a) => a.ratio === '4:3');
  assert.ok(back && Math.abs(back.bpm - 122.67) < 0.2 && back.score < 1);
  assert.ok(Math.max(...lattice(r.beats, s.t0, s.beat)) < 0.012);
});

test('analyze: a harder dotted-eighth case (echo as loud as the beat, no hats) is resolved by the chord periods; a given tempo is fitted, phase included', () => {
  // before the chord periods counted, this fixture kept 122.67 with a lowered confidence; the progression repeats every 4 bars of
  // 92 bpm, which are not a whole number of half bars at 122.67, so the right count now wins outright
  const s = chordSong({ bpm: 92, echo: true, echoGain: 0.5, hats: false, padGain: 0.5 }), r = analyze(s);
  assert.ok(Math.abs(r.bpm - 92) < 0.2, `bpm ${r.bpm}`);
  assert.ok(r.fit.switchedFrom > 120, 'counted back from the dotted-eighth pulse');
  const wrong = r.alternatives.find((a) => a.ratio === '4:3');
  assert.ok(!wrong || wrong.score < 0.5, JSON.stringify(wrong));
  const g = analyze(s, { bpm: 92.4 }); // roughly right is enough: the period is refitted within 1 %, the phase freely
  assert.ok(Math.abs(g.bpm - 92) < 0.15 && g.fit.forcedBpm === 92.4, `bpm ${g.bpm}`);
  assert.ok(Math.max(...lattice(g.beats, s.t0, s.beat)) < 0.012);
  assert.ok(Math.max(...lattice(g.downbeats, s.t0, s.bar)) < 0.012, 'bar lines on the chord changes');
});

test('analyze: the bar line is where the chords change, even when the kick is strongest on beat 2', () => {
  const s = chordSong({ bpm: 100, accent: 1 }), r = analyze(s);
  assert.equal(r.bars.basis, 'chords');
  assert.equal(r.bars.accentPhase, 1, 'the drums alone would put the bar line on the second beat');
  assert.ok(Math.max(...lattice(r.downbeats, s.t0, s.bar)) < 0.012, 'bar lines at the chord changes');
  assert.ok(r.downbeats.length >= 38);
  const plain = chordSong({ bpm: 100, accent: 0 }), p = analyze(plain);
  assert.ok(Math.max(...lattice(p.downbeats, plain.t0, plain.bar)) < 0.012);
});
