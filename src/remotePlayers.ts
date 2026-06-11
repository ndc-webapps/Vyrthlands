import * as THREE from 'three';
import { buildAvatar, animateAvatar, AvatarRig } from './playerModel';
import { RoleId, ROLES } from './roles';

interface Remote {
  rig: AvatarRig;
  role: RoleId;
  target: THREE.Vector3;
  yaw: number;
  walkT: number;
  speed: number;
  tag: THREE.Sprite;
}

function nameTag(username: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(10,12,20,0.55)';
  const w = Math.min(248, ctx.measureText(username).width + 28);
  ctx.beginPath();
  ctx.roundRect(128 - w / 2, 8, w, 48, 12);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(username, 128, 42);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.y = 2.25;
  return sprite;
}

/** Friends in the same server: role-themed avatars + floating name tags. */
export class RemotePlayers {
  private map = new Map<string, Remote>();
  private group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  upsert(username: string, role: string, x: number, y: number, z: number, yaw: number): void {
    const roleId = (ROLES[role as RoleId] ? role : 'swordsman') as RoleId;
    let r = this.map.get(username);
    if (r && r.role !== roleId) { this.removeOne(username); r = undefined; }
    if (!r) {
      const rig = buildAvatar(roleId);
      rig.group.add(nameTag(username));
      rig.group.position.set(x, y, z);
      this.group.add(rig.group);
      r = { rig, role: roleId, target: new THREE.Vector3(x, y, z), yaw, walkT: 0, speed: 0, tag: rig.group.children[rig.group.children.length - 1] as THREE.Sprite };
      this.map.set(username, r);
      return;
    }
    r.speed = r.target.distanceTo(new THREE.Vector3(x, y, z)) * 4; // approx blocks/sec at 0.25s sync
    r.target.set(x, y, z);
    r.yaw = yaw;
  }

  /** Drop anyone no longer in the online list. */
  prune(online: string[], self: string): void {
    for (const name of [...this.map.keys()]) {
      if (name === self || !online.includes(name)) this.removeOne(name);
    }
  }

  update(dt: number): void {
    for (const r of this.map.values()) {
      r.rig.group.position.lerp(r.target, Math.min(1, 10 * dt));
      const targetRot = r.yaw + Math.PI;
      let d = targetRot - r.rig.group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      r.rig.group.rotation.y += d * Math.min(1, 10 * dt);
      if (r.speed > 0.5) r.walkT += dt * r.speed * 1.6;
      animateAvatar(r.rig, r.walkT, r.speed);
      r.speed *= 0.95;
    }
  }

  get count(): number { return this.map.size; }

  private removeOne(name: string): void {
    const r = this.map.get(name);
    if (!r) return;
    this.group.remove(r.rig.group);
    r.rig.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
        (o as THREE.Mesh).geometry?.dispose?.();
        const m = (o as THREE.Mesh).material as THREE.Material & { map?: THREE.Texture };
        m?.map?.dispose?.();
        m?.dispose?.();
      }
    });
    this.map.delete(name);
  }

  clear(): void {
    for (const name of [...this.map.keys()]) this.removeOne(name);
  }
}
