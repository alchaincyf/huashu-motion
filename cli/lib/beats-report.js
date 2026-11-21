// om beats <file|dir> — what the beat tracker found in a track, as text and (--plot) as a picture: the waveform with the
// beats, bar lines, sections and drop candidates drawn on it, once for the whole track and once zoomed on ten seconds,
// where a beat line that is off its kick is visible. Look at the picture before cutting a film to the numbers.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { analyzeFile, decode } from './beats.js';
import { LOW_CONFIDENCE } from './track.js';
import { OmError } from './project.js';

export const AUDIO = /\.(mp3|wav|m4a|aac|flac|ogg|opus|aif|aiff)$/i;
const fmt = (t) => `${Math.floor(t / 60)}:${String((t % 60).toFixed(1)).padStart(4, '0')}`;

export function audioFiles(input) {
  const p = resolve(input);
  if (!existsSync(p)) throw new OmError(`no such file or folder: ${p}`);
  if (!statSync(p).isDirectory()) return [p];
  const dirs = [p, join(p, 'assets', 'music')].filter((d) => existsSync(d) && statSync(d).isDirectory());
  return dirs.flatMap((d) => readdirSync(d).filter((n) => AUDIO.test(n)).sort().map((n) => join(d, n)));
}

export function verdict(an) {
  return an.confidence < LOW_CONFIDENCE ? 'no clear pulse' : an.confidence < 0.5 ? 'weak pulse' : 'clear pulse';
}

export function beatsReport(file, an, { bars = false } = {}) {
  const lines = [
    `track    ${basename(file)} · ${fmt(an.duration)}${an.end < an.duration - 1 ? ` (the music stops at ${fmt(an.end)})` : ''}`,
    `tempo    ${an.bpm.toFixed(2)} bpm · confidence ${an.confidence.toFixed(2)} — ${verdict(an)}`,
  ];
  if (an.tail) lines.push(`tail     a separate piece after the music: ${an.tail.from.toFixed(2)}–${an.tail.to.toFixed(2)}s, ${an.tail.gapSec.toFixed(1)} s of silence after the music, ${an.tail.dbBelow} dB under it — content after the silence does not go into a film`);
  if (an.fit) lines.push(`fit      ${an.fit.method === 'steady' ? `one steady tempo explains the track: residual ${an.fit.residualMs} ms, worst 30 s window ${an.fit.driftMs} ms off, ${Math.round(an.fit.matched * 100)}% of beats on a real onset` : `the tempo moves (a straight line is off by ${an.fit.driftMs} ms somewhere): beats are tracked one by one, residual ${an.fit.residualMs} ms`}${an.fit.forcedBpm ? ` · tempo given: ${an.fit.forcedBpm}` : ''}${an.fit.switchedFrom ? ` · first estimate ${an.fit.switchedFrom} bpm, replaced: this count fits the onsets and the chord changes better` : ''}`);
  if (an.alternatives?.length) {
    lines.push(`counts   also fits: ${an.alternatives.map((a) => `${a.bpm.toFixed(2)} bpm (${a.ratio}, ${a.score.toFixed(2)}×)`).join(' · ')}   [× = how well it fits, 1 = as well as ${an.bpm.toFixed(2)}]`);
    const rival = an.alternatives.filter((a) => /^[234]:[234]$/.test(a.ratio) && a.steady && a.score >= 0.9).sort((a, b) => b.score - a.score)[0];
    if (rival) lines.push(`warning  the count is ambiguous: ${rival.bpm.toFixed(2)} bpm (${rival.ratio}) fits ${rival.score >= 1 ? 'better than or as well as' : 'almost as well as'} ${an.bpm.toFixed(2)}. Listen once, then set the one you hear: om beats <file> --bpm ${Math.round(rival.bpm)} / OM.music({ bpm })`);
  }
  if (an.confidence < LOW_CONFIDENCE) lines.push('warning  confidence below 0.3: only trust the sections, not the beats — the pulse is a guess; do not cut to it');
  else if (an.confidence < 0.5) lines.push('note     moderate confidence: open the --plot picture and check the beat lines sit on the kicks before cutting to them');
  lines.push(`bars     ${an.downbeats.length} · first bar lines ${an.downbeats.slice(0, 8).map((t) => t.toFixed(2)).join(' ')} s`);
  lines.push(`sections ${an.sections.map((s) => `${s.start.toFixed(1)}–${s.end.toFixed(1)}s e${s.energy.toFixed(2)}`).join(' | ')}`);
  if (an.map) {
    const m = an.map, c = new Set(m.closers.map((x) => x.bar));
    lines.push(`map      key ${m.key.chord} · ${m.bars.length} bars · loudness spans ${m.dynamics.rangeDb.toFixed(1)} dB${m.dynamics.rangeDb < 4 ? ' (flat: too even to re-cut to a film)' : ''} · ${m.segments.length} segments (energy 0–1, grade 0 quiet – 3 full):`);
    for (const g of m.segments) lines.push(`  ${g.start.toFixed(1).padStart(6)}–${g.end.toFixed(1).padEnd(6)}s bars ${String(g.from).padStart(3)}–${String(g.to - 1).padEnd(3)} ${g.label.padEnd(9)} grade ${g.grade} · e ${g.energy.toFixed(2)}${m.closers.some((x) => x.bar >= g.from && x.bar < g.to) ? ` · can end on bar ${m.closers.filter((x) => x.bar >= g.from && x.bar < g.to).map((x) => x.bar).join(', ')}` : ''}`);
    lines.push(`opening  the track's own first ${m.opening.bars} bars (0.0–${m.bars[m.opening.bars - 1].end.toFixed(1)} s, ${m.opening.label})`);
    lines.push(`ending   ${m.ending.type}: ${m.ending.decaySec.toFixed(1)} s from the last bar near full level to silence; a natural ending would start at bar ${m.ending.startBar} (${m.bars[m.ending.startBar].start.toFixed(1)} s) and last ${m.ending.seconds.toFixed(1)} s; last strong beat ${m.bars[m.ending.lastStrong].start.toFixed(1)} s on ${m.ending.lastStrongChord}${m.bars[m.ending.lastStrong].tonic ? ' (home chord)' : ''}`);
    lines.push(`lifts    ${m.lifts.length ? m.lifts.map((l) => `bar ${l.bar} (${m.bars[l.bar].start.toFixed(1)} s, +${l.step.toFixed(2)}, fill bar ${l.pickup})`).join(' · ') : 'none'}`);
    lines.push(m.closers.length ? `ends     ${m.closers.length} bar${m.closers.length === 1 ? '' : 's'} can end a film (on the home chord ${m.key.chord}${m.key.common && m.key.common !== m.key.chord ? ` or ${m.key.common}` : ''}, then the music decays; chord names are rough): ${m.closers.slice(0, 8).map((x) => `${x.bar} (${m.bars[x.bar].start.toFixed(1)}s)`).join(' ')}` : 'ends     no bar ends cleanly on the tonic: a film cut from this track ends on a fade');
    void c;
  }
  lines.push(an.drops.length ? `drops    ${an.drops.map((d) => `${d.t.toFixed(2)}s (${d.score.toFixed(2)})`).join(' · ')}  — the biggest jumps in energy, on a bar line` : 'drops    none found (the track is even)');
  if (bars && an.map) { lines.push('bar   start   end   energy  bright  low    chord  (energy 0–1; bright = dB above 2.5 kHz; low = dB below 160 Hz)'); for (const b of an.map.bars) lines.push(`${String(b.i).padStart(3)}  ${b.start.toFixed(2).padStart(7)} ${b.end.toFixed(2).padStart(7)}  ${b.e.toFixed(2).padStart(5)}  ${b.hf.toFixed(1).padStart(6)}  ${b.lf.toFixed(1).padStart(6)}  ${b.chord}${b.tonic ? '*' : ''}`); }
  return lines.join('\n');
}

// ---------- the picture ----------

function envelope(pcm, a, b, cols) {
  const i0 = Math.max(0, Math.floor(a * pcm.rate)), i1 = Math.min(pcm.L.length, Math.ceil(b * pcm.rate)), out = new Float32Array(cols), step = (i1 - i0) / cols;
  for (let c = 0; c < cols; c++) {
    let m = 0;
    for (let i = i0 + Math.floor(c * step), e = Math.min(i1, i0 + Math.floor((c + 1) * step) + 1); i < e; i++) m = Math.max(m, Math.abs(pcm.L[i] + pcm.R[i]) / 2);
    out[c] = m;
  }
  return out;
}

export function plotSvg(file, an, pcm, { at = null, span = 10 } = {}) {
  const W = 1600, H = 1010, X0 = 56, X1 = W - 24, cols = X1 - X0;
  const hot = an.sections.find((s) => s.energy >= 0.8);
  const z0 = Math.max(0, at != null ? at : hot ? hot.start - 1 : 0), z1 = Math.min(an.duration, z0 + span);
  const panels = [{ t0: 0, t1: an.duration, y0: 70, y1: 290, zoom: false }, { t0: z0, t1: z1, y0: 410, y1: 690, zoom: true }];
  const out = [];
  const peak = Math.max(1e-6, ...envelope(pcm, 0, an.duration, cols));
  for (const P of panels) {
    const x = (t) => X0 + ((t - P.t0) / (P.t1 - P.t0)) * cols, mid = (P.y0 + P.y1) / 2, half = (P.y1 - P.y0) / 2;
    out.push(`<rect x="${X0}" y="${P.y0}" width="${cols}" height="${P.y1 - P.y0}" fill="#faf7f2" stroke="#d8d2c8"/>`);
    if (!P.zoom) for (const s of an.sections) out.push(`<rect x="${x(s.start).toFixed(1)}" y="${P.y0}" width="${Math.max(1, x(s.end) - x(s.start)).toFixed(1)}" height="${P.y1 - P.y0}" fill="#1d1b18" opacity="${(0.04 + 0.1 * s.energy).toFixed(3)}"/>${x(s.end) - x(s.start) > 40 ? `<text x="${(x(s.start) + 4).toFixed(1)}" y="${P.y0 + 16}" font-size="13" fill="#6b655b">e${s.energy.toFixed(2)}</text>` : ''}`);
    const env = envelope(pcm, P.t0, P.t1, cols);
    let d = '';
    for (let c = 0; c < cols; c++) d += `${c ? 'L' : 'M'}${X0 + c},${(mid - (env[c] / peak) * half).toFixed(1)}`;
    for (let c = cols - 1; c >= 0; c--) d += `L${X0 + c},${(mid + (env[c] / peak) * half).toFixed(1)}`;
    out.push(`<path d="${d}Z" fill="#3b5b8c" opacity="0.85"/>`);
    const inside = (t) => t >= P.t0 && t <= P.t1;
    if (P.zoom) for (const t of an.beats.filter(inside)) out.push(`<line x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${P.y0}" y2="${P.y1}" stroke="#e8590c" stroke-width="1.3" opacity="0.8"/>`);
    for (const t of an.downbeats.filter(inside)) out.push(`<line x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${P.y0}" y2="${P.y1}" stroke="#c92a2a" stroke-width="${P.zoom ? 2.6 : 1}" opacity="${P.zoom ? 0.95 : 0.55}"/>`);
    for (const dr of an.drops.filter((q) => inside(q.t))) out.push(`<path d="M${x(dr.t) - 8},${P.y0 - 14}L${x(dr.t) + 8},${P.y0 - 14}L${x(dr.t)},${P.y0 - 1}Z" fill="#2b8a3e"/><text x="${x(dr.t) + 11}" y="${P.y0 - 4}" font-size="13" fill="#2b8a3e">drop ${dr.t.toFixed(1)}s (${dr.score.toFixed(2)})</text>`);
    // time axis
    const stepT = P.zoom ? 1 : Math.max(10, Math.round((P.t1 - P.t0) / 12 / 10) * 10);
    for (let t = Math.ceil(P.t0 / stepT) * stepT; t <= P.t1; t += stepT) out.push(`<line x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${P.y1}" y2="${P.y1 + 6}" stroke="#6b655b"/><text x="${x(t).toFixed(1)}" y="${P.y1 + 22}" font-size="13" fill="#6b655b" text-anchor="middle">${t}s</text>`);
  }
  if (an.map) { // the map: one column per bar, height = energy, colour = segment label, dot = a bar a film can end on
    const m = an.map, y0 = 770, y1 = 960, cw = cols / m.bars.length, col = { intro: '#868e96', build: '#f08c00', breakdown: '#1c7ed6', main: '#c92a2a', verse: '#5c940d', outro: '#868e96' };
    out.push(`<text x="${X0}" y="${y0 - 14}" font-size="15" font-weight="700" fill="#1d1b18">map: one column per bar, height = energy · colour = segment (grey intro/outro · orange build · blue breakdown · red main · green verse) · dot = can end here</text><rect x="${X0}" y="${y0}" width="${cols}" height="${y1 - y0}" fill="#faf7f2" stroke="#d8d2c8"/>`);
    for (const g of m.segments) for (let i = g.from; i < g.to; i++) { const b = m.bars[i], h = Math.max(1, b.e * (y1 - y0 - 8)); out.push(`<rect x="${(X0 + i * cw).toFixed(1)}" y="${(y1 - h).toFixed(1)}" width="${Math.max(0.6, cw - 0.6).toFixed(1)}" height="${h.toFixed(1)}" fill="${col[g.label] || '#666'}" opacity="0.85"/>`); }
    for (const c of m.closers) out.push(`<circle cx="${(X0 + (c.bar + 0.5) * cw).toFixed(1)}" cy="${y0 + 8}" r="4" fill="#2b8a3e"/>`);
    for (const g of m.segments) if (cw * (g.to - g.from) > 46) out.push(`<text x="${(X0 + g.from * cw + 3).toFixed(1)}" y="${y1 - 4}" font-size="11" fill="#fff">${g.label}</text>`);
  }
  const low = an.confidence < LOW_CONFIDENCE;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">
<rect width="${W}" height="${H}" fill="#fff"/>
<text x="${X0}" y="30" font-size="21" font-weight="700" fill="#1d1b18">${basename(file).replace(/[<&]/g, '')} — ${an.bpm.toFixed(2)} bpm · confidence ${an.confidence.toFixed(2)} (${verdict(an)})</text>
<text x="${X0}" y="52" font-size="14" fill="${low ? '#c92a2a' : '#6b655b'}">${low ? 'confidence below 0.3: only trust the sections (shaded, e = energy), not the beats' : 'red = bar line · orange = beat (zoom only) · shaded = sections with energy 0–1 · green = drop candidate'}</text>
<text x="${X0}" y="${panels[1].y0 - 24}" font-size="15" font-weight="700" fill="#1d1b18">zoom ${z0.toFixed(1)}–${z1.toFixed(1)} s: a beat line should sit on the start of a kick or snare hit</text>
${out.join('\n')}
</svg>`;
}

// Writes the picture as PNG (Chrome renders the SVG) — or the SVG itself when no Chrome is installed.
export async function plot(file, an, outFile, opts = {}) {
  const pcm = opts.pcm || decode(file);
  const svg = plotSvg(file, an, pcm, opts);
  const out = resolve(outFile);
  mkdirSync(dirname(out), { recursive: true });
  const { findChrome } = await import('./browser.js');
  if (!findChrome()) { const f = out.replace(/\.png$/i, '') + '.svg'; writeFileSync(f, svg); return f; }
  const tmp = join(mkdtempSync(join(tmpdir(), 'om-beats-')), 'plot.html');
  writeFileSync(tmp, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style></head><body><div data-composition-id="plot" data-width="1600" data-height="1010">${svg}</div></body></html>`);
  const { still } = await import('./still.js');
  await still(tmp, { out });
  return out;
}

export async function beats(input, flags = {}) {
  const files = audioFiles(input);
  if (!files.length) throw new OmError(`no audio files (${AUDIO.source}) in ${resolve(input)}`);
  const bpm = flags.bpm != null && flags.bpm !== true ? Number(flags.bpm) : null;
  const results = files.map((f) => ({ file: f, an: analyzeFile(f, bpm ? { bpm } : undefined) }));
  if (flags.json) return JSON.stringify(results.length === 1 ? results[0].an : results.map((r) => ({ file: r.file, ...r.an })), null, 1);
  const single = results.length === 1 && !statSync(resolve(input)).isDirectory();
  const lines = [];
  if (single) lines.push(beatsReport(results[0].file, results[0].an, { bars: !!flags.bars }));
  else for (const { file, an } of results) lines.push(`${basename(file).padEnd(34)} ${fmt(an.duration).padStart(6)}  ${an.bpm.toFixed(1).padStart(6)} bpm  conf ${an.confidence.toFixed(2)}  ${verdict(an)}${an.confidence < LOW_CONFIDENCE ? '  (sections only)' : ''}`);
  if (flags.plot) {
    for (const { file, an } of results) {
      const stem = basename(file, extname(file)), one = results.length === 1;
      const target = typeof flags.plot === 'string' ? (one && /\.(png|svg)$/i.test(flags.plot) ? flags.plot : join(flags.plot, `${stem}.beats.png`)) : `${stem}.beats.png`;
      const at = flags.at != null && flags.at !== true ? Number(flags.at) : null;
      lines.push(`plot     ${await plot(file, an, target, { at })}`);
    }
  }
  return lines.join('\n');
}

// The picture of an arrangement: what the film wants (dashed), the energy of the bars it was given (steps), the joins with their scores,
// and below, the track's map with the stretches used.
export function arrangeSvg(an, plan, { title = '' } = {}) {
  const a = plan.arrange, m = an.map, W = 1600, H = 640, X0 = 56, X1 = W - 24, cols = X1 - X0, D = plan.duration;
  const x = (t) => X0 + (t / D) * cols, col = { intro: '#868e96', build: '#f08c00', breakdown: '#1c7ed6', main: '#c92a2a', verse: '#5c940d', outro: '#868e96' };
  const y0 = 90, y1 = 330, yy = (e) => y1 - e * (y1 - y0 - 10), out = [];
  out.push(`<rect x="${X0}" y="${y0}" width="${cols}" height="${y1 - y0}" fill="#faf7f2" stroke="#d8d2c8"/>`);
  if (a.duck) out.push(`<rect x="${x(a.duck.from)}" y="${y0}" width="${x(a.duck.to) - x(a.duck.from)}" height="${y1 - y0}" fill="#1c7ed6" opacity="0.12"/><text x="${x(a.duck.from) + 4}" y="${y0 + 16}" font-size="12" fill="#1c7ed6">stop (ducked ${a.duck.db} dB)</text>`);
  a.steps.forEach((st, j) => { const t0 = st.film, t1 = a.steps[j + 1]?.film ?? D; out.push(`<rect x="${x(t0).toFixed(1)}" y="${yy(st.e).toFixed(1)}" width="${(x(t1) - x(t0) - 1).toFixed(1)}" height="${(y1 - yy(st.e)).toFixed(1)}" fill="${col[st.label] || '#666'}" opacity="0.8"/>`); });
  let d = ''; a.targets.forEach((q, j) => { const t1 = a.targets[j + 1]?.t ?? D; d += `${j ? 'L' : 'M'}${x(q.t).toFixed(1)},${yy(q.e).toFixed(1)}L${x(t1).toFixed(1)},${yy(q.e).toFixed(1)}`; });
  out.push(`<path d="${d}" fill="none" stroke="#1d1b18" stroke-width="2" stroke-dasharray="6 4"/>`);
  for (const j of a.joins) { const c = j.score >= 0.6 ? '#2b8a3e' : j.score >= 0.4 ? '#e67700' : '#c92a2a'; out.push(`<line x1="${x(j.at)}" x2="${x(j.at)}" y1="${y0}" y2="${y1}" stroke="${c}" stroke-width="2"/><text x="${x(j.at) + 4}" y="${y1 + 16}" font-size="13" fill="${c}">join ${j.score.toFixed(2)}</text><text x="${x(j.at) + 4}" y="${y1 + 31}" font-size="11" fill="#6b655b">bar ${j.from}→${j.to} ${j.chords}</text>`); }
  if (a.ending.kind === 'fade') out.push(`<line x1="${x(a.ending.fadeFrom)}" x2="${x(D)}" y1="${y0 + 6}" y2="${y1}" stroke="#868e96" stroke-width="2"/><text x="${x(a.ending.fadeFrom) - 4}" y="${y0 + 16}" font-size="12" fill="#6b655b" text-anchor="end">fade (bar ${a.ending.bar}, ${a.ending.chord}${a.ending.tonic ? ' tonic' : ''})</text>`);
  else { const at = a.ending.kind === 'button' ? a.ending.landing : a.ending.fromFilm; out.push(`<rect x="${x(at)}" y="${y0}" width="${x(D) - x(at)}" height="${y1 - y0}" fill="#2b8a3e" opacity="0.10"/>${a.ending.landing != null ? `<line x1="${x(a.ending.landing)}" x2="${x(a.ending.landing)}" y1="${y0}" y2="${y1}" stroke="#2b8a3e" stroke-width="2" stroke-dasharray="4 3"/>` : ''}<text x="${x(at) + 4}" y="${y1 - 6}" font-size="12" fill="#2b8a3e">${a.ending.kind === 'button' ? 'button hit + ring' : `track's own ending (${a.ending.type})`}${a.ending.landing != null ? ` · lands ${a.ending.landing}s` : ''}</text>`); }
  out.push(`<rect x="${x(0)}" y="${y1 + 36}" width="${x(a.opening.end) - x(0)}" height="5" fill="#1c7ed6"/><text x="${x(0) + 2}" y="${y1 + 56}" font-size="12" fill="#1c7ed6">the track's own opening</text>`);
  for (const e of a.events) out.push(`<text x="${x(e.t)}" y="${y0 - 6}" font-size="13" font-weight="700" fill="#1d1b18" text-anchor="middle">${e.name} ${e.t}s</text><line x1="${x(e.t)}" x2="${x(e.t)}" y1="${y0 - 2}" y2="${y0 + 8}" stroke="#1d1b18"/>`);
  for (let t = 0; t <= D; t += D > 40 ? 5 : 2) out.push(`<text x="${x(t)}" y="${y1 + 50}" font-size="12" fill="#6b655b" text-anchor="middle">${t}s</text>`);
  // the track below
  const T = Math.max(...m.bars.map((b) => b.end)), ty0 = 420, ty1 = 600, tx = (t) => X0 + (t / T) * cols, ty = (e) => ty1 - e * (ty1 - ty0 - 6);
  out.push(`<text x="${X0}" y="${ty0 - 14}" font-size="15" font-weight="700" fill="#1d1b18">the track: energy per bar; outlined = bars the film uses (numbers = film second where each run lands)</text><rect x="${X0}" y="${ty0}" width="${cols}" height="${ty1 - ty0}" fill="#faf7f2" stroke="#d8d2c8"/>`);
  for (const g of m.segments) for (let i = g.from; i < g.to; i++) { const b = m.bars[i], used = a.steps.some((s) => s.bar === i); out.push(`<rect x="${tx(b.start).toFixed(1)}" y="${ty(b.e).toFixed(1)}" width="${Math.max(0.6, tx(b.end) - tx(b.start) - 0.5).toFixed(1)}" height="${(ty1 - ty(b.e)).toFixed(1)}" fill="${col[g.label] || '#666'}" opacity="${used ? 0.95 : 0.28}" ${used ? 'stroke="#1d1b18" stroke-width="1"' : ''}/>`); }
  let k = 0; while (k < a.steps.length) { let e = k; while (e + 1 < a.steps.length && a.steps[e + 1].bar === a.steps[e].bar + 1) e++; out.push(`<text x="${tx(m.bars[a.steps[k].bar].start).toFixed(1)}" y="${ty0 + 14}" font-size="12" font-weight="700" fill="#1d1b18">${a.steps[k].film.toFixed(0)}s</text>`); k = e + 1; }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif"><rect width="${W}" height="${H}" fill="#fff"/><text x="${X0}" y="30" font-size="21" font-weight="700" fill="#1d1b18">${title.replace(/[<&]/g, '')} — arrangement, ${D}s film</text><text x="${X0}" y="52" font-size="14" fill="#6b655b">bars = energy of the track bar placed there (colour = its segment) · dashed = what the film wants · vertical lines = joins with smoothness 0–1 (green good, orange ok, red audible)</text>${out.join('\n')}</svg>`;
}
export async function arrangePlot(an, plan, outFile, title) {
  const svg = arrangeSvg(an, plan, { title }), out = resolve(outFile);
  mkdirSync(dirname(out), { recursive: true });
  const { findChrome } = await import('./browser.js');
  if (!findChrome()) { const f = out.replace(/\.png$/i, '') + '.svg'; writeFileSync(f, svg); return f; }
  const tmp = join(mkdtempSync(join(tmpdir(), 'om-arr-')), 'plot.html');
  writeFileSync(tmp, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style></head><body><div data-composition-id="plot" data-width="1600" data-height="640">${svg}</div></body></html>`);
  const { still } = await import('./still.js');
  await still(tmp, { out });
  return out;
}
