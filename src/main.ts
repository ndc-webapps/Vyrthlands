import * as THREE from 'three';
import { REACH, WORLD_SIZE_X, WORLD_SIZE_Z, WATER_LEVEL } from './config';
import { Block } from './blocks';
import { World } from './world/world';
import { WorldRenderer } from './world/worldRenderer';
import { Player } from './player';
import { raycastVoxel } from './raycast';
import { Environment } from './environment';
import { HUD } from './ui/hud';
import { saveWorld, loadSave, hasSave, clearSave } from './save';
import { GameMode } from './types';

// ---------- Renderer / scene ----------
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const environment = new Environment(scene);

// Block highlight outline
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
);
highlight.visible = false;
scene.add(highlight);

// ---------- Game state ----------
let world: World | null = null;
let worldRenderer: WorldRenderer | null = null;
let player: Player | null = null;
let mode: GameMode = 'creative';
let health = 1.0;
let running = false;
let paused = false;

const hud = new HUD();

// ---------- DOM ----------
const titleScreen = document.getElementById('title-screen')!;
const pauseMenu = document.getElementById('pause-menu')!;
const btnNew = document.getElementById('btn-new')!;
const btnContinue = document.getElementById('btn-continue')!;
const btnModeCreative = document.getElementById('btn-mode-creative')!;
const btnModeSurvival = document.getElementById('btn-mode-survival')!;
const btnResume = document.getElementById('btn-resume')!;
const btnSave = document.getElementById('btn-save')!;
const btnLoad = document.getElementById('btn-load')!;
const btnNewWorld = document.getElementById('btn-newworld')!;
const btnQuit = document.getElementById('btn-quit')!;

if (hasSave()) btnContinue.classList.remove('hidden');

btnModeCreative.addEventListener('click', () => setTitleMode('creative'));
btnModeSurvival.addEventListener('click', () => setTitleMode('survival'));
function setTitleMode(m: GameMode): void {
  mode = m;
  btnModeCreative.classList.toggle('active', m === 'creative');
  btnModeSurvival.classList.toggle('active', m === 'survival');
}

btnNew.addEventListener('click', () => startGame(true));
btnContinue.addEventListener('click', () => startGame(false));
btnResume.addEventListener('click', () => requestPointerLock());
btnSave.addEventListener('click', () => {
  if (!world || !player) return;
  const ok = saveWorld(world, player, mode);
  hud.toast(ok ? 'World saved' : 'Save failed (storage full?)');
  btnContinue.classList.remove('hidden');
});
btnLoad.addEventListener('click', () => {
  if (hasSave()) {
    startGame(false);
    hud.toast('World loaded');
  } else {
    hud.toast('No saved world found');
  }
});
btnNewWorld.addEventListener('click', () => {
  startGame(true);
  hud.toast('New world generated');
});
btnQuit.addEventListener('click', () => {
  running = false;
  paused = false;
  pauseMenu.classList.add('hidden');
  hud.hide();
  titleScreen.classList.remove('hidden');
  if (hasSave()) btnContinue.classList.remove('hidden');
});

// ---------- Game lifecycle ----------
function startGame(fresh: boolean): void {
  const save = fresh ? null : loadSave();
  const seed = save ? save.seed : (Math.random() * 2 ** 31) | 0;
  if (fresh) clearSave();

  worldRenderer?.dispose();
  world = new World(seed);
  if (save) {
    world.applyEdits(save.edits);
    world.dirtyChunks.clear();
    mode = save.mode;
  }
  worldRenderer = new WorldRenderer(world, scene);
  worldRenderer.buildAll();

  player = new Player(world);
  if (save) {
    player.position.set(save.player.x, save.player.y, save.player.z);
    player.yaw = save.player.yaw;
    player.pitch = save.player.pitch;
  } else {
    player.spawn(Math.floor(WORLD_SIZE_X / 2), Math.floor(WORLD_SIZE_Z / 2));
  }

  health = 1.0;
  hud.setMode(mode);
  hud.setHealth(health);
  hud.show();
  titleScreen.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  running = true;
  paused = false;
  requestPointerLock();
}

// ---------- Pointer lock / pause ----------
function requestPointerLock(): void {
  canvas.requestPointerLock();
}

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!running) return;
  paused = !locked;
  pauseMenu.classList.toggle('hidden', locked);
});

canvas.addEventListener('click', () => {
  if (running && !paused && document.pointerLockElement !== canvas) requestPointerLock();
});

document.addEventListener('mousemove', (e) => {
  if (!running || paused || document.pointerLockElement !== canvas || !player) return;
  player.handleMouseMove(e.movementX, e.movementY);
});

// ---------- Input ----------
document.addEventListener('keydown', (e) => {
  if (!running || paused || !player) return;
  player.keys.add(e.code);
  if (e.code === 'KeyF') player.toggleFly();
  if (e.code.startsWith('Digit')) {
    const n = parseInt(e.code.slice(5), 10);
    if (n >= 1 && n <= 7) hud.select(n - 1);
  }
});
document.addEventListener('keyup', (e) => {
  player?.keys.delete(e.code);
});
window.addEventListener('blur', () => player?.keys.clear());

document.addEventListener('wheel', (e) => {
  if (!running || paused) return;
  hud.scroll(e.deltaY > 0 ? 1 : -1);
});

document.addEventListener('mousedown', (e) => {
  if (!running || paused || document.pointerLockElement !== canvas || !world || !player) return;
  const hit = currentHit;
  if (!hit) return;
  if (e.button === 0) {
    // break
    world.setBlock(hit.block.x, hit.block.y, hit.block.z, Block.Air);
  } else if (e.button === 2) {
    // place
    const px = hit.block.x + hit.normal.x;
    const py = hit.block.y + hit.normal.y;
    const pz = hit.block.z + hit.normal.z;
    if (!world.inBounds(px, py, pz)) return;
    if (player.overlapsBlock(px, py, pz)) return;
    const existing = world.getBlock(px, py, pz);
    if (existing !== Block.Air && existing !== Block.Water) return;
    world.setBlock(px, py, pz, hud.selectedBlock());
  }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- Main loop ----------
const eyePos = new THREE.Vector3();
const lookDir = new THREE.Vector3();
let currentHit: ReturnType<typeof raycastVoxel> = null;
let lastTime = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (!running || !world || !player || !worldRenderer) {
    renderer.render(scene, camera);
    return;
  }

  if (!paused) {
    player.update(dt);
    environment.update(dt);

    // survival placeholder: drowning damage below water, slow regen on land
    if (mode === 'survival') {
      const eyeY = player.position.y + 1.62;
      const inWater = world.getBlock(
        Math.floor(player.position.x), Math.floor(eyeY), Math.floor(player.position.z)
      ) === Block.Water && eyeY < WATER_LEVEL + 1;
      health += inWater ? -0.06 * dt : 0.02 * dt;
      health = Math.max(0, Math.min(1, health));
      hud.setHealth(health);
      if (health <= 0) {
        player.spawn(Math.floor(WORLD_SIZE_X / 2), Math.floor(WORLD_SIZE_Z / 2));
        health = 1.0;
        hud.toast('You drowned! Respawned.');
      }
    }
  }

  // camera follows player
  player.eyePosition(eyePos);
  camera.position.copy(eyePos);
  camera.rotation.set(0, 0, 0, 'YXZ');
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  // block targeting
  player.lookDirection(lookDir);
  currentHit = raycastVoxel(world, eyePos, lookDir, REACH);
  if (currentHit) {
    highlight.visible = true;
    highlight.position.set(
      currentHit.block.x + 0.5, currentHit.block.y + 0.5, currentHit.block.z + 0.5
    );
  } else {
    highlight.visible = false;
  }

  worldRenderer.update();
  renderer.render(scene, camera);
}

requestAnimationFrame(frame);

// Dev-only hook for automated testing (not included in production builds)
if (import.meta.env.DEV) {
  (window as any).__bw = {
    get world() { return world; },
    get player() { return player; },
    get hit() { return currentHit; },
  };
}
