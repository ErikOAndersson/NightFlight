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
import { TREES } from "../config.js";

// Sparse pine trees scattered over the terrain, drawn with GPU instancing.
// One static low-poly pine mesh is instanced over the cells a CellPicker
// marks as present; the vertex shader jitters each tree's position and plants
// its base on the shared ground lookup. Trees on hilltops or in lakes collapse
// to a point.
const VERTEX_SRC = `#version 300 es
precision highp float;

in vec3 aPos;          // local pine vertex (base at y=0)
in vec3 aColor;
in vec2 aCell;         // picked cell id (present cells only)
uniform float uCell;   // cell size
${CAMERA_UNIFORMS}
uniform float uSeed;
uniform float uAmp;
${GROUND_GLSL}

out vec3 vColor;
out float vDepth;

float treeHash(vec2 p) {
    return fract(sin(dot(p + uSeed + vec2(19.3, 47.1), vec2(269.5, 183.3))) * 43758.5453);
}

${PROJECT_FN}

void main() {
    vec2 id = aCell;

    vec2 jitter = (vec2(treeHash(id + 3.1), treeHash(id + 6.7)) - 0.5) * uCell * 0.75;
    vec2 wxz = (id + 0.5) * uCell + jitter;

    vec2 g = groundAt(wxz);
    float ground = g.r;
    // Keep trees in the lowlands, off the high hilltops, and out of lakes.
    float lowland = step(ground, uAmp * 0.55);
    float dry = step(g.g, 0.05);
    float scale = (0.8 + treeHash(id + 9.2) * 0.8) * lowland * dry;

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

export class Trees {
    constructor(renderer) {
        this.gl = renderer.gl;
        this.cell = TREES.cell;
        this.grid = TREES.grid;
        this.threshold = TREES.threshold;

        this._build();
    }

    _build() {
        const gl = this.gl;
        const pos = [];
        const col = [];

        const trunk = [0.07, 0.055, 0.04];
        const foliage = [0.06, 0.16, 0.08];

        // One triangle: three points sharing a color.
        const tri = (a, b, c, color) => {
            pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
            for (let i = 0; i < 3; i++) col.push(color[0], color[1], color[2]);
        };

        // Trunk as a short square column.
        const tr = 1.2;
        const th = 8;
        const corners = [[-tr, -tr], [tr, -tr], [tr, tr], [-tr, tr]];
        for (let i = 0; i < 4; i++) {
            const [x0, z0] = corners[i];
            const [x1, z1] = corners[(i + 1) % 4];
            tri([x0, 0, z0], [x1, 0, z1], [x1, th, z1], trunk);
            tri([x0, 0, z0], [x1, th, z1], [x0, th, z0], trunk);
        }

        // Stacked foliage cones, apex lighter than the skirt.
        const addCone = (baseY, radius, apexY) => {
            const N = 7;
            const apex = [0, apexY, 0];
            const apexCol = foliage.map((c) => c * 1.15);
            const baseCol = foliage.map((c) => c * 0.75);
            for (let k = 0; k < N; k++) {
                const a0 = (2 * Math.PI * k) / N;
                const a1 = (2 * Math.PI * (k + 1)) / N;
                const p0 = [Math.cos(a0) * radius, baseY, Math.sin(a0) * radius];
                const p1 = [Math.cos(a1) * radius, baseY, Math.sin(a1) * radius];
                // Three vertices share one color here; use the base tint, with
                // a brighter band near the apex for a bit of form.
                tri(apex, p0, p1, k % 2 === 0 ? apexCol : baseCol);
            }
        };
        addCone(6, 7, 20);
        addCone(16, 5, 30);
        addCone(24, 3, 36);

        this.vertexCount = pos.length / 3;

        this.picker = new CellPicker(gl, this.grid, 0x1f3a);

        this.program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
        this.u = getUniforms(gl, this.program, [
            "uCell", "uSeed", "uAmp",
            "uGround", "uGroundOrigin", "uGroundCell",
            "uCam", "uCos", "uSin", "uYawCos", "uYawSin",
            "uScaleX", "uScaleY", "uNear", "uFar",
            "uFog", "uFogStart", "uFogEnd"
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

    // Reads the seed/amplitude/density from the terrain so the trees sit on
    // the exact same ground.
    render(renderer, camera, centerX, centerZ, terrain) {
        const gl = renderer.gl;
        const cell = this.cell;

        this.picker.update(gl, centerX, centerZ, cell, this.threshold, terrain.noise.seed);
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

        gl.bindVertexArray(this.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, this.vertexCount, this.picker.count);
        gl.bindVertexArray(null);
    }
}
