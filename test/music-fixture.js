// A synthesized song with known beats, written as a WAV (kick on every beat, accented on the bar line, snare on 2 and 4,
// hats on the off-beats, a quiet intro and a louder body) — the stand-in for "a track the user brought" in the music
// tests. Nothing audio is committed to the repository.
import { writeFileSync } from 'node:fs';

export const RATE = 48000;
const rng = (seed) => { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };

function kick(buf, t, vel) {
  const r = Math.round(t * RATE), n = Math.round(0.35 * RATE);
  for (let i = 0; i < n && r + i < buf.length; i++) {
    const s = i / RATE, ph = 2 * Math.PI * (45 * s + (110 - 45) * 0.04 * (1 - Math.exp(-s / 0.04)));
    buf[r + i] += vel * Math.sin(ph) * Math.exp(-s / 0.12);
  }
}
function noise(buf, t, vel, tau, rand) {
  const r = Math.round(t * RATE), n = Math.round(tau * 6 * RATE);
  let prev = 0;
  for (let i = 0; i < n && r + i < buf.length; i++) { const w = rand() * 2 - 1; buf[r + i] += vel * (w - prev) * 0.5 * Math.exp(-i / RATE / tau); prev = w; }
}

// Truth: beat k at t0 + k·60/bpm; bar lines every 4th beat from k = 0.
export function song({ bpm = 120, bars = 16, intro = 4, t0 = 0.1, tailSec = 1 } = {}) {
  const beat = 60 / bpm, dur = t0 + bars * 4 * beat + tailSec, n = Math.round(dur * RATE), L = new Float32Array(n), rand = rng(bpm);
  for (let i = 0; i < n; i++) L[i] += 0.06 * Math.sin((2 * Math.PI * 220 * i) / RATE);
  for (let k = 0; k < bars * 4; k++) {
    const t = t0 + k * beat, full = k >= intro * 4;
    noise(L, t + beat / 2, full ? 0.25 : 0.1, 0.02, rand);
    if (full) {
      kick(L, t, k % 4 === 0 ? 0.9 : 0.65);
      if (k % 4 === 1 || k % 4 === 3) noise(L, t, 0.35, 0.06, rand);
    }
  }
  return { L, R: Float32Array.from(L, (v) => v * 0.98), rate: RATE, bpm, beat, t0, bars, intro, duration: dur };
}

export function writeWav(file, { L, R }) {
  const n = L.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  const q = (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
  for (let i = 0; i < n; i++) { b.writeInt16LE(q(L[i]), 44 + i * 4); b.writeInt16LE(q(R[i]), 46 + i * 4); }
  writeFileSync(file, b);
  return file;
}

// A song with harmony, for the tempo-count and bar-line tests. A pad changes chord on every bar line (Am F C G, three sines each,
// so the chords share few notes); the kick plays on every beat with the loudest hit on beat `accent` (0-based) of the bar, a snare
// on 2 and 4, hats on the off-beats. `echo`: a loud dotted-eighth click (every 3/4 beat, i.e. a pulse of bpm × 4/3) over it,
// the layer that makes a tracker count the music four thirds too fast.
const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
export function chordSong({ bpm = 92, bars = 40, t0 = 0.1, accent = 0, echo = false, echoGain = 0.9, kickGain = 1, padGain = 0.12, hats = true, tailSec = 1 } = {}) {
  const beat = 60 / bpm, bar = 4 * beat, dur = t0 + bars * bar + tailSec, n = Math.round(dur * RATE), L = new Float32Array(n), rand = rng(bpm + 7);
  for (let b = 0; b < bars; b++) {
    const a = Math.round((t0 + b * bar) * RATE), z = Math.min(n, Math.round((t0 + (b + 1) * bar) * RATE)), ch = CHORDS[b % 4];
    for (let i = a; i < z; i++) {
      const fade = Math.min(1, (i - a) / (0.02 * RATE), (z - i) / (0.02 * RATE)), t = i / RATE;
      L[i] += padGain * fade * (Math.sin(2 * Math.PI * ch[0] * t) + Math.sin(2 * Math.PI * ch[1] * t) + Math.sin(2 * Math.PI * ch[2] * t)) / 3;
    }
  }
  for (let k = 0; k < bars * 4; k++) {
    const t = t0 + k * beat;
    kick(L, t, kickGain * (k % 4 === accent ? 0.95 : 0.6));
    if (k % 4 === 1 || k % 4 === 3) noise(L, t, 0.3, 0.06, rand);
    if (hats) noise(L, t + beat / 2, 0.12, 0.02, rand);
  }
  if (echo) for (let t = t0 + 0.75 * beat; t < t0 + bars * bar; t += 0.75 * beat) { noise(L, t, echoGain, 0.03, rand); kick(L, t, 0.7 * echoGain); }
  return { L, R: Float32Array.from(L, (v) => v * 0.98), rate: RATE, bpm, beat, bar, t0, bars, duration: dur };
}
