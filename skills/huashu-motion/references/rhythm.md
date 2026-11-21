# Rhythm

A film can be correct in every frame and still be boring. Boring has a recognisable shape: one event
every four or five seconds, the same move in every scene (a card grows, holds, shrinks), one shot
scale throughout, every ease a soft 0.6–0.8 s, and music idling on a pad until a single hit at the
end. Nothing is wrong, so nothing gets fixed. This file is how to design the opposite on purpose:
the energy of the film over time, how dense each stretch is, and where it changes.

Rhythm is the contrast between stretches, not a fast tempo. A film that is fast everywhere is as
flat as one that is slow everywhere. What reads as "cool" and "tech" is control: a hard, quick
middle, a moment where everything stops, and a drop that arrives exactly on the frame you were
waiting for.

## 1. Choose the route before the beat map

| Route | What carries the eye | Cuts | Fits |
|---|---|---|---|
| **Continuous** | one world, a camera moving through it, objects carried from shot to shot | 0–2 | precise and calm brands, mechanisms, a single product UI |
| **Montage** | the beat: every cut lands on it and every frame reads at once | many, on the beat | hype, hardware, games, sport, "look how much it does" |
| **Hybrid** | a continuous spine, broken open by one or two montage bursts | bursts only | most launch films that should feel tech and energetic |

"One world, few cuts", the median of short UI films on X, is right for UI recordings and the
continuous route, and wrong for launch films. Measured on 21 launch films (2026-10), 15 cut ten or
more times a minute; the music-driven ones averaged a shot every 1.8–3.5 s (median shot 1.2–2.2 s,
15–33 cuts a minute). Only UI recordings and slow dissolve films had no hard cut. A launch film that
should feel *tech* and *cool* is usually hybrid: a spine you can follow, broken open by a burst.

## 2. Draw the energy curve

Before the beat map, write the film's energy on a 0–10 scale for each stretch of a few seconds, and
check its shape. The shapes that work:

- **Hook within 3 s.** A clear onset or the first cut inside three seconds (14 of 21 measured films):
  motion, a hit, an unresolved shape, a question. It does not mean a frantic open: only 3 of 18
  cut three times in the first five seconds, and most opened 6–20 dB under their peak.
- **Climb in steps, not a slope.** Each section adds something you can name (the kick enters, the
  camera starts travelling, the cuts double). A slope you cannot hear or see is a plateau.
- **A burst near the middle.** The densest five seconds of the measured films sat at about 37 % of
  the length (30–60 % typical): 5–8 cuts, about one per beat, framed by shots of 1.5–4 s.
- **The hero moment on the strongest musical point**, usually after the burst: the drop, the first
  downbeat after a build.
- **A stop, when it earns its place.** Near silence for 0.5–1.6 s, then picture and sound slammed in
  on the same frame (GoPro, Sora 2 and Marathon did it; most films did not). Cheap power, but a
  signature move, not a requirement.
- **Resolve.** The last stretch comes down to the mark: one idea, held, with the music ringing or
  buttoned.

Shapes that read as boring: a flat line at 3–5 with a hit at the end; a slow build that reaches its
top in the last two seconds; the same energy in every scene. Two drops (a small one at a third, the
big one at three quarters) work for films over 30 s.

## 3. Density: events per bar

Count what happens per bar (four beats). An event is anything the eye or ear registers as new: a cut,
an element landing, a camera move starting or stopping, a word, a hit, an instrument entering.

| Stretch | Events per bar | Shot / move length |
|---|---|---|
| hook | 2–4 | moves of 0.25–0.5 s |
| build | 2–4, rising | 1–2 beats per move |
| stop | 0–1 | hold 1–2 beats |
| peak / montage | 4–8 (one per beat or eighth) | ½–1 beat per shot |
| resolve / mark | 1–2 | hold ≥ 1.5 s on the mark |

The measured shape of a burst (Vercel, 115 BPM): shot lengths 1.67, 1.37, 1.10, 1.00 s, then
thirteen cuts of one beat (0.50–0.57 s), all within 28 ms of the beat, then 1.10 and 3.04 s.
Accelerate, lock to the beat, release.

The fixed rule underneath: **no stretch longer than about two bars without something new**, except
a stop you planned. `om qa` reports dead time; treat any gap it flags outside the stop as a bug.

## 4. Contrast schedule: what changes between stretches

Change at least two of these at every section boundary, and all of them at the drop:

- **Shot scale**: extreme close-up ↔ wide. Open on a detail (a dot, a cursor, a key) and pull out
  hard; punch in 2× on a number as it lands; cut from a macro to the whole system.
- **Speed**: the move durations (0.25 s hard moves against a 2 s glide), and speed ramps inside one
  move (fast in, near-stop at the key frame, fast out).
- **Ease family**: hard ease-out (expo, power4) for tech; springs only for things that should feel
  physical. Soft 0.6–0.8 s eases everywhere is the default that makes films sleepy.
- **Camera**: still ↔ travelling ↔ whipping.
- **Density**: one object on screen ↔ a grid of nine.
- **Colour / ground**: a flood to the brand colour, a flip to dark.
- **Music texture**: half-time ↔ full beat ↔ stop ↔ drop (see §6).

The moves themselves (hard cut on the beat, flash cut, match cut, whip, speed ramp, glitch,
beat-by-beat type, grid slam) are in [techniques.md](library/techniques.md); pick them for what
they say there.

## 5. Montage bursts

A montage is a run of shots each lasting a beat or less, cut exactly on the beat, each readable at a
glance. It turns "it does many things" into a feeling instead of a list.

- Build it from real material: the product's outputs, user stories, screenshots, numbers. Invented
  filler makes a montage look like stock footage.
- One spine through it: a shared position, colour or shape (the same dot in every shot, the same
  grid cell), so it reads as one move and not as noise.
- Accelerate inside it: two beats per shot, then one, then half, then stop.
- Every cut in the burst lands on the beat (±1 frame at 30 fps) and every new shot enters already
  moving. Outside the burst, cut on phrases and information: only 2 of 11 measured films cut on the
  beat throughout.
- Keep the eye where it is and change what it sees. The three fast-cut grammars that held up: an
  anchor locked in place while the world behind it changes (Vercel's two figures, Gemini's prompt
  pill over changing materials); a step cut on one framing (iPhone: 12 → 200 mm, a label per step,
  0.3 s each); a spec label slammed in with each shot (GoPro: 8K60, 4K240, 1080p960).
- Give the montage its own sound: a hit or tick on each cut, and the music at full energy.

```js
OM.music({ bpm: 128 });                     // the score's Q:, so picture and music share one grid
const B = (n) => OM.beat(n);
const shots = gsap.utils.toArray('.shot');  // real material, stacked, hidden
const beats = [2, 2, 1, 1, 1, 1, .5, .5, .5, .5];  // accelerate, then the stop
let t = B(32);                              // bar 9
tl.addLabel('scene:montage', t);            // the score's !mark:montage! lands here with 0 % bend
shots.forEach((el, i) => {
  tl.set(el, { autoAlpha: 1 }, t);
  if (i) tl.set(shots[i - 1], { autoAlpha: 0 }, t);                               // the cut, on the beat
  tl.fromTo(el, { scale: 1.12 }, { scale: 1, duration: B(beats[i]), ease: 'none' }, t); // enters already moving
  OM.sfx('hit', t, { gain: .45, pitch: 1 + i * .04 });
  t += B(beats[i]);
});
```

Cuts drift off the music when the picture's grid and the score's tempo differ. When you build the
film and the score together, put every scene label on `OM.beat(n)` at the score's tempo and the
marks on the same bars: `om sound` then reports 0 % bend and every cut is on a beat. When you score a
film that is already cut, the music bends to the picture instead, so a montage inside it should be
retimed after `om sound` reports the fitted tempo of its stretch.

With a real track, the sheet starts from it: run `om beats <track> --plot`, write the track's bar lines, sections and drops into the sheet (bar numbers from `OM.downbeat`, the hero on `OM.drop(0)` or a section start) and place the scenes on them; `om check` lists cuts more than 80 ms off a beat. A track with confidence under 0.3 has no pulse to cut to: use its sections.

## 6. Music that has rhythm

The music's energy curve is the picture's energy curve. With a score written for the film
([sound.md](sound.md), composer mode) every move below is a line of notation; with the built-in
styles, `OM.music({ drop, energy, floor })` shapes the same curve.

- **An onset within 3 s** for anything that should feel tech or energetic: a hit, the kick, a
  driving pulse. Pad-only openings with nothing landing are for calm films.
- **Tempo is not the lever.** The cool films measured 89–130 BPM (median 105). Speed comes from cut
  density, onsets and hat subdivision; 100–125 BPM is the default range.
- **Change the feel, not the tempo.** Half-time (kick on 1, snare on 3) for the verse, the full beat
  for the chorus, double-time hats for the build. The bpm stays and the cuts stay on the grid.
- **Fills and turnarounds** on the last beat before every section: a snare run, a tom fill, a
  stutter.
- **The stop.** Before the drop: a tape stop (`!stop(! … !stop)!`), or the band cut to silence with
  only a riser or reversed cymbal (`OM.sfx('reverse', drop, { dur: 1 })`) pulling into the hit.
- **The drop.** On the reveal frame: the full band, a crash, `impact` and `subdrop` together.
- **The build.** A filter opening (`!filter(! … !filter)!`), a snare roll doubling, a riser.
- **Stutter** (`!stutter(! … !stutter)!`) on a glitch or a fast montage turn: the music repeats a
  sixteenth while the picture repeats two or three frames.
- **Cut hits.** In a montage, `OM.sfx('hit', t)` or `glitch` on each cut gives the picture weight.

## 7. Write it down: the rhythm sheet

Before building, add to the beat map (director §5) one line per stretch:

```
stretch      bars   energy  events/bar  route moves                               music
hook         1–2    7       3           ECU on the dot → hard pull-out on beat 3   kick+hats from bar 1, motif
build        3–6    5→7     3           cards land on beats, camera tracks right   half-time, bass enters bar 5
stop         7      1       0           freeze, one word                           tape stop, reverse cymbal
drop/peak    8–11   9       6           3×3 grid slams on eighths, punch-ins       full band, crash, impact+subdrop
resolve      12–13  4       1           pull back to the mark, hold                motif on the logo, ring
```

Then check the sheet before writing code: is there a hook within 3 s, a burst of 5–8 cuts in five
seconds, and the hero on the strongest musical point? Does
every section boundary change at least two things? Is any stretch longer than two bars with nothing
new?

## 8. A case: the same film, boring and not

A 30 s launch for a calm, warm personal-agent brand (Today: a colon for a logo, a sky-to-peach
gradient). The first build matched the brand's calm: 96 BPM felt piano, energy low until a single
drop at 79 %, every scene the same grammar (a card unfolds from the avatar, holds, folds back),
small cards on a big empty wall, 0.6–0.8 s gentle eases, an average shot of 10 s. It passed `check`,
`om qa` and an independent review. The user: not cool, a bit boring — music, picture and rhythm.

The rebuild kept the palette and the type and changed only the rhythm: a beat from bar 1 at 120 BPM;
an extreme close-up on the colon, pulled out hard to reveal 7:59; a 2× punch-in on the number as it
counts; one wide world travelled left to right, where the two dots fly ahead and the camera whips
after them (the product's promise, "it acts before you ask", became the camera move); nine real user
stories slamming into a 3×3 grid on eighth notes while the camera pulls back; everything sucked back
into the colon, one beat of stillness, the drop. The user scored it 80 against the first version's
60: "the rhythm is much better". What still cost points was craft (a typeface, text over the UI),
not rhythm. `om qa` motion per second went from a flat 0.1–1.8 to 0.4–11.1.

## 9. Check it at normal speed

Frames show craft; rhythm only shows in motion. Watch the render at 1× from start to end, with the
sound, and mark every moment your attention drops: that is where a stretch needs an event, a
contrast, or a cut. `om qa` catches dead time and flat motion curves; it cannot tell you the film is
boring, only that it might be.
