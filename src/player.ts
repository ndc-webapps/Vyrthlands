import * as THREE from 'three';
import {
  GRAVITY, JUMP_SPEED, WALK_SPEED, FLY_SPEED,
  PLAYER_WIDTH, PLAYER_HEIGHT, EYE_HEIGHT, MOUSE_SENSITIVITY,
  WORLD_HEIGHT,
} from './config';
import { World } from './world/world';

export class Player {
  position = new THREE.Vector3(); // feet position (bottom center of AABB)
  velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  flying = false;
  onGround = false;
  speedMult = 1; // role/equipment movement modifier
  /** User look-sensitivity multiplier (settings slider, 0.2–2). */
  lookSens = 1;
  /** Analog move input from the touch joystick: forward + strafe in [-1, 1]. */
  touchMove = { f: 0, s: 0 };
  /** Joystick pushed to the rim = sprint (Bedrock-style). */
  touchSprint = false;
  /** True while actually sprint-moving this frame (hunger drain reads this). */
  sprinting = false;
  private fallPeakY = 0;     // highest Y while airborne
  private landedBlocks = 0;  // fall height of the most recent landing

  keys = new Set<string>();

  constructor(private world: World) {}

  spawn(x: number, z: number): void {
    const y = this.world.surfaceY(x, z);
    this.position.set(x + 0.5, Math.min(y, WORLD_HEIGHT - 4), z + 0.5);
    this.velocity.set(0, 0, 0);
    this.fallPeakY = this.position.y;
    this.landedBlocks = 0;
    this.yaw = Math.PI * 0.25;
    this.pitch = 0;
  }

  handleMouseMove(dx: number, dy: number): void {
    this.yaw -= dx * MOUSE_SENSITIVITY * this.lookSens;
    this.pitch -= dy * MOUSE_SENSITIVITY * this.lookSens;
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  lookDirection(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    return out;
  }

  eyePosition(out: THREE.Vector3): THREE.Vector3 {
    out.copy(this.position);
    out.y += EYE_HEIGHT;
    return out;
  }

  toggleFly(): void {
    this.flying = !this.flying;
    this.velocity.y = 0;
    this.fallPeakY = this.position.y;
  }

  /** Blocks fallen on the most recent landing; reading clears it. */
  consumeLanding(): number {
    const v = this.landedBlocks;
    this.landedBlocks = 0;
    return v;
  }

  update(dt: number): void {
    dt = Math.min(dt, 0.05); // avoid tunneling on tab-switch frames

    // wish direction in world space from yaw
    let fwd = this.touchMove.f, strafe = this.touchMove.s;
    if (this.keys.has('KeyW')) fwd += 1;
    if (this.keys.has('KeyS')) fwd -= 1;
    if (this.keys.has('KeyD')) strafe += 1;
    if (this.keys.has('KeyA')) strafe -= 1;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * fwd + cos * strafe;
    let wz = -cos * fwd - sin * strafe;
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; }

    if (this.flying) {
      const speed = FLY_SPEED;
      this.velocity.x = wx * speed;
      this.velocity.z = wz * speed;
      let vy = 0;
      if (this.keys.has('Space')) vy += speed;
      if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) vy -= speed;
      this.velocity.y = vy;
      this.sprinting = false;
    } else {
      // Shift also sprints — Ctrl+W/Ctrl+Space hit browser/OS shortcuts and
      // some keyboards can't report Ctrl+W+Space together (ghosting)
      const sprintKey = this.keys.has('ControlLeft') || this.keys.has('ControlRight')
        || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchSprint;
      const sprinting = sprintKey && fwd > 0;
      this.sprinting = sprinting && Math.hypot(this.velocity.x, this.velocity.z) > 3;
      const speed = WALK_SPEED * this.speedMult * (sprinting ? 1.35 : 1);
      // smooth horizontal accel
      const accel = this.onGround ? 14 : 5;
      this.velocity.x += (wx * speed - this.velocity.x) * Math.min(1, accel * dt);
      this.velocity.z += (wz * speed - this.velocity.z) * Math.min(1, accel * dt);
      this.velocity.y += GRAVITY * dt;
      if (this.keys.has('Space') && this.onGround) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
      }
    }

    this.moveWithCollision(dt);

    // safety net: fell out of world
    if (this.position.y < -20) {
      this.spawn(Math.floor(this.position.x), Math.floor(this.position.z));
    }
  }

  private collides(px: number, py: number, pz: number): boolean {
    const hw = PLAYER_WIDTH / 2;
    const minX = Math.floor(px - hw), maxX = Math.floor(px + hw);
    const minY = Math.floor(py), maxY = Math.floor(py + PLAYER_HEIGHT);
    const minZ = Math.floor(pz - hw), maxZ = Math.floor(pz + hw);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.world.isSolidAt(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  private moveWithCollision(dt: number): void {
    const p = this.position;
    // X axis
    let nx = p.x + this.velocity.x * dt;
    if (this.collides(nx, p.y, p.z)) {
      this.velocity.x = 0;
    } else {
      p.x = nx;
    }
    // Z axis
    let nz = p.z + this.velocity.z * dt;
    if (this.collides(p.x, p.y, nz)) {
      this.velocity.z = 0;
    } else {
      p.z = nz;
    }
    // Y axis
    let ny = p.y + this.velocity.y * dt;
    this.onGround = false;
    if (this.collides(p.x, ny, p.z)) {
      if (this.velocity.y < 0) {
        this.onGround = true;
        // record fall height for fall damage (ignored while flying)
        if (!this.flying) this.landedBlocks = Math.max(0, this.fallPeakY - p.y);
        this.fallPeakY = p.y;
      }
      this.velocity.y = 0;
    } else {
      p.y = ny;
      if (p.y > this.fallPeakY || this.onGround) this.fallPeakY = p.y;
    }
  }

  /** Would placing a block at these voxel coords overlap the player AABB? */
  overlapsBlock(bx: number, by: number, bz: number): boolean {
    const hw = PLAYER_WIDTH / 2;
    const p = this.position;
    return (
      bx + 1 > p.x - hw && bx < p.x + hw &&
      by + 1 > p.y && by < p.y + PLAYER_HEIGHT &&
      bz + 1 > p.z - hw && bz < p.z + hw
    );
  }
}
