import { CHUNK_SIZE } from '../../config';
import { Block } from '../../blocks';
import { fbm2, hash3 } from '../noise';
import { WorldGenerator, fillColumn, placeTree, setL, getL } from './types';

const REGION = 96;        // one possible pyramid per region
const PYRAMID_BASE = 26;  // pyramid foundation level

interface Pyramid { cx: number; cz: number; size: number }

function pyramidOf(rx: number, rz: number, seed: number): Pyramid | null {
  const h = hash3(rx, 0, rz, seed + 888);
  if (h < 0.45) return null;
  const size = 10 + Math.floor(hash3(rx, 1, rz, seed + 889) * 8);
  // offset keeps the whole pyramid inside its region
  const cx = rx * REGION + size + 4 + Math.floor(hash3(rx, 2, rz, seed + 890) * (REGION - 2 * size - 8));
  const cz = rz * REGION + size + 4 + Math.floor(hash3(rx, 3, rz, seed + 891) * (REGION - 2 * size - 8));
  return { cx, cz, size };
}

/** Dunes, sandstone bedrock, ancient pyramids with glowing capstones, ruin pillars, cacti, oasis palms. */
export const desertEgyptGenerator: WorldGenerator = {
  type: 'desert',
  name: 'Desert of the Ancients',
  waterLevel: 13, // rare low oasis pools
  fillChunk(data, cx, cz, ctx) {
    const s = ctx.seed;
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = ox + lx, z = oz + lz;

        // dunes: soft fbm + ridged streaks
        const base = fbm2(x / 70, z / 70, s, 4);
        const dune = 1 - Math.abs(2 * fbm2(x / 36 + 50, z / 36 + 50, s + 7, 2) - 1);
        const height = Math.floor(16 + base * 12 + dune * 6);

        fillColumn(data, lx, lz, height, Block.Sand, Block.Sand, Block.Sandstone, 4);
        for (let y = 0; y < 6; y++) setL(data, lx, y, lz, Block.Stone);
        for (let y = height + 1; y <= this.waterLevel; y++) setL(data, lx, y, lz, Block.Water);

        // pyramid of this region
        const p = pyramidOf(Math.floor(x / REGION), Math.floor(z / REGION), s);
        if (p) {
          const t = p.size - Math.max(Math.abs(x - p.cx), Math.abs(z - p.cz));
          if (t > 0) {
            const top = PYRAMID_BASE + t - 1;
            for (let y = Math.min(height, PYRAMID_BASE); y <= top; y++) {
              setL(data, lx, y, lz, Block.Sandstone);
            }
            if (t === p.size) setL(data, lx, top, lz, Block.Crystal); // glowing capstone
          }
        }

        // ruin pillars
        if (hash3(x, 7, z, s + 222) > 0.99935 && height > this.waterLevel + 1) {
          const ph = 3 + Math.floor(hash3(x, 8, z, s) * 4);
          for (let i = 1; i <= ph; i++) setL(data, lx, height + i, lz, Block.Sandstone);
          if (hash3(x, 9, z, s) > 0.5) setL(data, lx, height + ph + 1, lz, Block.Crystal);
        }
      }
    }

    // cacti and oasis palms
    for (let lz = 2; lz < 14; lz++) {
      for (let lx = 2; lx < 14; lx++) {
        const x = ox + lx, z = oz + lz;
        const r = hash3(x, 4, z, s + 333);
        for (let y = 50; y > this.waterLevel; y--) {
          if (getL(data, lx, y, lz) === Block.Sand && getL(data, lx, y + 1, lz) === Block.Air) {
            if (r > 0.9975) {
              const ch = 2 + Math.floor(hash3(x, 5, z, s) * 2);
              for (let i = 1; i <= ch; i++) setL(data, lx, y + i, lz, Block.Cactus);
            } else if (r < 0.0008 || (y <= this.waterLevel + 2 && r < 0.02)) {
              placeTree(data, lx, y + 1, lz, hash3(x, 6, z, s), 'palm');
            }
            break;
          }
        }
      }
    }
  },
};
