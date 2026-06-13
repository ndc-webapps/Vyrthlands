import { CHUNK_SIZE, WORLD_HEIGHT } from '../../config';
import { Block } from '../../blocks';
import { fbm2, hash3 } from '../noise';
import { WorldGenerator, fillColumn, placeTree, setL, getL } from './types';

const WATER = 20;

/**
 * Rolling hills, valleys, beaches, forests — plus the Vyrthlands twist:
 * floating crystal islands high in the sky and glowing ore veins underground.
 */
export const naturalGenerator: WorldGenerator = {
  type: 'natural',
  name: 'Natural',
  waterLevel: WATER,
  fillChunk(data, cx, cz, ctx) {
    const s = ctx.seed;
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = ox + lx, z = oz + lz;

        // base relief + occasional bigger hills
        const base = fbm2(x / 64, z / 64, s, 4);
        const hill = fbm2(x / 140 + 40, z / 140 + 40, s + 17, 3);
        const height = Math.floor(15 + base * 24 + Math.max(0, hill - 0.55) * 52);

        const beach = height <= WATER + 1;
        fillColumn(data, lx, lz, height,
          beach ? Block.Sand : Block.Grass,
          beach ? Block.Sand : Block.Dirt);

        // glowing ore veins in deep stone
        for (let y = 4; y < height - 6; y++) {
          if (hash3(x, y, z, s + 31) > 0.9955) setL(data, lx, y, lz, Block.Crystal);
        }

        // surface rock outcrops: easy early stone + coal without deep mining
        if (!beach && hash3(x, 0, z, s + 222) > 0.978) {
          const rockH = 1 + Math.floor(hash3(x, 1, z, s + 223) * 3);
          for (let k = 0; k < rockH; k++) {
            const coal = hash3(x, k, z, s + 224) > 0.7;
            setL(data, lx, height + 1 + k, lz, coal ? Block.EmberOre : Block.Stone);
          }
        }

        // water fill
        for (let y = height + 1; y <= WATER; y++) setL(data, lx, y, lz, Block.Water);

        // floating crystal islands (sparse)
        const island = fbm2(x / 34 + 100, z / 34 + 100, s + 777, 3);
        if (island > 0.66) {
          const strength = (island - 0.66) / 0.34;
          const centerY = 62 + Math.floor(fbm2(x / 60, z / 60, s + 999, 2) * 16);
          const thickness = Math.max(1, Math.floor(strength * 9));
          const top = Math.min(WORLD_HEIGHT - 2, centerY + Math.floor(thickness * 0.35));
          const bottom = centerY - Math.floor(thickness * 0.65);
          for (let y = bottom; y <= top; y++) {
            let id: number = Block.Stone;
            if (y === top) id = Block.Grass;
            else if (y >= top - 2) id = Block.Dirt;
            else if (hash3(x, y, z, s + 31) > 0.94) id = Block.Crystal;
            setL(data, lx, y, lz, id);
          }
        }
      }
    }

    // trees on grass — much denser so wood (the core survival resource) is
    // plentiful: ~4% on plains, up to ~14% in forests, like Minecraft biomes
    for (let lz = 2; lz < 14; lz++) {
      for (let lx = 2; lx < 14; lx++) {
        const x = ox + lx, z = oz + lz;
        const forest = fbm2(x / 90 + 300, z / 90 + 300, s + 444, 2); // 0..1 forest density
        const threshold = 0.96 - Math.max(0, forest - 0.4) * 0.16;
        if (hash3(x, 0, z, s + 555) < threshold) continue;
        for (let y = WORLD_HEIGHT - 10; y > WATER; y--) {
          if (getL(data, lx, y, lz) === Block.Grass && getL(data, lx, y + 1, lz) === Block.Air) {
            placeTree(data, lx, y + 1, lz, hash3(x, 1, z, s));
            break;
          }
        }
      }
    }
  },
};
