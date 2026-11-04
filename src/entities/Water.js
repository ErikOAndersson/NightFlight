import { createProgram, getUniforms } from "../core/glUtils.js";
import {
    CAMERA_UNIFORMS,
    PROJECT_FN,
    FOG_UNIFORMS,
    FOG_FN,
    TERRAIN_GLSL,
    setCameraUniforms,
    setFogUniforms
} from "../core/shaderChunks.js";
import { WATER } from "../config.js";

// Occasional large lakes. A single flat quad at the water level is drawn over
// the view; the fragment shader decides, per pixel, whether that spot is a
// lake — a large-scale "lake mask" noise gates where lakes occur, and the
// shared terrainHeight gives a shoreline that hugs the ground contour. Deep
// water is darker; shallows and lake edges fade out.
const VERTEX_SRC = `#version 300 es
precision highp float;

in vec2 aCorner;       // quad corner in [-1, 1]
uniform vec2 uCenter;  // plane center (bird xz)
uniform float uHalf;   // half-size of the plane
uniform float uLevel;  // water surface height
${CAMERA_UNIFORMS}
${TERRAIN_GLSL}

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
uniform float uScale;
uniform float uThreshold;
uniform float uEdge;
uniform float uDepthFade;
uniform float uTime;
${FOG_UNIFORMS}
${TERRAIN_GLSL}

${FOG_FN}

out vec4 frag;

void main() {
    float terr = terrainHeight(vWorld);

    // Large-scale mask decides which low areas are lakes (occasional, big).
    float mask = terrainNoise(vWorld * uScale + vec2(123.0, 71.0));
    float lake = smoothstep(uThreshold, uThreshold + uEdge, mask);

    // Shoreline follows the terrain: water only where the ground is below it.
    float shore = smoothstep(0.0, uDepthFade, uLevel - terr);

    float a = lake * shore;
    if (a < 0.02) {
        discard;
    }

    // Darker with depth, lighter in the shallows; a faint ripple shimmer.
    float deep = clamp((uLevel - terr) / 40.0, 0.0, 1.0);
    vec3 col = mix(vec3(0.10, 0.20, 0.28), vec3(0.02, 0.05, 0.11), deep);
    float ripple = terrainNoise(vWorld * 0.05 + vec2(uTime * 0.05, 0.0));
    col += 0.03 * ripple;

    frag = vec4(applyFog(col, vDepth), a);
}`;

export class Water {
    constructor(renderer) {
        const gl = renderer.gl;
        this.gl = gl;

        this.program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
        this.u = getUniforms(gl, this.program, [
            "uCenter", "uHalf", "uLevel", "uScale", "uThreshold", "uEdge",
            "uDepthFade", "uTime", "uSeed", "uAmp", "uFreq",
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

        gl.uniform1f(this.u.uSeed, terrain.noise.seed);
        gl.uniform1f(this.u.uAmp, terrain.amplitude);
        gl.uniform1f(this.u.uFreq, terrain.hillDensity);
        gl.uniform2f(this.u.uCenter, centerX, centerZ);
        gl.uniform1f(this.u.uHalf, WATER.halfExtent);
        gl.uniform1f(this.u.uLevel, WATER.level);
        gl.uniform1f(this.u.uScale, WATER.scale);
        gl.uniform1f(this.u.uThreshold, WATER.threshold);
        gl.uniform1f(this.u.uEdge, WATER.edge);
        gl.uniform1f(this.u.uDepthFade, WATER.depthFade);
        gl.uniform1f(this.u.uTime, time);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
    }
}
