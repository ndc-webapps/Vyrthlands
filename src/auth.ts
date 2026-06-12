/**
 * Account client: real backend auth (server/index.js). The session token
 * persists in localStorage so refresh keeps you logged in; passwords are
 * never stored client-side. Guest mode keeps the old local-only flow.
 */

export interface User {
  id: string;
  username: string;
  email: string | null;
  avatar: string;
  createdAt: number;
}

const TOKEN_KEY = 'vyrthlands_session';

/** Backend origin. Empty = same origin (vite proxy in dev, or server serving dist).
 *  Set VITE_API_URL when the frontend is hosted separately (e.g. Vercel). */
export const API_BASE: string = (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function call<T>(method: string, url: string, body?: unknown, token?: string | null): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach server. Is the backend running? (npm run server)');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as any).error ?? `Request failed (${res.status})`);
  return data as T;
}

export class AuthStore {
  user: User | null = null;
  guest = false;
  /** Backend storage engine ('postgres' | 'sqlite') — used to warn about temp storage. */
  storage: string | null = null;

  get token(): string | null { return localStorage.getItem(TOKEN_KEY); }
  get loggedIn(): boolean { return this.user !== null; }

  /** Restore session after refresh. Resolves to the user or null. */
  async restore(): Promise<User | null> {
    if (!this.token) return null;
    try {
      const { user, storage } = await call<{ user: User; storage?: string }>('GET', '/api/me', undefined, this.token);
      this.user = user;
      this.storage = storage ?? null;
      return user;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) localStorage.removeItem(TOKEN_KEY);
      return null;
    }
  }

  async register(username: string, password: string, email?: string): Promise<User> {
    const r = await call<{ token: string; user: User; storage?: string }>('POST', '/api/register', { username, password, email: email || undefined });
    localStorage.setItem(TOKEN_KEY, r.token);
    this.user = r.user;
    this.storage = r.storage ?? null;
    this.guest = false;
    return r.user;
  }

  async login(username: string, password: string): Promise<User> {
    const r = await call<{ token: string; user: User; storage?: string }>('POST', '/api/login', { username, password });
    localStorage.setItem(TOKEN_KEY, r.token);
    this.user = r.user;
    this.storage = r.storage ?? null;
    this.guest = false;
    return r.user;
  }

  async logout(): Promise<void> {
    try { await call('POST', '/api/logout', {}, this.token); } catch { /* token may be stale */ }
    localStorage.removeItem(TOKEN_KEY);
    this.user = null;
  }

  continueAsGuest(): void {
    this.guest = true;
    this.user = null;
  }

  api<T>(method: string, url: string, body?: unknown): Promise<T> {
    return call<T>(method, url, body, this.token);
  }
}
