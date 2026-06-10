import { CHUNK_SIZE, WORLD_HEIGHT } from '../../config';
import { Block } from '../../blocks';
import { fbm2, hash3 } from '../noise';
import { WorldGenerator, fillColumn, placeTree, setL, getL } from './types';

const WATER = 16;
const SNOW_LINE = 66;
const STONE_LINE = 48;

/** Tall ridged peaks, cliffs, snow caps, sparse pines in the valleys. */
export const mountainGenerator: WorldGenerator = {
  type: 'mountain',
  name: 'Mountains',
  waterLevel: WATER,
  fillChunk(data, cx, cz, ctx) {
    const s = ctx.seed;
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = ox + lx, z = oz + lz;

        // ridged noise → sharp peaks and valleys
        const n = fbm2(x / 110, z / 110, s, 4);
        const ridge = 1 - Math.abs(2 * n - 1);
        const detail = fbm2(x / 28 + 70, z / 28 + 70, s + 5, 3);
        const height = Math.min(
          WORLD_HEIGHT - 4,
          Math.floor(17 + Math.pow(ridge, 1.7) * 62 + detail * 8)
        );

        let surface: number = Block.Grass;
        let sub: number = Block.Dirt;
        if (height > SNOW_LINE) { surface = Block.Snow; sub = Block.Stone; }
        else if (height > STONE_LINE) { surface = Block.Stone; sub = Block.Stone; }
        else if (height <= WATER + 1) { surface = Block.Sand; sub = Block.Sand; }
        fillColumn(data, lx, lz, height, surface, sub);

        for (let y = 4; y < height - 8; y++) {
          if (hash3(x, y, z, s + 31) > 0.996) setL(data, lx, y, lz, Block.Crystal);
        }
        for (let y = height + 1; y <= WATER; y++) setL(data, lx, y, lz, Block.Water);
      }
    }

    // sparse trees only in low valleys
    for (let lz = 2; lz < 14; lz++) {
      for (let lx = 2; lx < 14; lx++) {
        const x = ox + lx, z = oz + lz;
        if (hash3(x, 0, z, s + 555) < 0.997) continue;
        for (let y = STONE_LINE; y > WATER; y--) {
          if (getL(data, lx, y, lz) === Block.Grass && getL(data, lx, y + 1, lz) === Block.Air) {
            placeTree(data, lx, y + 1, lz, hash3(x, 1, z, s));
            break;
          }
        }
      }
    }
  },
};
