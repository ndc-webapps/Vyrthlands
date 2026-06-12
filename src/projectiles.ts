import * as THREE from 'three';
import { World } from './world/world';
import { MobManager } from './mobs';

interface Projectile {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  damage: number;   // player shots: hp points; hostile shots: health fraction
  hostile: boolean;
}

/**
 * Glowing magic/tech projectiles. Player shots hit mobs; hostile shots
 * (enemy snipers, spitters, drones, mages) hit the player.
 */
export class ProjectileManager {
  private list: Projectile[] = [];
  private group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  fire(origin: THREE.Vector3, dir: THREE.Vector3, speed: number, damage: number, color: number, size = 0.16): void {
    this.spawn(origin, dir, speed, damage, color, size, false);
  }

  fireHostile(origin: THREE.Vector3, dir: THREE.Vector3, speed: number, damage: number, color: number, size = 0.14): void {
    this.spawn(origin, dir, speed, damage, color, size, true);
  }

  /** Cosmetic replica of another player's shot — never deals damage here. */
  fireVisual(origin: THREE.Vector3, dir: THREE.Vector3, speed: number, color: number): void {
    this.spawn(origin, dir, speed, 0, color, 0.16, false);
  }

  private spawn(origin: THREE.Vector3, dir: THREE.Vector3, speed: number, damage: number, color: number, size: number, hostile: boolean): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(size, 6, 6),
      new THREE.MeshBasicMaterial({ color })
    );
    mesh.position.copy(origin).addScaledVector(dir, 0.6);
    this.group.add(mesh);
    this.list.push({ mesh, vel: dir.clone().multiplyScalar(speed), life: 2.4, damage, hostile });
  }

  update(
    dt: number, world: World, mobs: MobManager,
    playerPos?: THREE.Vector3, onPlayerHit?: (dmg: number) => void
  ): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const pos = p.mesh.position;
      let dead = p.life <= 0 || world.isSolidAt(pos.x, pos.y, pos.z);
      if (!dead && !p.hostile && p.damage > 0) {
        const mob = mobs.nearestWithin(pos, 0.95);
        if (mob) {
          mobs.damage(mob, p.damage, p.vel);
          dead = true;
        }
      }
      if (!dead && p.hostile && playerPos) {
        const dx = pos.x - playerPos.x;
        const dy = pos.y - (playerPos.y + 0.9);
        const dz = pos.z - playerPos.z;
        if (dx * dx + dy * dy + dz * dz < 0.9) {
          onPlayerHit?.(p.damage);
          dead = true;
        }
      }
      if (dead) {
        this.group.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.list.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const p of this.list) {
      this.group.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.list = [];
  }
}
