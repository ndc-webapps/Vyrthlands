import * as THREE from 'three';
import {
  REACH, WORLD_SIZES, RENDER_DISTANCES, WorldSizeKey, RenderDistanceKey,
  CREATIVE_BREAK_REPEAT, PLACE_REPEAT,
} from './config';
import { Block, BLOCKS } from './blocks';
import { buildAtlas } from './textures';
import { World } from './world/world';
import { WorldRenderer } from './world/worldRenderer';
import { GENERATORS, WorldType } from './world/generators';
import { Player } from './player';
import { raycastVoxel } from './raycast';
import { Environment } from './environment';
import { ViewModel } from './viewmodel';
import { HUD } from './ui/hud';
import { InventoryUI } from './ui/inventoryUI';
import { Inventory } from './inventory';
import { breakInfo, dropFor, itemName, isPlaceable, ITEMS, Item } from './items';
import { Station } from './crafting';
import { ROLES, RoleId, computeStats, PlayerStats } from './roles';
import { MobManager } from './mobs';
import { ProjectileManager } from './projectiles';
import { ActiveEffects, ROLE_SKILLS, SKILLS, SkillContext } from './skills';
import { saveWorld, loadSave, hasSave, clearSave } from './save';
import { GameMode } from './types';
import { AuthStore } from './auth';

// ---------- Renderer / scene ----------
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 600);
scene.add(camera); // needed so the first-person view model (a camera child) renders

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const atlas = buildAtlas();
const environment = new Environment(scene);
const viewModel = new ViewModel(camera, atlas);
const mobs = new MobManager(scene);
const projectiles = new ProjectileManager(scene);
viewModel.setVisible(false);

const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55 })
);
highlight.visible = false;
scene.add(highlight);

// ---------- Game state ----------
let world: World | null = null;
let worldRenderer: WorldRenderer | null = null;
let player: Player | null = null;
let inventory: Inventory | null = null;
let mode: GameMode = 'creative';
let role: RoleId = 'swordsman';
let stats: PlayerStats = computeStats(role);
let worldType: WorldType = 'natural';
let worldSize: WorldSizeKey = 'medium';
let renderDistance: RenderDistanceKey = 'normal';
let health = 1.0;
let mana = 1.0;
let spawnPoint: { x: number; z: number } | null = null;
let running = false;
let paused = false;
let uiOpen = false;
const effects: ActiveEffects = { invulnT: 0, shieldT: 0, regenBoostT: 0, speedT: 0 };
let skillCooldowns = [0, 0];
let meleeCooldown = 0;

const hud = new HUD(atlas);
const invUI = new InventoryUI(atlas);
const auth = new AuthStore();
hud.onSelect = (itemId) => viewModel.setHeldBlock(itemId && itemId < 100 ? itemId : Block.Air);

invUI.onClose = () => {
  uiOpen = false;
  if (running) requestPointerLock();
};
invUI.onCraft = (recipe) => {
  hud.toast(`Crafted ${itemName(recipe.output.item)}`);
};
mobs.onPlayerHit = (dmg) => {
  if (mode === 'survival') applyDamage(dmg);
};
mobs.onDeath = (_pos, loot) => {
  if (!inventory || mode !== 'survival') return;
  const left = inventory.add(loot, 1);
  hud.toast(left ? 'Bag full!' : `+1 ${itemName(loot)}`);
};

// ---------- DOM ----------
const landingPage = document.getElementById('landing-page')!;
const btnStartAdventure = document.getElementById('btn-start-adventure')!;
const btnStartAdventureCTA = document.getElementById('btn-start-adventure-cta')!;
const btnExploreRealms = document.getElementById('btn-explore-realms')!;
const btnLandingContinue = document.getElementById('btn-landing-continue')!;
const btnNavLogin = document.getElementById('landing-login')!;
const btnNavCreate = document.getElementById('landing-create')!;
const loginModal = document.getElementById('login-modal')!;
const loginClose = document.getElementById('login-close')!;
const loginSubmit = document.getElementById('login-submit')!;
const loginCreate = document.getElementById('login-create')!;
const loginForgot = document.getElementById('login-forgot')!;
const loginGuest = document.getElementById('login-guest')!;
const titleScreen = document.getElementById('title-screen')!;
const btnBackLanding = document.getElementById('btn-back-landing')!;
const pauseMenu = document.getElementById('pause-menu')!;
const pauseSeedEl = document.getElementById('pause-seed')!;
const btnNew = document.getElementById('btn-new')!;
const btnContinue = document.getElementById('btn-continue')!;
const btnModeCreative = document.getElementById('btn-mode-creative')!;
const btnModeSurvival = document.getElementById('btn-mode-survival')!;
const btnResume = document.getElementById('btn-resume')!;
const btnSave = document.getElementById('btn-save')!;
const btnLoad = document.getElementById('btn-load')!;
const btnQuit = document.getElementById('btn-quit')!;
const seedInput = document.getElementById('seed-input') as HTMLInputElement;
const btnSeedRandom = document.getElementById('btn-seed-random')!;
const worldTypeDesc = document.getElementById('world-type-desc')!;
const roleDesc = document.getElementById('role-desc')!;

interface WorldInfo { desc: string; danger: string; enemies: string; resource: string; hint: string; roles: RoleId[]; }
const WORLD_INFOS: Record<WorldType, WorldInfo> = {
  natural: info('Hills, forests, beaches, and floating crystal islands.', 'Low', 'Gloomlings at night', 'Sky Crystal', 'Build and explore.', ['swordsman', 'wizard']),
  flat: info('Empty grassland for fast building.', 'Low', 'Light roaming threats', 'Basic blocks', 'Creative sandbox.', ['swordsman']),
  prehistoric: info('Jungle, plains, swamp, fossils, nests, and lava scars.', 'High at night', 'Raptors, predators', 'Amber Resin', 'Swordsman-friendly survival.', ['swordsman', 'healer']),
  battlefront: info('Muddy hills, trenches, roads, bunkers, broken houses.', 'Medium', 'Soldiers, scouts, spies', 'Fuel Cell', 'Gunner-friendly combat.', ['gunner', 'assassin']),
  zombie: info('Abandoned roads, ruined suburbs, hospitals, warehouses.', 'High at night', 'Walkers, runners, infected', 'Med Scrap', 'Healer helps long survival.', ['healer', 'gunner']),
  medieval: info('Castles, villages, farms, towers, ruins, dungeon crystals.', 'Medium', 'Bandits, goblins, skeleton knights', 'Magic Crystal', 'Swordsman/Wizard/Healer.', ['swordsman', 'wizard', 'healer']),
  cyberpunk: info('Neon towers, alleys, labs, factories, tech sectors.', 'Medium-high', 'Robots, drones, cyber soldiers', 'Energy Core', 'Gunner/Assassin shine.', ['gunner', 'assassin', 'wizard']),
  alien: info('Strange terrain, alien plants, meteor stone, toxic waters.', 'High', 'Aliens, worms, parasites', 'Alien Crystal', 'Low-gravity hooks later.', ['gunner', 'wizard', 'swordsman']),
  skyislands: info('Floating islands, cloud ruins, fall danger.', 'Medium', 'Wind spirits, sky beasts', 'Sky Crystal', 'Bridge and airship play.', ['assassin', 'wizard', 'gunner']),
  underworld: info('Lava rivers, black stone, fire caverns.', 'Very high', 'Demons, lava beasts', 'Hellstone', 'Late-game mining.', ['swordsman', 'healer', 'wizard']),
  frozen: info('Snow fields, glaciers, ice villages.', 'Medium', 'Wolves, frost stalkers', 'Frost Crystal', 'Cold systems later.', ['swordsman', 'healer', 'wizard']),
  pirate: info('Tropical islands, reefs, treasure caves.', 'Medium', 'Raiders, cursed sailors', 'Pearl', 'Treasure routes.', ['gunner', 'assassin', 'swordsman']),
  haunted: info('Fog, dead forests, graveyards, cursed cottages.', 'High at night', 'Ghosts, witches, shadows', 'Soul Shard', 'Assassin/Wizard map.', ['wizard', 'healer', 'assassin']),
  wasteland: info('Ruined modern zones, scrap fields, toxic scars.', 'High', 'Mutants, raiders, machines', 'Scrap Iron', 'Scavenge and craft.', ['gunner', 'healer', 'assassin']),
  mythology: info('Temple lands, divine ruins, guardian arenas.', 'High', 'Guardians, beasts, titans', 'Ancient Relic', 'Boss temple hooks later.', ['wizard', 'swordsman', 'healer']),
};
function info(desc: string, danger: string, enemies: string, resource: string, hint: string, roles: RoleId[]): WorldInfo {
  return { desc, danger, enemies, resource, hint, roles };
}
function worldInfoText(type: WorldType): string {
  const w = WORLD_INFOS[type];
  return `${w.desc} Danger: ${w.danger}. Enemies: ${w.enemies}. Resource: ${w.resource}. Roles: ${w.roles.map((r) => ROLES[r].name).join(', ')}. ${w.hint}`;
}

function wireOptionRow(rowId: string, dataKey: string, onPick: (value: string) => void): void {
  const row = document.getElementById(rowId)!;
  row.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      row.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onPick(btn.dataset[dataKey]!);
    });
  });
}

wireOptionRow('world-type-row', 'type', (v) => {
  worldType = v as WorldType;
  worldTypeDesc.textContent = worldInfoText(worldType);
});
wireOptionRow('world-size-row', 'size', (v) => { worldSize = v as WorldSizeKey; });
wireOptionRow('render-dist-row', 'rd', (v) => { renderDistance = v as RenderDistanceKey; });
wireOptionRow('role-row', 'role', (v) => {
  role = v as RoleId;
  roleDesc.textContent = ROLES[role].desc;
});

if (hasSave()) {
  btnContinue.classList.remove('hidden');
  btnLandingContinue.classList.remove('hidden');
}

function showLanding(): void {
  landingPage.classList.remove('hidden');
  titleScreen.classList.add('hidden');
  pauseMenu.classList.add('hidden');
}

function showWorldSelect(): void {
  landingPage.classList.add('hidden');
  titleScreen.classList.remove('hidden');
  pauseMenu.classList.add('hidden');
}

function openLogin(): void { loginModal.classList.remove('hidden'); }
function closeLogin(): void { loginModal.classList.add('hidden'); }

btnStartAdventure.addEventListener('click', showWorldSelect);
btnStartAdventureCTA.addEventListener('click', showWorldSelect);
btnExploreRealms.addEventListener('click', () => {
  document.getElementById('worlds')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
btnBackLanding.addEventListener('click', showLanding);
btnLandingContinue.addEventListener('click', () => {
  if (hasSave()) startGame(false);
  else hud.toast('No saved world found');
});
btnNavLogin.addEventListener('click', openLogin);
btnNavCreate.addEventListener('click', openLogin);
loginClose.addEventListener('click', closeLogin);
loginSubmit.addEventListener('click', () => {
  auth.loginPlaceholder();
  hud.toast('Account system coming soon');
});
loginCreate.addEventListener('click', () => hud.toast('Account creation coming soon'));
loginForgot.addEventListener('click', () => hud.toast('Password recovery coming soon'));
loginGuest.addEventListener('click', () => {
  auth.continueAsGuest();
  closeLogin();
});

btnModeCreative.addEventListener('click', () => setTitleMode('creative'));
btnModeSurvival.addEventListener('click', () => setTitleMode('survival'));
function setTitleMode(m: GameMode): void {
  mode = m;
  btnModeCreative.classList.toggle('active', m === 'creative');
  btnModeSurvival.classList.toggle('active', m === 'survival');
}

btnSeedRandom.addEventListener('click', () => {
  seedInput.value = String((Math.random() * 2 ** 31) | 0);
});

function parseSeed(text: string): number {
  const t = text.trim();
  if (t === '') return (Math.random() * 2 ** 31) | 0;
  const n = Number(t);
  if (Number.isFinite(n)) return n | 0;
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

btnNew.addEventListener('click', () => startGame(true));
btnContinue.addEventListener('click', () => startGame(false));
btnResume.addEventListener('click', () => requestPointerLock());
btnSave.addEventListener('click', doSave);
btnLoad.addEventListener('click', () => {
  if (hasSave()) {
    startGame(false);
    hud.toast('World loaded');
  } else {
    hud.toast('No saved world found');
  }
});
btnQuit.addEventListener('click', () => {
  running = false;
  paused = false;
  uiOpen = false;
  pauseMenu.classList.add('hidden');
  hud.hide();
  viewModel.setVisible(false);
  titleScreen.classList.add('hidden');
  landingPage.classList.remove('hidden');
  if (hasSave()) {
    btnContinue.classList.remove('hidden');
    btnLandingContinue.classList.remove('hidden');
  }
});

function doSave(): void {
  if (!world || !player || !inventory) return;
  const ok = saveWorld(world, player, mode, worldType, worldSize, renderDistance, {
    role,
    health,
    mana,
    spawn: spawnPoint,
    timeOfDay: environment.getTime(),
    inventory: inventory.serialize(),
  });
  hud.toast(ok ? 'World saved' : 'Save failed (storage full?)');
  btnContinue.classList.remove('hidden');
  btnLandingContinue.classList.remove('hidden');
}

// ---------- Game lifecycle ----------
function startGame(fresh: boolean): void {
  const save = fresh ? null : loadSave();
  const seed = save ? save.seed : parseSeed(seedInput.value);
  if (fresh) clearSave();
  if (save) {
    worldType = (save.worldType as string) === 'war' ? 'battlefront' : GENERATORS[save.worldType] ? save.worldType : 'natural';
    worldSize = save.worldSize;
    renderDistance = save.renderDistance;
    mode = save.mode;
    role = save.role;
  }
  stats = computeStats(role);
  effects.invulnT = 0;
  effects.shieldT = 0;
  effects.regenBoostT = 0;
  effects.speedT = 0;
  skillCooldowns = [0, 0];
  meleeCooldown = 0;
  mobs.clear();
  projectiles.clear();

  worldRenderer?.dispose();
  world = new World(seed, GENERATORS[worldType], WORLD_SIZES[worldSize]);
  mobs.setWorld(worldType);
  if (save) world.applyEdits(save.edits);

  const rd = RENDER_DISTANCES[renderDistance];
  worldRenderer = new WorldRenderer(world, scene, atlas, rd);
  environment.setup(worldType, rd);
  environment.setTime(save ? save.timeOfDay : 0.3);
  camera.far = rd * 16 * 1.6;
  camera.updateProjectionMatrix();

  inventory = new Inventory(mode === 'creative');
  if (save) {
    inventory.load(save.inventory);
  } else if (mode === 'survival') {
    for (const it of ROLES[role].startItems) inventory.add(it.item, it.count, it.durability);
  }
  hud.bind(inventory);
  invUI.bind(inventory, ROLES[role], stats);

  player = new Player(world);
  player.speedMult = stats.speedMult;
  if (save) {
    player.position.set(save.player.x, save.player.y, save.player.z);
    player.yaw = save.player.yaw;
    player.pitch = save.player.pitch;
    spawnPoint = save.spawn;
    health = save.health;
    mana = save.mana;
  } else {
    const sp = world.findSpawn();
    player.spawn(sp.x, sp.z);
    spawnPoint = null;
    health = 1.0;
    mana = 1.0;
  }
  worldRenderer.buildInitial(player.position.x, player.position.z);

  hud.setMode(mode, ROLES[role].name);
  hud.setSkills(ROLE_SKILLS[role].map((id) => SKILLS[id]), true);
  updateSkillHud();
  hud.setHealth(health);
  hud.setMana(mana);
  hud.show();
  hud.select(inventory.selected);
  viewModel.setVisible(true);
  pauseSeedEl.textContent = `${GENERATORS[worldType].name} · ${ROLES[role].name} · seed ${seed}`;
  titleScreen.classList.add('hidden');
  landingPage.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (invUI.isOpen()) invUI.close();
  running = true;
  paused = false;
  uiOpen = false;
  requestPointerLock();
}

function respawn(): void {
  if (!world || !player) return;
  const sp = spawnPoint ?? world.findSpawn();
  player.spawn(sp.x, sp.z);
  health = 1.0;
  mana = 1.0;
  hud.setHealth(health);
  hud.setMana(mana);
}

// ---------- Pointer lock / pause / UI ----------
function requestPointerLock(): void {
  canvas.requestPointerLock();
}

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!running) return;
  if (uiOpen) return; // inventory overlay manages its own state
  paused = !locked;
  pauseMenu.classList.toggle('hidden', locked);
  if (paused) {
    mouseButtons.clear();
    breakProgress = 0;
    hud.setBreakProgress(0);
  }
});

canvas.addEventListener('click', () => {
  if (running && !paused && !uiOpen && document.pointerLockElement !== canvas) requestPointerLock();
});

document.addEventListener('mousemove', (e) => {
  if (!running || paused || uiOpen || document.pointerLockElement !== canvas || !player) return;
  player.handleMouseMove(e.movementX, e.movementY);
});

function openUI(tab: 'backpack' | 'crafting' | 'character', station: Station = 'none'): void {
  uiOpen = true;
  mouseButtons.clear();
  player?.keys.clear();
  invUI.open(tab, station);
  document.exitPointerLock();
}

// ---------- Input ----------
document.addEventListener('keydown', (e) => {
  if (!running) return;
  if (uiOpen) {
    if (e.code === 'KeyB' || e.code === 'Escape' || e.code === 'KeyC' || e.code === 'KeyK') {
      invUI.close();
      e.preventDefault();
    }
    return;
  }
  if (paused || !player) return;
  if (e.code === 'KeyB') { openUI('backpack'); return; }
  if (e.code === 'KeyC') { openUI('crafting', 'none'); return; }
  if (e.code === 'KeyK') { openUI('character'); return; }
  if (e.code === 'KeyQ') { castSkill(0); e.preventDefault(); return; }
  if (e.code === 'KeyE' || e.code === 'KeyR') { castSkill(1); e.preventDefault(); return; }
  player.keys.add(e.code);
  if (e.code === 'KeyF') player.toggleFly();
  if (e.code.startsWith('Digit')) {
    hud.selectDigit(parseInt(e.code.slice(5), 10));
  }
});
document.addEventListener('keyup', (e) => {
  player?.keys.delete(e.code);
});
window.addEventListener('blur', () => {
  player?.keys.clear();
  mouseButtons.clear();
});

document.addEventListener('wheel', (e) => {
  if (!running || paused || uiOpen) return;
  hud.scroll(e.deltaY > 0 ? 1 : -1);
});

// Held mouse buttons → continuous break / place
const mouseButtons = new Set<number>();
let breakProgress = 0;
let breakTarget = '';
let breakCooldown = 0;
let placeCooldown = 0;

document.addEventListener('mousedown', (e) => {
  if (!running || paused || uiOpen || document.pointerLockElement !== canvas) return;
  mouseButtons.add(e.button);
  if (e.button === 0 && mode === 'survival' && tryAttackMob()) {
    mouseButtons.delete(0);
    return;
  }
  if (e.button === 0 && mode === 'creative') breakCooldown = 0;
  if (e.button === 2) {
    placeCooldown = 0;
    // interact with stations / bed takes priority over placing
    if (currentHit && world) {
      const target = world.getBlock(currentHit.block.x, currentHit.block.y, currentHit.block.z);
      if (BLOCKS[target]?.interactable) {
        interactWith(target, currentHit.block);
        mouseButtons.delete(2);
      }
    }
  }
});
document.addEventListener('mouseup', (e) => {
  mouseButtons.delete(e.button);
  if (e.button === 0) {
    breakProgress = 0;
    hud.setBreakProgress(0);
  }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

function interactWith(blockId: number, pos: { x: number; y: number; z: number }): void {
  if (blockId === Block.Workbench) {
    openUI('crafting', 'workbench');
  } else if (blockId === Block.Smelter) {
    openUI('crafting', 'smelter');
  } else if (blockId === Block.Bed) {
    spawnPoint = { x: pos.x, z: pos.z };
    if (environment.isNight()) {
      environment.skipToMorning();
      hud.toast('You slept until morning. Spawn point set.');
    } else {
      hud.toast('Spawn point set. You can sleep here at night.');
    }
  }
}

let eatCooldown = 0;

/** Right-click with food held: eat to heal (survival only). */
function tryEat(): boolean {
  if (!inventory || mode !== 'survival' || eatCooldown > 0) return false;
  const slot = inventory.selectedSlot();
  const food = slot ? ITEMS[slot.item]?.food : undefined;
  if (!food) return false;
  if (health >= 1) {
    hud.toast('Already at full health');
    return true; // held food but nothing to do — still consume the click
  }
  heal(food * stats.healItemMult);
  inventory.consumeSelected();
  eatCooldown = 0.8;
  viewModel.triggerSwing();
  hud.toast(`Ate ${itemName(slot!.item)} (+${Math.round(food * stats.healItemMult * 100)} HP)`);
  return true;
}

function tryPlace(): void {
  if (!world || !player || !inventory || !currentHit) return;
  const slot = inventory.selectedSlot();
  if (!slot || !isPlaceable(slot.item)) return;
  const px = currentHit.block.x + currentHit.normal.x;
  const py = currentHit.block.y + currentHit.normal.y;
  const pz = currentHit.block.z + currentHit.normal.z;
  if (!world.inBounds(px, py, pz)) return;
  if (BLOCKS[slot.item].solid && player.overlapsBlock(px, py, pz)) return;
  const existing = world.getBlock(px, py, pz);
  if (existing !== Block.Air && existing !== Block.Water) return;
  world.setBlock(px, py, pz, slot.item);
  inventory.consumeSelected();
  viewModel.triggerSwing();
}

function heldDamage(): number {
  const slot = inventory?.selectedSlot();
  return (slot ? ITEMS[slot.item]?.tool?.damage : undefined) ?? 1;
}

function tryAttackMob(): boolean {
  if (!player || !inventory || meleeCooldown > 0) return false;
  player.eyePosition(eyePos);
  player.lookDirection(lookDir);
  const slot = inventory.selectedSlot();
  const tool = slot ? ITEMS[slot.item]?.tool : null;
  const kind = tool?.kind ?? 'hand';
  const damage = tool?.damage ?? 1;

  if (kind === 'gun' || kind === 'staff') {
    const color = slot?.item === Item.Wand ? 0x8df06a : kind === 'gun' ? 0xffd070 : 0x7df0ff;
    projectiles.fire(eyePos, lookDir, kind === 'gun' ? 34 : 24, damage * stats.rangedMult, color);
    meleeCooldown = kind === 'gun' ? 0.45 : 0.65;
  } else {
    const mob = mobs.rayPick(eyePos, lookDir, kind === 'hand' ? 2.3 : 3.2);
    if (!mob) return false;
    let dmg = damage * stats.meleeMult;
    // Shadow Step passive: bonus damage on unaware targets or from behind
    if (stats.backstabMult > 1) {
      const facing = new THREE.Vector3(-Math.sin(mob.group.rotation.y), 0, -Math.cos(mob.group.rotation.y));
      const behind = facing.dot(lookDir) > 0.3; // attacking along their facing = from behind
      if (!mob.aggro || behind) {
        dmg *= stats.backstabMult;
        hud.toast('Sneak attack!');
      }
    }
    mobs.damage(mob, dmg, lookDir);
    meleeCooldown = kind === 'sword' ? 0.42 : 0.55;
  }
  viewModel.triggerSwing();
  if (inventory.damageSelectedTool()) {
    hud.toast('Your weapon broke!');
    hud.select(inventory.selected);
  }
  return true;
}

function updateSkillHud(): void {
  const ids = ROLE_SKILLS[role];
  for (let i = 0; i < ids.length; i++) {
    hud.setSkillCooldown(i, skillCooldowns[i] / SKILLS[ids[i]].cooldown);
  }
}

function updateCombatTimers(dt: number): void {
  for (const k of Object.keys(effects) as (keyof ActiveEffects)[]) {
    effects[k] = Math.max(0, effects[k] - dt);
  }
  meleeCooldown = Math.max(0, meleeCooldown - dt);
  eatCooldown = Math.max(0, eatCooldown - dt);
  skillCooldowns = skillCooldowns.map((t) => Math.max(0, t - dt));
  if (player) player.speedMult = stats.speedMult * (effects.speedT > 0 ? 1.4 : 1);
  updateSkillHud();
}

function heal(frac: number): void {
  health = Math.min(1, health + frac);
  hud.setHealth(health);
}

function applyDamage(dmg: number): void {
  if (effects.invulnT > 0) return;
  let reduced = effects.shieldT > 0 ? dmg * 0.3 : dmg;
  reduced *= 1 - (inventory?.totalArmor() ?? 0);
  health -= reduced / stats.maxHealth;
  hud.setHealth(health);
}

function castSkill(index: number): void {
  if (!player || !world) return;
  const id = ROLE_SKILLS[role][index];
  const skill = SKILLS[id];
  if (skillCooldowns[index] > 0) return;
  const cost = mode === 'survival' ? skill.manaCost / stats.manaMax : 0;
  if (mana < cost) {
    hud.toast('Not enough mana');
    return;
  }
  const ctx: SkillContext = {
    player,
    world,
    mobs,
    projectiles,
    effects,
    heldDamage: heldDamage(),
    heal,
    toast: (msg) => hud.toast(msg),
  };
  if (!skill.cast(ctx)) return;
  mana = Math.max(0, mana - cost);
  skillCooldowns[index] = skill.cooldown;
  hud.setMana(mana);
  updateSkillHud();
}

function finishBreak(x: number, y: number, z: number, blockId: number): void {
  if (!world || !inventory) return;
  world.setBlock(x, y, z, Block.Air);
  if (mode === 'survival') {
    const held = inventory.selectedSlot();
    const drop = dropFor(blockId, held?.item ?? null, Math.random());
    if (drop) {
      const left = inventory.add(drop.item, drop.count, undefined);
      hud.toast(`+${drop.count} ${itemName(drop.item)}${left > 0 ? ' (bag full!)' : ''}`);
    }
    if (inventory.damageSelectedTool()) {
      hud.toast('Your tool broke!');
      hud.select(inventory.selected);
    }
  }
}

function updateInteraction(dt: number): void {
  if (!world || !player || !inventory) return;
  breakCooldown -= dt;
  placeCooldown -= dt;

  viewModel.swinging = mouseButtons.has(0);

  if (mouseButtons.has(0) && currentHit) {
    const { x, y, z } = currentHit.block;
    const blockId = world.getBlock(x, y, z);
    if (mode === 'creative') {
      if (breakCooldown <= 0 && BLOCKS[blockId]) {
        world.setBlock(x, y, z, Block.Air);
        viewModel.triggerSwing();
        breakCooldown = CREATIVE_BREAK_REPEAT;
      }
    } else {
      const held = inventory.selectedSlot();
      const info = breakInfo(blockId, held?.item ?? null);
      if (!info.breakable) {
        hud.setBreakProgress(0);
        breakProgress = 0;
      } else {
        const key = `${x},${y},${z}`;
        if (key !== breakTarget) {
          breakTarget = key;
          breakProgress = 0; // progress resets when you look at a new block
        }
        const time = info.time / stats.miningMult;
        breakProgress += dt;
        hud.setBreakProgress(breakProgress / time);
        if (breakProgress >= time) {
          finishBreak(x, y, z, blockId);
          breakProgress = 0;
          hud.setBreakProgress(0);
        }
      }
    }
  } else if (breakProgress > 0) {
    breakProgress = 0;
    hud.setBreakProgress(0);
  }

  if (mouseButtons.has(2) && placeCooldown <= 0) {
    if (tryEat()) {
      placeCooldown = PLACE_REPEAT;
    } else if (currentHit) {
      tryPlace();
      placeCooldown = PLACE_REPEAT;
    }
  }
}

/** Lava contact + regen + death. */
function updateSurvival(dt: number): void {
  if (!world || !player) return;
  const p = player.position;
  let inLava = false;
  for (const dy of [0.2, 1.0]) {
    if (world.getBlock(Math.floor(p.x), Math.floor(p.y + dy), Math.floor(p.z)) === Block.Lava) inLava = true;
  }
  const eyeY = p.y + 1.62;
  const inWater = world.getBlock(Math.floor(p.x), Math.floor(eyeY), Math.floor(p.z)) === Block.Water;

  if (inLava) health -= 0.35 * dt;
  else if (inWater) health -= 0.06 * dt;
  else health += (stats.regenPerSec + (effects.regenBoostT > 0 ? 0.08 : 0)) * dt;

  health = Math.max(0, Math.min(1, health));
  mana = Math.min(1, mana + (18 * stats.manaRegenMult / stats.manaMax) * dt);
  hud.setHealth(health);
  hud.setMana(mana);

  if (health <= 0) {
    respawn();
    hud.toast(inLava ? 'You burned in lava! Respawned.' : 'You died! Respawned.');
  }
}

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
    if (!uiOpen) player.update(dt);
    environment.update(dt, player.position.x, player.position.z);
    invUI.update(dt);

    const hSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    viewModel.update(dt, hSpeed, player.onGround);

    updateCombatTimers(dt);
    projectiles.update(dt, world, mobs, player.position, (dmg) => {
      if (mode === 'survival') applyDamage(dmg);
    });
    if (mode === 'survival') updateSurvival(dt);
    mobs.lastPlayerPos = player.position;
    mobs.update(dt, world, player.position, environment.isNight(), projectiles);
  }

  player.eyePosition(eyePos);
  camera.position.copy(eyePos);
  camera.rotation.set(0, 0, 0, 'YXZ');
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  player.lookDirection(lookDir);
  currentHit = uiOpen ? null : raycastVoxel(world, eyePos, lookDir, REACH);
  if (currentHit) {
    highlight.visible = true;
    highlight.position.set(
      currentHit.block.x + 0.5, currentHit.block.y + 0.5, currentHit.block.z + 0.5
    );
  } else {
    highlight.visible = false;
  }

  if (!paused && !uiOpen) updateInteraction(dt);

  worldRenderer.update(player.position.x, player.position.z);
  renderer.render(scene, camera);
}

requestAnimationFrame(frame);

// Dev-only hook for automated testing (not included in production builds)
if (import.meta.env.DEV) {
  (window as any).__bw = {
    get world() { return world; },
    get player() { return player; },
    get hit() { return currentHit; },
    get renderer() { return worldRenderer; },
    get inventory() { return inventory; },
    get env() { return environment; },
    get mobs() { return mobs; },
    get projectiles() { return projectiles; },
    castSkill,
    tryEat,
    applyDamage,
    get state() { return { mode, role, health, mana, spawnPoint, uiOpen }; },
    setMode: (m: GameMode) => { mode = m; },
    setRole: (r: RoleId) => { role = r; },
    openUI,
    interactWith,
    start: (type: WorldType) => { worldType = type; startGame(true); },
  };
}
