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
}

export interface BlockDef {
  id: Block;
  name: string;
  topColor: [number, number, number];
  sideColor: [number, number, number];
  bottomColor: [number, number, number];
  solid: boolean;      // blocks player movement
  opaque: boolean;     // culls neighbor faces
  glow: boolean;       // rendered unlit (emissive look)
  transparent: boolean;
}

function c(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function def(
  id: Block, name: string, top: number, side: number, bottom: number,
  opts: Partial<Pick<BlockDef, 'solid' | 'opaque' | 'glow' | 'transparent'>> = {}
): BlockDef {
  return {
    id, name,
    topColor: c(top), sideColor: c(side), bottomColor: c(bottom),
    solid: opts.solid ?? true,
    opaque: opts.opaque ?? true,
    glow: opts.glow ?? false,
    transparent: opts.transparent ?? false,
  };
}

export const BLOCKS: Record<number, BlockDef> = {
  [Block.Grass]: def(Block.Grass, 'Grass', 0x6fbf4a, 0x8a6f47, 0x7a5c3a),
  [Block.Dirt]: def(Block.Dirt, 'Dirt', 0x8a6f47, 0x8a6f47, 0x7a5c3a),
  [Block.Stone]: def(Block.Stone, 'Stone', 0x9a9aa5, 0x8d8d98, 0x80808b),
  [Block.Wood]: def(Block.Wood, 'Wood', 0xa3855c, 0x7d5f3d, 0xa3855c),
  [Block.Leaves]: def(Block.Leaves, 'Leaves', 0x4e9e3f, 0x459438, 0x3d8531),
  [Block.Sand]: def(Block.Sand, 'Sand', 0xe6d8a8, 0xddcf9e, 0xd4c694),
  [Block.Water]: def(Block.Water, 'Water', 0x3f76c9, 0x3f76c9, 0x3f76c9,
    { solid: false, opaque: false, transparent: true }),
  [Block.Crystal]: def(Block.Crystal, 'Sky Crystal', 0x7df0ff, 0x5cd6f0, 0x49bcd8,
    { glow: true, opaque: true }),
};

export function isOpaque(id: number): boolean {
  return id !== Block.Air && BLOCKS[id]?.opaque === true;
}

export function isSolid(id: number): boolean {
  return id !== Block.Air && BLOCKS[id]?.solid === true;
}

// Hotbar order, keys 1-7
export const HOTBAR_BLOCKS: Block[] = [
  Block.Grass, Block.Dirt, Block.Stone, Block.Wood, Block.Leaves, Block.Sand, Block.Crystal,
];

// CSS swatch colors for the hotbar UI
export const BLOCK_SWATCH: Record<number, string> = {
  [Block.Grass]: 'linear-gradient(160deg,#6fbf4a 55%,#8a6f47 55%)',
  [Block.Dirt]: '#8a6f47',
  [Block.Stone]: '#8d8d98',
  [Block.Wood]: 'repeating-linear-gradient(90deg,#7d5f3d 0 6px,#6e5234 6px 9px)',
  [Block.Leaves]: '#459438',
  [Block.Sand]: '#ddcf9e',
  [Block.Crystal]: 'radial-gradient(circle at 35% 35%,#bdf8ff,#5cd6f0)',
};
