// om music (the library: list, build, use, add) and om beats (the report and the picture).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { song, writeWav } from './music-fixture.js';
import { addTrack, buildMusic, formatList, listTracks, music, useTrack } from '../cli/lib/music.js';
import { analyzeFile } from '../cli/lib/beats.js';
import { beats, beatsReport, plot, plotSvg } from '../cli/lib/beats-report.js';
import { fileHash } from '../cli/lib/track.js';
import { findChrome } from '../cli/lib/browser.js';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = (p) => mkdtempSync(join(tmpdir(), p));

// a library of its own: OM_MUSIC (where it lives) and OM_MUSIC_CATALOG (what the package would ship) point into temp folders
function setup({ tracks = [] } = {}) {
  const lib = tmp('om-lib-'), pub = tmp('om-pub-');
  const files = tracks.map((t, i) => { const f = writeWav(join(pub, `${t.id}.wav`), song({ bars: 4 + i })); return { ...t, f, sha256: fileHash(f) }; });
  const catalog = join(pub, 'catalog.json');
  writeFileSync(catalog, JSON.stringify({ version: 1, base: '', tracks: files.map((t) => ({ id: t.id, name: t.name, mood: t.mood, bpm: 120, duration: 9, url: pathToFileURL(t.f).href, sha256: t.sha256, license: 'test', source: 'a fixture', ...(t.credit ? { credit: t.credit } : {}) })) }));
  process.env.OM_MUSIC = lib; process.env.OM_MUSIC_CATALOG = catalog; delete process.env.OM_MUSIC_BASE;
  return { lib, pub, catalog, files };
}
function project() {
  const dir = tmp('om-proj-');
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><head><script src="vendor/gsap.min.js"></script></head><body><div data-composition-id="f" data-width="10" data-height="10"></div><script>const tl = 1;</script></body></html>');
  return dir;
}

test('the shipped catalog is valid, empty tracks are fine, and an empty library says what to do', async () => {
  delete process.env.OM_MUSIC_CATALOG; process.env.OM_MUSIC = tmp('om-lib-');
  const cat = JSON.parse(readFileSync(join(PKG, 'music', 'catalog.json'), 'utf8'));
  assert.equal(cat.version, 1);
  for (const t of cat.tracks) for (const k of ['id', 'name', 'mood', 'bpm', 'duration', 'url', 'sha256', 'license']) assert.ok(t[k], `${t.id}: ${k}`);
  const out = await music([], {}, () => {});
  if (!cat.tracks.length) { assert.match(out, /library is empty/); assert.match(await music(['build'], {}, () => {}), /no tracks yet/); }
  else {
    // the shipped library: every track is listed (not installed), has a checked file name and hash, points at the licence and says it is AI-generated
    for (const t of cat.tracks) { assert.ok(out.includes(t.id), t.id); assert.match(t.sha256, /^[0-9a-f]{64}$/); assert.equal(t.license, 'LICENSE.md'); assert.equal(t.generated, 'AI-generated'); assert.match(t.file, /^[a-z0-9-]+\.mp3$/); assert.ok(t.musicEnd > 0 && t.musicEnd <= t.duration); }
    assert.match(cat.base, /releases\/download\/music-v1$/);
  }
});

test('the licence statement says what the author decided, in both languages, without promising what it cannot', () => {
  const t = readFileSync(join(PKG, 'music', 'LICENSE.md'), 'utf8');
  for (const must of [/AI music-generation tools/, /To the extent permitted by law/, /waives all rights/, /commercial use/, /without crediting anyone/, /"as is"/, /resemble any third party/, /content-identification/, /Content ID/, /do not register/i,
    /在法律允许的范围内/, /放弃/, /商用/, /无需署名|也无需署名/, /不作.*担保/, /不相似/, /内容识别系统/, /不要.*登记/]) assert.match(t, must);
  assert.doesNotMatch(t, /guarantee[sd]? (that )?(it|they|the tracks) (is|are|will)/i);
});

test('om music build: downloads, verifies sha256, is idempotent, and refuses a download that does not match', async () => {
  const { lib, catalog, files } = setup({ tracks: [{ id: 'warm-light', name: 'Warm Light', mood: ['warm', 'lyrical'] }, { id: 'push', name: 'Push', mood: ['driving'] }] });
  assert.deepEqual(listTracks().map((t) => [t.id, t.installed]), [['warm-light', false], ['push', false]]);
  assert.match(formatList(listTracks()), /warm-light\s+Warm Light\s+warm, lyrical\s+120\s+0:09\s+om music build/);
  const log = []; const r = buildMusic({ only: ['push'], log: (l) => log.push(l) });
  assert.match(r, /1 track/);
  assert.ok(existsSync(join(lib, 'tracks', 'push.wav')));
  assert.deepEqual(listTracks().map((t) => t.installed), [false, true]);
  buildMusic({ log: (l) => log.push(l) });
  assert.ok(log.some((l) => /push already installed/.test(l)));
  assert.deepEqual(listTracks().map((t) => t.installed), [true, true]);
  // a catalog whose sha256 is wrong: nothing is installed, the .part file is gone
  const bad = JSON.parse(readFileSync(catalog, 'utf8')); bad.tracks[0].sha256 = 'f'.repeat(64);
  writeFileSync(catalog, JSON.stringify(bad));
  process.env.OM_MUSIC = tmp('om-lib2-');
  assert.throws(() => buildMusic({ only: ['warm-light'] }), /sha256 mismatch/);
  assert.equal(existsSync(join(process.env.OM_MUSIC, 'tracks', 'warm-light.wav')), false);
  assert.equal(existsSync(join(process.env.OM_MUSIC, 'tracks', 'warm-light.wav.part')), false);
  // no checksum, no install
  bad.tracks[0].sha256 = ''; writeFileSync(catalog, JSON.stringify(bad));
  assert.throws(() => buildMusic({ only: ['warm-light'] }), /no sha256/);
  assert.throws(() => buildMusic({ only: ['nope'] }), /no track "nope"/);
  void files;
});

test('om music build: a relative url needs a base (OM_MUSIC_BASE or the catalog\'s)', () => {
  const { catalog, pub } = setup({ tracks: [{ id: 'rel', name: 'Rel', mood: [] }] });
  const c = JSON.parse(readFileSync(catalog, 'utf8')); c.tracks[0].url = 'rel.wav'; writeFileSync(catalog, JSON.stringify(c));
  assert.throws(() => buildMusic({}), /no download source/);
  process.env.OM_MUSIC_BASE = pathToFileURL(pub).href + '/';
  assert.match(buildMusic({}), /1 track/);
  delete process.env.OM_MUSIC_BASE;
});

test('om music add: a track of the user\'s own is analysed once, listed as theirs and usable in a film', async () => {
  setup();
  const src = writeWav(join(tmp('om-mine-'), 'My Loop.wav'), song({ bars: 6 }));
  const out = await music(['add', src], { mood: 'chill,night', name: 'Night Loop', license: 'CC BY 4.0', credit: 'Me' }, () => {});
  assert.match(out, /added "Night Loop" as night-loop · 120 bpm \(confidence 0\.\d\d\)/);
  const t = listTracks().find((x) => x.id === 'night-loop');
  assert.deepEqual([t.origin, t.installed, t.mood], ['user', true, ['chill', 'night']]);
  assert.match(formatList(listTracks()), /night-loop\s+Night Loop\s+chill, night\s+120\s+0:\d\d\s+yours/);
  assert.equal(addTrack(src, { name: 'Night Loop' }).rec.id, 'night-loop', 'the same file again is the same track');
  assert.equal(addTrack(writeWav(join(tmp('om-mine-'), 'x.wav'), song({ bars: 3 })), { name: 'Night Loop' }).rec.id, 'night-loop-2');
  // use: copied into the project, declared with its name, credit kept next to it
  const dir = project();
  const used = useTrack('night-loop', dir);
  assert.match(used, /Night Loop → assets\/music\/night-loop.wav/);
  assert.ok(existsSync(join(dir, 'assets', 'music', 'night-loop.wav')));
  assert.match(readFileSync(join(dir, 'index.html'), 'utf8'), /OM\.music\(\{ src: 'assets\/music\/night-loop.wav', name: 'Night Loop' \}\)/);
  assert.match(readFileSync(join(dir, 'assets', 'music', 'CREDITS.md'), 'utf8'), /night-loop.wav: Night Loop — Me \(CC BY 4.0\)/);
  assert.throws(() => useTrack('nothing', dir), /no track "nothing"/);
  assert.throws(() => useTrack('night', dir), /matches night-loop, night-loop-2/);
  assert.match(useTrack('night-loop-2', dir), /night-loop-2/);
});

test('om music use fetches a catalog track that is not on this machine yet', () => {
  setup({ tracks: [{ id: 'fresh', name: 'Fresh', mood: ['bright'] }] });
  const dir = project();
  assert.match(useTrack('fresh', dir), /Fresh → assets\/music\/fresh.wav/);
  assert.ok(listTracks()[0].installed);
});

test('om beats: the report says what to trust; a track with no pulse is told so', async () => {
  const dir = tmp('om-beats-'), f = writeWav(join(dir, 'drums.wav'), song({ bars: 8 }));
  const an = analyzeFile(f), text = beatsReport(f, an);
  assert.match(text, /tempo    (?:119\.9\d|120\.0\d) bpm · confidence 0\.\d\d — clear pulse/);
  assert.match(text, /bars     \d+ · first bar lines 0\.\d\d/);
  assert.match(text, /sections /);
  assert.match(text, /drops    \d+\.\d\ds/);
  assert.doesNotMatch(text, /warning/);
  // a steady pad has no pulse
  const n = 48000 * 12, pad = Float32Array.from({ length: n }, (_, i) => 0.1 * Math.sin((2 * Math.PI * 220 * i) / 48000));
  const p = writeWav(join(dir, 'pad.wav'), { L: pad, R: pad });
  const flat = beatsReport(p, analyzeFile(p));
  assert.match(flat, /warning  confidence below 0\.3: only trust the sections, not the beats/);
  // a folder lists every track on one line each
  const all = await beats(dir, {});
  assert.match(all, /drums.wav\s+0:\d\d\.\d\s+(?:119\.9|120\.0)\d* bpm/);
  assert.match(all, /pad.wav.*\(sections only\)/);
  assert.equal(JSON.parse(await beats(f, { json: true })).bpm, an.bpm);
});

test('om beats --plot: a picture with the waveform, bar lines, beats, sections and drops', async () => {
  const dir = tmp('om-beats-'), f = writeWav(join(dir, 'd.wav'), song({ bars: 8 }));
  const an = analyzeFile(f), svg = plotSvg(f, an, (await import('../cli/lib/beats.js')).decode(f));
  assert.match(svg, /^<svg /);
  assert.equal((svg.match(/stroke="#c92a2a"/g) || []).length >= an.downbeats.length, true);
  assert.match(svg, /drop \d+\.\ds/);
  if (!findChrome()) return;
  const png = await plot(f, an, join(dir, 'out', 'd.png'));
  const b = readFileSync(png);
  assert.equal(b.subarray(1, 4).toString(), 'PNG');
  assert.ok(b.length > 10000);
  assert.match(await beats(f, { plot: join(dir, 'p.png') }), /plot     .*p\.png/);
});

test('scripts/music-pack.mjs: a folder and an id/name/mood table become catalog entries and a checkup; om music build installs them from a file:// base', async () => {
  const { spawnSync } = await import('node:child_process');
  const src = tmp('om-pack-src-'), out = tmp('om-pack-out-'), lib = tmp('om-lib-');
  const f1 = writeWav(join(src, 'a-one.wav'), song({ bars: 24, tailSec: 3 })), f2 = writeWav(join(src, 'b-two.wav'), song({ bars: 20, bpm: 100, tailSec: 3 }));
  const table = join(src, 'table.tsv');
  writeFileSync(table, `file\tid\tname\tmood\na-one.wav\tone\tOne\twarm|calm\nb-two.wav\ttwo\tTwo\tdriving bright\n`);
  const base = pathToFileURL(out).href.replace(/\/$/, ''); // the files are published (copied) as <id>.<ext> into the output folder
  const r = spawnSync(process.execPath, [join(PKG, 'scripts', 'music-pack.mjs'), src, '--meta', table, '--out', out, '--base', base, '--copy'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const cat = JSON.parse(readFileSync(join(out, 'catalog.json'), 'utf8'));
  assert.equal(cat.license, 'LICENSE.md'); assert.equal(cat.tracks.length, 2);
  const t = cat.tracks[0];
  for (const k of ['id', 'name', 'mood', 'bpm', 'duration', 'musicEnd', 'lifts', 'sha256', 'file', 'url', 'license', 'generated']) assert.ok(t[k] !== undefined, k);
  assert.equal(t.generated, 'AI-generated'); assert.equal(t.license, 'LICENSE.md'); assert.deepEqual(t.mood, ['warm', 'calm']);
  assert.equal(t.file, 'one.wav'); assert.equal(t.sha256, fileHash(f1)); assert.ok(Math.abs(t.bpm - 120) < 1);
  assert.equal(fileHash(join(out, 'one.wav')), fileHash(f1), 'the files are copied byte for byte');
  assert.match(readFileSync(join(out, 'checkup.md'), 'utf8'), /\| one \| One \| 120/);
  // the default base points at this repository's release with the library's own tag
  const d = spawnSync(process.execPath, [join(PKG, 'scripts', 'music-pack.mjs'), src, '--meta', table, '--out', tmp('om-pack-out-')], { encoding: 'utf8' });
  assert.match(d.stdout, /github\.com\/alchaincyf\/huashu-motion\/releases\/download\/music-v1/);
  // end to end: om music build from the packed catalog
  process.env.OM_MUSIC = lib; process.env.OM_MUSIC_CATALOG = join(out, 'catalog.json'); delete process.env.OM_MUSIC_BASE;
  const msg = buildMusic({});
  assert.match(msg, /2 tracks/);
  assert.ok(existsSync(join(lib, 'tracks', 'one.wav')) && existsSync(join(lib, 'tracks', 'two.wav')));
  assert.equal(fileHash(join(lib, 'tracks', 'two.wav')), fileHash(f2));
  assert.deepEqual(listTracks().map((x) => [x.id, x.installed]), [['one', true], ['two', true]]);
});
