// Whether the player has muted game sound (round music, timer SFX).

const MUTED_KEY = "ac:soundMuted";

const listeners = new Set<() => void>();

export function isSoundMuted(): boolean {
  return localStorage.getItem(MUTED_KEY) === "1";
}

export function setSoundMuted(muted: boolean): void {
  localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
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
