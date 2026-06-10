import * as THREE from 'three';
import { Player } from './player';
import { World } from './world/world';
import { MobManager } from './mobs';
import { ProjectileManager } from './projectiles';
import { RoleId } from './roles';

/**
 * Skill registry. Two active skills per role (Q / E-or-R) plus an
 * ultimate placeholder per role for the future unlock system.
 *  Assassin  — Dash Strike (gap-closer that damages) + Smoke Veil
 *  Wizard    — Arcane Bolt + Frost Ring (AoE slow)
 *  Swordsman — Power Slash (cone) + Bulwark Stance
 *  Healer    — Heal Pulse + Lifebloom (regen blessing)
 *  Gunner    — Power Shot (heavy knockback round) + Scatter Blast
 */

export interface ActiveEffects {
  invulnT: number;      // no damage taken
  shieldT: number;      // 70% damage reduction
  regenBoostT: number;  // strong regen
  speedT: number;       // movement burst
}

export interface SkillContext {
  player: Player;
  world: World;
  mobs: MobManager;
  projectiles: ProjectileManager;
  effects: ActiveEffects;
  heldDamage: number;
  heal(frac: number): void;
  toast(msg: string): void;
}

export interface SkillDef {
  id: string;
  name: string;
  role: RoleId;
  desc: string;
  cooldown: number;     // seconds
  costType: 'mana';
  manaCost: number;     // 0..100
  range: number;        // blocks (0 = self)
  duration: number;     // seconds (0 = instant)
  unlockLevel: number;  // placeholder for the future level system
  color: string;        // UI accent
  rune: string;         // single glyph for the skill icon
  cast(ctx: SkillContext): boolean; // false = fizzle (no cost)
}

const eye = new THREE.Vector3();
const dir = new THREE.Vector3();

/** Dash along the sightline to the last free spot; returns travel info. */
function dash(ctx: SkillContext, maxDist: number): { from: THREE.Vector3; dir: THREE.Vector3; dist: number } | null {
  const p = ctx.player;
  p.lookDirection(dir);
  const from = p.position.clone();
  let best: THREE.Vector3 | null = null;
  let dist = 0;
  for (let d = 1; d <= maxDist; d += 0.5) {
    const x = p.position.x + dir.x * d;
    const y = Math.max(2, p.position.y + dir.y * d);
    const z = p.position.z + dir.z * d;
    const free =
      !ctx.world.isSolidAt(x, y + 0.1, z) &&
      !ctx.world.isSolidAt(x, y + 1.5, z);
    if (free) { best = new THREE.Vector3(x, y, z); dist = d; }
    else break;
  }
  if (!best) return null;
  p.position.copy(best);
  p.velocity.set(0, 0, 0);
  return { from, dir: dir.clone(), dist };
}

function def(
  id: string, name: string, role: RoleId, desc: string,
  cooldown: number, manaCost: number, range: number, duration: number,
  color: string, rune: string, cast: SkillDef['cast']
): SkillDef {
  return { id, name, role, desc, cooldown, costType: 'mana', manaCost, range, duration, unlockLevel: 1, color, rune, cast };
}

export const SKILLS: Record<string, SkillDef> = {
  dashstrike: def('dashstrike', 'Dash Strike', 'assassin',
    'Dash 7 blocks forward, slashing every enemy you pass.',
    5, 20, 7, 0, '#b890ff', '↟', (ctx) => {
      ctx.player.eyePosition(eye);
      const travel = dash(ctx, 7);
      if (!travel) return false;
      const hits = ctx.mobs.alongLine(eye, travel.dir, travel.dist + 1, 1.4);
      for (const m of hits) ctx.mobs.damage(m, ctx.heldDamage * 1.2 + 4, travel.dir);
      if (hits.length) ctx.toast(`Dash Strike hit ${hits.length}!`);
      return true;
    }),
  veil: def('veil', 'Smoke Veil', 'assassin',
    'Vanish into smoke: untouchable and 40% faster for 3s.',
    16, 35, 0, 3, '#8a8aa8', '◌', (ctx) => {
      ctx.effects.invulnT = 3;
      ctx.effects.speedT = 3;
      ctx.toast('You melt into the shadows…');
      return true;
    }),
  arcbolt: def('arcbolt', 'Arcane Bolt', 'wizard',
    'Hurl a crackling crystal bolt (6 dmg).',
    1.2, 12, 26, 0, '#7df0ff', '⚡', (ctx) => {
      ctx.player.eyePosition(eye);
      ctx.player.lookDirection(dir);
      ctx.projectiles.fire(eye, dir, 26, 6, 0x7df0ff);
      return true;
    }),
  frostring: def('frostring', 'Frost Ring', 'wizard',
    'A ring of frost slows all enemies within 7 blocks for 4s.',
    10, 25, 7, 4, '#c8f0ff', '❄', (ctx) => {
      const n = ctx.mobs.slowAround(ctx.player.position, 7, 4);
      if (n === 0) { ctx.toast('No enemies nearby'); return false; }
      ctx.toast(`Frost Ring slowed ${n} ${n === 1 ? 'enemy' : 'enemies'}`);
      return true;
    }),
  powerslash: def('powerslash', 'Power Slash', 'swordsman',
    'Sweep all enemies in front of you (weapon dmg +150%).',
    5, 15, 3.4, 0, '#ffb060', '⌁', (ctx) => {
      ctx.player.eyePosition(eye);
      ctx.player.lookDirection(dir);
      const targets = ctx.mobs.inArc(eye, dir, 3.4);
      if (targets.length === 0) {
        ctx.toast('Nothing in range');
        return false;
      }
      for (const m of targets) ctx.mobs.damage(m, ctx.heldDamage * 1.5 + 3, dir);
      return true;
    }),
  bulwark: def('bulwark', 'Guard Stance', 'swordsman',
    'Brace: 70% less damage for 6s.',
    18, 20, 0, 6, '#d0d4dc', '⛨', (ctx) => {
      ctx.effects.shieldT = 6;
      ctx.toast('You brace behind your guard.');
      return true;
    }),
  mend: def('mend', 'Heal Pulse', 'healer',
    'A pulse of light instantly restores 35% health.',
    9, 30, 0, 0, '#8df06a', '✚', (ctx) => {
      ctx.heal(0.35);
      return true;
    }),
  lifebloom: def('lifebloom', 'Lifebloom', 'healer',
    'Blessing of regrowth: strong regen for 8s.',
    22, 35, 0, 8, '#5cf0b8', '❀', (ctx) => {
      ctx.effects.regenBoostT = 8;
      ctx.toast('Life energy flows through you.');
      return true;
    }),
  powershot: def('powershot', 'Power Shot', 'gunner',
    'A heavy charged round (10 dmg, strong knockback).',
    4, 15, 38, 0, '#ffd070', '➳', (ctx) => {
      ctx.player.eyePosition(eye);
      ctx.player.lookDirection(dir);
      ctx.projectiles.fire(eye, dir, 38, 10, 0xffd070, 0.12);
      return true;
    }),
  scatter: def('scatter', 'Scatter Blast', 'gunner',
    'A cone of 6 sparks (3 dmg each).',
    7, 22, 24, 0, '#ff9060', '✺', (ctx) => {
      ctx.player.eyePosition(eye);
      ctx.player.lookDirection(dir);
      for (let i = 0; i < 6; i++) {
        const spread = dir.clone();
        spread.x += (Math.random() - 0.5) * 0.22;
        spread.y += (Math.random() - 0.5) * 0.12;
        spread.z += (Math.random() - 0.5) * 0.22;
        spread.normalize();
        ctx.projectiles.fire(eye, spread, 24, 3, 0xff9060, 0.09);
      }
      return true;
    }),
};

export const ROLE_SKILLS: Record<RoleId, [string, string]> = {
  assassin: ['dashstrike', 'veil'],
  wizard: ['arcbolt', 'frostring'],
  swordsman: ['powerslash', 'bulwark'],
  healer: ['mend', 'lifebloom'],
  gunner: ['powershot', 'scatter'],
};

/** Ultimate placeholders: data only, wired to the future unlock system. */
export const ROLE_ULTIMATES: Record<RoleId, { name: string; desc: string }> = {
  assassin: { name: 'Night Execution', desc: 'Burst-execute a weakened enemy.' },
  wizard: { name: 'Meteor Shard', desc: 'Call down an area-damage shard.' },
  swordsman: { name: 'Blade Storm', desc: 'Spinning slash around you.' },
  healer: { name: 'Sanctuary Field', desc: 'Temporary healing zone.' },
  gunner: { name: 'Rainfire Barrage', desc: 'Saturate an area with shots.' },
};
