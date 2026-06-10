import * as THREE from 'three';
import { WORLD_CHUNKS_X, WORLD_CHUNKS_Z } from '../config';
import { World } from './world';
import { buildChunkGeometry } from './chunkMesher';

interface ChunkMeshes {
  opaque: THREE.Mesh | null;
  glow: THREE.Mesh | null;
  water: THREE.Mesh | null;
}

export class WorldRenderer {
  private group = new THREE.Group();
  private meshes: ChunkMeshes[] = [];
  private opaqueMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  private waterMat = new THREE.MeshLambertMaterial({
    vertexColors: true, transparent: true, opacity: 0.65, depthWrite: false,
  });

  constructor(private world: World, scene: THREE.Scene) {
    scene.add(this.group);
    for (let i = 0; i < WORLD_CHUNKS_X * WORLD_CHUNKS_Z; i++) {
      this.meshes.push({ opaque: null, glow: null, water: null });
    }
  }

  buildAll(): void {
    for (let cz = 0; cz < WORLD_CHUNKS_Z; cz++) {
      for (let cx = 0; cx < WORLD_CHUNKS_X; cx++) {
        this.rebuildChunk(cx, cz);
      }
    }
    this.world.dirtyChunks.clear();
  }

  /** Rebuild any chunks marked dirty by block edits. */
  update(): void {
    if (this.world.dirtyChunks.size === 0) return;
    for (const idx of this.world.dirtyChunks) {
      const cx = idx % WORLD_CHUNKS_X;
      const cz = Math.floor(idx / WORLD_CHUNKS_X);
      this.rebuildChunk(cx, cz);
    }
    this.world.dirtyChunks.clear();
  }

  private rebuildChunk(cx: number, cz: number): void {
    const idx = cz * WORLD_CHUNKS_X + cx;
    const old = this.meshes[idx];
    for (const key of ['opaque', 'glow', 'water'] as const) {
      const m = old[key];
      if (m) {
        this.group.remove(m);
        m.geometry.dispose();
        old[key] = null;
      }
    }

    const geo = buildChunkGeometry(this.world, cx, cz);
    if (geo.opaque) {
      const m = new THREE.Mesh(geo.opaque, this.opaqueMat);
      m.frustumCulled = true;
      this.group.add(m);
      old.opaque = m;
    }
    if (geo.glow) {
      const m = new THREE.Mesh(geo.glow, this.glowMat);
      m.frustumCulled = true;
      this.group.add(m);
      old.glow = m;
    }
    if (geo.water) {
      const m = new THREE.Mesh(geo.water, this.waterMat);
      m.frustumCulled = true;
      m.renderOrder = 1;
      this.group.add(m);
      old.water = m;
    }
  }

  dispose(): void {
    for (const cm of this.meshes) {
      for (const key of ['opaque', 'glow', 'water'] as const) {
        const m = cm[key];
        if (m) {
          this.group.remove(m);
          m.geometry.dispose();
        }
      }
    }
    this.opaqueMat.dispose();
    this.glowMat.dispose();
    this.waterMat.dispose();
    this.group.parent?.remove(this.group);
  }
}
