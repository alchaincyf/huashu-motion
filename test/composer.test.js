import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GM_DRUMS, fit, parseAbc, perform } from '../cli/lib/composer.js';
import { readScore } from '../cli/lib/composed.js';
import { findChrome, sound } from '../cli/lib/sound.js';
import { openProject } from '../cli/lib/project.js';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CUE = `X:1
M:4/4
L:1/8
Q:1/4=96
K:F
V:P inst=piano
!mark:open! !mp! z2 cf g2 a2- | a2 gf d4 | !rise(! z2 cd f2 ed | c4- c2 z2 !rise)! |
!mark:reveal! !hit! !f! [FAc]8 | !mark:logo! !fermata![FAcf]8 |
V:D inst=drums kit=pop
Z4 | [C,,^C,]2 ^F,,2 D,,2 ^F,,2 | z8 |`;

test('parseAbc: drum voices read the General MIDI map and ignore the key; cue marks are collected', () => {
  const s = parseAbc(CUE);
  assert.equal(s.voices.D.role, 'drums');
  const drums = s.events.filter((e) => e.voice === 'D').map((e) => GM_DRUMS[e.midi]);
  assert.deepEqual([...new Set(drums)].sort(), ['crash', 'hat', 'kick', 'snare']);
  assert.deepEqual(s.cues.map((c) => c.type), ['mark', 'rise', 'mark', 'hit', 'mark']);
  assert.equal(s.cues.find((c) => c.type === 'rise').from, 8);
});

test('fit: every mark lands on its time, and the tempo bend per stretch is reported', () => {
  const s = parseAbc(CUE);
  const f = fit(s, { open: 0.5, reveal: 11, logo: 13.3 });
  for (const m of f.marks) assert.ok(Math.abs(m.at - m.target) < 0.001, `${m.name} ${m.at} vs ${m.target}`);
  assert.equal(f.stretches.length, 2);
  assert.ok(f.stretches[0].bend < 0, 'four bars in 10.5 s is slower than 96 bpm');
  const p = perform(s, { align: { open: 0.5, reveal: 11, logo: 13.3 } });
  assert.ok(Math.abs(p.cues.find((c) => c.type === 'hit').at - 11) < 0.001);
  assert.throws(() => fit(s, { open: 5, reveal: 3 }), /comes after/);
});

test('om sound plays an om-score fitted to the scene labels', { skip: !findChrome() && 'no Chrome' }, async () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'om-score-')), 'film');
  mkdirSync(join(dir, 'vendor'), { recursive: true });
  cpSync(join(PKG, 'templates', 'blank', 'vendor', 'gsap.min.js'), join(dir, 'vendor', 'gsap.min.js'));
  cpSync(join(PKG, 'runtime', 'om.js'), join(dir, 'vendor', 'om.js'));
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html><head>
<script src="vendor/gsap.min.js"></script><script src="vendor/om.js"></script></head><body>
<div id="film" data-composition-id="film" data-width="640" data-height="360"><b id="x">hi</b></div>
<script type="text/vnd.abc" id="om-score">
${CUE}
</script>
<script>
  const tl = gsap.timeline({ paused: true });
  tl.addLabel('scene:open', 0.4).addLabel('scene:reveal', 10.6).addLabel('scene:logo', 13).to('#x', { x: 100, duration: 16 }, 0);
  window.__timelines.film = tl;
</script></body></html>`);
  assert.ok(readScore(readFileSync(join(dir, 'index.html'), 'utf8')).includes('!mark:reveal!'));
  const out = await sound(openProject(dir));
  assert.match(out, /om-score/);
  assert.match(out, /open 0\.40s · reveal 10\.60s · logo 13\.00s/);
  assert.match(out, /3 hits: riser×1, impact×1, subdrop×1/);
  assert.doesNotMatch(out, /^grid/m);
  assert.match(out, /^energy   open -?\d+\.\d · reveal -?\d+\.\d · logo -?\d+\.\d dB RMS/m);
});

test('edits: !stop! sinks the band to silence, !stutter! repeats the first sixteenth, !filter! darkens then opens', async () => {
  const { renderComposed } = await import('../cli/lib/composed.js');
  const base = 'X:1\nM:4/4\nL:1/8\nQ:1/4=120\nK:C\nV:S inst=saw\n';
  const bars = '[CEG]8 | [CEG]8 |';
  const run = (deco) => renderComposed(base + bars.replace('| [CEG]8 |', `| ${deco[0]} [CEG]8 ${deco[1]} |`), { duration: 4.5 }).music.L;
  const rms = (x, a, z) => { let e = 0; for (let i = Math.round(a * 48000); i < Math.round(z * 48000); i++) e += x[i] * x[i]; return Math.sqrt(e / ((z - a) * 48000)); };
  const plain = run(['', '']), stop = run(['!stop(!', '!stop)!']), filt = run(['!filter(!', '!filter)!']);
  const at = (x) => rms(x, 3.6, 4.0); // the last fifth of bar two
  assert.ok(at(stop) < at(plain) * 0.4, `stop ${at(stop)} vs ${at(plain)}`);
  assert.ok(rms(filt, 2.1, 2.5) < rms(plain, 2.1, 2.5) * 0.8, 'the filter starts closed');
  const st = run(['!stutter(!', '!stutter)!']);
  const q = Math.round(0.125 * 48000), a0 = Math.round(2.05 * 48000);
  let diff = 0; for (let i = 0; i < 2000; i++) diff += Math.abs(st[a0 + 300 + i] - st[a0 + 300 + q + i]);
  assert.ok(diff / 2000 < 0.02, `a stutter repeats every sixteenth (${diff / 2000})`);
});

test('stop: after the tape stop the band stays silent until the next note (no tails coming back)', async () => {
  const { renderComposed } = await import('../cli/lib/composed.js');
  const { RATE } = await import('../cli/lib/dsp.js');
  const text = `X:1
M:4/4
L:1/8
Q:1/4=120
K:C
V:P inst=warmpad
[CEG]8 | [CEG]6 !stop(! [CEG]2 !stop)! | z8 | [CEG]8 |`;
  const { music } = renderComposed(text, { duration: 9 });
  const rms = (a, b) => { let s = 0; for (let i = Math.floor(a * RATE); i < Math.floor(b * RATE); i++) s += music.L[i] ** 2 + music.R[i] ** 2; return Math.sqrt(s / ((b - a) * RATE * 2)); };
  // bar 2 ends (and the stop lands) at 4.05 s; the next chord starts at 6.05 s
  assert.ok(rms(4.1, 5.95) < 1e-4, `silence after the stop, got rms ${rms(4.1, 5.95)}`);
  assert.ok(rms(6.2, 7.5) > 1e-3, 'the band comes back on the next note');
});

test('parseAbc: a key change holds from its beat for every voice, and never leaks into the start of the next voice', () => {
  const s = parseAbc(`X:1
M:4/4
L:1/4
K:Cm
V:A inst=piano
E E E E | [K:D] F F F F |
V:B inst=piano
E E E E | F F F F |`);
  const of = (v, beat) => s.events.find((e) => e.voice === v && e.beat === beat).midi;
  assert.equal(of('A', 0), 63, 'E flat in C minor');
  assert.equal(of('A', 4), 66, 'F sharp once the key is D');
  assert.equal(of('B', 0), 63, 'the second voice starts in the head key, not in the key the first one ended in');
  assert.equal(of('B', 4), 66, 'and changes key on the same beat without writing it again');
});

test('parseAbc: a bar that does not add up, and a voice that stops early, are reported', () => {
  const s = parseAbc(`X:1
M:4/4
L:1/8
K:C
V:A inst=piano
C2 C2 C2 C2 | C2 C2 C2 C2 C | C8 |
V:B inst=piano
C8 | C8 |`);
  assert.equal(s.warnings.length, 2);
  assert.match(s.warnings[0], /voice A bar 2 has 4\.5 beats, the meter wants 4/);
  assert.match(s.warnings[1], /voice B ends at beat 8/);
  assert.deepEqual(parseAbc(CUE).warnings, [], 'a score that adds up is silent');
});
