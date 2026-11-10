import { createProgram, getUniforms } from "../core/glUtils.js";
import { CellPicker } from "../core/CellPicker.js";
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
import {
    SHADOW_UNIFORMS,
    SHADOW_VERTEX_FN,
    SHADOW_FRAGMENT_FN,
    SHADOW_UNIFORM_NAMES,
    ShadowPass
} from "../core/Shadow.js";
import { HOUSES, WATER } from "../config.js";
import { HOUSE4_MODEL } from "./House4.js";

// Rare cottages scattered over the lowlands, GPU-instanced like the rocks.
// Each picked cell hashes a jitter and a yaw; the walls sit on the highest
// ground under the footprint and the foundation fills the drop on slopes.
const VERTEX_SRC = `#version 300 es
precision highp float;

in vec3 aPos;          // local house vertex (centered, wall base at y=0)
in vec3 aColor;
in vec2 aCell;         // picked cell id (present cells only)
uniform float uCell;
uniform float uScale;
uniform float uFootprint; // half-diagonal of the scaled footprint
uniform float uFoundation; // scaled foundation depth below the walls
${CAMERA_UNIFORMS}
uniform float uSeed;
uniform float uAmp;
${SHADOW_UNIFORMS}
${GROUND_GLSL}
${SHADOW_VERTEX_FN}

out vec3 vColor;
out float vDepth;
out float vAlpha;

float houseHash(vec2 p) {
    return fract(sin(dot(p + uSeed + vec2(37.3, 91.1), vec2(269.5, 183.3))) * 43758.5453);
}

${PROJECT_FN}

void main() {
    vec2 id = aCell;

    vec2 jitter = (vec2(houseHash(id + 3.1), houseHash(id + 6.7)) - 0.5) * uCell * 0.6;
    vec2 wxz = (id + 0.5) * uCell + jitter;

    float f = uFootprint;
    vec2 g = groundAt(wxz);
    float h1 = groundAt(wxz + vec2(f, f)).r, h2 = groundAt(wxz + vec2(-f, f)).r;
    float h3 = groundAt(wxz + vec2(f, -f)).r, h4 = groundAt(wxz + vec2(-f, -f)).r;
    float ground = min(g.r, min(min(h1, h2), min(h3, h4)));
    float high = max(g.r, max(max(h1, h2), max(h3, h4)));
    // Walls clear the uphill side, but never so high the foundation floats.
    float base = min(high, ground + uFoundation);

    float lowland = step(g.r, uAmp * 0.5);
    float dry = step(g.g, 0.01) * step(${WATER.level.toFixed(1)}, ground);
    float scale = uScale * lowland * dry;

    if (uShadow > 0.5) {
        vec3 sw = shadowWorld(wxz, aPos.xy, lowland * dry, vAlpha);
        float d0;
        gl_Position = projectWorld(sw, d0);
        vDepth = d0;
        vColor = vec3(0.0);
        return;
    }
    vAlpha = 1.0;

    float ang = houseHash(id + 15.3) * 6.2831853;
    float ca = cos(ang), sa = sin(ang);
    vec3 s = aPos * scale;
    vec3 local = vec3(s.x * ca - s.z * sa, s.y, s.x * sa + s.z * ca);
    vec3 world = vec3(wxz.x + local.x, base + local.y, wxz.y + local.z);

    float depth;
    gl_Position = projectWorld(world, depth);
    vDepth = depth;
    vColor = aColor;
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;

in vec3 vColor;
in float vDepth;
in float vAlpha;
uniform float uShadow;
${FOG_UNIFORMS}

${FOG_FN}
${SHADOW_FRAGMENT_FN}

out vec4 frag;

void main() {
    if (uShadow > 0.5) {
        frag = shadowFrag(vDepth, vAlpha);
        return;
    }
    frag = vec4(applyFog(vColor, vDepth), 1.0);
}`;

export class Houses {
    constructor(renderer) {
        this.gl = renderer.gl;
        this.cell = HOUSES.cell;
        this.grid = HOUSES.grid;

        this._build();
    }

    _build() {
        const gl = this.gl;
        const model = HOUSE4_MODEL;
        const pos = [];
        const col = [];

        // The model is already Y-up with the wall base at y=0 and the foundation
        // below it; center it on x/z and keep that base as the ground line.
        let minX = Infinity, maxX = -Infinity, minY = Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        for (const [x, y, z] of model.vertices) {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
            minY = Math.min(minY, y);
        }
        const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
        const local = model.vertices.map(([x, y, z]) => [x - cx, y, z - cz]);
        this.footprint = Math.hypot(maxX - minX, maxZ - minZ) / 2 * HOUSES.scale;
        this.foundation = Math.max(0, -minY) * HOUSES.scale;

        // Flat-shade each face into vertex colors; the lit window stays unshaded.
        // Quads are fan-triangulated, keeping their face index for the colour.
        const overrides = model.faceColorOverrides || {};
        const tris = model.faces.flatMap((f, i) =>
            f.slice(1, -1).map((_, k) => [f[0], f[k + 1], f[k + 2], i]));
        tris.forEach(([a, b, c, i]) => {
            const p0 = local[a], p1 = local[b], p2 = local[c];
            const base = overrides[i] ? overrides[i].map((v) => v / 255) : HOUSES.wallColor;
            const glow = overrides[i] && overrides[i].join() === WINDOW_RGB.join();
            const n = faceNormal(p0, p1, p2);
            const shade = glow ? 1 : AMBIENT + (1 - AMBIENT) * Math.abs(dot(n, LIGHT_DIR));
            for (const p of [p0, p1, p2]) {
                pos.push(p[0], p[1], p[2]);
                col.push(base[0] * shade, base[1] * shade, base[2] * shade);
            }
        });
        this.vertexCount = pos.length / 3;

        this.picker = new CellPicker(gl, this.grid, 0x7b91);

        this.program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
        this.u = getUniforms(gl, this.program, [
            "uCell", "uScale", "uFootprint", "uFoundation",
            "uSeed", "uAmp", "uGround", "uGroundOrigin", "uGroundCell",
            "uCam", "uCos", "uSin", "uYawCos", "uYawSin",
            "uScaleX", "uScaleY", "uNear", "uFar",
            "uFog", "uFogStart", "uFogEnd",
            ...SHADOW_UNIFORM_NAMES
        ]);
        const aPos = gl.getAttribLocation(this.program, "aPos");
        const aColor = gl.getAttribLocation(this.program, "aColor");
        const aCell = gl.getAttribLocation(this.program, "aCell");

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        this._attrib(aPos, new Float32Array(pos), 3, 0);
        this._attrib(aColor, new Float32Array(col), 3, 0);
        this.picker.bind(gl, aCell);
        gl.bindVertexArray(null);

        this.shadow = new ShadowPass(gl, this.picker, aPos, aCell, HOUSES.shadow);
    }

    _attrib(location, data, size, divisor) {
        const gl = this.gl;
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(location, divisor);
    }

    render(renderer, camera, centerX, centerZ, terrain) {
        const gl = renderer.gl;
        const cell = this.cell;

        this.picker.update(gl, centerX, centerZ, cell, HOUSES.threshold, terrain.noise.seed);
        if (this.picker.count === 0) {
            return;
        }

        gl.useProgram(this.program);
        setCameraUniforms(gl, this.u, camera, renderer);
        setFogUniforms(gl, this.u);

        gl.uniform1f(this.u.uSeed, terrain.noise.seed);
        gl.uniform1f(this.u.uAmp, terrain.amplitude);
        setGroundUniforms(gl, this.u, terrain);
        gl.uniform1f(this.u.uCell, cell);
        gl.uniform1f(this.u.uScale, HOUSES.scale);
        gl.uniform1f(this.u.uFootprint, this.footprint);
        gl.uniform1f(this.u.uFoundation, this.foundation);

        gl.bindVertexArray(this.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, this.vertexCount, this.picker.count);
        this.shadow.render(gl, this.u, this.picker.count);
        gl.bindVertexArray(null);
    }
}

const LIGHT_DIR = norm([-0.3, 0.9, 0.25]); // soft moonlight from above
const AMBIENT = 0.5;
const WINDOW_RGB = [231, 211, 18]; // lit window material, drawn unshaded

function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
}

function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function faceNormal(p0, p1, p2) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    return norm([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
}
