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
import { ROCKS } from "../config.js";
import { ROCK1_MODEL } from "./Rock1.js";
import { ROCK2_MODEL } from "./Rock2.js";

// Sparse gray rocks scattered over the terrain, GPU-instanced like the trees.
// Two imported low-poly models are packed into one mesh, tagged per vertex
// (aType). Each instance hashes a type, a size and a yaw; vertices of the other
// type collapse to a point, so one draw call plants a single, randomly sized
// and rotated rock per cell on the shared ground height.
const VERTEX_SRC = `#version 300 es
precision highp float;

in vec3 aPos;          // local rock vertex (base at y=0)
in vec3 aColor;
in float aType;        // which rock variant this vertex belongs to (0, 1, 2)
in vec2 aOffset;       // per-instance local cell position
uniform vec2 uSnap;    // snapped center offset in world space
uniform float uCell;
uniform float uThreshold; // presence cutoff (higher = fewer rocks)
uniform float uSizeMin;
uniform float uSizeMax;
${CAMERA_UNIFORMS}
${TERRAIN_GLSL}

out vec3 vColor;
out float vDepth;

float rockHash(vec2 p) {
    return fract(sin(dot(p + uSeed + vec2(71.9, 13.7), vec2(311.7, 127.1))) * 26143.1337);
}

${PROJECT_FN}

void main() {
    vec2 cell = aOffset + uSnap;
    vec2 id = floor(cell / uCell);

    float present = step(uThreshold, rockHash(id));
    float chosen = floor(rockHash(id + 2.2) * 2.0);        // pick one of two models
    float typeMatch = step(abs(aType - chosen), 0.5);      // 1 if this vertex's type

    vec2 jitter = (vec2(rockHash(id + 3.1), rockHash(id + 6.7)) - 0.5) * uCell * 0.7;
    vec2 wxz = (id + 0.5) * uCell + jitter;
    float ground = terrainHeight(wxz);

    float sizeRand = uSizeMin + rockHash(id + 9.2) * (uSizeMax - uSizeMin);
    float dry = step(lakeMask(wxz), 0.05);     // keep rocks out of lakes
    float scale = sizeRand * present * typeMatch * dry;

    // Random yaw per cell so the repeated models never look identical.
    float ang = rockHash(id + 15.3) * 6.2831853;
    float ca = cos(ang), sa = sin(ang);
    vec3 s = aPos * scale;
    vec3 local = vec3(s.x * ca - s.z * sa, s.y, s.x * sa + s.z * ca);
    vec3 world = vec3(wxz.x + local.x, ground + local.y, wxz.y + local.z);

    float depth;
    gl_Position = projectWorld(world, depth);
    vDepth = depth;
    vColor = aColor;
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;

in vec3 vColor;
in float vDepth;
${FOG_UNIFORMS}

${FOG_FN}

out vec4 frag;

void main() {
    frag = vec4(applyFog(vColor, vDepth), 1.0);
}`;

export class Rocks {
    constructor(renderer) {
        this.gl = renderer.gl;
        this.cell = ROCKS.cell;
        this.grid = ROCKS.grid;

        this._build();
    }

    _build() {
        const gl = this.gl;
        const pos = [];
        const col = [];
        const type = [];

        // Bake one model into the shared arrays: models are Z-up, so remap to
        // Y-up, drop the base to y=0, normalize to a target footprint, and
        // flat-shade each face into vertex colors (two-sided, no lighting pass).
        const addModel = (model, t, gray, targetRadius) => {
            let maxR = 0;
            let minUp = Infinity;
            for (const [mx, my, mz] of model.vertices) {
                maxR = Math.max(maxR, Math.hypot(mx, my));
                minUp = Math.min(minUp, mz);
            }
            const s = targetRadius / maxR;
            const world = model.vertices.map(([mx, my, mz]) => [mx * s, (mz - minUp) * s, my * s]);

            for (const [a, b, c] of model.faces) {
                const p0 = world[a], p1 = world[b], p2 = world[c];
                const n = faceNormal(p0, p1, p2);
                const shade = ROCK_AMBIENT + (1 - ROCK_AMBIENT) * Math.abs(dot(n, LIGHT_DIR));
                const color = [gray[0] * shade, gray[1] * shade, gray[2] * shade];
                for (const p of [p0, p1, p2]) {
                    pos.push(p[0], p[1], p[2]);
                    col.push(color[0], color[1], color[2]);
                    type.push(t);
                }
            }
        };

        // Two gray variants, both base at y=0 with similar footprints.
        addModel(ROCK1_MODEL, 0, [0.45, 0.46, 0.49], 7.0);
        addModel(ROCK2_MODEL, 1, [0.42, 0.43, 0.47], 7.5);

        this.vertexCount = pos.length / 3;

        // Candidate instance cells (local, centered on origin).
        const g = this.grid;
        const offsets = new Float32Array(g * g * 2);
        let o = 0;
        for (let j = 0; j < g; j++) {
            for (let i = 0; i < g; i++) {
                offsets[o++] = (i - g / 2) * this.cell;
                offsets[o++] = (j - g / 2) * this.cell;
            }
        }
        this.instanceCount = g * g;

        this.program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
        this.u = getUniforms(gl, this.program, [
            "uSnap", "uCell", "uThreshold", "uSizeMin", "uSizeMax",
            "uSeed", "uAmp", "uFreq",
            "uCam", "uCos", "uSin", "uYawCos", "uYawSin",
            "uScaleX", "uScaleY", "uNear", "uFar",
            "uFog", "uFogStart", "uFogEnd"
        ]);
        const aPos = gl.getAttribLocation(this.program, "aPos");
        const aColor = gl.getAttribLocation(this.program, "aColor");
        const aType = gl.getAttribLocation(this.program, "aType");
        const aOffset = gl.getAttribLocation(this.program, "aOffset");

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        this._attrib(aPos, new Float32Array(pos), 3, 0);
        this._attrib(aColor, new Float32Array(col), 3, 0);
        this._attrib(aType, new Float32Array(type), 1, 0);
        this._attrib(aOffset, offsets, 2, 1);
        gl.bindVertexArray(null);
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

    // Reads the seed/amplitude/density from the terrain so the rocks sit on
    // the exact same ground.
    render(renderer, camera, centerX, centerZ, terrain) {
        const gl = renderer.gl;
        const cell = this.cell;

        gl.useProgram(this.program);
        setCameraUniforms(gl, this.u, camera, renderer);
        setFogUniforms(gl, this.u);

        gl.uniform1f(this.u.uSeed, terrain.noise.seed);
        gl.uniform1f(this.u.uAmp, terrain.amplitude);
        gl.uniform1f(this.u.uFreq, terrain.hillDensity);
        gl.uniform1f(this.u.uCell, cell);
        gl.uniform1f(this.u.uThreshold, ROCKS.threshold);
        gl.uniform1f(this.u.uSizeMin, ROCKS.sizeMin);
        gl.uniform1f(this.u.uSizeMax, ROCKS.sizeMax);
        gl.uniform2f(
            this.u.uSnap,
            Math.floor(centerX / cell) * cell,
            Math.floor(centerZ / cell) * cell
        );

        gl.bindVertexArray(this.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, this.vertexCount, this.instanceCount);
        gl.bindVertexArray(null);
    }
}

const LIGHT_DIR = norm([-0.3, 0.9, 0.25]); // soft moonlight from above
const ROCK_AMBIENT = 0.5;

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
