import * as THREE from 'three';

/**
 * Cinematic hero diorama for the landing page: a slowly rotating voxel
 * floating island with glowing crystals, a tree, orbiting rocks, and
 * drifting motes — rendered live on a transparent canvas. All geometry
 * is plain boxes; the whole scene is a few hundred cubes.
 */

// deterministic hash so the island looks identical on every visit
function h2(x: number, z: number, salt: number): number {
  let h = (salt + 1) * 374761393 + x * 668265263 + z * 2147483423;
  h = (h ^ (h >>> 13)) >>> 0;
  return ((h * 1274126177) >>> 0) / 4294967295;
}

const GRASS = [0x6abe50, 0x5fae47, 0x74c958];
const DIRT = [0x86694a, 0x7a5f41];
const STONE = [0x888a94, 0x7b7d87, 0x6f717b];

export class HeroScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private island = new THREE.Group();
  private rocks: { mesh: THREE.Mesh; r: number; speed: number; y: number; phase: number }[] = [];
  private crystals: THREE.Mesh[] = [];
  private motes: THREE.Points;
  private moteSeeds: Float32Array;
  private t = 0;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.camera.position.set(0, 4.6, 15.5);
    this.camera.lookAt(0, 0.4, 0);

    this.scene.add(new THREE.AmbientLight(0x9fb4d8, 0.55));
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.25);
    sun.position.set(6, 10, 7);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x5eead4, 0.5);
    rim.position.set(-7, 2, -6);
    this.scene.add(rim);

    this.buildIsland();
    this.scene.add(this.island);

    // drifting motes (crystal dust)
    const N = 70;
    const pos = new Float32Array(N * 3);
    this.moteSeeds = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      this.moteSeeds[i * 2] = Math.random() * Math.PI * 2;
      this.moteSeeds[i * 2 + 1] = 4 + Math.random() * 7;
      pos[i * 3 + 1] = -3 + Math.random() * 8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x7df0ff, size: 0.09, transparent: true, opacity: 0.65,
      depthWrite: false, sizeAttenuation: true,
    }));
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);

    this.resize();
  }

  private box(x: number, y: number, z: number, color: number, s = 1): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, s),
      new THREE.MeshLambertMaterial({ color })
    );
    m.position.set(x, y, z);
    this.island.add(m);
    return m;
  }

  private buildIsland(): void {
    const R = 4;
    // grass top + dirt skirt + tapering stone underbelly
    for (let x = -R; x <= R; x++) {
      for (let z = -R; z <= R; z++) {
        const d = Math.hypot(x, z) + h2(x, z, 7) * 0.8;
        if (d > R + 0.4) continue;
        const pick = <T,>(arr: T[], salt: number) => arr[Math.floor(h2(x, z, salt) * arr.length)];
        this.box(x, 0, z, pick(GRASS, 1) as number);
        this.box(x, -1, z, pick(DIRT, 2) as number);
        const depth = Math.max(0, Math.round((R + 0.6 - d) * 1.6 + h2(x, z, 3) * 1.4));
        for (let y = 0; y < depth; y++) this.box(x, -2 - y, z, pick(STONE, 4 + y) as number);
      }
    }
    // tree
    for (let y = 1; y <= 3; y++) this.box(-2, y, -1, 0x7a5a36);
    for (const [dx, dy, dz] of [
      [-2, 4, -1], [-1, 4, -1], [-3, 4, -1], [-2, 4, 0], [-2, 4, -2],
      [-2, 5, -1], [-1, 3, -1], [-3, 3, -1], [-2, 3, 0], [-2, 3, -2],
    ] as const) {
      this.box(dx, dy, dz, h2(dx, dz, dy) > 0.5 ? 0x4f9e3e : 0x5cb84a);
    }
    // glowing sky crystals
    for (const [cx, cz, hgt] of [[2, 1, 1.6], [3, -1, 1.1], [1.4, 2.4, 0.8]] as const) {
      const c = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, hgt, 0.55),
        new THREE.MeshBasicMaterial({ color: 0x7df0ff })
      );
      c.position.set(cx, 1 + hgt / 2 - 0.4, cz);
      c.rotation.y = h2(cx, cz, 9) * 0.8;
      this.island.add(c);
      this.crystals.push(c);
      const glow = new THREE.PointLight(0x5eead4, 2.2, 5);
      glow.position.set(cx, 1.4, cz);
      this.island.add(glow);
    }
    // a torch-warm lantern on the far side
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshBasicMaterial({ color: 0xffd070 }));
    lamp.position.set(-0.5, 1.2, 2.8);
    this.island.add(lamp);

    // orbiting rocks
    for (let i = 0; i < 4; i++) {
      const s = 0.45 + h2(i, 3, 11) * 0.5;
      const rock = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshLambertMaterial({ color: STONE[i % STONE.length] })
      );
      this.island.add(rock);
      this.rocks.push({
        mesh: rock,
        r: 6.3 + i * 1.15,
        speed: 0.14 + h2(i, 5, 13) * 0.12,
        y: -1.5 + i * 1.3,
        phase: (i / 4) * Math.PI * 2,
      });
    }
  }

  resize(): void {
    const w = this.canvas.clientWidth || 560;
    const hgt = this.canvas.clientHeight || 520;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setSize(w * dpr, hgt * dpr, false);
    this.camera.aspect = w / hgt;
    this.camera.updateProjectionMatrix();
  }

  /** Call every frame while the landing page is visible. */
  update(dt: number): void {
    this.t += dt;
    this.island.rotation.y = this.t * 0.12;
    this.island.position.y = Math.sin(this.t * 0.55) * 0.28 + 0.2;
    for (const r of this.rocks) {
      const a = this.t * r.speed + r.phase;
      r.mesh.position.set(Math.cos(a) * r.r, r.y + Math.sin(this.t * 0.7 + r.phase) * 0.5, Math.sin(a) * r.r);
      r.mesh.rotation.y = a * 1.6;
      r.mesh.rotation.x = Math.sin(a) * 0.4;
    }
    const pulse = 0.75 + Math.sin(this.t * 2.2) * 0.25;
    for (const c of this.crystals) {
      (c.material as THREE.MeshBasicMaterial).color.setRGB(0.49 * pulse + 0.2, 0.94 * pulse, 1.0 * pulse);
    }
    // motes drift upward and wrap
    const pos = (this.motes.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < this.moteSeeds.length / 2; i++) {
      const a = this.moteSeeds[i * 2] + this.t * 0.1;
      const rad = this.moteSeeds[i * 2 + 1];
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 2] = Math.sin(a) * rad;
      pos[i * 3 + 1] += dt * 0.35;
      if (pos[i * 3 + 1] > 6) pos[i * 3 + 1] = -4;
    }
    (this.motes.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }
}
