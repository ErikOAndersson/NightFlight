// Seed source for the terrain's procedural value noise. The noise itself is
// evaluated per-vertex on the GPU (see Terrain's vertex shader); this class
// just holds the seed and feeds it in as a uniform, and reseeds on demand.
export class ValueNoise {
    constructor(seed = ValueNoise.randomSeed()) {
        this.seed = seed;
    }

    static randomSeed() {
        // A float the shader can offset coordinates by; the fractional range
        // keeps the GPU hash well distributed.
        return Math.random() * 1000;
    }

    reseed(seed = ValueNoise.randomSeed()) {
        this.seed = seed;
    }
}

