// An external track end to end, in a real Chrome: om sound --music, the beat map OM.beat reads, om check's cut warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { song, writeWav } from './music-fixture.js';
import { findChrome, probe, readWav, sound, RATE } from '../cli/lib/sound.js';
import { check } from '../cli/lib/check.js';
import { openProject } from '../cli/lib/project.js';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skip = !findChrome() && 'no Chrome';

// 120 bpm, true beats at 0.1 + k/2. The film has no om.js script and no OM.music call: --music has to add both.
function film({ late = false } = {}) {
  const dir = join(mkdtempSync(join(tmpdir(), 'om-ext-')), 'film');
  mkdirSync(join(dir, 'vendor'), { recursive: true });
  cpSync(join(PKG, 'templates', 'blank', 'vendor', 'gsap.min.js'), join(dir, 'vendor', 'gsap.min.js'));
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8">
<script src="vendor/gsap.min.js"></script></head><body>
<div id="film" data-composition-id="film" data-width="640" data-height="360"><b id="x">hi</b></div>
<script>
  const tl = gsap.timeline({ paused: true });
  tl.to({}, { duration: 14 }, 0).addLabel('scene:one', 0).to('#x', { x: 100, duration: .5 }, OM.sfx('pop', .5))
    .addLabel('scene:two', ${late ? '6.23' : 'OM.beat(8)'})
    .addLabel('scene:drop', ${late ? '8.1' : 'OM.drop(0)'})
    ${late ? '' : ".addLabel('scene:bar', OM.downbeat(3)).addLabel('scene:sec', OM.section(1))"};
  window.__timelines.film = tl;
</script></body></html>`);
  return dir;
}

test('om sound --music: the track is copied and declared, its beats drive OM.beat / OM.drop, the film ends faded', { skip, timeout: 120000 }, async () => {
  const dir = film(), s = song({ bars: 12, intro: 6 }); // quiet for 6 bars (12 s), loud after: the drop is at 12.1 s
  const wav = writeWav(join(mkdtempSync(join(tmpdir(), 'om-ext-src-')), 'Night Drive.wav'), s);
  const out = await sound(openProject(dir), { music: wav, arrange: 'off' }, () => {}); // the straight cut: the drop stays where the track has it
  assert.ok(existsSync(join(dir, 'assets', 'music', 'Night-Drive.wav')));
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.match(html, /<script src="vendor\/om.js"><\/script>/);
  assert.match(html, /OM\.music\(\{ src: 'assets\/music\/Night-Drive.wav', arrange: 'off' \}\)/);
  assert.match(html, /<script type="application\/json" id="om-beats">/);
  assert.ok(existsSync(join(dir, 'vendor', 'om.js')));
  const map = JSON.parse(readFileSync(join(dir, 'assets', 'music.beats.json'), 'utf8'));
  assert.ok(Math.abs(map.bpm - 120) < 1 && map.confidence > 0.5 && map.usable);
  assert.ok(map.drops.length && Math.abs(map.drops[0].t - 12.1) < 0.6, JSON.stringify(map.drops));
  // the report names the track and its numbers, and says where the cuts sit
  assert.match(out, /music    "Night-Drive" · 120\.\d bpm, confidence 0\.\d\d/);
  assert.match(out, /beats    \d+ beats · \d+ bars/);
  assert.match(out, /cuts     \d of \d scene cuts within 80 ms of a beat/);
  assert.match(out, /dB under the track/);
  // OM.beat(8) is beat 8 of the track (0.1 + 4.0), not 8 beats of a fixed grid (4.0); OM.drop(0) is the real drop
  const p = await probe(openProject(dir), html);
  assert.ok(Math.abs(p.labels['scene:two'] - 4.1) < 0.03, `scene:two at ${p.labels['scene:two']}`);
  assert.ok(Math.abs(p.labels['scene:drop'] - map.drops[0].t) < 1e-6);
  assert.ok(Math.abs(p.labels['scene:bar'] - 6.1) < 0.03, `bar 3 at ${p.labels['scene:bar']}`); // bar lines every 2 s from 0.1
  assert.ok(Math.abs(p.labels['scene:sec'] - map.sections[1].start) < 1e-6);
  const w = readWav(join(dir, 'assets', 'sound.wav'));
  assert.ok(Math.abs(w.data.length / RATE - p.duration) < 0.01);
  assert.ok(Math.abs(w.data[w.data.length - 3]) < 0.02, 'ends faded');
  // a second run changes nothing and says so; no tag is added twice
  const again = await sound(openProject(dir), {}, () => {});
  assert.match(again, /nothing changed/);
  assert.equal((readFileSync(join(dir, 'index.html'), 'utf8').match(/id="om-beats"/g) || []).length, 1);
});

test('om check: scene cuts off the track\'s beat are listed with their offset; cuts on it are not', { skip, timeout: 180000 }, async () => {
  const dir = film({ late: true }), s = song({ bars: 12, intro: 6 });
  const wav = writeWav(join(mkdtempSync(join(tmpdir(), 'om-ext-src-')), 'song.wav'), s);
  await sound(openProject(dir), { music: wav }, () => {});
  const found = await check(openProject(dir), { samples: 4 });
  const w = found.find((f) => f.code === 'cut-off-beat');
  assert.ok(w, JSON.stringify(found.map((f) => f.code)));
  assert.match(w.message, /scene:two 6\.23s \(\+\d+ ms\)/); // the nearest beat is 6.1 (+130) or 6.6; either way far over 80 ms
  assert.doesNotMatch(w.message, /scene:drop/); // 8.1 is on a beat
  assert.match(w.message, /^1 of 2 scene cuts/);
});
