import { AuthStore } from './auth';
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

  create(opts: { name: string; worldType: string; mode: string; worldSize: string; seed: number; maxPlayers?: number }): Promise<ServerInfo> {
    return this.auth.api<{ server: ServerInfo }>('POST', '/api/servers', opts).then((r) => r.server);
  }

  join(code: string): Promise<ServerInfo> {
    return this.auth.api<{ server: ServerInfo }>('POST', '/api/servers/join', { code }).then((r) => r.server);
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
      `/api/progress/${serverId}?token=${encodeURIComponent(token)}`,
      new Blob([JSON.stringify({ progress, world })], { type: 'application/json' })
    );
  }
}

/** WebSocket presence: who is online in the server, join/leave events. */
export class Presence {
  private ws: WebSocket | null = null;
  players: string[] = [];
  onEvent: ((msg: string) => void) | null = null;
  onPlayers: ((players: string[]) => void) | null = null;

  connect(token: string, serverId: string): void {
    this.disconnect();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}&server=${encodeURIComponent(serverId)}`);
    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'join' || msg.type === 'leave') {
          this.players = msg.players ?? [];
          this.onPlayers?.(this.players);
          this.onEvent?.(msg.type === 'join' ? `${msg.username} joined` : `${msg.username} left`);
        }
        // msg.type === 'pos': remote player positions (rendering = next phase)
      } catch { /* ignore */ }
    };
  }

  sendPos(x: number, y: number, z: number): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'pos', x, y, z }));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.players = [];
  }
}
