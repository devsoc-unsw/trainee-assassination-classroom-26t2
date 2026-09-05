"use client";

import { useEffect, useState } from "react";
import { SERVER_EVENTS } from "@/shared/events";
import type { PublicGameState } from "@/shared/types";
import type { AppSocket } from "@/app/socket-provider";

// The client's view of the round. The server is authoritative: this only ever
// stores what `state_updated` delivers, and nothing here derives a phase, a
// turn, or a winner of its own.
//
// Null until the first broadcast arrives, which is also the honest answer
// before a game has started — the server only emits this once the room leaves
// LOBBY.
export function useGameState(socket: AppSocket): PublicGameState | null {
  const [state, setState] = useState<PublicGameState | null>(null);

  useEffect(() => {
    const handleStateUpdated = (next: PublicGameState) => setState(next);
    socket.on(SERVER_EVENTS.STATE_UPDATED, handleStateUpdated);
    return () => {
      socket.off(SERVER_EVENTS.STATE_UPDATED, handleStateUpdated);
    };
  }, [socket]);

  return state;
}
