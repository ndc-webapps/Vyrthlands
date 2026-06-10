import * as THREE from 'three';
import { World } from './world/world';
import { Block } from './blocks';

export interface RayHit {
  block: THREE.Vector3;  // voxel coords of the hit block
  normal: THREE.Vector3; // face normal (place position = block + normal)
  id: number;
}

/** Amanatides & Woo voxel traversal (DDA). Accurate block picking without mesh raycasting. */
export function raycastVoxel(
  world: World,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist: number
): RayHit | null {
  let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
  const stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z);

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;

  let tMaxX = stepX > 0 ? (x + 1 - origin.x) * tDeltaX : stepX < 0 ? (origin.x - x) * tDeltaX : Infinity;
  let tMaxY = stepY > 0 ? (y + 1 - origin.y) * tDeltaY : stepY < 0 ? (origin.y - y) * tDeltaY : Infinity;
  let tMaxZ = stepZ > 0 ? (z + 1 - origin.z) * tDeltaZ : stepZ < 0 ? (origin.z - z) * tDeltaZ : Infinity;

  const normal = new THREE.Vector3();
  let t = 0;

  while (t <= maxDist) {
    const id = world.getBlock(x, y, z);
    if (id !== Block.Air && id !== Block.Water) {
      return { block: new THREE.Vector3(x, y, z), normal: normal.clone(), id };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX; normal.set(-stepX, 0, 0);
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY; normal.set(0, -stepY, 0);
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; normal.set(0, 0, -stepZ);
    }
  }
  return null;
}
