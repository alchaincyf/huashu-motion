// om music — the track library on this machine: the default tracks (a catalog shipped in the package, downloaded
// on demand like the sample pack) and the user's own (om music add). The library is a folder:
//   ~/.cache/huashu-motion/music  (OM_MUSIC overrides)
//     library.json   every installed track: id, name, mood, bpm, duration, file, sha256, licence, source, origin
//     tracks/<id>.<ext>
//     analysis/      beat analyses by content hash
// `om music use <id> <dir>` copies a track into a project (assets/music/) and declares it, so the project is
// self-contained: the film never reads the library again.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openProject, OmError } from './project.js';
import { analyzeCached, attachMusic, fileHash, LOW_CONFIDENCE } from './track.js';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const musicDir = () => process.env.OM_MUSIC || join(homedir(), '.cache', 'huashu-motion', 'music');
const catalogFile = () => process.env.OM_MUSIC_CATALOG || join(PKG, 'music', 'catalog.json');
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
const slug = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'track';
const tags = (m) => (Array.isArray(m) ? m : String(m || '').split(/[,，\s]+/)).map((x) => x.trim()).filter(Boolean);

export function loadCatalog() {
  try { return JSON.parse(readFileSync(catalogFile(), 'utf8')); } catch (e) { throw new OmError(`cannot read the music catalog ${catalogFile()}: ${e.message}`); }
}
function loadLibrary() {
  try { const l = JSON.parse(readFileSync(join(musicDir(), 'library.json'), 'utf8')); return { tracks: l.tracks || [] }; } catch { return { tracks: [] }; }
}
function saveLibrary(lib) {
  mkdirSync(musicDir(), { recursive: true });
  writeFileSync(join(musicDir(), 'library.json'), JSON.stringify({ version: 1, tracks: lib.tracks }, null, 1));
}

// Every track the user can pick: the catalog's (installed or not) and their own.
export function listTracks() {
  const cat = loadCatalog(), lib = loadLibrary();
  const have = new Map(lib.tracks.map((t) => [t.id, t]));
  const out = (cat.tracks || []).map((c) => {
    const l = have.get(c.id), file = l && join(musicDir(), l.file);
    return { ...c, origin: 'catalog', installed: !!(l && existsSync(file)), file: l?.file || null };
  });
  for (const l of lib.tracks) if (l.origin === 'user' || !out.some((t) => t.id === l.id)) out.push({ ...l, origin: l.origin || 'user', installed: existsSync(join(musicDir(), l.file)) });
  return out;
}

function pick(id) {
  const all = listTracks(), key = slug(id), exact = all.find((t) => t.id === id || t.id === key);
  if (exact) return exact;
  const by = all.filter((t) => t.id.startsWith(key));
  if (by.length === 1) return by[0];
  if (by.length > 1) throw new OmError(`"${id}" matches ${by.map((t) => t.id).join(', ')} — use the whole id`);
  throw new OmError(`no track "${id}" in the library — om music lists them${all.length ? ` (${all.map((t) => t.id).join(', ')})` : ''}`);
}

export function formatList(tracks) {
  if (!tracks.length) return `music    the library is empty on this machine.\n         The default tracks are published as release assets of the repository: om music build fetches them once, when there are some.\n         Meanwhile: om music add <file> --mood warm,calm --name "…" registers a track of your own, or om sound <dir> --music <file> uses a file directly.\n         library  ${musicDir()}`;
  const rows = tracks.map((t) => [t.id, t.name || '', tags(t.mood).join(', '), t.bpm ? String(Math.round(t.bpm)) : '', t.duration ? fmt(t.duration) : '', t.installed ? (t.origin === 'user' ? 'yours' : 'installed') : 'om music build']);
  const head = ['id', 'name', 'mood', 'bpm', 'length', 'state'], w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r) => r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd();
  return [line(head), ...rows.map(line), '', `library  ${musicDir()}  ·  om music use <id> <dir>  puts a track into a project`].join('\n');
}

function download(url, to) {
  const r = spawnSync('curl', ['-sfL', '--retry', '2', url, '-o', to], { encoding: 'utf8' });
  if (r.error) throw new OmError(`curl is needed to download tracks: ${r.error.message}`);
  if (r.status !== 0) throw new OmError(`could not download ${url}`);
}

// Download catalog tracks (all, or `only` ids) into the library, checking each sha256.
export function buildMusic({ only = null, log = () => {} } = {}) {
  const cat = loadCatalog();
  const want = (cat.tracks || []).filter((t) => !only || only.some((id) => t.id === id || t.id === slug(id)));
  if (only) for (const id of only) if (!want.some((t) => t.id === id || t.id === slug(id))) throw new OmError(`no track "${id}" in the catalog — om music lists them`);
  if (!want.length) return `music    the default library has no tracks yet — they will be published as release assets of the repository.\n         om music add <file> registers a track of your own meanwhile.`;
  const base = (process.env.OM_MUSIC_BASE ?? cat.base ?? '').replace(/\/+$/, '');
  const lib = loadLibrary();
  mkdirSync(join(musicDir(), 'tracks'), { recursive: true });
  const done = [];
  for (const t of want) {
    if (!t.sha256) throw new OmError(`catalog entry ${t.id} has no sha256 — refusing to install an unchecked file`);
    const ext = extname(String(t.url).split(/[?#]/)[0]) || '.mp3', rel = `tracks/${t.id}${ext}`, to = join(musicDir(), rel);
    const rec = lib.tracks.find((x) => x.id === t.id);
    if (existsSync(to) && fileHash(to) === t.sha256) { log(`ok       ${t.id} already installed`); done.push(t.id); if (!rec) lib.tracks.push(entry(t, rel)); continue; }
    const url = /^[a-z][a-z0-9+.-]*:/i.test(t.url) ? t.url : base ? `${base}/${t.url.replace(/^\/+/, '')}` : null;
    if (!url) throw new OmError(`track ${t.id} has a relative url and there is no download source: set OM_MUSIC_BASE, or a "base" in the catalog`);
    log(`fetch    ${t.id} ← ${url}`);
    const tmp = `${to}.part`;
    download(url, tmp);
    const got = fileHash(tmp);
    if (got !== t.sha256) { rmSync(tmp, { force: true }); throw new OmError(`${t.id}: sha256 mismatch (expected ${t.sha256.slice(0, 12)}…, got ${got.slice(0, 12)}…) — the download was not installed`); }
    renameSync(tmp, to);
    lib.tracks = lib.tracks.filter((x) => x.id !== t.id).concat(entry(t, rel));
    done.push(t.id);
  }
  saveLibrary(lib);
  return `music    ${done.length} track${done.length === 1 ? '' : 's'} in ${musicDir()}\n         ${done.join(', ')}\n         licence: ${join(PKG, 'music', 'LICENSE.md')}`;
}
const entry = (t, file) => ({ id: t.id, name: t.name, mood: tags(t.mood), bpm: t.bpm, duration: t.duration, file, sha256: t.sha256, license: t.license, source: t.source, ...(t.credit ? { credit: t.credit } : {}), origin: 'catalog' });

// Register a file of the user's own: copied into the library, analysed once (bpm, duration), listed like the rest.
export function addTrack(file, { name = null, mood = [], license = null, source = null, credit = null } = {}) {
  const abs = resolve(file);
  if (!existsSync(abs) || statSync(abs).isDirectory()) throw new OmError(`no such file: ${abs}`);
  const an = analyzeCached(abs, join(musicDir(), 'analysis'));
  const lib = loadLibrary(), title = name || basename(abs, extname(abs));
  let id = slug(title);
  const taken = new Set([...lib.tracks.map((t) => t.id), ...(loadCatalog().tracks || []).map((t) => t.id)]);
  const sha = fileHash(abs);
  const same = lib.tracks.find((t) => t.sha256 === sha && t.origin === 'user');
  if (same) id = same.id;
  else for (let n = 2; taken.has(id); n++) id = `${slug(title)}-${n}`;
  const rel = `tracks/${id}${extname(abs).toLowerCase()}`;
  mkdirSync(join(musicDir(), 'tracks'), { recursive: true });
  copyFileSync(abs, join(musicDir(), rel));
  // adding the same file again keeps what was said about it the first time
  const was = same || {};
  const rec = { id, name: name || was.name || title, mood: tags(mood).length ? tags(mood) : was.mood || [], bpm: Math.round(an.bpm * 10) / 10, confidence: an.confidence, duration: Math.round(an.duration * 10) / 10, file: rel, sha256: sha, license: license || was.license || 'yours', source: source || was.source || 'added with om music add', ...((credit || was.credit) ? { credit: credit || was.credit } : {}), origin: 'user', added: new Date().toISOString().slice(0, 10) };
  lib.tracks = lib.tracks.filter((t) => t.id !== id).concat(rec);
  saveLibrary(lib);
  return { rec, an };
}

export function useTrack(id, dir, { start = null, bpm = null, log = () => {} } = {}) {
  const project = openProject(dir);
  let t = pick(id);
  if (!t.installed) {
    if (t.origin !== 'catalog') throw new OmError(`${t.id}: the file is gone from ${musicDir()} — om music add it again`);
    log(`music    ${t.id} is not on this machine yet — fetching it`);
    buildMusic({ only: [t.id], log });
    t = pick(t.id);
  }
  const rel = attachMusic(project, join(musicDir(), t.file), { start, bpm, name: t.name, credit: t.credit ? `${t.name} — ${t.credit}${t.license ? ` (${t.license})` : ''}` : null });
  return `music    ${t.name} → ${rel}${t.bpm ? ` · ${Math.round(t.bpm)} bpm` : ''}${t.duration ? ` · ${fmt(t.duration)}` : ''}\n         declared in index.html as OM.music({ src: '${rel}' })${t.credit ? '\n         credit written to assets/music/CREDITS.md — keep it with the film' : ''}\nnext     om sound ${dir}   (reads the track's beats, lays it under the film, puts OM.beat / OM.downbeat / OM.drop on them)`;
}

export async function music(pos, flags, log) {
  const [sub, ...rest] = pos;
  if (!sub || sub === 'list' || flags.list) {
    const tracks = listTracks();
    return flags.json ? JSON.stringify(tracks, null, 1) : formatList(tracks);
  }
  if (sub === 'build') return buildMusic({ only: rest.length ? rest : null, log });
  if (sub === 'use') {
    if (!rest[0]) throw new OmError('usage: om music use <id> <dir> [--start sec] [--bpm n]');
    const n = (v) => (v == null || v === true ? null : Number(v));
    return useTrack(rest[0], rest[1] || '.', { start: n(flags.start), bpm: n(flags.bpm), log });
  }
  if (sub === 'add') {
    if (!rest[0]) throw new OmError('usage: om music add <file> --mood warm,calm --name "…" [--license "…"] [--source "…"] [--credit "…"]');
    const str = (v) => (typeof v === 'string' ? v : null);
    const { rec, an } = addTrack(rest[0], { name: str(flags.name), mood: str(flags.mood) || '', license: str(flags.license), source: str(flags.source), credit: str(flags.credit) });
    return `music    added "${rec.name}" as ${rec.id} · ${Math.round(rec.bpm)} bpm (confidence ${an.confidence.toFixed(2)}${an.confidence < LOW_CONFIDENCE ? ' — no clear pulse: cuts cannot sit on its beat' : ''}) · ${fmt(rec.duration)}\n         om music use ${rec.id} <dir>   puts it into a film`;
  }
  throw new OmError('usage: om music [--list]            the tracks on this machine\n       om music build [ids…]       download the default library (checked by sha256)\n       om music use <id> <dir>     copy a track into a project and declare it\n       om music add <file> --mood … --name …   register a track of your own');
}
