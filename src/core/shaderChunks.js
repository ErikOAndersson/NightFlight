// GLSL snippets and uniform helpers shared by the GPU programs, so the
// camera projection and distance fog are defined in exactly one place.
import { FOG, WATER } from "../config.js";

// Formats a JS number as a GLSL float literal (always with a decimal point).
const glsl = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

// Vertex-shader uniforms describing the camera + pinhole projection.
export const CAMERA_UNIFORMS = `
uniform vec3 uCam;      // camera world position (x, y, z)
uniform float uCos;     // cos(pitch)
uniform float uSin;     // sin(pitch)
uniform float uYawCos;  // cos(yaw)
uniform float uYawSin;  // sin(yaw)
uniform float uScaleX;  // 2*fov / viewportWidth
uniform float uScaleY;  // 2*fov / viewportHeight
uniform float uNear;
uniform float uFar;
`;

// Projects a world-space point to clip space, matching the original CPU
// projection: camera orbits with a yaw heading, pitched down. Writes the
// view-space depth (used by the fog) through the out parameter.
export const PROJECT_FN = `
vec4 projectWorld(vec3 world, out float depth) {
    vec3 d = world - uCam;
    // Yaw around Y so the heading aligns with +z, then pitch around X.
    float rx = d.x * uYawCos - d.z * uYawSin;
    float rz0 = d.x * uYawSin + d.z * uYawCos;
    float ry = d.y * uCos - rz0 * uSin;
    float rz = d.y * uSin + rz0 * uCos;
    depth = rz;
    float zc = ((uFar + uNear) / (uFar - uNear)) * rz
             - (2.0 * uFar * uNear) / (uFar - uNear);
    return vec4(uScaleX * rx, uScaleY * ry, zc, rz);
}
`;

// Fragment-shader fog that fades surfaces into the horizon haze with distance.
export const FOG_UNIFORMS = `
uniform vec3 uFog;
uniform float uFogStart;
uniform float uFogEnd;
`;

export const FOG_FN = `
vec3 applyFog(vec3 col, float depth) {
    float f = clamp((depth - uFogStart) / (uFogEnd - uFogStart), 0.0, 1.0);
    return mix(col, uFog, f);
}
`;

// Shared heightfield: the layered value noise that defines the terrain. Both
// the terrain mesh and anything that must sit on the ground (e.g. trees)
// include this so they agree on the exact ground height. Declares the uSeed,
// uAmp and uFreq uniforms it depends on.
export const TERRAIN_GLSL = `
uniform float uSeed;    // noise seed
uniform float uAmp;     // height amplitude
uniform float uFreq;    // hill density (noise frequency multiplier)

float terrainHash(vec2 p) {
    return fract(sin(dot(p + uSeed, vec2(127.1, 311.7))) * 43758.5453123);
}

float terrainNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = terrainHash(i);
    float b = terrainHash(i + vec2(1.0, 0.0));
    float c = terrainHash(i + vec2(0.0, 1.0));
    float d = terrainHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Large-scale mask marking the single-body lake regions (0 outside, 1 inside),
// with a soft sloping shore band. Rare and large by design.
float lakeMask(vec2 w) {
    float m = terrainNoise(w * ${glsl(WATER.scale)} + vec2(123.0, 71.0));
    return smoothstep(${glsl(WATER.threshold)}, ${glsl(WATER.threshold + WATER.edge)}, m);
}

// Mostly flat ground with occasional low rolling hills, carved into a basin
// wherever the lake mask is high so each lake is one contiguous body of water.
float terrainHeight(vec2 w) {
    float h = terrainNoise(w * 0.010 * uFreq);
    h += terrainNoise(w * 0.035 * uFreq) * 0.28;
    h += terrainNoise(w * 0.10 * uFreq) * 0.05;
    h /= 1.33;
    h = pow(h, 3.0);
    float y = h * uAmp;
    y = mix(y, min(y, ${glsl(WATER.floor)}), lakeMask(w));
    return y;
}
`;

// Lookup table of the ground around the bird: terrainHeight and lakeMask baked
// into a texture by Terrain whenever the grid moves, so per-vertex and
// per-pixel consumers fetch it instead of re-evaluating the noise.
export const GROUND_GLSL = `
uniform sampler2D uGround;  // r = height, g = lake mask
uniform vec2 uGroundOrigin; // world xz of texel (0, 0)
uniform float uGroundCell;  // world size of one texel

vec2 groundAt(vec2 w) {
    vec2 t = (w - uGroundOrigin) / uGroundCell + 0.5;
    return texture(uGround, t / vec2(textureSize(uGround, 0))).rg;
}
`;

const GROUND_UNIT = 1; // unit 0 belongs to the moon texture

export function setGroundUniforms(gl, u, terrain) {
    gl.activeTexture(gl.TEXTURE0 + GROUND_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, terrain.groundTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u.uGround, GROUND_UNIT);
    gl.uniform2f(u.uGroundOrigin, terrain.groundOrigin[0], terrain.groundOrigin[1]);
    gl.uniform1f(u.uGroundCell, terrain.cell);
}

export function setCameraUniforms(gl, u, camera, renderer) {
    gl.uniform3f(u.uCam, camera.x, camera.y, camera.z);
    gl.uniform1f(u.uCos, camera.cos);
    gl.uniform1f(u.uSin, camera.sin);
    gl.uniform1f(u.uYawCos, camera.yawCos);
    gl.uniform1f(u.uYawSin, camera.yawSin);
    gl.uniform1f(u.uScaleX, camera.scaleX(renderer));
    gl.uniform1f(u.uScaleY, camera.scaleY(renderer));
    gl.uniform1f(u.uNear, camera.near);
    gl.uniform1f(u.uFar, camera.far);
}

export function setFogUniforms(gl, u) {
    gl.uniform3f(u.uFog, FOG.color[0], FOG.color[1], FOG.color[2]);
    gl.uniform1f(u.uFogStart, FOG.start);
    gl.uniform1f(u.uFogEnd, FOG.end);
}
