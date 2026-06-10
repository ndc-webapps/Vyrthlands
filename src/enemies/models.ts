import * as THREE from 'three';

/**
 * Modular voxel enemy model factory. Every enemy kind has a distinct
 * silhouette built from boxes; limbs are pivoted at their joint so the
 * MobManager can animate them (walk swing, wing flap, hover bob).
 * Models are built at scale 1 facing -Z; the caller scales the group.
 */

export type ModelKind =
  | 'humanoid' | 'dino' | 'quad' | 'crawler' | 'spider'
  | 'drone' | 'ghost' | 'brute' | 'flyer' | 'turret';

export interface ModelSpec {
  kind: ModelKind;
  body: number;    // main color
  accent: number;  // secondary color (armor, plates, clothes)
  glow: number;    // eyes / glow parts
  // humanoid options
  helmet?: boolean;
  armor?: boolean;
  hood?: boolean;
  weapon?: 'sword' | 'rifle' | 'staff' | 'dagger' | 'none';
  backpack?: boolean;
  shield?: boolean;
  zombieArms?: boolean;   // arms held forward
  skeletal?: boolean;     // thin limbs
  lean?: boolean;         // leans forward while moving (runners)
  // dino options
  bulky?: boolean;        // quadruped heavy herbivore
  longNeck?: boolean;
  horns?: boolean;
  plates?: boolean;
  club?: boolean;
  sail?: boolean;
  spikes?: boolean;
  // misc
  glowBody?: boolean;     // whole body emissive (fire/energy creatures)
  transparent?: number;   // opacity for ghosts
  ears?: boolean;         // pointy ears (wolves, goblins)
}

export interface Rig {
  body: THREE.Mesh;            // primary mesh (hurt flash target)
  head: THREE.Mesh | null;
  legs: THREE.Mesh[];
  arms: THREE.Mesh[];
  wings: THREE.Mesh[];
  tail: THREE.Mesh | null;
  armsForward: boolean;        // zombie pose: don't swing arms normally
  lean: boolean;
  hover: number;               // base hover height (0 = grounded)
  flashMats: THREE.MeshLambertMaterial[];
}

/** Collision half-extents per kind at scale 1: [width, height]. */
export const BASE_HIT: Record<ModelKind, [number, number]> = {
  humanoid: [0.6, 1.8],
  dino: [0.9, 1.4],
  quad: [0.7, 1.0],
  crawler: [0.8, 0.7],
  spider: [0.8, 0.6],
  drone: [0.8, 0.8],
  ghost: [0.6, 1.5],
  brute: [1.0, 2.1],
  flyer: [0.8, 0.7],
  turret: [0.7, 1.3],
};

interface Ctx {
  group: THREE.Group;
  bodyMat: THREE.MeshLambertMaterial;
  accentMat: THREE.MeshLambertMaterial;
  darkMat: THREE.MeshLambertMaterial;
  glowMat: THREE.MeshBasicMaterial;
  spec: ModelSpec;
}

function makeCtx(spec: ModelSpec): Ctx {
  const group = new THREE.Group();
  const mk = (c: number) => {
    const m = new THREE.MeshLambertMaterial({ color: c });
    if (spec.transparent != null) {
      m.transparent = true;
      m.opacity = spec.transparent;
    }
    if (spec.glowBody) m.emissive = new THREE.Color(spec.glow).multiplyScalar(0.35);
    return m;
  };
  return {
    group,
    bodyMat: mk(spec.body),
    accentMat: mk(spec.accent),
    darkMat: mk(0x16161c),
    glowMat: new THREE.MeshBasicMaterial({ color: spec.glow }),
    spec,
  };
}

function part(
  ctx: Ctx, w: number, h: number, d: number,
  x: number, y: number, z: number,
  mat: THREE.Material, pivot: 'center' | 'top' | 'back' = 'center'
): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  if (pivot === 'top') g.translate(0, -h / 2, 0);
  if (pivot === 'back') g.translate(0, 0, -d / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  ctx.group.add(m);
  return m;
}

function eyes(ctx: Ctx, y: number, z: number, dx = 0.11, s = 0.09): void {
  for (const sx of [-dx, dx]) part(ctx, s, s, 0.04, sx, y, z, ctx.glowMat);
}

// ---------- builders ----------

function buildHumanoid(ctx: Ctx): Rig {
  const s = ctx.spec;
  const limbW = s.skeletal ? 0.11 : 0.17;
  const legs = [
    part(ctx, limbW, 0.78, limbW, -0.15, 0.78, 0, ctx.darkMat, 'top'),
    part(ctx, limbW, 0.78, limbW, 0.15, 0.78, 0, ctx.darkMat, 'top'),
  ];
  const torsoW = s.skeletal ? 0.42 : 0.56;
  const body = part(ctx, torsoW, 0.66, 0.3, 0, 1.11, 0, ctx.bodyMat);
  if (s.armor) part(ctx, torsoW + 0.1, 0.4, 0.38, 0, 1.2, 0, ctx.accentMat);
  const head = part(ctx, 0.42, 0.42, 0.42, 0, 1.66, 0, ctx.bodyMat);
  eyes(ctx, 1.7, -0.22);
  if (s.helmet) part(ctx, 0.48, 0.18, 0.48, 0, 1.86, 0, ctx.accentMat);
  if (s.hood) part(ctx, 0.5, 0.5, 0.46, 0, 1.7, 0.06, ctx.accentMat);
  if (s.ears) for (const dx of [-0.18, 0.18]) part(ctx, 0.08, 0.18, 0.06, dx, 1.92, 0, ctx.bodyMat);
  if (s.backpack) part(ctx, 0.4, 0.46, 0.2, 0, 1.16, 0.26, ctx.accentMat);
  const arms = [
    part(ctx, limbW, 0.7, limbW, -(torsoW / 2 + limbW / 2 + 0.02), 1.4, 0, ctx.bodyMat, 'top'),
    part(ctx, limbW, 0.7, limbW, torsoW / 2 + limbW / 2 + 0.02, 1.4, 0, ctx.bodyMat, 'top'),
  ];
  if (s.zombieArms) for (const a of arms) a.rotation.x = -1.35;
  // held gear attaches to right arm so it animates with it
  const armR = arms[1];
  if (s.weapon === 'sword') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, 0.14), ctx.accentMat);
    blade.position.set(0, -0.75, -0.3);
    armR.add(blade);
  } else if (s.weapon === 'dagger') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.1), ctx.accentMat);
    blade.position.set(0, -0.7, -0.18);
    armR.add(blade);
  } else if (s.weapon === 'rifle') {
    armR.rotation.x = -1.4;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.85), ctx.darkMat);
    gun.position.set(0, -0.6, -0.25);
    armR.add(gun);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.08), ctx.glowMat);
    tip.position.set(0, -0.6, -0.7);
    armR.add(tip);
  } else if (s.weapon === 'staff') {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.08), ctx.darkMat);
    pole.position.set(0, -0.5, -0.1);
    armR.add(pole);
    const orb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), ctx.glowMat);
    orb.position.set(0, 0.18, -0.1);
    armR.add(orb);
  }
  if (s.shield) {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.45), ctx.accentMat);
    sh.position.set(-0.12, -0.45, 0);
    arms[0].add(sh);
  }
  return rig(body, head, legs, arms, [], null, !!s.zombieArms, !!s.lean, 0, ctx);
}

function buildDino(ctx: Ctx): Rig {
  const s = ctx.spec;
  const quad = !!s.bulky;
  const bodyY = quad ? 0.78 : 0.95;
  const bw = quad ? 1.25 : 0.95;
  const body = part(ctx, bw, 0.72, 1.8, 0, bodyY, 0, ctx.bodyMat);
  const neckH = s.longNeck ? 1.5 : 0.5;
  part(ctx, 0.4, neckH, 0.42, 0, bodyY + neckH * 0.45, -0.95, ctx.bodyMat);
  const headY = bodyY + (s.longNeck ? neckH * 0.95 : 0.55);
  const head = part(ctx, 0.56, 0.44, 0.66, 0, headY, -1.25, ctx.bodyMat);
  part(ctx, 0.38, 0.24, 0.42, 0, headY - 0.06, -1.72, ctx.bodyMat); // snout
  eyes(ctx, headY + 0.08, -1.59, 0.16);
  const tail = part(ctx, 0.34, 0.3, 1.5, 0, bodyY - 0.05, 0.95, ctx.bodyMat, 'back');
  tail.position.z = 0.9;
  const legH = quad ? 0.62 : 0.95;
  const legs: THREE.Mesh[] = [];
  const zs = quad ? [-0.55, 0.55] : [0.1];
  for (const dz of zs) for (const dx of [-bw * 0.36, bw * 0.36]) {
    legs.push(part(ctx, 0.24, legH, 0.26, dx, legH, dz, ctx.bodyMat, 'top'));
  }
  const arms: THREE.Mesh[] = [];
  if (!quad) for (const dx of [-0.4, 0.4]) {
    arms.push(part(ctx, 0.1, 0.34, 0.1, dx, bodyY + 0.18, -0.7, ctx.bodyMat, 'top'));
  }
  if (s.horns) for (const dx of [-0.24, 0, 0.24]) part(ctx, 0.09, 0.4, 0.09, dx, headY + 0.32, -1.45, ctx.accentMat);
  if (s.plates) for (let i = 0; i < 6; i++) part(ctx, 0.12, 0.44, 0.12, 0, bodyY + 0.5, -0.7 + i * 0.32, ctx.accentMat);
  if (s.spikes) for (let i = 0; i < 5; i++) part(ctx, 0.3, 0.26, 0.1, 0, bodyY + 0.46, -0.6 + i * 0.34, ctx.accentMat);
  if (s.sail) for (let i = 0; i < 6; i++) part(ctx, 0.1, 0.7, 0.12, 0, bodyY + 0.6, -0.6 + i * 0.26, ctx.accentMat);
  if (s.club) part(ctx, 0.5, 0.36, 0.5, 0, bodyY - 0.05, 1.85, ctx.accentMat);
  return rig(body, head, legs, arms, [], tail, false, false, 0, ctx);
}

function buildQuad(ctx: Ctx): Rig {
  const s = ctx.spec;
  const body = part(ctx, 0.55, 0.5, 1.15, 0, 0.68, 0, ctx.bodyMat);
  const head = part(ctx, 0.42, 0.38, 0.42, 0, 0.85, -0.75, ctx.bodyMat);
  part(ctx, 0.26, 0.2, 0.28, 0, 0.78, -1.05, ctx.bodyMat); // snout
  eyes(ctx, 0.92, -0.96, 0.12);
  if (s.ears) for (const dx of [-0.14, 0.14]) part(ctx, 0.09, 0.16, 0.06, dx, 1.1, -0.72, ctx.bodyMat);
  const tail = part(ctx, 0.14, 0.14, 0.55, 0, 0.78, 0.55, ctx.bodyMat, 'back');
  if (s.spikes) for (let i = 0; i < 4; i++) part(ctx, 0.1, 0.18, 0.1, 0, 0.98, -0.35 + i * 0.26, ctx.accentMat);
  const legs: THREE.Mesh[] = [];
  for (const dz of [-0.42, 0.42]) for (const dx of [-0.2, 0.2]) {
    legs.push(part(ctx, 0.14, 0.48, 0.14, dx, 0.48, dz, ctx.bodyMat, 'top'));
  }
  return rig(body, head, legs, [], [], tail, false, false, 0, ctx);
}

function buildCrawler(ctx: Ctx): Rig {
  const body = part(ctx, 0.7, 0.32, 1.1, 0, 0.32, 0, ctx.bodyMat);
  const head = part(ctx, 0.4, 0.32, 0.38, 0, 0.38, -0.7, ctx.bodyMat);
  eyes(ctx, 0.44, -0.9, 0.12);
  const arms = [
    part(ctx, 0.13, 0.5, 0.13, -0.4, 0.45, -0.45, ctx.bodyMat, 'top'),
    part(ctx, 0.13, 0.5, 0.13, 0.4, 0.45, -0.45, ctx.bodyMat, 'top'),
  ];
  for (const a of arms) a.rotation.x = -1.1; // dragging forward
  part(ctx, 0.5, 0.2, 0.6, 0, 0.22, 0.8, ctx.bodyMat); // dragging lower half
  return rig(body, head, [], arms, [], null, true, false, 0, ctx);
}

function buildSpider(ctx: Ctx): Rig {
  const body = part(ctx, 0.66, 0.3, 0.72, 0, 0.42, 0, ctx.bodyMat);
  const head = part(ctx, 0.34, 0.26, 0.3, 0, 0.46, -0.48, ctx.bodyMat);
  eyes(ctx, 0.5, -0.64, 0.09, 0.07);
  const legs: THREE.Mesh[] = [];
  for (const dz of [-0.25, 0, 0.25]) for (const side of [-1, 1]) {
    const leg = part(ctx, 0.07, 0.55, 0.07, side * 0.4, 0.5, dz, ctx.darkMat, 'top');
    leg.rotation.z = side * 0.85;
    legs.push(leg);
  }
  return rig(body, head, legs, [], [], null, false, false, 0, ctx);
}

function buildDrone(ctx: Ctx): Rig {
  const body = part(ctx, 0.62, 0.28, 0.62, 0, 0, 0, ctx.bodyMat);
  part(ctx, 0.2, 0.12, 0.06, 0, 0, -0.34, ctx.glowMat); // sensor eye
  part(ctx, 0.3, 0.1, 0.3, 0, -0.18, 0, ctx.accentMat); // undercarriage
  const wings: THREE.Mesh[] = [];
  for (const dx of [-1, 1]) {
    part(ctx, 0.3, 0.06, 0.08, dx * 0.45, 0.08, 0, ctx.accentMat); // rotor arm
    const rotor = part(ctx, 0.44, 0.03, 0.44, dx * 0.6, 0.14, 0, ctx.glowMat);
    wings.push(rotor);
  }
  return rig(body, null, [], [], wings, null, false, false, 1.6, ctx);
}

function buildGhost(ctx: Ctx): Rig {
  const body = part(ctx, 0.55, 0.7, 0.45, 0, 0.85, 0, ctx.bodyMat);
  const head = part(ctx, 0.44, 0.42, 0.42, 0, 1.42, 0, ctx.bodyMat);
  eyes(ctx, 1.46, -0.22, 0.12);
  // tapering wispy tail instead of legs
  part(ctx, 0.42, 0.3, 0.34, 0, 0.38, 0, ctx.bodyMat);
  part(ctx, 0.26, 0.24, 0.22, 0, 0.12, 0.05, ctx.bodyMat);
  const arms = [
    part(ctx, 0.12, 0.5, 0.12, -0.34, 1.15, 0, ctx.bodyMat, 'top'),
    part(ctx, 0.12, 0.5, 0.12, 0.34, 1.15, 0, ctx.bodyMat, 'top'),
  ];
  for (const a of arms) a.rotation.x = -0.9;
  return rig(body, head, [], arms, [], null, true, false, 0.6, ctx);
}

function buildBrute(ctx: Ctx): Rig {
  const legs = [
    part(ctx, 0.26, 0.6, 0.28, -0.24, 0.6, 0, ctx.darkMat, 'top'),
    part(ctx, 0.26, 0.6, 0.28, 0.24, 0.6, 0, ctx.darkMat, 'top'),
  ];
  const body = part(ctx, 0.95, 0.85, 0.55, 0, 1.05, 0, ctx.bodyMat);
  for (const dx of [-0.5, 0.5]) part(ctx, 0.3, 0.24, 0.45, dx, 1.45, 0, ctx.accentMat); // shoulders
  const head = part(ctx, 0.36, 0.34, 0.36, 0, 1.66, -0.1, ctx.bodyMat);
  eyes(ctx, 1.7, -0.29, 0.1);
  if (ctx.spec.horns) for (const dx of [-0.2, 0.2]) part(ctx, 0.1, 0.3, 0.1, dx, 1.9, -0.08, ctx.accentMat);
  const arms = [
    part(ctx, 0.26, 0.95, 0.26, -0.66, 1.4, 0, ctx.bodyMat, 'top'),
    part(ctx, 0.26, 0.95, 0.26, 0.66, 1.4, 0, ctx.bodyMat, 'top'),
  ];
  return rig(body, head, legs, arms, [], null, false, false, 0, ctx);
}

function buildFlyer(ctx: Ctx): Rig {
  const body = part(ctx, 0.5, 0.32, 0.85, 0, 0, 0, ctx.bodyMat);
  const head = part(ctx, 0.32, 0.28, 0.34, 0, 0.08, -0.55, ctx.bodyMat);
  part(ctx, 0.16, 0.12, 0.4, 0, 0.02, -0.85, ctx.bodyMat); // beak/snout
  eyes(ctx, 0.14, -0.7, 0.1, 0.07);
  const tail = part(ctx, 0.16, 0.1, 0.5, 0, 0, 0.45, ctx.bodyMat, 'back');
  const wings: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const g = new THREE.BoxGeometry(1.1, 0.06, 0.5);
    g.translate(side * 0.55, 0, 0); // pivot at wing root
    const w = new THREE.Mesh(g, ctx.accentMat);
    w.position.set(side * 0.25, 0.1, 0);
    ctx.group.add(w);
    wings.push(w);
  }
  const legs = [
    part(ctx, 0.07, 0.3, 0.07, -0.14, -0.14, 0.1, ctx.darkMat, 'top'),
    part(ctx, 0.07, 0.3, 0.07, 0.14, -0.14, 0.1, ctx.darkMat, 'top'),
  ];
  return rig(body, head, legs, [], wings, tail, false, false, 0.7, ctx);
}

function buildTurret(ctx: Ctx): Rig {
  part(ctx, 0.8, 0.25, 0.8, 0, 0.13, 0, ctx.darkMat); // base
  part(ctx, 0.3, 0.5, 0.3, 0, 0.5, 0, ctx.accentMat); // pillar
  const body = part(ctx, 0.55, 0.4, 0.6, 0, 0.95, 0, ctx.bodyMat);
  part(ctx, 0.12, 0.12, 0.7, 0, 0.95, -0.6, ctx.darkMat); // barrel
  part(ctx, 0.07, 0.07, 0.1, 0, 0.95, -0.97, ctx.glowMat); // muzzle
  part(ctx, 0.18, 0.1, 0.05, 0, 1.1, -0.31, ctx.glowMat); // sensor
  return rig(body, null, [], [], [], null, false, false, 0, ctx);
}

function rig(
  body: THREE.Mesh, head: THREE.Mesh | null, legs: THREE.Mesh[], arms: THREE.Mesh[],
  wings: THREE.Mesh[], tail: THREE.Mesh | null, armsForward: boolean, lean: boolean,
  hover: number, ctx: Ctx
): Rig {
  return {
    body, head, legs, arms, wings, tail, armsForward, lean, hover,
    flashMats: [ctx.bodyMat, ctx.accentMat],
  };
}

const BUILDERS: Record<ModelKind, (ctx: Ctx) => Rig> = {
  humanoid: buildHumanoid,
  dino: buildDino,
  quad: buildQuad,
  crawler: buildCrawler,
  spider: buildSpider,
  drone: buildDrone,
  ghost: buildGhost,
  brute: buildBrute,
  flyer: buildFlyer,
  turret: buildTurret,
};

export function buildModel(spec: ModelSpec, scale: number): { group: THREE.Group; rig: Rig } {
  const ctx = makeCtx(spec);
  const r = BUILDERS[spec.kind](ctx);
  ctx.group.scale.setScalar(scale);
  return { group: ctx.group, rig: r };
}
