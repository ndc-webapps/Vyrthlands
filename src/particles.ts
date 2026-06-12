import * as THREE from 'three';

/**
 * Pooled point-sprite particles for block-break puffs, place dust,
 * and combat sparks. One Points object, fixed-size buffers, zero
 * allocation per burst.
 */

const MAX = 480;

export class Particles {
  private points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private next = 0;
  private tmp = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX); // 0 = dead
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.14, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** Spawn a burst at a point. speed in blocks/sec, slight color variance. */
  burst(x: number, y: number, z: number, colorHex: number, count = 12, speed = 3): void {
    this.tmp.setHex(colorHex);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      this.life[i] = 0.45 + Math.random() * 0.3;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = Math.cos(a) * sp * (1 - up * 0.5);
      this.vel[i * 3 + 1] = up * sp;
      this.vel[i * 3 + 2] = Math.sin(a) * sp * (1 - up * 0.5);
      const f = 0.8 + Math.random() * 0.4;
      this.col[i * 3] = Math.min(1, this.tmp.r * f);
      this.col[i * 3 + 1] = Math.min(1, this.tmp.g * f);
      this.col[i * 3 + 2] = Math.min(1, this.tmp.b * f);
    }
  }

  update(dt: number): void {
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -999; // park dead particles out of sight
        continue;
      }
      this.vel[i * 3 + 1] -= 11 * dt; // gravity
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    if (any) {
      (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}
