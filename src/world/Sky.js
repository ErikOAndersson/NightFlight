import { createProgram, getUniforms } from "../core/glUtils.js";
import { CAMERA_UNIFORMS, setCameraUniforms } from "../core/shaderChunks.js";
import { SKY } from "../config.js";

// Cylindrical night-sky panorama. Each pixel's view ray is rebuilt by inverting
// the shared yaw→pitch projection, then looked up by azimuth/elevation, so the
// sky pans with the ground as the camera pivots. Drawn after the opaque scene
// at the far plane without depth writes, so only uncovered pixels run it.
const VERTEX_SRC = `#version 300 es
precision highp float;

in vec2 aPos;   // clip-space fullscreen triangle
out vec2 vNdc;

void main() {
    vNdc = aPos;
    gl_Position = vec4(aPos, 0.9999, 1.0);
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;

in vec2 vNdc;
uniform sampler2D uTex;
uniform float uCoverage;
uniform float uAspect;
uniform float uHorizon;
uniform float uHeading;
uniform float uBrightness;
${CAMERA_UNIFORMS}
out vec4 frag;

void main() {
    // Inverse of projectWorld: view-space ray, then undo pitch and yaw.
    float rx = vNdc.x / uScaleX;
    float ry = vNdc.y / uScaleY;
    float rz = 1.0;
    float dy = ry * uCos + rz * uSin;
    float rz0 = -ry * uSin + rz * uCos;
    float dx = rx * uYawCos + rz0 * uYawSin;
    float dz = -rx * uYawSin + rz0 * uYawCos;

    float az = atan(dx, dz) + uHeading;
    // True cylinder: height grows with tan(elevation); below the horizon the
    // image mirrors instead of smearing its edge row.
    float el = clamp(atan(abs(dy), length(vec2(dx, dz))), 0.0, 1.45);
    vec2 uv = vec2(az / uCoverage, uHorizon + tan(el) * uAspect / uCoverage);
    frag = vec4(texture(uTex, uv).rgb * uBrightness, 1.0);
}`;

export class Sky {
    constructor(renderer) {
        const gl = renderer.gl;
        this.gl = gl;
        this.program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
        this.u = getUniforms(gl, this.program, [
            "uTex", "uCoverage", "uAspect", "uHorizon", "uHeading", "uBrightness",
            "uCam", "uCos", "uSin", "uYawCos", "uYawSin",
            "uScaleX", "uScaleY", "uNear", "uFar"
        ]);

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

        this.texture = this._loadTexture("Assets/wide_sky.webp");
    }

    _loadTexture(url) {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        // Dark placeholder until the image loads.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA,
            gl.UNSIGNED_BYTE, new Uint8Array([5, 8, 15, 255]));

        const img = new Image();
        img.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            // No mipmaps: the atan seam would break derivative-based LOD.
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            // Mirrored so the non-tiling left/right edges blend seamlessly.
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
        };
        img.src = url;
        return tex;
    }

    render(renderer, camera) {
        const gl = renderer.gl;
        gl.useProgram(this.program);
        setCameraUniforms(gl, this.u, camera, renderer);
        gl.uniform1f(this.u.uCoverage, SKY.coverage);
        gl.uniform1f(this.u.uAspect, SKY.imageAspect);
        gl.uniform1f(this.u.uHorizon, SKY.horizon);
        gl.uniform1f(this.u.uHeading, SKY.heading);
        gl.uniform1f(this.u.uBrightness, SKY.brightness);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(this.u.uTex, 2);
        gl.activeTexture(gl.TEXTURE0);

        gl.depthMask(false);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        gl.depthMask(true);
    }
}
