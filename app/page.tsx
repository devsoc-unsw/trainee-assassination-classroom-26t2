"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Game } from "./game";
import { Lobby } from "./lobby";
import { getPlayerId, subscribe } from "./lib/identity";
import { SERVER_EVENTS } from "@/shared/events";
import { PublicGameState, PublicRoom } from "@/shared/types";
import { useSocket } from "./socket-provider";

export default function Home() {
  const playerId = useSyncExternalStore(subscribe, getPlayerId, () => "");

  const socket = useSocket();

  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [room, setRoom] = useState<PublicRoom | null>(null);

  useEffect(() => {
    const handleRoomUpdated = (publicRoom: PublicRoom|null) => setRoom(publicRoom);
    socket.on(SERVER_EVENTS.ROOM_UPDATED, handleRoomUpdated);
    return () => {
      socket.off(SERVER_EVENTS.ROOM_UPDATED, handleRoomUpdated);
    };
  }, [socket]);

  useEffect(() => {
    const handleStateUpdated = (state: PublicGameState|null) => setGameState(state);
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

  const inLobby =
    room === null || gameState === null || gameState.phase === "LOBBY";

  if (inLobby) {
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
        <Lobby
          room={room}
          socket={socket}
          setGameState={setGameState}
          setRoomState={setRoom}
        />
      </div>
    );
  }

  return (
    <>
      <Game
        room={room}
        socket={socket}
        gameState={gameState}
        setGameState={setGameState}
        setRoomState={setRoom}
      />
      ;
    </>
  );
}
