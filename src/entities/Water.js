import { createProgram, getUniforms } from "../core/glUtils.js";
import {
    CAMERA_UNIFORMS,
    PROJECT_FN,
    FOG_UNIFORMS,
    FOG_FN,
    GROUND_GLSL,
    setCameraUniforms,
    setFogUniforms,
    setGroundUniforms
} from "../core/shaderChunks.js";
import { WATER, MOON } from "../config.js";

// Occasional large lakes. A single flat quad at the water level is drawn over
// the view; the fragment shader decides, per pixel, whether that spot is a
// lake — a large-scale "lake mask" noise gates where lakes occur, and the
// shared ground lookup gives a shoreline that hugs the ground contour. Deep
// water is darker; shallows and lake edges fade out. Rippled normals reflect
// the moon direction into a shimmering glint path.
const VERTEX_SRC = `#version 300 es
precision highp float;

in vec2 aCorner;       // quad corner in [-1, 1]
uniform vec2 uCenter;  // plane center (bird xz)
uniform float uHalf;   // half-size of the plane
uniform float uLevel;  // water surface height
${CAMERA_UNIFORMS}

out vec2 vWorld;
out float vDepth;

${PROJECT_FN}

void main() {
    vec2 wxz = uCenter + aCorner * uHalf;
    float depth;
    gl_Position = projectWorld(vec3(wxz.x, uLevel, wxz.y), depth);
    vDepth = depth;
    vWorld = wxz;
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;

in vec2 vWorld;
in float vDepth;
uniform float uLevel;
uniform float uDepthFade;
uniform float uTime;
uniform vec3 uCam;     // eye position (for the reflected view ray)
uniform vec3 uMoonDir; // same sky direction the moon billboard uses
${FOG_UNIFORMS}
${GROUND_GLSL}

${FOG_FN}

// Low-poly ripples: each triangular facet gets a hashed tilt that rocks over
// time, one cheap hash instead of several noise lookups per pixel.
float facetHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Facets shrinking toward a pixel alias into flicker, so their tilt fades out
// with on-screen size (detail: 1 = full facets, 0 = flat).
vec3 facetNormal(vec2 w, out float h, out float detail) {
    vec2 q = w / ${WATER.facetSize.toFixed(2)};
    detail = 1.0 - smoothstep(0.25, 0.8, length(fwidth(q)));
    vec2 cell = floor(q);
    vec2 f = q - cell;
    cell = cell * 2.0 + step(f.y, f.x); // two triangles per cell
    h = mix(0.5, facetHash(cell), detail);
    float h2 = facetHash(cell + 17.3);
    float t = uTime * ${WATER.rippleSpeed.toFixed(2)};
    vec2 tilt = vec2(sin(t + h * 6.2831853), cos(t * 0.8 + h2 * 6.2831853));
    return normalize(vec3(tilt * ${WATER.rippleStrength.toFixed(3)} * detail, 1.0).xzy);
}

out vec4 frag;

void main() {
    // Most of the plane is dry land: reject it with one lookup.
    vec2 g = groundAt(vWorld);
    float lake = g.g;
    if (lake < 0.02) {
        discard;
    }
    float terr = g.r;

    // Shoreline follows the carved basin: water where the ground is below it.
    float shore = smoothstep(0.0, uDepthFade, uLevel - terr);

    float a = lake * shore;
    if (a < 0.02) {
        discard;
    }

    float h, detail;
    vec3 n = facetNormal(vWorld, h, detail);

    // Darker with depth, lighter in the shallows; faint per-facet shading.
    float deep = clamp((uLevel - terr) / 40.0, 0.0, 1.0);
    vec3 col = mix(vec3(0.10, 0.20, 0.28), vec3(0.02, 0.05, 0.11), deep);
    col += 0.03 * h;

    vec3 view = normalize(vec3(vWorld.x, uLevel, vWorld.y) - uCam);
    vec3 r = reflect(view, n);
    float facing = max(dot(r, normalize(uMoonDir)), 0.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(-view, n), 0.0), 5.0);
    // Far water swaps the sparkles for a broader, dimmer streak.
    float sharp = mix(${WATER.farSharpness.toFixed(1)}, ${WATER.glintSharpness.toFixed(1)}, detail);
    float strength = ${WATER.glintStrength.toFixed(3)} * mix(${WATER.farStrength.toFixed(3)}, 1.0, detail);
    float glint = pow(facing, sharp) * strength
                + pow(facing, ${WATER.sheenSharpness.toFixed(1)}) * ${WATER.sheenStrength.toFixed(3)};
    col += vec3(0.85, 0.90, 1.0) * glint * (0.3 + fresnel);

    frag = vec4(applyFog(col, vDepth), a);
}`;

export class Water {
    constructor(renderer) {
        const gl = renderer.gl;
        this.gl = gl;

        this.program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
        this.u = getUniforms(gl, this.program, [
            "uCenter", "uHalf", "uLevel",
            "uDepthFade", "uTime", "uMoonDir", "uGround", "uGroundOrigin", "uGroundCell",
            "uCam", "uCos", "uSin", "uYawCos", "uYawSin",
            "uScaleX", "uScaleY", "uNear", "uFar",
            "uFog", "uFogStart", "uFogEnd"
        ]);

        const aCorner = gl.getAttribLocation(this.program, "aCorner");
        const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aCorner);
        gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    render(renderer, camera, centerX, centerZ, terrain, time) {
        const gl = renderer.gl;

        gl.useProgram(this.program);
        setCameraUniforms(gl, this.u, camera, renderer);
        setFogUniforms(gl, this.u);

        setGroundUniforms(gl, this.u, terrain);
        gl.uniform2f(this.u.uCenter, centerX, centerZ);
        gl.uniform1f(this.u.uHalf, WATER.halfExtent);
        gl.uniform1f(this.u.uLevel, WATER.level);
        gl.uniform1f(this.u.uDepthFade, WATER.depthFade);
        gl.uniform1f(this.u.uTime, time);
        gl.uniform3f(this.u.uMoonDir, MOON.direction[0], MOON.direction[1], MOON.direction[2]);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
    }
}
