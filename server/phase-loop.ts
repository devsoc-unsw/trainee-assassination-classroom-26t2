// T09: the phase loop. When a phase runs its full duration the timer fires and
// this drives the state machine forward along that phase's natural "time's up"
// edge.

import type { Result } from "@/shared/events";
import type { GameState, Room, RoomCode } from "@/shared/types";
import {
  endDrawing,
  endRoundReveal,
  toRoundRevealFromFinalGuess,
  toRoundRevealFromVoting,
} from "./state";
import { armPhaseTimer } from "./timers";

export interface PhaseLoopDeps {
  getRoom: (code: RoomCode) => Room | null;
  broadcast: (room: Room) => void;
}

export interface PhaseLoop {
  enterPhase: (room: Room, next: GameState) => void;
  onPhaseExpired: (roomCode: RoomCode) => void;
}

// The transition to run when a phase has used up its whole timer. Returns null
// for phases that never arm one (LOBBY, ROUND_STARTING, SCORING, GAME_OVER).
function timeoutTransition(state: GameState): Result<GameState> | null {
  switch (state.phase) {
    case "DRAWING":
      return endDrawing(state);
    case "VOTING":
      return toRoundRevealFromVoting(state, null);
    case "FINAL_GUESS":
      return toRoundRevealFromFinalGuess(state);
    case "ROUND_REVEAL":
      return endRoundReveal(state);
    default:
      return null;
  }
}

export function createPhaseLoop({
  getRoom,
  broadcast,
}: PhaseLoopDeps): PhaseLoop {
  function enterPhase(room: Room, next: GameState): void {
    const endsAt = armPhaseTimer(room.code, next.phase, () =>
      onPhaseExpired(room.code),
    );
    room.state = { ...next, phaseEndsAt: endsAt };
    broadcast(room);
  }

  function onPhaseExpired(roomCode: RoomCode): void {
    const room = getRoom(roomCode);
    if (!room) {
      return;
    }

    const next = timeoutTransition(room.state);
    if (next === null) {
      return;
    }
    if (!next.ok) {
      console.warn(
        `[room ${roomCode}] phase timeout from ${room.state.phase} rejected: ${next.message}`,
      );
      return;
    }
    enterPhase(room, next.data);
  }

  return { enterPhase, onPhaseExpired };
}
