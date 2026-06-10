import { CHUNK_SIZE, WORLD_HEIGHT } from '../config';
import { Block, isSolid } from '../blocks';
import { WorldGenerator, GenContext } from './generators';
import { decorateOres } from './oreGenerator';

/**
 * Chunked voxel world. Chunk columns (16 x WORLD_HEIGHT x 16 flat Uint8Array)
 * are generated lazily on first access, so huge worlds cost nothing upfront.
 * Player edits are stored as a diff and re-applied when a chunk regenerates.
 */
export class World {
  seed: number;
  sizeChunks: number;
  sizeBlocks: number;
  waterLevel: number;
  generator: WorldGenerator;

  private chunks = new Map<number, Uint8Array>();
  /** Player edits, "x,y,z" -> block id (the save diff). */
  edits = new Map<string, number>();
  /** Edits grouped by chunk for fast re-apply on lazy generation. */
  private editsByChunk = new Map<number, Map<string, number>>();
  dirtyChunks = new Set<number>();

  private genCtx: GenContext;

  constructor(seed: number, generator: WorldGenerator, sizeChunks: number) {
    this.seed = seed;
    this.generator = generator;
    this.sizeChunks = sizeChunks;
    this.sizeBlocks = sizeChunks * CHUNK_SIZE;
    this.waterLevel = generator.waterLevel;
    this.genCtx = { seed, sizeBlocks: this.sizeBlocks };
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < this.sizeBlocks && y >= 0 && y < WORLD_HEIGHT && z >= 0 && z < this.sizeBlocks;
  }

  chunkInBounds(cx: number, cz: number): boolean {
    return cx >= 0 && cx < this.sizeChunks && cz >= 0 && cz < this.sizeChunks;
  }

  chunkKey(cx: number, cz: number): number {
    return cz * this.sizeChunks + cx;
  }

  /** Get (generating if needed) the chunk data array. */
  getChunk(cx: number, cz: number): Uint8Array {
    const key = this.chunkKey(cx, cz);
    let data = this.chunks.get(key);
    if (!data) {
      data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
      this.generator.fillChunk(data, cx, cz, this.genCtx);
      decorateOres(data, cx, cz, this.seed);
      // re-apply saved edits for this chunk
      const chunkEdits = this.editsByChunk.get(key);
      if (chunkEdits) {
        for (const [k, id] of chunkEdits) {
          const [x, y, z] = k.split(',').map(Number);
          data[(y * CHUNK_SIZE + (z & 15)) * CHUNK_SIZE + (x & 15)] = id;
        }
      }
      this.chunks.set(key, data);
    }
    return data;
  }

  getBlock(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return Block.Air;
    const data = this.getChunk(x >> 4, z >> 4);
    return data[(y * CHUNK_SIZE + (z & 15)) * CHUNK_SIZE + (x & 15)];
  }

  setBlock(x: number, y: number, z: number, id: number, recordEdit = true): void {
    if (!this.inBounds(x, y, z)) return;
    const cx = x >> 4, cz = z >> 4;
    const data = this.getChunk(cx, cz);
    data[(y * CHUNK_SIZE + (z & 15)) * CHUNK_SIZE + (x & 15)] = id;
    if (recordEdit) {
      const k = `${x},${y},${z}`;
      this.edits.set(k, id);
      const key = this.chunkKey(cx, cz);
      let m = this.editsByChunk.get(key);
      if (!m) { m = new Map(); this.editsByChunk.set(key, m); }
      m.set(k, id);
    }
    this.dirtyChunks.add(this.chunkKey(cx, cz));
    const lx = x & 15, lz = z & 15;
    if (lx === 0 && cx > 0) this.dirtyChunks.add(this.chunkKey(cx - 1, cz));
    if (lx === 15 && cx < this.sizeChunks - 1) this.dirtyChunks.add(this.chunkKey(cx + 1, cz));
    if (lz === 0 && cz > 0) this.dirtyChunks.add(this.chunkKey(cx, cz - 1));
    if (lz === 15 && cz < this.sizeChunks - 1) this.dirtyChunks.add(this.chunkKey(cx, cz + 1));
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    return isSolid(this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
  }

  applyEdits(edits: Record<string, number>): void {
    for (const key of Object.keys(edits)) {
      const [x, y, z] = key.split(',').map(Number);
      if (!this.inBounds(x, y, z)) continue;
      const k = `${x},${y},${z}`;
      this.edits.set(k, edits[key]);
      const ck = this.chunkKey(x >> 4, z >> 4);
      let m = this.editsByChunk.get(ck);
      if (!m) { m = new Map(); this.editsByChunk.set(ck, m); }
      m.set(k, edits[key]);
      // if the chunk is already generated, write through
      if (this.chunks.has(ck)) {
        this.setBlock(x, y, z, edits[key], false);
      }
    }
  }

  /** Surface height at column for spawning (top-most solid block + 1). */
  surfaceY(x: number, z: number): number {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (isSolid(this.getBlock(x, y, z))) return y + 1;
    }
    return Math.max(this.waterLevel + 2, 24);
  }

  /** A safe spawn near the world center: solid ground, not water, not a cliff edge. */
  findSpawn(): { x: number; z: number } {
    const c = Math.floor(this.sizeBlocks / 2);
    for (let r = 0; r < 48; r += 4) {
      for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]] as const) {
        const x = c + dx, z = c + dz;
        if (!this.inBounds(x, 0, z)) continue;
        const y = this.surfaceY(x, z);
        const ground = this.getBlock(x, y - 1, z);
        if (ground !== Block.Air && ground !== Block.Water && y > this.waterLevel) {
          return { x, z };
        }
      }
    }
    return { x: c, z: c };
  }
}
