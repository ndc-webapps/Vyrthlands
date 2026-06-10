import { Item } from './items';
import { Block } from './blocks';

export type RoleId = 'assassin' | 'wizard' | 'swordsman' | 'healer' | 'gunner';

export interface RoleDef {
  id: RoleId;
  name: string;
  desc: string;
  passiveName: string;
  passiveDesc: string;
  startItems: { item: number; count: number; durability?: number }[];
  passives: {
    speedMult: number;
    maxHealthMult: number;
    regenPerSec: number;   // fraction of max health per second
    miningMult: number;
    manaMax: number;
    manaRegenMult: number; // mana regen speed multiplier
    meleeMult: number;     // melee damage multiplier
    rangedMult: number;    // gun/staff projectile damage multiplier
    backstabMult: number;  // bonus when striking an unaware/behind enemy
    healItemMult: number;  // food/bandage effectiveness multiplier
  };
}

function p(o: Partial<RoleDef['passives']>): RoleDef['passives'] {
  return {
    speedMult: 1, maxHealthMult: 1, regenPerSec: 0.005, miningMult: 1,
    manaMax: 60, manaRegenMult: 1, meleeMult: 1, rangedMult: 1, backstabMult: 1, healItemMult: 1,
    ...o,
  };
}

export const ROLES: Record<RoleId, RoleDef> = {
  assassin: {
    id: 'assassin', name: 'Assassin',
    desc: 'Fast and silent. Strikes from the shadows for bonus damage.',
    passiveName: 'Shadow Step',
    passiveDesc: '+18% speed; +70% damage when striking unaware or from behind.',
    startItems: [{ item: Item.Dagger, count: 1, durability: 180 }],
    passives: p({ speedMult: 1.18, maxHealthMult: 0.85, miningMult: 1.15, backstabMult: 1.7 }),
  },
  wizard: {
    id: 'wizard', name: 'Wizard',
    desc: 'Channels crystal magic. Big mana pool, fast regen.',
    passiveName: 'Crystal Affinity',
    passiveDesc: '+60% mana regen, larger mana pool, faster crystal mining.',
    startItems: [{ item: Item.Staff, count: 1, durability: 200 }, { item: Item.CrystalShard, count: 2 }],
    passives: p({ maxHealthMult: 0.9, manaMax: 100, manaRegenMult: 1.6, miningMult: 1.1, rangedMult: 1.15 }),
  },
  swordsman: {
    id: 'swordsman', name: 'Swordsman',
    desc: 'Tough front-liner. Extra health and heavy melee hits.',
    passiveName: 'Iron Will',
    passiveDesc: '+30% max health; melee weapons deal +25% damage.',
    startItems: [{ item: Item.Sword, count: 1, durability: 250 }],
    passives: p({ maxHealthMult: 1.3, manaMax: 45, meleeMult: 1.25 }),
  },
  healer: {
    id: 'healer', name: 'Support Healer',
    desc: 'Steady regeneration. Keeps the party alive.',
    passiveName: 'Life Bloom',
    passiveDesc: 'Strong passive regen; food and bandages heal 30% more.',
    startItems: [{ item: Item.Wand, count: 1, durability: 220 }, { item: Block.Planks, count: 8 }],
    passives: p({ regenPerSec: 0.02, manaRegenMult: 1.2, healItemMult: 1.3 }),
  },
  gunner: {
    id: 'gunner', name: 'Gunner',
    desc: 'Ranged tech fighter. Hits harder at range.',
    passiveName: 'Steady Aim',
    passiveDesc: '+25% ranged damage; +5% speed.',
    startItems: [{ item: Item.Blaster, count: 1, durability: 200 }],
    passives: p({ speedMult: 1.05, rangedMult: 1.25 }),
  },
};

export interface PlayerStats {
  maxHealth: number;   // 1.0 baseline scale
  speedMult: number;
  regenPerSec: number;
  miningMult: number;
  manaMax: number;
  manaRegenMult: number;
  meleeMult: number;
  rangedMult: number;
  backstabMult: number;
  healItemMult: number;
}

/** Derive stats from role (equipment modifiers hook in here later). */
export function computeStats(role: RoleId): PlayerStats {
  const v = ROLES[role].passives;
  return {
    maxHealth: v.maxHealthMult,
    speedMult: v.speedMult,
    regenPerSec: v.regenPerSec,
    miningMult: v.miningMult,
    manaMax: v.manaMax,
    manaRegenMult: v.manaRegenMult,
    meleeMult: v.meleeMult,
    rangedMult: v.rangedMult,
    backstabMult: v.backstabMult,
    healItemMult: v.healItemMult,
  };
}
