import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findChrome } from '../cli/lib/browser.js';
import { checkPage, checkSource } from '../cli/lib/check.js';
import { makeFilm } from './fixture-film.js';

const codes = (found, level) => found.filter((f) => !level || f.level === level).map((f) => f.code);

test('check (source): a clean film has no errors, and the om-score is not read as JavaScript', () => {
  const { project } = makeFilm({ sound: false });
  assert.deepEqual(codes(checkSource(project), 'error'), []);
});

test('check (source): the mistakes that break a render are errors, clock and random use are warnings', () => {
  const { project, index } = makeFilm({
    sound: false,
    body: '<img src="assets/nope.png"><b data-var-text="ghost">x</b><i id="twice"></i><i id="twice"></i>',
    script: 'gsap.to("#box", { left: 200, duration: 1 }); const r = Math.random(); const d = Date.now();',
  });
  writeFileSync(join(index, '..', 'draft.html'), '<div data-composition-id="draft" data-width="10" data-height="10"></div>');
  const found = checkSource(project);
  for (const c of ['missing-file', 'unknown-variable', 'duplicate-id', 'layout-motion', 'several-compositions']) assert.ok(codes(found, 'error').includes(c), `${c} in ${JSON.stringify(found)}`);
  for (const c of ['random', 'clock']) assert.ok(codes(found, 'warning').includes(c), c);
  assert.ok(found.find((f) => f.code === 'layout-motion').line > 1, 'points at the line');
});

test('check (source): a script that does not parse is an error with its line', () => {
  const { project } = makeFilm({ sound: false, script: 'const a = ;' });
  const f = checkSource(project).find((x) => x.code === 'script-syntax');
  assert.ok(f && f.line > 10, JSON.stringify(f));
});

test('check (page): frames that depend on what was played before are found; a clean film passes', { skip: !findChrome() && 'no Chrome' }, async () => {
  const clean = makeFilm({ sound: false, video: false });
  assert.deepEqual(codes(await checkPage(clean.project, { samples: 6 }), 'error'), []);
  // the box only moves after the timeline has been played through 0.3 s: jumping straight to a later time misses that
  const { project } = makeFilm({ sound: false, video: false, script: 'let armed = false; const real = window.__timelines.film.seek; window.__timelines.film.seek = (t) => { if (t > 0.2 && t < 0.4) armed = true; real(armed ? t : 0); };' });
  const found = await checkPage(project, { samples: 30 });
  assert.ok(codes(found).includes('history-dependent'), JSON.stringify(found));
});

test('check (source): Array.from with an arrow that returns layout, and a file name with a literal %, are not errors', () => {
  const { project } = makeFilm({ sound: false, body: '<div style="background:url(assets/100%.png)"></div>', script: 'const rows = Array.from({ length: 3 }, (_, i) => ({ top: i * 10, height: 8 }));' });
  writeFileSync(join(project.root, 'assets', '100%.png'), '');
  assert.deepEqual(codes(checkSource(project), 'error'), []);
});

test('om check --source: a film that draws the product instead of showing it is warned about', async () => {
  const { checkSource } = await import('../cli/lib/check.js');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const film = (body) => { const root = mkdtempSync(join(tmpdir(), 'om-real-')); writeFileSync(join(root, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body><div data-composition-id="f" data-width="320" data-height="180">${body}</div><script>window.__timelines={f:{seek(){},pause(){},duration(){return 2}}}</script></body></html>`); return { root, index: join(root, 'index.html'), om: join(root, '.om') }; };
  const codes = (body) => checkSource(film(body)).map((f) => f.code);
  assert.ok(codes('<div class="ui"></div>').includes('no-real-material'));
  assert.ok(codes('<img src="assets/icon128.png">').includes('only-logo'));
  assert.ok(codes('<img src="https://placehold.co/600x400"><img src="assets/shot.png">').includes('placeholder'));
  const real = codes('<img src="materials/web-site/screen-01.png">');
  assert.ok(!real.includes('no-real-material') && !real.includes('only-logo'));
  assert.ok(real.includes('no-materials-list'));
  // a real file whose name only contains "om-" (zoom-in, bottom-bar, custom-chart) is still real material (#5)
  for (const src of ['materials/zoom-in.png', 'assets/bottom-bar.png', 'assets/custom-chart.png']) assert.ok(!codes(`<img src="${src}">`).includes('no-real-material'), src);
});

test('check (page): whitespace between tags does not judge a parent by its hidden children', { skip: !findChrome() && 'no Chrome' }, async () => {
  // a title block whose lines are hidden (they fade in later) and would run off the frame: nothing to warn about yet
  const { project } = makeFilm({ sound: false, video: false, body: '<div id="end">\n  <h1 style="position:absolute;left:200px;top:120px;margin:0;font-size:30px;white-space:nowrap;opacity:0">a long closing title</h1>\n  <p style="position:absolute;left:200px;top:150px;margin:0;opacity:0">and a subtitle</p>\n</div>' });
  const found = await checkPage(project, { samples: 4 });
  assert.deepEqual(found.filter((f) => /^text-|low-contrast/.test(f.code)), [], JSON.stringify(found));
});
