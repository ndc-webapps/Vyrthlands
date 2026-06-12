import { CHUNK_SIZE, WORLD_HEIGHT } from '../../config';
import { Block } from '../../blocks';

export type WorldType =
  | 'flat' | 'natural' | 'prehistoric' | 'battlefront' | 'zombie'
  | 'medieval' | 'cyberpunk' | 'alien' | 'skyislands' | 'underworld'
  | 'frozen' | 'pirate' | 'haunted' | 'wasteland' | 'mythology' | 'themepark';

export interface GenContext {
  seed: number;
  sizeBlocks: number; // world is sizeBlocks x sizeBlocks
}

export interface WorldGenerator {
  type: string;
  name: string;
  waterLevel: number; // y of highest water block; <0 disables water
  /** Fill one 16 x WORLD_HEIGHT x 16 chunk column. Structures must stay within the chunk. */
  fillChunk(data: Uint8Array, cx: number, cz: number, ctx: GenContext): void;
}

export function setL(data: Uint8Array, lx: number, y: number, lz: number, id: number): void {
  if (y < 0 || y >= WORLD_HEIGHT) return;
  data[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = id;
}

export function getL(data: Uint8Array, lx: number, y: number, lz: number): number {
  if (y < 0 || y >= WORLD_HEIGHT) return Block.Air;
  return data[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
}

/** Standard ground column: deep stone, sub-layer, surface block. */
export function fillColumn(
  data: Uint8Array, lx: number, lz: number, height: number,
  surface: number, sub: number, deep: number = Block.Stone, subDepth = 3
): void {
  for (let y = 0; y <= height; y++) {
    let id = deep;
    if (y === height) id = surface;
    else if (y >= height - subDepth) id = sub;
    setL(data, lx, y, lz, id);
  }
}

/**
 * Place a small tree fully inside the chunk (trunk must be at local 2..13).
 * variant: 'oak' rounded canopy | 'palm' tall bare trunk with top fan.
 */
export function placeTree(
  data: Uint8Array, lx: number, y: number, lz: number,
  rand: number, variant: 'oak' | 'palm' = 'oak'
): void {
  if (lx < 2 || lx > 13 || lz < 2 || lz > 13) return;
  if (variant === 'palm') {
    const h = 5 + Math.floor(rand * 3);
    for (let i = 0; i < h; i++) setL(data, lx, y + i, lz, Block.Wood);
    const ty = y + h;
    setL(data, lx, ty, lz, Block.Leaves);
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      setL(data, lx + dx, ty, lz + dz, Block.Leaves);
      setL(data, lx + dx * 2, ty - 1, lz + dz * 2, Block.Leaves);
    }
    return;
  }
  const trunkH = 4 + Math.floor(rand * 2);
  for (let i = 0; i < trunkH; i++) setL(data, lx, y + i, lz, Block.Wood);
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = trunkH - 2; dy <= trunkH + 1; dy++) {
        const dist = Math.abs(dx) + Math.abs(dz) + Math.abs(dy - trunkH);
        if (dist > 3) continue;
        if (getL(data, lx + dx, y + dy, lz + dz) === Block.Air) {
          setL(data, lx + dx, y + dy, lz + dz, Block.Leaves);
        }
      }
    }
  }
}
