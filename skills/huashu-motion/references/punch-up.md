# Punch-up — making a film that already exists much better

Someone has a finished film and says it should be far better: the music, the rhythm, the motion. The film
is usually correct (it passes `om check` and `om qa`, the facts are right, the brand is right) and flat.

**A correct, flat film is not fixed by polishing it.** Longer eases, a nicer shadow and one more sound
effect leave it where it was. Three things make the jump, in this order:

1. **Every stretch gets its own shot.** The flat film is one layout shown many times.
2. **The frame is on the change, large, at the moment it changes.**
3. **The score is rewritten on the picture's grid**, with a role added at every section.

Keep the idea, the material, the palette and the words. Rebuild the shots and the score.

## 1. Diagnose with numbers before touching anything

Adjectives ("more premium", "ten times better") do not say what to change. These do:

| Look at | Command | What flat looks like |
|---|---|---|
| motion per second | `om qa <dir>` | most seconds under 1 (a healthy launch film sits at 4–15 with one planned dip) |
| the whole film at once | `om qa <dir> --sheet` | rows of tiles that are the same picture; scenes that are one layout with other content |
| the score | `om sound <dir>` | `warning score:` lines (a bar that does not add up is wrong notes from there on); energy that never steps |
| the mix | spectrogram (sound.md) | dark gaps while the picture is busy: the arrangement is thin there |

Write the diagnosis as three or four lines with the numbers in them, and tell the user before rebuilding.
It is the "before" that the result is measured against, and it shows them you watched their film.

## 2. Decide what stays

- **Stays:** the idea and its spine (the one object that travels through the film), every approved word on
  screen, the claims and numbers, the palette and type, the material, the length within a few seconds, the
  delivery settings (signature, format). Commissioned films have had their copy approved: a second pass
  that rewrites it creates a new approval round nobody asked for.
- **Goes:** layouts, eases, the camera, the cut points inside sections, the arrangement of the score.
- **Kept on disk:** copy the old `index.html` and `treatment.md` into `tools/` before rewriting, and never
  touch the old render in `out/`. The user will compare.
- No new direction gate when the style is unchanged. If the fix you believe in changes the style (flat
  to depth, light to dark, a new palette), that is a direction: show it and wait.

## 3. The slide test, and five ways out

For each stretch ask: **could this frame be a slide?** A thing on a ground with a caption under it is a
slide, however well it eases in. If yes, give the stretch one of these, and never the same one twice running:

- **Full bleed.** The material is the frame. An edit wipes across the whole screen.
- **Macro.** Cut to the detail that changed, large enough to be the only thing in frame; one detail per
  beat is a montage made of a single image. A macro needs coordinates: lay a 10 % grid over the material,
  read off where each thing is, and write the regions down as fractions of the image.
- **In space.** A row, a stack or a wall standing in perspective, the camera stepping along it. Only what
  has happened is lit; what has not happened yet is not on screen.
- **All at once.** Every version flies out of the one you were watching into a wall; then one is pulled
  forward. This is the release after a run of fast single shots.
- **Collision.** Two things meet in the frame and one thing comes out, on the beat, with a flash.

**The label stays where it is.** One caption position, one tag position, in screen space, the same for
every stretch, while the world behind changes. The eye learns once where to read. A label that sits over
the material it describes is the note users give most often: check every stretch for it.

## 4. The frame is on the change

For anything that edits, transforms or compares: when something changes, the camera is already on it, it
fills a third of the frame or more, and the change happens while you look. A wide shot in which a small
region changes is a spot-the-difference puzzle.

A marker that follows the subject (a selection box, a cursor, a highlight ring) is drawn from the
element's real position each frame: `getBoundingClientRect()` inside `OM.clock`'s draw, divided by the
film's on-screen scale. It then follows any camera move, cut or drift without a second set of keyframes.

## 5. Rebuild the rhythm on the grid

- Keep the bar plan if the sections were right; change what happens inside them.
- A burst: accelerate (two beats a shot, one, half), lock to the beat, release into something wide.
- The stop: fold everything into one small object, hold it in near silence, let one small event happen
  (a click), and open the next section out of that object.
- No still frame anywhere: every hold drifts (3–6 % of scale, linear) until the next move takes over.
- Cuts sit half a frame in (`(Math.floor(t * fps) + 0.5) / fps`) so a blurred render never blends two
  shots; anything that counts on screen is quantised to whole frames for the same reason.

## 6. Rewrite the score, do not remix it

Energy is arrangement, not tempo or volume. Give each section one more role than the last and name it:
a pad under the hook; an ostinato and a roll in the build; the melody in octaves, open hats and a clap
at the drop; four on the floor for the last third; the motif alone on the logo. The breath before the
drop still has a pulse (half-time kick, a held chord); only its last half bar is empty. Then read what
`om sound` prints: no `warning score:` lines, energy that steps up, dips once and peaks at the drop.

## 7. Two rounds of your own notes before anyone sees it

1. `om check`, then `om still --at` a list of times computed from the beats (two or three per section,
   and the first quarter beat after every cut). Look at them side by side. Fix.
2. Render without `--blur`, `om qa --sheet`, read every sheet. Write the notes a demanding director would
   give (there are always some after the first full render), fix them, and only then render with `--blur`.
3. Look at frames of the final file around the fastest cuts, and at frame 0 and the last frame.

Report the before and after with the same numbers as the diagnosis.

## 8. What a second pass must not do

Change approved words or claims; invent new copy to fill a transition (a transition that needs words
needs a different transition); add narration or switch the signature without being asked; delete the
old version; call the film better on the strength of the numbers alone. The numbers say it moves. Only
the person watching can say it is good, and until they have, the result is "rebuilt, not yet judged".

*Source: one commissioned launch film rebuilt on 2026-11-09 (motion per second 0.3–0.5 for most of the
film → 4–15; 13 cuts → 34; two voices of the old score were in the wrong key from a leaked key change and
several drum bars had nine eighths). The tool faults it exposed are fixed and tested; the method above is
observed on that one film.*
