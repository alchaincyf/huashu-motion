#!/usr/bin/env node
// om — the huashu-motion command line. Agents and people use the same commands.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OmError, openProject, readSource, readVariables, scan, setVariables, undo, writeSource, snapshot } from './lib/project.js';
import { claim, comments, pending, resolve as resolveComment, setStatus } from './lib/inbox.js';
import { findChrome, chromeVersion, NO_CHROME } from './lib/browser.js';
import { render } from './lib/render.js';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')).version;

const HELP = `huashu-motion ${VERSION} — motion graphics made by your coding agent, edited by pointing at the frame.

  om grab <url|folder> [dir]   the product's real material into <dir>/materials/: page screenshots, logo, images, its colours and type (a URL), or the project's own screenshots, icons, media and stylesheet colours (a folder)
  om new <dir> [--template t]   start a project (om templates lists them)
  om templates                  starter projects and what each is good for
  om demo [dir]                 copy the showcase film and open it in the studio
  om studio [dir] [--lang zh|en|es]   live preview, direct edits, comments for the agent (UI language; also OM_LANG)
  om inbox [dir] [--wait]       list comments; --wait blocks, claims the next one and prints it
  om look <id|--at sec> [dir]   save the frame (and a close-up of the clicked spot) as PNGs to look at
  om done <id> [dir] --note …   mark a comment handled (the studio shows the note)
  om fonts [add <family> [dir]] list the bundled typefaces, or install one into a project
  om vars [dir]                 list editable variables
  om set key=value… [dir]       change variable defaults in index.html
  om scan [dir]                 JSON map of variables, objects and scenes (for agents)
  om undo [dir]                 restore the previous saved version
  om render [dir] [--format mp4|mov|webm|gif] [--fps 30]   export to <dir>/out/
  om render [dir] --blur [n]     motion blur: n subframes averaged per frame (default up to 8; fast moves stop strobing)
  om render [dir] --silent       export without the "no soundtrack" warning
  om render [dir] [--workers n] [--video extract|seek] [--frames jpg|png]   browsers at once (default: up to 8), how footage is read, the footage cache
  om check [dir] [--samples n] [--source] [--json]   before rendering: structure, scripts, files, motion rules, then sampled frames (cut-off, covered or low-contrast text, blank ends, history-dependent frames)
  om qa [dir|video] [--loop]     check a render: single-frame pops, dead time, hard cuts, motion curve, loop seam
  om render [dir] --transparent  overlay for 剪映/Premiere: ProRes 4444 with alpha (or --format webm), no sound
  om fork <dir> <newdir> --size 1080x1920   copy into a new frame size; the re-layout lands in the inbox
  om voice <dir> --text <file|"文本"> | --audio <file> [--voice say:Tingting|zf_xiaobei] [--fit]   narration, word cues, .srt
  om sound [dir] [--list] [--off]   music + sound effects from the scenes, OM.sfx hits and an om-score (om render refreshes it)
  om still <page.html|dir> [--at 0,2.5] [--out file]   a PNG of any page (direction key frames, treatment stills)
  om swatch [directions.md] [--out file]   the Palette: lines of the direction cards as one PNG, with contrast and house-look checks
  om learn [topics…]            before a film: this user's preferences + past experience on those topics
  om learn harvest [dir]        after a film: its studio comments and edits, and what is worth keeping
  om learn add "…" --kind preference|observed|verified --topics a,b --evidence "…" [--do "…"]   keep one finding
  om samples [build [ids…]]      the real-instrument pack (piano, strings, drums…; CC0/CC-BY, ~55 MB): status, or build it once
  om share [dir] [--from s] [--to s]   after a render: a ≤10 MB GIF (opening + end frame) and share.md (post, README header)
  om export html [dir] [--out folder] [--title …] [--desc …]   share page (player, Remix prompt, source.zip) for any static host
  om doctor                     check Node, FFmpeg and the renderer

Docs: skills/huashu-motion/SKILL.md`;

function parse(argv) {
  const flags = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { flags, pos };
}

const out = (x) => console.log(typeof x === 'string' ? x : JSON.stringify(x, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

function copyTemplate(from, dir) {
  const target = resolve(dir);
  // a folder that already holds research or assets is fine; one that already holds a film is not
  if (existsSync(join(target, 'index.html'))) throw new OmError(`${target} already has an index.html — pick a new folder (om never overwrites a project)`);
  cpSync(from, target, { recursive: true, force: false, errorOnExist: false, filter: (src) => !/[\\/](out|\.om|snapshots|template\.json)([\\/]|$)/.test(src.slice(from.length)) });
  return target;
}

// What the agent needs to act on a comment without opening the studio.
function describe(project, c) {
  const { html } = readSource(project);
  const lines = html.split('\n');
  const hits = c.target ? lines.map((l, i) => [i + 1, l]).filter(([, l]) => l.includes(`data-om-id="${c.target}"`) || l.includes(`data-om-id='${c.target}'`) || new RegExp(`OM\\.region\\(\\s*["']${c.target}["']`).test(l)) : [];
  const s = scan(html);
  const at = c.t != null ? `${c.t.toFixed(2)}s` : 'no time';
  return [
    `COMMENT ${c.id}  (${at}${c.scene ? `, scene "${c.scene}"` : ''}${c.target ? `, on #${c.target}` : ''}${c.x != null ? `, at x=${Math.round(c.x)} y=${Math.round(c.y)} of ${s.width}×${s.height}` : ''})`,
    `  “${c.text}”`,
    ...(c.thread || []).map((m) => m.who === 'agent' ? `  you replied: ${m.text}` : `  user, reopening: “${m.text}”  ← this is what to fix now`),
    hits.length ? `\nSOURCE ${project.index}\n` + hits.map(([n, l]) => `  ${n}: ${l.trim().slice(0, 200)}`).join('\n') : `\nSOURCE ${project.index}`,
    c.element ? `\nELEMENT\n  ${c.element.replace(/\s+/g, ' ').slice(0, 400)}` : '',
    s.variables.length ? `\nVARIABLES\n` + s.variables.map((v) => `  ${v.id} = ${JSON.stringify(v.value)}`).join('\n') : '',
    s.scenes.length ? `\nSCENES  ${s.scenes.map((x) => x.id).join(' → ')}` : '',
    `\nLOOK  om look ${c.id} ${project.root}   (saves the frame and a close-up of the clicked spot)`,
    `\nNEXT  Edit index.html to do exactly this (keep everything else). The studio reloads on save.`,
    `      Then: om done ${c.id} --note "<one line on what changed>"   (from ${project.root})`,
  ].filter(Boolean).join('\n');
}

async function main() {
  const [cmd = 'help', ...rest] = process.argv.slice(2);
  const { flags, pos } = parse(rest);

  switch (cmd) {
    case 'help': case '--help': case '-h': return out(HELP);
    case 'version': case '--version': case '-v': return out(VERSION);

    case 'new': {
      if (!pos[0]) throw new OmError('usage: om new <dir>');
      const tpl = join(PKG, 'templates', flags.template || 'blank');
      if (!existsSync(join(tpl, 'index.html'))) throw new OmError(`no template "${flags.template}" — run \`om templates\``);
      const dir = copyTemplate(tpl, pos[0]);
      // template.json "copy": {"<package path>": "<project path>"} pulls shared runtimes/fonts in, so
      // templates don't each carry their own copy in the repository.
      let meta = {};
      try { meta = JSON.parse(readFileSync(join(tpl, 'template.json'), 'utf8')); } catch {}
      for (const [from, to] of Object.entries(meta.copy || {})) cpSync(join(PKG, from), join(dir, to), { recursive: true });
      cpSync(join(PKG, 'runtime', 'om.js'), join(dir, 'vendor', 'om.js')); // OM.clock / OM.region / OM.cue, ready when needed
      return out(`created ${dir}\nnext: om studio ${pos[0]}`);
    }

    case 'templates': {
      const root = join(PKG, 'templates');
      const list = readdirSync(root).filter((n) => existsSync(join(root, n, 'index.html'))).map((n) => {
        let meta = {};
        try { meta = JSON.parse(readFileSync(join(root, n, 'template.json'), 'utf8')); } catch {}
        return { id: n, ...meta };
      });
      if (flags.json) return out(list);
      return out(list.map((t) => `${t.id.padEnd(16)} ${t.summary || ''}${t.best_for ? `\n${' '.repeat(17)}good for: ${t.best_for.join(', ')}` : ''}`).join('\n'));
    }

    case 'demo': {
      const src = join(PKG, 'examples', 'showcase');
      if (!existsSync(src)) throw new OmError('this build has no showcase yet — try `om new my-film`');
      const dir = copyTemplate(src, pos[0] || 'huashu-motion-demo');
      process.stdout.write(`copied the showcase to ${dir}\n`);
      return studio(dir, flags);
    }

    case 'studio': return studio(pos[0] || '.', flags);

    case 'inbox': {
      const project = openProject(pos[0] || '.');
      if (!flags.wait) {
        const list = flags.all ? comments(project) : comments(project).filter((c) => c.status !== 'done' && c.status !== 'cancelled');
        if (flags.json) return out(list);
        if (!list.length) return out('inbox empty');
        return out(list.map((c) => `${c.id}  [${c.status}]  ${c.t != null ? c.t.toFixed(2) + 's  ' : ''}${c.target ? '#' + c.target + '  ' : ''}${c.text}`).join('\n'));
      }
      const deadline = flags.timeout ? Date.now() + Number(flags.timeout) * 1000 : Infinity;
      if (!flags.quiet) process.stderr.write(`waiting for comments on ${project.root} — open the studio and click the frame…\n`);
      for (;;) {
        const next = pending(project)[0];
        if (next) {
          snapshot(project, readSource(project).html, `before ${next.id}`); // undo returns to exactly this
          claim(project, next.id, flags.agent || 'agent');
          return out(flags.json ? next : describe(project, next));
        }
        if (Date.now() > deadline) { process.exitCode = 3; return out('no comments before timeout'); }
        await sleep(400);
      }
    }

    case 'look': {
      // pos[0] is a comment id or (with --at) the project dir
      const byComment = !flags.at;
      const project = openProject((byComment ? pos[1] : pos[0]) || '.');
      let t = Number(flags.at), x = null, y = null;
      if (byComment) {
        const c = comments(project).find((k) => k.id === pos[0]);
        if (!c) throw new OmError(`no comment ${pos[0]} — usage: om look <comment-id> [dir]  or  om look [dir] --at 2.5`);
        if (c.t == null) throw new OmError(`comment ${c.id} has no time`);
        ({ t, x, y } = c);
      }
      if (!Number.isFinite(t)) throw new OmError('need a time: --at <seconds>');
      const s = scan(readSource(project).html);
      const dir = join(project.om, 'look', `${byComment ? pos[0] : 't' + t.toFixed(2)}-${Date.now().toString(36)}`);
      mkdirSync(dir, { recursive: true });
      const { openFilm } = await import('./lib/capture.js');
      const film = await openFilm(project.index, { video: 'seek' }); // one browser: the same seek path as the render
      const shots = [];
      try {
        await film.seek(t);
        writeFileSync(join(dir, 'frame.png'), await film.shot());
        shots.push(join(dir, 'frame.png'));
        if (x != null && s.width) {
          const w = Math.round(s.width / 4), h = Math.round(s.height / 4);
          const zx = Math.max(0, Math.min(s.width - w, Math.round(x - w / 2))), zy = Math.max(0, Math.min(s.height - h, Math.round(y - h / 2)));
          writeFileSync(join(dir, 'zoom.png'), await film.shot({ clip: { x: zx, y: zy, width: w, height: h, scale: 2 } }));
          shots.push(`${join(dir, 'zoom.png')}   (close-up ${w}×${h} at 2x around x=${Math.round(x)} y=${Math.round(y)})`);
        }
      } finally { await film.close(); }
      return out(`frame at ${t.toFixed(2)}s — open these images to see what the user saw:\n` + shots.map((p) => '  ' + p).join('\n'));
    }

    case 'done': {
      if (!pos[0]) throw new OmError('usage: om done <comment-id> [dir] --note "…"');
      const project = openProject(pos[1] || '.');
      snapshot(project, readSource(project).html, `after ${pos[0]}`);
      resolveComment(project, pos[0], flags.note === true ? '' : flags.note || '');
      return out(`done ${pos[0]}`);
    }

    case 'reopen': case 'cancel': {
      const project = openProject(pos[1] || '.');
      setStatus(project, pos[0], cmd, flags.note || '');
      return out(`${cmd} ${pos[0]}`);
    }

    case 'fonts': {
      const { families, addFamily } = await import('./lib/fonts.js');
      if (pos[0] === 'add') {
        if (!pos[1]) throw new OmError('usage: om fonts add "<family>" [dir]');
        const r = addFamily(openProject(pos[2] || '.'), pos[1]);
        return out(`added ${r.family} (${r.faces.join(', ')}) — use font-family: "${r.family}"`);
      }
      return out(families().map((f) => `${f.family.padEnd(22)} ${f.faces.join(' ').padEnd(16)} ${f.note}`).join('\n'));
    }

    case 'vars': {
      const project = openProject(pos[0] || '.');
      const vars = readVariables(readSource(project).html);
      if (flags.json) return out(vars);
      return out(vars.length ? vars.map((v) => `${v.id.padEnd(18)} ${String(v.type).padEnd(7)} ${JSON.stringify(v.default)}   ${v.label || ''}`).join('\n') : 'no variables declared');
    }

    case 'set': {
      const pairs = pos.filter((p) => p.includes('='));
      const dir = pos.find((p) => !p.includes('=')) || '.';
      if (!pairs.length) throw new OmError('usage: om set key=value [key=value…] [dir]');
      const project = openProject(dir);
      const { html, token } = readSource(project);
      const values = Object.fromEntries(pairs.map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]));
      writeSource(project, setVariables(html, values), token, 'om set ' + Object.keys(values).join(', '));
      return out(`set ${Object.keys(values).join(', ')}`);
    }

    case 'scan': return out(scan(readSource(openProject(pos[0] || '.')).html));

    case 'undo': {
      const r = undo(openProject(pos[0] || '.'));
      return out(`restored ${r.restored}`);
    }

    case 'render': {
      const project = openProject(pos[0] || '.');
      // The soundtrack is a function of the timeline: rebuild it so a retimed film never exports stale sound. It reads the
      // timeline from the first render browser; if it rewrites the <audio> tag, the browsers reload the film.
      const { hasSound, refreshRuntime, sound } = await import('./lib/sound.js');
      const log = (l) => process.stderr.write(l + '\n');
      refreshRuntime(project, log); // before the browsers load the film: the page lent to the sound must run the current runtime
      let prepare = null;
      if (!flags.transparent && hasSound(readSource(project).html)) {
        prepare = async (page) => { let rewrote = false; log((await sound(project, { page, onWrite: () => { rewrote = true; } }, log)).split('\n')[0]); return rewrote; };
      } else if (!flags.transparent && !flags.silent) log('warning  no soundtrack — run `om sound` first (or pass --silent if the film is meant to be silent)');
      process.stderr.write('rendering in your Chrome…\n');
      const file = await render(project, { engine: flags.engine, prepare, video: flags.video === true ? undefined : flags.video, workers: flags.workers && Number(flags.workers), frameFormat: flags.frames === true ? undefined : flags.frames, tune: tuning(flags), allowPageErrors: !!flags['allow-page-errors'], format: flags.format, transparent: !!flags.transparent, blur: flags.blur === true ? true : flags.blur && Number(flags.blur), fps: flags.fps && Number(flags.fps), out: flags.out && resolve(flags.out), onLog: flags.verbose ? (l) => process.stderr.write(l + '\n') : () => {}, onNote: log, onWarn: (m) => process.stderr.write(`warning  ${m}\n`) });
      return out(file);
    }

    case 'check': {
      const { check, report } = await import('./lib/check.js');
      const project = openProject(pos[0] || '.');
      const found = await check(project, { page: !flags.source, samples: flags.samples ? Number(flags.samples) : 24, onLog: (l) => process.stderr.write(l + '\n') });
      if (found.some((f) => f.level === 'error')) process.exitCode = 1;
      return out(flags.json ? found : report(found, { root: project.root }));
    }

    case 'qa': {
      // om qa [dir|video] [--loop]: checks the newest render of a project, or a given video file.
      const { qa, report } = await import('./lib/qa.js');
      let file = pos[0] || '.';
      if (!/\.(mp4|mov|webm)$/i.test(file)) {
        const project = openProject(file), dir = join(project.root, 'out');
        const vids = existsSync(dir) ? readdirSync(dir).filter((n) => /\.(mp4|webm|mov)$/i.test(n)).map((n) => join(dir, n)) : [];
        if (!vids.length) throw new OmError('nothing rendered yet — run `om render` first, or pass a video file');
        file = vids.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
      }
      const r = qa(resolve(file), { loop: !!flags.loop });
      return out(flags.json ? r : report(r));
    }

    case 'fork': {
      if (!pos[0] || !pos[1] || !flags.size || flags.size === true) throw new OmError('usage: om fork <dir> <newdir> --size 1080x1920');
      const { fork, parseSize } = await import('./lib/fork.js');
      const r = fork(pos[0], pos[1], parseSize(flags.size));
      return out(`forked ${r.from.width ?? '?'}×${r.from.height ?? '?'} → ${r.to.width}×${r.to.height}: ${r.project.root}\ninbox  ${r.comment.id} — re-lay it out for the new frame (om inbox ${pos[1]} --wait picks it up)`);
    }

    case 'sound': {
      const { sound } = await import('./lib/sound.js');
      return out(await sound(flags.list ? null : openProject(pos[0] || '.'), flags, (l) => process.stderr.write(l + '\n')));
    }
    case 'still': {
      const { still } = await import('./lib/still.js');
      return out(await still(pos[0], { at: flags.at ?? null, out: flags.out || null }));
    }
    case 'swatch': {
      const { swatch } = await import('./lib/swatch.js');
      return out(await swatch(pos[0], { out: flags.out || null }));
    }
    case 'learn': {
      const L = await import('./lib/learn.js');
      if (pos[0] === 'harvest') return out(L.harvest(openProject(pos[1] || '.')));
      if (pos[0] === 'add') return out(L.addEntry({ text: pos.slice(1).join(' '), kind: flags.kind, topics: flags.topics, todo: flags.do, evidence: flags.evidence, project: flags.project }));
      if (pos[0] === 'status') return out(L.learnStatus());
      return out(L.recall(pos));
    }
    case 'samples': {
      const { loadPack, packDir, resetPack } = await import('./lib/samples.js');
      if (pos[0] === 'build') {
        const { buildSamples } = await import('./lib/samples-build.js');
        const r = await buildSamples({ only: pos.length > 1 ? pos.slice(1) : null, log: (l) => process.stderr.write(l + '\n') });
        resetPack();
        return out(r);
      }
      if (pos[0]) throw new OmError('usage: om samples            show the installed pack\n       om samples build [ids…]  download and build it (or rebuild some instruments)');
      const pack = loadPack();
      if (!pack) return out(`samples  none at ${packDir()} — music plays on synthesized instruments.\n         om samples build   fetches the real-instrument pack once (piano, string sections, drum kits…)`);
      const ids = Object.keys(pack.instruments);
      return out(`samples  ${pack.dir}\n         ${ids.length} instruments: ${ids.join(' ')}\n         credits: ${pack.dir}/NOTICE.txt`);
    }
    case 'voice': {
      const { voice } = await import('./lib/voice.js');
      return out(await voice(openProject(pos[0] || '.'), flags, (l) => process.stderr.write(l + '\n')));
    }

    case 'grab': {
      if (!pos[0]) throw new OmError('usage: om grab <url|folder> [dir]   (dir: the film project, default .)');
      const { grab } = await import('./lib/grab.js');
      const root = resolve(pos[1] || '.');
      mkdirSync(root, { recursive: true });
      return out(await grab(root, pos[0], { maxShots: flags.shots ? Number(flags.shots) : 8 }));
    }
    case 'share': {
      const { share } = await import('./lib/share.js');
      return out(share(openProject(pos[0] || '.'), { from: flags.from ?? 0, to: flags.to ?? null, video: flags.video ? resolve(flags.video) : null }));
    }
    case 'export': {
      if (pos[0] !== 'html') throw new OmError('usage: om export html [dir] [--out folder]   (video: om render)');
      const { exportHtml } = await import('./lib/export.js');
      const r = exportHtml(openProject(pos[1] || '.'), { out: flags.out, title: flags.title, description: flags.desc });
      return out(`${r.dir}\n  index.html   open it, or put the folder on any static host (GitHub Pages, Vercel, npx serve)\n  source.zip   ${r.files.length} files — unzip and run om studio ${r.name}`);
    }

    case 'doctor': return doctor();

    default: throw new OmError(`unknown command "${cmd}"\n\n${HELP}`);
  }
}

// Rendering knobs for measuring (not in --help): --shot png|jpeg  --paint 0|1|2  --chunk n  --preset x  --crf n
const tuning = (f) => ({ ...(f.shot && f.shot !== true ? { shotFormat: f.shot } : {}), ...(f.paint != null && f.paint !== true ? { paintWaits: Number(f.paint) } : {}), ...(f.chunk ? { chunk: Number(f.chunk) } : {}), ...(f.preset ? { preset: f.preset } : {}), ...(f.crf ? { crf: Number(f.crf) } : {}), ...(f.software ? { software: true } : {}) });

async function studio(dir, flags) {
  const { startStudio } = await import('./lib/server.js');
  const project = openProject(dir);
  const port = Number(flags.port || 4848);
  let started;
  for (let p = port; p < port + 20 && !started; p++) {
    try { started = await startStudio(project, { port: p, lang: flags.lang }); }
    catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  if (!started) throw new OmError(`no free port from ${port}`);
  out(`studio  ${started.url}\nproject ${project.root}\n\nAgent loop: om inbox ${dir === '.' ? '' : dir + ' '}--wait   (Ctrl-C to stop the studio)`);
  if (!flags['no-open']) openBrowser(started.url);
  await new Promise(() => {});
}

function doctor() {
  const report = [];
  const major = Number(process.versions.node.split('.')[0]);
  report.push([major >= 22, `Node ${process.versions.node}`, major >= 22 ? '' : 'need Node 22 or newer — https://nodejs.org']);
  const has = (bin) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' }).status === 0;
  const ff = (args) => spawnSync('ffmpeg', ['-hide_banner', ...args], { encoding: 'utf8' }).stdout || '';
  const hasFf = has('ffmpeg') && has('ffprobe');
  report.push([hasFf, 'FFmpeg + ffprobe (render, sound, qa)', 'brew install ffmpeg  /  apt install ffmpeg  /  winget install ffmpeg']);
  if (hasFf) {
    const enc = ff(['-encoders']);
    const missing = ['libx264', 'prores_ks', 'libvpx-vp9', 'libopus'].filter((e) => !enc.includes(e));
    report.push([!missing.includes('libx264'), `encoders ${missing.length ? `missing ${missing.join(', ')}` : 'mp4 · mov · webm · gif'}`, missing.length ? 'mp4 needs libx264; mov needs prores_ks; webm needs libvpx-vp9 and libopus — a full FFmpeg build has them all' : '']);
  }
  const browser = findChrome();
  report.push([!!browser, browser ? `Chrome ${chromeVersion(browser) || ''} (${browser})` : 'Chrome (preview, render, stills, sound)', browser ? '' : NO_CHROME]);
  out(report.map(([ok, what, hint]) => `${ok ? '✓' : '✗'} ${what}${hint && !ok ? `  — ${hint}` : ''}`).join('\n'));
  if (report.some(([ok]) => !ok)) process.exitCode = 2;
}

main().catch((e) => {
  if (e instanceof OmError) { console.error(`om: ${e.message}`); process.exitCode = 1; }
  else { console.error(e); process.exitCode = 1; }
});
