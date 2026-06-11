import { SAVE_KEY, WorldSizeKey, RenderDistanceKey } from './config';
import { World } from './world/world';
import { WorldType } from './world/generators';
import { Player } from './player';
import { GameMode } from './types';
import { RoleId } from './roles';

export interface SaveData {
  seed: number;
  worldType: WorldType;
  worldSize: WorldSizeKey;
  renderDistance: RenderDistanceKey;
  mode: GameMode;
  role: RoleId;
  edits: Record<string, number>;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  health: number;
  mana: number;
  vitality?: number;
  spawn: { x: number; z: number } | null;
  timeOfDay: number;
  inventory: unknown;
}

export interface SaveExtras {
  role: RoleId;
  health: number;
  mana: number;
  vitality?: number;
  spawn: { x: number; z: number } | null;
  timeOfDay: number;
  inventory: unknown;
}

/** Build the full save payload (used for both localStorage and cloud saves). */
export function buildSaveData(
  world: World, player: Player, mode: GameMode,
  worldType: WorldType, worldSize: WorldSizeKey, renderDistance: RenderDistanceKey,
  extras: SaveExtras
): SaveData {
  return {
    seed: world.seed,
    worldType,
    worldSize,
    renderDistance,
    mode,
    role: extras.role,
    edits: Object.fromEntries(world.edits),
    player: {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: player.yaw,
      pitch: player.pitch,
    },
    health: extras.health,
    mana: extras.mana,
    vitality: extras.vitality ?? 1,
    spawn: extras.spawn,
    timeOfDay: extras.timeOfDay,
    inventory: extras.inventory,
  };
}

export function saveWorld(
  world: World, player: Player, mode: GameMode,
  worldType: WorldType, worldSize: WorldSizeKey, renderDistance: RenderDistanceKey,
  extras: SaveExtras
): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(buildSaveData(world, player, mode, worldType, worldSize, renderDistance, extras)));
    return true;
  } catch {
    return false;
  }
}

/** Validate/normalize a cloud-loaded save (same defaults as local). */
export function normalizeSave(data: SaveData | null): SaveData | null {
  if (!data || typeof data.seed !== 'number' || typeof data.edits !== 'object') return null;
  if (!data.worldType) data.worldType = 'natural';
  if (!data.worldSize) data.worldSize = 'medium';
  if (!data.renderDistance) data.renderDistance = 'normal';
  if (!data.role) data.role = 'swordsman';
  if (typeof data.health !== 'number') data.health = 1;
  if (typeof data.mana !== 'number') data.mana = 1;
  if (typeof data.timeOfDay !== 'number') data.timeOfDay = 0.3;
  return data;
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (typeof data.seed !== 'number' || typeof data.edits !== 'object') return null;
    if (!data.worldType) data.worldType = 'natural';
    if (!data.worldSize) data.worldSize = 'medium';
    if (!data.renderDistance) data.renderDistance = 'normal';
    if (!data.role) data.role = 'swordsman';
    if (typeof data.health !== 'number') data.health = 1;
    if (typeof data.mana !== 'number') data.mana = 1;
    if (typeof data.timeOfDay !== 'number') data.timeOfDay = 0.3;
    return data;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
