# AGENTS.md — handoff for AI coding agents

Context for continuing work on **3D Landscape Flight**: a WebGL2 night flight
over procedural terrain, rendered to an HTML5 canvas with vanilla ES modules
(no build step, no dependencies). Read this before making changes.

## Run & validate

- Serve over HTTP (ES modules need it): `python -m http.server 5500` from the
  project root, then open `http://127.0.0.1:5500/index.html`. The entry page is
  **`index.html`** (it was renamed from `landscape.html` earlier — do not
  recreate `landscape.html`).
- There are no tests and no build. "Validate" = load the page, check the
  browser console is clean, and visually confirm. Using the browser tools
  (open page, run small `page.evaluate` snippets, screenshot) is the way we've
  been checking rendering and simulating key presses.
- Simulate input by dispatching to `window` (the key listener is on `window`),
  e.g. `window.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowUp"}))`.
  `page.keyboard.press` only works if the canvas has focus.

## Architecture (what lives where)

- `index.html` — canvas + a hidden help overlay (`#help`, a vertical command
  list toggled by `M`), loads `src/main.js` as a module.
- `src/main.js` — creates `Renderer` + `Scene`, runs the rAF loop, routes keys.
- `src/Scene.js` — owns all entities, the bird's forward progress, the camera
  auto-reposition timer, and the per-frame draw order.
- `src/config.js` — **all tunable constants** grouped as `CAMERA`, `TERRAIN`,
  `TREES`, `ROCKS`, `BIRD` (incl. `scale`/`flap`), `MOON`, `FOG`, `WATER`. Put
  new tunables here, not inline.
- `src/core/` — `Renderer` (WebGL2 context/clear), `Camera` (orbit + eased
  targets), `glUtils` (shader compile/link), `shaderChunks` (shared GLSL +
  uniform setters).
- `src/world/` — `Noise` (seed holder only), `Sky`, `Terrain`.
- `src/entities/` — `Moon`, `Water`, `Trees`, `Rocks`, `Bird`. `Bird` imports
  its mesh from `Bird2.js`; `Rocks` imports two meshes from `Rock1.js` and
  `Rock2.js` (each a plain `export const` of `{ vertices, faces, edges }`
  converted from an `.obj`). The `.obj` sources sit alongside them.

Draw order each frame (in `Scene.render`): clear → sky → moon → terrain → water
→ trees → rocks → bird.

## Key patterns & invariants (respect these)

- **Everything heavy runs on the GPU.** Terrain height (layered value noise),
  projection, lighting and fog are evaluated in shaders. The CPU only sets a
  few uniforms per frame. Don't move this work back to JS.
- **One source of truth for the ground.** The heightfield lives in
  `shaderChunks.TERRAIN_GLSL` (`terrainHeight`/`terrainNoise`, depending on
  `uSeed`/`uAmp`/`uFreq`). Terrain, Trees, Rocks and Water all include it and
  are fed the *same* seed/amplitude/density from the `Terrain` instance, so they
  stay in sync. Anything that must sit on the ground must use this.
- **Shared projection.** `shaderChunks.CAMERA_UNIFORMS` + `PROJECT_FN` +
  `setCameraUniforms` implement a yaw→pitch pinhole projection in the vertex
  shader. Reuse them; don't hand-roll a second projection.
- **Camera orbits and always aims at the bird**, so the bird is centered at any
  angle. `Camera` eases `yaw`/`elevation` toward `targetYaw`/`targetElevation`;
  pitch fed to the shader is `-elevation`. Manual pivots and the 10s auto-move
  both just set the targets.
- **Instancing with per-cell hashing.** Trees/Rocks draw one static mesh across
  a grid of candidate cells; a per-cell hash decides presence/type/size and
  absent or non-matching vertices collapse to a point (scale 0). Rocks pack the
  two imported models into one mesh via a per-vertex `aType` that the chosen
  type selects, and each instance also gets a per-cell random yaw.
- **Imported models are baked at build time.** `Bird`/`Rocks` remap the raw
  model axes into the scene (Z-up → Y-up, base dropped to `y=0`), normalize to a
  target size, and flat-shade each face into vertex colors in JS; the GPU then
  just instances/positions them. The bird derives per-vertex wing-flap weights
  from each vertex's distance off the body centerline.
- **No lighting pass for small props** — shading is baked into vertex colors;
  fog is applied in the fragment shader via `applyFog`.
- Terrain grid is a square re-centered on the bird each frame, snapped to cell
  boundaries to avoid sampling shimmer.

## Conventions

- Vanilla JS, 4-space indent, double quotes, ES module `import`/`export`, one
  class per file. Match the existing style.
- Comments are sparse and explain *why*, not *what* — one short line. Don't add
  doc-comment blocks or narrate changes.
- New constants → `config.js`. New per-frame work → a shader uniform, not CPU.
- Keep changes minimal and focused; don't refactor unrelated code.

## Current state / possible next steps

Implemented: procedural night terrain, fog, moonlit shading; orbit camera with
manual (`←→↑↓`) + automatic pivots; controls (`R` regenerate, `G` wireframe,
`C` auto-cam toggle, `1/2` hills, `3/4` height, `5/6` trees, `M` toggle the
help overlay); instanced pines; a textured moon; a starfield + nebula sky;
occasional lakes with a terrain-following shoreline; an imported low-poly bird
(`Bird2.js`) that alternates between flapping and gliding on a random 10–20s
timer; and two imported, randomly-sized and -rotated rock models
(`Rock1.js`/`Rock2.js`).

Natural extensions: water moon-glint/reflection, clouds, birds flocking, snow on
peaks. When swapping in new `.obj` models, follow the `Bird2.js`/`Rock1.js`
pattern (plain `export const` of `{ vertices, faces, edges }`, 0-based triangle
indices) and bake orientation/size/shading in the entity's `_build()`.
