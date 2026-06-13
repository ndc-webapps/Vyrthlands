import { CHUNK_SIZE } from '../config';
import { Block } from '../blocks';
import { hash3 } from './noise';

/**
 * Depth decoration pass, applied to every freshly generated chunk:
 *  y 0-1   Foundation (unbreakable world floor)
 *  y < 10  stone becomes Deepstone, lava pockets
 *  ores in stone/deepstone, rarer ones deeper:
 *    Ember Coal < 36, Rust Iron < 26, Sun Gold < 16, Azure Crystal < 18, Voidstone < 9
 */
export function decorateOres(data: Uint8Array, cx: number, cz: number, seed: number): void {
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
  const idx = (lx: number, y: number, lz: number) => (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = ox + lx, z = oz + lz;

      data[idx(lx, 0, lz)] = Block.Foundation;
      data[idx(lx, 1, lz)] = Block.Foundation;

      for (let y = 2; y < 40; y++) {
        const i = idx(lx, y, lz);
        let id = data[i];
        if (id !== Block.Stone && id !== Block.Deepstone) continue;

        if (y < 10) {
          id = Block.Deepstone;
          data[i] = id;
          // lava pockets: clumped blobs in the deep layer
          const blob = hash3(x >> 2, y >> 2, z >> 2, seed + 901);
          if (y < 9 && blob > 0.86 && hash3(x, y, z, seed + 902) > 0.35) {
            data[i] = Block.Lava;
            continue;
          }
        }

        const h = hash3(x, y, z, seed + 900);
        // richer veins so survival tool progression is feasible: coal common,
        // iron readily found; gold/void/crystal stay rarer and deeper
        if (y < 9 && h > 0.998) data[i] = Block.VoidOre;
        else if (y < 18 && h > 0.994 && h <= 0.998) data[i] = Block.GoldOre;
        else if (y < 30 && h > 0.982 && h <= 0.994) data[i] = Block.IronOre;   // ~1.2%
        else if (y < 40 && h > 0.955 && h <= 0.982) data[i] = Block.EmberOre;  // ~2.7% coal
        else if (y < 18 && h < 0.0035) data[i] = Block.Crystal;
      }
    }
  }
}
