"use client";

import { AppSocket } from "@/app/socket-provider";
import { CLIENT_EVENTS, Result } from "@/shared/events";

interface HomeButtonProps {
  socket: AppSocket;
}

function goHome(socket: AppSocket): Promise<Result<void>> {
  return new Promise((resolve) => {
    socket.emit(CLIENT_EVENTS.START_GAME, resolve);
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
