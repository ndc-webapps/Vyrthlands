import { Item } from '../items';
import { ModelSpec } from './models';

/**
 * Per-world enemy archetype registry. Every world gets a distinct roster:
 * shapes, stats, behaviors, spawn times, rarity weights, and loot tables.
 * All names and designs are original to Vyrthlands.
 */

export type Behavior =
  | 'roam'      // passive wander; flees or charges when provoked
  | 'flee'      // skittish, runs from the player
  | 'chase'     // melee aggro within detect range
  | 'pack'      // spawns in groups, chases together
  | 'swarm'     // relentless chase, wide night detection
  | 'ambush'    // idle/hidden until close, then fast burst
  | 'ranged'    // keeps distance, fires projectiles
  | 'patrol'    // walks routes, engages on sight (melee or ranged)
  | 'fly'       // airborne, circles and swoops
  | 'turret'    // stationary, rotates and shoots
  | 'boss';     // big, slow, heavy hits, rare

export interface EnemyDef {
  id: string;
  name: string;
  model: ModelSpec;
  scale: number;
  health: number;
  speed: number;
  damage: number;        // fraction of player health per hit
  attackRange: number;
  detectRange: number;
  behavior: Behavior;
  spawnTime: 'day' | 'night' | 'both';
  weight: number;        // spawn weight (higher = more common)
  packSize?: number;     // group spawn count
  loot: Item[];
  projectileColor?: number;  // set => ranged shots use this
  projectileSpeed?: number;
  chargeOnHit?: boolean; // passive that retaliates instead of fleeing
  alerts?: boolean;      // aggroes nearby mobs when it spots the player
  explodes?: boolean;    // bursts on death, damaging a close player
}

export interface WorldEnemies {
  dayMax: number;
  nightMax: number;
  spawnEvery: number;
  defs: EnemyDef[];
}

function d(
  id: string, name: string, model: ModelSpec, scale: number,
  health: number, speed: number, damage: number,
  behavior: Behavior, loot: Item[], o: Partial<EnemyDef> = {}
): EnemyDef {
  return {
    id, name, model, scale, health, speed, damage, behavior, loot,
    attackRange: 1.5, detectRange: 16, spawnTime: 'both', weight: 10, ...o,
  };
}

const m = (kind: ModelSpec['kind'], body: number, accent: number, glow: number, o: Partial<ModelSpec> = {}): ModelSpec =>
  ({ kind, body, accent, glow, ...o });

export const ENEMY_WORLDS: Record<string, WorldEnemies> = {
  // ------- Natural / flat: light ambient threat -------
  natural: {
    dayMax: 3, nightMax: 6, spawnEvery: 4,
    defs: [
      d('gloomling', 'Gloomling', m('crawler', 0x2a2438, 0x3a3050, 0xc890ff), 0.9, 10, 2.4, 0.07, 'swarm', [Item.VoidShard], { spawnTime: 'night', weight: 20 }),
      d('meadow-strider', 'Meadow Strider', m('quad', 0x8a7a50, 0xb8a060, 0x2a2018, { ears: true }), 1.0, 12, 2.0, 0.05, 'roam', [Item.RawMeat, Item.LeafFiber], { spawnTime: 'day', weight: 12 }),
      d('crystal-sprite', 'Crystal Sprite', m('ghost', 0x9adcf0, 0xc8f0ff, 0x7df0ff, { transparent: 0.7 }), 0.8, 8, 2.6, 0.05, 'flee', [Item.CrystalShard], { weight: 6 }),
    ],
  },
  flat: {
    dayMax: 1, nightMax: 4, spawnEvery: 5,
    defs: [
      d('gloomling', 'Gloomling', m('crawler', 0x2a2438, 0x3a3050, 0xc890ff), 0.9, 10, 2.4, 0.07, 'swarm', [Item.VoidShard], { spawnTime: 'night', weight: 20 }),
    ],
  },

  // ------- Pre Historic: 10 dinosaur types -------
  prehistoric: {
    dayMax: 6, nightMax: 11, spawnEvery: 2.6,
    defs: [
      d('tiny-raptor', 'Tiny Raptor', m('dino', 0x6f8a3a, 0x44551f, 0xffd070), 0.55, 8, 3.4, 0.05, 'pack', [Item.FossilShard, Item.PrimalHide], { packSize: 3, weight: 22, detectRange: 18 }),
      d('forest-raptor', 'Forest Raptor', m('dino', 0x3f6b34, 0x294a20, 0xffd070, { spikes: true }), 1.0, 18, 3.0, 0.09, 'ambush', [Item.PrimalHide, Item.FossilShard], { weight: 16, detectRange: 14 }),
      d('giant-rex', 'Giant Rex', m('dino', 0x6a4a2a, 0x4a3018, 0xff7040, { spikes: true }), 2.3, 80, 2.0, 0.28, 'boss', [Item.FossilShard, Item.AmberResin, Item.PrimalHide], { weight: 3, attackRange: 2.6, detectRange: 22 }),
      d('horned-grazer', 'Horned Grazer', m('dino', 0x7a6848, 0xd8d0b8, 0x2a2018, { bulky: true, horns: true }), 1.5, 35, 2.2, 0.12, 'roam', [Item.RawMeat, Item.PrimalHide], { chargeOnHit: true, spawnTime: 'day', weight: 14, attackRange: 1.9 }),
      d('longneck-titan', 'Longneck Titan', m('dino', 0x8a9a6a, 0x6a7a4f, 0x2a2018, { bulky: true, longNeck: true }), 2.6, 60, 1.4, 0.0, 'roam', [Item.RawMeat, Item.PrimalHide, Item.LeafFiber], { spawnTime: 'day', weight: 7 }),
      d('armored-anklo', 'Armored Anklo', m('dino', 0x5a5a48, 0x8a8a70, 0x2a2018, { bulky: true, club: true, plates: true }), 1.4, 50, 1.6, 0.14, 'roam', [Item.FossilShard, Item.PrimalHide], { chargeOnHit: true, weight: 9, attackRange: 2.0 }),
      d('swamp-spitter', 'Swamp Spitter', m('dino', 0x4a6a55, 0x32503e, 0xb6ff30, { sail: true }), 1.1, 20, 2.2, 0.08, 'ranged', [Item.AmberResin, Item.FossilShard], { weight: 10, attackRange: 11, projectileColor: 0xb6ff30, projectileSpeed: 16 }),
      d('sky-ptera', 'Sky Ptera', m('flyer', 0x8a6a4a, 0xb89868, 0xffd070), 1.3, 14, 3.2, 0.09, 'fly', [Item.AmberResin, Item.FossilShard], { weight: 6 }),
      d('boneback', 'Boneback Predator', m('dino', 0x3a3540, 0xd8d0c0, 0xff5a4a, { spikes: true, horns: true }), 1.5, 32, 2.7, 0.14, 'chase', [Item.FossilShard, Item.AmberResin], { spawnTime: 'night', weight: 12 }),
      d('volcano-behemoth', 'Volcano Behemoth', m('dino', 0x4a1512, 0xff5a1f, 0xff8c32, { bulky: true, spikes: true, glowBody: true }), 2.4, 95, 1.7, 0.3, 'boss', [Item.EmberCoal, Item.FossilShard, Item.AmberResin], { weight: 2, attackRange: 2.6 }),
    ],
  },

  // ------- Zombie World: 8 infected types -------
  zombie: {
    dayMax: 5, nightMax: 14, spawnEvery: 2.0,
    defs: [
      d('walker', 'Walker', m('humanoid', 0x4b6a45, 0x39513a, 0xb8ff7a, { zombieArms: true }), 1.0, 16, 1.7, 0.09, 'swarm', [Item.InfectedTissue, Item.MedScrap, Item.CannedFood], { weight: 26 }),
      d('runner', 'Runner', m('humanoid', 0x5f7a4a, 0x3a4a30, 0xd0ff7a, { zombieArms: true, lean: true, skeletal: true }), 1.0, 10, 3.4, 0.08, 'swarm', [Item.InfectedTissue, Item.MedScrap], { spawnTime: 'night', weight: 14, detectRange: 22 }),
      d('crawler-inf', 'Crawler', m('crawler', 0x46603e, 0x32482c, 0xb8ff7a), 1.0, 10, 2.2, 0.07, 'ambush', [Item.InfectedTissue], { weight: 12, detectRange: 10 }),
      d('bloated', 'Bloated Infected', m('brute', 0x6a7a48, 0x4d5c36, 0xd6ff50), 1.15, 42, 1.2, 0.13, 'chase', [Item.InfectedTissue, Item.MedScrap, Item.CannedFood], { explodes: true, weight: 7 }),
      d('screamer', 'Screamer', m('humanoid', 0x7a8a6a, 0x55654a, 0xffffff, { skeletal: true }), 0.95, 7, 2.6, 0.05, 'chase', [Item.InfectedTissue, Item.MedScrap], { alerts: true, weight: 8, detectRange: 20 }),
      d('armored-walker', 'Armored Walker', m('humanoid', 0x4b6a45, 0x3a4048, 0xb8ff7a, { zombieArms: true, helmet: true, armor: true }), 1.05, 30, 1.6, 0.1, 'swarm', [Item.ScrapIron, Item.InfectedTissue], { weight: 9 }),
      d('burning-inf', 'Burning Infected', m('humanoid', 0x5a3020, 0xff7030, 0xffb030, { zombieArms: true, glowBody: true }), 1.0, 14, 2.4, 0.12, 'chase', [Item.EmberCoal, Item.InfectedTissue], { weight: 6 }),
      d('night-stalker', 'Night Stalker', m('humanoid', 0x222830, 0x161a20, 0xff4040, { lean: true, skeletal: true }), 1.05, 18, 3.7, 0.12, 'ambush', [Item.InfectedTissue, Item.MedScrap], { spawnTime: 'night', weight: 10, detectRange: 24 }),
    ],
  },

  // ------- Battlefront Ruins: 7 soldier types -------
  battlefront: {
    dayMax: 6, nightMax: 9, spawnEvery: 3.0,
    defs: [
      d('infantry', 'Infantry Soldier', m('humanoid', 0x46513c, 0x2e3528, 0xff5a4a, { helmet: true, weapon: 'rifle', backpack: true }), 1.0, 16, 2.4, 0.08, 'patrol', [Item.AmmoCasing, Item.ScrapIron], { weight: 22, attackRange: 12, projectileColor: 0xffd070, projectileSpeed: 26 }),
      d('scout', 'Scout', m('humanoid', 0x5a6548, 0x46513c, 0xffe080, { lean: true }), 0.95, 9, 3.6, 0.07, 'chase', [Item.AmmoCasing, Item.FuelCell], { alerts: true, weight: 12, detectRange: 24 }),
      d('sniper', 'Sniper', m('humanoid', 0x3a4232, 0x2a3024, 0xff4040, { hood: true, weapon: 'rifle' }), 1.0, 8, 1.8, 0.14, 'ranged', [Item.AmmoCasing, Item.ScrapIron], { weight: 8, attackRange: 22, detectRange: 26, projectileColor: 0xff6050, projectileSpeed: 40 }),
      d('spy', 'Spy', m('humanoid', 0x2e3034, 0x1e2024, 0xc8d0e0, { hood: true, weapon: 'dagger' }), 1.0, 12, 3.3, 0.11, 'ambush', [Item.FuelCell, Item.AmmoCasing], { weight: 8, detectRange: 12 }),
      d('heavy', 'Heavy Soldier', m('brute', 0x46513c, 0x32382a, 0xff5a4a, { }), 1.15, 45, 1.7, 0.14, 'chase', [Item.ScrapIron, Item.FuelCell, Item.AmmoCasing], { weight: 7 }),
      d('medic', 'Field Medic', m('humanoid', 0x8a9078, 0xe8e8e8, 0xf06a6a, { backpack: true }), 1.0, 12, 2.3, 0.0, 'flee', [Item.MedScrap, Item.CannedFood], { weight: 6 }),
      d('engineer', 'Engineer', m('humanoid', 0x5a5448, 0xc89a40, 0xffe080, { helmet: true, backpack: true }), 1.0, 14, 2.1, 0.07, 'roam', [Item.ScrapIron, Item.FuelCell, Item.CircuitBoard], { chargeOnHit: true, weight: 7 }),
    ],
  },

  // ------- Medieval Kingdom: 6 fantasy types -------
  medieval: {
    dayMax: 5, nightMax: 9, spawnEvery: 2.9,
    defs: [
      d('goblin', 'Goblin', m('humanoid', 0x5a7a3a, 0x4a3a28, 0xffe080, { ears: true, weapon: 'dagger' }), 0.75, 10, 3.1, 0.06, 'pack', [Item.SilverOre, Item.Stick], { packSize: 2, weight: 20 }),
      d('skeleton-knight', 'Skeleton Knight', m('humanoid', 0xd8d4c8, 0x6a7080, 0x70d0ff, { skeletal: true, helmet: true, weapon: 'sword', shield: true }), 1.05, 22, 2.2, 0.11, 'chase', [Item.SilverOre, Item.MagicCrystal], { spawnTime: 'night', weight: 14 }),
      d('bandit', 'Bandit', m('humanoid', 0x6a4a32, 0x3a3028, 0xffd070, { hood: true, weapon: 'sword' }), 1.0, 16, 2.6, 0.09, 'patrol', [Item.SilverOre, Item.CannedFood], { weight: 14 }),
      d('wolf', 'Grey Wolf', m('quad', 0x6a6a72, 0x4a4a52, 0xffd040, { ears: true }), 1.0, 14, 3.4, 0.08, 'pack', [Item.RawMeat, Item.PrimalHide], { packSize: 3, spawnTime: 'night', weight: 12 }),
      d('dark-mage', 'Dark Mage', m('humanoid', 0x3a2a4a, 0x241a30, 0xc890ff, { hood: true, weapon: 'staff' }), 1.0, 14, 2.0, 0.1, 'ranged', [Item.MagicCrystal, Item.VoidShard], { weight: 5, attackRange: 12, projectileColor: 0xc890ff, projectileSpeed: 18 }),
      d('dungeon-guardian', 'Dungeon Guardian', m('brute', 0x55585f, 0x8a8f98, 0xffe080, { horns: true }), 1.5, 70, 1.6, 0.22, 'boss', [Item.AncientRelic, Item.MagicCrystal, Item.SilverOre], { weight: 3, attackRange: 2.2 }),
    ],
  },

  // ------- Cyberpunk City: 6 tech types -------
  cyberpunk: {
    dayMax: 6, nightMax: 10, spawnEvery: 2.7,
    defs: [
      d('patrol-drone', 'Patrol Drone', m('drone', 0x56666a, 0x3a4448, 0x40f0ff), 1.0, 12, 3.0, 0.07, 'fly', [Item.CircuitBoard, Item.EnergyCore], { weight: 18, attackRange: 10, projectileColor: 0x40f0ff, projectileSpeed: 22 }),
      d('rogue-bot', 'Rogue Bot', m('humanoid', 0x6a7478, 0x46505a, 0xff3050, { helmet: true, armor: true }), 1.05, 22, 2.3, 0.1, 'chase', [Item.ScrapIron, Item.CircuitBoard], { weight: 16 }),
      d('cyber-gangster', 'Cyber Gangster', m('humanoid', 0x3a3242, 0xff50d0, 0x40f0ff, { weapon: 'rifle' }), 1.0, 14, 2.7, 0.09, 'ranged', [Item.EnergyCore, Item.PlasmaCell], { weight: 12, attackRange: 11, projectileColor: 0xff50d0, projectileSpeed: 24 }),
      d('security-turret', 'Security Turret', m('turret', 0x4a5258, 0x32383e, 0xff3050), 1.0, 25, 0, 0.09, 'turret', [Item.CircuitBoard, Item.ScrapIron, Item.EnergyCore], { weight: 7, attackRange: 13, projectileColor: 0xff3050, projectileSpeed: 28 }),
      d('spider-bot', 'Spider Bot', m('spider', 0x3a4448, 0x2a3034, 0x40f0ff), 0.85, 9, 3.6, 0.06, 'pack', [Item.CircuitBoard, Item.ScrapIron], { packSize: 2, weight: 12 }),
      d('mech-brute', 'Mech Brute', m('brute', 0x4a5258, 0x6a7478, 0xff7030), 1.6, 85, 1.5, 0.24, 'boss', [Item.EnergyCore, Item.PlasmaCell, Item.CircuitBoard], { weight: 2, attackRange: 2.3 }),
    ],
  },

  // ------- Haunted Village: 6 horror types -------
  haunted: {
    dayMax: 3, nightMax: 11, spawnEvery: 2.4,
    defs: [
      d('ghost', 'Ghost', m('ghost', 0xb8c4dc, 0x9aa8c8, 0x7df0ff, { transparent: 0.55 }), 1.0, 12, 2.6, 0.09, 'chase', [Item.SoulShard], { weight: 18, spawnTime: 'night', detectRange: 18 }),
      d('witch', 'Witch', m('humanoid', 0x3a3045, 0x241c30, 0xb6ff30, { hood: true, weapon: 'staff' }), 1.0, 16, 2.1, 0.1, 'ranged', [Item.MoonHerb, Item.CursedWood], { weight: 12, attackRange: 11, projectileColor: 0xb6ff30, projectileSpeed: 17 }),
      d('shadow-beast', 'Shadow Beast', m('quad', 0x16161e, 0x0e0e14, 0xff4040, { spikes: true }), 1.1, 18, 3.5, 0.11, 'ambush', [Item.SoulShard, Item.VoidShard], { spawnTime: 'night', weight: 12, detectRange: 14 }),
      d('possessed', 'Possessed Villager', m('humanoid', 0x6a5a48, 0x4a4038, 0xc890ff, { zombieArms: true }), 1.0, 16, 1.6, 0.09, 'swarm', [Item.CursedWood, Item.MoonHerb], { weight: 14 }),
      d('grave-crawler', 'Grave Crawler', m('crawler', 0x4a4438, 0x33302a, 0xc890ff), 1.0, 12, 2.4, 0.08, 'ambush', [Item.SoulShard, Item.CursedWood], { spawnTime: 'night', weight: 10 }),
      d('cursed-knight', 'Cursed Knight', m('humanoid', 0x3a4050, 0x2a3040, 0xb890ff, { helmet: true, armor: true, weapon: 'sword', transparent: 0.85 }), 1.35, 60, 1.9, 0.2, 'boss', [Item.SoulShard, Item.AncientRelic, Item.MagicCrystal], { spawnTime: 'night', weight: 3 }),
    ],
  },

  // ------- Underworld -------
  underworld: {
    dayMax: 6, nightMax: 12, spawnEvery: 2.4,
    defs: [
      d('fire-imp', 'Fire Imp', m('humanoid', 0x6a2418, 0xff5a1f, 0xffb030, { ears: true, glowBody: true }), 0.7, 9, 3.3, 0.07, 'pack', [Item.EmberCoal], { packSize: 2, weight: 20 }),
      d('lava-beast', 'Lava Beast', m('quad', 0x4a1512, 0xff5a1f, 0xff8c32, { spikes: true, glowBody: true }), 1.3, 28, 2.4, 0.13, 'chase', [Item.EmberCoal, Item.VoidShard], { weight: 14 }),
      d('ash-skeleton', 'Ash Skeleton', m('humanoid', 0x55504a, 0x3a3631, 0xff7030, { skeletal: true, weapon: 'sword' }), 1.0, 14, 2.5, 0.09, 'chase', [Item.EmberCoal, Item.VoidShard], { weight: 14 }),
      d('demon-brute', 'Demon Brute', m('brute', 0x4a1512, 0x2e0d0a, 0xff5a1f, { horns: true }), 1.4, 55, 1.8, 0.2, 'boss', [Item.VoidShard, Item.EmberCoal, Item.GoldIngot], { weight: 4 }),
      d('magma-crawler', 'Magma Crawler', m('crawler', 0x3a1410, 0xff7030, 0xffb030, { glowBody: true }), 1.0, 14, 2.5, 0.1, 'ambush', [Item.EmberCoal], { weight: 10 }),
      d('void-wraith', 'Void Wraith', m('ghost', 0x241a30, 0x16101e, 0xc890ff, { transparent: 0.6 }), 1.1, 16, 2.8, 0.11, 'chase', [Item.VoidShard, Item.SoulShard], { spawnTime: 'night', weight: 8 }),
    ],
  },

  // ------- Ice Age / frozen -------
  frozen: {
    dayMax: 5, nightMax: 9, spawnEvery: 2.9,
    defs: [
      d('frost-wolf', 'Frost Wolf', m('quad', 0xc8d8e4, 0x9ab4c4, 0x7df0ff, { ears: true }), 1.0, 14, 3.3, 0.08, 'pack', [Item.RawMeat, Item.PrimalHide, Item.CrystalShard], { packSize: 3, weight: 18 }),
      d('ice-golem', 'Ice Golem', m('brute', 0x9fc8d8, 0xd8f0f8, 0x7df0ff), 1.3, 45, 1.5, 0.15, 'chase', [Item.CrystalShard, Item.SilverOre], { weight: 10 }),
      d('snow-stalker', 'Snow Stalker', m('quad', 0xe8f0f4, 0xc8d8e0, 0xff4040, { spikes: true }), 1.1, 18, 3.2, 0.11, 'ambush', [Item.PrimalHide, Item.CrystalShard], { spawnTime: 'night', weight: 12 }),
      d('yeti-brute', 'Yeti Brute', m('brute', 0xe8e8e8, 0xc0ccd4, 0x70d0ff), 1.5, 65, 1.7, 0.2, 'boss', [Item.PrimalHide, Item.CrystalShard, Item.SilverOre], { weight: 3 }),
      d('ice-spirit', 'Ice Spirit', m('ghost', 0xc8e8f4, 0xa8d0e4, 0xffffff, { transparent: 0.6 }), 0.9, 12, 2.6, 0.08, 'chase', [Item.CrystalShard, Item.SoulShard], { spawnTime: 'night', weight: 8 }),
      d('frozen-skeleton', 'Frozen Skeleton', m('humanoid', 0xc8d4dc, 0x8aa0b0, 0x7df0ff, { skeletal: true, weapon: 'sword' }), 1.0, 14, 2.3, 0.09, 'chase', [Item.SilverOre, Item.CrystalShard], { spawnTime: 'night', weight: 12 }),
    ],
  },

  // ------- Pirate Island -------
  pirate: {
    dayMax: 5, nightMax: 8, spawnEvery: 3.0,
    defs: [
      d('pirate-raider', 'Pirate Raider', m('humanoid', 0x6a4630, 0x8a2a2a, 0xffd070, { hood: true, weapon: 'sword' }), 1.0, 16, 2.6, 0.09, 'patrol', [Item.GoldIngot, Item.AmmoCasing], { weight: 20 }),
      d('cursed-sailor', 'Cursed Sailor', m('humanoid', 0x4a6058, 0x35443e, 0x70ffc0, { zombieArms: true }), 1.0, 14, 1.9, 0.08, 'swarm', [Item.GoldIngot, Item.SoulShard], { spawnTime: 'night', weight: 14 }),
      d('crab-beast', 'Crab Beast', m('spider', 0xc85030, 0x8a3220, 0xffe080), 1.1, 20, 2.4, 0.09, 'chase', [Item.RawMeat, Item.GoldIngot], { weight: 12 }),
      d('reef-spitter', 'Reef Spitter', m('quad', 0x3a6a6a, 0x2a5050, 0x70f0d0, { spikes: true }), 1.0, 14, 2.2, 0.08, 'ranged', [Item.CrystalShard, Item.GoldIngot], { weight: 8, attackRange: 10, projectileColor: 0x70f0d0, projectileSpeed: 17 }),
      d('treasure-mimic', 'Treasure Mimic', m('crawler', 0x8a6430, 0xffd070, 0xff4040), 0.9, 18, 3.0, 0.11, 'ambush', [Item.GoldIngot, Item.AncientRelic], { weight: 6, detectRange: 8 }),
      d('skeleton-captain', 'Skeleton Captain', m('humanoid', 0xd8d4c8, 0x6a2a2a, 0xffd070, { skeletal: true, helmet: true, weapon: 'sword' }), 1.3, 55, 2.0, 0.18, 'boss', [Item.GoldIngot, Item.AncientRelic], { spawnTime: 'night', weight: 3 }),
    ],
  },

  // ------- Alien Planet -------
  alien: {
    dayMax: 6, nightMax: 10, spawnEvery: 2.6,
    defs: [
      d('alien-crawler', 'Alien Crawler', m('crawler', 0x6a3f82, 0x4a2a60, 0x80ff70), 1.0, 14, 2.7, 0.08, 'swarm', [Item.MagicCrystal, Item.VoidShard], { weight: 18 }),
      d('flying-alien', 'Flying Alien', m('flyer', 0x7a4a92, 0x5a3370, 0x80ff70), 1.0, 12, 3.2, 0.08, 'fly', [Item.MagicCrystal, Item.PlasmaCell], { weight: 10 }),
      d('parasite', 'Parasite', m('spider', 0x4a6a30, 0x33501f, 0xb6ff30), 0.6, 6, 3.8, 0.05, 'pack', [Item.InfectedTissue], { packSize: 3, weight: 16 }),
      d('worm-beast', 'Worm Beast', m('crawler', 0x8a5a72, 0x6a4055, 0xff50d0), 1.5, 30, 2.0, 0.13, 'chase', [Item.VoidShard, Item.MagicCrystal], { weight: 8 }),
      d('crystal-guardian', 'Crystal Guardian', m('brute', 0x6a50d0, 0x9a80ff, 0xc8ffff, { glowBody: true }), 1.4, 60, 1.7, 0.2, 'boss', [Item.MagicCrystal, Item.CrystalShard, Item.PlasmaCell], { weight: 3 }),
      d('bio-slime', 'Bio Slime', m('crawler', 0x4a8a3a, 0x70c050, 0xb6ff30, { glowBody: true }), 0.9, 16, 1.4, 0.07, 'chase', [Item.InfectedTissue, Item.LeafFiber], { weight: 10 }),
    ],
  },

  // ------- Sky Islands -------
  skyislands: {
    dayMax: 4, nightMax: 8, spawnEvery: 3.0,
    defs: [
      d('wind-spirit', 'Wind Spirit', m('ghost', 0xb8c8dc, 0x98aac4, 0x7df0ff, { transparent: 0.6 }), 1.0, 12, 3.0, 0.08, 'chase', [Item.CrystalShard, Item.SoulShard], { weight: 16 }),
      d('sky-beast', 'Sky Beast', m('flyer', 0x8aa0c8, 0x6a80a8, 0xffe080), 1.4, 20, 2.9, 0.11, 'fly', [Item.CrystalShard, Item.MagicCrystal], { weight: 10 }),
      d('flying-skeleton', 'Flying Skeleton', m('flyer', 0xd8d4c8, 0xb0aca0, 0x70d0ff), 1.0, 12, 3.1, 0.09, 'fly', [Item.SoulShard, Item.SilverOre], { spawnTime: 'night', weight: 10 }),
      d('cloud-wisp', 'Cloud Wisp', m('ghost', 0xe8f0f8, 0xd0e0f0, 0xffffff, { transparent: 0.5 }), 0.8, 8, 2.2, 0.0, 'flee', [Item.CrystalShard], { spawnTime: 'day', weight: 10 }),
      d('storm-harpy', 'Storm Harpy', m('flyer', 0x4a4a6a, 0x35355a, 0xffe040), 1.2, 16, 3.4, 0.1, 'fly', [Item.MagicCrystal, Item.CrystalShard], { weight: 8, attackRange: 9, projectileColor: 0xffe040, projectileSpeed: 22 }),
      d('island-guardian', 'Island Guardian', m('brute', 0x8a8a98, 0xb8c8dc, 0x7df0ff), 1.5, 65, 1.6, 0.2, 'boss', [Item.AncientRelic, Item.CrystalShard, Item.MagicCrystal], { weight: 3 }),
    ],
  },

  // ------- Wasteland -------
  wasteland: {
    dayMax: 6, nightMax: 10, spawnEvery: 2.7,
    defs: [
      d('raider', 'Raider', m('humanoid', 0x6a5a42, 0x4a3e2c, 0xff7030, { helmet: true, weapon: 'rifle' }), 1.0, 15, 2.5, 0.08, 'patrol', [Item.ScrapIron, Item.AmmoCasing, Item.FuelCell], { weight: 18, attackRange: 11, projectileColor: 0xffaa50, projectileSpeed: 24 }),
      d('mutant', 'Mutant', m('brute', 0x677040, 0x4c5430, 0xb6ff30), 1.2, 35, 2.0, 0.13, 'chase', [Item.InfectedTissue, Item.ScrapIron], { weight: 14 }),
      d('infected-dog', 'Infected Dog', m('quad', 0x5a5040, 0x6a7040, 0xb6ff30, { ears: true }), 0.9, 10, 3.6, 0.07, 'pack', [Item.InfectedTissue, Item.PrimalHide], { packSize: 3, weight: 16 }),
      d('broken-machine', 'Broken Machine', m('humanoid', 0x6a7478, 0x46505a, 0xff7030, { armor: true, skeletal: true }), 1.1, 28, 1.4, 0.11, 'roam', [Item.ScrapIron, Item.CircuitBoard, Item.EnergyCore], { chargeOnHit: true, weight: 9 }),
      d('toxic-crawler', 'Toxic Crawler', m('crawler', 0x4a6a30, 0x33501f, 0xb6ff30, { glowBody: true }), 1.0, 14, 2.4, 0.09, 'ambush', [Item.InfectedTissue, Item.FuelCell], { weight: 10 }),
      d('wasteland-brute', 'Wasteland Brute', m('brute', 0x5a4c38, 0x6a7040, 0xff7030, { horns: true }), 1.5, 70, 1.7, 0.22, 'boss', [Item.ScrapIron, Item.FuelCell, Item.EnergyCore], { weight: 3 }),
    ],
  },

  // ------- Mythology World -------
  mythology: {
    dayMax: 5, nightMax: 9, spawnEvery: 2.9,
    defs: [
      d('horned-beast', 'Horned Beast', m('brute', 0x6a4a32, 0x4a3220, 0xff7030, { horns: true }), 1.3, 40, 2.2, 0.15, 'chase', [Item.AncientRelic, Item.PrimalHide], { weight: 14 }),
      d('harpy', 'Harpy', m('flyer', 0x8a6a4a, 0xc8a060, 0xffe080), 1.1, 14, 3.3, 0.09, 'fly', [Item.MagicCrystal, Item.LeafFiber], { weight: 12 }),
      d('one-eyed-brute', 'One-Eyed Brute', m('brute', 0x8a6848, 0x6a4c30, 0xffe080), 1.7, 90, 1.5, 0.26, 'boss', [Item.AncientRelic, Item.GoldIngot, Item.MagicCrystal], { weight: 2, attackRange: 2.4 }),
      d('temple-guardian', 'Temple Guardian', m('humanoid', 0xc8b890, 0x8a6840, 0xffe080, { helmet: true, armor: true, weapon: 'sword', shield: true }), 1.2, 32, 2.1, 0.12, 'patrol', [Item.AncientRelic, Item.GoldIngot], { weight: 14 }),
      d('stone-golem', 'Stone Golem', m('brute', 0x7d7d88, 0x9a9aa5, 0xffe080), 1.4, 55, 1.3, 0.17, 'chase', [Item.AncientRelic, Item.SilverOre], { weight: 8 }),
      d('divine-wraith', 'Divine Wraith', m('ghost', 0xe8e0c0, 0xd0c8a0, 0xffe080, { transparent: 0.6 }), 1.1, 18, 2.6, 0.11, 'ranged', [Item.SoulShard, Item.AncientRelic], { spawnTime: 'night', weight: 7, attackRange: 10, projectileColor: 0xffe080, projectileSpeed: 18 }),
    ],
  },

  // peaceful park — nothing spawns, day or night
  themepark: { dayMax: 0, nightMax: 0, spawnEvery: 9999, defs: [] },
};

export function enemiesForWorld(worldType: string): WorldEnemies {
  return ENEMY_WORLDS[worldType] ?? ENEMY_WORLDS.natural;
}
