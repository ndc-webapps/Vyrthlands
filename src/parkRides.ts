import * as THREE from 'three';
import { ParkRide, RideMotion } from './world/generators/themeParkGenerator';

/**
 * Animated moving parts for theme-park attractions: ferris-wheel cabins,
 * carousel seats, swing chairs, the pirate-ship hull, spinning teacups.
 * Every part runs off one shared clock, and riders attach to car #0 of
 * the ride they boarded — so what you see moving is what you ride.
 */

const _v = new THREE.Vector3();

/** Position of car `index` of `count` on a motion rig at time `clock`. */
export function motionPoint(m: RideMotion, clock: number, index: number, out: THREE.Vector3): THREE.Vector3 {
  const phase = (clock / m.period) * Math.PI * 2 + (index / m.count) * Math.PI * 2;
  switch (m.kind) {
    case 'wheel': // vertical circle in the X/Y plane
      return out.set(m.cx + Math.cos(phase) * m.r, m.cy + Math.sin(phase) * m.r, m.cz);
    case 'swing': // horizontal circle with a gentle bob
      return out.set(
        m.cx + Math.cos(phase) * m.r,
        m.cy + Math.sin(phase * 3) * 0.4,
        m.cz + Math.sin(phase) * m.r
      );
    case 'ship': { // pendulum sweep along X
      const sw = Math.sin((clock / m.period) * Math.PI * 2) * 1.1;
      return out.set(m.cx + Math.sin(sw) * m.r, m.cy - Math.cos(sw) * (m.r * 0.75), m.cz);
    }
    case 'cup': { // orbit + wobble
      const wob = Math.cos(phase * 5) * 1.2;
      return out.set(m.cx + Math.cos(phase) * (m.r + wob), m.cy, m.cz + Math.sin(phase) * (m.r + wob));
    }
    case 'carousel':
    default: // horizontal circle, slight rise and fall like carousel ponies
      return out.set(
        m.cx + Math.cos(phase) * m.r,
        m.cy + Math.sin(phase * 2) * 0.3,
        m.cz + Math.sin(phase) * m.r
      );
  }
}

interface Part {
  motion: RideMotion;
  index: number;
  mesh: THREE.Object3D;
}

export class ParkAnimator {
  clock = 0;
  private group = new THREE.Group();
  private parts: Part[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  /** Build visible cars/seats for every ride that has a motion rig. */
  build(rides: ParkRide[]): void {
    this.clear();
    for (const r of rides) {
      const m = r.motion;
      if (!m) continue;
      for (let i = 0; i < m.count; i++) {
        const mesh = this.carMesh(m, i);
        this.group.add(mesh);
        this.parts.push({ motion: m, index: i, mesh });
      }
    }
  }

  private carMesh(m: RideMotion, i: number): THREE.Object3D {
    const colors = [0xe13c46, 0x3c78e6, 0xf0be32, 0x46c87a, 0xc864e6, 0xff8c50];
    const color = colors[i % colors.length];
    let geo: THREE.BufferGeometry;
    if (m.kind === 'ship') geo = new THREE.BoxGeometry(7, 1.4, 2.4);
    else if (m.kind === 'wheel') geo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    else if (m.kind === 'cup') geo = new THREE.CylinderGeometry(1.1, 0.8, 1.1, 10);
    else geo = new THREE.BoxGeometry(0.9, 0.9, 1.4);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: m.kind === 'ship' ? 0x8a5a32 : color }));
    return mesh;
  }

  update(dt: number): void {
    this.clock += dt;
    for (const p of this.parts) {
      motionPoint(p.motion, this.clock, p.index, _v);
      p.mesh.position.copy(_v);
      // face along the travel direction for orbiting seats
      if (p.motion.kind === 'carousel' || p.motion.kind === 'swing' || p.motion.kind === 'cup') {
        const phase = (this.clock / p.motion.period) * Math.PI * 2 + (p.index / p.motion.count) * Math.PI * 2;
        p.mesh.rotation.y = -phase;
      } else if (p.motion.kind === 'ship') {
        const sw = Math.sin((this.clock / p.motion.period) * Math.PI * 2) * 1.1;
        p.mesh.rotation.z = -sw;
      }
    }
  }

  /** Current world position of car #0 (where the rider sits). */
  riderPoint(m: RideMotion, out: THREE.Vector3): THREE.Vector3 {
    return motionPoint(m, this.clock, 0, out);
  }

  clear(): void {
    for (const p of this.parts) {
      this.group.remove(p.mesh);
      const mesh = p.mesh as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material)?.dispose?.();
    }
    this.parts = [];
  }
}
