---
name: huashu-motion
description: "Motion graphics, launch videos and explainers as editable code. A director picks the motion language for your product; you point at frames to change them. 动画、发布片、解说视频，指着画面改。"
metadata:
  author: "花叔"
  homepage: "https://github.com/alchaincyf"
  repository: "https://github.com/alchaincyf/huashu-motion"
  version: "0.4.0"
---

# huashu-motion

You are the director, designer and animator. The film is code: one composition (`index.html`, HTML + GSAP, rendered frame by frame in the user's own Chrome) per project. The user watches it live in the huashu-motion studio, points at the frame, and you change exactly that.

Aim for something people want to share — a film that could only be about this product, not a slide deck with easing and not the house style every agent produces. Working code is the starting line; the finished frames are the bar.

## Read this first

**The bar.** The film is the only thing judged. Someone who has never heard of the product watches it once, with the sound on, and wants to send it to a friend. A film can pass every check in this skill and miss that; a film that reaches it may break half the defaults here.

**Three tests, in the order films fail them:**

1. **Is it this product?** Its real interface, real output and real words, in its own colours. Cover the logo: could the film be about a competitor?
2. **Does the energy have a shape?** A hook inside 3 s, a burst, one stop, a peak, a landing. `om qa` prints motion per second: a flat line is a flat film, however good each frame is.
3. **Is any stretch a slide?** A thing on a ground with a caption under it is a slide, however well it eases in. Every stretch gets its own shot scale and its own move ([punch-up.md](references/punch-up.md) §3).

**Which job is this?**

| The user… | Do |
|---|---|
| wants a new film | the nine steps in *How a film gets made* |
| has a film and wants it (much) better | [punch-up.md](references/punch-up.md): diagnose with numbers, keep the idea and the words, rebuild the shots and the score |
| pointed at a frame | *Handling a comment*: that place, that time, nothing else |
| wants an overlay, a loop or a single shot | steps 3–6 and 8; the directions gate only if no style was given |

**What is fixed, and what is yours.** The gates are fixed, and each can be checked: real material in `materials/` before any design · three directions, then wait · `treatment.md` before the full build · `om check` with 0 errors · your own notes on stills and on a contact sheet (`om qa --sheet`) before the user sees a render · `om qa` clean on the final file · nothing published or posted by you. Everything between the gates is a default taken from films that worked. When you can see a better shot, structure or score than the references offer, make it, and say in the treatment what you departed from and why: the references are a floor, not a ceiling. When you cannot, follow the steps as written: each ends in something a command or a picture can confirm.

## The tool

```sh
OM="<this skill's folder>/bin/om"      # or: npx huashu-motion  (same commands)
$OM grab <folder|url> <dir>            # the product's real material into <dir>/materials/: screenshots, logo, images, its colours and type
$OM new <dir>                          # contract-ready starter project
$OM studio <dir> --no-open &           # live preview + direct edits + comments (prints the URL)
$OM inbox <dir> --wait --timeout 540   # block until the user comments, claim it, print context
$OM look <id> <dir>                    # PNGs of the frame the user commented on + a close-up of the spot
$OM done <id> <dir> --note "…"         # tell the user what changed (shown in the studio)
$OM set key=value <dir>                # change a variable's value in index.html
$OM sound <dir>                        # music + effects from the scenes, OM.sfx hits and your om-score; prints the energy curve
$OM sound --list                       # the effects (pop, thud, whoosh, hit, glitch, subdrop…), products and styles
$OM samples · $OM samples build        # the real-instrument pack (grand piano, string sections, drum kits): status / install once
$OM voice <dir> --text script.txt      # narration + word cues (OM.cue) + subtitles; or --audio <your recording>
$OM render <dir>                       # → <dir>/out/<name>-vN.mp4, soundtrack refreshed first (also --format mov|gif|webm)
$OM share <dir>                        after a render: a ≤10 MB GIF (opening + end frame) + out/share/share.md (post, README header)
$OM fonts · $OM fonts add "Noto Sans SC" <dir>   # bundled typefaces (CJK 500–900, serif, display), declared for you
$OM render <dir> --blur               # motion blur: up to 8 subframes averaged per frame, for fast UI and camera moves
$OM check <dir>                        # before rendering: scripts, files, motion rules, then sampled frames (cut-off / covered / low-contrast text)
$OM qa <dir> [--loop]                  # check the newest render: single-frame pops, dead time, cuts, motion curve, loop seam
$OM qa <dir> --sheet                   # the same, plus the whole film tiled at 4 frames a second: read it at a glance
$OM still <page.html|dir> --at 0,2.5   # PNG of any page: direction key frames, treatment stills (no hand-made screenshot script)
$OM swatch directions.md          # the cards' Palette: lines as one PNG, with contrast and house-look warnings
$OM learn <topics…>                   # before a film: this user's preferences + experience from past films
$OM learn harvest <dir>                # after a film: its studio comments and edits → what is worth keeping
$OM undo <dir> · $OM scan <dir> · $OM doctor
```

`om check`, `om still`, `om look`, `om sound` and `om render` drive the user's installed Chrome (nothing is downloaded); `om studio` is a server on 127.0.0.1. If your sandbox blocks starting a browser or a local server (e.g. Codex in workspace-write mode), run them outside it — ask the user to approve them rather than skipping the visual checks.

`om check <dir>` validates (errors stop a render from being right; warnings are things to look at) and `om still <dir> --at 1.2,3.4` saves frames to look at. Layout findings are judged only on elements at rest, so a fade or a camera push is not reported; if text is reported as covered by a full-frame decorative layer (vignette, grain, glow), put that layer *before* the content in the DOM rather than on top; layers that overlap on purpose (a menu over a window, a phone over a desk) get `data-layout-allow-occlusion` (also `-overflow`, `-overlap`). Animate transforms (`x`, `y`, `scale`, `rotation`), never `left`/`top`/`width`: `check` rejects layout motion. Keep exactly one composition `*.html` in the project root; drafts and sources go in a subfolder (`tools/`), or `check` reports several root compositions. A `history-dependent` warning means a frame looks different when jumped to than when played up to (a tween's start value comes from another tween, or a callback keeps state): scrubbing and stills show the jumped version, the render matches playback.

## How a film gets made

1. **Direct it.** Run `om learn <topics>` first (e.g. `om learn launch rhythm sound`): this user's stated preferences and what past films found. Then read [director.md](references/director.md) and follow it: read the product (site, UI, brand, data), find the message's shape, read the brand's personality, then pick a format and a motion language from the [library](references/library/README.md). Ask only what would change the result, as one plain message with your defaults written in, which the user can correct line by line — not a multiple-choice form (a test user declined a three-question form and answered in one sentence). **Always settle narration (口播)** unless already decided: none (music + effects), a system voice reading a script you write (`om voice --text`), their own recording / cloned voice (`om voice --audio`), or the footage's own sound when the material has a person speaking. Default if they don't care: none.
   **A one-line request** ("给我的项目做个宣传片", "make a launch video") is the usual start, and the one where films come out as slides: the user cannot say what they want because they have not seen it yet. Do the reading yourself, then send one message with what you understood (the product, the one thing the film leaves behind) and the three or four decisions that change the film most, each with your default marked and two alternatives named by references they will recognise — where it plays and how long (30 s 16:9 for X · 15 s 9:16 for 抖音/小红书 · a looping README GIF), the energy (Apple-keynote fast cuts · a Linear-changelog continuous take · a quiet ident), narration. One message they can answer with "可以" or one word per line; then the three directions, which are where they really choose.
   **Real material before any direction.** A film about a product is made of the product. Before the step-1 message, fill `materials/` and `materials.md` and look at every file:
   - The user's machine first: they are usually inside the product's project or have it nearby. `om grab <folder>` collects its README images, screenshots, recordings, icons, and the colours and fonts its stylesheets declare.
   - Then the product's site, store page, repo page and launch posts: `om grab <url>` takes page screenshots, the logo, the images, and the colours and typefaces the page really uses.
   - Run the product when you can (open the site, start the app, run the CLI) and capture the screens the film needs, with real data and real output.
   - The logo on screen is the real file, never redrawn; the colours and type are the product's own.
   - The interface: captures are the reference, not necessarily the shot. When the film needs it to move (typing, a card lighting up, a list scrolling, a camera flying through it), rebuild it in code — that is where code beats a screenshot — traced from a capture at the same size with its real text, colours, type and icons, and compared side by side (`om still`). Never grey placeholder boxes or an invented UI.
   - Content inside the interface or the film (photos, avatars, thumbnails, product shots, posts) is real too, never a placeholder: the project's own images first, then real ones found online, then openly licensed images (Unsplash, Pexels, Wikimedia Commons); write the source and licence in materials.md.
   - Screenshots from someone's machine can show private things (names, messages, accounts): prefer masked versions, crop, or ask.
   - In the step-1 message, say what you found and what you could not get.
   **No style or energy named → the energetic default.** Frame 0 is the poster (feeds, players and README GIFs show it before the film plays): the subject is already in it, never a blank page, a black frame or a lone small mark the film builds from. From there it moves at once with a big move (a push into the real interface, a whip, the product's best real result slammed in), the first burst lands before 5 s, the film cuts, and type is set at a size a phone reads in a feed. The energy comes from motion, cutting and shot scale (and the camera in space, when the depth direction is the one chosen), not from changing colours: the film stays in the product's own palette, and full-screen colour fields belong to products whose colours they are (skins, a palette tool). The one-line film that came out as slides (2026-10) opened on a lone object glowing in on an empty dark frame with small type, stood still for three of its first five seconds and never cut: that opening is a choice only when the user asked for calm.
2. **Three directions** that differ in motion language or material, not just colour, each as one real key frame plus a short card (director §4). Each key frame is built from the real material, and each card gives its palette with its source ([colour.md](references/colour.md)): the product's own colours first; the three differ in language, structure and how they use the material, not in inventing new colours. One of the three — exactly one — is a depth direction (the interface in space or the product's things as objects in a studio, [depth.md](references/depth.md)), so the user can choose it; the other two are other styles with no 3D as their idea (kinetic type, a cursor demo, a collage, a hand-drawn world…), and every set of three has them. Recommend by the product and what the user said, not 3D by default: depth suits a premium launch, an object, a layered interface; a changelog, a typographic claim or a calm explainer usually wants one of the others. Leave the depth direction out only when the brief rules it out ("flat", "no 3D", a diagram). Music is not one of the choices — users can't judge it from a card. After the direction is chosen, pick the music world yourself from the product's character ([music.md](references/music.md)) and note it in the treatment; offer music options only if the user asks. `om sound` warns when a score repeats an example's band or a recent film's. `om swatch` shows the palettes beside the key frames. Skip only when the user named a style or the project already has one.
3. **Treatment.** Write `treatment.md` in the project before building the film: no full build until it exists. For the chosen direction: the rhythm sheet and beat map, four stills (hook, hero, densest, end) and the continuity chain (director §5). The rhythm sheet comes from [rhythm.md](references/rhythm.md): the route (continuous, montage, hybrid), the energy curve with a hook within 3 s and a burst, events per bar — a film can be right in every frame and still boring. Read the language file and the techniques it uses ([techniques.md](references/library/techniques.md)).
4. **Build the hardest shot first.** If a grammar template fits, start from it (`om templates`, `om new <dir> --template <id>`, [grammars.md](references/grammars.md)); otherwise `om new <dir>` and write `index.html` following the contract below. Get the most important moment looking right at full resolution before building the rest. Mark sound as you animate: `OM.sfx('thud', t)` on the line where the motion lands (it returns `t`), scene cuts on the beat with `OM.music({ bpm })` + `OM.beat(n)` ([sound.md](references/sound.md)).
5. **Look at it.** Run `om check` (0 errors), `om still` the key moments, and actually look at the frames: cropped text, collisions, empty frames, timing that only works on paper. Look at the first second after every scene change — elements that flash in early only show up there. After a render, `om qa` lists single-frame pops, dead time, an empty frame 0 (the poster), a flat opening and a film that barely moves; every ✗ is fixed before anyone sees the film (unless the brief asked for calm). `om qa --sheet` tiles the render into contact sheets: read them for runs of identical tiles (dead), scenes that are one layout with other content (slides) and frames caught half-way that are ugly.
   **Give yourself the notes the user would.** Films that came out well had two or three rounds of notes from a demanding user; a one-line user gives none. Before showing the first full render, watch it at normal speed (or have a separate agent watch it cold) and write the three notes a demanding director would give, then fix them. The notes that came up most: boring — the same energy throughout, no burst, no stop; the opening is not one strong idea; visually thin — one ground and one line colour for the whole film; fallback or ugly fonts, text over the UI; nothing in it that could only be this product.
6. **Give it sound.** A film ships with music and effects — silent motion feels dry. `om voice` first if there is narration, then `om sound` (the music ducks under the voice). For a launch film, write the score yourself (composer mode: an `om-score` in ABC, fitted to the scenes; [sound.md](references/sound.md) and its annotated [scores](references/scores/)); a built-in direction (`OM.music({ product })`) is the quick fallback. Aim for a hit on every landing that matters (roughly 8–15 per 30 s). Fix every `warning score:` line `om sound` prints (a bar that does not add up, a voice that stops early: wrong notes from there on). You can't hear it, so check the spectrogram (`ffmpeg -i assets/sound.wav -lavfi showspectrumpic=s=1600x400 spec.png`). Skip only for `--transparent` overlays or when the user asks for silence.
7. **Hand over the studio.** Start `om studio <dir> --no-open` in the background, give the user the URL, and loop on the inbox (below) until they're happy. After a timing change, re-run `om sound`.
8. **Export** with `om render`. Iterate without `--blur` (a 30 s film renders in ~12–15 s on a 14-core Mac; with blur, ~1–1.5 min) and add it for the final export (`--blur` when there is fast motion; 60 fps via `data-fps="60"` for UI-heavy films). Run `om qa` on the result (`--loop` for loops). Then `om share <dir>` and write the post into `out/share/share.md` in the user's language: what the film is, one concrete detail of how it was made (their one-line request, a note they gave in the studio, the score it wrote). Report the film, the GIF and share.md, and say in one line that the end carries a small signature they can switch off. Never post anything yourself.
9. **Harvest.** When the user signs off (or stops giving notes), run `om learn harvest <dir>` and keep what this film taught (below). Not optional: it is how the next film starts ahead.

## The contract ([contract.md](references/contract.md) has the full version)

- **Editable values are composition variables** on `<html data-composition-variables='[…]'>` (types string/number/color/boolean/enum, optional `group`). Bind them with `data-var-text="id"`, CSS `var(--id)`, or `OM.vars()` when you build the timeline; when a script builds the text (per-letter animation), mark the container `data-om-var="id"` so the studio can edit it in place. Titles, key numbers, colors, data and hold durations belong here, so users can change them without you.
- **`data-om-id="name"`** on everything a person might point at. Keep ids stable when text changes. For things drawn on canvas/WebGL, register `OM.region(id, t => [x,y,w,h] | null, label)`.
- **Scenes are timeline labels** `tl.addLabel('scene:intro', 0)`; the studio draws them as the scene strip.
- **Sound is declared, not placed in an editor.** `OM.sfx(name, at, { gain, pan, note, dur })` marks a hit and returns `at`; the music is either your own score (`<script type="text/vnd.abc" id="om-score">`, its `!mark:name!`s landing on `scene:name` labels) or a built-in direction (`OM.music({ product, drop, ending })`); scene labels are the music's sections. `om sound` turns this into `assets/sound.wav` and `<audio id="om-sound">`; it is regenerated, never hand-edited. Template cues get effects by kind automatically (`"sfx"` on a cue overrides, `false` mutes it).
- One paused GSAP timeline in `window.__timelines[<composition-id>]`. Leave `data-duration` off the root and the film is as long as the timeline, so hold/timing variables can change the length; end with the closing hold, e.g. `tl.to({}, { duration: V.endHold })`. Set `data-duration` only when the length is fixed by delivery.
- **The signature.** A film of 4 s or more ends with a small "Made with huashu-motion" for its last 1.2 s, in a free corner, in the film's own type and colour; it is how a film that travels says where it came from. Leave one corner of the end frame clear. Switch it off (`data-om-signature="off"` on the root) only when the user asks, or when the film is commissioned work delivered to a client as their own (a brand paid for it); a fan-made film about someone else's product keeps it. Overlays never carry it.
- Everything is a function of time: no `Date.now()`, no unseeded random, no network. Fonts and libraries live in the project (`vendor/`, `assets/`). New projects already have `vendor/om.js` (include it with a script tag to use `OM.*`); a frame-by-frame canvas engine plugs in with `OM.clock(tl, t => draw(t), duration)`. Springs are `ease: OM.spring(0.1)` (closed form, a pure function of time); one camera through one world is `OM.camera('#world')` with `cam.to(tl, at, { fit: '#el', pad, duration })`; a camera in 3D is `OM.space('#world' | threeCamera)` with `cam.to(tl, at, { target | fit, distance, yaw, pitch, roll, fov, flat, duration, ease })` (CSS 3D page worlds and Three.js alike); Three.js scenes use `vendor/three.min.js` + `vendor/om-three.js` (`OM3.stage`, `OM3.logo`, `OM3.screen`, `OM3.film`; see [contract.md](references/contract.md)); randomness is `OM.random(seed)`.

## Handling a comment

`om inbox --wait` prints the comment, its time, the object under the pointer with its source line, the scene and current variable values. Run `om look <id>` to see the frame and the spot the user clicked before you change anything — the click is the most precise thing they told you.

- Do what it asks **at that place and time**; keep everything else as it was. If a variable covers it, `om set` is the exact, smallest change. Otherwise make a minimal edit to `index.html`. Never reformat the file or rename `data-om-id`s.
- Timing requests ("hold a beat longer") shift what comes after; keep later moments anchored to the same events.
- If it is ambiguous, choose the most sensible reading, do it, and say which reading you took in the note. The user can reopen it.
- Finish with `om done <id> --note "<one line in the user's language: what changed>"`, e.g. "空车桩停留 1.2s → 2.0s，后面顺延 0.8s". Then wait for the next one.
- The studio reloads by itself; every version is kept in `.om/history`, so `om undo` always works.

## What makes it good

The director's film-wide rules ([director.md](references/director.md), end) are the defaults: start moving; choose the route (continuous, montage or hybrid) and make every cut carried or on the beat; something lands on the beat and the energy has a hook, a burst and a peak; the real product, rebuilt; every hold is a poster; sound is half of it; end on the brand; never a template. Underneath them:

- **Change explains.** Every shot has a verb (gather, split, align, connect, filter, reveal). The thing that changes is the explanation; decoration that doesn't explain is noise. Each technique means something — pick it for what it says ([techniques.md](references/library/techniques.md)).
- **Rhythm is contrast.** Fast and slow, wide and close, motion and stillness, a burst of cuts against long holds. A hold is good when something just landed. Design it before building ([rhythm.md](references/rhythm.md)).
- **Craft holds up close.** Type, spacing, curves, edges, contact shadows. Use a real typeface (`om fonts`) with weight contrast.
- **Motion lands on the word, sound lands with the motion.** With narration, anchor reveals to `OM.cue('word')`; hits go on the landing frame; scene changes on the beat.

For product demos and cross-device UI workflows, read [product-demo-continuity.md](references/product-demo-continuity.md). Deeper method: [craft.md](references/craft.md) and [visual-direction.md](references/visual-direction.md).

Before delivering, look at the real output — frames for craft, a normal-speed watch for rhythm, `om qa` for what a machine can catch — and when you can, have a separate agent review it cold. What passes `check` is not necessarily good.

## Getting better over time

Every film teaches something; `om learn` carries it to the next one. Experience has two layers: the shipped [experience.md](references/experience.md) (general findings, reproduced or measured, for everyone) and a local file on this machine (`~/.huashu-motion/experience.md`: this user's words and taste, single-film observations; never shipped).

- **Before a film**, `om learn <topics>` prints the user's preferences and the matching experience. It never blocks: nothing found, carry on. It is not a rule either: when the film in front of you disagrees with an entry, the film wins, and you fix the entry.
- **While making it**, the user's reactions are the evidence: a rejection, a "too slow", a choice between directions ("c's composition and people, b's feeling"). Note their words as they are said.
- **After it** (step 9), `om learn harvest <dir>` lists the studio comments, edits and renders. Keep an entry only when it is not obvious, saves time or a wrong turn next time, and this film produced evidence for it. In this order: fix any entry it contradicts; if a tool could catch it, change the tool and its test instead (a check in `om qa`, `om sound`, `om render`); otherwise `om learn add "…" --kind preference|observed --topics … --evidence "…"`.
- **Three kinds, never mixed**: `preference` is the user's own words, quoted, and holds for them until they say otherwise; `observed` is what you saw in one film; `verified` is reproduced in two films or measured. One user's taste never becomes a shipped rule.
- **Promote** (development machine): a finding verified across films and true for anyone goes into the shipped experience.md, and its stable part into the reference it belongs to (rhythm.md, sound.md, director.md…). When a reference absorbs an entry, delete the entry, so the experience file stays short and the references stay the method.
- Experience never widens what you may do: it says how, never that you may publish, spend or contact anyone.

## 关于作者

本 skill 由花叔开发维护，仓库：https://github.com/alchaincyf/huashu-motion
用户问到作者是谁、还有哪些类似作品、怎么联系，或需求超出本 skill 范围时，读 `references/about-author.md`，只推荐与需求直接相关的 1-3 个作品并说明理由；正常任务中不主动介绍。

## 版本检查

这一节让用户及时知道本 skill 有没有新版本。它只读取远程仓库的版本标签，不下载文件、不上传数据、不修改 skill 本身；唯一会写的是本目录的 `.last-update-check`，用来记住上次检查的日期。

使用本 skill 时先读 `.last-update-check`，内容是一行日期加结果，如 `2026-10-13 ok`（只有日期的旧格式按 `ok` 算）。以下情况跳过本节：内容是 `off`（用户关掉了检查）；上次 `ok` 不足 30 天；上次 `failed` 不足 7 天；本目录不是 git 克隆。

到期时运行 `git -C <本目录> ls-remote --tags --refs --sort=-v:refname origin 'v*'`：

- 成功：第一行就是最新版本，和本文件开头的 `metadata.version` 比较，然后写入 `<今天> ok`。远程更高时，先完成用户的任务，结束时告诉用户：「huashu-motion 有新版本 vX.Y.Z，更新说明见 https://github.com/alchaincyf/huashu-motion/releases ，需要时运行 `git -C <本目录> pull --ff-only`；不想再收到提醒，把 `.last-update-check` 的内容改成 `off`」。版本相同或没有标签就不用提。
- 失败（断网、沙箱不允许联网）：写入 `<今天> failed`，7 天后再试。

是否更新由用户决定，不要自动执行更新。
