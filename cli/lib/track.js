// External music — a track someone else made (the user's own, one an AI tool generated, one from `om music`)
// used as the film's music bed instead of the synthesized one.
//   planTrack(analysis, …)   which part of the file plays when: start offset, bar-line loops with crossfades when the
//                            track is shorter than the film, a bar-aligned fade-out at the end; and the track's beats,
//                            downbeats, sections and drops in FILM time (what OM.beat / OM.downbeat / OM.drop read)
//   renderTrack(pcm, plan, …) the audio of that plan
//   the project side         assets/music/<file>, the OM.music({ src }) declaration, <script id="om-beats"> (the
//                            film-time beat map the runtime reads; assets/music.beats.json is the same data to look at)
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeFile, decode } from './beats.js';
import { RATE } from './dsp.js';
import { arrangeTrack, measureArrangement, scaleAnalysis, stretchRatio } from './arrange.js';
import { plate } from './fx.js';
import { OmError, readSource, writeSource } from './project.js';

const r3 = (x) => Math.round(x * 1000) / 1000;
const S = (sec) => Math.round(sec * RATE); // samples, 0 and negatives allowed (dsp.js N() is at least 1)
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const PKG = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LOW_CONFIDENCE = 0.3; // beats.js: below this the pulse is a guess
export const CUT_TOLERANCE = 0.08; // seconds: a scene cut further than this from a beat reads as late or early

// ---------- analysis, cached ----------

const CODE = createHash('sha256').update(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'beats.js'))).digest('hex').slice(0, 12);
export const fileHash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

// beats.js on `file`, remembered in `cacheDir` by the file's content and the analyzer's code.
export function analyzeCached(file, cacheDir, { bpm = null } = {}) {
  const key = `${fileHash(file)}-${CODE}${bpm ? `-bpm${bpm}` : ''}`, cache = cacheDir && join(cacheDir, `${key}.json`);
  if (cache && existsSync(cache)) { try { return JSON.parse(readFileSync(cache, 'utf8')); } catch { /* analyse again */ } }
  const analysis = analyzeFile(file, bpm ? { bpm } : undefined);
  if (cache) { mkdirSync(cacheDir, { recursive: true }); writeFileSync(cache, JSON.stringify(analysis)); }
  return analysis;
}

// ---------- the plan ----------

// A regular grid at `bpm` through the detected downbeat (the user knows the tempo better than the tracker does).
function regrid(an, bpm, end) {
  const P = 60 / bpm, anchor = an.downbeats[0] ?? an.beats[0] ?? 0, beats = [], downbeats = [];
  for (let k = Math.ceil(-anchor / P); anchor + k * P <= end + 1e-9; k++) {
    const t = anchor + k * P;
    beats.push(t);
    if (((k % 4) + 4) % 4 === 0) downbeats.push(t);
  }
  return { beats, downbeats };
}

// analysis: beats.js output for the whole file. Options:
//   start     seconds into the file where the music begins under the film's first frame
//   bpm       override: the tempo is this, on the detected downbeat (a track whose tempo you know)
//   duration  length of the film
//   fade      length of the closing fade-out (default: two beats, 1–1.5 s)
//   tail      seconds of the beat map kept past the end of the film (default 10)
export function planTrack(an, o = {}) {
  // With the decoded audio (`pcm`, at the stretch the plan will play at) every candidate arrangement is rendered and measured, and one that has a
  // loudness jump over 6 dB within half a second that the track does not make itself is refused for the next candidate: a hard veto, not a warning.
  if (!o.pcm || !o.film || o.arrange === 'off') return planOne(an, o);
  const tries = o.maxTries || 30;
  for (let k = 0; k < tries; k++) {
    const plan = planOne(an, { ...o, pick: k });
    if (!plan.arrange) { if (k === 0 || !plan.arrangeNote?.startsWith('no more')) return plan; break; }
    if (!measureArrangement(renderTrack(o.pcm, plan), plan).jumps.length) { plan.vetoed = k; return plan; }
  }
  const plan = planOne(an, { ...o, arrange: 'off' });
  plan.arrangeNote = 'every candidate arrangement has a loudness jump of more than 6 dB that the track does not make itself, so the track is cut straight';
  return plan;
}
function planOne(an, { start = 0, bpm = null, duration, fade = null, tail = 10, film = null, arrange = 'auto', only = null, pick = 0 } = {}) {
  if (!(duration > 0)) throw new OmError('planTrack needs the film duration');
  const fileEnd = Math.min(an.end || an.duration, an.duration);
  // a tempo given by the user was already fitted by the analysis (phase and the last percent of the period); a plain number
  // over an analysis made without it is laid on the detected bar line
  const fitted = !!an.fit?.forcedBpm, override = bpm > 0 && !fitted && Math.abs(bpm - an.bpm) > 0.05;
  const grid = override ? regrid(an, bpm, fileEnd) : { beats: an.beats, downbeats: an.downbeats };
  const usable = (bpm > 0) || (an.confidence >= LOW_CONFIDENCE && grid.beats.length >= 4);
  const tempo = override ? bpm : an.bpm, beatLen = 60 / tempo, bar = 4 * beatLen;
  const s = clamp(Number(start) || 0, 0, Math.max(0, fileEnd - 1));
  const A = fileEnd - s;
  const segs = []; // { out, from, len, xin, xout }: file [from, from+len) plays at film time `out`; xin/xout: crossfade lengths, centred on the join
  let looped = false;

  if (A >= duration - 0.05) {
    segs.push({ out: 0, from: s, len: A, xin: 0, xout: 0 });
  } else {
    looped = true;
    let ls = s, le = fileEnd, X = 1.5;
    if (usable) {
      const db = grid.downbeats.filter((t) => t >= s - 0.02 && t <= fileEnd - 0.05);
      // a quiet last section (an outro, a fade) is not part of the loop
      const last = an.sections?.at(-1);
      let hi = db.length - 1;
      if (last && last.energy < 0.5 && an.sections.length > 1) { const j = db.findLastIndex((t) => t <= last.start + 0.05); if (j >= 2) hi = j; }
      if (hi >= 2 && db[hi] - db[0] >= 2 * bar - 0.1) { ls = db[0]; le = db[hi]; X = clamp(beatLen, 0.25, 0.75); }
    }
    const body = le - ls, first = le - s;
    segs.push({ out: 0, from: s, len: first, xin: 0, xout: X });
    for (let o = first; o < duration + tail; o += body) segs.push({ out: o, from: ls, len: body, xin: X, xout: X });
    segs.at(-1).xout = 0;
  }

  // re-cut to the film's shape (arrange.js): whole bars, joined on bar lines. When it cannot, the straight cut above stays and says why.
  let arr = null, arrangeNote = null;
  if (arrange === 'off') arrangeNote = null;
  else if (!film) arrangeNote = null;
  else if (!usable) arrangeNote = 'no clear pulse: bars cannot be told apart';
  else if (override) arrangeNote = 'the tempo was set by hand over a grid the bar map was not made on';
  else { const r = arrangeTrack(an, { duration, film, fade, tail, only, pick }); if (r.ok) arr = r; else arrangeNote = r.reason; }
  if (arr) { segs.length = 0; segs.push(...arr.segs); looped = false; }

  // the track's own map, carried into film time through the segments
  const mapT = (t, seg) => seg.out + (t - seg.from);
  const within = (t, seg) => t >= seg.from - 1e-9 && t < seg.from + seg.len - 1e-9 && mapT(t, seg) <= duration + tail;
  const carry = (list) => segs.flatMap((seg) => list.filter((t) => within(t, seg)).map((t) => mapT(t, seg)));
  const beats = carry(grid.beats).filter((t) => t >= -0.02), downbeats = carry(grid.downbeats).filter((t) => t >= -0.02);
  const sections = [];
  for (const seg of segs) for (const sec of an.sections || []) {
    const a = Math.max(sec.start, seg.from), b = Math.min(sec.end, seg.from + seg.len);
    if (b - a < 0.05 || mapT(a, seg) > duration + tail) continue;
    const prev = sections.at(-1), o = { start: mapT(a, seg), end: mapT(b, seg), energy: sec.energy };
    if (prev && Math.abs(prev.end - o.start) < 1e-6 && Math.abs(prev.energy - o.energy) < 1e-3) prev.end = o.end; else sections.push(o);
  }
  const drops = segs.flatMap((seg) => (an.drops || []).filter((d) => within(d.t, seg) && mapT(d.t, seg) >= 0.1).map((d) => ({ t: mapT(d.t, seg), score: d.score })))
    .sort((a, b) => b.score - a.score || a.t - b.t).slice(0, 6);

  // the end: the fade starts on the last bar line that leaves it room, and is over when the film is
  const f = fade > 0 ? Number(fade) : clamp(2 * beatLen, 1, 1.5);
  let fadeFrom = Math.max(0, duration - f);
  if (usable) {
    const c = downbeats.filter((t) => t <= duration - f + 1e-9 && duration - t <= 2.5 * f);
    if (c.length) fadeFrom = c.at(-1);
  }
  if (arr) fadeFrom = arr.fadeFrom;
  return { segs, beats, downbeats, sections, drops, bpm: tempo, confidence: an.confidence, usable, looped, overridden: override || fitted, start: arr ? segs[0].from : s, duration, fade: { from: fadeFrom, len: duration - fadeFrom }, arrange: arr, arrangeNote, duck: arr?.duck || null, button: arr?.button || null, fileEnd: Math.min(an.end || an.duration, an.duration) };
}

// ---------- the audio ----------

// pcm: { L, R } at RATE (beats.js decode). Returns { L, R } of N(duration) samples: the segments laid out with
// equal-power crossfades at the joins, a 10 ms fade-in, the closing fade-out.
export function renderTrack(pcm, plan) {
  const n = S(plan.duration), L = new Float32Array(n), R = new Float32Array(n), fileN = plan.fileEnd ? S(plan.fileEnd) : pcm.L.length;
  for (const seg of plan.segs) {
    const gainLin = Math.pow(10, (seg.gain || 0) / 20), pin = seg.pin || 0, a = S(seg.out - seg.xin / 2 - pin), from = S(seg.from - seg.xin / 2 - pin), len = S(seg.len + seg.xin / 2 + seg.xout / 2 + pin);
    const nin = S(seg.xin || pin), nout = S(seg.xout), pout = S(seg.pout || 0), outAt = len - nout;
    for (let i = 0; i < len; i++) {
      const o = a + i, f = from + i;
      if (o < 0 || o >= n || f < 0 || f >= pcm.L.length || (plan.fileEnd && f >= fileN)) continue; // nothing after the music's end (a spoken label, silence) is ever played
      let g = 1;
      if (nin && i < nin) g = Math.sin((Math.PI / 2) * (i / nin));
      if (nout && i >= outAt) g = Math.min(g, Math.cos((Math.PI / 2) * ((i - outAt) / nout)));
      if (pout && i >= len - pout) g = Math.min(g, Math.cos((Math.PI / 2) * ((i - (len - pout)) / pout))); // ends at the join, the next bar's pre-roll fades in under it
      g *= gainLin; L[o] += pcm.L[f] * g; R[o] += pcm.R[f] * g;
    }
  }
  if (plan.button) { // a button ending: the hit, then its own reverb tail to the last frame (no more of the track plays)
    const b = plan.button, a0 = S(b.at), hn = S(b.hitLen), tn = Math.min(n - a0, S(b.tail));
    const hl = new Float32Array(tn), hr = new Float32Array(tn), fadeN = S(0.05);
    for (let i = 0; i < Math.min(hn, tn); i++) { const g = i > hn - fadeN ? Math.max(0, (hn - i) / fadeN) : 1; hl[i] = L[a0 + i] * g; hr[i] = R[a0 + i] * g; }
    plate(hl, hr, { preset: 'hall', decay: Math.max(1.2, Math.min(3, b.decay)), wet: 0.5, damp: 0.35 });
    for (let i = 0; i < tn; i++) { const rel = i / RATE - b.hitLen, g = rel > 0 ? Math.pow(10, (-2 * rel) / Math.max(0.5, b.tail - b.hitLen)) * Math.min(1, (b.tail - i / RATE) / 0.03) : 1; L[a0 + i] = hl[i] * g; R[a0 + i] = hr[i] * g; }
  }
  const lead = S(0.01), fa = S(plan.fade.from), fl = Math.max(1, n - fa), d = plan.duck;
  for (let i = 0; i < n; i++) {
    let g = i < lead ? i / lead : 1;
    if (i >= fa) { const u = (i - fa) / fl; g *= 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, u)); }
    if (d) { // the stop: down by d.db over rampIn, held, back over rampOut so the music is whole again at d.to
      const t = i / RATE, depth = 1 - Math.pow(10, d.db / 20), up = d.to - d.rampOut;
      const w = t < d.from ? 0 : t < d.from + d.rampIn ? (t - d.from) / d.rampIn : t < up ? 1 : t < d.to ? (d.to - t) / d.rampOut : 0;
      g *= 1 - depth * w;
    }
    L[i] *= g; R[i] *= g;
  }
  return { L, R };
}

// ---------- the map the film reads ----------

export function beatsData(plan, { src, name = null } = {}) {
  const a = (xs) => xs.map(r3);
  return {
    version: 1, src, ...(name ? { name } : {}), start: r3(plan.start), bpm: Math.round(plan.bpm * 100) / 100, confidence: plan.confidence, usable: plan.usable,
    looped: plan.looped, ...(plan.arrange ? { arranged: true, arrange: { score: plan.arrange.score, pickup: r3(plan.arrange.pickup), steps: plan.arrange.steps.map((x) => [x.film, x.bar]), joins: plan.arrange.joins.map((j) => [j.at, j.from, j.to, j.score]), ending: plan.arrange.ending } } : {}), ...(plan.stretch && plan.stretch !== 1 ? { stretch: Math.round(plan.stretch * 10000) / 10000 } : {}), duration: r3(plan.duration),
    beats: a(plan.beats), downbeats: a(plan.downbeats),
    sections: plan.sections.map((s) => ({ start: r3(s.start), end: r3(s.end), energy: s.energy })),
    drops: plan.drops.map((d) => ({ t: r3(d.t), score: d.score })),
  };
}

// Scene cuts against the track's beats. cuts: [{ name, t }]. Returns null when the pulse cannot be judged.
export function cutAlignment(cuts, data, tol = CUT_TOLERANCE) {
  if (!data?.usable || !data.beats?.length) return null;
  return cuts.filter((c) => c.t > 0.15 && c.t < data.duration - 0.1).map((c) => {
    let best = Infinity;
    for (const b of data.beats) { const d = c.t - b; if (Math.abs(d) < Math.abs(best)) best = d; if (b > c.t + 1) break; }
    return { name: c.name, t: c.t, off: Math.round(best * 1000), ok: Math.abs(best) <= tol };
  });
}

// ---------- index.html ----------

const BEATS = /<script\b[^>]*\sid\s*=\s*["']om-beats["'][^>]*>[\s\S]*?<\/script>/i;
const commentRanges = (html) => [...html.matchAll(/<!--[\s\S]*?-->/g)].map((m) => [m.index, m.index + m[0].length]);
const inComment = (ranges, i) => ranges.some(([a, b]) => i >= a && i < b);
export const beatsTag = (data) => `<script type="application/json" id="om-beats">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
export const readBeatsTag = (html) => { const c = commentRanges(html); for (const m of html.matchAll(new RegExp(BEATS.source, 'gi'))) if (!inComment(c, m.index)) return m[0]; return null; };

// Put (or replace, or with null remove) the beat map. Placed before the first script, so OM.beat finds it while the timeline is built.
export function applyBeats(html, data) {
  const old = readBeatsTag(html);
  if (!data) return old ? html.replace(old, '').replace(/\n[ \t]*\n/, '\n') : html;
  const tag = beatsTag(data);
  if (old) return html.replace(old, () => tag);
  const c = commentRanges(html);
  const at = [...html.matchAll(/<script\b/gi)].find((m) => !inComment(c, m.index))?.index ?? html.search(/<\/head>/i);
  if (at < 0) throw new OmError('index.html has no <script> or </head> to put the beat map before');
  return html.slice(0, at) + tag + '\n' + html.slice(at);
}

// The OM.music({ … }) calls of the page, as source text: [{ start, end }] of each call's object literal.
function musicCalls(html) {
  const c = commentRanges(html), out = [];
  for (const m of html.matchAll(/OM\.music\s*\(\s*\{/g)) {
    if (inComment(c, m.index)) continue;
    const lineStart = html.lastIndexOf('\n', m.index) + 1;
    if (/\/\//.test(html.slice(lineStart, m.index))) continue;
    const open = m.index + m[0].length - 1;
    let depth = 0, q = null, i = open;
    for (; i < html.length; i++) {
      const ch = html[i];
      if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') q = ch;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) break;
    }
    out.push({ start: open, end: i + 1 });
  }
  return out;
}

// What the page text says about its external music (before it is run): { src, start, bpm } or null.
export function readMusicDecl(html) {
  for (const { start, end } of musicCalls(html)) {
    const body = html.slice(start, end), src = /(?:^|[{,\s])src\s*:\s*(['"`])([^'"`]+)\1/.exec(body);
    if (src) return { src: src[2] };
  }
  return null;
}

const jsString = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
function setKey(obj, key, value) {
  const re = new RegExp(`((?:^|[{,\\s])${key}\\s*:\\s*)('[^']*'|"[^"]*"|\`[^\`]*\`|[^,}]+?)(\\s*(?:[,}]))`);
  if (re.test(obj)) return obj.replace(re, (_, a, _v, z) => a + value + z);
  if (/^\{\s*\}$/.test(obj)) return `{ ${key}: ${value} }`;
  return obj.replace(/^\{\s*/, () => `{ ${key}: ${value}, `);
}

// Declare the external music in index.html: update the first OM.music({ … }) object, or add `OM.music({ src })`
// (and vendor/om.js when the page does not load it yet). start / bpm are only written when given.
export function setMusicDecl(html, { src, start = null, bpm = null, name = null, arrange = null, stretch = null }, root = null) {
  const set = { src: jsString(src), ...(arrange ? { arrange: jsString(arrange) } : {}), ...(stretch != null ? { stretch: String(Number(stretch)) } : {}), ...(name ? { name: jsString(name) } : {}), ...(start != null ? { start: String(Number(start)) } : {}), ...(bpm != null ? { bpm: String(Number(bpm)) } : {}) };
  const calls = musicCalls(html);
  if (calls.length) {
    const c = calls[0];
    let body = html.slice(c.start, c.end);
    for (const [k, v] of Object.entries(set)) body = setKey(body, k, v);
    return html.slice(0, c.start) + body + html.slice(c.end);
  }
  const ranges = commentRanges(html);
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].filter((m) => !inComment(ranges, m.index));
  const inline = scripts.find((m) => !/\ssrc\s*=/.test(m[1]) && !/\stype\s*=\s*["'](?!text\/javascript|module)/i.test(m[1]));
  if (!inline) throw new OmError('index.html has no inline <script> to declare the music in — add OM.music({ src: \'assets/music/…\' }) yourself');
  const stmt = `OM.music({ ${Object.entries(set).map(([k, v]) => `${k}: ${v}`).join(', ')} });\n`;
  const at = inline.index + inline[0].length + (html[inline.index + inline[0].length] === '\n' ? 1 : 0);
  let out = html.slice(0, at) + (at === inline.index + inline[0].length ? '\n' : '') + stmt + html.slice(at);
  if (!scripts.some((m) => /\ssrc\s*=\s*["'][^"']*om\.js["']/.test(m[1]))) {
    out = out.slice(0, inline.index) + '<script src="vendor/om.js"></script>\n' + out.slice(inline.index);
    if (root) { const to = join(root, 'vendor', 'om.js'); if (!existsSync(to)) { mkdirSync(dirname(to), { recursive: true }); copyFileSync(join(PKG, 'runtime', 'om.js'), to); } }
  }
  return out;
}

// Copy `file` into the project's assets/music/ (kept when it is already there) and declare it. Returns the
// project-relative path. `credit`: a line for assets/music/CREDITS.md (licences that ask for attribution).
export function attachMusic(project, file, { start = null, bpm = null, name: title = null, credit = null, arrange = null, stretch = null } = {}) {
  const abs = resolve(file);
  if (!existsSync(abs)) throw new OmError(`no such music file: ${abs}`);
  const dir = join(project.root, 'assets', 'music');
  mkdirSync(dir, { recursive: true });
  const ext = extname(abs).toLowerCase(), stem = basename(abs, extname(abs)).replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'music';
  const inside = relative(dir, abs);
  let name = inside && !inside.startsWith('..') && !inside.includes('/') && !inside.includes('\\') ? basename(abs) : null;
  if (!name) {
    const want = fileHash(abs);
    for (let n = 1; ; n++) {
      name = `${stem}${n > 1 ? `-${n}` : ''}${ext}`;
      const to = join(dir, name);
      if (!existsSync(to)) { copyFileSync(abs, to); break; }
      if (fileHash(to) === want) break; // the same file is already there
    }
  }
  const rel = `assets/music/${name}`;
  const { html, token } = readSource(project);
  const out = setMusicDecl(html, { src: rel, start, bpm, name: title, arrange, stretch }, project.root);
  if (out !== html) writeSource(project, out, token, 'om sound --music');
  if (credit) {
    const f = join(dir, 'CREDITS.md'), cur = existsSync(f) ? readFileSync(f, 'utf8') : '';
    const line = `- ${name}: ${credit}`;
    if (!cur.includes(line)) writeFileSync(f, (cur && !cur.endsWith('\n') ? cur + '\n' : cur || '# Music credits\n\n') + line + '\n');
  }
  return rel;
}

// What `om sound` knows about the declared music: the file, its analysis and the plan for this film length.
export function loadExternal(project, decl, duration, film = null) {
  const file = resolve(project.root, decl.src);
  if (!existsSync(file)) throw new OmError(`OM.music({ src: '${decl.src}' }): no such file in the project — put the track in assets/music/ (om sound --music <file> does it)`);
  if (relative(project.root, file).startsWith('..')) throw new OmError(`OM.music({ src: '${decl.src}' }) points outside the project — copy the track into assets/music/ so the film can be reproduced (om sound --music <file> does it)`);
  const bpm = Number(decl.bpm) > 0 ? Number(decl.bpm) : null;
  const an0 = analyzeCached(file, join(project.om, 'music'), { bpm });
  // OM.music({ stretch: bpm }): play the track at the film's own tempo when it is within 3 % (a time-stretch, pitch kept)
  let sr = decl.stretch === 'fit' ? { ratio: 1, note: null } : stretchRatio(an0.bpm, Number(decl.stretch));
  let an = scaleAnalysis(an0, sr.ratio);
  // an explicit `start` is a straight cut unless arrange: 'auto' is also written
  const mode = decl.arrange === 'off' || decl.arrange === false ? 'off' : decl.arrange == null && decl.start != null ? 'off' : 'auto';
  const pcmAt = (ratio) => (mode === 'off' ? null : decode(file, RATE, ratio));
  const plan = planTrack(an, { start: Number(decl.start) || 0, bpm, duration, fade: decl.fade, film: { labels: film?.labels || {}, music: decl }, arrange: mode, pcm: pcmAt(sr.ratio) });
  plan.stretch = sr.ratio; plan.stretchNote = sr.note;
  if (decl.stretch === 'fit' && plan.arrange && Math.abs(plan.arrange.slack) > 0.02 && plan.arrange.endingKind === 'natural') {
    // E: the last fraction of a bar: bend the track up to 3 % so the music's own end lands on the film's last frame
    const used = duration - plan.arrange.slack, ratio = used / duration; // playing at `ratio` makes the arranged length duration
    const fit = stretchRatio(an0.bpm, an0.bpm * ratio);
    if (fit.ratio !== 1) { sr = fit; an = scaleAnalysis(an0, sr.ratio); const p2 = planTrack(an, { start: Number(decl.start) || 0, bpm, duration, fade: decl.fade, film: { labels: film?.labels || {}, music: decl }, arrange: mode, pcm: pcmAt(sr.ratio) }); Object.assign(plan, p2); plan.stretch = sr.ratio; plan.stretchNote = `micro stretch ${((sr.ratio - 1) * 100).toFixed(2)} % absorbs ${Math.abs(plan.arrange?.slack ?? 0) < 0.05 ? 'the slack' : 'most of the slack'}`; }
    else plan.stretchNote = fit.note || `stretch: 'fit' would need ${((ratio - 1) * 100).toFixed(1)} %, over the 3 % limit`;
  }
  const name = decl.name || basename(file, extname(file));
  return { file, an, plan, name, decl, mode, data: beatsData(plan, { src: decl.src, name }) };
}
