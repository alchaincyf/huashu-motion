import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../cli/lib/beats.js';
import { arrangeTrack, filmStructure, joinScore, stretchRatio, scaleAnalysis, arrangeLines, measureArrangement, fitDurations } from '../cli/lib/arrange.js';
import { planTrack, renderTrack, beatsData } from '../cli/lib/track.js';
import { song } from './music-fixture.js';

const NOTE = (k) => Array.from({ length: 12 }, (_, i) => (i === k % 12 || i === (k + 7) % 12 ? 1 : 0.05)).map((v) => v / 2.1);

// A hand-made analysis: 2 s bars from 0.1 s, energy given per bar, chord per bar (a root 0-11); the music ends 0.9 s after the last bar.
function made(energies, chords = null, { confidence = 0.8, endingStart = null, endType = 'cadence' } = {}) {
  const bars = energies.map((e, i) => {
    const root = chords ? chords[i] : 0, c = NOTE(root), db = -30 + 12 * e;
    return { i, start: 0.1 + 2 * i, end: 2.1 + 2 * i, db, dbIn: db, dbOut: db, atk: i % 4 === 0 ? 6 : 0, hf: -40 + 10 * e, lf: -30, chord: String(root), chroma: c, head: c, tail: c, e, tonic: root === 0 };
  });
  const segments = []; let from = 0;
  for (let i = 1; i <= bars.length; i++) if (i === bars.length || Math.abs(bars[i].e - bars[from].e) > 0.2) { const e = bars.slice(from, i).reduce((a, b) => a + b.e, 0) / (i - from); segments.push({ from, to: i, start: bars[from].start, end: bars[i - 1].end, label: e < 0.4 ? (from === 0 ? 'intro' : 'verse') : 'main', grade: e < 0.35 ? 0 : e < 0.6 ? 1 : e < 0.85 ? 2 : 3, energy: e }); from = i; }
  const lifts = segments.map((g, k) => ({ g, k })).filter(({ g, k }) => k > 0 && g.energy - segments[k - 1].energy >= 0.15).map(({ g }) => ({ bar: g.from, step: g.energy - segments[g.from ? segments.findIndex((x) => x.to === g.from) : 0].energy, pickup: g.from - 1 }));
  const closers = bars.map((b, j) => ({ b, j })).filter(({ b, j }) => b.tonic && (!bars[j + 1] || b.e - bars[j + 1].e >= 0.12)).map(({ j }) => ({ bar: j, score: 0.7 }));
  const downbeats = bars.map((b) => b.start), beats = [], M = bars.length, end = 0.1 + 2 * M + 0.9;
  for (const b of bars) for (let k = 0; k < 4; k++) beats.push(b.start + k * 0.5);
  const ending = { type: endType, decaySec: 0.9, loudUntil: end - 0.9, bodyDb: -20, lastStrong: M - 1, lastStrongChord: '0', startBar: endingStart ?? M - 4, seconds: end - bars[endingStart ?? M - 4].start };
  return { bpm: 120, confidence, alternatives: [], fit: null, bars: downbeats, beats, downbeats, sections: [], drops: [], end, duration: end + 1, map: { key: { chord: '0' }, dynamics: { rangeDb: 9, quietBars: 4 }, bars, segments, closers, lifts, opening: { bars: 2, label: 'intro' }, ending } };
}
// intro, build, main, breakdown, main (two phrases of 4), outro that decays: 28 bars
const energies = [0.1, 0.12, 0.3, 0.32, 0.3, 0.32, 0.9, 0.92, 0.9, 0.94, 0.92, 0.9, 0.92, 0.94, 0.5, 0.5, 0.9, 0.92, 0.9, 0.94, 0.92, 0.9, 0.92, 0.94, 0.7, 0.6, 0.45, 0.4];

test('film structure: seconds, scene names, [from, to] stops; unknown names are reported, not guessed', () => {
  const st = filmStructure({ labels: { 'scene:hero': 0, 'scene:drop': 12 }, music: { burst: 'drop', peak: 24, stop: [11, 12], energy: { hero: 0.2 } }, duration: 34 });
  assert.equal(st.burst, 12); assert.equal(st.peak, 24); assert.deepEqual(st.stop, [11, 12]); assert.equal(st.energy.hero, 0.2);
  const bad = filmStructure({ labels: {}, music: { burst: 'nowhere', stop: 'x' }, duration: 10 });
  assert.equal(bad.burst, null); assert.equal(bad.notes.length, 2);
});

test('arrange: three parts — the track\'s own opening, joins only inside stable stretches, the ending as the track has it', () => {
  const an = made(energies), film = { labels: { 'scene:a': 0, 'scene:b': 8, 'scene:c': 16 }, music: { burst: 12, peak: 22 } };
  const r = arrangeTrack(an, { duration: 36, film });
  assert.ok(r.ok, r.reason);
  // opening: the first bars of the file, untouched, from its start
  assert.deepEqual(r.steps.slice(0, 2).map((s) => s.bar), [0, 1]);
  assert.equal(r.segs[0].from, r.pickup); assert.equal(r.segs[0].out, 0);
  // no join touches a lift, its fill bar or the bar after it
  const prot = new Set(); for (const g of an.map.segments) if (g.from > 0) for (const i of [g.from - 1, g.from, g.from + 1]) prot.add(i);
  for (const j of r.joins) { assert.ok(!prot.has(j.from) && !prot.has(j.to), `join ${j.from}->${j.to} is inside a protected run`); assert.ok(Math.abs(j.dLoud) <= 3 && j.score >= 0.55, JSON.stringify(j)); }
  // the ending is the track's own (or a button / fade only when it cannot be), and the music ends on the film's last frame
  assert.ok(['natural', 'button', 'fade'].includes(r.endingKind));
  if (r.endingKind === 'natural') assert.ok(Math.abs(r.ending.musicEnds - 36) <= r.barLen / 2 + 0.01, `music ends at ${r.ending.musicEnds}`);
  assert.ok(r.alternatives.length >= 1 && r.strategy);
});

test('arrange: a join between unrelated chords is scored lower, and a harmony that is too far is not allowed', () => {
  const same = made(energies, energies.map(() => 0)), diff = made(energies, energies.map((_, i) => (i * 5) % 12));
  assert.ok(joinScore(same.map, 6, 16) > 0.9);
  assert.ok(joinScore(diff.map, 6, 16) < joinScore(same.map, 6, 16) - 0.3);
  const r = arrangeTrack(diff, { duration: 36, film: { labels: {}, music: {} } });
  if (r.ok) for (const j of r.joins) assert.ok(j.score >= 0.55, JSON.stringify(j));
});

test('arrange: a loudness step at a join is leveled by at most 2 dB of static gain and what remains is within 3 dB', () => {
  const an = made(energies);
  an.map.bars.forEach((b, i) => { if (i >= 16 && i < 24) { b.dbIn += 5; b.dbOut += 5; b.db += 5; } }); // the second main block is 5 dB louder
  const r = arrangeTrack(an, { duration: 36, film: { labels: {}, music: { burst: 12 } } });
  if (r.ok) for (const j of r.joins) assert.ok(Math.abs(j.dLoud) - Math.min(2, Math.abs(j.dLoud)) <= 3.05 && Math.abs(j.gain) <= 3, `join ${j.from}->${j.to} steps ${j.dLoud} dB, gain ${j.gain}`); // up to 2 dB of static gain levels what is left of the step to 3
});

test('arrange: says why it falls back (no pulse, no map, no fit, film shorter than two bars) and plans the straight cut', () => {
  const an = made(energies);
  assert.match(arrangeTrack({ ...an, confidence: 0.1 }, { duration: 20, film: {} }).reason, /no clear pulse/);
  assert.match(arrangeTrack({ ...an, map: null }, { duration: 20, film: {} }).reason, /no bar map/);
  assert.match(arrangeTrack(an, { duration: 3, film: {} }).reason, /shorter than two bars/);
  const plan = planTrack({ ...an, confidence: 0.1 }, { duration: 20, start: 0, film: { labels: {}, music: {} } });
  assert.equal(plan.arrange, null); assert.match(plan.arrangeNote, /no clear pulse/);
  assert.match(arrangeLines({ ...an, confidence: 0.1 }, plan).join('\n'), /straight cut from 0.00s.*no clear pulse/);
  const off = planTrack(an, { duration: 20, start: 0, film: { labels: {}, music: { burst: 6 } }, arrange: 'off' });
  assert.equal(off.arrange, null); assert.equal(off.arrangeNote, null);
});

test('arrange: the film\'s beat grid stays whole across a join, and the track\'s own ending is taken at any length (its last k bars)', () => {
  const an = made(energies), r = planTrack(an, { duration: 36, start: 0, film: { labels: {}, music: { burst: 12 } } });
  assert.ok(r.arrange);
  const gaps = r.beats.slice(1, 60).map((t, i) => t - r.beats[i]);
  assert.ok(gaps.every((g) => Math.abs(g - 0.5) < 0.02 || g > 0.5), `beat gaps ${gaps.map((g) => g.toFixed(3)).join(' ')}`);
  const long = made(energies, null, { endingStart: 4 }); // the track's closing stretch is long: a shorter piece of it (its last k bars) is taken, not given up
  const r2 = planTrack(long, { duration: 30, start: 0, film: { labels: {}, music: {} } });
  assert.ok(r2.arrange, r2.arrangeNote);
  assert.equal(r2.arrange.endingKind, 'natural');
  assert.ok(r2.arrange.ending.musicEnds <= 31.1 && r2.arrange.ending.bars >= 1);
  const d = beatsData(r, { src: 'a.wav', name: 'a' });
  assert.ok(d.arranged && d.arrange.joins.length === r.arrange.joins.length);
});

test('arrange: audio — a declared stop is a clean dip on whole beats, none by default; joins have no click; a button ends in a ring that dies away', () => {
  const n = 48000 * 70, pcm = { L: new Float32Array(n), R: new Float32Array(n), rate: 48000 };
  for (let i = 0; i < n; i++) { const v = 0.3 * Math.sin((2 * Math.PI * 220 * i) / 48000); pcm.L[i] = v; pcm.R[i] = v; }
  const an = made(energies);
  const none = planTrack(an, { duration: 36, start: 0, film: { labels: {}, music: { burst: 12 } } });
  assert.equal(none.duck, null);
  const r = planTrack(an, { duration: 36, start: 0, film: { labels: {}, music: { burst: 12, stop: [11, 12] } } });
  assert.ok(r.arrange && r.duck);
  const beat = r.arrange.barLen / 4;
  for (const t of [r.duck.from, r.duck.to]) assert.ok(Math.abs(((t - r.arrange.grid) / beat) - Math.round((t - r.arrange.grid) / beat)) < 0.02, `${t} is not on a beat`);
  const out = renderTrack(pcm, r), rms = (a, b) => { let s = 0; for (let i = Math.round(a * 48000); i < Math.round(b * 48000); i++) s += out.L[i] ** 2; return Math.sqrt(s / ((b - a) * 48000)); };
  const mid = (r.duck.from + r.duck.to) / 2, db = 20 * Math.log10(rms(mid - 0.1, mid + 0.1) / rms(3, 3.4));
  assert.ok(db < -5, `the stop dips ${db.toFixed(1)} dB`);
  const m = measureArrangement(out, r);
  assert.ok(Array.isArray(m.joins) && m.joins.length === r.arrange.joins.length);
  // a button ending
  const long = made(energies, null, { endingStart: 4 }), b = planTrack(long, { duration: 30, start: 0, film: { labels: {}, music: {} }, only: { endKind: 'button' } });
  if (b.arrange && b.arrange.endingKind === 'button') {
    const ob = renderTrack(pcm, b), at = b.arrange.button.at, rb = (a, c) => { let q = 0; for (let i = Math.round(a * 48000); i < Math.round(c * 48000); i++) q += ob.L[i] ** 2; return Math.sqrt(q / ((c - a) * 48000)); };
    assert.ok(rb(at + 0.1, at + 0.3) > 0.01, 'the hit sounds');
    assert.ok(rb(29.6, 29.95) < rb(at + 0.1, at + 0.3) * 0.3, 'the ring dies away');
  }
});

test('fitDurations: lists film lengths that need one join, nearest first', () => {
  const an = made(energies), f = fitDurations(an, 30);
  assert.ok(f.length >= 1);
  assert.ok(f.every((x) => x.ok && x.seconds > 0));
  for (let i = 1; i < f.length; i++) assert.ok(Math.abs(f[i].seconds - 30) >= Math.abs(f[i - 1].seconds - 30) - 1e-9);
});

test('map: a quiet intro and a loud body come out as intro + main, bars carry energy / brightness / chord, the last bar can end a film', () => {
  const s = song({ bars: 16, intro: 5 }), an = analyze(s);
  const m = an.map;
  assert.ok(m && m.bars.length >= 14, `bars ${m?.bars.length}`);
  assert.equal(m.segments[0].label, 'intro'); assert.ok(m.segments.some((g) => g.label === 'main'));
  assert.ok(m.bars[10].e > m.bars[1].e + 0.3);
  for (const k of ['db', 'hf', 'lf', 'e', 'chord', 'head', 'tail']) assert.ok(m.bars[3][k] !== undefined, k);
  assert.ok(m.closers.length >= 1);
});

test('stretch: within 3 % the track is bent (times scale), beyond it the declaration is ignored with a reason', () => {
  assert.ok(Math.abs(stretchRatio(120, 122).ratio - 122 / 120) < 1e-9);
  const far = stretchRatio(120, 130); assert.equal(far.ratio, 1); assert.match(far.note, /ignored/);
  assert.equal(stretchRatio(120, null).ratio, 1);
  const a = scaleAnalysis(made(energies), 1.02);
  assert.ok(Math.abs(a.bpm - 122.4) < 0.01); assert.ok(Math.abs(a.map.bars[1].start - 2.1 / 1.02) < 0.01);
});

test('end of the music: a quiet spoken label after a silence is a tail, not music; no loop, fade or re-cut ever plays it', () => {
  const s = song({ bars: 12, intro: 2 }), sil = 2.6, voice = 2, rate = s.rate;
  const n0 = s.L.length, nv = Math.round(voice * rate), n = n0 + Math.round(sil * rate) + nv, L = new Float32Array(n), R = new Float32Array(n);
  L.set(s.L); R.set(s.R);
  for (let i = 0; i < nv; i++) { const v = 0.012 * Math.sin((2 * Math.PI * 1000 * i) / rate) * (0.5 + 0.5 * Math.sin((2 * Math.PI * 4 * i) / rate)); L[n0 + Math.round(sil * rate) + i] = v; R[n0 + Math.round(sil * rate) + i] = v; }
  const pcm = { L, R, rate }, an = analyze(pcm);
  assert.ok(an.tail, JSON.stringify(an.tail));
  assert.ok(Math.abs(an.end - (n0 / rate)) < 0.3 && an.tail.from > an.end + 2, `end ${an.end}, tail ${JSON.stringify(an.tail)}`);
  // a loop far longer than the music, straight and re-cut: not one played sample comes from after `end`
  for (const arrange of ['off', 'auto']) {
    const plan = planTrack(an, { duration: 60, start: 0, film: { labels: {}, music: { burst: 20 } }, arrange });
    for (const g of plan.segs) assert.ok(g.from + g.len <= an.end + 0.05, `${arrange}: segment ${g.from}+${g.len} runs past ${an.end}`);
    const out = renderTrack(pcm, plan);
    let e = 0, c = 0; const w = (2 * Math.PI * 1000) / rate;
    let re = 0, im = 0; for (let i = 0; i < out.L.length; i++) { re += out.L[i] * Math.cos(w * i); im += out.L[i] * Math.sin(w * i); c++; }
    e = Math.hypot(re, im) / c;
    assert.ok(e < 0.002, `${arrange}: the 1 kHz label tone is in the output (${e.toFixed(4)})`);
  }
  // a quiet section inside the music is not a tail
  const ok = analyze(song({ bars: 12, intro: 2 }));
  assert.equal(ok.tail, undefined);
});

test('arrange: a flat track keeps its opening and ending but does not pretend to follow the film\'s contour, and says so', () => {
  const an = made(energies);
  an.map.bars.forEach((b) => { b.db = -14 + 2 * b.e; b.dbIn = b.db; b.dbOut = b.db; }); an.map.dynamics = { rangeDb: 2, quietBars: 0 };
  const r = arrangeTrack(an, { duration: 36, film: { labels: {}, music: { burst: 12 } } });
  assert.ok(r.ok, r.reason); assert.equal(r.flat, true);
  assert.ok(r.notes.some((n) => /no quiet section.*2\.0 dB/.test(n)));
  assert.deepEqual(r.steps.slice(0, 2).map((s) => s.bar), [0, 1]);
});

test('arrange: a lift of the track is brought onto the film\'s burst — a join before its fill bar, then the fill, the lift and the next bar play straight', () => {
  const an = made(energies), film = { labels: {}, music: { burst: 14, peak: 26 } };
  const r = arrangeTrack(an, { duration: 36, film });
  assert.ok(r.ok, r.reason);
  const lifts = an.map.lifts.map((l) => l.bar), at = (t) => r.steps.find((s) => Math.abs(s.film - t) < 0.06 && !s.partial);
  const onBurst = at(14), early = at(12);
  assert.ok((onBurst && lifts.includes(onBurst.bar)) || (early && lifts.includes(early.bar)), `no lift on the burst: ${JSON.stringify(r.steps.map((s) => [s.film, s.bar]))}`);
  assert.ok(r.liftOn.burst != null, JSON.stringify(r.liftOn));
  // the lift, the fill bar before it and the bar after it are consecutive bars of the track and no join lies between them
  const L = (onBurst && lifts.includes(onBurst.bar) ? onBurst : early).bar;
  const i = r.steps.findIndex((s) => s.bar === L && !s.partial);
  assert.equal(r.steps[i - 1].bar, L - 1); assert.equal(r.steps[i + 1].bar, L + 1);
  for (const j of r.joins) assert.ok(![L - 1, L, L + 1].includes(j.to), `a join enters the lift run: ${JSON.stringify(j)}`);
  assert.ok(r.joins.length <= 3);
  for (const j of r.joins) assert.ok(Math.abs(j.gain) <= 3 && j.score >= 0.55);
  // the events say so
  assert.ok(r.events.find((e) => e.name === 'burst').lift, 'the burst event names the lift');
});

test('arrange: the suggested film plan moves its length at most 4 s and does not lengthen the film for a longer tail alone', () => {
  const an = made(energies), r = arrangeTrack(an, { duration: 36, film: { labels: {}, music: { burst: 14, peak: 26 } } });
  assert.ok(r.suggestion);
  const adj = r.suggestion.adjusted;
  if (adj) assert.ok(Math.abs(adj.duration - 36) <= 4.01);
  if (r.suggestion.recommend && adj.duration > 36) assert.ok(r.suggestion.gain.some((g) => /fewer join|lift|instead of/.test(g)), JSON.stringify(r.suggestion.gain));
});
