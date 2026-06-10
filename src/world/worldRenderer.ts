import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_BUILD_BUDGET } from '../config';
import { RenderBucket } from '../blocks';
import { Atlas } from '../textures';
import { World } from './world';
import { buildChunkGeometry } from './chunkMesher';

type ChunkMeshes = Record<RenderBucket, THREE.Mesh | null>;
const BUCKETS: RenderBucket[] = ['opaque', 'glow', 'water', 'cutout'];

/**
 * Streams chunk meshes around the player: builds nearest-first within
 * renderDistance (budgeted per frame), unloads meshes beyond it.
 * Collision/data lives in World; this only manages GPU geometry.
 */
export class WorldRenderer {
  private group = new THREE.Group();
  private meshes = new Map<number, ChunkMeshes>();
  private materials: Record<RenderBucket, THREE.Material>;

  renderDistance: number;

  constructor(private world: World, scene: THREE.Scene, private atlas: Atlas, renderDistance: number) {
    this.renderDistance = renderDistance;
    scene.add(this.group);
    this.materials = {
      opaque: new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true }),
      glow: new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true }),
      cutout: new THREE.MeshLambertMaterial({
        map: atlas.texture, vertexColors: true, transparent: true, depthWrite: true, side: THREE.DoubleSide,
      }),
      water: new THREE.MeshLambertMaterial({
        map: atlas.texture, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false,
      }),
    };
  }

  /** Build the area around the spawn synchronously so the world is visible immediately. */
  buildInitial(px: number, pz: number, radius = 2): void {
    const pcx = Math.floor(px / CHUNK_SIZE), pcz = Math.floor(pz / CHUNK_SIZE);
    for (let cz = pcz - radius; cz <= pcz + radius; cz++) {
      for (let cx = pcx - radius; cx <= pcx + radius; cx++) {
        if (this.world.chunkInBounds(cx, cz)) this.rebuildChunk(cx, cz);
      }
    }
    this.world.dirtyChunks.clear();
  }

  /** Per-frame: rebuild dirty chunks, stream in near chunks, drop far ones. */
  update(px: number, pz: number): void {
    const pcx = Math.floor(px / CHUNK_SIZE), pcz = Math.floor(pz / CHUNK_SIZE);
    const rd = this.renderDistance;

    // edits: rebuild immediately (only chunks that currently have meshes or are near)
    if (this.world.dirtyChunks.size > 0) {
      for (const key of this.world.dirtyChunks) {
        const cx = key % this.world.sizeChunks;
        const cz = Math.floor(key / this.world.sizeChunks);
        if (this.meshes.has(key) || (Math.abs(cx - pcx) <= rd && Math.abs(cz - pcz) <= rd)) {
          this.rebuildChunk(cx, cz);
        }
      }
      this.world.dirtyChunks.clear();
    }

    // unload far chunks (hysteresis of +1 to avoid thrashing)
    for (const [key, cm] of this.meshes) {
      const cx = key % this.world.sizeChunks;
      const cz = Math.floor(key / this.world.sizeChunks);
      if (Math.abs(cx - pcx) > rd + 1 || Math.abs(cz - pcz) > rd + 1) {
        this.removeMeshes(cm);
        this.meshes.delete(key);
      }
    }

    // stream in missing chunks, nearest first, limited per frame
    let budget = CHUNK_BUILD_BUDGET;
    for (let r = 0; r <= rd && budget > 0; r++) {
      for (let cz = pcz - r; cz <= pcz + r && budget > 0; cz++) {
        for (let cx = pcx - r; cx <= pcx + r && budget > 0; cx++) {
          if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) !== r) continue; // ring only
          if (!this.world.chunkInBounds(cx, cz)) continue;
          if (this.meshes.has(this.world.chunkKey(cx, cz))) continue;
          this.rebuildChunk(cx, cz);
          budget--;
        }
      }
    }
  }

  /** Number of chunk meshes currently loaded (debug/HUD). */
  loadedCount(): number {
    return this.meshes.size;
  }

  private rebuildChunk(cx: number, cz: number): void {
    const key = this.world.chunkKey(cx, cz);
    const old = this.meshes.get(key);
    if (old) this.removeMeshes(old);

    const geo = buildChunkGeometry(this.world, cx, cz, this.atlas);
    const cm: ChunkMeshes = { opaque: null, glow: null, water: null, cutout: null };
    for (const bucket of BUCKETS) {
      const g = geo[bucket];
      if (!g) continue;
      const m = new THREE.Mesh(g, this.materials[bucket]);
      m.frustumCulled = true;
      if (bucket === 'water') m.renderOrder = 2;
      if (bucket === 'cutout') m.renderOrder = 1;
      this.group.add(m);
      cm[bucket] = m;
    }
    this.meshes.set(key, cm);
  }

  private removeMeshes(cm: ChunkMeshes): void {
    for (const bucket of BUCKETS) {
      const m = cm[bucket];
      if (m) {
        this.group.remove(m);
        m.geometry.dispose();
        cm[bucket] = null;
      }
    }
  }

  dispose(): void {
    for (const cm of this.meshes.values()) this.removeMeshes(cm);
    this.meshes.clear();
    for (const bucket of BUCKETS) this.materials[bucket].dispose();
    this.group.parent?.remove(this.group);
  }
}
