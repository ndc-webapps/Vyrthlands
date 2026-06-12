import * as THREE from 'three';
import { RoleId } from '../roles';
import { buildAvatar, animateAvatar, AvatarRig } from '../playerModel';

/**
 * Live animated previews of the role avatars for menu buttons.
 * One tiny shared WebGL renderer draws each role's spinning, walking
 * avatar and blits the frame onto plain 2D canvases inside the buttons —
 * so any number of buttons can show moving previews with a single
 * extra GL context.
 */

const W = 96;
const H = 128;

interface Target {
  role: RoleId;
  ctx: CanvasRenderingContext2D;
}

export class RolePreviews {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private rigs = new Map<RoleId, AvatarRig>();
  private targets: Target[] = [];
  private spin = 0;
  private walkT = 0;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(W, H);
    this.renderer.setClearColor(0x000000, 0);
    this.camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 10);
    this.camera.position.set(0, 1.25, 3.6);
    this.camera.lookAt(0, 1.0, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
  }

  /** Mirror this role's animated avatar onto the given canvas. */
  attach(role: RoleId, canvas: HTMLCanvasElement): void {
    canvas.width = W;
    canvas.height = H;
    this.targets.push({ role, ctx: canvas.getContext('2d')! });
  }

  private rig(role: RoleId): AvatarRig {
    let r = this.rigs.get(role);
    if (!r) {
      r = buildAvatar(role);
      this.rigs.set(role, r);
    }
    return r;
  }

  /** Call every frame while a menu with previews is on screen. */
  update(dt: number): void {
    if (this.targets.length === 0) return;
    this.spin += dt * 0.9;
    this.walkT += dt * 4;
    const roles = [...new Set(this.targets.map((t) => t.role))];
    for (const role of roles) {
      const rig = this.rig(role);
      rig.group.rotation.y = this.spin;
      animateAvatar(rig, this.walkT, 3); // gentle walk-in-place
      this.scene.add(rig.group);
      this.renderer.render(this.scene, this.camera);
      this.scene.remove(rig.group);
      for (const t of this.targets) {
        if (t.role !== role) continue;
        t.ctx.clearRect(0, 0, W, H);
        t.ctx.drawImage(this.renderer.domElement, 0, 0, W, H);
      }
    }
  }
}
