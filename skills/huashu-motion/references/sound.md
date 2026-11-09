# Sound

A film ships with music and sound effects. Silent motion reads as a draft: the same cut that feels abrupt without sound feels intended when a note starts on it, and a card that lands without a thud looks weightless. Leave a film silent only when it is an overlay for someone else's edit (`om render --transparent`) or the user asks for it (`om sound --off`).

`om sound` renders everything from what the composition declares — no network, no API — so a retimed film re-renders its own soundtrack (`om render` does it before every export). Instruments are synthesized, or played from real recordings once the sample pack is installed (`om samples build`, once per machine: a concert grand, string sections, horns, harp, mallets, guitars, a recorded drum kit; CC0 and CC-BY, credits in its NOTICE.txt). Run `om samples` to see whether it is there; without it everything still works, on synths.

**Pick the world first** ([music.md](music.md)): sixteen musical worlds — pulse minimalism, UK garage, minimal techno, drum and bass, funk, lo-fi, trap, synthwave, cinematic, lyrical piano, jazz trio, folk, chiptune, ambient, 国风, amapiano — each with the products it suits and a two-bar groove that renders. You choose it from the product's character after the direction is chosen; the user isn't asked unless they want a say. `om sound` prints the score's soundprint (tempo, key, band) and warns when it is one of the example scores' bands or a recent film's on this machine: every film sounding alike is the failure users notice first.

There are two ways to score a film:

- **A built-in direction** — `OM.music({ product: 'devtool' })` picks one of three directions for the product category and composes it around your scenes, drop and ending. Fast and decent: drafts, quick stings, anything where music is not the point.
- **Composer mode** — you write the score (an `om-score` in ABC notation) and `om sound` performs it on the instruments, fitted to the picture. For launch films and anything the user will judge by how it feels. The music can only be as good as the composition, and the composition is yours.

Read [rhythm.md](rhythm.md) first either way: the music's energy curve is the film's energy curve.

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
