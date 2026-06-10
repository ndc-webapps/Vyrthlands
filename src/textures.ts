import * as THREE from 'three';

/**
 * Procedurally generated 16x16 pixel-art texture atlas. All textures are
 * original — painted in code with deterministic per-pixel noise.
 * Nearest-neighbor filtering for a crisp blocky look.
 */

export const TILE = 16;
const COLS = 8;
const ROWS = 5;

export const enum Tile {
  GrassTop = 0,
  GrassSide,
  Dirt,
  Stone,
  Sand,
  LogSide,
  LogTop,
  Leaves,
  Planks,
  Sandstone,
  SandstoneTop,
  Road,
  Glass,
  Crystal,
  Snow,
  Water,
  Cactus,
  CactusTop,
  Concrete,
  SnowSide,
  EmberOre,
  IronOre,
  GoldOre,
  VoidOre,
  Deepstone,
  Foundation,
  Lava,
  WorkbenchTop,
  WorkbenchSide,
  SmelterSide,
  SmelterTop,
  BedTop,
  BedSide,
  Lantern,
}

// deterministic per-pixel hash → 0..1
function pnoise(x: number, y: number, salt: number): number {
  let h = (salt + 1) * 374761393 + x * 668265263 + y * 2147483423;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

type Painter = (set: (x: number, y: number, r: number, g: number, b: number, a?: number) => void) => void;

function shadeOf(base: [number, number, number], f: number): [number, number, number] {
  return [base[0] * f, base[1] * f, base[2] * f];
}

function speckle(
  set: Parameters<Painter>[0], base: [number, number, number],
  variance: number, salt: number, cell = 1
): void {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = pnoise(Math.floor(x / cell), Math.floor(y / cell), salt);
      const f = 1 - variance / 2 + n * variance;
      set(x, y, base[0] * f, base[1] * f, base[2] * f);
    }
  }
}

const GRASS: [number, number, number] = [106, 190, 80];
const DIRT: [number, number, number] = [134, 105, 70];
const STONE: [number, number, number] = [136, 138, 148];
const SANDC: [number, number, number] = [226, 213, 166];
const SANDSTONE: [number, number, number] = [216, 198, 145];
const SNOWC: [number, number, number] = [240, 244, 250];

const PAINTERS: Record<number, Painter> = {
  [Tile.GrassTop]: (set) => {
    speckle(set, GRASS, 0.22, 1);
    // darker blade clumps
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (pnoise(x, y, 101) > 0.86) set(x, y, ...shadeOf(GRASS, 0.78));
      else if (pnoise(x, y, 102) > 0.9) set(x, y, ...shadeOf([140, 215, 100], 1));
    }
  },
  [Tile.GrassSide]: (set) => {
    speckle(set, DIRT, 0.22, 2);
    for (let x = 0; x < TILE; x++) {
      const depth = 2 + Math.floor(pnoise(x, 0, 103) * 3); // jagged grass overhang
      for (let y = 0; y < depth; y++) {
        const f = 1 - 0.18 * pnoise(x, y, 104);
        set(x, y, GRASS[0] * f, GRASS[1] * f, GRASS[2] * f);
      }
    }
  },
  [Tile.Dirt]: (set) => {
    speckle(set, DIRT, 0.26, 3);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (pnoise(x, y, 105) > 0.92) set(x, y, ...shadeOf(DIRT, 0.7)); // pebbles
    }
  },
  [Tile.Stone]: (set) => {
    speckle(set, STONE, 0.16, 4, 2);
    // cracks
    for (let i = 0; i < 3; i++) {
      let x = Math.floor(pnoise(i, 0, 106) * TILE);
      for (let y = Math.floor(pnoise(i, 1, 107) * 8); y < TILE && pnoise(x, y, 108 + i) > 0.2; y++) {
        set(x & 15, y, ...shadeOf(STONE, 0.72));
        if (pnoise(x, y, 109) > 0.6) x += pnoise(x, y, 110) > 0.5 ? 1 : -1;
      }
    }
  },
  [Tile.Sand]: (set) => {
    speckle(set, SANDC, 0.12, 5);
    // ripples
    for (let y = 0; y < TILE; y += 4) {
      for (let x = 0; x < TILE; x++) {
        const yy = (y + Math.floor(Math.sin(x * 0.8) * 1.5) + TILE) % TILE;
        set(x, yy, ...shadeOf(SANDC, 0.9));
      }
    }
  },
  [Tile.LogSide]: (set) => {
    const bark: [number, number, number] = [110, 84, 55];
    for (let x = 0; x < TILE; x++) {
      const stripe = pnoise(x, 0, 111) > 0.5 ? 1 : 0.82;
      for (let y = 0; y < TILE; y++) {
        const f = stripe * (0.9 + pnoise(x, y, 112) * 0.2);
        set(x, y, bark[0] * f, bark[1] * f, bark[2] * f);
      }
    }
    for (let i = 0; i < 4; i++) { // knots / vertical grooves
      const x = Math.floor(pnoise(i, 2, 113) * TILE);
      for (let y = 0; y < TILE; y++) if (pnoise(x, y, 114) > 0.35) set(x, y, ...shadeOf(bark, 0.62));
    }
  },
  [Tile.LogTop]: (set) => {
    const wood: [number, number, number] = [176, 142, 96];
    speckle(set, wood, 0.1, 6);
    // growth rings (concentric squares)
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (Math.floor(d) % 3 === 0) set(x, y, ...shadeOf(wood, 0.8));
      if (d > 6.5) set(x, y, ...shadeOf([110, 84, 55], 0.95)); // bark edge
    }
  },
  [Tile.Leaves]: (set) => {
    const leaf: [number, number, number] = [70, 152, 58];
    speckle(set, leaf, 0.3, 7);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const n = pnoise(x, y, 115);
      if (n > 0.88) set(x, y, ...shadeOf(leaf, 0.55)); // shadow holes
      else if (n < 0.07) set(x, y, ...shadeOf([120, 200, 90], 1)); // highlights
    }
  },
  [Tile.Planks]: (set) => {
    const plank: [number, number, number] = [184, 148, 95];
    for (let y = 0; y < TILE; y++) {
      const board = Math.floor(y / 4);
      for (let x = 0; x < TILE; x++) {
        let f = 0.92 + pnoise(x + board * 7, y, 116) * 0.16;
        if (y % 4 === 3) f *= 0.66; // seam
        if ((x + board * 8) % 16 === 0) f *= 0.7; // board ends, offset per row
        set(x, y, plank[0] * f, plank[1] * f, plank[2] * f);
      }
    }
  },
  [Tile.Sandstone]: (set) => {
    for (let y = 0; y < TILE; y++) {
      const band = 0.88 + pnoise(0, Math.floor(y / 3), 117) * 0.2;
      for (let x = 0; x < TILE; x++) {
        const f = band * (0.95 + pnoise(x, y, 118) * 0.1);
        set(x, y, SANDSTONE[0] * f, SANDSTONE[1] * f, SANDSTONE[2] * f);
      }
    }
    for (let x = 0; x < TILE; x++) { set(x, 0, ...shadeOf(SANDSTONE, 1.06)); set(x, 15, ...shadeOf(SANDSTONE, 0.78)); }
  },
  [Tile.SandstoneTop]: (set) => speckle(set, SANDSTONE, 0.08, 8, 2),
  [Tile.Road]: (set) => {
    const asphalt: [number, number, number] = [62, 62, 68];
    speckle(set, asphalt, 0.22, 9);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (pnoise(x, y, 119) > 0.94) set(x, y, ...shadeOf(asphalt, 1.5)); // gravel glints
    }
  },
  [Tile.Glass]: (set) => {
    const frame: [number, number, number] = [200, 225, 235];
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      if (edge) set(x, y, frame[0] * 0.9, frame[1] * 0.9, frame[2] * 0.9, 255);
      else if (x - y === 4 || x - y === 5 || (x - y >= -9 && x - y <= -8)) {
        set(x, y, 235, 248, 255, 150); // diagonal sheen
      } else {
        set(x, y, 190, 220, 235, 36); // mostly see-through
      }
    }
  },
  [Tile.Crystal]: (set) => {
    const c: [number, number, number] = [92, 214, 240];
    speckle(set, c, 0.18, 10);
    // bright diamond facets
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d1 = Math.abs(x - 5) + Math.abs(y - 5);
      const d2 = Math.abs(x - 11) + Math.abs(y - 11);
      if (d1 < 3 || d2 < 3) set(x, y, 200, 248, 255);
      else if (d1 === 3 || d2 === 3) set(x, y, 150, 235, 252);
    }
  },
  [Tile.Snow]: (set) => {
    speckle(set, SNOWC, 0.06, 11);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (pnoise(x, y, 120) > 0.93) set(x, y, 255, 255, 255);
    }
  },
  [Tile.SnowSide]: (set) => {
    speckle(set, STONE, 0.16, 12, 2);
    for (let x = 0; x < TILE; x++) {
      const depth = 3 + Math.floor(pnoise(x, 0, 121) * 3);
      for (let y = 0; y < depth; y++) set(x, y, SNOWC[0], SNOWC[1], SNOWC[2]);
    }
  },
  [Tile.Water]: (set) => {
    const w: [number, number, number] = [58, 116, 200];
    speckle(set, w, 0.14, 13, 2);
    for (let y = 2; y < TILE; y += 5) {
      for (let x = 0; x < TILE; x++) {
        if (pnoise(x, y, 122) > 0.4) set(x, (y + (x % 3 === 0 ? 1 : 0)) % TILE, ...shadeOf(w, 1.25));
      }
    }
  },
  [Tile.Cactus]: (set) => {
    const cac: [number, number, number] = [70, 140, 60];
    for (let x = 0; x < TILE; x++) {
      const rib = x % 4 === 2 ? 0.74 : x % 4 === 0 ? 1.12 : 1;
      for (let y = 0; y < TILE; y++) {
        const f = rib * (0.92 + pnoise(x, y, 123) * 0.14);
        set(x, y, cac[0] * f, cac[1] * f, cac[2] * f);
      }
    }
    for (let y = 1; y < TILE; y += 3) { set(2, y, 220, 230, 200); set(10, (y + 1) % TILE, 220, 230, 200); } // spines
  },
  [Tile.CactusTop]: (set) => {
    speckle(set, [80, 150, 68], 0.12, 14);
    for (let i = 0; i < TILE; i++) { set(i, 0, 50, 105, 45); set(i, 15, 50, 105, 45); set(0, i, 50, 105, 45); set(15, i, 50, 105, 45); }
  },
  [Tile.Concrete]: (set) => {
    speckle(set, [168, 168, 172], 0.08, 15, 2);
    for (let x = 0; x < TILE; x++) set(x, 15, 132, 132, 138); // floor seam
  },
  [Tile.EmberOre]: (set) => {
    speckle(set, STONE, 0.16, 16, 2);
    orify(set, [38, 34, 34], [255, 140, 50], 30);
  },
  [Tile.IronOre]: (set) => {
    speckle(set, STONE, 0.16, 17, 2);
    orify(set, [196, 132, 92], [232, 178, 130], 31);
  },
  [Tile.GoldOre]: (set) => {
    speckle(set, STONE, 0.16, 18, 2);
    orify(set, [240, 200, 70], [255, 235, 140], 32);
  },
  [Tile.VoidOre]: (set) => {
    speckle(set, [70, 68, 84], 0.18, 19, 2);
    orify(set, [120, 70, 200], [190, 130, 255], 33);
  },
  [Tile.Deepstone]: (set) => {
    speckle(set, [78, 78, 88], 0.18, 20, 2);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (pnoise(x, y, 134) > 0.92) set(x, y, 50, 50, 60);
    }
  },
  [Tile.Foundation]: (set) => {
    speckle(set, [44, 42, 52], 0.14, 21, 2);
    for (let i = 0; i < TILE; i++) { set(i, i, 28, 26, 36); set(TILE - 1 - i, i, 28, 26, 36); }
  },
  [Tile.Lava]: (set) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const n = pnoise(Math.floor(x / 2), Math.floor(y / 2), 135);
      if (n > 0.75) set(x, y, 255, 230, 120);
      else if (n > 0.45) set(x, y, 250, 140, 40);
      else set(x, y, 200, 70, 20);
    }
  },
  [Tile.WorkbenchTop]: (set) => {
    PAINTERS[Tile.Planks](set);
    for (let i = 2; i < 14; i++) { set(i, 2, 90, 66, 40); set(i, 13, 90, 66, 40); set(2, i, 90, 66, 40); set(13, i, 90, 66, 40); }
    for (let i = 5; i < 11; i++) set(i, i, 120, 120, 128); // saw mark
  },
  [Tile.WorkbenchSide]: (set) => {
    PAINTERS[Tile.Planks](set);
    for (let x = 0; x < TILE; x++) { set(x, 0, 120, 92, 58); set(x, 1, 120, 92, 58); }
  },
  [Tile.SmelterSide]: (set) => {
    speckle(set, STONE, 0.14, 22, 2);
    for (let y = 7; y < 13; y++) for (let x = 5; x < 11; x++) {
      const glow = pnoise(x, y, 136);
      if (y > 8) set(x, y, glow > 0.5 ? 255 : 220, glow > 0.5 ? 150 : 90, 40);
      else set(x, y, 30, 26, 26);
    }
  },
  [Tile.SmelterTop]: (set) => {
    speckle(set, STONE, 0.14, 23, 2);
    for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) set(x, y, 32, 28, 28);
  },
  [Tile.BedTop]: (set) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const f = 0.92 + pnoise(x, y, 137) * 0.14;
      if (y < 5) set(x, y, 235 * f, 235 * f, 240 * f);          // pillow
      else set(x, y, 190 * f, 60 * f, 70 * f);                   // blanket
    }
    for (let x = 0; x < TILE; x++) set(x, 5, 150, 40, 50);
  },
  [Tile.BedSide]: (set) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const f = 0.92 + pnoise(x, y, 138) * 0.14;
      if (y < 7) set(x, y, 190 * f, 60 * f, 70 * f);
      else set(x, y, 150 * f, 116 * f, 76 * f);                  // wooden frame
    }
  },
  [Tile.Lantern]: (set) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
      const frame = x === 7 || x === 8 || y === 7 || y === 8;
      if (edge || frame) set(x, y, 70, 52, 34);                  // wooden cage
      else {
        const n = pnoise(x, y, 139);
        set(x, y, 255, n > 0.5 ? 220 : 190, 90);                 // warm glow panes
      }
    }
  },
};

// scatter ore chunks with highlight pixel
function orify(
  set: Parameters<Painter>[0],
  dark: [number, number, number], bright: [number, number, number], salt: number
): void {
  for (let y = 1; y < TILE - 1; y++) {
    for (let x = 1; x < TILE - 1; x++) {
      if (pnoise(x, y, salt) > 0.91) {
        set(x, y, ...dark);
        set(x + 1, y, ...dark);
        set(x, y + 1, ...bright);
      }
    }
  }
}

export interface Atlas {
  texture: THREE.Texture;
  canvas: HTMLCanvasElement;
  /** [u0, v0, u1, v1] with half-texel inset to avoid bleeding */
  uv(tile: Tile): [number, number, number, number];
  /** Standalone crisp icon canvas for the HUD */
  icon(tile: Tile, size: number): HTMLCanvasElement;
}

export function buildAtlas(): Atlas {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(canvas.width, canvas.height);

  for (const key of Object.keys(PAINTERS)) {
    const tile = Number(key);
    const ox = (tile % COLS) * TILE;
    const oy = Math.floor(tile / COLS) * TILE;
    PAINTERS[tile]((x, y, r, g, b, a = 255) => {
      const i = ((oy + y) * canvas.width + (ox + x)) * 4;
      img.data[i] = Math.max(0, Math.min(255, r));
      img.data[i + 1] = Math.max(0, Math.min(255, g));
      img.data[i + 2] = Math.max(0, Math.min(255, b));
      img.data[i + 3] = a;
    });
  }
  ctx.putImageData(img, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  const padU = 0.5 / canvas.width;
  const padV = 0.5 / canvas.height;

  return {
    texture,
    canvas,
    uv(tile: Tile) {
      const col = tile % COLS;
      const row = Math.floor(tile / COLS);
      const u0 = col / COLS + padU;
      const u1 = (col + 1) / COLS - padU;
      // canvas y-down → UV v-up
      const v1 = 1 - row / ROWS - padV;
      const v0 = 1 - (row + 1) / ROWS + padV;
      return [u0, v0, u1, v1];
    },
    icon(tile: Tile, size: number) {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ic = c.getContext('2d')!;
      ic.imageSmoothingEnabled = false;
      ic.drawImage(canvas, (tile % COLS) * TILE, Math.floor(tile / COLS) * TILE, TILE, TILE, 0, 0, size, size);
      return c;
    },
  };
}
