// om check: what can go wrong in a composition before it is rendered. Two layers:
//   source   reads index.html without a browser (milliseconds): structure, scripts that do not parse, variables,
//            files that are not there, motion that is not a function of time, layout properties being tweened
//   page     opens the film in Chrome and samples frames: page errors, length bookkeeping, text that is cut off,
//            covered or unreadable, blank first/last frames, and whether a frame depends on what was played before it
// Errors stop a render from being right; warnings are things to look at. Layout findings can be waived per element
// with data-layout-allow-occlusion, data-layout-allow-overflow and data-layout-allow-overlap.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { openFilm } from './capture.js';
import { isHdr, probeVideo } from './frames.js';
import { OmError, readSource, readVariables } from './project.js';
import { CUT_TOLERANCE, cutAlignment } from './track.js';

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded', '-apple-system', 'blinkmacsystemfont', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert', 'none']);

export function checkSource(project) {
  const found = [];
  const { html } = readSource(project);
  const lineOf = (i) => html.slice(0, i).split('\n').length;
  const add = (level, code, message, index) => found.push({ level, code, message, ...(index != null ? { line: lineOf(index) } : {}) });
  const noComments = html.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));

  // one composition at the root
  const roots = readdirSync(project.root).filter((n) => /\.html?$/i.test(n) && statSync(join(project.root, n)).isFile() && /\sdata-composition-id\s*=/.test(readFileSync(join(project.root, n), 'utf8')));
  if (roots.length > 1) add('error', 'several-compositions', `${roots.join(', ')} are all compositions — keep one index.html at the root and move drafts into a subfolder (tools/)`);
  const root = /<[a-z][\w-]*\b[^>]*\sdata-composition-id\s*=\s*["']([^"']*)["'][^>]*>/i.exec(noComments);
  if (!root) add('error', 'no-root', 'no element with data-composition-id — the root of the film needs data-composition-id, data-width and data-height');
  else for (const a of ['width', 'height']) if (!new RegExp(`\\sdata-${a}\\s*=\\s*["']?\\d+`).test(root[0])) add('error', 'root-size', `the root element has no data-${a}`, root.index);

  // variables and what binds to them
  let vars = [];
  try { vars = readVariables(html); } catch (e) { add('error', 'variables', e.message); }
  const ids = new Set(vars.map((v) => v.id));
  vars.forEach((v, i) => { if (!v || v.id == null || !v.type) add('error', 'variables', `variable ${i + 1} needs an id and a type`); });
  for (const m of noComments.matchAll(/\sdata-var-(text|src)\s*=\s*["']([^"']+)["']/g)) if (!ids.has(m[2])) add('error', 'unknown-variable', `data-var-${m[1]}="${m[2]}" — no such variable in data-composition-variables`, m.index);

  // scripts: syntax, and motion that is not a function of time
  const scripts = [...noComments.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const m of scripts) {
    const type = (/\stype\s*=\s*["']?([^"'\s>]+)/i.exec(m[1])?.[1] || '').toLowerCase();
    const src = /\ssrc\s*=\s*["']([^"']+)["']/i.exec(m[1])?.[1];
    if (src) continue; // a file: checked with the other assets below
    if (!['', 'text/javascript', 'application/javascript'].includes(type)) continue; // om-score, JSON, modules
    const code = m[2], at = m.index + m[0].indexOf('>') + 1;
    try { new vm.Script(code, { filename: 'index.html', lineOffset: lineOf(at) - 1 }); } catch (e) {
      const line = /index\.html:(\d+)/.exec(e.stack || '')?.[1];
      add('error', 'script-syntax', `a script does not parse: ${e.message}${line ? ` (line ${line})` : ''}`, line ? undefined : at);
      if (line) found[found.length - 1].line = Number(line);
    }
    const rules = [
      [/\bMath\.random\s*\(/g, 'random', 'Math.random() gives a different film every render — use OM.random(seed)'],
      [/\bDate\.now\s*\(|\bnew Date\s*\(|\bperformance\.now\s*\(/g, 'clock', 'reads the wall clock — every frame must be a function of the timeline time'],
      [/\brepeat\s*:\s*-1\b/g, 'infinite-repeat', 'repeat: -1 never ends — the timeline has no length; repeat a fixed number of times'],
      [/\brequestAnimationFrame\s*\(/g, 'raf', 'requestAnimationFrame runs on the clock, not the timeline — drive canvas drawing with OM.clock(tl, draw, duration)'],
      [/\bsetInterval\s*\(/g, 'interval', 'setInterval runs on the clock, not the timeline'],
    ];
    for (const [re, code2, msg] of rules) for (const x of code.matchAll(re)) add('warning', code2, msg, at + x.index);
    for (const call of tweenCalls(code)) {
      const keys = [...call.text.matchAll(/(?:^|[{,]\s*)(left|top|right|bottom|width|height|margin(?:Left|Top|Right|Bottom)?|padding(?:Left|Top|Right|Bottom)?)\s*:/g)].map((k) => k[1]);
      // position tweens always have a transform equivalent; a size tween (a progress bar's width) sometimes is the intent
      for (const k of new Set(keys)) add(/^(width|height)$/.test(k) ? 'warning' : 'error', 'layout-motion', `a tween animates "${k}" — animate x, y, scale${/^(width|height)$/.test(k) ? 'X/scaleY' : ''} (transforms) instead: layout motion re-flows the page every frame and jitters`, at + call.index);
    }
  }

  // styles: transitions the timeline cannot drive
  for (const m of noComments.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const at = m.index + m[0].indexOf('>') + 1;
    for (const x of m[1].matchAll(/(?:^|[;{\s])transition\s*:\s*(?!none\b)[^;}]+/g)) add('warning', 'css-transition', 'a CSS transition runs on the clock and a seek does not move it — tween the property on the timeline', at + x.index);
  }

  // files that must be there
  const local = (ref) => ref && !/^(data:|blob:|https?:|about:|#|%23|mailto:|javascript:)/i.test(ref) && !/\$\{|\+/.test(ref);
  const refs = [
    ...[...noComments.matchAll(/\s(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi)].map((m) => [m[1], m.index]),
    ...[...noComments.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((m) => [m[1], m.index]),
  ];
  const seen = new Set();
  for (const [ref, i] of refs) {
    if (!local(ref) || /<a\s[^>]*$/i.test(noComments.slice(Math.max(0, i - 200), i))) continue;
    let clean = ref.split(/[?#]/)[0];
    try { clean = decodeURIComponent(clean); } catch { /* a literal % in the name */ }
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    const file = isAbsolute(clean) ? clean : resolve(project.root, clean);
    if (relative(project.root, file).startsWith('..')) add('error', 'outside-project', `${ref} is outside the project folder — copy it into assets/ (an export or another machine will not have it)`, i);
    else if (!existsSync(file)) add('error', 'missing-file', `${ref} does not exist`, i);
  }

  // media
  const idCount = new Map();
  for (const m of noComments.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)) idCount.set(m[1], (idCount.get(m[1]) || 0) + 1);
  for (const [id, n] of idCount) if (n > 1 && !/\$\{/.test(id)) add('error', 'duplicate-id', `id "${id}" is used ${n} times`);
  for (const m of noComments.matchAll(/<video\b([^>]*)>/gi)) {
    if (!/\s(src|data-om-src)\s*=/.test(m[1]) && !/<source\b/i.test(noComments.slice(m.index, m.index + 400))) add('error', 'video-src', 'a <video> has no src', m.index);
    if (!/\smuted\b/.test(m[1])) add('warning', 'video-sound', 'a <video> without muted: its own sound goes into the film', m.index);
  }

  // typefaces: a family that is not shipped with the film looks different on another machine
  const faces = new Set([...noComments.matchAll(/@font-face\s*{[^}]*font-family\s*:\s*["']?([^;"'}]+)/gi)].map((m) => m[1].trim().toLowerCase()));
  const stacks = [
    ...[...noComments.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].flatMap((m) => [...m[1].matchAll(/font-family\s*:\s*([^;}]+)/gi)].map((x) => [x[1], m.index + m[0].indexOf('>') + 1 + x.index])),
    ...[...noComments.matchAll(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi)].flatMap((m) => [...m[2].matchAll(/font-family\s*:\s*([^;]+)/gi)].map((x) => [x[1].replace(/&quot;/g, '"'), m.index])),
  ];
  const warned = new Set();
  for (const [stack, i] of stacks) {
    // the first family that is not a generic keyword is the one this machine uses; it should travel with the film
    const first = stack.split(',').map((f) => f.trim().replace(/^["']|["']$/g, '').replace(/\s*!important$/, '')).find((f) => f && !/^var\(/.test(f) && !GENERIC.has(f.toLowerCase()));
    if (!first || faces.has(first.toLowerCase()) || warned.has(first.toLowerCase())) continue;
    warned.add(first.toLowerCase());
    add('warning', 'font-not-shipped', `font-family "${first}" has no @font-face in the film — it renders only where that font is installed (om fonts add)`, i);
  }
  // A film about a product is made of the product: its logo as a file, its real interface, its pictures. A composition
  // that loads no image, video or logo file at all drew everything itself (the grey-box UI of one-line films, 2026-10).
  const media = [...html.matchAll(/(?:src|poster|href)\s*=\s*["'`]([^"'`]+\.(?:png|jpe?g|webp|gif|svg|avif|mp4|mov|webm))|url\(\s*["']?([^"')]+\.(?:png|jpe?g|webp|gif|svg|avif))|["'`]((?:\.\/)?(?:assets|materials|media|img|images)\/[^"'`]+\.(?:png|jpe?g|webp|gif|svg|avif|mp4|mov|webm))/gi)]
    .map((m) => m[1] || m[2] || m[3]).filter((u) => u && !/^data:|vendor\/|^om-/.test(u));
  for (const m of html.matchAll(/placehold\.co|placeholder\.com|via\.placeholder|dummyimage\.com|picsum\.photos|placekitten|fakeimg\.pl|\blorem ipsum\b/gi)) add('warning', 'placeholder', `"${m[0]}" is a placeholder — use real content: the product's own images and text, a real one found online, or an openly licensed image (source in materials.md)`, m.index);
  if (!media.length) add('warning', 'no-real-material', 'the film loads no image, video or logo file — if it is about a product, it is drawing the product instead of showing it. Collect the real material first (om grab <url|folder>) and build from it: the logo file, real screenshots or recordings, a rebuild only traced over a capture (SKILL.md step 1)');
  else if (media.every((u) => /icon|logo|favicon|wordmark|avatar/i.test(u))) add('warning', 'only-logo', `the only files the film loads are icons or logos (${[...new Set(media)].slice(0, 3).join(', ')}) — the interface and pictures are drawn, not shown. Use real screenshots or recordings of the product (om grab), or rebuild only over a capture`);
  else if (!existsSync(join(project.root, 'materials.md'))) add('warning', 'no-materials-list', 'no materials.md — list what the film is made of and where each piece came from (om grab writes it)');
  return found;
}

// The argument text of every .to( / .from( / .fromTo( call in a script (strings and nesting respected).
function tweenCalls(code) {
  const out = [];
  for (const m of code.matchAll(/(?<!\bArray)\.(to|from|fromTo|staggerTo|staggerFrom)\s*\(/g)) {
    let depth = 1, i = m.index + m[0].length, q = null;
    for (; i < code.length && depth; i++) {
      const c = code[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') q = c;
      else if (c === '(' || c === '{' || c === '[') depth++;
      else if (c === ')' || c === '}' || c === ']') depth--;
    }
    // only the vars objects: drop nested function bodies, which may set layout once on purpose
    const text = code.slice(m.index + m[0].length, i - 1).replace(/=>\s*\(?\s*{[\s\S]*?}\s*\)?|function\s*\([^)]*\)\s*{[\s\S]*?}/g, '');
    out.push({ index: m.index, text });
  }
  return out;
}

// ---------- page ----------
const LAYOUT = (t) => `(() => {
  const W = innerWidth, H = innerHeight, out = [], T = ${t};
  // what is moving at T: the targets of every tween running then (nested timelines included). An element is judged
  // only at rest — mid-fade contrast and a camera push that crops on purpose are not findings.
  const moving = new Set();
  const walk = (tl, off) => { for (const c of tl.getChildren(false, true, true)) { const s = off + c.startTime(), e = s + c.totalDuration() / (c.timeScale() || 1);
    if (c.getChildren) { if (s <= T + 1e-6 && e >= T - 1e-6) walk(c, s); } else if (s <= T + 1e-6 && e >= T - 1e-6) for (const x of c.targets()) if (x && x.nodeType === 1) moving.add(x); } };
  for (const tl of Object.values(window.__timelines || {})) if (tl && tl.getChildren) walk(tl, 0);
  const still = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) if (moving.has(e)) return false; return true; };
  const opacity = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const allow = (el, k) => !!el.closest('[data-layout-allow-' + k + ']');
  const visible = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false; } return true; };
  const name = (el) => (el.getAttribute('data-om-id') ? '[' + el.getAttribute('data-om-id') + ']' : el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/)[0] : ''));
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n; (n = walker.nextNode());) {
    const el = n.parentElement;
    // whitespace between tags is not text: it would judge the parent (or body) by all its children's text, hidden ones included
    if (!n.nodeValue.trim()) continue;
    // single letters are kinetic type (split, stacked, flown in): judged as a word, not one by one
    if (!el || seen.has(el) || el.textContent.trim().length < 3 || /^(SCRIPT|STYLE|NOSCRIPT|TITLE)$/.test(el.tagName)) continue;
    seen.add(el);
    if (!visible(el) || !still(el) || opacity(el) < 0.95) continue;
    const range = document.createRange(); range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const s = getComputedStyle(el);
    // a camera push (the text drawn larger than its layout size) crops on purpose: only contrast is judged then
    const box = el.getBoundingClientRect(), zoomed = el.offsetWidth > 0 && box.width / el.offsetWidth > 1.15;
    texts.push({ el, r, zoomed, name: name(el), text: el.textContent.trim().slice(0, 24), size: parseFloat(s.fontSize), bold: Number(s.fontWeight) >= 600 });
  }
  const style = document.createElement('style'); style.textContent = '*{pointer-events:auto!important}'; document.head.appendChild(style);
  for (const t of texts) {
    const { r, el } = t;
    if (t.zoomed) continue;
    if ((r.left < -2 || r.top < -2 || r.right > W + 2 || r.bottom > H + 2) && r.right > 0 && r.bottom > 0 && r.left < W && r.top < H && !allow(el, 'overflow')) out.push({ code: 'text-cut', message: t.name + ' "' + t.text + '" runs off the frame' });
    // clipped by an ancestor that hides overflow
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflow === 'visible' && s.clipPath === 'none') continue;
      const b = a.getBoundingClientRect();
      if (b.left <= 0 && b.top <= 0 && b.right >= W && b.bottom >= H) break; /* the frame itself: reported as text-cut */
      if (b.width > 0 && (r.left < b.left - 2 || r.right > b.right + 2 || r.top < b.top - 2 || r.bottom > b.bottom + 2) && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top && !allow(el, 'overflow')) { out.push({ code: 'text-clipped', message: t.name + ' "' + t.text + '" is cut by ' + name(a) }); }
      break;
    }
    const cx = Math.min(W - 1, Math.max(0, (r.left + r.right) / 2)), cy = Math.min(H - 1, Math.max(0, (r.top + r.bottom) / 2));
    if (cx >= 0 && cy >= 0 && cx < W && cy < H && !allow(el, 'occlusion')) {
      for (const hit of document.elementsFromPoint(cx, cy)) {
        if (hit === el || el.contains(hit) || hit.contains(el)) break;
        if (allow(hit, 'occlusion')) break;
        const hs = getComputedStyle(hit), hb = hit.getBoundingClientRect();
        const decor = (hb.width >= W * 0.9 && hb.height >= H * 0.9) || Number(hs.opacity) < 0.35 || (hs.backgroundColor === 'rgba(0, 0, 0, 0)' && hs.backgroundImage === 'none' && !/^(IMG|CANVAS|VIDEO|SVG|svg)$/.test(hit.tagName) && !hit.textContent.trim());
        if (decor || !visible(hit)) continue;
        out.push({ code: 'text-covered', message: t.name + ' "' + t.text + '" is covered by ' + name(hit) });
        break;
      }
    }
  }
  style.remove();
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.zoomed || b.zoomed || a.el.contains(b.el) || b.el.contains(a.el) || allow(a.el, 'overlap') || allow(b.el, 'overlap')) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 0 && h > 0 && w * h > 0.2 * Math.min(a.r.width * a.r.height, b.r.width * b.r.height)) out.push({ code: 'text-overlap', message: a.name + ' "' + a.text + '" overlaps ' + b.name + ' "' + b.text + '"' });
  }
  return { issues: out, boxes: texts.map((t) => ({ name: t.name, text: t.text, x: t.r.left, y: t.r.top, w: t.r.width, h: t.r.height, large: t.size >= 24 || (t.bold && t.size >= 18.66) })) };
})()`;

export async function checkPage(project, { samples = 24, fps = 30, onLog = () => {} } = {}) {
  const found = [];
  const add = (level, code, message, t) => found.push({ level, code, message, ...(t != null ? { t: Math.round(t * 100) / 100 } : {}) });
  const film = await openFilm(project.index, { video: 'seek', shotFormat: 'png' });
  let cold = null;
  try {
    const info = film.info;
    const dur = info.duration;
    for (const e of new Set(film.errors)) add('error', 'page-error', e);
    if (info.id && info.timelines.length && !info.timelines.includes(info.id)) add('warning', 'timeline-id', `the timeline is registered as "${info.timelines[0]}" but the root is "${info.id}" — use window.__timelines["${info.id}"]`);
    // length bookkeeping
    const book = await film.evaluate(`(() => { const r = document.querySelector('[data-composition-id]'), tls = Object.values(window.__timelines || {}).filter((t) => t && t.duration); const a = document.getElementById('om-sound');
      return { root: r && parseFloat(r.getAttribute('data-duration')) || null, tl: tls.reduce((m, t) => Math.max(m, t.duration()), 0), sound: a ? parseFloat(a.getAttribute('data-duration')) : null }; })()`);
    if (book.root && book.tl > book.root + 0.05) add('warning', 'cut-off', `the timeline runs ${book.tl.toFixed(2)}s but the root says data-duration="${book.root}" — the end is cut off`);
    if (book.sound != null && Math.abs(book.sound - dur) > 0.1) add('warning', 'stale-sound', `the soundtrack is ${book.sound.toFixed(2)}s, the film ${dur.toFixed(2)}s — run om sound`);
    // external music: its file is there, its beat map is current, and the scene cuts sit on its beats
    const mus = await film.evaluate(`(() => { const o = window.__om || {}, m = o.sound ? o.sound().music : null; return { src: m && m.src || null, map: o.beatData ? o.beatData() : null }; })()`);
    if (mus.src) {
      if (!existsSync(resolve(project.root, mus.src))) add('error', 'music-missing', `OM.music({ src: '${mus.src}' }): no such file — put the track in assets/music/ (om sound --music <file> does it)`);
      else if (!mus.map || mus.map.src !== mus.src) add('warning', 'music-beats', `OM.music({ src: '${mus.src}' }) has no beat map in index.html yet — run om sound, then OM.beat / OM.downbeat / OM.drop follow the track`);
      else {
        const cuts = Object.entries(info.labels || {}).filter(([k]) => k.startsWith('scene:')).map(([name, t]) => ({ name, t }));
        const al = cutAlignment(cuts, { ...mus.map, duration: dur });
        if (al === null) add('warning', 'music-pulse', `the track has no clear pulse (confidence ${mus.map.confidence}) — scene cuts cannot be put on its beat; trust its sections (OM.section(i)), not its beats`);
        else {
          const off = al.filter((c) => !c.ok);
          if (off.length) add('warning', 'cut-off-beat', `${off.length} of ${al.length} scene cuts sit more than ${Math.round(CUT_TOLERANCE * 1000)} ms from the nearest beat of the track: ${off.slice(0, 6).map((c) => `${c.name} ${c.t.toFixed(2)}s (${c.off > 0 ? '+' : ''}${c.off} ms)`).join(', ')}${off.length > 6 ? ', …' : ''} — place them on OM.beat(n) / OM.downbeat(n)`, off[0].t);
        }
      }
    }
    for (const [k, v] of Object.entries(info.labels || {})) if (k.startsWith('scene:') && v >= dur) add('warning', 'scene-after-end', `${k} starts at ${v.toFixed(2)}s, at or after the end (${dur.toFixed(2)}s)`);
    // footage the renderer cannot use
    for (const m of await film.media()) {
      if (m.tag !== 'video' || !m.src.startsWith('file:')) continue;
      try { if (isHdr(probeVideo(fileURLToPath(m.src)))) add('error', 'hdr-video', `#${m.id} is HDR — convert it to SDR (bt709) first; HDR footage renders with wrong colours`); } catch (e) { add('error', 'video-unreadable', `#${m.id}: ${e.message}`); }
    }

    // sample frames: every scene start and just after it, then evenly
    const last = Math.max(0, dur - 1 / fps);
    const times = new Set([0, last]);
    for (const v of Object.entries(info.labels || {}).filter(([k]) => k.startsWith('scene:')).map(([, v]) => v)) { times.add(Math.min(last, v)); times.add(Math.min(last, v + 0.3)); }
    for (let i = 1; times.size < samples && i < samples; i++) times.add(Math.round((dur * i) / samples * fps) / fps);
    const list = [...times].filter((t) => t >= 0 && t <= last).sort((a, b) => a - b).slice(0, Math.max(samples, 2));
    const seenIssue = new Map();
    let firstShot = null, lastShot = null;
    for (const t of list) {
      await film.seek(t);
      const { issues, boxes } = await film.evaluate(LAYOUT(t));
      for (const x of issues) { const k = x.code + x.message; if (!seenIssue.has(k)) { seenIssue.set(k, t); add('warning', x.code, x.message, t); } }
      const img = decodePng(await film.shot({ format: 'png' }));
      if (t === 0) firstShot = img;
      if (t === last) lastShot = img;
      for (const b of boxes) {
        const c = contrast(img, b);
        // ~1:1 is text that is masked or not drawn here, not low contrast
        if (c && c.ratio > 1.15 && c.ratio < (b.large ? 3 : 4.5)) { const k = 'contrast' + b.name + b.text; if (!seenIssue.has(k)) { seenIssue.set(k, t); add('warning', 'low-contrast', `${b.name} "${b.text}" contrast ${c.ratio.toFixed(1)}:1 (needs ${b.large ? 3 : 4.5}:1)`, t); } }
      }
    }
    for (const [img, at, what] of [[firstShot, 0, 'first'], [lastShot, last, 'last']]) if (img && flat(img)) add('warning', 'blank-frame', `the ${what} frame is a single flat colour — start moving / end on the brand`, at);
    // the signature: the film is now at its last frame, where the engine has chosen a corner for it
    const sig = await film.evaluate('window.__omEngine.signature ? window.__omEngine.signature() : null');
    if (sig && sig.shown && !sig.shown.clear) add('warning', 'signature-covers', `the "Made with huashu-motion" signature finds no free corner in the last 1.2s and sits ${sig.shown.corner} over the film — leave one corner of the end frame clear, pin it with data-om-signature="top-left" (or another corner) on the root, or switch it off with data-om-signature="off"`, last);
    onLog(`sampled  ${list.length} frames`);

    // the same frame reached two ways: after everything above, and straight away in a fresh page
    cold = await openFilm(project.index, { video: 'seek', shotFormat: 'png' });
    const probes = [0.23, 0.47, 0.71, 0.93].map((k) => Math.round(dur * k * fps) / fps);
    for (const t of probes) {
      await film.seek(t); await cold.seek(t);
      const a = decodePng(await film.shot({ format: 'png' })), b = decodePng(await cold.shot({ format: 'png' }));
      const d = meanDiff(a, b);
      if (d > 0.5) add('warning', 'history-dependent', `the frame at ${t.toFixed(2)}s differs (${d.toFixed(1)} grey levels on average) when jumped to directly instead of played up to — a tween's start value comes from another tween, or a callback keeps state. Scrubbing, stills and om look show the jumped version; om render replays the timeline and matches playback`, t);
    }
    onLog(`compared ${probes.length} frames reached two ways`);
  } finally {
    await film.close();
    if (cold) await cold.close();
  }
  return found;
}

export async function check(project, { page = true, ...opts } = {}) {
  const found = checkSource(project);
  if (page && !found.some((f) => f.code === 'no-root' || f.code === 'script-syntax')) {
    try { found.push(...(await checkPage(project, opts))); } catch (e) { found.push({ level: 'error', code: 'page', message: e instanceof OmError ? e.message : String(e.message || e) }); }
  }
  return found;
}

export function report(found, { root } = {}) {
  const errors = found.filter((f) => f.level === 'error'), warnings = found.filter((f) => f.level === 'warning');
  const where = (f) => (f.line ? `index.html:${f.line}  ` : f.t != null ? `${f.t.toFixed(2)}s  ` : '');
  // many texts with the same finding at the same moment (a whole panel) read as one line
  const groups = new Map();
  for (const f of [...errors, ...warnings]) { const k = `${f.level}|${f.code}|${f.t ?? ''}|${f.line ?? ''}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
  const lines = [...groups.values()].map((g) => {
    const f = g[0], head = `${f.level === 'error' ? '✗ error  ' : '! warning'} ${f.code.padEnd(18)} ${where(f)}`;
    return g.length > 3 ? `${head}${g.length} texts, e.g. ${g.slice(0, 2).map((x) => x.message).join(' · ')}` : g.map((x) => head + x.message).join('\n');
  });
  lines.push(`${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}${root ? `  (${root})` : ''}`);
  return lines.join('\n');
}

// ---------- pixels ----------
// A PNG from Chrome: 8-bit RGB or RGBA, not interlaced.
export function decodePng(buf) {
  let p = 8, width = 0, height = 0, type = 6;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('latin1', p + 4, p + 8), body = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); type = body[9]; if (body[8] !== 8 || body[12]) throw new Error('unsupported PNG'); }
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, stride = width * bpp, raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    for (let x = 0; x < width; x++) { const o = (y * width + x) * 4; px[o] = cur[x * bpp]; px[o + 1] = cur[x * bpp + 1]; px[o + 2] = cur[x * bpp + 2]; px[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255; }
    [prev, cur] = [cur, prev];
  }
  return { width, height, px };
}
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const LUM = Array.from({ length: 256 }, (_, v) => lin(v));
// WCAG contrast inside a text box: the glyphs are one end of the luminance range, the ground the other.
function contrast(img, b) {
  const x0 = Math.max(0, Math.floor(b.x)), y0 = Math.max(0, Math.floor(b.y)), x1 = Math.min(img.width, Math.ceil(b.x + b.w)), y1 = Math.min(img.height, Math.ceil(b.y + b.h));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  const L = [];
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 20000)));
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) { const o = (y * img.width + x) * 4; L.push(0.2126 * LUM[img.px[o]] + 0.7152 * LUM[img.px[o + 1]] + 0.0722 * LUM[img.px[o + 2]]); }
  L.sort((a, c) => a - c);
  const lo = L[Math.floor(L.length * 0.03)], hi = L[Math.floor(L.length * 0.97)];
  return { ratio: (hi + 0.05) / (lo + 0.05) };
}
function flat(img) {
  const { px } = img; let n = 0, s = 0, s2 = 0;
  for (let i = 0; i < px.length; i += 4 * 97) { const v = (px[i] + px[i + 1] + px[i + 2]) / 3; s += v; s2 += v * v; n++; }
  return Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)) < 1;
}
function meanDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return 255;
  let d = 0, n = 0;
  for (let i = 0; i < a.px.length; i += 4 * 7) { d += Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]); n += 3; }
  return d / n;
}
