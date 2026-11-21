// The ten generated tracks of the default pack, against reference answers from two beat models trained on human annotations
// (numbers only in refpack.json; the audio is not in the repository). Skipped when the mp3s are not on this machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeFile } from '../cli/lib/beats.js';

const here = dirname(fileURLToPath(import.meta.url)), dir = join(here, '..', '_music-pack-draft');
const ref = JSON.parse(readFileSync(join(here, 'refpack.json'), 'utf8')).tracks;
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.mp3$/i.test(f)) : [];
const skip = files.length ? false : '_music-pack-draft/ is not on this machine';
// 03: both models put the beat half a beat (about 0.28 s) from the onset grid; the tempo is right, the beat phase is not
const KNOWN_PHASE = new Set(['03']);

for (const id of Object.keys(ref)) {
  test(`reference pack ${id} ${ref[id].file}: tempo, bar line and the end of the music agree with the reference`, { skip, timeout: 120000 }, () => {
    const f = files.find((x) => x.startsWith(id));
    assert.ok(f, `no file for ${id}`);
    const r = ref[id], an = analyzeFile(join(dir, f));
    assert.ok(Math.abs(an.bpm - r.bpm) / r.bpm < 0.005, `${an.bpm} bpm against ${r.bpm}`);
    if (!KNOWN_PHASE.has(id)) {
      const d = Math.min(...an.downbeats.map((t) => Math.abs(t - r.refBarLines[0])));
      assert.ok(d < 0.08, `bar line ${(d * 1000).toFixed(0)} ms from the reference at ${r.refBarLines[0]} s`);
    }
    // a spoken label follows the music after a silence: `end` sits before it, nothing of it is in the music
    assert.ok(an.tail, 'the tail piece is found');
    assert.ok(an.end < an.tail.from - 0.3 && an.tail.to <= an.duration + 0.01, `end ${an.end}, tail ${JSON.stringify(an.tail)}`);
    assert.ok(an.beats.at(-1) <= an.end + 1e-6 && an.downbeats.at(-1) <= an.end + 1e-6);
  });
}
