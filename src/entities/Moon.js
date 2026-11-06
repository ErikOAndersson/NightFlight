import { createProgram, getUniforms } from "../core/glUtils.js";
import { CAMERA_UNIFORMS, PROJECT_FN, setCameraUniforms } from "../core/shaderChunks.js";
import { MOON } from "../config.js";

// A textured moon billboard pinned to a fixed direction in the sky. It is
// placed infinitely far along uDir (camera translation cancels out), so it
// stays put in the sky as the bird flies and sweeps across as the camera
// pivots. Drawn after the sky; the depth test hides it behind the scene.
const VERTEX_SRC = `#version 300 es
precision highp float;

in vec2 aCorner;       // quad corner in [-1, 1]
uniform vec3 uDir;     // sky direction
uniform float uSize;   // half-size on screen (NDC)
uniform float uAspect; // viewport width / height
${CAMERA_UNIFORMS}

out vec2 vUv;

${PROJECT_FN}

void main() {
    float depth;
    vec3 world = uCam + normalize(uDir) * 5000.0;
    vec4 c = projectWorld(world, depth);
    // Offset the corners in clip space for a constant, circular on-screen size.
    vec2 off = vec2(aCorner.x / uAspect, aCorner.y) * uSize;
    gl_Position = vec4(c.xy + off * c.w, c.z, c.w);
    vUv = aCorner;
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uTex;
out vec4 frag;

void main() {
    vec4 t = texture(uTex, vUv * 0.5 + 0.5);
    // Crop to a clean disc regardless of the image's corners.
    float a = t.a * smoothstep(1.0, 0.93, length(vUv));
    if (a < 0.01) discard;
    frag = vec4(t.rgb, a);
}`;

export class Moon {
    constructor(renderer) {
        const gl = renderer.gl;
        this.gl = gl;

        this.program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
        this.u = getUniforms(gl, this.program, [
            "uDir", "uSize", "uAspect", "uTex",
            "uCam", "uCos", "uSin", "uYawCos", "uYawSin",
            "uScaleX", "uScaleY", "uNear", "uFar"
        ]);

        const aCorner = gl.getAttribLocation(this.program, "aCorner");
        const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aCorner);
        gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        this.texture = this._loadTexture("Assets/moon.png");
    }

    _loadTexture(url) {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        // Transparent 1x1 placeholder until the image loads.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA,
            gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 0]));

        const img = new Image();
        img.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        };
        img.src = url;
        return tex;
    }

    render(renderer, camera) {
        const gl = renderer.gl;
        gl.useProgram(this.program);
        setCameraUniforms(gl, this.u, camera, renderer);
        gl.uniform3f(this.u.uDir, MOON.direction[0], MOON.direction[1], MOON.direction[2]);
        gl.uniform1f(this.u.uSize, MOON.size);
        gl.uniform1f(this.u.uAspect, renderer.width / renderer.height);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(this.u.uTex, 0);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
    }
}
