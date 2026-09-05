const PLAYER_ID_KEY = "ac:playerId";
const SESSION_KEY = "ac:session";

const listeners = new Set<() => void>();

export interface StoredSession {
  nickname: string;
  roomCode: string;
}

export function getPlayerId(): string {
  const existing = sessionStorage.getItem(PLAYER_ID_KEY);
  if (existing) {
    return existing;
  }
  const id = crypto.randomUUID();
  sessionStorage.setItem(PLAYER_ID_KEY, id);
  return id;
}

function parseSession(raw: string | null): StoredSession | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.nickname === "string" &&
      typeof parsed?.roomCode === "string"
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

let cachedRaw: string | null = null;
let cachedSession: StoredSession | null = null;

export function getSessionSnapshot(): StoredSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSession = parseSession(raw);
  }
  return cachedSession;
}

export function setStoredSession(session: StoredSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  emitChange();
}

export function clearStoredSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  emitChange();
}

export function clearPlayerId(): void {
  sessionStorage.removeItem(PLAYER_ID_KEY);
  emitChange();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}
