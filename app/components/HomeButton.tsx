"use client";

import { AppSocket } from "@/app/socket-provider";
import { CLIENT_EVENTS, Result } from "@/shared/events";
import { clearPlayerId, clearStoredSession, subscribe } from "../lib/identity";

interface HomeButtonProps {
  socket: AppSocket;
}

function goHome(socket: AppSocket): Promise<Result<void>> {
  return new Promise((resolve) => {
    clearStoredSession();
    clearPlayerId();
    socket.emit(CLIENT_EVENTS.LEAVE_ROOM, resolve);
  });
}

export function HomeButton({ socket }: HomeButtonProps) {
  return (
      <button
        type="button"
        onClick={() => goHome(socket)}
      >
        HOME
      </button>
  );
}
