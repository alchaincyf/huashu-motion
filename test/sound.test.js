import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE, SFX, Track, applySound, findChrome, hasSound, loudness, pickBpm, plan, readWav, sound, toWav } from '../cli/lib/sound.js';
import { openProject } from '../cli/lib/project.js';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('pickBpm puts scene cuts on the eighth-note grid when a tempo allows it', () => {
  const beat = 60 / 100;
  const fit = pickBpm([0, 8 * beat, 19 * beat, 27 * beat], [92, 108]);
  assert.equal(fit.bpm, 100);
  assert.ok(fit.max < 1e-9);
});

test('plan: sections follow the scene labels, energy builds and the last scene resolves', () => {
  const p = plan({ duration: 20, labels: { 'scene:a': 0, 'scene:b': 4.8, 'scene:c': 9.6, 'scene:d': 14.4 }, music: { bpm: 100 } });
  assert.deepEqual(p.sections.map((s) => s.id), ['a', 'b', 'c', 'd']);
  assert.ok(p.sections[0].energy < p.sections[2].energy);
  assert.equal(p.sections.at(-1).outro, true);
  assert.ok(p.gridError < 1e-9);
});

test('every effect renders finite audio that is not silent', () => {
  const key = (d, o) => 440 * Math.pow(2, (d - 1 + 12 * (o - 4)) / 12);
  for (const [name, def] of Object.entries(SFX)) {
    const { sig, lead } = def.fn({}, () => 0.37, key);
    const chans = Array.isArray(sig) ? sig : [sig];
    let peak = 0;
    for (const c of chans) for (const v of c) { assert.ok(Number.isFinite(v), `${name} has NaN`); peak = Math.max(peak, Math.abs(v)); }
    assert.ok(peak > 0.05 && peak <= 1, `${name} peak ${peak}`);
    assert.ok(lead >= 0);
  }
});

test('loudness: a 1 kHz sine at 0.1 in both channels is -20 LUFS (BS.1770 reference: 0 dBFS in one channel = -3.01)', () => {
  const n = RATE * 3, L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.1 * Math.sin((2 * Math.PI * 1000 * i) / RATE);
  assert.ok(Math.abs(loudness(L, L) - -20) < 0.1);
});

test('toWav writes a 48 kHz stereo 16-bit file that reads back', () => {
  const t = new Track(0.1);
  t.add(new Float32Array(100).fill(0.5), 0, 1, 0);
  const dir = mkdtempSync(join(tmpdir(), 'om-sound-'));
  writeFileSync(join(dir, 'a.wav'), toWav(t));
  const w = readWav(join(dir, 'a.wav'));
  assert.equal(w.rate, RATE);
  assert.equal(w.data.length, t.n);
  assert.ok(Math.abs(w.data[10] - 0.5) < 0.01);
});

test('applySound inserts once, keeps the user\'s volume, ignores comments, and --off removes it', () => {
  const html = '<div data-composition-id="film" data-width="1920" data-height="1080">\n<!-- <audio id="om-sound"> -->\n</div>';
  const a = applySound(html, { src: 'assets/sound.wav', duration: 12.3456 });
  assert.match(a, /<audio id="om-sound" src="assets\/sound.wav" data-start="0" data-duration="12.346"/);
  assert.ok(hasSound(a));
  const tweaked = a.replace('data-volume="1"', 'data-volume="0.6"');
  const b = applySound(tweaked, { src: 'assets/sound.wav', duration: 10 });
  assert.equal((b.match(/id="om-sound"/g) || []).length, 2); // the real tag + the one in the comment
  assert.match(b, /data-volume="0.6"/);
  assert.match(b, /data-duration="10"/);
  const off = applySound(b, { off: true });
  assert.ok(!hasSound(off));
  assert.ok(off.includes('<!-- <audio id="om-sound"> -->'));
});

test('om sound reads hits and scenes from a real composition', { skip: !findChrome() && 'no Chrome' }, async () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'om-sound-')), 'film');
  mkdirSync(join(dir, 'vendor'), { recursive: true });
  cpSync(join(PKG, 'templates', 'blank', 'vendor', 'gsap.min.js'), join(dir, 'vendor', 'gsap.min.js'));
  cpSync(join(PKG, 'runtime', 'om.js'), join(dir, 'vendor', 'om.js'));
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html data-composition-variables='[{"id":"bpm","type":"number","default":120}]'><head>
<script src="vendor/gsap.min.js"></script><script src="vendor/om.js"></script></head><body>
<div id="film" data-composition-id="film" data-width="640" data-height="360"><b id="x">hi</b></div>
<script>
  const V = OM.vars(); OM.music({ bpm: V.bpm, mood: 'bright' });
  const tl = gsap.timeline({ paused: true });
  tl.addLabel('scene:one', 0).to('#x', { x: 100, duration: .5 }, OM.sfx('pop', .5))
    .addLabel('scene:two', OM.beat(4)).to('#x', { y: 50, duration: .5 }, OM.sfx('thud', OM.beat(4) + .2))
    .to({}, { duration: 1 });
  window.__timelines.film = tl;
</script></body></html>`);
  const out = await sound(openProject(dir));
  assert.match(out, /bright · G major · 120 BPM · 2 sections/);
  assert.match(out, /2 hits: pop×1, thud×1/);
  assert.match(out, /hint     the music is synthesized .*`om music`/); // no track, no score: the fallback says so
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.match(html, /<audio id="om-sound" src="assets\/sound.wav"/);
  const w = readWav(join(dir, 'assets', 'sound.wav'));
  assert.ok(Math.abs(w.data.length / RATE - 3.7) < 0.01); // thud tween ends at 2.7, then the 1 s hold
});
