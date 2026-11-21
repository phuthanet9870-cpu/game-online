/** HTTPS API client. The session lives in an HttpOnly cookie; nothing secret is kept in JS storage. */

export interface CharacterSummary {
  id: number;
  name: string;
  weapon: string;
  level: number;
  xp: number;
  gold: number;
  mapId: string;
}

export interface MeResponse {
  account: { username: string; role: string };
  characters: CharacterSummary[];
  maxCharacters: number;
  weapons: Array<{ id: string; name: string; role: string; available: boolean }>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const ERROR_TH: Record<string, string> = {
  'invalid username or password': 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
  'username already taken': 'ชื่อผู้ใช้นี้ถูกใช้แล้ว',
  'name taken': 'ชื่อตัวละครนี้ถูกใช้แล้ว',
  'not logged in': 'ยังไม่ได้เข้าสู่ระบบ',
  'too many requests, try again later': 'ส่งคำขอถี่เกินไป กรุณารอสักครู่',
};

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    const msg = data.error ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, ERROR_TH[msg] ?? msg);
  }
  return data as T;
}

export const api = {
  health: () => call<{ ok: boolean; version: string; online: number; phase: number }>('GET', '/api/health'),
  register: (username: string, password: string) =>
    call('POST', '/api/auth/register', { username, password }),
  login: (username: string, password: string) => call('POST', '/api/auth/login', { username, password }),
  logout: () => call('POST', '/api/auth/logout', {}),
  session: () => call<{ authenticated: boolean }>('GET', '/api/session'),
  me: () => call<MeResponse>('GET', '/api/me'),
  createCharacter: (name: string, weapon: string) =>
    call<CharacterSummary>('POST', '/api/characters', { name, weapon }),
  deleteCharacter: (id: number, confirmName: string) =>
    call('POST', `/api/characters/${id}/delete`, { confirmName }),
};

/** Resolves true when an authoritative server answers /api/health within the timeout. */
export async function serverAvailable(timeoutMs = 2500): Promise<boolean> {
  if (__OFFLINE_ONLY__) return false;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch('/api/health', { signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return false;
    const j = (await res.json()) as { ok?: boolean };
    return j.ok === true;
  } catch {
    return false;
  }
}
