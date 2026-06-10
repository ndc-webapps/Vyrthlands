export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 100;

// World size presets: chunks per side
export const WORLD_SIZES = {
  small: 12,   // 192x192 blocks
  medium: 20,  // 320x320
  large: 32,   // 512x512
  huge: 64,    // 1024x1024 (streamed, never fully meshed)
} as const;
export type WorldSizeKey = keyof typeof WORLD_SIZES;

// Render distance presets: chunks radius around player
export const RENDER_DISTANCES = {
  near: 4,
  normal: 6,
  far: 8,
  ultra: 10,
} as const;
export type RenderDistanceKey = keyof typeof RENDER_DISTANCES;

// Max chunk meshes built per frame while streaming
export const CHUNK_BUILD_BUDGET = 2;

export const GRAVITY = -26;
export const JUMP_SPEED = 8.5;
export const WALK_SPEED = 5.2;
export const FLY_SPEED = 14;
export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const REACH = 6;

export const MOUSE_SENSITIVITY = 0.0022;
export const CREATIVE_BREAK_REPEAT = 0.22; // seconds between breaks while holding LMB in creative
export const PLACE_REPEAT = 0.22;          // seconds between places while holding RMB
export const THIRD_PERSON_DISTANCE = 4;
export const DAY_LENGTH_SECONDS = 480;

export const SAVE_KEY = 'blockworld_save_v3';
