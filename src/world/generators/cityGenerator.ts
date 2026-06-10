import { Block } from '../../blocks';
import { WorldGenerator } from './types';
import { fillCityChunk } from './cityCommon';

/** Low-rise creative city: wide lots, mid-height buildings, plenty of parks. */
export const cityGenerator: WorldGenerator = {
  type: 'city',
  name: 'City',
  waterLevel: -1,
  fillChunk(data, cx, cz, ctx) {
    fillCityChunk(data, cx, cz, ctx, {
      grid: 20,
      roadW: 3,
      inset: 2,
      parkChance: 0.22,
      maxTowerY: 60,
      buildingHeight: (h) => 6 + Math.floor(h * 16),
      wallBlock: (fy, x, z) => {
        if (fy % 3 === 2) return Block.Concrete;       // floor slab band
        return (x + z) % 3 === 0 ? Block.Planks : Block.Glass; // window strips
      },
    }, ctx.seed);
  },
};
