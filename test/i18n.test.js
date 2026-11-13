import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGS, pickLang, setLang, t } from '../studio/i18n.js';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CJK = /[一-鿿]/;

test('i18n: every language covers every key of the reference set', () => {
  const ref = Object.keys(LANGS.zh);
  for (const [code, dict] of Object.entries(LANGS)) {
    const missing = ref.filter((k) => !(k in dict));
    const extra = Object.keys(dict).filter((k) => !ref.includes(k));
    assert.deepEqual(missing, [], `${code} is missing keys`);
    assert.deepEqual(extra, [], `${code} has keys zh does not`);
  }
});

test('i18n: the studio page and script keep no hardcoded Chinese outside the dictionary', () => {
  // index.html keeps the zh text as the no-JS fallback, but every such node must carry a data-i18n* attribute.
  const html = readFileSync(join(PKG, 'studio/index.html'), 'utf8');
  for (const line of html.split('\n').filter((l) => CJK.test(l))) assert.match(line, /data-i18n/, `untranslatable line: ${line.trim()}`);
  const js = readFileSync(join(PKG, 'studio/studio.js'), 'utf8');
  assert.equal(js.split('\n').filter((l) => CJK.test(l)).length, 0, 'studio.js still has Chinese literals');
});

test('i18n: language is picked from url, saved choice, server flag, then the browser', () => {
  assert.equal(pickLang({}, { languages: ['es-MX', 'en'] }), 'es');
  assert.equal(pickLang({}, { languages: ['zh-CN'] }), 'zh');
  assert.equal(pickLang({ lang: 'en' }, { languages: ['zh-CN'] }), 'en');
  assert.equal(pickLang({ lang: 'xx' }, { languages: ['de-DE'] }), 'en');
  assert.equal(pickLang({}, { languages: ['de-DE', 'zh'] }), 'zh');
});

test('i18n: t() fills placeholders and falls back to the reference language', () => {
  setLang('es');
  assert.equal(t('status.saved', { n: 3 }), 'Guardado · versión 3');
  setLang('en');
  assert.equal(t('status.waiting', { n: 2 }), '2 comment(s) waiting for an agent');
  assert.equal(t('no.such.key'), 'no.such.key');
});
