import './style.css';
import { Renderer } from './Renderer.ts';
import { FpsCamera } from './Camera.ts';
import { VoxelScene } from './Scene.ts';
import { PlayerController } from './Player.ts';
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, PLAYER_SPAWN, VOID_FALL_LIMIT_Y } from './Constants.ts';
import { debugLog } from './Debug.ts';
import { BlockType } from './VoxelWorld.ts';
import type { BlockId } from './VoxelWorld.ts';
import { Chicken } from './characters/Chicken.ts';

const appRoot = document.getElementById('app') ?? document.body;

const width = window.innerWidth;
const height = window.innerHeight;

const renderer = new Renderer(appRoot, width, height);
const camera = new FpsCamera(CAMERA_FOV, width / height, CAMERA_NEAR, CAMERA_FAR);
renderer.scene.add(camera.object);
debugLog('App init: renderer and camera created', { width, height, aspect: width / height });

let voxelScene: VoxelScene;
let player: PlayerController;
let isDead = false;
let deathScreenEl: HTMLElement | null = null;
let chickens: Chicken[] = [];

const fixed = 1 / 60;
const accumulator = { value: 0 };
let lastTime = performance.now();

async function init() {
  voxelScene = await VoxelScene.create(renderer.scene);
	debugLog('VoxelScene created');
  chickens = voxelScene.mobs.chickens;
  player = new PlayerController(voxelScene.physics, camera, PLAYER_SPAWN.clone(), renderer.scene);
  player.attachInput(renderer.renderer.domElement);
	debugLog('PlayerController created at spawn', { spawn: PLAYER_SPAWN });
  // Provide references so player can access voxel world for edits
  player.setSceneReferences(renderer.scene, voxelScene.world);

  // Simple UI binding for block selection
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#ui .block-btn'));
  const setActive = (name: keyof typeof BlockType) => {
    buttons.forEach((b) => b.classList.toggle('active', b.dataset.block === name));
    // store on scene for player to read desired block
    (renderer.scene as unknown as { __placeBlock: BlockId }).__placeBlock = BlockType[name] as BlockId;
  };
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = (btn.dataset.block ?? 'Stone') as keyof typeof BlockType;
      setActive(name);
    });
  });
  // default active
  setActive('Stone');

  // Death screen UI
  deathScreenEl = document.getElementById('death-screen');
  const respawnBtn = document.getElementById('respawn-btn') as HTMLButtonElement | null;
  respawnBtn?.addEventListener('click', () => {
    isDead = false;
    deathScreenEl?.classList.remove('visible');
    player.respawn(PLAYER_SPAWN.clone());
  });

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
  if (!isDead) {
    const y = player.getPositionY();
    if (y < VOID_FALL_LIMIT_Y) {
      // trigger death
      isDead = true;
      player.setEnabled(false);
      (document as any).exitPointerLock?.();
      deathScreenEl?.classList.add('visible');
    }
  }

  if (!isDead) {
    player.update(dt);
    // Update chickens
    for (let i = 0; i < chickens.length; i++) chickens[i].update(dt);
  }

  renderer.renderer.render(renderer.scene, camera.camera);
  requestAnimationFrame(loop);
}

init();