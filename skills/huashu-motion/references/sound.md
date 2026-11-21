# Sound

A film ships with music and sound effects. Silent motion reads as a draft: the same cut that feels abrupt without sound feels intended when a note starts on it, and a card that lands without a thud looks weightless. Leave a film silent only when it is an overlay for someone else's edit (`om render --transparent`) or the user asks for it (`om sound --off`).

**Real track first.** Synthesized music is the weakest part of this tool: it sounds synthetic, and a film with effects but no music is worse. A film given to the user carries a real track; the source order is in [music-sources.md](music-sources.md) (the user's own, a tool in the environment, `om music`, an open library, and only then the synthesis below, said so at delivery). Everything below about scores and built-in directions is that last-resort fallback.

## A real track

```sh
om beats track.mp3 --plot            # bpm, confidence, bar lines, sections, drops + a picture to check them against the waveform
om sound film --music track.mp3      # copies it to assets/music/, writes OM.music({ src }) in index.html, mixes the film
om music use <id> film               # the same, from the library (om music lists it)
```

```js
OM.music({ src: 'assets/music/track.mp3', start: 12.5, bpm: 124, sfx: -8 });  // start: where in the file the film begins (s); bpm: only when you know it better than the tracker; sfx: dB offset for effects
tl.addLabel('scene:hero', OM.drop(0));        // the track's biggest jump in energy, on a bar line
tl.addLabel('scene:next', OM.downbeat(8));    // bar 8 (0 = the first bar line in the film); OM.beat(n) is beat n; OM.section(i) the i-th loudness section
```

- `om sound` analyses the file once (cached in `.om/music`), writes the beat map into `<script id="om-beats">` (and `assets/music.beats.json` to read), and re-reads the timeline until the labels agree with it. `OM.beat(n)` then follows the track's real beats; without a track it is still the fixed bpm. Everything stays a pure function of the file and the declaration.
- **Pick the track, then cut.** The beat map is the grid; put scene labels and the hero moment on `OM.downbeat` / `OM.drop`. `om sound` and `om check` list every scene cut more than 80 ms from the nearest beat.
- **The count, the fit and the bar line.** The tempo is fitted over the whole track (a steady 120 comes out as 120.00 with every beat within a few ms, not 119.8 drifting a beat's worth by the end); `om beats` prints the residual. A generated track whose tempo moves is tracked beat by beat instead (`fit: tracked`). A layer can make the pulse look 4:3 or 3:2 too fast or slow: `om beats` lists the other counts with how well each fits (× 1 = as well) and warns when one fits about as well. Listen once and set the one you hear: `om beats <file> --bpm 92` or `OM.music({ bpm })` (the period is refitted within 1 %, the phase freely). Bar lines are where the chords change, confirmed by the drum accent (a kick strongest on beat 2 does not move the bar).
- **Cut-vs-beat check.** `om sound` and `om check` compare each scene cut with the nearest **beat** (any beat of the bar, not only the bar line), because a cut on beat 3 is as musical as one on beat 1; a cut more than 80 ms from every beat is listed with its offset. To land the big moments on bar lines, use `OM.downbeat` / `OM.drop`.
- **Confidence below 0.3 means no clear pulse** (ambient, rubato): the beats are a guess. Use `OM.section(i)` and `OM.drop(i)`, not beats; do not promise a cut "on the beat".
- **Levels and ends.** The track sits at the music target (−18 LUFS alone, ~12 LU under narration, ducked under words), master −14. It is trimmed to the film from `start`, a track shorter than the film loops on bar lines with crossfades (a quiet outro is left out of the loop), and the music fades out starting on the last bar line that leaves 1–1.5 s (`OM.music({ fade })` to set it).
- **Effects over a track are guests.** They are 8 dB lighter than over the synthesized bed (`sfx` changes it), and **at most one effect per cut**: a thud on the cut, nothing stacked, no riser under a track that has its own build. Silence in the effects is fine.
- Check what you cannot hear: `om beats <file> --plot` (a beat line should sit on the start of a kick; the zoom panel shows ten seconds), the `cuts` and `energy` lines of `om sound`, and say which you could not judge by ear.

`om sound` renders everything from what the composition declares — no network, no API — so a retimed film re-renders its own soundtrack (`om render` does it before every export). Instruments are synthesized, or played from real recordings once the sample pack is installed (`om samples build`, once per machine: a concert grand, string sections, horns, harp, mallets, guitars, a recorded drum kit; CC0 and CC-BY, credits in its NOTICE.txt). Run `om samples` to see whether it is there; without it everything still works, on synths.

**Pick the world first** ([music.md](music.md)): sixteen musical worlds — pulse minimalism, UK garage, minimal techno, drum and bass, funk, lo-fi, trap, synthwave, cinematic, lyrical piano, jazz trio, folk, chiptune, ambient, 国风, amapiano — each with the products it suits and a two-bar groove that renders. You choose it from the product's character after the direction is chosen; the user isn't asked unless they want a say. `om sound` prints the score's soundprint (tempo, key, band) and warns when it is one of the example scores' bands or a recent film's on this machine: every film sounding alike is the failure users notice first.

There are two ways to score a film without a track:

- **A built-in direction** — `OM.music({ product: 'devtool' })` picks one of three directions for the product category and composes it around your scenes, drop and ending. Fast and decent: drafts, quick stings, anything where music is not the point.
- **Composer mode** — you write the score (an `om-score` in ABC notation) and `om sound` performs it on the instruments, fitted to the picture. For launch films and anything the user will judge by how it feels. The music can only be as good as the composition, and the composition is yours.

Read [rhythm.md](rhythm.md) first either way: the music's energy curve is the film's energy curve.

### Fitting a fixed track to this film

A track has a shape of its own: a quiet start, a lift, a breakdown, a main section, an ending. The film has another. Three layers of fit, each cheaper and weaker than the next:

1. **Choose the track for the film.** Tempo family and mood come from the film, not from a later edit; nothing below can turn a calm track into an urgent one.
2. **Cuts follow the beats.** `OM.beat(n)` / `OM.downbeat(n)` / `OM.drop(i)` put scene cuts on the track's real grid (above). Fixes the rhythm; does nothing for the energy contour.
3. **Arrange by length** (`arrange`, default on when the film has scenes): the way a music editor fits a track to a running time. Three parts: the track's **own opening** (its first bars, untouched), an **elastic middle** (whole bars or phrases dropped or repeated until the length fits), and the track's **own ending** (a real closing stretch of the track, played continuously to the end of the music; no fade). The film's last frame sits on the music's end. This is the arrangement the author approved on the HuaStudio film: the real tail of the track, not a made-up one.

- **The ending, in this order of preference.** (1) The track's real ending, of variable length: the last k bars, k from two bars to the whole closing stretch, whichever joins best and puts the strongest hit of the tail where the end card lands (`landing`); a long closing stretch is shortened, not given up. (2) A **button** only when the track's own ending is a hard cut or none can be reached: a strong home-chord hit with a reverb tail. The tail is **synthetic** (made, not found in the track), it is labelled so, and it scores below a real ending. (3) A fade, last.
- **Joins** go only inside stable stretches of the track, never across a lift: a lift, the fill bar before it and the bar after it always play as the track has them. A join sits on a bar line or on a **beat** (the fourth beat of one bar into the fourth beat of another: both sides at the same place of the same progression). Both sides must be the same segment or energy grade, harmony within reach (score 0.55 and up) and loudness within 3 dB over one second; a step of up to 5 dB is allowed when up to 2 dB of **static gain** on what follows levels it (printed with the join). Every candidate is then rendered and measured: one with a loudness jump of more than 6 dB inside half a second that the track does not make itself (the first half second of a bar can decay faster than the 1 s windows the plan was made with show) is **refused**, and the next candidate is tried; if all are refused the track is cut straight and the table says so.
- **A lift on the burst and the peak.** For each of the film's `burst` and `peak` the plan looks through all the lifts of the track for one that can land on it: a join into a stable bar (at the start of the stretch that leads into the lift's fill bar, or earlier), then the track plays straight, so the fill bar, the lift and the bar after it are heard as the track has them. A real lift on the burst or the peak is worth as much to the score as the track's own ending, more for a bigger step and a clearer fill; the join that makes it possible is not counted as a repair. The table says whether a lift lands on the event, or a bar before it (the event is then the lift's second bar; the hint says where to move the event to put the hit on it). Harmony, loudness and the 2 dB static gain rules apply to that join as to any other.
- **The film yields.** Beside the plan for the film as written, `om sound` prints a second one for a film that moves its burst, peak or landing by up to a bar and its length by up to 4 s, with both scores, and says what the move buys (fewer joins, the track's own ending instead of a button or a fade, a lift on the burst or the peak). A longer film is never recommended for a longer tail alone. Look at it when you fix the rhythm sheet and move the picture to the music when it is cheap: the author's approved cut moved the burst 12→14, the peak 24→26, the end card 30→34 and the length 34→38 s.
- **Micro stretch** `stretch: 'fit'`: up to 3 % so the track's own end lands on the last frame. Off unless written.
- `om sound` lists film lengths at which the track needs one join or none (opening N bars + its ending) when one is within a bar of yours.

```js
OM.music({ src: 'assets/music/x.mp3',
  burst: 'drop',          // a scene name or seconds: where the music should lift (a real lift of the track is placed here when it can be)
  peak: 24,               // the full-power moment
  landing: 34,            // where the end card lands: the ending's strongest hit is put here when the length allows
  stop: [11, 12],         // optional, only when written: a clean dip on whole beats
  energy: { hero: 0.3 },  // optional, per scene, 0–1
  arrange: 'auto',        // 'off' = a straight cut from `start` (also the default when `start` is written)
  stretch: 'fit' })       // optional: up to 3 % so the ending lands on the last frame
```

Joins are 40 ms equal-power crossfades. Each is scored 0–1 for harmony and measured on the rendered audio (loudness over 1 s each side); the table prints both, the ending's kind and length, and the film time of both the strongest accent in its tail and its final chord, so the end card can land on either. A burst or peak that falls between the music's bar lines is reported with where to move it. The film's grid and the track's are never forced together, and the track's own lifts are not moved to fit.

Things to know:

- A scene placed with `OM.beat` / `OM.drop` moves with the music, so give `burst` and `peak` as seconds or as scenes placed by seconds; `om sound` warns when the cuts keep moving the film length.
- A flat track (bars within 4 dB, `om beats` says "flat") has no quiet section to build a contour from: its opening, length and ending are still arranged, the film's energy shape is not followed, and `om sound` says so. Most of the default pack's endings are fades or cut short: prefer a track whose `om beats` ending is a cadence, or accept a button ending.
- Whatever follows the music's end is never played: tracks that carry a short extra piece after a silence at the very end (`om beats` prints a `tail` line) end where the music ends, and loops, the closing fade and the re-cut all stop there.
- Chord names and the home chord come from a pitch-class estimate of a dense mix: treat join scores and the ending as a guide. Listen to every join once (the table says where); an unsmooth one is the first thing a viewer hears.

What cannot be done: the mood does not change; a join can still be audible (bass line or melody breaks, a different reverb tail); a track's closing stretch may be a fade or a cut; the arrangement still takes its real last bars where it can, and a button (made, not found) is the exception; a very short film (under two bars) or a track with no pulse gets no re-cut. The default library's tracks are shared by everyone, so another film may use the same bars: choose a different stretch, or use your own track, when it must be distinct.

## Composer mode

### 1. Spot the film

Before a note, list the moments the music must hit — like a music editor, not every cut:

- the **hook** (frame one), the **turn** (where the film changes gear), the **stop** (the held breath), the **drop / reveal**, the **logo**. Three to five sync points; the other cuts flow over the music.
- the tempo (from the personality and the energy you want: calm 80–100, tech and energetic 100–125; the cool launch films measured 89–130, and their speed came from cuts and hats, not bpm) and the bars between sync points. Count beats per stretch: `beats = seconds × bpm / 60`, and choose bar counts that land within a few percent; change a bar to 3/4 or 2/4 rather than bend the tempo.
- the energy of each stretch, from the rhythm sheet.
- when you are building the film too, build it on the score's grid: `OM.music({ bpm })` equal to the score's `Q:`, scene labels at `OM.beat(n)` on the bars where the marks are. Then the fit is exact (0 % bend) and every cut in the picture sits on a beat of the music.

### 2. Write the score

Put it in the composition, next to the timeline:

```html
<script type="text/vnd.abc" id="om-score">
X:1
T:Product · launch cue
M:4/4
L:1/8
Q:1/4=128
K:Em
V:PLK inst=synpluck gain=0.6
!mark:hook! !mf! E/B/e/B/ G/B/e/B/ E/B/e/B/ G/B/e/B/ | …
V:DR inst=drums kit=pop
!mf! [^C,^F,,]^F,, [D,,^F,,]^F,, ^F,,^F,, [D,,^F,,]^F,, | …
</script>
```

ABC as usual — `X T M L Q K` headers, one `V:` per part, notes `C D E` (C4 upward), `c d e` an octave up, `,` and `'` for octaves, `^ _ =` accidentals, lengths `2 /2 3/2`, rests `z` and `Z4` (four bars), chords `[CEG]`, ties `-`, triplets `(3`, repeats `|: :|`, inline `[M:3/4]` `[K:G]` `[Q:1/4=96]`. Write every bar in every voice; the voices must add up to the same length. `om sound` counts them: a bar that is too long or too short, or a voice that stops early, is printed as a `warning score:` line. Fix each one, because from that bar on the voice is off the others and every note after it is wrong. An inline `[K:]` holds from its beat on for every voice, whichever voice wrote it; `[M:]` is written in every voice.

Voice attributes: `inst=` the instrument, `role=melody` (brought forward, a hair early, centred), `gain=`, `transpose=`.

| Decoration | What it does |
|---|---|
| `!pp! … !ff!`, `!crescendo(! … !crescendo)!`, `!diminuendo(!…)!` | dynamics and ramps (velocity picks the sample layer) |
| `!accent!` or `>`, `!fermata!` (or `H`), `!breath!` | a weightier note; a hold (~1.8×); a short lift |
| `!rit(! … !rit)!` | slows down by ~30 % across the span |
| `!ped! … !ped-up!` | sustain pedal (piano voices pedal by harmony when unmarked) |
| `!mark:name!` | a sync point: lands on the timeline label `scene:name` (or `name`), or `OM.music({ marks: { name: seconds } })` |
| `!hit!` | the reveal: `impact` + `subdrop` on that beat |
| `!rise(! … !rise)!` | a riser that lands where the span closes |
| `!filter(! … !filter)!` | the whole mix muffled, opening to full brightness (a build) |
| `!stop(! … !stop)!` | a tape stop: the band slows and sinks to silence |
| `!stutter(! … !stutter)!` | a beat repeat: the span's first sixteenth looped |

Instruments: `piano` (a concert grand, stereo, with pedal and key-release noise), `strings` (each note played by the section that owns its register), the sections `violins violas celli basses`, a solo `violin`, tremolo `trem`, `lowstr`, `pizz stacc harp horn brass flute dizi erhu guzheng guitar uke rhodes epiano vibes marimba kalimba glock bell glass`, synths `pad warmpad supersaw saw sqlead synpluck pluck chip tri clav`, basses `bass synbass sub808 sinebass`.

Drums: `inst=drums kit=pop|acoustic|808|cinematic|lofi|gated|chip|folk`, notes on the General MIDI map — `C,,` kick, `^C,,` rim, `D,,` snare, `^D,,` clap, `^F,,` closed hat, `^A,,` open hat, `A,,` tom, `^C,` crash, `^F,` tambourine, `^A` shaker. The pop and acoustic kits are a recorded kit; 808 and cinematic are synthesized (taiko, big snare); lofi is a dusty boom-bap kit, gated the 80s gated snare, chip the 8-bit kit, folk body percussion (stomp, snaps, frame drum). Two drum voices with different kits are fine (an 808 kick under a recorded snare and hats).

### 3. Compose for the picture

The cases in [scores/](scores/) are complete, annotated scores. Read one for **structure and technique** — how a hook, a stop, a drop and a button are written — never for its sound: take the band, tempo and key from your film's world in [music.md](music.md). (Ten films in a row once copied Signal's header and all sounded the same; `om sound` now says so.)

- [first-light.abc](scores/first-light.abc) — **piano to full band**: a motif alone, a pulse and a swell, a stop on the dominant, the reveal a whole step up with everything, the motif as the sonic logo. Human, premium, emotional launches.
- [four-rooms.abc](scores/four-rooms.abc) — **a score fitted to an existing film**: seven scenes, four sync points, a bar cut to 3/4 instead of bending the tempo. How to score a film that is already cut.
- [signal.abc](scores/signal.abc) — **tech and fast**: a hook with a beat from bar one, a half-time verse, a stutter turnaround, a filtered build into a tape stop, half a bar of silence, the drop, a button.

What makes a score sound composed rather than generated:

- **A motif** of three or four notes that belongs to the product, stated early, transformed in the middle (new instrument, new harmony, faster), and ending the film as its sonic logo.
- **Roles**, each in its own register: melody (one line, often doubled in octaves at the peak), harmony (pad or piano chords, voice-led — move each note as little as possible), pulse (pluck, staccato strings, hats), bass, drums. Never two parts in the same octave doing different things.
- **Harmony that suits the brand.** Bright and human: major with added 9ths and sus chords, IV–V–iii–vi, a Lydian ♯4 for wonder (the Hisaishi colour, pentatonic tunes over it). Warm and jazzy: ii–V–I, maj7 and 9th chords, a waltz (the La La Land colour). Tech and cool: minor i–VI–III–VII, sus2 voicings, sixteenth ostinatos over long chords. Epic: minor, low string ostinato, horns, braams.
- **The lift**: up a whole step (or to the relative major) at the reveal; approach it from its dominant.
- **Space**: rests are composition. The bar before the drop is the most important empty bar in the film.
- **Dynamics that move**: crescendos into sections, the peak at `!ff!` with the most instruments, the hook one dynamic lower than the drop.

### 4. Fit, render, check

`om sound` fits the marks and tells you what it did:

```
music    om-score "huashu-motion · Four Rooms" · 517 notes · PNO:piano MEL:strings … · ends 29.24s
fit      marks on the picture: rooms 5.45s · studio 13.00s · made 20.35s · logo 27.00s
tempo    rooms→studio 127.4 bpm (-0.5%) · studio→made 122.7 bpm (-4.1%) · made→logo 128.9 bpm (+0.7%)
```

Each stretch between marks is played at whatever tempo lands both ends exactly (ritardandos and fermatas keep their shape). A stretch that bends more than ~8 % has the wrong number of bars: add or remove a bar, or change one to 3/4. Marks that match no label are listed as unmatched; with no matches the score plays from the start at its written tempo.

Then check the shape you cannot hear: loudness per stretch should follow the energy curve (Signal measured hook −16.5, verse −18.6, build −16.1, stop −21.2, drop −13.9 dB RMS):

```sh
node -e "import('<skill>/../cli/lib/sound.js').then(S=>{const w=S.readWav('assets/sound.wav').data;for(const[a,z]of[[0,4],[4,11],[11,15],[15,16],[16,24]]){let e=0;for(let i=a*48000;i<z*48000;i++)e+=w[i]*w[i];console.log(a+'–'+z+'s',(10*Math.log10(e/((z-a)*48000))).toFixed(1),'dB')}})"
```

## Sound effects

```js
tl.to('.card', { y: 0, ease: 'back.out(1.2)', duration: .7 }, B(8) + .5);
OM.sfx('thud', B(8) + .5 + .33);          // on the frame the card actually lands
tl.to('.stamp', { scale: 1, duration: .28, ease: 'power4.in' }, OM.sfx('stamp', 8.2) - .28);  // OM.sfx returns its time
```

- `OM.sfx(name, at, { gain, pan, note, pitch, dur })`. `at` is the impact (for `riser` and `reverse`, the end of the swell). `note` is a scale degree for the tuned ones (`pop`, `ding`), so a row of pops can climb the scale. `dur` sets the length of continuous ones.
- `om sound --list` prints every effect. UI and objects: `pop tick click type shutter thud paper stamp draw count boing slide`. Moves: `whoosh whip`. Moments: `impact` (a title slam) `ding chime sparkle` (a reveal, the end card). Tech and montage: `hit` (a punch on a hard cut), `glitch` (a digital stutter), `subdrop` (an 808 sub falling under a drop), `reverse` (a reversed cymbal swelling into a hit), `riser`.
- Effects are re-voiced to the music's world (`kit`: chip, lofi, cinematic, organic; a written score defaults to cinematic).
- Grammar templates get an effect per cue kind automatically (point → pop, number → count, highlight → draw, title → riser…). Put `"sfx": "stamp"` on a cue to choose, `"sfx": false` to mute it.

Placing hits:

- **On the landing frame, not the start of the tween.** With `back.out` a card first reaches its place at about 45 % of the duration; with `expo.out` most of the travel is in the first 30 %. Snapshot the frame you think is the landing if unsure.
- **Density follows the energy curve**: sparse in the hook and the stop, one per cut in a montage. About 8–15 per 30 s for a motion-graphics piece; one `impact`, one `chime`, at most.
- **Repeat with variation.** Four cards: four thuds panned left to right. Eight chips: eight pops climbing the scale (`note: i + 1`). A row of identical sounds sounds like a bug.
- **Big moments get space.** Let the stamp, the end card or the punchline number have a beat where nothing else hits.

## The built-in directions

```js
OM.music({ product: 'devtool', brand: 'Acme', drop: 'reveal', ending: 'button' });   // om sound --list shows them all
```

`product` (devtool, ai, hardware, consumer, cute, creative, game, data, explainer, calm, guofeng, hype) picks one of three directions from the brand; `variant: 0–2` chooses, `seed: n` rerolls key, loop and motif; `style` names one directly (pulse, funk, trap, synthwave, cinematic, piano, lofi, ambient, acoustic, pizzicato, chiptune, mallet, guofeng). Structure: `drop: 'sceneId'` (a breath, then the full band on that scene), `ending: 'ring' | 'button' | 'stop'`, `energy: { sceneId: 0..1 }`, `floor` (the opening energy: groove styles start at 0.55, so kick and hats play from the first scene), `motif: [degrees]`.

How it composes, so you can steer it: scene labels are sections and each starts its music on its cut; the tempo is chosen so the cuts sit on the grid (`OM.music({ bpm })` + `OM.beat(n)` makes it exact); a brand motif opens and closes the film; energy climbs section by section to the drop, which gets a breath before it, a reverse crash and a sub drop; the button ending stops the band on the end card.

## Levels

Alone: music at −18 LUFS with effects on top, master at −14 LUFS integrated (X, Reels and 小红书 normalise near there), peaks limited to −1.5 dBFS, sub-30 Hz removed. Under narration the music sits ~12 LU under the measured voice, ducks under every word and is carved around 2 kHz. For a web page or a deck, −16 is calmer.

Check what you can't hear:

```sh
ffmpeg -v error -i assets/sound.wav -lavfi "showspectrumpic=s=1600x400:legend=0:scale=log:fscale=log" spec.png
```

- Vertical stripes are the hits: are they where the picture lands, and not piled into one second?
- Then ask the user to listen. Taste in sound is theirs; what you can guarantee is sync, shape, balance and level.
