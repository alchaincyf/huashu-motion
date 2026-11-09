// Composer mode. The agent writes the score — melody, harmony, voicing, dynamics, pedal, ritardando — in
// ABC notation (the text notation language models already read and write), and this file performs it:
// a tempo map with ritardandos, fermatas and a breath at phrase ends; velocity from the dynamics, with the
// melody voice and a chord's top note brought forward; chords rolled a little; the melody a few
// milliseconds ahead of the accompaniment; the sustain pedal holding the harmony. The rule-based styles
// in score.js are the fallback; this is how a film gets music written for it.
//
// Supported ABC: X T M L Q K headers, V: voices (with inst= role= gain= transpose=), inline [K:] [M:]
// [Q:] [V:], notes with ^ _ = accidentals (held through the bar), octave , ', lengths 2 /2 3/2 /,
// rests z x, chords [CEG], ties -, triplets (3, repeats |: :|, decorations !pp!…!ff!
// !crescendo(! !crescendo)! !diminuendo(! !diminuendo)! !fermata! !accent! (or >), !ped! !ped-up!,
// and two extensions: !rit(! … !rit)! (slow down by ~30 % across the span) and !breath!.
//
// For launch films: a voice with inst=drums (kit=pop|acoustic|808|cinematic|lofi|gated|chip|folk) reads its notes on the General
// MIDI drum map — C,, kick, ^C,, rim, D,, snare, ^D,, clap, ^F,, hat, ^A,, open hat, A,, tom, ^C, crash,
// ^F, tambourine, ^A shaker. Cue marks become sound design on the beat: !hit! (impact on the reveal),
// !rise(! … !rise)! (a riser that lands where it closes), !mark:name! (a named moment, for lining the score
// up with the film's scenes). Edits on the whole mix, the way an editor cuts music to picture:
// !filter(! … !filter)! (muffled, opening up to full brightness), !stop(! … !stop)! (a tape stop: the band
// slows and sinks to silence), !stutter(! … !stutter)! (the span's first sixteenth repeated, a beat repeat).

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MODES = { '': [0, 2, 4, 5, 7, 9, 11], maj: [0, 2, 4, 5, 7, 9, 11], ion: [0, 2, 4, 5, 7, 9, 11], m: [0, 2, 3, 5, 7, 8, 10], min: [0, 2, 3, 5, 7, 8, 10], aeo: [0, 2, 3, 5, 7, 8, 10],
  dor: [0, 2, 3, 5, 7, 9, 10], phr: [0, 1, 3, 5, 7, 8, 10], lyd: [0, 2, 4, 6, 7, 9, 11], mix: [0, 2, 4, 5, 7, 9, 10], loc: [0, 1, 3, 5, 6, 8, 10] };
export const DYN = { ppp: 0.18, pp: 0.26, p: 0.36, mp: 0.48, mf: 0.6, f: 0.74, ff: 0.86, fff: 0.95 };

// Key signature → accidental (in semitones) for each letter.
export function keySignature(k) {
  const m = /^\s*([A-G])([#b]?)\s*([A-Za-z]*)/.exec(k || 'C');
  if (!m) return {};
  const tonic = (LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const mode = MODES[m[3].toLowerCase().slice(0, 3)] || MODES[m[3].toLowerCase()] || MODES[''];
  const pcs = mode.map((x) => (tonic + x) % 12);
  const letters = 'CDEFGAB', start = letters.indexOf(m[1]);
  const acc = {};
  for (let i = 0; i < 7; i++) {
    const L = letters[(start + i) % 7], want = pcs[i];
    let d = ((want - LETTER[L]) % 12 + 12) % 12;
    if (d > 6) d -= 12;
    acc[L] = d;
  }
  return acc;
}

const frac = (s, dflt = 1) => {
  if (!s) return dflt;
  if (/^\/+$/.test(s)) return 1 / Math.pow(2, s.length);
  const m = /^(\d*)(?:\/(\d*))?$/.exec(s);
  if (!m) return dflt;
  const a = m[1] ? Number(m[1]) : 1, b = s.includes('/') ? (m[2] ? Number(m[2]) : 2) : 1;
  return a / b;
};
const meterOf = (s) => { if (/^C\|/.test(s)) return [2, 2]; if (/^C/.test(s)) return [4, 4]; const m = /(\d+)\/(\d+)/.exec(s || '4/4'); return m ? [Number(m[1]), Number(m[2])] : [4, 4]; };
// Q:1/4=72, Q:3/8=60, Q:72 → quarter notes per minute
const qpmOf = (s) => { const m = /(?:(\d+)\/(\d+)\s*=\s*)?(\d+(?:\.\d+)?)/.exec(s || ''); if (!m) return null; const beat = m[1] ? Number(m[1]) / Number(m[2]) : 0.25; return Number(m[3]) * beat * 4; };

// ABC text → { title, meter, events: [{ voice, beat, dur, midi, vel, accent, fermata }], voices, tempo:
// [{ beat, qpm }], rits: [[from, to]], breaths: [beat], fermatas: [beat], pedal: { voice: [[down, up]] }, bars }
export function parseAbc(text) {
  const head = { M: '4/4', L: null, Q: '1/4=90', K: 'C', T: '' };
  const voices = {}, order = [];
  let cur = null;
  const body = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/%.*$/, '').trimEnd();
    if (!line.trim()) continue;
    const hm = /^([A-Za-z]):\s*(.*)$/.exec(line);
    if (hm && hm[1] !== 'V' && body.length === 0 && 'XTMLQKCRNOSZ'.includes(hm[1])) { head[hm[1]] = hm[2]; continue; }
    if (hm && hm[1] === 'V') { cur = vdef(hm[2]); body.push({ voice: cur }); continue; }
    if (hm && 'MLQK'.includes(hm[1])) { body.push({ text: `[${hm[1]}:${hm[2]}]` }); continue; }
    body.push({ text: line });
  }
  function vdef(s) {
    const id = s.split(/\s+/)[0];
    if (!voices[id]) {
      const attrs = Object.fromEntries([...s.matchAll(/(\w+)\s*=\s*("([^"]*)"|\S+)/g)].map((m) => [m[1], m[3] ?? m[2]]));
      const inst = attrs.inst || 'piano';
      voices[id] = { id, inst, kit: attrs.kit || 'pop', role: attrs.role || (inst === 'drums' ? 'drums' : order.length === 0 ? 'melody' : 'accomp'), gain: Number(attrs.gain || 1), transpose: Number(attrs.transpose || 0) };
      order.push(id);
    }
    return id;
  }
  if (!order.length) vdef('1');
  const [mn, md] = meterOf(head.M);
  const st = Object.fromEntries(order.map((v) => [v, { beat: 0, acc: {}, dyn: DYN.mf, ramp: null, tieFrom: null, repeatStart: 0, lastRepeat: -1, bar: 1, barStart: 0 }]));
  // A key change holds from its beat on, for every voice, whichever voice wrote it (voices are read one after
  // another, so a key kept as running state leaked from the end of one voice into the start of the next).
  const keys = [{ beat: 0, key: keySignature(head.K) }], warnings = [];
  const cues = [], riseOpen = {};
  const events = [], tempo = [{ beat: 0, qpm: qpmOf(head.Q) || 90 }], rits = [], breaths = [], fermatas = [], pedal = {}, ramps = [];
  let meter = [mn, md], L = head.L ? frac(head.L.replace(/^1\//, '1/'), 0.125) : (mn / md < 0.75 ? 1 / 16 : 1 / 8);
  let barLen = meter[0] * 4 / meter[1];
  let vcur = order[0], ritOpen = null;

  // tokenise one voice's text into events (repeats re-play the bracketed tokens once)
  const run = (text, vid) => {
    const s = st[vid], v = voices[vid];
    let i = 0, tuplet = null, deco = [];
    const toks = [];
    while (i < text.length) {
      const ch = text[i];
      if (ch === ' ' || ch === '\t' || ch === '`') { i++; continue; }
      if (ch === '"') { const j = text.indexOf('"', i + 1); const ann = text.slice(i + 1, j < 0 ? text.length : j); if (/rit/i.test(ann)) toks.push({ deco: 'rit(' }); if (/a tempo/i.test(ann)) toks.push({ deco: 'rit)' }); i = j < 0 ? text.length : j + 1; continue; }
      if (ch === '!' || ch === '+') { const j = text.indexOf(ch, i + 1); toks.push({ deco: text.slice(i + 1, j < 0 ? text.length : j) }); i = j < 0 ? text.length : j + 1; continue; }
      if (ch === '{') { const j = text.indexOf('}', i); i = j < 0 ? text.length : j + 1; continue; } // grace notes: skipped
      if (ch === '[' && /^\[[A-Za-z]:/.test(text.slice(i, i + 3))) { const j = text.indexOf(']', i); toks.push({ field: text.slice(i + 1, j) }); i = j + 1; continue; }
      if (ch === '|' || ch === ':' || (ch === '[' && /^\[\d/.test(text.slice(i, i + 2)))) {
        let j = i; while (j < text.length && /[|:\]\[0-9]/.test(text[j]) && !(text[j] === '[' && /[A-Ga-gz^_=]/.test(text[j + 1] || ''))) j++;
        toks.push({ bar: text.slice(i, j) }); i = j; continue;
      }
      if (ch === '(' && /\d/.test(text[i + 1])) { toks.push({ tuplet: Number(text[i + 1]) }); i += 2; continue; }
      if (ch === '.' || ch === '~' || ch === 'H' || ch === 'T' || ch === 'u' || ch === 'v') { if (ch === 'H') toks.push({ deco: 'fermata' }); i++; continue; }
      if (ch === '>' ) { toks.push({ deco: 'accent' }); i++; continue; }
      if (ch === '-') { toks.push({ tie: true }); i++; continue; }
      const nm = /^(\[(?:[\^_=]*[A-Ga-g][,']*[0-9/]*\s*)+\]|[\^_=]*[A-Ga-g][,']*|[zxZ])([0-9]*\/*[0-9]*)/.exec(text.slice(i));
      if (nm) { toks.push({ note: nm[1], len: nm[2] }); i += nm[0].length; continue; }
      i++;
    }
    let repStart = 0;
    for (let t = 0; t < toks.length; t++) {
      const k = toks[t];
      if (k.bar != null) {
        s.acc = {};
        const got = s.beat - s.barStart;
        if (got > 1e-6) {   // a bar that is too long or too short moves everything after it off the other voices
          if (Math.abs(got - barLen) > 1e-4 && !(s.bar === 1 && got < barLen)) warnings.push(`voice ${vid} bar ${s.bar} has ${+got.toFixed(3)} beats, the meter wants ${+barLen.toFixed(3)}`);
          s.bar++; s.barStart = s.beat;
        }
        if (k.bar.includes(':') && k.bar.indexOf(':') > k.bar.indexOf('|') && k.bar.startsWith('|')) repStart = t + 1;
        else if (/^:/.test(k.bar) && s.lastRepeat !== t) { s.lastRepeat = t; t = repStart - 1; continue; }
        else if (/:$/.test(k.bar)) repStart = t + 1;
        continue;
      }
      if (k.field) {
        const [f, val] = [k.field[0], k.field.slice(2)];
        if (f === 'K') keys.push({ beat: s.beat, key: keySignature(val) });
        if (f === 'M') { meter = meterOf(val); barLen = meter[0] * 4 / meter[1]; }
        if (f === 'L') L = frac(val.replace(/^1\//, '1/'), L);
        if (f === 'Q') tempo.push({ beat: s.beat, qpm: qpmOf(val) || tempo.at(-1).qpm });
        continue;
      }
      if (k.tuplet) { tuplet = { n: k.tuplet, left: k.tuplet, q: k.tuplet === 3 ? 2 : k.tuplet === 2 ? 3 : k.tuplet === 4 ? 3 : 2 }; continue; }
      if (k.tie) { s.tieFrom = events.length ? events.filter((e) => e.voice === vid).at(-1) : null; continue; }
      if (k.deco != null) {
        const d = k.deco.trim();
        if (DYN[d]) { s.dyn = DYN[d]; s.ramp = null; }
        else if (/^(crescendo|diminuendo|<|>)\($/.test(d)) s.ramp = { from: s.beat, dir: /cresc|</.test(d) ? 1 : -1 };
        else if (/^(crescendo|diminuendo|<|>)\)$/.test(d) && s.ramp) { ramps.push({ voice: vid, from: s.ramp.from, to: s.beat, dir: s.ramp.dir }); s.ramp = null; }
        else if (d === 'rit(') ritOpen = s.beat;
        else if (d === 'rit)' && ritOpen != null) { rits.push([ritOpen, s.beat]); ritOpen = null; }
        else if (d === 'ped') (pedal[vid] ||= []).push([s.beat, null]);
        else if (d === 'ped-up') { const pv = pedal[vid]; if (pv?.length && pv.at(-1)[1] == null) pv.at(-1)[1] = s.beat; }
        else if (d === 'breath') breaths.push(s.beat);
        else if (d === 'hit') cues.push({ type: 'hit', beat: s.beat });
        else if (/^(rise|stop|stutter|filter)\($/.test(d)) riseOpen[`${vid}:${d.slice(0, -1)}`] = s.beat;
        else if (/^(rise|stop|stutter|filter)\)$/.test(d) && riseOpen[`${vid}:${d.slice(0, -1)}`] != null) { const k = `${vid}:${d.slice(0, -1)}`; cues.push({ type: d.slice(0, -1), from: riseOpen[k], beat: s.beat }); delete riseOpen[k]; }
        else if (d.startsWith('mark:')) cues.push({ type: 'mark', name: d.slice(5), beat: s.beat });
        else deco.push(d);
        continue;
      }
      if (k.note) {
        let len = frac(k.len, 1) * L * 4; // in quarter notes
        const parts = k.note.startsWith('[') ? [...k.note.slice(1, -1).matchAll(/([\^_=]*)([A-Ga-g])([,']*)([0-9/]*)/g)] : [/^([\^_=]*)([A-Ga-gzxZ])([,']*)/.exec(k.note)];
        if (k.note.startsWith('[') && !k.len && parts[0]?.[4]) len = frac(parts[0][4], 1) * L * 4;
        if (tuplet) { len *= tuplet.q / tuplet.n; if (--tuplet.left <= 0) tuplet = null; }
        if (/Z/.test(k.note)) { const n = frac(k.len, 1); s.beat += barLen * n; s.bar += n - 1; s.barStart += barLen * (n - 1); deco = []; continue; }   // Z4: four whole bars
        if (/[zx]/.test(k.note)) { s.beat += len; deco = []; continue; }
        const fermata = deco.includes('fermata'), accent = deco.includes('accent') || deco.includes('>');
        if (fermata) fermatas.push(s.beat + len);
        const chordNotes = [];
        for (const [, acc, letter, oct] of parts) {
          const U = letter.toUpperCase(), octave = (letter === U ? 4 : 5) + (oct.match(/'/g) || []).length - (oct.match(/,/g) || []).length;
          const id = `${U}${octave}`;
          if (acc) s.acc[id] = acc.startsWith('^') ? acc.length : acc.startsWith('_') ? -acc.length : 0;
          const keyed = s.acc[id] == null && v.inst !== 'drums';   // takes the key signature, resolved once every voice is read
          chordNotes.push([12 * (octave + 1) + LETTER[U] + (s.acc[id] ?? 0) + v.transpose, keyed ? U : null]);
        }
        const tie = s.tieFrom && s.tieFrom.beat + s.tieFrom.dur >= s.beat - 1e-6;
        chordNotes.forEach(([midi, keyed], ci) => {
          const prev = tie ? events.find((e) => e.voice === vid && e.midi === midi && e.keyed === keyed && Math.abs(e.beat + e.dur - s.beat) < 1e-6) : null;
          if (prev) { prev.dur += len; return; }
          events.push({ voice: vid, beat: s.beat, dur: len, midi, keyed, vel: s.dyn, accent, fermata, top: ci === chordNotes.length - 1 && chordNotes.length > 1, chord: chordNotes.length });
        });
        s.tieFrom = null;
        s.beat += len;
        deco = [];
      }
    }
  };
  for (const item of body) {
    if (item.voice) { vcur = item.voice; continue; }
    const parts = item.text.split(/(\[V:[^\]]+\])/);
    for (const part of parts) {
      const vm = /^\[V:([^\]]+)\]$/.exec(part);
      if (vm) { vcur = vdef(vm[1].trim()); if (!st[vcur]) st[vcur] = { beat: 0, acc: {}, dyn: DYN.mf, ramp: null, tieFrom: null, lastRepeat: -1, bar: 1, barStart: 0 }; continue; }
      if (part.trim()) run(part, vcur);
    }
  }
  // crescendo / diminuendo: velocity ramps toward the dynamic that follows (or ±0.2)
  for (const r of ramps) {
    const inside = events.filter((e) => e.voice === r.voice && e.beat >= r.from && e.beat < r.to);
    const after = events.find((e) => e.voice === r.voice && e.beat >= r.to);
    const start = inside[0]?.vel ?? DYN.mf, endV = after && after.vel !== start ? after.vel : Math.max(0.15, Math.min(0.95, start + 0.2 * r.dir));
    for (const e of inside) e.vel = start + (endV - start) * ((e.beat - r.from) / Math.max(1e-6, r.to - r.from));
  }
  keys.sort((a, b) => a.beat - b.beat);
  for (const e of events) {
    if (e.keyed) { let k = keys[0].key; for (const c of keys) if (c.beat <= e.beat + 1e-6) k = c.key; e.midi += k[e.keyed] ?? 0; }
    delete e.keyed;
  }
  const length = Math.max(0, ...Object.values(st).map((x) => x.beat));
  for (const v of order) if (st[v].beat > 0 && length - st[v].beat > 1e-4) warnings.push(`voice ${v} ends at beat ${+st[v].beat.toFixed(3)}, the score at ${+length.toFixed(3)}: write every bar in every voice`);
  return { title: head.T, meter, barLen, events: events.sort((a, b) => a.beat - b.beat), voices, order, tempo, rits, breaths, fermatas, pedal, cues, length, warnings };
}

// Beats (quarter notes) → seconds, through the tempo changes, ritardandos (tempo eases down to 70 %),
// fermatas (the held note lasts ~1.8×, then a short silence) and breaths (a short lift).
export function tempoMap(score, { rubato = 0.05, phraseBars = 4, warp = null } = {}) {
  const step = 1 / 48, n = Math.ceil((score.length + 8) / step) + 1;
  const sec = new Float64Array(n);
  const qpmAt = (b) => { let q = score.tempo[0].qpm; for (const t of score.tempo) if (t.beat <= b + 1e-9) q = t.qpm; return q; };
  for (let i = 1; i < n; i++) {
    const b = (i - 1) * step;
    let q = qpmAt(b);
    for (const [a, z] of score.rits) if (b >= a && b < z) q *= 1 - 0.3 * ((b - a) / Math.max(1e-6, z - a));
    if (warp) q *= warp(b);
    // a breath at phrase ends: the last beat of every `phraseBars` bars slows a little
    const phrase = score.barLen * phraseBars, inPhrase = b % phrase;
    if (rubato && inPhrase > phrase - 1) q *= 1 - rubato * Math.sin(Math.PI * (inPhrase - (phrase - 1)));
    sec[i] = sec[i - 1] + (60 / q) * step;
  }
  const extra = [];
  for (const f of new Set(score.fermatas)) extra.push([f, 0.8 * 60 / qpmAt(f)]); // one hold per moment, however many voices mark it
  for (const br of score.breaths) extra.push([br, 0.18]);
  return (b) => {
    const x = Math.max(0, b / step), i = Math.min(n - 2, Math.floor(x));
    let t = sec[i] + (sec[i + 1] - sec[i]) * (x - i);
    for (const [at, add] of extra) if (b > at + 1e-6) t += add;
    return t;
  };
}

// Fitting the score to the picture: each !mark:name! with a time in `align` must sound at that time. The
// written tempo is scaled per stretch between consecutive marks (rits, fermatas and breaths keep their
// shape) until every mark lands within a millisecond; before the first mark and after the last the
// nearest stretch's scale holds. One mark only moves the start. Returns the time map, where the score
// starts, and per stretch how far the tempo had to bend (the composer should re-bar a stretch that bends
// more than ~8 %: that is a phrase of the wrong length, not a tempo).
export function fit(score, align = {}, { rubato = 0.05 } = {}) {
  const seen = new Set();
  const marks = (score.cues || []).filter((c) => c.type === 'mark' && align[c.name] != null && !seen.has(c.beat) && seen.add(c.beat)).sort((x, y) => x.beat - y.beat)
    .map((c) => ({ name: c.name, beat: c.beat, target: Number(align[c.name]) }));
  const k = marks.slice(1).map(() => 1);
  const warp = k.length ? (b) => { let i = 0; while (i < k.length - 1 && b >= marks[i + 1].beat) i++; return k[i]; } : null;
  let sec = tempoMap(score, { rubato, warp });
  for (let it = 0; it < 12 && k.length; it++) {
    let worst = 0;
    for (let i = 0; i < k.length; i++) {
      const got = sec(marks[i + 1].beat) - sec(marks[i].beat), want = marks[i + 1].target - marks[i].target;
      if (want <= 0) throw new Error(`mark "${marks[i + 1].name}" comes after "${marks[i].name}" in the score but not in the film`);
      k[i] *= got / want; worst = Math.max(worst, Math.abs(got - want));
    }
    sec = tempoMap(score, { rubato, warp });
    if (worst < 0.0005) break;
  }
  const start = marks.length ? marks[0].target - sec(marks[0].beat) : null;
  const qpm = score.tempo[0].qpm;
  const stretches = k.map((x, i) => ({ from: marks[i].name, to: marks[i + 1].name, qpm: qpm * x, bend: x - 1 }));
  return { sec, start, marks: marks.map((m) => ({ ...m, at: start + sec(m.beat) })), stretches };
}

// Performance plan: when each note starts and ends (seconds), how hard, and through which pedal. A pedal
// either follows the score's !ped! marks or, for piano voices without marks, changes with the harmony:
// down on every bar (and half bar in slow 4/4), released just before the next change.
// With `align` ({ markName: seconds }) the score is fitted to those moments first (see fit).
export function perform(score, { start = 0, rubato, seed = 1, align = null } = {}) {
  let a = seed >>> 0 || 1;
  const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const fitted = align ? fit(score, align, { rubato: rubato ?? 0.05 }) : null;
  const sec = fitted ? fitted.sec : tempoMap(score, { rubato: rubato ?? 0.05 });
  if (fitted?.start != null) start = fitted.start;
  const qpm0 = score.tempo[0].qpm;
  const notes = [];
  const pedals = {};
  for (const vid of score.order) {
    const v = score.voices[vid];
    if (!/piano|rhodes|wurli|harp|guzheng|guitar|vibes/.test(v.inst)) continue;
    const marked = score.pedal[vid];
    if (marked?.length) { pedals[vid] = marked.map(([d, u]) => [sec(d), sec(u ?? score.length)]); continue; }
    const per = score.barLen >= 4 && qpm0 < 80 ? score.barLen / 2 : score.barLen, list = [];
    for (let b = 0; b < score.length; b += per) list.push([sec(b) + 0.02, sec(b + per) - 0.03]);
    pedals[vid] = list;
  }
  for (const e of score.events) {
    const v = score.voices[e.voice];
    const melody = v.role === 'melody', drums = v.inst === 'drums';
    let t = start + sec(e.beat);
    let vel = e.vel + (melody ? 0.08 : -0.06) + (e.top ? 0.05 : e.chord > 1 ? -0.04 : 0) + (e.accent ? 0.1 : 0);
    const inBar = e.beat % score.barLen;
    if (Math.abs(inBar) < 1e-6) vel += 0.03;
    // a drummer's hands: hats lean on the beat and lighten off it, the backbeat sits a hair late, kick on time
    if (drums) {
      const gm = GM_DRUMS[e.midi], frac = (e.beat % 1 + 1) % 1;
      if (gm === 'hat' || gm === 'shaker' || gm === 'ride') vel += frac < 1e-6 ? 0.04 : Math.abs(frac - 0.5) < 1e-6 ? -0.1 : -0.18;
      if (gm === 'snare' && frac > 1e-6) vel -= 0.12; // fills and rolls under the backbeat
      t += gm === 'snare' || gm === 'clap' ? 0.006 : gm === 'hat' ? (rand() - 0.5) * 0.008 : 0;
    }
    vel = Math.max(0.08, Math.min(1, vel + (rand() - 0.5) * (drums ? 0.1 : 0.06)));
    // the melody speaks a touch early; big chords roll from the bottom up; nothing is exactly on the grid
    t += (melody ? -0.008 : 0) + (rand() - 0.5) * 0.012;
    if (e.chord >= 3 && !melody && !drums) {
      const same = score.events.filter((x) => x.voice === e.voice && x.beat === e.beat).sort((x, y) => x.midi - y.midi);
      t += same.indexOf(e) * (0.012 + 0.006 * rand());
    }
    let off = start + sec(e.beat + e.dur) - (e.dur < 0.5 ? 0.02 : 0.04);
    if (e.fermata) off += 0.8 * 60 / qpm0;
    // under the pedal a note rings until the pedal lifts
    const pd = pedals[e.voice]?.find(([d, u]) => off >= d && off < u) || pedals[e.voice]?.find(([d, u]) => t >= d - 0.01 && t < u);
    const release = pd ? Math.max(off, start + pd[1] - start) : off;
    notes.push({ voice: e.voice, inst: v.inst, kit: v.kit, drums, gain: v.gain, midi: e.midi, t, off: pd ? Math.max(off, pd[1]) : off, vel, melody, pedalled: !!pd, release });
  }
  const end = start + sec(score.length) + Math.max(0, ...score.fermatas.map(() => 0));
  const cues = (score.cues || []).map((c) => ({ ...c, at: start + sec(c.beat), ...(c.from != null ? { dur: sec(c.beat) - sec(c.from), step: sec(c.from + 0.25) - sec(c.from) } : {}) }));
  return { notes, cues, end, start, fit: fitted, sec: (b) => start + sec(b) };
}

// Sound the performance: each note through its instrument, held to its pedal release, louder with velocity
// on a curve (a piano's loudness grows faster than linearly with how hard it is struck).
// The General MIDI drum map, and what each kit plays for it (names in score.js DRUMS; acoustic kits play
// the recorded kit where the sample pack has it).
export const GM_DRUMS = { 35: 'kick', 36: 'kick', 37: 'rim', 38: 'snare', 40: 'snare', 39: 'clap', 42: 'hat', 44: 'hat', 46: 'ohat', 41: 'tom', 43: 'tom', 45: 'tom', 47: 'tom', 48: 'tom', 50: 'tom', 49: 'crash', 57: 'crash', 54: 'tamb', 70: 'shaker', 75: 'woodblock', 76: 'woodblock' };
export const DRUM_KITS = {
  pop: { kick: 'kick', snare: 'snare', clap: 'clap', hat: 'hat', ohat: 'ohat', tamb: 'shaker' },
  acoustic: { kick: 'kicksoft', snare: 'snare', hat: 'hat', ohat: 'ohat', tamb: 'shaker' },
  808: { kick: 'kick808', snare: 'clap', hat: 'hat808', tamb: 'shaker' },
  cinematic: { kick: 'taiko', snare: 'snarebig', hat: 'shaker', ohat: 'crash', tom: 'taiko' },
  // the rest of score.js's drum voices, reachable from a score: a dusty boom-bap kit, the gated 80s snare,
  // the 8-bit kit, and body percussion (stomp, snaps, frame drum) for folk and acoustic songs
  lofi: { kick: 'kicksoft', snare: 'snarelofi', clap: 'snap', hat: 'hat', ohat: 'ohat', tamb: 'shaker' },
  gated: { kick: 'kick', snare: 'snaregated', clap: 'snaregated', hat: 'hat', ohat: 'ohat', tamb: 'shaker' },
  chip: { kick: 'kickchip', snare: 'snarechip', clap: 'snarechip', hat: 'hatchip', ohat: 'hatchip', tamb: 'hatchip' },
  folk: { kick: 'stomp', snare: 'snap', clap: 'clap', hat: 'shaker', ohat: 'shaker', tom: 'frame', rim: 'woodblock', tamb: 'shaker' },
};
// A bowed or blown note is shaped by the player, not the sample: the bow or breath eases in (slower when
// soft), a long note swells and relaxes (messa di voce), and its tail eases out instead of stopping.
function bow(sig, held, vel) {
  const chans = sig.L ? (sig.R === sig.L ? [sig.L] : [sig.L, sig.R]) : [sig];
  const att = Math.min(0.16, Math.max(0.03, held * 0.2) * (1.3 - vel * 0.6)) * 48000, hold = held * 48000;
  for (const x of chans) for (let i = 0; i < x.length; i++) {
    const u = Math.min(1, i / Math.max(1, hold));
    const swell = held > 0.9 ? 0.86 + 0.14 * Math.sin(Math.PI * Math.min(1, u * 1.15)) : 1;
    x[i] *= Math.min(1, i / att) * swell;
  }
}
export function renderPerformance(perf, put, voiceFn, r, { busOf = () => 'keys', drumFn = null } = {}) {
  for (const n of perf.notes) {
    if (n.drums) {
      const gm = GM_DRUMS[n.midi];
      if (!gm || !drumFn) continue;
      const name = DRUM_KITS[n.kit]?.[gm] || DRUM_KITS.pop[gm] || gm;
      put('drums', drumFn(name, n.kit === 'acoustic' || n.kit === 'cinematic', n.kit)(r, n.vel), n.t, 0.5 * Math.pow(n.vel, 1.3) * n.gain, gm === 'hat' || gm === 'shaker' ? 0.25 : gm === 'ohat' ? -0.2 : 0);
      continue;
    }
    const f = 440 * Math.pow(2, (n.midi - 69) / 12);
    const sustain = /strings|lowstr|violin|viola|celli|basses|trem|horn|flute|erhu|pad/.test(n.inst);
    const len = Math.max(0.12, n.off - n.t) + (sustain ? 0.35 : n.pedalled ? 0.6 : 0.25);
    const sig = voiceFn(n.inst)(f, len, n.vel, r);
    if (sustain) bow(sig, n.off - n.t, n.vel);
    const g = 0.22 * Math.pow(n.vel, 1.6) * n.gain * (sustain ? 0.8 : 1);
    put(busOf(n), sig, n.t, g, n.melody ? 0.05 : (n.midi - 60) / 60);
  }
}
