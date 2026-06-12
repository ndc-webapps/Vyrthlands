import { CHUNK_SIZE } from '../../config';
import { Block } from '../../blocks';
import { hash3 } from '../noise';
import { WorldGenerator, GenContext, fillColumn, placeTree } from './types';

/**
 * Theme Park world: a flat festival ground packed with 20+ original
 * attractions. No enemies spawn here. Every ride has a glowing Ride Seat
 * post — interact with it to ride a scripted path (handled in main.ts).
 *
 * The whole park layout is deterministic and centered on the world middle,
 * so the generator (block stamping, chunk by chunk) and the ride system
 * (seat positions + paths) both derive from the same ATTRACTIONS table.
 */

export const PARK_GROUND = 14;
const G = PARK_GROUND;          // ground surface y
const Y = G + 1;                // first air block above ground

type Vec3 = [number, number, number];
type SetFn = (wx: number, y: number, wz: number, id: number) => void;

export interface ParkRide {
  name: string;
  /** World position of the Ride Seat block. */
  seat: Vec3;
  /** Waypoints (world coords, player-feet position) for the ride path. */
  path: Vec3[];
  duration: number;   // seconds for the full path
  closed?: boolean;   // loop (coasters, carousels) vs out-and-back handled by path
}

interface Attraction {
  name: string;
  /** Offset of the attraction center from the park center. */
  dx: number;
  dz: number;
  /** Half-extent of the structure footprint (for chunk culling). */
  r: number;
  build(set: SetFn, cx: number, cz: number): void;
  /** Ride definition relative to the attraction center; null = walk-in decor. */
  ride?: (cx: number, cz: number) => Omit<ParkRide, 'name'>;
}

// ---------- small structure helpers (all coords are world coords) ----------
function box(set: SetFn, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): void {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, id);
}
function frame(set: SetFn, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): void {
  // hollow box: walls only
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    if (x === x0 || x === x1 || z === z0 || z === z1) set(x, y, z, id);
  }
}
function pillar(set: SetFn, x: number, z: number, y0: number, h: number, id: number): void {
  for (let y = y0; y < y0 + h; y++) set(x, y, z, id);
}
function disc(set: SetFn, cx: number, y: number, cz: number, r: number, id: number): void {
  for (let x = cx - r; x <= cx + r; x++) for (let z = cz - r; z <= cz + r; z++) {
    if ((x - cx) * (x - cx) + (z - cz) * (z - cz) <= r * r + r * 0.5) set(x, y, z, id);
  }
}
function ringBlocks(set: SetFn, cx: number, y: number, cz: number, r: number, id: number): void {
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2;
    set(Math.round(cx + Math.cos(t) * r), y, Math.round(cz + Math.sin(t) * r), id);
  }
}
function pool(set: SetFn, x0: number, z0: number, x1: number, z1: number): void {
  box(set, x0, G - 1, z0, x1, G, z1, Block.Air);
  frame(set, x0, G - 1, z0, x1, G, z1, Block.Concrete);
  box(set, x0, G - 2, z0, x1, G - 2, z1, Block.Concrete);
  box(set, x0 + 1, G - 1, z0 + 1, x1 - 1, G, z1 - 1, Block.Water);
}
function seatPost(set: SetFn, x: number, z: number): void {
  set(x, Y, z, Block.RideSeat);
}

// circle path at constant height
function circlePath(cx: number, y: number, cz: number, r: number, n = 16, yFn?: (t: number) => number): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(t) * r, y + (yFn ? yFn(i / n) : 0), cz + Math.sin(t) * r]);
  }
  return pts;
}

// ---------- the attractions (24 total, 21 rideable) ----------
const ATTRACTIONS: Attraction[] = [
  {
    name: 'Grand Carousel', dx: 0, dz: -30, r: 8,
    build(set, cx, cz) {
      disc(set, cx, G, cz, 7, Block.Planks);
      disc(set, cx, Y + 5, cz, 7, Block.CanopyRed);
      disc(set, cx, Y + 6, cz, 5, Block.CanopyRed);
      disc(set, cx, Y + 7, cz, 3, Block.CanopyRed);
      set(cx, Y + 8, cz, Block.Lantern);
      pillar(set, cx, cz, Y, 5, Block.GoldOre);
      for (let a = 0; a < 6; a++) {
        const t = (a / 6) * Math.PI * 2;
        pillar(set, Math.round(cx + Math.cos(t) * 5), Math.round(cz + Math.sin(t) * 5), Y, 5, Block.Crystal);
      }
      seatPost(set, cx + 7, cz);
    },
    ride: (cx, cz) => ({ seat: [cx + 7, Y, cz], path: circlePath(cx, Y + 1, cz, 5, 16), duration: 14, closed: true }),
  },
  {
    name: 'Sky Wheel', dx: 34, dz: -34, r: 12,
    build(set, cx, cz) {
      // giant vertical wheel in the X/Y plane
      for (let a = 0; a < 80; a++) {
        const t = (a / 80) * Math.PI * 2;
        set(Math.round(cx + Math.cos(t) * 10), Math.round(Y + 11 + Math.sin(t) * 10), cz, Block.Glass);
      }
      for (let a = 0; a < 8; a++) {
        const t = (a / 8) * Math.PI * 2;
        set(Math.round(cx + Math.cos(t) * 10), Math.round(Y + 11 + Math.sin(t) * 10), cz, Block.CanopyBlue);
      }
      pillar(set, cx - 3, cz, Y, 11, Block.Foundation);
      pillar(set, cx + 3, cz, Y, 11, Block.Foundation);
      set(cx, Y + 11, cz, Block.Lantern);
      box(set, cx - 4, G, cz - 3, cx + 4, G, cz + 3, Block.Concrete);
      seatPost(set, cx, cz + 3);
    },
    ride: (cx, cz) => {
      // vertical circle in the X/Y plane (gondola sweep)
      const pts: Vec3[] = [];
      for (let i = 0; i < 20; i++) {
        const t = (i / 20) * Math.PI * 2;
        pts.push([cx + Math.cos(t) * 9, Y + 11 + Math.sin(t) * 9, cz + 1]);
      }
      return { seat: [cx, Y, cz + 3], path: pts, duration: 26, closed: true };
    },
  },
  {
    name: 'Comet Coaster', dx: -45, dz: -45, r: 26,
    build(set, cx, cz) {
      // supports + glowing rail along the ride path
      const pts = cometTrack(cx, cz);
      for (let i = 0; i < pts.length; i++) {
        const [x, y, z] = pts[i];
        set(Math.round(x), Math.round(y) - 1, Math.round(z), Block.Road);
        if (i % 4 === 0) pillar(set, Math.round(x), Math.round(z), Y, Math.round(y) - Y - 1, Block.Wood);
        if (i % 3 === 0) set(Math.round(x), Math.round(y) - 2, Math.round(z), Block.Crystal);
      }
      box(set, cx - 3, G, cz - 2, cx + 3, G, cz + 2, Block.Concrete);
      box(set, cx - 3, Y + 3, cz - 2, cx + 3, Y + 3, cz + 2, Block.CanopyYellow);
      seatPost(set, cx, cz);
    },
    ride: (cx, cz) => ({ seat: [cx, Y, cz], path: cometTrack(cx, cz), duration: 24, closed: true }),
  },
  {
    name: 'Mini Coaster', dx: -20, dz: 38, r: 12,
    build(set, cx, cz) {
      const pts = circlePath(cx, Y + 3, cz, 9, 20, (t) => Math.sin(t * Math.PI * 4) * 2 + 2);
      for (let i = 0; i < pts.length; i++) {
        const [x, y, z] = pts[i];
        set(Math.round(x), Math.round(y) - 1, Math.round(z), Block.Road);
        if (i % 2 === 0) pillar(set, Math.round(x), Math.round(z), Y, Math.round(y) - Y - 1, Block.Planks);
      }
      seatPost(set, cx, cz);
    },
    ride: (cx, cz) => ({ seat: [cx, Y, cz], path: circlePath(cx, Y + 3, cz, 9, 20, (t) => Math.sin(t * Math.PI * 4) * 2 + 2), duration: 16, closed: true }),
  },
  {
    name: 'Star Drop Tower', dx: 52, dz: 0, r: 5,
    build(set, cx, cz) {
      pillar(set, cx, cz, Y, 26, Block.Foundation);
      for (let y = Y; y < Y + 26; y += 4) set(cx, y, cz + 1, Block.Lantern);
      box(set, cx - 2, Y + 26, cz - 2, cx + 2, Y + 26, cz + 2, Block.CanopyRed);
      box(set, cx - 3, G, cz - 3, cx + 3, G, cz + 3, Block.Concrete);
      seatPost(set, cx + 1, cz);
    },
    ride: (cx, cz) => ({
      seat: [cx + 1, Y, cz],
      path: [[cx + 1, Y, cz], [cx + 1, Y + 8, cz], [cx + 1, Y + 16, cz], [cx + 1, Y + 24, cz],
        [cx + 1, Y + 24.5, cz], [cx + 1, Y + 2, cz], [cx + 1, Y, cz]],
      duration: 12,
    }),
  },
  {
    name: 'Sky Swings', dx: -52, dz: 8, r: 9,
    build(set, cx, cz) {
      pillar(set, cx, cz, Y, 9, Block.Wood);
      disc(set, cx, Y + 9, cz, 6, Block.CanopyBlue);
      set(cx, Y + 10, cz, Block.Lantern);
      seatPost(set, cx + 6, cz);
    },
    ride: (cx, cz) => ({ seat: [cx + 6, Y, cz], path: circlePath(cx, Y + 6, cz, 7, 16, (t) => Math.sin(t * Math.PI * 6) * 0.8), duration: 15, closed: true }),
  },
  {
    name: 'Tempest Ship', dx: 26, dz: 44, r: 11,
    build(set, cx, cz) {
      // swinging ship: hull + A-frame
      box(set, cx - 6, Y + 4, cz - 1, cx + 6, Y + 4, cz + 1, Block.Wood);
      box(set, cx - 5, Y + 5, cz - 1, cx + 5, Y + 5, cz + 1, Block.Planks);
      pillar(set, cx - 7, cz - 2, Y, 8, Block.Foundation);
      pillar(set, cx + 7, cz - 2, Y, 8, Block.Foundation);
      pillar(set, cx - 7, cz + 2, Y, 8, Block.Foundation);
      pillar(set, cx + 7, cz + 2, Y, 8, Block.Foundation);
      box(set, cx - 7, Y + 8, cz - 2, cx + 7, Y + 8, cz + 2, Block.Wood);
      seatPost(set, cx, cz + 3);
    },
    ride: (cx, cz) => {
      // pendulum sweep
      const pts: Vec3[] = [];
      for (let i = 0; i <= 16; i++) {
        const sw = Math.sin((i / 16) * Math.PI * 4) * 1.1;
        pts.push([cx + Math.sin(sw) * 8, Y + 8 - Math.cos(sw) * 6, cz]);
      }
      return { seat: [cx, Y, cz + 3], path: pts, duration: 14 };
    },
  },
  {
    name: 'Crimson Falls Waterslide', dx: 62, dz: -22, r: 12,
    build(set, cx, cz) {
      pillar(set, cx, cz, Y, 14, Block.Foundation);
      box(set, cx - 1, Y + 14, cz - 1, cx + 1, Y + 14, cz + 1, Block.CanopyRed);
      // sloped chute heading +z into the pool
      for (let i = 0; i <= 12; i++) {
        const y = Y + 13 - i;
        const z = cz + 1 + i;
        set(cx - 1, y, z, Block.CanopyRed);
        set(cx + 1, y, z, Block.CanopyRed);
        set(cx, y - 1, z, Block.Glass);
        set(cx, y, z, Block.Water);
      }
      pool(set, cx - 4, cz + 14, cx + 4, cz + 22);
      seatPost(set, cx + 2, cz);
    },
    ride: (cx, cz) => {
      const pts: Vec3[] = [[cx + 2, Y, cz], [cx, Y + 14, cz]];
      for (let i = 0; i <= 12; i += 3) pts.push([cx, Y + 13.5 - i, cz + 1 + i]);
      pts.push([cx, Y + 0.5, cz + 18]);
      return { seat: [cx + 2, Y, cz], path: pts, duration: 9 };
    },
  },
  {
    name: 'Azure Twister Waterslide', dx: 70, dz: 16, r: 12,
    build(set, cx, cz) {
      pillar(set, cx, cz, Y, 12, Block.Foundation);
      // spiral chute
      for (let i = 0; i <= 28; i++) {
        const t = (i / 28) * Math.PI * 3;
        const y = Y + 11 - (i / 28) * 10;
        const x = Math.round(cx + Math.cos(t) * 5);
        const z = Math.round(cz + Math.sin(t) * 5);
        set(x, Math.round(y), z, Block.CanopyBlue);
        set(x, Math.round(y) + 1, z, Block.Water);
      }
      pool(set, cx - 4, cz - 4, cx + 4, cz + 4);
      seatPost(set, cx + 6, cz - 6);
    },
    ride: (cx, cz) => {
      const pts: Vec3[] = [[cx + 6, Y, cz - 6], [cx + 5, Y + 12, cz]];
      for (let i = 0; i <= 28; i += 4) {
        const t = (i / 28) * Math.PI * 3;
        pts.push([cx + Math.cos(t) * 5, Y + 12 - (i / 28) * 10, cz + Math.sin(t) * 5]);
      }
      pts.push([cx, Y + 0.5, cz]);
      return { seat: [cx + 6, Y, cz - 6], path: pts, duration: 11 };
    },
  },
  {
    name: 'Timberline Log Flume', dx: -70, dz: -20, r: 14,
    build(set, cx, cz) {
      // water channel rectangle with a lift hill
      frame(set, cx - 10, Y - 1, cz - 6, cx + 10, Y - 1, cz + 6, Block.Wood);
      for (let x = cx - 9; x <= cx + 9; x++) { set(x, Y - 1, cz - 5, Block.Water); set(x, Y - 1, cz + 5, Block.Water); }
      for (let z = cz - 5; z <= cz + 5; z++) { set(cx - 9, Y - 1, z, Block.Water); set(cx + 9, Y - 1, z, Block.Water); }
      // lift hill on east side
      for (let i = 0; i <= 5; i++) {
        set(cx + 9, Y + i, cz - i, Block.Wood);
        set(cx + 10, Y + i, cz - i, Block.Wood);
      }
      seatPost(set, cx - 9, cz)
      ;
    },
    ride: (cx, cz) => ({
      seat: [cx - 9, Y, cz],
      path: [
        [cx - 9, Y, cz - 5], [cx, Y, cz - 5], [cx + 9, Y, cz - 5],
        [cx + 9, Y + 5, cz], [cx + 9, Y, cz + 5], [cx, Y, cz + 5],
        [cx - 9, Y, cz + 5], [cx - 9, Y, cz - 5],
      ],
      duration: 18, closed: true,
    }),
  },
  {
    name: 'Lazy River', dx: 0, dz: 64, r: 14,
    build(set, cx, cz) {
      for (let a = 0; a < 128; a++) {
        const t = (a / 128) * Math.PI * 2;
        for (const rr of [10, 11, 12]) {
          const x = Math.round(cx + Math.cos(t) * rr);
          const z = Math.round(cz + Math.sin(t) * rr);
          set(x, G, z, rr === 11 ? Block.Water : Block.Concrete);
          if (rr === 11) set(x, G - 1, z, Block.Concrete);
        }
      }
      disc(set, cx, G, cz, 4, Block.Sand);
      placeTreeWorld(set, cx, Y, cz, 'palm');
      seatPost(set, cx + 13, cz);
    },
    ride: (cx, cz) => ({ seat: [cx + 13, Y, cz], path: circlePath(cx, Y - 0.5, cz, 11, 20), duration: 30, closed: true }),
  },
  {
    name: 'Wave Lagoon', dx: -34, dz: 64, r: 10,
    build(set, cx, cz) {
      pool(set, cx - 8, cz - 6, cx + 8, cz + 6);
      for (const ox of [-8, 8]) pillar(set, cx + ox, cz - 6, Y, 3, Block.Wood);
      box(set, cx - 8, Y + 3, cz - 6, cx + 8, Y + 3, cz - 6, Block.CanopyYellow);
      seatPost(set, cx, cz - 7);
    },
    ride: (cx, cz) => ({
      seat: [cx, Y, cz - 7],
      path: [[cx, Y, cz - 7], [cx - 5, Y - 0.4, cz], [cx, Y + 0.4, cz + 3], [cx + 5, Y - 0.4, cz], [cx, Y, cz - 3], [cx, Y, cz - 7]],
      duration: 13,
    }),
  },
  {
    name: 'Spiral Slide', dx: 22, dz: 26, r: 6,
    build(set, cx, cz) {
      pillar(set, cx, cz, Y, 8, Block.Wood);
      for (let i = 0; i <= 16; i++) {
        const t = (i / 16) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(t) * 3);
        const z = Math.round(cz + Math.sin(t) * 3);
        set(x, Math.round(Y + 7 - (i / 16) * 7), z, Block.CanopyYellow);
      }
      seatPost(set, cx + 4, cz + 4);
    },
    ride: (cx, cz) => {
      const pts: Vec3[] = [[cx + 4, Y, cz + 4], [cx + 3, Y + 8, cz]];
      for (let i = 0; i <= 16; i += 3) {
        const t = (i / 16) * Math.PI * 2;
        pts.push([cx + Math.cos(t) * 3, Y + 8 - (i / 16) * 7, cz + Math.sin(t) * 3]);
      }
      return { seat: [cx + 4, Y, cz + 4], path: pts, duration: 7 };
    },
  },
  {
    name: 'Bounce Dome', dx: -22, dz: 18, r: 6,
    build(set, cx, cz) {
      disc(set, cx, G, cz, 5, Block.CanopyBlue);
      ringBlocks(set, cx, Y, cz, 5, Block.Glass);
      seatPost(set, cx + 5, cz + 1);
    },
    ride: (cx, cz) => {
      const pts: Vec3[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = (i / 12) * Math.PI * 2;
        pts.push([cx + Math.cos(t) * 2.5, Y + Math.abs(Math.sin(i * 2.1)) * 4, cz + Math.sin(t) * 2.5]);
      }
      return { seat: [cx + 5, Y, cz + 1], path: pts, duration: 10 };
    },
  },
  {
    name: 'Park Express Train', dx: 0, dz: 0, r: 90,
    build(set, cx, cz) {
      // perimeter track ring + station
      for (let a = 0; a < 720; a++) {
        const t = (a / 720) * Math.PI * 2;
        set(Math.round(cx + Math.cos(t) * 82), G, Math.round(cz + Math.sin(t) * 82), Block.Road);
      }
      box(set, cx + 78, G, cz - 3, cx + 85, G, cz + 3, Block.Concrete);
      box(set, cx + 79, Y + 3, cz - 3, cx + 84, Y + 3, cz + 3, Block.CanopyRed);
      pillar(set, cx + 79, cz - 3, Y, 3, Block.Wood);
      pillar(set, cx + 84, cz - 3, Y, 3, Block.Wood);
      pillar(set, cx + 79, cz + 3, Y, 3, Block.Wood);
      pillar(set, cx + 84, cz + 3, Y, 3, Block.Wood);
      seatPost(set, cx + 82, cz);
    },
    ride: (cx, cz) => ({ seat: [cx + 82, Y, cz], path: circlePath(cx, Y, cz, 82, 36), duration: 60, closed: true }),
  },
  {
    name: 'Stargazer Tower', dx: 14, dz: -58, r: 6,
    build(set, cx, cz) {
      pillar(set, cx, cz, Y, 20, Block.Concrete);
      disc(set, cx, Y + 20, cz, 4, Block.Glass);
      ringBlocks(set, cx, Y + 21, cz, 4, Block.Glass);
      set(cx, Y + 22, cz, Block.Lantern);
      seatPost(set, cx + 1, cz + 1);
    },
    ride: (cx, cz) => ({
      seat: [cx + 1, Y, cz + 1],
      path: [[cx + 1, Y, cz + 1], [cx + 1, Y + 21, cz + 1], [cx - 2, Y + 21, cz], [cx + 1, Y + 21, cz - 2],
        [cx + 1, Y + 21, cz + 1], [cx + 1, Y, cz + 1]],
      duration: 16,
    }),
  },
  {
    name: 'Phantom Manor', dx: -62, dz: 40, r: 9,
    build(set, cx, cz) {
      frame(set, cx - 7, Y, cz - 6, cx + 7, Y + 5, cz + 6, Block.Deepstone);
      box(set, cx - 7, Y + 6, cz - 6, cx + 7, Y + 6, cz + 6, Block.Deepstone);
      set(cx, Y, cz - 6, Block.Air); set(cx, Y + 1, cz - 6, Block.Air); // door
      for (const ox of [-4, 0, 4]) set(cx + ox, Y + 2, cz + 5, Block.Lantern);
      set(cx, Y + 3, cz, Block.Crystal); // eerie centerpiece
      seatPost(set, cx - 1, cz - 7);
    },
    ride: (cx, cz) => ({
      seat: [cx - 1, Y, cz - 7],
      path: [[cx - 1, Y, cz - 7], [cx, Y, cz - 3], [cx - 4, Y, cz], [cx, Y, cz + 3], [cx + 4, Y, cz - 1],
        [cx, Y, cz - 3], [cx, Y, cz - 7]],
      duration: 15,
    }),
  },
  {
    name: 'Mirror Maze', dx: 44, dz: 62, r: 8,
    build(set, cx, cz) {
      frame(set, cx - 6, Y, cz - 6, cx + 6, Y + 2, cz + 6, Block.Glass);
      // inner glass walls (simple cross maze)
      for (let x = cx - 4; x <= cx + 2; x++) for (let y = Y; y <= Y + 2; y++) set(x, y, cz - 2, Block.Glass);
      for (let x = cx - 2; x <= cx + 4; x++) for (let y = Y; y <= Y + 2; y++) set(x, y, cz + 2, Block.Glass);
      set(cx - 6, Y, cz, Block.Air); set(cx - 6, Y + 1, cz, Block.Air);
      set(cx, Y + 2, cz, Block.Lantern);
      seatPost(set, cx - 7, cz + 1);
    },
    ride: (cx, cz) => ({
      seat: [cx - 7, Y, cz + 1],
      path: [[cx - 7, Y, cz + 1], [cx - 5, Y, cz], [cx - 3, Y, cz - 4], [cx + 3, Y, cz - 4], [cx + 4, Y, cz],
        [cx - 3, Y, cz + 4], [cx + 5, Y, cz + 4], [cx + 5, Y, cz], [cx - 7, Y, cz + 1]],
      duration: 16,
    }),
  },
  {
    name: 'Balloon Ascent', dx: -14, dz: -62, r: 6,
    build(set, cx, cz) {
      box(set, cx - 2, G, cz - 2, cx + 2, G, cz + 2, Block.Concrete);
      // tethered balloon overhead
      disc(set, cx, Y + 16, cz, 3, Block.CanopyRed);
      disc(set, cx, Y + 17, cz, 3, Block.CanopyRed);
      disc(set, cx, Y + 18, cz, 2, Block.CanopyRed);
      pillar(set, cx, cz, Y + 13, 3, Block.Wood);
      seatPost(set, cx + 1, cz);
    },
    ride: (cx, cz) => ({
      seat: [cx + 1, Y, cz],
      path: [[cx + 1, Y, cz], [cx + 1, Y + 6, cz], [cx + 3, Y + 12, cz + 2], [cx - 2, Y + 13, cz - 1],
        [cx + 1, Y + 12, cz + 1], [cx + 1, Y + 5, cz], [cx + 1, Y, cz]],
      duration: 20,
    }),
  },
  {
    name: 'Bumper Arena', dx: 58, dz: 40, r: 8,
    build(set, cx, cz) {
      box(set, cx - 7, G, cz - 5, cx + 7, G, cz + 5, Block.Road);
      frame(set, cx - 7, Y, cz - 5, cx + 7, Y, cz + 5, Block.CanopyYellow);
      set(cx - 7, Y, cz, Block.Air);
      for (const [ox, oz] of [[-7, -5], [7, -5], [-7, 5], [7, 5]] as const) {
        pillar(set, cx + ox, cz + oz, Y, 4, Block.Wood);
        set(cx + ox, Y + 4, cz + oz, Block.Lantern);
      }
      seatPost(set, cx - 8, cz + 1);
    },
    ride: (cx, cz) => ({
      seat: [cx - 8, Y, cz + 1],
      path: [[cx - 8, Y, cz + 1], [cx - 4, Y, cz - 3], [cx + 3, Y, cz + 3], [cx + 5, Y, cz - 3],
        [cx - 2, Y, cz + 2], [cx - 5, Y, cz - 2], [cx + 4, Y, cz], [cx - 8, Y, cz + 1]],
      duration: 14,
    }),
  },
  {
    name: 'Teacup Twirl', dx: -40, dz: -16, r: 6,
    build(set, cx, cz) {
      disc(set, cx, G, cz, 5, Block.Concrete);
      for (let a = 0; a < 3; a++) {
        const t = (a / 3) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(t) * 3);
        const z = Math.round(cz + Math.sin(t) * 3);
        ringBlocks(set, x, Y, z, 1, Block.CanopyBlue);
      }
      seatPost(set, cx + 5, cz);
    },
    ride: (cx, cz) => {
      const pts: Vec3[] = [];
      for (let i = 0; i < 18; i++) {
        const t = (i / 18) * Math.PI * 2;
        const wob = Math.cos(t * 5) * 1.2;
        pts.push([cx + Math.cos(t) * (3 + wob), Y, cz + Math.sin(t) * (3 + wob)]);
      }
      return { seat: [cx + 5, Y, cz], path: pts, duration: 12, closed: true };
    },
  },
  // ---------- walk-in decor (no ride seat) ----------
  {
    name: 'Fountain Plaza', dx: 0, dz: 8, r: 7,
    build(set, cx, cz) {
      disc(set, cx, G, cz, 6, Block.Concrete);
      ringBlocks(set, cx, Y, cz, 4, Block.Sandstone);
      disc(set, cx, G, cz, 3, Block.Water);
      pillar(set, cx, cz, Y, 3, Block.Sandstone);
      set(cx, Y + 3, cz, Block.Water);
      set(cx, Y + 2, cz + 1, Block.Crystal);
      set(cx, Y + 2, cz - 1, Block.Crystal);
    },
  },
  {
    name: 'Carnival Game Tents', dx: 24, dz: 8, r: 8,
    build(set, cx, cz) {
      const colors = [Block.CanopyRed, Block.CanopyBlue, Block.CanopyYellow];
      for (let i = 0; i < 3; i++) {
        const x = cx + (i - 1) * 6;
        frame(set, x - 2, Y, cz - 2, x + 2, Y + 1, cz + 2, Block.Planks);
        set(x - 2, Y, cz, Block.Air); set(x - 2, Y + 1, cz, Block.Air);
        box(set, x - 2, Y + 2, cz - 2, x + 2, Y + 2, cz + 2, colors[i]);
        set(x, Y + 3, cz, colors[i]);
        set(x, Y + 1, cz, Block.Lantern);
      }
    },
  },
  {
    name: 'Food Court', dx: -24, dz: -4, r: 8,
    build(set, cx, cz) {
      for (let i = 0; i < 2; i++) {
        const z = cz + (i === 0 ? -3 : 3);
        box(set, cx - 5, Y, z - 1, cx + 5, Y, z + 1, Block.Planks);
        box(set, cx - 5, Y + 2, z - 1, cx + 5, Y + 2, z + 1, i === 0 ? Block.CanopyYellow : Block.CanopyRed);
        for (const ox of [-5, 5]) pillar(set, cx + ox, z - 1, Y, 2, Block.Wood);
        set(cx, Y + 1, z, Block.Lantern);
      }
    },
  },
];

// long coaster track with three hills
function cometTrack(cx: number, cz: number): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i < 28; i++) {
    const t = (i / 28) * Math.PI * 2;
    const r = 18 + Math.cos(t * 2) * 4;
    const h = 3 + Math.max(0, Math.sin(t * 3)) * 8;
    pts.push([cx + Math.cos(t) * r, Y + h, cz + Math.sin(t) * r]);
  }
  return pts;
}

// world-coord tree helper for decor (bypasses chunk-local placeTree limits)
function placeTreeWorld(set: SetFn, x: number, y: number, z: number, kind: 'oak' | 'palm'): void {
  const h = kind === 'palm' ? 6 : 4;
  for (let i = 0; i < h; i++) set(x, y + i, z, Block.Wood);
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]] as const) {
    set(x + dx, y + h, z + dz, Block.Leaves);
    if (kind === 'oak') set(x + dx, y + h - 1, z + dz, Block.Leaves);
  }
}

/** Ride seats + paths for the whole park (used by main.ts). */
export function themeParkRides(ctx: GenContext): ParkRide[] {
  const c = Math.floor(ctx.sizeBlocks / 2);
  const rides: ParkRide[] = [];
  for (const a of ATTRACTIONS) {
    if (!a.ride) continue;
    const cx = c + a.dx, cz = c + a.dz;
    if (cx - a.r < 1 || cz - a.r < 1 || cx + a.r >= ctx.sizeBlocks - 1 || cz + a.r >= ctx.sizeBlocks - 1) continue;
    rides.push({ name: a.name, ...a.ride(cx, cz) });
  }
  return rides;
}

export const themeParkGenerator: WorldGenerator = {
  type: 'themepark',
  name: 'Theme Park',
  waterLevel: -1,
  fillChunk(data, chunkX, chunkZ, ctx) {
    const ox = chunkX * CHUNK_SIZE, oz = chunkZ * CHUNK_SIZE;
    const c = Math.floor(ctx.sizeBlocks / 2);

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx, wz = oz + lz;
        const ax = Math.abs(wx - c), az = Math.abs(wz - c);
        // promenade cross + plaza ring paths
        const onPath = ax <= 2 || az <= 2 || Math.abs(Math.hypot(wx - c, wz - c) - 22) < 1.6
          || Math.abs(Math.hypot(wx - c, wz - c) - 56) < 1.6;
        fillColumn(data, lx, lz, PARK_GROUND, onPath ? Block.Sandstone : Block.Grass, Block.Dirt);
      }
    }

    // chunk-local world-coord setter for structure stamping
    const set: SetFn = (wx, y, wz, id) => {
      const lx = wx - ox, lz = wz - oz;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0) return;
      data[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = id;
    };

    for (const a of ATTRACTIONS) {
      const cx = c + a.dx, cz = c + a.dz;
      if (cx - a.r < 1 || cz - a.r < 1 || cx + a.r >= ctx.sizeBlocks - 1 || cz + a.r >= ctx.sizeBlocks - 1) continue;
      // skip if the attraction can't touch this chunk
      if (cx + a.r < ox || cx - a.r > ox + 15 || cz + a.r < oz || cz - a.r > oz + 15) continue;
      a.build(set, cx, cz);
    }

    // scattered park trees + lamp posts away from the center
    for (let lz = 2; lz < 14; lz++) {
      for (let lx = 2; lx < 14; lx++) {
        const wx = ox + lx, wz = oz + lz;
        const distC = Math.hypot(wx - c, wz - c);
        if (distC < 88 && distC > 16) {
          const r = hash3(wx, 0, wz, ctx.seed + 777);
          if (r > 0.997) placeTree(data, lx, PARK_GROUND + 1, lz, hash3(wx, 1, wz, ctx.seed));
          else if (r < 0.0012) {
            for (let y = 0; y < 3; y++) setBlockLocal(data, lx, PARK_GROUND + 1 + y, lz, Block.Wood);
            setBlockLocal(data, lx, PARK_GROUND + 4, lz, Block.Lantern);
          }
        }
      }
    }
  },
};

function setBlockLocal(data: Uint8Array, lx: number, y: number, lz: number, id: number): void {
  if (y < 0) return;
  data[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = id;
}
