#!/usr/bin/env node
// Evaluate the arrangement strategies on a folder of tracks and a set of film lengths, and export audition clips.
//
//   node scripts/arrange-eval.mjs <dir-of-tracks> [--lengths 15,20,30,34,45,60] [--out dir] [--worst 5]
//   node scripts/arrange-eval.mjs <track> --length 34 --burst 12 --peak 24 --audition dir
//
// Per track x length x strategy it plans, renders and measures: joins, loudness 1 s each side of every join (measured on the
// rendered audio), chroma continuity, where each join's chroma change sits among the track's own bar-to-bar changes, whether a
// lift's fill bar was kept, the ending (kind, tail), and the burst/peak alignment. Writes results.json and summary.md, renders
// the worst arrangements to wav, and (with --audition) cuts the 4 s around every join and the last 6 s of an arrangement into
// numbered clips with a manifest, ready to hand to a listener or a model that can hear. It does not call any outside service.
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { analyzeFile, decode } from '../cli/lib/beats.js';
import { planTrack, renderTrack } from '../cli/lib/track.js';
import { measureArrangement } from '../cli/lib/arrange.js';

const args = process.argv.slice(2), flag = (k, d = null) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1] ?? true; };
const input = args.find((a) => !a.startsWith('--') && (args.indexOf(a) === 0 || !args[args.indexOf(a) - 1].startsWith('--')));
if (!input) { console.error('usage: arrange-eval.mjs <track|dir> [--lengths 15,20,...] [--out dir] [--worst 5] [--audition dir --length s --burst s --peak s]'); process.exit(2); }
const RATE = 48000, r2 = (x) => Math.round(x * 100) / 100;
const listOf = (inp) => (statSync(inp).isDirectory() ? readdirSync(inp).filter((f) => /\.(mp3|wav|m4a|flac|ogg)$/i.test(f)).sort().map((f) => join(inp, f)) : [resolve(inp)]);
const files = [...listOf(input), ...(flag('also') ? listOf(flag('also')) : [])];
const lengths = String(flag('lengths', '15,20,30,34,45,60')).split(',').map(Number);
const out = resolve(flag('out', 'arrange-eval-out'));
mkdirSync(out, { recursive: true });

function wav(file, { L, R }) {
  const n = L.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4); b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4); }
  writeFileSync(file, b);
}
// the uniform film template: burst at 35 % and peak at 68 % of the length, each snapped to the nearest bar line of the track (the peak a whole number of bars after the burst)
const filmFor = (D, burst, peak, an) => {
  const bars = an?.map?.bars, B = bars ? [...bars.map((x) => x.end - x.start)].sort((x, y) => x - y)[bars.length >> 1] : 2, g0 = bars ? bars[0].start : 0;
  const b = burst ?? r2(g0 + Math.round((D * 0.35 - g0) / B) * B), p = peak ?? r2(b + Math.max(1, Math.round((D * 0.68 - b) / B)) * B);
  const land = Math.round(D * 0.88 * 2) / 2;
  return { labels: { 'scene:hook': 0, 'scene:build': r2(D * 0.15), 'scene:burst': b, 'scene:peak': p, 'scene:close': land }, music: { burst: b, peak: p, landing: land } };
};
const STRATS = [{ name: 'A+natural', mid: 'A', endKind: 'natural' }, { name: 'A+button', mid: 'A', endKind: 'button' }, { name: 'A+fade', mid: 'A', endKind: 'fade' }, { name: 'B+natural', mid: 'B', endKind: 'natural' }, { name: 'B+button', mid: 'B', endKind: 'button' }, { name: 'best', mid: null, endKind: null }];

const rows = [], keep = [];
for (const file of files) {
  const id = /^[0-9][0-9]/.test(basename(file)) && /^[0-9][0-9][a-z]?-/.test(basename(file)) && !/^[0-9][0-9][a-z]-/.test(basename(file)) ? basename(file).slice(0, 3).replace(/[^0-9a-z]/gi, '') : basename(file, extname(file)), an = analyzeFile(file), pcm = decode(file, RATE);
  const ownChange = []; if (an.map) for (let i = 0; i + 1 < an.map.bars.length; i++) ownChange.push(i);
  for (const D of (flag('length') ? [Number(flag('length'))] : lengths)) {
    const film = filmFor(D, flag('burst') ? Number(flag('burst')) : null, flag('peak') ? Number(flag('peak')) : null, an);
    for (const S of STRATS) {
      const plan = planTrack(an, { duration: D, film, only: S.mid ? { mid: S.mid, endKind: S.endKind } : null, pcm: S.name === 'best' ? pcm : null }); // the chosen plan goes through the loudness veto, as in `om sound`
      const row = { id, D, strategy: S.name, ok: !!plan.arrange, why: plan.arrangeNote || null };
      if (plan.arrange) {
        const a = plan.arrange, audio = renderTrack(pcm, plan), m = measureArrangement(audio, plan, RATE);
        Object.assign(row, {
          chosen: a.strategy + ' + ' + a.endingKind, joins: a.joins.length, smoothMin: a.joins.length ? Math.min(...a.joins.map((j) => j.score)) : null,
          loudMaxDb: m.joins.length ? Math.max(...m.joins.map((j) => Math.abs(j.diff))) : 0, loudDiffs: m.joins.map((j) => j.diff),
          cosMin: a.joins.length ? Math.min(...a.joins.map((j) => j.cos)) : null, noveltyMax: a.joins.length ? Math.max(...a.joins.map((j) => j.novelty)) : null,
          jumps: m.jumps.length, endingKind: a.endingKind, endingType: a.ending.type, tail: a.ending.kind === 'button' ? a.button.tail : a.ending.decaySec ?? 0, slack: a.slack,
          endingSeconds: a.ending.kind === 'natural' ? r2(a.ending.musicEnds - a.ending.fromFilm) : 0, landingOffMs: a.events.find((e) => e.name === 'landing')?.offMs ?? null, recommend: !!a.suggestion?.recommend, burstOffMs: a.events.find((e) => e.name === 'burst')?.offMs ?? null, burstLift: a.events.find((e) => e.name === 'burst')?.lift?.how ?? null, peakLift: a.events.find((e) => e.name === 'peak')?.lift?.how ?? null, peakOffMs: a.events.find((e) => e.name === 'peak')?.offMs ?? null, gap: a.meanGap, score: a.score,
        });
        // badness: audible-join risk + misalignment + loudness
        row.bad = (row.joins ? (1 - row.smoothMin) * 2 + row.loudMaxDb / 3 : 0) + row.jumps * 2 + Math.min(2, Math.abs(row.burstOffMs ?? 0) / 300) + Math.min(2, Math.abs(row.peakOffMs ?? 0) / 300) + row.gap * 3 + (row.endingKind === 'fade' ? 1 : 0) + Math.abs(row.slack || 0);
        if (S.name === 'best') keep.push({ row, plan, audio, an, file });
      }
      rows.push(row);
    }
  }
}
writeFileSync(join(out, 'results.json'), JSON.stringify(rows, null, 1));

// summary: per strategy
const lines = ['# Arrangement strategies', '', `${files.length} track(s) x ${lengths.length} lengths. Loudness is measured on rendered audio, 1 s each side of every join.`, '', '| strategy | feasible | mean joins | worst join loudness (mean / max dB) | mean worst smoothness | jumps over 6 dB | mean gap to the film | ending kinds |', '|---|---|---|---|---|---|---|---|'];
for (const S of STRATS) {
  const R = rows.filter((r) => r.strategy === S.name), ok = R.filter((r) => r.ok);
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const ends = {}; for (const r of ok) ends[r.endingType] = (ends[r.endingType] || 0) + 1;
  lines.push(`| ${S.name} | ${ok.length}/${R.length} | ${mean(ok.map((r) => r.joins)).toFixed(1)} | ${mean(ok.map((r) => r.loudMaxDb)).toFixed(1)} / ${Math.max(0, ...ok.map((r) => r.loudMaxDb)).toFixed(1)} | ${mean(ok.filter((r) => r.smoothMin != null).map((r) => r.smoothMin)).toFixed(2)} | ${ok.reduce((a, r) => a + r.jumps, 0)} | ${mean(ok.map((r) => r.gap)).toFixed(2)} | ${Object.entries(ends).map(([k, v]) => `${k} ${v}`).join(', ')} |`);
}
const best = rows.filter((r) => r.strategy === 'best');
const win = {}; for (const r of best.filter((x) => x.ok)) win[r.chosen] = (win[r.chosen] || 0) + 1;
const cls = {}; for (const r of best.filter((x) => x.ok)) cls[r.endingKind] = (cls[r.endingKind] || 0) + 1;
lines.push('', `Ending of the chosen arrangement: ${Object.entries(cls).map(([k, v]) => `${k} ${v} (${Math.round((100 * v) / best.length)} %)`).join(', ')}; straight cut ${best.filter((x) => !x.ok).length}. The suggested film (moved burst / peak / landing, length) is recommended in ${best.filter((x) => x.recommend).length} of ${best.length}.`);
const share = (f) => `${best.filter((x) => x.ok && f(x)).length}/${best.length} (${Math.round((100 * best.filter((x) => x.ok && f(x)).length) / best.length)} %)`;
lines.push('', `Real lift of the track on the burst: exactly on it ${share((x) => x.burstLift === 'on')}, on it or the bar before ${share((x) => x.burstLift)}; on the peak: exactly ${share((x) => x.peakLift === 'on')}, on it or the bar before ${share((x) => x.peakLift)}; on the burst or the peak (either, exact or a bar before) ${share((x) => x.burstLift || x.peakLift)}; on both ${share((x) => x.burstLift && x.peakLift)}. Tracks whose map has no lift of a size that fits are counted as without.`);
lines.push('', `Chosen by the score (strategy + ending): ${Object.entries(win).map(([k, v]) => `${k} ${v}`).join(', ')}; straight cut (no arrangement): ${best.filter((r) => !r.ok).length}/${best.length}.`, '');
lines.push('| track | ' + lengths.join(' s | ') + ' s |', '|---|' + lengths.map(() => '---|').join(''));
for (const id of [...new Set(rows.map((r) => r.id))]) lines.push(`| ${id} | ${lengths.map((D) => { const r = best.find((x) => x.id === id && x.D === D); return r?.ok ? `${r.chosen.replace('A elastic middle', 'A').replace('B head+tail', 'B').replace(' + ', '+')} j${r.joins} ${r.endingType}` : 'straight'; }).join(' | ')} |`);
writeFileSync(join(out, 'summary.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));

// the worst arrangements, rendered with a note on what is wrong
const worstN = Number(flag('worst', 5)), worst = keep.sort((a, b) => b.row.bad - a.row.bad).slice(0, worstN), notes = [];
const dir = join(out, 'worst'); mkdirSync(dir, { recursive: true });
worst.forEach(({ row, plan, audio }, i) => {
  const why = [];
  if (row.joins && row.smoothMin < 0.7) why.push(`weakest join smoothness ${row.smoothMin}`);
  if (row.loudMaxDb > 2) why.push(`loudness step up to ${r2(row.loudMaxDb)} dB at a join`);
  if (row.jumps) why.push(`${row.jumps} loudness jump(s) over 6 dB`);
  if (Math.abs(row.burstOffMs || 0) > 60) why.push(`burst ${row.burstOffMs} ms off a bar line`);
  if (Math.abs(row.peakOffMs || 0) > 60) why.push(`peak ${row.peakOffMs} ms off a bar line`);
  if (row.endingKind === 'fade') why.push('ends on a fade (no usable ending)');
  if (row.gap > 0.25) why.push(`mean gap to the film's energy ${row.gap}`);
  if (Math.abs(row.slack || 0) > 0.3) why.push(`${r2(row.slack)} s of slack at the end`);
  const name = `${String(i + 1).padStart(2, '0')}-${row.id}-${row.D}s.wav`;
  wav(join(dir, name), audio); notes.push({ file: name, track: row.id, seconds: row.D, chosen: row.chosen, why });
});
writeFileSync(join(dir, 'notes.json'), JSON.stringify(notes, null, 1));
console.log('\nworst arrangements:'); for (const n of notes) console.log(`  ${n.file}  ${n.chosen}: ${n.why.join('; ') || 'nothing in particular'}`);

// audition clips: 4 s each side of every join, the last 6 s
const aud = flag('audition');
if (aud) {
  const ad = resolve(aud); mkdirSync(ad, { recursive: true });
  const man = [];
  for (const { row, plan, audio } of keep) {
    const slice = (t0, t1) => { const a = Math.max(0, Math.round(t0 * RATE)), b = Math.min(audio.L.length, Math.round(t1 * RATE)); return { L: audio.L.slice(a, b), R: audio.R.slice(a, b) }; };
    plan.arrange.joins.forEach((j, i) => { const f = `${row.id}-${row.D}s-join${i + 1}-at${j.at}.wav`; wav(join(ad, f), slice(j.at - 4, j.at + 4)); man.push({ file: f, kind: 'join', film: j.at, smooth: j.score, question: 'Is there an audible seam, jump in loudness, or broken melody at the centre (4.0 s into the clip)?' }); });
    const f = `${row.id}-${row.D}s-ending.wav`; wav(join(ad, f), slice(plan.duration - 6, plan.duration)); man.push({ file: f, kind: 'ending', film: plan.duration - 6, endingKind: plan.arrange.endingKind, question: 'Does this sound like a natural ending of a piece of music (a final chord that rings out), or like a fade / a cut?' });
  }
  writeFileSync(join(ad, 'manifest.json'), JSON.stringify(man, null, 1));
  console.log(`\naudition clips: ${man.length} in ${ad} (manifest.json lists what to ask of each)`);
}
