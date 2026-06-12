import { Block } from './blocks';
import { Item } from './items';
import { Inventory } from './inventory';

export type Station = 'none' | 'workbench' | 'smelter';

export interface Recipe {
  id: string;
  station: Station;
  inputs: { item: number; count: number }[];
  output: { item: number; count: number };
  time: number; // seconds (smelter jobs)
  durability?: number; // initial durability for tool outputs
}

function r(id: string, station: Station, inputs: Recipe['inputs'], output: Recipe['output'], time = 0, durability?: number): Recipe {
  return { id, station, inputs, output, time, durability };
}

export const RECIPES: Recipe[] = [
  // hand (2x2 personal crafting)
  r('planks', 'none', [{ item: Block.Wood, count: 1 }], { item: Block.Planks, count: 4 }),
  r('sticks', 'none', [{ item: Block.Planks, count: 2 }], { item: Item.Stick, count: 4 }),
  r('workbench', 'none', [{ item: Block.Planks, count: 4 }], { item: Block.Workbench, count: 1 }),
  r('torch-glass', 'none', [{ item: Block.Sand, count: 4 }], { item: Block.Glass, count: 4 }),
  r('lantern', 'none', [{ item: Block.Planks, count: 4 }, { item: Item.EmberCoal, count: 1 }], { item: Block.Lantern, count: 2 }),
  r('bandage', 'none', [{ item: Item.MedScrap, count: 2 }], { item: Item.Bandage, count: 1 }),

  // workbench
  r('wood-pick', 'workbench', [{ item: Block.Planks, count: 3 }, { item: Item.Stick, count: 2 }], { item: Item.WoodPickaxe, count: 1 }, 0, 60),
  r('wood-axe', 'workbench', [{ item: Block.Planks, count: 3 }, { item: Item.Stick, count: 2 }], { item: Item.WoodAxe, count: 1 }, 0, 60),
  r('shovel', 'workbench', [{ item: Block.Planks, count: 2 }, { item: Item.Stick, count: 2 }], { item: Item.Shovel, count: 1 }, 0, 100),
  r('stone-pick', 'workbench', [{ item: Block.Stone, count: 3 }, { item: Item.Stick, count: 2 }], { item: Item.StonePickaxe, count: 1 }, 0, 130),
  r('stone-axe', 'workbench', [{ item: Block.Stone, count: 3 }, { item: Item.Stick, count: 2 }], { item: Item.StoneAxe, count: 1 }, 0, 130),
  r('iron-pick', 'workbench', [{ item: Item.IronIngot, count: 3 }, { item: Item.Stick, count: 2 }], { item: Item.IronPickaxe, count: 1 }, 0, 280),
  r('gold-pick', 'workbench', [{ item: Item.GoldIngot, count: 3 }, { item: Item.Stick, count: 2 }], { item: Item.GoldPickaxe, count: 1 }, 0, 120),
  r('crystal-pick', 'workbench', [{ item: Item.CrystalShard, count: 3 }, { item: Item.Stick, count: 2 }], { item: Item.CrystalPickaxe, count: 1 }, 0, 600),
  r('wood-sword', 'workbench', [{ item: Block.Planks, count: 2 }, { item: Item.Stick, count: 1 }], { item: Item.WoodSword, count: 1 }, 0, 60),
  r('stone-sword', 'workbench', [{ item: Block.Stone, count: 2 }, { item: Item.Stick, count: 1 }], { item: Item.StoneSword, count: 1 }, 0, 130),
  r('sword', 'workbench', [{ item: Item.IronIngot, count: 2 }, { item: Item.Stick, count: 1 }], { item: Item.Sword, count: 1 }, 0, 250),
  r('dagger', 'workbench', [{ item: Item.IronIngot, count: 1 }, { item: Item.Stick, count: 1 }], { item: Item.Dagger, count: 1 }, 0, 180),
  r('staff', 'workbench', [{ item: Item.CrystalShard, count: 1 }, { item: Item.Stick, count: 2 }], { item: Item.Staff, count: 1 }, 0, 200),
  r('blaster', 'workbench', [{ item: Item.IronIngot, count: 2 }, { item: Item.CrystalShard, count: 1 }], { item: Item.Blaster, count: 1 }, 0, 200),
  r('smelter', 'workbench', [{ item: Block.Stone, count: 8 }], { item: Block.Smelter, count: 1 }),
  // armor (workbench)
  r('hide-cap', 'workbench', [{ item: Item.PrimalHide, count: 5 }], { item: Item.LeatherCap, count: 1 }),
  r('hide-tunic', 'workbench', [{ item: Item.PrimalHide, count: 8 }], { item: Item.LeatherTunic, count: 1 }),
  r('hide-pants', 'workbench', [{ item: Item.PrimalHide, count: 7 }], { item: Item.LeatherPants, count: 1 }),
  r('hide-boots', 'workbench', [{ item: Item.PrimalHide, count: 4 }], { item: Item.LeatherBoots, count: 1 }),
  r('iron-helmet', 'workbench', [{ item: Item.IronIngot, count: 5 }], { item: Item.IronHelmet, count: 1 }),
  r('iron-chest', 'workbench', [{ item: Item.IronIngot, count: 8 }], { item: Item.IronChestplate, count: 1 }),
  r('iron-legs', 'workbench', [{ item: Item.IronIngot, count: 7 }], { item: Item.IronLeggings, count: 1 }),
  r('iron-boots', 'workbench', [{ item: Item.IronIngot, count: 4 }], { item: Item.IronBoots, count: 1 }),
  r('bed', 'workbench', [{ item: Block.Planks, count: 3 }, { item: Item.LeafFiber, count: 3 }], { item: Block.Bed, count: 1 }),
  // expanded tools / weapons
  r('iron-axe', 'workbench', [{ item: Item.IronIngot, count: 3 }, { item: Item.Stick, count: 2 }], { item: Item.IronAxe, count: 1 }, 0, 280),
  r('iron-shovel', 'workbench', [{ item: Item.IronIngot, count: 1 }, { item: Item.Stick, count: 2 }], { item: Item.IronShovel, count: 1 }, 0, 280),
  r('gold-sword', 'workbench', [{ item: Item.GoldIngot, count: 2 }, { item: Item.Stick, count: 1 }], { item: Item.GoldSword, count: 1 }, 0, 120),
  r('crystal-sword', 'workbench', [{ item: Item.CrystalShard, count: 2 }, { item: Item.Stick, count: 1 }], { item: Item.CrystalSword, count: 1 }, 0, 500),
  r('void-blade', 'workbench', [{ item: Item.VoidShard, count: 3 }, { item: Item.Stick, count: 1 }], { item: Item.VoidBlade, count: 1 }, 0, 400),
  // expanded armor
  r('gold-helmet', 'workbench', [{ item: Item.GoldIngot, count: 5 }], { item: Item.GoldHelmet, count: 1 }),
  r('gold-chest', 'workbench', [{ item: Item.GoldIngot, count: 8 }], { item: Item.GoldChestplate, count: 1 }),
  r('gold-legs', 'workbench', [{ item: Item.GoldIngot, count: 7 }], { item: Item.GoldLeggings, count: 1 }),
  r('gold-boots', 'workbench', [{ item: Item.GoldIngot, count: 4 }], { item: Item.GoldBoots, count: 1 }),
  r('crystal-helmet', 'workbench', [{ item: Item.CrystalShard, count: 5 }], { item: Item.CrystalHelmet, count: 1 }),
  r('crystal-chest', 'workbench', [{ item: Item.CrystalShard, count: 8 }], { item: Item.CrystalChestplate, count: 1 }),
  r('crystal-legs', 'workbench', [{ item: Item.CrystalShard, count: 7 }], { item: Item.CrystalLeggings, count: 1 }),
  r('crystal-boots', 'workbench', [{ item: Item.CrystalShard, count: 4 }], { item: Item.CrystalBoots, count: 1 }),
  // consumables
  r('sunfruit-tonic', 'workbench', [{ item: Item.MoonHerb, count: 2 }, { item: Item.CrystalShard, count: 1 }], { item: Item.SunfruitTonic, count: 1 }),

  // smelter (raw ore + fuel, timed)
  r('iron-ingot', 'smelter', [{ item: Item.RawIron, count: 1 }, { item: Item.EmberCoal, count: 1 }], { item: Item.IronIngot, count: 1 }, 2.5),
  r('gold-ingot', 'smelter', [{ item: Item.RawGold, count: 1 }, { item: Item.EmberCoal, count: 1 }], { item: Item.GoldIngot, count: 1 }, 2.5),
  r('sandstone', 'smelter', [{ item: Block.Sand, count: 2 }, { item: Item.EmberCoal, count: 1 }], { item: Block.Sandstone, count: 2 }, 2),
  r('stone-cook', 'smelter', [{ item: Block.Dirt, count: 2 }, { item: Item.EmberCoal, count: 1 }], { item: Block.Stone, count: 1 }, 2),
  r('cook-meat', 'smelter', [{ item: Item.RawMeat, count: 1 }, { item: Item.EmberCoal, count: 1 }], { item: Item.CookedMeat, count: 1 }, 2),
  r('scrap-iron', 'smelter', [{ item: Item.ScrapIron, count: 2 }, { item: Item.EmberCoal, count: 1 }], { item: Item.IronIngot, count: 1 }, 2.5),
  r('trail-stew', 'smelter', [{ item: Item.RawMeat, count: 1 }, { item: Item.LeafFiber, count: 2 }, { item: Item.EmberCoal, count: 1 }], { item: Item.TrailStew, count: 1 }, 3),
];

export function recipesFor(station: Station): Recipe[] {
  // a better station can also do simpler crafts
  if (station === 'none') return RECIPES.filter((x) => x.station === 'none');
  if (station === 'workbench') return RECIPES.filter((x) => x.station !== 'smelter');
  return RECIPES.filter((x) => x.station === 'smelter' || x.station === 'none');
}

export function canCraft(inv: Inventory, recipe: Recipe): boolean {
  if (inv.creative) return true;
  return recipe.inputs.every((i) => inv.countOf(i.item) >= i.count);
}

/** Consume inputs and add output. Returns false if ingredients missing or inventory full. */
export function craft(inv: Inventory, recipe: Recipe): boolean {
  if (!canCraft(inv, recipe)) return false;
  if (!inv.creative) {
    for (const i of recipe.inputs) inv.remove(i.item, i.count);
  }
  const left = inv.add(recipe.output.item, recipe.output.count, recipe.durability);
  return left === 0 || inv.creative;
}
