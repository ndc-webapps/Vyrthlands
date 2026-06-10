import { SAVE_KEY } from './config';
import { World } from './world/world';
import { Player } from './player';
import { GameMode } from './types';

export interface SaveData {
  seed: number;
  mode: GameMode;
  edits: Record<string, number>;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
}

export function saveWorld(world: World, player: Player, mode: GameMode): boolean {
  try {
    const data: SaveData = {
      seed: world.seed,
      mode,
      edits: Object.fromEntries(world.edits),
      player: {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        yaw: player.yaw,
        pitch: player.pitch,
      },
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (typeof data.seed !== 'number' || typeof data.edits !== 'object') return null;
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
