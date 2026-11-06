import { createProgram, getUniforms } from "../core/glUtils.js";

// Fullscreen night sky: a dark gradient with sparse procedural stars and a
// discreet distant nebula streak. Drawn after the opaque scene at the far
// plane without depth writes, so only uncovered pixels run the shader.
const VERTEX_SRC = `#version 300 es
precision highp float;

in vec2 aPos;   // clip-space fullscreen triangle
out vec2 vUv;   // 0..1 across the screen

void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.9999, 1.0);
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 frag;

const vec3 TOP = vec3(0.02, 0.03, 0.06);     // deep night zenith
const vec3 HORIZON = vec3(0.09, 0.11, 0.18); // slightly lifted near horizon

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Sparse starfield: only a few grid cells hold a star, placed at a random
// spot inside the cell with a soft falloff and varied brightness.
float stars(vec2 uv) {
    vec2 grid = uv * vec2(260.0, 150.0);
    vec2 id = floor(grid);
    vec2 f = fract(grid);
    float present = step(0.985, hash(id));
    vec2 c = vec2(hash(id + 1.3), hash(id + 2.7));
    float d = length(f - c);
    float s = present * smoothstep(0.12, 0.0, d);
    return s * (0.4 + 0.6 * hash(id + 5.1));
}

void main() {
    float y = clamp(vUv.y, 0.0, 1.0);
    vec3 col = mix(HORIZON, TOP, pow(y, 0.6));

    // Faraway nebula: a soft diagonal streak of discreet color.
    float n = noise(vUv * 3.0);
    float t = vUv.x * 0.6 + vUv.y * 0.8;
    float band = exp(-pow((t - 0.95 + n * 0.2) / 0.2, 2.0));
    band *= 0.55 + 0.45 * noise(vUv * 6.0);
    vec3 nebula = mix(vec3(0.28, 0.10, 0.38), vec3(0.08, 0.22, 0.30), n);
    col += nebula * band * 0.22;

    // Sparse stars on top.
    col += vec3(stars(vUv));

    frag = vec4(col, 1.0);
}`;

export class Sky {
    constructor(renderer) {
        const gl = renderer.gl;
        this.gl = gl;
        this.program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);

        const aPos = gl.getAttribLocation(this.program, "aPos");
        const quad = new Float32Array([
            -1, -1, 3, -1, -1, 3 // oversized triangle covering the screen
        ]);

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    render(renderer) {
        const gl = renderer.gl;
        gl.useProgram(this.program);
        gl.depthMask(false);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        gl.depthMask(true);
    }
}
