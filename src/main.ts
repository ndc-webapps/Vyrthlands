import * as THREE from 'three';
import {
  REACH, WORLD_SIZES, RENDER_DISTANCES, WorldSizeKey, RenderDistanceKey,
  CREATIVE_BREAK_REPEAT, PLACE_REPEAT, THIRD_PERSON_DISTANCE,
} from './config';
import { PlayerModel } from './playerModel';
import { RemotePlayers } from './remotePlayers';
import { Chat } from './ui/chat';
import { handleCheatLine, CheatContext } from './cheats';
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
import { saveWorld, loadSave, hasSave, clearSave, buildSaveData, normalizeSave, SaveData } from './save';
import { GameMode } from './types';
import { AuthStore, ApiError } from './auth';
import { ServerApi, Presence, ServerInfo } from './net';

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
const playerModel = new PlayerModel(scene);
const remotes = new RemotePlayers(scene);
let thirdPerson = false;
viewModel.setVisible(false);

function toggleThirdPerson(): void {
  thirdPerson = !thirdPerson;
  viewModel.setVisible(running && !thirdPerson);
  playerModel.setVisible(running && thirdPerson);
  hud.toast(thirdPerson ? 'Third-person view' : 'First-person view');
}

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
let vitality = 1.0; // hunger bar: 1 = full
let starveWarned = false;
let spawnPoint: { x: number; z: number } | null = null;
let running = false;
let paused = false;
let uiOpen = false;
let dead = false;
const effects: ActiveEffects = { invulnT: 0, shieldT: 0, regenBoostT: 0, speedT: 0 };
let skillCooldowns = [0, 0];
let meleeCooldown = 0;

const hud = new HUD(atlas);
const invUI = new InventoryUI(atlas);
const chat = new Chat();
const cheatState = { unlocked: false };
const auth = new AuthStore();
const serverApi = new ServerApi(auth);
const presence = new Presence();
let currentServer: ServerInfo | null = null;  // cloud session (null = local/guest)
let creatingServer = false;                   // title screen is configuring a new cloud server
let autosaveT = 0;
let posSyncT = 0;
let clockT = 0;
hud.onSelect = (itemId) => viewModel.setHeldItem(itemId ?? 0);

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
const loginSubmit = document.getElementById('login-submit') as HTMLButtonElement;
const loginForgot = document.getElementById('login-forgot')!;
const loginGuest = document.getElementById('login-guest')!;
const tabLogin = document.getElementById('tab-login')!;
const tabRegister = document.getElementById('tab-register')!;
const loginUsername = document.getElementById('login-username') as HTMLInputElement;
const loginEmail = document.getElementById('login-email') as HTMLInputElement;
const loginPassword = document.getElementById('login-password') as HTMLInputElement;
const loginConfirm = document.getElementById('login-confirm') as HTMLInputElement;
const confirmRow = document.getElementById('confirm-row')!;
const pwEye = document.getElementById('pw-eye')!;
const pwEye2 = document.getElementById('pw-eye2')!;
const loginError = document.getElementById('login-error')!;
const accountChip = document.getElementById('account-chip')!;
const accountName = document.getElementById('account-name')!;
const accountLogout = document.getElementById('account-logout')!;
const serverScreen = document.getElementById('server-screen')!;
const serverList = document.getElementById('server-list')!;
const serverError = document.getElementById('server-error')!;
const btnServerBack = document.getElementById('btn-server-back')!;
const btnServerCreate = document.getElementById('btn-server-create')!;
const joinCodeInput = document.getElementById('join-code-input') as HTMLInputElement;
const btnJoinCode = document.getElementById('btn-join-code')!;
const serverNameGroup = document.getElementById('server-name-group')!;
const serverNameInput = document.getElementById('server-name-input') as HTMLInputElement;
const titleScreen = document.getElementById('title-screen')!;
const btnBackLanding = document.getElementById('btn-back-landing')!;
const pauseMenu = document.getElementById('pause-menu')!;
const deathScreen = document.getElementById('death-screen')!;
const deathCause = document.getElementById('death-cause')!;
const btnRespawn = document.getElementById('btn-respawn')!;
const btnDeathQuit = document.getElementById('btn-death-quit')!;
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
  serverScreen.classList.add('hidden');
}

function showWorldSelect(): void {
  landingPage.classList.add('hidden');
  titleScreen.classList.remove('hidden');
  pauseMenu.classList.add('hidden');
  serverScreen.classList.add('hidden');
  serverNameGroup.style.display = creatingServer ? '' : 'none';
  (document.getElementById('btn-new')!).textContent = creatingServer ? 'Create Server' : 'Create World';
}

function showServerScreen(): void {
  landingPage.classList.add('hidden');
  titleScreen.classList.add('hidden');
  serverScreen.classList.remove('hidden');
  void renderServers();
}

// ---------- auth modal ----------
let authTab: 'login' | 'register' = 'login';
function setAuthTab(t: 'login' | 'register'): void {
  authTab = t;
  tabLogin.classList.toggle('active', t === 'login');
  tabRegister.classList.toggle('active', t === 'register');
  loginEmail.classList.toggle('hidden', t === 'login');
  confirmRow.classList.toggle('hidden', t === 'login');
  loginSubmit.textContent = t === 'login' ? 'Login' : 'Create Account';
  loginPassword.autocomplete = t === 'login' ? 'current-password' : 'new-password';
  authError('');
}
function authError(msg: string): void {
  loginError.textContent = msg;
  loginError.classList.toggle('hidden', !msg);
}
function openLogin(): void { loginModal.classList.remove('hidden'); authError(''); }
function closeLogin(): void { loginModal.classList.add('hidden'); }

function updateAccountUI(): void {
  const u = auth.user;
  accountChip.classList.toggle('hidden', !u);
  btnNavLogin.classList.toggle('hidden', !!u);
  btnNavCreate.classList.toggle('hidden', !!u);
  accountName.textContent = u ? u.username : '';
}

// open eye = password visible, closed eye = hidden
const EYE_OPEN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_CLOSED = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9c2.5 3.5 5.5 5 9 5s6.5-1.5 9-5"/><path d="M5 12.5 3.5 15"/><path d="M19 12.5l1.5 2.5"/><path d="M12 14v3"/><path d="M8.5 13.5 7.5 16.5"/><path d="M15.5 13.5l1 3"/></svg>`;

function setEye(btn: HTMLElement, input: HTMLInputElement): void {
  const visible = input.type === 'text';
  btn.innerHTML = visible ? EYE_OPEN : EYE_CLOSED;
  btn.title = visible ? 'Hide password' : 'Show password';
}
function toggleEye(btn: HTMLElement, input: HTMLInputElement): void {
  input.type = input.type === 'password' ? 'text' : 'password';
  setEye(btn, input);
}
setEye(pwEye, loginPassword);
setEye(pwEye2, loginConfirm);
pwEye.addEventListener('click', () => toggleEye(pwEye, loginPassword));
pwEye2.addEventListener('click', () => toggleEye(pwEye2, loginConfirm));

async function submitAuth(): Promise<void> {
  authError('');
  if (authTab === 'register' && loginPassword.value !== loginConfirm.value) {
    authError('Passwords do not match');
    return;
  }
  loginSubmit.classList.add('loading');
  loginSubmit.textContent = authTab === 'login' ? 'Logging in…' : 'Creating…';
  try {
    if (authTab === 'login') await auth.login(loginUsername.value.trim(), loginPassword.value);
    else await auth.register(loginUsername.value.trim(), loginPassword.value, loginEmail.value.trim());
    closeLogin();
    updateAccountUI();
    hud.toast(`Welcome, ${auth.user!.username}!`);
    showServerScreen();
  } catch (e) {
    authError(e instanceof ApiError ? e.message : 'Something went wrong');
  } finally {
    loginSubmit.classList.remove('loading');
    loginSubmit.textContent = authTab === 'login' ? 'Login' : 'Create Account';
  }
}

tabLogin.addEventListener('click', () => setAuthTab('login'));
tabRegister.addEventListener('click', () => setAuthTab('register'));
loginSubmit.addEventListener('click', () => void submitAuth());
loginPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') void submitAuth(); });
loginForgot.addEventListener('click', () => hud.toast('Password recovery coming soon'));
loginGuest.addEventListener('click', () => {
  auth.continueAsGuest();
  closeLogin();
  creatingServer = false;
  showWorldSelect();
});
accountLogout.addEventListener('click', () => {
  void auth.logout().then(() => {
    currentServer = null;
    presence.disconnect();
    updateAccountUI();
    showLanding();
    hud.toast('Logged out');
  });
});

function enterFlow(): void {
  if (auth.loggedIn) showServerScreen();
  else openLogin();
}
btnStartAdventure.addEventListener('click', enterFlow);
btnStartAdventureCTA.addEventListener('click', enterFlow);
btnExploreRealms.addEventListener('click', () => {
  document.getElementById('worlds')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
btnBackLanding.addEventListener('click', () => {
  if (creatingServer) { creatingServer = false; showServerScreen(); }
  else showLanding();
});
btnLandingContinue.addEventListener('click', () => {
  if (hasSave()) startGame(false);
  else hud.toast('No saved world found');
});
btnNavLogin.addEventListener('click', () => { setAuthTab('login'); openLogin(); });
btnNavCreate.addEventListener('click', () => { setAuthTab('register'); openLogin(); });
loginClose.addEventListener('click', closeLogin);

// ---------- server selection ----------
function serverErrorMsg(msg: string): void {
  serverError.textContent = msg;
  serverError.classList.toggle('hidden', !msg);
}

async function renderServers(): Promise<void> {
  serverErrorMsg('');
  serverList.innerHTML = '<p class="server-empty">Loading realms…</p>';
  try {
    const servers = await serverApi.list();
    serverList.innerHTML = '';
    if (servers.length === 0) {
      serverList.innerHTML = '<p class="server-empty">No realms yet. Create one or join a friend with an invite code.</p>';
      return;
    }
    for (const s of servers) {
      const card = document.createElement('div');
      card.className = 'server-card';
      const when = new Date(s.lastPlayed).toLocaleDateString();
      card.innerHTML = `
        <div class="sc-info">
          <span class="sc-name"></span>
          <span class="sc-meta">${s.worldType} · ${s.mode} · ${s.members.length}/${s.maxPlayers} players · last played ${when}</span>
          ${s.inviteCode ? `<span class="sc-code">Invite: ${s.inviteCode}</span>` : ''}
        </div>
        <div class="sc-actions">
          <span class="sc-online">${s.online} online</span>
          <button class="primary sc-play">Play</button>
        </div>`;
      (card.querySelector('.sc-name') as HTMLElement).textContent = s.name + (s.isOwner ? ' (yours)' : '');
      (card.querySelector('.sc-play') as HTMLElement).addEventListener('click', () => void playServer(s));
      serverList.appendChild(card);
    }
  } catch (e) {
    serverList.innerHTML = '';
    serverErrorMsg(e instanceof ApiError ? e.message : 'Failed to load servers');
  }
}

async function playServer(s: ServerInfo): Promise<void> {
  serverErrorMsg('');
  try {
    const cloud = await serverApi.load(s.id);
    currentServer = s;
    worldType = (GENERATORS[s.worldType as WorldType] ? s.worldType : 'natural') as WorldType;
    worldSize = (WORLD_SIZES[s.worldSize as WorldSizeKey] ? s.worldSize : 'medium') as WorldSizeKey;
    mode = s.mode === 'creative' ? 'creative' : 'survival';
    seedInput.value = String(s.seed);
    const save = normalizeSave(cloud.progress);
    if (save && cloud.world?.edits) save.edits = cloud.world.edits; // world blocks are shared
    startGame(!save, save, cloud.world?.edits ?? null);
    connectPresence(s);
  } catch (e) {
    currentServer = null;
    serverErrorMsg(e instanceof ApiError ? e.message : 'Failed to load server');
  }
}

/** Hook the presence socket up to toasts, remote avatars, chat, block sync. */
function connectPresence(s: ServerInfo): void {
  presence.connect(auth.token!, s.id);
  presence.onEvent = (msg) => { hud.toast(msg); chat.add(null, msg); };
  presence.onPos = (username, r, x, y, z, yaw) => {
    if (username !== auth.user?.username) remotes.upsert(username, r, x, y, z, yaw);
  };
  presence.onPlayers = (list) => remotes.prune(list, auth.user?.username ?? '');
  presence.onChat = (username, text) => chat.add(username, text);
  presence.onBlock = (username, x, y, z, id) => {
    if (username === auth.user?.username || !world) return;
    if (world.inBounds(x, y, z)) world.setBlock(x, y, z, id); // dirty chunk -> auto re-mesh
  };
}

/** Place/break that also broadcasts to friends in the server. */
function setBlockSynced(x: number, y: number, z: number, id: number): void {
  world?.setBlock(x, y, z, id);
  if (currentServer) presence.sendBlock(x, y, z, id);
}

// ---------- chat + cheat commands ----------
function buildCheatCtx(): CheatContext | null {
  if (!player || !inventory || !world) return null;
  return {
    player, inventory, mobs, env: environment, effects,
    setHealth: (f) => { health = f; hud.setHealth(f); },
    setVitality: (f) => { vitality = f; hud.setVitality(f); },
    cycleRole: () => {
      const order: RoleId[] = ['swordsman', 'assassin', 'wizard', 'healer', 'gunner'];
      role = order[(order.indexOf(role) + 1) % order.length];
      stats = computeStats(role);
      player!.speedMult = stats.speedMult;
      playerModel.setRole(role);
      hud.setMode(mode, ROLES[role].name);
      hud.setSkills(ROLE_SKILLS[role].map((id) => SKILLS[id]), true);
      updateSkillHud();
      invUI.bind(inventory!, ROLES[role], stats);
      return role;
    },
    spawnHostiles: (n) => mobs.spawnNear(world!, player!.position, n),
    spawnBoss: () => mobs.spawnBossNear(world!, player!.position),
  };
}

function openChatInput(): void {
  if (!running || paused || uiOpen || dead || chat.isOpen) return;
  chat.openInput();
  player?.keys.clear();
  mouseButtons.clear();
  if (!isTouch) document.exitPointerLock();
}

chat.onClose = () => {
  if (!isTouch && running && !paused && !uiOpen && !dead) requestPointerLock();
};

chat.onSend = (text) => {
  const cheatLines = handleCheatLine(text, cheatState, buildCheatCtx);
  if (cheatLines) {
    for (const line of cheatLines) chat.add(null, line);
    return; // commands and cheat codes never go to the network
  }
  if (currentServer) {
    presence.sendChat(text); // server echoes back to everyone including us
  } else {
    chat.add(auth.user?.username ?? 'You', text);
  }
};

btnServerBack.addEventListener('click', showLanding);
btnServerCreate.addEventListener('click', () => {
  creatingServer = true;
  serverNameInput.value = '';
  showWorldSelect();
});
btnJoinCode.addEventListener('click', () => {
  void (async () => {
    serverErrorMsg('');
    try {
      const s = await serverApi.join(joinCodeInput.value.trim());
      hud.toast(`Joined ${s.name}!`);
      joinCodeInput.value = '';
      await renderServers();
    } catch (e) {
      serverErrorMsg(e instanceof ApiError ? e.message : 'Failed to join');
    }
  })();
});

// restore session on page load
void auth.restore().then(() => updateAccountUI());

// landing page: reveal sections as they scroll into view
{
  const revealEls = document.querySelectorAll(
    '#landing-page .feature-card, #landing-page .world-card, #landing-page .role-card, #landing-page .section-heading, #landing-page .cta-panel'
  );
  revealEls.forEach((el) => el.classList.add('reveal'));
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal-in');
        io.unobserve(entry.target);
      }
    }
  }, { threshold: 0.15 });
  revealEls.forEach((el) => io.observe(el));
}

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

btnNew.addEventListener('click', () => void handleCreateWorld());

/** "Create World" button: local world, or a new cloud server when in server-create flow. */
async function handleCreateWorld(): Promise<void> {
  if (creatingServer && auth.loggedIn) {
    const name = serverNameInput.value.trim() || 'My Realm';
    const seed = parseSeed(seedInput.value);
    seedInput.value = String(seed);
    try {
      const s = await serverApi.create({ name, worldType, mode, worldSize, seed });
      creatingServer = false;
      currentServer = s;
      startGame(true);
      connectPresence(s);
      saveCloud(true);
      hud.toast(`Realm "${s.name}" created — invite code: ${s.inviteCode}`);
    } catch (e) {
      hud.toast(e instanceof ApiError ? e.message : 'Failed to create server');
    }
  } else {
    startGame(true);
  }
}

/** Push progress + shared world edits to the backend. */
function saveCloud(silent = false): void {
  if (!currentServer || !world || !player || !inventory) return;
  const data = buildSaveData(world, player, mode, worldType, worldSize, renderDistance, {
    role, health, mana, vitality, spawn: spawnPoint, timeOfDay: environment.getTime(), inventory: inventory.serialize(),
  });
  serverApi.save(currentServer.id, data, { edits: data.edits })
    .then(() => { if (!silent) hud.toast('Progress saved to server'); })
    .catch(() => { if (!silent) hud.toast('Cloud save failed'); });
}

window.addEventListener('beforeunload', () => {
  if (!currentServer || !world || !player || !inventory) return;
  const data = buildSaveData(world, player, mode, worldType, worldSize, renderDistance, {
    role, health, mana, vitality, spawn: spawnPoint, timeOfDay: environment.getTime(), inventory: inventory.serialize(),
  });
  serverApi.saveBeacon(currentServer.id, data, { edits: data.edits });
});
btnContinue.addEventListener('click', () => startGame(false));
btnResume.addEventListener('click', () => {
  if (isTouch) {
    paused = false;
    pauseMenu.classList.add('hidden');
  } else requestPointerLock();
});
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
  if (currentServer) {
    saveCloud(true);
    presence.disconnect();
    remotes.clear();
  }
  const backToServers = currentServer !== null && auth.loggedIn;
  currentServer = null;
  creatingServer = false;
  running = false;
  paused = false;
  uiOpen = false;
  if (backToServers) {
    pauseMenu.classList.add('hidden');
    hud.hide();
    viewModel.setVisible(false);
    showServerScreen();
    return;
  }
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
  if (currentServer) {
    saveCloud();
    return;
  }
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
function startGame(fresh: boolean, cloudSave: SaveData | null = null, cloudEdits: Record<string, number> | null = null): void {
  const save = cloudSave ?? (fresh ? null : loadSave());
  const seed = save ? save.seed : parseSeed(seedInput.value);
  if (fresh && !currentServer) clearSave();
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
  air = 1;
  mobs.clear();
  projectiles.clear();

  worldRenderer?.dispose();
  world = new World(seed, GENERATORS[worldType], WORLD_SIZES[worldSize]);
  mobs.setWorld(worldType);
  if (save) world.applyEdits(save.edits);
  else if (cloudEdits) world.applyEdits(cloudEdits); // joining a friend's already-built world

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
    vitality = save.vitality ?? 1;
  } else {
    const sp = world.findSpawn();
    player.spawn(sp.x, sp.z);
    spawnPoint = null;
    health = 1.0;
    mana = 1.0;
    vitality = 1.0;
  }
  worldRenderer.buildInitial(player.position.x, player.position.z);

  hud.setMode(mode, ROLES[role].name);
  hud.setSkills(ROLE_SKILLS[role].map((id) => SKILLS[id]), true);
  updateSkillHud();
  hud.setHealth(health);
  hud.setMana(mana);
  hud.setVitality(vitality);
  hud.show();
  chat.show();
  hud.select(inventory.selected);
  playerModel.setRole(role);
  playerModel.setVisible(thirdPerson);
  viewModel.setVisible(!thirdPerson);
  remotes.clear();
  pauseSeedEl.textContent = `${GENERATORS[worldType].name} · ${ROLES[role].name} · seed ${seed}`;
  titleScreen.classList.add('hidden');
  landingPage.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (invUI.isOpen()) invUI.close();
  running = true;
  paused = false;
  uiOpen = false;
  dead = false;
  deathScreen.classList.add('hidden');
  requestPointerLock();
}

function respawn(): void {
  if (!world || !player) return;
  const sp = spawnPoint ?? world.findSpawn();
  player.spawn(sp.x, sp.z);
  health = 1.0;
  mana = 1.0;
  air = 1.0;
  vitality = 1.0;
  hud.setHealth(health);
  hud.setMana(mana);
  hud.setVitality(vitality);
}

/** Classic death screen: pause the world, show cause, wait for Respawn. */
function die(cause: string): void {
  if (dead) return;
  dead = true;
  paused = true;
  mouseButtons.clear();
  player?.keys.clear();
  breakProgress = 0;
  hud.setBreakProgress(0);
  deathCause.textContent = cause;
  deathScreen.classList.remove('hidden');
  document.exitPointerLock();
}

btnRespawn.addEventListener('click', () => {
  deathScreen.classList.add('hidden');
  dead = false;
  paused = false;
  respawn();
  requestPointerLock();
});
btnDeathQuit.addEventListener('click', () => {
  deathScreen.classList.add('hidden');
  dead = false;
  respawn(); // leave the corpse state behind before saving
  btnQuit.dispatchEvent(new Event('click'));
});

// ---------- Touch device detection ----------
const isTouch = (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch-mode');

// ---------- Pointer lock / pause / UI ----------
function requestPointerLock(): void {
  if (isTouch) return; // touch devices play without pointer lock
  canvas.requestPointerLock();
}

document.addEventListener('pointerlockchange', () => {
  if (isTouch) return;
  const locked = document.pointerLockElement === canvas;
  if (!running) return;
  if (uiOpen) return; // inventory overlay manages its own state
  if (dead) return;   // death screen owns the pause until Respawn
  paused = !locked;
  pauseMenu.classList.toggle('hidden', locked);
  if (paused) {
    mouseButtons.clear();
    breakProgress = 0;
    hud.setBreakProgress(0);
  }
});

canvas.addEventListener('click', () => {
  if (!isTouch && running && !paused && !uiOpen && document.pointerLockElement !== canvas) requestPointerLock();
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
  if (chat.isOpen) return; // chat input handles its own keys
  if (!uiOpen && !paused && !dead && (e.code === 'KeyT' || e.code === 'Enter')) {
    openChatInput();
    e.preventDefault();
    return;
  }
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
  if (e.code === 'KeyF') {
    if (mode === 'creative') player.toggleFly();
    else if (player.flying) player.toggleFly(); // never stay airborne in survival
    else hud.toast('No flying in Survival');
  }
  if (e.code === 'KeyV') toggleThirdPerson();
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

/** Right-click with food/bandage held: food fills hunger, bandages heal. */
function tryEat(): boolean {
  if (!inventory || mode !== 'survival' || eatCooldown > 0) return false;
  const slot = inventory.selectedSlot();
  const def = slot ? ITEMS[slot.item] : undefined;
  if (!def || (!def.food && !def.heals)) return false;
  if (def.heals) {
    if (health >= 1) { hud.toast('Already at full health'); return true; }
    heal(def.heals * stats.healItemMult);
    hud.toast(`Used ${def.name} (+${Math.round(def.heals * stats.healItemMult * 100)} HP)`);
  } else {
    if (vitality >= 1) { hud.toast('Not hungry right now'); return true; }
    vitality = Math.min(1, vitality + def.food! * stats.healItemMult);
    heal(0.05); // a good meal patches you up a little too
    hud.setVitality(vitality);
    hud.toast(`Ate ${def.name}`);
  }
  inventory.consumeSelected();
  eatCooldown = 0.8;
  viewModel.triggerSwing();
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
  setBlockSynced(px, py, pz, slot.item);
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
  if (effects.invulnT > 0 || dead) return;
  let reduced = effects.shieldT > 0 ? dmg * 0.3 : dmg;
  reduced *= 1 - (inventory?.totalArmor() ?? 0);
  health = Math.max(0, health - reduced / stats.maxHealth);
  hud.setHealth(health);
  if (mode === 'survival' && health <= 0) die('You were slain');
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
  setBlockSynced(x, y, z, Block.Air);
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
        setBlockSynced(x, y, z, Block.Air);
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

/** Lava + drowning + fall damage + regen + death. */
let air = 1; // 0..1, ~10s of breath under water
function updateSurvival(dt: number): void {
  if (!world || !player) return;
  const p = player.position;
  let inLava = false;
  for (const dy of [0.2, 1.0]) {
    if (world.getBlock(Math.floor(p.x), Math.floor(p.y + dy), Math.floor(p.z)) === Block.Lava) inLava = true;
  }
  const eyeY = p.y + 1.62;
  const inWater = world.getBlock(Math.floor(p.x), Math.floor(eyeY), Math.floor(p.z)) === Block.Water;
  const feetInWater = world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) === Block.Water;

  // fall damage: hurts past 3.5 blocks, water landings are safe
  const fell = player.consumeLanding();
  if (fell > 3.5 && !feetInWater && !inLava) {
    applyDamage((fell - 3.5) * 0.06);
    hud.toast('Ouch! Fall damage');
  }

  // drowning: ~10s of air, then it hurts
  if (inWater) {
    const hadAir = air > 0;
    air = Math.max(0, air - dt / 10);
    if (air <= 0) {
      health -= 0.12 * dt;
      if (hadAir) hud.toast('Drowning!');
    }
  } else {
    air = Math.min(1, air + dt / 3);
  }

  // hunger: drains slowly, faster while sprinting; gates regen; starvation hurts
  const sprinting = (player.keys.has('ControlLeft') || player.keys.has('ControlRight')) &&
    Math.hypot(player.velocity.x, player.velocity.z) > 3;
  vitality = Math.max(0, vitality - dt / 600 - (sprinting ? dt / 90 : 0));
  hud.setVitality(vitality);
  if (vitality <= 0) {
    health = Math.max(0.05, health - 0.012 * dt); // starving: drains to half a heart
    if (!starveWarned) { starveWarned = true; hud.toast('You are starving! Eat something.'); chat.add(null, 'You are starving! Eat something.'); }
  } else starveWarned = false;

  if (inLava) health -= 0.35 * dt;
  else if (!inWater && vitality > 0.3) health += (stats.regenPerSec + (effects.regenBoostT > 0 ? 0.08 : 0)) * dt;

  health = Math.max(0, Math.min(1, health));
  mana = Math.min(1, mana + (18 * stats.manaRegenMult / stats.manaMax) * dt);
  hud.setHealth(health);
  hud.setMana(mana);

  if (health <= 0) {
    die(inLava ? 'You burned in lava' : air <= 0 ? 'You drowned' : 'You died');
  }
}

// ---------- Touch controls (phones / tablets / iPad) ----------
const touchControls = document.getElementById('touch-controls')!;
if (isTouch) setupTouchControls();

function setupTouchControls(): void {
  hud.onSkillTap = (i) => { if (running && !paused && !uiOpen) castSkill(i); };

  // --- virtual joystick (left) ---
  const zone = document.getElementById('joystick-zone')!;
  const base = document.getElementById('joystick-base')!;
  const knob = document.getElementById('joystick-knob')!;
  let joyId: number | null = null;
  let cx = 0, cy = 0;
  const R = 45;
  const applyJoy = (t: Touch) => {
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx = dx / len * R; dy = dy / len * R; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    if (player) player.touchMove = { f: -dy / R, s: dx / R };
  };
  zone.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    joyId = t.identifier;
    const rect = base.getBoundingClientRect();
    cx = rect.left + rect.width / 2;
    cy = rect.top + rect.height / 2;
    applyJoy(t);
    e.preventDefault();
  }, { passive: false });
  zone.addEventListener('touchmove', (e) => {
    for (const t of Array.from(e.changedTouches)) if (t.identifier === joyId) applyJoy(t);
    e.preventDefault();
  }, { passive: false });
  const endJoy = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === joyId) {
        joyId = null;
        knob.style.transform = 'translate(-50%, -50%)';
        if (player) player.touchMove = { f: 0, s: 0 };
      }
    }
  };
  zone.addEventListener('touchend', endJoy);
  zone.addEventListener('touchcancel', endJoy);

  // --- look / camera (right) ---
  const look = document.getElementById('look-zone')!;
  let lookId: number | null = null;
  let lx = 0, ly = 0;
  look.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    lookId = t.identifier;
    lx = t.clientX; ly = t.clientY;
    e.preventDefault();
  }, { passive: false });
  look.addEventListener('touchmove', (e) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === lookId && player && running && !paused && !uiOpen) {
        player.handleMouseMove((t.clientX - lx) * 2.4, (t.clientY - ly) * 2.4);
        lx = t.clientX; ly = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const endLook = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) if (t.identifier === lookId) lookId = null;
  };
  look.addEventListener('touchend', endLook);
  look.addEventListener('touchcancel', endLook);

  // --- action buttons ---
  const hold = (id: string, down: () => void, up: () => void) => {
    const el = document.getElementById(id)!;
    el.addEventListener('touchstart', (e) => { down(); e.preventDefault(); }, { passive: false });
    el.addEventListener('touchend', (e) => { up(); e.preventDefault(); }, { passive: false });
    el.addEventListener('touchcancel', () => up());
  };
  hold('tbtn-jump', () => player?.keys.add('Space'), () => player?.keys.delete('Space'));
  hold('tbtn-break', () => {
    if (!running || paused || uiOpen) return;
    if (mode === 'survival' && tryAttackMob()) return;
    mouseButtons.add(0);
  }, () => {
    mouseButtons.delete(0);
    breakProgress = 0;
    hud.setBreakProgress(0);
  });
  hold('tbtn-place', () => {
    if (!running || paused || uiOpen) return;
    if (currentHit && world) {
      const target = world.getBlock(currentHit.block.x, currentHit.block.y, currentHit.block.z);
      if (BLOCKS[target]?.interactable) { interactWith(target, currentHit.block); return; }
    }
    placeCooldown = 0;
    mouseButtons.add(2);
  }, () => mouseButtons.delete(2));
  document.getElementById('tbtn-pause')!.addEventListener('click', () => {
    if (!running) return;
    paused = true;
    mouseButtons.clear();
    player?.keys.clear();
    pauseMenu.classList.remove('hidden');
  });
  document.getElementById('tbtn-pack')!.addEventListener('click', () => {
    if (running && !paused && !uiOpen) openUI('backpack');
  });
  document.getElementById('tbtn-view')!.addEventListener('click', () => {
    if (running && !paused && !uiOpen) toggleThirdPerson();
  });
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

    // cloud autosave + presence position sync
    if (currentServer) {
      autosaveT += dt;
      posSyncT += dt;
      if (autosaveT > 25) { autosaveT = 0; saveCloud(true); }
      if (posSyncT > 0.25) {
        posSyncT = 0;
        presence.sendPos(player.position.x, player.position.y, player.position.z, player.yaw, role);
      }
      remotes.update(dt);
    }
  }

  player.eyePosition(eyePos);
  camera.rotation.set(0, 0, 0, 'YXZ');
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  player.lookDirection(lookDir);

  if (thirdPerson) {
    // pull the camera back along the view ray, stopping at solid blocks
    let dist = 0.5;
    for (; dist < THIRD_PERSON_DISTANCE; dist += 0.25) {
      const cx = eyePos.x - lookDir.x * (dist + 0.3);
      const cy = eyePos.y - lookDir.y * (dist + 0.3);
      const cz = eyePos.z - lookDir.z * (dist + 0.3);
      if (world.isSolidAt(cx, cy, cz)) break;
    }
    camera.position.set(
      eyePos.x - lookDir.x * dist,
      eyePos.y - lookDir.y * dist,
      eyePos.z - lookDir.z * dist
    );
    const hSpeed2 = Math.hypot(player.velocity.x, player.velocity.z);
    playerModel.update(dt, player.position, player.yaw, hSpeed2);
  } else {
    camera.position.copy(eyePos);
  }
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

  clockT += dt;
  if (clockT > 0.5) {
    clockT = 0;
    hud.setTimeOfDay(environment.getTime(), environment.isNight());
  }
  if (isTouch) touchControls.classList.toggle('hidden', !running || paused || uiOpen);
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
    get viewModel() { return viewModel; },
    get remotes() { return remotes; },
    toggleThirdPerson,
    get presence() { return presence; },
    get state() { return { mode, role, health, mana, spawnPoint, uiOpen }; },
    setMode: (m: GameMode) => { mode = m; },
    setRole: (r: RoleId) => { role = r; },
    openUI,
    interactWith,
    start: (type: WorldType) => { worldType = type; startGame(true); },
  };
}
