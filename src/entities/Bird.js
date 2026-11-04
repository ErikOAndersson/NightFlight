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

// Placeholder low-poly bird, uploaded once to the GPU, that flies a fixed
// distance ahead of the camera so the camera reads as following it. Wing-tip
// flapping is driven by a uniform in the vertex shader. Swap the geometry in
// _buildMesh() for a real model later; the positioning stays the same.
const VERTEX_SRC = `#version 300 es
precision highp float;

in vec3 aPos;
in vec3 aColor;
in float aFlap;        // 1.0 for wing-tip vertices, else 0.0
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

const BODY = [0.227, 0.227, 0.267];  // #3a3a44
const WING_L = [0.173, 0.173, 0.208]; // #2c2c35
const WING_R = [0.290, 0.290, 0.337]; // #4a4a56

export class Bird {
    constructor(renderer) {
        this.gl = renderer.gl;
        this.altitude = BIRD.altitude;

        this._build();
    }

    _build() {
        const gl = this.gl;
        const pos = [];
        const col = [];
        const flap = [];

        // Pushes one triangle: three points, a shared color, and per-vertex
        // flap flags (1 where the vertex should follow the flapping uniform).
        const tri = (pts, color, flapFlags) => {
            for (let i = 0; i < 3; i++) {
                pos.push(pts[i][0], pts[i][1], pts[i][2]);
                col.push(color[0], color[1], color[2]);
                flap.push(flapFlags[i]);
            }
        };

        const nose = [0, 0, 26];
        const tail = [0, 2, -24];
        const left = [-7, 0, 0];
        const right = [7, 0, 0];
        // Body: a slim diamond along the travel axis (two triangles).
        tri([nose, right, tail], BODY, [0, 0, 0]);
        tri([nose, tail, left], BODY, [0, 0, 0]);

        const wingRootF = [0, 2, 6];
        const wingRootB = [0, 2, -10];
        const leftTip = [-40, 0, -6];
        const rightTip = [40, 0, -6];
        // Wings: tips (flag 1) rise and fall with the flap uniform.
        tri([wingRootF, leftTip, wingRootB], WING_L, [0, 1, 0]);
        tri([wingRootF, rightTip, wingRootB], WING_R, [0, 1, 0]);

        // Tail fan.
        tri([[0, 2, -24], [-9, 2, -34], [9, 2, -34]], WING_L, [0, 0, 0]);

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
        // Gentle bobbing plus flapping driven by time.
        const by = this.altitude + Math.sin(time * 2) * 4;
        const flap = Math.sin(time * 8) * 16;

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
