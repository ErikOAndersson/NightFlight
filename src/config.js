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
    autoSmoothing: 1.1,      // easing rate toward the target angle
    autoElevationMin: 0.05,  // lowest elevation the auto-camera picks
    autoElevationMax: 0.6    // highest (keeps auto moves off steep top-down views)
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
    heightMax: 240,

    // World-space colour variation on the ground.
    detail: {
        strength: 0.22,   // brightness swing (0 = off)
        patchScale: 90,   // world units per large soft patch
        speckleScale: 14, // world units per fine speckle
        fadeStart: 400,   // depth where detail starts fading out
        fadeEnd: 1500     // depth where it is gone (keeps the distance calm)
    }
};

export const TREES = {
    cell: 55,            // spacing of candidate cells
    grid: 48,            // candidate cells per side (centered on the bird)
    threshold: 0.90,     // starting presence cutoff (higher = fewer trees)

    // Live adjustment (keys 5-6).
    thresholdStep: 0.02,
    thresholdMin: 0.60,  // most trees
    thresholdMax: 0.985, // fewest trees

    // Cheap fake shadow: a tapered strip on the ground pointing away from the moon.
    shadow: {
        shape: "taper",  // outline: "taper" | "round" | "gable" (see core/Shadow.js)
        opacity: 0.4,    // darkest alpha, at the trunk (0 = off)
        length: 60,      // world units at tree scale 1
        width: 7,        // half-width at the trunk, world units at scale 1
        segments: 8,     // strip subdivisions so it follows the terrain
        lift: 0.8        // height above the ground to avoid z-fighting
    }
};

export const ROCKS = {
    cell: 48,            // spacing of candidate cells
    grid: 48,            // candidate cells per side (centered on the bird)
    threshold: 0.92,     // presence cutoff (higher = fewer rocks)
    sizeMin: 0.6,        // smallest rock scale
    sizeMax: 1.8,        // largest rock scale
    // Rounded blob (half-oval) rather than the trees' taper; per size 1.
    shadow: { shape: "round", opacity: 0.4, length: 14, width: 5, segments: 8, lift: 0.5 }
};

export const HOUSES = {
    cell: 320,           // spacing of candidate cells (houses are rare landmarks)
    grid: 10,            // candidate cells per side (stays inside the ground lookup)
    threshold: 0.80,     // presence cutoff (higher = fewer houses)
    scale: 4,            // world units per model unit (model ~7.5 tall, ~12 wide)
    wallColor: [0.50, 0.09, 0.09], // faces without a material override
    // Box walls then a pointed roof gable; body = full-width fraction of the
    // length (keep body * segments whole so the corner lands on a vertex).
    shadow: { shape: "gable", body: 0.6, opacity: 0.4, length: 80, width: 22, segments: 10, lift: 0.8 }
};

export const BIRD = {
    altitude: 95,        // absolute altitude (camera sits at CAMERA height)
    scale: 6,            // multiplier applied to the imported model (model span ~15)
    flap: 20             // wing-tip vertical travel at full flap
};

export const MOON = {
    // Sky direction (left, up, forward of the initial facing).
    // Normalized in the shader; the moon stays fixed in the sky as you fly.
    direction: [-0.45, 0.33, 0.85],
    size: 0.20           // half-size on screen (NDC)   13
};

export const FOG = {
    color: [0.090, 0.110, 0.180], // night horizon color
    start: 500,                   // view depth where fog begins
    end: 1600                     // view depth where fog is full
};

export const WATER = {
    level: 10,         // world height of the lake surface
    floor: -16,        // carved basin floor (well below the surface)
    halfExtent: 1700,  // half-size of the water plane (covers the view)
    scale: 0.0013,     // lake-mask noise frequency (smaller = larger, rarer lakes)
    threshold: 0.70,   // lake-mask cutoff (higher = rarer lakes)
    edge: 0.02,        // lake-mask shore band (larger = gentler shores)        0.12
    depthFade: 16,     // how quickly shallows fade to the shoreline
    rippleStrength: 0.12, // surface normal tilt (wider, more broken moon path)
    rippleSpeed: 1.2,     // how fast the facets rock
    facetSize: 5,         // world size of a ripple facet (bigger = blockier glints)
    glintSharpness: 400,  // tight moon highlight exponent
    glintStrength: 1.6,
    farSharpness: 160,    // glint exponent where facets have faded (distant water)
    farStrength: 0.45,    // glint brightness factor for distant water
    sheenSharpness: 18,   // broad moonlit sheen exponent
    sheenStrength: 0.12
};

export const SKY = {
    // Horizontal angle (radians) one copy of the image covers; smaller values
    // magnify the stars and reduce the squeezed "fisheye" look (mirrored beyond).
    coverage: Math.PI,   // Math.PI
    imageAspect: 4,   // image width / height
    horizon: 0.0,     // image height fraction (0 = bottom edge) at the horizon
    // The image's top edge always lands at the zenith (no vertical repeat).
    // 1 = true cylinder proportions at the horizon but smeared stars up high;
    // lower stretches the low sky a little to keep the upper sky sharp.
    verticalScale: 0.8,
    heading: 0,       // panorama rotation around the vertical axis (radians)
    brightness: 1.0
};
