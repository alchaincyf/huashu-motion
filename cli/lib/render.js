// om render: the film as a video file, through the huashu-motion renderer (render-om.js). Output always
// lands in <project>/out/ with a new name — a render never overwrites a file the user may already have shared.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { OmError, readSource, readVariables } from './project.js';
import { FORMATS, renderOm } from './render-om.js';

const ALPHA = ['mov', 'webm'];

// The next free version, claimed at once (an empty file created exclusively), so two renders started together —
// the studio and a terminal — never pick the same name and one never overwrites the other.
export function nextOutput(project, ext) {
  const dir = join(project.root, 'out');
  mkdirSync(dir, { recursive: true });
  const base = project.root.split(sep).pop();
  // one past the highest version of any format: a deleted v1–v3 beside a kept v4 gives v5, never a new "v1"
  const top = Math.max(0, ...readdirSync(dir).map((f) => (f.startsWith(`${base}-v`) ? parseInt(f.slice(base.length + 2), 10) || 0 : 0)));
  for (let v = top + 1; ; v++) {
    const file = join(dir, `${base}-v${v}.${ext}`);
    try { writeFileSync(file, '', { flag: 'wx' }); return file; } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
}

// --transparent: an overlay layer for an editor (剪映 / Premiere / Final Cut). MOV is ProRes 4444
// with alpha (WebM VP9 alpha also works); a composition that declares a boolean variable
// `transparent` gets it set to true for this render (hide the footage, clear the background); the
// sound is dropped because the edit underneath already has it; and the result is checked for alpha.
export async function render(project, { format, fps, out, transparent = false, blur = 1, engine, video = 'extract', workers, frameFormat, tune = {}, allowPageErrors = false, prepare = null, onLog = () => {}, onNote = onLog, onWarn = () => {} } = {}) {
  if (engine && engine !== 'om') throw new OmError(engine === 'hyperframes' ? 'the HyperFrames renderer was removed — om render uses its own engine now (drop --engine)' : '--engine must be om');
  const { html } = readSource(project);
  format = format || (transparent ? 'mov' : 'mp4');
  // Default to the frame rate the composition asks for (data-fps on the root), else 30.
  const rootTag = /<[a-z][\w-]*\b[^>]*\sdata-composition-id\s*=[^>]*>/i.exec(html)?.[0] || '';
  fps = Number(fps || /\sdata-fps\s*=\s*["']?(\d+)/.exec(rootTag)?.[1] || 30);
  if (!FORMATS.includes(format)) throw new OmError(`format must be one of ${FORMATS.join(', ')}`);
  if (transparent && !ALPHA.includes(format)) throw new OmError(`--transparent needs a format with alpha: ${ALPHA.join(' or ')} (${format} has none)`);
  if (![24, 25, 30, 50, 60].includes(Number(fps))) throw new OmError('fps must be 24, 25, 30, 50 or 60');
  // --blur N: motion blur by rendering N subframes per output frame and averaging them, the way a
  // film camera's open shutter smears fast motion. Fast moves stop strobing; still frames are unchanged.
  // `--blur` alone: as many subframes as fit, up to 8 (4 leaves visible ghosts on very fast moves).
  blur = blur === true ? Math.min(8, Math.floor(240 / fps)) : Math.round(Number(blur) || 1);
  if (blur > 1 && (transparent || format === 'gif')) throw new OmError('--blur works with mp4, mov and webm (not with --transparent or gif)');
  if (blur > 1 && fps * blur > 240) throw new OmError(`--blur ${blur} at ${fps} fps needs ${fps * blur} sub-frames a second; the limit is 240 — lower --blur or --fps`);
  const switchVar = transparent && readVariables(html).some((v) => v.id === 'transparent' && v.type === 'boolean');
  const claimed = !out;
  const target = out || nextOutput(project, format);
  let r;
  try {
    r = await renderOm(project, { fps, out: target, format, transparent, blur, video, variables: switchVar ? { transparent: true } : null, ...(workers ? { workers } : {}), ...(frameFormat ? { frameFormat } : {}), ...tune, allowPageErrors, prepare, verify: transparent ? (file) => checkOverlay(file, switchVar, onWarn) : null, onLog, onNote, onWarn });
  } catch (e) {
    // the version we claimed stays free for the next try (only the empty placeholder is removed, never a film)
    if (claimed && existsSync(target) && statSync(target).size === 0) unlinkSync(target);
    throw e;
  }
  const { token } = readSource(project); // what was rendered: the source after the sound refresh
  onLog(`done     ${r.frames} frames in ${r.stats.renderSeconds.toFixed(1)}s (${(r.frames / r.stats.renderSeconds).toFixed(1)} fps), total ${r.stats.totalSeconds.toFixed(1)}s, workers ${r.stats.workers}, sound ${r.stats.audio}${r.stats.loudness?.lufs != null ? `, ${r.stats.loudness.lufs} LUFS` : ''}`);
  mkdirSync(project.om, { recursive: true });
  writeFileSync(join(project.om, 'renders.jsonl'), JSON.stringify({ at: new Date().toISOString(), out: target, token, fps, format, engine: 'om', video, workers: r.stats.workers, seconds: r.stats.totalSeconds, ...(blur > 1 ? { blur } : {}), ...(transparent ? { transparent: true } : {}) }) + '\n', { flag: 'a' });
  return target;
}

// Make sure an overlay really is see-through: an alpha pixel format, and a middle frame that is not opaque
// everywhere (the usual mistake is a painted html/body/root background).
function checkOverlay(target, switchVar, onWarn) {
  const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20 });
  const probe = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt:format=duration', '-of', 'json', target]);
  const info = JSON.parse(probe.stdout || '{}');
  const pix = info.streams?.[0]?.pix_fmt || '';
  // VP9 keeps alpha in a side stream that ffprobe reports as plain yuv420p; the encoder setting is the guarantee there
  if (!/\.webm$/i.test(target) && !/^(yuva|gbrap|rgba|bgra|argb|abgr|ya)/.test(pix)) throw new OmError(`${target} has no alpha channel (pixel format ${pix || 'unknown'})`);
  const mid = String((Number(info.format?.duration) || 0) / 2);
  const a = spawnSync('ffmpeg', ['-v', 'error', ...(/\.webm$/i.test(target) ? ['-c:v', 'libvpx-vp9'] : []), '-ss', mid, '-i', target, '-vf', 'alphaextract,scale=96:-1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 64 << 20 });
  const px = a.stdout || Buffer.alloc(0);
  if (a.status === 0 && px.length && px.every((v) => v === 255)) {
    onWarn(`the overlay is opaque at ${Number(mid).toFixed(1)}s — give html, body and the root element a transparent background${switchVar ? '' : ' (or declare a boolean variable "transparent" that does it; --transparent sets it to true)'}`);
  }
}
