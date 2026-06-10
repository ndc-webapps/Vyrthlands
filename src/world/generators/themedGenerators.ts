import { CHUNK_SIZE } from '../../config';
import { Block } from '../../blocks';
import { fbm2, hash3 } from '../noise';
import { WorldGenerator, fillColumn, placeTree, setL, getL } from './types';
import { fillCityChunk, CITY_GROUND } from './cityCommon';

const WATER = 18;

export const prehistoricGenerator: WorldGenerator = {
  type: 'prehistoric',
  name: 'Pre Historic',
  waterLevel: WATER,
  fillChunk(data, cx, cz, ctx) {
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE, s = ctx.seed + 9000;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = ox + lx, z = oz + lz;
      const base = fbm2(x / 70, z / 70, s, 4);
      const height = Math.floor(16 + base * 22);
      const swamp = height <= WATER + 2;
      fillColumn(data, lx, lz, height, swamp ? Block.Sand : Block.Grass, swamp ? Block.Dirt : Block.Dirt);
      for (let y = height + 1; y <= WATER; y++) setL(data, lx, y, lz, Block.Water);
      if (hash3(x, 0, z, s + 4) > 0.9992) {
        for (let y = height + 1; y < height + 4; y++) setL(data, lx, y, lz, Block.Cactus);
      }
      if (hash3(Math.floor(x / 10), 5, Math.floor(z / 10), s) > 0.986 && (x % 10 === 4 || z % 10 === 4)) {
        setL(data, lx, height + 1, lz, Block.Sandstone);
      }
      if (fbm2(x / 34 + 8, z / 34 - 4, s + 77, 2) > 0.78) {
        setL(data, lx, height, lz, Block.Deepstone);
        if (hash3(x, 3, z, s) > 0.985) setL(data, lx, height + 1, lz, Block.Lava);
      }
    }
    for (let lz = 2; lz < 14; lz++) for (let lx = 2; lx < 14; lx++) {
      const x = ox + lx, z = oz + lz;
      if (hash3(x, 2, z, s) < 0.986) continue;
      for (let y = 70; y > WATER; y--) {
        if (getL(data, lx, y, lz) === Block.Grass && getL(data, lx, y + 1, lz) === Block.Air) {
          placeTree(data, lx, y + 1, lz, hash3(x, 3, z, s), hash3(x, 4, z, s) > 0.55 ? 'palm' : 'oak');
          break;
        }
      }
    }
  },
};

export const warGenerator: WorldGenerator = {
  type: 'battlefront',
  name: 'Battlefront Ruins',
  waterLevel: -1,
  fillChunk(data, cx, cz, ctx) {
    fillWarChunk(data, cx, cz, ctx);
  },
};

export const zombieGenerator: WorldGenerator = {
  type: 'zombie',
  name: 'Zombie World',
  waterLevel: -1,
  fillChunk(data, cx, cz, ctx) {
    fillCityChunk(data, cx, cz, ctx, {
      grid: 20,
      roadW: 3,
      inset: 2,
      parkChance: 0.3,
      maxTowerY: 42,
      buildingHeight: (h) => 4 + Math.floor(h * 11),
      wallBlock: (fy, x, z) => (hash3(x, fy, z, ctx.seed + 8) > 0.76 ? Block.Air : Block.Concrete),
    }, ctx.seed + 15000);
    scarChunk(data, cx, cz, ctx.seed + 44, Block.Leaves);
    placeZombieSites(data, cx, cz, ctx.seed + 81);
  },
};

function scarChunk(data: Uint8Array, cx: number, cz: number, seed: number, fill: Block): void {
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
  for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    const x = ox + lx, z = oz + lz;
    const scar = fbm2(x / 18, z / 18, seed, 2);
    if (scar > 0.72) {
      setL(data, lx, CITY_GROUND, lz, fill);
      if (hash3(x, 1, z, seed) > 0.95) setL(data, lx, CITY_GROUND + 1, lz, Block.Air);
    }
  }
}

function placeZombieSites(data: Uint8Array, cx: number, cz: number, seed: number): void {
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
  for (let lz = 1; lz < 15; lz++) for (let lx = 1; lx < 15; lx++) {
    const x = ox + lx, z = oz + lz;
    const rx = ((x % 34) + 34) % 34, rz = ((z % 34) + 34) % 34;
    const lot = hash3(Math.floor(x / 34), 9, Math.floor(z / 34), seed);
    if (rx > 4 && rx < 14 && rz > 4 && rz < 16 && lot > 0.72) {
      const y = CITY_GROUND + 1;
      if (rx === 5 || rx === 13 || rz === 5 || rz === 15) setL(data, lx, y, lz, Block.Concrete);
      if (rx === 9 || rz === 10) setL(data, lx, y + 1, lz, Block.Glass);
      if (hash3(x, 1, z, seed) > 0.96) setL(data, lx, y, lz, Block.Air);
    }
  }
}

export const medievalGenerator = villageGenerator('medieval', 'Medieval Kingdom', Block.Grass, Block.Dirt, Block.Stone, true);
export const cyberpunkGenerator: WorldGenerator = {
  type: 'cyberpunk',
  name: 'Cyberpunk City',
  waterLevel: -1,
  fillChunk(data, cx, cz, ctx) {
    fillCityChunk(data, cx, cz, ctx, {
      grid: 18, roadW: 3, inset: 1, parkChance: 0.04, maxTowerY: 76,
      buildingHeight: (h, t) => 14 + Math.floor(h * 20) + (t > 0.84 ? 22 : 0),
      wallBlock: (fy, x, z) => (fy % 4 === 1 ? Block.Crystal : ((x + z + fy) % 3 === 0 ? Block.Glass : Block.Concrete)),
    }, ctx.seed + 22000);
  },
};
export const alienGenerator = wildGenerator('alien', 'Alien Planet', 0x777, Block.Sand, Block.Deepstone, Block.Crystal);
export const skyIslandsGenerator: WorldGenerator = {
  type: 'skyislands',
  name: 'Sky Islands',
  waterLevel: -1,
  fillChunk(data, cx, cz, ctx) {
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE, s = ctx.seed + 24000;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = ox + lx, z = oz + lz;
      for (let band = 0; band < 3; band++) {
        const n = fbm2(x / 28 + band * 40, z / 28 + band * 40, s + band, 3);
        if (n < 0.62) continue;
        const top = 38 + band * 24 + Math.floor(fbm2(x / 60, z / 60, s + band * 9, 2) * 8);
        const thick = 2 + Math.floor((n - 0.62) * 16);
        for (let y = top - thick; y <= top; y++) setL(data, lx, y, lz, y === top ? Block.Grass : y > top - 3 ? Block.Dirt : Block.Stone);
        if (hash3(x, band, z, s) > 0.996) setL(data, lx, top + 1, lz, Block.Crystal);
      }
    }
  },
};
export const underworldGenerator = wildGenerator('underworld', 'Underworld', 0x999, Block.Deepstone, Block.Deepstone, Block.Lava);
export const frozenGenerator = wildGenerator('frozen', 'Ice Age', 0x444, Block.Snow, Block.Stone, Block.Crystal);
export const pirateGenerator = islandGenerator('pirate', 'Pirate Island');
export const hauntedGenerator = villageGenerator('haunted', 'Haunted Village', Block.Grass, Block.Dirt, Block.Wood, false);
export const wastelandGenerator = wildGenerator('wasteland', 'Wasteland', 0x333, Block.Dirt, Block.Concrete, Block.VoidOre);
export const mythologyGenerator = villageGenerator('mythology', 'Mythology World', Block.Sandstone, Block.Sandstone, Block.Crystal, true);

function wildGenerator(type: string, name: string, salt: number, surface: Block, sub: Block, rare: Block): WorldGenerator {
  return {
    type, name, waterLevel: type === 'underworld' ? 14 : type === 'alien' ? 16 : -1,
    fillChunk(data, cx, cz, ctx) {
      const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE, s = ctx.seed + salt;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = ox + lx, z = oz + lz;
        const h = Math.floor(12 + fbm2(x / 58, z / 58, s, 4) * 30 + Math.max(0, fbm2(x / 120, z / 120, s + 2, 2) - 0.55) * 35);
        fillColumn(data, lx, lz, h, surface, sub);
        if (type === 'underworld') for (let y = h + 1; y <= 14; y++) setL(data, lx, y, lz, Block.Lava);
        if (type === 'alien' && h < 16) for (let y = h + 1; y <= 16; y++) setL(data, lx, y, lz, Block.Water);
        if (hash3(x, 0, z, s) > 0.996) setL(data, lx, h + 1, lz, rare);
      }
    },
  };
}

function islandGenerator(type: string, name: string): WorldGenerator {
  return {
    type, name, waterLevel: 18,
    fillChunk(data, cx, cz, ctx) {
      const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE, s = ctx.seed + 26000;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = ox + lx, z = oz + lz;
        const island = fbm2(x / 48, z / 48, s, 4);
        const h = Math.floor(8 + island * 26);
        fillColumn(data, lx, lz, h, h <= 20 ? Block.Sand : Block.Grass, h <= 20 ? Block.Sand : Block.Dirt);
        for (let y = h + 1; y <= 18; y++) setL(data, lx, y, lz, Block.Water);
        if (h > 20 && hash3(x, 1, z, s) > 0.992 && lx > 1 && lx < 14 && lz > 1 && lz < 14) placeTree(data, lx, h + 1, lz, hash3(x, 2, z, s), 'palm');
      }
    },
  };
}

function villageGenerator(type: string, name: string, ground: Block, sub: Block, special: Block, castles: boolean): WorldGenerator {
  return {
    type, name, waterLevel: -1,
    fillChunk(data, cx, cz, ctx) {
      const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE, s = ctx.seed + 28000 + name.length;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = ox + lx, z = oz + lz;
        const h = Math.floor(16 + fbm2(x / 70, z / 70, s, 4) * 18);
        fillColumn(data, lx, lz, h, ground, sub);
        const grid = castles ? 38 : 26;
        const rx = ((x % grid) + grid) % grid, rz = ((z % grid) + grid) % grid;
        const house = rx > 5 && rx < 14 && rz > 5 && rz < 14;
        const tower = castles && ((rx < 3 && rz < 3) || (rx > grid - 4 && rz < 3) || (rx < 3 && rz > grid - 4) || (rx > grid - 4 && rz > grid - 4));
        if (house || tower) {
          const top = h + (tower ? 8 : 4);
          for (let y = h + 1; y <= top; y++) if (house && (rx === 6 || rx === 13 || rz === 6 || rz === 13) || tower) setL(data, lx, y, lz, special);
          if (house) setL(data, lx, top + 1, lz, Block.Planks);
        }
        if (type === 'haunted') {
          if (rx > 16 && rx < 22 && rz > 4 && rz < 18 && rx % 2 === 0 && rz % 3 === 0) setL(data, lx, h + 1, lz, Block.Deepstone);
          if (rx === 24 && rz === 13) for (let y = h + 1; y < h + 5; y++) setL(data, lx, y, lz, Block.Wood);
        }
        if (castles && rx > 18 && rx < 24 && rz > 18 && rz < 24) setL(data, lx, h + 1, lz, Block.Crystal);
        if (!house && hash3(x, 0, z, s) > 0.994 && lx > 1 && lx < 14 && lz > 1 && lz < 14) placeTree(data, lx, h + 1, lz, hash3(x, 1, z, s));
      }
    },
  };
}

function fillWarChunk(data: Uint8Array, cx: number, cz: number, ctx: { seed: number }): void {
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE, s = ctx.seed + 12000;
  for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    const x = ox + lx, z = oz + lz;
    const hills = fbm2(x / 72, z / 72, s, 4);
    const ridge = Math.max(0, fbm2(x / 160 + 10, z / 160, s + 9, 3) - 0.55) * 50;
    const h = Math.floor(16 + hills * 18 + ridge);
    const road = Math.abs(((x + z) % 34) - 17) < 2 || Math.abs(((x - z) % 42) - 21) < 2;
    fillColumn(data, lx, lz, h, road ? Block.Road : Block.Grass, road ? Block.Concrete : Block.Dirt);
    const trench = Math.abs(((x + z * 2) % 46) - 23) < 2;
    if (trench) {
      setL(data, lx, h, lz, Block.Dirt);
      setL(data, lx, h + 1, lz, Block.Air);
    }
    const rx = ((x % 28) + 28) % 28, rz = ((z % 28) + 28) % 28;
    const house = rx > 5 && rx < 14 && rz > 5 && rz < 14 && hash3(Math.floor(x / 28), 0, Math.floor(z / 28), s) > 0.35;
    if (house) {
      const broken = hash3(x, 2, z, s) > 0.78;
      for (let y = h + 1; y <= h + 5; y++) if (!broken && (rx === 6 || rx === 13 || rz === 6 || rz === 13)) setL(data, lx, y, lz, Block.Concrete);
      if (!broken) setL(data, lx, h + 6, lz, Block.Planks);
    }
    if (hash3(x, 3, z, s) > 0.997) setL(data, lx, h + 1, lz, Block.EmberOre);
  }
}
