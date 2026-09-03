"use client";

import { useSyncExternalStore } from "react";
import { Game } from "./game";
import { Lobby } from "./lobby";
import { getSessionSnapshot, subscribe } from "./lib/identity";

export default function Home() {
  const storedSession = useSyncExternalStore(
    subscribe,
    getSessionSnapshot,
    () => null,
  );

  console.log(storedSession);
  console.log(storedSession?.phase);

  if (storedSession == null || storedSession.phase == "LOBBY") {
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
