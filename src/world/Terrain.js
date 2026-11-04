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
import { TERRAIN } from "../config.js";

// The terrain is a static grid uploaded once to the GPU. Every frame the
// vertex shader evaluates the layered value noise (heightfield + normal),
// projects each vertex, and the fragment shader shades and fogs it — so the
// heavy per-vertex/per-pixel work runs on the graphics card, not the CPU.
const VERTEX_SRC = `#version 300 es
precision highp float;

in vec2 aXZ;            // local grid position (x, z)
uniform vec2 uSnap;     // snapped camera offset in world space
${CAMERA_UNIFORMS}
${TERRAIN_GLSL}

out float vHeight;
out float vDepth;
out vec3 vNormal;

${PROJECT_FN}

void main() {
    vec2 w = aXZ + uSnap;
    float h = terrainHeight(w);

    // Surface normal from finite differences of the heightfield.
    float e = 2.0;
    float hx = terrainHeight(w + vec2(e, 0.0)) - terrainHeight(w - vec2(e, 0.0));
    float hz = terrainHeight(w + vec2(0.0, e)) - terrainHeight(w - vec2(0.0, e));
    vNormal = normalize(vec3(-hx, 2.0 * e, -hz));

    vHeight = h;
    float depth;
    gl_Position = projectWorld(vec3(w.x, h, w.y), depth);
    vDepth = depth;
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;

in float vHeight;
in float vDepth;
in vec3 vNormal;

uniform float uAmp;
uniform int uEdge;      // 1 while drawing the wireframe overlay
${FOG_UNIFORMS}

${FOG_FN}

out vec4 frag;

void main() {
    if (uEdge == 1) {
        frag = vec4(0.07, 0.07, 0.09, 1.0);
        return;
    }

    // Green lowlands blending to brown/grey hilltops.
    float t = clamp(vHeight / uAmp, 0.0, 1.0);
    vec3 col;
    if (t < 0.5) {
        float k = t / 0.5;
        col = vec3(60.0 + k * 40.0, 120.0 + k * 30.0, 55.0 + k * 20.0) / 255.0;
    } else {
        float k = (t - 0.5) / 0.5;
        col = vec3(100.0 + k * 70.0, 150.0 - k * 40.0, 75.0 + k * 25.0) / 255.0;
    }

    vec3 N = normalize(vNormal);
    vec3 L = normalize(vec3(-0.4, 1.0, 0.35));
    float diff = 0.7 + 0.35 * max(dot(N, L), 0.0);
    col *= diff;

    // Moonlit night: dim and cool the land so it sits under the night sky.
    col *= vec3(0.42, 0.48, 0.60);

    frag = vec4(applyFog(col, vDepth), 1.0);
}`;

export class Terrain {
    constructor(renderer, noise) {
        this.noise = noise;
        this.gl = renderer.gl;

        this.cols = TERRAIN.cols;
        this.rows = TERRAIN.rows;
        this.cell = TERRAIN.cell;
        this.amplitude = TERRAIN.amplitude;
        this.hillDensity = TERRAIN.hillDensity;
        this.showEdges = false;

        this._build();
    }

    _build() {
        const gl = this.gl;
        const cols = this.cols;
        const rows = this.rows;
        const cell = this.cell;
        const nx = cols + 1;
        const nz = rows + 1;

        this.program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
        this.u = getUniforms(gl, this.program, [
            "uSnap", "uSeed", "uAmp", "uFreq", "uEdge",
            "uCam", "uCos", "uSin", "uYawCos", "uYawSin",
            "uScaleX", "uScaleY", "uNear", "uFar",
            "uFog", "uFogStart", "uFogEnd"
        ]);
        const aXZ = gl.getAttribLocation(this.program, "aXZ");

        // Local grid positions, centered on the origin in both axes so the
        // mesh can be re-centered on the bird (supports orbiting the camera).
        const pos = new Float32Array(nx * nz * 2);
        let p = 0;
        for (let r = 0; r < nz; r++) {
            const z = (r - rows / 2) * cell;
            for (let c = 0; c < nx; c++) {
                pos[p++] = (c - cols / 2) * cell;
                pos[p++] = z;
            }
        }

        // Triangle indices for the filled surface.
        const tri = new Uint32Array(cols * rows * 6);
        let ti = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const v00 = r * nx + c;
                const v10 = v00 + 1;
                const v01 = v00 + nx;
                const v11 = v01 + 1;
                tri[ti++] = v00; tri[ti++] = v10; tri[ti++] = v11;
                tri[ti++] = v00; tri[ti++] = v11; tri[ti++] = v01;
            }
        }

        // Line indices for the wireframe overlay.
        const lines = [];
        for (let r = 0; r < nz; r++) {
            for (let c = 0; c < cols; c++) {
                const v = r * nx + c;
                lines.push(v, v + 1);
            }
        }
        for (let c = 0; c < nx; c++) {
            for (let r = 0; r < rows; r++) {
                const v = r * nx + c;
                lines.push(v, v + nx);
            }
        }
        const edge = new Uint32Array(lines);

        this.triCount = tri.length;
        this.edgeCount = edge.length;

        const posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);

        const triBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, tri, gl.STATIC_DRAW);

        const edgeBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edgeBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, edge, gl.STATIC_DRAW);

        this.triVAO = gl.createVertexArray();
        gl.bindVertexArray(this.triVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.enableVertexAttribArray(aXZ);
        gl.vertexAttribPointer(aXZ, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triBuf);

        this.edgeVAO = gl.createVertexArray();
        gl.bindVertexArray(this.edgeVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.enableVertexAttribArray(aXZ);
        gl.vertexAttribPointer(aXZ, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edgeBuf);

        gl.bindVertexArray(null);
    }

    render(renderer, camera, centerX, centerZ) {
        const gl = renderer.gl;
        const cell = this.cell;

        gl.useProgram(this.program);
        setCameraUniforms(gl, this.u, camera, renderer);
        setFogUniforms(gl, this.u);

        // Snap the grid to fixed world-space cell boundaries (centered on the
        // bird) so the terrain stays anchored to the ground as it moves.
        const snapX = Math.floor(centerX / cell) * cell;
        const snapZ = Math.floor(centerZ / cell) * cell;
        gl.uniform2f(this.u.uSnap, snapX, snapZ);
        gl.uniform1f(this.u.uSeed, this.noise.seed);
        gl.uniform1f(this.u.uAmp, this.amplitude);
        gl.uniform1f(this.u.uFreq, this.hillDensity);

        // Push the filled surface back a touch so edge lines sit on top.
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1.0, 1.0);
        gl.uniform1i(this.u.uEdge, 0);
        gl.bindVertexArray(this.triVAO);
        gl.drawElements(gl.TRIANGLES, this.triCount, gl.UNSIGNED_INT, 0);
        gl.disable(gl.POLYGON_OFFSET_FILL);

        if (this.showEdges) {
            gl.uniform1i(this.u.uEdge, 1);
            gl.bindVertexArray(this.edgeVAO);
            gl.drawElements(gl.LINES, this.edgeCount, gl.UNSIGNED_INT, 0);
        }

        gl.bindVertexArray(null);
    }
}
