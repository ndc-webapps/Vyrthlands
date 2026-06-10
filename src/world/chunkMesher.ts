import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../config';
import { Block, BLOCKS, isOpaque } from '../blocks';
import { World } from './world';

// Face definitions: [normal, 4 corner offsets (CCW from outside), shade]
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

interface MeshBuckets {
  opaque: { pos: number[]; nor: number[]; col: number[]; idx: number[] };
  glow: { pos: number[]; nor: number[]; col: number[]; idx: number[] };
  water: { pos: number[]; nor: number[]; col: number[]; idx: number[] };
}

function emptyBuckets(): MeshBuckets {
  return {
    opaque: { pos: [], nor: [], col: [], idx: [] },
    glow: { pos: [], nor: [], col: [], idx: [] },
    water: { pos: [], nor: [], col: [], idx: [] },
  };
}

/**
 * Builds merged BufferGeometries for one chunk column.
 * Only emits faces adjacent to non-opaque blocks (face culling),
 * so a chunk renders as at most 3 draw calls — never per-cube meshes.
 */
export function buildChunkGeometry(world: World, cx: number, cz: number): {
  opaque: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
  water: THREE.BufferGeometry | null;
} {
  const b = emptyBuckets();
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = ox + lx, z = oz + lz;
        const id = world.getBlock(x, y, z);
        if (id === Block.Air) continue;
        const blockDef = BLOCKS[id];
        if (!blockDef) continue;

        const bucket = blockDef.glow ? b.glow : blockDef.transparent ? b.water : b.opaque;

        for (const face of FACES) {
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          const neighbor = world.getBlock(nx, ny, nz);
          if (id === Block.Water) {
            // water: only show faces against air
            if (neighbor !== Block.Air) continue;
          } else {
            if (isOpaque(neighbor)) continue;
            if (neighbor === id) continue;
          }

          const color =
            face.which === 'top' ? blockDef.topColor :
            face.which === 'bottom' ? blockDef.bottomColor : blockDef.sideColor;
          const shade = blockDef.glow ? 1.0 : face.shade;

          const baseIndex = bucket.pos.length / 3;
          for (const corner of face.corners) {
            bucket.pos.push(x + corner[0], y + corner[1], z + corner[2]);
            bucket.nor.push(face.dir[0], face.dir[1], face.dir[2]);
            bucket.col.push(color[0] * shade, color[1] * shade, color[2] * shade);
          }
          bucket.idx.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3);
        }
      }
    }
  }

  return {
    opaque: toGeometry(b.opaque),
    glow: toGeometry(b.glow),
    water: toGeometry(b.water),
  };
}

function toGeometry(d: { pos: number[]; nor: number[]; col: number[]; idx: number[] }): THREE.BufferGeometry | null {
  if (d.idx.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
  g.setIndex(d.idx);
  g.computeBoundingSphere();
  return g;
}
