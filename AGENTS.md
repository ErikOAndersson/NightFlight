# AGENTS.md — handoff for AI coding agents

Context for continuing work on **Night Flight**: a WebGL2 night flight
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
- For performance, measure on the real GPU (headless Chrome with
  `--use-angle=d3d11 --enable-gpu`) using `EXT_disjoint_timer_query_webgl2`
  around each entity's `render`. SwiftShader (the software fallback) is
  misleading: it makes texture fetches look far more expensive than noise math.
- Use a fresh browser profile per headless run; a reused one serves stale
  cached modules.
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
  `TREES`, `ROCKS`, `HOUSES` (each with a `shadow` block), `BIRD` (incl.
  `scale`/`flap`), `MOON`, `FOG`, `SKY`, `WATER` (incl. the moon-glint/ripple
  tunables); `TERRAIN.detail` holds the ground colour-variation tunables. Put
  new tunables here, not inline.
- `src/core/` — `Renderer` (WebGL2 context/clear), `Camera` (orbit + eased
  targets), `glUtils` (shader compile/link), `shaderChunks` (shared GLSL +
  uniform setters), `CellPicker` (chooses which prop cells are present),
  `Shadow` (shared fake-shadow GLSL + `ShadowPass`).
- `src/world/` — `Noise` (seed holder only), `Sky`, `Terrain`.
- `src/entities/` — `Moon`, `Water`, `Trees`, `Rocks`, `Houses`, `Bird`.
  `Bird` imports its mesh from `Bird3.js`; `Rocks` imports two meshes from
  `Rock1.js` and `Rock2.js`; `Houses` imports `House4.js` (each a plain
  `export const` of `{ vertices, faces, edges }` converted from an `.obj`).
- `obj2js.py` (project root) converts `.obj` → `.js`. Its output lacks
  `export` and writes placeholder `faceColorOverrides` from the `.mtl`; fix
  both by hand (see `House4.js`). Re-running it overwrites those fixes.

Draw order each frame (in `Scene.render`): clear → terrain (re-bakes the ground
lookup first when needed) → water → trees → rocks → houses → bird → sky → moon.
Each prop draws its shadow strips right after its own mesh. The sky is drawn after the opaque passes at the far plane without depth
writes, so the depth test skips pixels already covered; the moon is depth-
tested so terrain hides it.

## Key patterns & invariants (respect these)

- **Everything heavy runs on the GPU.** Terrain height (layered value noise),
  projection, lighting and fog are evaluated in shaders. The CPU only sets a
  few uniforms per frame. Don't move this work back to JS.
- **One source of truth for the ground.** The heightfield lives in
  `shaderChunks.TERRAIN_GLSL` (`terrainHeight`/`lakeMask`, depending on
  `uSeed`/`uAmp`/`uFreq`). Only `Terrain`'s bake pass evaluates it: it renders
  height + lake mask into an `RG16F` ground lookup texture (one texel per grid
  vertex), and re-bakes only when the grid snaps or the hills/seed change.
  The terrain mesh `texelFetch`es it; Water, Trees, Rocks and Houses sample it
  via `GROUND_GLSL`'s `groundAt(w)` + `setGroundUniforms` (texture unit 1; unit
  0 is the moon's). Anything that must sit on the ground uses `groundAt`, and
  must stay inside the terrain grid (±`cols*cell/2` around the bird); beyond
  that the lookup repeats its edge values. Needs `EXT_color_buffer_float`.
- **Shared projection.** `shaderChunks.CAMERA_UNIFORMS` + `PROJECT_FN` +
  `setCameraUniforms` implement a yaw→pitch pinhole projection in the vertex
  shader. Reuse them; don't hand-roll a second projection.
- **Camera orbits and always aims at the bird**, so the bird is centered at any
  angle. `Camera` eases `yaw`/`elevation` toward `targetYaw`/`targetElevation`;
  pitch fed to the shader is `-elevation`. Manual pivots and the 10s auto-move
  both just set the targets.
- **Instancing over picked cells.** Trees/Rocks/Houses draw one static mesh
  per *present* cell. `CellPicker` hashes the candidate grid on the CPU (only
  when the grid snaps or threshold/seed change) and uploads present cell ids as
  a per-instance attribute; drawing every candidate cell and collapsing empty
  ones was the single biggest GPU cost. In the shader, per-cell hashes still
  pick jitter/type/size/yaw, and lowland/lake rules still collapse instances to
  a point. Rocks pack the two imported models into one mesh via a per-vertex
  `aType` that the chosen type selects.
- **Imported models are baked at build time.** `Bird`/`Rocks` remap the raw
  model axes into the scene (Z-up → Y-up, base dropped to `y=0`), normalize to a
  target size, and flat-shade each face into vertex colors in JS; the GPU then
  just instances/positions them. The bird derives per-vertex wing-flap weights
  from each vertex's distance off the body centerline.
- **No lighting pass for small props** — shading is baked into vertex colors;
  fog is applied in the fragment shader via `applyFog`.
- Terrain grid is a square re-centered on the bird each frame, snapped to cell
  boundaries to avoid sampling shimmer. Terrain is drawn with back-face culling
  (a heightfield seen from above never shows back faces); props and the bird
  stay two-sided because their models rely on it (open tree cones, thin wings).
- **Sky** is a cylindrical panorama (`Assets/wide_sky.webp`, 4096x1024, horizon
  at the bottom edge). `Sky`'s fullscreen fragment shader inverts the shared
  projection (`uScaleX/Y`, pitch, yaw) to rebuild each pixel's view ray, then
  looks up azimuth/`tanh(k·tan(elevation))` (a cylinder near the horizon,
  eased so the image's top edge lands exactly at the zenith; `SKY.coverage`
  sets the horizontal angle one image copy covers, `SKY.verticalScale` trades
  low-sky stretch for upper-sky sharpness). Horizontally the wrap is mirrored,
  which hides the non-tiling left/right edges; vertically it clamps (no
  repeat or mirror), so below the horizon it holds the bottom row. No mipmaps
  (the `atan` seam would break derivative LOD). Uses texture unit 2. Because it
  is direction-only, it pans with camera yaw/pitch but not with flight.
- **Ground detail** is world-space value noise (large patches + fine speckle)
  multiplied into the terrain colour in the fragment shader (`vWorld` varying,
  `TERRAIN.detail`), faded out with depth to avoid shimmer. Slope tinting,
  stretched streaks and normal bumps were tried and deliberately dropped to keep
  the shader cheap on weak devices.
- **Fake shadows.** `core/Shadow.js` gives trees, rocks and houses a flat
  tapered strip per instance, pointing away from `MOON.direction` and draped on
  the ground via `groundAt` (so the strips are subdivided). It is a second
  instanced draw in the same program, switched by the `uShadow` uniform (blended,
  no depth write); alpha fades with distance. Collapsed instances (hilltop/lake)
  collapse their shadow too. New props wanting shadows should reuse `ShadowPass`.
- **Water** is one quad over the view; its fragment shader discards non-lake
  pixels after a single lookup, then shades depth, faceted low-poly ripples and
  a moon glint. Facets fade to flat by on-screen size (`fwidth`) to avoid
  distant moiré, swapping to a broader `farSharpness` glow.

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
`C` auto-cam toggle, `Space` pause (freezes flight, auto-cam timer and
animation clock; camera still eases), `1/2` hills, `3/4` height, `5/6` trees, `M` toggle the
help overlay); instanced pines; a textured moon; a starfield + nebula sky;
occasional lakes with a terrain-following shoreline; an imported low-poly bird
(`Bird3.js`) that alternates between flapping and gliding on a random 10–20s
timer; two imported, randomly-sized and -rotated rock models
(`Rock1.js`/`Rock2.js`); rare houses (`House4.js`, with a gray foundation that fills the drop on slopes) with a lit window; and a
faceted moon reflection on the lakes; a panoramic sky image; subtle ground
colour variation; and fake ground shadows under trees, rocks and houses.

Natural extensions: clouds, birds flocking, snow on peaks. When swapping in new `.obj` models, follow the `Bird3.js`/`Rock1.js`
pattern (plain `export const` of `{ vertices, faces, edges }`, 0-based triangle
indices) and bake orientation/size/shading in the entity's `_build()`.
