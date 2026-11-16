// The huashu-motion renderer: Chrome loads the film, we seek to each frame time, take a picture and
// stream it into ffmpeg; the soundtrack is put under the picture as it is. Any page error, missing
// frame or timeout stops the render with a non-zero exit — a film is never delivered from a run that
// did not go clean.
//
// Speed comes from doing everything at once: all browsers start together, the sound is encoded while
// the picture renders, and the work is dealt to the browsers in small runs of frames.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLoudness, encodeAudio, hasAudio } from './audio.js';
import { openFilm } from './capture.js';
import { cleanupOnInterrupt } from './cdp.js';
import { extractClip } from './frames.js';
import { OmError } from './project.js';

const PRE_ROLL = 2;
const SHUTTER = 0.5; // 180 degrees: the shutter is open for half of each frame interval

// Where a media element's file is on disk (the page reports the URL it resolved, or the attribute as written).
function localPath(src, root) {
  if (!src) return null;
  if (src.startsWith('file:')) return fileURLToPath(src);
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return null; // http(s), data, blob
  return isAbsolute(src) ? src : resolve(root, src.split(/[?#]/)[0]);
}

// Browsers working on one film. Measured on a 14-core Mac: throughput rises to 8 browsers and then stays flat.
export const defaultWorkers = () => Math.max(1, Math.min(8, Math.round(cpus().length * 0.6)));

// Per container: how the picture is encoded (opaque or with alpha) and how the sound goes with it.
const BT709 = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
const yuv = (pix) => `scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=${pix}`;
const CONTAINERS = {
  mp4: {
    picture: ({ preset, crf, fps }) => ({ vf: yuv('yuv420p'), args: ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-g', String(fps * 2), ...BT709, '-movflags', '+faststart'] }),
    sound: { file: 'sound.m4a', codec: ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000'] },
  },
  mov: {
    // ProRes: 422 HQ for an opaque film, 4444 with a 16-bit alpha for an overlay
    picture: ({ alpha }) => (alpha
      ? { vf: yuv('yuva444p10le'), args: ['-c:v', 'prores_ks', '-profile:v', '4', '-alpha_bits', '16', '-vendor', 'apl0', ...BT709] }
      : { vf: yuv('yuv422p10le'), args: ['-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', ...BT709] }),
    sound: { file: 'sound.mov', codec: ['-c:a', 'pcm_s16le', '-ar', '48000'] },
  },
  webm: {
    picture: ({ alpha, fps }) => ({ vf: yuv(alpha ? 'yuva420p' : 'yuv420p'), args: ['-c:v', 'libvpx-vp9', '-crf', '20', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-g', String(fps * 2), ...(alpha ? ['-auto-alt-ref', '0'] : []), ...BT709] }),
    sound: { file: 'sound.webm', codec: ['-c:a', 'libopus', '-b:a', '192k', '-ar', '48000'] },
  },
  // GIF: a near-lossless picture first, then a palette made for this film and applied in a second pass
  gif: {
    picture: ({ fps }) => ({ vf: yuv('yuv444p'), args: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '8', '-g', String(fps * 2), ...BT709] }),
    sound: null,
  },
};
export const FORMATS = Object.keys(CONTAINERS);

export async function renderOm(project, { fps, out, format = 'mp4', transparent = false, blur = 1, video = 'extract', frameFormat = 'png', workers = defaultWorkers(), shotFormat = null, paintWaits = 0, chunk = 8, preset = 'veryfast', crf = 16, software = false, onFrame = null, variables = null, allowPageErrors = false, prepare = null, verify = null, onLog = () => {}, onNote = onLog, onWarn = () => {} }) {
  if (!['extract', 'seek'].includes(video)) throw new OmError('--video must be extract or seek');
  if (!['jpg', 'png'].includes(frameFormat)) throw new OmError('--frames must be jpg or png');
  const box = CONTAINERS[format];
  if (!box) throw new OmError(`format must be one of ${FORMATS.join(', ')}`);
  // an overlay needs the alpha channel all the way: PNG pictures out of Chrome
  const shot = transparent ? 'png' : shotFormat || 'jpeg';
  const t0 = Date.now();
  const at = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const open = (log) => openFilm(project.index, { video, variables, paintWaits, shotFormat: shot, transparent, chromeArgs: software ? ['--disable-gpu-compositing', '--use-angle=swiftshader'] : [], ...(log ? { onLog } : {}) });
  // every browser starts at once; extra ones (a film too short to share) are closed again below
  const want = Math.max(1, Math.round(workers) || 1);
  const opened = await Promise.allSettled(Array.from({ length: want }, (_, i) => open(i === 0)));
  let films = opened.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const failedOpen = opened.find((r) => r.status === 'rejected');
  if (failedOpen) { await Promise.all(films.map((f) => f.close({ fast: true }))); throw failedOpen.reason; }
  // prepare(page): work that needs the loaded film before the first frame (om render refreshes the soundtrack from
  // it). It returns true when it rewrote index.html; the browsers then load the new version.
  if (prepare) {
    let rewrote;
    try { rewrote = await prepare(films[0]); } catch (e) { await Promise.all(films.map((f) => f.close({ fast: true }))); throw e; }
    if (rewrote) {
      await Promise.all(films.map((f) => f.close({ fast: true })));
      const again = await Promise.allSettled(films.map((_, i) => open(i === 0)));
      films = again.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      const failed = again.find((r) => r.status === 'rejected');
      if (failed) { await Promise.all(films.map((f) => f.close({ fast: true }))); throw failed.reason; }
    }
  }
  const film = films[0];
  const sig = await film.evaluate('window.__omEngine.signature()').catch(() => null);
  if (sig) onNote(sig.on ? `signature on: "Made with huashu-motion" in a free corner for the last 1.2s (data-om-signature="off" on the root removes it)` : `signature off (${sig.why})`);
  const tmp = mkdtempSync(join(tmpdir(), 'om-render-'));
  const forgetTmp = cleanupOnInterrupt(() => rmSync(tmp, { recursive: true, force: true }));
  const picture = join(tmp, format === 'gif' ? 'picture.mp4' : `picture.${format}`);
  const stats = {};
  let enc = null;
  try {
    const duration = film.info.duration;
    const frames = Math.round(duration * fps);
    if (!(frames > 0)) throw new OmError('the composition has zero length');
    if (film.info.width % 2 || film.info.height % 2) throw new OmError(`${film.info.width}x${film.info.height}: video needs an even width and height`);
    const count = Math.max(1, Math.min(films.length, Math.ceil(frames / 30)));
    if (count < films.length) { await Promise.all(films.slice(count).map((f) => f.close())); films = films.slice(0, count); }
    onLog(`film     ${film.info.width}x${film.info.height}, ${duration}s at ${fps} fps = ${frames} frames, ${format}${transparent ? ' with alpha' : ''}, video ${video}`);
    onLog(`workers  ${count}  ${at()}`);

    // Footage and sound tracks the page declares.
    // a window without data-duration is open-ended; Infinity comes back from the page as null
    const items = (await film.media()).map((m) => ({ ...m, duration: m.duration == null ? Infinity : m.duration }));
    const tracks = [];
    const clips = items.filter((m) => m.tag === 'video' && m.src);
    if (video === 'extract' && clips.length) {
      const cache = join(project.om, 'cache', 'frames');
      mkdirSync(cache, { recursive: true });
      const queue = clips.slice();
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
        for (let m; (m = queue.shift());) {
          const file = localPath(m.src, project.root);
          if (!file || !existsSync(file)) throw new OmError(`video #${m.id}: ${m.src} is not a file in the project`);
          const span = Math.min(m.duration, Math.max(0, duration - m.start)) * m.rate;
          const table = await extractClip(file, { from: m.mediaStart, to: m.mediaStart + span, cacheDir: cache, format: frameFormat, onLog });
          await Promise.all(films.map((f) => f.setFrames(m.id, table)));
        }
      }));
      stats.clips = clips.length;
      onLog(`footage  ${clips.length} clip(s) ready  ${at()}`);
    }
    for (const m of items) {
      const file = localPath(m.src, project.root);
      if (m.tag === 'audio' && file) tracks.push({ file, start: m.start, duration: m.duration, mediaStart: m.mediaStart, rate: m.rate, volume: m.volume });
      else if (m.tag === 'video' && !m.muted && file && hasAudio(file)) tracks.push({ file, start: m.start, duration: m.duration, mediaStart: m.mediaStart, rate: m.rate, volume: m.volume });
    }
    for (const t of tracks) if (!existsSync(t.file)) throw new OmError(`audio ${t.file} does not exist`);
    // An overlay goes on top of an edit that already has the sound; a GIF has none.
    const withSound = box.sound && !transparent ? tracks : [];
    const soundFile = box.sound && join(tmp, box.sound.file);
    const sound = withSound.length ? encodeAudio(withSound, soundFile, { duration, codec: box.sound.codec }).then(async (r) => {
      // a single wrapped file must come out as loud as it went in (checked on the encoded track, while the picture renders)
      r.loudness = checkLoudness(soundFile, withSound.length === 1 ? withSound.map((t) => t.file) : []);
      return r;
    }) : Promise.resolve({ mode: 'none', tracks: 0 });
    sound.catch(() => {}); // awaited below; a failure there must not surface early as an unhandled rejection

    // Picture: frames into the encoder. With blur, N sub-frames per output frame are averaged by ffmpeg.
    const N = Math.max(1, Math.round(blur) || 1);
    const enc0 = box.picture({ preset, crf, fps, alpha: transparent });
    const vf = [];
    if (N > 1) vf.push(`tmix=frames=${N}`, `select=eq(mod(n\\,${N})\\,${N - 1})`, `setpts=PTS-${N - 1}`);
    vf.push(enc0.vf);
    const args = ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps * N), '-c:v', shot === 'png' ? 'png' : 'mjpeg', '-i', '-', '-vf', vf.join(','),
      ...enc0.args, '-r', String(fps), picture];
    enc = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let encErr = '';
    enc.stderr.on('data', (b) => { encErr += b; });
    const encoded = new Promise((ok, fail) => {
      enc.on('error', (e) => fail(new OmError(`could not start ffmpeg: ${e.message}`)));
      enc.on('close', (code) => (code === 0 ? ok() : fail(new OmError(`ffmpeg stopped (${code}): ${encErr.trim().split('\n').pop()}`))));
    });
    encoded.catch(() => {}); // a render that stops early kills ffmpeg; that must not surface as an unhandled rejection
    enc.stdin.on('error', () => {}); // the close handler above reports why

    const write = async (buf) => {
      if (enc.exitCode != null) throw new OmError(`ffmpeg stopped early: ${encErr.trim().split('\n').pop()}`);
      // an encoder that dies while the pipe is full never drains: wake on its exit too, then report it
      // both listeners go once either fires: a long render waits here every frame and must not pile them up
      if (!enc.stdin.write(buf)) await new Promise((ok) => { const done = () => { enc.stdin.off('drain', done); enc.off('close', done); ok(); }; enc.stdin.once('drain', done); enc.once('close', done); });
      if (enc.exitCode != null) throw new OmError(`ffmpeg stopped early: ${encErr.trim().split('\n').pop()}`);
    };
    // Work goes out in small runs of consecutive frames (chunk), dealt round-robin: a heavy scene is spread over all
    // browsers, and because each browser always gets the same runs, a render repeats exactly (a first-come queue would
    // give a browser different frames each time, and Chrome's painting remembers what it painted before).
    // The encoder gets the frames in order.
    // A browser that skipped frames first replays the timelines through them (no painting): what a timeline remembers is
    // then what a render from frame 0 would have.
    const timesFor = (i) => Array.from({ length: N }, (_, k) => (N === 1 ? i / fps : Math.min(duration, Math.max(0, i / fps + (k / N - 0.5) * SHUTTER / fps))));
    const ready = new Map(); // frame -> its image(s), waiting for its turn
    let writeAt = 0, pumping = false, failed = null, wake = () => {};
    const ahead = count * chunk * 2; // how far past the encoder a browser may run
    const pump = async () => {
      if (pumping) return;
      pumping = true;
      try {
        while (ready.has(writeAt)) { const bufs = ready.get(writeAt); ready.delete(writeAt); writeAt++; wake(); for (const b of bufs) await write(b); }
      } finally { pumping = false; }
    };
    let lastLog = Date.now();
    const tr = Date.now();
    await Promise.all(films.map(async (f, wi) => {
      let pos = -1, c = wi; // last frame this browser has been through
      try {
        for (;;) {
          const start = c * chunk;
          if (failed || start >= frames) return;
          while (!failed && start - writeAt >= ahead) await new Promise((ok) => { wake = ok; setTimeout(ok, 100); });
          c += count;
          if (start > pos + 1) {
            // catch up: the timelines through the skipped frames without painting, then PRE_ROLL painted frames so the
            // compositor is in the state a continuous render would have (without them the chunk's first frames differ slightly)
            const painted = Math.min(PRE_ROLL, start - pos - 1), quiet = start - pos - 1 - painted;
            if (quiet > 0) await f.advance(Array.from({ length: quiet }, (_, j) => timesFor(pos + 1 + j)).flat());
            for (let j = start - painted; j < start; j++) for (const t of timesFor(j)) await f.seek(t);
          }
          for (let i = start; i < Math.min(frames, start + chunk); i++) {
            const bufs = [];
            for (const t of timesFor(i)) {
              await f.seek(t);
              if (f.errors.length && !allowPageErrors) throw new OmError(`the page reported an error at ${t.toFixed(2)}s:\n  ${[...new Set(f.errors)].slice(0, 6).join('\n  ')}`);
              bufs.push(await f.shot());
            }
            if (onFrame) onFrame(i, bufs);
            ready.set(i, bufs);
            pos = i;
            await pump();
          }
          if (Date.now() - lastLog > 2000) { onLog(`frame    ${writeAt}/${frames}  ${(writeAt / ((Date.now() - tr) / 1000)).toFixed(1)} fps`); lastLog = Date.now(); }
        }
      } catch (e) { failed = failed || e; wake(); throw e; }
    }));
    await pump();
    enc.stdin.end();
    await encoded;
    stats.renderSeconds = (Date.now() - tr) / 1000;
    onLog(`encoded  ${at()}`);

    const es = await film.stats();
    Object.assign(stats, { engine: es, workers: count });
    const stalls = films.reduce((n, f) => n + f.stalls, 0);
    if (stalls) onWarn(`${stalls} screenshot(s) had to be asked for again (the machine is very busy); the frames are complete`);
    const errors = films.flatMap((f) => f.errors);
    for (const w of new Set((await Promise.all(films.map((f) => f.stats()))).flatMap((x) => x.warnings))) onWarn(`video ${w}: the clip is shorter than its data-duration — it holds the last frame`);
    if (errors.length && !allowPageErrors) throw new OmError(`the page reported errors:\n  ${[...new Set(errors)].slice(0, 6).join('\n  ')}`);
    if (errors.length) onWarn(`${new Set(errors).size} page error(s) ignored (--allow-page-errors): ${[...new Set(errors)][0]}`);

    // Count the frames before anything else touches the picture: exactly one per frame time, or the render failed.
    const probe = spawnSync('ffprobe', ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', picture], { encoding: 'utf8' });
    const got = Number(/\d+/.exec(probe.stdout)?.[0]);
    if (got !== frames) throw new OmError(`expected ${frames} frames, the picture has ${probe.stdout.trim() || 'none'}${probe.stderr ? ` (${probe.stderr.trim().split('\n').pop()})` : ''}`);

    const final = join(tmp, `film.${format}`);
    const mux = await sound;
    if (format === 'gif') makeGif(picture, final, fps);
    else if (mux.mode === 'none') copyFileSync(picture, final);
    else {
      // both streams are already encoded: the mux only copies them
      const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', picture, '-i', soundFile, '-map', '0:v', '-map', '1:a', '-c', 'copy', ...(format === 'webm' ? [] : ['-movflags', '+faststart']), final], { encoding: 'utf8' });
      if (r.status !== 0) throw new OmError(`could not put the sound under the picture: ${(r.stderr || '').trim().split('\n').pop()}`);
    }
    if (mux.loudness) stats.loudness = mux.loudness;
    stats.audio = mux.mode;
    onLog(`muxed    ${at()}`);
    if (verify) verify(final); // a file that fails its check never reaches out/
    mkdirSync(join(out, '..'), { recursive: true });
    copyFileSync(final, out);
    stats.totalSeconds = (Date.now() - t0) / 1000;
    stats.frames = frames;
    return { out, stats, frames };
  } catch (e) {
    try { enc?.kill('SIGKILL'); } catch { /* gone */ }
    throw e;
  } finally {
    if (process.env.OM_CPU) { // measuring: CPU seconds of every browser process group and the encoder
      const rows = spawnSync('ps', ['-Ao', 'pgid=,time=,comm='], { encoding: 'utf8' }).stdout.split('\n').map((l) => l.trim().split(/\s+/));
      const sec = (t) => t.split(':').reduce((a, x) => a * 60 + Number(x), 0);
      const groups = new Set(films.map((f) => String(f.pid)));
      onLog(`cpu      browsers ${rows.filter((r) => groups.has(r[0])).reduce((a, r) => a + sec(r[1]), 0).toFixed(1)}s`);
    }
    await Promise.all(films.map((f) => f.close({ fast: true })));
    // Windows: a browser can hold files in tmp for a moment after close(); retry, and never let cleanup hide the real result
    try { rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch (err) { onWarn(`could not remove ${tmp}: ${err.code || err.message}`); }
    forgetTmp();
  }
}

// Two passes: a palette made from this film's own colours, then the picture mapped onto it.
function makeGif(picture, out, fps) {
  const palette = join(picture, '..', 'palette.png');
  const a = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', picture, '-vf', 'palettegen=max_colors=256:stats_mode=diff', palette], { encoding: 'utf8' });
  if (a.status !== 0) throw new OmError(`could not make the GIF palette: ${(a.stderr || '').trim().split('\n').pop()}`);
  const b = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', picture, '-i', palette, '-lavfi', `fps=${Math.min(fps, 50)}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, '-loop', '0', out], { encoding: 'utf8' });
  if (b.status !== 0) throw new OmError(`could not write the GIF: ${(b.stderr || '').trim().split('\n').pop()}`);
}
