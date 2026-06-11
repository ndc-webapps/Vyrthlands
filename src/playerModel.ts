import * as THREE from 'three';
import { RoleId } from './roles';

/**
 * Full-body voxel player avatars, one distinct look per role (original
 * designs, blocky humanoid proportions). Used for your own third-person
 * view and for remote players in shared servers.
 */

export interface AvatarRig {
  group: THREE.Group;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
}

interface Look {
  skin: number; hair: number; shirt: number; pants: number; accent: number; glow: number;
  hood?: boolean; hat?: boolean; helmet?: boolean; robe?: boolean;
  weapon?: 'dagger' | 'staff' | 'sword' | 'wand' | 'rifle';
  shield?: boolean; chestMark?: number; vest?: boolean;
}

const LOOKS: Record<RoleId, Look> = {
  assassin: { skin: 0xd8a07a, hair: 0x2a2530, shirt: 0x2e2a3a, pants: 0x201d2a, accent: 0x4a4360, glow: 0xb890ff, hood: true, weapon: 'dagger' },
  wizard: { skin: 0xd8a07a, hair: 0xc8c8d0, shirt: 0x2c3a6e, pants: 0x223058, accent: 0x4a5aa8, glow: 0x7df0ff, hat: true, robe: true, weapon: 'staff' },
  swordsman: { skin: 0xd8a07a, hair: 0x6a4a2a, shirt: 0x8a8f98, pants: 0x3a4048, accent: 0xb8bec8, glow: 0xffd070, helmet: true, weapon: 'sword', shield: true },
  healer: { skin: 0xd8a07a, hair: 0x8a5a30, shirt: 0xe8e8e0, pants: 0x5a7a5a, accent: 0x8df06a, glow: 0x8df06a, robe: true, weapon: 'wand', chestMark: 0x4ec048 },
  gunner: { skin: 0xc89068, hair: 0x2a2520, shirt: 0x55603f, pants: 0x3a4030, accent: 0x767f5c, glow: 0xffd070, helmet: true, vest: true, weapon: 'rifle' },
};

function box(w: number, h: number, d: number, color: number, pivotTop = false): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  if (pivotTop) g.translate(0, -h / 2, 0);
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
}

/** Build a role-themed avatar (~1.8 blocks tall, facing -Z). */
export function buildAvatar(role: RoleId): AvatarRig {
  const L = LOOKS[role];
  const group = new THREE.Group();
  const add = (m: THREE.Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); group.add(m); return m; };

  // legs (pivot at hip so they swing)
  const legL = add(box(0.2, 0.72, 0.2, L.pants, true), -0.13, 0.72, 0);
  const legR = add(box(0.2, 0.72, 0.2, L.pants, true), 0.13, 0.72, 0);
  // torso
  add(box(0.52, 0.62, 0.28, L.shirt), 0, 1.03, 0);
  if (L.vest) add(box(0.56, 0.4, 0.34, L.accent), 0, 1.12, 0);
  if (L.robe) add(box(0.56, 0.34, 0.32, L.shirt), 0, 0.58, 0); // robe skirt
  if (L.chestMark != null) add(box(0.16, 0.16, 0.02, L.chestMark), 0, 1.16, -0.16);
  // head + face
  const headY = 1.6;
  add(box(0.46, 0.46, 0.46, L.skin), 0, headY, 0);
  add(box(0.48, 0.14, 0.48, L.hair), 0, headY + 0.18, 0.01); // hair cap
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222230 });
  for (const dx of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.02), eyeMat);
    add(eye, dx, headY + 0.03, -0.235);
  }
  if (L.hood) add(box(0.54, 0.5, 0.5, L.accent), 0, headY + 0.06, 0.05);
  if (L.helmet) add(box(0.52, 0.18, 0.52, L.accent), 0, headY + 0.22, 0);
  if (L.hat) {
    add(box(0.6, 0.08, 0.6, L.accent), 0, headY + 0.27, 0);
    add(box(0.3, 0.3, 0.3, L.accent), 0, headY + 0.45, 0);
    add(box(0.14, 0.2, 0.14, L.accent), 0, headY + 0.68, 0);
  }
  // arms (pivot at shoulder)
  const armL = add(box(0.16, 0.62, 0.16, L.shirt), -0.34, 1.32, 0);
  const armR = add(box(0.16, 0.62, 0.16, L.shirt), 0.34, 1.32, 0);
  // hands
  const handL = box(0.16, 0.1, 0.16, L.skin); handL.position.y = -0.66; armL.add(handL);
  const handR = handL.clone(); armR.add(handR);

  // held gear (attached to right arm so it swings)
  const glowMat = new THREE.MeshBasicMaterial({ color: L.glow });
  if (L.weapon === 'dagger') {
    const blade = box(0.05, 0.34, 0.09, 0x9a8ab8); blade.position.set(0, -0.78, -0.1); armR.add(blade);
  } else if (L.weapon === 'sword') {
    const blade = box(0.07, 0.7, 0.12, 0xd8dce4); blade.position.set(0, -0.95, -0.08); armR.add(blade);
  } else if (L.weapon === 'staff') {
    const pole = box(0.07, 1.2, 0.07, 0x7a5a36); pole.position.set(0, -0.6, -0.08); armR.add(pole);
    const orb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), glowMat); orb.position.set(0, 0.02, -0.08); armR.add(orb);
  } else if (L.weapon === 'wand') {
    const pole = box(0.06, 0.5, 0.06, 0xc8b890); pole.position.set(0, -0.85, -0.08); armR.add(pole);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), glowMat); tip.position.set(0, -1.12, -0.08); armR.add(tip);
  } else if (L.weapon === 'rifle') {
    armR.rotation.x = -1.2;
    const gun = box(0.1, 0.1, 0.7, 0x2e3034); gun.position.set(0, -0.58, -0.2); armR.add(gun);
  }
  if (L.shield) {
    const sh = box(0.07, 0.46, 0.4, L.accent); sh.position.set(-0.1, -0.45, 0); armL.add(sh);
  }
  return { group, armL, armR, legL, legR };
}

/** Swing limbs by walk speed; call every frame. */
export function animateAvatar(rig: AvatarRig, walkT: number, speed: number): void {
  const sw = Math.sin(walkT * 2) * Math.min(1, speed / 5) * 0.55;
  rig.legL.rotation.x = sw;
  rig.legR.rotation.x = -sw;
  rig.armL.rotation.x = -sw * 0.8;
  if (Math.abs(rig.armR.rotation.x) < 1) rig.armR.rotation.x = sw * 0.8; // keep rifle pose
}

/** Your own body, shown in third-person view. */
export class PlayerModel {
  private rig: AvatarRig | null = null;
  private walkT = 0;
  private visible = false;

  constructor(private scene: THREE.Scene) {}

  setRole(role: RoleId): void {
    if (this.rig) {
      this.scene.remove(this.rig.group);
      this.rig.group.traverse((o) => {
        if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
      });
    }
    this.rig = buildAvatar(role);
    this.rig.group.visible = this.visible;
    this.scene.add(this.rig.group);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (this.rig) this.rig.group.visible = v;
  }

  update(dt: number, position: THREE.Vector3, yaw: number, horizontalSpeed: number): void {
    if (!this.rig) return;
    this.rig.group.position.copy(position);
    this.rig.group.rotation.y = yaw + Math.PI; // model faces look direction
    if (horizontalSpeed > 0.5) this.walkT += dt * horizontalSpeed * 1.6;
    animateAvatar(this.rig, this.walkT, horizontalSpeed);
  }
}
