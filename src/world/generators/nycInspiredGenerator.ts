import { Block } from '../../blocks';
import { WorldGenerator } from './types';
import { fillCityChunk } from './cityCommon';

/** Dense grid metropolis: narrow avenues, glass towers, occasional pocket parks. */
export const nycInspiredGenerator: WorldGenerator = {
  type: 'nyc',
  name: 'Metro Grid',
  waterLevel: -1,
  fillChunk(data, cx, cz, ctx) {
    fillCityChunk(data, cx, cz, ctx, {
      grid: 16,
      roadW: 4,
      inset: 1,
      parkChance: 0.12,
      maxTowerY: 92,
      buildingHeight: (h, tower) => {
        let bh = 12 + Math.floor(h * 30);
        if (tower > 0.84) bh += 26; // skyscraper
        return bh;
      },
      wallBlock: (fy) => (fy % 4 === 3 ? Block.Concrete : Block.Glass), // glass curtain walls
    }, ctx.seed);
  },
};
