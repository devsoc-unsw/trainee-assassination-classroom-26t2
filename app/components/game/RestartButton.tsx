"use client";

import { AppSocket } from "@/app/socket-provider";
import { CLIENT_EVENTS, Result } from "@/shared/events";

interface ReplayButtonProps {
  socket: AppSocket;
}

function replay(socket: AppSocket): Promise<Result<void>> {
  return new Promise((resolve) => {
    socket.emit(CLIENT_EVENTS.REPLAY, resolve);
  });
}

export function ReplayButton({ socket }: ReplayButtonProps) {
  return (
      <button
        type="button"
        onClick={() => replay(socket)}
      >
        REPLAY
      </button>
  );
}
