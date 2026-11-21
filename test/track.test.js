import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RATE, song, writeWav } from './music-fixture.js';
import { analyzeFile } from '../cli/lib/beats.js';
import { applyBeats, attachMusic, beatsData, beatsTag, cutAlignment, planTrack, readBeatsTag, readMusicDecl, renderTrack, setMusicDecl } from '../cli/lib/track.js';
import { mixdown } from '../cli/lib/sound.js';
import { openProject } from '../cli/lib/project.js';

// A hand-made analysis: 120 bpm, beats at 0.1 + k/2, a bar line every 2 s, a quiet intro, a drop at bar 5. 40 s of music.
function fakeAnalysis(over = {}) {
  const beats = Array.from({ length: 80 }, (_, k) => 0.1 + k * 0.5);
  return {
    bpm: 120, confidence: 0.8, beats, downbeats: beats.filter((_, k) => k % 4 === 0), end: 40.1, duration: 40.5,
    sections: [{ start: 0, end: 8.1, energy: 0.3 }, { start: 8.1, end: 40.1, energy: 1 }], drops: [{ t: 8.1, score: 0.7 }], ...over,
  };
}
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('planTrack: a long track plays from `start`, its beats move into film time and the fade starts on a bar line', () => {
  const p = planTrack(fakeAnalysis(), { start: 2.1, duration: 20 });
  assert.equal(p.segs.length, 1);
  assert.equal(p.looped, false);
  near(p.beats[0], 0); // file beat 2.1 (a bar line) sits exactly on frame 0
  near(p.beats[1], 0.5);
  near(p.downbeats[0], 0);
  near(p.drops[0].t, 6); // 8.1 − 2.1
  near(p.sections[1].start, 6);
  // end: f = 1 s at 120 bpm; the last bar line that leaves a second of fade is 18.0 → the fade is [18, 20]
  near(p.fade.from, 18);
  near(p.fade.len, 2);
  assert.ok(p.downbeats.some((t) => Math.abs(t - p.fade.from) < 1e-6));
});

test('planTrack: a track shorter than the film loops on bar lines and the grid stays regular across the joins', () => {
  const short = fakeAnalysis({ end: 12.1, duration: 12.5, beats: Array.from({ length: 24 }, (_, k) => 0.1 + k * 0.5), downbeats: Array.from({ length: 6 }, (_, k) => 0.1 + k * 2), sections: [{ start: 0, end: 12.1, energy: 1 }], drops: [{ t: 4.1, score: 0.5 }] });
  const p = planTrack(short, { duration: 40 });
  assert.equal(p.looped, true);
  assert.ok(p.segs.length >= 4);
  // every join is a bar line of the file: loop body = bar lines 0.1 … 10.1 = 10 s (bar line at 12.1 excluded: it is the end)
  for (const s of p.segs.slice(1)) near((s.from - 0.1) % 2, 0, 1e-6);
  for (let i = 1; i < p.beats.length; i++) near(p.beats[i] - p.beats[i - 1], 0.5, 1e-6);
  for (let i = 1; i < p.downbeats.length; i++) near(p.downbeats[i] - p.downbeats[i - 1], 2, 1e-6);
  assert.ok(p.drops.length >= 3, 'the drop repeats with the loop');
  assert.ok(p.segs.every((s, i) => i === 0 || s.xin > 0));
});

test('planTrack: a quiet outro is left out of the loop; bpm override puts a regular grid on the detected bar line; no pulse loops the whole file', () => {
  const quiet = fakeAnalysis({ end: 20.1, duration: 20.5, beats: Array.from({ length: 40 }, (_, k) => 0.1 + k * 0.5), downbeats: Array.from({ length: 10 }, (_, k) => 0.1 + k * 2), sections: [{ start: 0, end: 12.1, energy: 1 }, { start: 12.1, end: 20.1, energy: 0.2 }], drops: [] });
  const p = planTrack(quiet, { duration: 40 });
  assert.ok(p.segs[1].from + p.segs[1].len <= 12.2, `loop ends at ${p.segs[1].from + p.segs[1].len}`);
  const o = planTrack(fakeAnalysis(), { duration: 10, bpm: 100 });
  assert.equal(o.overridden, true);
  assert.equal(o.bpm, 100);
  near(o.beats[1] - o.beats[0], 0.6, 1e-9);
  near(o.downbeats[0], 0.1, 1e-9);
  const flat = planTrack(fakeAnalysis({ confidence: 0.1, end: 12.1 }), { duration: 40 });
  assert.equal(flat.usable, false);
  near(flat.segs[1].xin, 1.5);
  near(flat.segs[1].from, 0);
  assert.equal(planTrack(fakeAnalysis({ confidence: 0.1 }), { duration: 40, bpm: 120 }).usable, true, 'a stated bpm is trusted');
});

test('renderTrack: the plan plays the right part of the file, joins and ends without clicks', () => {
  const n = RATE * 6, ramp = { L: Float32Array.from({ length: n }, (_, i) => 0.5 * (i / n)), R: Float32Array.from({ length: n }, (_, i) => 0.5 * (i / n)) };
  const an = fakeAnalysis({ end: 6, duration: 6, beats: Array.from({ length: 12 }, (_, k) => 0.1 + k * 0.5), downbeats: [0.1, 2.1, 4.1], sections: [{ start: 0, end: 6, energy: 1 }], drops: [] });
  const one = planTrack(an, { start: 1, duration: 4 }), r = renderTrack(ramp, one);
  assert.equal(r.L.length, RATE * 4);
  near(r.L[RATE * 1], ramp.L[RATE * 2], 1e-4); // film 1 s = file 2 s
  assert.ok(Math.abs(r.L[0]) < 1e-3 && Math.abs(r.L.at(-1)) < 1e-3, 'fades in and out');
  const looped = planTrack(an, { duration: 15 }), l = renderTrack(ramp, looped);
  let peak = 0; for (const v of l.L) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
  assert.ok(peak < 0.5 * 1.45, `crossfades do not pile up (${peak})`);
  // a click is a sample-to-sample jump far beyond what the ramp itself does (0.5 per 6 s): the loop point resets the ramp,
  // so look only for jumps larger than the reset hidden by the crossfade
  let jump = 0; for (let i = 1; i < l.L.length; i++) jump = Math.max(jump, Math.abs(l.L[i] - l.L[i - 1]));
  assert.ok(jump < 0.01, `largest step ${jump}`);
});

test('beats map: the tag round-trips, is replaced in place and removed', () => {
  const html = '<!doctype html><html><head><script src="vendor/gsap.min.js"></script></head><body><script>const a = 1;</script></body></html>';
  const data = beatsData(planTrack(fakeAnalysis(), { duration: 10 }), { src: 'assets/music/a.mp3' });
  const a = applyBeats(html, data);
  assert.ok(a.indexOf('id="om-beats"') < a.indexOf('vendor/gsap'), 'before the first script');
  assert.equal(readBeatsTag(a), beatsTag(data));
  assert.equal(applyBeats(a, data), a, 'idempotent');
  const b = applyBeats(a, { ...data, bpm: 99 });
  assert.equal((b.match(/id="om-beats"/g) || []).length, 1);
  assert.match(b, /"bpm":99/);
  assert.equal(applyBeats(b, null).includes('om-beats'), false);
  assert.equal(readBeatsTag('<!-- <script id="om-beats">{}</script> -->'), null, 'comments are ignored');
  assert.equal(JSON.parse(/>(.*)<\/script>/.exec(a.match(/<script type="application\/json" id="om-beats">.*?<\/script>/)[0])[1]).version, 1);
});

test('setMusicDecl: adds the call and vendor/om.js, extends an existing OM.music, replaces an old src, skips comments', () => {
  const root = mkdtempSync(join(tmpdir(), 'om-decl-'));
  const bare = '<!doctype html><html><head><script src="vendor/gsap.min.js"></script></head><body><script>\nconst tl = 1;\n</script></body></html>';
  const a = setMusicDecl(bare, { src: 'assets/music/x.mp3', start: 12.5 }, root);
  assert.match(a, /<script src="vendor\/om.js"><\/script>\n<script>\nOM.music\(\{ src: 'assets\/music\/x.mp3', start: 12.5 \}\);\nconst tl/);
  assert.ok(existsSync(join(root, 'vendor', 'om.js')));
  assert.deepEqual(readMusicDecl(a), { src: 'assets/music/x.mp3' });
  const withCall = '<script src="vendor/om.js"></script><script>OM.music({ product: \'devtool\', drop: \'reveal\' });</script>';
  const b = setMusicDecl(withCall, { src: 'assets/music/y.mp3', bpm: 124 });
  assert.match(b, /OM\.music\(\{ bpm: 124, src: 'assets\/music\/y.mp3', product: 'devtool', drop: 'reveal' \}\)/);
  const c = setMusicDecl(b, { src: 'assets/music/z.mp3', bpm: 90 });
  assert.match(c, /OM\.music\(\{ bpm: 90, src: 'assets\/music\/z.mp3', product: 'devtool'/);
  assert.equal(readMusicDecl(c).src, 'assets/music/z.mp3');
  const commented = '<script src="vendor/om.js"></script><script>\n// OM.music({ product: \'x\' })\nOM.music({});\n</script><!-- OM.music({ a: 1 }) -->';
  assert.match(setMusicDecl(commented, { src: 'a.mp3' }), /OM\.music\(\{ src: 'a.mp3' \}\);\n<\/script>/);
  assert.equal(readMusicDecl('<script>/* none */ OM.music({ mood: "bright" })</script>'), null);
});

test('attachMusic copies into assets/music once, keeps different files apart, writes the declaration and credits', () => {
  const dir = mkdtempSync(join(tmpdir(), 'om-attach-')), src = mkdtempSync(join(tmpdir(), 'om-src-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><head><script src="vendor/gsap.min.js"></script></head><body><div data-composition-id="f" data-width="10" data-height="10"></div><script>const tl = 1;</script></body></html>');
  const project = openProject(dir);
  writeWav(join(src, 'my song.wav'), song({ bars: 1 }));
  writeWav(join(src, 'other.wav'), song({ bars: 1, bpm: 100 }));
  const rel = attachMusic(project, join(src, 'my song.wav'), { start: 3, name: 'My Song', credit: 'Someone, CC BY 4.0' });
  assert.equal(rel, 'assets/music/my-song.wav');
  assert.ok(existsSync(join(dir, rel)));
  assert.match(readFileSync(join(dir, 'index.html'), 'utf8'), /OM\.music\(\{ src: 'assets\/music\/my-song.wav', name: 'My Song', start: 3 \}\)/);
  assert.equal(attachMusic(project, join(src, 'my song.wav')), rel, 'same file again: same place');
  assert.equal(attachMusic(project, join(src, 'my song.wav'), { credit: 'Someone, CC BY 4.0' }), rel);
  assert.equal(readFileSync(join(dir, 'assets/music/CREDITS.md'), 'utf8').match(/my-song.wav/g).length, 1);
  assert.equal(attachMusic(project, join(src, 'other.wav')), 'assets/music/other.wav');
});

test('cutAlignment: cuts within 80 ms of a beat pass, the others report their offset; no pulse means no verdict', () => {
  const data = { usable: true, duration: 20, beats: Array.from({ length: 40 }, (_, k) => k * 0.5) };
  const al = cutAlignment([{ name: 'scene:a', t: 0 }, { name: 'scene:b', t: 4.02 }, { name: 'scene:c', t: 6.23 }, { name: 'scene:d', t: 19.95 }], data);
  assert.deepEqual(al.map((c) => c.name), ['scene:b', 'scene:c']); // the start and a cut at the very end are not judged
  assert.equal(al[0].ok, true);
  assert.equal(al[1].ok, false);
  assert.equal(al[1].off, 230); // 6.23 against the nearest beat, 6.0: 230 ms after it
  assert.equal(cutAlignment([{ name: 'x', t: 5 }], { ...data, usable: false }), null);
});

test('mixdown with a real track: replaces the synthesized music, lands on -14 LUFS, names the track, effects 8 dB lighter by default', () => {
  const dir = mkdtempSync(join(tmpdir(), 'om-mix-')), f = join(dir, 'song.wav');
  writeWav(f, song({ bars: 8 }));
  const an = analyzeFile(f);
  const p0 = { duration: 12, labels: { 'scene:a': 0, 'scene:b': 4.1 }, hits: [{ name: 'pop', at: 2 }, { name: 'thud', at: 4.1 }], music: { src: 'song.wav' }, errors: [] };
  const plan = planTrack(an, { duration: 12 });
  const ext = { file: f, an, plan, name: 'song', data: beatsData(plan, { src: 'song.wav' }) };
  const r = mixdown(p0, { external: ext });
  assert.equal(r.out2.n, RATE * 12);
  assert.ok(Math.abs(r.finalLufs - -14) < 2, `${r.finalLufs} LUFS`);
  assert.match(r.trackInfo, /^"song" · 120\.\d bpm, confidence 0\.\d\d/);
  assert.equal(r.sfxOffset, -8);
  assert.equal(mixdown({ ...p0, music: { src: 'song.wav', sfx: 0 } }, { external: ext }).sfxOffset, 0);
  assert.equal(mixdown({ ...p0, music: { src: 'song.wav', sfx: -3 } }, { external: ext }).sfxOffset, -3);
  assert.equal(mixdown({ ...p0, music: { bpm: 120 } }, {}).sfxOffset, 0, 'the synthesized bed keeps its levels');
  const off = mixdown(p0, { external: ext, musicOff: true });
  assert.equal(off.musicOn, false);
  // the music really is the file: the loud body of the song makes the film louder than its quiet intro
  const rms = (a, b) => { let e = 0; for (let i = a * RATE; i < b * RATE; i++) e += r.out2.L[i] ** 2; return Math.sqrt(e / ((b - a) * RATE)); };
  assert.ok(rms(8, 10) > 1.5 * rms(0.3, 1.7), 'the song has a quiet intro and a loud body (4 bars = 8 s)');
  for (let i = 0; i < r.out2.n; i += 997) assert.ok(Number.isFinite(r.out2.L[i]));
});

test('mixdown with a track shorter than the film loops it and still ends faded out', () => {
  const dir = mkdtempSync(join(tmpdir(), 'om-mix-')), f = join(dir, 'short.wav');
  writeWav(f, song({ bars: 4, intro: 1 }));
  const an = analyzeFile(f), plan = planTrack(an, { duration: 20 });
  assert.equal(plan.looped, true);
  const r = mixdown({ duration: 20, labels: {}, hits: [], music: { src: 'short.wav' } }, { external: { file: f, an, plan, name: 'short', data: beatsData(plan, { src: 'short.wav' }) } });
  assert.equal(r.out2.n, RATE * 20);
  assert.ok(Math.abs(r.out2.L[r.out2.n - 5]) < 0.02, 'silent at the last sample');
  assert.match(r.trackInfo, /looped on bar lines/);
});
