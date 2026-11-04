# 3D Landscape Flight

A GPU-accelerated (WebGL2) night flight over a procedurally generated
landscape, rendered to an HTML5 canvas. A placeholder bird glides forward while
the camera orbits it; the terrain, trees, rocks, lakes, sky, stars, nebula and
moon are all generated and shaded on the graphics card.

## Running

The app uses native ES modules, so it must be served over HTTP (opening the
file directly via `file://` will fail with CORS errors). From the project root:

```powershell
python -m http.server 5500
```

Then open <http://127.0.0.1:5500/index.html>. Any static server works equally
well (e.g. the VS Code "Live Server" / "Five Server" extensions).

Requires a WebGL2-capable browser (any current Chrome, Edge, Firefox, Safari).

## Controls

| Key        | Action                                   |
| ---------- | ---------------------------------------- |
| `R`        | Regenerate the landscape (new random seed) |
| `G`        | Toggle terrain edge lines (wireframe)    |
| `1` / `2`  | Fewer / more hills                       |
| `3` / `4`  | Lower / raise max hill height            |
| `5` / `6`  | Fewer / more trees                       |
| `←` `→`    | Pivot the camera left / right around the bird |
| `↑` `↓`    | Pivot the camera up / down               |

The camera also re-positions itself automatically to a new random angle every
~10 seconds (eased); any manual pivot postpones the next automatic move. The
bird stays centered on screen at all angles.

## Project layout

```
index.html              Entry page: canvas, HUD, loads src/main.js as a module
Assets/moon.png         Moon texture
src/
  main.js               Bootstrap: renderer + scene, animation loop, input
  config.js             Central tunable constants (see below)
  Scene.js              Owns the world; updates + draws every entity per frame
  core/
    Renderer.js         WebGL2 context, canvas sizing, per-frame clear
    Camera.js           Spherical orbit camera (yaw + elevation), aims at bird
    glUtils.js          Shader compile/link helpers
    shaderChunks.js     Shared GLSL: projection, fog, terrain heightfield + setters
  world/
    Noise.js            Seed holder (noise itself runs in the shaders)
    Sky.js              Night gradient + procedural stars + nebula streak
    Terrain.js          Value-noise heightfield mesh (height/normal/shading on GPU)
  entities/
    Moon.js             Textured sky billboard pinned to a world direction
    Water.js            Occasional lakes: flat plane, lake-mask + terrain shoreline
    Trees.js            GPU-instanced pines, planted on the shared ground
    Rocks.js            GPU-instanced rocks (3 variants, randomized size)
    Bird.js             Placeholder low-poly bird (swap geometry in _build)
```

### How it works

- All heavy work runs on the GPU. The terrain heightfield (layered value
  noise), per-vertex projection, lighting and fog are evaluated in shaders; the
  CPU only sends a handful of uniforms per frame.
- The camera orbits the bird on a sphere and always aims at it, so the bird is
  mathematically centered at any yaw/elevation.
- The terrain is a square grid re-centered on the bird each frame (snapped to
  cell boundaries to avoid shimmer), so there is always ground in view.
- Trees, rocks and water share the terrain's `terrainHeight` GLSL (in
  `shaderChunks.js`) and the terrain seed, so they stay perfectly in sync —
  including when you regenerate or change the hills.
- Trees/rocks are GPU-instanced across a grid of candidate cells; a per-cell
  hash decides presence, type and size, and absent instances collapse to a point.

## Configuration

All gameplay/visual tunables live in `src/config.js`, grouped by concern:
`CAMERA`, `TERRAIN`, `TREES`, `ROCKS`, `BIRD`, `MOON`, `FOG`, `WATER`. A few
examples:

- `CAMERA.speed` — flight pace; `CAMERA.autoInterval` — seconds between
  automatic camera moves.
- `TERRAIN.cols/rows` — draw distance/detail; `TERRAIN.amplitude` — hill height.
- `TREES.threshold` / `ROCKS.threshold` — density (higher = fewer).
- `WATER.threshold` — lake rarity (lower = more); `WATER.scale` — lake size
  (smaller = larger lakes); `WATER.level` — water height.
- `MOON.direction` / `MOON.size` — where the moon sits and how big it is.
- `FOG.color/start/end` — night horizon haze.

Changes take effect on reload.
