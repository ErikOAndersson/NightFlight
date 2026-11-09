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

// The terrain is a static grid uploaded once to the GPU. Whenever the grid
// moves (or the hills change) the layered value noise is baked on the GPU into
// a ground lookup texture, one texel per grid vertex; the vertex shader then
// just fetches its height and neighbors (for the normal) from it. Trees,
// rocks, houses and water sample the same texture.
const VERTEX_SRC = `#version 300 es
precision highp float;

in vec2 aXZ;            // local grid position (x, z)
uniform vec2 uSnap;     // snapped camera offset in world space
uniform sampler2D uGround;
uniform float uCell;
${CAMERA_UNIFORMS}

out float vHeight;
out float vDepth;
out vec2 vWorld;
out vec3 vNormal;

${PROJECT_FN}

float heightAt(ivec2 ij) {
    ivec2 last = textureSize(uGround, 0) - 1;
    return texelFetch(uGround, clamp(ij, ivec2(0), last), 0).r;
}

void main() {
    vec2 w = aXZ + uSnap;
    int nx = textureSize(uGround, 0).x;
    ivec2 ij = ivec2(gl_VertexID % nx, gl_VertexID / nx); // texel of this grid vertex
    float h = heightAt(ij);

    // Surface normal from the neighboring grid heights.
    float hx = heightAt(ij + ivec2(1, 0)) - heightAt(ij - ivec2(1, 0));
    float hz = heightAt(ij + ivec2(0, 1)) - heightAt(ij - ivec2(0, 1));
    vNormal = normalize(vec3(-hx, 2.0 * uCell, -hz));

    vHeight = h;
    vWorld = w;
    float depth;
    gl_Position = projectWorld(vec3(w.x, h, w.y), depth);
    vDepth = depth;
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;

in float vHeight;
in float vDepth;
in vec2 vWorld;
in vec3 vNormal;

uniform float uAmp;
uniform vec4 uDetail;   // strength, patch scale, speckle scale, fade start
uniform float uDetailFadeEnd;
uniform int uEdge;      // 1 while drawing the wireframe overlay
${FOG_UNIFORMS}

${FOG_FN}

out vec4 frag;

float dHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float dNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), f.x),
               mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), f.x), f.y);
}

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

    // Soft patches plus fine speckle, faded with distance to avoid shimmer.
    float fade = 1.0 - smoothstep(uDetail.w, uDetailFadeEnd, vDepth);
    float n = 0.65 * dNoise(vWorld / uDetail.y) + 0.35 * dNoise(vWorld / uDetail.z);
    col *= 1.0 + (n - 0.5) * 2.0 * uDetail.x * fade;

    vec3 N = normalize(vNormal);
    vec3 L = normalize(vec3(-0.4, 1.0, 0.35));
    float diff = 0.7 + 0.35 * max(dot(N, L), 0.0);
    col *= diff;

    // Moonlit night: dim and cool the land so it sits under the night sky.
    col *= vec3(0.42, 0.48, 0.60);

    frag = vec4(applyFog(col, vDepth), 1.0);
}`;

// Bakes terrainHeight/lakeMask for each grid vertex into the ground texture.
const BAKE_VERTEX_SRC = `#version 300 es
in vec2 aPos;
void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const BAKE_FRAGMENT_SRC = `#version 300 es
precision highp float;

uniform vec2 uOrigin;   // world xz of texel (0, 0)
uniform float uCell;
${TERRAIN_GLSL}

out vec4 frag;

void main() {
    vec2 w = uOrigin + floor(gl_FragCoord.xy) * uCell;
    frag = vec4(terrainHeight(w), lakeMask(w), 0.0, 1.0);
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
            "uSnap", "uGround", "uCell", "uAmp", "uEdge", "uDetail", "uDetailFadeEnd",
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

        this._buildGround(nx, nz);
    }

    _buildGround(nx, nz) {
        const gl = this.gl;
        if (!gl.getExtension("EXT_color_buffer_float")) {
            throw new Error("EXT_color_buffer_float is required for the ground lookup texture.");
        }

        // Half floats are filterable without extensions; ~0.1 unit height precision.
        this.groundTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.groundTex);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG16F, nx, nz);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);

        this.groundFbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.groundFbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.groundTex, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error("Ground lookup framebuffer is incomplete.");
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        this.groundSize = [nx, nz];
        this.groundOrigin = [0, 0];
        this.groundKey = "";

        this.bakeProgram = createProgram(gl, BAKE_VERTEX_SRC, BAKE_FRAGMENT_SRC);
        this.bakeU = getUniforms(gl, this.bakeProgram, ["uOrigin", "uCell", "uSeed", "uAmp", "uFreq"]);
        const aPos = gl.getAttribLocation(this.bakeProgram, "aPos");
        this.bakeVAO = gl.createVertexArray();
        gl.bindVertexArray(this.bakeVAO);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    // Re-bakes the ground texture only when the grid snaps to a new cell or
    // the noise inputs change; otherwise the last bake is still exact.
    _updateGround(renderer, snapX, snapZ) {
        const key = `${snapX},${snapZ},${this.noise.seed},${this.amplitude},${this.hillDensity}`;
        if (key === this.groundKey) {
            return;
        }
        this.groundKey = key;
        this.groundOrigin = [snapX - (this.cols / 2) * this.cell, snapZ - (this.rows / 2) * this.cell];

        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.groundFbo);
        gl.viewport(0, 0, this.groundSize[0], this.groundSize[1]);
        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(this.bakeProgram);
        gl.uniform2f(this.bakeU.uOrigin, this.groundOrigin[0], this.groundOrigin[1]);
        gl.uniform1f(this.bakeU.uCell, this.cell);
        gl.uniform1f(this.bakeU.uSeed, this.noise.seed);
        gl.uniform1f(this.bakeU.uAmp, this.amplitude);
        gl.uniform1f(this.bakeU.uFreq, this.hillDensity);
        gl.bindVertexArray(this.bakeVAO);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        gl.enable(gl.DEPTH_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, renderer.canvas.width, renderer.canvas.height);
    }

    render(renderer, camera, centerX, centerZ) {
        const gl = renderer.gl;
        const cell = this.cell;

        // Snap the grid to fixed world-space cell boundaries (centered on the
        // bird) so the terrain stays anchored to the ground as it moves.
        const snapX = Math.floor(centerX / cell) * cell;
        const snapZ = Math.floor(centerZ / cell) * cell;
        this._updateGround(renderer, snapX, snapZ);

        gl.useProgram(this.program);
        setCameraUniforms(gl, this.u, camera, renderer);
        setFogUniforms(gl, this.u);
        gl.uniform2f(this.u.uSnap, snapX, snapZ);
        gl.uniform1f(this.u.uCell, cell);
        gl.uniform1f(this.u.uAmp, this.amplitude);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.groundTex);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(this.u.uGround, 1);
        const d = TERRAIN.detail;
        gl.uniform4f(this.u.uDetail, d.strength, d.patchScale, d.speckleScale, d.fadeStart);
        gl.uniform1f(this.u.uDetailFadeEnd, d.fadeEnd);

        // A heightfield seen from above never shows its back faces, so skip them.
        gl.enable(gl.CULL_FACE);
        // Push the filled surface back a touch so edge lines sit on top.
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1.0, 1.0);
        gl.uniform1i(this.u.uEdge, 0);
        gl.bindVertexArray(this.triVAO);
        gl.drawElements(gl.TRIANGLES, this.triCount, gl.UNSIGNED_INT, 0);
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.disable(gl.CULL_FACE);

        if (this.showEdges) {
            gl.uniform1i(this.u.uEdge, 1);
            gl.bindVertexArray(this.edgeVAO);
            gl.drawElements(gl.LINES, this.edgeCount, gl.UNSIGNED_INT, 0);
        }

        gl.bindVertexArray(null);
    }
}
