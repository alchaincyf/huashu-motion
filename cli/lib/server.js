// `om studio`: a loopback server that shows the project in the om player, writes direct edits
// back into index.html, and turns "point at the frame" into inbox comments for the agent.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync, watch } from 'node:fs';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OmError, listHistory, readSource, scan, readVariables, setVariables, snapshot, undo, writeSource } from './project.js';
import { addComment, comments, setStatus } from './inbox.js';
import { render } from './render.js';
import { injectRuntime } from './export.js';

const PKG = resolve(fileURLToPath(import.meta.url), '../../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.txt': 'text/plain; charset=utf-8' };

const STATIC = {
  '/_om/player.js': join(PKG, 'runtime/om-player.js'),
  '/_om/engine.js': join(PKG, 'runtime/om-engine.js'),
};

export function startStudio(project, { port = 4848, host = '127.0.0.1', lang = process.env.OM_LANG } = {}) {
  const csrf = randomBytes(16).toString('hex');
  const clients = new Set();
  let renderJob = null;

  const broadcast = (event, data) => {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(msg);
  };

  const state = () => {
    const { html, token } = readSource(project);
    return { name: project.root.split(sep).pop(), root: project.root, token, scan: scan(html), variables: readVariables(html), comments: comments(project), history: listHistory(project).length, render: renderJob };
  };

  // Every distinct version of index.html we see is kept, whoever wrote it, so undo also covers agent edits.
  snapshot(project, readSource(project).html, 'opened');
  let timer = null;
  const pendingKinds = new Set();
  const watcher = watch(project.root, { recursive: true }, (_, name) => {
    if (!name) return;
    const rel = name.split(sep).join('/');
    if (rel.startsWith('.om/')) { if (rel === '.om/inbox.jsonl') pendingKinds.add('inbox'); else return; }
    else if (rel.startsWith('out/') || rel.startsWith('snapshots/') || rel.startsWith('.git/') || rel.endsWith('.om-tmp') || rel.startsWith('node_modules/')) return;
    else pendingKinds.add('source');
    clearTimeout(timer);
    timer = setTimeout(() => {
      const kinds = [...pendingKinds]; pendingKinds.clear();
      try {
        if (kinds.includes('source')) {
          const { html, token } = readSource(project);
          const working = comments(project).find((c) => c.status === 'working');
          snapshot(project, html, working ? `agent for ${working.id}: ${working.text.slice(0, 40)}` : 'edited outside the studio');
          broadcast('source', { token, scan: scan(html), variables: readVariables(html), history: listHistory(project).length });
        }
        if (kinds.includes('inbox')) broadcast('inbox', { comments: comments(project) });
      } catch (e) { broadcast('problem', { message: e.message }); }
    }, 120);
  });

  const send = (res, status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };

  const readJson = (req) => new Promise((ok, fail) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 1e6) { fail(new OmError('request too large', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch { fail(new OmError('invalid JSON')); } });
  });

  const serveFile = (res, file, inject) => {
    if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, { error: 'not found' });
    if (inject) {
      // The preview gets the engine injected before the composition's own scripts, the way the renderer does it;
      // the user's source never has to reference it.
      let html = readFileSync(file, 'utf8');
      html = injectRuntime(html, '/_om/engine.js');
      return send(res, 200, html, TYPES['.html']);
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(file).pipe(res);
  };

  const server = createServer(async (req, res) => {
    try {
      const hostOk = [`127.0.0.1:${server.address().port}`, `localhost:${server.address().port}`].includes(req.headers.host);
      if (!hostOk) throw new OmError('invalid host', 403);
      const url = new URL(req.url, 'http://local');
      const path = decodeURIComponent(url.pathname);

      if (req.method === 'POST') {
        if (req.headers['x-om-token'] !== csrf) throw new OmError('missing studio token', 403);
        const body = await readJson(req);
        if (path === '/api/vars') {
          const { html } = readSource(project);
          const token = writeSource(project, setVariables(html, body.values || {}), body.token, 'studio: ' + Object.keys(body.values || {}).join(', '));
          return send(res, 200, { token });
        }
        if (path === '/api/comments') return send(res, 200, addComment(project, body));
        const m = /^\/api\/comments\/([\w-]+)\/(cancel|reopen)$/.exec(path);
        if (m) { setStatus(project, m[1], m[2], body.note || ''); return send(res, 200, { ok: true }); }
        if (path === '/api/undo') return send(res, 200, undo(project));
        if (path === '/api/render') {
          if (renderJob?.status === 'running') throw new OmError('a render is already running', 409);
          renderJob = { status: 'running', started: Date.now(), format: body.format || 'mp4', log: [] };
          broadcast('render', renderJob);
          render(project, { format: body.format, fps: body.fps || undefined, onLog: (line) => { renderJob.log = [...renderJob.log.slice(-30), line]; broadcast('render', renderJob); } })
            .then((out) => { renderJob = { ...renderJob, status: 'done', out, finished: Date.now() }; broadcast('render', renderJob); })
            .catch((e) => { renderJob = { ...renderJob, status: 'failed', error: e.message }; broadcast('render', renderJob); });
          return send(res, 202, renderJob);
        }
        throw new OmError('unknown endpoint', 404);
      }

      if (path === '/') {
        const html = readFileSync(join(PKG, 'studio/index.html'), 'utf8').replace('<!--OM_BOOT-->', `<script>window.OM_BOOT=${JSON.stringify({ csrf, lang: lang || undefined })}</script>`);
        return send(res, 200, html, TYPES['.html']);
      }
      if (path === '/api/state') return send(res, 200, state());
      if (path === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(`event: hello\ndata: {}\n\n`);
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      if (STATIC[path]) return serveFile(res, STATIC[path]);
      if (path.startsWith('/_om/')) return serveFile(res, safeJoin(join(PKG, 'studio'), path.slice(5)));
      if (path.startsWith('/out/')) return serveFile(res, safeJoin(project.root, path.slice(1)));
      if (path.startsWith('/p/')) {
        const rel = path.slice(3) || 'index.html';
        if (rel.startsWith('.om/')) throw new OmError('not served', 404);
        return serveFile(res, safeJoin(project.root, rel), rel === 'index.html');
      }
      throw new OmError('not found', 404);
    } catch (e) {
      send(res, e.status || 500, { error: e.message });
    }
  });

  return new Promise((ok, fail) => {
    server.on('error', fail);
    server.listen(port, host, () => {
      const close = () => { watcher.close(); for (const c of clients) c.end(); server.close(); };
      ok({ url: `http://${host === '127.0.0.1' ? 'localhost' : host}:${server.address().port}/`, close, server });
    });
  });
}

function safeJoin(base, rel) {
  const full = normalize(join(base, rel));
  if (relative(base, full).startsWith('..') || full === base) throw new OmError('outside project', 403);
  return full;
}
