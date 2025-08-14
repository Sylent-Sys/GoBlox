import './style.css';
import { Renderer } from './Renderer.ts';
import { FpsCamera } from './Camera.ts';
import { VoxelScene } from './Scene.ts';
import { PlayerController } from './Player.ts';
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, PLAYER_SPAWN } from './Constants.ts';
import { debugLog } from './Debug.ts';

const appRoot = document.getElementById('app') ?? document.body;

const width = window.innerWidth;
const height = window.innerHeight;

const renderer = new Renderer(appRoot, width, height);
const camera = new FpsCamera(CAMERA_FOV, width / height, CAMERA_NEAR, CAMERA_FAR);
renderer.scene.add(camera.object);
debugLog('App init: renderer and camera created', { width, height, aspect: width / height });

let voxelScene: VoxelScene;
let player: PlayerController;

const fixed = 1 / 60;
const accumulator = { value: 0 };
let lastTime = performance.now();

async function init() {
  voxelScene = await VoxelScene.create(renderer.scene);
	debugLog('VoxelScene created');
  player = new PlayerController(voxelScene.physics, camera, PLAYER_SPAWN.clone(), renderer.scene);
  player.attachInput(renderer.renderer.domElement);
	debugLog('PlayerController created at spawn', { spawn: PLAYER_SPAWN });

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.setAspect(w / h);
  });

  requestAnimationFrame(loop);
}

function loop(now: number) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  voxelScene.physics.stepSimulation(fixed, 3, accumulator, dt);
  player.update(dt);

  renderer.renderer.render(renderer.scene, camera.camera);
  requestAnimationFrame(loop);
}

init();