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
    <div className="home-button-wrap flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => replay(socket)}
        disabled={false}
        className="w-55 py-3 px-4 text-lg rounded-xl frame-restart-button disabled:cursor-not-allowed disabled:opacity-40"
      ></button>
    </div>
  );
}
