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
import { themeParkRides, ParkRide } from './world/generators/themeParkGenerator';
import { ParkAnimator } from './parkRides';
import { Player } from './player';
import { raycastVoxel } from './raycast';
import { Environment } from './environment';
import { ViewModel } from './viewmodel';
import { HUD } from './ui/hud';
import { InventoryUI } from './ui/inventoryUI';
import { Inventory } from './inventory';
import { breakInfo, dropFor, itemName, isPlaceable, ITEMS, Item, ARMOR_SETS } from './items';
import { Station } from './crafting';
import { ROLES, RoleId, computeStats, PlayerStats } from './roles';
import { MobManager, Mob } from './mobs';
import { buildModel, Rig } from './enemies/models';
import { EnemyDef, enemiesForWorld } from './enemies/registry';
import { ProjectileManager } from './projectiles';
import { ActiveEffects, ROLE_SKILLS, SKILLS, SkillContext } from './skills';
import { saveWorld, loadSave, hasSave, clearSave, buildSaveData, normalizeSave, SaveData } from './save';
import { GameMode } from './types';
import { AuthStore, ApiError } from './auth';
import { ServerApi, Presence, ServerInfo } from './net';
import { RolePreviews } from './ui/rolePreview';
import { HeroScene } from './ui/heroScene';
import { WorldPreviews } from './ui/worldPreview';
import { sfx } from './sound';
import { Particles } from './particles';
import { initAnalytics, trackEvent } from './analytics';

initAnalytics(); // StatsPilot pageview + custom events (no-op unless VITE_STATSPILOT_ID is set)

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
const parkAnim = new ParkAnimator(scene); // moving theme-park ride parts
const particles = new Particles(scene);

// browsers gate audio behind a user gesture — unlock on the first one
for (const ev of ['pointerdown', 'touchstart', 'keydown'] as const) {
  document.addEventListener(ev, () => sfx.unlock(), { passive: true });
}

/** Representative color of a block (sampled from its tile art) for particles. */
const blockColorCache = new Map<number, number>();
function blockColor(id: number): number {
  let c = blockColorCache.get(id);
  if (c == null) {
    const def = BLOCKS[id];
    if (!def) return 0x9aa0aa;
    const icon = atlas.icon(def.tiles.side, 8);
    const d = icon.getContext('2d')!.getImageData(4, 4, 1, 1).data;
    c = (d[0] << 16) | (d[1] << 8) | d[2];
    blockColorCache.set(id, c);
  }
  return c;
}
// minecart shown under the player while riding player-built rails
const cartMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1.0, 0.5, 1.3),
  new THREE.MeshLambertMaterial({ color: 0x6a4e30 })
);
cartMesh.visible = false;
scene.add(cartMesh);
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
let isLeader = false;                         // am I the simulation leader (mobs + clock)?
let autosaveT = 0;
let posSyncT = 0;
let mobSyncT = 0;
let clockT = 0;
// theme park rides: seats placed by the generator, paths ridden here
let parkRides: ParkRide[] = [];
let activeRide: { ride: ParkRide; curve: THREE.CatmullRomCurve3; t: number; cart?: boolean } | null = null;
// tamed companion: follows you, mountable for fast travel
interface MountState {
  def: EnemyDef;
  group: THREE.Group;
  rig: Rig;
  pos: THREE.Vector3;
  riding: boolean;
  walkPhase: number;
}
let mount: MountState | null = null;
const TAME_CHANCE = 0.25; // rare: ~4 feedings on average
hud.onSelect = (itemId) => viewModel.setHeldItem(itemId ?? 0);

invUI.onClose = () => {
  uiOpen = false;
  if (running) requestPointerLock();
};
invUI.onCraft = (recipe) => {
  sfx.craft();
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
const pauseInvite = document.getElementById('pause-invite')!;
const pauseInviteCode = document.getElementById('pause-invite-code')!;
const btnCopyInvite = document.getElementById('btn-copy-invite')!;
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
  themepark: info('Festival grounds with 20+ rideable attractions — coasters, water slides, the Sky Wheel, and more. Tap the glowing seat posts to ride.', 'None', 'None — peaceful park', 'Fun', 'Explore and ride everything.', ['swordsman', 'wizard', 'healer', 'gunner', 'assassin']),
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

// live animated avatar previews inside every role button
const rolePreviews = new RolePreviews();
function attachRolePreviews(rowId: string): void {
  document.getElementById(rowId)!.querySelectorAll('button').forEach((btn) => {
    const r = btn.dataset.role as RoleId | undefined;
    if (!r || !ROLES[r]) return;
    btn.classList.add('opt-role');
    const canvas = document.createElement('canvas');
    canvas.className = 'role-preview';
    const label = document.createElement('span');
    label.textContent = btn.textContent ?? '';
    btn.textContent = '';
    btn.appendChild(canvas);
    btn.appendChild(label);
    rolePreviews.attach(r, canvas);
  });
}
attachRolePreviews('role-row');       // create world / create server screen
attachRolePreviews('role-pick-row');  // join-with-invite-code role picker

// animated character on each landing-page role card
document.querySelectorAll<HTMLElement>('.role-card[data-role]').forEach((card) => {
  const r = card.dataset.role as RoleId | undefined;
  const canvas = card.querySelector<HTMLCanvasElement>('.role-card-canvas');
  if (r && ROLES[r] && canvas) rolePreviews.attach(r, canvas);
});

// live 3D voxel-island diorama in the landing hero
const heroCanvas = document.getElementById('hero-canvas') as HTMLCanvasElement | null;
const heroScene = heroCanvas ? new HeroScene(heroCanvas) : null;
window.addEventListener('resize', () => heroScene?.resize());

// live 3D voxel mini-scene on each landing world card
const worldPreviews = new WorldPreviews();
document.querySelectorAll<HTMLElement>('.world-card[data-world]').forEach((card) => {
  const w = card.dataset.world;
  const canvas = card.querySelector<HTMLCanvasElement>('.wc-canvas');
  if (w && canvas) worldPreviews.attach(w, canvas);
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
  updateStorageWarning();
  void renderServers();
}

/** Loud banner when the backend runs on its temporary sqlite fallback in
 *  production — accounts/saves there are wiped on every redeploy. */
function updateStorageWarning(): void {
  const el = document.getElementById('storage-warn')!;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const bad = auth.storage === 'sqlite' && !local;
  el.classList.toggle('hidden', !bad);
  if (bad) {
    el.textContent = '⚠ The game server is NOT connected to your Neon database (temporary storage in use — '
      + 'accounts and saves will be wiped on the next redeploy). On Railway, open the backend service → '
      + 'Variables and make sure DATABASE_URL is set there, then redeploy. Details: /api/_debug';
  }
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
function doLogout(): void {
  void auth.logout().then(() => {
    currentServer = null;
    presence.disconnect();
    updateAccountUI();
    showLanding();
    hud.toast('Logged out');
  });
}
accountLogout.addEventListener('click', doLogout);
document.getElementById('btn-server-logout')!.addEventListener('click', doLogout);

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

// ---------- invite code sharing ----------
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // clipboard API needs a secure context — fall back to the legacy path
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function copyInvite(code: string): void {
  void copyText(code).then((ok) => hud.toast(ok ? `Invite code ${code} copied!` : 'Copy failed — code: ' + code));
}

/** Pause menu shows the invite code (with copy) while in a cloud server. */
function updatePauseInvite(): void {
  const code = currentServer?.inviteCode;
  pauseInvite.classList.toggle('hidden', !code);
  pauseInviteCode.textContent = code ?? '';
}

btnCopyInvite.addEventListener('click', () => {
  if (currentServer?.inviteCode) copyInvite(currentServer.inviteCode);
});

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
          ${s.inviteCode ? `<span class="sc-code">Invite: <b>${s.inviteCode}</b><button class="sc-copy" title="Copy invite code">Copy</button></span>` : ''}
        </div>
        <div class="sc-actions">
          <span class="sc-online">${s.online} online</span>
          <button class="primary sc-play">Play</button>
        </div>`;
      (card.querySelector('.sc-name') as HTMLElement).textContent = s.name + (s.isOwner ? ' (yours)' : '');
      (card.querySelector('.sc-play') as HTMLElement).addEventListener('click', () => void playServer(s));
      card.querySelector('.sc-copy')?.addEventListener('click', () => copyInvite(s.inviteCode!));
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

/** Hook the presence socket up to toasts, remote avatars, chat, block sync,
 *  and the shared simulation (mobs, clock, shots, sleeping). */
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

  // ----- shared simulation -----
  presence.onLeader = (leader) => {
    const me = leader != null && leader === auth.user?.username;
    if (me && !isLeader) mobs.becomeLeader();
    isLeader = me;
    mobs.remote = !me;
  };
  presence.onMobs = (snaps, t) => {
    if (isLeader) return;
    mobs.applySnapshot(snaps);
    // adopt the leader's day/night clock (small drift is left alone)
    if (t >= 0) {
      const diff = Math.abs(environment.getTime() - t);
      if (diff > 0.015 && diff < 0.985) environment.setTime(t);
    }
  };
  presence.onMobHit = (username, id, dmg, kx, kz) => {
    if (!isLeader || username === auth.user?.username) return;
    const mob = mobs.byId(id);
    if (mob) mobs.damage(mob, dmg, kx || kz ? new THREE.Vector3(kx, 0, kz) : undefined);
  };
  presence.onMobAtk = (target, dmg) => {
    if (target === auth.user?.username && mode === 'survival') applyDamage(dmg);
  };
  presence.onShot = (username, x, y, z, dx, dy, dz, speed, dmg, color, hostile) => {
    if (username === auth.user?.username) return;
    const o = new THREE.Vector3(x, y, z);
    const dir = new THREE.Vector3(dx, dy, dz);
    if (hostile) projectiles.fireHostile(o, dir, speed, dmg, color); // can hit ME locally
    else projectiles.fireVisual(o, dir, speed, color);               // friend's shot, cosmetic
  };
  presence.onSleep = (username) => {
    environment.skipToMorning();
    const who = username === auth.user?.username ? 'You' : username;
    hud.toast(`${who} slept — morning has come`);
    chat.add(null, `${who} slept through the night`);
  };
  presence.onTame = (username, id, mobName) => {
    mobs.removeById(id); // tamed animals leave the wild for everyone
    if (username !== auth.user?.username && mobName) hud.toast(`${username} tamed a ${mobName}!`);
  };
}

// mob manager -> network bridges (no-ops outside a server session)
mobs.onRemoteHit = (name, dmg) => {
  if (currentServer && isLeader) presence.sendMobAtk(name, dmg);
};
mobs.onForwardHit = (id, dmg, kx, kz) => {
  if (currentServer && !isLeader) presence.sendMobHit(id, dmg, kx, kz);
};
mobs.onHostileShot = (x, y, z, dx, dy, dz, speed, dmg, color) => {
  if (currentServer && isLeader) presence.sendShot(x, y, z, dx, dy, dz, speed, dmg, color, true);
};

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
// ---------- join flow: pick a role before entering a friend's realm ----------
const roleModal = document.getElementById('role-modal')!;
const rolePickDesc = document.getElementById('role-pick-desc')!;
let pickedRole: RoleId = 'swordsman';

document.getElementById('role-pick-row')!.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById('role-pick-row')!.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    pickedRole = btn.dataset.role as RoleId;
    rolePickDesc.textContent = ROLES[pickedRole].desc;
  });
});

btnJoinCode.addEventListener('click', () => {
  serverErrorMsg('');
  if (!joinCodeInput.value.trim()) {
    serverErrorMsg('Type an invite code first');
    return;
  }
  roleModal.classList.remove('hidden');
});

document.getElementById('role-pick-cancel')!.addEventListener('click', () => roleModal.classList.add('hidden'));
document.getElementById('role-pick-join')!.addEventListener('click', () => {
  void (async () => {
    serverErrorMsg('');
    roleModal.classList.add('hidden');
    try {
      const s = await serverApi.join(joinCodeInput.value.trim());
      role = pickedRole; // first spawn in this realm uses the chosen role
      trackEvent('server_join', { role });
      hud.toast(`Joined ${s.name} as ${ROLES[role].name}!`);
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
      trackEvent('server_create', { world: worldType, mode });
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
    role, health, mana, vitality, spawn: spawnPoint, timeOfDay: environment.getTime(), inventory: inventory.serialize(), mountId: mount?.def.id ?? null,
  });
  serverApi.save(currentServer.id, data, { edits: data.edits })
    .then(() => { if (!silent) hud.toast('Progress saved to server'); })
    .catch(() => { if (!silent) hud.toast('Cloud save failed'); });
}

// Block accidental refresh while in a world (F5 / Ctrl+R), capture phase so
// it fires even while the chat input has focus.
document.addEventListener('keydown', (e) => {
  if (!running) return;
  if (e.code === 'F5' || ((e.ctrlKey || e.metaKey) && e.code === 'KeyR')) {
    e.preventDefault();
    e.stopPropagation();
    hud.toast('Refresh is disabled in game — use the menu to quit');
  }
}, true);

window.addEventListener('beforeunload', (e) => {
  // browser-chrome refresh/close while in a world: ask for confirmation
  if (running) e.preventDefault();
  if (!currentServer || !world || !player || !inventory) return;
  const data = buildSaveData(world, player, mode, worldType, worldSize, renderDistance, {
    role, health, mana, vitality, spawn: spawnPoint, timeOfDay: environment.getTime(), inventory: inventory.serialize(), mountId: mount?.def.id ?? null,
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
// ---------- settings: camera sensitivity + fullscreen ----------
const SENS_KEY = 'vyrthlands_look_sens';
const sensSlider = document.getElementById('sens-slider') as HTMLInputElement;
const sensValue = document.getElementById('sens-value')!;
let lookSens = Number(localStorage.getItem(SENS_KEY)) || 1;
lookSens = Math.min(2, Math.max(0.2, lookSens));
sensSlider.value = String(Math.round(lookSens * 100));
sensValue.textContent = `${Math.round(lookSens * 100)}%`;

sensSlider.addEventListener('input', () => {
  lookSens = Number(sensSlider.value) / 100;
  sensValue.textContent = `${sensSlider.value}%`;
  localStorage.setItem(SENS_KEY, String(lookSens));
  if (player) player.lookSens = lookSens;
});

// Cross-browser fullscreen (iPad Safari uses the webkit-prefixed API).
const fsDoc = document as any;
const fsEl = document.documentElement as any;
function isFullscreen(): boolean {
  return !!(document.fullscreenElement || fsDoc.webkitFullscreenElement);
}
function rawEnterFs(): void {
  if (isFullscreen()) return;
  const fn = fsEl.requestFullscreen || fsEl.webkitRequestFullscreen;
  if (!fn) return; // iPhone Safari: no element fullscreen — home-screen install instead
  try { const r = fn.call(fsEl); if (r && r.catch) r.catch(() => {}); } catch { /* ignore */ }
}
function rawExitFs(): void {
  const fn = document.exitFullscreen || fsDoc.webkitExitFullscreen;
  if (isFullscreen() && fn) { try { const r = fn.call(document); if (r && r.catch) r.catch(() => {}); } catch { /* ignore */ } }
}

/** Whether the game currently *wants* to be fullscreen (set on world entry,
 *  cleared on quit / manual exit). Drives the self-heal below. */
let fullscreenIntent = false;
function enterFullscreen(): void { fullscreenIntent = true; rawEnterFs(); }
function exitFullscreen(): void { fullscreenIntent = false; rawExitFs(); }

document.getElementById('btn-fullscreen')!.addEventListener('click', () => {
  if (isFullscreen()) exitFullscreen();
  else enterFullscreen();
});

// iPad/Android system swipe gestures (pull-to-refresh, edge swipe) can drop
// fullscreen mid-game. If the game still wants it, re-enter on the next tap —
// the browser only allows re-entering fullscreen from a user gesture. This
// keeps play immersive: it feels like a game app, not a browser tab.
let reFsArmed = false;
function onFsChange(): void {
  reFsArmed = fullscreenIntent && running && isTouch && !isFullscreen();
}
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);
function reFsOnGesture(): void {
  if (reFsArmed && fullscreenIntent && running && !isFullscreen()) {
    reFsArmed = false;
    rawEnterFs();
  }
}
document.addEventListener('touchend', reFsOnGesture, { capture: true, passive: true });
document.addEventListener('pointerup', reFsOnGesture, { capture: true, passive: true });

// Block the browser's pull-to-refresh / overscroll while playing on touch so
// a downward drag can't bounce the page (and drop fullscreen). Touch controls
// already preventDefault on their own zones; this covers stray gestures.
document.addEventListener('touchmove', (e) => {
  if (running && isTouch && !uiOpen && !paused) {
    if (e.cancelable) e.preventDefault();
  }
}, { passive: false });

const btnSound = document.getElementById('btn-sound')!;
sfx.enabled = localStorage.getItem('vyrthlands_muted') !== '1';
btnSound.textContent = `Sound: ${sfx.enabled ? 'On' : 'Off'}`;
btnSound.addEventListener('click', () => {
  sfx.enabled = !sfx.enabled;
  localStorage.setItem('vyrthlands_muted', sfx.enabled ? '0' : '1');
  btnSound.textContent = `Sound: ${sfx.enabled ? 'On' : 'Off'}`;
  if (sfx.enabled) { sfx.unlock(); sfx.click(); }
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
  isLeader = false;
  mobs.remote = false;
  disposeMount();
  running = false;
  exitFullscreen();
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
    mountId: mount?.def.id ?? null,
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
  disposeMount();
  activeRide = null;
  cartMesh.visible = false;
  parkRides = worldType === 'themepark'
    ? themeParkRides({ seed, sizeBlocks: WORLD_SIZES[worldSize] * 16 })
    : [];
  parkAnim.build(parkRides); // spinning wheels/carousels/swings/ship/cups
  if (save) world.applyEdits(save.edits);
  else if (cloudEdits) world.applyEdits(cloudEdits); // joining a friend's already-built world

  const rd = RENDER_DISTANCES[renderDistance];
  worldRenderer = new WorldRenderer(world, scene, atlas, rd);
  environment.setup(worldType, rd);
  environment.setTime(save ? save.timeOfDay : 0.3);
  environment.resetDay();
  camera.far = rd * 16 * 1.6;
  camera.updateProjectionMatrix();

  inventory = new Inventory(mode === 'creative');
  if (save) {
    inventory.load(save.inventory); // creative saves no inventory — kit rebuilds below
  } else if (mode === 'survival') {
    for (const it of ROLES[role].startItems) inventory.add(it.item, it.count, it.durability);
  }
  if (mode === 'creative') {
    // role weapon in hand + every armor set in the pack, best set worn
    const weapons = ROLES[role].startItems.filter((it) => ITEMS[it.item]?.tool);
    const armor = ARMOR_SETS.flatMap((s) => s.pieces);
    inventory.creativeKit(weapons, armor, ARMOR_SETS[ARMOR_SETS.length - 1].pieces);
  }
  hud.bind(inventory);
  invUI.bind(inventory, ROLES[role], stats);

  player = new Player(world);
  player.speedMult = stats.speedMult;
  player.lookSens = lookSens;
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

  // bring back your tamed companion from the save
  if (save?.mountId) {
    const def = enemiesForWorld(worldType).defs.find((m) => m.id === save.mountId);
    if (def?.tameable) createMount(def);
  }

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
  updatePauseInvite();
  titleScreen.classList.add('hidden');
  landingPage.classList.add('hidden');
  serverScreen.classList.add('hidden'); // Play/Join launches from here — hide it too
  pauseMenu.classList.add('hidden');
  if (invUI.isOpen()) invUI.close();
  running = true;
  paused = false;
  uiOpen = false;
  dead = false;
  trackEvent('game_start', { world: worldType, mode, cloud: !!currentServer });
  deathScreen.classList.add('hidden');
  enterFullscreen(); // immersive view while in a world (popped on quit)
  requestPointerLock();
  if (isTouch) hud.toast('Tap = place/use · hold = break · double-tap Jump = fly');
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
  sfx.death();
  if (mount?.riding) dismountMount();
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
  // drop focus from any menu button so a later Enter press can't re-click it
  (document.activeElement as HTMLElement | null)?.blur?.();
  canvas.requestPointerLock();
}

document.addEventListener('pointerlockchange', () => {
  if (isTouch) return;
  const locked = document.pointerLockElement === canvas;
  if (!running) return;
  if (uiOpen) return; // inventory overlay manages its own state
  if (dead) return;   // death screen owns the pause until Respawn
  if (chat.isOpen) return; // chat releases the pointer on purpose — not a pause
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
  if (e.code === 'Space') e.preventDefault(); // never scroll / re-click a focused button
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
  if (e.button === 0 && tryAttackMob()) { // works in both modes — creative kit has a weapon
    mouseButtons.delete(0);
    return;
  }
  if (e.button === 0 && mode === 'creative') breakCooldown = 0;
  if (e.button === 2) {
    placeCooldown = 0;
    // creatures first (mount / feed), then stations / bed, then placing
    if (tryUseCreature()) {
      mouseButtons.delete(2);
      return;
    }
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
  } else if (blockId === Block.RideSeat) {
    startRideAt(pos.x, pos.y, pos.z);
  } else if (blockId === Block.Rail) {
    startRailRide(pos.x, pos.y, pos.z);
  } else if (blockId === Block.Bed) {
    spawnPoint = { x: pos.x, z: pos.z };
    if (environment.isNight()) {
      if (currentServer) {
        // multiplayer: the server echo wakes everyone to morning together
        presence.sendSleep();
        hud.toast('Spawn point set.');
      } else {
        environment.skipToMorning();
        hud.toast('You slept until morning. Spawn point set.');
      }
    } else {
      hud.toast('Spawn point set. You can sleep here at night.');
    }
  }
}

// ---------- theme park rides + player-built rail carts ----------
const _ridePos = new THREE.Vector3();
const _rideTan = new THREE.Vector3();
const _spark = new THREE.Vector3();

function beginPathRide(ride: ParkRide, cart: boolean): void {
  if (activeRide || !player) return;
  const pts = ride.path.map(([px, py, pz]) => new THREE.Vector3(px, py, pz));
  activeRide = { ride, curve: new THREE.CatmullRomCurve3(pts, !!ride.closed, 'centripetal'), t: 0, cart };
  player.velocity.set(0, 0, 0);
  player.keys.clear();
  mouseButtons.clear();
  cartMesh.visible = cart;
  sfx.ride();
  hud.toast(`Riding ${ride.name}! (jump to hop off)`);
}

function startRideAt(x: number, y: number, z: number): void {
  if (activeRide || !player) return;
  let best: ParkRide | null = null;
  let bestD = 4;
  for (const r of parkRides) {
    const d = Math.hypot(r.seat[0] - x, r.seat[1] - y, r.seat[2] - z);
    if (d < bestD) { best = r; bestD = d; }
  }
  if (best) beginPathRide(best, !!best.cart);
}

/** Drop the player at the first spot with standing room at/near a block. */
function placePlayerNear(bx: number, by: number, bz: number): void {
  if (!world || !player) return;
  const clear = (cx: number, cy: number, cz: number) =>
    !world!.isSolidAt(cx, cy + 0.2, cz) && !world!.isSolidAt(cx, cy + 1.4, cz);
  for (let dy = 0; dy <= 4; dy++) {
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      const cx = bx + dx + 0.5, cy = by + dy, cz = bz + dz + 0.5;
      if (clear(cx, cy, cz)) {
        player.position.set(cx, cy, cz);
        return;
      }
    }
  }
  player.position.set(bx + 0.5, by + 4, bz + 0.5); // last resort: pop up above
}

function endRide(finished: boolean): void {
  if (!activeRide || !player) return;
  const r = activeRide.ride;
  // park rides return you to the boarding post; rail carts stop where they are
  if (finished && (r.returnToSeat ?? true)) {
    placePlayerNear(r.seat[0], r.seat[1], r.seat[2]);
  } else if (world) {
    // hopping off mid-track (or a cart stop) must never leave you inside a block
    const p = player.position;
    if (world.isSolidAt(p.x, p.y + 0.2, p.z) || world.isSolidAt(p.x, p.y + 1.4, p.z)) {
      placePlayerNear(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    }
  }
  player.velocity.set(0, 0, 0);
  cartMesh.visible = false;
  hud.toast(finished ? `${r.name} complete!` : 'Hopped off the ride');
  activeRide = null;
}

/** Carry the player along the ride; look stays free. Rides with a motion
 *  rig pin the player to the real moving car instead of the path curve. */
function updateRide(dt: number): void {
  if (!activeRide || !player) return;
  activeRide.t += dt / activeRide.ride.duration;
  if (activeRide.t >= 1) { endRide(true); return; }
  if (player.keys.has('Space') && activeRide.t > 0.04) { endRide(false); return; }
  const m = activeRide.ride.motion;
  if (m) {
    parkAnim.riderPoint(m, _ridePos);
    player.position.set(_ridePos.x, _ridePos.y + 0.45, _ridePos.z);
  } else {
    activeRide.curve.getPoint(activeRide.t, _ridePos);
    player.position.copy(_ridePos);
    if (activeRide.cart) {
      cartMesh.position.set(_ridePos.x, _ridePos.y + 0.25, _ridePos.z);
      activeRide.curve.getTangent(activeRide.t, _rideTan);
      cartMesh.rotation.y = Math.atan2(_rideTan.x, _rideTan.z);
    }
  }
  player.velocity.set(0, 0, 0);
}

/** Follow connected Cart Rail blocks from a starting rail. Allows 1-block
 *  slopes, prefers going straight, stops at dead ends or after 600 pieces. */
function traceRail(sx: number, sy: number, sz: number): { pts: THREE.Vector3[]; closed: boolean } | null {
  if (!world) return null;
  const isRail = (x: number, y: number, z: number) => world!.getBlock(x, y, z) === Block.Rail;
  const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const dirs: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const step = (x: number, y: number, z: number, dx: number, dz: number) => {
    for (const dy of [0, 1, -1]) {
      if (isRail(x + dx, y + dy, z + dz)) return { x: x + dx, y: y + dy, z: z + dz };
    }
    return null;
  };
  let dir: [number, number] | null = null;
  for (const [dx, dz] of dirs) if (step(sx, sy, sz, dx, dz)) { dir = [dx, dz]; break; }
  if (!dir) return null;
  const pts = [new THREE.Vector3(sx + 0.5, sy, sz + 0.5)];
  const seen = new Set([keyOf(sx, sy, sz)]);
  let cur = { x: sx, y: sy, z: sz };
  for (let i = 0; i < 600; i++) {
    const options: ReadonlyArray<readonly [number, number]> =
      [dir, ...dirs.filter(([dx, dz]) => !(dx === dir![0] && dz === dir![1]) && !(dx === -dir![0] && dz === -dir![1]))];
    let moved = false;
    for (const [dx, dz] of options) {
      const n = step(cur.x, cur.y, cur.z, dx, dz);
      if (!n) continue;
      if (n.x === sx && n.y === sy && n.z === sz && pts.length > 3) {
        return { pts, closed: true }; // came back around — full circuit
      }
      if (seen.has(keyOf(n.x, n.y, n.z))) continue;
      seen.add(keyOf(n.x, n.y, n.z));
      pts.push(new THREE.Vector3(n.x + 0.5, n.y, n.z + 0.5));
      dir = [dx, dz];
      cur = n;
      moved = true;
      break;
    }
    if (!moved) break;
  }
  return pts.length >= 2 ? { pts, closed: false } : null;
}

function startRailRide(x: number, y: number, z: number): void {
  if (activeRide || !player) return;
  const traced = traceRail(x, y, z);
  if (!traced) {
    hud.toast('Connect more Cart Rail pieces to make a track');
    return;
  }
  let length = 0;
  for (let i = 1; i < traced.pts.length; i++) length += traced.pts[i].distanceTo(traced.pts[i - 1]);
  beginPathRide({
    name: 'Rail Cart',
    seat: [x, y, z],
    path: traced.pts.map((p) => [p.x, p.y + 0.1, p.z] as [number, number, number]),
    duration: Math.max(2, length / 8), // ~8 blocks per second
    closed: traced.closed,
    returnToSeat: false,
  }, true);
}

// ---------- tamed mounts (feed a wild animal, rare chance to tame, then ride) ----------
function createMount(def: EnemyDef, pos?: THREE.Vector3): void {
  disposeMount();
  const built = buildModel(def.model, def.scale);
  scene.add(built.group);
  mount = {
    def, group: built.group, rig: built.rig,
    pos: pos ?? (player ? player.position.clone().add(new THREE.Vector3(1.5, 0, 1.5)) : new THREE.Vector3()),
    riding: false, walkPhase: 0,
  };
  mount.group.position.copy(mount.pos);
}

function disposeMount(): void {
  if (!mount) return;
  if (mount.riding && player) { player.mountSpeed = 0; player.eyeOffset = 0; }
  scene.remove(mount.group);
  mount.group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  mount = null;
}

function tameMob(mob: Mob): void {
  mob.center(_spark);
  particles.burst(_spark.x, _spark.y, _spark.z, 0x8df06a, 24, 3);
  sfx.tamed();
  mobs.removeById(mob.id);
  if (currentServer) presence.sendTame(mob.id, mob.def.name);
  createMount(mob.def, mob.pos.clone());
  hud.toast(`You tamed the ${mob.def.name}! Use it again to ride.`);
  chat.add(null, `You tamed a ${mob.def.name}! It will follow you — use it to ride.`);
}

function mountUp(): void {
  if (!mount || !player) return;
  mount.riding = true;
  player.mountSpeed = mount.def.rideSpeed ?? 1.8;
  player.eyeOffset = Math.min(1.2, Math.max(0.4, mount.def.scale * 0.55));
  sfx.ride();
  hud.toast(`Riding the ${mount.def.name} — Shift / ▼ to dismount`);
}

function dismountMount(): void {
  if (!mount || !player) return;
  mount.riding = false;
  player.mountSpeed = 0;
  player.eyeOffset = 0;
  mount.pos.copy(player.position).add(new THREE.Vector3(1.5, 0, 1.5));
}

/** Use-action on a creature: mount your companion, or feed a wild tameable.
 *  Returns true when the action was handled (skip placing/attacking). */
function tryUseCreature(origin?: THREE.Vector3, dir?: THREE.Vector3): boolean {
  if (!player || !inventory || !world) return false;
  const o = origin ?? player.eyePosition(new THREE.Vector3());
  const d = dir ?? player.lookDirection(new THREE.Vector3());

  // your companion: aim near it and use = saddle up
  if (mount && !mount.riding) {
    const to = mount.pos.clone().add(new THREE.Vector3(0, mount.def.scale * 0.6, 0)).sub(o);
    const along = to.dot(d);
    if (along > 0 && along < 4.5) {
      const perp = Math.sqrt(Math.max(0, to.lengthSq() - along * along));
      if (perp < 1.5) { mountUp(); return true; }
    }
  }

  // wild tameable: feed it (any food or leaf fiber), rare chance to tame
  const mob = mobs.rayPick(o, d, 3.5);
  if (mob?.def.tameable) {
    const slot = inventory.selectedSlot();
    const isFood = slot != null && (ITEMS[slot.item]?.food != null || slot.item === Item.LeafFiber);
    if (!isFood) {
      hud.toast(`${mob.def.name} looks tameable — use food on it!`);
      return true;
    }
    inventory.consumeSelected();
    viewModel.triggerSwing();
    if (Math.random() < TAME_CHANCE) tameMob(mob);
    else hud.toast(`${mob.def.name} munches happily… keep feeding to tame it`);
    return true;
  }
  return false;
}

/** Per-frame companion behavior: glued under you while riding, follows otherwise. */
function updateMount(dt: number): void {
  if (!mount || !player || !world) return;
  if (mount.riding) {
    if (player.keys.has('ShiftLeft') || player.keys.has('ShiftRight')) {
      dismountMount();
      return;
    }
    mount.pos.copy(player.position);
    mount.group.position.copy(player.position);
    mount.group.position.y -= 0.15;
    mount.group.rotation.y = player.yaw;
    animateMount(Math.hypot(player.velocity.x, player.velocity.z), dt);
    return;
  }
  // follow at heel; teleport if left far behind
  const tx = player.position.x - Math.sin(player.yaw + 2.4) * 2.2;
  const tz = player.position.z - Math.cos(player.yaw + 2.4) * 2.2;
  const dx = tx - mount.pos.x, dz = tz - mount.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 28) {
    mount.pos.set(tx, player.position.y, tz);
  } else if (dist > 1.2) {
    const sp = Math.min(dist * 2, mount.def.speed + 2.5);
    mount.pos.x += (dx / dist) * sp * dt;
    mount.pos.z += (dz / dist) * sp * dt;
    mount.group.rotation.y = Math.atan2(-dx, -dz);
  }
  const fx = Math.floor(mount.pos.x), fz = Math.floor(mount.pos.z);
  const sy = world.inBounds(fx, 0, fz) ? world.surfaceY(fx, fz) : player.position.y;
  mount.pos.y += (sy - mount.pos.y) * Math.min(1, 10 * dt);
  mount.group.position.copy(mount.pos);
  animateMount(dist > 1.2 ? 2.5 : 0, dt);
}

function animateMount(speed: number, dt: number): void {
  if (!mount) return;
  mount.walkPhase += dt * (2.5 + speed * 2.2);
  const stride = Math.sin(mount.walkPhase) * Math.min(1, speed / 1.4) * 0.55;
  mount.rig.legs.forEach((l, i) => { l.rotation.x = i % 2 === 0 ? stride : -stride; });
  for (let i = 0; i < mount.rig.wings.length; i++) {
    mount.rig.wings[i].rotation.z = (i === 0 ? 1 : -1) * Math.sin(performance.now() / 90) * 0.5;
  }
  if (mount.rig.tail) mount.rig.tail.rotation.y = Math.sin(mount.walkPhase * 0.7) * 0.25;
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
  sfx.eat();
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
  sfx.place();
  inventory.consumeSelected();
  viewModel.triggerSwing();
}

function heldDamage(): number {
  const w = inventory?.attackWeapon();
  return (w ? ITEMS[w.item]?.tool?.damage : undefined) ?? 1;
}

function tryAttackMob(aimOrigin?: THREE.Vector3, aimDir?: THREE.Vector3): boolean {
  if (!player || !inventory || meleeCooldown > 0) return false;
  // default: attack along the crosshair; touch passes the tapped ray instead
  if (aimOrigin && aimDir) {
    eyePos.copy(aimOrigin);
    lookDir.copy(aimDir);
  } else {
    player.eyePosition(eyePos);
    player.lookDirection(lookDir);
  }
  // held tool, or the equipped WEAPON slot as the default basic attack
  const weapon = inventory.attackWeapon();
  const tool = weapon ? ITEMS[weapon.item]?.tool : null;
  const kind = tool?.kind ?? 'hand';
  const damage = tool?.damage ?? 1;

  if (kind === 'gun' || kind === 'staff') {
    const color = weapon?.item === Item.Wand ? 0x8df06a : kind === 'gun' ? 0xffd070 : 0x7df0ff;
    const speed = kind === 'gun' ? 34 : 24;
    projectiles.fire(eyePos, lookDir, speed, damage * stats.rangedMult, color);
    if (currentServer) {
      // friends see the shot fly (cosmetic — damage resolves on my screen)
      presence.sendShot(eyePos.x, eyePos.y, eyePos.z, lookDir.x, lookDir.y, lookDir.z, speed, 0, color, false);
    }
    sfx.skill();
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
    mob.center(_spark);
    particles.burst(_spark.x, _spark.y, _spark.z, 0xff5a4a, 8, 2.6);
    sfx.hitMob();
    meleeCooldown = kind === 'sword' ? 0.42 : 0.55;
  }
  viewModel.triggerSwing();
  if (weapon && inventory.damageToolAt(weapon.ref)) {
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
  if (health > 0) sfx.hurt();
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
  sfx.skill();
  player.eyePosition(_spark);
  particles.burst(_spark.x, _spark.y - 0.4, _spark.z, 0x7df0ff, 16, 2.4);
  mana = Math.max(0, mana - cost);
  skillCooldowns[index] = skill.cooldown;
  hud.setMana(mana);
  updateSkillHud();
}

function finishBreak(x: number, y: number, z: number, blockId: number): void {
  if (!world || !inventory) return;
  particles.burst(x + 0.5, y + 0.5, z + 0.5, blockColor(blockId), 14, 3.5);
  sfx.breakBlock();
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
        particles.burst(x + 0.5, y + 0.5, z + 0.5, blockColor(blockId), 12, 3.5);
        sfx.breakBlock();
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

  // fall damage: hurts past 3.5 blocks (6 mounted — the animal absorbs it),
  // water landings are safe
  const fell = player.consumeLanding();
  const fallLimit = player.mountSpeed > 0 ? 6 : 3.5;
  if (fell > fallLimit && !feetInWater && !inLava) {
    applyDamage((fell - fallLimit) * (player.mountSpeed > 0 ? 0.03 : 0.06));
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
  vitality = Math.max(0, vitality - dt / 600 - (player.sprinting ? dt / 90 : 0));
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

// Touch aiming: target the block under the FINGER, not the crosshair.
// While a gesture finger is down, the interaction ray comes from here.
const touchRaycaster = new THREE.Raycaster();
let touchAim: { x: number; y: number } | null = null;

function hitFromScreen(sx: number, sy: number): ReturnType<typeof raycastVoxel> {
  if (!world) return null;
  touchRaycaster.setFromCamera(
    new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1),
    camera
  );
  return raycastVoxel(world, touchRaycaster.ray.origin, touchRaycaster.ray.direction, REACH + 1.5);
}

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
    if (player) {
      player.touchMove = { f: -dy / R, s: dx / R };
      player.touchSprint = len >= R * 0.95; // push to the rim to sprint
    }
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
        if (player) {
          player.touchMove = { f: 0, s: 0 };
          player.touchSprint = false;
        }
      }
    }
  };
  zone.addEventListener('touchend', endJoy);
  zone.addEventListener('touchcancel', endJoy);

  // --- look / camera + Minecraft-style gestures (whole screen) ---
  // Tap = use/place (attack a mob if one is in reach). Press & hold = break
  // blocks (keeps breaking while held, even if you drag to aim). Drag = look.
  const look = document.getElementById('look-zone')!;
  const HOLD_MS = 280;     // press this long to start breaking
  const TAP_SLOP = 14;     // px of movement that turns a tap into a look-drag
  let lookId: number | null = null;
  let lx = 0, ly = 0;          // last touch position (camera deltas)
  let downX = 0, downY = 0;    // touch start (tap detection)
  let downT = 0;
  let lookDragged = false;
  let holdTimer = 0;
  let holdBreaking = false;

  const stopBreaking = () => {
    holdBreaking = false;
    mouseButtons.delete(0);
    breakProgress = 0;
    hud.setBreakProgress(0);
  };
  /** Quick tap: attack mob under the finger, use a station, eat, or place. */
  const tapAction = (sx: number, sy: number) => {
    if (!world || !player) return;
    // aim everything at the tapped point, not the crosshair
    currentHit = hitFromScreen(sx, sy);
    touchRaycaster.setFromCamera(
      new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1),
      camera
    );
    if (tryUseCreature(touchRaycaster.ray.origin, touchRaycaster.ray.direction)) return;
    if (tryAttackMob(touchRaycaster.ray.origin, touchRaycaster.ray.direction)) return;
    if (currentHit) {
      const target = world.getBlock(currentHit.block.x, currentHit.block.y, currentHit.block.z);
      if (BLOCKS[target]?.interactable) { interactWith(target, currentHit.block); return; }
    }
    if (tryEat()) return;
    tryPlace();
  };

  look.addEventListener('touchstart', (e) => {
    if (lookId !== null) { e.preventDefault(); return; } // one finger steers
    const t = e.changedTouches[0];
    lookId = t.identifier;
    lx = downX = t.clientX;
    ly = downY = t.clientY;
    downT = performance.now();
    lookDragged = false;
    touchAim = { x: t.clientX, y: t.clientY }; // aim at the finger from now on
    window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      if (!running || paused || uiOpen || dead) return;
      holdBreaking = true;
      breakCooldown = 0;
      mouseButtons.add(0);
    }, HOLD_MS);
    e.preventDefault();
  }, { passive: false });
  look.addEventListener('touchmove', (e) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== lookId) continue;
      // while breaking, the finger drags the AIM; otherwise it drags the camera
      if (player && running && !paused && !uiOpen && !holdBreaking) {
        player.handleMouseMove((t.clientX - lx) * 1.8, (t.clientY - ly) * 1.8);
      }
      lx = t.clientX; ly = t.clientY;
      if (touchAim) { touchAim.x = t.clientX; touchAim.y = t.clientY; }
      if (!lookDragged && Math.hypot(t.clientX - downX, t.clientY - downY) > TAP_SLOP) {
        lookDragged = true;
        // dragging before the hold fires is just looking around — once
        // breaking has started, dragging re-aims while it keeps breaking
        if (!holdBreaking) window.clearTimeout(holdTimer);
      }
    }
    e.preventDefault();
  }, { passive: false });
  const endLook = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== lookId) continue;
      lookId = null;
      touchAim = null;
      window.clearTimeout(holdTimer);
      const wasBreaking = holdBreaking;
      stopBreaking();
      if (!wasBreaking && !lookDragged && performance.now() - downT < HOLD_MS &&
          running && !paused && !uiOpen && !dead) {
        tapAction(t.clientX, t.clientY);
      }
    }
  };
  look.addEventListener('touchend', endLook);
  look.addEventListener('touchcancel', endLook);

  // --- jump / fly (Minecraft-style: double-tap jump toggles fly in creative,
  //     while flying jump ascends and the extra button descends) ---
  const hold = (id: string, down: () => void, up: () => void) => {
    const el = document.getElementById(id)!;
    el.addEventListener('touchstart', (e) => { down(); e.preventDefault(); }, { passive: false });
    el.addEventListener('touchend', (e) => { up(); e.preventDefault(); }, { passive: false });
    el.addEventListener('touchcancel', () => up());
  };
  let lastJumpTap = 0;
  const jumpBtn = document.getElementById('tbtn-jump')!;
  jumpBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!running || paused || uiOpen || !player) return;
    const t = performance.now();
    if (t - lastJumpTap < 300 && (mode === 'creative' || player.flying)) {
      player.toggleFly();
      hud.toast(player.flying ? 'Flying — double-tap Jump to land' : 'Flying off');
    }
    lastJumpTap = t;
    player.keys.add('Space');
  }, { passive: false });
  const jumpUp = () => player?.keys.delete('Space');
  jumpBtn.addEventListener('touchend', (e) => { jumpUp(); e.preventDefault(); }, { passive: false });
  jumpBtn.addEventListener('touchcancel', jumpUp);
  hold('tbtn-down', () => player?.keys.add('ShiftLeft'), () => player?.keys.delete('ShiftLeft'));

  document.getElementById('tbtn-chat')!.addEventListener('click', () => openChatInput());
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

  // animate the role-button avatar previews while their menus are open
  if (!titleScreen.classList.contains('hidden') || !roleModal.classList.contains('hidden')) {
    rolePreviews.update(dt);
  }
  // landing page: live hero diorama + role-card characters + world scenes
  if (!landingPage.classList.contains('hidden')) {
    heroScene?.update(dt);
    rolePreviews.update(dt);
    worldPreviews.update(dt);
  }

  if (!running || !world || !player || !worldRenderer) {
    renderer.render(scene, camera);
    return;
  }

  if (!paused) {
    parkAnim.update(dt); // attractions keep moving even when nobody rides
    if (activeRide) updateRide(dt);
    else if (!uiOpen) player.update(dt);
    updateMount(dt);
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
    mobs.targets = currentServer ? remotes.positions() : [];
    if (!currentServer || isLeader) {
      mobs.update(dt, world, player.position, environment.isNight(), projectiles);
    } else {
      mobs.remoteUpdate(dt); // follower: mirror the leader's mobs
    }

    // cloud autosave + presence position sync + leader mob/clock broadcast
    if (currentServer) {
      autosaveT += dt;
      posSyncT += dt;
      mobSyncT += dt;
      if (autosaveT > 25) { autosaveT = 0; saveCloud(true); }
      if (posSyncT > 0.25) {
        posSyncT = 0;
        presence.sendPos(player.position.x, player.position.y, player.position.z, player.yaw, role);
      }
      if (isLeader && mobSyncT > 0.3) {
        mobSyncT = 0;
        presence.sendMobs(mobs.snapshot(), environment.getTime());
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
  if (uiOpen) {
    currentHit = null;
  } else if (isTouch && touchAim) {
    // touch gesture in progress: target the block under the finger
    currentHit = hitFromScreen(touchAim.x, touchAim.y);
  } else {
    currentHit = raycastVoxel(world, eyePos, lookDir, REACH);
  }
  if (currentHit) {
    highlight.visible = true;
    highlight.position.set(
      currentHit.block.x + 0.5, currentHit.block.y + 0.5, currentHit.block.z + 0.5
    );
  } else {
    highlight.visible = false;
  }

  if (!paused && !uiOpen && !activeRide) updateInteraction(dt);

  particles.update(dt);
  hud.setCoords(player.position.x, player.position.y, player.position.z);

  clockT += dt;
  if (clockT > 0.5) {
    clockT = 0;
    hud.setTimeOfDay(environment.getTime(), environment.isNight(), environment.getDay());
  }
  if (isTouch) {
    touchControls.classList.toggle('hidden', !running || paused || uiOpen);
    // descend button doubles as the dismount button while riding
    touchControls.classList.toggle('flying', player.flying || !!mount?.riding);
  }
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
