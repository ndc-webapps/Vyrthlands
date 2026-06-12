import { Tile } from './textures';

export const enum Block {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Wood = 4,
  Leaves = 5,
  Sand = 6,
  Water = 7,
  Crystal = 8,
  Planks = 9,
  Sandstone = 10,
  Glass = 11,
  Snow = 12,
  Road = 13,
  Cactus = 14,
  Concrete = 15,
  EmberOre = 16,
  IronOre = 17,
  GoldOre = 18,
  VoidOre = 19,
  Deepstone = 20,
  Foundation = 21,
  Lava = 22,
  Workbench = 23,
  Smelter = 24,
  Bed = 25,
  Lantern = 26,
  CanopyRed = 27,
  CanopyBlue = 28,
  CanopyYellow = 29,
  RideSeat = 30,
}

export type RenderBucket = 'opaque' | 'glow' | 'water' | 'cutout';
/** Which tool family mines this efficiently. */
export type BlockMaterial = 'earth' | 'wood' | 'stone' | 'plant' | 'none';

export interface BlockDef {
  id: Block;
  name: string;
  tiles: { top: Tile; side: Tile; bottom: Tile };
  solid: boolean;        // blocks player movement
  opaque: boolean;       // culls neighbor faces
  bucket: RenderBucket;
  hardness: number;      // seconds to break by hand in survival
  material: BlockMaterial;
  requiredTier: number;  // min tool tier (of matching kind) to get a drop; 99 = unbreakable
  interactable: boolean; // right-click opens/uses instead of placing
}

function def(
  id: Block, name: string, top: Tile, side: Tile, bottom: Tile,
  opts: Partial<Pick<BlockDef, 'solid' | 'opaque' | 'bucket' | 'hardness' | 'material' | 'requiredTier' | 'interactable'>> = {}
): BlockDef {
  return {
    id, name,
    tiles: { top, side, bottom },
    solid: opts.solid ?? true,
    opaque: opts.opaque ?? true,
    bucket: opts.bucket ?? 'opaque',
    hardness: opts.hardness ?? 0.75,
    material: opts.material ?? 'stone',
    requiredTier: opts.requiredTier ?? 0,
    interactable: opts.interactable ?? false,
  };
}

export const BLOCKS: Record<number, BlockDef> = {
  [Block.Grass]: def(Block.Grass, 'Grass', Tile.GrassTop, Tile.GrassSide, Tile.Dirt, { hardness: 0.9, material: 'earth' }),
  [Block.Dirt]: def(Block.Dirt, 'Dirt', Tile.Dirt, Tile.Dirt, Tile.Dirt, { hardness: 0.75, material: 'earth' }),
  [Block.Stone]: def(Block.Stone, 'Stone', Tile.Stone, Tile.Stone, Tile.Stone, { hardness: 2.5, requiredTier: 1 }),
  [Block.Wood]: def(Block.Wood, 'Log', Tile.LogTop, Tile.LogSide, Tile.LogTop, { hardness: 2.0, material: 'wood' }),
  [Block.Leaves]: def(Block.Leaves, 'Leaves', Tile.Leaves, Tile.Leaves, Tile.Leaves, { hardness: 0.35, material: 'plant' }),
  [Block.Sand]: def(Block.Sand, 'Sand', Tile.Sand, Tile.Sand, Tile.Sand, { hardness: 0.7, material: 'earth' }),
  [Block.Water]: def(Block.Water, 'Water', Tile.Water, Tile.Water, Tile.Water,
    { solid: false, opaque: false, bucket: 'water', material: 'none', requiredTier: 99 }),
  [Block.Crystal]: def(Block.Crystal, 'Azure Crystal', Tile.Crystal, Tile.Crystal, Tile.Crystal,
    { bucket: 'glow', hardness: 4.0, requiredTier: 3 }),
  [Block.Planks]: def(Block.Planks, 'Planks', Tile.Planks, Tile.Planks, Tile.Planks, { hardness: 1.6, material: 'wood' }),
  [Block.Sandstone]: def(Block.Sandstone, 'Sandstone', Tile.SandstoneTop, Tile.Sandstone, Tile.SandstoneTop, { hardness: 1.8, requiredTier: 1 }),
  [Block.Glass]: def(Block.Glass, 'Glass', Tile.Glass, Tile.Glass, Tile.Glass,
    { opaque: false, bucket: 'cutout', hardness: 0.4, material: 'none' }),
  [Block.Snow]: def(Block.Snow, 'Snow', Tile.Snow, Tile.SnowSide, Tile.Stone, { hardness: 0.6, material: 'earth' }),
  [Block.Road]: def(Block.Road, 'Asphalt', Tile.Road, Tile.Road, Tile.Road, { hardness: 2.4, requiredTier: 1 }),
  [Block.Cactus]: def(Block.Cactus, 'Cactus', Tile.CactusTop, Tile.Cactus, Tile.CactusTop, { hardness: 0.5, material: 'plant' }),
  [Block.Concrete]: def(Block.Concrete, 'Concrete', Tile.Concrete, Tile.Concrete, Tile.Concrete, { hardness: 2.6, requiredTier: 1 }),

  [Block.EmberOre]: def(Block.EmberOre, 'Ember Coal Ore', Tile.EmberOre, Tile.EmberOre, Tile.EmberOre,
    { hardness: 3.0, requiredTier: 1 }),
  [Block.IronOre]: def(Block.IronOre, 'Rust Iron Ore', Tile.IronOre, Tile.IronOre, Tile.IronOre,
    { hardness: 3.5, requiredTier: 2 }),
  [Block.GoldOre]: def(Block.GoldOre, 'Sun Gold Ore', Tile.GoldOre, Tile.GoldOre, Tile.GoldOre,
    { hardness: 4.0, requiredTier: 3 }),
  [Block.VoidOre]: def(Block.VoidOre, 'Voidstone Ore', Tile.VoidOre, Tile.VoidOre, Tile.VoidOre,
    { hardness: 5.5, requiredTier: 4 }),
  [Block.Deepstone]: def(Block.Deepstone, 'Deepstone', Tile.Deepstone, Tile.Deepstone, Tile.Deepstone,
    { hardness: 6.0, requiredTier: 3 }),
  [Block.Foundation]: def(Block.Foundation, 'Foundation', Tile.Foundation, Tile.Foundation, Tile.Foundation,
    { hardness: 9999, material: 'none', requiredTier: 99 }),
  [Block.Lava]: def(Block.Lava, 'Lava', Tile.Lava, Tile.Lava, Tile.Lava,
    { solid: false, bucket: 'glow', material: 'none', requiredTier: 99 }),
  [Block.Workbench]: def(Block.Workbench, 'Workbench', Tile.WorkbenchTop, Tile.WorkbenchSide, Tile.Planks,
    { hardness: 1.6, material: 'wood', interactable: true }),
  [Block.Smelter]: def(Block.Smelter, 'Smelter', Tile.SmelterTop, Tile.SmelterSide, Tile.Stone,
    { hardness: 3.0, requiredTier: 1, interactable: true }),
  [Block.Bed]: def(Block.Bed, 'Bed', Tile.BedTop, Tile.BedSide, Tile.Planks,
    { hardness: 1.0, material: 'wood', interactable: true }),
  [Block.Lantern]: def(Block.Lantern, 'Lantern', Tile.Lantern, Tile.Lantern, Tile.Lantern,
    { bucket: 'glow', hardness: 1.0, material: 'wood' }),
  [Block.CanopyRed]: def(Block.CanopyRed, 'Red Canopy', Tile.CanopyRed, Tile.CanopyRed, Tile.CanopyRed,
    { hardness: 0.8, material: 'wood' }),
  [Block.CanopyBlue]: def(Block.CanopyBlue, 'Blue Canopy', Tile.CanopyBlue, Tile.CanopyBlue, Tile.CanopyBlue,
    { hardness: 0.8, material: 'wood' }),
  [Block.CanopyYellow]: def(Block.CanopyYellow, 'Yellow Canopy', Tile.CanopyYellow, Tile.CanopyYellow, Tile.CanopyYellow,
    { hardness: 0.8, material: 'wood' }),
  [Block.RideSeat]: def(Block.RideSeat, 'Ride Seat', Tile.TicketPost, Tile.TicketPost, Tile.TicketPost,
    { bucket: 'glow', hardness: 9999, material: 'none', requiredTier: 99, interactable: true }),
};

export function isOpaque(id: number): boolean {
  return id !== Block.Air && BLOCKS[id]?.opaque === true;
}

export function isSolid(id: number): boolean {
  return id !== Block.Air && BLOCKS[id]?.solid === true;
}

// Creative hotbar palette, keys 1-9 then 0
export const HOTBAR_BLOCKS: Block[] = [
  Block.Grass, Block.Dirt, Block.Stone, Block.Sand, Block.Wood,
  Block.Planks, Block.Leaves, Block.Glass, Block.Crystal, Block.Lava,
];
