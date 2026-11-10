import { createProgram, getUniforms } from "../core/glUtils.js";
import {
    CAMERA_UNIFORMS,
    PROJECT_FN,
    FOG_UNIFORMS,
    FOG_FN,
    setCameraUniforms,
    setFogUniforms
} from "../core/shaderChunks.js";
import { BIRD } from "../config.js";
import { BIRD_MODEL } from "./Bird3.js";

// Imported low-poly bird, uploaded once to the GPU, that flies a fixed distance
// ahead of the camera so the camera reads as following it. The model is
// reoriented into the scene axes (model X=body, Y=up, Z=wingspan) and flat-
// shaded into vertex colors; wings flap via a per-vertex weight in the shader.
const VERTEX_SRC = `#version 300 es
precision highp float;

in vec3 aPos;
in vec3 aColor;
in float aFlap;        // per-vertex flap weight (0 at body, 1 at wing tips)
uniform vec3 uBird;    // bird world position
uniform float uFlap;   // current wing-tip vertical offset
${CAMERA_UNIFORMS}

out vec3 vColor;
out float vDepth;

${PROJECT_FN}

void main() {
    vec3 local = aPos;
    local.y += aFlap * uFlap;
    float depth;
    gl_Position = projectWorld(local + uBird, depth);
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

const BASE_COLOR = [0.247, 0.247, 0.290]; // night plumage
const LIGHT_DIR = norm([-0.3, 0.9, 0.25]); // soft moonlight from above
const AMBIENT = 0.45;

function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
}

// Random dwell time (seconds) before the next flap/glide switch.
function randDelay() {
    return 10 + Math.random() * 10;
}

function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function faceNormal(p0, p1, p2) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    return norm([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
}

export class Bird {
    constructor(renderer) {
        this.gl = renderer.gl;
        this.altitude = BIRD.altitude;
        this.flapAmp = BIRD.flap;
        // Alternates between flapping and gliding (wings still); eased so the
        // wings settle smoothly rather than snapping at each switch.
        this.flapping = true;
        this.ampLevel = 1;
        this.nextSwitch = null;
        this.lastTime = null;

        this._build();
    }

    _build() {
        const gl = this.gl;
        const s = BIRD.scale;

        // Remap model axes into the scene: model X=body (head +X), Y=up, Z=wingspan;
        // scene wants forward=+z, up=+y, left/right=x, so (mx,my,mz) → (-mz,my,mx),
        // a rotation (not a mirror) so the outward winding survives.
        const lo = [Infinity, Infinity, Infinity];
        const hi = [-Infinity, -Infinity, -Infinity];
        for (const v of BIRD_MODEL.vertices) {
            for (let i = 0; i < 3; i++) {
                lo[i] = Math.min(lo[i], v[i]);
                hi[i] = Math.max(hi[i], v[i]);
            }
        }
        // The model sits off-origin; center its bounds on the bird position.
        const [cx, cy, cz] = [0, 1, 2].map((i) => (lo[i] + hi[i]) / 2);
        const maxSpan = Math.max(hi[2] - cz, cz - lo[2]);
        const world = BIRD_MODEL.vertices.map(([mx, my, mz]) =>
            [-(mz - cz) * s, (my - cy) * s, (mx - cx) * s]);
        // Wing weight: tips (large |span|) flap most, the body centerline stays.
        const flapOf = BIRD_MODEL.vertices.map(([, , mz]) => Math.pow(Math.abs(mz - cz) / maxSpan, 1.6));

        const pos = [];
        const col = [];
        const flap = [];

        // Fan-triangulate the few quads the export keeps.
        const tris = BIRD_MODEL.faces.flatMap((f) =>
            f.slice(1, -1).map((_, k) => [f[0], f[k + 1], f[k + 2]]));
        for (const [a, b, c] of tris) {
            const p0 = world[a], p1 = world[b], p2 = world[c];
            const n = faceNormal(p0, p1, p2);
            const shade = AMBIENT + (1 - AMBIENT) * Math.max(0, dot(n, LIGHT_DIR));
            const color = [BASE_COLOR[0] * shade, BASE_COLOR[1] * shade, BASE_COLOR[2] * shade];
            for (const [p, idx] of [[p0, a], [p1, b], [p2, c]]) {
                pos.push(p[0], p[1], p[2]);
                col.push(color[0], color[1], color[2]);
                flap.push(flapOf[idx]);
            }
        }

        this.count = pos.length / 3;

        this.program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
        this.u = getUniforms(gl, this.program, [
            "uBird", "uFlap",
            "uCam", "uCos", "uSin", "uYawCos", "uYawSin",
            "uScaleX", "uScaleY", "uNear", "uFar",
            "uFog", "uFogStart", "uFogEnd"
        ]);
        const aPos = gl.getAttribLocation(this.program, "aPos");
        const aColor = gl.getAttribLocation(this.program, "aColor");
        const aFlap = gl.getAttribLocation(this.program, "aFlap");

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        this._attrib(aPos, new Float32Array(pos), 3);
        this._attrib(aColor, new Float32Array(col), 3);
        this._attrib(aFlap, new Float32Array(flap), 1);
        gl.bindVertexArray(null);
    }

    _attrib(location, data, size) {
        const gl = this.gl;
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    }

    render(renderer, camera, bx, bz, time) {
        const gl = renderer.gl;
        if (this.nextSwitch === null) {
            this.nextSwitch = time + randDelay();
            this.lastTime = time;
        }
        if (time >= this.nextSwitch) {
            this.flapping = !this.flapping;
            this.nextSwitch = time + randDelay();
        }
        const dt = Math.min(0.1, time - this.lastTime);
        this.lastTime = time;
        this.ampLevel += ((this.flapping ? 1 : 0) - this.ampLevel) * Math.min(1, dt * 3);

        // Gentle bobbing plus flapping scaled by the current mode amplitude.
        const by = this.altitude + Math.sin(time * 2) * 4;
        const flap = Math.sin(time * 8) * this.flapAmp * this.ampLevel;

        gl.useProgram(this.program);
        setCameraUniforms(gl, this.u, camera, renderer);
        setFogUniforms(gl, this.u);
        gl.uniform3f(this.u.uBird, bx, by, bz);
        gl.uniform1f(this.u.uFlap, flap);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.count);
        gl.bindVertexArray(null);
    }
}
