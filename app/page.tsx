"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Game } from "./game";
import { Lobby } from "./lobby";
import { getSessionSnapshot, subscribe } from "./lib/identity";
import { SERVER_EVENTS } from "@/shared/events";
import { PublicGameState, PublicRoom } from "@/shared/types";
import { useSocket } from "./socket-provider";

export default function Home() {
  const storedSession = useSyncExternalStore(
    subscribe,
    getSessionSnapshot,
    () => null,
  );

  const socket = useSocket();

  const [gameState, setGameState] = useState<PublicGameState | null>(null);

  useEffect(() => {
    const handleStateUpdated = (state: PublicGameState) => setGameState(state);
    socket.on(SERVER_EVENTS.STATE_UPDATED, handleStateUpdated);
    return () => {
      socket.off(SERVER_EVENTS.STATE_UPDATED, handleStateUpdated);
    };
  }, [socket]);

  console.log(storedSession);
  console.log(storedSession?.phase);

  if (gameState == null || gameState.phase == "LOBBY") {
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
        <Lobby />
      </div>
    );
  } else {
    return <Game />
  }
}
