import { Renderer } from "./core/Renderer.js";
import { Scene } from "./Scene.js";

// Entry point: wire up the renderer and scene, run the animation loop, and
// regenerate the world on key press.
const canvas = document.getElementById("scene");
const renderer = new Renderer(canvas);
const scene = new Scene(renderer);

let last = performance.now();
let clock = last / 1000;
function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    scene.update(dt);
    if (!scene.paused) clock += dt; // animation time freezes while paused
    scene.render(renderer, clock);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener("keydown", (e) => {
    switch (e.key.toLowerCase()) {
        case " ":
            scene.togglePause();
            e.preventDefault();
            break;
        case "r":
            scene.regenerate();
            break;
        case "g":
            scene.toggleEdges();
            break;
        case "c":
            scene.toggleAutoCamera();
            break;
        case "m": {
            const help = document.getElementById("help");
            help.style.display = help.style.display === "none" ? "block" : "none";
            break;
        }
        case "1":
            scene.fewerHills();
            break;
        case "2":
            scene.moreHills();
            break;
        case "3":
            scene.lowerHills();
            break;
        case "4":
            scene.raiseHills();
            break;
        case "5":
            scene.fewerTrees();
            break;
        case "6":
            scene.moreTrees();
            break;
        case "arrowleft":
            scene.pivotLeft();
            e.preventDefault();
            break;
        case "arrowright":
            scene.pivotRight();
            e.preventDefault();
            break;
        case "arrowup":
            scene.pivotUp();
            e.preventDefault();
            break;
        case "arrowdown":
            scene.pivotDown();
            e.preventDefault();
            break;
    }
});
