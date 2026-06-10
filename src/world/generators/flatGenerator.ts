import { CHUNK_SIZE } from '../../config';
import { Block } from '../../blocks';
import { hash3 } from '../noise';
import { WorldGenerator, fillColumn, placeTree } from './types';

const GROUND = 14;

/** Flat grass world for creative building. Minimal trees, no water, no hills. */
export const flatGenerator: WorldGenerator = {
  type: 'flat',
  name: 'Flat',
  waterLevel: -1,
  fillChunk(data, cx, cz, ctx) {
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        fillColumn(data, lx, lz, GROUND, Block.Grass, Block.Dirt);
      }
    }
    // a rare lone tree
    for (let lz = 2; lz < 14; lz++) {
      for (let lx = 2; lx < 14; lx++) {
        const r = hash3(ox + lx, 0, oz + lz, ctx.seed + 555);
        if (r > 0.9995) placeTree(data, lx, GROUND + 1, lz, hash3(ox + lx, 1, oz + lz, ctx.seed));
      }
    }
  },
};
