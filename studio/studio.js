// huashu-motion studio. One page, no build step: the om player shows the real composition,
// this file adds pointing, direct edits and the comment loop around it.
import { LANGS, pickLang, saveLang, setLang, lang, t, applyI18n } from './i18n.js';

const BOOT = window.OM_BOOT || {};
setLang(pickLang(BOOT));
const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};

const S = {
  token: null, variables: [], comments: [], history: 0, name: '',
  w: 1920, h: 1080, duration: 0, scenes: [],
  tool: 'select', selected: null, playing: false, restore: null, renderJob: null,
};
let player = $('#player');
const FPS = 30;

// ---------- server ----------
async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OM-Token': BOOT.csrf }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || r.statusText); e.status = r.status; throw e; }
  return j;
}

function toast(html, { bad = false, ms = 3600 } = {}) {
  const t = $('#toast');
  t.innerHTML = html; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
  clearTimeout(toast.timer);
  if (ms) toast.timer = setTimeout(() => (t.hidden = true), ms);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };

function renderLang() {
  const sel = $('#lang');
  sel.replaceChildren(...Object.entries(LANGS).map(([code, d]) => el('option', { value: code, selected: code === lang() }, d.name)));
  sel.addEventListener('change', () => { saveLang(sel.value); location.reload(); });
}

async function boot() {
  applyI18n(); renderLang();
  const st = await (await fetch('/api/state')).json();
  Object.assign(S, { token: st.token, variables: st.variables, comments: st.comments, history: st.history, name: st.name, renderJob: st.render });
  if (st.scan.width) { S.w = st.scan.width; S.h = st.scan.height; }
  $('#project-name').textContent = st.name;
  document.title = `${st.name} · huashu-motion`;
  $('#agent-cmd').textContent = 'om inbox --wait';
  layout();
  loadPlayer();
  renderVars(); renderComments(); renderStatus();
  const es = new EventSource('/api/events');
  es.addEventListener('source', (e) => onSource(JSON.parse(e.data)));
  es.addEventListener('inbox', (e) => { S.comments = JSON.parse(e.data).comments; renderComments(); renderStatus(); renderPins(); renderMarks(); });
  es.addEventListener('render', (e) => onRender(JSON.parse(e.data)));
  es.addEventListener('problem', (e) => toast(esc(JSON.parse(e.data).message), { bad: true }));
  es.onerror = () => { $('#status').className = 'status bad'; $('#status-text').textContent = t('status.disconnected'); };
  es.onopen = () => renderStatus();
}

// ---------- player ----------
const srcUrl = () => `/p/index.html?v=${(S.token || '').slice(0, 10)}`;
function loadPlayer() { player.setAttribute('src', srcUrl()); }

function onReady(p, d = {}) {
  S.duration = d.duration || p.duration || 0;
  if (d.compositionWidth) { S.w = d.compositionWidth; S.h = d.compositionHeight; layout(); }
  $('#duration').textContent = fmt(S.duration);
  $('#project-meta').textContent = `${S.w}×${S.h} · ${S.duration.toFixed(1)}s`;
  readScenes();
  // Compositions may register their timeline after an async boot (fonts, images); keep looking briefly.
  let tries = 0;
  const again = () => { if (S.scenes.length || ++tries > 20) return; readScenes(); setTimeout(again, 250); };
  setTimeout(again, 250);
  tick(true);
}
function bind(p) {
  p.addEventListener('ready', (e) => { if (p === player) onReady(p, e.detail); });
  p.addEventListener('timeupdate', () => { if (p === player) tick(); });
}
bind(player);

// A new version loads in a second player behind the visible one, seeks to the same moment and
// only then takes its place — the preview never flashes black while the agent iterates.
let pending = null;
function swapPlayer() {
  const { t, playing } = S.restore || { t: player.currentTime || 0, playing: false };
  S.restore = null;
  if (pending) pending.remove();
  const next = document.createElement('om-player');
  next.setAttribute('disable-click-to-play', '');
  next.className = 'staged';
  pending = next;
  $('#frame').insertBefore(next, $('#overlay'));
  bind(next);
  next.addEventListener('ready', (e) => {
    if (pending !== next) return;
    next.seek(Math.min(t, e.detail?.duration || next.duration || t));
    // give the new frame two paints before revealing it
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
      if (pending !== next) return;
      const old = player; player = next; pending = null;
      old.remove(); next.className = ''; next.id = 'player';
      onReady(next, e.detail);
      if (playing) play();
      flash();
    }, 60)));
  }, { once: true });
  next.setAttribute('src', srcUrl());
}

const win = () => player.iframeElement?.contentWindow;
const doc = () => { try { return player.iframeElement?.contentDocument; } catch { return null; } };

function readScenes() {
  const w = win(); let labels = {};
  try {
    const tls = w?.__timelines || {};
    const root = doc()?.querySelector('[data-composition-id]')?.getAttribute('data-composition-id');
    const tl = tls[root] || Object.values(tls)[0];
    labels = tl?.labels || {};
  } catch {}
  const list = Object.entries(labels).filter(([k]) => k.startsWith('scene:')).map(([k, v]) => ({ id: k.slice(6), start: v })).sort((a, b) => a.start - b.start);
  list.forEach((s, i) => (s.end = list[i + 1]?.start ?? S.duration));
  S.scenes = list;
  renderScenes();
}
const sceneAt = (t) => S.scenes.findLast?.((s) => t >= s.start - 1e-6) ?? [...S.scenes].reverse().find((s) => t >= s.start - 1e-6);

function play() { S.playing = true; player.play(); setPlayIcon(); requestAnimationFrame(loop); }
function pause() { S.playing = false; player.pause(); setPlayIcon(); tick(true); }
function loop() { if (!S.playing) return; tick(); if (player.paused && player.currentTime >= S.duration - 0.05) { pause(); return; } requestAnimationFrame(loop); }
function setPlayIcon() { $('#play-icon').innerHTML = S.playing ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M7 4l13 8-13 8z"/>'; }
function seek(t) { t = Math.max(0, Math.min(S.duration, t)); player.seek(t); tick(true); }

let lastTick = -1;
function tick(force) {
  const t = player.currentTime || 0;
  if (!force && Math.abs(t - lastTick) < 1 / 120) return;
  lastTick = t;
  $('#time').textContent = fmt(t);
  const pct = S.duration ? (t / S.duration) * 100 : 0;
  $('#playhead').style.left = pct + '%';
  const cur = sceneAt(t);
  document.querySelectorAll('.scene').forEach((n) => n.classList.toggle('current', n.dataset.id === cur?.id));
  renderPins();
  if (S.selected) drawBox($('#select-box'), S.selected);
}

// ---------- geometry ----------
function layout() {
  const stage = $('#stage').getBoundingClientRect();
  const pad = 36, aw = stage.width - pad * 2, ah = stage.height - pad * 2;
  const scale = Math.min(aw / S.w, ah / S.h);
  const frame = $('#frame');
  frame.style.width = Math.max(10, S.w * scale) + 'px';
  frame.style.height = Math.max(10, S.h * scale) + 'px';
  tick(true);
}
new ResizeObserver(layout).observe($('#stage'));

const view = () => {
  const f = $('#frame').getBoundingClientRect();
  const i = player.iframeElement?.getBoundingClientRect() || f;
  const k = i.width / S.w;
  return { f, i, k };
};
const toComp = (cx, cy) => { const { i, k } = view(); return { x: (cx - i.left) / k, y: (cy - i.top) / k }; };
const toFrame = (x, y) => { const { f, i, k } = view(); return { x: i.left - f.left + x * k, y: i.top - f.top + y * k }; };

// The object under a point: the smallest visible [data-om-id] whose box contains it.
// elementFromPoint is not enough — overlays often use pointer-events:none.
// Effective opacity of a node (product up the tree); 0 when hidden.
function alpha(node) {
  const w = win(); let a = 1;
  for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
    const cs = w.getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
    a *= Number(cs.opacity);
  }
  return a;
}
const visible = (node) => alpha(node) >= 0.05;
const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && r.width * r.height > 0;
// Does this element actually draw something at (x, y)? A full-frame section whose content is still
// transparent must not swallow clicks meant for the title underneath it.
function paints(n, x, y, depth = 0) {
  const w = win(), cs = w.getComputedStyle(n);
  if (!visible(n) || !inside(n.getBoundingClientRect(), x, y)) return false;
  if (n instanceof w.SVGElement || /^(IMG|CANVAS|VIDEO)$/.test(n.tagName) || cs.backgroundImage !== 'none' || !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || cs.borderStyle !== 'none' && parseFloat(cs.borderWidth) > 0) return true;
  if ([...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) return true;
  if (depth > 6) return true;
  return [...n.children].some((c) => paints(c, x, y, depth + 1));
}
function objectAt(x, y) {
  const d = doc(); if (!d) return null;
  let best = null;
  for (const n of d.querySelectorAll('[data-om-id]')) {
    const r = n.getBoundingClientRect();
    if (!inside(r, x, y) || !paints(n, x, y)) continue;
    // Prefer what the viewer can clearly see: faded background layers lose to anything solid on top.
    const area = r.width * r.height, solid = alpha(n) >= 0.35;
    if (!best || solid > best.solid || (solid === best.solid && area < best.area)) best = { id: n.getAttribute('data-om-id'), node: n, area, solid, box: r };
  }
  // Canvas/WebGL scenes can register pickable regions: window.__om.hitTest(x, y, t) → {id, box:[x,y,w,h]}
  try {
    const h = win()?.__om?.hitTest?.(x, y, player.currentTime);
    if (h && (!best || h.box[2] * h.box[3] < best.area)) best = { id: h.id, node: null, area: h.box[2] * h.box[3], box: { left: h.box[0], top: h.box[1], width: h.box[2], height: h.box[3] } };
  } catch {}
  return best;
}
function boxOf(id) {
  const n = doc()?.querySelector(`[data-om-id="${CSS.escape(id)}"]`);
  if (n) return visible(n) ? n.getBoundingClientRect() : null;
  try { const b = win()?.__om?.boxOf?.(id, player.currentTime); if (b) return { left: b[0], top: b[1], width: b[2], height: b[3] }; } catch {}
  return null;
}
function drawBox(node, id) {
  const r = boxOf(id);
  if (!r) { node.hidden = true; return; }
  const p = toFrame(r.left, r.top), { k } = view();
  Object.assign(node.style, { left: p.x + 'px', top: p.y + 'px', width: r.width * k + 'px', height: r.height * k + 'px' });
  node.querySelector('span').textContent = '#' + id;
  node.hidden = false;
}

// ---------- pointing ----------
const overlay = $('#overlay');
overlay.addEventListener('mousemove', (e) => {
  const { x, y } = toComp(e.clientX, e.clientY);
  const hit = objectAt(x, y);
  if (hit && hit.id !== S.selected) drawBox($('#hover-box'), hit.id); else $('#hover-box').hidden = true;
});
overlay.addEventListener('mouseleave', () => ($('#hover-box').hidden = true));
overlay.addEventListener('click', (e) => {
  if (e.target.closest('.pin')) return;
  const { x, y } = toComp(e.clientX, e.clientY);
  const hit = objectAt(x, y);
  if (S.tool === 'comment') { if (S.playing) pause(); openComposer(e, x, y, hit); return; }
  select(hit?.id || null);
});

// Double-click text that is bound to a variable to edit it in place, right on the frame.
overlay.addEventListener('dblclick', (e) => {
  if (S.tool !== 'select') return;
  const { x, y } = toComp(e.clientX, e.clientY);
  const hit = objectAt(x, y); if (!hit?.node) return;
  const bound = hit.node.closest('[data-var-text],[data-om-var]') || hit.node.querySelector('[data-var-text],[data-om-var]');
  const v = bound && S.variables.find((d) => d.id === (bound.getAttribute('data-om-var') || bound.getAttribute('data-var-text')));
  if (!v || (v.type && v.type !== 'string')) { toast(t('edit.unbound')); return; }
  if (S.playing) pause();
  const r = bound.getBoundingClientRect(), p = toFrame(r.left, r.top), { k } = view();
  const cs = win().getComputedStyle(bound);
  const input = el('input', { class: 'inline-edit', value: v.default,
    style: `left:${p.x - 4}px;top:${p.y - 4}px;min-width:${Math.max(120, r.width * k + 8)}px;height:${r.height * k + 8}px;font-size:${parseFloat(cs.fontSize) * k}px;font-weight:${cs.fontWeight};letter-spacing:${parseFloat(cs.letterSpacing || 0) * k || 0}px` });
  let done = false;
  const finish = async (save) => {
    if (done) return; done = true; input.remove();
    if (!save || input.value === v.default) return;
    try { const res = await api('/api/vars', { token: S.token, values: { [v.id]: input.value } }); S.token = res.token; v.default = input.value; }
    catch (err) { toast(err.status === 409 ? t('edit.conflict') : esc(err.message), { bad: true }); refreshState(); }
  };
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') finish(true); if (ev.key === 'Escape') finish(false); ev.stopPropagation(); });
  input.addEventListener('blur', () => finish(true));
  $('#frame').append(input); input.focus(); input.select();
});

function select(id) {
  S.selected = id;
  $('#hover-box').hidden = true;
  if (id) drawBox($('#select-box'), id); else $('#select-box').hidden = true;
  renderSelection();
  renderVars();
}

function linkedVars(id) {
  const n = doc()?.querySelector(`[data-om-id="${CSS.escape(id)}"]`);
  if (!n) return [];
  const ids = new Set();
  for (const m of [n, ...n.querySelectorAll('*')]) for (const a of ['data-var-text', 'data-var-src', 'data-om-var']) if (m.getAttribute(a)) ids.add(m.getAttribute(a));
  const text = n.textContent.trim();
  for (const v of S.variables) if (typeof v.default === 'string' && v.default.trim() && text.includes(v.default.trim())) ids.add(v.id);
  for (const v of S.variables) if (v.id === id) ids.add(v.id);
  return [...ids];
}

function renderSelection() {
  const box = $('#selection');
  box.innerHTML = '';
  if (!S.selected) { box.append(el('div', { class: 'empty' }, ...t('selection.empty').split('{kbd}').flatMap((s, i) => (i ? [el('kbd', {}, 'C'), s] : [s])))); return; }
  const n = doc()?.querySelector(`[data-om-id="${CSS.escape(S.selected)}"]`);
  const linked = linkedVars(S.selected);
  let label = null;
  try { label = win()?.__om?.hitTest && !n ? (win().__om.regionLabel?.(S.selected) ?? null) : null; } catch {}
  box.append(
    el('div', { class: 'sel-head' },
      el('div', { class: 'sel-id' }, '#' + S.selected, el('small', {}, n ? n.tagName.toLowerCase() : (label ? `${label} · ${t('selection.canvas')}` : t('selection.canvas')))),
      el('button', { class: 'ghost small', onclick: () => setTool('comment') }, t('selection.comment'))),
    n && n.textContent.trim() ? el('div', { class: 'sel-text' }, n.textContent.trim().slice(0, 120)) : null,
    el('div', { class: 'sel-text dim small' }, linked.length ? t('selection.editable', { list: linked.map((id) => S.variables.find((v) => v.id === id)?.label || id).join(t('list.sep')) }) : t('selection.unbound')));
}

// ---------- composer ----------
// What the agent sees of the element: the authored markup, without what the runtime stamped on at play time.
function cleanHtml(node) {
  const c = node.cloneNode(true);
  for (const n of [c, ...c.querySelectorAll('*')]) {
    const stamped = n.hasAttribute('data-hf-autostamped');
    for (const a of [...n.attributes]) if (a.name === 'style' || a.name.startsWith('data-hf-') || (stamped && (a.name === 'data-start' || a.name === 'data-duration'))) n.removeAttribute(a.name);
  }
  return c.outerHTML.replace(/\s+/g, ' ').slice(0, 600);
}
let draft = null;
function openComposer(e, x, y, hit) {
  const t = player.currentTime || 0;
  const scene = sceneAt(t)?.id || null;
  draft = { x, y, t, target: hit?.id || null, scene, element: hit?.node ? cleanHtml(hit.node) : null };
  const ctx = $('#composer-ctx');
  ctx.innerHTML = `${hit ? `<b>#${esc(hit.id)}</b> · ` : ''}${fmt(t)}${scene ? ` · ${t('composer.scene')} ${esc(scene)}` : ''}`;
  const c = $('#composer'), stage = $('#stage').getBoundingClientRect();
  c.hidden = false;
  const left = Math.min(Math.max(12, e.clientX - stage.left + 12), stage.width - 332);
  const top = Math.min(Math.max(12, e.clientY - stage.top + 12), stage.height - c.offsetHeight - 12);
  Object.assign(c.style, { left: left + 'px', top: top + 'px' });
  const ta = $('#composer-text'); ta.value = ''; ta.focus();
}
function closeComposer() { $('#composer').hidden = true; draft = null; }
async function sendComment() {
  const text = $('#composer-text').value.trim();
  if (!text || !draft) return;
  $('#composer-send').disabled = true;
  try {
    const values = Object.fromEntries(S.variables.map((v) => [v.id, v.default]));
    const c = await api('/api/comments', { ...draft, text, variables: values });
    if (!S.comments.some((x) => x.id === c.id)) S.comments.push(c);
    closeComposer();
    renderComments(); renderPins(); renderMarks(); renderStatus();
    toast(t('composer.sent'));
  } catch (err) { toast(esc(err.message), { bad: true }); }
  finally { $('#composer-send').disabled = false; }
}
$('#composer-send').addEventListener('click', sendComment);
$('#composer-text').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendComment(); }
  if (e.key === 'Escape') closeComposer();
});

// ---------- comments ----------
const STATUS = { pending: 'comment.pending', working: 'comment.working', done: 'comment.done', cancelled: 'comment.cancelled' };
function renderComments() {
  const list = $('#comments'); list.innerHTML = '';
  const open = S.comments.filter((c) => c.status === 'pending' || c.status === 'working').length;
  $('#comment-count').textContent = open || '';
  if (!S.comments.length) { list.append(el('div', { class: 'no-vars' }, t('comments.empty'))); return; }
  for (const c of [...S.comments].reverse()) {
    list.append(el('div', { class: 'comment', onclick: () => { if (c.t != null) seek(c.t); if (c.target) select(c.target); } },
      el('div', { class: 'c-head' },
        el('span', { class: 'chip ' + c.status }, STATUS[c.status] ? t(STATUS[c.status]) : c.status),
        el('span', {}, c.t != null ? fmt(c.t) : ''), c.target ? el('span', {}, '#' + c.target) : null,
        el('span', { class: 'c-actions' },
          c.status === 'pending' ? el('button', { onclick: (e) => { e.stopPropagation(); api(`/api/comments/${c.id}/cancel`).catch((x) => toast(esc(x.message), { bad: true })); } }, t('comment.cancel')) : null,
          c.status === 'done' ? el('button', { onclick: (e) => { e.stopPropagation(); openReply(e.currentTarget.closest('.comment'), c); } }, t('comment.notRight')) : null)),
      el('div', { class: 'c-text' }, c.text),
      (c.thread || []).map((m) => el('div', { class: m.who === 'agent' ? 'c-note' : 'c-reply' }, m.who === 'agent' ? m.text || t('comment.handled') : '↩ ' + m.text))));
  }
}
// Tell the agent what is still wrong; the comment goes back into its inbox with the whole thread.
function openReply(card, c) {
  if (card.querySelector('.reply')) return;
  const ta = el('textarea', { rows: 2, placeholder: t('reply.placeholder') });
  const send = async () => {
    const text = ta.value.trim(); if (!text) return;
    try { await api(`/api/comments/${c.id}/reopen`, { note: text }); toast(t('reply.sent')); }
    catch (x) { toast(esc(x.message), { bad: true }); }
  };
  ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); if (e.key === 'Escape') box.remove(); });
  const box = el('div', { class: 'reply', onclick: (e) => e.stopPropagation() }, ta, el('div', { class: 'composer-actions' }, el('span', { class: 'hint' }, t('reply.hint')), el('button', { class: 'primary small', onclick: send }, t('reply.send'))));
  card.append(box); ta.focus();
}

function renderPins() {
  const box = $('#pins'); box.innerHTML = '';
  const t = player.currentTime || 0;
  S.comments.forEach((c, i) => {
    if (c.x == null || c.t == null || c.status === 'cancelled' || Math.abs(c.t - t) > 0.6) return;
    const p = toFrame(c.x, c.y);
    box.append(el('div', { class: 'pin ' + c.status, style: `left:${p.x}px;top:${p.y}px`, title: c.text, onclick: () => setTab('comments') }, el('b', {}, el('i', {}, String(i + 1)))));
  });
}
function renderMarks() {
  const box = $('#marks'); box.innerHTML = '';
  if (!S.duration) return;
  for (const c of S.comments) if (c.t != null && c.status !== 'cancelled') box.append(el('div', { class: 'mark ' + c.status, style: `left:${(c.t / S.duration) * 100}%` }));
}

let hintTimer = null;
function renderStatus() {
  const s = $('#status'), txt = $('#status-text');
  const working = S.comments.find((c) => c.status === 'working');
  const waiting = S.comments.filter((c) => c.status === 'pending');
  if (S.renderJob?.status === 'running') { s.className = 'status working'; txt.textContent = t('status.exporting'); }
  else if (working) { s.className = 'status working'; txt.textContent = t('status.agentWorking', { text: working.text.slice(0, 18) + (working.text.length > 18 ? '…' : '') }); }
  else if (waiting.length) { s.className = 'status'; txt.textContent = t('status.waiting', { n: waiting.length }); }
  else { s.className = 'status ok'; txt.textContent = t('status.saved', { n: S.history }); }
  clearTimeout(hintTimer);
  $('#agent-hint').hidden = true;
  if (waiting.length && !working) {
    const oldest = Math.min(...waiting.map((c) => Date.parse(c.created || c.at || Date.now())));
    hintTimer = setTimeout(() => { if (S.comments.some((c) => c.status === 'pending') && !S.comments.some((c) => c.status === 'working')) $('#agent-hint').hidden = false; }, Math.max(0, 6000 - (Date.now() - oldest)));
  }
}
$('#copy-cmd').addEventListener('click', () => { navigator.clipboard?.writeText($('#agent-cmd').textContent); toast(t('copied')); });

// ---------- variables ----------
function renderVars() {
  const box = $('#vars');
  if (box.contains(document.activeElement) && document.activeElement.matches('input,textarea,select')) { S.varsDirty = true; return; }
  box.innerHTML = '';
  if (!S.variables.length) { box.append(el('div', { class: 'no-vars' }, t('vars.none'))); return; }
  const linked = new Set(S.selected ? linkedVars(S.selected) : []);
  const groups = new Map();
  for (const v of S.variables) { const g = v.group || t('vars.group'); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(v); }
  for (const [name, vars] of groups) {
    const g = el('div', { class: 'group' }, el('h4', {}, name));
    for (const v of vars) g.append(field(v, linked.has(v.id)));
    box.append(g);
  }
  box.querySelector('.field.linked')?.scrollIntoView({ block: 'nearest' });
}

function field(v, linked) {
  const row = el('div', { class: 'field' + (linked ? ' linked' : '') }, el('label', { title: v.id }, v.label || v.id));
  const commit = async (value) => {
    if (value === v.default) return;
    row.classList.add('saving');
    try { const r = await api('/api/vars', { token: S.token, values: { [v.id]: value } }); S.token = r.token; v.default = value; }
    catch (e) {
      toast(e.status === 409 ? t('edit.conflict') : esc(e.message), { bad: true });
      refreshState();
    } finally { row.classList.remove('saving'); }
  };
  let input;
  if (v.type === 'number') {
    input = el('input', { type: 'number', value: v.default, min: v.min, max: v.max, step: v.step ?? 'any', onchange: (e) => e.target.value !== '' && commit(Number(e.target.value)) });
  } else if (v.type === 'color') {
    const hex = el('input', { type: 'text', value: v.default, onchange: (e) => commit(e.target.value.trim()) });
    const pick = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(v.default) ? v.default : '#000000',
      oninput: (e) => { hex.value = e.target.value; try { doc()?.querySelector('[data-composition-id]')?.style.setProperty('--' + v.id, e.target.value); } catch {} },
      onchange: (e) => commit(e.target.value) });
    input = el('div', { class: 'color' }, pick, hex);
  } else if (v.type === 'boolean') {
    input = el('input', { type: 'checkbox', checked: !!v.default, onchange: (e) => commit(e.target.checked) });
  } else if (v.type === 'enum') {
    input = el('select', { onchange: (e) => commit(e.target.value) }, (v.options || []).map((o) => el('option', { value: o.value, selected: o.value === v.default }, o.label || o.value)));
  } else {
    const long = String(v.default ?? '').length > 22;
    input = long
      ? el('textarea', { rows: 2, onchange: (e) => commit(e.target.value) }, String(v.default ?? ''))
      : el('input', { type: 'text', value: v.default ?? '', onchange: (e) => commit(e.target.value), onkeydown: (e) => e.key === 'Enter' && e.target.blur() });
  }
  row.append(input);
  return row;
}
document.addEventListener('focusout', () => setTimeout(() => { if (S.varsDirty && !$('#vars').contains(document.activeElement)) { S.varsDirty = false; renderVars(); } }, 0));

// ---------- live source ----------
function onSource(d) {
  Object.assign(S, { token: d.token, variables: d.variables, history: d.history });
  if (d.scan?.width) { S.w = d.scan.width; S.h = d.scan.height; }
  renderVars(); renderStatus();
  S.restore = { t: player.currentTime || 0, playing: S.playing };
  if (S.playing) { player.pause(); S.playing = false; setPlayIcon(); }
  swapPlayer(); // assets may have changed even when index.html did not
}
function flash() { const f = $('#frame'); f.animate([{ boxShadow: '0 0 0 3px #2f855a, 0 20px 60px #00000059' }, { boxShadow: '0 0 0 0 #2f855a00, 0 20px 60px #00000059' }], { duration: 900, easing: 'ease-out' }); }
async function refreshState() {
  const st = await (await fetch('/api/state')).json();
  onSource({ token: st.token, variables: st.variables, history: st.history, scan: st.scan });
}

// ---------- timeline ----------
function renderScenes() {
  const box = $('#scenes'); box.innerHTML = '';
  box.style.display = 'block';
  if (!S.scenes.length) { box.append(el('div', { class: 'none' }, t('scenes.none'))); }
  for (const s of S.scenes) {
    const left = (s.start / S.duration) * 100, width = ((s.end - s.start) / S.duration) * 100;
    box.append(el('div', { class: 'scene', 'data-id': s.id, style: `position:absolute;left:${left}%;width:calc(${width}% - 2px);top:0`, title: s.id },
      el('b', {}, s.id), el('small', {}, `${(s.end - s.start).toFixed(1)}s`)));
  }
  const ruler = $('#ruler'); ruler.innerHTML = '';
  if (S.duration) {
    const step = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => S.duration / s <= 16) || 120;
    for (let t = 0; t <= S.duration + 1e-6; t += step) ruler.append(el('span', { style: `left:${(t / S.duration) * 100}%` }, `${Number(t.toFixed(1))}s`));
  }
  renderMarks();
}
const track = $('#track');
const seekFromEvent = (e) => { const r = track.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * S.duration); };
track.addEventListener('mousedown', (e) => {
  if (S.playing) pause();
  seekFromEvent(e);
  const move = (ev) => seekFromEvent(ev);
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
});

// ---------- tools, tabs, keys ----------
function setTool(tool) {
  S.tool = tool;
  document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  $('#stage').classList.toggle('commenting', tool === 'comment');
  if (tool !== 'comment') closeComposer();
}
function setTab(tab) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#panel-props').hidden = tab !== 'props';
  $('#panel-comments').hidden = tab !== 'comments';
}
document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
$('#play').addEventListener('click', () => (S.playing ? pause() : play()));
$('#undo').addEventListener('click', doUndo);
async function doUndo() {
  try { await api('/api/undo'); toast(t('undo.done')); }
  catch (e) { toast(esc(e.message === 'nothing to undo' ? t('undo.nothing') : e.message), { bad: true }); }
}

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  if (e.key === ' ') { e.preventDefault(); S.playing ? pause() : play(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); if (S.playing) pause(); seek((player.currentTime || 0) + (e.shiftKey ? 1 : 1 / FPS)); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); if (S.playing) pause(); seek((player.currentTime || 0) - (e.shiftKey ? 1 : 1 / FPS)); }
  else if (e.key === 'c' || e.key === 'C') setTool('comment');
  else if (e.key === 'v' || e.key === 'V') setTool('select');
  else if (e.key === 'Escape') { closeComposer(); select(null); setTool('select'); }
  else if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); doUndo(); }
});

// ---------- export ----------
$('#export').addEventListener('click', (e) => { e.stopPropagation(); $('#export-menu').hidden = !$('#export-menu').hidden; });
document.addEventListener('click', () => ($('#export-menu').hidden = true));
$('#export-menu').addEventListener('click', async (e) => {
  const f = e.target.closest('button')?.dataset.format; if (!f) return;
  try { onRender(await api('/api/render', { format: f })); }
  catch (err) { toast(esc(err.message), { bad: true }); }
});
function onRender(job) {
  S.renderJob = job; renderStatus();
  $('#export').disabled = job?.status === 'running';
  if (!job) return;
  if (job.status === 'running') toast(`${t('export.running', { format: job.format.toUpperCase() })}<br><span class="dim small">${esc(job.log?.at(-1) || t('export.firstTime'))}</span>`, { ms: 0 });
  if (job.status === 'done') { const name = job.out.split('/').pop(); toast(`${t('export.done')}<a href="/out/${encodeURIComponent(name)}" target="_blank">${esc(name)}</a><br><span class="small">${esc(job.out)}</span>`, { ms: 12000 }); }
  if (job.status === 'failed') toast(`${t('export.failed')}${esc(job.error)}`, { bad: true, ms: 12000 });
}

boot().catch((e) => toast(t('boot.failed') + esc(e.message), { bad: true, ms: 0 }));
