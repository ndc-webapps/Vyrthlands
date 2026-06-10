import { CHUNK_SIZE } from '../../config';
import { Block } from '../../blocks';
import { hash3 } from '../noise';
import { GenContext, fillColumn, placeTree, setL, getL } from './types';

export const CITY_GROUND = 20;

export interface CityParams {
  grid: number;        // city block pitch (road to road)
  roadW: number;       // road width
  inset: number;       // building setback from sidewalk
  parkChance: number;  // fraction of lots that become parks
  maxTowerY: number;
  buildingHeight(lotHash: number, towerHash: number): number;
  /** Block for a wall cell. fy = floors above ground, x/z world coords. */
  wallBlock(fy: number, x: number, z: number): number;
}

/** Shared deterministic city layout: road grid, sidewalks, lots with buildings or parks. */
export function fillCityChunk(
  data: Uint8Array, cx: number, cz: number, ctx: GenContext, p: CityParams, seed: number
): void {
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
  const G = p.grid, RW = p.roadW;
  const lo = RW + p.inset;       // building footprint range within a lot
  const hi = G - 1 - p.inset;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = ox + lx, z = oz + lz;
      const rx = ((x % G) + G) % G;
      const rz = ((z % G) + G) % G;
      const lotX = Math.floor(x / G), lotZ = Math.floor(z / G);
      const lotHash = hash3(lotX, 0, lotZ, seed + 700);
      const isPark = lotHash < p.parkChance;

      // base ground
      const onRoad = rx < RW || rz < RW;
      if (onRoad) {
        fillColumn(data, lx, lz, CITY_GROUND, Block.Road, Block.Concrete);
        continue;
      }
      if (isPark) {
        fillColumn(data, lx, lz, CITY_GROUND, Block.Grass, Block.Dirt);
        continue;
      }
      // sidewalk ring + plaza around the building
      fillColumn(data, lx, lz, CITY_GROUND, Block.Concrete, Block.Concrete);

      const inFootprint = rx >= lo && rx <= hi && rz >= lo && rz <= hi;
      if (!inFootprint) continue;

      const bh = p.buildingHeight(
        hash3(lotX, 1, lotZ, seed + 701),
        hash3(lotX, 2, lotZ, seed + 702)
      );
      const onPerimeter = rx === lo || rx === hi || rz === lo || rz === hi;
      const roofY = Math.min(p.maxTowerY, CITY_GROUND + bh);

      if (onPerimeter) {
        const corner = (rx === lo || rx === hi) && (rz === lo || rz === hi);
        for (let y = CITY_GROUND + 1; y < roofY; y++) {
          setL(data, lx, y, lz, corner ? Block.Concrete : p.wallBlock(y - CITY_GROUND - 1, x, z));
        }
        // doorway on the south face near lot center
        if (rz === lo && Math.abs(rx - Math.floor((lo + hi) / 2)) <= 1) {
          setL(data, lx, CITY_GROUND + 1, lz, Block.Air);
          setL(data, lx, CITY_GROUND + 2, lz, Block.Air);
        }
      }
      setL(data, lx, roofY, lz, Block.Concrete); // flat roof

      // skyscraper spire with glowing tip
      const center = Math.floor((lo + hi) / 2);
      if (bh > 40 && rx === center && rz === center) {
        for (let i = 1; i <= 4; i++) setL(data, lx, roofY + i, lz, Block.Concrete);
        setL(data, lx, roofY + 5, lz, Block.Crystal);
      }
    }
  }

  // park trees
  for (let lz = 2; lz < 14; lz++) {
    for (let lx = 2; lx < 14; lx++) {
      const x = ox + lx, z = oz + lz;
      if (hash3(x, 3, z, seed + 720) < 0.985) continue;
      if (getL(data, lx, CITY_GROUND, lz) === Block.Grass && getL(data, lx, CITY_GROUND + 1, lz) === Block.Air) {
        placeTree(data, lx, CITY_GROUND + 1, lz, hash3(x, 4, z, seed));
      }
    }
  }
}
