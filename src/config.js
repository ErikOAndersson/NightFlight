// Central configuration for the flight simulation. Tweak gameplay and visual
// settings here instead of hunting through the individual modules.

export const CAMERA = {
    orbitRadius: 220,       // distance from the bird
    speed: 48,              // forward units per second (the flight)
    fov: 500,               // focal length in pixels
    elevation: 0.12,        // vertical orbit angle (radians, 0 = level with bird)
    elevationMin: 0.03,     // lowest the camera may drop
    elevationMax: 1.40,     // highest (near straight down)
    near: 1,
    far: 6000,
    pivotStep: Math.PI / 36, // yaw/elevation change per arrow press (5 degrees)
    autoInterval: 10,        // seconds between automatic re-positions
    autoSmoothing: 1.1       // easing rate toward the target angle
};

export const TERRAIN = {
    cols: 340,          // grid samples across (square, centered on the bird)
    rows: 340,          // grid samples deep
    cell: 10,           // world-space spacing between samples
    amplitude: 65,      // starting max hill height  95
    hillDensity: 0.6,   // starting noise frequency multiplier  1.0

    // Live adjustment (keys 1-4).
    densityFactor: 1.15, // multiply/divide per step (more/fewer hills)
    densityMin: 0.3,
    densityMax: 3.0,
    heightStep: 15,      // amplitude change per step
    heightMin: 10,
    heightMax: 240
};

export const TREES = {
    cell: 55,            // spacing of candidate cells
    grid: 48,            // candidate cells per side (centered on the bird)
    threshold: 0.90,     // starting presence cutoff (higher = fewer trees)

    // Live adjustment (keys 5-6).
    thresholdStep: 0.02,
    thresholdMin: 0.60,  // most trees
    thresholdMax: 0.985  // fewest trees
};

export const ROCKS = {
    cell: 48,            // spacing of candidate cells
    grid: 48,            // candidate cells per side (centered on the bird)
    threshold: 0.92,     // presence cutoff (higher = fewer rocks)
    sizeMin: 0.6,        // smallest rock scale
    sizeMax: 1.8         // largest rock scale
};

export const BIRD = {
    altitude: 95         // absolute altitude (camera sits at CAMERA height)
};

export const MOON = {
    // Sky direction (left, up, forward of the initial facing).
    // Normalized in the shader; the moon stays fixed in the sky as you fly.
    direction: [-0.45, 0.33, 0.85],
    size: 0.13           // half-size on screen (NDC)
};

export const FOG = {
    color: [0.090, 0.110, 0.180], // night horizon color
    start: 500,                   // view depth where fog begins
    end: 1600                     // view depth where fog is full
};

export const WATER = {
    level: 10,         // world height of lake surfaces                         10
    halfExtent: 1700,  // half-size of the water plane (covers the view)        1700
    scale: 0.0001,     // lake-mask noise frequency (small = larger lakes)      0.0016
    threshold: 0.66,   // lake-mask cutoff (higher = rarer lakes)               0.66
    edge: 0.06,        // lake-mask fade band                                   0.06
    depthFade: 1       // how quickly shallows fade to the shoreline            16
};
