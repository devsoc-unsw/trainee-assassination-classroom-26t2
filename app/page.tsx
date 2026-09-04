"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Game } from "./game";
import { Lobby } from "./lobby";
import { getPlayerId, getSessionSnapshot, subscribe } from "./lib/identity";
import { SERVER_EVENTS } from "@/shared/events";
import { PublicGameState, PublicRoom } from "@/shared/types";
import { useSocket } from "./socket-provider";

export default function Home() {
  const storedSession = useSyncExternalStore(
    subscribe,
    getSessionSnapshot,
    () => null,
  );

  const playerId = useSyncExternalStore(subscribe, getPlayerId, () => "");

  const socket = useSocket();

  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [room, setRoom] = useState<PublicRoom | null>(null);

  useEffect(() => {
    const handleRoomUpdated = (publicRoom: PublicRoom) => setRoom(publicRoom);
    socket.on(SERVER_EVENTS.ROOM_UPDATED, handleRoomUpdated);
    return () => {
      socket.off(SERVER_EVENTS.ROOM_UPDATED, handleRoomUpdated);
    };
  }, [socket]);

  useEffect(() => {
    const handleStateUpdated = (state: PublicGameState) => setGameState(state);
    socket.on(SERVER_EVENTS.STATE_UPDATED, handleStateUpdated);
    return () => {
      socket.off(SERVER_EVENTS.STATE_UPDATED, handleStateUpdated);
    };
  }, [socket]);

  if (playerId === "") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p>Loading…</p>
      </main>
    );
  }

  //TODO: Work out what to do about this
  const attemptingRejoin =
    storedSession !== null && room === null //&& error === null;
  if (attemptingRejoin) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p>Rejoining room {storedSession.roomCode}…</p>
      </main>
    );
  }


  if (room==null || gameState == null || gameState.phase == "LOBBY") {
    return (
      <div className="relative flex flex-1 flex-col items-center overflow-hidden font-sans">
        <div
          className="absolute inset-0 -z-10 bg-repeat animate-diagonal-scroll"
          style={{
            backgroundImage: "url('/images/landing-page/landing-page-bg.jpg')",
            backgroundSize: "720px 512px",
            transform: "scale(1.75)",
          }}
        />
        <Lobby room={room} />
      </div>
    );
  } else {
    return <Game room={room} gameState={gameState} />
  }
}
