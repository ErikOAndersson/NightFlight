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

// Sparse gray rocks scattered over the terrain, GPU-instanced like the trees.
// Three low-poly rock variants are packed into one mesh, tagged per vertex
// (aType). Each instance hashes a type and a size; vertices of the other types
// collapse to a point, so one draw call plants a single, randomly sized rock
// per cell on the shared ground height.
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
    float chosen = floor(rockHash(id + 2.2) * 3.0);        // pick a variant
    float typeMatch = step(abs(aType - chosen), 0.5);      // 1 if this vertex's type

    vec2 jitter = (vec2(rockHash(id + 3.1), rockHash(id + 6.7)) - 0.5) * uCell * 0.7;
    vec2 wxz = (id + 0.5) * uCell + jitter;
    float ground = terrainHeight(wxz);

    float sizeRand = uSizeMin + rockHash(id + 9.2) * (uSizeMax - uSizeMin);
    float dry = step(lakeMask(wxz), 0.05);     // keep rocks out of lakes
    float scale = sizeRand * present * typeMatch * dry;

    vec3 local = aPos * scale;
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

        // Deterministic per-vertex radius jitter so rocks look irregular.
        const vnoise = (t, k) => {
            const s = Math.sin(t * 13.1 + k * 7.3) * 43758.5453;
            return s - Math.floor(s);
        };

        const pushTri = (a, b, c, color, t) => {
            pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
            for (let i = 0; i < 3; i++) {
                col.push(color[0], color[1], color[2]);
                type.push(t);
            }
        };

        // A faceted boulder: jittered base ring, bulging mid ring, apex.
        const addRock = (t, n, rBase, rMid, height, gray) => {
            const base = [];
            const mid = [];
            for (let k = 0; k < n; k++) {
                const a = (2 * Math.PI * k) / n;
                const jb = 0.7 + 0.6 * vnoise(t, k);
                const jm = 0.7 + 0.6 * vnoise(t, k + 10);
                base.push([Math.cos(a) * rBase * jb, 0, Math.sin(a) * rBase * jb]);
                mid.push([Math.cos(a) * rMid * jm, height * 0.45, Math.sin(a) * rMid * jm]);
            }
            const apex = [0, height, 0];

            const shade = (avgY, facet) => {
                const f = Math.min(1, avgY / height);
                const s = (0.6 + 0.45 * f) * facet;
                return [gray[0] * s, gray[1] * s, gray[2] * s];
            };

            for (let k = 0; k < n; k++) {
                const kn = (k + 1) % n;
                const facet = k % 2 === 0 ? 1.0 : 0.85;
                pushTri(base[k], base[kn], mid[kn],
                    shade(height * 0.22, facet), t);
                pushTri(base[k], mid[kn], mid[k],
                    shade(height * 0.3, facet), t);
                pushTri(mid[k], mid[kn], apex,
                    shade(height * 0.75, facet), t);
            }
        };

        // Three gray variants: a boulder, a wide flat rock, a sharp one.
        addRock(0, 6, 5.0, 4.2, 6.0, [0.44, 0.45, 0.48]);
        addRock(1, 7, 8.0, 6.5, 3.2, [0.48, 0.48, 0.50]);
        addRock(2, 5, 4.0, 2.8, 7.5, [0.40, 0.41, 0.46]);

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
