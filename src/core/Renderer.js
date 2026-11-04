// Owns the canvas and the WebGL2 context. All projection, rasterization,
// lighting and fog run on the GPU; this class just manages the drawing
// surface and per-frame clears.
export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        const gl = canvas.getContext("webgl2", { antialias: true });
        if (!gl) {
            throw new Error("WebGL2 is not available in this browser.");
        }
        this.gl = gl;
        this.width = 0;
        this.height = 0;

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);

        this.resize();
        window.addEventListener("resize", () => this.resize());
    }

    resize() {
        // Cap DPR so high-density mobile screens don't render at punishing resolutions.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight;
        this.canvas.width = Math.floor(this.width * dpr);
        this.canvas.height = Math.floor(this.height * dpr);
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    // Clears the color and depth buffers at the start of a frame.
    clear() {
        const gl = this.gl;
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
}
