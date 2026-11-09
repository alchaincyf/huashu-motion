import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findChrome } from '../cli/lib/browser.js';
import { hasAudio, loudness } from '../cli/lib/audio.js';
import { render } from '../cli/lib/render.js';
import { HAS_FFMPEG, luma, makeFilm } from './fixture-film.js';

const skip = (!findChrome() && 'no Chrome') || (!HAS_FFMPEG && 'no ffmpeg');
const probe = (f, what) => spawnSync('ffprobe', ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', `stream=${what}`, '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim().split(',')[0];
const md5s = (f) => spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'framemd5', '-'], { encoding: 'utf8' }).stdout.split('\n').filter((l) => /^0,/.test(l)).map((l) => l.split(',').pop().trim());

for (const video of ['extract', 'seek']) {
  test(`om render --engine om (video ${video}): frames, picture, footage and sound come out right`, { skip }, async () => {
    const { project, dir } = makeFilm({});
    const out = join(mkdtempSync(join(tmpdir(), 'om-out-')), 'film.mp4');
    const logs = [];
    await render(project, { engine: 'om', video, out, onLog: (l) => logs.push(l) });
    assert.ok(existsSync(out));
    assert.equal(probe(out, 'nb_read_packets'), '60'); // 2 s at 30 fps
    assert.equal(probe(out, 'width'), '320');
    assert.equal(probe(out, 'color_space'), 'bt709');
    // the white square runs right at 100 px per second
    assert.ok(luma(out, 0.0, 0, 100, 40, 40) > 200, 'square at the left at 0 s');
    assert.ok(luma(out, 1.0, 100, 100, 40, 40) > 200, 'square at 100 px at 1 s');
    // the video has no id, shows nothing before 0.5 s and real footage inside its window
    const before = luma(out, 0.2, 160, 0, 160, 90), inside = luma(out, 1.0, 160, 0, 160, 90);
    assert.ok(before < 40, `before its window the footage is hidden (luma ${before})`);
    assert.ok(inside > before + 30, `inside its window the footage is on screen (not black), video ${video}: luma ${inside} vs ${before}`);
    // the sound is the file, wrapped: same loudness
    const wav = join(dir, 'assets', 'sound.wav');
    assert.ok(Math.abs(loudness(out).lufs - loudness(wav).lufs) < 0.5, `${loudness(out).lufs} vs ${loudness(wav).lufs}`);
    assert.ok(logs.some((l) => /sound direct/.test(l)), logs.join('\n'));
  });
}

test('om render --engine om: same source, same bytes of picture (twice in a row)', { skip }, async () => {
  const { project } = makeFilm({ sound: false });
  const o = mkdtempSync(join(tmpdir(), 'om-out-'));
  await render(project, { engine: 'om', out: join(o, 'a.mp4') });
  await render(project, { engine: 'om', out: join(o, 'b.mp4') });
  assert.deepEqual(md5s(join(o, 'a.mp4')), md5s(join(o, 'b.mp4')));
  assert.equal(md5s(join(o, 'a.mp4')).length, 60);
});

test('om render --engine om --blur: still one output frame per frame', { skip }, async () => {
  const { project } = makeFilm({ video: false, sound: false });
  const out = join(mkdtempSync(join(tmpdir(), 'om-out-')), 'blur.mp4');
  await render(project, { engine: 'om', blur: 4, out });
  assert.equal(probe(out, 'nb_read_packets'), '60');
  // a square moving 100 px/s is smeared over ~1.7 px per frame at a 180 degree shutter: the edge is no longer a hard step
  assert.ok(luma(out, 1.0, 140, 100, 4, 40) !== 0);
});

test('om render --engine om: a page error stops the render with a message and delivers no file', { skip }, async () => {
  const { project } = makeFilm({ video: false, sound: false, script: 'const real = window.__timelines.film.seek; window.__timelines.film.seek = (t) => { real(t); if (t > 0.5) console.error("scene exploded"); };' });
  const out = join(mkdtempSync(join(tmpdir(), 'om-out-')), 'bad.mp4');
  await assert.rejects(async () => render(project, { engine: 'om', out }), /scene exploded/);
  assert.equal(existsSync(out), false);
  // the escape hatch exists for the day a harmless console.error is not worth fixing
  await render(project, { engine: 'om', out, allowPageErrors: true });
  assert.ok(existsSync(out));
});

test('om render --engine om: a missing media file is an error, not a black frame', { skip }, async () => {
  const { project } = makeFilm({ body: '<video id="ghost" src="assets/nope.mp4" data-start="0" data-duration="1" muted></video>', sound: false });
  await assert.rejects(async () => render(project, { engine: 'om', out: join(mkdtempSync(join(tmpdir(), 'om-out-')), 'x.mp4') }), /nope\.mp4/);
});

test('om render: mov, webm and gif come out with the right codec, size and frame count; HyperFrames is gone', { skip }, async () => {
  const { project } = makeFilm({});
  const o = mkdtempSync(join(tmpdir(), 'om-out-'));
  const want = { mov: ['prores', 'yuv422p10le', true], webm: ['vp9', 'yuv420p', true], gif: ['gif', 'bgra', false] };
  for (const [format, [codec, pix, sound]] of Object.entries(want)) {
    const out = join(o, `film.${format}`);
    await render(project, { format, out });
    assert.equal(probe(out, 'codec_name'), codec, format);
    assert.equal(probe(out, 'pix_fmt'), pix, format);
    assert.equal(probe(out, 'width'), '320', format);
    assert.equal(probe(out, 'nb_read_packets'), '60', format);
    assert.equal(hasAudio(out), sound, `${format} sound`);
    assert.ok(luma(out, 1.0, 100, 100, 40, 40) > 180, `${format}: the square is where it should be at 1 s`);
  }
  await assert.rejects(async () => render(project, { engine: 'hyperframes' }), /HyperFrames renderer was removed/);
  await assert.rejects(async () => render(project, { engine: 'nope' }), /--engine must be/);
  await assert.rejects(async () => render(project, { format: 'gif', blur: 4 }), /--blur works with/);
});

test('om render --transparent: ProRes 4444 / VP9 with real alpha, no sound; see-through where nothing is drawn', { skip }, async () => {
  const { project } = makeFilm({ clear: true, video: false });
  const o = mkdtempSync(join(tmpdir(), 'om-out-'));
  const warns = [];
  const mov = await render(project, { transparent: true, out: join(o, 'o.mov'), onWarn: (w) => warns.push(w) });
  assert.equal(probe(mov, 'pix_fmt'), 'yuva444p12le');
  assert.equal(hasAudio(mov), false);
  const alpha = (file, x, y) => spawnSync('ffmpeg', ['-v', 'error', '-ss', '1', '-i', file, '-vf', `alphaextract,crop=4:4:${x}:${y},scale=1:1,format=gray`, '-frames:v', '1', '-f', 'rawvideo', '-'], { encoding: 'buffer' }).stdout[0];
  assert.ok(alpha(mov, 300, 10) < 10, 'empty corner is transparent');
  assert.ok(alpha(mov, 118, 118) > 245, 'the square is opaque');
  assert.deepEqual(warns, []);
  const webm = await render(project, { transparent: true, format: 'webm', out: join(o, 'o.webm') });
  assert.equal(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream_tags=alpha_mode', '-of', 'csv=p=0', webm], { encoding: 'utf8' }).stdout.trim(), '1');
  await assert.rejects(async () => render(project, { transparent: true, format: 'mp4' }), /needs a format with alpha/);
});

test('om render --engine om --workers: several browsers give the same film, and the same run repeats exactly', { skip }, async () => {
  // a timeline that remembers what it was asked (the state a first-come worker would otherwise see differently)
  const { project } = makeFilm({ sound: false, script: 'let seen = 0; const real = window.__timelines.film.seek; window.__timelines.film.seek = (t) => { real(t); seen++; document.getElementById("t").textContent = "seen " + (t > 1 ? 1 : 0); };' });
  const o = mkdtempSync(join(tmpdir(), 'om-out-'));
  await render(project, { engine: 'om', workers: 1, out: join(o, 'one.mp4') });
  await render(project, { engine: 'om', workers: 2, out: join(o, 'two-a.mp4') });
  await render(project, { engine: 'om', workers: 2, out: join(o, 'two-b.mp4') });
  assert.equal(probe(join(o, 'two-a.mp4'), 'nb_read_packets'), '60');
  assert.deepEqual(md5s(join(o, 'two-a.mp4')), md5s(join(o, 'two-b.mp4')), 'same workers, same bytes');
  for (const t of [0.0, 0.5, 1.0, 1.9]) {
    const a = luma(join(o, 'one.mp4'), t, 0, 90, 320, 90), b = luma(join(o, 'two-a.mp4'), t, 0, 90, 320, 90);
    assert.ok(Math.abs(a - b) <= 2, `one browser and two browsers agree at ${t}s (${a} vs ${b})`);
  }
});

test('om render: a <video> without data-duration plays on (not frozen), and an unmuted clip keeps its own sound', { skip }, async () => {
  const { project, dir } = makeFilm({ video: false, sound: false, body: '<video id="v" src="assets/talk.mp4" data-start="0" style="position:absolute;left:0;top:0;width:160px;height:90px"></video>' });
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(dir, 'assets', 'talk.mp4')]);
  const out = join(mkdtempSync(join(tmpdir(), 'om-out-')), 'talk.mp4');
  await render(project, { out });
  const crop = (t) => spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', out, '-vf', 'crop=160:90:0:0', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { encoding: 'buffer' }).stdout;
  const a = crop(0.2), b = crop(1.5);
  let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  assert.ok(d / a.length > 5, `the footage moves between 0.2 s and 1.5 s (mean difference ${(d / a.length).toFixed(1)})`);
  assert.equal(hasAudio(out), true, 'the clip sound is in the film');
});

test('nextOutput: one past the highest version there is, never a gap left by deleted renders', async () => {
  const { nextOutput } = await import('../cli/lib/render.js');
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, basename } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'om-next-'));
  mkdirSync(join(root, 'out'));
  writeFileSync(join(root, 'out', `${basename(root)}-v4.mp4`), '');
  assert.equal(basename(nextOutput({ root }, 'mp4')), `${basename(root)}-v5.mp4`);
  assert.equal(basename(nextOutput({ root }, 'gif')), `${basename(root)}-v6.gif`);
});
