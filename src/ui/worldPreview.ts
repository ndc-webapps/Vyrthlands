import * as THREE from 'three';

/**
 * Live 3D voxel mini-dioramas for the landing world cards — one tiny
 * themed scene per realm (dino, ruined wall, castle tower, neon towers,
 * floating island, carousel). One shared WebGL renderer draws each
 * scene and blits it onto the per-card 2D canvases, like RolePreviews.
 */

const W = 320;
const H = 200;

type Builder = (g: THREE.Group) => ((t: number) => void) | void;

function box(g: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, color: number, glow = false): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color })
  );
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

// ---------- per-world scene builders ----------
const BUILDERS: Record<string, Builder> = {
  prehistoric(g) {
    box(g, 0, -0.95, 0, 5, 0.5, 3, 0x3f6b34);            // jungle ground
    const dino = new THREE.Group();
    box(dino, 0, 0.2, 0, 1.5, 0.9, 0.7, 0x6a8a3a);       // body
    box(dino, 0.9, 0.7, 0, 0.5, 0.9, 0.45, 0x6a8a3a);    // neck
    box(dino, 1.15, 1.15, 0, 0.6, 0.5, 0.5, 0x5f7e34);   // head
    box(dino, 1.42, 1.12, 0.12, 0.2, 0.12, 0.12, 0xffd070, true); // eye
    box(dino, -0.95, 0.45, 0, 0.8, 0.35, 0.35, 0x5f7e34);// tail
    box(dino, -1.4, 0.6, 0, 0.4, 0.25, 0.25, 0x5f7e34);  // tail tip
    box(dino, 0.35, -0.45, 0.22, 0.28, 0.7, 0.28, 0x577330);
    box(dino, 0.35, -0.45, -0.22, 0.28, 0.7, 0.28, 0x577330);
    box(dino, -0.4, -0.45, 0.22, 0.28, 0.7, 0.28, 0x577330);
    box(dino, -0.4, -0.45, -0.22, 0.28, 0.7, 0.28, 0x577330);
    box(dino, 0, 0.7, 0.4, 0.2, 0.4, 0.1, 0x7aa048);     // back plate
    box(dino, -0.4, 0.75, 0.4, 0.2, 0.45, 0.1, 0x7aa048);
    g.add(dino);
    box(g, -1.7, -0.2, 0.6, 0.4, 1.1, 0.4, 0xffb030, true); // amber crystal
  },
  zombie(g) {
    box(g, 0, -0.95, 0, 5, 0.5, 3, 0x4a4438);            // cracked dirt
    // broken brick wall with a gap
    for (const [bx, by] of [[-1.6, -0.3], [-1.6, 0.3], [-1.0, -0.3], [-1.0, 0.3], [-1.0, 0.9], [1.4, -0.3], [1.4, 0.3], [1.4, 0.9], [2.0, -0.3]] as const) {
      box(g, bx, by, -0.4, 0.55, 0.55, 0.5, (bx + by) % 1 ? 0x6a6258 : 0x5a5248);
    }
    // zombie
    const z = new THREE.Group();
    box(z, 0, 0.1, 0.4, 0.7, 1.0, 0.45, 0x4b6a45);       // torso
    box(z, 0, 0.95, 0.4, 0.55, 0.55, 0.5, 0x5f7a4a);     // head
    box(z, 0.16, 1.0, 0.66, 0.12, 0.12, 0.05, 0xb8ff7a, true);
    box(z, -0.16, 1.0, 0.66, 0.12, 0.12, 0.05, 0xb8ff7a, true);
    box(z, 0, 0.35, 0.85, 0.7, 0.25, 0.3, 0x3a513a);     // arms forward
    box(z, 0.18, -0.7, 0.4, 0.28, 0.7, 0.3, 0x39513a);
    box(z, -0.18, -0.7, 0.4, 0.28, 0.7, 0.3, 0x39513a);
    g.add(z);
  },
  medieval(g) {
    box(g, 0, -0.95, 0, 5, 0.5, 3, 0x4a5942);            // grass
    box(g, 0, 0.1, 0, 1.5, 2.4, 1.5, 0x8a8f98);          // tower
    box(g, 0, 0.1, 0, 1.55, 2.0, 0.5, 0x7b8088);         // stone seam
    // battlements
    for (const bx of [-0.55, 0, 0.55]) for (const bz of [-0.55, 0.55]) box(g, bx, 1.45, bz, 0.35, 0.4, 0.35, 0x9aa0a8);
    box(g, 0.0, 0.0, 0.78, 0.5, 0.9, 0.1, 0x3a2a1a);     // door
    box(g, 0, 1.9, 0, 0.12, 0.9, 0.12, 0x6a5436);        // flagpole
    box(g, 0.45, 2.15, 0, 0.7, 0.4, 0.06, 0xc83a3a);     // red flag
  },
  cyberpunk(g) {
    box(g, 0, -0.95, 0, 5, 0.5, 3, 0x10141c);            // wet street
    const towers: [number, number, number][] = [[-1.3, 2.6, 0.9], [0, 3.4, 0.95], [1.35, 2.2, 0.85]];
    for (const [tx, th, tw] of towers) {
      box(g, tx, th / 2 - 0.7, -0.2, tw, th, tw, 0x1c2330);
      for (let yy = 0; yy < th - 0.6; yy += 0.45) {
        box(g, tx, yy - 0.5, -0.2 + tw / 2, tw * 0.7, 0.16, 0.02, yy % 0.9 < 0.45 ? 0x40f0ff : 0xff50d0, true);
      }
    }
    box(g, 0.2, 1.4, 1.4, 1.2, 0.5, 0.05, 0xff50d0, true); // floating sign
  },
  skyislands(g) {
    const isle = new THREE.Group();
    box(isle, 0, 0, 0, 2.4, 0.5, 2.0, 0x6abe50);         // grass top
    box(isle, 0, -0.5, 0, 2.0, 0.5, 1.6, 0x86694a);      // dirt
    box(isle, 0, -1.0, 0, 1.3, 0.6, 1.0, 0x7b7d87);      // stone
    box(isle, 0, -1.5, 0, 0.6, 0.6, 0.5, 0x6f717b);      // tip
    box(isle, 0.6, 0.6, 0.3, 0.4, 1.1, 0.4, 0x7df0ff, true); // crystal
    box(isle, -0.5, 0.45, -0.4, 0.3, 0.8, 0.3, 0x7df0ff, true);
    box(isle, -0.7, 0.55, 0.4, 0.25, 0.7, 0.25, 0x7a5a36); // tree trunk
    box(isle, -0.7, 1.05, 0.4, 0.7, 0.5, 0.7, 0x4f9e3e);   // leaves
    g.add(isle);
    isle.position.y = 0.2;
  },
  themepark(g) {
    box(g, 0, -1.2, 0, 5, 0.5, 3, 0x2c5a3a);             // park lawn
    box(g, -1.3, -0.4, 0, 0.16, 1.4, 0.16, 0x9aa0a8);    // legs
    box(g, 1.3, -0.4, 0, 0.16, 1.4, 0.16, 0x9aa0a8);
    const wheel = new THREE.Group();
    wheel.position.set(0, 0.45, 0);
    const cabinColors = [0xe13c46, 0x3c78e6, 0xf0be32, 0x46c87a, 0xc864e6, 0xff8c50, 0x40e0f0, 0xf06aa0];
    const R = 1.35;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sx = Math.cos(a) * R, sy = Math.sin(a) * R;
      box(wheel, sx, sy, 0, 0.12, 0.12, 0.12, 0xcfd6de);          // rim node
      box(wheel, sx * 0.5, sy * 0.5, 0, 0.06, R, 0.06, 0xb0b8c2).rotation.z = -a + Math.PI / 2; // spoke
      box(wheel, sx, sy, 0.18, 0.34, 0.34, 0.2, cabinColors[i]);  // cabin
    }
    box(wheel, 0, 0, 0, 0.24, 0.24, 0.3, 0xffd070, true);          // hub
    g.add(wheel);
    return (t: number) => { wheel.rotation.z = t * 0.6; };
  },
};

interface Scene {
  group: THREE.Group;
  animate?: (t: number) => void;
}

export class WorldPreviews {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private scenes = new Map<string, Scene>();
  private targets: { world: string; ctx: CanvasRenderingContext2D }[] = [];
  private t = 0;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(W, H);
    this.renderer.setClearColor(0x000000, 0);
    this.camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 50);
    this.camera.position.set(3.4, 2.4, 5.4);
    this.camera.lookAt(0, 0.1, 0);
    this.scene.add(new THREE.AmbientLight(0x9fb4d8, 0.7));
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.15);
    sun.position.set(4, 6, 5);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x5eead4, 0.45);
    rim.position.set(-5, 1, -4);
    this.scene.add(rim);
  }

  attach(world: string, canvas: HTMLCanvasElement): void {
    if (!BUILDERS[world]) return;
    canvas.width = W;
    canvas.height = H;
    this.targets.push({ world, ctx: canvas.getContext('2d')! });
  }

  private sceneFor(world: string): Scene {
    let s = this.scenes.get(world);
    if (!s) {
      const group = new THREE.Group();
      const animate = BUILDERS[world](group) ?? undefined;
      s = { group, animate: animate || undefined };
      this.scenes.set(world, s);
    }
    return s;
  }

  update(dt: number): void {
    if (this.targets.length === 0) return;
    this.t += dt;
    const worlds = [...new Set(this.targets.map((t) => t.world))];
    for (const world of worlds) {
      const s = this.sceneFor(world);
      s.group.rotation.y = Math.sin(this.t * 0.25) * 0.5 + 0.2; // gentle sway, not full spin
      s.animate?.(this.t);
      this.scene.add(s.group);
      this.renderer.render(this.scene, this.camera);
      this.scene.remove(s.group);
      for (const t of this.targets) {
        if (t.world !== world) continue;
        t.ctx.clearRect(0, 0, W, H);
        t.ctx.drawImage(this.renderer.domElement, 0, 0, W, H);
      }
    }
  }
}
