import * as THREE from 'three';
import { DAY_LENGTH_SECONDS, CHUNK_SIZE } from './config';
import { WorldType } from './world/generators';

interface Theme {
  day: number;   // sky color at noon
  dusk: number;
  night: number;
  cloudCount: number;
}

const THEMES: Record<WorldType, Theme> = {
  flat: { day: 0x7ec8f5, dusk: 0xf2a06b, night: 0x0d1430, cloudCount: 12 },
  natural: { day: 0x7ec8f5, dusk: 0xf2a06b, night: 0x0d1430, cloudCount: 14 },
  prehistoric: { day: 0x87c67a, dusk: 0xd98a55, night: 0x101f18, cloudCount: 18 },
  battlefront: { day: 0x9a9b8a, dusk: 0xb06b52, night: 0x141617, cloudCount: 9 },
  zombie: { day: 0x8e998b, dusk: 0x8a5d58, night: 0x101412, cloudCount: 13 },
  medieval: { day: 0x8fcf9a, dusk: 0xd88b61, night: 0x11192b, cloudCount: 14 },
  cyberpunk: { day: 0x7b8fa8, dusk: 0xc05aa0, night: 0x08091b, cloudCount: 8 },
  alien: { day: 0xa2a06d, dusk: 0xd07080, night: 0x171128, cloudCount: 10 },
  skyislands: { day: 0x93d8ff, dusk: 0xf0a070, night: 0x0d1533, cloudCount: 24 },
  underworld: { day: 0x5a2820, dusk: 0x902a1a, night: 0x090606, cloudCount: 3 },
  frozen: { day: 0xb8def2, dusk: 0xb88aa8, night: 0x0b1630, cloudCount: 18 },
  pirate: { day: 0x7ec8d8, dusk: 0xf2a06b, night: 0x0b1830, cloudCount: 12 },
  haunted: { day: 0x7c897d, dusk: 0x70506a, night: 0x080a12, cloudCount: 16 },
  wasteland: { day: 0xa69474, dusk: 0xb06b4a, night: 0x14100c, cloudCount: 7 },
  mythology: { day: 0xd0bc86, dusk: 0xd88d5a, night: 0x171228, cloudCount: 10 },
};

/** Sky color, sun + sky lighting, fog, drifting clouds, day-night cycle. */
export class Environment {
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private clouds: THREE.Group;
  private time = 0.3; // 0..1 day fraction, start mid-morning
  private theme: Theme = THEMES.natural;

  private dayTop = new THREE.Color();
  private duskTop = new THREE.Color();
  private nightTop = new THREE.Color();
  private skyColor = new THREE.Color();
  private cloudSpread = 200;

  constructor(private scene: THREE.Scene) {
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a4a36, 0.65);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff4dd, 1.0);
    this.sun.position.set(60, 120, 40);
    scene.add(this.sun);

    scene.fog = new THREE.Fog(0x7ec8f5, 60, 170);

    this.clouds = new THREE.Group();
    scene.add(this.clouds);
  }

  /** Configure sky palette and fog for the active world. */
  setup(type: WorldType, renderDistanceChunks: number): void {
    this.theme = THEMES[type];
    this.dayTop.setHex(this.theme.day);
    this.duskTop.setHex(this.theme.dusk);
    this.nightTop.setHex(this.theme.night);

    const far = renderDistanceChunks * CHUNK_SIZE;
    this.scene.fog = new THREE.Fog(this.theme.day, far * 0.45, far * 0.98);
    this.cloudSpread = far * 2;

    // rebuild clouds
    this.clouds.clear();
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, fog: false,
    });
    for (let i = 0; i < this.theme.cloudCount; i++) {
      const w = 12 + Math.random() * 22;
      const d = 8 + Math.random() * 14;
      const cloud = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), cloudMat);
      cloud.position.set(
        (Math.random() - 0.5) * this.cloudSpread,
        88 + Math.random() * 10,
        (Math.random() - 0.5) * this.cloudSpread
      );
      this.clouds.add(cloud);
    }
  }

  getTime(): number { return this.time; }
  setTime(t: number): void { this.time = ((t % 1) + 1) % 1; }
  /** Night = sun below the daylight band. */
  isNight(): boolean {
    return Math.max(0, Math.sin(this.time * Math.PI * 2 - Math.PI * 0.1)) < 0.08;
  }
  skipToMorning(): void { this.time = 0.3; }

  update(dt: number, playerX: number, playerZ: number): void {
    this.time = (this.time + dt / DAY_LENGTH_SECONDS) % 1;
    const t = this.time;

    // daylight factor: 1 at noon-ish, 0 at night
    const daylight = Math.max(0, Math.sin(t * Math.PI * 2 - Math.PI * 0.1));
    const dusk = Math.max(0, 1 - Math.abs(daylight - 0.18) * 6); // warm band at sunrise/sunset

    this.skyColor.copy(this.nightTop).lerp(this.dayTop, daylight);
    this.skyColor.lerp(this.duskTop, dusk * 0.5);
    this.scene.background = this.skyColor;
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(this.skyColor);

    this.sun.intensity = 0.15 + daylight * 1.1;
    this.hemi.intensity = 0.25 + daylight * 0.45;
    const angle = t * Math.PI * 2;
    this.sun.position.set(
      playerX + Math.cos(angle) * 100,
      Math.sin(angle) * 120 + 20,
      playerZ + 40
    );
    this.sun.target.position.set(playerX, 0, playerZ);
    this.sun.target.updateMatrixWorld();

    // clouds drift and wrap around the player
    const half = this.cloudSpread / 2;
    for (const cloud of this.clouds.children) {
      cloud.position.x += dt * 1.4;
      if (cloud.position.x > playerX + half) cloud.position.x -= this.cloudSpread;
      if (cloud.position.x < playerX - half) cloud.position.x += this.cloudSpread;
      if (cloud.position.z > playerZ + half) cloud.position.z -= this.cloudSpread;
      if (cloud.position.z < playerZ - half) cloud.position.z += this.cloudSpread;
    }
  }
}
