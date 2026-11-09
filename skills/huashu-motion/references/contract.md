# The huashu-motion project contract

A project is a folder whose `index.html` is a composition: a root element with `data-composition-id`, `data-width` and `data-height`, and a paused GSAP timeline registered in `window.__timelines[<id>]`. The renderer drives it in the user's own Chrome. That file is the only source: write GSAP, Canvas, Three.js or SVG freely. Everything below is a few extra HTML attributes — no new format. A composition that ignores them still renders; it just can't be pointed at or edited in the studio.

```
my-film/
  index.html      the source
  vendor/         gsap.min.js, om.js (runtime helpers) and other local libraries
  assets/         fonts, images, audio
  out/            renders from `om render`; never overwritten
  .om/            history, comment inbox, render log — maintained by the tools, safe to delete
```

## 1. Editable values are composition variables

Declare them on `<html data-composition-variables='[…]'>`. Types: `string`, `number` (`min`, `max`, `step`), `color`, `boolean`, `enum` (`options`). Optional `group` sorts them in the studio.

- `data-var-text="title"` replaces an element's text.
- `var(--accent)` in CSS — every scalar variable is also a CSS custom property on the root.
- `OM.vars()` once while building the timeline, for data, timing and logic (`window.__hyperframes.getVariables()` in older films still works).
- `data-om-var="title"` on a container whose text a script builds (per-letter animation), so the studio can edit it in place on a double-click.

The studio and `om set key=value` change only each variable's `default` value — every other byte stays as written. Good candidates: titles, numbers, colors, hold durations, data arrays (a string holding JSON). If a user might want to change it without you, make it a variable.

## 2. `data-om-id` names what people can point at

```html
<h1 data-om-id="title" data-var-text="title">…</h1>
```

Clicks and comments resolve to the smallest clearly visible element carrying an id, and comments arrive with that id and its source line. Keep ids stable when text changes. For things drawn on a canvas, register a region: `OM.region('cat', (t) => [x, y, w, h] /* composition px, or null when absent */, '猫')`.

## 3. Timeline labels `scene:<id>` are the scenes

```js
tl.addLabel('scene:intro', 0).addLabel('scene:chart', 3.2);
```

The studio draws them as the scene strip, and comments carry the scene they were made in.

## The signature

Every film of 4 s or more ends with a small "Made with huashu-motion" for its last 1.2 s: the engine draws it in the film's own typeface and text colour, in the first corner of the end frame that holds no text or picture, everywhere the film plays (studio, stills, render, share page). Overlay renders (`--transparent`) and shorter films never get it.

- `data-om-signature="off"` on `<html>` or the root removes it; `"top-left"` (or another corner) pins it.
- Leave one corner of the end frame clear. `om check` warns (`signature-covers`) when no corner is free.

## Timing

One paused timeline at `window.__timelines[<composition-id>]`. Without `data-duration` on the root, the film is as long as the timeline, so hold variables can change the length — end with the closing hold, e.g. `tl.to({}, { duration: V.endHold })`. Keep every position ≥ 0 (a negative position shifts the whole timeline), and remember `fromTo` renders its start state immediately (`immediateRender: false` or `set` at the moment when something must not exist earlier).

## A frame that is the same however it was reached

Stills, the studio's scrubber and the renderer all jump to a time; none of them plays up to it. These habits keep a frame identical from any seek (each one has cost a film a wrong frame):

- `fromTo` with both ends written and `immediateRender: false`. A `to` starts from wherever the element happens to be, which depends on what rendered before it. A camera is a list of poses kept in a variable, each move going from the last pose to the next.
- Never `overwrite: true`: on a timeline that is built once, it removes every earlier tween of that target, including moves the film has already made.
- Hide a group with `opacity`, not `visibility`: a child whose own `visibility` a tween set to `visible` shows through a hidden parent.
- Under `om render --blur` a cut at an exact frame time is a blend of two shots: put cuts half a frame in, `(Math.floor(t * fps) + 0.5) / fps`. Text that changes every frame (a counter) is computed from the whole frame, not from `t`.
- A transformed wrapper is a new stacking context: `mix-blend-mode` inside it blends with the wrapper, not with what is behind it. Give the wrapper the ground it should blend with.

## Runtime helpers — `vendor/om.js`

- `OM.clock(tl, t => draw(t), duration)` — drive a frame-by-frame canvas/WebGL engine from the timeline. On every seek `draw(t)` runs after all the tweens of that frame, so it may read the page: a selection box, a cursor or a highlight can follow an element another tween moves by reading its `getBoundingClientRect()` (divide by the film's on-screen scale). Projects made before 2026-11 carry an older `vendor/om.js` in which draw ran first: copy the current `runtime/om.js` over it.
- `OM.region(id, box(t), label)` — pickable canvas regions.
- `OM.space('#world' | threeCamera, { fov })` — a camera in 3D ([depth.md](depth.md)). `cam.set(pose)`, `cam.to(tl, at, { ...pose, duration, ease })`; a pose is `target: [x,y,z] | '#el'`, `distance`, `yaw` / `pitch` / `roll` (degrees), `fov`, or `fit: '#el'` with `pad`, or `flat: true` (a page's resting pose: z = 0 lands exactly on the layout), `position: [x,y,z]`, `dolly` (× distance). Moves run on arcs round the target; the pose is a pure function of time (`cam.pose(t)`, `cam.apply(t)`). A page world is an absolutely placed element whose layers sit at `translate3d`/`rotate` (page px, y down); its parent gets the perspective. `cam.attach(threeCamera)` poses a Three camera over the same page coordinates. `cam.locate('#el')` gives an element's centre in world coordinates.
- `vendor/three.min.js` (Three.js r186 + RoomEnvironment, GLTF/SVG/HDR loaders, RoundedBox, EffectComposer with Bokeh/Bloom/Output passes, Reflector, as `window.THREE`) and `vendor/om-three.js` (`window.OM3`), copied by the `object-3d` template:
  - `OM3.stage(canvas, { background, env: 'studio'|'room'|'x.hdr', exposure, fov, dof: { aperture, maxblur }, bloom, fog, units: 'px' })` → `{ renderer, scene, camera, render, add }`
  - `OM3.lights(stage, { span })`, `OM3.cyc(stage, { color, y, depth, radius })` — key + rim with soft shadows; a studio sweep.
  - `OM3.logo(svg | 'x.svg', { size, depth, bevel, color, metalness, roughness })` — the real SVG extruded, its own colours.
  - `OM3.screen(img, { width, aspect, bezel, depth, radius, body, glass, crop: [l, t, r, b] })` — a capture on a device or a card (bezel 0), unlit so it keeps its colours.
  - `OM3.gltf('x.glb')`, `OM3.texture(url)`, `OM3.read(url, type)` — loads that work from `file://` and are waited for.
  - `OM3.film(stage, tl, duration, cam, update)` — one clock: poses the camera, calls `update(t)`, renders once after the seek, focused on the camera's target.
  - `OM3.region(id, object, stage, label)` — the object's projected box, pickable in the studio. `OM3.ready(promise)` — wait for (and redraw after) anything else.
- `OM.cue('word', nth?, 'start'|'end')` — when a narration word is spoken (from `om voice`); motion anchored to words follows a new recording automatically.
- `OM.vars()` — the variables.
- `OM.sfx(name, at, opts)` — a sound effect at `at` (returns `at`); `OM.music({ product, drop, ending, marks, bpm })` — a built-in direction, or `<script type="text/vnd.abc" id="om-score">` — your own score, its `!mark:name!`s landing on `scene:name`; `OM.beat(n)` — n beats in seconds. `om sound` synthesizes them into `assets/sound.wav` + `<audio id="om-sound">` ([sound.md](sound.md)).

## The comment loop

1. The user presses C in the studio and clicks the frame. The comment records time, position, the object under the pointer, the scene and the current variables in `.om/inbox.jsonl`.
2. `om inbox <dir> --wait` blocks until there is one, claims it and prints the context with source lines.
3. You edit `index.html` (or `om set`). The studio reloads at the same moment.
4. `om done <id> --note "…"` — the user sees your note. They can answer "not quite" with more detail; the comment comes back to your inbox with the whole thread.
5. Every version lands in `.om/history/`, whoever wrote it. `om undo` steps back.
