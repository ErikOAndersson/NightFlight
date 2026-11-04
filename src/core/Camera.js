// A camera that orbits a target (the bird) on a sphere — yaw (horizontal) and
// elevation (vertical) — always aiming at it, so the bird stays centered at any
// angle. The projection pitch is just -elevation, so the GPU vertex shaders
// reproduce the pinhole projection from the scalars exposed here.
import { CAMERA } from "../config.js";

export class Camera {
    constructor() {
        // Eye position in world space (recomputed each frame by orbit()).
        this.x = 0;
        this.y = 0;
        this.z = 0;

        this.orbitRadius = CAMERA.orbitRadius;
        this.yaw = 0;                      // heading around the target (radians)
        this.elevation = CAMERA.elevation; // vertical orbit angle (radians)
        this.targetYaw = 0;                // eased toward each frame
        this.targetElevation = CAMERA.elevation;
        this.speed = CAMERA.speed;
        this.fov = CAMERA.fov;
        this.near = CAMERA.near;
        this.far = CAMERA.far;
    }

    // Eases the current yaw/elevation toward their targets (frame-rate aware).
    update(dt) {
        const f = 1 - Math.exp(-dt * CAMERA.autoSmoothing);
        this.yaw += (this.targetYaw - this.yaw) * f;
        this.elevation += (this.targetElevation - this.elevation) * f;
    }

    // Places the eye on a sphere around the target, looking inward, so the
    // target stays centered at any yaw/elevation.
    orbit(targetX, targetY, targetZ) {
        const r = this.orbitRadius;
        const cosE = Math.cos(this.elevation);
        const sinE = Math.sin(this.elevation);
        this.x = targetX - Math.sin(this.yaw) * r * cosE;
        this.y = targetY + r * sinE;
        this.z = targetZ - Math.cos(this.yaw) * r * cosE;
    }

    // Nudges the horizontal target; the camera eases toward it.
    pivot(deltaRadians) {
        this.targetYaw += deltaRadians;
    }

    // Nudges the vertical target, clamped above the ground and below
    // straight-down.
    pivotVertical(deltaRadians) {
        this.targetElevation = Camera._clampElevation(this.targetElevation + deltaRadians);
    }

    // Jumps the target to a new absolute heading/elevation (auto positioning).
    setTarget(yaw, elevation) {
        this.targetYaw = yaw;
        this.targetElevation = Camera._clampElevation(elevation);
    }

    static _clampElevation(e) {
        return Math.max(CAMERA.elevationMin, Math.min(CAMERA.elevationMax, e));
    }

    get cos() {
        return Math.cos(this.elevation); // cos(pitch), pitch = -elevation
    }

    get sin() {
        return -Math.sin(this.elevation); // sin(pitch), pitch = -elevation
    }

    get yawCos() {
        return Math.cos(this.yaw);
    }

    get yawSin() {
        return Math.sin(this.yaw);
    }

    // Per-axis NDC scale factors derived from the focal length and viewport,
    // so the field of view matches the original CSS-pixel-based projection.
    scaleX(renderer) {
        return (2 * this.fov) / renderer.width;
    }

    scaleY(renderer) {
        return (2 * this.fov) / renderer.height;
    }
}



