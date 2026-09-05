"use client";

import { AppSocket } from "@/app/socket-provider";
import { CLIENT_EVENTS, Result } from "@/shared/events";
import { clearPlayerId, clearStoredSession, subscribe } from "../lib/identity";
import { PublicGameState, PublicRoom } from "@/shared/types";

interface HomeButtonProps {
  socket: AppSocket;
  setRoomState: (room: PublicRoom | null) => void;
  setGameState: (room: PublicGameState | null) => void;
}

function goHome(
  socket: AppSocket,
  setRoomState: (room: PublicRoom | null) => void,
  setGameState: (room: PublicGameState | null) => void,
): Promise<Result<void>> {
  return new Promise((resolve) => {
    clearStoredSession();
    clearPlayerId();
    setRoomState(null);
    setGameState(null);
    socket.emit(CLIENT_EVENTS.LEAVE_ROOM, resolve);
  });
}

export function HomeButton({
  socket,
  setRoomState,
  setGameState,
}: HomeButtonProps) {
  return (
    <button
      type="button"
      onClick={() => goHome(socket, setRoomState, setGameState)}
    >
      HOME
    </button>
  );
}
