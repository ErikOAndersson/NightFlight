// Chooses which candidate cells around the bird hold an instance, so props are
// drawn only where present instead of collapsing thousands of empty cells on
// the GPU. Re-picks only when the grid snaps or the inputs change; ground
// height, jitter, size and rotation stay in the vertex shaders.
export class CellPicker {
    constructor(gl, grid, salt) {
        this.grid = grid;
        this.salt = salt;
        this.count = 0;
        this.key = "";
        this.ids = new Float32Array(grid * grid * 2);
        this.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.ids.byteLength, gl.DYNAMIC_DRAW);
    }

    // Binds the picked cell ids as a per-instance vec2 attribute (current VAO).
    bind(gl, location) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(location, 1);
    }

    update(gl, centerX, centerZ, cell, threshold, seed) {
        const sx = Math.floor(centerX / cell);
        const sz = Math.floor(centerZ / cell);
        const key = `${sx},${sz},${cell},${threshold},${seed}`;
        if (key === this.key) {
            return;
        }
        this.key = key;

        const g = this.grid;
        const seedInt = Math.floor(seed * 1000);
        let n = 0;
        for (let j = 0; j < g; j++) {
            for (let i = 0; i < g; i++) {
                const x = sx + i - g / 2;
                const z = sz + j - g / 2;
                if (cellHash(x, z, seedInt, this.salt) >= threshold) {
                    this.ids[n++] = x;
                    this.ids[n++] = z;
                }
            }
        }
        this.count = n / 2;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.ids, 0, n);
    }
}

// Integer hash of a cell to [0, 1).
function cellHash(x, z, seed, salt) {
    let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1) ^ salt;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}
