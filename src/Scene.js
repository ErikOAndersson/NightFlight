import { Camera } from "./core/Camera.js";
import { ValueNoise } from "./world/Noise.js";
import { Sky } from "./world/Sky.js";
import { Moon } from "./entities/Moon.js";
import { Terrain } from "./world/Terrain.js";
import { Water } from "./entities/Water.js";
import { Trees } from "./entities/Trees.js";
import { Rocks } from "./entities/Rocks.js";
import { Bird } from "./entities/Bird.js";
import { CAMERA, TERRAIN, TREES } from "./config.js";

// Owns the world contents (camera, sky, terrain, bird) and draws them each
// frame through the GPU renderer. The bird flies forward; the camera orbits it.
export class Scene {
    constructor(renderer) {
        this.noise = new ValueNoise();
        this.camera = new Camera();
        this.sky = new Sky(renderer);
        this.moon = new Moon(renderer);
        this.terrain = new Terrain(renderer, this.noise);
        this.water = new Water(renderer);
        this.trees = new Trees(renderer);
        this.rocks = new Rocks(renderer);
        this.bird = new Bird(renderer);

        // The bird's horizontal world position (it flies along +z).
        this.birdX = 0;
        this.birdZ = 0;

        // Automatic camera re-positioning.
        this.autoCamera = true;
        this.autoTimer = 0;
    }

    update(dt) {
        this.birdZ += this.camera.speed * dt; // the bird flies forward

        // Every so often, pick a new random heading and a moderate elevation.
        this.autoTimer += dt;
        if (this.autoCamera && this.autoTimer >= CAMERA.autoInterval) {
            this.autoTimer = 0;
            const yaw = this.camera.targetYaw + (Math.random() * 2 - 1) * Math.PI;
            const elevation = CAMERA.autoElevationMin +
                Math.random() * (CAMERA.autoElevationMax - CAMERA.autoElevationMin);
            this.camera.setTarget(yaw, elevation);
        }

        this.camera.update(dt); // ease toward the current target
    }

    // New random world; restart the flight at the origin.
    regenerate() {
        this.noise.reseed();
        this.birdZ = 0;
    }

    // Pivot the camera around the bird in 5-degree steps. Manual input also
    // postpones the next automatic move.
    pivotLeft() {
        this.camera.pivot(CAMERA.pivotStep);
        this.autoTimer = 0;
    }

    pivotRight() {
        this.camera.pivot(-CAMERA.pivotStep);
        this.autoTimer = 0;
    }

    pivotUp() {
        this.camera.pivotVertical(CAMERA.pivotStep);
        this.autoTimer = 0;
    }

    pivotDown() {
        this.camera.pivotVertical(-CAMERA.pivotStep);
        this.autoTimer = 0;
    }

    // Toggle the automatic camera re-positioning.
    toggleAutoCamera() {
        this.autoCamera = !this.autoCamera;
        this.autoTimer = 0;
    }

    // Toggle the terrain edge lines (wireframe overlay).
    toggleEdges() {
        this.terrain.showEdges = !this.terrain.showEdges;
    }

    // Fewer / more hills via the noise frequency.
    fewerHills() {
        this.terrain.hillDensity = Math.max(
            TERRAIN.densityMin, this.terrain.hillDensity / TERRAIN.densityFactor);
    }

    moreHills() {
        this.terrain.hillDensity = Math.min(
            TERRAIN.densityMax, this.terrain.hillDensity * TERRAIN.densityFactor);
    }

    // Lower / raise the maximum hill height.
    lowerHills() {
        this.terrain.amplitude = Math.max(
            TERRAIN.heightMin, this.terrain.amplitude - TERRAIN.heightStep);
    }

    raiseHills() {
        this.terrain.amplitude = Math.min(
            TERRAIN.heightMax, this.terrain.amplitude + TERRAIN.heightStep);
    }

    // Fewer / more trees (a higher threshold means fewer pass).
    fewerTrees() {
        this.trees.threshold = Math.min(
            TREES.thresholdMax, this.trees.threshold + TREES.thresholdStep);
    }

    moreTrees() {
        this.trees.threshold = Math.max(
            TREES.thresholdMin, this.trees.threshold - TREES.thresholdStep);
    }

    render(renderer, time) {
        const bx = this.birdX;
        const bz = this.birdZ;
        this.camera.orbit(bx, this.bird.altitude, bz);

        renderer.clear();
        this.sky.render(renderer);
        this.moon.render(renderer, this.camera);
        this.terrain.render(renderer, this.camera, bx, bz);
        this.water.render(renderer, this.camera, bx, bz, this.terrain, time);
        this.trees.render(renderer, this.camera, bx, bz, this.terrain);
        this.rocks.render(renderer, this.camera, bx, bz, this.terrain);
        this.bird.render(renderer, this.camera, bx, bz, time);
    }
}
