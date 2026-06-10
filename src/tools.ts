import { BlockMaterial } from './blocks';

export type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'staff' | 'gun' | 'hand';

export interface ToolDef {
  kind: ToolKind;
  tier: number;       // 0 hand, 1 wood, 2 stone, 3 iron/gold, 4 crystal
  speed: number;      // mining speed multiplier on effective materials
  durability: number; // uses before breaking
  damage: number;     // combat damage (future)
}

/** Which block material each tool kind mines efficiently. */
export const EFFECTIVE: Record<ToolKind, BlockMaterial[]> = {
  pickaxe: ['stone'],
  axe: ['wood', 'plant'],
  shovel: ['earth'],
  sword: ['plant'],
  staff: [],
  gun: [],
  hand: [],
};

export const HAND: ToolDef = { kind: 'hand', tier: 0, speed: 1, durability: Infinity, damage: 1 };

export function tool(kind: ToolKind, tier: number, speed: number, durability: number, damage: number): ToolDef {
  return { kind, tier, speed, durability, damage };
}
