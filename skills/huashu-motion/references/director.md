# The director

Read this before any new film. The director's job is to turn "make a video for my product" into one
specific film that could only be about this product, then hand the animator a plan precise enough to
build without inventing anything on the way.

Most AI-made motion fails here, not in the code: it picks the same look for every product (warm
off-white, Geist, a lime accent, springs on everything), or it animates every feature with equal
weight. The library gives you a vocabulary; this file is how you choose from it.

## 1. Read the product before asking anything

Look at what the user gave you and what you can open yourself: the website, App Store page, README,
screenshots, logo, brand colours, existing launch posts, the data file. Note in one line each:

- **What it is** in the user's words, and the category (dev tool, consumer app, AI model, hardware…).
- **The one thing** this film must leave behind (see §2). If the user did not say it, propose it.
- **Personality** on five sliders (§3), with the evidence you read it from (the site's type, its
  copy, its colours). Brand assets beat adjectives: use the real logo, colours and type.
- **Real material**, collected before anything is drawn (`om grab <folder>` for the project on this
  machine, `om grab <url>` for the site and repo; run the product and capture it): the logo file,
  the interface, numbers with sources, footage, a voice.
  Real material is the strongest thing in a film; a faithful rebuild of the product's own UI beats
  any invented mock-up. Every string, number and default you put on screen must point to a real
  screenshot, recording or page; what you cannot point to is not shown. Footage the user gives (a
  person demoing, a screen recording) plays as it is: uncut, unmasked, unstabilised; in a 16:9 frame
  the space beside it carries the supporting elements. Process it only when asked — rotoscoping a
  demo the user wanted untouched cost one test film a quarter of an hour, thrown away.
- **Research without waiting**: when material takes long to gather (a product's history, archived
  sites, old launch videos), send researchers and meanwhile build the hardest shot or the hero object
  from what you have. A main line idle for 25 minutes is the most common waste.
- **Where it plays**: X / LinkedIn feed (autoplay, muted at first, 16:9 or 1:1), TikTok / Reels /
  小红书 (9:16, captions), landing-page hero (seamless loop, no sound), keynote / stage (16:9, sound),
  App Store preview, a README GIF.
- **Material**: code-built, CG, live footage, AI-generated footage, screen recording — and in what
  mix. Material changes a film more than language does.
- **People**: none / hands only / picture-in-picture / on camera; who speaks (nobody, voice-over,
  dialogue). In Oct 2026 launches, 12 of 15 films over 60 s had a person; 1 of 20 under 20 s did.
- **Sound mode**: muted-first (must read without sound) or sound-led. Short UI films are often
  silent; anything long or with people needs sound.
- **Campaign**: one film, or one of a series that should share a skeleton and swap the world.

[library/product-fit.md](library/product-fit.md) shows what each product category used, with
examples; read it now.

Ask only what you cannot find or infer, in one message, with your defaults written in: "I'll assume
X unless you say otherwise." When the request is one line, offer the few decisions that change the film
most with a default and two alternatives named by real references (SKILL.md, step 1). Always settle narration once (none / system voice / their recording).

## 2. Find the shape of the message

The message's shape decides the motion language far more than the product category does.

| Shape | Sounds like | Natural languages | Wrong choice |
|---|---|---|---|
| **Claim / feeling** | "Introducing X." "Any model." | kinetic-type, generative-field, 3d-object; brand ident (formats: launch sting) | a UI tour |
| **Workflow** | "Type this, get that." | cursor-demo, continuous-morph | abstract shapes with no product |
| **Mechanism** | "Here is why it works." | mechanism, system-diagram, flat-world | a fast cut reel |
| **Evidence** | "Signups doubled." | data-story, editorial-collage | numbers flashing by unreadably |
| **List** | "Five new things." | kinetic-type chapters, modular-grid, card-montage, continuous-morph (one object becomes each); resource list loop (format) | five equal slides |
| **Transformation** | "Before / after." | continuous-morph, data-story, split compare (technique) | a cut between two stills |
| **Story** | "A little agent wakes up…" | talking-head, photo-led, character, flat-world, hand-drawn | bullet points |
| **Showcase** | "Look what it can do." | one deeply made artifact (mechanism, 3d-object); showreel (style-hopping on one spine); art-styles | a feature list |

A film can have two shapes (story opening → workflow middle → claim ending). Give each part its own
language only when the switch itself means something; otherwise carry one language through.

## 3. Read the personality

Score each slider -2…+2 from evidence. The sliders set the parameters of whatever language you pick.

| Slider | −2 | +2 | Moves |
|---|---|---|---|
| precise ↔ playful | Linear, Vercel, Stripe | Duolingo, Arc, Figma | easing (hard ease-out / linear → springs with overshoot), shape language (grids → blobs) |
| calm ↔ energetic | Notion, Things, meditation | games, sports, crypto, music | tempo (80–100 → 125–150 BPM), shot length, cut density |
| premium ↔ accessible | Apple, luxury, Leica | Canva, consumer utilities | negative space, type scale contrast, colour count, how much is on screen |
| technical ↔ human | CLI tools, infra, models | social, health, kids | monospace / code / diagrams vs photos, faces, hand-drawn |
| established ↔ new | banks, enterprise | startups, beta launches | restraint and continuity vs bold, surprising, meme-literate |

Write the result as a sentence: "Precise, calm, premium, technical, new — Linear-like." That sentence
is the brief for every later choice.

Three cautions. Precise ↔ playful is about motion and shape (springs, blobs vs grids); premium ↔
accessible is about density and vocabulary — do not let one slider drag the other. Calm ↔ energetic
sets the music and the cutting, and the cutting matters more. Measured on 21 launch films
(2026-10): the cool ones were not fast in tempo (reliable BPMs 77–130, median 105) but in cutting:
music-driven films cut every 1.8–3.5 s on average, 15–33 times a minute, and nine in twelve had one
burst of 5–8 cuts inside five seconds. Developer and AI launches cut too (Vercel: 24 cuts in its
first minute at 115 BPM); only UI recordings and slow dissolve films ran with no hard cut. When the
brief asks for *tech*, *cool* or *energetic*, choose the hybrid or montage route in
[rhythm.md](rhythm.md) whatever the category. For a launch film the default is energetic whatever
the brand: 100–125 BPM, an onset or the first cut within 3 s, a climb, and a burst of cuts near
30–60 % of the length. The brand's calm sets the look (palette,
type, eases, colour), not the energy. Go calm (80–100 BPM, no drums) only when the user asks for it
or the piece is a loop or an ambient ident. Evidence: a calm brand's launch built at 96 BPM with one
event every few seconds was "boring"; rebuilt at 120 BPM with shot-scale contrast, an eighth-note
montage and a stop before the drop, the same user scored it 80 against 60 (rhythm.md, the case). Technical ↔ human is
about warmth (a hand-drawn loop is human with nobody in it); whether a person appears is the
People line in §1, not this slider.

## 4. Three directions, genuinely different

Unless the user already chose a style, propose three directions on the same content. Make them
differ in **language or material**, not just colour (the biggest differences between Oct 2026 launch
films were material: a pure code recording versus live footage with UI cards growing out of it):

- **A · Fit** — the language the message shape and personality point to. The safe, excellent choice.
- **B · Amplify** — the same message pushed: a bolder language or a stronger device (one continuous
  take instead of scenes, type as the hero instead of UI, a 3D world instead of flat).
- **Depth, and only once:** exactly one of the three is a depth direction (it can be A, B or C,
  whichever the product suits) and the other two use languages with no 3D as their idea, so the
  user always has depth to choose and always has something else. Which you recommend follows the
  product and the brief: depth for a premium launch, a physical or iconic object, an interface
  with layers worth separating; another language when the message is a sentence, a list, a
  changelog, a mechanism, or the user's words point elsewhere.
- **C · Unexpected** — a different language that still carries the message and suits the brand
  (an art-history reimagining, a character story, an editorial collage). It must still be about
  the product; novelty for its own sake is not a direction. Patterns that worked in Oct 2026: the
  film is itself the product's output (a voice product's film voiced by it); a concrete everyday
  world (a mahjong table, a GameBoy) that unfolds into the flat UI; a calm hand-drawn loop; a single
  physical object as the ident.

Directions differ on the energy axis too: never three quiet ones. For a launch film all three have
a beat; let one of them be the fast, montage-led version.

If the directions share a drawn object (a mascot, a creature, a character, an emblem), make that
object first, alone, at full size, before the three frames: it must look like artwork, not an icon,
because one weak object sinks all three directions. Living and organic things (animals, plants,
people) are not hand-written geometric SVG: cut them from real material (public-domain prints,
photos, the brand's own art) or use an art-direction skill when one is installed (huashu-art-motion).

For each direction write the lines below and render **one real key frame** at full resolution (not a
description, not a wireframe; `om still directions/a.html` makes the PNG):

```
A · <name>       language: <id> (+ technique highlights)   look: <type, material, light>
Palette:         <role #hex share · …> — from: <where each colour came from>  (colour.md §5)
Logline:         <the film in one sentence, with the hook and the ending>
Why it fits:     <message shape + personality sentence → this>
Feel:            <route (continuous / montage / hybrid), BPM, events per bar, what the first 3 s show with the sound off>
Risk:            <what could make it fail, e.g. "needs real UI screenshots">
```

Music is not on the cards. Most users can't judge a music world from a name, and asking them to is a decision they don't want: once a direction is chosen, you find a real track ([music-sources.md](music-sources.md): the user's own, a tool in the environment, `om music`, an open library) and write it into the treatment (track, source, licence, bpm and confidence from `om beats`). The synthesized worlds in [music.md](music.md) are the fallback. Offer music options only when the user asks for a say in it; when they name a style or a track, use theirs.

Take the colours from the product before drawing anything; the three use the brand's palette
differently rather than inventing new ones ([colour.md](colour.md)); `om swatch directions.md` renders the three palettes side by side and
warns when they share the house look. Show that PNG with the key frames.

Let the user pick (or mix). Users mix by layer — "c's composition and people, b's feeling", or one
direction's palette on another's composition — so keep palette, look/material and feel/rhythm as
separate lines that can be recombined. Then never drift from the
chosen direction without saying so.

If the user said "just make it", or the film is a quick variation of an existing one, choose A
yourself, say in one line why, and offer B and C as a one-line alternative at hand-over. Name
directions by a real reference ("Linear changelog", "Apple bumper", "Kurzgesagt") — never by
adjectives like "premium modern".

## 5. Treatment: the beat map and four stills

Before writing the full film, produce:

1. **The rhythm sheet, then the beat map.** Choose the route and draw the energy curve first
   ([rhythm.md](rhythm.md) §1–2, §7): energy per stretch, events per bar, where the burst is (usually
   30–60 %), where the hero moment is, and whether a stop earns its place. Then pick a tempo from the personality (§3) and lay the film on bars. One row
   per event: `bar.beat | time | what happens | language move | sound`. Something lands on most beats;
   holds are planned, not leftover. Put the hero moment on the strongest musical point (the drop,
   the first downbeat after a build). See [library/formats.md](library/formats.md) for the skeleton
   of each format.
2. **Four stills** at the moments that carry the film: the hook frame, the hero moment, the densest
   frame, the end card. Render them for real: `om still <dir> --at 0.4,4.8,7.2,14.5` writes the
   frames through the same engine as the render. If a still is not good
   as a poster, the film will not be good either.
3. **The continuity chain.** One line per transition: what object or colour carries the eye from
   shot N to N+1 (`send button → orange wok → lime flood → bubble`). Any link you cannot name is a
   cut; keep it only if the cut is the point. A film whose scenes replace each other with nothing
   carried across reads as slides, however smooth each scene is.

Show these to the user before building the full film when the film is longer than ~15 s or the
user is picky about taste. For a short sting you may build straight through, but still write them.

## 6. Hand-off rules for the animator (you, next)

- Build the hardest shot first, at full resolution, with final type and colours.
- Everything is a function of time. Springs via `OM.spring`, camera via `OM.camera`, randomness via
  `OM.random(seed)`.
- Keep the language's banned list (each language file has one) and the film-wide one below.
- Check with `om qa` after each render: pops, dead time, motion contrast, loop seam.

## Film-wide taste rules

From 142 high-engagement films of Sep–Oct 2026: 40 from the Claude Motion wave on X, 48 product
launches, 54 from the top of a prompt gallery. They describe what worked, not why; likes depend on
the account. Defaults, not laws: break one when the direction calls for it and say why.

1. **Start moving.** Frame 0 is the poster feeds and players show before the film plays: the subject is already in it. From there it already has motion or an unresolved shape. The hook can be the result
   first, a prompt being typed, or a question on screen; it is never a static title card, and never a lone object fading or glowing in on an empty dark
   frame (the usual opening of a one-line film; it reads as a screensaver). (Films
   built around a person open on the person.)
2. **Choose the route on purpose.** Continuous — one world, few cuts, an object carried from scene
   to scene (morph, flood, push-through, shared element) — was the median of the short UI films on X
   (0–2 hard cuts, fewer cuts with more saves) and of UI recordings; launch films cut far more
   ([rhythm.md](rhythm.md) §1). Montage — many cuts, each exactly on a beat and
   readable at once — is the language of hype, hardware and trailers. Most launch films that should
   feel tech and cool are hybrid: a continuous spine broken open by montage bursts at the turn and
   the peak ([rhythm.md](rhythm.md)). Whatever the route, every cut is motivated: carried or on the beat.
3. **Something lands on the beat, and the energy has a shape** when there is music: pick a tempo,
   most beats carry an event, the hook lands within 3 s, one stretch bursts into cuts on the beat,
   and the biggest reveal sits on the strongest musical point. A silence slammed back on a cut is
   a signature move to use on purpose, not a requirement. A film at the same
   energy from start to end is boring however good each frame is; `om sound` prints the energy of
   every stretch and flags a flat one. Narrated or ambient films follow the voice instead.
4. **Real product.** The product's actual UI and words: a clean capture or recording of the real
   thing, or — when it has to move — a code rebuild traced over a capture with a cursor doing real
   clicks. Never grey placeholder boxes, never a UI invented because it was quicker, and never a
   placeholder where a photo, avatar or thumbnail belongs: use the product's own, a real one found
   online, or an openly licensed one, with its source in materials.md. Never a screenshot panned around. Prompts and code
   shown on screen count as real material.
   **Depth is a choice the user makes.** One of the three directions is in depth (the interface
   as layers in space, the logo and screens as objects in a studio), the other two are not; which
   one wins depends on the product and the brief. When depth is chosen, the camera carries the whole
   film in space, not just its opening. [depth.md](depth.md)
5. **Craft shows at rest.** Every hold is a poster: type set properly, one accent, no default fonts.
6. **Sound.** No film goes to the user without music: a real track, chosen before the cuts so the rhythm sheet starts from its bar lines and drops (`om beats`). Long films and films with people are sound-led; short UI films and loops must read
   with the sound off (a silent, self-explaining loop was among the most saved films). Each landing
   gets a hit. Social masters at −14 LUFS, see [sound.md](sound.md).
7. **End right.** A launch ends on the mark (a URL pill is optional; several top launches had none).
   A showcase, list or loop ends by returning to its first frame instead.
8. **Give people something to take.** Saves came from reusable things: a named list, the prompt on
   screen, a cheat-sheet, labelled specs. Films with only mood got likes and few saves.
9. **Not a template.** If the film would look the same with another product's name in it, it fails.
   Before building, ask whether this is a re-skin of the most famous film of the month. The
   product's own colours, shapes and vocabulary must generate the motion; say how the look differs
   from the house style (library/README.md).
