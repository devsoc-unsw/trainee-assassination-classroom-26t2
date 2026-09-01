// T09: server-owned phase timers.

import type { Phase, RoomCode } from "@/shared/types";

export const PHASE_DURATIONS_MS = {
  DRAWING: 20_000,
  VOTING: 45_000,
  FINAL_GUESS: 20_000,
  ROUND_REVEAL: 15_000,
} as const satisfies Partial<Record<Phase, number>>;

export type TimedPhase = keyof typeof PHASE_DURATIONS_MS;

export function isTimedPhase(phase: Phase): phase is TimedPhase {
  return phase in PHASE_DURATIONS_MS;
}

interface RoomTimer {
  phase: TimedPhase;
  endsAt: number;
  handle: ReturnType<typeof setTimeout>;
}

const timers = new Map<RoomCode, RoomTimer>();

// Cancel and forget a room's timer
export function clearRoomTimer(code: RoomCode): void {
  const timer = timers.get(code);
  if (timer) {
    clearTimeout(timer.handle);
    timers.delete(code);
  }
}

/**
 * Arm the room's timer for `phase`, clearing any existing timer for the room
 * first. Returns the absolute epoch ms at which the phase ends: store it in
 * `state.phaseEndsAt` or null if the phase has no timer.
 *
 * `onExpire` runs exactly once when the duration elapses, unless timer is
 * cleared or replaced before.
 */
export function armPhaseTimer(
  code: RoomCode,
  phase: Phase,
  onExpire: () => void,
): number | null {
  clearRoomTimer(code);

  if (!isTimedPhase(phase)) {
    return null;
  }

  const duration = PHASE_DURATIONS_MS[phase];
  const endsAt = Date.now() + duration;
  const handle = setTimeout(() => {
    timers.delete(code);
    onExpire();
  }, duration);
  handle.unref?.();

  timers.set(code, { phase, endsAt, handle });
  return endsAt;
}

export function getRoomTimer(
  code: RoomCode,
): { phase: TimedPhase; endsAt: number } | null {
  const timer = timers.get(code);
  return timer ? { phase: timer.phase, endsAt: timer.endsAt } : null;
}
