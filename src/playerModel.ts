import * as THREE from 'three';
import { RoleId } from './roles';

/**
 * Full-body voxel player avatars with pixel-art skins, one distinct look
 * per role (all original designs in the classic blocky-skin style).
 * Used for your own third-person view and for remote players.
 */

export interface AvatarRig {
  group: THREE.Group;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
}

// ---------- pixel-skin definitions ----------
interface Skin {
  hair: string; hairD: string;
  skin: string; skinD: string;
  eye: string;
  suit: string; suitD: string;      // torso / sleeves
  pants: string; pantsD: string;
  boot: string;
  glove?: string;
  trim: string;                      // collar / belt / cuffs
  emblem?: string;                   // chest emblem
  tabard?: string;                   // knight chest cloth column
  face: 'open' | 'mask' | 'visor' | 'slit';
  mask?: string;
  beard?: string;
  hood?: string;                     // covers head top/sides/back + brow
  glowEyes?: boolean;
  // extra geometry flags
  hat?: boolean; helmetBrim?: boolean; robe?: boolean; vest?: boolean;
  weapon?: 'dagger' | 'staff' | 'sword' | 'wand' | 'rifle';
  shield?: boolean;
  accent: number; glow: number;      // colors for hat/brim/shield/orb meshes
}

const SKINS: Record<RoleId, Skin> = {
  // midnight suit, crimson armor accents, glowing red eyes, face mask
  assassin: {
    hair: '#1a1420', hairD: '#120e18', skin: '#d8a07a', skinD: '#b9835f', eye: '#ff3040',
    suit: '#241e2e', suitD: '#181322', pants: '#171221', pantsD: '#100c18', boot: '#0e0c14',
    glove: '#3a1218', trim: '#c8202e', emblem: '#c8202e', face: 'mask', mask: '#a01624',
    hood: '#161020', glowEyes: true,
    weapon: 'dagger', accent: 0x4a2030, glow: 0xff3040,
  },
  // deep violet robes, gold trim, white beard, bright arcane eyes
  wizard: {
    hair: '#e8e8f0', hairD: '#c6c6d4', skin: '#d8a07a', skinD: '#b9835f', eye: '#7df0ff',
    suit: '#3a2c72', suitD: '#2c2058', pants: '#282052', pantsD: '#1e1840', boot: '#1a1536',
    trim: '#e8c050', emblem: '#e8c050', face: 'open', beard: '#e8e8f0', glowEyes: true,
    hat: true, robe: true, weapon: 'staff', accent: 0x3a2c72, glow: 0x7df0ff,
  },
  // full steel plate, helmet slit, blue tabard with gold belt
  swordsman: {
    hair: '#c4cad2', hairD: '#979ea8', skin: '#c4cad2', skinD: '#979ea8', eye: '#ffd070',
    suit: '#c4cad2', suitD: '#9aa0aa', pants: '#7a828c', pantsD: '#5e6670', boot: '#3a4048',
    trim: '#d8a840', tabard: '#2c4a9a', face: 'slit', glowEyes: true,
    helmetBrim: true, weapon: 'sword', shield: true, accent: 0x9aa0aa, glow: 0xffd070,
  },
  // gentle teal-and-cream priest robes with gold trim and a soft hood
  healer: {
    hair: '#d8c8a8', hairD: '#bcab8a', skin: '#d8a07a', skinD: '#b9835f', eye: '#3a4a44',
    suit: '#dcefe6', suitD: '#bcd8cc', pants: '#b8d4c8', pantsD: '#9bb9ad', boot: '#8a7a58',
    trim: '#d8b860', emblem: '#d8b860', face: 'open', hood: '#8ec4b4',
    robe: true, weapon: 'wand', accent: 0x8ec4b4, glow: 0x8df06a,
  },
  // bright orange field suit, dark gloves/boots, cyan power core
  gunner: {
    hair: '#5a3a22', hairD: '#462c18', skin: '#c89068', skinD: '#a97750', eye: '#2c2c34',
    suit: '#e8862a', suitD: '#c06818', pants: '#3a3f4a', pantsD: '#2c313a', boot: '#23272e',
    glove: '#2c3038', trim: '#40e0f0', emblem: '#40e0f0', face: 'open',
    vest: true, weapon: 'rifle', accent: 0x2c313a, glow: 0x40e0f0,
  },
};

// ---------- tiny 8x8 texture painter ----------
const T = 8;
type Px = (x: number, y: number, c: string) => void;

function hash2(x: number, y: number, salt: number): number {
  let h = (salt + 1) * 374761393 + x * 668265263 + y * 2147483423;
  h = (h ^ (h >>> 13)) >>> 0;
  return ((h * 1274126177) >>> 0) / 4294967295;
}

/** Fill with base color, sprinkling the darker shade for texture. */
function shadeFill(px: Px, c: string, cD: string, salt: number, x0 = 0, y0 = 0, x1 = T - 1, y1 = T - 1): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    px(x, y, hash2(x, y, salt) > 0.78 ? cD : c);
  }
}

function texMaterial(paint: (px: Px) => void): THREE.MeshLambertMaterial {
  const c = document.createElement('canvas');
  c.width = T; c.height = T;
  const ctx = c.getContext('2d')!;
  paint((x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); });
  const tx = new THREE.CanvasTexture(c);
  tx.magFilter = THREE.NearestFilter;
  tx.minFilter = THREE.NearestFilter;
  tx.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: tx });
}

/** Box with painted faces: [right, left, top, bottom, front, back]. */
function texBox(
  w: number, h: number, d: number,
  front: (px: Px) => void, side: (px: Px) => void,
  top: (px: Px) => void, back?: (px: Px) => void,
  pivotTop = false
): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  if (pivotTop) g.translate(0, -h / 2, 0);
  const sideM = texMaterial(side);
  const topM = texMaterial(top);
  return new THREE.Mesh(g, [sideM, sideM.clone(), topM, topM.clone(), texMaterial(front), texMaterial(back ?? side)]);
}

function box(w: number, h: number, d: number, color: number, pivotTop = false): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  if (pivotTop) g.translate(0, -h / 2, 0);
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
}

// ---------- per-part painters ----------
function headFront(s: Skin): (px: Px) => void {
  return (px) => {
    if (s.face === 'slit') {
      // full helm: steel with a dark eye slit and glowing eyes
      shadeFill(px, s.suit, s.suitD, 11);
      for (let x = 0; x < T; x++) px(x, 3, '#23262c');
      px(2, 3, s.eye); px(5, 3, s.eye);
      for (let y = 5; y < T; y++) px(3, y, '#9aa0aa'); // breath holes column
      return;
    }
    // hair / hood brow, then face
    shadeFill(px, s.skin, s.skinD, 12);
    const browC = s.hood ?? s.hair;
    const browD = s.hood ?? s.hairD;
    shadeFill(px, browC, browD, 13, 0, 0, T - 1, 1);
    if (s.hood) { for (let y = 0; y < T; y++) { px(0, y, s.hood); px(T - 1, y, s.hood); } }
    // eyes: white + iris
    px(1, 3, '#ffffff'); px(2, 3, s.eye);
    px(6, 3, '#ffffff'); px(5, 3, s.eye);
    if (s.face === 'mask') {
      shadeFill(px, s.mask!, s.mask!, 14, 0, 5, T - 1, T - 1);
    } else if (s.beard) {
      shadeFill(px, s.beard, s.hairD, 15, 1, 5, T - 2, T - 1);
      px(3, 5, s.skinD); px(4, 5, s.skinD); // mouth gap
    } else {
      px(3, 6, s.skinD); px(4, 6, s.skinD); // mouth shadow
    }
  };
}

function headSide(s: Skin): (px: Px) => void {
  return (px) => {
    if (s.face === 'slit') { shadeFill(px, s.suit, s.suitD, 16); return; }
    if (s.hood) { shadeFill(px, s.hood, s.hood, 17); return; }
    shadeFill(px, s.skin, s.skinD, 18);
    shadeFill(px, s.hair, s.hairD, 19, 0, 0, T - 1, 2); // hair falls over the sides
  };
}

function headTop(s: Skin): (px: Px) => void {
  return (px) => {
    const c = s.face === 'slit' ? s.suit : s.hood ?? s.hair;
    const d = s.face === 'slit' ? s.suitD : s.hood ?? s.hairD;
    shadeFill(px, c, d, 20);
  };
}

function torsoFront(s: Skin): (px: Px) => void {
  return (px) => {
    shadeFill(px, s.suit, s.suitD, 21);
    if (s.tabard) shadeFill(px, s.tabard, s.tabard, 22, 2, 1, 5, T - 1); // knight cloth
    for (let x = 0; x < T; x++) { px(x, 0, s.trim); px(x, 6, s.trim); }  // collar + belt
    px(3, 6, '#3a3022'); px(4, 6, '#3a3022');                            // buckle
    if (s.emblem) { px(3, 2, s.emblem); px(4, 2, s.emblem); px(3, 3, s.emblem); px(4, 3, s.emblem); }
  };
}

function torsoSide(s: Skin): (px: Px) => void {
  return (px) => {
    shadeFill(px, s.suit, s.suitD, 23);
    for (let x = 0; x < T; x++) px(x, 6, s.trim);
  };
}

function armTex(s: Skin): (px: Px) => void {
  return (px) => {
    shadeFill(px, s.suit, s.suitD, 24);
    px(0, 5, s.trim); px(T - 1, 5, s.trim); // cuff hints
    shadeFill(px, s.glove ?? s.skin, s.glove ?? s.skinD, 25, 0, 6, T - 1, T - 1);
  };
}

function legTex(s: Skin): (px: Px) => void {
  return (px) => {
    shadeFill(px, s.pants, s.pantsD, 26);
    shadeFill(px, s.boot, s.boot, 27, 0, 6, T - 1, T - 1);
  };
}

/** Build a role-themed avatar (~1.8 blocks tall). The model FACES -Z, the
 *  same direction as look-at yaw 0 — so group.rotation.y = player yaw. */
export function buildAvatar(role: RoleId): AvatarRig {
  const s = SKINS[role];
  const group = new THREE.Group();
  const add = (m: THREE.Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); group.add(m); return m; };

  // legs (pivot at hip so they swing)
  const leg = () => texBox(0.2, 0.72, 0.2, legTex(s), legTex(s), legTex(s), undefined, true);
  const legL = add(leg(), -0.13, 0.72, 0);
  const legR = add(leg(), 0.13, 0.72, 0);
  // torso
  add(texBox(0.52, 0.62, 0.28, torsoFront(s), torsoSide(s), torsoSide(s), torsoSide(s)), 0, 1.03, 0);
  if (s.vest) add(box(0.56, 0.4, 0.34, s.accent), 0, 1.12, 0);
  if (s.robe) add(texBox(0.56, 0.34, 0.32, torsoSide(s), torsoSide(s), torsoSide(s)), 0, 0.58, 0); // robe skirt
  // head (face, hair, hood, helmet — all painted; front looks down -Z)
  const headY = 1.6;
  add(texBox(0.46, 0.46, 0.46, headFront(s), headSide(s), headTop(s), headSide(s)), 0, headY, 0);
  if (s.helmetBrim) add(box(0.52, 0.18, 0.52, s.accent), 0, headY + 0.22, 0);
  if (s.hat) {
    add(box(0.6, 0.08, 0.6, s.accent), 0, headY + 0.27, 0);
    add(box(0.3, 0.3, 0.3, s.accent), 0, headY + 0.45, 0);
    add(box(0.14, 0.2, 0.14, s.accent), 0, headY + 0.68, 0);
  }
  // arms (pivot at shoulder so they swing)
  const arm = () => texBox(0.16, 0.62, 0.16, armTex(s), armTex(s), armTex(s), undefined, true);
  const armL = add(arm(), -0.34, 1.63, 0);
  const armR = add(arm(), 0.34, 1.63, 0);

  // held gear (attached to the right arm so it swings)
  const glowMat = new THREE.MeshBasicMaterial({ color: s.glow });
  if (s.weapon === 'dagger') {
    const blade = box(0.05, 0.34, 0.09, 0x9a8ab8); blade.position.set(0, -0.78, -0.1); armR.add(blade);
  } else if (s.weapon === 'sword') {
    const blade = box(0.07, 0.7, 0.12, 0xd8dce4); blade.position.set(0, -0.95, -0.08); armR.add(blade);
  } else if (s.weapon === 'staff') {
    const pole = box(0.07, 1.2, 0.07, 0x7a5a36); pole.position.set(0, -0.6, -0.08); armR.add(pole);
    const orb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), glowMat); orb.position.set(0, 0.02, -0.08); armR.add(orb);
  } else if (s.weapon === 'wand') {
    const pole = box(0.06, 0.5, 0.06, 0xc8b890); pole.position.set(0, -0.85, -0.08); armR.add(pole);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), glowMat); tip.position.set(0, -1.12, -0.08); armR.add(tip);
  } else if (s.weapon === 'rifle') {
    armR.rotation.x = -1.2;
    const gun = box(0.1, 0.1, 0.7, 0x2e3034); gun.position.set(0, -0.58, -0.2); armR.add(gun);
  }
  if (s.shield) {
    const sh = box(0.07, 0.46, 0.4, s.accent); sh.position.set(-0.1, -0.45, 0); armL.add(sh);
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

/** Dispose an avatar's geometries, materials, and skin textures. */
export function disposeAvatar(rig: AvatarRig): void {
  rig.group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      (m as THREE.MeshLambertMaterial).map?.dispose();
      m.dispose();
    }
  });
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
      disposeAvatar(this.rig);
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
    this.rig.group.rotation.y = yaw; // model front (-Z) follows the look direction
    if (horizontalSpeed > 0.5) this.walkT += dt * horizontalSpeed * 1.6;
    animateAvatar(this.rig, this.walkT, horizontalSpeed);
  }
}
