// Whether the player has muted game sound (round music, timer SFX). Kept
// outside React and outside DrawingRoundScreen's own state, since that
// component unmounts every round when voting starts and remounts fresh for
// the next one — a plain useState there would forget the player's choice
// after a single round. localStorage rather than sessionStorage, since a
// mute preference is the kind of thing a player would expect to survive a
// reload too, not just the current tab. Same subscribe/getSnapshot shape as
// app/lib/identity.ts, for the same reason: useSyncExternalStore, not
// Context, for one small piece of state read from a couple of places.

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
