import {
  CHUNK_SIZE, WORLD_CHUNKS_X, WORLD_CHUNKS_Z, WORLD_HEIGHT,
  WORLD_SIZE_X, WORLD_SIZE_Z, WATER_LEVEL,
} from '../config';
import { Block, isSolid } from '../blocks';
import { fbm2, hash3 } from './noise';

export class World {
  seed: number;
  // One flat Uint8Array per chunk column (16 x WORLD_HEIGHT x 16)
  private chunks: Uint8Array[] = [];
  // Player edits on top of generated terrain, "x,y,z" -> block id
  edits = new Map<string, number>();
  dirtyChunks = new Set<number>();

  constructor(seed: number) {
    this.seed = seed;
    for (let i = 0; i < WORLD_CHUNKS_X * WORLD_CHUNKS_Z; i++) {
      this.chunks.push(new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT));
    }
    this.generate();
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < WORLD_SIZE_X && y >= 0 && y < WORLD_HEIGHT && z >= 0 && z < WORLD_SIZE_Z;
  }

  chunkIndex(cx: number, cz: number): number {
    return cz * WORLD_CHUNKS_X + cx;
  }

  getBlock(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return Block.Air;
    const cx = x >> 4, cz = z >> 4;
    const lx = x & 15, lz = z & 15;
    return this.chunks[this.chunkIndex(cx, cz)][(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
  }

  setBlock(x: number, y: number, z: number, id: number, recordEdit = true): void {
    if (!this.inBounds(x, y, z)) return;
    const cx = x >> 4, cz = z >> 4;
    const lx = x & 15, lz = z & 15;
    this.chunks[this.chunkIndex(cx, cz)][(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = id;
    if (recordEdit) this.edits.set(`${x},${y},${z}`, id);
    this.dirtyChunks.add(this.chunkIndex(cx, cz));
    // Neighbor chunks need remesh if on a border
    if (lx === 0 && cx > 0) this.dirtyChunks.add(this.chunkIndex(cx - 1, cz));
    if (lx === 15 && cx < WORLD_CHUNKS_X - 1) this.dirtyChunks.add(this.chunkIndex(cx + 1, cz));
    if (lz === 0 && cz > 0) this.dirtyChunks.add(this.chunkIndex(cx, cz - 1));
    if (lz === 15 && cz < WORLD_CHUNKS_Z - 1) this.dirtyChunks.add(this.chunkIndex(cx, cz + 1));
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    return isSolid(this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
  }

  applyEdits(edits: Record<string, number>): void {
    for (const key of Object.keys(edits)) {
      const [x, y, z] = key.split(',').map(Number);
      this.setBlock(x, y, z, edits[key], true);
    }
  }

  /** Surface height at column for spawning (top-most solid block + 1). */
  surfaceY(x: number, z: number): number {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (isSolid(this.getBlock(x, y, z))) return y + 1;
    }
    return WATER_LEVEL + 2;
  }

  private generate(): void {
    const s = this.seed;
    for (let x = 0; x < WORLD_SIZE_X; x++) {
      for (let z = 0; z < WORLD_SIZE_Z; z++) {
        // --- base terrain ---
        const h = fbm2(x / 46, z / 46, s, 4);
        const height = Math.floor(14 + h * 22); // ~14..36
        for (let y = 0; y <= height; y++) {
          let id: number = Block.Stone;
          if (y === height) id = height <= WATER_LEVEL + 1 ? Block.Sand : Block.Grass;
          else if (y >= height - 3) id = height <= WATER_LEVEL + 1 ? Block.Sand : Block.Dirt;
          this.setBlock(x, y, z, id, false);
        }
        // water fill
        for (let y = height + 1; y <= WATER_LEVEL; y++) {
          this.setBlock(x, y, z, Block.Water, false);
        }

        // --- floating islands (the twist) ---
        const island = fbm2(x / 30 + 100, z / 30 + 100, s + 777, 3);
        if (island > 0.62) {
          const strength = (island - 0.62) / 0.38; // 0..1
          const centerY = 48 + Math.floor(fbm2(x / 60, z / 60, s + 999, 2) * 14);
          const thickness = Math.max(1, Math.floor(strength * 9));
          const top = centerY + Math.floor(thickness * 0.35);
          const bottom = centerY - Math.floor(thickness * 0.65);
          for (let y = bottom; y <= top && y < WORLD_HEIGHT; y++) {
            let id: number = Block.Stone;
            if (y === top) id = Block.Grass;
            else if (y >= top - 2) id = Block.Dirt;
            else if (hash3(x, y, z, s + 31) > 0.965) id = Block.Crystal; // glowing veins
            this.setBlock(x, y, z, id, false);
          }
        }
      }
    }

    // --- trees (sparse, on grass) ---
    for (let x = 2; x < WORLD_SIZE_X - 2; x++) {
      for (let z = 2; z < WORLD_SIZE_Z - 2; z++) {
        if (hash3(x, 0, z, s + 555) < 0.992) continue;
        // find grass surface
        for (let y = WORLD_HEIGHT - 8; y > WATER_LEVEL; y--) {
          if (this.getBlock(x, y, z) === Block.Grass && this.getBlock(x, y + 1, z) === Block.Air) {
            this.placeTree(x, y + 1, z);
            break;
          }
        }
      }
    }
    this.dirtyChunks.clear();
  }

  private placeTree(x: number, y: number, z: number): void {
    const trunkH = 4;
    for (let i = 0; i < trunkH; i++) this.setBlock(x, y + i, z, Block.Wood, false);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = trunkH - 2; dy <= trunkH + 1; dy++) {
          const dist = Math.abs(dx) + Math.abs(dz) + Math.abs(dy - trunkH);
          if (dist > 3) continue;
          if (this.getBlock(x + dx, y + dy, z + dz) === Block.Air) {
            this.setBlock(x + dx, y + dy, z + dz, Block.Leaves, false);
          }
        }
      }
    }
  }
}
