import { Block, BLOCKS, BlockMaterial } from './blocks';
import { Atlas } from './textures';
import { ToolDef, ToolKind, HAND, EFFECTIVE, tool } from './tools';

/**
 * Item id space: 1-99 = placeable block items (same id as Block enum),
 * 100+ = materials and tools.
 */
export const enum Item {
  // materials
  Stick = 100,
  EmberCoal = 101,
  RawIron = 102,
  IronIngot = 103,
  RawGold = 104,
  GoldIngot = 105,
  CrystalShard = 106,
  VoidShard = 107,
  LeafFiber = 108,
  // tools / weapons
  WoodPickaxe = 120,
  StonePickaxe = 121,
  IronPickaxe = 122,
  GoldPickaxe = 123,
  CrystalPickaxe = 124,
  WoodAxe = 125,
  StoneAxe = 126,
  Shovel = 127,
  Sword = 128,
  Dagger = 129,
  Staff = 130,
  Blaster = 131,
  Wand = 132,
  FossilShard = 140,
  AmberResin = 141,
  PrimalHide = 142,
  ScrapIron = 143,
  AmmoCasing = 144,
  FuelCell = 145,
  InfectedTissue = 146,
  MedScrap = 147,
  CannedFood = 148,
  SilverOre = 149,
  MagicCrystal = 150,
  AncientRelic = 151,
  EnergyCore = 152,
  CircuitBoard = 153,
  PlasmaCell = 154,
  SoulShard = 155,
  CursedWood = 156,
  MoonHerb = 157,
  // food / consumables
  RawMeat = 158,
  CookedMeat = 159,
  Bandage = 160,
  // armor
  LeatherCap = 161,
  LeatherTunic = 162,
  LeatherPants = 163,
  LeatherBoots = 164,
  IronHelmet = 165,
  IronChestplate = 166,
  IronLeggings = 167,
  IronBoots = 168,
  // extra weapons
  WoodSword = 169,
  StoneSword = 170,
  // expanded tools / weapons
  IronAxe = 171,
  IronShovel = 172,
  GoldSword = 173,
  CrystalSword = 174,
  VoidBlade = 175,
  // expanded armor
  GoldHelmet = 176,
  GoldChestplate = 177,
  GoldLeggings = 178,
  GoldBoots = 179,
  CrystalHelmet = 180,
  CrystalChestplate = 181,
  CrystalLeggings = 182,
  CrystalBoots = 183,
  // expanded food / consumables
  TrailStew = 184,
  SunfruitTonic = 185,
  // gem + tiered armor sets (copper/silver/diamond/mythic; iron + sun gold above)
  Diamond = 186,
  CopperHelmet = 187,
  CopperChestplate = 188,
  CopperLeggings = 189,
  CopperBoots = 190,
  SilverHelmet = 191,
  SilverChestplate = 192,
  SilverLeggings = 193,
  SilverBoots = 194,
  DiamondHelmet = 195,
  DiamondChestplate = 196,
  DiamondLeggings = 197,
  DiamondBoots = 198,
  MythicHelmet = 199,
  MythicChestplate = 200,
  MythicLeggings = 201,
  MythicBoots = 202,
}

export interface ItemDef {
  id: number;
  name: string;
  stack: number;
  tool?: ToolDef;
  /** Eat to fill this fraction of the vitality (hunger) bar. */
  food?: number;
  /** Use to directly restore this fraction of health (bandages). */
  heals?: number;
  /** Damage reduction fraction while equipped. */
  armor?: number;
  /** Which equipment slot this fits ('head' | 'body' | 'legs' | 'boots'). */
  slot?: 'head' | 'body' | 'legs' | 'boots';
  /** 16x16 pixel painter for non-block items */
  icon?: (px: (x: number, y: number, c: string) => void) => void;
}

// ---------- pixel icon painters ----------
function lump(c1: string, c2: string): ItemDef['icon'] {
  return (px) => {
    for (let y = 5; y < 13; y++) for (let x = 4; x < 12; x++) {
      if ((x - 8) * (x - 8) + (y - 9) * (y - 9) < 14) px(x, y, (x + y) % 3 === 0 ? c2 : c1);
    }
  };
}
function shard(c1: string, c2: string): ItemDef['icon'] {
  return (px) => {
    for (let y = 2; y < 14; y++) {
      const w = 6 - Math.abs(y - 8);
      for (let x = 8 - w / 2; x < 8 + w / 2; x++) px(Math.floor(x), y, x < 8 ? c2 : c1);
    }
  };
}
function ingot(c1: string, c2: string): ItemDef['icon'] {
  return (px) => {
    for (let y = 6; y < 11; y++) for (let x = 2 + (10 - y) / 2; x < 13 + (10 - y) / 2; x++) {
      px(Math.floor(x), y, y === 6 ? c2 : c1);
    }
  };
}
function stickIcon(px: (x: number, y: number, c: string) => void): void {
  for (let i = 0; i < 10; i++) { px(3 + i, 13 - i, '#8a6437'); px(4 + i, 13 - i, '#a87f4d'); }
}
function handleDiag(px: (x: number, y: number, c: string) => void): void {
  for (let i = 0; i < 9; i++) { px(3 + i, 13 - i, '#8a6437'); px(4 + i, 13 - i, '#a87f4d'); }
}
function pickIcon(head: string, edge: string): ItemDef['icon'] {
  return (px) => {
    handleDiag(px);
    for (let x = 2; x < 14; x++) {
      const dip = Math.floor(Math.abs(x - 8) / 3);
      px(x, 2 + dip, head); px(x, 3 + dip, edge);
    }
  };
}
function axeIcon(head: string, edge: string): ItemDef['icon'] {
  return (px) => {
    handleDiag(px);
    for (let y = 1; y < 7; y++) for (let x = 6; x < 12 - (y > 4 ? y - 4 : 0); x++) {
      px(x, y, x < 8 ? edge : head);
    }
  };
}
function shovelIcon(px: (x: number, y: number, c: string) => void): void {
  handleDiag(px);
  for (let y = 1; y < 6; y++) for (let x = 9; x < 14; x++) {
    if (Math.abs(x - 11.5) + Math.abs(y - 3) < 4) px(x, y, y < 3 ? '#d8dce4' : '#aab0bc');
  }
}
function swordIcon(blade: string, guard: string): ItemDef['icon'] {
  return (px) => {
    for (let i = 0; i < 9; i++) { px(5 + i, 10 - i, blade); px(6 + i, 10 - i, '#ffffff'); }
    px(4, 11, guard); px(5, 12, guard); px(6, 11, guard); px(5, 10, guard);
    px(3, 13, '#8a6437'); px(2, 14, '#8a6437');
  };
}
function staffIcon(px: (x: number, y: number, c: string) => void): void {
  for (let i = 0; i < 11; i++) { px(4 + i, 14 - i, '#7a5a36'); }
  for (let y = 1; y < 6; y++) for (let x = 10; x < 15; x++) {
    if ((x - 12) * (x - 12) + (y - 3) * (y - 3) < 5) px(x, y, (x + y) % 2 ? '#7df0ff' : '#3bb8e8');
  }
}
function blasterIcon(px: (x: number, y: number, c: string) => void): void {
  for (let x = 3; x < 14; x++) { px(x, 6, '#566'); px(x, 7, '#788'); px(x, 8, '#455'); }
  for (let y = 9; y < 13; y++) { px(4, y, '#344'); px(5, y, '#455'); }
  px(13, 7, '#7df0ff'); px(14, 7, '#7df0ff');
}

function mat(id: number, name: string, icon: ItemDef['icon'], stack = 99): ItemDef {
  return { id, name, stack, icon };
}
function tdef(id: number, name: string, t: ToolDef, icon: ItemDef['icon']): ItemDef {
  return { id, name, stack: 1, tool: t, icon };
}
function fdef(id: number, name: string, food: number, icon: ItemDef['icon']): ItemDef {
  return { id, name, stack: 16, food, icon };
}
function adef(id: number, name: string, slot: NonNullable<ItemDef['slot']>, armor: number, icon: ItemDef['icon']): ItemDef {
  return { id, name, stack: 1, slot, armor, icon };
}

// ---------- food / armor icon painters ----------
function meatIcon(raw: boolean): ItemDef['icon'] {
  const meat = raw ? '#d05858' : '#9a5a30';
  const edge = raw ? '#a83838' : '#6a3a1a';
  return (px) => {
    for (let y = 4; y < 13; y++) for (let x = 3; x < 13; x++) {
      if ((x - 8) * (x - 8) / 2 + (y - 8.5) * (y - 8.5) < 11) px(x, y, (x + y) % 4 === 0 ? edge : meat);
    }
    px(12, 4, '#e8e0d0'); px(13, 3, '#e8e0d0'); // bone tip
  };
}
function bandageIcon(px: (x: number, y: number, c: string) => void): void {
  for (let y = 5; y < 11; y++) for (let x = 3; x < 13; x++) px(x, y, (x + y) % 3 === 0 ? '#d8d8d8' : '#f0f0f0');
  px(7, 7, '#f06a6a'); px(8, 7, '#f06a6a'); px(7, 8, '#f06a6a'); px(8, 8, '#f06a6a');
}
function helmIcon(c1: string, c2: string): ItemDef['icon'] {
  return (px) => {
    for (let y = 4; y < 8; y++) for (let x = 4; x < 12; x++) px(x, y, c1);
    for (let y = 8; y < 11; y++) { px(4, y, c2); px(5, y, c2); px(10, y, c2); px(11, y, c2); }
    for (let x = 4; x < 12; x++) px(x, 4, c2);
  };
}
function chestIcon(c1: string, c2: string): ItemDef['icon'] {
  return (px) => {
    for (let y = 4; y < 13; y++) for (let x = 5; x < 11; x++) px(x, y, c1);
    for (let y = 4; y < 9; y++) { px(3, y, c2); px(4, y, c2); px(11, y, c2); px(12, y, c2); }
    for (let x = 5; x < 11; x++) px(x, 4, c2);
  };
}
function legsIcon(c1: string, c2: string): ItemDef['icon'] {
  return (px) => {
    for (let x = 4; x < 12; x++) { px(x, 3, c2); px(x, 4, c1); }
    for (let y = 5; y < 13; y++) { px(4, y, c1); px(5, y, c1); px(10, y, c1); px(11, y, c1); }
  };
}
function bootsIcon(c1: string, c2: string): ItemDef['icon'] {
  return (px) => {
    for (const ox of [3, 9]) {
      for (let y = 6; y < 10; y++) { px(ox + 1, y, c1); px(ox + 2, y, c1); }
      for (let x = ox; x < ox + 4; x++) { px(x, 10, c2); px(x, 11, c2); }
    }
  };
}

export const ITEMS: Record<number, ItemDef> = {
  [Item.Stick]: mat(Item.Stick, 'Stick', stickIcon),
  [Item.EmberCoal]: mat(Item.EmberCoal, 'Ember Coal', lump('#2c2828', '#ff8c32')),
  [Item.RawIron]: mat(Item.RawIron, 'Raw Rust Iron', lump('#9c7560', '#c48c64')),
  [Item.IronIngot]: mat(Item.IronIngot, 'Rust Iron Ingot', ingot('#c0a08c', '#e0c0a8')),
  [Item.RawGold]: mat(Item.RawGold, 'Raw Sun Gold', lump('#c8a040', '#ffe080')),
  [Item.GoldIngot]: mat(Item.GoldIngot, 'Sun Gold Ingot', ingot('#f0c850', '#ffe890')),
  [Item.CrystalShard]: mat(Item.CrystalShard, 'Crystal Shard', shard('#5cd6f0', '#bdf8ff')),
  [Item.VoidShard]: mat(Item.VoidShard, 'Void Shard', shard('#8a50d0', '#c890ff')),
  [Item.LeafFiber]: mat(Item.LeafFiber, 'Leaf Fiber', (px) => {
    for (let i = 0; i < 12; i++) { px(2 + i, 12 - (i % 4), '#5cb84a'); px(2 + i, 8 + (i % 3), '#479038'); }
  }),

  [Item.WoodPickaxe]: tdef(Item.WoodPickaxe, 'Wooden Pickaxe', tool('pickaxe', 1, 2, 60, 2), pickIcon('#a87f4d', '#8a6437')),
  [Item.StonePickaxe]: tdef(Item.StonePickaxe, 'Stone Pickaxe', tool('pickaxe', 2, 3.5, 130, 3), pickIcon('#9a9aa5', '#7d7d88')),
  [Item.IronPickaxe]: tdef(Item.IronPickaxe, 'Iron Pickaxe', tool('pickaxe', 3, 5.5, 280, 4), pickIcon('#d0b29c', '#b09078')),
  [Item.GoldPickaxe]: tdef(Item.GoldPickaxe, 'Gold Pickaxe', tool('pickaxe', 3, 8, 120, 3), pickIcon('#f0c850', '#c89c30')),
  [Item.CrystalPickaxe]: tdef(Item.CrystalPickaxe, 'Crystal Pickaxe', tool('pickaxe', 4, 9, 600, 5), pickIcon('#7df0ff', '#3bb8e8')),
  [Item.WoodAxe]: tdef(Item.WoodAxe, 'Wooden Axe', tool('axe', 1, 2, 60, 3), axeIcon('#a87f4d', '#8a6437')),
  [Item.StoneAxe]: tdef(Item.StoneAxe, 'Stone Axe', tool('axe', 2, 3.5, 130, 4), axeIcon('#9a9aa5', '#7d7d88')),
  [Item.Shovel]: tdef(Item.Shovel, 'Shovel', tool('shovel', 1, 3, 100, 2), shovelIcon),
  [Item.Sword]: tdef(Item.Sword, 'Iron Sword', tool('sword', 3, 1.5, 250, 7), swordIcon('#d8dce4', '#7a5a36')),
  [Item.Dagger]: tdef(Item.Dagger, 'Shadow Dagger', tool('sword', 2, 1.5, 180, 5), swordIcon('#9a8ab8', '#3a3550')),
  [Item.Staff]: tdef(Item.Staff, 'Apprentice Staff', tool('staff', 1, 1, 200, 4), staffIcon),
  [Item.Blaster]: tdef(Item.Blaster, 'Spark Blaster', tool('gun', 1, 1, 200, 5), blasterIcon),
  [Item.Wand]: tdef(Item.Wand, 'Mender Wand', tool('staff', 1, 1, 220, 3), (px) => {
    for (let i = 0; i < 10; i++) px(4 + i, 14 - i, '#c8b890');
    for (let y = 1; y < 6; y++) for (let x = 10; x < 15; x++) {
      if ((x - 12) * (x - 12) + (y - 3) * (y - 3) < 5) px(x, y, (x + y) % 2 ? '#8df06a' : '#4ec048');
    }
  }),
  [Item.FossilShard]: mat(Item.FossilShard, 'Fossil Shard', shard('#d8c090', '#fff0c8')),
  [Item.AmberResin]: mat(Item.AmberResin, 'Amber Resin', shard('#ffb030', '#ffe080')),
  [Item.PrimalHide]: mat(Item.PrimalHide, 'Primal Hide', lump('#7a4a2a', '#a87848')),
  [Item.ScrapIron]: mat(Item.ScrapIron, 'Scrap Iron', lump('#7f8588', '#c0c8c8')),
  [Item.AmmoCasing]: mat(Item.AmmoCasing, 'Ammo Casing', ingot('#c89a40', '#ffe080')),
  [Item.FuelCell]: mat(Item.FuelCell, 'Fuel Cell', shard('#d85030', '#ffb070')),
  [Item.InfectedTissue]: mat(Item.InfectedTissue, 'Infected Tissue', lump('#6fa85a', '#b6ff70')),
  [Item.MedScrap]: mat(Item.MedScrap, 'Med Scrap', lump('#e8e8e8', '#f06a6a')),
  [Item.CannedFood]: fdef(Item.CannedFood, 'Canned Food', 0.4, ingot('#9aa0a8', '#d8dce4')),
  [Item.SilverOre]: mat(Item.SilverOre, 'Silver Ore', lump('#aeb8c8', '#ffffff')),
  [Item.MagicCrystal]: mat(Item.MagicCrystal, 'Magic Crystal', shard('#9a70ff', '#e0d0ff')),
  [Item.AncientRelic]: mat(Item.AncientRelic, 'Ancient Relic', ingot('#b89048', '#ffe0a0')),
  [Item.EnergyCore]: mat(Item.EnergyCore, 'Energy Core', shard('#40f0ff', '#c8ffff')),
  [Item.CircuitBoard]: mat(Item.CircuitBoard, 'Circuit Board', ingot('#305840', '#70f0a0')),
  [Item.PlasmaCell]: mat(Item.PlasmaCell, 'Plasma Cell', shard('#ff50d0', '#ffd0f0')),
  [Item.RawMeat]: fdef(Item.RawMeat, 'Raw Meat', 0.1, meatIcon(true)),
  [Item.CookedMeat]: fdef(Item.CookedMeat, 'Cooked Meat', 0.35, meatIcon(false)),
  [Item.Bandage]: { id: Item.Bandage, name: 'Bandage', stack: 16, heals: 0.3, icon: bandageIcon },
  [Item.LeatherCap]: adef(Item.LeatherCap, 'Hide Cap', 'head', 0.04, helmIcon('#a87848', '#7a4a2a')),
  [Item.LeatherTunic]: adef(Item.LeatherTunic, 'Hide Tunic', 'body', 0.06, chestIcon('#a87848', '#7a4a2a')),
  [Item.LeatherPants]: adef(Item.LeatherPants, 'Hide Pants', 'legs', 0.05, legsIcon('#a87848', '#7a4a2a')),
  [Item.LeatherBoots]: adef(Item.LeatherBoots, 'Hide Boots', 'boots', 0.03, bootsIcon('#a87848', '#7a4a2a')),
  [Item.IronHelmet]: adef(Item.IronHelmet, 'Iron Helmet', 'head', 0.07, helmIcon('#d0b29c', '#8a7060')),
  [Item.IronChestplate]: adef(Item.IronChestplate, 'Iron Chestplate', 'body', 0.1, chestIcon('#d0b29c', '#8a7060')),
  [Item.IronLeggings]: adef(Item.IronLeggings, 'Iron Leggings', 'legs', 0.08, legsIcon('#d0b29c', '#8a7060')),
  [Item.IronBoots]: adef(Item.IronBoots, 'Iron Boots', 'boots', 0.05, bootsIcon('#d0b29c', '#8a7060')),
  [Item.WoodSword]: tdef(Item.WoodSword, 'Wooden Sword', tool('sword', 1, 1.5, 60, 4), swordIcon('#a87f4d', '#8a6437')),
  [Item.StoneSword]: tdef(Item.StoneSword, 'Stone Sword', tool('sword', 2, 1.5, 130, 5), swordIcon('#9a9aa5', '#7d7d88')),
  [Item.SoulShard]: mat(Item.SoulShard, 'Soul Shard', shard('#b890ff', '#f0e8ff')),
  [Item.CursedWood]: mat(Item.CursedWood, 'Cursed Wood', lump('#2b2230', '#6a4878')),
  [Item.MoonHerb]: mat(Item.MoonHerb, 'Moon Herb', shard('#b8d8c8', '#ffffff')),

  // expanded tools / weapons
  [Item.IronAxe]: tdef(Item.IronAxe, 'Iron Axe', tool('axe', 3, 5.5, 280, 6), axeIcon('#d0b29c', '#b09078')),
  [Item.IronShovel]: tdef(Item.IronShovel, 'Iron Shovel', tool('shovel', 3, 5.5, 280, 3), shovelIcon),
  [Item.GoldSword]: tdef(Item.GoldSword, 'Sun Gold Sword', tool('sword', 3, 1.5, 120, 8), swordIcon('#f0c850', '#c89c30')),
  [Item.CrystalSword]: tdef(Item.CrystalSword, 'Crystal Sword', tool('sword', 4, 1.5, 500, 9), swordIcon('#7df0ff', '#3bb8e8')),
  [Item.VoidBlade]: tdef(Item.VoidBlade, 'Void Blade', tool('sword', 4, 1.5, 400, 11), swordIcon('#c890ff', '#5a3a80')),
  // expanded armor
  [Item.GoldHelmet]: adef(Item.GoldHelmet, 'Sun Gold Helmet', 'head', 0.06, helmIcon('#f0c850', '#c89c30')),
  [Item.GoldChestplate]: adef(Item.GoldChestplate, 'Sun Gold Chestplate', 'body', 0.09, chestIcon('#f0c850', '#c89c30')),
  [Item.GoldLeggings]: adef(Item.GoldLeggings, 'Sun Gold Leggings', 'legs', 0.07, legsIcon('#f0c850', '#c89c30')),
  [Item.GoldBoots]: adef(Item.GoldBoots, 'Sun Gold Boots', 'boots', 0.04, bootsIcon('#f0c850', '#c89c30')),
  [Item.CrystalHelmet]: adef(Item.CrystalHelmet, 'Crystal Helmet', 'head', 0.09, helmIcon('#7df0ff', '#3bb8e8')),
  [Item.CrystalChestplate]: adef(Item.CrystalChestplate, 'Crystal Chestplate', 'body', 0.13, chestIcon('#7df0ff', '#3bb8e8')),
  [Item.CrystalLeggings]: adef(Item.CrystalLeggings, 'Crystal Leggings', 'legs', 0.1, legsIcon('#7df0ff', '#3bb8e8')),
  [Item.CrystalBoots]: adef(Item.CrystalBoots, 'Crystal Boots', 'boots', 0.07, bootsIcon('#7df0ff', '#3bb8e8')),
  // expanded food / consumables
  [Item.TrailStew]: fdef(Item.TrailStew, 'Trail Stew', 0.55, (px) => {
    for (let y = 8; y < 13; y++) for (let x = 3; x < 13; x++) px(x, y, y === 8 ? '#c87840' : '#7a4a2a');
    for (let x = 5; x < 11; x++) px(x, 7, (x % 2) ? '#d08040' : '#a85a28'); // stew surface
  }),
  [Item.SunfruitTonic]: { id: Item.SunfruitTonic, name: 'Sunfruit Tonic', stack: 8, heals: 0.5, icon: (px) => {
    for (let y = 5; y < 13; y++) for (let x = 6; x < 10; x++) px(x, y, y < 7 ? '#d8dce4' : '#ffb030');
    px(7, 3, '#8a6437'); px(8, 3, '#8a6437'); px(7, 4, '#d8dce4'); px(8, 4, '#d8dce4'); // cork + neck
  } },

  [Item.Diamond]: mat(Item.Diamond, 'Diamond', shard('#b8f8f0', '#ffffff')),
  // copper: cheap early set hammered straight from raw iron
  [Item.CopperHelmet]: adef(Item.CopperHelmet, 'Copper Helmet', 'head', 0.05, helmIcon('#c87850', '#8a4a30')),
  [Item.CopperChestplate]: adef(Item.CopperChestplate, 'Copper Chestplate', 'body', 0.08, chestIcon('#c87850', '#8a4a30')),
  [Item.CopperLeggings]: adef(Item.CopperLeggings, 'Copper Leggings', 'legs', 0.06, legsIcon('#c87850', '#8a4a30')),
  [Item.CopperBoots]: adef(Item.CopperBoots, 'Copper Boots', 'boots', 0.04, bootsIcon('#c87850', '#8a4a30')),
  [Item.SilverHelmet]: adef(Item.SilverHelmet, 'Silver Helmet', 'head', 0.065, helmIcon('#d8e0e8', '#98a8b8')),
  [Item.SilverChestplate]: adef(Item.SilverChestplate, 'Silver Chestplate', 'body', 0.095, chestIcon('#d8e0e8', '#98a8b8')),
  [Item.SilverLeggings]: adef(Item.SilverLeggings, 'Silver Leggings', 'legs', 0.075, legsIcon('#d8e0e8', '#98a8b8')),
  [Item.SilverBoots]: adef(Item.SilverBoots, 'Silver Boots', 'boots', 0.05, bootsIcon('#d8e0e8', '#98a8b8')),
  [Item.DiamondHelmet]: adef(Item.DiamondHelmet, 'Diamond Helmet', 'head', 0.1, helmIcon('#b8f8f0', '#50c8d8')),
  [Item.DiamondChestplate]: adef(Item.DiamondChestplate, 'Diamond Chestplate', 'body', 0.15, chestIcon('#b8f8f0', '#50c8d8')),
  [Item.DiamondLeggings]: adef(Item.DiamondLeggings, 'Diamond Leggings', 'legs', 0.12, legsIcon('#b8f8f0', '#50c8d8')),
  [Item.DiamondBoots]: adef(Item.DiamondBoots, 'Diamond Boots', 'boots', 0.08, bootsIcon('#b8f8f0', '#50c8d8')),
  // mythic: end-game set forged from void shards + ancient relics
  [Item.MythicHelmet]: adef(Item.MythicHelmet, 'Mythic Helmet', 'head', 0.12, helmIcon('#c890ff', '#7a40c0')),
  [Item.MythicChestplate]: adef(Item.MythicChestplate, 'Mythic Chestplate', 'body', 0.18, chestIcon('#c890ff', '#7a40c0')),
  [Item.MythicLeggings]: adef(Item.MythicLeggings, 'Mythic Leggings', 'legs', 0.14, legsIcon('#c890ff', '#7a40c0')),
  [Item.MythicBoots]: adef(Item.MythicBoots, 'Mythic Boots', 'boots', 0.1, bootsIcon('#c890ff', '#7a40c0')),
};

/** Armor progressions, weakest set first (creative kit + UI ordering). */
export const ARMOR_SETS: { name: string; pieces: Item[] }[] = [
  { name: 'Copper', pieces: [Item.CopperHelmet, Item.CopperChestplate, Item.CopperLeggings, Item.CopperBoots] },
  { name: 'Silver', pieces: [Item.SilverHelmet, Item.SilverChestplate, Item.SilverLeggings, Item.SilverBoots] },
  { name: 'Iron', pieces: [Item.IronHelmet, Item.IronChestplate, Item.IronLeggings, Item.IronBoots] },
  { name: 'Sun Gold', pieces: [Item.GoldHelmet, Item.GoldChestplate, Item.GoldLeggings, Item.GoldBoots] },
  { name: 'Diamond', pieces: [Item.DiamondHelmet, Item.DiamondChestplate, Item.DiamondLeggings, Item.DiamondBoots] },
  { name: 'Mythic', pieces: [Item.MythicHelmet, Item.MythicChestplate, Item.MythicLeggings, Item.MythicBoots] },
];

export function itemName(id: number): string {
  return ITEMS[id]?.name ?? BLOCKS[id]?.name ?? '???';
}

export function itemStack(id: number): number {
  return ITEMS[id]?.stack ?? 99;
}

export function toolOf(id: number | null | undefined): ToolDef {
  return (id != null && ITEMS[id]?.tool) || HAND;
}

export function isPlaceable(id: number): boolean {
  return id > 0 && id < 100 && !!BLOCKS[id];
}

// ---------- mining logic ----------
export interface BreakInfo {
  time: number;       // seconds to break
  drops: boolean;     // whether the block yields its drop
  breakable: boolean;
}

export function breakInfo(blockId: number, heldItem: number | null): BreakInfo {
  const def = BLOCKS[blockId];
  if (!def) return { time: Infinity, drops: false, breakable: false };
  if (def.requiredTier >= 99) return { time: Infinity, drops: false, breakable: false };
  const t = toolOf(heldItem);
  const effective = EFFECTIVE[t.kind].includes(def.material);
  let time = def.hardness;
  if (effective) time = def.hardness / t.speed;
  if (t.tier < def.requiredTier) time = def.hardness * (effective ? 1.5 : 3);
  return { time, drops: t.tier >= def.requiredTier, breakable: true };
}

/** What item(s) a broken block yields. rand in [0,1). */
export function dropFor(blockId: number, heldItem: number | null, rand: number): { item: number; count: number } | null {
  const info = breakInfo(blockId, heldItem);
  if (!info.drops) return null;
  switch (blockId) {
    case Block.Grass: return { item: Block.Dirt, count: 1 };
    case Block.Leaves:
      if (rand < 0.25) return { item: Item.Stick, count: 1 };
      if (rand < 0.45) return { item: Item.LeafFiber, count: 1 };
      return null;
    case Block.Glass: return null; // shatters
    case Block.EmberOre: return { item: Item.EmberCoal, count: 1 + (rand < 0.3 ? 1 : 0) };
    case Block.IronOre: return { item: Item.RawIron, count: 1 };
    case Block.GoldOre: return { item: Item.RawGold, count: 1 };
    case Block.VoidOre: return { item: Item.VoidShard, count: 1 };
    case Block.Crystal: return { item: Item.CrystalShard, count: 1 + (rand < 0.5 ? 1 : 0) };
    case Block.Deepstone:
      if (rand < 0.1) return { item: Item.Diamond, count: 1 }; // rare gem seam
      return { item: blockId, count: 1 };
    case Block.Snow: return null;
    default: return { item: blockId, count: 1 };
  }
}

// ---------- icons ----------
const iconCache = new Map<string, HTMLCanvasElement>();

/** Crisp icon for any item id: block items use atlas tiles, others use pixel painters. */
export function itemIcon(id: number, atlas: Atlas, size: number): HTMLCanvasElement {
  const key = `${id}:${size}`;
  const hit = iconCache.get(key);
  if (hit) return hit;

  let c: HTMLCanvasElement;
  if (id < 100 && BLOCKS[id]) {
    c = atlas.icon(BLOCKS[id].tiles.side, size);
  } else {
    c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d')!;
    const s = size / 16;
    ITEMS[id]?.icon?.((x, y, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.floor(x * s), Math.floor(y * s), Math.ceil(s), Math.ceil(s));
    });
  }
  iconCache.set(key, c);
  return c;
}
