#!/usr/bin/env node
// Pack a folder of finished tracks into default-library catalog entries, and print a per-track checkup.
//
//   node scripts/music-pack.mjs <dir> --meta table.tsv [--out dir] [--tag music-v1] [--base url] [--merge music/catalog.json] [--copy]
//
// <dir>         the tracks (mp3 / wav / m4a / flac / ogg), distributed as they are: never trimmed or re-encoded; published as <id>.<ext>.
// --meta        id / name / mood table, one track per line: `file<TAB>id<TAB>name<TAB>mood` (commas work too; mood tags are
//               separated by | or spaces; a first line starting with "file" is a header). JSON also works: [{ file, id, name, mood }].
// --tag         the release the files are uploaded to (default music-v1: the library is versioned apart from the software).
// --base        the download base written into catalog.json (default: this repository's release assets for --tag).
//               `om music build` also reads OM_MUSIC_BASE, so a local folder (file:///…) works for a dry run.
// --out         writes catalog.json, checkup.md and checkup.json here (default ./music-pack-out); --copy also copies the files
//               byte for byte into <out>, named <id>.<ext>, plus LICENSE.md, for uploading.
// --merge       an existing catalog.json: the new entries replace the ones with the same id and the rest is kept.
//
// The checkup is a table to choose tracks by: steady tempo or not, how the track ends, the length of the ending phrase, whether
// a fill leads into it, loudness range, high-frequency band (a muffled mix is flagged), beat phase and bar-line confidence.
// It does not call any outside service.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { analyzeFile, decode } from '../cli/lib/beats.js';
import { biquad } from '../cli/lib/dsp.js';
import { fillClarity } from '../cli/lib/arrange.js';

const args = process.argv.slice(2), flag = (k, d = null) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : (args[i + 1]?.startsWith('--') ? true : args[i + 1] ?? true); };
const bool = new Set(['copy']);
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !bool.has(args[i - 1].slice(2))));
const dir = positional[0];
if (!dir || !flag('meta')) { console.error('usage: music-pack.mjs <dir> --meta table.tsv [--out dir] [--tag music-v1] [--base url] [--merge catalog.json] [--copy]'); process.exit(2); }
const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
const REPO = 'https://github.com/alchaincyf/huashu-motion';
const tag = String(flag('tag', 'music-v1'));
const base = String(flag('base', `${REPO}/releases/download/${tag}`)).replace(/\/+$/, '');
const out = resolve(String(flag('out', 'music-pack-out')));

// ---- the id / name / mood table
function readMeta(file) {
  const text = readFileSync(file, 'utf8').trim();
  if (text.startsWith('[')) return JSON.parse(text);
  return text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).map((l) => l.split(l.includes('\t') ? '\t' : ',').map((c) => c.trim())).filter((c, i) => !(i === 0 && /^file$/i.test(c[0]))).map(([file, id, name, mood]) => ({ file, id, name, mood }));
}
const meta = readMeta(resolve(String(flag('meta'))));
const tagsOf = (m) => (Array.isArray(m) ? m : String(m || '').split(/[|\s]+/)).map((x) => x.trim()).filter(Boolean);
const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

// ---- the checkup
// share of the mix's energy above 8 kHz and 12 kHz, in dB under the whole mix: a muffled master (a low-passed generator output) has little there
function highBand(pcm) {
  const n = pcm.L.length, mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = 0.5 * (pcm.L[i] + pcm.R[i]);
  const rms = (x) => { let s = 0; for (let i = 0; i < x.length; i += 2) s += x[i] * x[i]; return Math.sqrt(s / Math.ceil(x.length / 2)) + 1e-12; };
  const all = rms(mono), at = (fc) => 20 * Math.log10(rms(biquad(biquad(mono, 'hp', fc), 'hp', fc)) / all);
  return { db8k: r1(at(8000)), db12k: r1(at(12000)) };
}
const MUFFLED_8K = -42; // dB under the whole mix; calibrated on the first twelve tracks (see the checkup of 2026-11)

function checkup(file, m) {
  const an = analyzeFile(file), pcm = decode(file, 48000), map = an.map, bars = map?.bars || [], M = bars.length;
  const hb = highBand(pcm);
  const row = {
    file: basename(file), bpm: r2(an.bpm), duration: r1(an.duration), musicEnd: r2(Math.min(an.end || an.duration, an.duration)),
    tail: an.tail ? { from: an.tail.from, to: an.tail.to, gapSec: an.tail.gapSec, dbBelow: an.tail.dbBelow } : null,
    steady: an.fit?.method === 'steady', residualMs: an.fit?.residualMs ?? null, confidence: r2(an.confidence), barLineAt: M ? r2(bars[0].start) : null, bars: M,
  };
  if (M >= 4) {
    const E = map.ending, startBar = Math.min(E.startBar, M - 1), op = map.opening.bars;
    Object.assign(row, {
      ending: { type: E.type, bars: M - startBar, from: r2(bars[startBar].start), seconds: r1(E.seconds), decaySec: r1(E.decaySec), fill: r2(fillClarity(bars, startBar)) },
      opening: { bars: op, from: r2(bars[0].start), to: r2(bars[op - 1].end) },
      lifts: map.lifts.length, rangeDb: r1(map.dynamics.rangeDb),
    });
  }
  Object.assign(row, hb, { muffled: hb.db8k < MUFFLED_8K });
  row.hasFill = !!row.ending && row.ending.fill >= 0.35;
  return row;
}

const rows = [], entries = [];
mkdirSync(out, { recursive: true });
const pub = (m) => `${m.id}${extname(m.file).toLowerCase()}`; // published as <id>.<ext>: ASCII, stable, the bytes untouched
for (const m of meta) {
  const file = join(resolve(dir), m.file);
  if (!existsSync(file) || statSync(file).isDirectory()) { console.error(`no such file: ${file}`); process.exit(1); }
  if (!m.id || !m.name) { console.error(`the table needs an id and a name for ${m.file}`); process.exit(1); }
  const c = checkup(file, m);
  rows.push({ id: m.id, name: m.name, ...c });
  entries.push({
    id: m.id, name: m.name, mood: tagsOf(m.mood), bpm: c.bpm, duration: c.duration, musicEnd: c.musicEnd,
    ...(c.ending ? { ending: { type: c.ending.type, bars: c.ending.bars, from: c.ending.from } } : {}),
    ...(c.opening ? { opening: c.opening } : {}), lifts: c.lifts ?? 0,
    sha256: sha256(file), file: pub(m), url: pub(m), license: 'LICENSE.md', generated: 'AI-generated',
  });
  if (flag('copy')) copyFileSync(file, join(out, pub(m)));
}

if (flag('copy')) copyFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'music', 'LICENSE.md'), join(out, 'LICENSE.md'));
let catalog = { version: 1, about: 'The default music library of huashu-motion: instrumental tracks made by the repository author with AI music tools and released for any use (see LICENSE.md). `om music build` downloads them to ~/.cache/huashu-motion/music (OM_MUSIC overrides); a track url is absolute or relative to base (OM_MUSIC_BASE overrides).', base, license: 'LICENSE.md', tracks: [] };
if (flag('merge')) { const old = JSON.parse(readFileSync(resolve(String(flag('merge'))), 'utf8')); catalog = { ...old, base, tracks: old.tracks.filter((t) => !entries.some((e) => e.id === t.id)) }; }
catalog.tracks.push(...entries);
writeFileSync(join(out, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
writeFileSync(join(out, 'checkup.json'), JSON.stringify(rows, null, 1));

// ---- the table
const yes = (b) => (b ? 'yes' : 'no'), flags = (r) => [!r.steady && 'tempo drifts', r.muffled && 'muffled', r.confidence < 0.5 && 'low confidence', r.ending && !r.hasFill && 'no fill into the ending'].filter(Boolean).join(', ') || '-';
const lines = ['# Music checkup', '', `${rows.length} track(s). Files are distributed as they are; the tools do not play anything after the end of the music (\`musicEnd\`). Download base: ${base}`, '',
  '| id | name | bpm | length | music ends | steady | ending | ending bars | fill into it | lifts | range dB | 8k / 12k dB | bar line at | confidence | flags |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.id} | ${r.name} | ${r.bpm} | ${r.duration} | ${r.musicEnd}${r.duration - r.musicEnd > 0.5 ? ` (+${r1(r.duration - r.musicEnd)} s after)` : ''} | ${yes(r.steady)} | ${r.ending?.type ?? '?'} | ${r.ending ? `${r.ending.bars} (${r.ending.seconds} s)` : '?'} | ${r.ending ? yes(r.hasFill) : '?'} | ${r.lifts ?? '?'} | ${r.rangeDb ?? '?'} | ${r.db8k} / ${r.db12k}${r.muffled ? ' muffled' : ''} | ${r.barLineAt ?? '?'} | ${r.confidence} | ${flags(r)} |`),
  '', `"muffled": energy above 8 kHz is more than ${-MUFFLED_8K} dB under the whole mix. "fill into it": the bar before the closing phrase differs from the one before it (energy, or a rise in the highs).`, ''];
writeFileSync(join(out, 'checkup.md'), lines.join('\n'));
console.log(lines.join('\n'));
console.error(`wrote ${join(out, 'catalog.json')}, ${join(out, 'checkup.md')}, ${join(out, 'checkup.json')}`);
