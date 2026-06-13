import { AuthStore, API_BASE } from './auth';
import { SaveData } from './save';

/** Server (shared world/lobby) records + per-player cloud progress + presence. */

export interface ServerInfo {
  id: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
  worldType: string;
  mode: string;
  worldSize: string;
  seed: number;
  maxPlayers: number;
  visibility: 'open' | 'private';
  inviteCode?: string; // owners only
  createdAt: number;
  lastPlayed: number;
  members: { id: string; username: string }[];
  online: number;
}

export interface CloudLoad {
  progress: SaveData | null;
  world: { edits: Record<string, number> } | null;
}

export class ServerApi {
  constructor(private auth: AuthStore) {}

  list(): Promise<ServerInfo[]> {
    return this.auth.api<{ servers: ServerInfo[] }>('GET', '/api/servers').then((r) => r.servers);
  }

  create(opts: { name: string; worldType: string; mode: string; worldSize: string; seed: number; visibility?: 'open' | 'private' }): Promise<ServerInfo> {
    return this.auth.api<{ server: ServerInfo }>('POST', '/api/servers', opts).then((r) => r.server);
  }

  join(code: string): Promise<ServerInfo> {
    return this.auth.api<{ server: ServerInfo }>('POST', '/api/servers/join', { code }).then((r) => r.server);
  }

  /** Browse open worlds anyone can join (the public lobby is first). */
  listPublic(): Promise<ServerInfo[]> {
    return this.auth.api<{ servers: ServerInfo[] }>('GET', '/api/servers/public').then((r) => r.servers);
  }

  /** Hop into an open world by id (no invite code). */
  joinOpen(id: string): Promise<ServerInfo> {
    return this.auth.api<{ server: ServerInfo }>('POST', '/api/servers/join-open', { id }).then((r) => r.server);
  }

  load(serverId: string): Promise<CloudLoad> {
    return this.auth.api<CloudLoad>('GET', `/api/progress/${serverId}`);
  }

  save(serverId: string, progress: SaveData, world: { edits: Record<string, number> }): Promise<void> {
    return this.auth.api('POST', `/api/progress/${serverId}`, { progress, world });
  }

  /** Fire-and-forget save for page close (sendBeacon can't set headers). */
  saveBeacon(serverId: string, progress: SaveData, world: { edits: Record<string, number> }): void {
    const token = this.auth.token;
    if (!token) return;
    navigator.sendBeacon(
      `${API_BASE}/api/progress/${serverId}?token=${encodeURIComponent(token)}`,
      new Blob([JSON.stringify({ progress, world })], { type: 'application/json' })
    );
  }
}

/** Wire format for one synced mob (leader -> followers). */
export interface MobSnap {
  i: number;  // id
  d: number;  // def index within this world's enemy pool
  x: number; y: number; z: number;
  ry: number; // facing
  h: number;  // health
  a: number;  // aggro flag
}

/** WebSocket presence: who is online in the server, join/leave events,
 *  plus shared simulation traffic (mobs, clock, shots, sleep). */
export class Presence {
  private ws: WebSocket | null = null;
  players: string[] = [];
  /** Username of the simulation leader (runs mobs + day/night clock). */
  leader: string | null = null;
  onEvent: ((msg: string) => void) | null = null;
  onPlayers: ((players: string[]) => void) | null = null;
  onLeader: ((leader: string | null) => void) | null = null;
  onPos: ((username: string, role: string, x: number, y: number, z: number, yaw: number) => void) | null = null;
  onChat: ((username: string, text: string) => void) | null = null;
  onBlock: ((username: string, x: number, y: number, z: number, id: number) => void) | null = null;
  onMobs: ((mobs: MobSnap[], time: number) => void) | null = null;
  onMobHit: ((username: string, id: number, dmg: number, kx: number, kz: number) => void) | null = null;
  onMobAtk: ((target: string, dmg: number) => void) | null = null;
  onShot: ((username: string, x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, dmg: number, color: number, hostile: boolean) => void) | null = null;
  onSleep: ((username: string) => void) | null = null;
  onTame: ((username: string, id: number, mobName: string) => void) | null = null;

  connect(token: string, serverId: string): void {
    this.disconnect();
    const base = API_BASE
      ? API_BASE.replace(/^http/, 'ws')
      : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
    this.ws = new WebSocket(`${base}/ws?token=${encodeURIComponent(token)}&server=${encodeURIComponent(serverId)}`);
    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'join' || msg.type === 'leave') {
          this.players = msg.players ?? [];
          this.onPlayers?.(this.players);
          this.onEvent?.(msg.type === 'join' ? `${msg.username} joined` : `${msg.username} left`);
          if (msg.leader !== this.leader) {
            this.leader = msg.leader ?? null;
            this.onLeader?.(this.leader);
          }
        }
        if (msg.type === 'pos') {
          this.onPos?.(msg.username, msg.role ?? 'swordsman', msg.x, msg.y, msg.z, msg.yaw ?? 0);
        }
        if (msg.type === 'chat') this.onChat?.(msg.username, msg.text);
        if (msg.type === 'block') this.onBlock?.(msg.username, msg.x, msg.y, msg.z, msg.id);
        if (msg.type === 'mobs') this.onMobs?.(msg.mobs ?? [], msg.t ?? -1);
        if (msg.type === 'mobhit') this.onMobHit?.(msg.username, msg.id, msg.dmg, msg.kx ?? 0, msg.kz ?? 0);
        if (msg.type === 'mobatk') this.onMobAtk?.(msg.target, msg.dmg);
        if (msg.type === 'shot') this.onShot?.(msg.username, msg.x, msg.y, msg.z, msg.dx, msg.dy, msg.dz, msg.speed, msg.dmg, msg.color, !!msg.hostile);
        if (msg.type === 'sleep') this.onSleep?.(msg.username);
        if (msg.type === 'tame') this.onTame?.(msg.username, msg.id, msg.mob ?? '');
      } catch { /* ignore */ }
    };
  }

  sendPos(x: number, y: number, z: number, yaw: number, role: string): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'pos', x, y, z, yaw, role }));
  }

  sendChat(text: string): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'chat', text }));
  }

  /** Live block edit so friends see you build/mine instantly. */
  sendBlock(x: number, y: number, z: number, id: number): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'block', x, y, z, id }));
  }

  /** Leader only: broadcast the mob snapshot + world clock. */
  sendMobs(mobs: MobSnap[], time: number): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'mobs', mobs, t: time }));
  }

  /** Follower hit a mob: ask the leader to apply the damage. */
  sendMobHit(id: number, dmg: number, kx: number, kz: number): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'mobhit', id, dmg, kx, kz }));
  }

  /** Leader only: one of my mobs hit another player. */
  sendMobAtk(target: string, dmg: number): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'mobatk', target, dmg }));
  }

  sendShot(x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, dmg: number, color: number, hostile: boolean): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'shot', x, y, z, dx, dy, dz, speed, dmg, color, hostile }));
  }

  sendSleep(): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'sleep' }));
  }

  /** I tamed mob `id` — everyone removes it from the wild. */
  sendTame(id: number, mobName: string): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'tame', id, mob: mobName }));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.players = [];
    this.leader = null;
  }
}
