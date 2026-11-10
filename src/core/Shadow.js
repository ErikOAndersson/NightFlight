import { MOON } from "../config.js";

// Cheap fake shadows shared by the instanced props: a flat strip per instance
// pointing away from the moon, outlined per prop (taper/round/gable), that
// follows the terrain via groundAt. Props draw it as a second pass with uShadow = 1.
export const SHADOW_UNIFORMS = `
uniform float uShadow;    // 1 while drawing the shadow strips
uniform vec2 uShadowDir;  // unit ground direction the shadow points
uniform vec3 uShadowSize; // length, half-width, lift (world units at scale 1)
uniform float uShadowAlpha;
uniform vec2 uShadowShape; // outline kind (0 taper, 1 round, 2 gable), gable body fraction
`;

// Needs GROUND_GLSL. aShape = (across -1..1, along 0..1).
export const SHADOW_VERTEX_FN = `
float shadowProfile(float t) {
    if (uShadowShape.x > 1.5) {
        // Walls keep full width, then the roof ridge narrows to a point.
        return t <= uShadowShape.y ? 1.0 : (1.0 - t) / (1.0 - uShadowShape.y);
    }
    if (uShadowShape.x > 0.5) {
        return sqrt(max(0.0, 1.0 - t * t));
    }
    return 1.0 - t;
}

vec3 shadowWorld(vec2 wxz, vec2 aShape, float scale, out float alpha) {
    float t = aShape.y;
    vec2 perp = vec2(-uShadowDir.y, uShadowDir.x);
    vec2 sxz = wxz + (uShadowDir * t * uShadowSize.x
                    + perp * aShape.x * uShadowSize.y * shadowProfile(t)) * scale;
    alpha = uShadowAlpha * (1.0 - t * 0.7);
    return vec3(sxz.x, groundAt(sxz).r + uShadowSize.z, sxz.y);
}
`;

// Needs FOG_UNIFORMS. Shadows dissolve into the haze instead of tinting.
export const SHADOW_FRAGMENT_FN = `
vec4 shadowFrag(float depth, float alpha) {
    float f = clamp((depth - uFogStart) / (uFogEnd - uFogStart), 0.0, 1.0);
    return vec4(0.0, 0.0, 0.0, alpha * (1.0 - f));
}
`;

export const SHADOW_UNIFORM_NAMES = [
    "uShadow", "uShadowDir", "uShadowSize", "uShadowAlpha", "uShadowShape"
];

const horiz = Math.hypot(MOON.direction[0], MOON.direction[2]);
const SHADOW_DIR = [-MOON.direction[0] / horiz, -MOON.direction[2] / horiz];
const SHAPES = { taper: 0, round: 1, gable: 2 };

export class ShadowPass {
    constructor(gl, picker, aShape, aCell, config) {
        this.config = config;

        // (across, along) pairs, two triangles per segment.
        const strip = [];
        const n = config.segments;
        for (let i = 0; i < n; i++) {
            const t0 = i / n;
            const t1 = (i + 1) / n;
            strip.push(-1, t0, 1, t0, -1, t1, 1, t0, 1, t1, -1, t1);
        }
        this.vertexCount = strip.length / 2;

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(strip), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aShape);
        gl.vertexAttribPointer(aShape, 2, gl.FLOAT, false, 0, 0);
        picker.bind(gl, aCell);
        gl.bindVertexArray(null);
    }

    // Call after the prop's main draw, with its program bound.
    render(gl, u, instanceCount) {
        const c = this.config;
        gl.uniform1f(u.uShadow, 0);
        if (c.opacity <= 0) {
            return;
        }
        gl.uniform1f(u.uShadow, 1);
        gl.uniform2f(u.uShadowDir, SHADOW_DIR[0], SHADOW_DIR[1]);
        gl.uniform3f(u.uShadowSize, c.length, c.width, c.lift);
        gl.uniform1f(u.uShadowAlpha, c.opacity);
        gl.uniform2f(u.uShadowShape, SHAPES[c.shape ?? "taper"], c.body ?? 0.5);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.bindVertexArray(this.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, this.vertexCount, instanceCount);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.uniform1f(u.uShadow, 0);
    }
}
