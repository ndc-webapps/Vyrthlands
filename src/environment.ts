import * as THREE from 'three';
import { DAY_LENGTH_SECONDS, WORLD_SIZE_X, WORLD_SIZE_Z } from './config';

/** Sky color, sun light, fog, drifting clouds, day-night cycle. */
export class Environment {
  private sun: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private clouds: THREE.Group;
  private time = 0.3; // 0..1 day fraction, start mid-morning

  private dayTop = new THREE.Color(0x7ec8f5);
  private duskTop = new THREE.Color(0xf2a06b);
  private nightTop = new THREE.Color(0x0d1430);
  private skyColor = new THREE.Color();

  constructor(private scene: THREE.Scene) {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xfff4dd, 1.0);
    this.sun.position.set(60, 120, 40);
    scene.add(this.sun);

    scene.fog = new THREE.Fog(0x7ec8f5, 60, 170);

    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false,
    });
    for (let i = 0; i < 14; i++) {
      const w = 10 + Math.random() * 18;
      const d = 6 + Math.random() * 12;
      const cloud = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), cloudMat);
      cloud.position.set(
        Math.random() * WORLD_SIZE_X,
        66 + Math.random() * 8,
        Math.random() * WORLD_SIZE_Z
      );
      this.clouds.add(cloud);
    }
    scene.add(this.clouds);
  }

  update(dt: number): void {
    this.time = (this.time + dt / DAY_LENGTH_SECONDS) % 1;
    const t = this.time;

    // daylight factor: 1 at noon-ish, 0 at night
    const daylight = Math.max(0, Math.sin(t * Math.PI * 2 - Math.PI * 0.1));
    const dusk = Math.max(0, 1 - Math.abs(daylight - 0.18) * 6); // warm band at sunrise/sunset

    this.skyColor.copy(this.nightTop).lerp(this.dayTop, daylight);
    this.skyColor.lerp(this.duskTop, dusk * 0.5);
    this.scene.background = this.skyColor;
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(this.skyColor);

    this.sun.intensity = 0.15 + daylight * 1.0;
    this.ambient.intensity = 0.3 + daylight * 0.35;
    const angle = t * Math.PI * 2;
    this.sun.position.set(Math.cos(angle) * 100, Math.sin(angle) * 120 + 20, 40);

    // clouds drift and wrap
    for (const cloud of this.clouds.children) {
      cloud.position.x += dt * 1.2;
      if (cloud.position.x > WORLD_SIZE_X + 20) cloud.position.x = -20;
    }
  }
}
