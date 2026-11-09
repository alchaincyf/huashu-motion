// om qa — what a frame-by-frame look at a render can catch automatically. Reads the decoded video
// at low resolution and reports: single-frame pops (a frame that jumps and jumps back), dead time
// (stretches where nothing moves), hard cuts, whether the last frame matches the first (loops), and
// the motion curve per second so a flat film is visible as a flat line.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { OmError } from './project.js';

const W = 96, H = 54;

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate,width,height:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new OmError(`cannot read ${file}: ${(r.stderr || '').trim()}`);
  const j = JSON.parse(r.stdout), s = j.streams[0];
  const [n, d] = s.r_frame_rate.split('/').map(Number);
  return { fps: n / d, width: s.width, height: s.height, duration: Number(j.format.duration) };
}

function frames(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new OmError(`ffmpeg could not decode ${file}`);
  const size = W * H, out = [];
  for (let i = 0; i + size <= r.stdout.length; i += size) out.push(r.stdout.subarray(i, i + size));
  return out;
}

const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };

export function qa(file, { loop = false } = {}) {
  if (!existsSync(file)) throw new OmError(`no such file ${file}`);
  const info = probe(file), f = frames(file), fps = info.fps;
  const d = f.slice(1).map((x, i) => diff(x, f[i]));
  const t = (i) => +(i / fps).toFixed(2);
  // A pop: frame i differs a lot from both neighbours while the neighbours are close to each other.
  const pops = [];
  for (let i = 1; i < f.length - 1; i++) {
    const a = d[i - 1], b = d[i], around = diff(f[i - 1], f[i + 1]);
    if (a > 6 && b > 6 && around < Math.min(a, b) / 3) pops.push({ at: t(i), jump: +Math.min(a, b).toFixed(1) });
  }
  // Hard cuts: a jump far above the local motion level that does not come back.
  const cuts = [];
  for (let i = 0; i < d.length; i++) {
    const local = median(d.slice(Math.max(0, i - 6), i).concat(d.slice(i + 1, i + 7)));
    if (d[i] > 14 && d[i] > 4 * (local + 1) && !pops.some((p) => Math.abs(p.at - t(i + 1)) < 0.05)) cuts.push(t(i + 1));
  }
  // Dead time: ≥ 1 s where consecutive frames barely change.
  const dead = [];
  let run = 0;
  for (let i = 0; i <= d.length; i++) {
    if (i < d.length && d[i] < 0.25) run++;
    else { if (run / fps >= 1) dead.push({ from: t(i - run), to: t(i), seconds: +(run / fps).toFixed(2) }); run = 0; }
  }
  const perSec = [];
  for (let s = 0; s * fps < d.length; s++) {
    const seg = d.slice(Math.round(s * fps), Math.round((s + 1) * fps));
    perSec.push(+(seg.reduce((a, b) => a + b, 0) / seg.length).toFixed(1));
  }
  const mean = perSec.reduce((a, b) => a + b, 0) / (perSec.length || 1);
  const sd = Math.sqrt(perSec.reduce((a, b) => a + (b - mean) ** 2, 0) / (perSec.length || 1));
  const loopGap = +diff(f[0], f[f.length - 1]).toFixed(2);
  // The opening and the whole: what separates a film people watch from a slide deck that happens to move. Measured on
  // 15 films the user signed off (2026-10) against a one-line film by a new user: their strongest second in the first
  // 5 s was 2.0–24 (median ~6) with no still stretch over 1.1 s there, and the whole film averaged 0.85–5.8; the
  // one-line film peaked at 0.9 in its first 5 s, stood still from 0.95 to 4.2 s and averaged 0.18 with no cut.
  const head = perSec.slice(0, 5), stillHead = dead.filter((x) => x.from < 5 && x.seconds >= 1.5);
  const opening = { peak: head.length ? Math.max(...head) : 0, still: stillHead, flat: info.duration >= 6 && ((head.length ? Math.max(...head) : 0) < 1.5 || stillHead.length > 0) };
  const flatFilm = info.duration >= 6 && mean < 0.6 && cuts.length / info.duration * 60 < 3;
  // Frame 0 is the poster: feeds and players show it before the film plays, a README GIF shows it while it loads, a
  // share preview often is it. "Content" = pixels away from the frame's median grey and edges between neighbours.
  // Measured 2026-10-22: films that open on their subject had 7–94 % such pixels and 2–18 % edges in frame 0; a blank
  // page, black, or a lone small mark on black had under 2.5 % and 1.2 % (three of the user's approved films opened
  // that way, fading up over ~2 s — fine to watch, an empty poster).
  const content = (px) => {
    const m = median(px);
    let far = 0, edges = 0;
    for (let i = 0; i < px.length; i++) {
      if (Math.abs(px[i] - m) > 16) far++;
      if (i % W < W - 1 && Math.abs(px[i] - px[i + 1]) > 20) edges++;
    }
    return { far: far / px.length, edges: edges / (H * (W - 1)) };
  };
  const filled = (c) => c.far >= 0.05 && c.edges >= 0.015;
  const c0 = f.length ? content(f[0]) : { far: 0, edges: 0 };
  let arrives = null;
  for (let i = 0; i < f.length && i < fps * 10; i++) if (filled(content(f[i]))) { arrives = t(i); break; }
  const firstFrame = { far: +c0.far.toFixed(3), edges: +c0.edges.toFixed(3), empty: c0.far < 0.03 && c0.edges < 0.012, contentAt: arrives };
  return {
    file, ...info, frames: f.length,
    pops, cuts, dead,
    motion: { perSecond: perSec, mean: +mean.toFixed(2), contrast: +(sd / (mean + 1e-6)).toFixed(2) },
    opening, flatFilm, firstFrame,
    loop: { firstLastDiff: loopGap, seamless: loopGap < 1.5, checked: loop },
  };
}

export function report(r) {
  const lines = [`${r.file}  ${r.width}×${r.height}  ${r.fps.toFixed(2)} fps  ${r.duration.toFixed(2)} s`];
  lines.push(r.pops.length ? `✗ ${r.pops.length} single-frame pop(s): ${r.pops.slice(0, 12).map((p) => p.at + 's').join(', ')} — look at these frames (om look <dir> --at …); usually an element shown one frame early or a fromTo rendering its start state` : '✓ no single-frame pops');
  lines.push(r.dead.length ? `${r.dead.some((x) => x.seconds > 2) ? '✗' : '·'} still for ≥1 s: ${r.dead.map((x) => `${x.from}–${x.to}s`).join(', ')} — fine for a reading hold or an end card, dead time anywhere else` : '✓ no stretch of ≥1 s without motion');
  lines.push(`· ${r.cuts.length} hard cut(s)${r.cuts.length ? ': ' + r.cuts.slice(0, 20).join(', ') + 's' : ''}  (average shot ${(r.duration / (r.cuts.length + 1)).toFixed(1)} s)`);
  lines.push(`· motion per second: ${r.motion.perSecond.join(' ')}  (contrast ${r.motion.contrast}${r.motion.contrast < 0.35 ? ' — very even: the film may feel flat; give it fast and slow moments' : ''})`);
  if (r.firstFrame && r.firstFrame.empty) lines.push(`✗ frame 0 is nearly empty — it is the poster feeds, players and README GIFs show before the film plays${r.firstFrame.contentAt != null ? `; the frame fills at ${r.firstFrame.contentAt}s` : ''}. Open on the subject already in frame (in motion), not on a blank, a black or a lone small mark the film builds from`);
  if (r.opening && r.opening.flat) lines.push(`✗ flat opening: the strongest second of the first 5 s moves ${r.opening.peak}${r.opening.still.length ? `, still ${r.opening.still.map((x) => `${x.from}–${x.to}s`).join(', ')}` : ''} — films people kept peaked at 2–24 (median ~6) there with no still stretch over 1 s. Open on a big move (a push, a whip, a flood, the result slammed in) and land the first burst before 5 s, unless the brief asked for calm`);
  if (r.flatFilm) lines.push(`✗ the whole film barely moves (mean ${r.motion.mean}, ${r.cuts.length} cuts) — it reads as slides. Films people kept averaged 0.85–5.8: cut, change shot scale, bring in a montage burst (rhythm.md)`);
  if (r.loop.checked) lines.push(r.loop.seamless ? `✓ last frame matches the first (diff ${r.loop.firstLastDiff}) — loops cleanly` : `✗ last frame differs from the first (diff ${r.loop.firstLastDiff}) — it will stutter as a loop`);
  return lines.join('\n');
}

// om qa --sheet — the whole film as a few pictures: frames at a steady rate, tiled left to right, top to
// bottom. Looking at one still per scene finds layout faults; looking at every quarter second finds what a
// viewer feels: a stretch where neighbouring tiles are the same picture (dead), a run of scenes that are all
// the same picture with different content (slides), the one frame where something is half-way and ugly.
export function sheet(file, outDir, { fps = 4, cols = 6, rows = 6, width = 384 } = {}) {
  if (!existsSync(file)) throw new OmError(`no such video: ${file}`);
  const p = probe(file), per = cols * rows, stem = basename(file).replace(/\.[^.]+$/, '');
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (f.startsWith(`${stem}-sheet`)) unlinkSync(join(outDir, f));
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `fps=${fps},scale=${width}:-2,tile=${cols}x${rows}`, join(outDir, `${stem}-sheet%d.jpg`)]);
  if (r.status !== 0) throw new OmError(`ffmpeg could not tile ${file}`);
  const files = readdirSync(outDir).filter((f) => f.startsWith(`${stem}-sheet`)).sort((a, b) => parseInt(a.split('sheet').pop(), 10) - parseInt(b.split('sheet').pop(), 10)).map((f) => join(outDir, f));
  return { files, fps, cols, rows, sheets: files.map((f, i) => ({ file: f, from: i * per / fps, to: Math.min(p.duration, (i + 1) * per / fps) })) };
}

export function sheetReport(s) {
  return [`sheets   ${s.fps} frames a second, read left to right; one row is ${(s.cols / s.fps).toFixed(2)} s`,
    ...s.sheets.map((x) => `         ${x.from.toFixed(1)}–${x.to.toFixed(1)} s  ${x.file}`),
    '         look for: neighbouring tiles that are the same picture (dead), scenes that are the same layout with other content (slides), a tile caught half-way that is ugly'].join('\n');
}
