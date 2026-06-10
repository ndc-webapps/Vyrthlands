import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../config';
import { Block, BLOCKS, isOpaque, RenderBucket } from '../blocks';
import { Atlas } from '../textures';
import { World } from './world';

// Face definitions: [normal, 4 corner offsets (CCW from outside, starting bottom-left), shade]
const FACES: {
  dir: [number, number, number];
  corners: [number, number, number][];
  shade: number;
  which: 'top' | 'side' | 'bottom';
}[] = [
  { dir: [0, 1, 0], which: 'top', shade: 1.0, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], which: 'bottom', shade: 0.5, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [1, 0, 0], which: 'side', shade: 0.8, corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { dir: [-1, 0, 0], which: 'side', shade: 0.8, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dir: [0, 0, 1], which: 'side', shade: 0.7, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], which: 'side', shade: 0.7, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

// UV corners matching the face corner order above (v follows y on side faces)
const UV_CORNERS: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];

interface BucketData { pos: number[]; nor: number[]; col: number[]; uv: number[]; idx: number[] }

export type ChunkGeometries = Record<RenderBucket, THREE.BufferGeometry | null>;

/**
 * Builds merged BufferGeometries for one chunk column, split into 4 buckets
 * (opaque / glow / water / cutout) so a chunk is at most 4 draw calls.
 * Only faces adjacent to non-opaque blocks are emitted (face culling).
 */
export function buildChunkGeometry(world: World, cx: number, cz: number, atlas: Atlas): ChunkGeometries {
  const buckets: Record<RenderBucket, BucketData> = {
    opaque: { pos: [], nor: [], col: [], uv: [], idx: [] },
    glow: { pos: [], nor: [], col: [], uv: [], idx: [] },
    water: { pos: [], nor: [], col: [], uv: [], idx: [] },
    cutout: { pos: [], nor: [], col: [], uv: [], idx: [] },
  };
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
  const data = world.getChunk(cx, cz);

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const id = data[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
        if (id === Block.Air) continue;
        const blockDef = BLOCKS[id];
        if (!blockDef) continue;

        const x = ox + lx, z = oz + lz;
        const bucket = buckets[blockDef.bucket];

        for (const face of FACES) {
          const neighbor = world.getBlock(x + face.dir[0], y + face.dir[1], z + face.dir[2]);
          if (isOpaque(neighbor)) continue;
          if (neighbor === id) continue; // merge water-water / glass-glass
          if (id === Block.Water && neighbor !== Block.Air) continue;

          const tile =
            face.which === 'top' ? blockDef.tiles.top :
            face.which === 'bottom' ? blockDef.tiles.bottom : blockDef.tiles.side;
          const [u0, v0, u1, v1] = atlas.uv(tile);
          const shade = blockDef.bucket === 'glow' ? 1.0 : face.shade;

          const baseIndex = bucket.pos.length / 3;
          for (let i = 0; i < 4; i++) {
            const corner = face.corners[i];
            bucket.pos.push(x + corner[0], y + corner[1], z + corner[2]);
            bucket.nor.push(face.dir[0], face.dir[1], face.dir[2]);
            bucket.col.push(shade, shade, shade);
            const [uc, vc] = UV_CORNERS[i];
            bucket.uv.push(uc === 0 ? u0 : u1, vc === 0 ? v0 : v1);
          }
          bucket.idx.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3);
        }
      }
    }
  }

  return {
    opaque: toGeometry(buckets.opaque),
    glow: toGeometry(buckets.glow),
    water: toGeometry(buckets.water),
    cutout: toGeometry(buckets.cutout),
  };
}

function toGeometry(d: BucketData): THREE.BufferGeometry | null {
  if (d.idx.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
  g.setIndex(d.idx);
  g.computeBoundingSphere();
  return g;
}
