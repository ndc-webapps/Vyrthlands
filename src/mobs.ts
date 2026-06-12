import * as THREE from 'three';
import { World } from './world/world';
import { Item } from './items';
import { buildModel, Rig, BASE_HIT } from './enemies/models';
import { EnemyDef, WorldEnemies, enemiesForWorld } from './enemies/registry';
import { ProjectileManager } from './projectiles';

const DESPAWN_DIST = 64;
const ALERT_RADIUS = 22;

export class Mob {
  pos: THREE.Vector3;
  vel = new THREE.Vector3();
  /** Network identity for multiplayer sync. */
  id = 0;
  defIndex = 0;
  /** Follower mode: interpolation target from the leader's snapshot. */
  netPos: THREE.Vector3 | null = null;
  netYaw = 0;
  health: number;
  maxHealth: number;
  hurtT = 0;
  slowT = 0;        // frost/cc slow
  attackCd = 0;
  lungeT = 0;       // attack animation timer
  onGround = false;
  aggro = false;
  provoked = false;
  hitW: number;
  hitH: number;
  group: THREE.Group;
  rig: Rig;
  // behavior state
  phase = Math.random() * Math.PI * 2;
  wanderT = 0;
  wanderDir = new THREE.Vector3();
  patrolDir = Math.random() * Math.PI * 2;
  patrolT = 3 + Math.random() * 3;
  circleA = Math.random() * Math.PI * 2;
  swoopT = 4 + Math.random() * 4;
  swooping = 0;

  constructor(x: number, y: number, z: number, public def: EnemyDef) {
    this.pos = new THREE.Vector3(x, y, z);
    this.health = def.health;
    this.maxHealth = def.health;
    const built = buildModel(def.model, def.scale);
    this.group = built.group;
    this.rig = built.rig;
    const [bw, bh] = BASE_HIT[def.model.kind];
    this.hitW = Math.min(1.8, bw * def.scale);
    this.hitH = Math.min(3.6, bh * def.scale);
  }

  get airborne(): boolean {
    const k = this.def.model.kind;
    return k === 'drone' || k === 'flyer' || k === 'ghost';
  }

  center(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.pos).add(_up.set(0, this.hitH * 0.55, 0));
  }

  flash(): void {
    for (const m of this.rig.flashMats) {
      if (this.hurtT > 0) m.color.setHex(0xb03048);
      else {
        m.color.setHex(this.def.model.body);
        // accent mat back to accent color
      }
    }
    if (this.hurtT <= 0) {
      this.rig.flashMats[0].color.setHex(this.def.model.body);
      this.rig.flashMats[1].color.setHex(this.def.model.accent);
    }
  }

  /** Walk-cycle / hover animation, driven each frame by the manager. */
  animate(dt: number, now: number): void {
    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.phase += dt * (2.5 + moving * 2.4);
    const stride = Math.sin(this.phase) * Math.min(1, moving / 1.4) * 0.55;
    this.rig.legs.forEach((l, i) => { l.rotation.x = i % 2 === 0 ? stride : -stride; });
    if (!this.rig.armsForward) {
      this.rig.arms.forEach((a, i) => {
        const base = a.rotation.x; // keep rifle pose etc.
        if (Math.abs(base) < 1) a.rotation.x = (i % 2 === 0 ? -stride : stride) * 0.8;
      });
    } else {
      this.rig.arms.forEach((a) => { a.rotation.x = -1.35 + Math.sin(this.phase) * 0.12; });
    }
    for (let i = 0; i < this.rig.wings.length; i++) {
      const w = this.rig.wings[i];
      if (this.def.model.kind === 'drone') w.rotation.y = now / 40;
      else w.rotation.z = (i === 0 ? 1 : -1) * Math.sin(now / 90) * 0.55;
    }
    if (this.rig.tail) this.rig.tail.rotation.y = Math.sin(this.phase * 0.7) * 0.25;
    if (this.rig.head) this.rig.head.rotation.y = Math.sin(now / 900 + this.phase) * 0.15;

    // group placement: bob for hovering kinds, lunge tilt while attacking
    this.group.position.copy(this.pos);
    if (this.airborne) this.group.position.y += Math.sin(now / 320 + this.phase) * 0.12;
    else this.group.position.y += Math.sin(now / 250 + this.phase) * 0.02;
    const lean = (this.rig.lean && moving > 0.8 ? 0.32 : 0) + this.lungeT * 1.2;
    this.group.rotation.x = -lean;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

const _up = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _shootDir = new THREE.Vector3();

/**
 * Per-world enemy spawning + behavior AI.
 * Behaviors: chase, swarm, pack, ambush, ranged, patrol, fly, turret,
 * roam (passive; flees or retaliates), flee, boss.
 * Survival mode only; mobs are not persisted in saves.
 */
export class MobManager {
  mobs: Mob[] = [];
  private group = new THREE.Group();
  private spawnCd = 0;
  private world_: WorldEnemies = enemiesForWorld('natural');
  private nextId = 1;

  /** Follower mode: mobs are mirrored from the leader's snapshots. */
  remote = false;
  /** Other players in the server (multiplayer targeting). */
  targets: { name: string; pos: THREE.Vector3 }[] = [];

  onDeath: ((pos: THREE.Vector3, loot: Item) => void) | null = null;
  onPlayerHit: ((dmg: number) => void) | null = null;
  /** Leader: one of my mobs hit another player (relay over the network). */
  onRemoteHit: ((name: string, dmg: number) => void) | null = null;
  /** Follower: I damaged a mirrored mob; forward to the leader. */
  onForwardHit: ((id: number, dmg: number, kx: number, kz: number) => void) | null = null;
  /** Leader: a mob fired a projectile (replicate to followers). */
  onHostileShot: ((x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, dmg: number, color: number) => void) | null = null;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  setWorld(worldType: string): void {
    this.world_ = enemiesForWorld(worldType);
    this.clear();
  }

  /** Route mob damage to the right player (local callback or network relay). */
  private hitTarget(name: string, dmg: number): void {
    if (name === '') this.onPlayerHit?.(dmg);
    else this.onRemoteHit?.(name, dmg);
  }

  update(dt: number, world: World, playerPos: THREE.Vector3, isNight: boolean, projectiles: ProjectileManager): void {
    this.trySpawn(dt, world, playerPos, isNight);
    const now = performance.now();
    // every player in the realm is a valid target; '' = the local player
    const candidates: { name: string; pos: THREE.Vector3 }[] =
      [{ name: '', pos: playerPos }, ...this.targets];

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      m.hurtT -= dt;
      m.slowT = Math.max(0, m.slowT - dt);
      m.attackCd -= dt;
      m.lungeT = Math.max(0, m.lungeT - dt * 3);
      m.flash();

      // chase whoever is closest
      let tgt = candidates[0];
      let dist = m.pos.distanceTo(tgt.pos);
      for (let c = 1; c < candidates.length; c++) {
        const d = m.pos.distanceTo(candidates[c].pos);
        if (d < dist) { dist = d; tgt = candidates[c]; }
      }

      // despawn: too far from every player, or a night-only mob lingering in daylight
      const wrongTime = (m.def.spawnTime === 'night' && !isNight) || (m.def.spawnTime === 'day' && isNight);
      if (dist > DESPAWN_DIST || (wrongTime && Math.random() < dt * 0.4)) {
        this.remove(i);
        continue;
      }

      this.steer(m, dt, world, tgt, isNight, projectiles, dist);

      if (!m.airborne) m.vel.y -= 26 * dt;
      this.moveMob(m, dt, world);

      // melee touch damage (ranged mobs handled in steer)
      if (!m.def.projectileColor && m.def.damage > 0) {
        const reach = Math.max(1.1, m.def.attackRange * m.def.scale);
        if (dist < reach && m.attackCd <= 0 && (m.aggro || m.provoked)) {
          m.attackCd = m.def.behavior === 'boss' ? 1.4 : 0.9;
          m.lungeT = 0.3;
          this.hitTarget(tgt.name, m.def.damage);
        }
      }

      m.animate(dt, now);
      if (m.pos.y < -10) this.remove(i);
    }
  }

  // ---------- multiplayer sync ----------
  byId(id: number): Mob | null {
    return this.mobs.find((m) => m.id === id) ?? null;
  }

  /** Leader: compact wire state of every mob. */
  snapshot(): import('./net').MobSnap[] {
    return this.mobs.map((m) => ({
      i: m.id, d: m.defIndex,
      x: Math.round(m.pos.x * 100) / 100,
      y: Math.round(m.pos.y * 100) / 100,
      z: Math.round(m.pos.z * 100) / 100,
      ry: Math.round(m.group.rotation.y * 100) / 100,
      h: Math.round(m.health * 10) / 10,
      a: m.aggro ? 1 : 0,
    }));
  }

  /** Follower: mirror the leader's snapshot (create/update/remove). */
  applySnapshot(snaps: import('./net').MobSnap[]): void {
    const seen = new Set<number>();
    for (const s of snaps) {
      seen.add(s.i);
      let m = this.byId(s.i);
      if (!m) {
        const def = this.world_.defs[s.d];
        if (!def) continue;
        m = new Mob(s.x, s.y, s.z, def);
        m.id = s.i;
        m.defIndex = s.d;
        this.group.add(m.group);
        this.mobs.push(m);
      }
      if (!m.netPos) m.netPos = new THREE.Vector3();
      m.netPos.set(s.x, s.y, s.z);
      m.netYaw = s.ry;
      if (s.h < m.health) m.hurtT = 0.18; // flash on damage we observe
      m.health = s.h;
      m.aggro = s.a === 1;
    }
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      if (!seen.has(this.mobs[i].id)) this.remove(i);
    }
  }

  /** Follower per-frame: interpolate toward the snapshot and animate. */
  remoteUpdate(dt: number): void {
    const now = performance.now();
    for (const m of this.mobs) {
      m.hurtT -= dt;
      m.lungeT = Math.max(0, m.lungeT - dt * 3);
      m.flash();
      if (m.netPos) {
        // velocity estimate drives the walk cycle
        m.vel.set((m.netPos.x - m.pos.x) / 0.3, 0, (m.netPos.z - m.pos.z) / 0.3);
        m.pos.lerp(m.netPos, Math.min(1, 10 * dt));
        let d = m.netYaw - m.group.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        m.group.rotation.y += d * Math.min(1, 10 * dt);
      }
      m.animate(dt, now);
    }
  }

  /** Promotion to leader (previous leader left): own the mirrored mobs. */
  becomeLeader(): void {
    this.remote = false;
    let maxId = 0;
    for (const m of this.mobs) {
      m.netPos = null;
      maxId = Math.max(maxId, m.id);
    }
    this.nextId = maxId + 1;
  }

  // ---------- behavior steering ----------
  private steer(m: Mob, dt: number, world: World, tgt: { name: string; pos: THREE.Vector3 }, isNight: boolean, projectiles: ProjectileManager, dist: number): void {
    const playerPos = tgt.pos;
    const d = m.def;
    let detect = d.detectRange;
    if (isNight && d.behavior !== 'roam' && d.behavior !== 'flee') detect *= 1.3;

    // aggro is sticky until the player escapes well past detect range
    if (dist < detect) m.aggro = m.aggro || this.canAggro(m, dist, detect);
    else if (dist > detect * 1.8) m.aggro = false;
    if (m.provoked) m.aggro = true;

    // screamers/scouts wake everyone nearby
    if (d.alerts && m.aggro) {
      for (const other of this.mobs) {
        if (other !== m && other.pos.distanceTo(m.pos) < ALERT_RADIUS) other.aggro = true;
      }
    }

    const speed = (m.slowT > 0 ? 0.45 : 1) * d.speed;
    switch (d.behavior) {
      case 'roam':
        if (m.provoked) {
          if (d.chargeOnHit) this.seek(m, playerPos, speed * 1.3, dt);
          else this.fleeFrom(m, playerPos, speed * 1.4, dt, dist);
        } else this.wander(m, speed * 0.45, dt);
        break;
      case 'flee':
        if (dist < 10 || m.provoked) this.fleeFrom(m, playerPos, speed * 1.3, dt, dist);
        else this.wander(m, speed * 0.4, dt);
        break;
      case 'ambush':
        if (m.aggro) this.seek(m, playerPos, speed * 1.35, dt);
        else this.idle(m); // lurk motionless
        break;
      case 'ranged':
      case 'turret':
        this.rangedBrain(m, dt, playerPos, projectiles, dist, speed, d.behavior === 'turret');
        break;
      case 'patrol':
        if (m.aggro) {
          if (d.projectileColor) this.rangedBrain(m, dt, playerPos, projectiles, dist, speed, false);
          else this.seek(m, playerPos, speed, dt);
        } else this.patrolWalk(m, speed * 0.6, dt);
        break;
      case 'fly':
        this.flyBrain(m, dt, world, tgt, projectiles, dist, speed);
        break;
      case 'pack':
      case 'swarm':
      case 'chase':
      case 'boss':
      default:
        if (m.aggro) this.seek(m, playerPos, speed, dt);
        else this.wander(m, speed * 0.35, dt);
        break;
    }

    // ghosts drift vertically toward the player too
    if (d.model.kind === 'ghost' && m.aggro) {
      m.vel.y += ((playerPos.y + 1.2 - m.pos.y) * 0.8 - m.vel.y) * Math.min(1, 3 * dt);
    } else if (d.model.kind === 'ghost') {
      m.vel.y *= 0.9;
    }
  }

  private canAggro(m: Mob, dist: number, detect: number): boolean {
    const b = m.def.behavior;
    if (b === 'roam' || b === 'flee') return false;
    if (b === 'ambush') return dist < detect * 0.5;
    return true;
  }

  private seek(m: Mob, target: THREE.Vector3, speed: number, dt: number): void {
    const dx = target.x - m.pos.x;
    const dz = target.z - m.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    m.vel.x += (dx / len * speed - m.vel.x) * Math.min(1, 8 * dt);
    m.vel.z += (dz / len * speed - m.vel.z) * Math.min(1, 8 * dt);
    m.group.rotation.y = Math.atan2(-dx, -dz);
  }

  private fleeFrom(m: Mob, threat: THREE.Vector3, speed: number, dt: number, dist: number): void {
    if (dist > 18) { m.provoked = false; this.wander(m, speed * 0.4, dt); return; }
    _tmp.set(m.pos.x - threat.x, 0, m.pos.z - threat.z).normalize();
    m.vel.x += (_tmp.x * speed - m.vel.x) * Math.min(1, 8 * dt);
    m.vel.z += (_tmp.z * speed - m.vel.z) * Math.min(1, 8 * dt);
    m.group.rotation.y = Math.atan2(-_tmp.x, -_tmp.z) + Math.PI;
  }

  private wander(m: Mob, speed: number, dt: number): void {
    m.wanderT -= dt;
    if (m.wanderT <= 0) {
      m.wanderT = 2 + Math.random() * 3;
      const a = Math.random() * Math.PI * 2;
      // sometimes stand still
      m.wanderDir.set(Math.random() < 0.3 ? 0 : Math.cos(a), 0, Math.random() < 0.3 ? 0 : Math.sin(a));
    }
    m.vel.x += (m.wanderDir.x * speed - m.vel.x) * Math.min(1, 4 * dt);
    m.vel.z += (m.wanderDir.z * speed - m.vel.z) * Math.min(1, 4 * dt);
    if (m.wanderDir.lengthSq() > 0.01) m.group.rotation.y = Math.atan2(-m.wanderDir.x, -m.wanderDir.z);
  }

  private idle(m: Mob): void {
    m.vel.x *= 0.85;
    m.vel.z *= 0.85;
  }

  private patrolWalk(m: Mob, speed: number, dt: number): void {
    m.patrolT -= dt;
    if (m.patrolT <= 0) {
      m.patrolT = 4 + Math.random() * 4;
      m.patrolDir += Math.PI + (Math.random() - 0.5); // turn around-ish
    }
    const dx = Math.cos(m.patrolDir);
    const dz = Math.sin(m.patrolDir);
    m.vel.x += (dx * speed - m.vel.x) * Math.min(1, 5 * dt);
    m.vel.z += (dz * speed - m.vel.z) * Math.min(1, 5 * dt);
    m.group.rotation.y = Math.atan2(-dx, -dz);
  }

  private rangedBrain(m: Mob, dt: number, playerPos: THREE.Vector3, projectiles: ProjectileManager, dist: number, speed: number, stationary: boolean): void {
    const d = m.def;
    const dx = playerPos.x - m.pos.x;
    const dz = playerPos.z - m.pos.z;
    m.group.rotation.y = Math.atan2(-dx, -dz);
    if (!stationary) {
      if (!m.aggro) { this.wander(m, speed * 0.35, dt); }
      else if (dist > d.attackRange * 0.85) this.seek(m, playerPos, speed, dt);
      else if (dist < d.attackRange * 0.45) this.fleeFrom(m, playerPos, speed * 0.9, dt, dist);
      else this.idle(m);
    } else this.idle(m);
    if (m.aggro && dist < d.attackRange && m.attackCd <= 0 && d.projectileColor != null) {
      m.attackCd = d.behavior === 'turret' ? 1.2 : 1.8 + Math.random() * 0.6;
      m.lungeT = 0.25;
      m.center(_tmp);
      _shootDir.set(playerPos.x - _tmp.x, playerPos.y + 1.2 - _tmp.y, playerPos.z - _tmp.z).normalize();
      projectiles.fireHostile(_tmp, _shootDir, d.projectileSpeed ?? 20, d.damage, d.projectileColor);
      this.onHostileShot?.(_tmp.x, _tmp.y, _tmp.z, _shootDir.x, _shootDir.y, _shootDir.z, d.projectileSpeed ?? 20, d.damage, d.projectileColor);
    }
  }

  private flyBrain(m: Mob, dt: number, world: World, tgt: { name: string; pos: THREE.Vector3 }, projectiles: ProjectileManager, dist: number, speed: number): void {
    const playerPos = tgt.pos;
    const d = m.def;
    m.swoopT -= dt;
    let tx: number, ty: number, tz: number;
    if (m.swooping > 0) {
      m.swooping -= dt;
      tx = playerPos.x; ty = playerPos.y + 1; tz = playerPos.z; // dive at player
    } else {
      if (m.swoopT <= 0 && m.aggro) { m.swoopT = 5 + Math.random() * 4; m.swooping = 1.4; }
      m.circleA += dt * 0.6;
      const r = 9;
      tx = playerPos.x + Math.cos(m.circleA) * r;
      tz = playerPos.z + Math.sin(m.circleA) * r;
      const ground = world.inBounds(Math.floor(tx), 0, Math.floor(tz)) ? world.surfaceY(Math.floor(tx), Math.floor(tz)) : playerPos.y;
      ty = Math.max(ground + 6, playerPos.y + 5);
    }
    _tmp.set(tx - m.pos.x, ty - m.pos.y, tz - m.pos.z);
    const len = _tmp.length() || 1;
    _tmp.divideScalar(len);
    const sp = m.swooping > 0 ? speed * 1.8 : speed;
    m.vel.x += (_tmp.x * sp - m.vel.x) * Math.min(1, 5 * dt);
    m.vel.y += (_tmp.y * sp - m.vel.y) * Math.min(1, 5 * dt);
    m.vel.z += (_tmp.z * sp - m.vel.z) * Math.min(1, 5 * dt);
    m.group.rotation.y = Math.atan2(-m.vel.x, -m.vel.z);
    // ranged flyers strafe-shoot instead of swooping every time
    if (d.projectileColor != null && m.aggro && dist < d.attackRange && m.attackCd <= 0) {
      m.attackCd = 2.0;
      m.center(_tmp);
      _shootDir.set(playerPos.x - _tmp.x, playerPos.y + 1.2 - _tmp.y, playerPos.z - _tmp.z).normalize();
      projectiles.fireHostile(_tmp, _shootDir, d.projectileSpeed ?? 20, d.damage, d.projectileColor);
      this.onHostileShot?.(_tmp.x, _tmp.y, _tmp.z, _shootDir.x, _shootDir.y, _shootDir.z, d.projectileSpeed ?? 20, d.damage, d.projectileColor);
    }
    // swoop touch damage
    if (m.swooping > 0 && dist < 1.6 && m.attackCd <= 0) {
      m.attackCd = 1.2;
      this.hitTarget(tgt.name, d.damage);
      m.swooping = 0;
    }
  }

  // ---------- spawning ----------
  private trySpawn(dt: number, world: World, playerPos: THREE.Vector3, isNight: boolean): void {
    if (this.remote) return; // followers never spawn — the leader does
    this.spawnCd -= dt;
    const maxMobs = isNight ? this.world_.nightMax : this.world_.dayMax;
    if (this.mobs.length >= maxMobs || this.spawnCd > 0) return;
    this.spawnCd = this.world_.spawnEvery;

    const def = this.pickDef(isNight);
    if (!def) return;
    const count = def.packSize ?? 1;
    // retry a few angles — island worlds have lots of void columns
    let bx = 0, bz = 0, found = false;
    for (let tries = 0; tries < 6 && !found; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 16 + Math.random() * 14;
      bx = playerPos.x + Math.cos(a) * r;
      bz = playerPos.z + Math.sin(a) * r;
      const tx = Math.floor(bx), tz = Math.floor(bz);
      if (world.inBounds(tx, 0, tz)) {
        const ty = world.surfaceY(tx, tz);
        found = ty > world.waterLevel + 1 && ty < 92;
      }
    }
    if (!found) return;
    for (let i = 0; i < count && this.mobs.length < maxMobs + 2; i++) {
      const x = Math.floor(bx + (Math.random() - 0.5) * 4);
      const z = Math.floor(bz + (Math.random() - 0.5) * 4);
      if (!world.inBounds(x, 0, z)) continue;
      const y = world.surfaceY(x, z);
      if (y <= world.waterLevel + 1 || y >= 92) continue;
      const m = new Mob(x + 0.5, y, z + 0.5, def);
      m.id = this.nextId++;
      m.defIndex = this.world_.defs.indexOf(def);
      if (m.airborne) m.pos.y += def.model.kind === 'ghost' ? 1.5 : 6;
      this.group.add(m.group);
      this.mobs.push(m);
    }
  }

  private pickDef(isNight: boolean): EnemyDef | null {
    const pool = this.world_.defs.filter((e) =>
      e.spawnTime === 'both' || (isNight ? e.spawnTime === 'night' : e.spawnTime === 'day')
    );
    // herbivores graze by day; predators rule the night — also bias weights
    let total = 0;
    const weights = pool.map((e) => {
      let w = e.weight;
      if (isNight && (e.behavior === 'chase' || e.behavior === 'pack' || e.behavior === 'swarm' || e.behavior === 'ambush')) w *= 1.5;
      if (!isNight && e.behavior === 'roam') w *= 1.5;
      total += w;
      return w;
    });
    if (total <= 0) return null;
    let roll = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  /** Admin/cheat spawn: drop hostiles near a position. Returns count spawned. */
  spawnNear(world: World, pos: THREE.Vector3, count: number, bossOnly = false): number {
    const pool = this.world_.defs.filter((e) =>
      bossOnly ? e.behavior === 'boss' : (e.behavior !== 'roam' && e.behavior !== 'flee')
    );
    if (pool.length === 0) return 0;
    let spawned = 0;
    for (let i = 0; i < count * 3 && spawned < count; i++) {
      const def = pool[Math.floor(Math.random() * pool.length)];
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 8;
      const x = Math.floor(pos.x + Math.cos(a) * r);
      const z = Math.floor(pos.z + Math.sin(a) * r);
      if (!world.inBounds(x, 0, z)) continue;
      const y = world.surfaceY(x, z);
      if (y <= world.waterLevel + 1 || y >= 92) continue;
      const m = new Mob(x + 0.5, y, z + 0.5, def);
      m.id = this.nextId++;
      m.defIndex = this.world_.defs.indexOf(def);
      if (m.airborne) m.pos.y += 5;
      m.aggro = true;
      this.group.add(m.group);
      this.mobs.push(m);
      spawned++;
    }
    return spawned;
  }

  /** Spawn this world's boss near a position; returns its name. */
  spawnBossNear(world: World, pos: THREE.Vector3): string | null {
    if (this.spawnNear(world, pos, 1, true) === 0) return null;
    return this.mobs[this.mobs.length - 1].def.name;
  }

  // ---------- physics ----------
  private collides(world: World, m: Mob, x: number, y: number, z: number): boolean {
    const hw = m.hitW / 2;
    for (const ox of [-hw, hw]) for (const oz of [-hw, hw]) for (const oy of [0.05, m.hitH - 0.05]) {
      if (world.isSolidAt(x + ox, y + oy, z + oz)) return true;
    }
    return false;
  }

  private moveMob(m: Mob, dt: number, world: World): void {
    if (m.def.model.kind === 'ghost') {
      // ghosts phase through blocks
      m.pos.addScaledVector(m.vel, dt);
      return;
    }
    const nx = m.pos.x + m.vel.x * dt;
    if (this.collides(world, m, nx, m.pos.y, m.pos.z)) {
      if (m.onGround) m.vel.y = 7.5; // hop over obstacles
      else if (m.airborne) m.vel.y = Math.max(m.vel.y, 3);
      m.vel.x = 0;
    } else m.pos.x = nx;

    const nz = m.pos.z + m.vel.z * dt;
    if (this.collides(world, m, m.pos.x, m.pos.y, nz)) {
      if (m.onGround) m.vel.y = 7.5;
      else if (m.airborne) m.vel.y = Math.max(m.vel.y, 3);
      m.vel.z = 0;
    } else m.pos.z = nz;

    const ny = m.pos.y + m.vel.y * dt;
    m.onGround = false;
    if (this.collides(world, m, m.pos.x, ny, m.pos.z)) {
      if (m.vel.y < 0) m.onGround = true;
      m.vel.y = 0;
    } else m.pos.y = ny;
  }

  private remove(i: number): void {
    const m = this.mobs[i];
    this.group.remove(m.group);
    m.dispose();
    this.mobs.splice(i, 1);
  }

  // ---------- combat API (used by player attacks, skills, projectiles) ----------
  damage(mob: Mob, dmg: number, knockFrom?: THREE.Vector3): void {
    if (this.remote) {
      // follower: show feedback locally, let the leader apply the real damage
      mob.hurtT = 0.18;
      this.onForwardHit?.(mob.id, dmg, knockFrom?.x ?? 0, knockFrom?.z ?? 0);
      return;
    }
    mob.health -= dmg;
    mob.hurtT = 0.18;
    mob.provoked = true;
    if (knockFrom) {
      const mass = Math.max(1, mob.def.scale);
      const k = knockFrom.clone().setY(0).normalize();
      mob.vel.x += k.x * 6 / mass;
      mob.vel.z += k.z * 6 / mass;
      if (!mob.airborne) mob.vel.y = 4 / mass;
    }
    if (mob.health <= 0) {
      const i = this.mobs.indexOf(mob);
      if (i >= 0) {
        if (mob.def.explodes) {
          // bursts on death; punishes point-blank kills
          const playerHit = this.lastPlayerPos && mob.pos.distanceTo(this.lastPlayerPos) < 3.2;
          if (playerHit) this.onPlayerHit?.(0.15);
        }
        const loot = mob.def.loot[Math.floor(Math.random() * mob.def.loot.length)] ?? Item.VoidShard;
        this.onDeath?.(mob.pos.clone(), loot);
        this.remove(i);
      }
    }
  }

  /** Tracked so death-explosions can check player proximity. */
  lastPlayerPos: THREE.Vector3 | null = null;

  /** Slow all mobs within radius (Frost Ring). Returns count affected. */
  slowAround(pos: THREE.Vector3, radius: number, seconds: number): number {
    let n = 0;
    for (const mob of this.mobs) {
      if (mob.pos.distanceTo(pos) < radius) {
        mob.slowT = Math.max(mob.slowT, seconds);
        mob.hurtT = 0.1;
        n++;
      }
    }
    return n;
  }

  /** All mobs within `radius` of a 120° arc in front of origin. */
  inArc(origin: THREE.Vector3, dir: THREE.Vector3, radius: number): Mob[] {
    const out: Mob[] = [];
    for (const mob of this.mobs) {
      const to = mob.center(new THREE.Vector3()).sub(origin);
      const dd = to.length();
      if (dd > radius) continue;
      to.normalize();
      if (to.dot(dir) > 0.5) out.push(mob);
    }
    return out;
  }

  /** Mobs within `dist` of the segment from origin along dir (dash strike). */
  alongLine(origin: THREE.Vector3, dir: THREE.Vector3, length: number, dist: number): Mob[] {
    const out: Mob[] = [];
    for (const mob of this.mobs) {
      const to = mob.center(new THREE.Vector3()).sub(origin);
      const along = to.dot(dir);
      if (along < 0 || along > length) continue;
      const perp = Math.sqrt(Math.max(0, to.lengthSq() - along * along));
      if (perp < dist + mob.hitW / 2) out.push(mob);
    }
    return out;
  }

  /** Closest mob the view ray passes near, within reach. */
  rayPick(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): Mob | null {
    let best: Mob | null = null;
    let bestD = maxDist;
    for (const mob of this.mobs) {
      const to = mob.center(new THREE.Vector3()).sub(origin);
      const along = to.dot(dir);
      if (along < 0 || along > maxDist) continue;
      const perp = Math.sqrt(Math.max(0, to.lengthSq() - along * along));
      if (perp < Math.max(0.75, mob.hitW * 0.7) && along < bestD) {
        best = mob;
        bestD = along;
      }
    }
    return best;
  }

  nearestWithin(pos: THREE.Vector3, radius: number): Mob | null {
    let best: Mob | null = null;
    let bestD = radius;
    for (const mob of this.mobs) {
      const d = pos.distanceTo(mob.center(_tmp));
      if (d < bestD) { best = mob; bestD = d; }
    }
    return best;
  }

  clear(): void {
    while (this.mobs.length) this.remove(this.mobs.length - 1);
  }
}
